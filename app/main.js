'use strict';

const electron = require('electron');
const { app, BrowserWindow, protocol } = electron;
const path = require('node:path');
const { initPaths } = require('./lib/paths');
const { createCollectionStore } = require('./lib/collection-store');
const { createLibraryStore } = require('./lib/library-store');
const { createScrapers } = require('./lib/scrapers');
const { registerIpc } = require('./lib/ipc');
const { registerSchemes, registerProtocols } = require('./lib/protocols');

/* ---------------- 窗口 ---------------- */
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#f1f5f9',
    title: '虚空图书馆',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      plugins: true
    }
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  return win;
}

registerSchemes(protocol);

app.whenReady().then(() => {
  const paths = initPaths(app);
  const collections = createCollectionStore(paths);
  const library = createLibraryStore(paths);
  const scrapers = createScrapers({ readSettings: collections.readSettings });
  registerIpc(electron, paths, collections, library, scrapers);
  registerProtocols(electron, paths);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
