const crypto = require('crypto');

function slugify(nome) {
  return String(nome)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'membro';
}

function randomToken() {
  return crypto.randomBytes(24).toString('hex');
}

function randomSuffix() {
  return crypto.randomBytes(3).toString('hex');
}

function clientIp(req) {
  const fwd = req.headers && req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'desconhecido';
}

// Simple DB-backed fixed-window rate limit (serverless functions have no
// shared memory between invocations, so an in-process counter wouldn't
// work). Returns true if the caller is within the limit and the attempt
// was recorded, false if the limit was already hit for this window.
async function dentroDoLimite(pool, chave, maxTentativas, janelaSegundos) {
  await pool.query(
    `create table if not exists rate_limit (
       chave text primary key,
       tentativas integer not null default 1,
       janela_inicio timestamptz not null default now()
     )`
  );

  const result = await pool.query(
    `insert into rate_limit (chave, tentativas, janela_inicio)
     values ($1, 1, now())
     on conflict (chave) do update set
       tentativas = case
         when rate_limit.janela_inicio < now() - ($2 || ' seconds')::interval then 1
         else rate_limit.tentativas + 1
       end,
       janela_inicio = case
         when rate_limit.janela_inicio < now() - ($2 || ' seconds')::interval then now()
         else rate_limit.janela_inicio
       end
     returning tentativas`,
    [chave, janelaSegundos]
  );

  return result.rows[0].tentativas <= maxTentativas;
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

module.exports = { slugify, randomToken, randomSuffix, readJson, clientIp, dentroDoLimite };
