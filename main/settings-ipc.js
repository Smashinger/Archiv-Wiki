// main/settings-ipc.js
// Der "Settings-Service": EINE zentrale Stelle, an der alle dauerhaften
// Projekt-Einstellungen gelesen und geschrieben werden. Ersetzt die vorher
// auf mehrere Dateien verteilten, je einzeln benannten Handler
// (fs:setProjectSetting, sync:saveSettings, sync:saveAutoSyncSettings) durch
// ZWEI generische Kanäle. Jede künftige Einstellung (Synchronisation,
// Plugins, Sprache, Tastenkürzel, ...) nutzt denselben Mechanismus — es muss
// dafür kein neuer, eigener IPC-Kanal mehr angelegt werden.

'use strict';

const { ipcMain, dialog } = require('electron');
const crypto = require('crypto');
const { readProjectConfig, writeProjectConfig } = require('./project');

// Verschachtelt zusammenführen (z. B. { editor: { tabSize: 4 } } lässt
// editor.autoSave unangetastet) — flache Object.assign würde stattdessen den
// ganzen "editor"-Unterbereich überschreiben.
function deepMerge(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] = (target[key] && typeof target[key] === 'object') ? target[key] : {};
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function registerSettingsIpc({ getCurrentProject, getMainWindow }) {
  function requireProjectPath() {
    const projectPath = getCurrentProject()?.path;
    if (!projectPath) throw new Error('Kein Projekt geöffnet.');
    return projectPath;
  }

  // Backup-Ordner-Auswahl fürs neue Einstellungsfenster — gleiches
  // Vordergrund-Vorgehen wie beim Wizard-Pendant (show+moveTop+focus, bewusst
  // OHNE setAlwaysOnTop, siehe dortiger Kommentar), nur mit dem Hauptfenster
  // statt dem Wizard-Fenster als Elternfenster.
  ipcMain.handle('settings:chooseBackupFolder', async () => {
    const win = getMainWindow?.();
    if (win) { win.show(); win.moveTop(); win.focus(); }
    const result = await dialog.showOpenDialog(win, {
      title: 'Backup-Ordner wählen',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // Liefert die komplette aktuelle Konfiguration — einzige Stelle, die das
  // Einstellungsfenster beim Öffnen sowie bei jedem erneuten Anzeigen abfragt.
  ipcMain.handle('settings:get', () => {
    const projectPath = requireProjectPath();
    return readProjectConfig(projectPath) || {};
  });

  // Nimmt ein TEILWEISES Objekt entgegen (nur die geänderten Felder, beliebig
  // verschachtelt, z. B. { editor: { tabSize: 4 } } oder { accentKey: 'blue' })
  // und führt es mit der bestehenden Konfiguration zusammen. Gibt die neue,
  // komplette Konfiguration zurück, damit der Aufrufer sie sofort live
  // anwenden kann, ohne ein zweites Mal nachzufragen.
  ipcMain.handle('settings:update', (_e, patch) => {
    const projectPath = requireProjectPath();
    const config = readProjectConfig(projectPath) || {};
    deepMerge(config, patch);
    writeProjectConfig(projectPath, config);
    return config;
  });

  // App-Passwortschutz: eigener Handler statt des generischen settings:update,
  // weil hier gehasht werden muss (nie das Klartext-Passwort speichern) — vorher
  // ließ sich das NUR einmalig im Wizard setzen, ohne jeden Weg zurück.
  // Leeres/kein Passwort übergeben → Schutz wird deaktiviert.
  ipcMain.handle('settings:setAppLockPassword', (_e, password) => {
    const projectPath = requireProjectPath();
    const config = readProjectConfig(projectPath) || {};
    if (password && password.trim()) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync(password, salt, 64).toString('hex');
      config.appLock = { enabled: true, salt, hash };
    } else {
      config.appLock = { enabled: false };
    }
    writeProjectConfig(projectPath, config);
    return config;
  });
}

module.exports = { registerSettingsIpc, deepMerge };
