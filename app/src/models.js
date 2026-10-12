(function (root) {
  'use strict';
  const { generateId, todayStr } = root.VoidUtils;
  /* 旧版 key → 中文状态（用于兼容旧数据） */
  const LEGACY_STATUS_MAP = {
    want: '想玩',
    owned: '已拥有',
    playing: '进行中',
    completed: '已通关',
    mastered: '全成就',
    dropped: '弃坑'
  };

  function normalizeCategory(c) {
    if (c === 'video') return '电子游戏';
    if (c === 'board') return '电子游戏';
    if (typeof c === 'string' && c.trim()) return c.trim();
    return '电子游戏';
  }

  function normalizeStatus(s) {
    const str = String(s == null ? '' : s).trim();
    if (!str) return '';   /* 未选择状态 */
    return LEGACY_STATUS_MAP[str] || str;
  }

  function normalizeGame(g) {
    return {
      id: (g && g.id) ? String(g.id) : generateId(),
      name: (g && g.name) ? String(g.name) : '未命名',
      scrapeName: (g && typeof g.scrapeName === 'string') ? g.scrapeName : '',
      category: normalizeCategory(g && g.category),
      platform: (g && g.platform) ? String(g.platform) : '',
      genre: (g && g.genre) ? String(g.genre) : '',
      series: (g && g.series) ? String(g.series) : '',
      cover: (g && typeof g.cover === 'string') ? g.cover : '',
      status: normalizeStatus(g && g.status),
      rating: Math.max(0, Math.min(5, parseInt(g && g.rating, 10) || 0)),
      hours: Math.max(0, parseFloat(g && g.hours) || 0),
      shots: Array.isArray(g && g.shots) ? g.shots.map(function (s) { return String(s); }) : [],
      goals: Array.isArray(g && g.goals) ? g.goals.map(function (t) {
        return {
          id: (t && t.id) ? String(t.id) : generateId(),
          text: (t && t.text) ? String(t.text) : '',
          done: !!(t && t.done)
        };
      }) : [],
      dateAdded: (g && g.dateAdded) ? String(g.dateAdded) : todayStr(),
      dateCompleted: (g && g.dateCompleted) ? String(g.dateCompleted) : null
    };
  }

  function normalizeCharacter(c) {
    return {
      id: (c && c.id) ? String(c.id) : generateId(),
      name: (c && c.name) ? String(c.name) : '未命名',
      work: (c && c.work) ? String(c.work) : '',
      image: (c && typeof c.image === 'string') ? c.image : '',
      shots: Array.isArray(c && c.shots) ? c.shots.map(function (s) { return String(s); }) : []
    };
  }

  function normalizeShelf(s) {
    return { id: (s && s.id) ? Number(s.id) : 0, name: (s && s.name) ? String(s.name) : '系列', parentId: (s && s.parentId) ? Number(s.parentId) : 0, order: (s && s.order) ? Number(s.order) : 0, cover: (s && typeof s.cover === 'string') ? s.cover : '', tags: (s && s.tags) ? String(s.tags) : '' };
  }
  function normalizeBook(b) {
    return {
      id: (b && b.id) ? String(b.id) : ('b_' + generateId()),
      title: (b && b.title) ? String(b.title) : '未命名',
      shelfId: (b && b.shelfId) ? Number(b.shelfId) : 0,
      path: (b && b.path) ? String(b.path) : '',
      type: (b && b.type) ? String(b.type) : '',
      cover: (b && typeof b.cover === 'string') ? b.cover : '',
      status: (b && b.status) ? String(b.status) : '',
      tags: (b && b.tags) ? String(b.tags) : '',
      position: (b && b.position) ? String(b.position) : '',
      bookmarks: Array.isArray(b && b.bookmarks) ? b.bookmarks.filter(function (v) { return v && typeof v === 'object' && (v.cfi || Number.isFinite(Number(v.page))); }).slice(0, 1000).map(function (v) { return {
        id: String(v.id || generateId()), kind: String(v.kind || ''),
        page: Math.max(1, Math.round(Number(v.page) || 1)),
        cfi: typeof v.cfi === 'string' ? v.cfi : '',
        label: typeof v.label === 'string' ? v.label : '',
        createdAt: typeof v.createdAt === 'string' ? v.createdAt : ''
      }; }) : [],
      addedAt: (b && b.addedAt) ? String(b.addedAt) : '',
      lastRead: (b && b.lastRead) ? String(b.lastRead) : '',
      readSeconds: Math.max(0, Math.round(parseFloat(b && b.readSeconds) || 0))
    };
  }
  function normalizeLibrary(lib) {
    return {
      shelves: (lib && Array.isArray(lib.shelves) ? lib.shelves : []).map(normalizeShelf),
      books: (lib && Array.isArray(lib.books) ? lib.books : []).map(normalizeBook)
    };
  }

  root.VoidModels = { normalizeCategory, normalizeStatus, normalizeGame, normalizeCharacter, normalizeShelf, normalizeBook, normalizeLibrary };
})(window);
