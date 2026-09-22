const { getPool } = require('./_db');
const { readJson } = require('./_util');

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
