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
  requireProjectConfig,
  writeProjectConfig,
  defaultBackupPath,
  TRASH_DIRNAME
} = require('./project');
const { validateBackupDestinationAccess } = require('./backup');
const { writeAppState } = require('./app-state');
const { savePasswordForProject } = require('./sync-ipc');

// Prüft den gewählten Projektordner für die drei PRÜFUNG-Zeilen in Schritt 1:
// Schreibrechte, Ordner leer, freier Speicherplatz. Reine Lesezugriffe, kein
// Schreiben in den Ordner.
function inspectProjectFolder(folder) {
  const writable = isDirWritable(folder);
  const alreadyConfigured = hasExistingConfig(folder);

  let empty = null;
  let entryCount = null;
  try {
    const entries = fs.readdirSync(folder);
    entryCount = entries.length;
    empty = entries.length === 0;
  } catch { /* nicht lesbar → unbekannt */ }

  let freeBytes = null;
  try {
    const st = fs.statfsSync(folder);
    freeBytes = st.bavail * st.bsize;
  } catch { /* statfs nicht verfügbar → unbekannt */ }

  return { path: folder, writable, alreadyConfigured, empty, entryCount, freeBytes };
}

// App-Passwortschutz: vertrauenswürdige Ableitung aus dem (untrusted) Payload.
// Ist der Schutz aus, entsteht NIE ein Passwort. Ist er an, muss ein nicht
// leeres Passwort vorliegen und die Wiederholung exakt übereinstimmen; sonst
// wird geworfen (auch bei manipuliertem/gefälschtem Payload). Gespeichert wird
// nur Salt + scrypt-Hash, nie Klartext.
function buildAppLock({ appLockEnabled, appLockPassword, appLockPasswordConfirm } = {}) {
  if (appLockEnabled !== true) return { enabled: false };
  const pw = typeof appLockPassword === 'string' ? appLockPassword : '';
  const confirm = typeof appLockPasswordConfirm === 'string' ? appLockPasswordConfirm : '';
  if (!pw) {
    throw new Error('Bitte ein Passwort eingeben oder den Passwortschutz ausschalten.');
  }
  if (pw !== confirm) {
    throw new Error('Die beiden Passwörter stimmen nicht überein.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return { enabled: true, salt, hash };
}

// Editor-Standardwerte bleiben unverändert, obwohl Tab-Größe/Auto-Save aus dem
// Assistenten entfernt wurden: fehlende Werte fallen auf die bisherigen
// Vorgaben zurück (Tab 2, Auto-Save 30 s).
function resolveEditorConfig(editorConfig) {
  const incoming = (editorConfig && typeof editorConfig === 'object') ? editorConfig : {};
  return { tabSize: 2, autoSave: 30, ...incoming };
}

// Übernimmt aus dem (untrusted) Sync-Objekt NUR die bekannten Felder in die
// Projektkonfiguration — niemals ein Klartext-Passwort o. Ä. Der automatische
// Abgleich darf nur dann als aktiv gespeichert werden, wenn die Zugangsdaten
// tatsächlich sicher abgelegt wurden (credentialsStored). Die Verbindung selbst
// bleibt bis nach der Einrichtung inaktiv (enabled:false).
function sanitizeSyncConfig(rawSync, credentialsStored) {
  const s = (rawSync && typeof rawSync === 'object') ? rawSync : {};
  const url = typeof s.url === 'string' ? s.url.trim() : '';
  if (!url) return { enabled: false };
  const username = typeof s.username === 'string' ? s.username : '';
  const rawAuto = (s.autoSync && typeof s.autoSync === 'object') ? s.autoSync : {};
  const parsedInterval = Number(rawAuto.intervalMinutes);
  const intervalMinutes = Number.isFinite(parsedInterval) && parsedInterval > 0 ? parsedInterval : 15;
  const autoEnabled = Boolean(rawAuto.enabled) && Boolean(credentialsStored);
  return {
    enabled: false,
    url,
    username,
    autoSync: { enabled: autoEnabled, intervalMinutes }
  };
}

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
    return inspectProjectFolder(folder);
  });

  // Fenstersteuerung der eigenen (rahmenlosen) Titelleiste des Wizards.
  ipcMain.handle('wizard:minimize', () => { getWizardWindow()?.minimize(); });
  ipcMain.handle('wizard:close', () => { getWizardWindow()?.close(); });
  // Rahmenloses Fenster exakt an die gemessene Inhaltshöhe anpassen — so
  // scrollt der Assistent nie und wächst bei größerer Schrift/Übersetzung mit
  // (siehe Spezifikation: min-height statt height, Inhaltszeile "auto").
  ipcMain.handle('wizard:resizeToContent', (_event, height) => {
    const win = getWizardWindow();
    if (!win) return;
    const h = Math.max(600, Math.min(1000, Math.round(Number(height) || 0)));
    const [w] = win.getContentSize();
    win.setContentSize(w, h);
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
    const config = requireProjectConfig(projectPath);
    writeAppState({ lastProjectPath: projectPath });
    onProjectReady(projectPath, config);
    return { ok: true };
  });

  // Neues Projekt anlegen: .wiki-config.json + .wiki-trash/ + Backup-Ordner erzeugen
  ipcMain.handle('wizard:finish', async (_event, payload) => {
    const { projectPath, editorConfig, wikiName, accentKey, customAccentColor, appLockEnabled, appLockPassword, appLockPasswordConfirm, backupPath, sync, password, rememberPassword } = payload || {};

    if (!projectPath || !isDirWritable(projectPath)) {
      throw new Error('Projektordner fehlt oder ist nicht beschreibbar.');
    }

    // App-Passwortschutz (vertrauenswürdige Validierung im Hauptprozess):
    // NICHT nur auf die Renderer-Prüfung verlassen. Bewusst VOR jeder
    // Dateisystem-Änderung, damit ein Validierungsfehler keinen halb
    // angelegten Projektordner hinterlässt (Commit bleibt writeProjectConfig).
    const appLock = buildAppLock({ appLockEnabled, appLockPassword, appLockPasswordConfirm });

    const resolvedBackupPath = backupPath || defaultBackupPath();

    // Setup-Commit-Reihenfolge (Audit-Punkt CLEAN-001/CLEAN-002): ALLE
    // vorbereitenden, potenziell fehlschlagenden Schritte laufen vor dem
    // eigentlichen Commit (.wiki-config.json). Existenz dieser Datei ist
    // andernorts (hasExistingConfig/isValidProject) das alleinige Kriterium
    // für "Projekt fertig eingerichtet" — sie darf deshalb erst entstehen,
    // wenn Papierkorb und Backup-Ziel bereits nachweislich verfügbar sind.
    // Schlägt einer dieser Schritte fehl, bleibt der Ordner unkonfiguriert
    // und der Wizard bleibt für einen erneuten Versuch nutzbar, statt ein
    // scheinbar fertiges Teilprojekt zu hinterlassen.
    const backupAccess = validateBackupDestinationAccess(projectPath, resolvedBackupPath);
    if (!backupAccess.valid) {
      throw new Error(backupAccess.message || 'Der gewählte Backup-Ordner ist nicht verwendbar.');
    }
    fs.mkdirSync(path.join(projectPath, TRASH_DIRNAME), { recursive: true });

    const editor = resolveEditorConfig(editorConfig);

    // Zugangsdaten VOR dem Commit sicher ablegen — nur dann darf der
    // automatische Abgleich als aktiv gespeichert werden. So kann die
    // Konfiguration nie "Auto-Sync an" behaupten, ohne dass die Zugangsdaten
    // wirklich im Schlüsselbund liegen. Ein Fehlschlag hier bricht die
    // Einrichtung NICHT ab (lokales Wiki bleibt möglich), führt aber dazu, dass
    // Auto-Sync nicht aktiviert wird.
    let credentialsStored = false;
    if (rememberPassword && password) {
      if (!safeStorage.isEncryptionAvailable()) {
        console.warn('[Archiv Wiki] Kein Schlüsselbund verfügbar — Zugangsdaten werden nicht gespeichert, Auto-Sync bleibt aus.');
      } else {
        try { savePasswordForProject(projectPath, password); credentialsStored = true; }
        catch (err) { console.error('[Archiv Wiki] Passwort konnte im Wizard nicht gespeichert werden:', err.message); }
      }
    }

    const config = {
      version: '1.0.0',
      created: new Date().toISOString(),
      wikiName: (wikiName || '').trim(),
      accentKey: accentKey || 'orange',
      appLock,
      editor,
      backupPath: resolvedBackupPath,
      sync: sanitizeSyncConfig(sync, credentialsStored)
    };
    // Eigene (freie) Akzentfarbe nur speichern, wenn accentKey='custom' UND ein
    // gültiger Hex-Wert vorliegt — dieselbe Form wie im Einstellungsfenster
    // (config.customAccentColor, siehe resolveAccentForActiveDesign in app.js).
    if (config.accentKey === 'custom' && /^#[0-9a-fA-F]{6}$/.test(String(customAccentColor || ''))) {
      config.customAccentColor = customAccentColor;
    }

    // Commit-Punkt: ab hier gilt der Ordner als fertig eingerichtetes Projekt.
    const persistedConfig = writeProjectConfig(projectPath, config, { create: true });

    // Fenster-Startverhalten wird bewusst NICHT mehr hier gesetzt — es liegt
    // jetzt ausschließlich in den normalen Einstellungen (Allgemein →
    // Startverhalten) und hat dort seinen eigenen, validierten Standard.
    writeAppState({ lastProjectPath: projectPath });
    onProjectReady(projectPath, persistedConfig);
    return { ok: true };
  });
}

module.exports = { registerWizardIpc, buildAppLock, resolveEditorConfig, sanitizeSyncConfig, inspectProjectFolder };
