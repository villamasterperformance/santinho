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

async function logAdmin(pool, adminEmail, acao, alvoTipo, alvoId, alvoNome, alvoTelefone, detalhes) {
  try {
    await pool.query(
      `insert into admin_log (admin_email, acao, alvo_tipo, alvo_id, alvo_nome, alvo_telefone, detalhes)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [adminEmail || null, acao, alvoTipo || null, alvoId || null, alvoNome || null, alvoTelefone || null, detalhes ? JSON.stringify(detalhes) : null]
    );
  } catch (err) {
    console.error('logAdmin error', err);
  }
}

// Actions that manage OTHER admin accounts (create, edit, delete, reset
// password, view access list, read the audit log). Only an admin flagged
// gerencia_acessos/master in the database may call these — previously ANY
// authenticated admin could reset or delete ANY other admin's account,
// including the master account, which is a privilege-escalation hole.
const ACOES_GESTAO_ACESSOS = new Set([
  'listar_operadores',
  'criar_operador',
  'criar',
  'editar_nome',
  'definir_telefone',
  'editar_operador',
  'senha_operador',
  'senha',
  'tirar_operador',
  'tirar',
  'listar_log',
]);

async function acessos(req, res, body) {
  const pool = getPool();
  const admin = await pool.query(
    'select id, email, master, gerencia_acessos from admins where id = $1 and token = $2',
    [body.admin_id, body.admin_token]
  );
  if (admin.rowCount === 0) {
    res.status(200).json({ error: 'sessao_invalida' });
    return;
  }
  const adminEmail = admin.rows[0].email;
  const podeGerenciarAcessos = admin.rows[0].master || admin.rows[0].gerencia_acessos;

  const acao = body.acao;

  if (ACOES_GESTAO_ACESSOS.has(acao) && !podeGerenciarAcessos) {
    res.status(200).json({ error: 'sem_permissao' });
    return;
  }

  try {
    if (acao === 'listar_lideres') {
      const [totalMembros, totalConfirmados, totalContatos, primeiroMembro, cfgResult] = await Promise.all([
        pool.query('select count(*)::int as n from membros'),
        pool.query('select count(distinct membro_id)::int as n from evento_confirmacoes where confirmado'),
        pool.query('select count(*)::int as n from contatos_importados'),
        pool.query('select min(criado_em) as em from membros'),
        pool.query('select nome, telefone, campanha_pausada, cadastro_exige_sms from candidato_config where id = $1', ['val']),
      ]);
      const cfg = cfgResult.rows[0] || {};

      res.status(200).json([
        {
          id: 'val',
          nome: cfg.nome || 'Oscar Silva',
          telefone: cfg.telefone || null,
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
          campanha_pausada: !!cfg.campanha_pausada,
          cadastro_exige_sms: !!cfg.cadastro_exige_sms,
          login_exige_sms: !!cfg.cadastro_exige_sms,
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
        'select id, nome, telefone, email, master, gerencia_acessos, criado_em from admins order by criado_em asc'
      );
      res.status(200).json(result.rows);
      return;
    }

    if (acao === 'criar_operador' || acao === 'criar') {
      const nome = String(body.nome || '').trim();
      const telefone = String(body.telefone || '').replace(/\D/g, '');
      let email = String(body.email || '').trim().toLowerCase();
      const senha = String(body.senha || '').trim();
      // Only a master admin can grant management privileges to a new
      // operator; a non-master with gerencia_acessos can still create
      // operators (gated above) but can't hand out its own privilege.
      const souMaster = admin.rows[0].master;
      const gerenciaAcessos = souMaster && body.gerencia_acessos === true;

      if (!telefone || !senha || senha.length < 6) {
        res.status(200).json({ error: 'dados_invalidos' });
        return;
      }
      if (!email) email = `${telefone}@celular.santinho.oscarsilva.site`;

      const existente = await pool.query(
        'select id from admins where telefone = $1 or email = $2',
        [telefone, email]
      );
      if (existente.rowCount > 0) {
        res.status(200).json({ error: 'ja_existe' });
        return;
      }

      await pool.query(
        'insert into admins (telefone, nome, email, senha_hash, gerencia_acessos) values ($1, $2, $3, $4, $5)',
        [telefone, nome || null, email, hash(senha), gerenciaAcessos]
      );

      await logAdmin(pool, adminEmail, 'criar_operador', 'admin', email, nome, telefone);
      res.status(200).json({ ok: true, nome, email, senha, telefone });
      return;
    }

    if (acao === 'editar_nome') {
      const email = String(body.email || '').trim().toLowerCase();
      const nome = String(body.nome || '').trim();

      const updated = await pool.query(
        'update admins set nome = $1 where email = $2 returning id',
        [nome || null, email]
      );
      if (updated.rowCount === 0) {
        res.status(200).json({ error: 'nao_encontrado' });
        return;
      }

      await logAdmin(pool, adminEmail, 'editar_nome', 'admin', email, nome, null);
      res.status(200).json({ ok: true });
      return;
    }

    if (acao === 'definir_telefone') {
      const email = String(body.email || '').trim().toLowerCase();
      const telefone = String(body.telefone || '').replace(/\D/g, '');

      if (!telefone) {
        res.status(200).json('telefone_invalido');
        return;
      }

      const conflito = await pool.query(
        'select id from admins where telefone = $1 and email <> $2',
        [telefone, email]
      );
      if (conflito.rowCount > 0) {
        res.status(200).json('em_uso');
        return;
      }

      const updated = await pool.query(
        'update admins set telefone = $1 where email = $2 returning id',
        [telefone, email]
      );
      if (updated.rowCount === 0) {
        res.status(200).json('sem_admin');
        return;
      }

      await logAdmin(pool, adminEmail, 'definir_telefone', 'admin', email, null, telefone);
      res.status(200).json('ok');
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

    if (acao === 'senha_operador' || acao === 'senha') {
      const email = String(body.email || '').trim().toLowerCase();
      const senha = String(body.senha || '').trim();
      if (!senha || senha.length < 6) {
        res.status(200).json({ error: 'dados_invalidos' });
        return;
      }

      // A non-master with gerencia_acessos can manage regular operators but
      // must not be able to take over the master account by resetting its
      // password.
      if (!admin.rows[0].master) {
        const alvo = await pool.query('select master from admins where email = $1', [email]);
        if (alvo.rowCount > 0 && alvo.rows[0].master) {
          res.status(200).json({ error: 'sem_permissao' });
          return;
        }
      }

      const updated = await pool.query(
        'update admins set senha_hash = $1, token = $2 where email = $3 returning id',
        [hash(senha), randomToken(), email]
      );
      if (updated.rowCount === 0) {
        res.status(200).json({ error: 'nao_encontrado' });
        return;
      }

      await logAdmin(pool, adminEmail, 'trocar_senha', 'admin', email, null, null);
      res.status(200).json({ ok: true, login_criado: true });
      return;
    }

    if (acao === 'tirar_operador' || acao === 'tirar') {
      const email = String(body.email || '').trim().toLowerCase();

      if (email === adminEmail) {
        res.status(200).json({ error: 'nao_pode_remover_a_si_mesmo' });
        return;
      }

      if (!admin.rows[0].master) {
        const alvo = await pool.query('select master from admins where email = $1', [email]);
        if (alvo.rowCount > 0 && alvo.rows[0].master) {
          res.status(200).json({ error: 'sem_permissao' });
          return;
        }
      }

      await pool.query('delete from admins where email = $1', [email]);
      await logAdmin(pool, adminEmail, 'tirar_operador', 'admin', email, null, null);
      res.status(200).json({ ok: true });
      return;
    }

    if (acao === 'listar_log') {
      const busca = String(body.busca || '').trim();
      const limite = Math.min(Number(body.limite) || 300, 500);

      let result;
      if (busca) {
        result = await pool.query(
          `select id, criado_em, admin_email, acao, alvo_tipo, alvo_id, alvo_nome, alvo_telefone, detalhes
           from admin_log
           where acao ilike $1 or alvo_nome ilike $1 or alvo_telefone ilike $1 or admin_email ilike $1
           order by criado_em desc
           limit $2`,
          [`%${busca}%`, limite]
        );
      } else {
        result = await pool.query(
          `select id, criado_em, admin_email, acao, alvo_tipo, alvo_id, alvo_nome, alvo_telefone, detalhes
           from admin_log
           order by criado_em desc
           limit $1`,
          [limite]
        );
      }
      res.status(200).json(result.rows);
      return;
    }

    if (acao === 'registrar_download_relatorio') {
      await logAdmin(pool, adminEmail, 'download_relatorio', 'relatorio', null, String(body.titulo || ''), null);
      res.status(200).json({ ok: true });
      return;
    }

    if (acao === 'admin_equipe') {
      const result = await pool.query(
        `select m.id, m.nome, m.telefone, m.cidade, m.criado_em,
                p.id as indicado_por_id,
                coalesce(ec.confirmado, false) as presenca_confirmada,
                ec.checkin_em
         from membros m
         left join membros p on p.slug = m.indicador_slug
         left join evento_confirmacoes ec on ec.membro_id = m.id
         order by m.criado_em asc`
      );
      res.status(200).json(
        result.rows.map((r) => ({
          id: r.id,
          lider_id: 'val',
          indicado_por_id: r.indicado_por_id,
          nome: r.nome,
          telefone: r.telefone,
          cidade: r.cidade,
          presenca_confirmada: r.presenca_confirmada,
          checkin_em: r.checkin_em,
          checkin_lat: null,
          checkin_lng: null,
          criado_em: r.criado_em,
        }))
      );
      return;
    }

    if (acao === 'admin_regioes') {
      const result = await pool.query(
        `select coalesce(nullif(trim(cidade), ''), 'Não informado') as cidade, count(*)::int as total
         from membros
         group by 1
         order by total desc
         limit 20`
      );
      res.status(200).json(result.rows);
      return;
    }

    if (acao === 'admin_perfil_lider') {
      const cfg = await pool.query('select nome, telefone, titulo, estado, emoji_participar from candidato_config where id = $1', ['val']);
      const c = cfg.rows[0] || {};
      res.status(200).json({
        nome: c.nome || 'Oscar Silva',
        telefone: c.telefone || null,
        subdominio: null,
        hostname: null,
        emoji_participar: c.emoji_participar || '💙',
        estado: c.estado || 'DF',
        titulo: c.titulo || null,
      });
      return;
    }

    if (acao === 'admin_editar_lider') {
      const nome = String(body.nome || '').trim();
      const telefone = body.telefone ? String(body.telefone).replace(/\D/g, '') : null;
      await pool.query(
        `update candidato_config set nome = coalesce(nullif($1, ''), nome), telefone = coalesce($2, telefone), atualizado_em = now() where id = 'val'`,
        [nome, telefone]
      );
      await logAdmin(pool, adminEmail, 'editar_lider', 'candidato', 'val', nome, telefone);
      res.status(200).json({ ok: true });
      return;
    }

    if (acao === 'admin_campo_lider') {
      const CAMPOS = {
        titulo: 'titulo',
        estado: 'estado',
        emoji_participar: 'emoji_participar',
        campanha_pausada: 'campanha_pausada',
        cadastro_exige_sms: 'cadastro_exige_sms',
      };
      const campo = CAMPOS[body.campo];
      if (!campo) {
        res.status(200).json({ error: 'campo_invalido' });
        return;
      }
      await pool.query(
        `update candidato_config set ${campo} = $1, atualizado_em = now() where id = 'val'`,
        [body.valor]
      );
      await logAdmin(pool, adminEmail, `editar_${campo}`, 'candidato', 'val', null, null, { valor: body.valor });
      res.status(200).json({ ok: true });
      return;
    }

    if (acao === 'admin_subdominio_lider' || acao === 'admin_admin_proprio') {
      // Site é single-tenant hoje (1 candidato, domínio fixo) — não há
      // subdomínio por líder pra editar. Responde ok sem persistir nada
      // pra não travar a tela; se algum dia houver multi-candidato de
      // verdade, isso precisa de uma coluna própria em candidato_config.
      res.status(200).json({ ok: true });
      return;
    }

    res.status(200).json({ error: 'acao_invalida' });
  } catch (err) {
    console.error('acessos error', err);
    res.status(200).json({ error: 'erro_interno' });
  }
}

const DIGITOS_POR_CARGO = { distrital: 5, senador: 3, presidente: 2 };

// A API pública do TSE (divulgacandcontas.tse.jus.br) bloqueia requisições
// server-to-server com 403 Access Denied (Akamai Bot Manager), mesmo a partir
// da região gru1 da Vercel — testado e confirmado em produção. Por isso essa
// checagem só consulta o cache local (tabela candidatos_eleicao), que precisa
// ser populada manualmente até existir uma forma viável de buscar ao vivo.
async function candidatoEleicao(req, res) {
  const cargo = String(req.query.cargo || '').trim();
  const numero = String(req.query.numero || '').trim();
  const digitos = DIGITOS_POR_CARGO[cargo];

  if (!digitos || !/^\d+$/.test(numero) || numero.length !== digitos) {
    res.status(400).json({ error: 'parametros_invalidos' });
    return;
  }

  // Dado só muda por atualização manual do admin, então dá pra cachear:
  // corta consulta repetida no banco por causa do debounce de 500ms no
  // frontend a cada tecla digitada.
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=3600');

  const pool = getPool();
  try {
    const found = await pool.query(
      `select existe, nome, foto_url from candidatos_eleicao
       where cargo = $1 and numero = $2 and ano = 2026 and uf = 'DF'`,
      [cargo, numero]
    );

    if (found.rowCount === 0) {
      res.status(200).json({ numero, cargo, existe: null, nome: null, foto_url: null });
      return;
    }

    const row = found.rows[0];
    res.status(200).json({
      numero,
      cargo,
      existe: row.existe,
      nome: row.existe ? row.nome : null,
      foto_url: row.existe ? row.foto_url : null,
    });
  } catch (err) {
    console.error('candidatoEleicao error', err);
    res.status(200).json({ numero, cargo, existe: null, nome: null, foto_url: null });
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

  if (req.query.acao === 'candidato_eleicao') {
    await candidatoEleicao(req, res);
    return;
  }

  const slug = String(req.query.slug || '').trim();
  const pool = getPool();

  if (!slug || slug === 'oscar-silva' || slug === 'val') {
    let cfg = null;
    try {
      const cfgResult = await pool.query(
        'select nome, titulo, estado, emoji_participar, campanha_pausada, cadastro_exige_sms from candidato_config where id = $1',
        ['val']
      );
      cfg = cfgResult.rows[0] || null;
    } catch (err) {
      console.error('indicador candidato_config error', err);
    }

    res.status(200).json({
      tipo: 'candidato',
      nome: (cfg && cfg.nome) || 'Oscar Silva',
      foto_url: '/assets/oscar/foto.jpg',
      ...MARCA,
      marca_nome: (cfg && cfg.nome) || MARCA.marca_nome,
      marca_titulo: (cfg && cfg.titulo) || MARCA.marca_titulo,
      marca_estado: (cfg && cfg.estado) || MARCA.marca_estado,
      marca_emoji: (cfg && cfg.emoji_participar) || MARCA.marca_emoji,
      cadastro_pausado: cfg ? !!cfg.campanha_pausada : MARCA.cadastro_pausado,
      exige_sms: cfg ? !!cfg.cadastro_exige_sms : MARCA.exige_sms,
    });
    return;
  }

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
