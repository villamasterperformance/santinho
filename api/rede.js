const { getPool } = require('./_db');

async function geocodarCidade(pool, chave, cidadeExibicao) {
  const cached = await pool.query('select lat, lng from cidade_coords where cidade = $1', [chave]);
  if (cached.rowCount > 0) {
    return { lat: cached.rows[0].lat, lng: cached.rows[0].lng };
  }

  try {
    const url =
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=' +
      encodeURIComponent(cidadeExibicao + ', Brasil');
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'santinho-app/1.0 (santinho-mu.vercel.app)' },
    });
    const found = await resp.json();
    const lat = found[0] ? Number(found[0].lat) : null;
    const lng = found[0] ? Number(found[0].lon) : null;
    await pool.query(
      'insert into cidade_coords (cidade, lat, lng) values ($1, $2, $3) on conflict (cidade) do update set lat = excluded.lat, lng = excluded.lng',
      [chave, lat, lng]
    );
    return { lat, lng };
  } catch {
    return { lat: null, lng: null };
  }
}

async function equipeCidades(pool, id, token, res) {
  const root = await pool.query('select id, slug from membros where id = $1 and token = $2', [id, token]);
  if (root.rowCount === 0) {
    res.status(200).json([]);
    return;
  }
  const rootSlug = root.rows[0].slug;

  const grupos = await pool.query(
    `with recursive arvore as (
       select slug from membros where indicador_slug = $1
       union all
       select m.slug from membros m join arvore a on m.indicador_slug = a.slug
     )
     select lower(trim(cidade)) as chave, min(trim(cidade)) as cidade, count(*)::int as quantidade
     from membros
     where slug in (select slug from arvore) and cidade is not null and trim(cidade) <> ''
     group by lower(trim(cidade))
     order by quantidade desc
     limit 12`,
    [rootSlug]
  );

  const resultado = [];
  for (const row of grupos.rows) {
    const { lat, lng } = await geocodarCidade(pool, row.chave, row.cidade);
    resultado.push({ cidade: row.cidade, quantidade: row.quantidade, lat, lng });
  }

  res.status(200).json(resultado);
}

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

  if (req.query.cidades === '1') {
    try {
      await equipeCidades(pool, id, token, res);
    } catch (err) {
      console.error('rede cidades error', err);
      res.status(200).json([]);
    }
    return;
  }

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
