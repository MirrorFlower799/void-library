// File-like range source for Foliate's PDF adapter, bounded to eight chunks.
export async function openRemoteFile(url, name, type, fetcher = fetch) {
  const head = await fetcher(url, { method: 'HEAD' });
  if (!head.ok) throw Error('HTTP ' + head.status);
  const size = Number(head.headers.get('content-length'));
  if (!Number.isSafeInteger(size) || size <= 0) throw Error('无法读取文件大小');
  const chunkSize = 256 * 1024, cache = new Map(), pending = new Map();
  const abort = new AbortController();
  async function chunk(index) {
    if (cache.has(index)) {
      const bytes = cache.get(index); cache.delete(index); cache.set(index, bytes); return bytes;
    }
    if (pending.has(index)) return pending.get(index);
    const start = index * chunkSize, end = Math.min(size, start + chunkSize) - 1;
    const request = (async () => {
      const response = await fetcher(url, { headers: { Range: `bytes=${start}-${end}` }, signal: abort.signal });
      if (response.status !== 206) throw Error('阅读器需要分段读取支持 (HTTP ' + response.status + ')');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== end - start + 1) throw Error('文件读取不完整');
      cache.set(index, bytes);
      while (cache.size > 8) cache.delete(cache.keys().next().value);
      return bytes;
    })().finally(() => pending.delete(index));
    pending.set(index, request);
    return request;
  }
  async function read(start, end) {
    const result = new Uint8Array(end - start);
    for (let position = start; position < end;) {
      const index = Math.floor(position / chunkSize), bytes = await chunk(index);
      const offset = position - index * chunkSize, count = Math.min(bytes.length - offset, end - position);
      result.set(bytes.subarray(offset, offset + count), position - start);
      position += count;
    }
    return result.buffer;
  }
  return {
    name, type, size,
    slice(start = 0, end = size) {
      start = Math.min(size, Math.max(0, start < 0 ? size + start : start));
      end = Math.max(start, Math.min(size, end < 0 ? size + end : end));
      return { size: end - start, arrayBuffer: () => read(start, end) };
    },
    arrayBuffer: () => read(0, size),
    destroy() { abort.abort(); cache.clear(); }
  };
}
