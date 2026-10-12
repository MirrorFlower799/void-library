'use strict';

const path = require('node:path');
const fs = require('node:fs');
const fsp = fs.promises;
const { pathToFileURL } = require('node:url');
const { readZipEntry } = require('./zip-index');
const { mimeByExt, unb64u } = require('./media');

function registerSchemes(protocol) {
protocol.registerSchemesAsPrivileged([
  { scheme: 'cover', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  { scheme: 'shot', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  { scheme: 'char', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  { scheme: 'art', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  { scheme: 'bc', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } }
]);

}

function registerProtocols({ protocol, net }, { COVERS_DIR, SHOTS_DIR, CHARS_DIR, ARTCOVERS_DIR, BOOKCOVERS_DIR }) {
  const serveDir = (dir) => (req) => {
    try {
      const u = new URL(req.url);
      const name = path.basename(decodeURIComponent(u.pathname.replace(/^\//, '')));
      if (!name) return new Response('', { status: 404 });
      const fp = path.join(dir, name);
      if (path.dirname(fp) !== dir) return new Response('', { status: 403 });
      return net.fetch(pathToFileURL(fp).toString());
    } catch (e) {
      return new Response('', { status: 404 });
    }
  };

  protocol.handle('cover', serveDir(COVERS_DIR));
  protocol.handle('shot', (req) => {
    try {
      const u = new URL(req.url);
      const rel = decodeURIComponent(u.pathname.replace(/^\//, ''));
      const parts = rel.split('/').filter(function (p) { return p && p !== '.' && p !== '..'; });
      if (!parts.length) return new Response('', { status: 404 });
      const fp = path.join.apply(path, [SHOTS_DIR].concat(parts));
      if (fp !== SHOTS_DIR && !fp.startsWith(SHOTS_DIR + path.sep)) return new Response('', { status: 403 });
      return net.fetch(pathToFileURL(fp).toString());
    } catch (e) {
      return new Response('', { status: 404 });
    }
  });
  protocol.handle('char', serveDir(CHARS_DIR));
  protocol.handle('art', serveDir(ARTCOVERS_DIR));
  protocol.handle('bc', serveDir(BOOKCOVERS_DIR));
  protocol.handle('media', async (req) => {
    try {
      const u = new URL(req.url);
      const host = u.hostname;
      const segs = u.pathname.split('/').filter(Boolean);
      if (host === 'file') {
        const p = unb64u(segs[0] || '');
        return net.fetch(pathToFileURL(p).toString());
      }
      if (host === 'zip') {
        const archive = unb64u(segs[0] || '');
        const entry = unb64u(segs[1] || '');
        const buf = await readZipEntry(archive, entry);
        if (!buf) return new Response('', { status: 404 });
        return new Response(buf, { headers: { 'Content-Type': mimeByExt(path.extname(entry)) } });
      }
      return new Response('', { status: 404 });
    } catch (e) {
      return new Response('', { status: 404 });
    }
  });

}

module.exports = { registerSchemes, registerProtocols };
