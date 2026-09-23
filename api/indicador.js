const crypto = require('crypto');
const { getPool } = require('./_db');
const { readJson } = require('./_util');
const { hash } = require('./senha');

async function adminAuth(pool, adminId, adminToken) {
  if (!adminId || !adminToken) return false;
  const found = await pool.query('select id from admins where id = $1 and token = $2', [adminId, adminToken]);
  return found.rowCount > 0;
}

function randomToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function acessos(req, res, body) {
  const pool = getPool();
  const ok = await adminAuth(pool, body.admin_id, body.admin_token);
  if (!ok) {
    res.status(200).json({ error: 'sessao_invalida' });
    return;
  }

  const acao = body.acao;

  try {
    if (acao === 'listar_lideres') {
      const [totalMembros, totalConfirmados, totalContatos, primeiroMembro] = await Promise.all([
        pool.query('select count(*)::int as n from membros'),
        pool.query('select count(distinct membro_id)::int as n from evento_confirmacoes where confirmado'),
        pool.query('select count(*)::int as n from contatos_importados'),
        pool.query('select min(criado_em) as em from membros'),
      ]);

      res.status(200).json([
        {
          id: 'val',
          nome: 'Oscar Silva',
          telefone: null,
          slug: 'val',
          instagram: null,
          cidade: null,
          foto_url: '/assets/oscar/foto.jpg',
          subdominio: null,
          hostname: null,
          capa_url: '/assets/oscar/foto.jpg',
          logo_url: '/assets/oscar/logo.png',
          favicon_url: '/assets/oscar/logo.png',
          admin_proprio: true,
          campanha_pausada: false,
          cadastro_exige_sms: false,
          login_exige_sms: false,
          partido: null,
          cadastro_concluido: true,
          criado_em: primeiroMembro.rows[0].em || new Date().toISOString(),
          checkin_em: null,
          checkin_lat: null,
          checkin_lng: null,
          evento_confirmado: false,
          cadastrados: totalMembros.rows[0].n,
          confirmados: totalConfirmados.rows[0].n,
          contatos: totalContatos.rows[0].n,
          contatos_24h: 0,
          contatos_7d: 0,
          contatos_30d: 0,
        },
      ]);
      return;
    }

    if (acao === 'listar_operadores') {
      const result = await pool.query(
        'select id, nome, telefone, email, criado_em from admins order by criado_em asc'
      );
      res.status(200).json(result.rows);
      return;
    }

    if (acao === 'criar_operador') {
      const nome = String(body.nome || '').trim();
      const telefone = String(body.telefone || '').replace(/\D/g, '');
      const email = String(body.email || '').trim().toLowerCase();
      const senha = String(body.senha || '').trim();

      if (!nome || !telefone || !senha || senha.length < 6) {
        res.status(200).json({ error: 'dados_invalidos' });
        return;
      }

      const existente = await pool.query(
        'select id from admins where telefone = $1 or (email is not null and email = $2)',
        [telefone, email || null]
      );
      if (existente.rowCount > 0) {
        res.status(200).json({ error: 'ja_existe' });
        return;
      }

      await pool.query(
        'insert into admins (telefone, nome, email, senha_hash) values ($1, $2, $3, $4)',
        [telefone, nome, email || null, hash(senha)]
      );

      res.status(200).json({ ok: true, nome, email, senha, telefone });
      return;
    }

    if (acao === 'editar_operador') {
      const email = String(body.email || '').trim().toLowerCase();
      const novoEmail = String(body.novo_email || '').trim().toLowerCase();
      const novoTelefone = String(body.novo_telefone || '').replace(/\D/g, '');

      const found = await pool.query('select id from admins where email = $1', [email]);
      if (found.rowCount === 0) {
        res.status(200).json({ error: 'nao_encontrado' });
        return;
      }

      await pool.query(
        `update admins set email = coalesce(nullif($1, ''), email), telefone = coalesce(nullif($2, ''), telefone)
         where id = $3`,
        [novoEmail, novoTelefone, found.rows[0].id]
      );

      res.status(200).json({ ok: true, email: novoEmail || email, telefone: novoTelefone });
      return;
    }

    if (acao === 'senha_operador') {
      const email = String(body.email || '').trim().toLowerCase();
      const senha = String(body.senha || '').trim();
      if (!senha || senha.length < 6) {
        res.status(200).json({ error: 'dados_invalidos' });
        return;
      }

      const updated = await pool.query(
        'update admins set senha_hash = $1, token = $2 where email = $3 returning id',
        [hash(senha), randomToken(), email]
      );
      if (updated.rowCount === 0) {
        res.status(200).json({ error: 'nao_encontrado' });
        return;
      }

      res.status(200).json({ ok: true, login_criado: true });
      return;
    }

    if (acao === 'tirar_operador') {
      const email = String(body.email || '').trim().toLowerCase();
      await pool.query('delete from admins where email = $1', [email]);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(200).json({ error: 'acao_invalida' });
  } catch (err) {
    console.error('acessos error', err);
    res.status(200).json({ error: 'erro_interno' });
  }
}

const MARCA = {
  marca_subdominio: null,
  marca_emoji: '💙',
  marca_slug: 'val',
  marca_logo_url: '/assets/oscar/logo.png',
  marca_hostname: null,
  marca_nome: 'Oscar Silva',
  marca_titulo: 'Candidato a Deputado Federal',
  marca_favicon_url: '/assets/oscar/logo.png',
  marca_foto_url: '/assets/oscar/foto.jpg',
  exige_sms: false,
  pede_cidade: false,
  marca_estado: 'DF',
  cadastro_pausado: false,
};

module.exports = async function handler(req, res) {
  if (req.method === 'POST') {
    let body;
    try {
      body = await readJson(req);
    } catch {
      res.status(400).json({ error: 'invalid_body' });
      return;
    }
    await acessos(req, res, body);
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const slug = String(req.query.slug || '').trim();
  if (!slug || slug === 'oscar-silva' || slug === 'val') {
    res.status(200).json({
      tipo: 'candidato',
      nome: 'Oscar Silva',
      foto_url: '/assets/oscar/foto.jpg',
      ...MARCA,
    });
    return;
  }

  const pool = getPool();

  try {
    const found = await pool.query(
      'select nome, papel from membros where slug = $1',
      [slug]
    );

    if (found.rowCount === 0) {
      res.status(200).json({ error: 'grupo_invalido' });
      return;
    }

    const m = found.rows[0];
    res.status(200).json({
      tipo: m.papel,
      nome: m.nome,
      foto_url: null,
      ...MARCA,
    });
  } catch (err) {
    console.error('indicador error', err);
    res.status(200).json({ error: 'grupo_invalido' });
  }
};
