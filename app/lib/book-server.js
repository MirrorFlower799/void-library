'use strict';
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { repairEpub } = require('./epub-repair');
const { bookMime } = require('./book-mime');
let bookServer;

function parseRange(value, size) {
  if (!value) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!m || (!m[1] && !m[2])) return false;
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] ? (m[2] ? Math.min(size - 1, Number(m[2])) : size - 1) : size - 1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end && start < size ? { start, end } : false;
}
function ensureBookServer() {
  if (bookServer) return bookServer;
  const assets = path.join(__dirname, '..', 'book');
  const state = { book: '' }, sessions = new Map();
  const server = http.createServer(async (req, res) => {
    try {
      const route = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      const isBook = route === '/book' || route.startsWith('/book/');
      let file;
      if (isBook) file = route === '/book' ? state.book : sessions.get(route.slice(6));
      else if (route === '/' || route === '/viewer.html') file = path.join(assets, 'viewer.html');
      else if (route === '/remote-file.mjs') file = path.join(assets, 'remote-file.mjs');
      else if (route.startsWith('/vendor/')) {
        const candidate = path.resolve(assets, '.' + route);
        if (candidate.startsWith(path.join(assets, 'vendor') + path.sep)) file = candidate;
      }
      if (!file) { res.writeHead(404); res.end(); return; }
      const stat = await fs.promises.stat(file).catch(() => null);
      if (!stat || !stat.isFile()) { res.writeHead(404); res.end(); return; }
      let buffer, servedFile = file, servedSize = stat.size;
      if (isBook && /\.epub$/i.test(file)) {
        try {
          const repaired = await repairEpub(file, stat.mtimeMs);
          if (Buffer.isBuffer(repaired)) buffer = repaired;
          else if (repaired?.path) { servedFile = repaired.path; servedSize = repaired.size; }
        } catch { /* Fall back to the original book. */ }
      }
      if (res.destroyed) return;
      const size = buffer ? buffer.length : servedSize;
      const range = isBook ? parseRange(req.headers.range, size) : null;
      if (range === false) { res.writeHead(416, { 'Content-Range': 'bytes */' + size }); res.end(); return; }
      const headers = {
        'Content-Type': bookMime(file), 'Content-Length': range ? range.end - range.start + 1 : size,
        'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store'
      };
      if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;
      res.writeHead(range ? 206 : 200, headers);
      if (req.method === 'HEAD') { res.end(); return; }
      if (buffer) { res.end(range ? buffer.subarray(range.start, range.end + 1) : buffer); return; }
      const stream = fs.createReadStream(servedFile, range || undefined);
      res.on('close', () => stream.destroy());
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  const ready = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  bookServer = { server, state, port: 0, ready,
    open(file) {
      const token = randomUUID();
      sessions.set(token, file);
      while (sessions.size > 16) sessions.delete(sessions.keys().next().value);
      state.book = file;
      return '/book/' + token;
    }
  };
  return bookServer;
}
async function ensureBookServerReady() {
  const bs = ensureBookServer();
  await bs.ready;
  bs.port = bs.server.address().port;
  return bs;
}
module.exports = { ensureBookServerReady, bookMime, parseRange };
