const { getPool } = require('./_db');

module.exports = async function handler(req, res) {
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
