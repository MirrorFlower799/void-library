'use strict';

const path = require('node:path');

/* ---------------- 资料集内部浏览辅助 ---------------- */
const MEDIA_IMG_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif', '.jfif'];
function isImageFile(p) { return MEDIA_IMG_EXT.indexOf(path.extname(String(p || '')).toLowerCase()) > -1; }
function mimeByExt(ext) {
  ext = String(ext || '').replace(/^\./, '').toLowerCase();
  return ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp'
    : ext === 'gif' ? 'image/gif' : ext === 'bmp' ? 'image/bmp'
    : ext === 'avif' ? 'image/avif' : 'image/jpeg';
}
function b64u(s) {
  return Buffer.from(String(s), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(s, 'base64').toString('utf8');
}

module.exports = { isImageFile, mimeByExt, b64u, unb64u };
