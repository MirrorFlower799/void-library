'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { makeZip } = require('../app/lib/zip');
const { ensureBookServerReady } = require('../app/lib/book-server');

(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'void-reader-bench-'));
  const file = path.join(directory, 'large.epub');
  // A large illustrated EPUB: compressed image plus an XML repair to exercise
  // the existing decompression/recompression path, with no private book data.
  await fs.writeFile(file, makeZip([
    { name: 'mimetype', data: Buffer.from('application/epub+zip'), store: true },
    { name: 'content.opf', data: Buffer.from('<title>A & B</title>') },
    { name: 'large.png', data: Buffer.alloc(48 * 1024 * 1024, 7) }
  ]));
  const bs = await ensureBookServerReady();
  bs.state.book = file;
  let maxLag = 0, last = performance.now();
  const timer = setInterval(() => { const now = performance.now(); maxLag = Math.max(maxLag, now - last - 10); last = now; }, 10);
  try {
    await new Promise(resolve => setTimeout(resolve, 20));
    const start = performance.now();
    const response = await fetch('http://127.0.0.1:' + bs.port + '/book');
    const bytes = (await response.arrayBuffer()).byteLength;
    await new Promise(resolve => setTimeout(resolve, 20));
    const result = { fixtureMiB: 48, receivedBytes: bytes, elapsedMs: Math.round(performance.now() - start), mainLoopMaxLagMs: Math.round(maxLag) };
    console.log(JSON.stringify(result));
    assert(maxLag < 100, 'EPUB processing blocked the main event loop for ' + Math.round(maxLag) + ' ms');
  } finally {
    clearInterval(timer);
    await new Promise(resolve => { bs.server.close(resolve); bs.server.closeAllConnections(); });
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert(path.basename(directory).startsWith('void-reader-bench-'));
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
