'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { readZip } = require('./zip');

function parseArray(obj, key) {
  return Array.isArray(obj) ? obj : (obj && Array.isArray(obj[key]) ? obj[key] : null);
}
function parseBackup(filePath, bytes) {
  const zipped = path.extname(filePath).toLowerCase() === '.zip';
  const entries = zipped ? readZip(bytes) : null;
  const source = zipped ? entries['data.json'] || entries['./data.json'] : bytes;
  if (!source) throw new Error('压缩包中缺少 data.json');
  let raw;
  try { raw = JSON.parse(source.toString('utf8')); } catch (_) { throw new Error('data.json 解析失败'); }
  const games = parseArray(raw, 'games');
  if (!games || !games.every(g => g && typeof g.name === 'string')) throw new Error('收藏数据缺少必要字段');
  const optional = (filename, prop) => {
    if (!entries) return null;
    const buf = entries[filename] || entries['./' + filename];
    if (!buf) return null;
    try { return parseArray(JSON.parse(buf.toString('utf8')), prop); } catch (_) { return null; }
  };
  const chars = optional('characters.json', 'characters');
  const characters = chars && chars.every(c => c && typeof c.name === 'string') ? chars : null;
  const libBuf = entries && (entries['library.json'] || entries['./library.json']);
  let library = null;
  if (libBuf) {
    try {
      const v = JSON.parse(libBuf.toString('utf8'));
      if (v && Array.isArray(v.books) && Array.isArray(v.shelves)) library = v;
    } catch (_) { /* keep only valid library */ }
  }
  return { games, characters, library, entries, format: zipped ? 'zip' : 'json' };
}

function mergeById(existing, incoming) {
  const out = existing.slice();
  const seen = new Set(existing.map(v => String(v && v.id)));
  const added = [];
  for (const item of incoming || []) {
    if (!item || typeof item !== 'object') continue;
    const id = String(item.id || '');
    if (id && seen.has(id)) continue;
    const copy = Object.assign({}, item, { id: id || crypto.randomUUID() });
    seen.add(copy.id); out.push(copy); added.push(copy);
  }
  return { list: out, added };
}

function mergeLibrary(current, incoming) {
  const shelves = current.shelves.slice();
  const books = current.books.slice();
  const used = new Set(shelves.map(s => Number(s.id)));
  const map = new Map();
  let next = Math.max(0, ...used);
  for (const shelf of incoming.shelves || []) {
    const old = Number(shelf.id);
    if (!Number.isFinite(old)) continue;
    let id = old;
    if (used.has(id) || id <= 0) { do { id = ++next; } while (used.has(id)); }
    used.add(id);
    map.set(old, id);
  }
  for (const shelf of incoming.shelves || []) {
    const old = Number(shelf.id);
    if (!map.has(old)) continue;
    const parent = Number(shelf.parentId) || 0;
    shelves.push(Object.assign({}, shelf, { id: map.get(old), parentId: map.get(parent) || 0 }));
  }
  const seen = new Set(books.map(b => String(b.id)));
  const addedBooks = [];
  for (const book of incoming.books || []) {
    const id = String(book.id || '');
    if (id && seen.has(id)) continue;
    const copy = Object.assign({}, book, { id: id || 'b_' + crypto.randomUUID(), shelfId: map.get(Number(book.shelfId)) || 0 });
    seen.add(copy.id); books.push(copy); addedBooks.push(copy);
  }
  return { shelves, books, addedBooks };
}

async function applyBackup(backup, mode, stores, paths) {
  if (mode !== 'merge' && mode !== 'replace') throw new Error('无效的导入模式');
  const { readGames, persistGames, readCharacters, persistCharacters } = stores.collections;
  const { readLibrary, persistLibrary } = stores.library;
  const currentGames = (await readGames()) || [];
  const currentCharacters = (await readCharacters()) || [];
  const currentLibrary = (await readLibrary()) || { shelves: [], books: [] };
  const resultGames = mode === 'merge' ? mergeById(currentGames, backup.games) : { list: backup.games.map(x => Object.assign({}, x)), added: backup.games.map(x => Object.assign({}, x)) };
  // Keep objects in the new list and the list of added entries identical for filename rewriting.
  const incomingIds = new Set(resultGames.added.map(g => String(g.id)));
  const games = mode === 'merge' ? resultGames.list : resultGames.added;
  const candidates = mode === 'merge' ? games.filter(g => incomingIds.has(String(g.id))) : games;
  const charactersResult = backup.characters ? (mode === 'merge' ? mergeById(currentCharacters, backup.characters) : { list: backup.characters.map(x => Object.assign({}, x)), added: null }) : null;
  const characters = charactersResult && charactersResult.list;
  const charCandidates = charactersResult && (charactersResult.added || characters);
  const lib = backup.library ? (mode === 'merge' ? mergeLibrary(currentLibrary, backup.library) : {
    shelves: backup.library.shelves.map(x => Object.assign({}, x)),
    books: backup.library.books.map(x => Object.assign({}, x)),
    addedBooks: null
  }) : null;
  const bookCandidates = lib && (lib.addedBooks || lib.books);
  const entries = backup.entries || {};

  // A new filename for each imported image prevents same-name collisions with existing collections.
  const copied = new Map();
  async function materialize(folder, orig, prefix, dir, id) {
    if (!orig || typeof orig !== 'string' || orig.startsWith('data:')) return orig || '';
    const basename = path.posix.basename(orig.replace(/\\/g, '/'));
    if (!basename || basename === '.' || basename === '..') return '';
    const key = folder + (id ? '/' + id : '') + '/' + basename;
    const data = entries[key];
    // Missing backup assets must not accidentally reuse an unrelated local file of the same name.
    if (!data) return '';
    const ext = path.extname(basename).toLowerCase();
    if (!/^\.(jpg|jpeg|png|webp|gif|bmp|avif)$/.test(ext)) return orig;
    const cacheKey = dir + '/' + key;
    if (copied.has(cacheKey)) return copied.get(cacheKey);
    const newName = prefix + '_' + crypto.randomUUID().replace(/-/g, '') + ext;
    const targetDir = id ? path.join(dir, stores.collections.safeId(id)) : dir;
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, newName), data, { flag: 'wx' });
    copied.set(cacheKey, newName);
    return newName;
  }
  for (const g of candidates) {
    g.cover = await materialize('covers', g.cover, 'cover', paths.COVERS_DIR);
    if (Array.isArray(g.shots)) {
      const shots = [];
      for (const shot of g.shots) shots.push(await materialize('shots', shot, 'shot', paths.SHOTS_DIR, g.id));
      g.shots = shots;
    }
  }
  for (const c of charCandidates || []) {
    c.image = await materialize('chars', c.image, 'char', paths.CHARS_DIR);
    if (Array.isArray(c.shots)) {
      const shots = [];
      for (const shot of c.shots) shots.push(await materialize('chars', shot, 'char', paths.CHARS_DIR));
      c.shots = shots;
    }
  }
  for (const b of bookCandidates || []) {
    b.cover = await materialize('bookcovers', b.cover, 'bc', paths.BOOKCOVERS_DIR);
  }
  // Only once assets are ready, persist the merged records, preserving existing assets.
  const savedGames = await persistGames(games);
  if (characters) await persistCharacters(characters);
  if (lib) await persistLibrary(lib);
  return {
    ok: true, games: savedGames, characters: characters ? await readCharacters() : null,
    library: lib ? await readLibrary() : null, mode,
    added: candidates.length, skipped: backup.games.length - candidates.length,
    total: savedGames.length
  };
}

module.exports = { parseBackup, mergeById, mergeLibrary, applyBackup };
