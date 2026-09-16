#!/usr/bin/env node
'use strict';

// Zero-dependency local server for the task board.
// Serves public/ and reads/writes JSON files in data/. Binds to localhost only.

const http = require('http');
const fsp = require('fs/promises');
const path = require('path');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
// TASK_BOARD_DATA points the board at a different data directory. Use it for
// scratch boards and for testing, so experiments never touch the real one.
const DATA_DIR = process.env.TASK_BOARD_DATA
  ? path.resolve(process.env.TASK_BOARD_DATA)
  : path.join(ROOT, 'data');
const BACKUP_DIR = path.join(DATA_DIR, '.backups');
const KEEP_BACKUPS = Number(process.env.TASK_BOARD_KEEP_BACKUPS) || 100;
const PORT = Number(process.env.PORT) || 4545;
const HOST = '127.0.0.1';

// Whitelist of stores. Anything else is a 404 — this is what keeps a crafted
// request from reaching arbitrary paths.
const DEFAULTS = {
  projects: { columns: ['Backlog', 'In Progress', 'Blocked', 'Done'], cards: [] },
  daily: { items: [] },
  todos: { items: [] },
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

async function readStore(name) {
  const file = path.join(DATA_DIR, `${name}.json`);
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      await writeStore(name, DEFAULTS[name]);
      return DEFAULTS[name];
    }
    throw err;
  }
}

// Keep a copy of the previous contents before it is replaced. Every write here
// overwrites a whole file, so this is the difference between a mistake being an
// inconvenience and being a loss.
async function backup(name, contents) {
  const dir = path.join(BACKUP_DIR, name);
  await fsp.mkdir(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let file = path.join(dir, `${stamp}.json`);
  for (let n = 1; ; n++) {
    try {
      // 'wx' fails rather than clobbering an existing backup from the same
      // millisecond.
      await fsp.writeFile(file, contents, { encoding: 'utf8', flag: 'wx' });
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      file = path.join(dir, `${stamp}-${n}.json`);
    }
  }

  const kept = (await fsp.readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  for (const stale of kept.slice(0, -KEEP_BACKUPS)) {
    await fsp.rm(path.join(dir, stale), { force: true });
  }
}

// Write to a temp file and rename, so an interrupted write can't leave a
// half-written board behind.
async function writeStore(name, value) {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, `${name}.json`);
  const next = JSON.stringify(value, null, 2) + '\n';

  let current = null;
  try {
    current = await fsp.readFile(file, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  if (current === next) return; // unchanged; don't churn the backups
  if (current !== null) await backup(name, current);

  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, next, 'utf8');
  await fsp.rename(tmp, file);
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req, limitBytes = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
  const file = path.resolve(PUBLIC_DIR, rel);
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) {
    return send(res, 403, 'Forbidden');
  }
  try {
    const body = await fsp.readFile(file);
    send(res, 200, body, MIME[path.extname(file)] || 'application/octet-stream');
  } catch {
    send(res, 404, 'Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const apiMatch = url.pathname.match(/^\/api\/([a-z]+)$/);

  try {
    if (apiMatch) {
      const name = apiMatch[1];
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, name)) {
        return send(res, 404, 'Unknown store');
      }
      if (req.method === 'GET') {
        const data = await readStore(name);
        return send(res, 200, JSON.stringify(data), MIME['.json']);
      }
      if (req.method === 'PUT') {
        const parsed = JSON.parse(await readBody(req));
        await writeStore(name, parsed);
        return send(res, 200, JSON.stringify({ ok: true }), MIME['.json']);
      }
      return send(res, 405, 'Method not allowed');
    }

    if (req.method !== 'GET') return send(res, 405, 'Method not allowed');
    await serveStatic(res, url.pathname);
  } catch (err) {
    console.error(`${req.method} ${req.url} failed:`, err.message);
    send(res, 500, `Server error: ${err.message}`);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
    console.error(`The board may already be running: http://${HOST}:${PORT}`);
    console.error(`Or start on another port:  PORT=4546 tools/task-board/run`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  console.log(`Task board running at http://${HOST}:${PORT}`);
  console.log(`Data: ${DATA_DIR}`);
  console.log(`Backups: ${BACKUP_DIR} (last ${KEEP_BACKUPS} versions per file)`);
  console.log('Ctrl-C to stop.');
});
