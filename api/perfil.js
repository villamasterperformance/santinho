const { getPool } = require('./_db');
const { readJson } = require('./_util');

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
