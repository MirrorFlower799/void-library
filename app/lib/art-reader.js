'use strict';

const path = require('node:path');
const fs = require('node:fs');
const fsp = fs.promises;
const { zipEntries, readZipEntry } = require('./zip-index');
const { isImageFile, mimeByExt, b64u } = require('./media');

/* 自动提取封面（图片 / epub / cbz / 压缩包 / 文件夹） */
async function extractArtCover(target) {
  let st;
  try { st = await fsp.stat(target); } catch (e) { return ''; }
  if (st.isDirectory()) {
    let found = '';
    async function walk(dir, depth) {
      if (found || depth > 2) return;
      let es;
      try { es = await fsp.readdir(dir, { withFileTypes: true }); } catch (e) { return; }
      es.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh', { numeric: true }); });
      for (const e of es) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { await walk(full, depth + 1); }
        else if (isImageFile(full)) { found = full; return; }
        if (found) return;
      }
    }
    await walk(target, 0);
    if (!found) return '';
    try {
      const buf = await fsp.readFile(found);
      return 'data:' + mimeByExt(path.extname(found)) + ';base64,' + buf.toString('base64');
    } catch (e) { return ''; }
  }
  if (isImageFile(target)) {
    try {
      const buf = await fsp.readFile(target);
      return 'data:' + mimeByExt(path.extname(target)) + ';base64,' + buf.toString('base64');
    } catch (e) { return ''; }
  }
  const ext = path.extname(target).toLowerCase();
  if (['.epub', '.cbz', '.zip', '.fbz'].indexOf(ext) > -1) {
    let entries;
    try { entries = await zipEntries(target); } catch (e) { return ''; }
    let names = Array.from(entries.keys()).filter(function (n) { return !n.endsWith('/') && isImageFile(n); });
    if (!names.length) return '';
    names.sort(function (a, b) { return a.localeCompare(b, 'zh', { numeric: true }); });
    let pick = names.find(function (n) { return /cover|封面/i.test(n); }) || names[0];
    try {
      const buf = await readZipEntry(target, pick);
      return buf ? 'data:' + mimeByExt(path.extname(pick)) + ';base64,' + buf.toString('base64') : '';
    } catch (e) { return ''; }
  }
  return '';
}

/* 文本清单（每行一个图片路径）→ 按图片页阅读 */
async function imageListPages(filePath) {
  let text;
  try { text = await fsp.readFile(filePath, 'utf8'); } catch (e) { return []; }
  const dir = path.dirname(filePath);
  const lines = text.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
  const imgs = [];
  for (const ln of lines) {
    if (!isImageFile(ln)) continue;
    const p = path.resolve(dir, ln);
    try { await fsp.access(p); imgs.push(p); } catch (e) { /* skip */ }
  }
  return imgs.length >= 2 ? imgs : [];
}

async function browseArt(target) {
  let st;
  try { st = await fsp.stat(target); } catch (e) { return { ok: false, error: '路径不存在' }; }

  if (st.isDirectory()) {
    const images = [];
    async function walk(dir) {
      let es;
      try { es = await fsp.readdir(dir, { withFileTypes: true }); } catch (e) { return; }
      es.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh', { numeric: true }); });
      for (const e of es) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { if (images.length < 800) await walk(full); }
        else if (isImageFile(full)) images.push(full);
      }
    }
    await walk(target);
    if (images.length) {
      return { ok: true, kind: 'pages', title: path.basename(target), pages: images.map(function (p) { return 'media://file/' + b64u(p); }) };
    }
    let entries = [];
    try {
      const es = await fsp.readdir(target, { withFileTypes: true });
      entries = es.map(function (e) { return { name: e.name, isDir: e.isDirectory() }; });
    } catch (e) { /* ignore */ }
    return { ok: true, kind: 'list', title: path.basename(target), path: target, entries: entries };
  }

  const ext = path.extname(target).toLowerCase();
  if (ext === '.pdf') {
    return { ok: true, kind: 'book', title: path.basename(target), path: target };
  }
  if (isImageFile(target)) {
    return { ok: true, kind: 'pages', title: path.basename(target), pages: ['media://file/' + b64u(target)] };
  }
  if (['.zip', '.cbz', '.epub', '.fbz'].indexOf(ext) > -1) {
    let entries;
    try { entries = await zipEntries(target); } catch (e) { return { ok: false, error: '无法读取压缩包' }; }
    const all = Array.from(entries.keys()).filter(function (n) { return !n.endsWith('/'); });
    const names = all.filter(function (n) { return isImageFile(n); });
    names.sort(function (a, b) { return a.localeCompare(b, 'zh', { numeric: true }); });
    const textCount = all.filter(function (n) { return /\.(x?html?|opf|ncx|xml|svg|txt|css)$/i.test(n); }).length;
    /* zip/cbz：有图即漫画；epub/fbz：以图片为主时也按漫画（图片页）呈现 */
    const isComic = names.length > 0 && (ext !== '.epub' && ext !== '.fbz'
      ? true
      : (names.length >= 3 && names.length >= textCount));
    if (isComic) {
      return {
        ok: true, kind: 'pages', title: path.basename(target),
        pages: names.map(function (n) { return 'media://zip/' + b64u(target) + '/' + b64u(n); })
      };
    }
    if (ext === '.epub' || ext === '.fbz') {
      return { ok: true, kind: 'book', title: path.basename(target), path: target };
    }
    return { ok: true, kind: 'list', title: path.basename(target), path: target, entries: all.map(function (n) { return { name: n, isDir: false }; }) };
  }
  if (['.mobi', '.fb2'].indexOf(ext) > -1) {
    return { ok: true, kind: 'book', title: path.basename(target), path: target };
  }
  return { ok: true, kind: 'other', title: path.basename(target), path: target };
}

module.exports = { extractArtCover, imageListPages, browseArt };
