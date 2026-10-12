'use strict';

const path = require('node:path');
const fs = require('node:fs');
const fsp = fs.promises;
const { writeImage, readImage, cleanupImages } = require('./image-store');
const { writeJson } = require('./json-store');

function createCollectionStore({ DATA_FILE, COVERS_DIR, SHOTS_DIR, CHARS_DIR, CHARS_FILE, ARTS_FILE, ARTCOVERS_DIR, SETTINGS_FILE }) {
  /* ---------------- settings.json ---------------- */
  async function readSettings() {
    try {
      const s = JSON.parse(await fsp.readFile(SETTINGS_FILE, 'utf8'));
      return (s && typeof s === 'object') ? s : {};
    } catch (e) {
      return {};
    }
  }

  async function writeSettings(s) {
    await fsp.writeFile(SETTINGS_FILE, JSON.stringify(s || {}, null, 2), 'utf8');
  }

  /* ---------------- 封面文件读写 ---------------- */
  async function writeCoverFromDataUrl(dataUrl) {
    return writeImage(COVERS_DIR, 'cover', dataUrl);
  }

  /* 截图按游戏分文件夹存放：shots/<gameId>/<file> */
  function safeId(id) {
    return String(id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_') || 'unknown';
  }

  async function writeShotFromDataUrl(dataUrl, gameId) {
    const dir = gameId ? path.join(SHOTS_DIR, safeId(gameId)) : SHOTS_DIR;
    return writeImage(dir, 'shot', dataUrl);
  }

  /* 确保某个截图文件位于该游戏的文件夹内（兼容旧的扁平存放），返回文件名 */
  async function ensureShotInFolder(gameId, filename) {
    const base = path.basename(filename);
    if (!base) return '';
    const dir = path.join(SHOTS_DIR, safeId(gameId));
    const dest = path.join(dir, base);
    try {
      await fsp.access(dest);
      return base;
    } catch (e) { /* 不在目标目录 */ }
    const flat = path.join(SHOTS_DIR, base);
    try {
      await fsp.mkdir(dir, { recursive: true });
      await fsp.rename(flat, dest);
    } catch (e) { /* 源不存在或移动失败 */ }
    return base;
  }

  async function walkShotFiles(dir, base, out) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const rel = base ? (base + '/' + e.name) : e.name;
      if (e.isDirectory()) await walkShotFiles(full, rel, out);
      else out.push({ full, rel });
    }
  }

  async function cleanupShots(referenced) {
    const files = [];
    await walkShotFiles(SHOTS_DIR, '', files);
    for (const f of files) {
      if (!referenced.has(f.rel)) {
        try { await fsp.unlink(f.full); } catch (e) { /* ignore */ }
      }
    }
    /* 移除空目录 */
    try {
      const dirs = await fsp.readdir(SHOTS_DIR, { withFileTypes: true });
      for (const d of dirs) {
        if (!d.isDirectory()) continue;
        const sub = path.join(SHOTS_DIR, d.name);
        try {
          const left = await fsp.readdir(sub);
          if (!left.length) await fsp.rmdir(sub);
        } catch (e) { /* ignore */ }
      }
    } catch (e) { /* ignore */ }
  }

  async function coverToDataUrl(name) {
    return readImage(COVERS_DIR, name);
  }

  async function cleanupCovers(referenced) {
    return cleanupImages(COVERS_DIR, referenced);
  }

  /* ---------------- 角色卡片（characters.json + chars/） ---------------- */
  async function writeCharFromDataUrl(dataUrl) {
    return writeImage(CHARS_DIR, 'char', dataUrl);
  }

  async function charToDataUrl(name) {
    return readImage(CHARS_DIR, name);
  }

  async function cleanupChars(referenced) {
    return cleanupImages(CHARS_DIR, referenced);
  }

  async function readCharacters() {
    try {
      const raw = await fsp.readFile(CHARS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed
        : (parsed && Array.isArray(parsed.characters)) ? parsed.characters : [];
      let changed = false;
      for (const c of arr) {
        if (c && typeof c.image === 'string' && c.image.startsWith('data:')) {
          const n = await writeCharFromDataUrl(c.image);
          c.image = n || '';
          changed = true;
        }
        if (c && Array.isArray(c.shots)) {
          const shotOut = [];
          for (const s of c.shots) {
            if (typeof s === 'string' && s.startsWith('data:')) {
              const n = await writeCharFromDataUrl(s);
              if (n) shotOut.push(n);
              changed = true;
            } else if (typeof s === 'string' && s) {
              shotOut.push(s);
            }
          }
          c.shots = shotOut;
        }
      }
      if (changed) await writeCharacters(arr);
      return arr;
    } catch (e) {
      return null;
    }
  }

  async function writeCharacters(list) {
    return writeJson(CHARS_FILE, list);
  }

  async function persistCharacters(list) {
    const out = [];
    const referenced = new Set();
    for (const c of list) {
      const copy = Object.assign({}, c);

      /* 封面 */
      if (typeof copy.image === 'string' && copy.image.startsWith('data:')) {
        const n = await writeCharFromDataUrl(copy.image);
        copy.image = n || '';
      }
      if (typeof copy.image === 'string' && copy.image && !copy.image.startsWith('data:')) {
        const base = path.basename(copy.image);
        copy.image = base;
        referenced.add(base);
      } else {
        copy.image = '';
      }

      /* 图集图片 */
      const shots = Array.isArray(copy.shots) ? copy.shots : [];
      const shotOut = [];
      for (const s of shots) {
        if (typeof s === 'string' && s.startsWith('data:')) {
          const n = await writeCharFromDataUrl(s);
          if (n) { shotOut.push(n); referenced.add(n); }
        } else if (typeof s === 'string' && s) {
          const base = path.basename(s);
          shotOut.push(base);
          referenced.add(base);
        }
      }
      copy.shots = shotOut;

      out.push(copy);
    }
    await writeCharacters(out);
    await cleanupChars(referenced);
    return out;
  }

  /* ---------------- 资料集（arts.json + artcovers/，内容按路径引用） ---------------- */
  async function writeArtCoverFromDataUrl(dataUrl) {
    return writeImage(ARTCOVERS_DIR, 'art', dataUrl);
  }

  async function artCoverToDataUrl(name) {
    return readImage(ARTCOVERS_DIR, name);
  }

  async function cleanupArtCovers(referenced) {
    return cleanupImages(ARTCOVERS_DIR, referenced);
  }

  async function readArts() {
    try {
      const raw = await fsp.readFile(ARTS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed
        : (parsed && Array.isArray(parsed.arts)) ? parsed.arts : [];
      let changed = false;
      for (const a of arr) {
        if (a && typeof a.cover === 'string' && a.cover.startsWith('data:')) {
          const n = await writeArtCoverFromDataUrl(a.cover);
          a.cover = n || '';
          changed = true;
        }
      }
      if (changed) await writeArts(arr);
      return arr;
    } catch (e) {
      return null;
    }
  }

  async function writeArts(list) {
    return writeJson(ARTS_FILE, list);
  }

  async function persistArts(list) {
    const out = [];
    const referenced = new Set();
    for (const a of list) {
      const copy = Object.assign({}, a);
      if (typeof copy.cover === 'string' && copy.cover.startsWith('data:')) {
        const n = await writeArtCoverFromDataUrl(copy.cover);
        copy.cover = n || '';
      }
      if (typeof copy.cover === 'string' && copy.cover && !copy.cover.startsWith('data:')) {
        const base = path.basename(copy.cover);
        copy.cover = base;
        referenced.add(base);
      } else {
        copy.cover = '';
      }
      out.push(copy);
    }
    await writeArts(out);
    await cleanupArtCovers(referenced);
    return out;
  }

  /* ---------------- data.json 读写 ---------------- */
  async function readGames() {
    try {
      const raw = await fsp.readFile(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed
        : (parsed && Array.isArray(parsed.games)) ? parsed.games : [];
      let changed = false;
      for (const g of arr) {
        if (g && typeof g.cover === 'string' && g.cover.startsWith('data:')) {
          const n = await writeCoverFromDataUrl(g.cover);
          g.cover = n || '';
          changed = true;
        }
        if (g && Array.isArray(g.shots)) {
          const shotOut = [];
          for (const s of g.shots) {
            if (typeof s === 'string' && s.startsWith('data:')) {
              const n = await writeShotFromDataUrl(s, g.id);
              if (n) shotOut.push(n);
              changed = true;
            } else if (typeof s === 'string' && s) {
              const base = path.basename(s);
              let moved = false;
              try { await fsp.access(path.join(SHOTS_DIR, base)); moved = true; } catch (e) { /* 已在文件夹内 */ }
              await ensureShotInFolder(g.id, s);
              if (base !== s || moved) changed = true;
              shotOut.push(base);
            }
          }
          g.shots = shotOut;
        }
      }
      if (changed) await writeGames(arr);
      return arr;
    } catch (e) {
      return null; /* 文件不存在或损坏 */
    }
  }

  async function writeGames(games) {
    return writeJson(DATA_FILE, games);
  }

  /* 把游戏数组里的 data URL 封面落盘为文件，并返回规范化后的数组 */
  async function persistGames(games) {
    const out = [];
    const referenced = new Set();
    const shotsRef = new Set();
    for (const g of games) {
      const copy = Object.assign({}, g);

      /* 封面 */
      if (typeof copy.cover === 'string' && copy.cover.startsWith('data:')) {
        const n = await writeCoverFromDataUrl(copy.cover);
        copy.cover = n || '';
      }
      if (typeof copy.cover === 'string' && copy.cover && !copy.cover.startsWith('data:')) {
        const base = path.basename(copy.cover);
        copy.cover = base;
        referenced.add(base);
      } else {
        copy.cover = '';
      }

      /* 截图（可多张，按游戏分文件夹存放） */
      const gid = safeId(copy.id);
      const shots = Array.isArray(copy.shots) ? copy.shots : [];
      const shotOut = [];
      for (const s of shots) {
        if (typeof s === 'string' && s.startsWith('data:')) {
          const n = await writeShotFromDataUrl(s, copy.id);
          if (n) { shotOut.push(n); shotsRef.add(gid + '/' + n); }
        } else if (typeof s === 'string' && s) {
          const base = await ensureShotInFolder(copy.id, s);
          if (base) { shotOut.push(base); shotsRef.add(gid + '/' + base); }
        }
      }
      copy.shots = shotOut;

      out.push(copy);
    }
    await writeGames(out);
    await cleanupCovers(referenced);
    await cleanupShots(shotsRef);
    return out;
  }


  return { readSettings, writeSettings, readGames, persistGames, readCharacters, persistCharacters, readArts, persistArts, writeCoverFromDataUrl, writeShotFromDataUrl, safeId, walkShotFiles };
}

module.exports = { createCollectionStore };
