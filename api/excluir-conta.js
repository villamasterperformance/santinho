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

  const { id, token } = body;

  if (!id || !token) {
    res.status(200).json({ error: 'dados_invalidos' });
    return;
  }

  const pool = getPool();

  try {
    const deleted = await pool.query(
      'delete from membros where id = $1 and token = $2 returning id',
      [id, token]
    );

    if (deleted.rowCount === 0) {
      res.status(200).json({ error: 'sessao_invalida' });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('excluir-conta error', err);
    res.status(200).json({ error: 'erro_interno' });
  }
};
