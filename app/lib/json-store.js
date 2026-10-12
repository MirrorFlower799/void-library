'use strict';

const fsp = require('node:fs/promises');

// Keep the existing on-disk format and replace-after-write behavior.
async function writeJson(file, value) {
  const temporary = file + '.tmp';
  await fsp.writeFile(temporary, JSON.stringify(value, null, 2), 'utf8');
  await fsp.rename(temporary, file);
}

module.exports = { writeJson };
