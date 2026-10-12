(function (root) {
  'use strict';
  const COVER_PALETTES = [
    ['#6366f1','#8b5cf6'], ['#3b82f6','#6366f1'], ['#06b6d4','#3b82f6'],
    ['#10b981','#06b6d4'], ['#f59e0b','#ef4444'], ['#ec4899','#8b5cf6'],
    ['#14b8a6','#10b981'], ['#f97316','#ef4444'], ['#6366f1','#ec4899'],
    ['#3b82f6','#14b8a6'], ['#8b5cf6','#f59e0b'], ['#ef4444','#ec4899'],
    ['#22c55e','#14b8a6'], ['#0ea5e9','#6366f1'], ['#a855f7','#ec4899'],
    ['#e11d48','#f97316']
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  /* 多种类型 / 多个系列：用分隔符拆分为去重数组
     （支持 / , ， 、 ; ； | 等分隔符，前后空格忽略） */
  /* 拼音搜索（离线，依赖 pinyin-pro 的全局 pinyinPro） */
  const pinyinCache = {};
  function namePinyin(name) {
    if (name in pinyinCache) return pinyinCache[name];
    let v = '';
    try {
      if (window.pinyinPro && typeof window.pinyinPro.pinyin === 'function') {
        const full = window.pinyinPro.pinyin(name, { toneType: 'none', type: 'array' }).join('');
        const first = window.pinyinPro.pinyin(name, { pattern: 'first', toneType: 'none', type: 'array' }).join('');
        v = (full + ' ' + first).toLowerCase();
      }
    } catch (e) { v = ''; }
    pinyinCache[name] = v;
    return v;
  }
  function textMatches(text, name, q) {
    if (text && text.indexOf(q) > -1) return true;
    return namePinyin(name).indexOf(q) > -1;
  }

  const LIST_SEP = /[\/,，、;；|｜]+/;
  function splitList(value) {
    const raw = String(value == null ? '' : value);
    if (!raw.trim()) return [];
    const seen = {};
    const out = [];
    raw.split(LIST_SEP).forEach(function (part) {
      const t = part.trim();
      if (t && !seen[t]) { seen[t] = true; out.push(t); }
    });
    return out;
  }

  /* 仅日期（用于 dateAdded 与通关日期） */
  function todayStr() {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* 把存储值转换为 date 输入框可识别的值（只保留 YYYY-MM-DD） */
  function toDateValue(dtStr) {
    if (!dtStr) return '';
    const s = String(dtStr).trim();
    if (!s) return '';
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  }

  function formatDate(dtStr) {
    return toDateValue(dtStr);
  }

  /* ---------- 时长：小时(浮点) <-> 小时/分钟 ---------- */
  function hoursToParts(hours) {
    const totalMin = Math.round((Number(hours) || 0) * 60);
    return { h: Math.floor(totalMin / 60), m: totalMin % 60 };
  }

  function formatDuration(hours) {
    const p = hoursToParts(hours);
    if (!p.h && !p.m) return '';
    if (!p.h) return p.m + ' 分钟';
    if (!p.m) return p.h + ' 小时';
    return p.h + ' 小时 ' + p.m + ' 分钟';
  }

  /* 阅读时长（秒）→ 文案 */
  function formatReadTime(secs) {
    secs = Math.round(secs || 0);
    if (secs <= 0) return '';
    if (secs < 60) return '不足1分钟';
    const m = Math.floor(secs / 60);
    if (m < 60) return m + ' 分钟';
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return h + ' 小时' + (mm ? ' ' + mm + ' 分' : '');
  }

  function generateId() {
    return 'gc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function coverColors(name) {
    let hash = 0;
    const str = name || '?';
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return COVER_PALETTES[Math.abs(hash) % COVER_PALETTES.length];
  }

  function coverLetter(name) {
    const t = (name || '').trim();
    if (!t) return '?';
    if (/[\u4e00-\u9fff]/.test(t.charAt(0))) return t.charAt(0);
    return t.slice(0, 2).toUpperCase();
  }

  /* 封面：本地文件通过自定义协议 cover:// 读取，兼容旧的 data URL */
  function coverSrc(cover) {
    if (!cover) return '';
    if (cover.indexOf('data:') === 0) return cover;
    return 'cover://c/' + encodeURIComponent(cover);
  }

  function shotSrc(shot, gameId) {
    if (!shot) return '';
    if (shot.indexOf('data:') === 0) return shot;
    const file = encodeURIComponent(String(shot).split('/').pop());
    if (gameId) return 'shot://s/' + encodeURIComponent(gameId) + '/' + file;
    return 'shot://s/' + file;   /* 兜底（旧数据） */
  }

  function charSrc(image) {
    if (!image) return '';
    if (image.indexOf('data:') === 0) return image;
    return 'char://c/' + encodeURIComponent(image);
  }

  function artSrc(cover) {
    if (!cover) return '';
    if (cover.indexOf('data:') === 0) return cover;
    return 'art://c/' + encodeURIComponent(cover);
  }

  function starsHtml(rating) {
    if (!rating) return '<span class="no-rating">未评分</span>';
    let html = '';
    for (let i = 1; i <= 5; i++) {
      html += i <= rating ? '<span class="on">★</span>' : '<span class="off">★</span>';
    }
    return html;
  }


  root.VoidUtils = { esc, namePinyin, textMatches, splitList, todayStr, toDateValue, formatDate, hoursToParts, formatDuration, formatReadTime, generateId, coverColors, coverLetter, coverSrc, shotSrc, charSrc, artSrc, starsHtml };
})(window);
