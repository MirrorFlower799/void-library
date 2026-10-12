'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { ensureBookServerReady } = require('../app/lib/book-server');

test('reader startup does not repeat layout for unchanged settings', async () => {
  const html = await fs.readFile(path.join(__dirname, '../app/book/viewer.html'), 'utf8');
  const code = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '');
  const listeners = new Map();
  const attributes = new Map();
  let renders = 0;
  const view = {
    addEventListener() {}, book: {}, open: async () => {}, init: async () => {},
    renderer: { setStyles() {}, render() { renders++; },
      setAttribute(name, value) { if (attributes.get(name) !== value) { attributes.set(name, value); renders++; } },
      getAttribute: name => attributes.get(name) }
  };
  const context = {
    document: { getElementById: id => id === 'view' ? view : { style: {} }, documentElement: { style: {} }, body: { style: {} } },
    window: { addEventListener: (name, fn) => listeners.set(name, fn) },
    parent: { postMessage() {} }, location: { search: '?src=/book&name=test.epub' },
    URLSearchParams, File, console, setTimeout, clearTimeout,
    requestAnimationFrame: fn => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout,
    fetch: async () => new Response('test')
  };
  vm.runInNewContext(code, context);
  await new Promise(resolve => setTimeout(resolve, 20));
  for (let i = 0; i < 2; i++) {
    for (const message of [{ action: 'setFont', value: 18 }, { action: 'setColumnCount', value: 1 }, { action: 'setFlow', value: 'paginated' }]) {
      listeners.get('message')({ data: { target: 'vl-reader', ...message }, source: context.parent });
    }
  }
  await new Promise(resolve => setTimeout(resolve, 30));
  console.log('Startup layout calls:', renders);
  assert(renders <= 3, `Unchanged startup settings triggered ${renders} layout passes`);
});

test('host settings and saved CFI are applied before the first layout', async () => {
  const html = await fs.readFile(path.join(__dirname, '../app/book/viewer.html'), 'utf8');
  const code = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
    .replace(/^import .*$/gm, '')
    .replace("await import('./remote-file.mjs')", "{ openRemoteFile: async () => ({ name: 'test.epub', type: 'application/epub+zip', size: 100, slice() {}, destroy() {} }) }");
  const listeners = new Map();
  const attrs = new Map();
  const events = [];
  let initArgs, settingsAtInit;
  const view = {
    book: { metadata: { title: '书名' }, toc: [], sections: [1] },
    addEventListener() {}, open: async () => {},
    init: async args => { initArgs = args; settingsAtInit = new Map(attrs); },
    renderer: {
      setStyles() {}, getAttribute: key => attrs.get(key),
      setAttribute: (key, value) => attrs.set(key, value)
    }
  };
  const host = { postMessage: msg => {
    events.push(msg.type);
    if (msg.type === 'ready') {
      listeners.get('message')({ source: host, data: {
        target: 'vl-reader', action: 'configure', font: 24, flow: 'scrolled',
        columns: 1, fg: '#111111', bg: '#eeeeee', cfi: 'epubcfi(/6/4)'
      } });
    }
  } };
  const context = {
    document: { getElementById: id => id === 'view' ? view : { style: {} },
      documentElement: { style: {} }, body: { style: {} } },
    window: { addEventListener: (name, fn) => listeners.set(name, fn) },
    parent: host, location: { search: '?src=/book&name=test.epub' },
    URLSearchParams, console, setTimeout, clearTimeout,
    requestAnimationFrame: fn => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout
  };
  vm.runInNewContext(code, context);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(initArgs.lastLocation, 'epubcfi(/6/4)');
  assert.equal(settingsAtInit.get('flow'), 'scrolled');
  assert.equal(settingsAtInit.get('max-column-count'), '1');
  assert.deepEqual(events.slice(0, 3), ['ready', 'opened', 'toc']);
});

test('PDF reader resources required by the bundled adapter are available', async t => {
  const bs = await ensureBookServerReady();
  t.after(() => new Promise(resolve => { bs.server.close(resolve); bs.server.closeAllConnections(); }));
  for (const file of ['pdf.mjs', 'pdf.worker.mjs', 'text_layer_builder.css', 'annotation_layer_builder.css']) {
    const response = await fetch(`http://127.0.0.1:${bs.port}/vendor/foliate-js/vendor/pdfjs/${file}`);
    assert.equal(response.status, 200, file + ' must be available offline');
  }
});
