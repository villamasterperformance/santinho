const { getPool } = require('./_db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const pool = getPool();
  const raiz = String(req.query.raiz || '').trim();

  try {
    if (raiz) {
      let rootSlug = raiz;
      if (raiz !== 'val') {
        const found = await pool.query(
          'select slug from membros where id::text = $1 or slug = $1',
          [raiz]
        );
        if (found.rowCount === 0) {
          res.status(200).json([]);
          return;
        }
        rootSlug = found.rows[0].slug;
      }

      const result = await pool.query(
        `with recursive arvore as (
           select slug from membros where indicador_slug = $1
           union all
           select m.slug from membros m join arvore a on m.indicador_slug = a.slug
         )
         select id, nome, foto_url from membros where slug in (select slug from arvore) order by nome`,
        [rootSlug]
      );

      res.status(200).json(result.rows);
      return;
    }

    const result = await pool.query(
      `select m.id, m.nome, m.foto_url, m.pontos,
        (with recursive arvore as (
           select slug from membros where indicador_slug = m.slug
           union all
           select mm.slug from membros mm join arvore a on mm.indicador_slug = a.slug
         ) select count(*)::int from arvore) as equipe,
        (select count(*)::int from membros d where d.indicador_slug = m.slug) as diretos
       from membros m
       order by m.nome`
    );

    const ranking = result.rows.map((row) => ({
      id: row.id,
      nome: row.nome,
      foto_url: row.foto_url,
      equipe: row.equipe,
      diretos: row.diretos,
      pontos: row.pontos == null ? null : Number(row.pontos),
    }));

    res.status(200).json(ranking);
  } catch (err) {
    console.error('ranking error', err);
    res.status(200).json([]);
  }
};
