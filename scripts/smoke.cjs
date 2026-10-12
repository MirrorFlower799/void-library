'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function smoke() {
  const executable = path.resolve(__dirname, '../dist/虚空图书馆-重构版-win32-x64/虚空图书馆.exe');
  await fs.access(executable);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'void-library-smoke-'));
  const data = path.join(temporary, 'data');
  const env = { ...process.env, PORTABLE_EXECUTABLE_DIR: data };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, ['--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + path.join(temporary, 'profile')], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(child, 'exit');
  let log = '';
  child.stdout.on('data', chunk => { log += chunk; });
  child.stderr.on('data', chunk => { log += chunk; });
  let socket;
  try {
    let match;
    for (let i = 0; i < 80; i++) {
      match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(log);
      if (match) break;
      if (child.exitCode !== null) throw Error('Application exited before debugging was ready.\n' + log);
      await delay(250);
    }
    if (!match) throw Error('Application startup timed out.\n' + log);
    let page;
    for (let i = 0; i < 80; i++) {
      const pages = await (await fetch('http://127.0.0.1:' + match[1] + '/json/list')).json();
      page = pages.find(p => p.type === 'page' && p.url.includes('index.html'));
      if (page) break;
      await delay(250);
    }
    assert(page, 'Main application page was not created');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await once(socket, 'open');
    let sequence = 0;
    const pending = new Map();
    const errors = [];
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
      if (message.id && pending.has(message.id)) {
        const { resolve, reject, timer } = pending.get(message.id);
        clearTimeout(timer);
        pending.delete(message.id);
        if (message.error) reject(Error(JSON.stringify(message.error))); else resolve(message.result);
      }
    });
    const command = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
    await command('Runtime.enable');
    const result = await command('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
      for (let i = 0; i < 100 && (!window.GameCollection || document.querySelectorAll('.game-card').length !== 6); i++) await new Promise(r => setTimeout(r, 50));
      const loaded = await window.voidLibrary.load();
      return { count: window.GameCollection.getGames().length, cards: document.querySelectorAll('.game-card').length,
        stored: loaded.games.length, directory: loaded.dataDir, models: !!window.VoidModels, charts: !!window.VoidCharts,
        library: await window.voidLibrary.libLoad(), settings: await window.voidLibrary.loadSettings() };
    })()` });
    assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    const state = result.result.value;
    assert.equal(state.count, 6);
    assert.equal(state.cards, 6);
    assert.equal(state.stored, 6);
    assert.equal(path.resolve(state.directory), path.resolve(data));
    assert(state.models && state.charts);
    assert.deepEqual(state.library.library, { shelves: [], books: [] });
    assert.deepEqual(state.settings, {});
    assert.deepEqual(errors, []);
    console.log('Electron smoke passed: packaged modules, preload IPC, 6 rendered cards, isolated persistence, no renderer exceptions.');
    await command('Runtime.evaluate', { expression: 'setTimeout(() => window.close(), 50)' });
    await Promise.race([exited, delay(5000)]);
  } finally {
    if (socket) socket.close();
    if (child.exitCode === null) child.kill();
    await exited;
    // Only remove the unique temporary directory this run created.
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
    assert(path.basename(temporary).startsWith('void-library-smoke-'));
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
smoke().catch(error => { console.error(error); process.exitCode = 1; });
