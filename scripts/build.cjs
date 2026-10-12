'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

async function filesIn(directory, prefix = '') {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(path.join(directory, entry.name), relative));
    else files.push(relative);
  }
  return files.sort();
}

async function build() {
  await fs.mkdir(dist, { recursive: true });
  const archive = path.join(dist, 'app.asar');
  const source = path.join(root, 'app');
  await asar.createPackage(source, archive);
  const files = await filesIn(source);
  const manifest = {};
  for (const file of files) {
    const original = await fs.readFile(path.join(source, file));
    if (!original.equals(asar.extractFile(archive, path.normalize(file)))) throw Error('Package mismatch: ' + file);
    manifest[file] = crypto.createHash('sha256').update(original).digest('hex');
  }
  await fs.writeFile(path.join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Packaged and verified ${files.length} files: ${archive}`);

  if (process.argv.includes('--portable')) {
    const runtime = path.resolve(process.env.VOID_LIBRARY_RUNTIME || path.join(root, '..', '虚空图书馆-win32-x64'));
    const destination = path.join(dist, '虚空图书馆-重构版-win32-x64');
    if (runtime === destination) throw Error('Runtime source must differ from build output.');
    await fs.access(path.join(runtime, '虚空图书馆.exe'));
    await fs.mkdir(path.join(destination, 'resources'), { recursive: true });
    // Copy the Electron runtime only; never copy local records, books or API keys.
    const runtimeFiles = ['虚空图书馆.exe', 'chrome_100_percent.pak', 'chrome_200_percent.pak',
      'd3dcompiler_47.dll', 'dxcompiler.dll', 'dxil.dll', 'ffmpeg.dll', 'icudtl.dat',
      'LICENSE', 'LICENSES.chromium.html', 'resources.pak', 'snapshot_blob.bin',
      'v8_context_snapshot.bin', 'version', 'vk_swiftshader_icd.json', 'vk_swiftshader.dll', 'vulkan-1.dll'];
    for (const file of runtimeFiles) await fs.copyFile(path.join(runtime, file), path.join(destination, file));
    await fs.cp(path.join(runtime, 'locales'), path.join(destination, 'locales'), { recursive: true });
    await fs.copyFile(archive, path.join(destination, 'resources', 'app.asar'));
    console.log('Portable application: ' + path.join(destination, '虚空图书馆.exe'));
  }
}
build().catch(error => { console.error(error); process.exitCode = 1; });
