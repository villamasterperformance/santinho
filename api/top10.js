const { getPool } = require('./_db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const id = String(req.query.id || '');
  const token = String(req.query.token || '');

  if (!id || !token) {
    res.status(200).json([]);
    return;
  }

  const pool = getPool();

  try {
    const found = await pool.query(
      'select slug from membros where id = $1 and token = $2',
      [id, token]
    );

    if (found.rowCount === 0) {
      res.status(200).json([]);
      return;
    }

    const rootSlug = found.rows[0].slug;

    const result = await pool.query(
      `with recursive arvore as (
         select slug from membros where indicador_slug = $1
         union all
         select m.slug from membros m join arvore a on m.indicador_slug = a.slug
       )
       select m.nome, m.pontos,
         (select count(*)::int from membros d where d.indicador_slug = m.slug) as diretos
       from membros m
       where m.slug in (select slug from arvore)
       order by diretos desc, m.pontos desc nulls last
       limit 10`,
      [rootSlug]
    );

    const top10 = result.rows.map((row, i) => ({
      pos: i + 1,
      primeiro_nome: String(row.nome || '').trim().split(/\s+/)[0] || '',
      foto_url: null,
      diretos: row.diretos,
      pontos: row.pontos == null ? null : Number(row.pontos),
    }));

    res.status(200).json(top10);
  } catch (err) {
    console.error('top10 error', err);
    res.status(200).json([]);
  }
};
