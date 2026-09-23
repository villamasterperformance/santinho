const crypto = require('crypto');
const webpush = require('web-push');
const { getPool } = require('./_db');
const { readJson } = require('./_util');
const { hash } = require('./senha');

function randomToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function adminLogin(pool, body, res) {
  const telefone = String(body.telefone || '').replace(/\D/g, '');
  const senha = String(body.senha || '');

  if (!telefone || !senha) {
    res.status(200).json({ status: 'erro' });
    return;
  }

  const found = await pool.query('select * from admins where telefone = $1', [telefone]);
  if (found.rowCount === 0) {
    res.status(200).json({ status: 'erro' });
    return;
  }

  const admin = found.rows[0];

  if (admin.bloqueado_ate && new Date(admin.bloqueado_ate) > new Date()) {
    const segundos = Math.max(1, Math.ceil((new Date(admin.bloqueado_ate) - new Date()) / 1000));
    res.status(200).json({ status: 'bloqueado', segundos });
    return;
  }

  if (hash(senha) !== admin.senha_hash) {
    const tentativas = admin.tentativas_erradas + 1;
    if (tentativas >= 5) {
      await pool.query(
        'update admins set tentativas_erradas = 0, bloqueado_ate = now() + interval \'15 minutes\' where id = $1',
        [admin.id]
      );
      res.status(200).json({ status: 'bloqueado', segundos: 900 });
      return;
    }
    await pool.query('update admins set tentativas_erradas = $1 where id = $2', [tentativas, admin.id]);
    res.status(200).json({ status: 'erro' });
    return;
  }

  const token = randomToken();
  await pool.query(
    'update admins set token = $1, tentativas_erradas = 0, bloqueado_ate = null where id = $2',
    [token, admin.id]
  );

  res.status(200).json({ status: 'ok', id: admin.id, token, nome: admin.nome });
}

async function adminAcesso(pool, body, res) {
  const id = String(body.id || '');
  const token = String(body.token || '');

  if (!id || !token) {
    res.status(200).json({ admin: false });
    return;
  }

  const found = await pool.query('select id from admins where id = $1 and token = $2', [id, token]);
  if (found.rowCount === 0) {
    res.status(200).json({ admin: false });
    return;
  }

  res.status(200).json({
    admin: true,
    master: true,
    perfil: 'geral',
    gerencia_acessos: false,
    transfere_candidatos: false,
    candidatos: [
      {
        id: 'val',
        nome: 'Oscar Silva',
        slug: 'val',
        subdominio: null,
        titulo: 'Candidato a Deputado Federal',
        hostname: null,
        admin_proprio: true,
      },
    ],
  });
}

async function pushInscrever(pool, body, res) {
  const { id, token, endpoint, p256dh, auth } = body;

  if (!id || !token || !endpoint || !p256dh || !auth) {
    res.status(200).json({ error: 'dados_invalidos' });
    return;
  }

  const membro = await pool.query('select id from membros where id = $1 and token = $2', [id, token]);
  if (membro.rowCount === 0) {
    res.status(200).json({ error: 'sessao_invalida' });
    return;
  }

  await pool.query(
    `insert into push_subscriptions (membro_id, endpoint, p256dh, auth)
     values ($1, $2, $3, $4)
     on conflict (endpoint) do update set membro_id = excluded.membro_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    [id, endpoint, p256dh, auth]
  );

  res.status(200).json({ ok: true });
}

async function pushRemover(pool, body, res) {
  const endpoint = String(body.endpoint || '');
  if (!endpoint) {
    res.status(200).json({ ok: true });
    return;
  }
  await pool.query('delete from push_subscriptions where endpoint = $1', [endpoint]);
  res.status(200).json({ ok: true });
}

async function pushEnviar(pool, body, res) {
  const id = String(body.id || '');
  const token = String(body.token || '');
  const alvo = String(body.alvo || 'todos');
  const titulo = String(body.titulo || '').slice(0, 60);
  const corpo = String(body.corpo || '').slice(0, 160);

  if (!id || !token || !titulo || !corpo) {
    res.status(200).json({ error: 'dados_invalidos' });
    return;
  }

  const admin = await pool.query('select id from admins where id = $1 and token = $2', [id, token]);
  if (admin.rowCount === 0) {
    res.status(200).json({ error: 'sessao_invalida' });
    return;
  }

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    res.status(200).json({ error: 'push_nao_configurado' });
    return;
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:contato@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  let where = '';
  if (alvo === 'lideres') where = "and m.papel = 'lider'";
  else if (alvo === 'convidados') where = "and m.papel = 'convidado'";
  else if (alvo === 'nao_confirmados') where = 'and false';

  const subs = await pool.query(
    `select s.id, s.endpoint, s.p256dh, s.auth
     from push_subscriptions s
     join membros m on m.id = s.membro_id
     where true ${where}`
  );

  const payload = JSON.stringify({ title: titulo, body: corpo });

  let qtdSucesso = 0;
  let qtdFalha = 0;
  const expiradas = [];

  for (const row of subs.rows) {
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        payload
      );
      qtdSucesso++;
    } catch (err) {
      qtdFalha++;
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        expiradas.push(row.id);
      }
    }
  }

  if (expiradas.length > 0) {
    await pool.query('delete from push_subscriptions where id = any($1::uuid[])', [expiradas]);
  }

  res.status(200).json({
    qtd_alvo: subs.rowCount,
    qtd_sucesso: qtdSucesso,
    qtd_falha: qtdFalha,
  });
}

module.exports = async function handler(req, res) {
  if (req.method === 'POST') {
    let body;
    try {
      body = await readJson(req);
    } catch {
      res.status(400).json({ error: 'invalid_body' });
      return;
    }

    const pool = getPool();

    try {
      if (body.acao === 'admin_login') return await adminLogin(pool, body, res);
      if (body.acao === 'admin_acesso') return await adminAcesso(pool, body, res);
      if (body.acao === 'push_inscrever') return await pushInscrever(pool, body, res);
      if (body.acao === 'push_remover') return await pushRemover(pool, body, res);
      if (body.acao === 'push_enviar') return await pushEnviar(pool, body, res);
      res.status(200).json({ error: 'acao_invalida' });
      return;
    } catch (err) {
      console.error('sessao post error', err);
      res.status(200).json({ error: 'erro_interno' });
      return;
    }
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const id = String(req.query.id || '');
  const token = String(req.query.token || '');

  if (!id || !token) {
    res.status(200).json(null);
    return;
  }

  const pool = getPool();

  try {
    const found = await pool.query(
      'select id, nome, slug, cidade, token from membros where id = $1 and token = $2',
      [id, token]
    );

    if (found.rowCount === 0) {
      res.status(200).json(null);
      return;
    }

    const m = found.rows[0];
    res.status(200).json({
      id: m.id,
      nome: m.nome,
      slug: m.slug,
      email: null,
      instagram: null,
      cidade: m.cidade,
      foto_url: null,
      presenca_confirmada: false,
      suspeito: false,
      evento_confirmado: false,
      token: m.token,
    });
  } catch (err) {
    console.error('sessao error', err);
    res.status(200).json(null);
  }
};
