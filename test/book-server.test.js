'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { ensureBookServerReady } = require('../app/lib/book-server');
const { makeZip, readZip } = require('../app/lib/zip');

test('reader serves its relocated assets, byte ranges and repaired EPUB content', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'void-reader-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert(path.basename(root).startsWith('void-reader-test-'));
    return fs.rm(root, { recursive: true, force: true });
  });
  const bs = await ensureBookServerReady();
  t.after(() => new Promise(resolve => { bs.server.close(resolve); bs.server.closeAllConnections(); }));
  assert.equal(await ensureBookServerReady(), bs);
  const url = 'http://127.0.0.1:' + bs.port;
  const viewer = await fetch(url + '/viewer.html');
  assert.equal(viewer.status, 200);
  assert.match(await viewer.text(), /foliate-view/);
  assert.equal((await fetch(url + '/vendor/foliate-js/view.js')).status, 200);
  assert.equal((await fetch(url + '/missing')).status, 404);
  bs.state.book = path.join(root, 'book.pdf');
  await fs.writeFile(bs.state.book, '0123456789');
  const range = await fetch(url + '/book', { headers: { range: 'bytes=2-5' } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await range.text(), '2345');
  assert.equal((await fetch(url + '/book', { headers: { range: 'bytes=99-100' } })).status, 416);
  bs.state.book = path.join(root, 'book.epub');
  const raw = makeZip([{ name: 'mimetype', data: Buffer.from('application/epub+zip'), store: true }, { name: 'content.opf', data: Buffer.from('<title>A & B</title>') }]);
  await fs.writeFile(bs.state.book, raw);
  const response = await fetch(url + '/book');
  const repaired = readZip(Buffer.from(await response.arrayBuffer()));
  assert.equal(repaired['content.opf'].toString(), '<title>A &amp; B</title>');
  assert.deepEqual(await fs.readFile(bs.state.book), raw);
  // Well-formed EPUBs must be served directly from disk, not rebuilt on each range.
  const cleanPath = path.join(root, 'clean.epub');
  const clean = makeZip([
    { name: 'mimetype', data: Buffer.from('application/epub+zip'), store: true },
    { name: 'content.opf', data: Buffer.from('<title>Good &amp; Valid</title>') },
    { name: 'cover.png', data: Buffer.alloc(1024 * 1024, 17), store: true }
  ]);
  await fs.writeFile(cleanPath, clean);
  bs.state.book = cleanPath;
  const { repairEpub } = require('../app/lib/epub-repair');
  assert.equal(await repairEpub(cleanPath, (await fs.stat(cleanPath)).mtimeMs), null);
  const head = await fetch(url + '/book', { method: 'HEAD' });
  assert.equal(head.headers.get('content-length'), String(clean.length));
  assert.equal(head.headers.get('accept-ranges'), 'bytes');
  const suffix = await fetch(url + '/book', { headers: { Range: 'bytes=-36' } });
  assert.equal(suffix.status, 206);
  assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), clean.subarray(-36));
});
