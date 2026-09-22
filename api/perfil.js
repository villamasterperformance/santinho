const { getPool } = require('./_db');
const { readJson } = require('./_util');
const crypto = require('crypto');

function limparTelefone(v) {
  return String(v || '').replace(/\D/g, '');
}

async function contatos(req, res, body) {
  const { acao, id, token } = body;
  if (!acao || !id || !token) {
    res.status(200).json({ error: 'dados_invalidos' });
    return;
  }

  const pool = getPool();

  try {
    const membro = await pool.query(
      'select id from membros where id = $1 and token = $2',
      [id, token]
    );
    if (membro.rowCount === 0) {
      res.status(200).json({ error: 'sessao_invalida' });
      return;
    }

    if (acao === 'listar') {
      const limit = Math.min(Number(body.limit) || 1000, 1000);
      const afterId = body.after_id || null;
      const result = await pool.query(
        `select id, nome, telefone, email from contatos_importados
         where membro_id = $1 and ($2::uuid is null or id > $2::uuid)
         order by id asc limit $3`,
        [id, afterId, limit]
      );
      res.status(200).json(result.rows);
      return;
    }

    if (acao === 'contar') {
      const result = await pool.query(
        'select count(*)::int as total from contatos_importados where membro_id = $1',
        [id]
      );
      res.status(200).json(result.rows[0].total);
      return;
    }

    if (acao === 'importar') {
      const contatosLista = Array.isArray(body.contatos) ? body.contatos : [];

      const nomes = [];
      const telefones = [];
      const emails = [];
      let invalidos = 0;

      for (const c of contatosLista) {
        const telefone = limparTelefone(c && c.telefone);
        const nome = c && c.nome ? String(c.nome).slice(0, 120) : '';

        if (!telefone || telefone.length < 8 || !nome) {
          invalidos++;
          continue;
        }

        nomes.push(nome);
        telefones.push(telefone);
        emails.push(c && c.email ? String(c.email).slice(0, 160) : null);
      }

      let inseridos = 0;
      if (telefones.length > 0) {
        const result = await pool.query(
          `insert into contatos_importados (membro_id, nome, telefone, email, origem, consent_versao)
           select $1, x.nome, x.telefone, x.email, $5, $6
           from unnest($2::text[], $3::text[], $4::text[]) as x(nome, telefone, email)
           on conflict (membro_id, telefone) do nothing
           returning id`,
          [id, nomes, telefones, emails, body.origem || null, body.consent_versao || null]
        );
        inseridos = result.rowCount;
      }

      const jaExistiam = telefones.length - inseridos;

      res.status(200).json({
        status: 'ok',
        inseridos,
        ja_existiam: jaExistiam,
        invalidos,
        segundos: null,
      });
      return;
    }

    if (acao === 'remover') {
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (ids.length === 0) {
        res.status(200).json(0);
        return;
      }
      const result = await pool.query(
        'delete from contatos_importados where membro_id = $1 and id = any($2::uuid[])',
        [id, ids]
      );
      res.status(200).json(result.rowCount);
      return;
    }

    if (acao === 'codigo') {
      const codigo = crypto.randomBytes(4).toString('hex');
      await pool.query(
        `insert into contatos_import_codigos (membro_id, codigo, consent_versao, expira_em)
         values ($1, $2, $3, now() + interval '15 minutes')`,
        [id, codigo, body.consent_versao || null]
      );
      res.status(200).json(codigo);
      return;
    }

    res.status(200).json({ error: 'acao_invalida' });
  } catch (err) {
    console.error('contatos error', err);
    res.status(200).json({ error: 'erro_interno' });
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    res.status(400).json({ error: 'invalid_body' });
    return;
  }

  if (body.acao) {
    await contatos(req, res, body);
    return;
  }

  const { id, token, nome, email, instagram, cidade, foto_url, grupo } = body;

  if (!id || !token || !nome) {
    res.status(200).json({ error: 'dados_invalidos' });
    return;
  }

  const pool = getPool();

  try {
    const updated = await pool.query(
      `update membros
       set nome = $1, email = $2, instagram = $3, cidade = $4, foto_url = $5,
           grupo_slug = coalesce($6, grupo_slug)
       where id = $7 and token = $8
       returning id, nome, slug, email, instagram, cidade, foto_url, token`,
      [
        nome,
        email || null,
        instagram || null,
        cidade || null,
        foto_url || null,
        grupo || null,
        id,
        token,
      ]
    );

    if (updated.rowCount === 0) {
      res.status(200).json({ error: 'sessao_invalida' });
      return;
    }

    const m = updated.rows[0];
    res.status(200).json({
      id: m.id,
      nome: m.nome,
      slug: m.slug,
      email: m.email,
      instagram: m.instagram,
      cidade: m.cidade,
      foto_url: m.foto_url,
      presenca_confirmada: false,
      suspeito: false,
      evento_confirmado: false,
      token: m.token,
    });
  } catch (err) {
    console.error('perfil error', err);
    res.status(200).json({ error: 'erro_interno' });
  }
};
