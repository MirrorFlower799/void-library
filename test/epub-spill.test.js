'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { makeZip } = require('../app/lib/zip');
const { repairEpub } = require('../app/lib/epub-repair');
const { readZipEntry } = require('../app/lib/zip-index');

test('oversized repaired EPUB is cached on disk and reuses stable bytes', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'void-epub-spill-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'illustrated.epub');
  await fs.writeFile(file, makeZip([
    { name: 'mimetype', data: Buffer.from('application/epub+zip'), store: true },
    { name: 'package.opf', data: Buffer.from('<title>Wrong & Text</title>') },
    { name: 'illustration.jpg', data: Buffer.alloc(65 * 1024 * 1024, 31), store: true }
  ]));
  const mtime = (await fs.stat(file)).mtimeMs;
  const repaired = await repairEpub(file, mtime);
  assert.equal(typeof repaired.path, 'string');
  assert(repaired.size > 64 * 1024 * 1024);
  assert.equal((await readZipEntry(repaired.path, 'package.opf')).toString(), '<title>Wrong &amp; Text</title>');
  assert.deepEqual(await repairEpub(file, mtime), repaired);
  assert.deepEqual((await fs.readFile(file)).subarray(0, 4), Buffer.from('PK\x03\x04'));
});
