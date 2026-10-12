'use strict';

const path = require('node:path');
const fsp = require('node:fs/promises');

const IMAGE_EXTENSIONS = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp'
};

async function writeImage(directory, prefix, dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s.exec(dataUrl || '');
  if (!match) return null;
  const extension = IMAGE_EXTENSIONS[match[1].toLowerCase()] || 'jpg';
  const buffer = Buffer.from(match[2], 'base64');
  const name = prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8) + '.' + extension;
  await fsp.mkdir(directory, { recursive: true });
  await fsp.writeFile(path.join(directory, name), buffer);
  return name;
}

async function readImage(directory, name) {
  try {
    const file = path.join(directory, path.basename(name));
    const buffer = await fsp.readFile(file);
    const extension = path.extname(file).slice(1).toLowerCase();
    const mime = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp'
      : extension === 'gif' ? 'image/gif' : extension === 'bmp' ? 'image/bmp' : 'image/jpeg';
    return 'data:' + mime + ';base64,' + buffer.toString('base64');
  } catch (error) {
    return '';
  }
}

async function cleanupImages(directory, referenced) {
  try {
    const files = await fsp.readdir(directory);
    await Promise.all(files.map(async (file) => {
      if (!referenced.has(file)) {
        try { await fsp.unlink(path.join(directory, file)); } catch (error) { /* Best effort, as before. */ }
      }
    }));
  } catch (error) { /* A missing directory has no images to clean. */ }
}

// Folder import keeps the original six supported extensions and skips bad files.
// copyFile avoids retaining a complete source image in JavaScript memory.
async function importImages(source, destination, prefix) {
  const extensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
  let files;
  try { files = await fsp.readdir(source); }
  catch (error) { return { ok: false, error: '无法读取文件夹' }; }
  const shots = [];
  for (const file of files) {
    const extension = path.extname(file).toLowerCase();
    if (!extensions.includes(extension)) continue;
    try {
      const name = prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8) + extension;
      await fsp.mkdir(destination, { recursive: true });
      await fsp.copyFile(path.join(source, file), path.join(destination, name));
      shots.push(name);
    } catch (error) { /* Skip a single unreadable file, as before. */ }
  }
  return { ok: true, count: shots.length, shots };
}

module.exports = { writeImage, readImage, cleanupImages, importImages };
