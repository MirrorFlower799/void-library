'use strict';

const { toYear } = require('./dates');
const UA = 'void-library/2.0 (local desktop app)';

function createScrapers({ readSettings, fetch = globalThis.fetch }) {
  /* ---------------- 在线刮削：翻译 / 搜索 / 图片 ---------------- */
  async function translateText(payload) {
    const text = String((payload && payload.text) || '').trim();
    if (!text) throw new Error('待翻译内容为空');
    const from = (payload && payload.from) || 'auto';
    const to = (payload && payload.to) || 'en';

    /* 先用 Google 公共接口 */
    try {
      const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl='
        + encodeURIComponent(from) + '&tl=' + encodeURIComponent(to) + '&dt=t&q=' + encodeURIComponent(text);
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j) && Array.isArray(j[0])) {
          const out = j[0].map(function (seg) { return seg[0]; }).join('').trim();
          if (out) return { ok: true, text: out };
        }
      }
    } catch (e) { /* 尝试备用 */ }

    /* 备用：MyMemory */
    try {
      const pair = (from === 'auto' ? 'zh-CN' : from) + '|' + to;
      const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text)
        + '&langpair=' + encodeURIComponent(pair);
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      const j = await r.json();
      const out = j && j.responseData && j.responseData.translatedText;
      if (out) return { ok: true, text: String(out).trim() };
    } catch (e) { /* ignore */ }

    throw new Error('翻译失败，请联网或手动填写英文名');
  }

  function sgdbAuth(settings) {
    const key = (settings.steamgriddbKey || '').trim();
    if (!key) throw new Error('未设置 SteamGridDB API Key，请到「设置」填写');
    return { Authorization: 'Bearer ' + key };
  }

  async function scrapeSearch(payload) {
    const source = (payload && payload.source) || 'steamgriddb';
    const term = String((payload && payload.term) || '').trim();
    const work = String((payload && payload.work) || '').trim();
    if (!term) throw new Error('搜索名称为空');
    const s = await readSettings();

    if (source === 'steamgriddb') {
      const r = await fetch('https://www.steamgriddb.com/api/v2/search/autocomplete/' + encodeURIComponent(term),
        { headers: sgdbAuth(s) });
      if (!r.ok) throw new Error('SteamGridDB 搜索失败 (HTTP ' + r.status + ')');
      const j = await r.json();
      return ((j && j.data) || []).map(function (g) {
        return { source: 'steamgriddb', id: g.id, name: g.name, year: toYear(g.release_date) };
      });
    }

    if (source === 'tmdb') {
      const key = (s.tmdbKey || '').trim();
      if (!key) throw new Error('未设置 TMDB API Key，请到「设置」填写');
      const url = 'https://api.themoviedb.org/3/search/multi?api_key=' + encodeURIComponent(key)
        + '&query=' + encodeURIComponent(term) + '&language=zh-CN&include_adult=false';
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error('TMDB 搜索失败 (HTTP ' + r.status + ')');
      const j = await r.json();
      return ((j && j.results) || []).filter(function (x) {
        return x.media_type === 'movie' || x.media_type === 'tv';
      }).map(function (x) {
        return {
          source: 'tmdb', id: x.id, mediaType: x.media_type,
          name: x.title || x.name || '',
          year: toYear(x.release_date || x.first_air_date)
        };
      });
    }

    if (source === 'bangumi') {
      const headers = { 'User-Agent': UA, 'Content-Type': 'application/json' };
      const token = (s.bangumiToken || '').trim();
      if (token) headers.Authorization = 'Bearer ' + token;
      const r = await fetch('https://api.bgm.tv/v0/search/subjects?limit=15', {
        method: 'POST', headers: headers, body: JSON.stringify({ keyword: term })
      });
      if (!r.ok) throw new Error('Bangumi 搜索失败 (HTTP ' + r.status + ')');
      const j = await r.json();
      return ((j && j.data) || []).map(function (x) {
        return {
          source: 'bangumi', id: x.id,
          name: x.name_cn || x.name || '',
          original: x.name || '',
          year: toYear(x.date)
        };
      });
    }

    if (source === 'vndb') {
      const r = await fetch('https://api.vndb.org/kana/vn', {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: ['search', '=', term], fields: 'id, title, image.url, released', results: 15 })
      });
      if (!r.ok) throw new Error('VNDB 搜索失败 (HTTP ' + r.status + ')');
      const j = await r.json();
      return ((j && j.results) || []).map(function (x) {
        return { source: 'vndb', id: x.id, name: x.title || '', year: toYear(x.released) };
      });
    }

    if (source === 'bgm-char') {
      const headers = { 'User-Agent': UA, 'Content-Type': 'application/json' };
      const token = (s.bangumiToken || '').trim();
      if (token) headers.Authorization = 'Bearer ' + token;
      const keyword = work ? (term + ' ' + work) : term;
      let arr = null;
      try {
        const r = await fetch('https://api.bgm.tv/v0/search/characters?limit=25', {
          method: 'POST', headers: headers, body: JSON.stringify({ keyword: keyword })
        });
        if (r.ok) { const j = await r.json(); arr = (j && j.data) || []; }
      } catch (e) { /* 尝试旧接口 */ }
      if (!arr) {
        const r2 = await fetch('https://api.bgm.tv/search/character/' + encodeURIComponent(keyword)
          + '?responseGroup=large', { headers: { 'User-Agent': UA } });
        if (!r2.ok) throw new Error('Bangumi 角色搜索失败 (HTTP ' + r2.status + ')');
        const j2 = await r2.json();
        arr = (j2 && j2.results) || [];
      }
      return arr.map(function (x) {
        return { source: 'bgm-char', id: x.id, name: x.name_cn || x.name || '', original: x.name || '', year: '' };
      });
    }

    if (source === 'vndb-char') {
      const r = await fetch('https://api.vndb.org/kana/character', {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters: ['search', '=', term],
          fields: 'id, name, original, image.url, vns{title}',
          results: 25
        })
      });
      if (!r.ok) throw new Error('VNDB 角色搜索失败 (HTTP ' + r.status + ')');
      const j = await r.json();
      let list = ((j && j.results) || []).map(function (x) {
        const titles = ((x.vns || []).map(function (v) { return v && v.title; }).filter(Boolean)).join(' / ');
        return { source: 'vndb-char', id: x.id, name: x.name || '', original: x.original || '', year: '', work: titles };
      });
      /* 用作品/系列限定，缩小范围 */
      if (work) {
        const w = work.toLowerCase();
        const filtered = list.filter(function (x) { return (x.work || '').toLowerCase().indexOf(w) > -1; });
        if (filtered.length) list = filtered;
      }
      return list;
    }

    throw new Error('未知来源：' + source);
  }

  async function scrapeAssets(payload) {
    const source = (payload && payload.source) || 'steamgriddb';
    const id = payload && payload.id;
    const s = await readSettings();

    if (source === 'steamgriddb') {
      const auth = sgdbAuth(s);
      const out = [];
      const kinds = ['heroes', 'grids'];
      for (const kind of kinds) {
        try {
          const r = await fetch('https://www.steamgriddb.com/api/v2/' + kind + '/game/' + id, { headers: auth });
          if (!r.ok) continue;
          const j = await r.json();
          ((j && j.data) || []).forEach(function (a) {
            if (a && a.url) out.push({ url: a.url, thumb: a.thumb || a.url, kind: kind, w: a.width, h: a.height });
          });
        } catch (e) { /* 忽略单类失败 */ }
      }
      return out;
    }

    if (source === 'tmdb') {
      const key = (s.tmdbKey || '').trim();
      if (!key) throw new Error('未设置 TMDB API Key');
      const mediaType = (payload.mediaType === 'tv') ? 'tv' : 'movie';
      const r = await fetch('https://api.themoviedb.org/3/' + mediaType + '/' + id
        + '/images?api_key=' + encodeURIComponent(key) + '&include_image_language=zh,en,null', { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error('TMDB 图片获取失败 (HTTP ' + r.status + ')');
      const j = await r.json();
      const out = [];
      ((j && j.posters) || []).forEach(function (p) {
        if (p.file_path) out.push({ url: 'https://image.tmdb.org/t/p/w780' + p.file_path, thumb: 'https://image.tmdb.org/t/p/w185' + p.file_path, kind: 'poster' });
      });
      ((j && j.backdrops) || []).forEach(function (p) {
        if (p.file_path) out.push({ url: 'https://image.tmdb.org/t/p/w1280' + p.file_path, thumb: 'https://image.tmdb.org/t/p/w300' + p.file_path, kind: 'backdrop' });
      });
      return out;
    }

    if (source === 'bangumi') {
      const headers = { 'User-Agent': UA };
      const token = (s.bangumiToken || '').trim();
      if (token) headers.Authorization = 'Bearer ' + token;
      const r = await fetch('https://api.bgm.tv/v0/subjects/' + id, { headers: headers });
      if (!r.ok) throw new Error('Bangumi 条目获取失败 (HTTP ' + r.status + ')');
      const j = await r.json();
      const img = (j && j.images) || {};
      const out = [];
      [['large', '大图'], ['common', '中图'], ['medium', '中图2'], ['grid', '小图']].forEach(function (pair) {
        if (img[pair[0]]) out.push({ url: img[pair[0]], thumb: img[pair[0]], kind: pair[1] });
      });
      return out;
    }

    if (source === 'vndb') {
      const r = await fetch('https://api.vndb.org/kana/vn', {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters: ['id', '=', id],
          fields: 'id, title, image.url, screenshots{url, sexual, violence}'
        })
      });
      if (!r.ok) throw new Error('VNDB 条目获取失败 (HTTP ' + r.status + ')');
      const j = await r.json();
      const vn = (j && j.results && j.results[0]) || null;
      if (!vn) throw new Error('VNDB 未找到该条目');
      const out = [];
      if (vn.image && vn.image.url) out.push({ url: vn.image.url, thumb: vn.image.url, kind: '封面' });
      ((vn.screenshots) || []).forEach(function (sc) {
        if (sc && sc.url) out.push({ url: sc.url, thumb: sc.url, kind: '截图' });
      });
      return out;
    }

    if (source === 'bgm-char') {
      const headers = { 'User-Agent': UA };
      const token = (s.bangumiToken || '').trim();
      if (token) headers.Authorization = 'Bearer ' + token;
      const r = await fetch('https://api.bgm.tv/v0/characters/' + id, { headers: headers });
      if (!r.ok) throw new Error('Bangumi 角色获取失败 (HTTP ' + r.status + ')');
      const j = await r.json();
      const img = (j && j.images) || {};
      const out = [];
      [['large', '大图'], ['medium', '中图'], ['small', '小图'], ['grid', '网格图']].forEach(function (pair) {
        if (img[pair[0]]) out.push({ url: img[pair[0]], thumb: img[pair[0]], kind: pair[1] });
      });
      return out;
    }

    if (source === 'vndb-char') {
      const r = await fetch('https://api.vndb.org/kana/character', {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: ['id', '=', id], fields: 'id, name, image.url' })
      });
      if (!r.ok) throw new Error('VNDB 角色获取失败 (HTTP ' + r.status + ')');
      const j = await r.json();
      const ch = (j && j.results && j.results[0]) || null;
      const out = [];
      if (ch && ch.image && ch.image.url) out.push({ url: ch.image.url, thumb: ch.image.url, kind: '立绘' });
      return out;
    }

    throw new Error('未知来源：' + source);
  }

  async function downloadImage(payload) {
    const url = (payload && payload.url) || '';
    if (!url) throw new Error('图片地址为空');
    const headers = { 'User-Agent': UA, 'Accept': 'image/*' };
    if (/pximg\.net|pixiv\.net/i.test(url)) headers.Referer = 'https://www.pixiv.net/';
    else if (/vndb\.org/i.test(url)) headers.Referer = 'https://vndb.org/';
    else if (/bgm\.tv/i.test(url)) headers.Referer = 'https://bgm.tv/';
    const r = await fetch(url, { headers: headers });
    if (!r.ok) throw new Error('图片下载失败 (HTTP ' + r.status + ')');
    const ct = r.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await r.arrayBuffer());
    return { ok: true, dataUrl: 'data:' + ct + ';base64,' + buf.toString('base64') };
  }

  /* ---------------- 批量导入：作品/系列搜索 + 全部角色 ---------------- */
  async function searchWorks(payload) {
    const source = (payload && payload.source) || 'bgm-char';
    const term = String((payload && payload.term) || '').trim();
    if (!term) throw new Error('请输入作品/系列名称');
    const s = await readSettings();

    if (source === 'bgm-char') {
      const headers = { 'User-Agent': UA, 'Content-Type': 'application/json' };
      const token = (s.bangumiToken || '').trim();
      if (token) headers.Authorization = 'Bearer ' + token;
      const r = await fetch('https://api.bgm.tv/v0/search/subjects?limit=10', {
        method: 'POST', headers: headers, body: JSON.stringify({ keyword: term })
      });
      if (!r.ok) throw new Error('Bangumi 作品搜索失败 (HTTP ' + r.status + ')');
      const j = await r.json();
      return ((j && j.data) || []).map(function (x) {
        const img = x.images || {};
        return {
          source: 'bgm-char', id: x.id,
          name: x.name_cn || x.name || '',
          original: x.name || '',
          year: toYear(x.date),
          image: img.medium || img.common || img.large || img.grid || ''
        };
      });
    }

    if (source === 'vndb-char') {
      const r = await fetch('https://api.vndb.org/kana/vn', {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: ['search', '=', term], fields: 'id, title, released, image.url', results: 10 })
      });
      if (!r.ok) throw new Error('VNDB 作品搜索失败 (HTTP ' + r.status + ')');
      const j = await r.json();
      return ((j && j.results) || []).map(function (x) {
        return {
          source: 'vndb-char', id: x.id, name: x.title || '', original: '',
          year: toYear(x.released),
          image: (x.image && x.image.url) || ''
        };
      });
    }

    throw new Error('未知来源：' + source);
  }

  async function fetchWorkCharacters(payload) {
    const source = (payload && payload.source) || 'bgm-char';
    const workId = (payload && payload.id) || '';
    const workName = String((payload && payload.workName) || '').trim();
    const term = String((payload && payload.term) || '').trim();
    if (!workId && !term) throw new Error('缺少作品信息');
    const s = await readSettings();

    if (source === 'bgm-char') {
      const headers = { 'User-Agent': UA, 'Content-Type': 'application/json' };
      const token = (s.bangumiToken || '').trim();
      if (token) headers.Authorization = 'Bearer ' + token;
      let id = workId, name = workName;
      if (!id) {
        const r = await fetch('https://api.bgm.tv/v0/search/subjects?limit=1', {
          method: 'POST', headers: headers, body: JSON.stringify({ keyword: term })
        });
        if (!r.ok) throw new Error('Bangumi 作品搜索失败 (HTTP ' + r.status + ')');
        const j = await r.json();
        const subj = (j && j.data && j.data[0]) || null;
        if (!subj) throw new Error('Bangumi 未找到该作品');
        id = subj.id; name = subj.name_cn || subj.name || term;
      }
      const rc = await fetch('https://api.bgm.tv/v0/subjects/' + id + '/characters', { headers: headers });
      if (!rc.ok) throw new Error('Bangumi 角色获取失败 (HTTP ' + rc.status + ')');
      const jc = await rc.json();
      const arr = Array.isArray(jc) ? jc : ((jc && jc.data) || []);
      return {
        work: name || String(id),
        characters: arr.map(function (x) {
          const img = x.images || {};
          return {
            source: 'bgm-char', id: x.id,
            name: x.name_cn || x.name || '',
            original: x.name || '',
            image: img.large || img.common || img.medium || img.grid || ''
          };
        })
      };
    }

    if (source === 'vndb-char') {
      let id = workId, name = workName;
      if (!id) {
        const r = await fetch('https://api.vndb.org/kana/vn', {
          method: 'POST',
          headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
          body: JSON.stringify({ filters: ['search', '=', term], fields: 'id, title', results: 1 })
        });
        if (!r.ok) throw new Error('VNDB 作品搜索失败 (HTTP ' + r.status + ')');
        const j = await r.json();
        const vn = (j && j.results && j.results[0]) || null;
        if (!vn) throw new Error('VNDB 未找到该作品');
        id = vn.id; name = vn.title || term;
      }
      const rc = await fetch('https://api.vndb.org/kana/character', {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters: ['vn', '=', ['id', '=', id]],
          fields: 'id, name, original, image.url',
          results: 100
        })
      });
      if (!rc.ok) throw new Error('VNDB 角色获取失败 (HTTP ' + rc.status + ')');
      const jc = await rc.json();
      return {
        work: name || String(id),
        characters: ((jc && jc.results) || []).map(function (x) {
          return {
            source: 'vndb-char', id: x.id,
            name: x.name || '', original: x.original || '',
            image: (x.image && x.image.url) || ''
          };
        })
      };
    }

    throw new Error('未知来源：' + source);
  }

  /* ---------------- 角色图片搜索（Pixiv / Google 图片） ---------------- */
  async function searchCharacterImages(payload) {
    const source = (payload && payload.source) || 'google';
    const term = String((payload && payload.term) || '').trim();
    if (!term) throw new Error('请输入搜索词');
    const out = [];
    const seen = new Set();

    if (source === 'google') {
      const url = 'https://www.google.com/search?tbm=isch&hl=zh-CN&q=' + encodeURIComponent(term);
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' } });
      if (!r.ok) throw new Error('Google 图片请求失败 (HTTP ' + r.status + ')');
      const html = await r.text();
      const re = /https?:\/\/[^"'\\\s]+?\.(?:jpg|jpeg|png|webp)/gi;
      let m;
      while ((m = re.exec(html)) !== null) {
        const u = m[0];
        if (/gstatic\.com|google\.com\/images|googleusercontent\.com\/gstatic/i.test(u)) continue;
        if (seen.has(u)) continue;
        seen.add(u);
        out.push({ url: u, thumb: u });
        if (out.length >= 40) break;
      }
      if (!out.length) throw new Error('Google 未解析到图片，可尝试 Pixiv');
      return { work: term, images: out };
    }

    if (source === 'pixiv') {
      const base = 'https://www.pixiv.net/ajax/search/artworks/' + encodeURIComponent(term);
      const url = base + '?word=' + encodeURIComponent(term) + '&order=date&mode=all&p=1&s_mode=s_tag&type=all&lang=zh';
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          'Referer': 'https://www.pixiv.net/',
          'Accept': 'application/json'
        }
      });
      if (!r.ok) throw new Error('Pixiv 请求失败 (HTTP ' + r.status + ')');
      const j = await r.json();
      const data = (j && j.body && j.body.illustManga && j.body.illustManga.data) || [];
      data.forEach(function (x) {
        const u = x && x.url;
        if (u && !seen.has(u)) { seen.add(u); out.push({ url: u, thumb: u }); }
      });
      if (!out.length) throw new Error('Pixiv 未返回图片，可尝试 Google 图片');
      return { work: term, images: out };
    }

    throw new Error('未知来源：' + source);
  }


  return { translateText, scrapeSearch, scrapeAssets, downloadImage, searchWorks, fetchWorkCharacters, searchCharacterImages };
}

module.exports = { createScrapers };
