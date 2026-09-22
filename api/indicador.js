const { getPool } = require('./_db');

const MARCA = {
  marca_subdominio: null,
  marca_emoji: '💙',
  marca_slug: 'val',
  marca_logo_url: '/assets/oscar/logo.png',
  marca_hostname: null,
  marca_nome: 'Oscar Silva',
  marca_titulo: 'Candidato a Deputado Federal',
  marca_favicon_url: '/assets/oscar/logo.png',
  marca_foto_url: '/assets/oscar/foto.jpg',
  exige_sms: false,
  pede_cidade: false,
  marca_estado: 'DF',
  cadastro_pausado: false,
};

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const slug = String(req.query.slug || '').trim();
  if (!slug || slug === 'oscar-silva' || slug === 'val') {
    res.status(200).json({
      tipo: 'candidato',
      nome: 'Oscar Silva',
      foto_url: '/assets/oscar/foto.jpg',
      ...MARCA,
    });
    return;
  }

  const pool = getPool();

  try {
    const found = await pool.query(
      'select nome, papel from membros where slug = $1',
      [slug]
    );

    if (found.rowCount === 0) {
      res.status(200).json({ error: 'grupo_invalido' });
      return;
    }

    const m = found.rows[0];
    res.status(200).json({
      tipo: m.papel,
      nome: m.nome,
      foto_url: null,
      ...MARCA,
    });
  } catch (err) {
    console.error('indicador error', err);
    res.status(200).json({ error: 'grupo_invalido' });
  }
};
