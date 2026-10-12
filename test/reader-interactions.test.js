'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function viewerFixture(config = {}) {
  const html = await fs.readFile(path.join(root, 'app/book/viewer.html'), 'utf8');
  const code = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
    .replace(/^import .*$/gm, '')
    .replace("await import('./remote-file.mjs')", "{ openRemoteFile: async () => ({ name: 'test.pdf', type: 'application/pdf', size: 1, destroy() {} }) }");
  const handlers = new Map(), messages = [], calls = [], viewListeners = new Map();
  const renderer = {
    spread: undefined,
    getAttribute: () => null,
    setAttribute() {}, setStyles() {},
    async setSpread(v) { this.spread = v; calls.push(['spread', v]); },
  };
  const view = {
    renderer, isFixedLayout: true,
    book: { rendition: { layout: 'pre-paginated' }, sections: [1, 2], toc: [], metadata: {} },
    addEventListener(name, fn) { viewListeners.set(name, fn); }, async open() {}, async init() {},
    async goTo(index) { calls.push(['goTo', index]); },
    async goToFraction(fraction) { calls.push(['goToFraction', fraction]); },
    async next() { calls.push(['next']); },
    async prev() { calls.push(['prev']); },
  };
  const host = { postMessage(msg) {
    messages.push(msg);
    if (msg.type === 'ready') handlers.get('message')({ source: host, data: {
      target: 'vl-reader', action: 'configure', font: 18,
      columns: config.columns || 1, flow: config.flow || 'paginated', fg: '#222', bg: '#fff',
    } });
  } };
  const el = () => ({ style: {} });
  const context = {
    document: { getElementById: name => name === 'view' ? view : el(),
      documentElement: el(), body: el(),
      addEventListener: (name, fn) => handlers.set('document-' + name, fn),
    },
    window: { addEventListener: (name, fn) => handlers.set(name, fn) },
    parent: host, location: { search: '?src=/book&name=test.pdf&type=application/pdf' },
    URLSearchParams, performance, console, setTimeout, clearTimeout,
    requestAnimationFrame: fn => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout,
  };
  vm.runInNewContext(code, context);
  await wait(15);
  return { handlers, messages, calls, renderer, view, host, viewListeners };
}

test('PDF spreads honor startup configuration and switch without recreating reader', async () => {
  const { calls, handlers, host, renderer } = await viewerFixture({ columns: 2 });
  assert.equal(renderer.spread, 'both');
  assert.equal(calls.filter(c => c[0] === 'spread').length, 1);
  handlers.get('message')({ source: host, data: { target: 'vl-reader', action: 'setColumnCount', value: 1 } });
  await wait(15);
  assert.equal(renderer.spread, 'none');
  handlers.get('message')({ source: host, data: { target: 'vl-reader', action: 'setColumnCount', value: 2 } });
  await wait(15);
  assert.equal(renderer.spread, 'both');
});

test('mouse wheel inside a paginated content frame turns immediately; small trackpad deltas accumulate', async () => {
  const { handlers, calls } = await viewerFixture();
  const wheel = handlers.get('document-wheel');
  assert.equal(typeof wheel, 'function');
  let cancelled = 0;
  const make = deltaY => ({ deltaY, deltaX: 0, deltaMode: 0, cancelable: true,
    preventDefault() { cancelled++; } });
  wheel(make(120));
  await wait(8);
  assert.equal(calls.filter(c => c[0] === 'next').length, 1);
  wheel(make(120));
  await wait(8);
  assert.equal(calls.filter(c => c[0] === 'next').length, 1, 'one gesture should not flood the queue');
  await wait(95);
  for (let i = 0; i < 8; i++) wheel(make(-4));
  await wait(8);
  assert.equal(calls.filter(c => c[0] === 'prev').length, 1, 'small trackpad deltas must accumulate');
  assert.equal(cancelled, 10);
});

test('PDF jump uses exact one-based pages, and navigation never wraps at either edge', async () => {
  const { calls, handlers, host, viewListeners } = await viewerFixture();
  const notify = (index, total) => viewListeners.get('relocate')({ detail: {
    fraction: index / total, section: { current: index, total }, cfi: 'epubcfi(fake)' } });
  notify(0, 2);
  handlers.get('message')({ source: host, data: { target: 'vl-reader', action: 'prev' } });
  await wait(10);
  assert.equal(calls.filter(x => x[0] === 'prev').length, 0);
  handlers.get('message')({ source: host, data: { target: 'vl-reader', action: 'goPage', value: 2 } });
  await wait(10);
  assert.deepEqual(calls.filter(x => x[0] === 'goTo'), [['goTo', 1]]);
  notify(1, 2);
  handlers.get('message')({ source: host, data: { target: 'vl-reader', action: 'next' } });
  await wait(10);
  assert.equal(calls.filter(x => x[0] === 'next').length, 0);
  handlers.get('message')({ source: host, data: { target: 'vl-reader', action: 'goPage', value: 500 } });
  await wait(10);
  assert.equal(calls.filter(x => x[0] === 'goTo').length, 1, 'out of bounds must not be applied');
});

test('EPUB numeric jumps use reading-location ordinal; range and progress metadata stay numeric', async () => {
  const { calls, handlers, host, view, viewListeners, messages } = await viewerFixture();
  view.isFixedLayout = false;
  view.book.rendition.layout = 'reflowable';
  view.book.sections = [1, 2, 3];
  view.lastLocation = { location: { total: 181 } };
  viewListeners.get('relocate')({ detail: {
    fraction: 0.5, section: { current: 1 }, location: { current: 90, total: 181 }, cfi: 'epubcfi(/6/4)' } });
  const relocation = messages.at(-1);
  assert.equal(relocation.type, 'relocate');
  assert.equal(relocation.page, 91);
  assert.equal(relocation.totalPages, 181);
  handlers.get('message')({ source: host, data: { target: 'vl-reader', action: 'goPage', value: 91 } });
  await wait(10);
  assert.equal(calls.filter(x => x[0] === 'goToFraction').length, 1);
  assert.ok(Math.abs(calls.find(x => x[0] === 'goToFraction')[1] - 0.5) < 0.000001);
});

test('fixed-layout preserves the active section when switching actual single/double frames', async () => {
  const src = (await fs.readFile(path.join(root, 'app/book/vendor/foliate-js/fixed-layout.js'), 'utf8'))
    .replace('export class FixedLayout', 'class FixedLayout')
    + '\nglobalThis.TestFixedLayout = FixedLayout;';
  function elem(kind) {
    const node = { style: {}, children: [],
      setAttribute() {}, append(...nodes) { this.children.push(...nodes); },
      replaceChildren(...nodes) { this.children = nodes; },
      getAttribute() { return null; }, remove() {},
    };
    if (kind === 'iframe') {
      const handlers = {};
      node.addEventListener = (name, fn) => { handlers[name] = fn; };
      node.contentDocument = {
        documentElement: { localName: 'html' },
        querySelector: () => ({ getAttribute: () => 'width=600,height=800' }),
      };
      Object.defineProperty(node, 'src', {
        set() { setTimeout(() => handlers.load?.(), 0); },
      });
    }
    return node;
  }
  class HTMLElement {
    attachShadow() { return elem('shadow'); }
    getBoundingClientRect() { return { width: 1280, height: 800 }; }
    dispatchEvent() {}
  }
  const context = {
    HTMLElement, CSSStyleSheet: class { replaceSync() {} },
    ResizeObserver: class { observe() {} unobserve() {} },
    CustomEvent: class { constructor(name, options) { this.type = name; this.detail = options.detail; } },
    customElements: { define() {} },
    document: { createElement: elem }, console, setTimeout,
  };
  vm.runInNewContext(src, context);
  const fxl = new context.TestFixedLayout();
  const sections = Array.from({ length: 5 }, (_, i) => ({ id: i, load: async () => 'page-' + i }));
  fxl.open({ sections, rendition: { layout: 'pre-paginated' } });
  await fxl.goTo({ index: 3 });
  assert.equal(fxl.index, 3);
  await fxl.setSpread('none');
  assert.equal(fxl.spread, 'none');
  assert.equal(fxl.index, 3, 'single page must preserve page 4');
  assert.equal(fxl.getSpreadOf(sections[3]).index, 3);
  await fxl.setSpread('both');
  assert.equal(fxl.spread, 'both');
  assert.equal(fxl.index, 3, 'double page must preserve page 4');
  assert.equal(fxl.getSpreadOf(sections[3]).index, 2);
  assert.equal(fxl.getSpreadOf(sections[4]).index, 2);
  fxl.destroy();
});

test('fixed layout retains old spread until the new PDF canvas has painted', async () => {
  const src = (await fs.readFile(path.join(root, 'app/book/vendor/foliate-js/fixed-layout.js'), 'utf8'))
    .replace('export class FixedLayout', 'class FixedLayout')
    + '\nglobalThis.TestFixedLayout = FixedLayout;';
  const shadowRoot = { children: [], adoptedStyleSheets: [],
    append(node) { this.children.push(node); node.parent = this; },
    replaceChildren() { this.children = []; },
  };
  const elem = kind => {
    const element = { style: {}, append(child) { this.child = child; },
      setAttribute() {}, remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); },
    };
    if (kind === 'iframe') {
      const events = new Map();
      element.addEventListener = (event, fn) => events.set(event, fn);
      element.contentDocument = {
        documentElement: { localName: 'html' },
        querySelector: () => ({ getAttribute: () => 'width=600,height=800' }),
      };
      Object.defineProperty(element, 'src', { set() { setTimeout(() => events.get('load')?.(), 0); } });
    }
    return element;
  };
  class HTMLElement {
    attachShadow() { return shadowRoot; }
    getBoundingClientRect() { return { width: 1000, height: 800 }; }
    dispatchEvent() {}
  }
  const ctx = {
    HTMLElement, CSSStyleSheet: class { replaceSync() {} },
    ResizeObserver: class { observe() {} unobserve() {} },
    customElements: { define() {} },
    CustomEvent: class { constructor() {} },
    document: { createElement: elem }, console, setTimeout,
  };
  vm.runInNewContext(src, ctx);
  const renderer = new ctx.TestFixedLayout();
  let finish;
  const first = { load: async () => ({ src: 'page-1', onZoom: async () => {} }) };
  const second = { load: async () => ({ src: 'page-2', onZoom: () => new Promise(resolve => finish = resolve) }) };
  renderer.open({ sections: [first, second], rendition: { layout: 'pre-paginated', spread: 'none' } });
  await renderer.goTo({ index: 0 });
  assert.equal(shadowRoot.children.length, 1);
  const pageChange = renderer.goTo({ index: 1 });
  await wait(8);
  assert.equal(shadowRoot.children.length, 2, 'the old visible page must remain during rendering');
  assert.equal(shadowRoot.children[1].style.visibility, 'hidden');
  assert.equal(typeof finish, 'function');
  finish();
  await pageChange;
  assert.equal(shadowRoot.children.length, 1, 'replace old page only after new page paints');
  assert.equal(shadowRoot.children[0].style.visibility, '');
  assert.equal(renderer.index, 1);
  renderer.destroy();
});

test('PDF canvas becomes visible before the deferred text layer finishes; bitmap reuse is supported', async () => {
  const text = await fs.readFile(path.join(root, 'app/book/vendor/foliate-js/pdf.js'), 'utf8');
  const src = text.slice(text.indexOf('const activeRenders = new WeakMap()'), text.indexOf('\nconst renderPage = async'))
    + '\nglobalThis.testPDF = { render, cancelRender };';
  let bitmapPaints = 0, canvasPaints = 0, textPaints = 0;
  const context = {
    console, setTimeout, clearTimeout, devicePixelRatio: 2,
    createImageBitmap: async canvas => ({ width: canvas.width, height: canvas.height, close() {} }),
    document: {
      createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() { bitmapPaints++; } }) }),
    },
    pdfjsLib: {
      TextLayer: class { async render() { textPaints++; await wait(35); } cancel() {} },
      AnnotationLayer: class { render() {} },
    },
  };
  vm.runInNewContext(src, context);
  function doc() {
    const canvasContainer = { replaceChildren() { canvasPaints++; } };
    return {
      documentElement: { isConnected: true, style: { setProperty() {} } },
      querySelector: selector => selector === '#canvas' ? canvasContainer : ({ replaceChildren() {}, append() {}, classList: { add() {}, remove() {} } }),
      querySelectorAll: () => [],
      adoptNode: node => node, createElement: () => ({ className: '' }),
    };
  }
  const page = {
    pageNumber: 1,
    getViewport: ({ scale }) => ({ width: 612 * scale, height: 792 * scale }),
    render: () => ({ promise: Promise.resolve(), cancel() {} }),
    streamTextContent: async () => ({}), getAnnotations: async () => [],
  };
  const rasters = new Map(), paint1 = doc();
  await context.testPDF.render(page, paint1, 1, rasters);
  assert.equal(canvasPaints, 1);
  assert.equal(textPaints, 0, 'text parsing must not delay first paint');
  await wait(60);
  assert.equal(textPaints, 1);
  assert.equal(rasters.size, 1);
  const paint2 = doc();
  await context.testPDF.render(page, paint2, 1, rasters);
  assert.equal(bitmapPaints, 1, 'returning to a page should use the cached bitmap');
  // Page changes must cancel obsolete PDF.js render tasks. A stale page must
  // never repaint a newly selected spread when its work finishes.
  const previousCount = canvasPaints;
  const staleDoc = doc();
  let finishLateRender, cancelCalled = false;
  const slowPage = { ...page, pageNumber: 7,
    render: () => ({
      promise: new Promise(resolve => { finishLateRender = resolve; }),
      cancel() { cancelCalled = true; },
    }),
  };
  const outdated = context.testPDF.render(slowPage, staleDoc, 1, rasters);
  context.testPDF.cancelRender(staleDoc);
  finishLateRender();
  await outdated;
  assert.equal(cancelCalled, true);
  assert.equal(canvasPaints, previousCount, 'obsolete pages must not paint after navigation');
  context.testPDF.cancelRender(paint1);
  context.testPDF.cancelRender(paint2);
});

test('zoomed PDF in scroll mode sends wheel to page scroll rather than navigation', async () => {
  const { handlers, renderer, calls } = await viewerFixture({ flow: 'scrolled' });
  Object.assign(renderer, { clientHeight: 500, scrollHeight: 1400, scrollTop: 0 });
  const wheel = handlers.get('document-wheel');
  let prevented = 0;
  const event = { deltaY: 120, deltaX: 0, deltaMode: 0, cancelable: true,
    preventDefault() { prevented++; } };
  wheel(event);
  assert.equal(renderer.scrollTop, 120);
  assert.equal(prevented, 1);
  assert.equal(calls.filter(c => c[0] === 'next').length, 0);
  wheel({ ...event, deltaY: -80 });
  assert.equal(renderer.scrollTop, 40);
});
