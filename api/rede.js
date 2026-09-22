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
    const root = await pool.query(
      'select id, slug from membros where id = $1 and token = $2',
      [id, token]
    );

    if (root.rowCount === 0) {
      res.status(200).json([]);
      return;
    }

    const rootSlug = root.rows[0].slug;

    const result = await pool.query(
      `with recursive arvore as (
         select slug from membros where indicador_slug = $1
         union all
         select m.slug from membros m join arvore a on m.indicador_slug = a.slug
       )
       select m.id, m.nome,
         coalesce(p.id, $2::uuid) as indicado_por_id
       from membros m
       left join membros p on p.slug = m.indicador_slug
       where m.slug in (select slug from arvore)`,
      [rootSlug, id]
    );

    const membros = result.rows.map((row) => ({
      id: row.id,
      nome: row.nome,
      foto_url: null,
      presenca_confirmada: false,
      contatos_importados: 0,
      indicado_por_id: row.indicado_por_id,
    }));

    res.status(200).json(membros);
  } catch (err) {
    console.error('rede error', err);
    res.status(200).json([]);
  }
};
