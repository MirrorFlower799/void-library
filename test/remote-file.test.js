'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

test('file-like range reader deduplicates overlapping requests and bounds its cache', async () => {
  const { openRemoteFile } = await import(pathToFileURL(path.resolve(__dirname, '../app/book/remote-file.mjs')).href);
  const input = Buffer.alloc(256 * 1024 * 12 + 7);
  for (let i = 0; i < input.length; i++) input[i] = i % 251;
  const requests = [];
  const fetcher = async (_url, opts) => {
    if (opts.method === 'HEAD') return new Response('', { headers: { 'content-length': input.length } });
    requests.push(opts.headers.Range);
    const [, a, b] = /^bytes=(\d+)-(\d+)$/.exec(opts.headers.Range);
    return new Response(input.subarray(+a, +b + 1), { status: 206 });
  };
  const file = await openRemoteFile('/book', 'comic.cbz', 'application/zip', fetcher);
  const reads = await Promise.all([file.slice(42, 1024).arrayBuffer(), file.slice(50, 600).arrayBuffer()]);
  assert.deepEqual(Buffer.from(reads[0]), input.subarray(42, 1024));
  assert.deepEqual(Buffer.from(reads[1]), input.subarray(50, 600));
  assert.equal(requests.length, 1, 'overlapping reads share the same in-flight chunk');
  const cross = await file.slice(256 * 1024 - 10, 256 * 1024 + 17).arrayBuffer();
  assert.deepEqual(Buffer.from(cross), input.subarray(256 * 1024 - 10, 256 * 1024 + 17));
  for (let i = 2; i < 12; i++) await file.slice(i * 256 * 1024, i * 256 * 1024 + 1).arrayBuffer();
  const count = requests.length;
  await file.slice(42, 50).arrayBuffer();
  assert.equal(requests.length, count + 1, 'oldest cached chunk is evicted');
  file.destroy();
});
