'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs/promises');
const { readZip, makeZip } = require('./zip');
const { zipEntries, readZipEntry } = require('./zip-index');
const { isImageFile } = require('./media');

const XML = /\.(opf|ncx|xhtml|html|htm|xml|svg)$/i;
const BAD_AMP = /&(?!#\d+;|#x[0-9a-fA-F]+;|[A-Za-z][A-Za-z0-9]*;)/;
const FIX_AMP = /&(?!#\d+;|#x[0-9a-fA-F]+;|[A-Za-z][A-Za-z0-9]*;)/g;
async function deliver(buffer) {
  // Oversized repaired EPUBs live on disk instead of being retransferred and
  // held in the main process for every subsequent Range request.
  if (buffer.length > 64 * 1024 * 1024) {
    await fs.writeFile(workerData.spillPath, buffer);
    parentPort.postMessage({ path: workerData.spillPath, size: buffer.length });
    return;
  }
  const bytes = Uint8Array.from(buffer);
  parentPort.postMessage({ bytes }, [bytes.buffer]);
}

(async () => {
  // Most EPUBs need no repair. Only examine compressed XML members first;
  // never inflate full-page images just to decide whether repair is necessary.
  try {
    const entries = await zipEntries(workerData.file);
    let needsRepair = false;
    for (const name of entries.keys()) {
      if (!XML.test(name)) continue;
      const data = await readZipEntry(workerData.file, name);
      if (BAD_AMP.test(data.toString('utf8'))) { needsRepair = true; break; }
    }
    if (!needsRepair) { parentPort.postMessage({ unchanged: true }); return; }
  } catch { /* Preserve the old behavior for unsupported or malformed ZIPs. */ }

  const raw = await fs.readFile(workerData.file);
  let entries;
  try { entries = readZip(raw); } catch { parentPort.postMessage({ unchanged: true }); return; }
  let changed = false;
  const files = Object.keys(entries)
    .sort((a, b) => a === 'mimetype' ? -1 : b === 'mimetype' ? 1 : 0)
    .map(name => {
      let data = entries[name];
      if (XML.test(name)) {
        const text = data.toString('utf8');
        const fixed = text.replace(FIX_AMP, '&amp;');
        if (fixed !== text) { data = Buffer.from(fixed); changed = true; }
      }
      return { name, data, store: name === 'mimetype' || isImageFile(name) };
    });
  if (!changed) parentPort.postMessage({ unchanged: true });
  else await deliver(makeZip(files));
})().catch(error => { throw error; });
