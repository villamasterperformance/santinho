const { getPool } = require('./_db');
const { readJson } = require('./_util');

async function adminAuth(pool, adminId, adminToken) {
  if (!adminId || !adminToken) return false;
  const found = await pool.query('select id from admins where id = $1 and token = $2', [adminId, adminToken]);
  return found.rowCount > 0;
}

async function adminSalvarEvento(pool, body, res) {
  const ok = await adminAuth(pool, body.admin_id, body.admin_token);
  if (!ok) {
    res.status(200).json({ error: 'sessao_invalida' });
    return;
  }
  const { id, titulo, quando, local, foto_url, tem_confirmacao, tem_checkin } = body;
  if (!titulo) {
    res.status(200).json({ error: 'dados_invalidos' });
    return;
  }
  if (id) {
    await pool.query(
      `update eventos set titulo=$1, quando=$2, local=$3, foto_url=$4, tem_confirmacao=$5, tem_checkin=$6 where id=$7`,
      [titulo, quando || null, local || null, foto_url || null, !!tem_confirmacao, !!tem_checkin, id]
    );
    res.status(200).json(id);
  } else {
    const inserted = await pool.query(
      `insert into eventos (titulo, quando, local, foto_url, tem_confirmacao, tem_checkin)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [titulo, quando || null, local || null, foto_url || null, !!tem_confirmacao, !!tem_checkin]
    );
    res.status(200).json(inserted.rows[0].id);
  }
}

async function adminApagarEvento(pool, body, res) {
  const ok = await adminAuth(pool, body.admin_id, body.admin_token);
  if (!ok) {
    res.status(200).json({ error: 'sessao_invalida' });
    return;
  }
  if (!body.id) {
    res.status(200).json({ error: 'dados_invalidos' });
    return;
  }
  await pool.query('delete from eventos where id = $1', [body.id]);
  res.status(200).json({ ok: true });
}

async function adminListarEventos(pool, body, res) {
  const ok = await adminAuth(pool, body.admin_id, body.admin_token);
  if (!ok) {
    res.status(200).json([]);
    return;
  }
  const result = await pool.query(
    `select e.id, e.titulo, e.quando, e.local, e.foto_url, e.tem_confirmacao, e.tem_checkin, e.criado_em,
       coalesce(c.total, 0)::int as quantidade_confirmados
     from eventos e
     left join (
       select evento_id, count(*) as total from evento_confirmacoes where confirmado group by evento_id
     ) c on c.evento_id = e.id
     order by e.quando desc nulls last`
  );
  res.status(200).json(
    result.rows.map((r) => ({
      id: r.id,
      titulo: r.titulo,
      quando: r.quando,
      local: r.local,
      foto_url: r.foto_url,
      tem_confirmacao: r.tem_confirmacao,
      tem_checkin: r.tem_checkin,
      criado_em: r.criado_em,
      candidatos: [],
      quantidade_confirmados: r.quantidade_confirmados,
    }))
  );
}

async function eventosListar(pool, body, res) {
  const { id, token } = body;
  const membro = await pool.query('select id from membros where id = $1 and token = $2', [id, token]);
  if (membro.rowCount === 0) {
    res.status(200).json([]);
    return;
  }
  const result = await pool.query(
    `select e.id, e.titulo, e.quando, e.local, e.foto_url, e.tem_confirmacao, e.tem_checkin,
       coalesce(c.confirmado, false) as confirmado
     from eventos e
     left join evento_confirmacoes c on c.evento_id = e.id and c.membro_id = $1
     order by e.quando desc nulls last`,
    [id]
  );
  res.status(200).json(result.rows);
}

async function eventoConfirmar(pool, body, res) {
  const { id, token, evento_id, confirmado } = body;
  const membro = await pool.query('select id from membros where id = $1 and token = $2', [id, token]);
  if (membro.rowCount === 0) {
    res.status(200).json({ error: 'sessao_invalida' });
    return;
  }
  if (!evento_id) {
    res.status(200).json({ error: 'dados_invalidos' });
    return;
  }
  await pool.query(
    `insert into evento_confirmacoes (evento_id, membro_id, confirmado)
     values ($1, $2, $3)
     on conflict (evento_id, membro_id) do update set confirmado = excluded.confirmado`,
    [evento_id, id, !!confirmado]
  );
  res.status(200).json(true);
}

module.exports = async function handler(req, res) {
  const pool = getPool();

  if (req.method === 'GET') {
    const id = String(req.query.id || '');
    const token = String(req.query.token || '');

    if (!id || !token) {
      res.status(200).json({ titulo: null, missoes: [] });
      return;
    }

    try {
      const membro = await pool.query(
        'select id from membros where id = $1 and token = $2',
        [id, token]
      );

      if (membro.rowCount === 0) {
        res.status(200).json({ titulo: null, missoes: [] });
        return;
      }

      const result = await pool.query(
        `select m.id, m.ordem, m.titulo, m.texto, m.link_url, m.link_rotulo,
                m.pede_link, m.pontos, m.criado_em as liberada_em,
                c.concluida_em, c.link
         from missoes m
         left join missoes_concluidas c on c.missao_id = m.id and c.membro_id = $1
         order by m.ordem`,
        [id]
      );

      res.status(200).json({
        titulo: null,
        missoes: result.rows.map((row) => ({
          id: row.id,
          ordem: row.ordem,
          titulo: row.titulo,
          texto: row.texto,
          link_url: row.link_url,
          link_rotulo: row.link_rotulo,
          pede_link: row.pede_link,
          pontos: row.pontos,
          liberada_em: row.liberada_em,
          concluida_em: row.concluida_em,
          link: row.link,
        })),
      });
    } catch (err) {
      console.error('missoes error', err);
      res.status(200).json({ titulo: null, missoes: [] });
    }
    return;
  }

  if (req.method === 'POST') {
    let body;
    try {
      body = await readJson(req);
    } catch {
      res.status(400).json({ error: 'invalid_body' });
      return;
    }

    if (body.acao === 'admin_salvar_evento') {
      try {
        await adminSalvarEvento(pool, body, res);
      } catch (err) {
        console.error('admin_salvar_evento error', err);
        res.status(200).json({ error: 'erro_interno' });
      }
      return;
    }
    if (body.acao === 'admin_apagar_evento') {
      try {
        await adminApagarEvento(pool, body, res);
      } catch (err) {
        console.error('admin_apagar_evento error', err);
        res.status(200).json({ error: 'erro_interno' });
      }
      return;
    }
    if (body.acao === 'admin_listar_eventos') {
      try {
        await adminListarEventos(pool, body, res);
      } catch (err) {
        console.error('admin_listar_eventos error', err);
        res.status(200).json([]);
      }
      return;
    }
    if (body.acao === 'eventos_listar') {
      try {
        await eventosListar(pool, body, res);
      } catch (err) {
        console.error('eventos_listar error', err);
        res.status(200).json([]);
      }
      return;
    }
    if (body.acao === 'evento_confirmar') {
      try {
        await eventoConfirmar(pool, body, res);
      } catch (err) {
        console.error('evento_confirmar error', err);
        res.status(200).json({ error: 'erro_interno' });
      }
      return;
    }

    const { id, token, missao, concluida, link } = body;

    try {
      const membro = await pool.query(
        'select id from membros where id = $1 and token = $2',
        [id, token]
      );

      if (membro.rowCount === 0) {
        res.status(200).json({ error: 'sessao_invalida' });
        return;
      }

      const missaoRow = await pool.query('select pontos from missoes where id = $1', [missao]);
      if (missaoRow.rowCount === 0) {
        res.status(200).json({ error: 'missao_invalida' });
        return;
      }
      const pontos = missaoRow.rows[0].pontos;

      if (concluida) {
        const inserted = await pool.query(
          `insert into missoes_concluidas (membro_id, missao_id, link)
           values ($1, $2, $3)
           on conflict (membro_id, missao_id) do nothing
           returning membro_id`,
          [id, missao, link || null]
        );
        if (inserted.rowCount > 0) {
          await pool.query('update membros set pontos = pontos + $1 where id = $2', [pontos, id]);
        }
      } else {
        const deleted = await pool.query(
          'delete from missoes_concluidas where membro_id = $1 and missao_id = $2 returning membro_id',
          [id, missao]
        );
        if (deleted.rowCount > 0) {
          await pool.query('update membros set pontos = greatest(pontos - $1, 0) where id = $2', [pontos, id]);
        }
      }

      res.status(200).json({ ok: true });
    } catch (err) {
      console.error('concluir_missao error', err);
      res.status(200).json({ error: 'erro_interno' });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};
