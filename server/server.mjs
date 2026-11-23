// Slotwise self-hosted server: serves the web app and a tiny sync API.
// No dependencies. Data is one JSON file in DATA_DIR (mount it as a volume).
//
//   SLOTWISE_PASSWORD  required, shared by the phone and the browser
//   PORT               default 8080
//   DATA_DIR           default /data
//   WEB_DIR            default ./dist next to this file

import { createHash, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || '/data';
const WEB_DIR = resolve(process.env.WEB_DIR || join(here, '..', 'dist'));
const PASSWORD = process.env.SLOTWISE_PASSWORD || '';
const MAX_BODY = 25 * 1024 * 1024;

if (!PASSWORD) {
  console.error('Set SLOTWISE_PASSWORD to the password the app should use.');
  process.exit(1);
}

// ---------- storage ----------

mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = join(DATA_DIR, 'slotwise.json');
/** @type {Record<string, {kind: string, id: string, data: unknown, deleted: boolean, updated_at: string}>} */
let items = {};
if (existsSync(DB_FILE)) items = JSON.parse(readFileSync(DB_FILE, 'utf8')).items ?? {};

let lastStamp = 0;
/** Strictly increasing server timestamps, so "changed since" never misses a row. */
function stamp() {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return new Date(lastStamp).toISOString();
}
for (const r of Object.values(items)) lastStamp = Math.max(lastStamp, Date.parse(r.updated_at) || 0);

function save() {
  const tmp = `${DB_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify({ version: 1, items }));
  renameSync(tmp, DB_FILE);
}

// ---------- auth ----------

const digest = (s) => createHash('sha256').update(s).digest();
const PASS_DIGEST = digest(PASSWORD);

function authorized(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  return timingSafeEqual(digest(token), PASS_DIGEST);
}

// ---------- http ----------

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((ok, fail) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        fail(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', fail);
  });
}

async function api(req, res, url) {
  if (!authorized(req)) {
    await new Promise((r) => setTimeout(r, 400)); // slow down guessing
    return json(res, 401, { error: 'Wrong password' });
  }
  if (url.pathname === '/api/ping') return json(res, 200, { ok: true });

  if (url.pathname === '/api/items' && req.method === 'GET') {
    const since = url.searchParams.get('since');
    const rows = Object.values(items)
      .filter((r) => !since || r.updated_at > since)
      .sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1));
    return json(res, 200, { rows });
  }

  if (url.pathname === '/api/items' && req.method === 'POST') {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return json(res, 400, { error: 'Bad request' });
    }
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    for (const r of rows) {
      if (typeof r?.kind !== 'string' || typeof r?.id !== 'string') continue;
      const deleted = !!r.deleted;
      items[`${r.kind}\u0000${r.id}`] = {
        kind: r.kind,
        id: r.id,
        data: deleted ? null : r.data,
        deleted,
        updated_at: stamp(),
      };
    }
    if (rows.length) save();
    return json(res, 200, { ok: true, count: rows.length });
  }

  return json(res, 404, { error: 'Not found' });
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function serveFile(res, file, cache) {
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
    'Cache-Control': cache ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}

function staticFile(req, res, url) {
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  const file = resolve(WEB_DIR, rel);
  if (file.startsWith(WEB_DIR) && existsSync(file) && statSync(file).isFile()) {
    return serveFile(res, file, rel.startsWith('_expo/'));
  }
  const index = join(WEB_DIR, 'index.html');
  if (existsSync(index)) return serveFile(res, index, false);
  res.writeHead(404);
  res.end('Web app not built');
}

createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://local');
  if (url.pathname.startsWith('/api/')) {
    api(req, res, url).catch((e) => {
      console.error(e);
      if (!res.headersSent) json(res, 500, { error: 'Server error' });
    });
  } else {
    staticFile(req, res, url);
  }
}).listen(PORT, () => console.log(`Slotwise listening on :${PORT}, data in ${DB_FILE}`));
