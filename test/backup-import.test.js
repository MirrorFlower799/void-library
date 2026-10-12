'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { makeZip } = require('../app/lib/zip');
const { parseBackup, mergeById, mergeLibrary, applyBackup } = require('../app/lib/backup-import');
const { createCollectionStore } = require('../app/lib/collection-store');
const { createLibraryStore } = require('../app/lib/library-store');
const { registerIpc } = require('../app/lib/ipc');

async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'collection-import-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const paths = { DATA_DIR: root };
  for (const [key, name] of Object.entries({ DATA_FILE: 'data.json', CHARS_FILE: 'characters.json', ARTS_FILE: 'arts.json', LIB_FILE: 'library.json', SETTINGS_FILE: 'settings.json', COVERS_DIR: 'covers', SHOTS_DIR: 'shots', CHARS_DIR: 'chars', ARTCOVERS_DIR: 'artcovers', BOOKCOVERS_DIR: 'bookcovers', BOOKS_DIR: 'books' })) {
    paths[key] = path.join(root, name);
    if (key.endsWith('_DIR')) await fs.mkdir(paths[key]);
  }
  return { root, paths, collections: createCollectionStore(paths), library: createLibraryStore(paths) };
}

function zipArchive() {
  const data = [
    { id: 'existing', name: '原有游戏-备份版本', scrapeName: 'Original', cover: 'clash.png', shots: [] },
    { id: 'new', name: '新增游戏', scrapeName: 'New Name', cover: 'clash.png', shots: ['shot.png'] }
  ];
  return makeZip([
    { name: 'data.json', data: Buffer.from(JSON.stringify(data)) },
    { name: 'covers/clash.png', data: Buffer.from('IMPORTED COVER') },
    { name: 'shots/new/shot.png', data: Buffer.from('IMPORTED SCREENSHOT') },
    { name: 'characters.json', data: Buffer.from(JSON.stringify([{ id: 'char1', name: '新角色', image: '' }])) },
    { name: 'library.json', data: Buffer.from(JSON.stringify({ shelves: [{ id: 1, name: '外来书架', parentId: 0 }], books: [{ id: 'book1', title: '外来书籍', shelfId: 1, path: 'books/b_1/book.epub' }] })) }
  ]);
}

test('import merge helpers keep old ids and remap conflicting shelves without discarding existing books', () => {
  const games = mergeById([{ id: '1', name: 'keep' }], [{ id: '1', name: 'skip' }, { id: '2', name: 'add' }]);
  assert.deepEqual(games.list.map(v => v.name), ['keep', 'add']);
  const lib = mergeLibrary({ shelves: [{ id: 1, name: 'old' }], books: [{ id: 'b0', shelfId: 1 }] }, {
    shelves: [{ id: 1, name: 'new' }], books: [{ id: 'b1', shelfId: 1 }, { id: 'b0', shelfId: 1 }]
  });
  assert.notEqual(lib.shelves[1].id, 1);
  assert.equal(lib.books[1].shelfId, lib.shelves[1].id);
  assert.equal(lib.books.length, 2);
});

test('two-phase ZIP import previews without writes; merge keeps original media and records', async t => {
  const { root, paths, collections, library } = await setup(t);
  const archive = path.join(root, 'upload.zip');
  await fs.writeFile(archive, zipArchive());
  await fs.writeFile(path.join(paths.COVERS_DIR, 'clash.png'), 'ORIGINAL COVER');
  await collections.persistGames([{ id: 'existing', name: '原有游戏', cover: 'clash.png', shots: [], scrapeName: 'keep-me' }]);
  await library.persistLibrary({ shelves: [{ id: 1, name: '旧书架' }], books: [{ id: 'book0', title: '已有书籍', path: 'books/b_0/book.pdf', shelfId: 1 }] });
  const handlers = new Map();
  registerIpc({
    app: { getPath: () => root }, BrowserWindow: { getFocusedWindow: () => null },
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    dialog: { showOpenDialog: async () => ({ filePaths: [archive] }) }, shell: {}
  }, paths, collections, library, {});
  const invoke = (name, payload) => handlers.get(name)(null, payload);
  const preview = await invoke('data:import-preview');
  assert.equal(preview.ok, true);
  assert.deepEqual(preview.counts, { games: 2, characters: 1, books: 1, shelves: 1 });
  assert.equal(await fs.readFile(path.join(paths.COVERS_DIR, 'clash.png'), 'utf8'), 'ORIGINAL COVER');
  assert.equal((await collections.readGames()).length, 1);
  assert.equal((await invoke('data:import-apply', { token: 'bad', mode: 'merge' })).ok, false);
  const added = await invoke('data:import-apply', { token: preview.token, mode: 'merge' });
  assert.equal(added.ok, true, added.error);
  assert.equal(added.added, 1);
  assert.equal(added.skipped, 1);
  const games = await collections.readGames();
  assert.equal(games.length, 2);
  assert.equal(games[0].name, '原有游戏');
  assert.equal(games[0].scrapeName, 'keep-me');
  assert.equal(await fs.readFile(path.join(paths.COVERS_DIR, 'clash.png'), 'utf8'), 'ORIGINAL COVER');
  assert.equal(await fs.readFile(path.join(paths.COVERS_DIR, games[1].cover), 'utf8'), 'IMPORTED COVER');
  assert.equal(await fs.readFile(path.join(paths.SHOTS_DIR, 'new', games[1].shots[0]), 'utf8'), 'IMPORTED SCREENSHOT');
  const lib = await library.readLibrary();
  assert.equal(lib.books.length, 2);
  assert.equal(lib.shelves.length, 2);
  assert.notEqual(lib.books[1].shelfId, 1);
  assert.equal((await collections.readCharacters()).length, 1);
  const twice = await invoke('data:import-apply', { token: preview.token, mode: 'merge' });
  assert.equal(twice.ok, false);
});

test('replace mode replaces records only after confirmation, and JSON backups remain supported', async t => {
  const { root, paths, collections, library } = await setup(t);
  const source = path.join(root, 'upload.json');
  await fs.writeFile(source, JSON.stringify({ games: [{ id: 'new', name: 'replace me', scrapeName: 'Japanese original', cover: '' }] }));
  await collections.persistGames([{ id: 'old', name: 'old', cover: '' }]);
  const parsed = parseBackup(source, await fs.readFile(source));
  assert.equal(parsed.format, 'json');
  assert.equal((await collections.readGames())[0].name, 'old');
  await applyBackup(parsed, 'replace', { collections, library }, paths);
  const result = await collections.readGames();
  assert.equal(result.length, 1);
  assert.equal(result[0].scrapeName, 'Japanese original');
  assert.equal(result[0].name, 'replace me');
});
