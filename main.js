// main.js — Electron Main Process
// Schritt 1: Grundstruktur (sicheres Fenster, Preload, Menü, Basis-IPC).
// Schritt 2: Setup-Wizard-Boot-Logik (Wizard vs. bekanntes Projekt), siehe
// main/app-state.js, main/project.js, main/wizard-ipc.js.
// Schritt 3: Dateisystem-IPC (main/notes-fs.js, main/filesystem-ipc.js).
// Editor, Suche und Export folgen in den nächsten Schritten als eigene Module.

'use strict';

const { app, BrowserWindow, Menu, ipcMain, dialog, shell, Tray } = require('electron');
const https = require('https');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { readAppState, writeAppState } = require('./main/app-state');
const { isValidProject, readProjectConfig } = require('./main/project');
const { registerWizardIpc } = require('./main/wizard-ipc');
const { registerFilesystemIpc } = require('./main/filesystem-ipc');
const { registerExportIpc, exportProjectZip } = require('./main/export-ipc');
const { registerSyncIpc, isSyncInProgress } = require('./main/sync-ipc');
const { registerSettingsIpc } = require('./main/settings-ipc');
const { maybeRunAutoBackup, nextScheduledBackup, backupFileNameFor, isBackupInProgress } = require('./main/backup');

const isDev = process.argv.includes('--dev');

// Bugfix (Nutzer-Meldung: gebaute AppImage startete ohne jede sichtbare
// Fehlermeldung nicht mehr): native Bild-Ladefunktionen (Tray(), das
// icon:-Feld von BrowserWindow) lesen NICHT über Electrons für fs.* gepatchte
// ASAR-Virtualisierung, sondern greifen direkt aufs Dateisystem zu — ein Pfad
// wie ".../app.asar/assets/icons/32x32.png" existiert für sie schlicht nicht.
// asarUnpack (siehe package.json) legt diese Dateien zusätzlich in einem
// echten ".../app.asar.unpacked/..."-Ordner ab; hier wird für genau diese
// nativen Ladefunktionen dorthin umgeleitet. Im Entwicklungsmodus (kein
// ASAR vorhanden) bleibt der Pfad unverändert.
function resolveNativeAssetPath(relativePath) {
  const fullPath = path.join(__dirname, relativePath);
  return fullPath.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
}

// Im Entwicklungs-/Test-Modus einen komplett eigenen Speicherort für alles,
// was sich die App SELBST merkt (zuletzt geöffnetes Projekt, Sync-Zugangs-
// daten, Backup-Status) — sonst teilen sich Test-Version und "echte" Version
// genau diese wichtigen Dinge. WICHTIG (per Nutzer-Test entdeckt): das reine
// "--user-data-dir=..."-Flag beim Start reicht dafür NICHT aus — das
// betrifft nur den Chromium-eigenen Teil (Cache, Cookies, Sessions), nicht
// das, was Electron selbst über app.getPath('userData') verwaltet (genau
// dort landen app-state.json und sync-credentials.json, siehe
// main/app-state.js). Deshalb hier zusätzlich explizit im Code umgeleitet,
// auf denselben Ordner, den das CLI-Flag ohnehin schon anlegt — beides landet
// dadurch konsolidiert an einem einzigen, bereits bekannten Ort.
if (isDev) {
  app.setPath('userData', path.join(app.getPath('home'), '.archiv-wiki-dev-settings'));
}

// ---------------------------------------------------------------------------
// Start-Diagnose: zeigt IMMER im Terminal, aus welchem Ordner main.js läuft
// und ob renderer/index.html dort gefunden wird. Spart bei falsch entpackten
// oder verschobenen Projektordnern das Rätselraten.
// ---------------------------------------------------------------------------
const rendererIndexPath = path.join(__dirname, 'renderer', 'index.html');
const rendererWizardPath = path.join(__dirname, 'renderer', 'wizard.html');
console.log(`[Archiv Wiki] App-Verzeichnis (__dirname): ${__dirname}`);
console.log(`[Archiv Wiki] Suche renderer/index.html unter: ${rendererIndexPath}`);
if (!fs.existsSync(rendererIndexPath)) {
  console.error(
    `[Archiv Wiki] FEHLER: Datei nicht gefunden! ` +
    `Prüfe, ob der komplette Projektordner (inkl. renderer/-Unterordner) ` +
    `korrekt an diesem Ort liegt: ${__dirname}`
  );
} else {
  console.log('[Archiv Wiki] renderer/index.html gefunden ✓');
}

// ---------------------------------------------------------------------------
// Single Instance Lock — verhindert, dass Archiv Wiki mehrfach parallel läuft
// und dadurch dieselben Wiki-Dateien gleichzeitig beschreibt.
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

/** @type {BrowserWindow | null} */
let mainWindow = null;
let tray = null;
// Variante 1 (Nutzer-Entscheidung): X schließt die App nicht wirklich, sie
// läuft im Hintergrund weiter (Tray-Symbol), wie bei Discord/Slack üblich.
// isQuitting unterscheidet "X geklickt" (nur verstecken) von "wirklich
// beenden" (z. B. über das Tray-Menü, Strg+Q, oder das Anwendungsmenü).
let isQuitting = false;
/** @type {BrowserWindow | null} */
let wizardWindow = null;
/** Aktuell offenes Projekt (gesetzt sobald Wizard fertig ist oder ein
 *  bestehendes Projekt beim Start automatisch geladen wird). */
let currentProject = { path: null, config: null };

// ---------------------------------------------------------------------------
// Fenster-Erstellung
// ---------------------------------------------------------------------------
function createWizardWindow() {
  wizardWindow = new BrowserWindow({
    width: 820,
    height: 760,
    resizable: false,
    show: false,
    backgroundColor: '#0a0d12',
    icon: resolveNativeAssetPath('assets/icons/512x512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  wizardWindow.once('ready-to-show', () => wizardWindow.show());
  wizardWindow.loadFile(rendererWizardPath);
  if (isDev) wizardWindow.webContents.openDevTools({ mode: 'detach' });

  wizardWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Wenn der Wizard geschlossen wird, OHNE dass ein Projekt fertig eingerichtet
  // wurde (kein Hauptfenster existiert), gibt es nichts mehr zu tun → App beenden.
  wizardWindow.on('closed', () => {
    wizardWindow = null;
    if (!mainWindow) app.quit();
  });
}

// Wird aufgerufen, sobald der Wizard ein Projekt fertig eingerichtet ODER ein
// bestehendes geöffnet hat. Reihenfolge wichtig: erst Hauptfenster erzeugen,
// DANN den Wizard schließen — sonst würde obiger 'closed'-Handler die App
// fälschlich beenden, weil mainWindow in dem Moment noch null wäre.
function handleProjectReady(projectPath, config) {
  console.log(`[Archiv Wiki] Projekt bereit: ${projectPath}`);
  currentProject = { path: projectPath, config };
  createMainWindow();
  if (wizardWindow) {
    wizardWindow.close();
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false, // erst zeigen, wenn Inhalt bereit ist (kein weißer Blitz)
    backgroundColor: '#0a0d12', // Dark-Theme-Hintergrund aus main.css
    autoHideMenuBar: false,
    icon: resolveNativeAssetPath('assets/icons/512x512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });

  mainWindow.once('ready-to-show', () => { mainWindow.show(); mainWindow.focus(); });

  // Ladefehler NIE stillschweigend verschlucken — im Terminal sichtbar machen.
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[Archiv Wiki] Ladefehler (${code}) ${desc} — ${url}`);
  });
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (isDev) console.log(`[Renderer] ${message} (${sourceId}:${line})`);
  });

  mainWindow.loadFile(rendererIndexPath);

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });

  // Externe Links immer im System-Browser öffnen, nie im App-Fenster
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Zentrale Schließen-Logik (löst das vorherige feste "immer minimieren"
  // ab): liest die gespeicherte Einstellung (main/close-behavior.js) und
  // entscheidet, ob gefragt, minimiert oder wirklich beendet wird. isQuitting
  // bleibt die Ausnahme für "wirklich beenden" (Tray-Menü, Strg+Q, usw.).
  // Vorläufig (Nutzer-Anforderung nach dem Tray-Icon-Absturz): normales
  // Schließen statt Nachfragen/Minimieren — bis das Tray-Symbol nachweislich
  // zuverlässig lädt, sonst könnte ein Fenster ohne jede Möglichkeit zum
  // Wiederherstellen im Hintergrund verschwinden. handleCloseRequest() bleibt
  // vollständig erhalten (siehe unten) — Reaktivierung ist nur diese eine
  // Zeile: `if (isQuitting) return; e.preventDefault(); handleCloseRequest();`
  mainWindow.on('closed', () => { mainWindow = null; });
}

// Einzige Stelle, an der "X geklickt" ausgewertet wird — Tray-Menü,
// Anwendungsmenü "Beenden" und Strg+Q laufen NICHT hierüber (die wollen ja
// immer wirklich beenden), sondern setzen direkt isQuitting. Nur der
// eigentliche Fenster-X-Klick ist mehrdeutig und braucht diese Prüfung.
function handleCloseRequest() {
  const behavior = readAppState().closeBehavior || 'ask';
  if (behavior === 'tray') { mainWindow.hide(); return; }
  if (behavior === 'quit') { quitCleanly(); return; }
  // 'ask' (Standard): Renderer zeigt den Auswahl-Dialog, Antwort kommt über
  // den 'app:resolveCloseDialog'-Kanal weiter unten zurück.
  mainWindow.webContents.send('app:show-close-dialog');
}

// Sauberes Beenden (Nutzer-Anforderung): falls GERADE ein Backup oder
// Cloud-Abgleich läuft, kurz darauf warten statt mitten drin abzuwürgen —
// beides sind bei uns kurze, in sich abgeschlossene Vorgänge (kein dauerhaft
// offener Verbindungs-Zustand), ein kurzes Warten reicht dafür aus.
async function quitCleanly() {
  const start = Date.now();
  while ((isBackupInProgress() || isSyncInProgress()) && Date.now() - start < 5000) {
    await new Promise(r => setTimeout(r, 100));
  }
  isQuitting = true;
  app.quit();
}

// ---------------------------------------------------------------------------
// Hinweis Content-Security-Policy:
// Wird bewusst NICHT hier über session.webRequest.onHeadersReceived gesetzt —
// das funktioniert bei mit loadFile() geladenen file://-Seiten unzuverlässig
// (und hat in Schritt 1 genau deshalb die App leer aussehen lassen). Die CSP
// steht stattdessen direkt als <meta>-Tag in den renderer/*.html-Dateien, wie
// von Electron für lokale Apps empfohlen.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Anwendungsmenü (Deutsch)
// ---------------------------------------------------------------------------
function buildMenu() {
  const template = [
    {
      label: 'Datei',
      submenu: [
        {
          label: 'Projektordner öffnen …',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            // TODO Schritt 4/5: echte "bestehendes Projekt wechseln"-Logik
            // (aktuell öffnet nur der Wizard beim allerersten Start ein Projekt).
            mainWindow?.webContents.send('menu:open-project');
          }
        },
        { type: 'separator' },
        {
          label: 'Projekt als ZIP exportieren …',
          click: async () => {
            try {
              const result = await exportProjectZip({ getCurrentProject: () => currentProject, getMainWindow: () => mainWindow });
              if (result.saved) {
                dialog.showMessageBox(mainWindow, { type: 'info', title: 'Export fertig', message: 'Projekt wurde als ZIP exportiert:\n' + result.filePath });
              }
            } catch (err) {
              dialog.showErrorBox('Export fehlgeschlagen', err.message);
            }
          }
        },
        { type: 'separator' },
        { label: 'Beenden', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'Bearbeiten',
      submenu: [
        { role: 'undo', label: 'Rückgängig' },
        { role: 'redo', label: 'Wiederholen' },
        { type: 'separator' },
        { role: 'cut', label: 'Ausschneiden' },
        { role: 'copy', label: 'Kopieren' },
        { role: 'paste', label: 'Einfügen' },
        { role: 'selectAll', label: 'Alles auswählen' }
      ]
    },
    {
      label: 'Ansicht',
      submenu: [
        { role: 'reload', label: 'Neu laden' },
        { role: 'toggleDevTools', label: 'Entwicklertools' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Vollbild' }
      ]
    },
    {
      label: 'Hilfe',
      submenu: [
        {
          label: 'Über Archiv Wiki',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Über Archiv Wiki',
              message: 'Archiv Wiki',
              detail: `Version ${app.getVersion()}\nAutor: Smashinger\nLizenz: MIT`
            });
          }
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// IPC — Kern-Kanäle (App-Info, generischer Dialog, aktuelles Projekt).
// Dateisystem-Kanäle stehen in main/filesystem-ipc.js, Wizard-Kanäle in
// main/wizard-ipc.js. Suche/Export/Sync kommen in Schritt 6 als eigenes Modul.
// ---------------------------------------------------------------------------
function registerCoreIpc() {
  ipcMain.handle('app:getVersion', () => app.getVersion());

  ipcMain.handle('app:getPlatformInfo', () => ({
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }));

  // Backup-Warnung-Feature: Anzahl aufeinanderfolgender fehlgeschlagener
  // automatischer Backups (siehe main/backup.js) — ab 3 in Folge zeigt die
  // App eine sichtbare Warnung, statt dass es unbemerkt weiter fehlschlägt.
  ipcMain.handle('app:getBackupStatus', () => {
    const state = readAppState();
    const intervalDays = currentProject?.config?.backupIntervalDays ?? 1;
    const backupPath = currentProject?.config?.backupPath;
    return {
      consecutiveFailures: state.backupConsecutiveFailures || 0,
      lastSuccessAt: state.backupLastSuccessAt || null,
      lastErrorAt: state.backupLastErrorAt || null,
      lastErrorMessage: state.backupLastErrorMessage || null,
      lastErrorCode: state.backupLastErrorCode || null,
      intervalDays,
      nextScheduledAt: backupPath ? nextScheduledBackup(backupPath, intervalDays) : null
    };
  });

  // "Backup jetzt erstellen"-Button im neuen Einstellungsfenster — erzwingt
  // ein Backup unabhängig vom Intervall (löscht dafür einfach die heutige
  // Datei, falls schon vorhanden, maybeRunAutoBackup erledigt den Rest).
  ipcMain.handle('app:runBackupNow', async () => {
    const backupPath = currentProject?.config?.backupPath;
    if (backupPath) {
      const todayFile = path.join(backupPath, backupFileNameFor(new Date()));
      try { fs.unlinkSync(todayFile); } catch { /* existiert nicht, kein Problem */ }
    }
    await maybeRunAutoBackup({ getCurrentProject: () => currentProject });
    return readAppState();
  });

  // "Backup-Ordner öffnen"-Button — zeigt den Ordner im Dateimanager des Systems.
  ipcMain.handle('app:openBackupFolder', () => {
    const backupPath = currentProject?.config?.backupPath;
    if (backupPath) shell.openPath(backupPath);
  });

  // "Ändern"-Button beim Speicherort (Einstellungsfenster → Allgemein):
  // Nutzer-Entscheidung war ausdrücklich "verschieben, alles bleibt erhalten"
  // — kopiert deshalb alles an den neuen Ort und lässt den ALTEN Ordner
  // bewusst unangetastet stehen (kein "richtiges" Verschieben mit Löschen),
  // damit selbst bei einem Fehler mitten im Kopieren nichts verloren gehen
  // kann. Der Nutzer kann den alten Ordner danach selbst manuell entfernen.
  ipcMain.handle('app:moveProjectFolder', async () => {
    const oldPath = currentProject?.path;
    if (!oldPath) throw new Error('Kein Projekt geöffnet.');

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Neuen Speicherort für dein Wiki wählen',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return { moved: false };
    const newPath = result.filePaths[0];

    if (path.resolve(newPath) === path.resolve(oldPath)) {
      return { moved: false, error: 'Das ist bereits der aktuelle Speicherort.' };
    }
    let existingFiles;
    try { existingFiles = fs.readdirSync(newPath); }
    catch (err) { return { moved: false, error: `Ordner konnte nicht gelesen werden: ${err.message}` }; }
    if (existingFiles.length > 0) {
      return { moved: false, error: 'Der gewählte Ordner ist nicht leer. Bitte einen leeren Ordner wählen, damit nichts überschrieben wird.' };
    }

    try {
      fs.cpSync(oldPath, newPath, { recursive: true });
      currentProject = { path: newPath, config: currentProject.config };
      writeAppState({ lastProjectPath: newPath });
      console.log(`[Archiv Wiki] Speicherort verschoben: ${oldPath} → ${newPath}`);
      return { moved: true, newPath, oldPath };
    } catch (err) {
      return { moved: false, error: `Kopieren fehlgeschlagen: ${err.message}` };
    }
  });

  // Schließen-Verhalten: bewusst GLOBAL (app-state.json), nicht pro Projekt —
  // das betrifft die App als Ganzes, nicht den Wiki-Inhalt. Wird trotzdem im
  // selben "Allgemein"-Tab des Einstellungsfensters angezeigt.
  ipcMain.handle('app:getCloseBehavior', () => readAppState().closeBehavior || 'ask');
  ipcMain.handle('app:setCloseBehavior', (_e, value) => {
    writeAppState({ closeBehavior: value });
  });

  // Antwort aus dem Auswahl-Dialog (siehe handleCloseRequest/'app:show-close-dialog').
  ipcMain.handle('app:resolveCloseDialog', (_e, { choice, remember }) => {
    if (remember) writeAppState({ closeBehavior: choice });
    if (choice === 'tray') mainWindow.hide();
    else if (choice === 'quit') quitCleanly();
    // choice === 'cancel' (Abbrechen): nichts tun, Fenster bleibt einfach offen.
  });

  // Update-Hinweis (bewusst der "einfache Weg", siehe Absprache): fragt nur
  // ab, ob es ein neueres Release gibt, lädt aber NICHTS automatisch herunter
  // und tauscht nichts selbst aus.
  // Bugfix (nur durch einen echten, tatsächlich gebauten Test-Lauf gefunden,
  // nicht durch bloßes Code-Lesen): electron-builder entfernt das komplette
  // "build"-Feld aus dem package.json, das im FERTIGEN Programm landet —
  // "build.publish" existierte im echten AppImage dadurch nie, nur beim
  // Entwickeln (npm run dev), wo die unveränderte Quell-package.json genutzt
  // wird. Owner/Repo werden deshalb jetzt aus "homepage" abgeleitet (bleibt
  // beim Bauen erhalten) statt aus "build" — weiterhin nirgends fest im Code
  // hinterlegt, nur eine andere Quelle.
  function compareVersions(a, b) {
    const pa = String(a).replace(/^v/i, '').split('.').map(Number);
    const pb = String(b).replace(/^v/i, '').split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] || 0, nb = pb[i] || 0;
      if (na !== nb) return na - nb;
    }
    return 0;
  }

  function getRepoOwnerAndName() {
    const homepage = require('./package.json').homepage || '';
    const match = homepage.match(/github\.com\/([^/]+)\/([^/]+?)\/?$/);
    if (!match) throw new Error('Konnte Owner/Repo nicht aus "homepage" in package.json ableiten.');
    return { owner: match[1], repo: match[2] };
  }

  ipcMain.handle('app:checkForUpdate', () => {
    const currentVersion = app.getVersion();
    const { owner, repo } = getRepoOwnerAndName();
    return new Promise((resolve) => {
      const req = https.get(
        `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
        { headers: { 'User-Agent': 'archiv-wiki-update-check' }, timeout: 6000 },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            // Bugfix (per Nutzer-Test entdeckt): vorher wurde JEDE Antwort
            // blind als Erfolg behandelt, ganz ohne den HTTP-Status zu prüfen.
            // Ein Fehler von GitHub (z. B. 403 bei Rate-Limit — unangemeldet
            // nur 60 Anfragen/Stunde erlaubt — oder 404, falls kein
            // veröffentlichtes, nicht-Vorab-Release existiert) sah dadurch
            // optisch GENAUSO aus wie "wirklich aktuell", ganz ohne Hinweis,
            // dass eigentlich gar nicht geprüft werden konnte.
            if (res.statusCode !== 200) {
              console.error(`[Archiv Wiki] Update-Check: GitHub antwortete mit Status ${res.statusCode} (${res.statusMessage || ''}). Details:`, data.slice(0, 300));
              return resolve({ currentVersion, latestVersion: null, updateAvailable: false, releaseUrl: null });
            }
            try {
              const json = JSON.parse(data);
              const latestVersion = String(json.tag_name || '').replace(/^v/i, '');
              if (!latestVersion) {
                console.error('[Archiv Wiki] Update-Check: GitHub-Antwort enthielt keinen tag_name — Rohdaten:', data.slice(0, 300));
                return resolve({ currentVersion, latestVersion: null, updateAvailable: false, releaseUrl: null });
              }
              const lastCheckAt = new Date().toISOString();
              writeAppState({ lastUpdateCheckAt: lastCheckAt });
              resolve({
                currentVersion,
                latestVersion,
                updateAvailable: compareVersions(latestVersion, currentVersion) > 0,
                releaseUrl: json.html_url || `https://github.com/${owner}/${repo}/releases/latest`,
                lastCheckAt
              });
            } catch (err) {
              console.error('[Archiv Wiki] Update-Check: GitHub-Antwort konnte nicht als JSON gelesen werden:', err.message);
              resolve({ currentVersion, latestVersion: null, updateAvailable: false, releaseUrl: null });
            }
          });
        }
      );
      // Netzwerk-Aussetzer/Timeout dürfen die App nie blockieren oder abstürzen
      // lassen — einfach "keine Update-Info verfügbar" zurückgeben, aber jetzt
      // protokolliert statt komplett lautlos.
      req.on('error', (err) => {
        console.error('[Archiv Wiki] Update-Check: Netzwerkfehler:', err.message);
        resolve({ currentVersion, latestVersion: null, updateAvailable: false, releaseUrl: null });
      });
      req.on('timeout', () => {
        console.error('[Archiv Wiki] Update-Check: Zeitüberschreitung (>6s) bei der Anfrage an GitHub.');
        req.destroy();
        resolve({ currentVersion, latestVersion: null, updateAvailable: false, releaseUrl: null });
      });
    });
  });

  // App-Passwortschutz: Passwort selbst wird nie gespeichert, nur Salt+Hash
  // (siehe main/wizard-ipc.js beim Setzen). Hier: mit demselben Salt erneut
  // hashen und mit dem gespeicherten Hash vergleichen — timingSafeEqual statt
  // === , damit die Vergleichszeit nicht verrät, wie viele Zeichen schon
  // stimmten (Schutz gegen Timing-Angriffe, auch wenn das Risiko hier gering
  // ist, da rein lokal — trotzdem der korrekte, saubere Weg).
  ipcMain.handle('app:verifyAppLock', (_e, enteredPassword) => {
    const config = readProjectConfig(currentProject?.path);
    const appLock = config?.appLock;
    if (!appLock?.enabled) return { ok: true }; // kein Schutz gesetzt — nichts zu prüfen
    try {
      const candidateHash = crypto.scryptSync(enteredPassword || '', appLock.salt, 64);
      const storedHash = Buffer.from(appLock.hash, 'hex');
      const ok = candidateHash.length === storedHash.length && crypto.timingSafeEqual(candidateHash, storedHash);
      return { ok };
    } catch {
      return { ok: false };
    }
  });

  // Generischer Ordner-Auswahl-Dialog für spätere Fälle (z. B. "Projekt
  // wechseln" über das Menü). Der Wizard selbst nutzt den spezifischeren
  // 'wizard:selectProjectFolder' aus main/wizard-ipc.js (inkl. Schreibbar-
  // keits- und Bereits-konfiguriert-Prüfung).
  ipcMain.handle('dialog:selectDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Projektordner für Archiv Wiki wählen',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // Für die Renderer-Seite: welches Projekt ist gerade offen?
  ipcMain.handle('project:getCurrent', () => currentProject);
}

// ---------------------------------------------------------------------------
// App Lifecycle
// ---------------------------------------------------------------------------
// Tray-Symbol (Variante 1, Nutzer-Entscheidung): X schließt die App nicht
// wirklich, sie läuft im Hintergrund weiter — per Klick auf dieses Symbol
// wieder holbar, per Rechtsklick beendbar. Bekanntes Muster von Discord/Slack.
// Hinweis: Tray-Unterstützung ist unter Linux je nach Desktop-Umgebung
// unterschiedlich zuverlässig (unter GNOME z. B. oft nur mit einer
// zusätzlichen Erweiterung sichtbar) — das ist eine Einschränkung des
// jeweiligen Systems, keine Einschränkung dieser App.
function createTray() {
  // Bugfix (Nutzer-Meldung: App startete komplett nicht mehr, unhandled
  // promise rejection beim Icon-Laden): Tray ist eine reine Komfort-Funktion
  // — ein fehlendes oder nicht ladbares Icon darf niemals den kompletten
  // Programmstart verhindern. Existenzprüfung + try/catch, bei Fehlschlag
  // läuft die App einfach ohne Tray-Symbol weiter.
  const iconPath = resolveNativeAssetPath('assets/icons/32x32.png');
  if (!fs.existsSync(iconPath)) {
    console.warn(`[Archiv Wiki] Tray-Icon nicht gefunden unter ${iconPath} — Tray-Symbol wird übersprungen, App startet trotzdem normal weiter.`);
    return;
  }
  try {
    tray = new Tray(iconPath);
  } catch (err) {
    console.error('[Archiv Wiki] Tray-Symbol konnte nicht erstellt werden, wird übersprungen:', err.message);
    tray = null;
    return;
  }
  tray.setToolTip('Archiv Wiki');
  function showAndFocus() { mainWindow?.show(); mainWindow?.focus(); }
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Fenster öffnen', click: showAndFocus },
    { label: 'Dashboard öffnen', click: () => { showAndFocus(); mainWindow?.webContents.send('menu:go-home'); } },
    { label: 'Nach Updates suchen', click: () => { showAndFocus(); mainWindow?.webContents.send('menu:check-for-updates'); } },
    {
      label: 'Backup jetzt erstellen',
      click: async () => {
        const backupPath = currentProject?.config?.backupPath;
        if (backupPath) { try { fs.unlinkSync(path.join(backupPath, backupFileNameFor(new Date()))); } catch { /* existiert nicht */ } }
        await maybeRunAutoBackup({ getCurrentProject: () => currentProject });
      }
    },
    { type: 'separator' },
    { label: 'Einstellungen…', click: () => { showAndFocus(); mainWindow?.webContents.send('menu:open-settings'); } },
    { type: 'separator' },
    { label: 'Archiv-Wiki beenden', click: () => quitCleanly() }
  ]));
  // Linksklick auf das Symbol selbst öffnet/fokussiert ebenfalls (zusätzlich
  // zum Rechtsklick-Menü) — unter Windows/den meisten Linux-Umgebungen üblich.
  tray.on('click', showAndFocus);
}

app.whenReady().then(() => {
  buildMenu();
  createTray();
  registerCoreIpc();

  // Jede IPC-Registrierung einzeln absichern: schlägt eine fehl (z. B. ein
  // fehlerhaftes Drittanbieter-Modul), sollen die ANDEREN trotzdem laufen und
  // das Fenster trotzdem öffnen, statt dass die ganze Startsequenz still
  // abbricht. Der Fehler wird klar im Terminal sichtbar statt zu verschwinden.
  function safeRegister(label, fn) {
    try { fn(); }
    catch (err) { console.error(`[Archiv Wiki] Registrierung fehlgeschlagen: ${label}`, err); }
  }
  safeRegister('registerFilesystemIpc', () => registerFilesystemIpc({ getCurrentProject: () => currentProject }));
  safeRegister('registerExportIpc', () => registerExportIpc({ getCurrentProject: () => currentProject, getMainWindow: () => mainWindow }));
  safeRegister('registerSyncIpc', () => registerSyncIpc({ getCurrentProject: () => currentProject, getMainWindow: () => mainWindow }));
  safeRegister('registerSettingsIpc', () => registerSettingsIpc({ getCurrentProject: () => currentProject, getMainWindow: () => mainWindow }));

  // Automatisches Backup: einmal am Tag ein ZIP-Snapshot in den beim
  // Einrichten gewählten backupPath (siehe main/backup.js — vorher wurde
  // dieser Pfad nur gespeichert, aber nie genutzt). Kurz nach Start prüfen
  // (falls schon ein Projekt bekannt ist) plus ein Hintergrund-Timer, falls
  // die App über Mitternacht hinaus geöffnet bleibt.
  setTimeout(() => { maybeRunAutoBackup({ getCurrentProject: () => currentProject }).catch(() => {}); }, 5000);
  setInterval(() => { maybeRunAutoBackup({ getCurrentProject: () => currentProject }).catch(() => {}); }, 10 * 60 * 1000);

  const appState = readAppState();
  if (isValidProject(appState.lastProjectPath)) {
    // Bereits eingerichtetes Projekt aus einem früheren Start → Wizard
    // überspringen und direkt ins Hauptfenster.
    console.log(`[Archiv Wiki] Bekanntes Projekt gefunden: ${appState.lastProjectPath}`);
    currentProject = { path: appState.lastProjectPath, config: readProjectConfig(appState.lastProjectPath) };
    createMainWindow();
  } else {
    // Kein (gültiges) Projekt bekannt → Setup-Wizard zeigen.
    console.log('[Archiv Wiki] Kein Projekt bekannt — starte Setup-Wizard.');
    registerWizardIpc({ getWizardWindow: () => wizardWindow, onProjectReady: handleProjectReady });
    createWizardWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length > 0) return;
    if (currentProject.path) createMainWindow();
    else createWizardWindow();
  });
});

// Zentrale Stelle für ALLE Beenden-Wege (Anwendungsmenü, Strg+Q, Tray-Menü,
// window-all-closed) — setzt isQuitting, BEVOR die close-Handler der Fenster
// laufen, damit das Hauptfenster dann wirklich schließt statt nur versteckt
// zu werden (siehe mainWindow.on('close', ...) weiter oben).
app.on('before-quit', () => { isQuitting = true; });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
