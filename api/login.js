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

  const telefone = String(body.telefone || '').replace(/\D/g, '');
  const pool = getPool();

  try {
    const found = await pool.query(
      'select id, slug, nome, cidade, papel, token from membros where telefone = $1',
      [telefone]
    );

    if (found.rowCount === 0) {
      res.status(200).json({ status: 'sem_cadastro' });
      return;
    }

    const m = found.rows[0];

    // No SMS provider configured yet: skip OTP verification and log in directly.
    // Revisit once a real SMS gateway (Twilio, Zenvia, etc.) is wired up.
    if (body.acao === 'iniciar' || body.acao === 'verificar' || body.acao === 'senha') {
      res.status(200).json({
        status: 'ok',
        papel: m.papel,
        sessao: {
          id: m.id,
          slug: m.slug,
          nome: m.nome,
          cidade: m.cidade,
          token: m.token,
        },
      });
      return;
    }

    res.status(200).json({ status: 'erro' });
  } catch (err) {
    console.error('login error', err);
    res.status(200).json({ status: 'erro' });
  }
};
