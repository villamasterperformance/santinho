const { getPool } = require('./_db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const id = String(req.query.id || '');
  const token = String(req.query.token || '');

  if (!id || !token) {
    res.status(200).json(null);
    return;
  }

  const pool = getPool();

  try {
    const found = await pool.query(
      'select id, slug, nome, pontos from membros where id = $1 and token = $2',
      [id, token]
    );

    if (found.rowCount === 0) {
      res.status(200).json(null);
      return;
    }

    const me = found.rows[0];

    // Per-member equipe (full descendant count) and diretos (direct children), for everyone at once.
    const stats = await pool.query(
      `select m.slug,
        (with recursive arvore as (
           select slug from membros where indicador_slug = m.slug
           union all
           select mm.slug from membros mm join arvore a on mm.indicador_slug = a.slug
         ) select count(*)::int from arvore) as equipe,
        (select count(*)::int from membros d where d.indicador_slug = m.slug) as diretos,
        m.pontos
       from membros m`
    );

    const rows = stats.rows;
    const meRow = rows.find((r) => r.slug === me.slug) || { equipe: 0, diretos: 0 };
    const rankOf = (key) => {
      const sorted = [...rows].sort((a, b) => b[key] - a[key]);
      const idx = sorted.findIndex((r) => r.slug === me.slug);
      return idx === -1 ? null : idx + 1;
    };

    res.status(200).json({
      pos_equipe: rankOf('equipe'),
      equipe: meRow.equipe,
      pos_diretos: rankOf('diretos'),
      diretos: meRow.diretos,
      pos_pontos: me.pontos != null ? rankOf('pontos') : null,
      pontos: me.pontos,
    });
  } catch (err) {
    console.error('posicoes error', err);
    res.status(200).json(null);
  }
};
