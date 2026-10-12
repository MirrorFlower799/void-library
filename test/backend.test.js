'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { createCollectionStore } = require('../app/lib/collection-store');
const { createLibraryStore } = require('../app/lib/library-store');
const { createScrapers } = require('../app/lib/scrapers');
const { writeImage, readImage, importImages } = require('../app/lib/image-store');
const { browseArt, extractArtCover, imageListPages } = require('../app/lib/art-reader');
const { makeZip, readZip } = require('../app/lib/zip');
const { b64u, unb64u } = require('../app/lib/media');
const { registerIpc } = require('../app/lib/ipc');
const { registerProtocols } = require('../app/lib/protocols');

const png = 'data:image/png;base64,aGVsbG8=';
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'void-library-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert(path.basename(root).startsWith('void-library-test-'));
    return fs.rm(root, { recursive: true, force: true });
  });
  const paths = { DATA_DIR: root };
  for (const [key, name] of Object.entries({ DATA_FILE: 'data.json', CHARS_FILE: 'characters.json', ARTS_FILE: 'arts.json', LIB_FILE: 'library.json', SETTINGS_FILE: 'settings.json', COVERS_DIR: 'covers', SHOTS_DIR: 'shots', CHARS_DIR: 'chars', ARTCOVERS_DIR: 'artcovers', BOOKCOVERS_DIR: 'bookcovers', BOOKS_DIR: 'books' })) {
    paths[key] = path.join(root, name);
    if (key.endsWith('_DIR')) await fs.mkdir(paths[key]);
  }
  return { paths, collections: createCollectionStore(paths), library: createLibraryStore(paths) };
}

test('collection save preserves records, image bytes and screenshot ownership', async t => {
  const { paths, collections } = await fixture(t);
  const input = [{ id: 'g1', name: '游戏', custom: { keep: true }, cover: png, shots: [png] }];
  const saved = await collections.persistGames(input);
  assert.equal(input[0].cover, png);
  assert.deepEqual(saved[0].custom, { keep: true });
  assert.equal(await readImage(paths.COVERS_DIR, saved[0].cover), png);
  assert.equal(await readImage(path.join(paths.SHOTS_DIR, 'g1'), saved[0].shots[0]), png);
  assert.deepEqual(await collections.readGames(), saved);
  await collections.persistGames([]);
  assert.deepEqual(await fs.readdir(paths.COVERS_DIR), []);
  assert.deepEqual(await fs.readdir(paths.SHOTS_DIR), []);
});

test('legacy wrapped records and flat screenshots migrate without losing bytes', async t => {
  const { paths, collections } = await fixture(t);
  await fs.writeFile(path.join(paths.SHOTS_DIR, 'old.jpg'), 'old');
  await fs.writeFile(paths.DATA_FILE, JSON.stringify({ games: [{ id: 'old', name: '旧记录', cover: png, shots: ['old.jpg'] }] }));
  const records = await collections.readGames();
  assert.equal(await readImage(paths.COVERS_DIR, records[0].cover), png);
  assert.equal(await fs.readFile(path.join(paths.SHOTS_DIR, 'old', 'old.jpg'), 'utf8'), 'old');
  assert.deepEqual(JSON.parse(await fs.readFile(paths.DATA_FILE)), records);
});

test('character gallery, arts, settings and empty data retain their contracts', async t => {
  const { paths, collections, library } = await fixture(t);
  assert.equal(await collections.readGames(), null);
  assert.equal(await collections.readCharacters(), null);
  assert.deepEqual(await library.readLibrary(), { shelves: [], books: [] });
  const chars = await collections.persistCharacters([{ id: 'c1', name: '角色', image: png, shots: [png] }]);
  assert.deepEqual(await collections.readCharacters(), chars);
  assert.equal(await readImage(paths.CHARS_DIR, chars[0].shots[0]), png);
  const arts = await collections.persistArts([{ id: 'a1', name: '资料', path: 'keep.epub', cover: png }]);
  assert.deepEqual(await collections.readArts(), arts);
  await collections.writeSettings({ tmdbKey: 'test', custom: 'keep' });
  assert.deepEqual(await collections.readSettings(), { tmdbKey: 'test', custom: 'keep' });
});

test('folder import preserves supported extensions, skips directories and bad files', async t => {
  const { paths } = await fixture(t);
  const source = path.join(paths.DATA_DIR, 'source');
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'a.PNG'), 'one');
  await fs.writeFile(path.join(source, 'b.webp'), 'two');
  await fs.writeFile(path.join(source, 'ignored.avif'), 'three');
  await fs.mkdir(path.join(source, 'directory.jpg'));
  const result = await importImages(source, paths.CHARS_DIR, 'char');
  assert.equal(result.count, 2);
  assert.deepEqual((await Promise.all(result.shots.map(n => fs.readFile(path.join(paths.CHARS_DIR, n), 'utf8')))).sort(), ['one', 'two']);
  assert(result.shots.every(n => /^char_.*\.(png|webp)$/.test(n)));
  assert.deepEqual(await importImages(path.join(source, 'missing'), paths.CHARS_DIR, 'char'), { ok: false, error: '无法读取文件夹' });
  assert.equal(await writeImage(paths.COVERS_DIR, 'cover', 'invalid'), null);
});

test('library imports nested folders, copies content and reports progress', async t => {
  const { paths, library } = await fixture(t);
  const source = path.join(paths.DATA_DIR, 'source');
  await fs.mkdir(path.join(source, '子系列'), { recursive: true });
  await fs.writeFile(path.join(source, '子系列', '书.txt'), '正文');
  await fs.writeFile(path.join(source, 'ignored.xyz'), 'skip');
  const progress = [];
  const result = await library.importBooks(0, [source], true, p => progress.push(p));
  assert.equal(result.report.shelves, 2);
  assert.equal(result.report.books, 1);
  assert.equal(result.report.skipped.length, 1);
  assert.equal(await fs.readFile(library.resolveBookPath(result.library.books[0].path), 'utf8'), '正文');
  assert(result.library.books[0].path.startsWith('books/'));
  assert.equal(path.isAbsolute(result.library.books[0].path), false);
  assert.equal(progress.at(-1).finished, true);
  assert.deepEqual(await library.readLibrary(), result.library);
});

test('comic import extracts images in natural order and persists the cover', async t => {
  const { paths, library } = await fixture(t);
  const archive = path.join(paths.DATA_DIR, '漫画.cbz');
  await fs.writeFile(archive, makeZip([{ name: '10.png', data: Buffer.from('ten') }, { name: '2.png', data: Buffer.from('two') }]));
  const { library: saved } = await library.importBooks(0, [archive], true);
  const book = saved.books[0];
  assert.equal(book.type, 'folder');
  const files = await fs.readdir(library.resolveBookPath(book.path));
  assert.deepEqual(files, ['0000_2.png', '0001_10.png']);
  assert.equal(await readImage(paths.BOOKCOVERS_DIR, book.cover), 'data:image/png;base64,dHdv');
});

test('art browsing, cover extraction and image lists retain natural ordering', async t => {
  const { paths } = await fixture(t);
  await fs.writeFile(path.join(paths.COVERS_DIR, '10.png'), 'ten');
  await fs.writeFile(path.join(paths.COVERS_DIR, '2.png'), 'two');
  const result = await browseArt(paths.COVERS_DIR);
  assert.equal(result.kind, 'pages');
  assert(result.pages[0].endsWith(b64u(path.join(paths.COVERS_DIR, '2.png'))));
  assert.equal(await extractArtCover(paths.COVERS_DIR), 'data:image/png;base64,dHdv');
  const list = path.join(paths.DATA_DIR, 'pages.txt');
  await fs.writeFile(list, 'covers/2.png\ncovers/10.png\nmissing.png');
  assert.equal((await imageListPages(list)).length, 2);
  assert.equal(unb64u(b64u('C:/中文/封面.png')), 'C:/中文/封面.png');
});

test('scraper settings and search results pass through the injected network seam', async () => {
  const calls = [];
  const scrapers = createScrapers({
    readSettings: async () => ({ steamgriddbKey: ' key ' }),
    fetch: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ data: [{ id: 42, name: '游戏', release_date: 1242950400 }] }) };
    }
  });
  assert.deepEqual(await scrapers.scrapeSearch({ term: ' 游戏 ' }), [{ source: 'steamgriddb', id: 42, name: '游戏', year: '2009' }]);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer key');
  assert(calls[0].url.endsWith(encodeURIComponent('游戏')));
  await assert.rejects(scrapers.scrapeSearch({ term: '' }), /搜索名称为空/);
});

test('translation fallback and image download preserve result shape', async () => {
  let calls = 0;
  const scrapers = createScrapers({ readSettings: async () => ({}), fetch: async () => {
    if (++calls === 1) throw Error('offline');
    return { json: async () => ({ responseData: { translatedText: ' translated ' } }) };
  } });
  assert.deepEqual(await scrapers.translateText({ text: '原文' }), { ok: true, text: 'translated' });
  const imageScraper = createScrapers({ readSettings: async () => ({}), fetch: async () => new Response(Buffer.from('hello'), { headers: { 'content-type': 'image/png' } }) });
  assert.deepEqual(await imageScraper.downloadImage({ url: 'https://example.test/a.png' }), { ok: true, dataUrl: png });
});

test('all preload invoke channels exist and backup export/import round-trips', async t => {
  const { paths, collections, library } = await fixture(t);
  const handlers = new Map();
  const backup = path.join(paths.DATA_DIR, 'backup.zip');
  const electron = {
    app: { getPath: () => paths.DATA_DIR },
    BrowserWindow: { getFocusedWindow: () => null },
    ipcMain: { handle: (channel, fn) => { assert(!handlers.has(channel)); handlers.set(channel, fn); } },
    dialog: { showSaveDialog: async () => ({ filePath: backup }), showOpenDialog: async () => ({ filePaths: [backup] }) },
    shell: {}
  };
  registerIpc(electron, paths, collections, library, createScrapers({ readSettings: collections.readSettings }));
  let bridge;
  vm.runInNewContext(await fs.readFile(path.join(__dirname, '../app/preload.js'), 'utf8'), { require: () => ({
    contextBridge: { exposeInMainWorld: (name, api) => { assert.equal(name, 'voidLibrary'); bridge = api; } },
    ipcRenderer: { invoke: channel => assert(handlers.has(channel), channel), on: () => {} }
  }) });
  Object.values(bridge).forEach(fn => fn(() => {}));
  const invoke = (channel, payload) => handlers.get(channel)(null, payload);
  await invoke('data:save', [{ id: 'g1', name: '收藏', cover: png, shots: [png] }]);
  await invoke('characters:save', [{ id: 'c1', name: '角色', image: png, shots: [] }]);
  await invoke('lib:save', { shelves: [{ id: 1, name: '书架' }], books: [] });
  assert.equal((await invoke('data:export')).ok, true);
  const entries = readZip(await fs.readFile(backup));
  assert(entries['data.json'] && entries['characters.json'] && entries['library.json']);
  const imported = await invoke('data:import');
  assert.equal(imported.ok, true);
  assert.equal(imported.games[0].name, '收藏');
  assert.equal(imported.characters[0].name, '角色');
  assert.equal(imported.library.shelves[0].name, '书架');
  await assert.rejects(invoke('data:save', {}), /invalid payload/);
});

test('custom protocols serve local image bytes and archive entries', async t => {
  const { paths } = await fixture(t);
  const handlers = new Map();
  registerProtocols({ protocol: { handle: (name, fn) => handlers.set(name, fn) }, net: { fetch: async url => new Response(await fs.readFile(require('node:url').fileURLToPath(url))) } }, paths);
  const name = await writeImage(paths.COVERS_DIR, 'cover', png);
  assert.equal(await (await handlers.get('cover')({ url: 'cover://c/' + name })).text(), 'hello');
  const archive = path.join(paths.DATA_DIR, 'pages.zip');
  await fs.writeFile(archive, makeZip([{ name: '图片.png', data: Buffer.from('page') }]));
  const result = await handlers.get('media')({ url: 'media://zip/' + b64u(archive) + '/' + b64u('图片.png') });
  assert.equal(await result.text(), 'page');
  assert.equal(result.headers.get('content-type'), 'image/png');
});

test('main entry assembles modules and opens the original isolated window', async t => {
  const { paths } = await fixture(t);
  const entry = path.resolve(__dirname, '../app/main.js');
  const realRequire = createRequire(entry);
  const windows = [];
  let ready;
  class BrowserWindow {
    constructor(options) { this.options = options; windows.push(this); }
    loadFile(file) { this.file = file; }
    static getAllWindows() { return windows; }
  }
  const electron = {
    BrowserWindow,
    app: { whenReady: () => ({ then: fn => { ready = Promise.resolve().then(fn); } }), on: () => {} },
    protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
    ipcMain: { handle: () => {} }, net: {}, dialog: {}, shell: {}
  };
  vm.runInNewContext(await fs.readFile(entry, 'utf8'), {
    __dirname: path.dirname(entry), process,
    require: name => name === 'electron' ? electron : name === './lib/paths' ? { initPaths: () => paths } : realRequire(name)
  });
  await ready;
  assert.equal(windows.length, 1);
  assert.equal(windows[0].options.webPreferences.contextIsolation, true);
  assert.equal(windows[0].options.webPreferences.nodeIntegration, false);
  assert.equal(windows[0].file, path.join(path.dirname(entry), 'src', 'index.html'));
});

test('relative book paths survive relocating data folder and old absolute paths are repaired', async t => {
  const { paths, library } = await fixture(t);
  const origin = path.join(paths.DATA_DIR, 'test.epub');
  await fs.writeFile(origin, 'content');
  const first = await library.importBooks(0, [origin], true);
  const relative = first.library.books[0].path;
  assert.match(relative, /^books\//);
  const resolved = library.resolveBookPath(relative);
  assert.equal(await fs.readFile(resolved, 'utf8'), 'content');
  const stale = path.join('/old-portable-location', relative);
  assert.equal(library.resolveBookPath(stale), resolved);
});
