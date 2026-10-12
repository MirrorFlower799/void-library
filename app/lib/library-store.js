'use strict';

const path = require('node:path');
const fs = require('node:fs');
const fsp = fs.promises;
const { writeImage, readImage, cleanupImages } = require('./image-store');
const { writeJson } = require('./json-store');
const { readZip } = require('./zip');
const { extractArtCover } = require('./art-reader');

function createLibraryStore({ LIB_FILE, BOOKCOVERS_DIR, BOOKS_DIR }) {
  /* ---------------- 书海书架：library.json + bookcovers/ ---------------- */
  const DATA_DIR = path.dirname(BOOKS_DIR);
  const BOOK_IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tif', '.tiff', '.avif'];
  function isBookImage(p) { return BOOK_IMAGE_EXT.indexOf(path.extname(String(p || '')).toLowerCase()) > -1; }

  function detectBookType(p) {
    let st;
    try { st = fs.statSync(p); } catch (e) { return null; }
    if (st.isDirectory()) return 'folder';
    const ext = path.extname(p).toLowerCase();
    if (['.txt', '.md', '.markdown'].indexOf(ext) > -1) return 'txt';
    if (ext === '.pdf') return 'pdf';
    if (ext === '.epub') return 'epub';
    if (ext === '.cbz') return 'cbz';
    if (ext === '.zip') return 'zip';
    if (ext === '.7z') return '7z';
    if (ext === '.rar') return 'rar';
    if (isBookImage(p)) return 'image';
    return null;
  }

  function isComicFolder(folder) {
    let hasImg = false, hasBook = false;
    (function walk(d) {
      let es;
      try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
      for (const e of es) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else {
          if (isBookImage(full)) hasImg = true;
          const t = detectBookType(full);
          if (t && t !== 'image' && t !== 'folder') hasBook = true;
        }
      }
    })(folder);
    return hasImg && !hasBook;
  }

  function defaultBookTitle(p) {
    try { if (fs.statSync(p).isDirectory()) return path.basename(p); } catch (e) { /* */ }
    return path.basename(p, path.extname(p));
  }

  async function extractArchiveImages(archivePath, destDir) {
    let entries;
    try { entries = readZip(await fsp.readFile(archivePath)); } catch (e) { return 0; }
    const names = Object.keys(entries).filter(function (n) { return !n.endsWith('/') && isBookImage(n); });
    if (!names.length) return 0;
    names.sort(function (a, b) { return a.localeCompare(b, 'zh', { numeric: true }); });
    await fsp.mkdir(destDir, { recursive: true });
    for (let i = 0; i < names.length; i++) {
      const base = path.basename(names[i]);
      const out = path.join(destDir, String(i).padStart(4, '0') + '_' + base);
      await fsp.writeFile(out, entries[names[i]]);
    }
    return names.length;
  }

  function nowStr() {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  async function writeBookCoverFromDataUrl(dataUrl) {
    return writeImage(BOOKCOVERS_DIR, 'bc', dataUrl);
  }

  async function cleanupBookCovers(referenced) {
    return cleanupImages(BOOKCOVERS_DIR, referenced);
  }

  // Persist managed books relative to the portable data root, not the exe's old location.
  function resolveBookPath(stored) {
    if (typeof stored !== 'string' || !stored) return '';
    if (!path.isAbsolute(stored)) {
      const full = path.resolve(DATA_DIR, stored);
      if (full !== DATA_DIR && !full.startsWith(DATA_DIR + path.sep)) return '';
      return full;
    }
    if (fs.existsSync(stored)) return stored;
    // Repair absolute records written by older builds after a portable app was moved.
    const parts = stored.replace(/\\/g, '/').split('/');
    const index = parts.lastIndexOf('books');
    if (index !== -1 && index + 1 < parts.length && /^b_[a-z0-9_]+$/i.test(parts[index + 1])) {
      const local = path.join(BOOKS_DIR, ...parts.slice(index + 1));
      if (fs.existsSync(local)) return local;
    }
    return stored; // External references remain supported, but are never produced by import.
  }
  function toStoredPath(full) {
    if (typeof full !== 'string' || !full) return '';
    const resolved = resolveBookPath(full);
    const rel = path.relative(DATA_DIR, resolved);
    return rel && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel)
      ? rel.split(path.sep).join('/') : full;
  }
  function defaultLibrary() { return { shelves: [], books: [] }; }

  async function readLibrary() {
    try {
      const raw = await fsp.readFile(LIB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      const lib = {
        shelves: Array.isArray(parsed.shelves) ? parsed.shelves : [],
        books: Array.isArray(parsed.books) ? parsed.books : []
      };
      let changed = false;
      for (const b of lib.books) {
        if (b && typeof b.cover === 'string' && b.cover.startsWith('data:')) {
          const n = await writeBookCoverFromDataUrl(b.cover);
          b.cover = n || '';
          changed = true;
        }
      }
      for (const b of lib.books) {
        if (b && b.path) {
          const normalized = toStoredPath(b.path);
          if (normalized !== b.path) { b.path = normalized; changed = true; }
        }
      }
      if (changed) await writeLibrary(lib);
      return lib;
    } catch (e) {
      return defaultLibrary();
    }
  }

  async function writeLibrary(lib) {
    return writeJson(LIB_FILE, lib);
  }

  async function persistLibrary(lib) {
    const out = { shelves: Array.isArray(lib.shelves) ? lib.shelves : [], books: [] };
    const referenced = new Set();
    for (const b of (lib.books || [])) {
      const copy = Object.assign({}, b);
      if (typeof copy.cover === 'string' && copy.cover.startsWith('data:')) {
        const n = await writeBookCoverFromDataUrl(copy.cover);
        copy.cover = n || '';
      }
      if (typeof copy.cover === 'string' && copy.cover && !copy.cover.startsWith('data:')) {
        const base = path.basename(copy.cover);
        copy.cover = base;
        referenced.add(base);
      } else {
        copy.cover = '';
      }
      if (copy.path) copy.path = toStoredPath(copy.path);
      out.books.push(copy);
    }
    await writeLibrary(out);
    await cleanupBookCovers(referenced);
    return out;
  }

  async function importBooks(shelfId, paths, recursive, onProgress) {
    /* 1) 先规划（书架/书籍/跳过），便于显示进度总数 */
    const plan = [];
    const skipped = [];
    const seen = new Set();
    function planPath(p, parentKey) {
      const abs = path.resolve(p);
      if (seen.has(abs)) return;
      seen.add(abs);
      const type = detectBookType(abs);
      if (type === 'folder') {
        if (isComicFolder(abs)) { plan.push({ kind: 'book', name: defaultBookTitle(abs), parentKey: parentKey, payload: abs }); return; }
        plan.push({ kind: 'shelf', name: defaultBookTitle(abs), parentKey: parentKey, payload: abs });
        if (!recursive) { skipped.push([defaultBookTitle(abs), abs]); return; }
        let es;
        try { es = fs.readdirSync(abs, { withFileTypes: true }); } catch (e) { return; }
        es.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh'); });
        for (const e of es) {
          const full = path.join(abs, e.name);
          if (e.isDirectory()) planPath(full, abs);
          else {
            const t = detectBookType(full);
            if (t) plan.push({ kind: 'book', name: defaultBookTitle(full), parentKey: abs, payload: full });
            else skipped.push([e.name, full]);
          }
        }
      } else if (type) {
        plan.push({ kind: 'book', name: defaultBookTitle(abs), parentKey: parentKey, payload: abs });
      } else {
        skipped.push([path.basename(abs), abs]);
      }
    }
    for (const p of paths) planPath(p, null);

    /* 2) 执行 */
    const lib = await readLibrary();
    const report = { shelves: 0, books: 0, skipped: skipped };
    const existing = new Set(lib.books.map(function (b) { return resolveBookPath(b.path); }));
    let seq = 0;
    lib.shelves.forEach(function (s) { if (s && s.id > seq) seq = s.id; });
    function addShelf(name, parentId) {
      const id = ++seq;
      lib.shelves.push({ id: id, name: name, parentId: parentId || 0, sortOrder: lib.shelves.filter(function (s) { return s.parentId === (parentId || 0); }).length, cover: '' });
      report.shelves++;
      return id;
    }
    async function addBook(title, p, parentId) {
      const abs = path.resolve(p);
      if (existing.has(abs)) { report.skipped.push([title, abs]); return; }
      const type = detectBookType(abs);
      if (!type) { report.skipped.push([title, abs]); return; }
      const id = 'b_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
      let localPath = '', finalType = type;
      /* 复制到应用本地，避免读取远程/慢盘；zip/cbz 直接解包为图片文件夹以便快速翻页 */
      try {
        const destDir = path.join(BOOKS_DIR, id);
        await fsp.mkdir(destDir, { recursive: true });
        if (type === 'folder') {
          localPath = path.join(destDir, path.basename(abs));
          await fsp.cp(abs, localPath, { recursive: true });
        } else if (type === 'zip' || type === 'cbz') {
          const n = await extractArchiveImages(abs, destDir);
          if (n > 0) { finalType = 'folder'; localPath = destDir; }
          else { localPath = path.join(destDir, path.basename(abs)); await fsp.copyFile(abs, localPath); }
        } else {
          localPath = path.join(destDir, path.basename(abs));
          await fsp.copyFile(abs, localPath);
        }
      } catch (e) {
        // Do not store a fragile external absolute path if copying failed.
        report.skipped.push([title, abs, '复制失败：' + (e.message || e)]);
        try { await fsp.rm(path.join(BOOKS_DIR, id), { recursive: true, force: true }); } catch (_) {}
        return;
      }
      let cover = '';
      try { cover = await extractArtCover(localPath) || ''; } catch (e) { /* */ }
      lib.books.push({
        id: id, title: title, shelfId: parentId || 0, path: toStoredPath(localPath), type: finalType, cover: cover,
        pageCount: 0, position: '', status: '', tags: '', addedAt: nowStr(), lastRead: ''
      });
      existing.add(abs);
      report.books++;
    }

    const shelfMap = {};
    const total = plan.length;
    if (onProgress) onProgress({ done: 0, total: total, name: '准备导入…' });
    for (let i = 0; i < plan.length; i++) {
      const st = plan[i];
      if (st.kind === 'shelf') {
        const parent = (st.parentKey && shelfMap[st.parentKey] != null) ? shelfMap[st.parentKey] : (shelfId || 0);
        shelfMap[st.payload] = addShelf(st.name, parent);
      } else {
        const parent = (st.parentKey && shelfMap[st.parentKey] != null) ? shelfMap[st.parentKey] : (shelfId || 0);
        await addBook(st.name, st.payload, parent);
      }
      if (onProgress) onProgress({ done: i + 1, total: total, name: st.name });
    }
    const saved = await persistLibrary(lib);
    if (onProgress) onProgress({ done: total, total: total, name: '', finished: true });
    return { library: saved, report: report };
  }


  return { readLibrary, persistLibrary, importBooks, resolveBookPath, toStoredPath };
}

module.exports = { createLibraryStore };
