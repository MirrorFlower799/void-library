'use strict';

const fs = require('node:fs');
const path = require('node:path');

/* 选择可写的数据目录：优先 exe 所在目录，失败则退回用户数据目录 */
function resolveDataDir(app) {
  const candidates = [];
  if (process.env.PORTABLE_EXECUTABLE_DIR) candidates.push(process.env.PORTABLE_EXECUTABLE_DIR);
  if (app.isPackaged) candidates.push(path.dirname(process.execPath));
  candidates.push(app.getPath('userData'));

  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, '.write-probe');
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
      return dir;
    } catch (e) { /* 尝试下一个 */ }
  }
  return app.getPath('userData');
}

function initPaths(app) {
  const DATA_DIR = resolveDataDir(app);
  const DATA_FILE = path.join(DATA_DIR, 'data.json');
  const COVERS_DIR = path.join(DATA_DIR, 'covers');
  const SHOTS_DIR = path.join(DATA_DIR, 'shots');
  const CHARS_DIR = path.join(DATA_DIR, 'chars');
  const CHARS_FILE = path.join(DATA_DIR, 'characters.json');
  const ARTS_FILE = path.join(DATA_DIR, 'arts.json');
  const ARTCOVERS_DIR = path.join(DATA_DIR, 'artcovers');
  const LIB_FILE = path.join(DATA_DIR, 'library.json');
  const BOOKCOVERS_DIR = path.join(DATA_DIR, 'bookcovers');
  const BOOKS_DIR = path.join(DATA_DIR, 'books');
  const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
  try { fs.mkdirSync(BOOKS_DIR, { recursive: true }); } catch (e) { /* ignore */ }
  try { fs.mkdirSync(COVERS_DIR, { recursive: true }); } catch (e) { /* ignore */ }
  try { fs.mkdirSync(SHOTS_DIR, { recursive: true }); } catch (e) { /* ignore */ }
  try { fs.mkdirSync(CHARS_DIR, { recursive: true }); } catch (e) { /* ignore */ }
  try { fs.mkdirSync(ARTCOVERS_DIR, { recursive: true }); } catch (e) { /* ignore */ }
  try { fs.mkdirSync(BOOKCOVERS_DIR, { recursive: true }); } catch (e) { /* ignore */ }
  return { DATA_DIR, DATA_FILE, COVERS_DIR, SHOTS_DIR, CHARS_DIR, CHARS_FILE, ARTS_FILE, ARTCOVERS_DIR, LIB_FILE, BOOKCOVERS_DIR, BOOKS_DIR, SETTINGS_FILE };
}

module.exports = { initPaths };
