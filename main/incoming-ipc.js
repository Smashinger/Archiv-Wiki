// main/incoming-ipc.js
// Begrenzte IPC-Schnittstelle für den projektbezogenen Eingang-Speicher.

'use strict';

const { ipcMain, dialog, BrowserWindow } = require('electron');
const incomingStore = require('./incoming-store');

function registerIncomingIpc({ getCurrentProject }) {
  function requireProjectPath() {
    const projectPath = getCurrentProject()?.path;
    if (!projectPath) throw new Error('Kein Projekt geöffnet.');
    return projectPath;
  }

  ipcMain.handle('incoming:list', () =>
    incomingStore.loadIncoming(requireProjectPath()));

  ipcMain.handle('incoming:get', (_event, id) =>
    incomingStore.getIncoming(requireProjectPath(), id));

  ipcMain.handle('incoming:create', (_event, data) =>
    incomingStore.createIncoming(requireProjectPath(), data));

  ipcMain.handle('incoming:receiveWebClip', (_event, data) =>
    incomingStore.receiveWebClip(requireProjectPath(), data));

  ipcMain.handle('incoming:addFile', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) { win.show(); win.moveTop(); win.focus(); }

    const result = await dialog.showOpenDialog(win, {
      title: 'Datei zum Eingang hinzufügen',
      properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    return incomingStore.createIncomingFromFile(requireProjectPath(), result.filePaths[0]);
  });

  ipcMain.handle('incoming:addImage', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) { win.show(); win.moveTop(); win.focus(); }

    const result = await dialog.showOpenDialog(win, {
      title: 'Bild zum Eingang hinzufügen',
      properties: ['openFile'],
      filters: [
        { name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'] }
      ]
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    return incomingStore.createIncomingFromImage(requireProjectPath(), result.filePaths[0]);
  });

  ipcMain.handle('incoming:getImagePreview', (_event, id) =>
    incomingStore.getIncomingImagePreview(requireProjectPath(), id));

  ipcMain.handle('incoming:save', (_event, id, patch) =>
    incomingStore.saveIncoming(requireProjectPath(), id, patch));

  ipcMain.handle('incoming:delete', (_event, id) =>
    incomingStore.deleteIncoming(requireProjectPath(), id));
}

module.exports = { registerIncomingIpc };
