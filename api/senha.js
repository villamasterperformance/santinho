const crypto = require('crypto');
const { getPool } = require('./_db');
const { readJson } = require('./_util');

function hash(senha) {
  return crypto.createHash('sha256').update(senha).digest('hex');
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

  const { id, token, senha } = body;

  if (!id || !token || !senha || String(senha).length < 6) {
    res.status(200).json({ error: 'dados_invalidos' });
    return;
  }

  const pool = getPool();

  try {
    const updated = await pool.query(
      'update membros set senha_hash = $1 where id = $2 and token = $3 returning id',
      [hash(String(senha)), id, token]
    );

    if (updated.rowCount === 0) {
      res.status(200).json({ error: 'sessao_invalida' });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('senha error', err);
    res.status(200).json({ error: 'erro_interno' });
  }
};

module.exports.hash = hash;
