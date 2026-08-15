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
  getBackupStatus: () => ipcRenderer.invoke('app:getBackupStatus'),
  runBackupNow: () => ipcRenderer.invoke('app:runBackupNow'),
  openBackupFolder: () => ipcRenderer.invoke('app:openBackupFolder'),
  onBackupStatusUpdated: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('backup:statusUpdated', listener);
    return () => ipcRenderer.removeListener('backup:statusUpdated', listener);
  },
  moveProjectFolder: () => ipcRenderer.invoke('app:moveProjectFolder'),
  getUpdateStatus: () => ipcRenderer.invoke('app:getUpdateStatus'),
  checkForUpdate: () => ipcRenderer.invoke('app:checkForUpdate'),
  // Automatisches Update-System (Nutzer-Feature) — Download/Installation
  // sowie die zugehörigen Einstellungen und Ereignis-Kanäle.
  downloadUpdate: () => ipcRenderer.invoke('app:downloadUpdate'),
  installUpdateAndRestart: () => ipcRenderer.invoke('app:installUpdateAndRestart'),
  getUpdateSettings: () => ipcRenderer.invoke('app:getUpdateSettings'),
  setUpdateSetting: (key, value) => ipcRenderer.invoke('app:setUpdateSetting', key, value),
  onUpdateAvailable: (callback) => { ipcRenderer.on('update:available', (_e, info) => callback(info)); },
  onUpdateDownloadProgress: (callback) => { ipcRenderer.on('update:download-progress', (_e, progress) => callback(progress)); },
  onUpdateDownloaded: (callback) => { ipcRenderer.on('update:downloaded', () => callback()); },
  onUpdateError: (callback) => { ipcRenderer.on('update:error', (_e, info) => callback(info)); },
  onUpdateStatusChanged: (callback) => {
    const listener = (_e, status) => callback(status);
    ipcRenderer.on('update:statusChanged', listener);
    return () => ipcRenderer.removeListener('update:statusChanged', listener);
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch),
    setAppLockPassword: (password) => ipcRenderer.invoke('settings:setAppLockPassword', password)
  },
  webClipper: {
    getStatus: () => ipcRenderer.invoke('app:getWebClipperStatus'),
    installBrave: () => ipcRenderer.invoke('webclip:installBrave'),
    // M15: getrennt vom CRX-Installationsschritt — read-only Statusabfrage
    // sowie der explizit zustimmungspflichtige Berechtigungsweg für die
    // Brave-Flatpak-Native-Messaging-Freigabe (org.freedesktop.Flatpak).
    getBraveFlatpakPermissionStatus: () => ipcRenderer.invoke('webclip:getBraveFlatpakPermissionStatus'),
    grantBraveFlatpakPermission: () => ipcRenderer.invoke('webclip:grantBraveFlatpakPermission'),
    revokeBraveFlatpakPermission: () => ipcRenderer.invoke('webclip:revokeBraveFlatpakPermission'),
    onStatusUpdated: (callback) => {
      const listener = (_event, status) => callback(status);
      ipcRenderer.on('webclip:statusUpdated', listener);
      return () => ipcRenderer.removeListener('webclip:statusUpdated', listener);
    }
  },
  chooseBackupFolder: () => ipcRenderer.invoke('settings:chooseBackupFolder'),
  validateBackupFolder: (backupPath) => ipcRenderer.invoke('settings:validateBackupFolder', backupPath),
  verifyAppLock: (password) => ipcRenderer.invoke('app:verifyAppLock', password),

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
    saveMarkdown: (markdown, suggestedName) => ipcRenderer.invoke('export:saveMarkdown', markdown, suggestedName),
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
    getHistory: () => ipcRenderer.invoke('sync:getHistory'),
    onStatusUpdate: (callback) => {
      ipcRenderer.on('sync:statusUpdate', (_e, status) => callback(status));
    }
  },

  // --- Eingang: projektbezogene, vom Notizspeicher getrennte Ablage ---
  incoming: {
    load: () => ipcRenderer.invoke('incoming:list'),
    get: (id) => ipcRenderer.invoke('incoming:get', id),
    create: (data) => ipcRenderer.invoke('incoming:create', data),
    receiveWebClip: (data) => ipcRenderer.invoke('incoming:receiveWebClip', data),
    // Kompatibilitätsname aus Q-012.5.1; beide Wege nutzen denselben IPC-Kanal.
    createWebpage: (data) => ipcRenderer.invoke('incoming:receiveWebClip', data),
    addFile: () => ipcRenderer.invoke('incoming:addFile'),
    addImage: () => ipcRenderer.invoke('incoming:addImage'),
    getImagePreview: (id) => ipcRenderer.invoke('incoming:getImagePreview', id),
    save: (id, patch) => ipcRenderer.invoke('incoming:save', id, patch),
    delete: (id) => ipcRenderer.invoke('incoming:delete', id),
    onCreated: (callback) => {
      const listener = (_event, entry) => callback(entry);
      ipcRenderer.on('incoming:created', listener);
      return () => ipcRenderer.removeListener('incoming:created', listener);
    }
  },

  // --- Dateisystem (Schritt 3): Notizen, Kategorien, Papierkorb ---
  fs: {
    listTree: () => ipcRenderer.invoke('fs:listTree'),
    reorderChildren: (parentRelPath, orderedNames) => ipcRenderer.invoke('fs:reorderChildren', parentRelPath, orderedNames),
    setCategoryIcon: (relPath, icon) => ipcRenderer.invoke('fs:setCategoryIcon', relPath, icon),
    setProjectSetting: (key, value) => ipcRenderer.invoke('fs:setProjectSetting', key, value),
    saveAttachment: (fileName, data) => ipcRenderer.invoke('fs:saveAttachment', fileName, data),
    deleteAttachment: (fileName) => ipcRenderer.invoke('fs:deleteAttachment', fileName),
    getSearchDocuments: () => ipcRenderer.invoke('fs:getSearchDocuments'),
    createMainCategory: (name) => ipcRenderer.invoke('fs:createMainCategory', name),
    createSubCategory: (mainCategoryRelPath, name) => ipcRenderer.invoke('fs:createSubCategory', mainCategoryRelPath, name),
    createNote: (categoryRelPath, title, templateBody, options) => ipcRenderer.invoke('fs:createNote', categoryRelPath, title, templateBody, options),
    readNote: (relPath) => ipcRenderer.invoke('fs:readNote', relPath),
    writeNote: (relPath, body, frontmatterPatch, expectedVersion) => ipcRenderer.invoke('fs:writeNote', relPath, body, frontmatterPatch, expectedVersion),
    renameEntry: (relPath, newName) => ipcRenderer.invoke('fs:renameEntry', relPath, newName),
    moveEntry: (relPath, targetCategoryRelPath) => ipcRenderer.invoke('fs:moveEntry', relPath, targetCategoryRelPath),
    deleteEntry: (relPath) => ipcRenderer.invoke('fs:deleteEntry', relPath),
    listTrash: () => ipcRenderer.invoke('fs:listTrash'),
    restoreFromTrash: (trashRelPath) => ipcRenderer.invoke('fs:restoreFromTrash', trashRelPath),
    emptyTrash: () => ipcRenderer.invoke('fs:emptyTrash')
  },

  getCloseBehavior: () => ipcRenderer.invoke('app:getCloseBehavior'),

  // Zentrale Zwischenablage-API (Nutzer-Meldung: Kopieren/Ausschneiden/
  // Einfügen über das Rechtsklick-Menü unzuverlässig, besonders Einfügen aus
  // anderen Programmen) — WICHTIGER BUGFIX: Electrons clipboard-Modul direkt
  // hier im Preload-Skript zu verwenden (frühere Fassung) funktioniert unter
  // sandbox:true NICHT (real mit Electron 28.3.3 getestet: clipboard ist im
  // sandboxten Preload schlicht undefined) — deshalb jetzt per IPC an den
  // Hauptprozess weitergereicht, wo das Modul unabhängig von der Sandbox-
  // Einstellung immer verfügbar ist (siehe main.js).
  clipboard: {
    writeText: (text) => ipcRenderer.invoke('clipboard:writeText', text),
    readText: () => ipcRenderer.invoke('clipboard:readText')
  },
  setCloseBehavior: (value) => ipcRenderer.invoke('app:setCloseBehavior', value),
  resolveCloseDialog: (result) => ipcRenderer.invoke('app:resolveCloseDialog', result),

  // Rechtschreibprüfung (Nutzer-Feature) — An-/Abschalten der Wellenlinien
  // über die Einstellungen.
  setSpellCheckEnabled: (enabled) => ipcRenderer.invoke('app:setSpellCheckEnabled', enabled),
  getSpellCheckEnabled: () => ipcRenderer.invoke('app:getSpellCheckEnabled'),

  // --- Menü-/Tray-Events (Main → Renderer) ---
  onMenuOpenProject: (callback) => {
    ipcRenderer.on('menu:open-project', () => callback());
  },
  onShowCloseDialog: (callback) => {
    ipcRenderer.on('app:show-close-dialog', () => callback());
  },
  onGoHome: (callback) => {
    ipcRenderer.on('menu:go-home', () => callback());
  },
  onCheckForUpdatesRequested: (callback) => {
    ipcRenderer.on('menu:check-for-updates', () => callback());
  },
  onOpenSettingsRequested: (callback) => {
    ipcRenderer.on('menu:open-settings', () => callback());
  },
  onShowShortcutsRequested: (callback) => {
    ipcRenderer.on('menu:show-shortcuts', () => callback());
  }
});
