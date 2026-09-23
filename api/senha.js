const crypto = require('crypto');
const { getPool } = require('./_db');
const { readJson } = require('./_util');

// Legacy format: bare sha256 hex (unsalted). Kept only to verify old rows;
// never used to create new hashes.
function hashLegacy(senha) {
  return crypto.createHash('sha256').update(senha).digest('hex');
}

// Current format: salted scrypt, "scrypt$<saltHex>$<hashHex>". Uses only
// Node's built-in crypto (no new dependency) with a per-password random
// salt, which is what the old bare-sha256 hash was missing.
function hash(senha) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(senha), salt, 64);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Still run a comparison of equal length to avoid leaking length via timing.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// Verifies a password against either format. Returns { valido, precisaUpgrade }.
// precisaUpgrade is true for legacy hashes, so callers can transparently
// rehash-on-login without forcing every existing user to reset their password.
function verificar(senha, senhaHash) {
  const s = String(senha);
  const stored = String(senhaHash || '');

  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$');
    if (parts.length !== 3) return { valido: false, precisaUpgrade: false };
    const salt = Buffer.from(parts[1], 'hex');
    const expected = parts[2];
    const derived = crypto.scryptSync(s, salt, 64).toString('hex');
    return { valido: timingSafeStringEqual(derived, expected), precisaUpgrade: false };
  }

  // Legacy bare-sha256 hex (64 chars).
  const valido = timingSafeStringEqual(hashLegacy(s), stored);
  return { valido, precisaUpgrade: valido };
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
module.exports.verificar = verificar;
