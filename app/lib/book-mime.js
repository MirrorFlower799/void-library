'use strict';
const path = require('node:path');
const BOOK_MIME = {
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.json': 'application/json', '.wasm': 'application/wasm', '.map': 'application/json',
  '.epub': 'application/epub+zip', '.cbz': 'application/vnd.comicbook+zip', '.pdf': 'application/pdf',
  '.mobi': 'application/x-mobipocket-ebook', '.fb2': 'application/x-fictionbook+xml',
  '.fbz': 'application/x-zip-compressed-fb2', '.txt': 'text/plain',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf'
};
function bookMime(p) { return BOOK_MIME[path.extname(String(p || '')).toLowerCase()] || 'application/octet-stream'; }

module.exports = { bookMime };
