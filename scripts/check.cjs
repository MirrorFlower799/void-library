'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'vendor' || entry.name === 'pinyin-pro.js') return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : /\.(c?js)$/.test(file) ? [file] : [];
  });
}
const files = ['app', 'scripts', 'test'].flatMap(name => walk(path.join(root, name)))
  .concat(['test-zip.js', 'test-renderer.js'].map(name => path.join(root, name)));
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax checked: ${files.length} JavaScript files.`);
