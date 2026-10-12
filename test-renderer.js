const fs = require('fs');
const path = require('path');
const { JSDOM, requestInterceptor } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, 'app', 'src', 'index.html'), 'utf8');
const url = require('url').pathToFileURL(path.join(__dirname, 'app', 'src', 'index.html')).href;

let saved = null;
let settingsSaved = null;
let charsSaved = null;
let artsSaved = null;
const openCalls = [];
const revealCalls = [];
const openShotFolderCalls = [];
const artCoverCalls = [];
const bookOpenCalls = [];
const deletedFileCalls = [];
let libSaved = null;
const libImports = [];
function importLibrary() {
  return {
    shelves: [{ id: 2, name: '导入系列', parentId: 0, order: 1, cover: '' }],
    books: [
      { id: 'b1', title: '导入书A', shelfId: 2, path: 'C:/docs/a.epub', type: 'epub', cover: '', status: '', tags: '' },
      { id: 'b2', title: '导入书B', shelfId: 0, path: 'C:/docs/b.pdf', type: 'pdf', cover: '', status: '', tags: '' },
      { id: 'b3', title: '导入书C', shelfId: 2, path: 'C:/docs/c.txt', type: 'txt', cover: '', status: '已读', tags: '设定集' }
    ]
  };
}
const openExternalCalls = [];
const calls = { translate: [], search: [], assets: [], download: [] };

const api = {
  load: async () => ({ dataDir: 'C:/fake', games: null }),
  save: async (games) => { saved = JSON.parse(JSON.stringify(games)); return saved; },
  exportData: async () => ({ ok: true, count: 0 }),
  importData: async () => ({ ok: false, canceled: true }),
  dataDir: async () => 'C:/fake',
  loadSettings: async () => ({ steamgriddbKey: 'sgdb-key', tmdbKey: 'tmdb-key', bangumiToken: 'bgm-token' }),
  saveSettings: async (s) => { settingsSaved = JSON.parse(JSON.stringify(s)); return true; },
  loadCharacters: async () => ({ characters: [] }),
  saveCharacters: async (list) => { charsSaved = JSON.parse(JSON.stringify(list)); return charsSaved; },
  libLoad: async () => ({ library: { shelves: [], books: [] } }),
  libSave: async (lib) => { libSaved = JSON.parse(JSON.stringify(lib)); return libSaved; },
  libCover: async (p) => { artCoverCalls.push(p); return { ok: true, cover: 'data:image/jpeg;base64,COVER' }; },
  libReadText: async () => ({ ok: true, text: 'hello text content' }),
  libImportFiles: async (shelfId) => { libImports.push(['file', shelfId]); return { ok: true, library: importLibrary(), report: { shelves: 0, books: 3, skipped: [] } }; },
  libImportFolder: async (shelfId) => { libImports.push(['folder', shelfId]); return { ok: true, library: importLibrary(), report: { shelves: 1, books: 3, skipped: [] } }; },
  libDeleteFiles: async (ids) => { deletedFileCalls.push(ids.slice()); return { ok: true }; },
  artOpen: async (p) => { openCalls.push(p); return { ok: true }; },
  artReveal: async (p) => { revealCalls.push(p); return { ok: true }; },
  artBrowse: async (p) => (/\.(pdf|epub|mobi|fb2|fbz)$/i.test(p)
    ? { ok: true, kind: 'book', title: 'book', path: p }
    : { ok: true, kind: 'pages', title: 'set', pages: ['media://file/a', 'media://file/b'] }),
  openShotsFolder: async (gameId) => { openShotFolderCalls.push(gameId); return { ok: true, path: 'shots/' + gameId }; },
  bookOpen: async (p) => { bookOpenCalls.push(p); return { ok: true, url: 'http://127.0.0.1:9999/viewer.html?src=%2Fbook' }; },
  fetchChars: async () => ({ ok: true, work: 'Fate', characters: [
    { source: 'bgm-char', id: 'c1', name: 'Saber', original: 'セイバー', image: 'http://img/1.jpg' },
    { source: 'bgm-char', id: 'c2', name: 'Rin', original: '', image: 'http://img/2.jpg' }
  ] }),
  searchWorks: async () => ({ ok: true, works: [
    { source: 'bgm-char', id: 'w1', name: 'Fate/stay night', original: '', year: '2004', image: '' },
    { source: 'bgm-char', id: 'w2', name: 'Fate/Zero', original: '', year: '2011', image: '' }
  ] }),
  openExternal: async (url) => { openExternalCalls.push(url); return { ok: true }; },
  translate: async (p) => { calls.translate.push(p); return { ok: true, text: 'Elden Ring' }; },
  scrapeSearch: async (p) => {
    calls.search.push(p);
    return { ok: true, results: [{ source: p.source, id: '42', name: 'Elden Ring', mediaType: 'movie', year: '2022' }] };
  },
  scrapeAssets: async (p) => {
    calls.assets.push(p);
    return { ok: true, assets: [{ url: 'https://img/a.jpg', thumb: 'https://img/a_t.jpg', kind: 'grid' }] };
  },
  downloadImage: async (p) => { calls.download.push(p); return { ok: true, dataUrl: 'data:image/jpeg;base64,AAAA' }; },
  importShotsFolder: async () => ({ ok: true, count: 2, shots: ['shotA.jpg', 'shotB.jpg'] }),
  importCharsFolder: async () => ({ ok: true, count: 2, shots: ['charA.jpg', 'charB.jpg'] })
};

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const dom = new JSDOM(html, {
    url,
    runScripts: 'dangerously',
    resources: {
      interceptors: [requestInterceptor(request => {
        // The mocked bookOpen endpoint has no real server in this UI suite.
        if (request.url.startsWith('http://127.0.0.1:9999/')) {
          return new Response('<!doctype html><html><body></body></html>', {
            headers: { 'content-type': 'text/html' }
          });
        }
      })]
    },
    pretendToBeVisual: true,
    beforeParse(window) {
      window.voidLibrary = api;
      /* 让裁剪器里的 new Image() 立即触发 onload，便于测试 */
      window.Image = class FakeImage {
        set src(v) {
          this._src = v;
          const self = this;
          setTimeout(function () {
            self.naturalWidth = 640; self.naturalHeight = 360;
            if (self.onload) self.onload();
          }, 0);
        }
        get src() { return this._src; }
      };
    }
  });

  const { window } = dom;
  const doc = window.document;
  await new Promise(res => window.addEventListener('load', res));
  await wait(300);

  const results = [];
  function check(name, cond, extra) {
    results.push((cond ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? ' :: ' + extra : ''));
  }
  const gc = window.GameCollection;
  const games = gc.getGames();

  // ---- 基础（当前 exe 版本：无类型） ----
  check('GameCollection exposed', !!gc);
  check('sample data seeded', games.length === 6, 'len=' + games.length);
  check('no genre filter row (exe version)', doc.getElementById('genreRow') === null);
  check('random result card element', !!doc.getElementById('randomPick'));
  check('notes field removed', doc.getElementById('fNotes') === null);
  check('notes dropped from data', games.every(g => !('notes' in g)));
  check('shots array present', games.every(g => Array.isArray(g.shots)));
  check('no hltb field', games.every(g => !('hltb' in g)));

  const pillsOf = (row) => Array.from(row.querySelectorAll('.pill')).map(e => e.textContent);

  // ---- 功能1：状态/平台 随分类变化 ----
  // 初始为全部：应包含 弃坑 与 蓝光
  check('all-status contains 弃坑', pillsOf(doc.getElementById('statusRow')).includes('弃坑'),
    pillsOf(doc.getElementById('statusRow')).join(','));
  check('all-platform contains 蓝光', pillsOf(doc.getElementById('platformRow')).includes('蓝光'),
    pillsOf(doc.getElementById('platformRow')).join(','));

  // 切到 书籍：状态只有 「全部状态,已通关」，平台只有「全部平台,纸质书」
  const bookPill = Array.from(doc.querySelectorAll('#categoryRow .pill')).find(e => e.textContent === '书籍');
  bookPill.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  let st = pillsOf(doc.getElementById('statusRow'));
  let pf = pillsOf(doc.getElementById('platformRow'));
  check('书籍 status scoped', JSON.stringify(st) === JSON.stringify(['全部状态', '已通关']), st.join(','));
  check('书籍 platform scoped', JSON.stringify(pf) === JSON.stringify(['全部平台', '纸质书']), pf.join(','));
  let sf = pillsOf(doc.getElementById('seriesRow'));
  check('书籍 series scoped', sf.includes('地球往事') && !sf.includes('魂系列'), sf.join(','));

  // 切到 影音：状态只有 全成就，平台只有 蓝光
  Array.from(doc.querySelectorAll('#categoryRow .pill')).find(e => e.textContent === '影音')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  st = pillsOf(doc.getElementById('statusRow'));
  pf = pillsOf(doc.getElementById('platformRow'));
  check('影音 status scoped', JSON.stringify(st) === JSON.stringify(['全部状态', '全成就']), st.join(','));
  check('影音 platform scoped', JSON.stringify(pf) === JSON.stringify(['全部平台', '蓝光']), pf.join(','));
  sf = pillsOf(doc.getElementById('seriesRow'));
  check('影音 series scoped (empty)', !sf.includes('地球往事') && !sf.includes('魂系列'), sf.join(','));

  // 回到全部
  Array.from(doc.querySelectorAll('#categoryRow .pill')).find(e => e.textContent === '全部')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);

  // ---- 拼音搜索（部分拼音 / 首字母）----
  check('pinyinPro loaded', !!window.pinyinPro);
  const searchInput = doc.getElementById('searchInput');
  searchInput.value = 'aier';
  searchInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(220);
  let pnames = Array.from(doc.querySelectorAll('.game-card .game-name')).map(e => e.textContent);
  check('pinyin partial search matches', pnames.includes('艾尔登法环'), pnames.join(','));
  searchInput.value = 'aedfh';
  searchInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(220);
  pnames = Array.from(doc.querySelectorAll('.game-card .game-name')).map(e => e.textContent);
  check('pinyin initials search matches', pnames.includes('艾尔登法环'), pnames.join(','));
  searchInput.value = '';
  searchInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(220);

  // ---- 默认分类为空 + 平台/系列自动补全跟随分类 ----
  doc.getElementById('addBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('category empty by default', doc.getElementById('fCategory').value === '',
    doc.getElementById('fCategory').value);

  const catInput = doc.getElementById('fCategory');
  const platInput = doc.getElementById('fPlatform');
  const serInput = doc.getElementById('fSeries');
  check('platform wrapped for autocomplete', !!platInput.closest('.ac-wrap'));

  catInput.value = '电子游戏';
  platInput.dispatchEvent(new window.Event('focus', { bubbles: true }));
  await wait(10);
  let acList = platInput.parentNode.querySelector('.ac-list');
  let acVals = Array.from(acList.querySelectorAll('.ac-item')).map(e => e.textContent);
  check('platform suggestions follow category',
    acVals.includes('Steam') && !acVals.includes('纸质书'), acVals.join(','));
  platInput.value = 'St';
  platInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(10);
  acVals = Array.from(acList.querySelectorAll('.ac-item')).map(e => e.textContent);
  check('platform autocomplete filters by text', acVals.length === 1 && acVals[0] === 'Steam', acVals.join(','));
  acList.querySelector('.ac-item').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
  check('autocomplete selection sets value', platInput.value === 'Steam', platInput.value);

  catInput.value = '书籍';
  platInput.value = '';
  platInput.dispatchEvent(new window.Event('focus', { bubbles: true }));
  await wait(10);
  acVals = Array.from(platInput.parentNode.querySelector('.ac-list').querySelectorAll('.ac-item')).map(e => e.textContent);
  check('platform suggestions switch with category',
    acVals.includes('纸质书') && !acVals.includes('Steam'), acVals.join(','));

  serInput.dispatchEvent(new window.Event('focus', { bubbles: true }));
  await wait(10);
  const serVals = Array.from(serInput.parentNode.querySelector('.ac-list').querySelectorAll('.ac-item')).map(e => e.textContent);
  check('series suggestions follow category', serVals.includes('地球往事'), serVals.join(','));

  // 当前分类没有、但输入搜索词时跨分类弹出
  catInput.value = '影音';
  serInput.value = '';
  serInput.dispatchEvent(new window.Event('focus', { bubbles: true }));
  await wait(10);
  let serItems = Array.from(serInput.parentNode.querySelector('.ac-list').querySelectorAll('.ac-item')).map(e => e.textContent);
  check('series empty under category with none', serItems.length === 0, serItems.join(','));
  serInput.value = '魂';
  serInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(10);
  serItems = Array.from(serInput.parentNode.querySelector('.ac-list').querySelectorAll('.ac-item')).map(e => e.textContent);
  check('series cross-category search when typing', serItems.includes('魂系列'), serItems.join(','));

  doc.querySelector('#gameModal [data-close]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);

  // ---- 卡片翻转：目标与挑战 ----
  const flipCard = doc.querySelector('.game-card');
  const flipId = flipCard.dataset.id;
  flipCard.querySelector('.js-flip').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check('card flips to goals', flipCard.classList.contains('flipped'));
  check('back shows game name',
    flipCard.querySelector('.back-name').textContent === gc.getGames().find(g => g.id === flipId).name,
    flipCard.querySelector('.back-name').textContent);
  const goalInput = flipCard.querySelector('.js-goal-input');
  goalInput.value = '全成就';
  flipCard.querySelector('.js-goal-add').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(60);
  let gv = gc.getGames().find(g => g.id === flipId);
  check('goal added and saved', gv.goals.length === 1 && gv.goals[0].text === '全成就',
    JSON.stringify(gv.goals));
  const flipCard2 = doc.querySelector('.game-card[data-id="' + flipId + '"]');
  check('card stays flipped after commit', flipCard2.classList.contains('flipped'));
  const goalCheck = flipCard2.querySelector('.js-goal-check');
  goalCheck.checked = true;
  goalCheck.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(60);
  gv = gc.getGames().find(g => g.id === flipId);
  check('goal toggled done', gv.goals[0].done === true);
  const flipCard3 = doc.querySelector('.game-card[data-id="' + flipId + '"]');
  flipCard3.querySelector('.js-goal-del').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(60);
  gv = gc.getGames().find(g => g.id === flipId);
  check('goal deleted', gv.goals.length === 0, 'n=' + gv.goals.length);

  // ---- 设置 ----
  doc.getElementById('settingsBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('settings modal opens', doc.getElementById('settingsModal').classList.contains('show'));
  check('settings prefilled', doc.getElementById('sSgdbKey').value === 'sgdb-key'
    && doc.getElementById('sTmdbKey').value === 'tmdb-key'
    && doc.getElementById('sBangumiToken').value === 'bgm-token');
  doc.getElementById('sTmdbKey').value = ' new-tmdb ';
  doc.getElementById('settingsSaveBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('settings saved trimmed', settingsSaved && settingsSaved.tmdbKey === 'new-tmdb', JSON.stringify(settingsSaved));

  // 卡片底部不再有放大镜（刮削只在添加/编辑界面）
  check('no scrape button on card', doc.querySelector('.game-card .js-scrape') === null);

  // ---- 状态：与分类/平台/系列一致的输入框（无默认）----
  doc.getElementById('addBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('status uses input like category', !!doc.getElementById('fStatus'));
  check('status empty by default', doc.getElementById('fStatus').value === '',
    doc.getElementById('fStatus').value);
  const statusOpts = Array.from(doc.getElementById('statusSuggest').options).map(o => o.value);
  check('status suggestions populated',
    statusOpts.includes('进行中') && statusOpts.includes('已通关'), statusOpts.join(','));
  doc.getElementById('fStatus').value = '已通关';
  doc.querySelector('#gameModal [data-close]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);

  // ---- 功能2/3：在编辑界面进行单条目刮削 ----
  const target = games.find(g => g.name === '艾尔登法环');
  const card = doc.querySelector('.game-card[data-id="' + target.id + '"]');
  card.querySelector('.js-edit').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('edit modal reflects existing status', doc.getElementById('fStatus').value === '已通关',
    doc.getElementById('fStatus').value);
  check('no hltb input in modal', doc.getElementById('fHltbMain') === null);
  doc.getElementById('itemScrapeBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(60);
  check('item scrape modal opens', doc.getElementById('itemScrapeModal').classList.contains('show'));
  check('no auto translation on open',
    doc.getElementById('isQuery').value === '艾尔登法环' && calls.translate.length === 0,
    doc.getElementById('isQuery').value + ' t=' + calls.translate.length);
  doc.getElementById('isTranslateBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(30);
  check('translate only on button click',
    doc.getElementById('isQuery').value === 'Elden Ring'
    && calls.translate.length >= 1 && calls.translate[0].from === 'zh-CN',
    doc.getElementById('isQuery').value);

  const resultBtns = doc.querySelectorAll('#isResults .scrape-result');
  check('search results rendered', resultBtns.length === 1, 'n=' + resultBtns.length);
  resultBtns[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(40);
  const assetBtns = doc.querySelectorAll('#isAssets .asset');
  check('asset thumbnails rendered', assetBtns.length === 1, 'n=' + assetBtns.length);
  assetBtns[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(60);
  check('download called', calls.download.length >= 1 && calls.download[0].url === 'https://img/a.jpg');
  check('crop modal opens after download', doc.getElementById('cropModal').classList.contains('show'));

  // 「＋截图」把图片加入当前条目的截图，保存后写入
  doc.querySelector('#isAssets .add-shot').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(40);
  doc.querySelector('#cropModal [data-close]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);
  doc.getElementById('saveBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(40);
  const savedTarget = gc.getGames().find(g => g.name === '艾尔登法环');
  check('screenshot saved on game', !!savedTarget && savedTarget.shots.length === 1,
    'shots=' + (savedTarget ? savedTarget.shots.length : 'none'));

  check('game modal closed after save', !doc.getElementById('gameModal').classList.contains('show'));

  // 手动矫正名称后重新搜索
  doc.getElementById('isQuery').value = 'Custom Name';
  doc.getElementById('isSearchBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(40);
  check('manual name correction searched',
    calls.search[calls.search.length - 1].term === 'Custom Name',
    JSON.stringify(calls.search[calls.search.length - 1]));

  // 切换来源到 TMDB / Bangumi
  Array.from(doc.querySelectorAll('#isSources .pill')).find(e => e.dataset.source === 'tmdb')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);
  doc.getElementById('isSearchBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(40);
  check('tmdb source used', calls.search[calls.search.length - 1].source === 'tmdb');
  Array.from(doc.querySelectorAll('#isSources .pill')).find(e => e.dataset.source === 'bangumi')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);
  doc.getElementById('isSearchBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(40);
  check('bangumi source used', calls.search[calls.search.length - 1].source === 'bangumi');
  check('vndb source pill present', !!doc.querySelector('#isSources .pill[data-source="vndb"]'));
  Array.from(doc.querySelectorAll('#isSources .pill')).find(e => e.dataset.source === 'vndb')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);
  doc.getElementById('isSearchBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(40);
  check('vndb source used', calls.search[calls.search.length - 1].source === 'vndb');

  // ---- 侧边栏页面切换 ----
  const statsNav = doc.querySelector('.nav-btn[data-page="stats"]');
  statsNav.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);
  check('stats page shown', !doc.getElementById('page-stats').classList.contains('hidden')
    && doc.getElementById('page-library').classList.contains('hidden'));
  check('stats nav active', statsNav.classList.contains('active'));
  check('stats donut status rendered', !!doc.querySelector('#chartStatus svg path, #chartStatus svg circle'));
  check('stats donut category legend', (doc.querySelectorAll('#chartCategory .legend-item').length) > 0,
    'n=' + doc.querySelectorAll('#chartCategory .legend-item').length);
  check('stats donut rating rendered', !!doc.querySelector('#chartRating svg'));
  check('donut center total removed', !doc.querySelector('#chartStatus .donut-total'));
  const stLegend = Array.from(doc.querySelectorAll('#chartStatus .legend-key')).map(e => e.textContent);
  check('status merged: no separate 全成就', !stLegend.includes('全成就'), stLegend.join(','));
  check('status has 已通关', stLegend.includes('已通关'), stLegend.join(','));
  check('stats platform bars', !!doc.querySelector('#statsByPlatform .bar'));
  const firstFill = doc.querySelector('#statsByPlatform .bar-fill');
  check('platform bar uses colored segment', !!firstFill && /background/.test(firstFill.getAttribute('style') || ''));
  check('no same-length bar track', !doc.querySelector('#statsByPlatform .bar-track'));
  // 平台统计按分类切换（书籍 -> 只有纸质书）
  const pScope = doc.getElementById('platformScope');
  check('platform scope select present', !!pScope && Array.from(pScope.options).some(o => o.value === '书籍'));
  pScope.value = '书籍';
  pScope.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(20);
  const platLabels = Array.from(doc.querySelectorAll('#statsByPlatform .bar-label')).map(e => e.textContent);
  check('platform scoped to category', platLabels.length === 1 && platLabels[0] === '纸质书', platLabels.join(','));
  pScope.value = 'all';
  pScope.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(20);

  // 最近通关按分类切换
  const rdScope = doc.getElementById('recentDoneScope');
  check('recent done scope present', !!rdScope && Array.from(rdScope.options).some(o => o.value === '书籍'));
  rdScope.value = '书籍';
  rdScope.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(20);
  const rdNames = Array.from(doc.querySelectorAll('#statsRecentDone .recent-item .nm')).map(e => e.textContent);
  check('recent done scoped to category', rdNames.length === 1 && rdNames[0] === '三体', rdNames.join(','));
  rdScope.value = 'all';
  rdScope.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(20);

  check('stats completed line chart', !!doc.querySelector('#chartCompleted svg .chart-line'));
  check('trend chart value labels', doc.querySelectorAll('#chartCompleted .chart-value').length > 0,
    'n=' + doc.querySelectorAll('#chartCompleted .chart-value').length);

  check('no undefined on stats page', !doc.getElementById('page-stats').textContent.includes('undefined'));
  const valueLabels = Array.from(doc.querySelectorAll('#chartCompleted .chart-value')).map(e => e.textContent);
  check('value labels are numbers', valueLabels.length > 0 && valueLabels.every(t => /^\d+$/.test(t)),
    valueLabels.join(','));

  const ty = doc.getElementById('trendYear');
  check('trend year select present', !!ty && Array.from(ty.options).some(o => o.value === 'recent'));
  check('trend month select removed', doc.getElementById('trendMonth') === null);
  check('trend summary has total', /共通关 \d+ 款/.test(doc.getElementById('trendSummary').textContent),
    doc.getElementById('trendSummary').textContent);

  const someYear = Array.from(ty.options).map(o => o.value).find(v => v !== 'recent');
  check('a year option exists', !!someYear, Array.from(ty.options).map(o => o.value).join(','));
  ty.value = someYear;
  ty.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(20);
  check('trend summary for year', doc.getElementById('trendSummary').textContent.indexOf(someYear) > -1,
    doc.getElementById('trendSummary').textContent);

  ty.value = 'recent'; ty.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(20);
  check('no added-trend chart', doc.getElementById('chartAdded') === null);
  check('recent done list', !!doc.querySelector('#statsRecentDone .recent-item'));
  check('no recent added list', doc.getElementById('statsRecentAdded') === null);
  doc.querySelector('.nav-btn[data-page="library"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);
  check('library page shown', !doc.getElementById('page-library').classList.contains('hidden')
    && doc.getElementById('page-stats').classList.contains('hidden'));

  // ---- 拖拽到弹窗外不应关闭 ----
  doc.querySelector('.game-card .js-edit').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  const gmodal = doc.getElementById('gameModal');
  check('game modal open before drag test', gmodal.classList.contains('show'));
  doc.getElementById('fName').dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  gmodal.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check('drag-out does not close modal', gmodal.classList.contains('show'));
  gmodal.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  gmodal.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check('click background closes modal', !gmodal.classList.contains('show'));

  // ---- 截图页面（参考 ScreenshotsVisualizer：网格/条带 + 查看器导航 + 扫描文件夹） ----
  doc.querySelector('.nav-btn[data-page="shots"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('shots page shown', !doc.getElementById('page-shots').classList.contains('hidden'));
  check('shots clear button present', !!doc.getElementById('shotsClearBtn'));
  check('shots group rendered', !!doc.querySelector('#shotsGallery .shot-group'),
    doc.getElementById('shotsGallery').textContent.slice(0, 30));
  check('shots strip only (no grid, no toggle)',
    !!doc.querySelector('#shotsGallery .shot-strip')
    && !doc.querySelector('#shotsGallery .shot-grid')
    && doc.getElementById('shotsLayout') === null);

  // 滚轮横向滚动预览
  const strip = doc.querySelector('#shotsGallery .shot-strip');
  const wev = new window.Event('wheel', { bubbles: true, cancelable: true });
  wev.deltaY = 60; wev.deltaX = 0;
  strip.dispatchEvent(wev);
  check('wheel scrolls strip horizontally', strip.scrollLeft === 60, 'scrollLeft=' + strip.scrollLeft);

  const sSearch = doc.getElementById('shotsSearch');
  sSearch.value = 'Hades';
  sSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(220);
  check('shots search filters', !!doc.querySelector('#shotsGallery .shots-none'));
  sSearch.value = '';
  sSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(220);

  doc.getElementById('shotsImportBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('shot import modal opens', doc.getElementById('shotImportModal').classList.contains('show'));
  check('shot import is searchable input',
    doc.getElementById('shotImportGame').tagName === 'INPUT' && !!doc.getElementById('shotImportList'));
  doc.getElementById('shotImportGame').value = '艾尔登法环';
  doc.getElementById('shotImportConfirm').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(80);
  check('folder import added shots',
    /3 张/.test(doc.querySelector('#shotsGallery .shot-group .cnt').textContent),
    doc.querySelector('#shotsGallery .shot-group .cnt').textContent);
  const shotGroupId = doc.querySelector('#shotsGallery .shot-group').dataset.id;
  const shotSrcs = Array.from(doc.querySelectorAll('#shotsGallery .shot-strip-item')).map(e => e.dataset.src);
  const relShotSrc = shotSrcs.find(s => s.indexOf('shot://') === 0);
  check('shot src uses per-game folder',
    !!relShotSrc && relShotSrc.indexOf('shot://s/' + shotGroupId + '/') === 0, shotSrcs.join(','));

  // 截图页：增 / 删（带确认）/ 转移 / 清空
  const grpId = doc.querySelector('#shotsGallery .shot-group').dataset.id;
  check('group action buttons',
    !!doc.querySelector('#shotsGallery .js-shot-add')
    && !!doc.querySelector('#shotsGallery .js-shot-openfolder')
    && !!doc.querySelector('#shotsGallery .js-shot-move')
    && !!doc.querySelector('#shotsGallery .js-shot-clear'));

  const beforeDel = gc.getGames().find(g => g.id === grpId).shots.length;
  doc.querySelector('#shotsGallery .shot-del').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('delete asks confirmation', doc.getElementById('confirmModal').classList.contains('show'));
  // 确认框打开时再次点击删除、按回车，都不应叠加删除
  doc.querySelector('#shotsGallery .shot-del').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await wait(60);
  const afterDel = gc.getGames().find(g => g.id === grpId).shots.length;
  check('delete removes exactly one (no stacking)', afterDel === beforeDel - 1, beforeDel + '->' + afterDel);

  // 添加菜单：从文件夹导入
  doc.querySelector('#shotsGallery .js-shot-add').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);
  check('add menu opens', !doc.getElementById('shotAddMenu').classList.contains('hidden'));
  doc.querySelector('#shotAddMenu [data-act="folder"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(80);
  const afterAdd = gc.getGames().find(g => g.id === grpId).shots.length;
  check('folder add via menu increases shots', afterAdd === afterDel + 2, afterDel + '->' + afterAdd);

  // 打开截图文件夹
  doc.querySelector('#shotsGallery .js-shot-openfolder').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('open shots folder called', openShotFolderCalls.indexOf(grpId) > -1, openShotFolderCalls.join(','));

  // 查看器内删除（带确认）
  const shotCell = doc.querySelector('#shotsGallery .shot-strip-item');
  shotCell.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);
  check('shot viewer opens', doc.getElementById('shotViewer').classList.contains('show'));
  check('viewer counter 1/4', doc.getElementById('shotCounter').textContent === '1 / 4',
    doc.getElementById('shotCounter').textContent);
  doc.getElementById('shotNext').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);
  check('viewer next -> 2/4', doc.getElementById('shotCounter').textContent === '2 / 4',
    doc.getElementById('shotCounter').textContent);
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  await wait(10);
  check('viewer arrow-left -> 1/4', doc.getElementById('shotCounter').textContent === '1 / 4',
    doc.getElementById('shotCounter').textContent);
  doc.getElementById('shotDelete').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('viewer delete asks confirmation', doc.getElementById('confirmModal').classList.contains('show'));
  doc.getElementById('confirmOk').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(60);
  check('viewer closed after delete', !doc.getElementById('shotViewer').classList.contains('show'));
  check('viewer delete removed a shot',
    gc.getGames().find(g => g.id === grpId).shots.length === afterAdd - 1,
    'now=' + gc.getGames().find(g => g.id === grpId).shots.length);

  // 转移归属到「三体」
  const moveSrcId = doc.querySelector('#shotsGallery .shot-group').dataset.id;
  const moveCount = gc.getGames().find(g => g.id === moveSrcId).shots.length;
  doc.querySelector('#shotsGallery .js-shot-move').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('move modal opens', doc.getElementById('shotMoveModal').classList.contains('show'));
  doc.getElementById('moveTargetName').value = '三体';
  doc.getElementById('moveConfirm').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(80);
  const movedGame = gc.getGames().find(g => g.name === '三体');
  const srcAfter = gc.getGames().find(g => g.id === moveSrcId);
  check('shots moved to target', movedGame.shots.length === moveCount && srcAfter.shots.length === 0,
    'target=' + movedGame.shots.length + ' src=' + srcAfter.shots.length);

  // 清空（带确认）
  const clearBtn = Array.from(doc.querySelectorAll('#shotsGallery .js-shot-clear'))
    .find(b => b.dataset.id === movedGame.id);
  check('clear button present for target', !!clearBtn);
  clearBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('clear asks confirmation', doc.getElementById('confirmModal').classList.contains('show'));
  doc.getElementById('confirmOk').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(60);
  check('clear removed all shots', gc.getGames().find(g => g.id === movedGame.id).shots.length === 0);

  // 截图页分类筛选
  async function importShotsTo(name) {
    doc.getElementById('shotsImportBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await wait(20);
    doc.getElementById('shotImportGame').value = name;
    doc.getElementById('shotImportConfirm').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await wait(80);
  }
  await importShotsTo('艾尔登法环');
  await importShotsTo('三体');
  const shotsScope = doc.getElementById('shotsScope');
  const scopeVals = Array.from(shotsScope.options).map(o => o.value);
  check('shots scope lists categories',
    scopeVals.includes('电子游戏') && scopeVals.includes('书籍'), scopeVals.join(','));
  const groupNames = () => Array.from(doc.querySelectorAll('#shotsGallery .shot-group-name .nm')).map(e => e.textContent);
  shotsScope.value = '电子游戏';
  shotsScope.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(20);
  check('shots filtered to 电子游戏', JSON.stringify(groupNames()) === JSON.stringify(['艾尔登法环']), groupNames().join(','));
  shotsScope.value = '书籍';
  shotsScope.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(20);
  check('shots filtered to 书籍', JSON.stringify(groupNames()) === JSON.stringify(['三体']), groupNames().join(','));
  shotsScope.value = 'all';
  shotsScope.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(20);
  check('shots filter reset to all', groupNames().length === 2, groupNames().join(','));

  doc.querySelector('.nav-btn[data-page="library"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);

  // ---- 收藏库：点击卡片封面进入该游戏截图图集（整页） ----
  const eldenId = gc.getGames().find(g => g.name === '艾尔登法环').id;
  doc.querySelector('.game-card[data-id="' + eldenId + '"] .cover').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('game shots gallery opens as full page',
    !doc.getElementById('page-gameShots').classList.contains('hidden')
    && doc.getElementById('page-library').classList.contains('hidden'));
  check('game shots gallery title', /艾尔登法环/.test(doc.getElementById('gameShotsTitle').textContent),
    doc.getElementById('gameShotsTitle').textContent);
  const gsh0 = doc.querySelectorAll('#gameShots .cg-cell').length;
  check('game shots gallery grid items', gsh0 > 0, 'n=' + gsh0);
  doc.querySelector('#gameShots .cg-cell').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);
  check('game shots gallery viewer opens', doc.getElementById('shotViewer').classList.contains('show'));
  doc.getElementById('shotClose').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);
  doc.getElementById('gshFolderBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(40);
  check('game shots gallery folder import', doc.querySelectorAll('#gameShots .cg-cell').length === gsh0 + 2,
    'n=' + doc.querySelectorAll('#gameShots .cg-cell').length);
  doc.querySelector('#gameShots .cg-del').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('game shots gallery delete asks confirm', doc.getElementById('confirmModal').classList.contains('show'));
  doc.getElementById('confirmOk').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(60);
  check('game shots gallery item deleted', doc.querySelectorAll('#gameShots .cg-cell').length === gsh0 + 1,
    'n=' + doc.querySelectorAll('#gameShots .cg-cell').length);
  doc.getElementById('gshBackBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);
  check('game shots gallery back returns to library',
    !doc.getElementById('page-library').classList.contains('hidden')
    && doc.getElementById('page-gameShots').classList.contains('hidden'));

  // ---- 角色卡片页面 ----
  doc.querySelector('.nav-btn[data-page="characters"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('characters page shown', !doc.getElementById('page-characters').classList.contains('hidden'));
  check('characters clear button present', !!doc.getElementById('charClearBtn'));
  check('characters empty state', !doc.getElementById('charEmpty').classList.contains('hidden'));

  doc.getElementById('charAddBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('char modal opens', doc.getElementById('charModal').classList.contains('show'));
  doc.getElementById('cName').value = 'Saber';
  doc.getElementById('cWork').value = 'Fate';
  doc.getElementById('cSaveBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(60);
  check('character saved', !!charsSaved && charsSaved.length === 1 && charsSaved[0].name === 'Saber',
    JSON.stringify(charsSaved));
  check('character card rendered', !!doc.querySelector('#charGrid .char-card'));

  // 角色刮削（Bangumi / VNDB）：刮削设为角色图片（封面），支持作品限定
  doc.querySelector('#charGrid .js-char-edit').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('char scrape button present', !!doc.getElementById('csOpenBtn'));
  check('char work filter present', !!doc.getElementById('csWork'));
  doc.getElementById('csOpenBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(40);
  check('char scrape modal opens', doc.getElementById('charScrapeModal').classList.contains('show'));
  check('bangumi char source present', !!doc.querySelector('#csSources .pill[data-source="bgm-char"]'));
  check('char scrape auto-searched', doc.querySelectorAll('#csResults .scrape-result').length === 1,
    'n=' + doc.querySelectorAll('#csResults .scrape-result').length);
  check('char search passes work filter', calls.search[calls.search.length - 1].work === 'Fate',
    JSON.stringify(calls.search[calls.search.length - 1]));
  doc.querySelector('#csResults .scrape-result').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(40);
  check('char assets rendered', doc.querySelectorAll('#csAssets .asset').length === 1,
    'n=' + doc.querySelectorAll('#csAssets .asset').length);
  doc.querySelector('#csAssets .asset').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(40);
  check('char scrape opens cropper', doc.getElementById('cropModal').classList.contains('show'));
  doc.querySelector('#cropModal [data-close]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);
  check('scrape does not add to gallery', doc.querySelectorAll('#cShotsGrid .shot-thumb').length === 0,
    'n=' + doc.querySelectorAll('#cShotsGrid .shot-thumb').length);
  Array.from(doc.querySelectorAll('#csSources .pill')).find(e => e.dataset.source === 'vndb-char')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);
  doc.getElementById('csSearchBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(40);
  check('vndb char source used', calls.search[calls.search.length - 1].source === 'vndb-char');
  doc.querySelector('#charScrapeModal [data-close]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);

  // 图集：编辑弹窗内从文件夹导入
  doc.getElementById('cShotsFolderBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(40);
  check('char folder import adds to editor', doc.querySelectorAll('#cShotsGrid .shot-thumb').length === 2,
    'n=' + doc.querySelectorAll('#cShotsGrid .shot-thumb').length);

  // 图集搜索：跳转 Pixiv 浏览器搜索（手动下载后自行添加）
  doc.getElementById('cImgSearchBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(30);
  check('char image search modal opens', doc.getElementById('charImgSearchModal').classList.contains('show'));
  check('no google source pill', doc.getElementById('ciSources') === null);
  doc.getElementById('ciQuery').value = 'Saber Fate';
  doc.getElementById('ciOpenBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(30);
  check('pixiv opens in browser',
    openExternalCalls.some(function (u) { return u.indexOf('pixiv.net') > -1 && u.indexOf('Saber') > -1; }),
    openExternalCalls.join(','));
  doc.querySelector('#charImgSearchModal [data-close]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);

  // 角色封面：上传后进入裁剪器
  const charCoverFile = new window.File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'ch.png', { type: 'image/png' });
  const charCoverInput = doc.getElementById('cFile');
  Object.defineProperty(charCoverInput, 'files', { value: [charCoverFile], configurable: true });
  charCoverInput.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(80);
  check('char cover upload opens cropper', doc.getElementById('cropModal').classList.contains('show'));
  doc.querySelector('#cropModal [data-close]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);

  doc.getElementById('cSaveBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(60);
  check('character shots saved', charsSaved[0].shots.length === 2, 'n=' + charsSaved[0].shots.length);

  // 图集：点击卡片封面进入（网格）
  doc.querySelector('#charGrid .char-img').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('char gallery opens as full page', !doc.getElementById('page-charGallery').classList.contains('hidden')
    && doc.getElementById('page-characters').classList.contains('hidden'));
  check('char gallery grid items', doc.querySelectorAll('#charGallery .cg-cell').length === 2,
    'n=' + doc.querySelectorAll('#charGallery .cg-cell').length);
  doc.querySelector('#charGallery .cg-cell').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);
  check('char gallery viewer opens', doc.getElementById('shotViewer').classList.contains('show'));
  doc.getElementById('shotClose').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);
  doc.getElementById('cgFolderBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(40);
  check('char gallery folder import', doc.querySelectorAll('#charGallery .cg-cell').length === 4,
    'n=' + doc.querySelectorAll('#charGallery .cg-cell').length);
  doc.querySelector('#charGallery .cg-del').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('char gallery delete asks confirm', doc.getElementById('confirmModal').classList.contains('show'));
  doc.getElementById('confirmOk').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(60);
  check('char gallery item deleted', doc.querySelectorAll('#charGallery .cg-cell').length === 3,
    'n=' + doc.querySelectorAll('#charGallery .cg-cell').length);
  doc.getElementById('cgBackBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);
  check('char gallery back returns to characters', !doc.getElementById('page-characters').classList.contains('hidden')
    && doc.getElementById('page-charGallery').classList.contains('hidden'));

  const cSearch = doc.getElementById('charSearch');
  cSearch.value = 'Fate';
  cSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(220);
  check('character search matches work', !!doc.querySelector('#charGrid .char-card'));
  cSearch.value = 'zzzz';
  cSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(220);
  check('character search no match', doc.getElementById('charGrid').textContent.indexOf('没有匹配') > -1);
  cSearch.value = '';
  cSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(220);

  doc.querySelector('#charGrid .js-char-edit').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  doc.getElementById('cName').value = '阿尔托莉雅';
  doc.getElementById('cWork').value = '命运之夜';
  doc.getElementById('cSaveBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(60);
  check('character edited', charsSaved[0].name === '阿尔托莉雅' && charsSaved[0].work === '命运之夜',
    charsSaved[0].name + '/' + charsSaved[0].work);

  // 角色拼音搜索（全拼 / 首字母 / 作品拼音）
  cSearch.value = 'aetly';
  cSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(220);
  check('character pinyin initials search', !!doc.querySelector('#charGrid .char-card'));
  cSearch.value = 'mingyun';
  cSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(220);
  check('character work pinyin search', !!doc.querySelector('#charGrid .char-card'));
  cSearch.value = '';
  cSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(220);

  doc.querySelector('#charGrid .js-char-del').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('character delete asks confirm', doc.getElementById('confirmModal').classList.contains('show'));
  doc.getElementById('confirmOk').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(60);
  check('character deleted', charsSaved.length === 0, 'n=' + charsSaved.length);

  // ---- 角色批量导入（按作品/系列）----
  doc.getElementById('charBatchBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('batch modal opens', doc.getElementById('charBatchModal').classList.contains('show'));
  doc.getElementById('cbWork').value = 'Fate';
  doc.getElementById('cbSearchBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(40);
  // 第一步：先出候选作品/系列
  check('batch shows work candidates', doc.querySelectorAll('#cbList .cb-row').length === 2
    && doc.querySelectorAll('#cbList .js-cb-pick').length === 2,
    'n=' + doc.querySelectorAll('#cbList .cb-row').length);
  // 第二步：选定作品后加载角色
  doc.querySelector('#cbList .js-cb-pick').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(60);
  check('batch work selected loads characters', doc.querySelectorAll('#cbList input[type=checkbox]').length === 2,
    'n=' + doc.querySelectorAll('#cbList input[type=checkbox]').length);
  check('batch default all checked', doc.querySelectorAll('#cbList input[type=checkbox]:checked').length === 2);
  // 取消勾选第二个
  const cbBoxes = doc.querySelectorAll('#cbList input[type=checkbox]');
  cbBoxes[1].checked = false;
  cbBoxes[1].dispatchEvent(new window.Event('change', { bubbles: true }));
  // 调整第一个（下载后进入裁剪器）
  doc.querySelector('#cbList .js-cb-adjust').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(60);
  check('batch adjust opens cropper', doc.getElementById('cropModal').classList.contains('show'));
  doc.querySelector('#cropModal [data-close]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);
  // 导入所选
  doc.getElementById('cbImportBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(160);
  check('batch imported only checked', charsSaved.length === 1 && charsSaved[0].name === 'Saber'
    && charsSaved[0].work === 'Fate', JSON.stringify(charsSaved));
  check('batch character image downloaded', /^data:/.test((charsSaved[0] || {}).image || ''),
    (charsSaved[0] || {}).image ? String(charsSaved[0].image).slice(0, 16) : 'none');

  // ---- 书海书架（原资料集） ----
  doc.querySelector('.nav-btn[data-page="arts"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('arts page shown', !doc.getElementById('page-arts').classList.contains('hidden'));
  check('book empty state', !doc.getElementById('bookEmpty').classList.contains('hidden'));

  // 新建系列
  doc.getElementById('shelfNewBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('shelf modal opens', doc.getElementById('shelfModal').classList.contains('show'));
  doc.getElementById('shelfName').value = '系列A';
  doc.getElementById('shelfSaveBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(40);
  check('shelf created', !!libSaved && libSaved.shelves.length === 1 && libSaved.shelves[0].name === '系列A',
    JSON.stringify(libSaved && libSaved.shelves));
  check('shelf node in tree', /系列A/.test(doc.getElementById('shelfTree').textContent));

  // 导入（合并菜单：文件 / 文件夹）
  check('import + clear buttons present',
    !!doc.getElementById('bookImportFileBtn') && !!doc.getElementById('libClearBtn')
    && !!doc.getElementById('bookImportFolderBtn') === false);
  doc.getElementById('bookImportFileBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('import menu opens', !doc.getElementById('libImportMenu').classList.contains('hidden'));
  doc.querySelector('#libImportMenu [data-act="file"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(80);
  check('files imported', !!doc.querySelector('#bookGrid .book-card[data-id="b2"]')
    && /导入系列/.test(doc.getElementById('shelfTree').textContent));
  check('imported shelf card rendered', doc.querySelectorAll('#bookGrid .shelf-card').length === 1,
    'n=' + doc.querySelectorAll('#bookGrid .shelf-card').length);
  check('root shows only root-level books (no duplicates)',
    doc.querySelectorAll('#bookGrid .book-card[data-kind="book"]').length === 1,
    'n=' + doc.querySelectorAll('#bookGrid .book-card[data-kind="book"]').length);
  check('import uses current shelf', libImports.length === 1 && libImports[0][0] === 'file', JSON.stringify(libImports));
  // 菜单导入文件夹
  doc.getElementById('bookImportFileBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);
  doc.querySelector('#libImportMenu [data-act="folder"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(60);
  check('folder import via merged menu', libImports[libImports.length - 1][0] === 'folder',
    JSON.stringify(libImports[libImports.length - 1]));

  // 点击系列进入 / 筛选限定在当前系列内
  doc.querySelector('#bookGrid .shelf-card').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('enter shelf shows its books',
    doc.querySelectorAll('#bookGrid .book-card[data-kind="book"]').length === 2,
    'n=' + doc.querySelectorAll('#bookGrid .book-card[data-kind="book"]').length);
  const tagSel2 = doc.getElementById('bookTagFilter');
  tagSel2.value = '设定集';
  tagSel2.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(20);
  check('tag filter scoped within current shelf',
    doc.querySelectorAll('#bookGrid .book-card').length === 1,
    'n=' + doc.querySelectorAll('#bookGrid .book-card').length);
  tagSel2.value = '';
  tagSel2.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(20);
  // 回到根目录（全部书籍）
  Array.from(doc.querySelectorAll('#shelfTree .shelf-node')).find(function (n) { return n.dataset.id === '0'; })
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);

  check('no tag badge on cover', doc.querySelector('.book-tags') === null);
  check('viewer has page jump + toc',
    !!doc.getElementById('avGoto') && !!doc.getElementById('avToc') && !!doc.getElementById('avGotoBtn'));
  check('viewer has exit + flow toggle', !!doc.getElementById('avExit') && !!doc.getElementById('rvFlow')
    && doc.getElementById('avCols') === null);
  const pageMode = doc.getElementById('rvColumns');
  check('single/double page toggle is present', !!pageMode && pageMode.textContent === '单页');
  pageMode.click();
  check('double page toggle updates button and accessibility state',
    pageMode.textContent === '双页' && pageMode.getAttribute('aria-pressed') === 'true');
  pageMode.click();
  check('switching back restores single page', pageMode.textContent === '单页');
  check('sidebar shelf shown on arts page',
    !doc.getElementById('sidebarShelf').classList.contains('hidden'));

  // 搜索
  const bSearch = doc.getElementById('bookSearch');
  bSearch.value = '导入书A';
  bSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(220);
  check('book search', doc.querySelectorAll('#bookGrid .book-card').length === 1,
    'n=' + doc.querySelectorAll('#bookGrid .book-card').length);

  // 阅读 epub（foliate）
  doc.querySelector('#bookGrid .book-card .js-book-open').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(40);
  check('read epub opens reader',
    doc.getElementById('artViewer').classList.contains('show') && bookOpenCalls.indexOf('C:/docs/a.epub') > -1,
    bookOpenCalls.join(','));
  // V4: named page jump, persistent CFI bookmark and font-size reset.
  const frameWindow = doc.querySelector('#avBody iframe').contentWindow;
  const readerMessage = function (type, data) {
    window.dispatchEvent(new window.MessageEvent('message', {
      data: Object.assign({ source: 'vl-reader', type }, data || {}), source: frameWindow
    }));
  };
  readerMessage('opened', { fixedLayout: false });
  readerMessage('relocate', { page: 12, totalPages: 180, fraction: 0.07, cfi: 'epubcfi(/6/4!/4/2)', label: '第一章' });
  check('reflowable page location displayed instead of percent',
    doc.getElementById('rvCount').textContent === '12 / 180' && doc.getElementById('avCounter').textContent.includes('12 / 180'));
  const gotoInput = doc.getElementById('avGoto');
  check('page jump input no longer accepts percent in label', gotoInput.placeholder === '页码' && gotoInput.step === '1');
  gotoInput.value = '181'; doc.getElementById('avGotoBtn').click();
  check('out-of-range page jump does not clobber current page', doc.getElementById('rvCount').textContent === '12 / 180');
  gotoInput.value = '12'; doc.getElementById('avGotoBtn').click();
  const starButton = doc.getElementById('rvAddBookmark');
  starButton.click(); await wait(30);
  check('bookmarks store page and CFI in library.json schema',
    libSaved.books.some(x => x.id === 'b1' && x.bookmarks?.length === 1 && x.bookmarks[0].cfi === 'epubcfi(/6/4!/4/2)'));
  check('current bookmark button reflects saved bookmark', starButton.getAttribute('aria-pressed') === 'true');
  doc.getElementById('rvTabBookmarks').click();
  check('saved bookmark appears in left drawer', doc.querySelectorAll('#rvBookmarksList .rv-bookmark-go').length === 1);
  check('bookmark survives library normalization / backup round-trip',
    window.VoidModels.normalizeLibrary({ shelves: [], books: libSaved.books })
      .books.some(x => x.id === 'b1' && x.bookmarks?.[0]?.page === 12));
  doc.getElementById('avExit').click(); await wait(15);
  doc.querySelector('#bookGrid .book-card .js-book-open').click(); await wait(35);
  doc.getElementById('rvTabBookmarks').click();
  check('bookmark remains after closing and reopening book',
    doc.querySelectorAll('#rvBookmarksList .rv-bookmark-go').length === 1);
  doc.getElementById('avFontPlus').click();
  doc.getElementById('rvResetSize').click();
  check('reset size control available on EPUB', !!doc.getElementById('rvResetSize'));
  doc.getElementById('rvBookmarksList').querySelector('.rv-bookmark-remove').click();
  await wait(35);
  check('deleting bookmark updates persisted record',
    libSaved.books.some(x => x.id === 'b1' && x.bookmarks?.length === 0));
  doc.getElementById('avExit').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);
  bSearch.value = '';
  bSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(220);

  // 阅读 txt
  bSearch.value = '导入书C';
  bSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(220);
  doc.querySelector('#bookGrid .book-card .js-book-open').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(40);
  check('read txt shows text', !!doc.querySelector('#avBody .txt-reader'));
  // If a TXT path has an associated image sequence it is read as a comic.
  // It must support the same two-page control as PDF/EPUB.
  doc.getElementById('avExit').click();
  await wait(10);
  api.libImageList = async () => ({ ok: true, pages: [
    'media://file/1', 'media://file/2', 'media://file/3', 'media://file/4', 'media://file/5'
  ] });
  doc.querySelector('#bookGrid .book-card .js-book-open').click();
  await wait(35);
  pageMode.click();
  check('comic spread contains two distinct pages',
    doc.querySelectorAll('#avBody img.av-page').length === 2
    && doc.getElementById('avCounter').textContent === '1–2 / 5');
  doc.getElementById('avNext').click();
  check('comic next button advances a full spread', doc.getElementById('avCounter').textContent === '3–4 / 5');
  doc.getElementById('avNext').click();
  check('comic last odd page is still visible', doc.getElementById('avCounter').textContent === '5 / 5');
  doc.getElementById('avPrev').click();
  check('comic previous button returns to the previous spread', doc.getElementById('avCounter').textContent === '3–4 / 5');
  // V4: no image page wrap in either direction; jump to exact page and reset zoom.
  doc.getElementById('avGoto').value = '5';
  doc.getElementById('avGotoBtn').click();
  check('comic exact page jump supports last odd page', doc.getElementById('avCounter').textContent === '5 / 5');
  doc.getElementById('avNext').click();
  check('last comic spread does not wrap back to page one', doc.getElementById('avCounter').textContent === '5 / 5');
  doc.getElementById('avGoto').value = '1';
  doc.getElementById('avGotoBtn').click();
  doc.getElementById('avPrev').click();
  check('first comic spread does not wrap to last page', doc.getElementById('avCounter').textContent === '1–2 / 5');
  doc.getElementById('avFontPlus').click();
  check('comic zoom increases beyond default', doc.querySelector('#avBody img.av-page').style.transform.includes('1.2'));
  doc.getElementById('rvResetSize').click();
  check('reset size returns comic zoom to default', doc.querySelector('#avBody img.av-page').style.transform.includes('scale(1)'));
  // Bookmark current comic page and revisit it from the list.
  doc.getElementById('rvAddBookmark').click(); await wait(30);
  check('comic bookmark saved by physical page number',
    libSaved.books.some(x => x.id === 'b3' && x.bookmarks?.some(b => b.kind === 'pages' && b.page === 1)));
  doc.getElementById('avNext').click();
  doc.getElementById('rvTabBookmarks').click();
  doc.querySelector('#rvBookmarksList .rv-bookmark-go').click();
  check('comic bookmark jump restores bookmarked page', doc.getElementById('avCounter').textContent === '1–2 / 5');
  pageMode.click();
  doc.getElementById('avExit').click();
  await wait(10);
  // Restore the original TXT path behavior for subsequent tests.
  api.libImageList = async () => ({ ok: false, pages: [] });

  doc.getElementById('avExit').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);
  bSearch.value = '';
  bSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(220);

  // 状态筛选
  const bst = doc.getElementById('bookStatusFilter');
  bst.value = '已读';
  bst.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(20);
  check('status filter', doc.querySelectorAll('#bookGrid .book-card').length === 1,
    'n=' + doc.querySelectorAll('#bookGrid .book-card').length);
  bst.value = '';
  bst.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(20);

  // 右键编辑信息 / 词条
  const b2card = doc.querySelector('#bookGrid .book-card[data-id="b2"]');
  check('book b2 at root', !!b2card);
  b2card.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
  await wait(20);
  check('ctx menu opens', !doc.getElementById('bookCtxMenu').classList.contains('hidden'));
  doc.querySelector('#bookCtxMenu button[data-act="edit"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('book modal opens', doc.getElementById('bookModal').classList.contains('show'));
  doc.getElementById('bkTitle').value = '改名后的书';
  const tagIn = doc.getElementById('bkTags');
  tagIn.value = '原画集';
  tagIn.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await wait(10);
  tagIn.value = '设定集';
  tagIn.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await wait(10);
  check('tag chips rendered', doc.querySelectorAll('#bkTagChips .tag-chip').length === 2,
    'n=' + doc.querySelectorAll('#bkTagChips .tag-chip').length);
  doc.getElementById('bookSaveBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(60);
  const b2 = libSaved.books.find(function (x) { return x.id === 'b2'; });
  check('book edited with tags', b2.title === '改名后的书' && b2.tags === '原画集,设定集', JSON.stringify(b2));

  // 设置封面（自定义）
  const b2coverCard = doc.querySelector('#bookGrid .book-card[data-id="b2"]');
  b2coverCard.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
  await wait(20);
  doc.querySelector('#bookCtxMenu button[data-act="setcover"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const coverFile = new window.File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'c.png', { type: 'image/png' });
  const cpi = doc.getElementById('coverPickFile');
  Object.defineProperty(cpi, 'files', { value: [coverFile], configurable: true });
  cpi.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(80);
  check('book cover pick opens cropper', doc.getElementById('cropModal').classList.contains('show'));
  doc.querySelector('#cropModal [data-close]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);

  // 右键删除
  const b2card2 = doc.querySelector('#bookGrid .book-card[data-id="b2"]');
  b2card2.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
  await wait(20);
  doc.querySelector('#bookCtxMenu button[data-act="delete"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(20);
  check('delete asks confirm', doc.getElementById('confirmModal').classList.contains('show'));
  doc.getElementById('confirmOk').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(60);
  check('book deleted', libSaved.books.length === 2, 'n=' + libSaved.books.length);
  check('local files deleted with entry',
    deletedFileCalls.some(function (ids) { return ids.indexOf('b2') > -1; }), JSON.stringify(deletedFileCalls));

  doc.querySelector('.nav-btn[data-page="library"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);

  // ---- 两行折叠：用胶囊「…」替换第二行最后一个 ----
  const gRow = doc.getElementById('categoryRow');
  gRow.innerHTML = '<span class="row-label">分类：</span>' +
    Array.from({ length: 15 }, (_, i) => '<span class="pill">C' + i + '</span>').join('');
  const gPills = Array.from(gRow.querySelectorAll('.pill'));
  gPills.forEach(function (p, i) {
    Object.defineProperty(p, 'offsetTop', { value: Math.floor(i / 5) * 30, configurable: true });
    Object.defineProperty(p, 'offsetHeight', { value: 25, configurable: true });
  });
  gc.clampFilters();
  const moreBtn = gRow.querySelector('.row-toggle-pill');
  check('more pill replaces last of line 2', !!moreBtn && moreBtn.textContent === '…'
    && moreBtn.classList.contains('pill'));
  check('overflow pills hidden', gPills[9].style.display === 'none' && gPills[14].style.display === 'none');
  check('first two lines visible', gPills[0].style.display !== 'none' && gPills[8].style.display !== 'none');
  moreBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check('expands all pills', gPills.every(function (p) { return p.style.display !== 'none'; })
    && !!gRow.querySelector('.row-collapse'));
  gRow.querySelector('.row-collapse').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check('collapses again', !!gRow.querySelector('.row-toggle-pill'));

  // ---- 收藏库 V5：刮削别名、批量封面、导入模式 ----
  check('batch cover entry/button and modal exist', !!doc.getElementById('batchCoverBtn') && !!doc.getElementById('batchCoverModal'));
  check('scrape name field is beside display name', !!doc.getElementById('fScrapeName') && !!doc.getElementById('fName').parentNode.classList.contains('span2'));
  const firstCard = doc.querySelector('.game-card');
  firstCard.querySelector('.js-edit').click();
  await wait(20);
  const displayName = doc.getElementById('fName').value;
  doc.getElementById('fScrapeName').value = 'Elden Ring';
  doc.getElementById('itemScrapeBtn').click();
  await wait(30);
  check('scrape search prefers custom name', doc.getElementById('isQuery').value === 'Elden Ring' &&
    calls.search.at(-1).term === 'Elden Ring');
  doc.querySelector('#itemScrapeModal [data-close]').click();
  doc.getElementById('saveBtn').click();
  await wait(45);
  check('scrape name persisted without renaming display title', saved.some(g => g.name === displayName && g.scrapeName === 'Elden Ring'));
  firstCard.querySelector('.js-edit').click();
  await wait(20);
  check('scrape name restores in edit mode', doc.getElementById('fScrapeName').value === 'Elden Ring');
  doc.querySelector('#gameModal [data-close]').click();

  api.previewImport = async () => ({ ok: true, token: 'token1', name: 'archive.zip', counts: { games: 3, characters: 1, books: 2 } });
  let applied = null;
  api.applyImport = async (payload) => { applied = payload; return { ok: true, games: gc.getGames(), added: 1, skipped: 2, total: gc.getGames().length }; };
  doc.getElementById('importBtn').click();
  await wait(35);
  check('archive preview appears before changes', doc.getElementById('importModeModal').classList.contains('show') &&
    doc.getElementById('importPreviewInfo').textContent.includes('archive.zip') && applied === null);
  doc.querySelector('#importModeModal input[value="merge"]').checked = true;
  doc.getElementById('importApplyBtn').click();
  await wait(45);
  check('merge mode is sent with preview token', applied && applied.token === 'token1' && applied.mode === 'merge');
  check('import mode dialog closes after success', !doc.getElementById('importModeModal').classList.contains('show'));

  window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,QUJD';
  // Only one exact match should succeed: other missing covers must be skipped.
  const oldScrape = api.scrapeSearch;
  api.scrapeSearch = async p => { calls.search.push(p); return { ok: true, results: [{ id: '42', source: p.source, name: 'Elden Ring' }] }; };
  doc.getElementById('batchCoverBtn').click();
  await wait(20);
  const beforeMissing = gc.getGames().filter(g => !g.cover).length;
  check('bulk dialog counts only coverless records', doc.getElementById('batchCoverSummary').textContent.includes(String(beforeMissing)));
  doc.getElementById('batchCoverStart').click();
  await wait(600);
  check('bulk scrape uses saved alias', calls.search.some(c => c.term === 'Elden Ring'));
  check('bulk scrape saves new cover with crop', gc.getGames().some(g => g.scrapeName === 'Elden Ring' && g.cover.startsWith('data:image/jpeg;')));
  check('bulk scrape skips inexact matches', doc.getElementById('batchCoverLog').textContent.includes('无准确名称匹配'));
  check('bulk batch completes and unlocks controls', !doc.getElementById('batchCoverSource').disabled &&
    doc.getElementById('batchCoverSummary').textContent.includes('已完成'));
  api.scrapeSearch = oldScrape;

  console.log(results.join('\n'));
  const failed = results.filter(r => r.startsWith('FAIL'));
  console.log('\nSUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(2); });
