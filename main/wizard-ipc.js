// main/wizard-ipc.js
// Registriert alle IPC-Kanäle, die der Setup-Wizard (renderer/wizard.html)
// braucht. Bekommt per Dependency Injection Zugriff auf das aktuelle
// Wizard-Fenster (für Dialog-Parent) und einen Callback, der aufgerufen wird,
// sobald ein Projekt fertig eingerichtet bzw. ein bestehendes geöffnet wurde.

'use strict';

const { ipcMain, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {
  isDirWritable,
  hasExistingConfig,
  readProjectConfig,
  writeProjectConfig,
  defaultBackupPath,
  TRASH_DIRNAME
} = require('./project');
const { writeAppState } = require('./app-state');
const { savePasswordForProject } = require('./sync-ipc');

function registerWizardIpc({ getWizardWindow, onProjectReady }) {
  // Für die "Passwort merken"-Checkbox im Wizard: dasselbe safeStorage wie in
  // main/sync-ipc.js, aber projektunabhängig abfragbar (es gibt zu diesem
  // Zeitpunkt noch kein "aktuelles Projekt").
  ipcMain.handle('wizard:isEncryptionAvailable', () => safeStorage.isEncryptionAvailable());

  // Schritt 1 des Wizards: Projektordner wählen + prüfen
  ipcMain.handle('wizard:selectProjectFolder', async () => {
    const win = getWizardWindow();
    if (win) { win.show(); win.moveTop(); win.focus(); }
    const result = await dialog.showOpenDialog(win, {
      title: 'Speicherort für dein neues Archiv Wiki-Projekt wählen',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const folder = result.filePaths[0];
    return {
      path: folder,
      writable: isDirWritable(folder),
      alreadyConfigured: hasExistingConfig(folder)
    };
  });

  // Schritt 2 des Wizards: optionalen eigenen Backup-Pfad wählen
  ipcMain.handle('wizard:selectBackupFolder', async () => {
    // Best-effort gegen "Dialog öffnet im Hintergrund": show() holt das
    // Fenster aus einem eventuell minimierten Zustand, moveTop() hebt es im
    // Z-Order nach vorne, erst danach der Dialog selbst. WICHTIG (per
    // Nutzer-Rückmeldung gelernt): KEIN setAlwaysOnTop verwenden — das fixiert
    // das Wizard-Fenster dauerhaft ganz oben und blockiert dadurch den
    // Dialog selbst, der dann nicht mehr bedienbar hinter ihm feststeckt.
    // Auf manchen Linux-Fenstermanagern bleibt "automatisch nach vorne"
    // letztlich trotzdem eine Entscheidung des Fenstermanagers, nicht zu
    // 100% von der App erzwingbar.
    const win = getWizardWindow();
    if (win) { win.show(); win.moveTop(); win.focus(); }
    const result = await dialog.showOpenDialog(win, {
      title: 'Backup-Ordner wählen',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('wizard:getDefaultBackupPath', () => defaultBackupPath());

  // Bereits vorhandenes Projekt direkt öffnen (Ordner enthält schon .wiki-config.json)
  ipcMain.handle('wizard:openExisting', async (_event, projectPath) => {
    const config = readProjectConfig(projectPath);
    if (!config) {
      throw new Error('In diesem Ordner wurde keine gültige .wiki-config.json gefunden.');
    }
    writeAppState({ lastProjectPath: projectPath });
    onProjectReady(projectPath, config);
    return { ok: true };
  });

  // Neues Projekt anlegen: .wiki-config.json + .wiki-trash/ + Backup-Ordner erzeugen
  ipcMain.handle('wizard:finish', async (_event, payload) => {
    const { projectPath, editorConfig, wikiName, accentKey, appLockPassword, backupPath, sync, password, rememberPassword, windowStartBehavior } = payload || {};

    if (!projectPath || !isDirWritable(projectPath)) {
      throw new Error('Projektordner fehlt oder ist nicht beschreibbar.');
    }

    const resolvedBackupPath = backupPath || defaultBackupPath();

    // App-Passwortschutz: NIE im Klartext gespeichert — nur Salt (zufällig,
    // pro Projekt einmalig) + Hash (scrypt, Node-eingebaut, kein zusätzliches
    // npm-Paket nötig). Beim Entsperren wird derselbe Hash erneut berechnet
    // und verglichen (siehe app:verifyAppLock in main.js), das Passwort selbst
    // verlässt den Speicher-Vorgang nie.
    let appLock = { enabled: false };
    if (appLockPassword && appLockPassword.trim()) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync(appLockPassword, salt, 64).toString('hex');
      appLock = { enabled: true, salt, hash };
    }

    const config = {
      version: '1.0.0',
      created: new Date().toISOString(),
      wikiName: (wikiName || '').trim(),
      accentKey: accentKey || 'orange',
      appLock,
      editor: editorConfig || {},
      backupPath: resolvedBackupPath,
      sync: sync || { enabled: false }
    };

    writeProjectConfig(projectPath, config);
    fs.mkdirSync(path.join(projectPath, TRASH_DIRNAME), { recursive: true });
    fs.mkdirSync(resolvedBackupPath, { recursive: true });

    // Passwort erst JETZT sicher speichern — der projectPath steht jetzt
    // endgültig fest (vorher, während des Wizard-Ausfüllens, gab es noch kein
    // "aktuelles Projekt", über das main/sync-ipc.js das sonst abwickelt).
    if (rememberPassword && password) {
      try { savePasswordForProject(projectPath, password); }
      catch (err) { console.error('[Archiv Wiki] Passwort konnte im Wizard nicht gespeichert werden:', err.message); }
    }

    const allowedWindowStartBehaviors = new Set(['maximized', 'restore', 'centered']);
    writeAppState({
      lastProjectPath: projectPath,
      windowStartBehavior: allowedWindowStartBehaviors.has(windowStartBehavior) ? windowStartBehavior : 'maximized'
    });
    onProjectReady(projectPath, config);
    return { ok: true };
  });
}

module.exports = { registerWizardIpc };
