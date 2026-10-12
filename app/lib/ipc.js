'use strict';

const path = require('node:path');
const fs = require('node:fs');
const fsp = fs.promises;
const { makeZip, readZip } = require('./zip');
const { b64u } = require('./media');
const { ensureBookServerReady, bookMime } = require('./book-server');
const { extractArtCover, imageListPages, browseArt } = require('./art-reader');
const { importImages } = require('./image-store');
const crypto = require('node:crypto');
const { parseBackup, applyBackup } = require('./backup-import');

function pad(n) { return String(n).padStart(2, '0'); }
function dateStr() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function registerIpc({ app, BrowserWindow, ipcMain, dialog, shell }, paths, collections, library, scrapers) {
  const { DATA_DIR, DATA_FILE, COVERS_DIR, SHOTS_DIR, CHARS_DIR, CHARS_FILE, ARTS_FILE, ARTCOVERS_DIR, LIB_FILE, BOOKCOVERS_DIR, BOOKS_DIR, SETTINGS_FILE } = paths;
  const { readSettings, writeSettings, readGames, persistGames, readCharacters, persistCharacters, readArts, persistArts, writeCoverFromDataUrl, writeShotFromDataUrl, safeId, walkShotFiles } = collections;
  const { readLibrary, persistLibrary, importBooks, resolveBookPath } = library;
  const bookPath = p => resolveBookPath(String(p || ''));
  const { translateText, scrapeSearch, scrapeAssets, downloadImage, searchWorks, fetchWorkCharacters, searchCharacterImages } = scrapers;
  ipcMain.handle('data:load', async () => {
    const games = await readGames();
    return { dataDir: DATA_DIR, games };
  });

  ipcMain.handle('data:save', async (_e, games) => {
    if (!Array.isArray(games)) throw new Error('invalid payload');
    return persistGames(games);
  });

  ipcMain.handle('data:export', async () => {
    const games = (await readGames()) || [];
    const chars = (await readCharacters()) || [];
    const libChk = await readLibrary();
    if (games.length === 0 && chars.length === 0 && libChk.books.length === 0 && libChk.shelves.length === 0) {
      return { ok: false, empty: true };
    }
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: '导出备份（压缩包）',
      defaultPath: path.join(app.getPath('documents'), '虚空图书馆备份-' + dateStr() + '.zip'),
      filters: [{ name: '压缩包', extensions: ['zip'] }]
    });
    if (canceled || !filePath) return { ok: false, canceled: true };

    const files = [{ name: 'data.json', data: Buffer.from(JSON.stringify(games), 'utf8') }];
    const added = new Set();
    for (const g of games) {
      if (g && typeof g.cover === 'string' && g.cover && !g.cover.startsWith('data:')) {
        const base = path.basename(g.cover);
        const key = 'covers/' + base;
        if (base && !added.has(key)) {
          added.add(key);
          try {
            files.push({ name: key, data: await fsp.readFile(path.join(COVERS_DIR, base)), store: true });
          } catch (e) { /* 封面文件缺失则跳过 */ }
        }
      }
      if (g && Array.isArray(g.shots)) {
        const gid = safeId(g.id);
        for (const s of g.shots) {
          if (typeof s !== 'string' || !s || s.startsWith('data:')) continue;
          const base = path.basename(s);
          const rel = gid + '/' + base;
          const key = 'shots/' + rel;
          if (base && !added.has(key)) {
            added.add(key);
            try {
              files.push({ name: key, data: await fsp.readFile(path.join(SHOTS_DIR, rel)), store: true });
            } catch (e) { /* 截图文件缺失则跳过 */ }
          }
        }
      }
    }

    /* 角色卡片 */
    if (chars.length) {
      files.push({ name: 'characters.json', data: Buffer.from(JSON.stringify(chars), 'utf8') });
      const pushCharFile = async (img) => {
        if (typeof img !== 'string' || !img || img.startsWith('data:')) return;
        const base = path.basename(img);
        const key = 'chars/' + base;
        if (base && !added.has(key)) {
          added.add(key);
          try {
            files.push({ name: key, data: await fsp.readFile(path.join(CHARS_DIR, base)), store: true });
          } catch (e) { /* 角色图片缺失则跳过 */ }
        }
      };
      for (const c of chars) {
        await pushCharFile(c && c.image);
        if (c && Array.isArray(c.shots)) {
          for (const s of c.shots) await pushCharFile(s);
        }
      }
    }

    /* 书海书架 */
    const libData = await readLibrary();
    if (libData.books.length || libData.shelves.length) {
      files.push({ name: 'library.json', data: Buffer.from(JSON.stringify(libData), 'utf8') });
      for (const b of libData.books) {
        if (b && typeof b.cover === 'string' && b.cover && !b.cover.startsWith('data:')) {
          const base = path.basename(b.cover);
          const key = 'bookcovers/' + base;
          if (base && !added.has(key)) {
            added.add(key);
            try {
              files.push({ name: key, data: await fsp.readFile(path.join(BOOKCOVERS_DIR, base)), store: true });
            } catch (e) { /* 封面缺失则跳过 */ }
          }
        }
      }
    }

    let zip;
    try {
      zip = makeZip(files);
    } catch (e) {
      return { ok: false, error: '打包失败：' + ((e && e.message) || '未知错误') };
    }
    await fsp.writeFile(filePath, zip);
    return { ok: true, count: games.length, filePath, files: files.length };
  });

  // Two-phase archive import: preview never writes files. Apply requires the generated one-time token.
  let pendingImport = null;
  ipcMain.handle('data:import-preview', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: '选择要导入的收藏备份', properties: ['openFile'],
      filters: [{ name: '备份文件（ZIP / JSON）', extensions: ['zip', 'json'] }]
    });
    if (canceled || !filePaths || !filePaths.length) return { ok: false, canceled: true };
    try {
      const file = filePaths[0];
      const parsed = parseBackup(file, await fsp.readFile(file));
      const token = crypto.randomUUID();
      pendingImport = { token, parsed, created: Date.now() };
      return { ok: true, token, format: parsed.format, name: path.basename(file),
        counts: { games: parsed.games.length, characters: parsed.characters ? parsed.characters.length : 0,
          books: parsed.library ? parsed.library.books.length : 0, shelves: parsed.library ? parsed.library.shelves.length : 0 } };
    } catch (e) {
      pendingImport = null;
      return { ok: false, error: e.message || '备份无法读取' };
    }
  });
  ipcMain.handle('data:import-apply', async (_event, payload) => {
    const { token, mode } = payload || {};
    if (!pendingImport || pendingImport.token !== token || Date.now() - pendingImport.created > 10 * 60 * 1000)
      return { ok: false, error: '导入已过期，请重新选择压缩包' };
    if (mode !== 'merge' && mode !== 'replace') return { ok: false, error: '请选择导入方式' };
    const prepared = pendingImport.parsed;
    pendingImport = null;
    try {
      return await applyBackup(prepared, mode, { collections, library }, paths);
    } catch (e) {
      return { ok: false, error: e.message || '写入失败' };
    }
  });

  ipcMain.handle('data:import', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: '导入备份',
      properties: ['openFile'],
      filters: [{ name: '备份文件（压缩包 / JSON）', extensions: ['zip', 'json'] }]
    });
    if (canceled || !filePaths || !filePaths.length) return { ok: false, canceled: true };

    const filePath = filePaths[0];
    const ext = path.extname(filePath).toLowerCase();

    /* 压缩包：data.json + covers/ + shots/ */
    if (ext === '.zip') {
      let entries;
      try {
        entries = readZip(await fsp.readFile(filePath));
      } catch (e) {
        return { ok: false, error: '无法读取压缩包：' + ((e && e.message) || '未知错误') };
      }
      const dataEntry = entries['data.json'] || entries['./data.json'];
      if (!dataEntry) return { ok: false, error: '压缩包中缺少 data.json' };

      let parsed;
      try {
        parsed = JSON.parse(dataEntry.toString('utf8'));
      } catch (e) {
        return { ok: false, error: 'data.json 解析失败' };
      }
      const arr = Array.isArray(parsed) ? parsed
        : (parsed && Array.isArray(parsed.games)) ? parsed.games : null;
      if (!arr) return { ok: false, error: '数据格式不正确' };
      if (!arr.every((d) => d && typeof d.name === 'string')) {
        return { ok: false, error: '数据缺少必要字段' };
      }

      await fsp.mkdir(COVERS_DIR, { recursive: true });
      await fsp.mkdir(SHOTS_DIR, { recursive: true });
      await fsp.mkdir(CHARS_DIR, { recursive: true });
      await fsp.mkdir(ARTCOVERS_DIR, { recursive: true });
      for (const name of Object.keys(entries)) {
        if (name.indexOf('covers/') === 0) {
          const base = path.basename(name);
          if (base) await fsp.writeFile(path.join(COVERS_DIR, base), entries[name]);
        } else if (name.indexOf('shots/') === 0) {
          const rel = name.slice('shots/'.length);
          const parts = rel.split('/').filter(function (p) { return p && p !== '.' && p !== '..'; });
          if (parts.length) {
            const dir = path.join.apply(path, [SHOTS_DIR].concat(parts.slice(0, -1)));
            await fsp.mkdir(dir, { recursive: true });
            await fsp.writeFile(path.join.apply(path, [SHOTS_DIR].concat(parts)), entries[name]);
          }
        } else if (name.indexOf('chars/') === 0) {
          const base = path.basename(name);
          if (base) await fsp.writeFile(path.join(CHARS_DIR, base), entries[name]);
        } else if (name.indexOf('artcovers/') === 0) {
          const base = path.basename(name);
          if (base) await fsp.writeFile(path.join(ARTCOVERS_DIR, base), entries[name]);
        } else if (name.indexOf('bookcovers/') === 0) {
          const base = path.basename(name);
          if (base) await fsp.writeFile(path.join(BOOKCOVERS_DIR, base), entries[name]);
        }
      }

      let characters = null;
      const charEntry = entries['characters.json'] || entries['./characters.json'];
      if (charEntry) {
        try {
          const cp = JSON.parse(charEntry.toString('utf8'));
          const carr = Array.isArray(cp) ? cp : (cp && Array.isArray(cp.characters)) ? cp.characters : null;
          if (carr && carr.every((c) => c && typeof c.name === 'string')) characters = carr;
        } catch (e) { /* 忽略角色数据损坏 */ }
      }

      let library = null;
      const libEntry = entries['library.json'] || entries['./library.json'];
      if (libEntry) {
        try {
          const lp = JSON.parse(libEntry.toString('utf8'));
          if (lp && Array.isArray(lp.shelves) && Array.isArray(lp.books)) library = lp;
        } catch (e) { /* 忽略书架数据损坏 */ }
      }

      await fsp.mkdir(ARTCOVERS_DIR, { recursive: true });
      await fsp.mkdir(BOOKCOVERS_DIR, { recursive: true });
      return { ok: true, games: arr, characters: characters, library: library, count: arr.length, format: 'zip' };
    }

    /* 兼容旧的 JSON 备份（封面/截图为 base64，落盘为文件） */
    let data;
    try {
      data = JSON.parse(await fsp.readFile(filePath, 'utf8'));
    } catch (e) {
      return { ok: false, error: '不是有效的 JSON 文件' };
    }
    const arr = Array.isArray(data) ? data
      : (data && Array.isArray(data.games)) ? data.games : null;
    if (!arr) return { ok: false, error: '数据格式不正确' };
    if (!arr.every((d) => d && typeof d.name === 'string')) {
      return { ok: false, error: '数据缺少必要字段' };
    }

    const out = [];
    for (const d of arr) {
      const copy = Object.assign({}, d);
      if (typeof copy.cover === 'string' && copy.cover.startsWith('data:')) {
        copy.cover = (await writeCoverFromDataUrl(copy.cover)) || '';
      }
      if (Array.isArray(copy.shots)) {
        const shotOut = [];
        for (const s of copy.shots) {
          if (typeof s === 'string' && s.startsWith('data:')) {
            const n = await writeShotFromDataUrl(s);
            if (n) shotOut.push(n);
          } else if (typeof s === 'string' && s) {
            shotOut.push(s);
          }
        }
        copy.shots = shotOut;
      }
      out.push(copy);
    }
    return { ok: true, games: out, count: out.length, format: 'json' };
  });

  ipcMain.handle('data:dir', async () => DATA_DIR);

  ipcMain.handle('characters:load', async () => {
    return { dir: CHARS_DIR, characters: await readCharacters() };
  });
  ipcMain.handle('characters:save', async (_e, list) => {
    if (!Array.isArray(list)) throw new Error('invalid payload');
    return persistCharacters(list);
  });

  ipcMain.handle('arts:load', async () => {
    return { dir: ARTCOVERS_DIR, arts: await readArts() };
  });
  ipcMain.handle('arts:save', async (_e, list) => {
    if (!Array.isArray(list)) throw new Error('invalid payload');
    return persistArts(list);
  });
  ipcMain.handle('art:open', async (_e, p) => {
    const target = bookPath(p);
    if (!target) return { ok: false, error: '路径为空' };
    try {
      const err = await shell.openPath(target);
      return err ? { ok: false, error: err } : { ok: true };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? e.message : String(e) };
    }
  });
  ipcMain.handle('art:reveal', async (_e, p) => {
    const target = bookPath(p);
    if (!target) return { ok: false, error: '路径为空' };
    try {
      let isDir = false;
      try { isDir = (await fsp.stat(target)).isDirectory(); } catch (e) { isDir = false; }
      if (isDir) { await shell.openPath(target); }
      else { shell.showItemInFolder(target); }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? e.message : String(e) };
    }
  });
  ipcMain.handle('art:pick-file', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: '选择文件（PDF / EPUB / 压缩包 等）',
      properties: ['openFile']
    });
    if (canceled || !filePaths || !filePaths.length) return { ok: false, canceled: true };
    const p = filePaths[0];
    return { ok: true, path: p, name: path.basename(p, path.extname(p)), ext: path.extname(p).slice(1).toLowerCase() };
  });
  ipcMain.handle('art:pick-folder', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: '选择文件夹',
      properties: ['openDirectory']
    });
    if (canceled || !filePaths || !filePaths.length) return { ok: false, canceled: true };
    const p = filePaths[0];
    return { ok: true, path: p, name: path.basename(p), ext: 'folder' };
  });

  ipcMain.handle('art:browse', async (_e, p) => {
    const target = bookPath(p);
    if (!target) return { ok: false, error: '路径为空' };
    try { return await browseArt(target); }
    catch (e) { return { ok: false, error: (e && e.message) ? e.message : String(e) }; }
  });

  ipcMain.handle('art:cover', async (_e, p) => {
    const target = String(p || '');
    if (!target) return { ok: false, error: '路径为空' };
    try { return { ok: true, cover: await extractArtCover(target) }; }
    catch (e) { return { ok: false, error: (e && e.message) ? e.message : String(e) }; }
  });

  ipcMain.handle('lib:load', async () => {
    return { library: await readLibrary(), dir: BOOKCOVERS_DIR };
  });
  ipcMain.handle('lib:save', async (_e, lib) => {
    if (!lib || typeof lib !== 'object') throw new Error('invalid payload');
    return persistLibrary(lib);
  });
  ipcMain.handle('lib:cover', async (_e, payload) => {
    const target = bookPath((payload && payload.path) || '');
    if (!target) return { ok: false, error: '路径为空' };
    try { return { ok: true, cover: await extractArtCover(target) }; }
    catch (e) { return { ok: false, error: (e && e.message) ? e.message : String(e) }; }
  });
  ipcMain.handle('lib:delete-files', async (_e, ids) => {
    const list = Array.isArray(ids) ? ids : [];
    for (const id of list) {
      try { await fsp.rm(path.join(BOOKS_DIR, path.basename(String(id))), { recursive: true, force: true }); } catch (e) { /* */ }
    }
    return { ok: true, count: list.length };
  });
  ipcMain.handle('lib:image-list', async (_e, p) => {
    const target = bookPath(p);
    if (!target) return { ok: false, error: '路径为空' };
    try {
      const imgs = await imageListPages(target);
      return { ok: true, pages: imgs.map(function (x) { return 'media://file/' + b64u(x); }) };
    } catch (e) { return { ok: false, error: (e && e.message) ? e.message : String(e) }; }
  });
  ipcMain.handle('lib:read-text', async (_e, p) => {
    const target = bookPath(p);
    if (!target) return { ok: false, error: '路径为空' };
    try {
      const buf = await fsp.readFile(target);
      return { ok: true, text: buf.toString('utf8') };
    } catch (e) { return { ok: false, error: (e && e.message) ? e.message : String(e) }; }
  });
  ipcMain.handle('lib:import-files', async (_e, shelfId) => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: '导入书籍文件', properties: ['openFile', 'multiSelections']
    });
    if (canceled || !filePaths || !filePaths.length) return { ok: false, canceled: true };
    const onProgress = function (p) { try { if (win && !win.isDestroyed()) win.webContents.send('lib:import-progress', p); } catch (e) { /* */ } };
    const r = await importBooks(shelfId || 0, filePaths, true, onProgress);
    return { ok: true, library: r.library, report: r.report };
  });
  ipcMain.handle('lib:import-folder', async (_e, shelfId) => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: '导入文件夹（子文件夹会成为嵌套系列）', properties: ['openDirectory']
    });
    if (canceled || !filePaths || !filePaths.length) return { ok: false, canceled: true };
    const onProgress = function (p) { try { if (win && !win.isDestroyed()) win.webContents.send('lib:import-progress', p); } catch (e) { /* */ } };
    const r = await importBooks(shelfId || 0, filePaths, true, onProgress);
    return { ok: true, library: r.library, report: r.report };
  });

  ipcMain.handle('book:open', async (_e, p) => {
    const target = bookPath(p);
    if (!target) return { ok: false, error: '路径为空' };
    try { await fsp.access(target); } catch (e) { return { ok: false, error: '文件不存在' }; }
    const bs = await ensureBookServerReady();
    if (!bs.port) return { ok: false, error: '阅读器服务启动失败' };
    const source = bs.open(target);
    const name = path.basename(target);
    const url = 'http://127.0.0.1:' + bs.port + '/viewer.html?src=' + encodeURIComponent(source)
      + '&name=' + encodeURIComponent(name) + '&type=' + encodeURIComponent(bookMime(target));
    return { ok: true, url: url };
  });

  ipcMain.handle('shots:open-folder', async (_e, gameId) => {
    const dir = path.join(SHOTS_DIR, safeId(gameId));
    try { await fsp.mkdir(dir, { recursive: true }); } catch (e) { /* ignore */ }
    try {
      const err = await shell.openPath(dir);
      return err ? { ok: false, error: err } : { ok: true, path: dir };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? e.message : String(e) };
    }
  });

  ipcMain.handle('settings:load', async () => readSettings());
  ipcMain.handle('settings:save', async (_e, s) => {
    await writeSettings(s || {});
    return true;
  });

  ipcMain.handle('translate:text', async (_e, payload) => {
    try { return await translateText(payload); }
    catch (e) { return { ok: false, error: (e && e.message) ? e.message : String(e) }; }
  });

  ipcMain.handle('scrape:search', async (_e, payload) => {
    try { return { ok: true, results: await scrapeSearch(payload) }; }
    catch (e) { return { ok: false, error: (e && e.message) ? e.message : String(e) }; }
  });

  ipcMain.handle('scrape:assets', async (_e, payload) => {
    try { return { ok: true, assets: await scrapeAssets(payload) }; }
    catch (e) { return { ok: false, error: (e && e.message) ? e.message : String(e) }; }
  });

  ipcMain.handle('scrape:download', async (_e, payload) => {
    try { return await downloadImage(payload); }
    catch (e) { return { ok: false, error: (e && e.message) ? e.message : String(e) }; }
  });

  ipcMain.handle('shots:import-folder', async (_e, gameId) => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: '选择截图文件夹',
      properties: ['openDirectory']
    });
    if (canceled || !filePaths || !filePaths.length) return { ok: false, canceled: true };

    return importImages(filePaths[0], gameId ? path.join(SHOTS_DIR, safeId(gameId)) : SHOTS_DIR, 'shot');
  });

  ipcMain.handle('chars:search-works', async (_e, payload) => {
    try { return { ok: true, works: await searchWorks(payload) }; }
    catch (e) { return { ok: false, error: (e && e.message) ? e.message : String(e) }; }
  });

  ipcMain.handle('chars:fetch', async (_e, payload) => {
    try { return Object.assign({ ok: true }, await fetchWorkCharacters(payload)); }
    catch (e) { return { ok: false, error: (e && e.message) ? e.message : String(e) }; }
  });

  ipcMain.handle('open-external', async (_e, url) => {
    const u = String(url || '');
    if (!/^https?:\/\//i.test(u)) return { ok: false, error: '无效链接' };
    try { await shell.openExternal(u); return { ok: true }; }
    catch (e) { return { ok: false, error: (e && e.message) ? e.message : String(e) }; }
  });

  ipcMain.handle('chars:import-folder', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: '选择角色图片文件夹',
      properties: ['openDirectory']
    });
    if (canceled || !filePaths || !filePaths.length) return { ok: false, canceled: true };

    return importImages(filePaths[0], CHARS_DIR, 'char');
  });
}

module.exports = { registerIpc };
