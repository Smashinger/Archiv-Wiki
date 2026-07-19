// preload.js — läuft in isolierter Context-Bridge-Umgebung (contextIsolation: true,
// sandbox: true). Die Renderer-Seite bekommt NIE direkten Zugriff auf ipcRenderer
// oder Node-APIs — nur auf die explizit hier definierten, benannten Funktionen.
//
// Weitere Kanäle werden in den kommenden Schritten ergänzt, z. B.:
//   - filesystem.* (Schritt 3: Dateisystem-Logik)
//   - editor.*     (Schritt 4: Editor-Funktionalität)
//   - search.*     (Schritt 6: Volltextsuche)
//   - exportApi.*  (Schritt 6: PDF/HTML/ZIP-Export)
//   - sync.*       (Schritt 6: Nextcloud/WebDAV)

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('archivAPI', {
  // --- App-Grundinfos ---
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatformInfo: () => ipcRenderer.invoke('app:getPlatformInfo'),

  // --- Native Dialoge (generisch) ---
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),

  // --- Setup-Wizard (Schritt 2) ---
  selectProjectFolder: () => ipcRenderer.invoke('wizard:selectProjectFolder'),
  selectBackupFolder: () => ipcRenderer.invoke('wizard:selectBackupFolder'),
  getDefaultBackupPath: () => ipcRenderer.invoke('wizard:getDefaultBackupPath'),
  isEncryptionAvailable: () => ipcRenderer.invoke('wizard:isEncryptionAvailable'),
  openExistingProject: (projectPath) => ipcRenderer.invoke('wizard:openExisting', projectPath),
  finishWizard: (payload) => ipcRenderer.invoke('wizard:finish', payload),

  // --- Aktuelles Projekt ---
  getCurrentProject: () => ipcRenderer.invoke('project:getCurrent'),

  // --- Export (Schritt 6): PDF/HTML pro Notiz, ZIP fürs ganze Projekt ---
  exportApi: {
    saveHtml: (html, suggestedName) => ipcRenderer.invoke('export:saveHtml', html, suggestedName),
    notePdf: (suggestedName) => ipcRenderer.invoke('export:notePdf', suggestedName),
    projectZip: () => ipcRenderer.invoke('export:projectZip')
  },

  // --- Sync (Schritt 6, Stufe 1): Verbindungstest + reiner Upload ---
  syncApi: {
    getSettings: () => ipcRenderer.invoke('sync:getSettings'),
    saveSettings: (settings) => ipcRenderer.invoke('sync:saveSettings', settings),
    savePassword: (password) => ipcRenderer.invoke('sync:savePassword', password),
    clearPassword: () => ipcRenderer.invoke('sync:clearPassword'),
    testConnection: (settings) => ipcRenderer.invoke('sync:testConnection', settings),
    uploadAll: (settings) => ipcRenderer.invoke('sync:uploadAll', settings),
    syncAll: (settings) => ipcRenderer.invoke('sync:syncAll', settings),
    resolveConflict: (payload) => ipcRenderer.invoke('sync:resolveConflict', payload),
    getAutoSyncSettings: () => ipcRenderer.invoke('sync:getAutoSyncSettings'),
    saveAutoSyncSettings: (settings) => ipcRenderer.invoke('sync:saveAutoSyncSettings', settings),
    getStatus: () => ipcRenderer.invoke('sync:getStatus'),
    onStatusUpdate: (callback) => {
      ipcRenderer.on('sync:statusUpdate', (_e, status) => callback(status));
    }
  },

  // --- Dateisystem (Schritt 3): Notizen, Kategorien, Papierkorb ---
  fs: {
    listTree: () => ipcRenderer.invoke('fs:listTree'),
    reorderChildren: (parentRelPath, orderedNames) => ipcRenderer.invoke('fs:reorderChildren', parentRelPath, orderedNames),
    getSearchDocuments: () => ipcRenderer.invoke('fs:getSearchDocuments'),
    createMainCategory: (name) => ipcRenderer.invoke('fs:createMainCategory', name),
    createSubCategory: (mainCategoryRelPath, name) => ipcRenderer.invoke('fs:createSubCategory', mainCategoryRelPath, name),
    createNote: (categoryRelPath, title) => ipcRenderer.invoke('fs:createNote', categoryRelPath, title),
    readNote: (relPath) => ipcRenderer.invoke('fs:readNote', relPath),
    writeNote: (relPath, body, frontmatterPatch) => ipcRenderer.invoke('fs:writeNote', relPath, body, frontmatterPatch),
    renameEntry: (relPath, newName) => ipcRenderer.invoke('fs:renameEntry', relPath, newName),
    moveEntry: (relPath, targetCategoryRelPath) => ipcRenderer.invoke('fs:moveEntry', relPath, targetCategoryRelPath),
    deleteEntry: (relPath) => ipcRenderer.invoke('fs:deleteEntry', relPath),
    listTrash: () => ipcRenderer.invoke('fs:listTrash'),
    restoreFromTrash: (trashRelPath) => ipcRenderer.invoke('fs:restoreFromTrash', trashRelPath),
    emptyTrash: () => ipcRenderer.invoke('fs:emptyTrash')
  },

  // --- Menü-Events (Main → Renderer) ---
  onMenuOpenProject: (callback) => {
    ipcRenderer.on('menu:open-project', () => callback());
  }
});
