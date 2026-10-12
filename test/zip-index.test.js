'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { makeZip } = require('../app/lib/zip');
const { zipEntries, readZipEntry } = require('../app/lib/zip-index');
const { browseArt, extractArtCover } = require('../app/lib/art-reader');

test('comic archive index reads only the selected page and invalidates on replacement', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'void-zip-index-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'comic.cbz');
  const pages = [
    { name: '10.png', data: Buffer.alloc(700_000, 0x14) },
    { name: '2.png', data: Buffer.alloc(900_000, 0x27), store: true },
    { name: 'page.txt', data: Buffer.from('metadata') }
  ];
  await fs.writeFile(file, makeZip(pages));
  const index = await zipEntries(file);
  assert.deepEqual([...index.keys()], ['10.png', '2.png', 'page.txt']);
  assert.equal(index.get('10.png').size, 700_000);
  const [a, b, missing] = await Promise.all([
    readZipEntry(file, '10.png'), readZipEntry(file, '2.png'), readZipEntry(file, 'missing.png')
  ]);
  assert.deepEqual(a, pages[0].data);
  assert.deepEqual(b, pages[1].data);
  assert.equal(missing, null);
  assert.equal((await browseArt(file)).pages.length, 2);
  assert.equal(await extractArtCover(file), 'data:image/png;base64,' + pages[1].data.toString('base64'));
  await fs.writeFile(file, makeZip([{ name: 'new.png', data: Buffer.from('replacement') }]));
  assert.deepEqual([...await zipEntries(file).then(index => index.keys())], ['new.png']);
  assert.equal((await readZipEntry(file, 'new.png')).toString(), 'replacement');
});
