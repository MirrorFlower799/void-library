'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const suites = [
  ['--test', ...fs.readdirSync(path.join(root, 'test')).filter(file => file.endsWith('.test.js')).map(file => path.join('test', file))],
  ['test-zip.js'],
  ['test-renderer.js']
];
for (const args of suites) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', timeout: 120000 });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
