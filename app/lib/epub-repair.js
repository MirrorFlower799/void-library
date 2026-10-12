'use strict';
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const fs = require('node:fs');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

const cache = new Map();
const inFlight = new Map();
const MAX_BYTES = 64 * 1024 * 1024;
let cachedBytes = 0;
let queue = Promise.resolve();
const spillFiles = new Set();
process.once('exit', () => {
  for (const file of spillFiles) { try { fs.unlinkSync(file); } catch { /* best effort */ } }
});
function evict(key) {
  const value = cache.get(key);
  cachedBytes -= Buffer.isBuffer(value) ? value.length : 0;
  cache.delete(key);
  if (value?.path) {
    // Let in-flight streams finish before removing the file (also on Windows).
    const timer = setTimeout(() => fs.promises.unlink(value.path)
      .then(() => spillFiles.delete(value.path)).catch(() => {}), 60_000);
    timer.unref();
  }
}

function repairEpub(file, mtimeMs) {
  const key = file + '\0' + mtimeMs;
  if (cache.has(key)) {
    const value = cache.get(key);
    cache.delete(key); cache.set(key, value);
    return Promise.resolve(value);
  }
  if (inFlight.has(key)) return inFlight.get(key);
  // Serialize repair jobs so rapid book switches cannot spawn unbounded workers.
  const job = queue.catch(() => {}).then(() => new Promise((resolve, reject) => {
    const spillPath = path.join(os.tmpdir(), 'void-library-epub-' + process.pid + '-' + randomUUID() + '.epub');
    spillFiles.add(spillPath);
    const worker = new Worker(path.join(__dirname, 'epub-repair-worker.js'), { workerData: { file, spillPath } });
    let received = false;
    worker.once('message', data => {
      received = true;
      if (!data.path) spillFiles.delete(spillPath);
      const result = data.unchanged ? null : data.path
        ? { path: data.path, size: data.size }
        : Buffer.from(data.bytes.buffer, data.bytes.byteOffset, data.bytes.byteLength);
      const byteSize = Buffer.isBuffer(result) ? result.length : 0;
      if (!Buffer.isBuffer(result) || byteSize <= MAX_BYTES) {
        while (cache.size && (cache.size >= 3 || cachedBytes + byteSize > MAX_BYTES))
          evict(cache.keys().next().value);
        cache.set(key, result); cachedBytes += byteSize;
      }
      resolve(result);
    });
    worker.once('error', error => { spillFiles.delete(spillPath); reject(error); });
    worker.once('exit', code => { if (!received) reject(Error('EPUB repair worker exited: ' + code)); });
  })).finally(() => inFlight.delete(key));
  queue = job;
  inFlight.set(key, job);
  return job;
}

module.exports = { repairEpub };
