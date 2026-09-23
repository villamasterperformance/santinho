const { getPool } = require('./_db');
const { readJson, clientIp, dentroDoLimite } = require('./_util');
const { verificar } = require('./senha');

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
    const permitido = await dentroDoLimite(pool, `login:${clientIp(req)}`, 30, 3600);
    if (!permitido) {
      res.status(200).json({ status: 'bloqueado', segundos: 3600 });
      return;
    }

    const found = await pool.query(
      `select id, slug, nome, cidade, papel, token, senha_hash, tentativas_erradas, bloqueado_ate
       from membros where telefone = $1`,
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
      if (m.bloqueado_ate && new Date(m.bloqueado_ate) > new Date()) {
        const segundos = Math.max(1, Math.ceil((new Date(m.bloqueado_ate) - new Date()) / 1000));
        res.status(200).json({ status: 'bloqueado', segundos });
        return;
      }

      const resultado = m.senha_hash ? verificar(String(body.senha || ''), m.senha_hash) : { valido: false };

      if (!resultado.valido) {
        const tentativas = m.tentativas_erradas + 1;
        if (tentativas >= 5) {
          await pool.query(
            "update membros set tentativas_erradas = 0, bloqueado_ate = now() + interval '15 minutes' where id = $1",
            [m.id]
          );
          res.status(200).json({ status: 'bloqueado', segundos: 900 });
          return;
        }
        await pool.query('update membros set tentativas_erradas = $1 where id = $2', [tentativas, m.id]);
        res.status(200).json({ status: 'erro' });
        return;
      }

      await pool.query(
        'update membros set tentativas_erradas = 0, bloqueado_ate = null where id = $1',
        [m.id]
      );

      // Legacy sha256 hash verified successfully: transparently upgrade to salted scrypt.
      if (resultado.precisaUpgrade) {
        const { hash } = require('./senha');
        await pool.query('update membros set senha_hash = $1 where id = $2', [hash(String(body.senha || '')), m.id]);
      }

      res.status(200).json({ status: 'ok', papel: m.papel, sessao });
      return;
    }

    if (body.acao === 'verificar') {
      // SMS OTP verification: previously this granted a session to anyone
      // who merely knew the phone number, never checking the code at all.
      const codigo = String(body.codigo || '').trim();
      if (!codigo) {
        res.status(200).json({ status: 'erro' });
        return;
      }

      const otp = await pool.query(
        `select id from otp_codigos
         where telefone = $1 and codigo = $2 and usado = false and expira_em > now()
         order by criado_em desc limit 1`,
        [telefone, codigo]
      );

      if (otp.rowCount === 0) {
        res.status(200).json({ status: 'erro' });
        return;
      }

      await pool.query('update otp_codigos set usado = true where id = $1', [otp.rows[0].id]);
      res.status(200).json({ status: 'ok', papel: m.papel, sessao });
      return;
    }

    res.status(200).json({ status: 'erro' });
  } catch (err) {
    console.error('login error', err);
    res.status(200).json({ status: 'erro' });
  }
};
