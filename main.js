// main.js — Electron Main Process
// Schritt 1: Grundstruktur (sicheres Fenster, Preload, Menü, Basis-IPC).
// Schritt 2: Setup-Wizard-Boot-Logik (Wizard vs. bekanntes Projekt), siehe
// main/app-state.js, main/project.js, main/wizard-ipc.js.
// Schritt 3: Dateisystem-IPC (main/notes-fs.js, main/filesystem-ipc.js).
// Editor, Suche und Export folgen in den nächsten Schritten als eigene Module.

'use strict';

const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { readAppState } = require('./main/app-state');
const { isValidProject, readProjectConfig } = require('./main/project');
const { registerWizardIpc } = require('./main/wizard-ipc');
const { registerFilesystemIpc } = require('./main/filesystem-ipc');
const { registerExportIpc, exportProjectZip } = require('./main/export-ipc');
const { registerSyncIpc } = require('./main/sync-ipc');
const { maybeRunAutoBackup } = require('./main/backup');

const isDev = process.argv.includes('--dev');

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
    width: 760,
    height: 620,
    minWidth: 640,
    minHeight: 560,
    show: false,
    backgroundColor: '#0a0d12',
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

  mainWindow.on('closed', () => { mainWindow = null; });
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
              detail: `Version ${app.getVersion()}\nAutor: smashii\nLizenz: MIT`
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
app.whenReady().then(() => {
  buildMenu();
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
