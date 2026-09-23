const { getPool } = require('./_db');
const { slugify, randomToken, randomSuffix, readJson, clientIp, dentroDoLimite } = require('./_util');

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

  if (body.acao !== 'convidado') {
    res.status(400).json({ error: 'acao_nao_suportada' });
    return;
  }

  const nome = String(body.nome || '').trim();
  const telefone = String(body.telefone || '').replace(/\D/g, '');
  const cidade = body.cidade ? String(body.cidade).trim() : null;
  const indicadorSlug = body.indicadorSlug ? String(body.indicadorSlug) : null;
  const grupoSlug = body.grupoSlug ? String(body.grupoSlug) : null;
  const dispositivoId = body.dispositivoId ? String(body.dispositivoId) : null;

  if (!nome || telefone.length < 10) {
    res.status(400).json({ error: 'dados_invalidos' });
    return;
  }

  const pool = getPool();

  try {
    const permitido = await dentroDoLimite(pool, `cadastro:${clientIp(req)}`, 10, 3600);
    if (!permitido) {
      res.status(200).json({ error: 'muitas_tentativas' });
      return;
    }

    const existente = await pool.query(
      'select slug, papel, token, indicador_slug from membros where telefone = $1',
      [telefone]
    );

    if (existente.rowCount > 0) {
      const m = existente.rows[0];
      if (m.papel === 'lider') {
        res.status(200).json({ error: 'telefone_e_lider' });
        return;
      }
      res.status(200).json({ error: 'ja_no_time' });
      return;
    }

    const slug = `${slugify(nome)}-${randomSuffix()}`;
    const token = randomToken();

    const inserted = await pool.query(
      `insert into membros (slug, nome, telefone, cidade, papel, indicador_slug, grupo_slug, token, dispositivo_id)
       values ($1, $2, $3, $4, 'convidado', $5, $6, $7, $8)
       returning id, slug, token`,
      [slug, nome, telefone, cidade, indicadorSlug, grupoSlug, token, dispositivoId]
    );

    const row = inserted.rows[0];
    res.status(200).json({
      id: row.id,
      slug: row.slug,
      token: row.token,
      candidatoSlug: null,
    });
  } catch (err) {
    console.error('cadastro error', err);
    res.status(200).json({ error: 'erro_interno' });
  }
};
