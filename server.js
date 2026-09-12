'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

let Pool = null;
try {
  ({ Pool } = require('pg'));
} catch (e) {
  // pg é opcional em desenvolvimento local
}

const PORT = Number(process.env.PORT) || 3005;
const ROOT = __dirname;
const MAX_BODY = 4096;

const FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/game.js', ['game.js', 'text/javascript; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
  ['/manifest.webmanifest', ['manifest.webmanifest', 'application/manifest+json; charset=utf-8']],
  ['/service-worker.js', ['service-worker.js', 'text/javascript; charset=utf-8']],
  ['/icons/icon-192.png', ['icons/icon-192.png', 'image/png']],
  ['/icons/icon-512.png', ['icons/icon-512.png', 'image/png']],
  ['/icons/apple-touch-icon.png', ['icons/apple-touch-icon.png', 'image/png']]
]);

const RANKING_PERIODS = {
  daily: 'daily',
  weekly: 'weekly',
  all: 'all'
};

const RATE = new Map();
const SESSIONS = new Map();
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const SESSION_SECRET = process.env.PEGA_LADRAO_SESSION_SECRET || crypto.randomBytes(32);

// Armazenamento em memória / JSON local como fallback caso Postgres não esteja configurado
const LOCAL_SCORES_FILE = path.join(ROOT, 'data', 'ranking.json');
let localScores = [];
function loadLocalScores() {
  try {
    if (fs.existsSync(LOCAL_SCORES_FILE)) {
      localScores = JSON.parse(fs.readFileSync(LOCAL_SCORES_FILE, 'utf8'));
    }
  } catch (e) {
    localScores = [];
  }
}
function saveLocalScores() {
  try {
    const dir = path.dirname(LOCAL_SCORES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LOCAL_SCORES_FILE, JSON.stringify(localScores.slice(0, 100), null, 2));
  } catch (e) {}
}
loadLocalScores();

function hasPostgres() {
  return Pool && (process.env.DATABASE_URL || (process.env.PGHOST && process.env.PGDATABASE));
}

let pool = null;
if (hasPostgres()) {
  try {
    pool = new Pool(
      process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
        : {
            host: process.env.PGHOST,
            port: Number(process.env.PGPORT) || 5432,
            database: process.env.PGDATABASE,
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD
          }
    );
  } catch (e) {
    pool = null;
  }
}

function normalizeRankingPeriod(period) {
  return RANKING_PERIODS[period] || 'all';
}

function publicScore(row) {
  return {
    id: Number(row.id),
    name: row.player_name,
    score: Number(row.score || 0),
    time: Number(row.time_seconds || 0),
    round: Number(row.round || 1),
    lives: Number(row.lives || 0),
    complete: !!row.completed
  };
}

function validateScore(value) {
  if (!value || typeof value !== 'object') return null;
  const name = typeof value.name === 'string' ? value.name.trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR') : '';
  const score = Number(value.score);
  const time = Number(value.time);
  const round = Number(value.round);
  const lives = Number(value.lives);
  const complete = value.complete === true;

  if (!name || name.length > 14 || !/^[0-9A-ZÀ-Ÿ ._-]+$/u.test(name)) return null;
  if (!Number.isFinite(score) || score < 0 || score > 999999) return null;
  if (!Number.isFinite(time) || time < 0 || time > 86400) return null;
  if (!Number.isInteger(round) || round < 1 || round > 99) return null;
  if (!Number.isInteger(lives) || lives < 0 || lives > 5) return null;

  return {
    name,
    score: Math.floor(score),
    time: Math.floor(time * 10) / 10,
    round,
    lives,
    complete
  };
}

function signSession(id) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(id).digest('hex');
}

function createSession() {
  const id = crypto.randomBytes(16).toString('hex');
  const sig = signSession(id);
  const token = `${id}.${sig}`;
  SESSIONS.set(id, { createdAt: Date.now() });
  return token;
}

function verifySession(token) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [id, sig] = parts;
  if (signSession(id) !== sig) return false;
  const sess = SESSIONS.get(id);
  if (!sess) return false;
  if (Date.now() - sess.createdAt > SESSION_TTL_MS) {
    SESSIONS.delete(id);
    return false;
  }
  SESSIONS.delete(id); // Uso único
  return true;
}

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Strict-Transport-Security': 'max-age=31536000'
  });
  res.end(data);
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.host.toLowerCase() === String(req.headers.host || '').toLowerCase();
  } catch (e) {
    return false;
  }
}

function allowRate(ip) {
  const now = Date.now();
  const list = (RATE.get(ip) || []).filter(t => now - t < 60000);
  if (list.length >= 15) return false;
  list.push(now);
  RATE.set(ip, list);
  return true;
}

async function getRanking(period) {
  if (pool) {
    try {
      let filter = 'TRUE';
      if (period === 'daily') filter = 'created_at >= CURRENT_DATE';
      else if (period === 'weekly') filter = "created_at >= date_trunc('week', CURRENT_TIMESTAMP)";
      const query = `
        SELECT id, player_name, score, time_seconds, round, lives, completed
        FROM ranking
        WHERE ${filter}
        ORDER BY score DESC, round DESC, time_seconds ASC, created_at ASC
        LIMIT 10;
      `;
      const result = await pool.query(query);
      return result.rows.map(publicScore);
    } catch (e) {
      // Fallback para memória se o banco falhar
    }
  }

  const now = Date.now();
  let list = localScores;
  if (period === 'daily') {
    const oneDay = 24 * 60 * 60 * 1000;
    list = list.filter(r => now - (r.created_at || 0) < oneDay);
  } else if (period === 'weekly') {
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    list = list.filter(r => now - (r.created_at || 0) < oneWeek);
  }

  return list
    .slice()
    .sort((a, b) => b.score - a.score || b.round - a.round || a.time_seconds - b.time_seconds)
    .slice(0, 10)
    .map(publicScore);
}

async function saveRanking(validated) {
  if (pool) {
    try {
      const query = `
        INSERT INTO ranking (player_name, score, time_seconds, round, lives, completed)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, player_name, score, time_seconds, round, lives, completed;
      `;
      const res = await pool.query(query, [
        validated.name,
        validated.score,
        validated.time,
        validated.round,
        validated.lives,
        validated.complete
      ]);
      return publicScore(res.rows[0]);
    } catch (e) {
      // Falhou banco, salva local
    }
  }

  const row = {
    id: localScores.length ? Math.max(...localScores.map(s => s.id || 0)) + 1 : 1,
    player_name: validated.name,
    score: validated.score,
    time_seconds: validated.time,
    round: validated.round,
    lives: validated.lives,
    completed: validated.complete,
    created_at: Date.now()
  };
  localScores.push(row);
  saveLocalScores();
  return publicScore(row);
}

function createServer() {
  return http.createServer(async (req, res) => {
    const clientIp = req.socket.remoteAddress || 'unknown';
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // Endpoints de API
    if (pathname === '/api/session' && req.method === 'POST') {
      if (!sameOrigin(req)) return json(res, 403, { error: 'origem não permitida' });
      if (!allowRate(clientIp)) return json(res, 429, { error: 'muitas requisições' });
      const session = createSession();
      return json(res, 201, { session });
    }

    if (pathname === '/api/ranking' && req.method === 'GET') {
      const period = normalizeRankingPeriod(parsedUrl.searchParams.get('period'));
      try {
        const ranking = await getRanking(period);
        return json(res, 200, { ranking });
      } catch (e) {
        return json(res, 500, { error: 'erro ao consultar ranking' });
      }
    }

    if (pathname === '/api/ranking' && req.method === 'POST') {
      if (!sameOrigin(req)) return json(res, 403, { error: 'origem não permitida' });
      if (req.headers['content-type'] !== 'application/json') {
        return json(res, 415, { error: 'Content-Type deve ser application/json' });
      }
      if (!allowRate(clientIp)) return json(res, 429, { error: 'muitas requisições' });

      let body = '';
      req.setEncoding('utf8');
      req.on('data', chunk => {
        body += chunk;
        if (body.length > MAX_BODY) {
          res.writeHead(413, { 'Connection': 'close' });
          res.end();
          req.destroy();
        }
      });

      req.on('end', async () => {
        try {
          const payload = JSON.parse(body);
          if (!payload.session || !verifySession(payload.session)) {
            return json(res, 401, { error: 'sessão inválida ou expirada' });
          }

          const validated = validateScore(payload);
          if (!validated) {
            return json(res, 400, { error: 'dados de pontuação inválidos' });
          }

          const saved = await saveRanking(validated);
          return json(res, 201, { score: saved });
        } catch (e) {
          return json(res, 400, { error: 'JSON malformado' });
        }
      });
      return;
    }

    // Servir arquivos estáticos
    const fileConfig = FILES.get(pathname);
    if (!fileConfig || req.method !== 'GET') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Não encontrado');
      return;
    }

    const [relativePath, contentType] = fileConfig;
    const fullPath = path.join(ROOT, relativePath);

    fs.readFile(fullPath, (err, content) => {
      if (err) {
        res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' });
        res.end(err.code === 'ENOENT' ? 'Não encontrado' : 'Erro interno');
        return;
      }

      const headers = {
        'Content-Type': contentType,
        'Content-Length': content.length,
        'X-Content-Type-Options': 'nosniff'
      };

      if (pathname === '/game.js' || pathname === '/service-worker.js' || pathname === '/' || pathname === '/index.html') {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      } else {
        headers['Cache-Control'] = 'public, max-age=3600';
      }

      res.writeHead(200, headers);
      res.end(content);
    });
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`[Pega Ladrão 2.5D] Servidor rodando em http://localhost:${PORT}`);
  });
}

module.exports = {
  createServer,
  normalizeRankingPeriod,
  publicScore,
  validateScore,
  createSession,
  verifySession
};
