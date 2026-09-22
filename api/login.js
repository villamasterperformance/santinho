const { getPool } = require('./_db');
const { readJson } = require('./_util');
const { hash } = require('./senha');

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
      'select id, slug, nome, cidade, papel, token, senha_hash from membros where telefone = $1',
      [telefone]
    );

    if (found.rowCount === 0) {
      res.status(200).json({ status: 'sem_cadastro' });
      return;
    }

    const m = found.rows[0];
    const sessao = {
      id: m.id,
      slug: m.slug,
      nome: m.nome,
      cidade: m.cidade,
      token: m.token,
    };

    if (body.acao === 'iniciar') {
      if (m.senha_hash) {
        res.status(200).json({ status: 'precisa_senha', papel: m.papel });
        return;
      }
      // No SMS provider configured yet and no password set: log in directly.
      res.status(200).json({ status: 'ok', papel: m.papel, sessao });
      return;
    }

    if (body.acao === 'senha') {
      if (!m.senha_hash || hash(String(body.senha || '')) !== m.senha_hash) {
        res.status(200).json({ status: 'erro' });
        return;
      }
      res.status(200).json({ status: 'ok', papel: m.papel, sessao });
      return;
    }

    if (body.acao === 'verificar') {
      res.status(200).json({ status: 'ok', papel: m.papel, sessao });
      return;
    }

    res.status(200).json({ status: 'erro' });
  } catch (err) {
    console.error('login error', err);
    res.status(200).json({ status: 'erro' });
  }
};
