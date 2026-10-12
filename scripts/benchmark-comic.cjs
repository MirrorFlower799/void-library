'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { makeZip, readZip } = require('../app/lib/zip');
const { readZipEntry } = require('../app/lib/zip-index');

(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'void-comic-bench-'));
  try {
    const pages = Array.from({ length: 40 }, (_, i) => ({
      name: String(i).padStart(3, '0') + '.png',
      data: Buffer.alloc(512 * 1024, i), store: true
    }));
    const archive = path.join(dir, 'comic.cbz');
    await fs.writeFile(archive, makeZip(pages));
    const target = pages[19];
    const repetitions = 5;
    const oldMs = [], newMs = [];
    for (let i = 0; i < repetitions; i++) {
      let start = performance.now();
      const old = readZip(await fs.readFile(archive))[target.name];
      oldMs.push(performance.now() - start);
      assert.deepEqual(old, target.data);
      start = performance.now();
      const single = await readZipEntry(archive, target.name);
      newMs.push(performance.now() - start);
      assert.deepEqual(single, target.data);
    }
    const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
    console.log(JSON.stringify({ archiveMiB: 20, pages: pages.length,
      baselineEntireZipMedianMs: +median(oldMs).toFixed(2),
      optimizedSinglePageMedianMs: +median(newMs).toFixed(2) }));
  } finally {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    await fs.rm(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
