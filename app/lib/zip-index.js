'use strict';

// Random-access ZIP index for comics and covers. Unlike readZip(), this does
// not inflate every image whenever a single page is requested.
const fs = require('node:fs/promises');
const zlib = require('node:zlib');
const { promisify } = require('node:util');
const inflateRaw = promisify(zlib.inflateRaw);
const MAX_TAIL = 22 + 65535;
const MAX_INDEXES = 5;
const indexes = new Map();
const pending = new Map();

async function readExactly(handle, position, length) {
  const result = Buffer.allocUnsafe(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await handle.read(result, offset, length - offset, position + offset);
    if (!bytesRead) throw new Error('ZIP 内容不完整');
    offset += bytesRead;
  }
  return result;
}

async function buildIndex(file, size) {
  const handle = await fs.open(file, 'r');
  try {
    const tailSize = Math.min(size, MAX_TAIL);
    if (tailSize < 22) throw new Error('不是有效的压缩包');
    const tail = await readExactly(handle, size - tailSize, tailSize);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50 && i + 22 + tail.readUInt16LE(i + 20) <= tail.length) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是有效的压缩包');
    const count = tail.readUInt16LE(eocd + 10);
    const centralSize = tail.readUInt32LE(eocd + 12);
    const centralOffset = tail.readUInt32LE(eocd + 16);
    if (centralOffset + centralSize > size || count === 0xffff || centralOffset === 0xffffffff)
      throw new Error('不支持的 ZIP 中央目录');
    const central = await readExactly(handle, centralOffset, centralSize);
    const entries = new Map();
    let offset = 0;
    for (let i = 0; i < count; i++) {
      if (offset + 46 > central.length || central.readUInt32LE(offset) !== 0x02014b50)
        throw new Error('ZIP 中央目录损坏');
      const method = central.readUInt16LE(offset + 10);
      const compressed = central.readUInt32LE(offset + 20);
      const size = central.readUInt32LE(offset + 24);
      const nameLen = central.readUInt16LE(offset + 28);
      const extraLen = central.readUInt16LE(offset + 30);
      const commentLen = central.readUInt16LE(offset + 32);
      const localOffset = central.readUInt32LE(offset + 42);
      const next = offset + 46 + nameLen + extraLen + commentLen;
      if (next > central.length) throw new Error('ZIP 文件名损坏');
      const name = central.toString('utf8', offset + 46, offset + 46 + nameLen);
      entries.set(name, { method, compressed, size, localOffset });
      offset = next;
    }
    return entries;
  } finally { await handle.close(); }
}

async function zipEntries(file) {
  const stat = await fs.stat(file);
  const key = `${file}\0${stat.size}\0${stat.mtimeMs}\0${stat.ctimeMs}`;
  if (indexes.has(key)) {
    const result = indexes.get(key);
    indexes.delete(key); indexes.set(key, result);
    return result;
  }
  if (pending.has(key)) return pending.get(key);
  const work = buildIndex(file, stat.size).then(entries => {
    // Evict older versions of the same archive and bound retained indexes.
    for (const k of indexes.keys()) if (k.startsWith(file + '\0')) indexes.delete(k);
    indexes.set(key, entries);
    while (indexes.size > MAX_INDEXES) indexes.delete(indexes.keys().next().value);
    return entries;
  }).finally(() => pending.delete(key));
  pending.set(key, work);
  return work;
}

async function readZipEntry(file, name) {
  const entries = await zipEntries(file);
  const entry = entries.get(name);
  if (!entry) return null;
  if (entry.method !== 0 && entry.method !== 8) throw new Error('不支持的 ZIP 压缩格式');
  const handle = await fs.open(file, 'r');
  let compressed;
  try {
    const header = await readExactly(handle, entry.localOffset, 30);
    if (header.readUInt32LE(0) !== 0x04034b50) throw new Error('ZIP 文件头损坏');
    const start = entry.localOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    compressed = await readExactly(handle, start, entry.compressed);
  } finally { await handle.close(); }
  const data = entry.method === 8 ? await inflateRaw(compressed) : compressed;
  if (data.length !== entry.size) throw new Error('ZIP 数据长度不匹配');
  return data;
}

module.exports = { zipEntries, readZipEntry };
