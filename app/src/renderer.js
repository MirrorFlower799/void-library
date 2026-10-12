(function () {
  'use strict';

  /* ==================== 常量 ==================== */
  const api = window.voidLibrary;
  const { esc, namePinyin, textMatches, splitList, todayStr, toDateValue, formatDate, hoursToParts, formatDuration, formatReadTime, generateId, coverColors, coverLetter, coverSrc, shotSrc, charSrc, artSrc, starsHtml } = window.VoidUtils;
  const { normalizeCategory, normalizeStatus, normalizeGame, normalizeCharacter, normalizeShelf, normalizeBook, normalizeLibrary } = window.VoidModels;
  const { CHART_COLORS, statsByKey, renderBars, renderDonut, monthlySeries, monthlySeriesYear, renderLine, renderRecent } = window.VoidCharts;


  /* 内置分类：已移除“桌游”默认项 */
  const BUILTIN_CATEGORIES = ['电子游戏'];

  /* 默认状态建议（已删除“想玩”“已拥有”） */
  const DEFAULT_STATUSES = ['进行中', '已通关', '全成就', '弃坑'];

  /* 状态中文 → 徽章样式类 */
  const STATUS_CLASS_MAP = {
    '想玩': 'st-want',
    '已拥有': 'st-owned',
    '进行中': 'st-playing',
    '已通关': 'st-completed',
    '全成就': 'st-mastered',
    '弃坑': 'st-dropped'
  };

  const OUT_W = 640;
  const OUT_H = 360;

  const UNCAT = '__uncat__';

  /* ==================== 状态 ==================== */
  let games = [];
  let editingId = null;
  let deleteTargetId = null;
  let currentRating = 0;
  let currentCover = '';
  let currentShots = [];
  let currentGameId = '';
  let cropTarget = 'game';
  const flipped = {};   /* 翻转显示「目标与挑战」的卡片 id */
  let shotsQuery = '';
  let shotsCategory = 'all';
  let shotAddTargetId = null;
  let recentDoneCategory = 'all';
  let viewerItems = [];
  let viewerIndex = 0;
  let moveSourceId = null;
  let platformScopeCategory = 'all';
  let trendYear = 'recent';
  let settings = {};
  let isSource = 'steamgriddb';   /* 单条目刮削当前来源 */
  let isResult = null;            /* 当前选中的搜索结果 */
  let pendingImportToken = '';
  let importBusy = false;
  let batchCoverRunning = false;
  let batchCoverAbort = false;
  let characters = [];
  let charSearch = '';
  let editingCharId = null;
  let currentCharImage = '';
  let library = { shelves: [], books: [] };
  let curShelfId = 0;
  let expandedShelves = {};
  let bookSearch = '';
  let bookStatusFilter = '';
  let bookTagFilter = '';
  let ctxItems = [];
  let editingShelfId = null;
  let editingShelfParent = 0;
  let editingBookId = null;
  let avPages = [];
  let avIndex = 0;
  let avCurrentArt = null;
  let avFrame = null;
  let avBookMode = false;
  let avFixedLayout = false;
  let avFont = 18;
  let avTxtEl = null;
  let avScale = 1;
  let avFlow = 'paginated';
  let avColumns = 1;
  try { avColumns = localStorage.getItem('vl-reader-columns') === '2' ? 2 : 1; } catch (e) { /* no storage */ }
  let avTheme = 0;
  let avSaveTimer = null;
  let avRestore = null;
  let avSession = 0;
  let avPreloads = [];
  let avSeekFrame = null;
  let avReaderOpened = false;
  let avPageNo = 1;
  let avPageTotal = 0;
  let avCurrentLocation = null;
  let avDrawerTab = 'toc';
  let coverPickTarget = null;   /* {kind,id} */
  let currentCharShots = [];
  let galleryCharId = null;
  let gameShotsId = null;
  let charScrapeSource = 'bgm-char';
  let charScrapeResult = null;
  let cbSource = 'bgm-char';
  let cbWorks = [];
  let cbResults = [];
  let cbSelected = {};
  let cbAdjusted = {};
  let cropBatchId = '';
  let cbWorkResolved = '';


  const activeFilters = {
    category: 'all', status: 'all', platform: 'all',
    series: 'all', search: '', sort: 'date-desc'
  };

  /* ==================== DOM ==================== */
  const $ = function (id) { return document.getElementById(id); };
  const dom = {
    grid: $('gameGrid'),
    emptyState: $('emptyState'),
    noResult: $('noResult'),
    statTotal: $('statTotal'),
    statCompleted: $('statCompleted'),
    statPlaying: $('statPlaying'),
    statDropped: $('statDropped'),
    statRate: $('statRate'),
    statHours: $('statHours'),
    progressBar: $('progressBar'),
    statAvg: $('statAvg'),
    statAvgDone: $('statAvgDone'),
    statBacklog: $('statBacklog'),
    statLongest: $('statLongest'),
    chartStatus: $('chartStatus'),
    chartCategory: $('chartCategory'),
    chartRating: $('chartRating'),
    chartCompleted: $('chartCompleted'),
    trendYear: $('trendYear'),
    trendSummary: $('trendSummary'),
    platformScope: $('platformScope'),
    statsByPlatform: $('statsByPlatform'),
    recentDoneScope: $('recentDoneScope'),
    statsRecentDone: $('statsRecentDone'),
    searchInput: $('searchInput'),
    sortSelect: $('sortSelect'),
    dataDirHint: $('dataDirHint'),

    categoryRow: $('categoryRow'),
    statusRow: $('statusRow'),
    platformRow: $('platformRow'),
    seriesRow: $('seriesRow'),

    modal: $('gameModal'),
    modalTitle: $('modalTitle'),
    name: $('fName'),
    scrapeName: $('fScrapeName'),
    importModeModal: $('importModeModal'),
    importPreviewInfo: $('importPreviewInfo'),
    importModeHint: $('importModeHint'),
    importApplyBtn: $('importApplyBtn'),
    batchCoverModal: $('batchCoverModal'),
    batchCoverSource: $('batchCoverSource'),
    batchCoverSummary: $('batchCoverSummary'),
    batchCoverProgress: $('batchCoverProgress'),
    batchCoverLog: $('batchCoverLog'),
    batchCoverStart: $('batchCoverStart'),
    batchCoverCancel: $('batchCoverCancel'),
    category: $('fCategory'),
    platform: $('fPlatform'),
    series: $('fSeries'),
    status: $('fStatus'),
    hours: $('fHours'),
    minutes: $('fMinutes'),
    date: $('fDate'),
    shotsGrid: $('shotsGrid'),
    shotsAddBtn: $('shotsAddBtn'),
    shotsFolderBtn: $('shotsFolderBtn'),
    shotsFile: $('shotsFile'),
    shotsGallery: $('shotsGallery'),
    shotsScope: $('shotsScope'),
    shotsSearch: $('shotsSearch'),
    shotsImportBtn: $('shotsImportBtn'),
    shotsPageFile: $('shotsPageFile'),
    shotImportModal: $('shotImportModal'),
    shotImportGame: $('shotImportGame'),
    shotImportList: $('shotImportList'),
    shotImportConfirm: $('shotImportConfirm'),
    shotViewer: $('shotViewer'),
    shotViewerImg: $('shotViewerImg'),
    shotPrev: $('shotPrev'),
    shotNext: $('shotNext'),
    shotCounter: $('shotCounter'),
    shotClose: $('shotClose'),
    shotDelete: $('shotDelete'),
    shotMoveModal: $('shotMoveModal'),
    moveTargetName: $('moveTargetName'),
    moveTargetList: $('moveTargetList'),
    moveHint: $('moveHint'),
    moveConfirm: $('moveConfirm'),
    confirmModal: $('confirmModal'),
    confirmTitle: $('confirmTitle'),
    confirmMsg: $('confirmMsg'),
    confirmOk: $('confirmOk'),

    charSearch: $('charSearch'),
    charAddBtn: $('charAddBtn'),
    charGrid: $('charGrid'),
    charEmpty: $('charEmpty'),
    charModal: $('charModal'),
    charModalTitle: $('charModalTitle'),
    cName: $('cName'),
    cWork: $('cWork'),
    cPreview: $('cPreview'),
    cUploadBtn: $('cUploadBtn'),
    cRemoveBtn: $('cRemoveBtn'),
    cFile: $('cFile'),
    cSaveBtn: $('cSaveBtn'),
    cShotsGrid: $('cShotsGrid'),
    cShotsAddBtn: $('cShotsAddBtn'),
    cShotsFolderBtn: $('cShotsFolderBtn'),
    cShotsFile: $('cShotsFile'),
    csOpenBtn: $('csOpenBtn'),
    charScrapeModal: $('charScrapeModal'),
    csQuery: $('csQuery'),
    csWork: $('csWork'),
    csSearchBtn: $('csSearchBtn'),
    csSources: $('csSources'),
    csHint: $('csHint'),
    csResults: $('csResults'),
    csAssets: $('csAssets'),
    charGalleryTitle: $('charGalleryTitle'),
    charGallery: $('charGallery'),
    cgBackBtn: $('cgBackBtn'),
    cgAddBtn: $('cgAddBtn'),
    cgFolderBtn: $('cgFolderBtn'),
    cgHint: $('cgHint'),
    cgFile: $('cgFile'),
    gameShotsTitle: $('gameShotsTitle'),
    gameShots: $('gameShots'),
    gshBackBtn: $('gshBackBtn'),
    gshAddBtn: $('gshAddBtn'),
    gshFolderBtn: $('gshFolderBtn'),
    gshHint: $('gshHint'),
    gshFile: $('gshFile'),

    charBatchModal: $('charBatchModal'),
    cbWork: $('cbWork'),
    cbSearchBtn: $('cbSearchBtn'),
    cbSources: $('cbSources'),
    cbHint: $('cbHint'),
    cbList: $('cbList'),
    cbImportBtn: $('cbImportBtn'),

    cImgSearchBtn: $('cImgSearchBtn'),
    charImgSearchModal: $('charImgSearchModal'),
    ciQuery: $('ciQuery'),
    ciOpenBtn: $('ciOpenBtn'),
    ciHint: $('ciHint'),

    shelfTree: $('shelfTree'),
    shelfStats: $('shelfStats'),
    shelfCrumb: $('shelfCrumb'),
    shelfCount: $('shelfCount'),
    shelfBackBtn: $('shelfBackBtn'),
    shelfUpBtn: $('shelfUpBtn'),
    bookSearch: $('bookSearch'),
    bookStatusFilter: $('bookStatusFilter'),
    bookTagFilter: $('bookTagFilter'),
    bookClearFilter: $('bookClearFilter'),
    bookGrid: $('bookGrid'),
    bookEmpty: $('bookEmpty'),
    importBar: $('importBar'),
    importBarFill: $('importBarFill'),
    importText: $('importText'),
    libImportMenu: $('libImportMenu'),
    bookCtxMenu: $('bookCtxMenu'),
    shelfModal: $('shelfModal'),
    shelfModalTitle: $('shelfModalTitle'),
    shelfName: $('shelfName'),
    shelfParentHint: $('shelfParentHint'),
    bookModal: $('bookModal'),
    bookModalTitle: $('bookModalTitle'),
    bkTitle: $('bkTitle'),
    bkStatus: $('bkStatus'),
    bkTags: $('bkTags'),
    bkTagChips: $('bkTagChips'),
    bkTagSuggest: $('bkTagSuggest'),
    shTags: $('shTags'),
    shTagChips: $('shTagChips'),
    shTagSuggest: $('shTagSuggest'),
    bkShelf: $('bkShelf'),
    bkPath: $('bkPath'),
    moveModal: $('moveModal'),
    moveShelf: $('moveShelf'),

    shotAddMenu: $('shotAddMenu'),
    artViewer: $('artViewer'),
    avTitle: $('avTitle'),
    avCounter: $('avCounter'),
    avBody: $('avBody'),
    avPrev: $('avPrev'),
    avNext: $('avNext'),
    avOpenBtn: $('avOpenBtn'),
    avFontMinus: $('avFontMinus'),
    avFontPlus: $('avFontPlus'),
    avToc: $('avToc'),
    avGoto: $('avGoto'),
    avGotoBtn: $('avGotoBtn'),
    rvResetSize: $('rvResetSize'),
    rvAddBookmark: $('rvAddBookmark'),
    rvTabToc: $('rvTabToc'),
    rvTabBookmarks: $('rvTabBookmarks'),
    rvBookmarksList: $('rvBookmarksList'),
    avExit: $('avExit'),
    sidebarShelf: $('sidebarShelf'),
    rvTop: $('rvTop'),
    rvBottom: $('rvBottom'),
    rvDrawer: $('rvDrawer'),
    rvDrawerClose: $('rvDrawerClose'),
    rvTocBtn: $('rvTocBtn'),
    rvTocList: $('avTocList'),
    rvSlider: $('rvSlider'),
    rvCount: $('rvCount'),
    rvProgressFill: $('rvProgressFill'),
    rvFlow: $('rvFlow'),
    rvColumns: $('rvColumns'),
    rvTheme: $('rvTheme'),
    rvTapLeft: $('rvTapLeft'),
    rvTapRight: $('rvTapRight'),
    coverPickFile: $('coverPickFile'),

    starInput: $('starInput'),
    categorySuggest: $('categorySuggest'),
    statusSuggest: $('statusSuggest'),

    coverPreview: $('coverPreview'),
    coverFile: $('coverFile'),

    cropModal: $('cropModal'),
    cropStage: $('cropStage'),
    cropImg: $('cropImg'),
    cropZoom: $('cropZoom'),

    deleteModal: $('deleteModal'),
    deleteName: $('deleteName'),
    randomModal: $('randomModal'),
    randomPick: $('randomPick'),
    rCategory: $('rCategory'),
    rPlatform: $('rPlatform'),
    rSeries: $('rSeries'),
    rStatus: $('rStatus'),
    rMinRating: $('rMinRating'),
    rExcludeDone: $('rExcludeDone'),
    rPoolHint: $('rPoolHint'),

    settingsModal: $('settingsModal'),
    settingsBtn: $('settingsBtn'),
    settingsSaveBtn: $('settingsSaveBtn'),
    sSgdbKey: $('sSgdbKey'),
    sTmdbKey: $('sTmdbKey'),
    sBangumiToken: $('sBangumiToken'),
    settingsStatus: $('settingsStatus'),

    itemScrapeBtn: $('itemScrapeBtn'),
    itemScrapeModal: $('itemScrapeModal'),
    isQuery: $('isQuery'),
    isTranslateBtn: $('isTranslateBtn'),
    isSearchBtn: $('isSearchBtn'),
    isSources: $('isSources'),
    isHint: $('isHint'),
    isResults: $('isResults'),
    isAssets: $('isAssets')
  };

  /* ==================== 通用工具 ==================== */
  let toastTimer = null;
  function toast(msg) {
    const el = $('gcToast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  function openModal(el) {
    el.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(el) {
    el.classList.remove('show');
    const anyOpen = document.querySelectorAll('.modal-overlay.show').length > 0;
    document.body.style.overflow = anyOpen ? 'hidden' : '';
  }

  /* ==================== 分类 / 状态处理 ==================== */
  function getAllStatuses(list) {
    const src = list || games;
    const set = {};
    DEFAULT_STATUSES.forEach(function (s) { set[s] = true; });
    src.forEach(function (g) { if (g.status) set[g.status] = true; });

    const defaults = DEFAULT_STATUSES.filter(function (s) { return set[s]; });
    const others = Object.keys(set)
      .filter(function (s) { return DEFAULT_STATUSES.indexOf(s) === -1; })
      .sort(function (a, b) { return a.localeCompare(b, 'zh'); });
    return defaults.concat(others);
  }

  /* 当前分类下的记录（用于让状态 / 平台筛选随分类变化） */
  function categoryScope() {
    if (activeFilters.category === 'all') return games;
    return games.filter(function (g) { return g.category === activeFilters.category; });
  }

  /* 仅统计给定记录中实际存在的状态（不强制默认项） */
  function statusesFrom(list) {
    const set = {};
    list.forEach(function (g) { if (g.status) set[g.status] = true; });
    const defaults = DEFAULT_STATUSES.filter(function (s) { return set[s]; });
    const others = Object.keys(set)
      .filter(function (s) { return DEFAULT_STATUSES.indexOf(s) === -1; })
      .sort(function (a, b) { return a.localeCompare(b, 'zh'); });
    return defaults.concat(others);
  }

  /* ==================== 数据读写 ==================== */
  function sampleGames() {
    const d = function (offset) {
      const dt = new Date();
      dt.setDate(dt.getDate() - offset);
      const p = function (n) { return String(n).padStart(2, '0'); };
      return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate());
    };
    return [
      { id: generateId(), name: '艾尔登法环', category: '电子游戏', platform: 'Steam', genre: 'RPG', series: '魂系列', cover: '', status: '已通关', rating: 5, hours: 120, shots: [], dateAdded: d(60), dateCompleted: d(30) },
      { id: generateId(), name: '塞尔达传说 王国之泪', category: '电子游戏', platform: 'Nintendo Switch', genre: '冒险', series: '塞尔达传说', cover: '', status: '进行中', rating: 5, hours: 55, shots: [], dateAdded: d(14), dateCompleted: null },
      { id: generateId(), name: 'Hades', category: '电子游戏', platform: 'Steam', genre: 'Roguelike', series: 'Supergiant', cover: '', status: '全成就', rating: 5, hours: 180, shots: [], dateAdded: d(180), dateCompleted: d(90) },
      { id: generateId(), name: '赛博朋克2077', category: '电子游戏', platform: 'Steam', genre: 'RPG', series: '', cover: '', status: '弃坑', rating: 2, hours: 15, shots: [], dateAdded: d(400), dateCompleted: null },
      { id: generateId(), name: '三体', category: '书籍', platform: '纸质书', genre: '科幻', series: '地球往事', cover: '', status: '已通关', rating: 5, hours: 12, shots: [], dateAdded: d(120), dateCompleted: d(100) },
      { id: generateId(), name: '星际穿越', category: '影音', platform: '蓝光', genre: '科幻', series: '', cover: '', status: '全成就', rating: 5, hours: 3, shots: [], dateAdded: d(200), dateCompleted: d(150) }
    ].map(normalizeGame);
  }

  /* 通过主进程把数据写入 exe 同目录的 data.json */
  async function persist() {
    try {
      games = await api.save(games);
    } catch (e) {
      toast('保存失败：' + (e && e.message ? e.message : '未知错误'));
    }
  }

  async function commit() {
    await persist();
    renderAll();
  }

  /* ==================== 筛选 / 排序 ==================== */
  function getFilteredGames() {
    let list = games.slice();
    const f = activeFilters;

    if (f.category !== 'all') list = list.filter(function (g) { return g.category === f.category; });
    if (f.status !== 'all')   list = list.filter(function (g) { return g.status === f.status; });
    if (f.platform !== 'all') list = list.filter(function (g) { return g.platform === f.platform; });

    if (f.series !== 'all') {
      if (f.series === UNCAT) list = list.filter(function (g) { return splitList(g.series).length === 0; });
      else list = list.filter(function (g) { return splitList(g.series).indexOf(f.series) > -1; });
    }

    const q = f.search.trim().toLowerCase();
    if (q) {
      list = list.filter(function (g) {
        const text = [g.name, g.platform, g.series, g.category, g.status]
          .join(' ').toLowerCase();
        return textMatches(text, g.name || '', q);
      });
    }

    switch (f.sort) {
      case 'date-asc':       list.sort(function (a, b) { return a.dateAdded < b.dateAdded ? -1 : a.dateAdded > b.dateAdded ? 1 : 0; }); break;
      case 'name-asc':       list.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh'); }); break;
      case 'name-desc':      list.sort(function (a, b) { return b.name.localeCompare(a.name, 'zh'); }); break;
      case 'rating-desc':    list.sort(function (a, b) { return b.rating - a.rating; }); break;
      case 'hours-desc':     list.sort(function (a, b) { return (b.hours || 0) - (a.hours || 0); }); break;
      case 'completed-desc': list.sort(function (a, b) { return cmpCompleted(a, b, -1); }); break;
      case 'completed-asc':  list.sort(function (a, b) { return cmpCompleted(a, b, 1); }); break;
      default:               list.sort(function (a, b) { return a.dateAdded < b.dateAdded ? 1 : a.dateAdded > b.dateAdded ? -1 : 0; });
    }
    return list;
  }

  /* 按通关时间排序：dir<0 新→旧，dir>0 旧→新；无通关日期的一律排最后 */
  function cmpCompleted(a, b, dir) {
    const av = toDateValue(a.dateCompleted);
    const bv = toDateValue(b.dateCompleted);
    if (!av && !bv) return 0;
    if (!av) return 1;
    if (!bv) return -1;
    if (av === bv) return 0;
    return dir > 0 ? (av < bv ? -1 : 1) : (av < bv ? 1 : -1);
  }

  /* ==================== 渲染 ==================== */
  function renderStats() {
    const total = games.length;
    const isDone = function (g) { return g.status === '已通关' || g.status === '全成就'; };
    const completed = games.filter(isDone).length;
    const playing = games.filter(function (g) { return g.status === '进行中'; }).length;
    const dropped = games.filter(function (g) { return g.status === '弃坑'; }).length;
    const rate = total > 0 ? Math.round(completed / total * 100) : 0;
    const hours = games.reduce(function (s, g) { return s + (parseFloat(g.hours) || 0); }, 0);

    dom.statTotal.textContent = total;
    dom.statCompleted.textContent = completed;
    dom.statPlaying.textContent = playing;
    dom.statDropped.textContent = dropped;
    dom.statRate.textContent = rate + '%';
    dom.progressBar.style.width = rate + '%';
    dom.statHours.textContent = formatDuration(hours) || '0 小时';

    /* 时长分析 */
    const doneList = games.filter(isDone);
    const avg = games.length ? hours / games.length : 0;
    const doneHours = doneList.reduce(function (s, g) { return s + (g.hours || 0); }, 0);
    const avgDone = doneList.length ? doneHours / doneList.length : 0;
    const backlog = games.filter(function (g) { return !isDone(g) && g.status !== '弃坑'; }).length;
    let longest = null;
    games.forEach(function (g) { if (!longest || (g.hours || 0) > (longest.hours || 0)) longest = g; });

    dom.statAvg.textContent = formatDuration(avg) || '0 小时';
    dom.statAvgDone.textContent = formatDuration(avgDone) || '0 小时';
    dom.statBacklog.textContent = backlog;
    dom.statLongest.textContent = (longest && longest.hours > 0)
      ? (longest.name + ' · ' + formatDuration(longest.hours)) : '—';

    /* 图表：占比（扇形/环形）。已通关 + 全成就 合并为「已通关」 */
    const statusCounts = {};
    games.forEach(function (g) {
      const st = g.status || '未设置';
      const key = (st === '全成就') ? '已通关' : st;
      statusCounts[key] = (statusCounts[key] || 0) + 1;
    });
    const statusRows = Object.keys(statusCounts)
      .map(function (k) { return { key: k, count: statusCounts[k] }; })
      .sort(function (a, b) { return b.count - a.count || a.key.localeCompare(b.key, 'zh'); });
    renderDonut(dom.chartStatus, statusRows, CHART_COLORS);
    renderDonut(dom.chartCategory,
      statsByKey(games, function (g) { return g.category || '未分类'; }), CHART_COLORS);

    const ratingRows = [];
    for (let i = 5; i >= 1; i--) {
      const c = games.filter(function (g) { return (g.rating || 0) === i; }).length;
      if (c) ratingRows.push({ key: '★ ' + i, count: c });
    }
    const noRating = games.filter(function (g) { return !g.rating; }).length;
    if (noRating) ratingRows.push({ key: '未评分', count: noRating });
    renderDonut(dom.chartRating, ratingRows, CHART_COLORS);

    /* 平台数量：可按分类查看，避免游戏 / 影视混在一起 */
    const categories = statsByKey(games, function (g) { return g.category || '未分类'; })
      .map(function (r) { return r.key; });
    if (dom.platformScope) {
      let opts = '<option value="all">全部分类</option>';
      categories.forEach(function (c) {
        opts += '<option value="' + esc(c) + '">' + esc(c) + '</option>';
      });
      dom.platformScope.innerHTML = opts;
      if (platformScopeCategory !== 'all' && categories.indexOf(platformScopeCategory) === -1) {
        platformScopeCategory = 'all';
      }
      dom.platformScope.value = platformScopeCategory;
    }
    const platformGames = platformScopeCategory === 'all'
      ? games : games.filter(function (g) { return g.category === platformScopeCategory; });
    renderBars(dom.statsByPlatform,
      statsByKey(platformGames, function (g) { return g.platform || '未填写平台'; }), 12, CHART_COLORS);

    /* 图表：趋势（折线，标注每月数量，可按年/月查看） */
    const years = {};
    games.forEach(function (g) {
      const v = toDateValue(g.dateCompleted);
      if (v) years[v.slice(0, 4)] = true;
    });
    const yearList = Object.keys(years).sort().reverse();

    if (dom.trendYear) {
      let opts = '<option value="recent">近 12 个月</option>';
      yearList.forEach(function (y) { opts += '<option value="' + esc(y) + '">' + esc(y) + ' 年</option>'; });
      dom.trendYear.innerHTML = opts;
      if (trendYear !== 'recent' && yearList.indexOf(trendYear) === -1) trendYear = 'recent';
      dom.trendYear.value = trendYear;
    }
    const trendPoints = trendYear === 'recent'
      ? monthlySeries(games, 'dateCompleted', 12)
      : monthlySeriesYear(games, 'dateCompleted', Number(trendYear));
    renderLine(dom.chartCompleted, trendPoints, { values: true });

    if (dom.trendSummary) {
      const yearTotal = trendPoints.reduce(function (s, p) { return s + p.value; }, 0);
      dom.trendSummary.textContent = trendYear === 'recent'
        ? ('近 12 个月共通关 ' + yearTotal + ' 款')
        : (trendYear + ' 年共通关 ' + yearTotal + ' 款');
    }

    /* 最近通关：可按分类查看 */
    const catList = statsByKey(games, function (g) { return g.category || '未分类'; })
      .map(function (r) { return r.key; });
    if (dom.recentDoneScope) {
      let opts = '<option value="all">全部分类</option>';
      catList.forEach(function (c) { opts += '<option value="' + esc(c) + '">' + esc(c) + '</option>'; });
      dom.recentDoneScope.innerHTML = opts;
      if (recentDoneCategory !== 'all' && catList.indexOf(recentDoneCategory) === -1) {
        recentDoneCategory = 'all';
      }
      dom.recentDoneScope.value = recentDoneCategory;
    }
    const doneScope = recentDoneCategory === 'all'
      ? games : games.filter(function (g) { return g.category === recentDoneCategory; });
    const byDone = doneScope.filter(function (g) { return toDateValue(g.dateCompleted); })
      .sort(function (a, b) {
        return toDateValue(b.dateCompleted).localeCompare(toDateValue(a.dateCompleted));
      }).slice(0, 8);
    renderRecent(dom.statsRecentDone, byDone, 'dateCompleted');
  }

  function renderCategoryFilter() {
    const set = {};
    BUILTIN_CATEGORIES.forEach(function (c) { set[c] = true; });
    games.forEach(function (g) { if (g.category) set[g.category] = true; });

    const builtinPresent = BUILTIN_CATEGORIES.filter(function (c) { return set[c]; });
    const others = Object.keys(set)
      .filter(function (c) { return BUILTIN_CATEGORIES.indexOf(c) === -1; })
      .sort(function (a, b) { return a.localeCompare(b, 'zh'); });
    const list = builtinPresent.concat(others);

    if (activeFilters.category !== 'all' && list.indexOf(activeFilters.category) === -1) {
      activeFilters.category = 'all';
    }

    let html = '<span class="row-label">分类：</span>';
    html += '<span class="pill' + (activeFilters.category === 'all' ? ' active' : '') +
            '" data-category="all">全部</span>';
    list.forEach(function (c) {
      html += '<span class="pill' + (activeFilters.category === c ? ' active' : '') +
              '" data-category="' + esc(c) + '">' + esc(c) + '</span>';
    });
    dom.categoryRow.innerHTML = html;
    clampFilterRow(dom.categoryRow);
  }

  function renderStatusFilter() {
    /* 只显示当前分类下实际存在的状态 */
    const list = statusesFrom(categoryScope());

    if (activeFilters.status !== 'all' && list.indexOf(activeFilters.status) === -1) {
      activeFilters.status = 'all';
    }

    let html = '<span class="row-label">状态：</span>';
    html += '<span class="pill' + (activeFilters.status === 'all' ? ' active' : '') +
            '" data-status="all">全部状态</span>';
    list.forEach(function (s) {
      html += '<span class="pill' + (activeFilters.status === s ? ' active' : '') +
              '" data-status="' + esc(s) + '">' + esc(s) + '</span>';
    });
    dom.statusRow.innerHTML = html;
    clampFilterRow(dom.statusRow);
  }

  function renderPlatformFilter() {
    /* 只显示当前分类下实际存在的平台 */
    const set = {};
    categoryScope().forEach(function (g) { if (g.platform) set[g.platform] = true; });
    const list = Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'zh'); });

    if (activeFilters.platform !== 'all' && list.indexOf(activeFilters.platform) === -1) {
      activeFilters.platform = 'all';
    }

    let html = '<span class="row-label">平台：</span>';
    html += '<span class="pill' + (activeFilters.platform === 'all' ? ' active' : '') +
            '" data-platform="all">全部平台</span>';
    list.forEach(function (p) {
      html += '<span class="pill' + (activeFilters.platform === p ? ' active' : '') +
              '" data-platform="' + esc(p) + '">' + esc(p) + '</span>';
    });
    dom.platformRow.innerHTML = html;
    clampFilterRow(dom.platformRow);
  }

  function renderSeriesFilter() {
    /* 只显示当前分类下实际存在的系列 */
    const set = {};
    categoryScope().forEach(function (g) {
      splitList(g.series).forEach(function (v) { set[v] = true; });
    });
    const list = Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'zh'); });

    if (activeFilters.series !== 'all' && activeFilters.series !== UNCAT &&
        list.indexOf(activeFilters.series) === -1) {
      activeFilters.series = 'all';
    }

    let html = '<span class="row-label">系列：</span>';
    html += '<span class="pill pill-series' + (activeFilters.series === 'all' ? ' active' : '') +
            '" data-series="all">全部系列</span>';
    html += '<span class="pill pill-series' + (activeFilters.series === UNCAT ? ' active' : '') +
            '" data-series="' + UNCAT + '">未分类</span>';
    list.forEach(function (s) {
      html += '<span class="pill pill-series' +
              (activeFilters.series === s ? ' active' : '') +
              '" data-series="' + esc(s) + '">' + esc(s) + '</span>';
    });
    dom.seriesRow.innerHTML = html;
    clampFilterRow(dom.seriesRow);
  }

  function statusOptionsHtml(current) {
    const list = getAllStatuses();
    if (current && list.indexOf(current) === -1) list.push(current);
    let html = '<option value=""' + (!current ? ' selected' : '') + '>未设置</option>';
    html += list.map(function (s) {
      return '<option value="' + esc(s) + '"' + (s === current ? ' selected' : '') + '>' + esc(s) + '</option>';
    }).join('');
    return html;
  }

  function cardHtml(g) {
    const colors = coverColors(g.name);
    const letter = coverLetter(g.name);
    const sLabel = g.status || '未设置';
    const sCls = STATUS_CLASS_MAP[g.status] || 'st-default';
    const src = coverSrc(g.cover);

    const coverInner = src
      ? '<img class="cover-img" src="' + esc(src) + '" alt="">'
      : '<span class="cover-letter">' + esc(letter) + '</span>';

    const durText = formatDuration(g.hours);
    const hasHours = !!durText;
    const hoursText = hasHours ? '⏱ ' + durText : '⏱ 未记录时长';

    const dText = formatDate(g.dateCompleted);
    const hasDate = !!dText;
    const dateText = hasDate ? '🏁 ' + dText : '🏁 未通关';

    const goals = Array.isArray(g.goals) ? g.goals : [];
    const goalsHtml = goals.length
      ? goals.map(function (t) {
        return '<label class="goal-item' + (t.done ? ' done' : '') + '">' +
          '<input type="checkbox" class="js-goal-check" data-gid="' + esc(t.id) + '"' + (t.done ? ' checked' : '') + '>' +
          '<span class="gtext" title="' + esc(t.text) + '">' + esc(t.text) + '</span>' +
          '<button type="button" class="js-goal-del" data-gid="' + esc(t.id) + '" title="删除">✕</button>' +
          '</label>';
      }).join('')
      : '<div class="goal-empty">还没有目标 / 挑战，下面添加。</div>';

    return '' +
      '<article class="game-card' + (flipped[g.id] ? ' flipped' : '') + '" data-id="' + esc(g.id) + '">' +
        '<div class="card-inner">' +
          '<div class="card-face card-front">' +
            '<div class="cover" style="background:linear-gradient(135deg,' + colors[0] + ',' + colors[1] + ')">' +
              coverInner +
            '</div>' +
            '<div class="card-body">' +
              '<div class="name-row">' +
                '<div class="game-name" title="' + esc(g.name) + '">' + esc(g.name) + '</div>' +
                '<button class="icon-btn js-flip" title="目标与挑战">🎯</button>' +
              '</div>' +
              '<div class="meta">' +
                (g.platform ? '<span class="badge">' + esc(g.platform) + '</span>' : '') +
                splitList(g.series).map(function (v) {
                  return '<span class="badge badge-series">' + esc(v) + '</span>';
                }).join('') +
              '</div>' +
              '<div class="row-between">' +
                '<span class="status-badge ' + sCls + '">' + esc(sLabel) + '</span>' +
                '<span class="stars">' + starsHtml(g.rating) + '</span>' +
              '</div>' +
              '<div class="mini' + (hasHours ? '' : ' mini-empty') + '" title="' + esc(hoursText) + '">' + esc(hoursText) + '</div>' +
              '<div class="mini' + (hasDate ? '' : ' mini-empty') + '" title="' + esc(dateText) + '">' + esc(dateText) + '</div>' +
              '<div class="actions">' +
                '<button class="btn btn-outline btn-sm js-edit">✏️ 编辑</button>' +
                '<button class="btn btn-outline btn-sm js-del" title="删除">🗑️</button>' +
                '<select class="status-select js-status" title="快速切换状态">' +
                  statusOptionsHtml(g.status) +
                '</select>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="card-face card-back">' +
            '<div class="back-head"><span class="back-name" title="' + esc(g.name) + '">' + esc(g.name) + '</span>' +
              '<button class="icon-btn js-flip" title="返回">↩</button></div>' +
            '<div class="goal-list">' + goalsHtml + '</div>' +
            '<div class="goal-add">' +
              '<input type="text" class="js-goal-input" placeholder="添加目标 / 挑战…" maxlength="80">' +
              '<button type="button" class="btn btn-outline btn-sm js-goal-add">＋</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function renderCards() {
    const list = getFilteredGames();

    if (games.length === 0) {
      dom.grid.innerHTML = '';
      dom.grid.classList.add('hidden');
      dom.emptyState.classList.remove('hidden');
      dom.noResult.classList.add('hidden');
      return;
    }

    dom.emptyState.classList.add('hidden');

    if (list.length === 0) {
      dom.grid.innerHTML = '';
      dom.grid.classList.add('hidden');
      dom.noResult.classList.remove('hidden');
      return;
    }

    dom.noResult.classList.add('hidden');
    dom.grid.classList.remove('hidden');
    dom.grid.innerHTML = list.map(cardHtml).join('');
  }

  function renderDatalists() {
    const cSet = {};
    BUILTIN_CATEGORIES.forEach(function (v) { cSet[v] = true; });
    games.forEach(function (g) { if (g.category) cSet[g.category] = true; });
    dom.categorySuggest.innerHTML = Object.keys(cSet)
      .map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join('');

    dom.statusSuggest.innerHTML = getAllStatuses()
      .map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join('');
  }

  /* 表单中「平台 / 系列」的候选值：
     列出时（无搜索词）只给当前分类的值；一旦输入搜索词，则跨所有分类搜索，
     这样当前分类没有、但其他分类存在的项（如其他分类下的“马里奥”）也能被搜到。 */
  function formValuesFor(catVal, pick, all) {
    const cat = all ? '' : String(catVal || '').trim().toLowerCase();
    const set = {};
    games.forEach(function (g) {
      if (cat && (g.category || '').toLowerCase() !== cat) return;
      pick(g).forEach(function (v) { if (v) set[v] = true; });
    });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'zh'); });
  }

  /* 自定义自动补全（最多约 5 条，超出可滚动；支持拼音） */
  function attachAutocomplete(input, getValues) {
    if (!input) return;
    const wrap = document.createElement('div');
    wrap.className = 'ac-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const list = document.createElement('div');
    list.className = 'ac-list hidden';
    wrap.appendChild(list);

    let items = [];
    let active = -1;

    function paint() {
      list.innerHTML = items.map(function (v, i) {
        return '<div class="ac-item' + (i === active ? ' active' : '') + '" data-i="' + i + '">' + esc(v) + '</div>';
      }).join('');
    }
    function render() {
      const q = String(input.value || '').trim().toLowerCase();
      items = (getValues(q) || []).filter(function (v) {
        return !q || v.toLowerCase().indexOf(q) > -1 || namePinyin(v).indexOf(q) > -1;
      });
      if (!items.length) { list.classList.add('hidden'); list.innerHTML = ''; active = -1; return; }
      active = -1;
      paint();
      list.classList.remove('hidden');
    }
    function choose(i) {
      if (i < 0 || i >= items.length) return;
      input.value = items[i];
      list.classList.add('hidden');
    }

    input.addEventListener('focus', render);
    input.addEventListener('input', render);
    input.addEventListener('keydown', function (e) {
      if (list.classList.contains('hidden')) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); paint(); }
      else if (e.key === 'Enter') { if (active >= 0) { e.preventDefault(); choose(active); } }
      else if (e.key === 'Escape') { list.classList.add('hidden'); }
    });
    input.addEventListener('blur', function () { setTimeout(function () { list.classList.add('hidden'); }, 150); });
    list.addEventListener('mousedown', function (e) {
      e.preventDefault();
      const it = e.target.closest('.ac-item');
      if (it) choose(Number(it.dataset.i));
    });
  }

  /* 词条 chips 编辑器（回车添加、可删除、带建议，与平台/系列体验一致） */
  function makeTagEditor(chipsEl, inputEl, suggestEl, getValues) {
    let tags = [];
    let items = [];
    let active = -1;
    function render() {
      if (!chipsEl) return;
      chipsEl.innerHTML = tags.map(function (t, i) {
        return '<span class="tag-chip">' + esc(t) + '<button type="button" class="tag-x" data-i="' + i + '">✕</button></span>';
      }).join('');
    }
    function paint() {
      if (!suggestEl) return;
      suggestEl.innerHTML = items.map(function (v, i) {
        return '<div class="ac-item' + (i === active ? ' active' : '') + '" data-i="' + i + '">' + esc(v) + '</div>';
      }).join('');
    }
    function renderSug() {
      if (!suggestEl) return;
      const q = String(inputEl.value || '').trim().toLowerCase();
      items = (getValues() || []).filter(function (v) {
        return tags.indexOf(v) === -1 && (!q || v.toLowerCase().indexOf(q) > -1 || namePinyin(v).indexOf(q) > -1);
      });
      if (!items.length) { suggestEl.classList.add('hidden'); suggestEl.innerHTML = ''; active = -1; return; }
      active = -1; paint(); suggestEl.classList.remove('hidden');
    }
    function add(t) {
      t = String(t || '').trim();
      if (!t) return;
      if (tags.indexOf(t) === -1) tags.push(t);
      render();
    }
    inputEl.addEventListener('focus', renderSug);
    inputEl.addEventListener('input', renderSug);
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
        e.preventDefault();
        if (active >= 0 && items[active]) add(items[active]); else add(inputEl.value);
        inputEl.value = ''; renderSug(); return;
      }
      if (e.key === 'Backspace' && !inputEl.value && tags.length) { tags.pop(); render(); return; }
      if (suggestEl && !suggestEl.classList.contains('hidden')) {
        if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); paint(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); paint(); }
        else if (e.key === 'Escape') { suggestEl.classList.add('hidden'); }
      }
    });
    inputEl.addEventListener('blur', function () { setTimeout(function () { if (suggestEl) suggestEl.classList.add('hidden'); }, 150); });
    if (suggestEl) {
      suggestEl.addEventListener('mousedown', function (e) {
        e.preventDefault();
        const it = e.target.closest('.ac-item');
        if (!it) return;
        add(items[Number(it.dataset.i)]);
        inputEl.value = ''; renderSug(); inputEl.focus();
      });
    }
    if (chipsEl) {
      chipsEl.addEventListener('click', function (e) {
        const b = e.target.closest('.tag-x');
        if (!b) return;
        tags.splice(Number(b.dataset.i), 1);
        render();
      });
    }
    return {
      set: function (list) { tags = (list || []).slice(); render(); },
      value: function () { return tags.join(','); },
      add: add
    };
  }
  const bookTagEditor = makeTagEditor(dom.bkTagChips, dom.bkTags, dom.bkTagSuggest, function () { return allTags(); });
  const shelfTagEditor = makeTagEditor(dom.shTagChips, dom.shTags, dom.shTagSuggest, function () { return allTags(); });

  function renderAll() {
    renderStats();
    renderCategoryFilter();
    renderStatusFilter();
    renderPlatformFilter();
    renderSeriesFilter();
    renderDatalists();
    renderCards();
    clampAllFilterRows();
    renderShotsPage();
  }

  /* 筛选行最多显示两行，超出的行折叠为「…」 */
  function clampFilterRow(row) {
    if (!row) return;

    /* 先复位：移除折叠/展开按钮，恢复所有词条显示 */
    Array.prototype.slice.call(row.querySelectorAll('.row-toggle-pill, .row-collapse'))
      .forEach(function (b) { b.remove(); });
    const pills = Array.prototype.slice.call(row.querySelectorAll('.pill'));
    pills.forEach(function (p) { p.style.display = ''; });
    if (!pills.length) return;

    /* 依据各 pill 的纵向偏移判断行数（无布局信息时均为 0，直接跳过） */
    const tops = {};
    pills.forEach(function (p) { tops[p.offsetTop] = true; });
    const uniqueTops = Object.keys(tops).map(Number).sort(function (a, b) { return a - b; });
    if (uniqueTops.length <= 2) return;

    /* 保留前两行：隐藏第二行之后的词条，并用「…」胶囊替换第二行最后一个 */
    const line2Top = uniqueTops[1];
    const firstTwo = pills.filter(function (p) { return p.offsetTop <= line2Top; });
    const rest = pills.filter(function (p) { return p.offsetTop > line2Top; });
    if (firstTwo.length < 1) return;
    const lastPill = firstTwo[firstTwo.length - 1];

    rest.forEach(function (p) { p.style.display = 'none'; });
    lastPill.style.display = 'none';

    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'pill row-toggle-pill';
    more.textContent = '…';
    more.title = '展开全部';
    lastPill.parentNode.insertBefore(more, lastPill);

    more.addEventListener('click', function (ev) {
      ev.stopPropagation();
      /* 展开：显示全部词条，并把「收起」胶囊放到行尾 */
      Array.prototype.slice.call(row.querySelectorAll('.pill')).forEach(function (p) { p.style.display = ''; });
      more.remove();
      const less = document.createElement('button');
      less.type = 'button';
      less.className = 'pill row-collapse';
      less.textContent = '收起';
      less.title = '收起';
      row.appendChild(less);
      less.addEventListener('click', function (e2) {
        e2.stopPropagation();
        clampFilterRow(row);
      });
    });
  }

  function clampAllFilterRows() {
    clampFilterRow(dom.categoryRow);
    clampFilterRow(dom.statusRow);
    clampFilterRow(dom.platformRow);
    clampFilterRow(dom.seriesRow);
  }

  /* 侧边栏页面切换 */
  function showPage(name) {
    const navName = (name === 'charGallery') ? 'characters' : (name === 'gameShots' ? 'library' : name);
    Array.prototype.forEach.call(document.querySelectorAll('.nav-btn'), function (b) {
      b.classList.toggle('active', b.dataset.page === navName);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.page'), function (p) {
      p.classList.toggle('hidden', p.id !== 'page-' + name);
    });
    /* 侧边栏下半部分（书架操作/系列树）仅资料集页面显示 */
    if (dom.sidebarShelf) dom.sidebarShelf.classList.toggle('hidden', name !== 'arts');
    if (name === 'library') clampAllFilterRows();
    else if (name === 'shots') renderShotsPage();
    else if (name === 'characters') renderCharacters();
    else if (name === 'charGallery') renderCharGallery();
    else if (name === 'gameShots') renderGameShots();
    else if (name === 'arts') renderLibrary();
    else renderStats();
  }

  /* ==================== 封面预览 ==================== */
  function updateCoverPreview() {
    const src = coverSrc(currentCover);
    if (src) {
      dom.coverPreview.innerHTML = '<img src="' + esc(src) + '" alt="">';
    } else {
      dom.coverPreview.innerHTML = '<span class="cover-empty">无封面</span>';
    }
  }

  /* ==================== 截图 ==================== */
  function renderShotsEditor() {
    if (!dom.shotsGrid) return;
    if (!currentShots.length) {
      dom.shotsGrid.innerHTML = '<div class="shots-empty">暂无截图</div>';
      return;
    }
    dom.shotsGrid.innerHTML = currentShots.map(function (s, i) {
      return '<div class="shot-thumb"><img src="' + esc(shotSrc(s, currentGameId)) + '" alt="">' +
        '<button type="button" class="shot-remove" data-idx="' + i + '" title="移除">✕</button></div>';
    }).join('');
  }

  function addShotDataUrl(dataUrl) {
    if (!dataUrl) return;
    currentShots.push(dataUrl);
    renderShotsEditor();
  }

  function handleShotsFiles(files) {
    const list = Array.prototype.slice.call(files || []);
    if (!list.length) return;
    let pending = list.length;
    function done() { pending--; if (pending <= 0) toast('已添加截图（保存后生效）'); }
    list.forEach(function (file) {
      if (!/^image\//.test(file.type)) { done(); return; }
      const reader = new FileReader();
      reader.onload = function (e) { addShotDataUrl(e.target.result); done(); };
      reader.onerror = function () { done(); };
      reader.readAsDataURL(file);
    });
  }

  function shotsFilteredGroups() {
    const q = shotsQuery.trim().toLowerCase();
    return games.filter(function (g) {
      if (!g.shots || !g.shots.length) return false;
      if (shotsCategory !== 'all' && (g.category || '未分类') !== shotsCategory) return false;
      if (q && !textMatches((g.name || '').toLowerCase(), g.name || '', q)) return false;
      return true;
    });
  }

  function renderShotsPage() {
    if (!dom.shotsGallery) return;

    /* 标题右侧的分类筛选 */
    if (dom.shotsScope) {
      const withShots = games.filter(function (g) { return g.shots && g.shots.length; });
      const cats = statsByKey(withShots, function (g) { return g.category || '未分类'; })
        .map(function (r) { return r.key; });
      let opts = '<option value="all">全部分类</option>';
      cats.forEach(function (c) { opts += '<option value="' + esc(c) + '">' + esc(c) + '</option>'; });
      dom.shotsScope.innerHTML = opts;
      if (shotsCategory !== 'all' && cats.indexOf(shotsCategory) === -1) shotsCategory = 'all';
      dom.shotsScope.value = shotsCategory;
    }

    const groups = shotsFilteredGroups();

    if (!groups.length) {
      dom.shotsGallery.innerHTML = shotsQuery
        ? '<div class="shots-none">没有匹配的截图。</div>'
        : '<div class="shots-none">还没有任何截图。可在添加/编辑条目时上传、扫描文件夹导入，或在线刮削时点击图片上的「＋截图」。</div>';
      return;
    }

    dom.shotsGallery.innerHTML = groups.map(function (g) {
      const items = g.shots.map(function (s, i) {
        const src = shotSrc(s, g.id);
        return '<div class="shot-strip-item" data-src="' + esc(src) + '">' +
          '<img src="' + esc(src) + '" loading="lazy" alt="">' +
          '<button type="button" class="shot-del" data-game="' + esc(g.id) + '" data-idx="' + i + '" title="删除">✕</button>' +
          '</div>';
      }).join('');
      return '<div class="shot-group" data-id="' + esc(g.id) + '">' +
        '<div class="shot-group-name"><span class="nm">' + esc(g.name) + '</span>' +
        '<span class="cnt">' + g.shots.length + ' 张</span>' +
        '<span class="shot-group-actions">' +
          '<button type="button" class="btn btn-outline btn-sm js-shot-add" data-id="' + esc(g.id) + '">＋ 添加</button>' +
          '<button type="button" class="btn btn-outline btn-sm js-shot-openfolder" data-id="' + esc(g.id) + '" title="打开该游戏的截图文件夹">📂 打开文件夹</button>' +
          '<button type="button" class="btn btn-outline btn-sm js-shot-move" data-id="' + esc(g.id) + '">↪ 转移</button>' +
          '<button type="button" class="btn btn-outline btn-sm js-shot-clear" data-id="' + esc(g.id) + '">🗑 清空</button>' +
        '</span></div>' +
        '<div class="shot-strip">' + items + '</div>' +
        '</div>';
    }).join('');
  }

  function openShotViewer(items, index) {
    viewerItems = items || [];
    viewerIndex = index || 0;
    renderShotViewer();
    openModal(dom.shotViewer);
  }

  function renderShotViewer() {
    if (!viewerItems.length) return;
    if (viewerIndex < 0) viewerIndex = viewerItems.length - 1;
    if (viewerIndex >= viewerItems.length) viewerIndex = 0;
    const it = viewerItems[viewerIndex];
    dom.shotViewerImg.src = (typeof it === 'string') ? it : it.src;
    dom.shotCounter.textContent = (viewerIndex + 1) + ' / ' + viewerItems.length;
  }

  function stepShotViewer(delta) {
    if (!viewerItems.length) return;
    viewerIndex += delta;
    renderShotViewer();
  }

  /* 通用确认弹窗，返回 Promise<boolean>（带重入保护，避免重复删除） */
  let confirmResolver = null;
  function confirmDialog(message, title) {
    if (confirmResolver) return Promise.resolve(false);
    dom.confirmTitle.textContent = title || '确认操作？';
    dom.confirmMsg.textContent = message || '';
    openModal(dom.confirmModal);
    return new Promise(function (resolve) { confirmResolver = resolve; });
  }
  function closeConfirm(result) {
    if (!confirmResolver) return;
    const r = confirmResolver;
    confirmResolver = null;
    closeModal(dom.confirmModal);
    r(result);
  }

  /* 用名称解析游戏（支持模糊） */
  function resolveGameByName(name) {
    const q = String(name || '').trim().toLowerCase();
    if (!q) return null;
    let g = games.find(function (x) { return (x.name || '').toLowerCase() === q; });
    if (g) return g;
    g = games.find(function (x) { return (x.name || '').toLowerCase().indexOf(q) > -1; });
    return g || null;
  }

  async function deleteShotAt(gameId, idx) {
    const g = games.find(function (x) { return x.id === gameId; });
    if (!g || !Array.isArray(g.shots) || idx < 0 || idx >= g.shots.length) return false;
    const ok = await confirmDialog('确定删除这张截图吗？此操作不可恢复。', '删除截图');
    if (!ok) return false;
    g.shots.splice(idx, 1);
    await commit();
    renderShotsPage();
    toast('已删除截图');
    return true;
  }

  async function deleteViewerShot() {
    const it = viewerItems[viewerIndex];
    if (!it || typeof it === 'string') return;
    const ok = await confirmDialog('确定删除这张截图吗？此操作不可恢复。', '删除截图');
    if (!ok) return;
    const g = games.find(function (x) { return x.id === it.gameId; });
    if (g && Array.isArray(g.shots)) {
      g.shots.splice(it.idx, 1);
      await commit();
      renderShotsPage();
      toast('已删除截图');
    }
    closeModal(dom.shotViewer);
  }

  async function clearGameShots(gameId) {
    const g = games.find(function (x) { return x.id === gameId; });
    if (!g || !g.shots || !g.shots.length) return;
    const ok = await confirmDialog('确定删除「' + g.name + '」的全部 ' + g.shots.length + ' 张截图吗？', '清空截图');
    if (!ok) return;
    g.shots = [];
    await commit();
    renderShotsPage();
    toast('已清空截图');
  }

  function openShotMove(gameId) {
    moveSourceId = gameId;
    const src = games.find(function (x) { return x.id === gameId; });
    let opts = '';
    games.forEach(function (g) {
      if (g.id === gameId) return;
      opts += '<option value="' + esc(g.name) + '"></option>';
    });
    dom.moveTargetList.innerHTML = opts;
    dom.moveTargetName.value = '';
    dom.moveHint.textContent = src
      ? ('把「' + src.name + '」的 ' + (src.shots ? src.shots.length : 0) + ' 张截图转移到目标游戏。')
      : '';
    openModal(dom.shotMoveModal);
    setTimeout(function () { dom.moveTargetName.focus(); }, 60);
  }

  async function confirmShotMove() {
    const src = games.find(function (x) { return x.id === moveSourceId; });
    const target = resolveGameByName(dom.moveTargetName.value);
    if (!src) { closeModal(dom.shotMoveModal); return; }
    if (!target) { toast('未找到目标游戏，请输入更准确的名称'); return; }
    if (target.id === src.id) { toast('目标与来源相同'); return; }
    if (!src.shots || !src.shots.length) { closeModal(dom.shotMoveModal); return; }
    if (!Array.isArray(target.shots)) target.shots = [];
    const moved = src.shots.length;
    target.shots = target.shots.concat(src.shots);
    src.shots = [];
    await commit();
    renderShotsPage();
    closeModal(dom.shotMoveModal);
    toast('已转移 ' + moved + ' 张截图到「' + target.name + '」');
  }

  /* 从文件夹导入截图 */
  function openShotImport() {
    if (!games.length) { toast('还没有收藏任何内容'); return; }
    let opts = '';
    games.forEach(function (g) { opts += '<option value="' + esc(g.name) + '"></option>'; });
    dom.shotImportList.innerHTML = opts;
    dom.shotImportGame.value = '';
    openModal(dom.shotImportModal);
    setTimeout(function () { dom.shotImportGame.focus(); }, 60);
  }

  function addShotsToGame(gameId, items) {
    const g = games.find(function (x) { return x.id === gameId; });
    if (!g) return;
    if (!Array.isArray(g.shots)) g.shots = [];
    g.shots = g.shots.concat(items || []);
  }

  async function importShotsToGame(gameId) {
    const res = await api.importShotsFolder(gameId);
    if (!res || res.canceled) return;
    if (!res.ok) { toast('导入失败：' + ((res && res.error) || '未知错误')); return; }
    addShotsToGame(gameId, res.shots || []);
    await commit();
    renderShotsPage();
    toast('已导入 ' + (res.count || 0) + ' 张截图');
  }

  async function importShotsToGamePage(gameId) {
    const res = await api.importShotsFolder(gameId);
    if (!res || res.canceled) return;
    if (!res.ok) { toast('导入失败：' + ((res && res.error) || '未知错误')); return; }
    addShotsToGame(gameId, res.shots || []);
    await commit();
    renderShotsPage();
    toast('已导入 ' + (res.count || 0) + ' 张截图');
  }

  async function importShotsToCurrent() {
    const res = await api.importShotsFolder(currentGameId);
    if (!res || res.canceled) return;
    if (!res.ok) { toast('导入失败：' + ((res && res.error) || '未知错误')); return; }
    currentShots = currentShots.concat(res.shots || []);
    renderShotsEditor();
    toast('已导入 ' + (res.count || 0) + ' 张截图（保存后生效）');
  }

  /* 截图页「＋ 添加」弹出菜单：选择图片 / 从文件夹导入 */
  function openShotAddMenu(gameId, x, y) {
    shotAddTargetId = gameId;
    dom.shotAddMenu.classList.remove('hidden');
    dom.shotAddMenu.style.left = Math.min(x, window.innerWidth - 180) + 'px';
    dom.shotAddMenu.style.top = Math.min(y, window.innerHeight - 90) + 'px';
  }
  function closeShotAddMenu() { dom.shotAddMenu.classList.add('hidden'); }

  /* ==================== 裁剪器 ==================== */
  const crop = {
    natW: 0, natH: 0,
    stageW: 0, stageH: 0,
    baseScale: 1,
    zoom: 1,
    offsetX: 0, offsetY: 0,
    dragging: false,
    startX: 0, startY: 0, startOffX: 0, startOffY: 0,
    ready: false,
    contain: false,
    outW: 640, outH: 360
  };

  function clampOffsets() {
    const s = crop.baseScale * crop.zoom;
    const dw = crop.natW * s;
    const dh = crop.natH * s;
    /* contain：允许留白（图不超出画布）；cover：填满画布不露边 */
    const minX = dw <= crop.stageW ? 0 : crop.stageW - dw;
    const maxX = dw <= crop.stageW ? crop.stageW - dw : 0;
    const minY = dh <= crop.stageH ? 0 : crop.stageH - dh;
    const maxY = dh <= crop.stageH ? crop.stageH - dh : 0;
    crop.offsetX = Math.min(maxX, Math.max(minX, crop.offsetX));
    crop.offsetY = Math.min(maxY, Math.max(minY, crop.offsetY));
  }

  function applyCropTransform() {
    const s = crop.baseScale * crop.zoom;
    dom.cropImg.style.width = crop.natW + 'px';
    dom.cropImg.style.height = crop.natH + 'px';
    dom.cropImg.style.transformOrigin = '0 0';
    dom.cropImg.style.transform =
      'translate(' + crop.offsetX + 'px,' + crop.offsetY + 'px) scale(' + s + ')';
  }

  function layoutCrop() {
    const rect = dom.cropStage.getBoundingClientRect();
    crop.stageW = rect.width;
    crop.stageH = rect.height;
    if (!crop.stageW || !crop.stageH || !crop.natW || !crop.natH) return;

    crop.baseScale = crop.contain
      ? Math.min(crop.stageW / crop.natW, crop.stageH / crop.natH)
      : Math.max(crop.stageW / crop.natW, crop.stageH / crop.natH);
    const dw = crop.natW * crop.baseScale * crop.zoom;
    const dh = crop.natH * crop.baseScale * crop.zoom;
    crop.offsetX = (crop.stageW - dw) / 2;
    crop.offsetY = (crop.stageH - dh) / 2;
    crop.ready = true;
    applyCropTransform();
  }

  function setCropZoom(z) {
    if (!crop.ready) return;
    z = Math.max(1, Math.min(4, z));
    const oldS = crop.baseScale * crop.zoom;
    const newS = crop.baseScale * z;
    const cx = (crop.stageW / 2 - crop.offsetX) / oldS;
    const cy = (crop.stageH / 2 - crop.offsetY) / oldS;
    crop.zoom = z;
    crop.offsetX = crop.stageW / 2 - cx * newS;
    crop.offsetY = crop.stageH / 2 - cy * newS;
    clampOffsets();
    applyCropTransform();
    dom.cropZoom.value = z;
  }

  function openCropper(dataUrl, target) {
    cropTarget = target || 'game';
    /* 角色图片默认「完整显示」（contain），避免自动放大裁剪 */
    crop.contain = (cropTarget === 'char' || cropTarget === 'batchchar');
    /* 书籍/系列封面为竖版 5:7，其它为 16:9 */
    if (cropTarget === 'libcover') {
      crop.outW = 500; crop.outH = 700;
      if (dom.cropStage) dom.cropStage.style.aspectRatio = '5 / 7';
    } else {
      crop.outW = 640; crop.outH = 360;
      if (dom.cropStage) dom.cropStage.style.aspectRatio = '16 / 9';
    }
    const tmp = new Image();
    tmp.onload = function () {
      if (!tmp.naturalWidth || !tmp.naturalHeight) { toast('无法读取图片尺寸'); return; }
      crop.natW = tmp.naturalWidth;
      crop.natH = tmp.naturalHeight;
      crop.zoom = 1;
      crop.ready = false;
      dom.cropZoom.value = 1;

      dom.cropImg.removeAttribute('src');
      dom.cropImg.src = dataUrl;

      openModal(dom.cropModal);
      requestAnimationFrame(function () {
        requestAnimationFrame(layoutCrop);
      });
    };
    tmp.onerror = function () { toast('图片加载失败'); };
    tmp.src = dataUrl;
  }

  function confirmCrop() {
    if (!crop.ready) { closeModal(dom.cropModal); return; }

    const OUTW = crop.outW || OUT_W;
    const OUTH = crop.outH || OUT_H;
    const canvas = document.createElement('canvas');
    canvas.width = OUTW;
    canvas.height = OUTH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, OUTW, OUTH);

    const k = OUTW / crop.stageW;
    const s = crop.baseScale * crop.zoom;

    try {
      ctx.drawImage(
        dom.cropImg,
        crop.offsetX * k,
        crop.offsetY * k,
        crop.natW * s * k,
        crop.natH * s * k
      );
    } catch (err) {
      toast('裁剪失败，请重试');
      return;
    }

    let dataUrl;
    try {
      dataUrl = canvas.toDataURL('image/jpeg', 0.72);
    } catch (err) {
      toast('封面生成失败');
      return;
    }

    if (cropTarget === 'char') {
      currentCharImage = dataUrl;
      updateCharPreview();
    } else if (cropTarget === 'batchchar') {
      cbAdjusted[cropBatchId] = dataUrl;
      updateCbThumb(cropBatchId, dataUrl);
    } else if (cropTarget === 'libcover') {
      applyPickedCover(dataUrl);
    } else {
      currentCover = dataUrl;
      updateCoverPreview();
    }
    closeModal(dom.cropModal);
    toast('封面已应用');
  }

  function handleCoverFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('请选择图片文件'); return; }
    if (file.size > 12 * 1024 * 1024) { toast('图片过大，请选择 12MB 以内的图片'); return; }

    const reader = new FileReader();
    reader.onload = function (e) { openCropper(e.target.result, 'game'); };
    reader.onerror = function () { toast('读取文件失败'); };
    reader.readAsDataURL(file);
  }

  /* ==================== 弹窗：添加/编辑 ==================== */
  function setRatingUI(rating) {
    currentRating = rating;
    const stars = dom.starInput.children;
    for (let i = 0; i < stars.length; i++) {
      const v = Number(stars[i].dataset.star);
      stars[i].classList.toggle('on', v <= rating);
    }
  }

  function setDurationInput(hours) {
    const p = hoursToParts(hours);
    dom.hours.value = p.h > 0 ? String(p.h) : '';
    dom.minutes.value = p.m > 0 ? String(p.m) : '';
  }

  function openGameModal(id) {
    editingId = id || null;
    currentGameId = id || generateId();

    dom.name.value = '';
    dom.scrapeName.value = '';
    dom.category.value = '';
    dom.platform.value = '';
    dom.series.value = '';
    dom.status.value = '';
    dom.hours.value = '';
    dom.minutes.value = '';
    dom.date.value = '';
    setRatingUI(0);
    currentCover = '';
    currentShots = [];
    updateCoverPreview();
    renderShotsEditor();

    if (id) {
      const g = games.find(function (x) { return x.id === id; });
      if (g) {
        dom.modalTitle.textContent = '编辑';
        dom.name.value = g.name;
        dom.scrapeName.value = g.scrapeName || '';
        dom.category.value = g.category || '';
        dom.platform.value = g.platform || '';
        dom.series.value = g.series || '';
        dom.status.value = g.status || '';
        setDurationInput(g.hours);
        dom.date.value = toDateValue(g.dateCompleted);
        setRatingUI(g.rating || 0);
        currentCover = g.cover || '';
        currentShots = (g.shots || []).slice();
        updateCoverPreview();
        renderShotsEditor();
      }
    } else {
      dom.modalTitle.textContent = '添加';
    }

    openModal(dom.modal);
    setTimeout(function () { dom.name.focus(); }, 60);
  }

  async function saveGame() {
    const name = dom.name.value.trim();
    if (!name) {
      toast('请输入名称');
      dom.name.focus();
      return;
    }

    const old = editingId ? games.find(function (g) { return g.id === editingId; }) : null;

    const hRaw = parseInt(dom.hours.value, 10);
    const mRaw = parseInt(dom.minutes.value, 10);
    const hh = (!isNaN(hRaw) && hRaw > 0) ? hRaw : 0;
    const mm = (!isNaN(mRaw) && mRaw > 0) ? Math.min(59, mRaw) : 0;

    const data = {
      id: currentGameId || generateId(),
      name: name,
      scrapeName: dom.scrapeName.value.trim(),
      category: dom.category.value.trim() || '未分类',
      platform: dom.platform.value.trim(),
      /* 类型已移除编辑入口；保留旧数据不丢失 */
      genre: old ? (old.genre || '') : '',
      series: dom.series.value.trim(),
      cover: currentCover || '',
      status: dom.status.value.trim(),
      rating: currentRating,
      hours: (hh * 60 + mm) / 60,
      shots: currentShots.slice(),
      goals: old ? (Array.isArray(old.goals) ? old.goals : []) : [],
      dateAdded: old ? old.dateAdded : todayStr(),
      dateCompleted: toDateValue(dom.date.value) || null
    };

    if ((data.status === '已通关' || data.status === '全成就') && !data.dateCompleted) {
      data.dateCompleted = todayStr();
    }

    if (editingId) {
      const idx = games.findIndex(function (g) { return g.id === editingId; });
      if (idx > -1) games[idx] = data; else games.push(data);
    } else {
      games.push(data);
    }

    closeModal(dom.modal);
    await commit();
    toast(editingId ? '已更新' : '已添加');
    editingId = null;
  }

  /* ==================== 快捷操作 ==================== */
  async function quickChangeStatus(id, status) {
    const g = games.find(function (x) { return x.id === id; });
    if (!g) return;
    g.status = status;
    if ((status === '已通关' || status === '全成就') && !g.dateCompleted) {
      g.dateCompleted = todayStr();
    }
    await commit();
    toast('状态已更新为：' + status);
  }

  async function deleteGame(id) {
    games = games.filter(function (g) { return g.id !== id; });
    await commit();
    toast('已删除');
  }

  /* ==================== 卡片「目标与挑战」 ==================== */
  function addGoal(id, card) {
    const g = games.find(function (x) { return x.id === id; });
    if (!g) return;
    const input = card.querySelector('.js-goal-input');
    const text = input ? input.value.trim() : '';
    if (!text) return;
    if (!Array.isArray(g.goals)) g.goals = [];
    g.goals.push({ id: generateId(), text: text, done: false });
    commit();
  }

  function removeGoal(id, gid) {
    const g = games.find(function (x) { return x.id === id; });
    if (!g || !Array.isArray(g.goals)) return;
    g.goals = g.goals.filter(function (t) { return t.id !== gid; });
    commit();
  }

  function toggleGoal(id, gid, done) {
    const g = games.find(function (x) { return x.id === id; });
    if (!g || !Array.isArray(g.goals)) return;
    const t = g.goals.find(function (x) { return x.id === gid; });
    if (t) { t.done = !!done; commit(); }
  }

  /* ==================== 导入导出 ==================== */
  async function exportData() {
    if (games.length === 0) { toast('没有数据可导出'); return; }
    const res = await api.exportData();
    if (res && res.ok) toast('已导出 ' + res.count + ' 条记录');
    else if (res && res.empty) toast('没有数据可导出');
  }

  async function importData() {
    if (importBusy) return;
    const preview = await api.previewImport();
    if (!preview || preview.canceled) return;
    if (!preview.ok) { toast('无法读取备份：' + (preview.error || '未知错误')); return; }
    pendingImportToken = preview.token;
    dom.importPreviewInfo.textContent = preview.name + ' · 收藏 ' + preview.counts.games + ' 条 · 角色 '
      + preview.counts.characters + ' 条 · 书库 ' + preview.counts.books + ' 本';
    dom.importModeHint.textContent = '追加模式不会覆盖已有 ID 的记录；若备份包含书库但未包含 books 实体文件，需单独保留书籍文件。';
    const def = dom.importModeModal.querySelector('input[value="merge"]');
    if (def) def.checked = true;
    openModal(dom.importModeModal);
  }

  async function applyImportData() {
    if (importBusy || !pendingImportToken) return;
    const choice = dom.importModeModal.querySelector('input[name="importMode"]:checked');
    const mode = choice ? choice.value : 'merge';
    if (mode === 'replace' && !confirm('覆盖会替换本地收藏记录；备份中含角色或书库数据时也会替换对应记录。建议先导出备份。确定继续吗？')) return;
    importBusy = true;
    dom.importApplyBtn.disabled = true;
    dom.importModeHint.textContent = '正在导入，请不要关闭软件…';
    try {
      const res = await api.applyImport({ token: pendingImportToken, mode: mode });
      if (!res || !res.ok) { toast('导入失败：' + ((res && res.error) || '未知错误')); return; }
      pendingImportToken = '';
      games = res.games.map(normalizeGame);
      if (Array.isArray(res.characters)) characters = res.characters.map(normalizeCharacter);
      if (res.library) library = normalizeLibrary(res.library);
      closeModal(dom.importModeModal);
      renderAll(); renderCharacters(); renderLibrary();
      toast(mode === 'merge' ? ('追加 ' + res.added + ' 条，跳过重复 ' + res.skipped + ' 条') : ('已覆盖导入 ' + res.total + ' 条收藏'));
    } catch (err) {
      toast('导入失败：' + (err.message || '未知错误'));
    } finally {
      importBusy = false;
      dom.importApplyBtn.disabled = false;
    }
  }

  function batchSourceFor(g, selection) {
    if (selection && selection !== 'auto') return selection;
    const category = (g.category || '').toLowerCase();
    const platform = (g.platform || '').toLowerCase();
    if (/视觉小说|galgame|vn/.test(category + ' ' + platform)) return 'vndb';
    if (/番剧|动画|动漫|漫画|anime/.test(category)) return 'bangumi';
    if (/电影|电视|剧集|影视|影音|movie|tv/.test(category)) return 'tmdb';
    return 'steamgriddb';
  }

  function comparableName(name) {
    return String(name || '').normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
  }

  function chooseBatchResult(results, name) {
    const expected = comparableName(name);
    if (!expected) return null;
    return (results || []).find(function (r) {
      return comparableName(r.name) === expected || comparableName(r.original) === expected;
    }) || null;
  }

  function chooseBatchImage(assets, source) {
    const preferred = source === 'steamgriddb' ? ['heroes', 'grids']
      : source === 'tmdb' ? ['backdrop', 'poster'] : source === 'vndb' ? ['封面'] : ['大图'];
    for (const kind of preferred) {
      const image = (assets || []).find(function (a) { return a.url && a.kind === kind; });
      if (image) return image;
    }
    return (assets || []).find(function (a) { return a && a.url && a.kind !== '截图'; }) || null;
  }

  // Match the existing 16:9 cover crop without opening a crop dialog for each item.
  function batchCropImage(dataUrl) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () {
        try {
          const w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h) return reject(new Error('图片尺寸无效'));
          const canvas = document.createElement('canvas');
          canvas.width = OUT_W; canvas.height = OUT_H;
          const ctx = canvas.getContext('2d');
          const factor = Math.max(OUT_W / w, OUT_H / h);
          ctx.drawImage(img, (OUT_W - w * factor) / 2, (OUT_H - h * factor) / 2, w * factor, h * factor);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        } catch (e) { reject(e); }
      };
      img.onerror = function () { reject(new Error('图片解码失败')); };
      img.src = dataUrl;
    });
  }

  function addBatchLog(msg) {
    dom.batchCoverLog.textContent += msg + '\n';
    dom.batchCoverLog.scrollTop = dom.batchCoverLog.scrollHeight;
  }
  function openBatchCover() {
    if (batchCoverRunning) return;
    const missing = games.filter(g => !g.cover);
    dom.batchCoverLog.textContent = '';
    dom.batchCoverSummary.textContent = '待补全 ' + missing.length + ' 条 / 共 ' + games.length + ' 条';
    dom.batchCoverProgress.max = Math.max(1, missing.length);
    dom.batchCoverProgress.value = 0;
    dom.batchCoverStart.disabled = missing.length === 0;
    dom.batchCoverCancel.textContent = '关闭';
    openModal(dom.batchCoverModal);
  }
  async function startBatchCover() {
    if (batchCoverRunning) return;
    const missing = games.filter(g => !g.cover).map(g => g.id);
    if (!missing.length) return;
    batchCoverRunning = true; batchCoverAbort = false;
    dom.batchCoverStart.disabled = true;
    dom.batchCoverSource.disabled = true;
    dom.batchCoverCancel.textContent = '停止任务';
    dom.batchCoverLog.textContent = '';
    const chosen = dom.batchCoverSource.value;
    let success = 0, skipped = 0, errors = 0, processed = 0;
    for (const id of missing) {
      if (batchCoverAbort) break;
      const game = games.find(g => g.id === id);
      if (!game || game.cover) { processed++; skipped++; continue; }
      const name = (game.scrapeName || '').trim() || game.name;
      const source = batchSourceFor(game, chosen);
      dom.batchCoverSummary.textContent = '正在处理 ' + (processed + 1) + '/' + missing.length + '：' + game.name;
      try {
        const search = await api.scrapeSearch({ source: source, term: name });
        if (!search || !search.ok) throw new Error(search && search.error || '搜索失败');
        const found = chooseBatchResult(search.results, name);
        if (!found) { skipped++; addBatchLog('跳过 · ' + game.name + '：无准确名称匹配'); }
        else {
          const detail = await api.scrapeAssets({ source: found.source || source, id: found.id, mediaType: found.mediaType });
          if (!detail || !detail.ok) throw new Error(detail && detail.error || '未能获取图片');
          const image = chooseBatchImage(detail.assets, source);
          if (!image) { skipped++; addBatchLog('跳过 · ' + game.name + '：未找到封面图片'); }
          else {
            const downloaded = await api.downloadImage({ url: image.url });
            if (!downloaded || !downloaded.ok || !downloaded.dataUrl) throw new Error(downloaded && downloaded.error || '下载失败');
            const cover = await batchCropImage(downloaded.dataUrl);
            // Stop should never apply a cover after cancellation.
            if (batchCoverAbort) break;
            game.cover = cover;
            try { games = (await api.save(games)).map(normalizeGame); }
            catch (e) { game.cover = ''; throw e; }
            success++; addBatchLog('成功 · ' + game.name + '（' + source + '）');
          }
        }
      } catch (err) {
        errors++; addBatchLog('失败 · ' + game.name + '：' + (err.message || '未知错误'));
      }
      processed++;
      dom.batchCoverProgress.value = processed;
    }
    batchCoverRunning = false;
    dom.batchCoverSource.disabled = false;
    dom.batchCoverStart.disabled = false;
    dom.batchCoverCancel.textContent = '关闭';
    dom.batchCoverSummary.textContent = (batchCoverAbort ? '已停止' : '已完成') + '：成功 ' + success + '，未匹配 ' + skipped + '，失败 ' + errors;
    renderAll();
  }

  /* ==================== 随机推荐（支持筛选条件） ==================== */
  function distinct(values) {
    const set = {};
    values.forEach(function (v) { if (v) set[v] = true; });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'zh'); });
  }

  function fillFilterSelect(sel, allLabel, values, current) {
    let html = '<option value="all">' + esc(allLabel) + '</option>';
    values.forEach(function (v) {
      html += '<option value="' + esc(v) + '">' + esc(v) + '</option>';
    });
    sel.innerHTML = html;
    sel.value = (current && (current === 'all' || values.indexOf(current) > -1)) ? current : 'all';
  }

  function populateRandomFilters() {
    const categories = distinct(games.map(function (g) { return g.category; }));
    const platforms = distinct(games.map(function (g) { return g.platform; }));
    const series = [];
    games.forEach(function (g) {
      splitList(g.series).forEach(function (v) { series.push(v); });
    });

    fillFilterSelect(dom.rCategory, '全部分类', categories, activeFilters.category);
    fillFilterSelect(dom.rPlatform, '全部平台', platforms, activeFilters.platform);
    fillFilterSelect(dom.rSeries, '全部系列', distinct(series),
      activeFilters.series === UNCAT ? 'all' : activeFilters.series);
    fillFilterSelect(dom.rStatus, '全部状态', getAllStatuses(), activeFilters.status);

    let rh = '<option value="0">不限评分</option>';
    for (let i = 1; i <= 5; i++) {
      rh += '<option value="' + i + '">★ ' + i + ' 星及以上</option>';
    }
    dom.rMinRating.innerHTML = rh;
    dom.rMinRating.value = '0';
  }

  function buildRandomPool() {
    let pool = games.slice();
    const cat = dom.rCategory.value;
    const plat = dom.rPlatform.value;
    const ser = dom.rSeries.value;
    const st = dom.rStatus.value;
    const minR = parseInt(dom.rMinRating.value, 10) || 0;

    if (cat !== 'all') pool = pool.filter(function (g) { return g.category === cat; });
    if (plat !== 'all') pool = pool.filter(function (g) { return g.platform === plat; });
    if (ser !== 'all') pool = pool.filter(function (g) { return splitList(g.series).indexOf(ser) > -1; });
    if (st !== 'all') pool = pool.filter(function (g) { return g.status === st; });
    if (minR > 0) pool = pool.filter(function (g) { return (g.rating || 0) >= minR; });
    if (dom.rExcludeDone.checked) {
      pool = pool.filter(function (g) {
        return g.status !== '已通关' && g.status !== '全成就' && g.status !== '弃坑';
      });
    }
    return pool;
  }

  function randomPick() {
    if (games.length === 0) { toast('还没有收藏任何内容'); return; }
    const pool = buildRandomPool();
    dom.rPoolHint.textContent = '符合条件：' + pool.length + ' 条';

    if (pool.length === 0) {
      dom.randomPick.innerHTML =
        '<p class="random-empty">没有符合条件的记录<br>请放宽筛选条件后重试</p>';
      return;
    }

    const pick = pool[Math.floor(Math.random() * pool.length)];
    /* 用与卡片网格一致的卡片样式展示抽取结果 */
    dom.randomPick.innerHTML = cardHtml(pick);
  }

  function openRandomModal() {
    if (games.length === 0) { toast('还没有收藏任何内容'); return; }
    populateRandomFilters();
    openModal(dom.randomModal);
    randomPick();
  }

  /* ==================== 角色卡片 ==================== */
  async function commitChars() {
    try {
      characters = await api.saveCharacters(characters);
    } catch (e) {
      toast('保存失败：' + (e && e.message ? e.message : '未知错误'));
    }
    renderCharacters();
  }

  function renderCharacters() {
    if (!dom.charGrid) return;
    const q = charSearch.trim().toLowerCase();
    const list = characters.filter(function (c) {
      if (!q) return true;
      const hay = ((c.name || '') + ' ' + (c.work || ''));
      return textMatches(hay.toLowerCase(), hay, q);
    });

    if (!characters.length) {
      dom.charGrid.innerHTML = '';
      dom.charGrid.classList.add('hidden');
      dom.charEmpty.classList.remove('hidden');
      return;
    }
    dom.charEmpty.classList.add('hidden');
    dom.charGrid.classList.remove('hidden');

    if (!list.length) {
      dom.charGrid.innerHTML = '<div class="muted" style="grid-column:1/-1;">没有匹配的角色。</div>';
      return;
    }

    dom.charGrid.innerHTML = list.map(function (c) {
      const src = charSrc(c.image);
      const inner = src
        ? '<img src="' + esc(src) + '" alt="" class="js-char-view">'
        : '<span class="char-letter">' + esc((c.name || '?').trim().charAt(0) || '?') + '</span>';
      return '<article class="char-card" data-id="' + esc(c.id) + '">' +
        '<div class="char-img">' + inner + '</div>' +
        '<div class="char-body">' +
          '<div class="char-name" title="' + esc(c.name) + '">' + esc(c.name) + '</div>' +
          '<div class="char-work" title="' + esc(c.work || '') + '">' + esc(c.work || '') + '</div>' +
          '<div class="actions">' +
            '<button class="btn btn-outline btn-sm js-char-edit">✏️ 编辑</button>' +
            '<button class="btn btn-outline btn-sm js-char-del" title="删除">🗑️</button>' +
          '</div>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  function updateCharPreview() {
    const src = charSrc(currentCharImage);
    if (src) dom.cPreview.innerHTML = '<img src="' + esc(src) + '" alt="">';
    else dom.cPreview.innerHTML = '<span class="cover-empty">无图片</span>';
  }

  function openCharModal(id) {
    editingCharId = id || null;
    currentCharImage = '';
    currentCharShots = [];
    dom.cName.value = '';
    dom.cWork.value = '';

    if (id) {
      const c = characters.find(function (x) { return x.id === id; });
      if (c) {
        dom.charModalTitle.textContent = '编辑角色';
        dom.cName.value = c.name || '';
        dom.cWork.value = c.work || '';
        currentCharImage = c.image || '';
        currentCharShots = (c.shots || []).slice();
      }
    } else {
      dom.charModalTitle.textContent = '添加角色';
    }
    updateCharPreview();
    renderCharShotsEditor();
    openModal(dom.charModal);
    setTimeout(function () { dom.cName.focus(); }, 60);
  }

  function renderCharShotsEditor() {
    if (!dom.cShotsGrid) return;
    if (!currentCharShots.length) {
      dom.cShotsGrid.innerHTML = '<div class="shots-empty">暂无图集图片</div>';
      return;
    }
    dom.cShotsGrid.innerHTML = currentCharShots.map(function (s, i) {
      return '<div class="shot-thumb"><img src="' + esc(charSrc(s)) + '" alt="">' +
        '<button type="button" class="shot-remove" data-idx="' + i + '" title="移除">✕</button></div>';
    }).join('');
  }

  function handleCharShotsFiles(files) {
    const list = Array.prototype.slice.call(files || []);
    if (!list.length) return;
    let pending = list.length;
    function done() { pending--; if (pending <= 0) renderCharShotsEditor(); }
    list.forEach(function (f) {
      if (!/^image\//.test(f.type)) { done(); return; }
      const reader = new FileReader();
      reader.onload = function (e) { currentCharShots.push(e.target.result); done(); };
      reader.onerror = function () { done(); };
      reader.readAsDataURL(f);
    });
  }

  function handleCharFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('请选择图片文件'); return; }
    if (file.size > 12 * 1024 * 1024) { toast('图片过大，请选择 12MB 以内的图片'); return; }
    const reader = new FileReader();
    reader.onload = function (e) { openCropper(e.target.result, 'char'); };
    reader.onerror = function () { toast('读取文件失败'); };
    reader.readAsDataURL(file);
  }

  async function saveCharacter() {
    const name = dom.cName.value.trim();
    if (!name) { toast('请输入角色名'); dom.cName.focus(); return; }
    const data = {
      id: editingCharId || generateId(),
      name: name,
      work: dom.cWork.value.trim(),
      image: currentCharImage || '',
      shots: currentCharShots.slice()
    };
    if (editingCharId) {
      const idx = characters.findIndex(function (c) { return c.id === editingCharId; });
      if (idx > -1) characters[idx] = data; else characters.push(data);
    } else {
      characters.push(data);
    }
    closeModal(dom.charModal);
    await commitChars();
    toast(editingCharId ? '已更新角色' : '已添加角色');
    editingCharId = null;
  }

  async function deleteCharacter(id) {
    const c = characters.find(function (x) { return x.id === id; });
    if (!c) return;
    const ok = await confirmDialog('确定删除角色「' + c.name + '」吗？', '删除角色');
    if (!ok) return;
    characters = characters.filter(function (x) { return x.id !== id; });
    await commitChars();
    toast('已删除角色');
  }

  /* 角色图集（点击卡片封面进入） */
  function openCharGallery(id) {
    const c = characters.find(function (x) { return x.id === id; });
    if (!c) return;
    galleryCharId = id;
    showPage('charGallery');
  }

  function charGalleryItems(c) {
    const items = [];
    if (c.image) items.push({ type: 'cover', idx: -1, src: charSrc(c.image) });
    (c.shots || []).forEach(function (s, i) { items.push({ type: 'shot', idx: i, src: charSrc(s) }); });
    return items;
  }

  function renderCharGallery() {
    const c = characters.find(function (x) { return x.id === galleryCharId; });
    if (!c) { showPage('characters'); return; }
    dom.charGalleryTitle.textContent = '🖼 ' + c.name + '（' + (c.shots || []).length + ' 张）';
    const items = charGalleryItems(c);
    if (!items.length) {
      dom.charGallery.innerHTML = '<div class="shots-none" style="grid-column:1/-1;">还没有图片，点击「＋ 添加图片」或到编辑界面刮削。</div>';
      dom.cgHint.textContent = '';
      return;
    }
    dom.cgHint.textContent = '共 ' + items.length + ' 张';
    dom.charGallery.innerHTML = items.map(function (it) {
      return '<div class="cg-cell" data-type="' + it.type + '" data-idx="' + it.idx + '">' +
        '<img src="' + esc(it.src) + '" alt="">' +
        '<button type="button" class="cg-del" data-type="' + it.type + '" data-idx="' + it.idx + '" title="删除">✕</button>' +
        '</div>';
    }).join('');
  }

  /* 游戏截图图集（点击收藏库卡片封面进入） */
  function openGameShots(id) {
    const g = games.find(function (x) { return x.id === id; });
    if (!g) return;
    gameShotsId = id;
    showPage('gameShots');
  }

  function gameShotsItems(g) {
    return (g.shots || []).map(function (s, i) { return { idx: i, src: shotSrc(s, g.id) }; });
  }

  function renderGameShots() {
    const g = games.find(function (x) { return x.id === gameShotsId; });
    if (!g) { showPage('library'); return; }
    dom.gameShotsTitle.textContent = '🖼 ' + g.name + '（' + (g.shots || []).length + ' 张）';
    const items = gameShotsItems(g);
    if (!items.length) {
      dom.gameShots.innerHTML = '<div class="shots-none" style="grid-column:1/-1;">还没有截图，点击「＋ 添加图片」或「📂 文件夹」导入。</div>';
      dom.gshHint.textContent = '';
      return;
    }
    dom.gshHint.textContent = '共 ' + items.length + ' 张';
    dom.gameShots.innerHTML = items.map(function (it) {
      return '<div class="cg-cell" data-idx="' + it.idx + '">' +
        '<img src="' + esc(it.src) + '" alt="">' +
        '<button type="button" class="cg-del" data-idx="' + it.idx + '" title="删除">✕</button>' +
        '</div>';
    }).join('');
  }

  async function deleteGameShotsItem(idx) {
    const g = games.find(function (x) { return x.id === gameShotsId; });
    if (!g || !Array.isArray(g.shots) || idx < 0 || idx >= g.shots.length) return;
    const ok = await confirmDialog('确定删除这张截图吗？此操作不可恢复。', '删除截图');
    if (!ok) return;
    g.shots.splice(idx, 1);
    await commit();
    renderGameShots();
    toast('已删除截图');
  }

  function handleGameShotsFiles(files) {
    const g = games.find(function (x) { return x.id === gameShotsId; });
    if (!g) return;
    const list = Array.prototype.slice.call(files || []);
    if (!list.length) return;
    if (!Array.isArray(g.shots)) g.shots = [];
    let pending = list.length;
    function done() {
      pending--;
      if (pending <= 0) { commit().then(renderGameShots); toast('已添加截图'); }
    }
    list.forEach(function (f) {
      if (!/^image\//.test(f.type)) { done(); return; }
      const reader = new FileReader();
      reader.onload = function (e) { g.shots.push(e.target.result); done(); };
      reader.onerror = function () { done(); };
      reader.readAsDataURL(f);
    });
  }

  async function deleteCharGalleryItem(type, idx) {
    const c = characters.find(function (x) { return x.id === galleryCharId; });
    if (!c) return;
    const ok = await confirmDialog('确定删除这张图片吗？', '删除图片');
    if (!ok) return;
    if (type === 'cover') c.image = '';
    else if (Array.isArray(c.shots)) c.shots.splice(idx, 1);
    await commitChars();
    renderCharGallery();
    toast('已删除图片');
  }

  function handleGalleryFiles(files) {
    const c = characters.find(function (x) { return x.id === galleryCharId; });
    if (!c) return;
    const list = Array.prototype.slice.call(files || []);
    if (!list.length) return;
    if (!Array.isArray(c.shots)) c.shots = [];
    let pending = list.length;
    function done() {
      pending--;
      if (pending <= 0) { commitChars().then(renderCharGallery); toast('已添加图片'); }
    }
    list.forEach(function (f) {
      if (!/^image\//.test(f.type)) { done(); return; }
      const reader = new FileReader();
      reader.onload = function (e) { c.shots.push(e.target.result); done(); };
      reader.onerror = function () { done(); };
      reader.readAsDataURL(f);
    });
  }

  /* 角色刮削（Bangumi / VNDB） */
  function setCharScrapeSource(src) {
    charScrapeSource = src;
    Array.prototype.forEach.call(dom.csSources.querySelectorAll('.pill[data-source]'), function (p) {
      p.classList.toggle('active', p.dataset.source === src);
    });
  }

  function csHint(msg) { dom.csHint.textContent = msg; }

  function openCharScrape() {
    dom.csQuery.value = dom.cName.value.trim();
    dom.csWork.value = dom.cWork.value.trim();
    setCharScrapeSource('bgm-char');
    dom.csResults.innerHTML = '';
    dom.csAssets.innerHTML = '';
    charScrapeResult = null;
    csHint('可填写作品/系列缩小范围；点击结果，再点击图片设为该角色图片。');
    openModal(dom.charScrapeModal);
    if (dom.csQuery.value) doCharSearch();
  }

  async function doCharSearch() {
    const term = dom.csQuery.value.trim();
    if (!term) { toast('请输入角色名'); return; }
    const work = dom.csWork.value.trim();
    dom.csResults.innerHTML = '';
    dom.csAssets.innerHTML = '';
    charScrapeResult = null;
    csHint('正在搜索…');
    const res = await api.scrapeSearch({ source: charScrapeSource, term: term, work: work });
    if (!res || !res.ok) { csHint('搜索失败：' + ((res && res.error) || '未知错误')); return; }
    const results = res.results || [];
    if (!results.length) { csHint('没有找到结果，可换用其它来源或修改名称/作品。'); return; }
    csHint('找到 ' + results.length + ' 个结果，点击选择：');
    dom.csResults.innerHTML = results.map(function (r, i) {
      const extra = r.work || r.original || '';
      const sub = extra && extra !== r.name ? '<span class="yr">' + esc(extra) + '</span>' : '';
      return '<button type="button" class="scrape-result" data-idx="' + i + '"><span>' + esc(r.name) + '</span>' + sub + '</button>';
    }).join('');
    const btns = dom.csResults.querySelectorAll('.scrape-result');
    Array.prototype.forEach.call(btns, function (b) {
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(btns, function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        selectCharResult(results[Number(b.dataset.idx)]);
      });
    });
  }

  async function selectCharResult(r) {
    charScrapeResult = r;
    dom.csAssets.innerHTML = '';
    csHint('正在获取图片…');
    const res = await api.scrapeAssets({ source: r.source, id: r.id });
    if (!res || !res.ok) { csHint('获取图片失败：' + ((res && res.error) || '未知错误')); return; }
    const assets = res.assets || [];
    if (!assets.length) { csHint('该角色没有可用图片。'); return; }
    csHint('点击图片加入图集（可多选）：');
    dom.csAssets.innerHTML = assets.map(function (a, i) {
      return '<div class="asset" data-idx="' + i + '" title="' + esc(a.kind || '') + '">' +
        '<img src="' + esc(a.thumb) + '" referrerpolicy="no-referrer" loading="lazy" alt="">' +
        (a.kind ? '<span class="tag">' + esc(a.kind) + '</span>' : '') +
        '</div>';
    }).join('');
    Array.prototype.forEach.call(dom.csAssets.querySelectorAll('.asset'), function (el) {
      el.addEventListener('click', function () { pickCharAsset(assets[Number(el.dataset.idx)]); });
    });
  }

  async function pickCharAsset(a) {
    csHint('正在下载图片…');
    const res = await api.downloadImage({ url: a.url });
    if (!res || !res.ok) { csHint('下载失败：' + ((res && res.error) || '未知错误')); return; }
    /* 下载后进入裁剪器，可手动调整画面 */
    closeModal(dom.charScrapeModal);
    openCropper(res.dataUrl, 'char');
  }

  /* ==================== 角色批量导入 ==================== */
  function cbHintEl(msg) { dom.cbHint.textContent = msg; }
  function setCbSource(src) {
    cbSource = src;
    Array.prototype.forEach.call(dom.cbSources.querySelectorAll('.pill[data-source]'), function (p) {
      p.classList.toggle('active', p.dataset.source === src);
    });
  }

  function openCharBatch() {
    cbResults = []; cbSelected = {}; cbAdjusted = {}; cbWorkResolved = ''; cbWorks = [];
    dom.cbWork.value = '';
    setCbSource('bgm-char');
    dom.cbList.innerHTML = '';
    cbHintEl('输入作品/系列名称，先搜索候选条目，确认后再导入其全部角色。');
    openModal(dom.charBatchModal);
    setTimeout(function () { dom.cbWork.focus(); }, 60);
  }

  /* 第一步：搜索作品/系列候选 */
  async function doCbSearch() {
    const term = dom.cbWork.value.trim();
    if (!term) { toast('请输入作品/系列名称'); return; }
    cbHintEl('正在搜索作品/系列…');
    dom.cbList.innerHTML = '';
    cbWorks = []; cbResults = []; cbSelected = {}; cbWorkResolved = '';
    const res = await api.searchWorks({ source: cbSource, term: term });
    if (!res || !res.ok) { cbHintEl('搜索失败：' + ((res && res.error) || '未知错误')); return; }
    cbWorks = res.works || [];
    if (!cbWorks.length) { cbHintEl('没有找到匹配的作品/系列，请修改名称或换来源。'); return; }
    cbHintEl('找到 ' + cbWorks.length + ' 个候选，请选择具体是哪一部：');
    dom.cbList.innerHTML = cbWorks.map(function (w, i) {
      const img = '<img' + (w.image ? ' src="' + esc(w.image) + '" referrerpolicy="no-referrer" loading="lazy"' : '') + ' alt="">';
      const sub = (w.name && w.original && w.original !== w.name) ? '<span class="cb-sub">' + esc(w.original) + '</span>' : '';
      const yr = w.year ? '<span class="cb-sub">' + esc(w.year) + '</span>' : '';
      return '<div class="cb-row" data-idx="' + i + '">' + img +
        '<span class="cb-name">' + esc(w.name) + sub + ' ' + yr + '</span>' +
        '<button type="button" class="btn btn-primary btn-sm js-cb-pick" data-idx="' + i + '">选择</button>' +
        '</div>';
    }).join('');
  }

  /* 第二步：获取所选作品的全部角色 */
  async function loadCbCharacters(w) {
    cbHintEl('正在获取《' + (w.name || '') + '》的角色…');
    dom.cbList.innerHTML = '';
    cbResults = []; cbSelected = {};
    cbWorkResolved = w.name || '';
    const res = await api.fetchChars({ source: w.source || cbSource, id: w.id, workName: w.name || '' });
    if (!res || !res.ok) { cbHintEl('获取角色失败：' + ((res && res.error) || '未知错误')); return; }
    cbResults = res.characters || [];
    if (!cbResults.length) { cbHintEl('该作品下没有角色数据，可换用另一来源或重新搜索。'); return; }
    cbWorkResolved = res.work || cbWorkResolved;
    cbHintEl('《' + cbWorkResolved + '》共 ' + cbResults.length + ' 个角色，勾选后导入：');
    renderCbList();
  }

  function renderCbList() {
    dom.cbList.innerHTML = cbResults.map(function (c, i) {
      cbSelected[i] = true;
      const img = '<img' + (c.image ? ' src="' + esc(c.image) + '" referrerpolicy="no-referrer" loading="lazy"' : '') + ' alt="">';
      const sub = (c.original && c.original !== c.name) ? '<span class="cb-sub">' + esc(c.original) + '</span>' : '';
      return '<div class="cb-row" data-id="' + esc(c.id) + '">' +
        '<input type="checkbox" data-idx="' + i + '" checked>' +
        img +
        '<span class="cb-name">' + esc(c.name) + sub + '</span>' +
        '<button type="button" class="btn btn-outline btn-sm js-cb-adjust" data-idx="' + i + '">✏️ 调整</button>' +
        '</div>';
    }).join('');
  }

  function updateCbThumb(id, dataUrl) {
    Array.prototype.forEach.call(dom.cbList.querySelectorAll('.cb-row'), function (row) {
      if (row.dataset.id === String(id)) {
        const img = row.querySelector('img');
        if (img) img.src = dataUrl;
      }
    });
  }

  async function adjustCbChar(idx) {
    const c = cbResults[idx];
    if (!c || !c.image) { toast('该角色没有可用图片'); return; }
    cbHintEl('正在下载图片…');
    const res = await api.downloadImage({ url: c.image });
    if (!res || !res.ok) { cbHintEl('下载失败：' + ((res && res.error) || '未知错误')); return; }
    cropBatchId = String(c.id);
    openCropper(res.dataUrl, 'batchchar');
    cbHintEl('调整后点「确定应用」即可，再点「导入所选」。');
  }

  async function importSelectedChars() {
    const chosen = [];
    cbResults.forEach(function (c, i) { if (cbSelected[i]) chosen.push(c); });
    if (!chosen.length) { toast('请至少勾选一个角色'); return; }
    dom.cbImportBtn.disabled = true;
    const work = cbWorkResolved || dom.cbWork.value.trim();
    let added = 0;
    for (let k = 0; k < chosen.length; k++) {
      const c = chosen[k];
      let image = cbAdjusted[String(c.id)] || '';
      if (!image && c.image) {
        try {
          const r = await api.downloadImage({ url: c.image });
          if (r && r.ok) image = r.dataUrl;
        } catch (e) { /* 单张失败跳过 */ }
      }
      characters.push({ id: generateId(), name: c.name || c.original || '未命名', work: work, image: image, shots: [] });
      added++;
      cbHintEl('导入中 ' + added + '/' + chosen.length + '…');
    }
    await commitChars();
    dom.cbImportBtn.disabled = false;
    closeModal(dom.charBatchModal);
    toast('已导入 ' + added + ' 个角色');
  }

  /* ==================== 角色图片搜索（跳转 Pixiv 浏览器搜索） ==================== */
  function ciHintEl(msg) { dom.ciHint.textContent = msg; }

  function openCharImgSearch() {
    dom.ciQuery.value = (dom.cName.value.trim() + ' ' + dom.cWork.value.trim()).trim();
    ciHintEl('将跳转到系统浏览器的 Pixiv 搜索页面；下载好图片后，用图集里的「＋ 添加图片」手动加入。');
    openModal(dom.charImgSearchModal);
    setTimeout(function () { dom.ciQuery.focus(); }, 60);
  }

  async function openPixivSearch() {
    const term = dom.ciQuery.value.trim();
    if (!term) { toast('请输入搜索词'); return; }
    const url = 'https://www.pixiv.net/tags/' + encodeURIComponent(term) + '/artworks';
    const res = await api.openExternal(url);
    if (!res || !res.ok) { toast('打开失败：' + ((res && res.error) || '未知错误')); return; }
    toast('已在浏览器打开 Pixiv 搜索');
  }

  /* ==================== 书海书架 ==================== */
  const BOOK_TYPE_LABEL = { txt: '文本', pdf: 'PDF', epub: 'EPUB', image: '图片', folder: '图集', cbz: 'CBZ 漫画', zip: 'ZIP 漫画', '7z': '7Z 漫画', rar: 'RAR 漫画' };
  const BOOK_STATUS_COLOR = { '想读': '#e0940a', '在读': '#3f6fd8', '已读': '#2e8b57' };
  const BOOK_PALETTE = [['#4a6fa5', '#2c3e50'], ['#8e5ea2', '#3c1053'], ['#b5651d', '#5c3317'], ['#2e8b57', '#123d2a'], ['#c0392b', '#4a1512'], ['#1f6f8b', '#0d3b4a'], ['#a0522d', '#3b2313'], ['#5a4fcf', '#211c56'], ['#d35400', '#5a2600'], ['#117864', '#062a23']];

  function typeLabel(t) { return BOOK_TYPE_LABEL[t] || t || ''; }
  function colorPair(text) { let n = 0; const s = String(text || ''); for (let i = 0; i < s.length; i++) n += s.charCodeAt(i); return BOOK_PALETTE[n % BOOK_PALETTE.length]; }
  function splitTags(v) {
    if (!v) return [];
    const seen = {}, out = [];
    String(v).split(/[,，、;；|]+/).forEach(function (x) { x = x.trim(); if (x && !seen[x]) { seen[x] = 1; out.push(x); } });
    return out;
  }
  function normTags(v) { return splitTags(v).join(','); }
  function bookCoverSrc(c) { if (!c) return ''; return c.indexOf('data:') === 0 ? c : ('bc://c/' + encodeURIComponent(c)); }

  let libSavePromise = null;
  let libSavePending = false;
  function persistLib() {
    libSavePending = true;
    if (libSavePromise) return libSavePromise;
    libSavePromise = (async function () {
      while (libSavePending) {
        libSavePending = false;
        const snapshot = JSON.stringify(library);
        const saved = await api.libSave(JSON.parse(snapshot));
        // A slow save must not overwrite a newer reading position or edit.
        if (JSON.stringify(library) === snapshot) library = normalizeLibrary(saved);
      }
    })().catch(function (e) {
      toast('保存失败：' + (e && e.message ? e.message : '未知错误'));
    }).finally(function () { libSavePromise = null; });
    return libSavePromise;
  }

  function shelfById(id) { return library.shelves.find(function (s) { return s.id === id; }); }
  function childrenOf(pid) { return library.shelves.filter(function (s) { return s.parentId === pid; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name, 'zh'); }); }
  function descendantIds(id) { const out = [id]; childrenOf(id).forEach(function (c) { out.push.apply(out, descendantIds(c.id)); }); return out; }
  function bookCountDeep(id) { const ids = descendantIds(id); return library.books.filter(function (b) { return ids.indexOf(b.shelfId) > -1; }).length; }
  function shelfPath(id) { const parts = [], seen = {}; let cur = id; while (cur && !seen[cur]) { seen[cur] = 1; const s = shelfById(cur); if (!s) break; parts.unshift(s); cur = s.parentId; } return parts; }
  function allTags() {
    const set = {};
    library.books.forEach(function (b) { splitTags(b.tags).forEach(function (t) { set[t] = 1; }); });
    library.shelves.forEach(function (s) { splitTags(s.tags).forEach(function (t) { set[t] = 1; }); });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'zh'); });
  }

  /* 生效词条 = 书籍自身词条 ∪ 其所有上级系列词条 */
  function effectiveTags(b) {
    const set = {};
    splitTags(b.tags).forEach(function (t) { set[t] = 1; });
    let cur = b.shelfId;
    const seen = {};
    while (cur && !seen[cur]) {
      seen[cur] = 1;
      const s = shelfById(cur);
      if (!s) break;
      splitTags(s.tags).forEach(function (t) { set[t] = 1; });
      cur = s.parentId;
    }
    return Object.keys(set);
  }
  function booksUnder(shelfId) {
    const ids = descendantIds(shelfId);
    return library.books.filter(function (b) { return ids.indexOf(b.shelfId) > -1; });
  }
  function shelfMatchesTag(shelfId, tag) {
    const s = shelfById(shelfId);
    if (!s) return false;
    if (splitTags(s.tags).indexOf(tag) > -1) return true;
    const bs = booksUnder(shelfId);
    if (!bs.length) return false;
    return bs.every(function (b) { return effectiveTags(b).indexOf(tag) > -1; });
  }
  /* 顶层匹配系列（父级也匹配时只保留父级） */
  function matchingShelves(tag) {
    const scope = descendantIds(curShelfId);
    const all = library.shelves.filter(function (s) {
      return s.id !== curShelfId && scope.indexOf(s.id) > -1 && shelfMatchesTag(s.id, tag);
    });
    return all.filter(function (s) {
      let p = s.parentId, seen = {};
      while (p && p !== curShelfId && !seen[p]) {
        seen[p] = 1;
        if (shelfMatchesTag(p, tag)) return false;
        const ps = shelfById(p);
        p = ps ? ps.parentId : 0;
      }
      return true;
    });
  }

  function renderShelfTree() {
    if (!dom.shelfTree) return;
    const rows = [{ id: 0, name: '全部书籍', count: library.books.length, depth: 0, hasChild: false }];
    (function rec(pid, depth) {
      childrenOf(pid).forEach(function (s) {
        rows.push({ id: s.id, name: s.name, count: bookCountDeep(s.id), depth: depth, hasChild: childrenOf(s.id).length > 0 });
        if (expandedShelves[s.id]) rec(s.id, depth + 1);
      });
    })(0, 0);
    dom.shelfTree.innerHTML = rows.map(function (r) {
      const pad = 6 + (r.depth || 0) * 14;
      const caret = r.hasChild ? (expandedShelves[r.id] ? '▾' : '▸') : '';
      return '<div class="shelf-node' + (curShelfId === r.id ? ' active' : '') + '" data-id="' + r.id + '" style="padding-left:' + pad + 'px;">' +
        '<span class="caret">' + caret + '</span><span class="nm">' + esc(r.name) + '</span><span class="cnt">' + r.count + '</span></div>';
    }).join('');
  }

  function fillSelect(sel, allLabel, values, current) {
    if (!sel) return;
    let html = '<option value="">' + esc(allLabel) + '</option>';
    values.forEach(function (v) { html += '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>'; });
    sel.innerHTML = html;
    sel.value = current || '';
  }

  function filteredBooks() {
    const filtering = !!(bookSearch || bookStatusFilter || bookTagFilter);
    /* 始终限定在「当前所选系列」范围内：
       - 浏览：仅当前系列直属书籍（子系列以卡片列出）
       - 筛选：当前系列子树内的书籍（与顶部筛选联动），根目录则为全部 */
    let list = filtering
      ? booksUnder(curShelfId)
      : library.books.filter(function (b) { return b.shelfId === curShelfId; });
    const q = bookSearch.trim().toLowerCase();
    if (q) list = list.filter(function (b) { const hay = ((b.title || '') + ' ' + (b.tags || '')).toLowerCase(); return textMatches(hay, hay, q); });
    if (bookStatusFilter) list = list.filter(function (b) { return b.status === bookStatusFilter; });
    if (bookTagFilter) list = list.filter(function (b) { return effectiveTags(b).indexOf(bookTagFilter) > -1; });
    list.sort(function (a, b) { return (a.title || '').localeCompare(b.title || '', 'zh'); });
    return list;
  }

  function bookCardHtml(b) {
    const src = bookCoverSrc(b.cover);
    const pair = colorPair(b.title);
    const coverInner = src
      ? '<img src="' + esc(src) + '" alt="">'
      : '<div class="book-ph" style="background:linear-gradient(135deg,' + pair[0] + ',' + pair[1] + ')"><div class="ph-title">' + esc(b.title) + '</div><div class="ph-type">' + esc(typeLabel(b.type)) + '</div></div>';
    const status = b.status ? '<span class="book-status" style="background:' + (BOOK_STATUS_COLOR[b.status] || '#666') + '">' + esc(b.status) + '</span>' : '';
    return '<article class="book-card" data-kind="book" data-id="' + esc(b.id) + '" draggable="true">' +
      '<div class="book-cover js-book-open">' + coverInner + status + '</div>' +
      '<div class="book-body"><div class="book-title" title="' + esc(b.title) + '">' + esc(b.title) + '</div>' +
      '<div class="book-type"><span class="bt-left">' + esc(typeLabel(b.type)) + '</span>' + (b.readSeconds > 0 ? ('<span class="bt-read" title="累计阅读时长">⏱ ' + esc(formatReadTime(b.readSeconds)) + '</span>') : '') + '</div></div></article>';
  }
  function shelfCardHtml(s) {
    const src = bookCoverSrc(s.cover);
    let inner;
    if (src) {
      inner = '<img src="' + esc(src) + '" alt="">';
    } else {
      const pair = colorPair(s.name);
      inner = '<div class="book-ph" style="background:linear-gradient(135deg,' + pair[0] + ',' + pair[1] + ')"><div class="ph-title">📚 ' + esc(s.name) + '</div><div class="ph-type">' + bookCountDeep(s.id) + ' 本书</div></div>';
    }
    return '<article class="book-card shelf-card" data-kind="shelf" data-id="' + s.id + '" draggable="true">' +
      '<div class="book-cover js-shelf-open">' + inner + '</div>' +
      '<div class="book-body"><div class="book-title" title="' + esc(s.name) + '">' + esc(s.name) + '</div><div class="book-type">系列 · ' + bookCountDeep(s.id) + ' 本</div></div></article>';
  }

  function renderShelfMain() {
    if (!dom.shelfCrumb) return;
    const path = shelfPath(curShelfId);
    let crumb = '<a data-goto="0">全部</a>';
    path.forEach(function (s, i) {
      crumb += '<span class="sep"> › </span>' + (i === path.length - 1 ? ('<b>' + esc(s.name) + '</b>') : ('<a data-goto="' + s.id + '">' + esc(s.name) + '</a>'));
    });
    dom.shelfCrumb.innerHTML = crumb;

    fillSelect(dom.bookStatusFilter, '全部状态', ['想读', '在读', '已读'], bookStatusFilter);
    fillSelect(dom.bookTagFilter, '全部词条', allTags(), bookTagFilter);
    if (dom.bookClearFilter) dom.bookClearFilter.classList.toggle('hidden', !(bookSearch || bookStatusFilter || bookTagFilter));

    const filtering = !!(bookSearch || bookStatusFilter || bookTagFilter);
    const kids = filtering ? [] : childrenOf(curShelfId);
    let list = filteredBooks();
    let extraShelves = [];
    if (bookTagFilter) {
      /* 词条筛选：系列自身含该词条，或系列内全部书籍都含该词条 → 显示整个系列卡片 */
      extraShelves = matchingShelves(bookTagFilter);
      if (extraShelves.length) {
        const coveredIds = {};
        extraShelves.forEach(function (s) { descendantIds(s.id).forEach(function (x) { coveredIds[x] = 1; }); });
        list = list.filter(function (b) { return !coveredIds[b.shelfId]; });
      }
    }
    if (dom.shelfCount) {
      dom.shelfCount.textContent = filtering
        ? ('筛选 · ' + extraShelves.length + ' 个系列 · ' + list.length + ' 本')
        : (kids.length + ' 个系列 · ' + list.length + ' 本');
    }

    const html = extraShelves.map(shelfCardHtml).join('') + kids.map(shelfCardHtml).join('') + list.map(bookCardHtml).join('');
    dom.bookGrid.innerHTML = html;
    dom.bookGrid.classList.toggle('hidden', !html);
    dom.bookEmpty.classList.toggle('hidden', !!html);

    const counts = {};
    library.books.forEach(function (b) { counts[b.status || ''] = (counts[b.status || ''] || 0) + 1; });
    if (dom.shelfStats) dom.shelfStats.innerHTML = '共 ' + library.books.length + ' 本 · 系列 ' + library.shelves.length + '<br>想读 ' + (counts['想读'] || 0) + ' · 在读 ' + (counts['在读'] || 0) + ' · 已读 ' + (counts['已读'] || 0);
  }

  function renderLibrary() { renderShelfTree(); renderShelfMain(); }

  /* ----- 系列相关 ----- */
  function openShelfModal(mode, shelfId, parentId) {
    editingShelfId = (mode === 'rename') ? (shelfId || null) : null;
    editingShelfParent = parentId || 0;
    if (mode === 'rename') {
      const s = shelfById(shelfId);
      dom.shelfModalTitle.textContent = '重命名系列';
      dom.shelfName.value = s ? s.name : '';
      dom.shelfParentHint.textContent = '';
      shelfTagEditor.set(splitTags(s && s.tags));
    } else {
      dom.shelfModalTitle.textContent = '新建系列';
      dom.shelfName.value = '';
      const p = parentId ? shelfById(parentId) : null;
      dom.shelfParentHint.textContent = p ? ('在「' + p.name + '」下新建') : '在书架根目录新建';
      shelfTagEditor.set([]);
    }
    openModal(dom.shelfModal);
    setTimeout(function () { dom.shelfName.focus(); }, 60);
  }
  async function saveShelfModal() {
    const name = dom.shelfName.value.trim();
    if (!name) { toast('请输入系列名称'); return; }
    const tags = shelfTagEditor.value();
    if (editingShelfId) { const s = shelfById(editingShelfId); if (s) { s.name = name; s.tags = tags; } }
    else {
      const id = library.shelves.reduce(function (m, s) { return Math.max(m, s.id); }, 0) + 1;
      library.shelves.push({ id: id, name: name, parentId: editingShelfParent || 0, order: childrenOf(editingShelfParent || 0).length, cover: '', tags: tags });
      expandedShelves[editingShelfParent || 0] = true;
    }
    closeModal(dom.shelfModal);
    await persistLib();
    renderLibrary();
    toast('已保存');
  }

  /* ----- 书籍信息 ----- */
  function shelfOptionsHtml() {
    let html = '<option value="0">（根目录）</option>';
    (function rec(pid, depth) {
      childrenOf(pid).forEach(function (s) {
        html += '<option value="' + s.id + '">' + esc(new Array(depth + 1).join('　') + s.name) + '</option>';
        rec(s.id, depth + 1);
      });
    })(0, 0);
    return html;
  }
  function openBookModal(id) {
    const b = library.books.find(function (x) { return x.id === id; });
    if (!b) return;
    editingBookId = id;
    dom.bookModalTitle.textContent = '编辑信息';
    dom.bkTitle.value = b.title;
    dom.bkStatus.value = b.status || '';
    bookTagEditor.set(splitTags(b.tags));
    dom.bkShelf.innerHTML = shelfOptionsHtml();
    dom.bkShelf.value = String(b.shelfId || 0);
    dom.bkPath.textContent = b.path || '';
    dom.bkPath.title = b.path || '';
    openModal(dom.bookModal);
    setTimeout(function () { dom.bkTitle.focus(); }, 60);
  }
  async function saveBookModal() {
    const b = library.books.find(function (x) { return x.id === editingBookId; });
    if (!b) { closeModal(dom.bookModal); return; }
    const title = dom.bkTitle.value.trim();
    if (!title) { toast('请输入书名'); return; }
    b.title = title;
    b.status = dom.bkStatus.value;
    b.tags = bookTagEditor.value();
    b.shelfId = Number(dom.bkShelf.value) || 0;
    closeModal(dom.bookModal);
    await persistLib();
    renderLibrary();
    toast('已保存');
  }

  /* ----- 导入 ----- */
  async function importInto(shelfId, mode) {
    const fn = (mode === 'folder') ? api.libImportFolder : api.libImportFiles;
    if (dom.importBar) { dom.importBar.classList.remove('hidden'); dom.importBarFill.style.width = '0%'; dom.importText.textContent = '准备导入…'; }
    let res;
    try { res = await fn(shelfId || 0); } catch (e) { toast('导入失败：' + (e && e.message ? e.message : '')); return; }
    if (dom.importBar) dom.importBar.classList.add('hidden');
    if (!res || res.canceled) return;
    if (!res.ok) { toast('导入失败：' + ((res && res.error) || '未知错误')); return; }
    library = normalizeLibrary(res.library);
    renderLibrary();
    const r = res.report || {};
    toast('已导入：系列 ' + (r.shelves || 0) + ' · 书籍 ' + (r.books || 0) + ((r.skipped && r.skipped.length) ? ('，跳过 ' + r.skipped.length) : ''));
  }

  /* ----- 右键菜单 ----- */
  function openBookCtx(item, x, y) {
    ctxItems = [item];
    let html = '';
    function b(label, act) { return '<button type="button" data-act="' + act + '">' + label + '</button>'; }
    if (item.kind === 'shelf') {
      html += b('打开', 'open') + b('新建子系列', 'subnew') + b('重命名', 'rename');
      html += b('设置封面…', 'setcover') + b('清除封面', 'clearcover');
    } else {
      html += b('阅读', 'read') + b('编辑信息', 'edit') + b('重新生成封面', 'regen');
      html += b('设置封面…', 'setcover') + b('清除封面', 'clearcover') + b('在文件夹中显示', 'reveal');
    }
    html += b('移动到…', 'move') + b('删除', 'delete');
    dom.bookCtxMenu.innerHTML = html;
    dom.bookCtxMenu.classList.remove('hidden');
    dom.bookCtxMenu.style.left = Math.min(x, window.innerWidth - 190) + 'px';
    dom.bookCtxMenu.style.top = Math.min(y, window.innerHeight - 280) + 'px';
  }
  function closeBookCtx() { dom.bookCtxMenu.classList.add('hidden'); }

  async function ctxAction(act) {
    const item = ctxItems[0]; closeBookCtx();
    if (!item) return;
    if (act === 'open' && item.kind === 'shelf') { curShelfId = item.id; expandedShelves[item.id] = true; renderLibrary(); return; }
    if (act === 'subnew') { openShelfModal('new', null, item.id); return; }
    if (act === 'rename') { openShelfModal('rename', item.id, 0); return; }
    if (act === 'read') { readBook(item.id); return; }
    if (act === 'edit') { openBookModal(item.id); return; }
    if (act === 'regen') { await regenBookCover(item.id); return; }
    if (act === 'reveal') { const b = library.books.find(function (x) { return x.id === item.id; }); if (b) revealArt(b.path); return; }
    if (act === 'setcover') { coverPickTarget = item; dom.coverPickFile.click(); return; }
    if (act === 'clearcover') { await clearCover(item); return; }
    if (act === 'move') { openMoveModal([item]); return; }
    if (act === 'delete') { await deleteItems([item]); return; }
  }

  async function clearCover(item) {
    if (item.kind === 'book') { const b = library.books.find(function (x) { return x.id === item.id; }); if (b) b.cover = ''; }
    else { const s = shelfById(item.id); if (s) s.cover = ''; }
    await persistLib();
    renderLibrary();
    toast('封面已清除');
  }

  async function applyPickedCover(dataUrl) {
    if (!coverPickTarget || !dataUrl) return;
    if (coverPickTarget.kind === 'book') {
      const b = library.books.find(function (x) { return x.id === coverPickTarget.id; });
      if (b) b.cover = dataUrl;
    } else {
      const s = shelfById(coverPickTarget.id);
      if (s) s.cover = dataUrl;
    }
    coverPickTarget = null;
    await persistLib();
    renderLibrary();
    toast('封面已更新');
  }

  function openMoveModal(items) {
    ctxItems = items;
    dom.moveShelf.innerHTML = shelfOptionsHtml();
    openModal(dom.moveModal);
  }
  async function saveMoveModal() {
    const target = Number(dom.moveShelf.value) || 0;
    for (const it of ctxItems) {
      if (it.kind === 'book') { const b = library.books.find(function (x) { return x.id === it.id; }); if (b) b.shelfId = target; }
      else if (it.kind === 'shelf' && it.id !== target) {
        const ids = descendantIds(it.id);
        if (ids.indexOf(target) === -1) { const s = shelfById(it.id); if (s) s.parentId = target; }
      }
    }
    closeModal(dom.moveModal);
    await persistLib();
    renderLibrary();
    toast('已移动');
  }

  async function deleteItems(items) {
    const ok = await confirmDialog('确定删除所选 ' + items.length + ' 项吗？（不会删除磁盘上的原文件）', '删除');
    if (!ok) return;
    const shelfIds = items.filter(function (i) { return i.kind === 'shelf'; }).map(function (i) { return i.id; });
    const bookIds = items.filter(function (i) { return i.kind === 'book'; }).map(function (i) { return i.id; });
    const dead = {};
    shelfIds.forEach(function (id) { descendantIds(id).forEach(function (x) { dead[x] = 1; }); });
    const removedIds = [];
    library.books.forEach(function (b) { if (dead[b.shelfId] || bookIds.indexOf(b.id) > -1) removedIds.push(b.id); });
    library.shelves = library.shelves.filter(function (s) { return !dead[s.id]; });
    library.books = library.books.filter(function (b) { return !dead[b.shelfId] && bookIds.indexOf(b.id) === -1; });
    await persistLib();
    if (api.libDeleteFiles && removedIds.length) { try { await api.libDeleteFiles(removedIds); } catch (e) { /* */ } }
    renderLibrary();
    toast('已删除');
  }

  async function clearLibrary() {
    if (!library.books.length && !library.shelves.length) { toast('书库已是空的'); return; }
    const ok = await confirmDialog('确定清空整个书库吗？将删除所有系列与书籍登记及本地副本，不可恢复。', '清空书库');
    if (!ok) return;
    const ids = library.books.map(function (b) { return b.id; });
    library = { shelves: [], books: [] };
    await persistLib();
    if (api.libDeleteFiles && ids.length) { try { await api.libDeleteFiles(ids); } catch (e) { /* */ } }
    renderLibrary();
    toast('书库已清空');
  }

  async function clearCharacters() {
    if (!characters.length) { toast('没有角色数据'); return; }
    const ok = await confirmDialog('确定清空所有角色卡片吗？将删除角色与图集文件，不可恢复。', '清空角色卡片');
    if (!ok) return;
    characters = [];
    await commitChars();
    toast('角色卡片已清空');
  }

  async function clearAllShots() {
    const total = games.reduce(function (s, g) { return s + ((g.shots && g.shots.length) || 0); }, 0);
    if (!total) { toast('没有截图数据'); return; }
    const ok = await confirmDialog('确定清空所有游戏的截图吗？将删除截图文件，不可恢复。', '清空截图');
    if (!ok) return;
    games.forEach(function (g) { g.shots = []; });
    await commit();
    renderShotsPage();
    toast('截图已清空');
  }

  /* ----- 阅读时长统计 ----- */
  let rvReadId = '';
  let rvReadStart = 0;
  function startReading(id) {
    stopReading();
    if (!id) return;
    rvReadId = id;
    rvReadStart = Date.now();
  }
  function stopReading() {
    if (!rvReadId || !rvReadStart) { rvReadId = ''; rvReadStart = 0; return; }
    const secs = Math.floor((Date.now() - rvReadStart) / 1000);
    const id = rvReadId;
    rvReadId = ''; rvReadStart = 0;
    if (secs > 0) {
      const b = library.books.find(function (x) { return x.id === id; });
      if (b) { b.readSeconds = (b.readSeconds || 0) + secs; persistLib(); }
    }
  }

  async function regenBookCover(id) {
    const b = library.books.find(function (x) { return x.id === id; });
    if (!b) return;
    toast('正在生成封面…');
    const r = await api.libCover({ path: b.path });
    if (r && r.ok) { b.cover = r.cover || ''; await persistLib(); renderLibrary(); toast(r.cover ? '封面已更新' : '该格式没有可用封面'); }
    else toast('生成失败：' + ((r && r.error) || '未知错误'));
  }

  async function readBook(id) {
    const session = ++avSession;
    const b = library.books.find(function (x) { return x.id === id; });
    if (!b) return;
    if (!b.path) { toast('该条目没有路径'); return; }
    b.lastRead = new Date().toISOString().slice(0, 16).replace('T', ' ');
    persistLib();
    if (b.type === 'txt') {
      try {
        const r = await api.libImageList(b.path);
        if (session !== avSession) return;
        if (r && r.ok && r.pages && r.pages.length) { openPagesViewer({ id: b.id, name: b.title, path: b.path, position: b.position }, r.pages); return; }
      } catch (e) { /* ignore */ }
      if (session !== avSession) return;
      openTxtReader(b);
      return;
    }
    openArtViewer({ id: b.id, name: b.title, path: b.path, position: b.position });
  }

  // Each stored bookmark belongs to its book ID. EPUB keeps a CFI anchor,
  // PDFs/images use an exact file page and TXT uses its current layout page.
  function activeReaderBook() {
    if (!avCurrentArt || !avCurrentArt.id) return null;
    return library.books.find(function (b) { return b.id === avCurrentArt.id; }) || null;
  }
  function restorePagePosition(item) {
    try {
      const pos = JSON.parse(item && item.position || activeReaderBook()?.position || '{}');
      return pos && pos.kind === 'pages' && Number.isInteger(pos.page) ? pos.page : 1;
    } catch (_) { return 1; }
  }
  function setReaderPage(page, total, label) {
    avPageTotal = Math.max(0, Math.round(Number(total) || 0));
    avPageNo = Math.max(1, Math.min(avPageTotal || 1, Math.round(Number(page) || 1)));
    const text = avPageTotal ? avPageNo + ' / ' + avPageTotal : '—';
    if (dom.rvCount) dom.rvCount.textContent = label || text;
    if (dom.avGoto) dom.avGoto.max = String(avPageTotal || 1);
    updateBookmarkButton();
  }
  function scheduleReaderPosition(position) {
    const book = activeReaderBook();
    if (!book) return;
    const encoded = JSON.stringify(position);
    if (book.position === encoded) return;
    book.position = encoded;
    clearTimeout(avSaveTimer);
    avSaveTimer = setTimeout(function () { avSaveTimer = null; persistLib(); }, 800);
  }
  function currentBookmarkAnchor() {
    if (!avPageTotal) return null;
    const loc = avCurrentLocation || {};
    return {
      kind: avBookMode ? (avFixedLayout ? 'fixed' : 'reflow') : (avTxtEl ? 'txt' : 'pages'),
      page: avPageNo,
      cfi: avBookMode ? String(loc.cfi || '') : '',
      label: (avBookMode && loc.label ? loc.label + ' · ' : '') + '第 ' + avPageNo + ' 页'
    };
  }
  function bookmarkMatches(bookmark, anchor) {
    if (!bookmark || !anchor) return false;
    if (bookmark.cfi && anchor.cfi) return bookmark.cfi === anchor.cfi;
    return bookmark.kind === anchor.kind && bookmark.page === anchor.page;
  }
  function updateBookmarkButton() {
    const anchor = currentBookmarkAnchor();
    const book = activeReaderBook();
    const selected = !!(book && anchor && (book.bookmarks || []).some(function (v) { return bookmarkMatches(v, anchor); }));
    dom.rvAddBookmark.textContent = selected ? '★ 已书签' : '☆ 书签';
    dom.rvAddBookmark.setAttribute('aria-pressed', String(selected));
    dom.rvAddBookmark.disabled = !book || !anchor;
  }
  function showReaderDrawer(tab) {
    avDrawerTab = tab === 'bookmarks' ? 'bookmarks' : 'toc';
    dom.rvTocList.classList.toggle('hidden', avDrawerTab !== 'toc');
    dom.rvBookmarksList.classList.toggle('hidden', avDrawerTab !== 'bookmarks');
    dom.rvTabToc.classList.toggle('active', avDrawerTab === 'toc');
    dom.rvTabBookmarks.classList.toggle('active', avDrawerTab === 'bookmarks');
    dom.rvTabToc.setAttribute('aria-selected', String(avDrawerTab === 'toc'));
    dom.rvTabBookmarks.setAttribute('aria-selected', String(avDrawerTab === 'bookmarks'));
    if (avDrawerTab === 'bookmarks') renderReaderBookmarks();
    dom.rvDrawer.classList.add('open');
  }
  function renderReaderBookmarks() {
    const list = dom.rvBookmarksList;
    list.replaceChildren();
    const book = activeReaderBook();
    const bookmarks = book && Array.isArray(book.bookmarks) ? book.bookmarks : [];
    if (!bookmarks.length) {
      const empty = document.createElement('div');
      empty.className = 'rv-toc-empty';
      empty.textContent = book ? '还没有书签。阅读时点击底部「☆ 书签」即可添加。' : '请从书库打开书籍以使用书签。';
      list.appendChild(empty);
      return;
    }
    bookmarks.forEach(function (bookmark) {
      const row = document.createElement('div'); row.className = 'rv-bookmark-row';
      const go = document.createElement('button'); go.type = 'button'; go.className = 'rv-bookmark-go';
      go.textContent = bookmark.label || '第 ' + bookmark.page + ' 页';
      go.title = bookmark.createdAt ? '添加于 ' + bookmark.createdAt : '跳转到书签';
      go.addEventListener('click', function () {
        if (avBookMode) {
          if (bookmark.cfi) sendBook({ action: 'goHref', value: bookmark.cfi });
          else sendBook({ action: 'goPage', value: bookmark.page });
        } else if (avTxtEl) {
          goToTextPage(bookmark.page);
        } else if (avPages.length) {
          avIndex = Math.min(avPages.length - 1, Math.max(0, bookmark.page - 1));
          renderArtPage();
        }
        dom.rvDrawer.classList.remove('open');
      });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'rv-bookmark-remove';
      remove.textContent = '删除'; remove.title = '删除此书签';
      remove.addEventListener('click', function () {
        book.bookmarks = book.bookmarks.filter(function (v) { return v.id !== bookmark.id; });
        persistLib(); renderReaderBookmarks(); updateBookmarkButton();
      });
      row.append(go, remove); list.appendChild(row);
    });
  }
  function toggleReaderBookmark() {
    const book = activeReaderBook();
    const anchor = currentBookmarkAnchor();
    if (!book || !anchor) { toast('请先从书库打开书籍，待页码加载后再添加书签'); return; }
    if (!Array.isArray(book.bookmarks)) book.bookmarks = [];
    const existing = book.bookmarks.find(function (v) { return bookmarkMatches(v, anchor); });
    if (existing) {
      book.bookmarks = book.bookmarks.filter(function (v) { return v.id !== existing.id; });
      toast('已移除当前书签');
    } else {
      book.bookmarks.push(Object.assign({ id: generateId(), createdAt: new Date().toISOString() }, anchor));
      toast('书签已保存');
    }
    persistLib(); updateBookmarkButton();
    if (avDrawerTab === 'bookmarks') renderReaderBookmarks();
  }
  function updateTextPosition() {
    if (!avTxtEl) return;
    const height = Math.max(1, dom.avBody.clientHeight);
    const total = Math.max(1, Math.ceil(avTxtEl.scrollHeight / height));
    const page = Math.max(1, Math.min(total, Math.floor(dom.avBody.scrollTop / height) + 1));
    setReaderPage(page, total);
    dom.avCounter.textContent = '第 ' + page + ' / ' + total + ' 页';
    const frac = total > 1 ? (page - 1) / (total - 1) : 0;
    dom.rvSlider.value = String(Math.round(frac * 1000));
    dom.rvProgressFill.style.width = Math.round(frac * 100) + '%';
    scheduleReaderPosition({ kind: 'txt', page: page });
  }
  function goToTextPage(page) {
    if (!avTxtEl) return;
    const height = Math.max(1, dom.avBody.clientHeight);
    const total = Math.max(1, Math.ceil(avTxtEl.scrollHeight / height));
    dom.avBody.scrollTop = Math.max(0, Math.min(total - 1, Math.floor(page - 1))) * height;
    updateTextPosition();
  }

  function openPagesViewer(item, pages) {
    releaseReader();
    avCurrentArt = item;
    avPages = pages || [];
    avIndex = Math.max(0, Math.min(avPages.length - 1, restorePagePosition(item) - 1));
    avBookMode = false;
    avFrame = null;
    avScale = 1;
    dom.avBody.classList.remove('txt-mode');
    if (dom.rvDrawer) dom.rvDrawer.classList.remove('open');
    if (dom.rvTocList) dom.rvTocList.innerHTML = '<div class="rv-toc-empty">该书籍没有目录</div>';
    if (dom.rvProgressFill) dom.rvProgressFill.style.width = '0%';
    dom.avTitle.textContent = item.name || '';
    dom.avCounter.textContent = '';
    renderArtPage();
    openModal(dom.artViewer);
    rvShowBars();
    startReading(item && item.id);
  }

  async function openTxtReader(b) {
    const session = releaseReader();
    avCurrentArt = { id: b.id, name: b.title, path: b.path };
    avPages = []; avBookMode = false; avFrame = null; avScale = 1;
    dom.avBody.classList.add('txt-mode');
    if (dom.rvDrawer) dom.rvDrawer.classList.remove('open');
    dom.avTitle.textContent = b.title; dom.avCounter.textContent = '文本';
    dom.avBody.innerHTML = '<div class="av-msg">正在读取…</div>';
    openModal(dom.artViewer); rvShowBars();
    startReading(b && b.id);
    const r = await api.libReadText(b.path);
    if (session !== avSession) return;
    if (!r || !r.ok) { dom.avBody.innerHTML = '<div class="av-msg">读取失败：' + esc((r && r.error) || '未知错误') + '</div>'; return; }
    const pre = document.createElement('div');
    pre.className = 'txt-reader';
    pre.style.fontSize = avFont + 'px';
    const text = r.text || '';
    avTxtEl = pre;
    dom.avBody.replaceChildren(pre);
    applyReaderTheme();
    // Keep all text in the DOM (selection/search/scroll still work), but yield
    // between batches so a multi-megabyte TXT cannot freeze the renderer.
    // content-visibility on each chunk defers offscreen layout work.
    for (let offset = 0; offset < text.length;) {
      if (session !== avSession) return;
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < 16 && offset < text.length; i++) {
        let end = Math.min(text.length, offset + 8000);
        if (end < text.length) {
          const newline = text.lastIndexOf('\n', end);
          if (newline > offset) end = newline + 1;
        }
        const chunk = document.createElement('div');
        chunk.className = 'txt-chunk';
        chunk.textContent = text.slice(offset, end);
        fragment.appendChild(chunk);
        offset = end;
      }
      pre.appendChild(fragment);
      if (offset < text.length) await new Promise(resolve => requestAnimationFrame(resolve));
    }
    if (dom.avToc) dom.avToc.innerHTML = '<option value="">目录</option>';
    if (dom.rvTocList) dom.rvTocList.innerHTML = '<div class="rv-toc-empty">该书籍没有目录</div>';
    dom.avCounter.textContent = '文本';
    applyReaderTheme();
    try {
      const position = JSON.parse(b.position || '{}');
      if (position.kind === 'txt' && position.page > 1) goToTextPage(position.page);
      else updateTextPosition();
    } catch (_) { updateTextPosition(); }
  }

  /* ----- 打开/定位（复用资源管理器） ----- */
  async function openArt(path) {
    if (!path) { toast('未选择路径'); return; }
    const res = await api.artOpen(path);
    if (!res || !res.ok) toast('打开失败：' + ((res && res.error) || '未知错误'));
  }
  async function revealArt(path) {
    if (!path) { toast('未选择路径'); return; }
    const res = await api.artReveal(path);
    if (!res || !res.ok) toast('定位失败：' + ((res && res.error) || '未知错误'));
  }

  /* ==================== 资料集内部阅读器 ==================== */
  async function openArtViewer(item) {
    const session = releaseReader();
    const a = (item && item.path) ? item : null;
    if (!a) return;
    if (!a.path) { toast('未选择路径'); return; }

    /* 统一交给主进程判定：图片页 / 电子书 / 列表 / 其它 */
    const res = await api.artBrowse(a.path);
    if (session !== avSession) return;
    if (!res || !res.ok) { toast('无法打开：' + ((res && res.error) || '未知错误')); return; }

    if (res.kind === 'book') {
      const r = await api.bookOpen(a.path);
      if (session !== avSession) return;
      if (r && r.ok) { openArtBook(a, r.url); return; }
      toast('阅读器打开失败：' + ((r && r.error) || '未知错误'));
      return;
    }

    avCurrentArt = a;
    avPages = [];
    avIndex = 0;
    avBookMode = false;
    avFrame = null;
    avScale = 1;
    dom.avBody.classList.remove('txt-mode');
    if (dom.rvDrawer) dom.rvDrawer.classList.remove('open');
    dom.avTitle.textContent = res.title || a.name;
    dom.avCounter.textContent = '';
    dom.avBody.innerHTML = '';

    if (res.kind === 'pages') {
      avPages = res.pages || [];
      avIndex = Math.max(0, Math.min(avPages.length - 1, restorePagePosition(a) - 1));
      renderArtPage();
    } else if (res.kind === 'list') {
      const list = document.createElement('div');
      list.className = 'av-list';
      (res.entries || []).forEach(function (en) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = (en.isDir ? '📁 ' : '📄 ') + en.name;
        b.addEventListener('click', function () {
          const full = res.path ? (res.path.replace(/[\\/]+$/, '') + (en.isDir ? '/' : '/') + en.name) : '';
          if (en.isDir) openArtViewerByPath(full, en.name);
          else openArt(full);
        });
        list.appendChild(b);
      });
      dom.avBody.appendChild(list);
    } else {
      dom.avCounter.textContent = '';
      const msg = document.createElement('div');
      msg.className = 'av-msg';
      msg.textContent = '该格式暂不支持内部预览，可点击右上角「系统打开」。';
      dom.avBody.appendChild(msg);
    }
    openModal(dom.artViewer); rvShowBars();
    startReading(a && a.id);
  }

  function sendBook(msg) {
    if (avFrame && avFrame.contentWindow) {
      try { avFrame.contentWindow.postMessage(Object.assign({ target: 'vl-reader' }, msg), '*'); } catch (e) { /* */ }
    }
  }

  function openArtBook(a, url) {
    releaseReader();
    avCurrentArt = a;
    avPages = [];
    avBookMode = true;
    avFixedLayout = false;
    avTxtEl = null;
    avScale = 1;
    avRestore = null;
    avReaderOpened = false;
    avPageTotal = 0; avPageNo = 1; avCurrentLocation = null;
    updateBookmarkButton();
    if (a && a.position) { try { avRestore = JSON.parse(a.position); } catch (e) { avRestore = null; } }
    dom.avBody.classList.remove('txt-mode');
    if (dom.rvDrawer) dom.rvDrawer.classList.remove('open');
    if (dom.avToc) dom.avToc.innerHTML = '<option value="">目录</option>';
    if (dom.rvTocList) dom.rvTocList.innerHTML = '';
    if (dom.rvProgressFill) dom.rvProgressFill.style.width = '0%';
    if (dom.rvSlider) dom.rvSlider.value = '0';
    if (dom.rvCount) dom.rvCount.textContent = '0%';
    dom.avTitle.textContent = a.name || '';
    dom.avCounter.textContent = '阅读中…';
    dom.avGoto.value = '';
    dom.avBody.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.setAttribute('src', url);
    avFrame = iframe;
    dom.avBody.appendChild(iframe);
    openModal(dom.artViewer); rvShowBars();
    startReading(a && a.id);
    applyReaderTheme();
  }

  async function openArtViewerByPath(path, title) {
    const session = releaseReader();
    const res = await api.artBrowse(path);
    if (session !== avSession) return;
    if (!res || !res.ok) { toast('无法打开：' + ((res && res.error) || '未知错误')); return; }
    avCurrentArt = { path: path, name: title };
    avPages = [];
    avIndex = 0;
    avBookMode = false;
    avFrame = null;
    dom.avTitle.textContent = res.title || title;
    dom.avCounter.textContent = '';
    dom.avBody.innerHTML = '';
    if (res.kind === 'pages') { avPages = res.pages || []; renderArtPage(); }
    else if (res.kind === 'pdf') {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('src', res.url);
      dom.avBody.appendChild(iframe);
    } else {
      const msg = document.createElement('div');
      msg.className = 'av-msg';
      msg.textContent = '该内容暂不支持内部预览。';
      dom.avBody.appendChild(msg);
    }
  }

  function renderArtPage() {
    if (!avPages.length) {
      dom.avBody.innerHTML = '<div class="av-msg">没有可显示的图片页。</div>';
      dom.avCounter.textContent = '';
      return;
    }
    const pageStep = avColumns === 2 ? 2 : 1;
    const spreadCount = Math.ceil(avPages.length / pageStep);
    const spreadIndex = Math.max(0, Math.min(spreadCount - 1, Math.floor(avIndex / pageStep)));
    avIndex = spreadIndex * pageStep;
    const visibleCount = Math.min(pageStep, avPages.length - avIndex);
    const spreadLabel = visibleCount === 2
      ? (avIndex + 1) + '–' + (avIndex + 2) + ' / ' + avPages.length
      : (avIndex + 1) + ' / ' + avPages.length;
    dom.avCounter.textContent = spreadLabel;
    let spread = dom.avBody.querySelector('.av-page-spread');
    if (!spread) {
      spread = document.createElement('div');
      spread.className = 'av-page-spread';
      dom.avBody.replaceChildren(spread);
    }
    spread.classList.toggle('two-page', pageStep === 2);
    // Transforms do not change scrollHeight. Give zoomed picture pages actual
    // layout dimensions so the native scroll container can move vertically.
    const scrollZoom = avFlow === 'scrolled' && avScale > 1;
    spread.classList.toggle('scroll-zoom', scrollZoom);
    spread.style.height = scrollZoom ? Math.ceil(dom.avBody.clientHeight * avScale) + 'px' : '';
    spread.style.flexShrink = scrollZoom ? '0' : '';
    while (spread.children.length > visibleCount) spread.lastElementChild.remove();
    while (spread.children.length < visibleCount) {
      const img = document.createElement('img');
      img.className = 'av-page';
      img.alt = '';
      img.decoding = 'async';
      img.addEventListener('click', function () { stepArtPage(1); });
      spread.appendChild(img);
    }
    for (let offset = 0; offset < visibleCount; offset++) {
      const img = spread.children[offset];
      const source = avPages[avIndex + offset];
      if (img.getAttribute('src') !== source) img.src = source;
      img.style.transform = scrollZoom ? '' : 'scale(' + avScale + ')';
      img.style.transformOrigin = 'center center';
      img.style.height = scrollZoom ? '100%' : '';
      img.style.maxHeight = scrollZoom ? 'none' : '';
    }
    // Only preload the page(s) immediately adjacent to the visible spread.
    avPreloads.forEach(function (image) { image.src = ''; });
    avPreloads = [-pageStep, pageStep].flatMap(function (delta) {
      const neighbor = avIndex + delta;
      if (neighbor < 0 || neighbor >= avPages.length) return [];
      return Array.from({ length: Math.min(pageStep, avPages.length - neighbor) }, function (_, i) {
        const image = new Image();
        image.src = avPages[neighbor + i];
        return image;
      });
    });
    const fraction = avPages.length > 1 ? avIndex / (avPages.length - 1) : 0;
    dom.rvProgressFill.style.width = Math.round(fraction * 100) + '%';
    dom.rvSlider.value = String(Math.round(fraction * 1000));
    setReaderPage(avIndex + 1, avPages.length, spreadLabel);
    scheduleReaderPosition({ kind: 'pages', page: avIndex + 1 });
  }

  function stepArtPage(delta) {
    if (avBookMode) { sendBook({ action: delta > 0 ? 'next' : 'prev' }); return; }
    if (!avPages.length) return;
    const size = avColumns === 2 ? 2 : 1;
    const groups = Math.ceil(avPages.length / size);
    const current = Math.floor(avIndex / size);
    const next = Math.max(0, Math.min(groups - 1, current + delta));
    if (next === current) return; // No first/last page wraparound.
    avIndex = next * size;
    renderArtPage();
  }

  window.addEventListener('message', function (ev) {
    const m = ev.data || {};
    if (m.source !== 'vl-reader') return;
    if (!avFrame || ev.source !== avFrame.contentWindow) return;
    if (!dom.artViewer.classList.contains('show')) return;
    if (m.type === 'relocate') {
      const frac = (typeof m.fraction === 'number') ? m.fraction : 0;
      const pct = Math.round(frac * 100);
      if (dom.rvProgressFill) dom.rvProgressFill.style.width = pct + '%';
      if (dom.rvSlider) dom.rvSlider.value = String(Math.round(frac * 1000));
      avCurrentLocation = { cfi: m.cfi || '', label: m.label || '', fraction: frac };
      avPageTotal = Number(m.totalPages) || 0;
      setReaderPage(m.page || 1, avPageTotal);
      dom.avCounter.textContent = avPageTotal
        ? '第 ' + avPageNo + ' / ' + avPageTotal + ' 页' + (m.label ? ' · ' + m.label : '')
        : (m.label || '阅读中…');
      /* 记录阅读进度（断点续读） */
      if (avReaderOpened && avCurrentArt && avCurrentArt.id) {
        const b = library.books.find(function (x) { return x.id === avCurrentArt.id; });
        if (b) {
          b.position = JSON.stringify({ fraction: frac, cfi: m.cfi || '', label: m.label || '' });
          clearTimeout(avSaveTimer);
          avSaveTimer = setTimeout(function () { avSaveTimer = null; persistLib(); }, 800);
        }
      }
    } else if (m.type === 'ready') {
      // Apply saved settings/position once, before Foliate's initial layout.
      const theme = RV_THEMES[avTheme];
      sendBook({ action: 'configure', font: avFont, columns: avColumns, flow: avFlow,
        fg: theme.fg, bg: theme.bg,
        cfi: avRestore && avRestore.cfi || '',
        fraction: avRestore && avRestore.fraction || 0 });
      avRestore = null;
    } else if (m.type === 'opened') {
      avReaderOpened = true;
      avFixedLayout = !!m.fixedLayout;
      if (m.title) dom.avTitle.textContent = m.title;
    } else if (m.type === 'toc') {
      const items = m.items || [];
      let opts = '<option value="">目录</option>';
      let listHtml = '';
      items.forEach(function (it) {
        if (!it || !it.href) return;
        opts += '<option value="' + esc(it.href) + '">' + esc(it.label || '') + '</option>';
        listHtml += '<button type="button" class="rv-toc-item" data-href="' + esc(it.href) + '" style="padding-left:' + (8 + (it.depth || 0) * 14) + 'px;">' + esc(it.label || '') + '</button>';
      });
      if (dom.avToc) dom.avToc.innerHTML = opts;
      if (dom.rvTocList) dom.rvTocList.innerHTML = listHtml || '<div class="rv-toc-empty">该书籍没有目录</div>';
    } else if (m.type === 'error') {
      toast('阅读器错误：' + m.message);
    }
  });

  /* ==================== 设置 ==================== */
  function openSettings() {
    dom.sSgdbKey.value = settings.steamgriddbKey || '';
    dom.sTmdbKey.value = settings.tmdbKey || '';
    dom.sBangumiToken.value = settings.bangumiToken || '';
    dom.settingsStatus.textContent = '';
    openModal(dom.settingsModal);
  }

  async function saveSettings() {
    settings = {
      steamgriddbKey: dom.sSgdbKey.value.trim(),
      tmdbKey: dom.sTmdbKey.value.trim(),
      bangumiToken: dom.sBangumiToken.value.trim()
    };
    try {
      await api.saveSettings(settings);
      toast('设置已保存');
      closeModal(dom.settingsModal);
    } catch (e) {
      toast('保存失败：' + (e && e.message ? e.message : '未知错误'));
    }
  }

  /* ==================== 单条目在线刮削 ==================== */
  function hasCJK(s) { return /[\u4e00-\u9fff]/.test(String(s || '')); }
  function setIsHint(msg) { dom.isHint.textContent = msg; }

  function clearItemScrapeResults() {
    dom.isResults.innerHTML = '';
    dom.isAssets.innerHTML = '';
    isResult = null;
  }

  function setItemSource(src) {
    isSource = src;
    Array.prototype.forEach.call(dom.isSources.querySelectorAll('.pill[data-source]'), function (p) {
      p.classList.toggle('active', p.dataset.source === src);
    });
  }

  async function openItemScrape() {
    const name = dom.scrapeName.value.trim() || dom.name.value.trim();
    dom.isQuery.value = name;
    setItemSource('steamgriddb');
    clearItemScrapeResults();
    setIsHint('正在准备…');
    openModal(dom.itemScrapeModal);

    if (!name) { setIsHint('请输入搜索名称。'); return; }
    /* 不自动翻译：仅在点击「中→英」按钮时翻译；这里只自动搜索当前名称 */
    await doItemSearch();
  }

  async function translateItemName() {
    const q = dom.isQuery.value.trim();
    if (!q) { toast('请先填写名称'); return; }
    setIsHint('正在翻译…');
    const t = await api.translate({ text: q, from: 'zh-CN', to: 'en' });
    if (t && t.ok && t.text) { dom.isQuery.value = t.text; setIsHint('已翻译为：' + t.text); }
    else setIsHint('翻译失败：' + ((t && t.error) || '未知错误'));
  }

  async function doItemSearch() {
    const term = dom.isQuery.value.trim();
    if (!term) { toast('请填写搜索名称'); return; }
    clearItemScrapeResults();
    setIsHint('正在搜索…');
    const res = await api.scrapeSearch({ source: isSource, term: term });
    if (!res || !res.ok) { setIsHint('搜索失败：' + ((res && res.error) || '未知错误')); return; }

    const results = res.results || [];
    if (!results.length) { setIsHint('没有找到结果，可手动修改名称后重试。'); return; }
    setIsHint('找到 ' + results.length + ' 个结果，点击选择：');
    dom.isResults.innerHTML = results.map(function (r, i) {
      const yr = r.year ? '<span class="yr">' + esc(r.year) + '</span>' : '';
      return '<button type="button" class="scrape-result" data-idx="' + i + '">' +
        '<span>' + esc(r.name) + '</span>' + yr + '</button>';
    }).join('');

    const buttons = dom.isResults.querySelectorAll('.scrape-result');
    Array.prototype.forEach.call(buttons, function (btn) {
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(buttons, function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        selectItemResult(results[Number(btn.dataset.idx)]);
      });
    });
  }

  async function selectItemResult(r) {
    isResult = r;
    dom.isAssets.innerHTML = '';
    setIsHint('正在获取可用图片…');
    const res = await api.scrapeAssets({ source: r.source, id: r.id, mediaType: r.mediaType });
    if (!res || !res.ok) { setIsHint('获取图片失败：' + ((res && res.error) || '未知错误')); return; }
    const assets = res.assets || [];
    if (!assets.length) { setIsHint('该条目没有可用图片。'); return; }
    setIsHint('选择要下载的图片（' + assets.length + ' 张），下载后可手动调整裁剪。');
    dom.isAssets.innerHTML = assets.map(function (a, i) {
      return '<div class="asset" data-idx="' + i + '" title="' + esc(a.kind || '') + '">' +
        '<img src="' + esc(a.thumb) + '" referrerpolicy="no-referrer" loading="lazy" alt="">' +
        (a.kind ? '<span class="tag">' + esc(a.kind) + '</span>' : '') +
        '<button type="button" class="add-shot" data-idx="' + i + '" title="加入截图">＋截图</button>' +
        '</div>';
    }).join('');

    Array.prototype.forEach.call(dom.isAssets.querySelectorAll('.asset'), function (el) {
      el.addEventListener('click', function (e) {
        if (e.target.closest('.add-shot')) return;
        pickItemAsset(assets[Number(el.dataset.idx)]);
      });
    });
    Array.prototype.forEach.call(dom.isAssets.querySelectorAll('.add-shot'), function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        addAssetAsShot(assets[Number(el.dataset.idx)]);
      });
    });
  }

  async function pickItemAsset(a) {
    setIsHint('正在下载图片…');
    const res = await api.downloadImage({ url: a.url });
    if (!res || !res.ok) { setIsHint('下载失败：' + ((res && res.error) || '未知错误')); return; }
    closeModal(dom.itemScrapeModal);
    /* 下载后自动进入裁剪（默认 16:9 填充），仍可手动微调 */
    openCropper(res.dataUrl);
  }

  async function addAssetAsShot(a) {
    setIsHint('正在下载图片…');
    const res = await api.downloadImage({ url: a.url });
    if (!res || !res.ok) { setIsHint('下载失败：' + ((res && res.error) || '未知错误')); return; }
    addShotDataUrl(res.dataUrl);
    setIsHint('已加入截图，保存条目后生效。');
    toast('已加入截图');
  }

  /* ==================== 事件绑定 ==================== */
  document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
    /* 仅当按下与松开都发生在遮罩本身时才关闭，
       避免在输入框内拖动选择文字、拖到弹窗外松开时误关编辑界面 */
    let pressedOnSelf = false;
    overlay.addEventListener('pointerdown', function (e) {
      pressedOnSelf = (e.target === overlay);
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay && pressedOnSelf) { if (overlay === dom.batchCoverModal) batchCoverAbort = true; if (overlay === dom.artViewer) closeReader(); else closeModal(overlay); }
      pressedOnSelf = false;
    });
    overlay.querySelectorAll('[data-close]').forEach(function (btn) {
      btn.addEventListener('click', function () { if (overlay === dom.batchCoverModal) batchCoverAbort = true; if (overlay === dom.artViewer) closeReader(); else closeModal(overlay); });
    });
  });

  $('addBtn').addEventListener('click', function () { openGameModal(null); });
  $('emptyAddBtn').addEventListener('click', function () { openGameModal(null); });

  $('saveBtn').addEventListener('click', saveGame);
  dom.name.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); saveGame(); }
  });

  /* 星级评分 */
  dom.starInput.addEventListener('click', function (e) {
    const s = e.target.closest('span[data-star]');
    if (!s) return;
    const v = Number(s.dataset.star);
    setRatingUI(currentRating === v ? 0 : v);
  });
  dom.starInput.addEventListener('mouseover', function (e) {
    const s = e.target.closest('span[data-star]');
    if (!s) return;
    const v = Number(s.dataset.star);
    Array.prototype.forEach.call(dom.starInput.children, function (el) {
      el.classList.toggle('on', Number(el.dataset.star) <= v);
    });
  });
  dom.starInput.addEventListener('mouseleave', function () { setRatingUI(currentRating); });

  /* 平台 / 系列 自动补全：候选跟随当前填写的分类 */
  attachAutocomplete(dom.platform, function (q) {
    return formValuesFor(dom.category.value, function (g) { return [g.platform]; }, q.length > 0);
  });
  attachAutocomplete(dom.series, function (q) {
    return formValuesFor(dom.category.value, function (g) { return splitList(g.series); }, q.length > 0);
  });

  /* 封面上传 / 移除 */
  $('coverUploadBtn').addEventListener('click', function () { dom.coverFile.click(); });
  dom.coverFile.addEventListener('change', function () {
    if (this.files && this.files[0]) handleCoverFile(this.files[0]);
    this.value = '';
  });
  $('coverRemoveBtn').addEventListener('click', function () {
    currentCover = '';
    updateCoverPreview();
    toast('封面已移除（保存后生效）');
  });

  /* 截图：上传 / 移除 / 查看 */
  $('shotsAddBtn').addEventListener('click', function () { dom.shotsFile.click(); });
  dom.shotsFile.addEventListener('change', function () {
    handleShotsFiles(this.files);
    this.value = '';
  });
  dom.shotsGrid.addEventListener('click', function (e) {
    const btn = e.target.closest('.shot-remove');
    if (!btn) return;
    currentShots.splice(Number(btn.dataset.idx), 1);
    renderShotsEditor();
  });
  dom.shotsGallery.addEventListener('click', async function (e) {
    /* 点击后移除焦点，避免回车键重复触发删除 */
    const clickedBtn = e.target.closest('button');
    if (clickedBtn && clickedBtn.blur) clickedBtn.blur();

    const addBtn = e.target.closest('.js-shot-add');
    if (addBtn) { openShotAddMenu(addBtn.dataset.id, e.clientX, e.clientY); return; }

    const openFolderBtn = e.target.closest('.js-shot-openfolder');
    if (openFolderBtn) { api.openShotsFolder(openFolderBtn.dataset.id); return; }

    const moveBtn = e.target.closest('.js-shot-move');
    if (moveBtn) { openShotMove(moveBtn.dataset.id); return; }

    const clearBtn = e.target.closest('.js-shot-clear');
    if (clearBtn) { await clearGameShots(clearBtn.dataset.id); return; }

    const delBtn = e.target.closest('.shot-del');
    if (delBtn) { await deleteShotAt(delBtn.dataset.game, Number(delBtn.dataset.idx)); return; }

    const cell = e.target.closest('.shot-strip-item');
    if (!cell) return;
    const all = Array.prototype.slice.call(dom.shotsGallery.querySelectorAll('.shot-strip-item'));
    const items = all.map(function (el) {
      const del = el.querySelector('.shot-del');
      return {
        src: el.dataset.src,
        gameId: del ? del.dataset.game : '',
        idx: del ? Number(del.dataset.idx) : 0
      };
    });
    openShotViewer(items, all.indexOf(cell));
  });

  /* 截图页：给指定游戏上传 / 从文件夹导入 */
  dom.shotsPageFile.addEventListener('change', async function () {
    const files = Array.prototype.slice.call(this.files || []);
    this.value = '';
    if (!files.length || !shotAddTargetId) return;
    const dataUrls = [];
    await Promise.all(files.map(function (f) {
      return new Promise(function (res) {
        if (!/^image\//.test(f.type)) return res();
        const reader = new FileReader();
        reader.onload = function (ev) { dataUrls.push(ev.target.result); res(); };
        reader.onerror = function () { res(); };
        reader.readAsDataURL(f);
      });
    }));
    addShotsToGame(shotAddTargetId, dataUrls);
    await commit();
    renderShotsPage();
    toast('已添加 ' + dataUrls.length + ' 张截图');
  });

  /* 截图页：滚轮横向滚动预览 */
  dom.shotsGallery.addEventListener('wheel', function (e) {
    const strip = e.target.closest('.shot-strip');
    if (!strip) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      strip.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, { passive: false });

  /* 截图页：搜索 / 扫描文件夹 */
  let shotsSearchTimer = null;
  dom.shotsSearch.addEventListener('input', function () {
    const v = this.value;
    clearTimeout(shotsSearchTimer);
    shotsSearchTimer = setTimeout(function () { shotsQuery = v; renderShotsPage(); }, 160);
  });
  dom.shotsImportBtn.addEventListener('click', openShotImport);
  dom.shotsScope.addEventListener('change', function () {
    shotsCategory = this.value;
    renderShotsPage();
  });

  /* 截图「＋ 添加」菜单 */
  dom.shotAddMenu.addEventListener('click', async function (e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const target = shotAddTargetId;
    closeShotAddMenu();
    if (act === 'file') { dom.shotsPageFile.click(); }
    else if (act === 'folder') { await importShotsToGamePage(target); }
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#shotAddMenu') && !e.target.closest('.js-shot-add')) closeShotAddMenu();
  });

  /* 角色卡片 */
  $('charAddBtn').addEventListener('click', function () { openCharModal(null); });
  let charSearchTimer = null;
  dom.charSearch.addEventListener('input', function () {
    const v = this.value;
    clearTimeout(charSearchTimer);
    charSearchTimer = setTimeout(function () { charSearch = v; renderCharacters(); }, 160);
  });
  dom.charGrid.addEventListener('click', function (e) {
    const card = e.target.closest('.char-card');
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.closest('.js-char-edit')) { openCharModal(id); return; }
    if (e.target.closest('.js-char-del')) { deleteCharacter(id); return; }
    if (e.target.closest('.js-char-view') || e.target.closest('.char-img')) { openCharGallery(id); return; }
  });
  $('cUploadBtn').addEventListener('click', function () { dom.cFile.click(); });
  dom.cFile.addEventListener('change', function () {
    if (this.files && this.files[0]) handleCharFile(this.files[0]);
    this.value = '';
  });
  $('cRemoveBtn').addEventListener('click', function () { currentCharImage = ''; updateCharPreview(); });
  $('cSaveBtn').addEventListener('click', saveCharacter);
  dom.cName.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); saveCharacter(); }
  });

  /* 角色图集编辑（编辑弹窗内） */
  $('cShotsAddBtn').addEventListener('click', function () { dom.cShotsFile.click(); });
  dom.cShotsFile.addEventListener('change', function () {
    handleCharShotsFiles(this.files);
    this.value = '';
  });
  $('cShotsFolderBtn').addEventListener('click', async function () {
    const res = await api.importCharsFolder();
    if (!res || res.canceled) return;
    if (!res.ok) { toast('导入失败：' + ((res && res.error) || '未知错误')); return; }
    currentCharShots = currentCharShots.concat(res.shots || []);
    renderCharShotsEditor();
    toast('已导入 ' + (res.count || 0) + ' 张图片（保存后生效）');
  });
  dom.cShotsGrid.addEventListener('click', function (e) {
    const btn = e.target.closest('.shot-remove');
    if (!btn) return;
    currentCharShots.splice(Number(btn.dataset.idx), 1);
    renderCharShotsEditor();
  });

  /* 角色刮削 */
  dom.csOpenBtn.addEventListener('click', openCharScrape);
  dom.csSearchBtn.addEventListener('click', doCharSearch);
  dom.csQuery.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); doCharSearch(); }
  });
  dom.csWork.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); doCharSearch(); }
  });
  dom.csSources.addEventListener('click', function (e) {
    const p = e.target.closest('.pill[data-source]');
    if (!p) return;
    setCharScrapeSource(p.dataset.source);
    dom.csResults.innerHTML = '';
    dom.csAssets.innerHTML = '';
    charScrapeResult = null;
    csHint('来源已切换，点击「搜索」。');
  });

  /* 角色批量导入 */
  $('charBatchBtn').addEventListener('click', openCharBatch);
  dom.cbSearchBtn.addEventListener('click', doCbSearch);
  dom.cbWork.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); doCbSearch(); }
  });
  dom.cbSources.addEventListener('click', function (e) {
    const p = e.target.closest('.pill[data-source]');
    if (!p) return;
    setCbSource(p.dataset.source);
    dom.cbList.innerHTML = '';
    cbHintEl('来源已切换，点击「查询」。');
  });
  dom.cbList.addEventListener('change', function (e) {
    const cb = e.target.closest('input[type=checkbox]');
    if (!cb) return;
    cbSelected[Number(cb.dataset.idx)] = cb.checked;
  });
  dom.cbList.addEventListener('click', function (e) {
    const pick = e.target.closest('.js-cb-pick');
    if (pick) { loadCbCharacters(cbWorks[Number(pick.dataset.idx)]); return; }
    const b = e.target.closest('.js-cb-adjust');
    if (!b) return;
    adjustCbChar(Number(b.dataset.idx));
  });
  $('cbImportBtn').addEventListener('click', importSelectedChars);

  /* 角色图片搜索：跳转 Pixiv 浏览器搜索 */
  $('cImgSearchBtn').addEventListener('click', openCharImgSearch);
  dom.ciOpenBtn.addEventListener('click', openPixivSearch);
  dom.ciQuery.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); openPixivSearch(); }
  });

  /* 角色图集查看 */
  dom.cgBackBtn.addEventListener('click', function () { showPage('characters'); });
  dom.cgAddBtn.addEventListener('click', function () { dom.cgFile.click(); });
  dom.cgFile.addEventListener('change', function () {
    handleGalleryFiles(this.files);
    this.value = '';
  });
  dom.cgFolderBtn.addEventListener('click', async function () {
    const res = await api.importCharsFolder();
    if (!res || res.canceled) return;
    if (!res.ok) { toast('导入失败：' + ((res && res.error) || '未知错误')); return; }
    const c = characters.find(function (x) { return x.id === galleryCharId; });
    if (!c) return;
    if (!Array.isArray(c.shots)) c.shots = [];
    c.shots = c.shots.concat(res.shots || []);
    await commitChars();
    renderCharGallery();
    toast('已导入 ' + (res.count || 0) + ' 张图片');
  });
  dom.charGallery.addEventListener('click', function (e) {
    const del = e.target.closest('.cg-del');
    if (del) { deleteCharGalleryItem(del.dataset.type, Number(del.dataset.idx)); return; }
    const cell = e.target.closest('.cg-cell');
    if (!cell) return;
    const c = characters.find(function (x) { return x.id === galleryCharId; });
    if (!c) return;
    const items = charGalleryItems(c);
    const all = Array.prototype.slice.call(dom.charGallery.querySelectorAll('.cg-cell'));
    openShotViewer(items.map(function (it) { return it.src; }), all.indexOf(cell));
  });

  /* 游戏截图图集查看 */
  dom.gshBackBtn.addEventListener('click', function () { showPage('library'); });
  dom.gshAddBtn.addEventListener('click', function () { dom.gshFile.click(); });
  dom.gshFile.addEventListener('change', function () {
    handleGameShotsFiles(this.files);
    this.value = '';
  });
  dom.gshFolderBtn.addEventListener('click', async function () {
    const g = games.find(function (x) { return x.id === gameShotsId; });
    if (!g) return;
    const res = await api.importShotsFolder(g.id);
    if (!res || res.canceled) return;
    if (!res.ok) { toast('导入失败：' + ((res && res.error) || '未知错误')); return; }
    addShotsToGame(g.id, res.shots || []);
    await commit();
    renderGameShots();
    toast('已导入 ' + (res.count || 0) + ' 张截图');
  });
  dom.gameShots.addEventListener('click', function (e) {
    const del = e.target.closest('.cg-del');
    if (del) { deleteGameShotsItem(Number(del.dataset.idx)); return; }
    const cell = e.target.closest('.cg-cell');
    if (!cell) return;
    const g = games.find(function (x) { return x.id === gameShotsId; });
    if (!g) return;
    const items = gameShotsItems(g);
    const all = Array.prototype.slice.call(dom.gameShots.querySelectorAll('.cg-cell'));
    openShotViewer(items.map(function (it) { return it.src; }), all.indexOf(cell));
  });

  /* 书海书架 */
  $('shelfNewBtn').addEventListener('click', function () { openShelfModal('new', null, curShelfId); });
  $('bookImportFileBtn').addEventListener('click', function (e) {
    const r = this.getBoundingClientRect();
    dom.libImportMenu.classList.remove('hidden');
    dom.libImportMenu.style.left = Math.min(r.left, window.innerWidth - 260) + 'px';
    dom.libImportMenu.style.top = (r.bottom + 4) + 'px';
  });
  dom.libImportMenu.addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    dom.libImportMenu.classList.add('hidden');
    importInto(curShelfId, btn.dataset.act);
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#libImportMenu') && !e.target.closest('#bookImportFileBtn')) dom.libImportMenu.classList.add('hidden');
  });
  $('libClearBtn').addEventListener('click', clearLibrary);
  $('charClearBtn').addEventListener('click', clearCharacters);
  $('shotsClearBtn').addEventListener('click', clearAllShots);
  if (api.onImportProgress) {
    api.onImportProgress(function (p) {
      if (!p || !dom.importBar) return;
      if (p.finished) {
        dom.importBarFill.style.width = '100%';
        dom.importText.textContent = '导入完成';
        setTimeout(function () { dom.importBar.classList.add('hidden'); }, 600);
      } else {
        dom.importBar.classList.remove('hidden');
        const pct = p.total ? Math.round((p.done || 0) / p.total * 100) : 0;
        dom.importBarFill.style.width = pct + '%';
        dom.importText.textContent = '导入 ' + (p.done || 0) + '/' + (p.total || 0) + (p.name ? (' · ' + p.name) : '');
      }
    });
  }
  let bookSearchTimer = null;
  dom.bookSearch.addEventListener('input', function () {
    const v = this.value;
    clearTimeout(bookSearchTimer);
    bookSearchTimer = setTimeout(function () { bookSearch = v; renderShelfMain(); }, 160);
  });
  dom.bookStatusFilter.addEventListener('change', function () { bookStatusFilter = this.value; renderShelfMain(); });
  dom.bookTagFilter.addEventListener('change', function () { bookTagFilter = this.value; renderShelfMain(); });
  dom.bookClearFilter.addEventListener('click', function () {
    bookSearch = ''; bookStatusFilter = ''; bookTagFilter = '';
    dom.bookSearch.value = '';
    renderShelfMain();
  });
  function goUpShelf() {
    if (bookSearch || bookStatusFilter || bookTagFilter) { dom.bookClearFilter.click(); return; }
    const s = shelfById(curShelfId);
    if (s) { curShelfId = s.parentId || 0; renderLibrary(); }
  }
  dom.shelfBackBtn.addEventListener('click', goUpShelf);
  dom.shelfUpBtn.addEventListener('click', goUpShelf);
  dom.shelfCrumb.addEventListener('click', function (e) {
    const a = e.target.closest('a[data-goto]');
    if (!a) return;
    curShelfId = Number(a.dataset.goto) || 0;
    renderLibrary();
  });
  dom.shelfTree.addEventListener('click', function (e) {
    const node = e.target.closest('.shelf-node');
    if (!node) return;
    const id = Number(node.dataset.id) || 0;
    const caret = node.querySelector('.caret');
    if (caret && caret.textContent && e.target === caret) { expandedShelves[id] = !expandedShelves[id]; renderShelfTree(); return; }
    curShelfId = id;
    expandedShelves[id] = true;
    renderLibrary();
  });
  dom.bookGrid.addEventListener('click', function (e) {
    const card = e.target.closest('.book-card');
    if (!card) return;
    if (card.dataset.kind === 'shelf') {
      /* 点击系列：清除筛选并进入该系列 */
      bookSearch = ''; bookStatusFilter = ''; bookTagFilter = '';
      if (dom.bookSearch) dom.bookSearch.value = '';
      curShelfId = Number(card.dataset.id) || 0;
      expandedShelves[curShelfId] = true;
      renderLibrary();
    } else readBook(card.dataset.id);
  });
  dom.bookGrid.addEventListener('contextmenu', function (e) {
    const card = e.target.closest('.book-card');
    if (!card) return;
    e.preventDefault();
    const kind = card.dataset.kind;
    openBookCtx({ kind: kind, id: (kind === 'shelf') ? Number(card.dataset.id) : card.dataset.id }, e.clientX, e.clientY);
  });
  dom.bookCtxMenu.addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-act]');
    if (btn) ctxAction(btn.dataset.act);
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#bookCtxMenu') && !e.target.closest('.book-card')) closeBookCtx();
  });
  $('shelfSaveBtn').addEventListener('click', saveShelfModal);
  dom.shelfName.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); saveShelfModal(); } });
  $('bookSaveBtn').addEventListener('click', saveBookModal);
  $('moveSaveBtn').addEventListener('click', saveMoveModal);

  /* 设置封面（书籍 / 系列） */
  dom.coverPickFile.addEventListener('change', function () {
    const f = this.files && this.files[0];
    this.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast('请选择图片文件'); return; }
    const reader = new FileReader();
    reader.onload = function (e) { openCropper(e.target.result, 'libcover'); };
    reader.onerror = function () { toast('读取文件失败'); };
    reader.readAsDataURL(f);
  });

  /* 拖动整理书架：把书籍/系列拖到系列卡片、系列树节点或「全部」上 */
  dom.bookGrid.addEventListener('dragstart', function (e) {
    const card = e.target.closest('.book-card');
    if (!card) return;
    const kind = card.dataset.kind;
    ctxItems = [{ kind: kind, id: (kind === 'shelf') ? Number(card.dataset.id) : card.dataset.id }];
    try { e.dataTransfer.setData('text/plain', card.dataset.id); } catch (err) { /* */ }
    e.dataTransfer.effectAllowed = 'move';
  });
  function dropMoveTo(targetShelfId) {
    const item = ctxItems[0];
    if (!item) return;
    if (item.kind === 'book') {
      const b = library.books.find(function (x) { return x.id === item.id; });
      if (b && b.shelfId !== targetShelfId) { b.shelfId = targetShelfId; persistLib().then(renderLibrary); toast('已移动'); }
    } else if (item.kind === 'shelf' && item.id !== targetShelfId) {
      const ids = descendantIds(item.id);
      if (ids.indexOf(targetShelfId) === -1) { const s = shelfById(item.id); if (s) { s.parentId = targetShelfId; persistLib().then(renderLibrary); toast('已移动'); } }
    }
    ctxItems = [];
  }
  dom.bookGrid.addEventListener('dragover', function (e) {
    const card = e.target.closest('.shelf-card');
    if (card) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
  });
  dom.bookGrid.addEventListener('drop', function (e) {
    const card = e.target.closest('.shelf-card');
    if (!card) return;
    e.preventDefault();
    dropMoveTo(Number(card.dataset.id) || 0);
  });
  dom.shelfTree.addEventListener('dragover', function (e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
  dom.shelfTree.addEventListener('drop', function (e) {
    const node = e.target.closest('.shelf-node');
    if (!node) return;
    e.preventDefault();
    dropMoveTo(Number(node.dataset.id) || 0);
  });
  dom.shelfCrumb.addEventListener('dragover', function (e) { e.preventDefault(); });
  dom.shelfCrumb.addEventListener('drop', function (e) {
    const a = e.target.closest('a[data-goto]');
    if (!a) return;
    e.preventDefault();
    dropMoveTo(Number(a.dataset.goto) || 0);
  });

  /* 资料集内部阅读器（Readest 风格：顶栏 + 左目录抽屉 + 底栏） */
  function releaseReader() {
    ++avSession;
    if (avSaveTimer !== null) { clearTimeout(avSaveTimer); avSaveTimer = null; persistLib(); }
    if (avSeekFrame !== null) { cancelAnimationFrame(avSeekFrame); avSeekFrame = null; }
    stopReading();
    if (avFrame) { avFrame.src = 'about:blank'; avFrame.remove(); }
    avPreloads.forEach(function (image) { image.src = ''; });
    avPreloads = [];
    avTxtEl = null;
    avReaderOpened = false;
    avPageNo = 1; avPageTotal = 0; avCurrentLocation = null;
    avPages = [];
    avCurrentArt = null;
    avBookMode = false;
    avFixedLayout = false;
    avFrame = null;
    dom.avBody.replaceChildren();
    updateBookmarkButton();
    return avSession;
  }
  function closeReader() {
    releaseReader();
    closeModal(dom.artViewer);
    clearTimeout(rvIdleTimer);
    if (dom.rvDrawer) dom.rvDrawer.classList.remove('open');
    renderLibrary();
  }
  dom.avPrev.addEventListener('click', function () { stepArtPage(-1); });
  dom.avNext.addEventListener('click', function () { stepArtPage(1); });
  dom.avExit.addEventListener('click', closeReader);
  dom.avOpenBtn.addEventListener('click', function () {
    if (avCurrentArt && avCurrentArt.path) openArt(avCurrentArt.path);
  });
  /* 点击左右区域翻页 */
  dom.rvTapLeft.addEventListener('click', function () { stepArtPage(-1); });
  dom.rvTapRight.addEventListener('click', function () { stepArtPage(1); });
  /* 顶/底栏自动隐藏 */
  var rvIdleTimer = null;
  function rvShowBars() {
    if (dom.rvTop) dom.rvTop.classList.remove('hidden');
    if (dom.rvBottom) dom.rvBottom.classList.remove('hidden');
    clearTimeout(rvIdleTimer);
    rvIdleTimer = setTimeout(function () {
      if (dom.rvDrawer && dom.rvDrawer.classList.contains('open')) return;
      if (dom.rvTop) dom.rvTop.classList.add('hidden');
      if (dom.rvBottom) dom.rvBottom.classList.add('hidden');
    }, 3500);
  }
  dom.artViewer.addEventListener('mousemove', rvShowBars);
  dom.artViewer.addEventListener('touchstart', rvShowBars, { passive: true });
  /* 目录抽屉 */
  dom.rvTocBtn.addEventListener('click', function () {
    if (dom.rvDrawer.classList.contains('open') && avDrawerTab === 'toc') dom.rvDrawer.classList.remove('open');
    else showReaderDrawer('toc');
  });
  dom.rvTabToc.addEventListener('click', function () { showReaderDrawer('toc'); });
  dom.rvTabBookmarks.addEventListener('click', function () { showReaderDrawer('bookmarks'); });
  dom.rvAddBookmark.addEventListener('click', toggleReaderBookmark);
  dom.rvDrawerClose.addEventListener('click', function () { dom.rvDrawer.classList.remove('open'); });
  dom.rvTocList.addEventListener('click', function (e) {
    const it = e.target.closest('.rv-toc-item');
    if (!it || !it.dataset.href) return;
    sendBook({ action: 'goHref', value: it.dataset.href });
    dom.rvDrawer.classList.remove('open');
  });
  /* 进度滑杆 */
  dom.rvSlider.addEventListener('input', function () {
    const v = Number(this.value) / 1000;
    if (avBookMode) {
      if (avSeekFrame !== null) cancelAnimationFrame(avSeekFrame);
      avSeekFrame = requestAnimationFrame(function () { avSeekFrame = null; sendBook({ action: 'goFraction', value: v }); });
    }
    else if (avTxtEl) {
      goToTextPage(Math.round(v * Math.max(0, avPageTotal - 1)) + 1);
    } else if (avPages.length) { avIndex = Math.max(0, Math.min(avPages.length - 1, Math.round(v * (avPages.length - 1)))); renderArtPage(); }
  });
  /* 翻页 / 滚动 */
  dom.rvColumns.textContent = avColumns === 2 ? '双页' : '单页';
  dom.rvColumns.setAttribute('aria-pressed', String(avColumns === 2));
  dom.rvColumns.addEventListener('click', function () {
    avColumns = avColumns === 1 ? 2 : 1;
    try { localStorage.setItem('vl-reader-columns', String(avColumns)); } catch (e) { /* no storage */ }
    dom.rvColumns.textContent = avColumns === 2 ? '双页' : '单页';
    dom.rvColumns.setAttribute('aria-pressed', String(avColumns === 2));
    if (avBookMode) sendBook({ action: 'setColumnCount', value: avColumns });
    if (avPages.length) renderArtPage();
  });
  dom.rvFlow.addEventListener('click', function () {
    avFlow = (avFlow === 'paginated') ? 'scrolled' : 'paginated';
    dom.rvFlow.textContent = (avFlow === 'paginated') ? '翻页' : '滚动';
    if (avBookMode) sendBook({ action: 'setFlow', value: avFlow });
    if (avPages.length) renderArtPage();
  });
  /* 主题 */
  const RV_THEMES = [
    { name: '浅色', fg: '#23272e', bg: '#f5f6f8', btn: '☀ 浅色' },
    { name: '护眼', fg: '#4a3b2a', bg: '#f5ecd8', btn: '🌤 护眼' },
    { name: '深色', fg: '#cbd5e1', bg: '#1e293b', btn: '🌙 深色' }
  ];
  function applyReaderTheme() {
    const t = RV_THEMES[avTheme];
    dom.rvTheme.textContent = t.btn;
    if (dom.artViewer) dom.artViewer.style.background = t.bg;
    if (dom.avBody) dom.avBody.style.background = t.bg;
    if (avTxtEl) { avTxtEl.style.color = t.fg; avTxtEl.style.background = t.bg; }
    if (avBookMode) sendBook({ action: 'setTheme', fg: t.fg, bg: t.bg });
  }
  dom.rvTheme.addEventListener('click', function () {
    avTheme = (avTheme + 1) % RV_THEMES.length;
    applyReaderTheme();
  });
  /* 面板内点击后移除焦点，避免方向键被控件拦截 */
  [dom.rvTop, dom.rvBottom, dom.rvDrawer].forEach(function (el) {
    if (!el) return;
    el.addEventListener('click', function (e) {
      if (e.target.closest('button')) setTimeout(function () { try { document.activeElement && document.activeElement.blur(); } catch (err) { /* */ } }, 0);
    });
  });
  dom.avToc.addEventListener('change', function () { setTimeout(function () { try { document.activeElement && document.activeElement.blur(); } catch (err) { /* */ } }, 0); });
  dom.avOpenBtn.addEventListener('click', function () {
    if (avCurrentArt && avCurrentArt.path) openArt(avCurrentArt.path);
  });
  dom.avFontMinus.addEventListener('click', function () {
    if (avTxtEl) { avFont = Math.max(12, avFont - 2); avTxtEl.style.fontSize = avFont + 'px'; return; }
    if (avBookMode) { avFont = Math.max(12, avFont - 2); sendBook({ action: 'setFont', value: avFont }); return; }
    if (avPages.length) { avScale = Math.max(0.5, Math.round((avScale - 0.2) * 10) / 10); renderArtPage(); return; }
    avFont = Math.max(12, avFont - 2); sendBook({ action: 'setFont', value: avFont });
  });
  dom.avFontPlus.addEventListener('click', function () {
    if (avTxtEl) { avFont = Math.min(40, avFont + 2); avTxtEl.style.fontSize = avFont + 'px'; return; }
    if (avBookMode) { avFont = Math.min(40, avFont + 2); sendBook({ action: 'setFont', value: avFont }); return; }
    if (avPages.length) { avScale = Math.min(4, Math.round((avScale + 0.2) * 10) / 10); renderArtPage(); return; }
    avFont = Math.min(40, avFont + 2); sendBook({ action: 'setFont', value: avFont });
  });
  dom.rvResetSize.addEventListener('click', function () {
    avFont = 18;
    avScale = 1;
    if (avTxtEl) { avTxtEl.style.fontSize = '18px'; updateTextPosition(); }
    else if (avBookMode) sendBook({ action: 'setFont', value: 18 });
    else if (avPages.length) { renderArtPage(); dom.avBody.scrollTop = 0; }
    toast('已恢复默认大小');
  });
  dom.avToc.addEventListener('change', function () {
    if (this.value) sendBook({ action: 'goHref', value: this.value });
  });
  dom.avGotoBtn.addEventListener('click', function () {
    const raw = String(dom.avGoto.value || '').trim();
    const v = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(v) || v < 1) { toast('请输入有效的正整数页码'); return; }
    if (!avPageTotal) { toast('页码仍在加载中'); return; }
    if (v > avPageTotal) { toast('页码超出范围：1–' + avPageTotal); return; }
    if (avTxtEl) goToTextPage(v);
    else if (avBookMode) sendBook({ action: 'goPage', value: v });
    else if (avPages.length) { avIndex = v - 1; renderArtPage(); }
  });
  dom.avGoto.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); dom.avGotoBtn.click(); } });
  dom.avBody.addEventListener('scroll', function () { if (avTxtEl) updateTextPosition(); }, { passive: true });
  /* 滚轮翻页（带冷却，避免误触/连翻）；TXT 保留原生滚动 */
  var rvWheelTime = -Infinity, rvWheelEvent = -Infinity, rvWheelDelta = 0, rvWheelDir = 0;
  dom.artViewer.addEventListener('wheel', function (e) {
    if (avTxtEl || (avBookMode && avFlow === 'scrolled') || e.ctrlKey || e.metaKey) return;
    if (!avBookMode && !avPages.length) return;
    if (!avBookMode && avFlow === 'scrolled' && avScale > 1) return;
    if (e.target.closest('.rv-top, .rv-bottom, .rv-drawer')) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault();
    const now = performance.now(), dir = Math.sign(e.deltaY);
    if (now - rvWheelEvent > 200 || dir !== rvWheelDir) rvWheelDelta = 0;
    rvWheelEvent = now; rvWheelDir = dir;
    rvWheelDelta += e.deltaMode === 1 ? e.deltaY * 36 : e.deltaMode === 2 ? e.deltaY * 500 : e.deltaY;
    if (Math.abs(rvWheelDelta) < 24 || now - rvWheelTime < 90) return;
    rvWheelTime = now; rvWheelDelta = 0;
    stepArtPage(dir);
  }, { passive: false });

  /* 截图查看器导航 */
  dom.shotPrev.addEventListener('click', function () { stepShotViewer(-1); });
  dom.shotNext.addEventListener('click', function () { stepShotViewer(1); });
  dom.shotClose.addEventListener('click', function () { closeModal(dom.shotViewer); });

  /* 截图文件夹导入 */
  dom.shotsFolderBtn.addEventListener('click', importShotsToCurrent);
  dom.shotImportConfirm.addEventListener('click', function () {
    const g = resolveGameByName(dom.shotImportGame.value);
    if (!g) { toast('未找到目标游戏，请输入更准确的名称'); return; }
    closeModal(dom.shotImportModal);
    importShotsToGame(g.id);
  });

  /* 查看器删除 / 转移截图归属 */
  dom.shotDelete.addEventListener('click', deleteViewerShot);
  dom.moveConfirm.addEventListener('click', confirmShotMove);
  dom.moveTargetName.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); confirmShotMove(); }
  });

  /* 确认弹窗（单次绑定，带重入保护） */
  dom.confirmOk.addEventListener('click', function () { closeConfirm(true); });
  Array.prototype.forEach.call(dom.confirmModal.querySelectorAll('[data-close]'), function (b) {
    b.addEventListener('click', function () { closeConfirm(false); });
  });
  dom.confirmModal.addEventListener('click', function (e) {
    if (e.target === dom.confirmModal) closeConfirm(false);
  });

  /* 裁剪器交互 */
  dom.cropStage.addEventListener('pointerdown', function (e) {
    if (!crop.ready) return;
    e.preventDefault();
    crop.dragging = true;
    crop.startX = e.clientX;
    crop.startY = e.clientY;
    crop.startOffX = crop.offsetX;
    crop.startOffY = crop.offsetY;
    try { dom.cropStage.setPointerCapture(e.pointerId); } catch (_) {}
  });

  dom.cropStage.addEventListener('pointermove', function (e) {
    if (!crop.dragging) return;
    crop.offsetX = crop.startOffX + (e.clientX - crop.startX);
    crop.offsetY = crop.startOffY + (e.clientY - crop.startY);
    clampOffsets();
    applyCropTransform();
  });

  function endDrag(e) {
    if (!crop.dragging) return;
    crop.dragging = false;
    try { dom.cropStage.releasePointerCapture(e.pointerId); } catch (_) {}
  }
  dom.cropStage.addEventListener('pointerup', endDrag);
  dom.cropStage.addEventListener('pointercancel', endDrag);

  dom.cropStage.addEventListener('wheel', function (e) {
    if (!crop.ready) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    setCropZoom(crop.zoom * factor);
  }, { passive: false });

  dom.cropZoom.addEventListener('input', function () {
    setCropZoom(parseFloat(this.value) || 1);
  });

  $('cropReset').addEventListener('click', function () {
    if (!crop.ready) return;
    crop.zoom = 1;
    dom.cropZoom.value = 1;
    const dw = crop.natW * crop.baseScale;
    const dh = crop.natH * crop.baseScale;
    crop.offsetX = (crop.stageW - dw) / 2;
    crop.offsetY = (crop.stageH - dh) / 2;
    applyCropTransform();
  });

  $('cropConfirm').addEventListener('click', confirmCrop);

  window.addEventListener('resize', function () {
    if (dom.cropModal.classList.contains('show') && crop.ready) layoutCrop();
    clearTimeout(reclampTimer);
    reclampTimer = setTimeout(function () { clampAllFilterRows(); }, 150);
  });
  var reclampTimer = null;

  /* 卡片网格：编辑 / 删除 */
  dom.grid.addEventListener('click', function (e) {
    const card = e.target.closest('.game-card');
    if (!card) return;
    const id = card.dataset.id;

    if (e.target.closest('.cover')) { openGameShots(id); return; }

    if (e.target.closest('.js-flip')) {
      flipped[id] = !flipped[id];
      card.classList.toggle('flipped', !!flipped[id]);
      return;
    }
    if (e.target.closest('.js-goal-add')) { addGoal(id, card); return; }
    if (e.target.closest('.js-goal-del')) {
      removeGoal(id, e.target.closest('.js-goal-del').dataset.gid);
      return;
    }

    if (e.target.closest('.js-edit')) { openGameModal(id); return; }

    if (e.target.closest('.js-del')) {
      const g = games.find(function (x) { return x.id === id; });
      if (!g) return;
      deleteTargetId = id;
      dom.deleteName.textContent = g.name;
      openModal(dom.deleteModal);
    }
  });

  /* 目标/挑战输入回车添加 */
  dom.grid.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    const input = e.target.closest('.js-goal-input');
    if (!input) return;
    e.preventDefault();
    const card = input.closest('.game-card');
    if (card) addGoal(card.dataset.id, card);
  });

  /* 卡片网格：快速切换状态 / 勾选目标 */
  dom.grid.addEventListener('change', function (e) {
    const goal = e.target.closest('.js-goal-check');
    if (goal) {
      const card = goal.closest('.game-card');
      if (card) toggleGoal(card.dataset.id, goal.dataset.gid, goal.checked);
      return;
    }
    const sel = e.target.closest('.js-status');
    if (!sel) return;
    const card = sel.closest('.game-card');
    if (!card) return;
    quickChangeStatus(card.dataset.id, sel.value);
  });

  $('confirmDeleteBtn').addEventListener('click', function () {
    if (deleteTargetId) deleteGame(deleteTargetId);
    deleteTargetId = null;
    closeModal(dom.deleteModal);
  });

  /* 分类筛选（事件委托） */
  dom.categoryRow.addEventListener('click', function (e) {
    const pill = e.target.closest('.pill[data-category]');
    if (!pill) return;
    activeFilters.category = pill.dataset.category;
    renderCategoryFilter();
    /* 状态 / 平台 / 系列 随分类变化 */
    renderStatusFilter();
    renderPlatformFilter();
    renderSeriesFilter();
    renderCards();
  });

  /* 状态筛选 */
  dom.statusRow.addEventListener('click', function (e) {
    const pill = e.target.closest('.pill[data-status]');
    if (!pill) return;
    activeFilters.status = pill.dataset.status;
    renderStatusFilter();
    renderCards();
  });

  /* 平台筛选 */
  dom.platformRow.addEventListener('click', function (e) {
    const pill = e.target.closest('.pill[data-platform]');
    if (!pill) return;
    activeFilters.platform = pill.dataset.platform;
    renderPlatformFilter();
    renderCards();
  });

  /* 系列筛选 */
  dom.seriesRow.addEventListener('click', function (e) {
    const pill = e.target.closest('.pill[data-series]');
    if (!pill) return;
    activeFilters.series = pill.dataset.series;
    renderSeriesFilter();
    renderCards();
  });

  /* 排序 / 搜索 */
  dom.sortSelect.addEventListener('change', function () {
    activeFilters.sort = this.value;
    renderCards();
  });
  let searchTimer = null;
  dom.searchInput.addEventListener('input', function () {
    const v = this.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      activeFilters.search = v;
      renderCards();
    }, 160);
  });

  /* 导入导出 */
  $('exportBtn').addEventListener('click', exportData);
  $('importBtn').addEventListener('click', importData);
  dom.importApplyBtn.addEventListener('click', applyImportData);
  $('batchCoverBtn').addEventListener('click', openBatchCover);
  dom.batchCoverStart.addEventListener('click', startBatchCover);
  dom.batchCoverCancel.addEventListener('click', function () {
    if (batchCoverRunning) { batchCoverAbort = true; addBatchLog('正在停止，请完成当前请求…'); }
    else closeModal(dom.batchCoverModal);
  });

  /* 清空 */
  $('clearBtn').addEventListener('click', async function () {
    if (games.length === 0) { toast('没有数据可清空'); return; }
    if (!confirm('确定要清空全部 ' + games.length + ' 条记录吗？此操作不可恢复。建议先导出备份。')) return;
    if (!confirm('再次确认：真的要清空所有数据吗？')) return;
    games = [];
    await commit();
    toast('所有数据已清空');
  });

  /* 随机推荐 */
  $('randomBtn').addEventListener('click', openRandomModal);
  $('repickBtn').addEventListener('click', randomPick);
  [dom.rCategory, dom.rPlatform, dom.rSeries, dom.rStatus, dom.rMinRating]
    .forEach(function (sel) { sel.addEventListener('change', randomPick); });
  dom.rExcludeDone.addEventListener('change', randomPick);

  /* 侧边栏页面切换 */
  Array.prototype.forEach.call(document.querySelectorAll('.nav-btn'), function (btn) {
    btn.addEventListener('click', function () { showPage(btn.dataset.page); });
  });

  /* 平台统计 / 最近通关 按分类切换 */
  dom.platformScope.addEventListener('change', function () {
    platformScopeCategory = this.value;
    renderStats();
  });
  dom.recentDoneScope.addEventListener('change', function () {
    recentDoneCategory = this.value;
    renderStats();
  });
  dom.trendYear.addEventListener('change', function () {
    trendYear = this.value;
    renderStats();
  });

  /* 设置 */
  $('settingsBtn').addEventListener('click', openSettings);
  $('settingsSaveBtn').addEventListener('click', saveSettings);

  /* 单条目在线刮削 */
  $('itemScrapeBtn').addEventListener('click', openItemScrape);
  $('isTranslateBtn').addEventListener('click', translateItemName);
  $('isSearchBtn').addEventListener('click', doItemSearch);
  dom.isQuery.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); doItemSearch(); }
  });
  dom.isSources.addEventListener('click', function (e) {
    const pill = e.target.closest('.pill[data-source]');
    if (!pill) return;
    setItemSource(pill.dataset.source);
    clearItemScrapeResults();
    setIsHint('来源已切换到「' + pill.textContent + '」，点击「搜索」。');
  });

  /* 键盘快捷键 */
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      dom.searchInput.focus();
      dom.searchInput.select();
    }
    if (dom.confirmModal.classList.contains('show') && e.key === 'Enter') {
      e.preventDefault(); closeConfirm(true); return;
    }
    const rvTag = ((e.target && e.target.tagName) || '').toUpperCase();
    const rvTyping = (rvTag === 'INPUT' || rvTag === 'SELECT' || rvTag === 'TEXTAREA');
    if (dom.artViewer.classList.contains('show') && !rvTyping && (avPages.length || avBookMode || avTxtEl)) {
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); stepArtPage(-1); return; }
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); stepArtPage(1); return; }
      if (e.key === 'Home' && avPages.length) { avIndex = 0; renderArtPage(); return; }
      if (e.key === 'End' && avPages.length) { avIndex = avPages.length - 1; renderArtPage(); return; }
    }
    if (dom.shotViewer.classList.contains('show')) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); stepShotViewer(-1); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); stepShotViewer(1); return; }
    }
    if (e.key === 'Escape') {
      const open = document.querySelectorAll('.modal-overlay.show');
      if (open.length) {
        const top = open[open.length - 1];
        if (top === dom.artViewer) closeReader(); else closeModal(top);
      }
    }
  });

  /* ==================== 初始化 ==================== */
  async function init() {
    let payload = null;
    try { payload = await api.load(); } catch (e) { payload = null; }
    try { settings = (await api.loadSettings()) || {}; } catch (e) { settings = {}; }
    try {
      const c = await api.loadCharacters();
      characters = (c && Array.isArray(c.characters)) ? c.characters.map(normalizeCharacter) : [];
    } catch (e) { characters = []; }
    try {
      const ar = await api.libLoad();
      library = normalizeLibrary(ar && ar.library);
    } catch (e) { library = { shelves: [], books: [] }; }

    if (payload && payload.dataDir) {
      dom.dataDirHint.textContent = '数据保存位置：' + payload.dataDir;
    }

    if (payload && Array.isArray(payload.games)) {
      /* 文件存在：即使为空也尊重用户数据，不再灌入示例 */
      games = payload.games.map(normalizeGame);
      renderAll();
    } else {
      /* 首次运行（无 data.json）：写入示例数据 */
      games = sampleGames();
      await commit();
    }
    renderCharacters();
    renderLibrary();
  }

  window.GameCollection = {
    getGames: function () { return games.slice(); },
    refresh: renderAll,
    exportData: exportData,
    clampFilters: clampAllFilterRows
  };

  init();
})();
