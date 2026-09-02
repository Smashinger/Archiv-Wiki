// main.js — Electron Main Process
// Schritt 1: Grundstruktur (sicheres Fenster, Preload, Menü, Basis-IPC).
// Schritt 2: Setup-Wizard-Boot-Logik (Wizard vs. bekanntes Projekt), siehe
// main/app-state.js, main/project.js, main/wizard-ipc.js.
// Schritt 3: Dateisystem-IPC (main/notes-fs.js, main/filesystem-ipc.js).
// Editor, Suche und Export folgen in den nächsten Schritten als eigene Module.

'use strict';

const { app, BrowserWindow, Menu, ipcMain, dialog, shell, Tray, clipboard, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { readAppState, writeAppState } = require('./main/app-state');
const { adoptProjectConfig, cloneProjectConfig, isValidProject, requireProjectConfig } = require('./main/project');
const { registerWizardIpc } = require('./main/wizard-ipc');
const { registerFilesystemIpc } = require('./main/filesystem-ipc');
const { registerIncomingIpc } = require('./main/incoming-ipc');
const { startWebClipReceiver } = require('./main/webclip-receiver');
const {
  INSTALL_SWITCH: WEBCLIP_INSTALL_SWITCH,
  installBraveWebClipper,
  registerWebClipperDistributionIpc
} = require('./main/webclip-distribution');
const { registerExportIpc, exportProjectZip } = require('./main/export-ipc');
const { registerSyncIpc, isSyncInProgress, getSyncStatusSnapshot } = require('./main/sync-ipc');
const { registerSettingsIpc, matchesStoredAppLockPassword } = require('./main/settings-ipc');
const {
  maybeRunAutoBackup,
  getBackupFolderState,
  resolveBackupSuccessAt,
  storedSuccessMatchesBackup,
  isBackupInProgress,
  readProjectBackupStatus,
  finishBackupBeforeQuit
} = require('./main/backup');
const { getAppDocumentUrl, createNavigationHandlers } = require('./main/navigation-security');
const { createDiagnosticsService } = require('./main/diagnostics');
// Auf Modul-Ebene (wie alle require-Aufrufe hier oben), NICHT innerhalb einer
// einzelnen Funktion — autoUpdater wird sowohl in registerCoreIpc() (IPC-
// Handler, Ereignis-Verdrahtung) als auch im automatischen Programmstart-
// Check innerhalb app.whenReady() gebraucht. Das sind zwei GETRENNTE
// Funktionen; eine Deklaration innerhalb der einen wäre in der anderen nicht
// sichtbar gewesen — genau das hatte den ursprünglichen ReferenceError
// verursacht ("autoUpdater is not defined" beim automatischen Start-Check).
//
// Der require-Aufruf selbst ist bewusst abgesichert: das Update-System darf
// den Start der App unter keinen Umständen verhindern. Ein require-Fehler
// auf Modul-Ebene (z. B. bei kaputter/fehlender Installation des Pakets)
// wäre OHNE dieses try/catch nicht abfangbar gewesen — er würde schon beim
// Laden von main.js selbst auftreten, bevor überhaupt irgendein anderer Code
// in dieser Datei läuft, und die komplette App am Start hindern. Jede Stelle,
// die autoUpdater danach verwendet, prüft deshalb konsequent, ob es
// tatsächlich verfügbar ist (siehe registerCoreIpc() und den
// Programmstart-Check weiter unten).
let autoUpdater = null;
let autoUpdaterLoadError = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch (err) {
  autoUpdaterLoadError = err?.message || String(err);
  console.error('[Archiv Wiki] electron-updater konnte nicht geladen werden — automatische Updates sind in dieser Sitzung deaktiviert:', autoUpdaterLoadError);
}

// Zentraler flüchtiger Update-Lifecycle. app.getVersion() bleibt die einzige
// Quelle der installierten Version. Dieses Objekt ist die gemeinsame
// Laufzeitquelle für Main-Prozess und alle sichtbaren Renderer.
let updateCheckPromise = null;
let updateDownloadPromise = null;
let updateDownloadInProgress = false;
let updateReadyToInstall = false;
let updateInstallInProgress = false;

function compareVersions(a, b) {
  const pa = String(a).replace(/^v/i, '').split('.').map(Number);
  const pb = String(b).replace(/^v/i, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0, nb = pb[i] || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

function getUpdateReleaseUrl(version = null) {
  try {
    const homepage = require('./package.json').homepage || '';
    const match = homepage.match(/github\.com\/([^/]+)\/([^/]+?)\/?$/);
    if (!match) return null;
    const base = `https://github.com/${match[1]}/${match[2]}/releases`;
    return version ? `${base}/tag/v${version}` : `${base}/latest`;
  } catch {
    return null;
  }
}

const updateStatus = {
  phase: autoUpdater ? 'idle' : 'unavailable',
  currentVersion: app.getVersion(),
  availableVersion: null,
  downloadPercent: null,
  lastCheckAt: readAppState().lastUpdateCheckAt || null,
  errorType: autoUpdater ? null : 'unavailable',
  errorMessage: autoUpdater ? null : 'Das Update-System ist derzeit nicht verfügbar.',
  errorDetails: autoUpdater ? null : autoUpdaterLoadError,
  errorCategory: autoUpdater ? null : 'unavailable',
  updaterAvailable: Boolean(autoUpdater),
  installReady: false,
  releaseUrl: getUpdateReleaseUrl()
};


function translateUpdateError(error, stage = 'check') {
  const details = error?.message || String(error || 'Unbekannter Update-Fehler.');
  const code = String(error?.code || '').toUpperCase();
  const text = `${code} ${details}`.toLowerCase();

  if (stage === 'unavailable') {
    return { type: 'unavailable', message: 'Das Update-System ist derzeit nicht verfügbar.', details };
  }
  if (/checksum|sha512|sha-?512|digest|integrity|corrupt|beschädigt/.test(text)) {
    return { type: 'integrity', message: 'Die heruntergeladene Update-Datei ist beschädigt und wurde nicht verwendet.', details };
  }
  if (/eacces|eperm|permission|access denied|not permitted|read-only|readonly/.test(text)) {
    return { type: 'permission', message: 'Archiv-Wiki hat keine ausreichenden Berechtigungen für den Update-Vorgang.', details };
  }
  if (/enotfound|eai_again|err_internet_disconnected|network is unreachable|offline|net::err_|socket hang up|timed? ?out|timeout|connection reset|econnreset|econnrefused/.test(text)) {
    return { type: 'network', message: 'Keine Verbindung zum Update-Server. Bitte prüfe deine Internetverbindung.', details };
  }
  if (/github/.test(text) && /(unavailable|unreachable|not reachable|rate limit|api)/.test(text)) {
    return { type: 'github', message: 'GitHub ist derzeit nicht erreichbar. Bitte versuche es später erneut.', details };
  }
  if (/http|status code|response status/.test(text)) {
    return { type: 'http', message: 'Der Update-Server hat die Anfrage nicht erfolgreich beantwortet.', details };
  }
  if (stage === 'download') {
    return { type: 'download', message: 'Das Update konnte nicht heruntergeladen werden.', details };
  }
  if (stage === 'install') {
    return { type: 'install', message: 'Das Update konnte nicht installiert und neu gestartet werden.', details };
  }
  return { type: 'check', message: 'Die Update-Prüfung ist fehlgeschlagen.', details };
}

function getUpdateStatusSnapshot() {
  return { ...updateStatus };
}

function broadcastUpdateStatus() {
  const snapshot = getUpdateStatusSnapshot();
  for (const win of [mainWindow, wizardWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send('update:statusChanged', snapshot);
  }
}

function setUpdateStatus(patch, { broadcast = true } = {}) {
  Object.assign(updateStatus, patch, {
    currentVersion: app.getVersion(),
    updaterAvailable: Boolean(autoUpdater)
  });
  if (!autoUpdater) {
    updateStatus.phase = 'unavailable';
    updateStatus.installReady = false;
  }
  if (broadcast) broadcastUpdateStatus();
  return getUpdateStatusSnapshot();
}

function runUpdateCheck() {
  if (!autoUpdater) {
    setUpdateStatus({
      phase: 'unavailable',
      errorType: 'unavailable',
      errorMessage: 'Das Update-System ist derzeit nicht verfügbar.',
      errorDetails: autoUpdaterLoadError,
      errorCategory: 'unavailable'
    });
    return Promise.reject(Object.assign(new Error(updateStatus.errorMessage), { code: 'UPDATER_UNAVAILABLE' }));
  }
  if (updateCheckPromise) return updateCheckPromise;
  if (updateInstallInProgress || updateReadyToInstall || updateDownloadInProgress) {
    return Promise.resolve({ skipped: true, status: getUpdateStatusSnapshot() });
  }

  setUpdateStatus({ phase: 'checking', errorType: null, errorMessage: null, errorDetails: null, errorCategory: null });
  updateCheckPromise = (async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      const checkedAt = new Date().toISOString();
      writeAppState({ lastUpdateCheckAt: checkedAt });
      const latestVersion = result?.updateInfo?.version || null;
      const isAvailable = typeof result?.isUpdateAvailable === 'boolean'
        ? result.isUpdateAvailable
        : Boolean(latestVersion) && compareVersions(latestVersion, app.getVersion()) > 0;

      // Ein zwischenzeitlich gestarteter Download oder Installationszustand
      // besitzt Vorrang vor dem Abschluss der Prüfung.
      if (!updateDownloadInProgress && !updateReadyToInstall && !updateInstallInProgress) {
        setUpdateStatus({
          phase: isAvailable ? 'updateAvailable' : 'upToDate',
          availableVersion: isAvailable ? latestVersion : null,
          releaseUrl: getUpdateReleaseUrl(isAvailable ? latestVersion : null),
          lastCheckAt: checkedAt,
          downloadPercent: null,
          installReady: false,
          errorType: null,
          errorMessage: null,
          errorDetails: null,
          errorCategory: null
        });
      } else {
        setUpdateStatus({
          availableVersion: latestVersion || updateStatus.availableVersion,
          releaseUrl: getUpdateReleaseUrl(latestVersion || updateStatus.availableVersion),
          lastCheckAt: checkedAt,
          errorType: null,
          errorMessage: null,
          errorDetails: null,
          errorCategory: null
        });
      }
      return result;
    } catch (err) {
      if (!updateDownloadInProgress && !updateReadyToInstall && !updateInstallInProgress) {
        const translated = translateUpdateError(err, 'check');
        setUpdateStatus({
          phase: 'error',
          errorType: 'check',
          errorCategory: translated.type,
          errorMessage: translated.message,
          errorDetails: translated.details
        });
      }
      throw err;
    }
  })().finally(() => {
    updateCheckPromise = null;
  });

  return updateCheckPromise;
}

function startUpdateDownload() {
  if (!autoUpdater) {
    setUpdateStatus({ phase: 'unavailable', errorType: 'unavailable', errorCategory: 'unavailable', errorMessage: 'Das Update-System ist derzeit nicht verfügbar.', errorDetails: autoUpdaterLoadError });
    return Promise.resolve({ started: false, reason: 'updater-unavailable', error: updateStatus.errorMessage });
  }
  if (updateInstallInProgress) return Promise.resolve({ started: false, reason: 'installation-in-progress' });
  if (updateReadyToInstall) return Promise.resolve({ started: false, reason: 'update-ready' });
  if (updateDownloadPromise) return updateDownloadPromise;

  updateDownloadInProgress = true;
  setUpdateStatus({
    phase: 'downloading',
    downloadPercent: 0,
    installReady: false,
    errorType: null,
    errorMessage: null,
    errorDetails: null,
    errorCategory: null
  });
  updateDownloadPromise = (async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { started: true };
    } catch (err) {
      updateDownloadInProgress = false;
      console.error('[Archiv Wiki] Update-Download fehlgeschlagen:', err?.message || err);
      const translated = translateUpdateError(err, 'download');
      setUpdateStatus({
        phase: 'error',
        downloadPercent: null,
        installReady: false,
        errorType: 'download',
        errorCategory: translated.type,
        errorMessage: translated.message,
        errorDetails: translated.details
      });
      return {
        started: false,
        reason: 'download-failed',
        error: translated.message,
        details: translated.details
      };
    } finally {
      updateDownloadInProgress = false;
      updateDownloadPromise = null;
    }
  })();

  return updateDownloadPromise;
}

const isDev = process.argv.includes('--dev');
const installBraveWebClipperRequested = process.argv.includes(WEBCLIP_INSTALL_SWITCH);

/**
 * Registriert den mitgelieferten Native Host nur für eine verpackte Linux-
 * AppImage-Ausführung. Der vorhandene Shell-Installer bleibt damit die einzige
 * Stelle für Browser-IDs, Manifestformate und Installationspfade; main.js stößt
 * den idempotenten Endnutzer-Modus lediglich im Hintergrund an.
 */
function prepareAppImageNativeHost() {
  if (process.platform !== 'linux' || !app.isPackaged) {
    return Promise.resolve({ skipped: true });
  }

  const appImagePath = process.env.APPIMAGE;
  if (!appImagePath || !path.isAbsolute(appImagePath)) {
    // Ein entpackter linux-unpacked-Build ist verpackt, aber kein AppImage.
    // Dort darf kein kurzlebiger Ressourcenpfad dauerhaft registriert werden.
    return Promise.resolve({ skipped: true });
  }

  const installerPath = path.join(
    process.resourcesPath,
    'native-host',
    'extension',
    'native-host',
    'install-native-host.sh'
  );

  return new Promise((resolve, reject) => {
    execFile(installerPath, ['--appimage', appImagePath], {
      env: process.env,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    }, (error, stdout, stderr) => {
      if (error) {
        const details = String(stderr || stdout || error.message).trim();
        reject(new Error(details || 'Native-Host-Installer wurde nicht erfolgreich beendet.'));
        return;
      }
      resolve({ installed: true });
    });
  });
}

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
// Eigene Titelleiste (Custom Window Chrome): Referenz auf das EINE, bereits
// bestehende Menü-Objekt aus buildMenu() — wird von renderer/js/app.js über
// 'window:popupMenu' als natives Popup-Menü geöffnet (kein zweites
// Menü-Datenmodell, siehe buildMenu()/registerCoreIpc()).
/** @type {Electron.Menu | null} */
let appMenu = null;
// App-Passwortschutz: der Hauptprozess führt seinen EIGENEN, maßgeblichen
// Sperrzustand, statt sich auf den Renderer oder die Sichtbarkeit des
// Sperrbildschirms zu verlassen. Nötig, weil natives Menü, Menü-Accelerators,
// Popup-Menü, Tray und DevTools vollständig außerhalb des Renderers laufen und
// von dessen inert/Fokus-Sperren gar nicht erreicht werden. Nur eine
// erfolgreiche Passwortprüfung ('app:verifyAppLock') entsperrt; der Renderer
// kann über 'app:lockNow' ausschließlich SPERREN, niemals entsperren.
let appLocked = false;
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
let webClipReceiver = null;

function readOperatingSystemLabel() {
  if (process.platform === 'linux') {
    try {
      const raw = fs.readFileSync('/etc/os-release', 'utf8');
      const pretty = raw.match(/^PRETTY_NAME=(?:"([^"]+)"|([^\n]+))$/m);
      if (pretty) return `${pretty[1] || pretty[2]} · Kernel ${os.release()}`;
    } catch { /* generischer Fallback unten */ }
  }
  return `${os.type()} ${os.release()}`;
}

function getInstallType() {
  if (!app.isPackaged) return 'Entwicklungsstart';
  if (process.env.APPIMAGE) return 'AppImage';
  if (process.env.FLATPAK_ID) return 'Flatpak';
  if (process.platform === 'win32') return 'Windows-Paket';
  if (process.platform === 'darwin') return 'macOS-Paket';
  return 'Paketierte Anwendung';
}

const diagnostics = createDiagnosticsService({
  getUserDataPath: () => app.getPath('userData'),
  getEnvironment: () => ({
    appVersion: app.getVersion(),
    operatingSystem: readOperatingSystemLabel(),
    arch: process.arch,
    installType: getInstallType(),
    electron: process.versions.electron
  }),
  getSanitizationContext: () => ({
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    projectPath: currentProject?.path || null,
    userDataPath: app.getPath('userData'),
    tempPath: app.getPath('temp'),
    homePath: app.getPath('home')
  })
});

function recordAutomaticDiagnostic(payload) {
  try {
    return diagnostics.recordAutomatic(payload);
  } catch (error) {
    console.error('[Archiv Wiki] Diagnosebericht konnte nicht gespeichert werden:', error?.message || error);
    return null;
  }
}

// uncaughtExceptionMonitor beobachtet einen unbehandelten Main-Prozess-Fehler,
// ohne Nodes normales Fehler-/Beendenverhalten zu verändern. Insbesondere
// werden auch unbehandelte Promise-Rejections erfasst, wenn Node sie als
// uncaughtException hochstuft. Synchrones Schreiben erhöht die Chance, dass
// der Bericht noch vor einem tatsächlichen Prozessabbruch sicher auf Disk ist.
process.on('uncaughtExceptionMonitor', (error, origin) => {
  recordAutomaticDiagnostic({
    source: 'main',
    kind: origin === 'unhandledRejection' ? 'unhandled-rejection' : 'uncaught-exception',
    title: origin === 'unhandledRejection' ? 'Unbehandelter Main-Prozess-Fehler' : 'Main-Prozess-Fehler',
    message: error?.message || String(error || 'Unbekannter Fehler'),
    stack: error?.stack || null,
    details: { origin }
  });
});

function attachWindowDiagnostics(browserWindow, windowKind) {
  browserWindow.webContents.on('render-process-gone', (_event, details = {}) => {
    if (details.reason === 'clean-exit') return;
    recordAutomaticDiagnostic({
      source: 'renderer-process',
      kind: 'renderer-process-gone',
      title: windowKind === 'wizard' ? 'Einrichtungsfenster abgestürzt' : 'Archiv-Wiki-Fenster abgestürzt',
      message: `Renderer-Prozess wurde unerwartet beendet (${details.reason || 'unbekannt'}).`,
      details: {
        window: windowKind,
        reason: details.reason || null,
        exitCode: Number.isFinite(details.exitCode) ? details.exitCode : null
      }
    });
  });

  // Ein fehlgeschlagenes Laden des Hauptdokuments ist ebenfalls ein schwerer
  // technischer Fehler. Die URL wird bewusst NICHT in den Bericht übernommen;
  // nur Fehlercode und Beschreibung sind für die Diagnose erforderlich.
  // ERR_ABORTED (-3) kann bei normalen Reload-/Navigationsabbrüchen auftreten
  // und soll deshalb keinen Diagnosebericht erzeugen.
  browserWindow.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (code === -3 || isMainFrame === false) return;
    recordAutomaticDiagnostic({
      source: 'renderer-process',
      kind: 'renderer-load-failed',
      title: windowKind === 'wizard'
        ? 'Einrichtungsoberfläche konnte nicht geladen werden'
        : 'Archiv-Wiki-Oberfläche konnte nicht geladen werden',
      message: description || 'Die Oberfläche konnte nicht geladen werden.',
      details: { window: windowKind, errorCode: code }
    });
  });
}

async function buildManualDiagnosticsRuntime() {
  let backup = null;
  try {
    const status = await getCurrentBackupStatus();
    backup = {
      inProgress: Boolean(status.inProgress),
      consecutiveFailures: status.consecutiveFailures || 0,
      lastErrorCode: status.lastErrorCode || null,
      lastErrorMessage: status.lastErrorMessage || status.lastErrorUserMessage || null
    };
  } catch (error) {
    backup = { inProgress: isBackupInProgress(), consecutiveFailures: null, lastErrorCode: null, lastErrorMessage: error?.message || null };
  }

  const sync = getSyncStatusSnapshot();
  const webClipper = webClipReceiver?.getStatus?.() || {
    receiverReady: false,
    browserConnected: false,
    lastError: null
  };

  return {
    projectOpen: Boolean(currentProject?.path),
    update: {
      phase: updateStatus.phase,
      errorType: updateStatus.errorType,
      errorMessage: updateStatus.errorMessage,
      errorDetails: updateStatus.errorDetails
    },
    backup,
    sync: {
      state: sync.state,
      inProgress: sync.inProgress,
      conflictCount: sync.conflictCount,
      lastError: sync.lastError
    },
    webClipper: {
      receiverReady: Boolean(webClipper.receiverReady),
      browserConnected: Boolean(webClipper.browserConnected),
      lastError: webClipper.lastError || null
    }
  };
}

function adoptCurrentProjectConfig(projectPath, config) {
  const nextProject = adoptProjectConfig(currentProject, projectPath, config);
  if (nextProject === currentProject) return false;
  currentProject = nextProject;
  return true;
}


async function getCurrentBackupStatus() {
  const projectPath = currentProject?.path;
  const stored = readProjectBackupStatus(projectPath);
  const intervalDays = currentProject?.config?.backupIntervalDays ?? 1;
  const backupPath = currentProject?.config?.backupPath;
  const now = new Date();
  const folderState = await getBackupFolderState(backupPath, intervalDays, { now });
  const storedSuccessIsCurrent = storedSuccessMatchesBackup(folderState.latestValidBackup, stored);
  return {
    consecutiveFailures: stored.consecutiveFailures || 0,
    lastSuccessAt: resolveBackupSuccessAt(folderState.latestValidBackup, stored, now),
    lastErrorAt: stored.lastErrorAt || null,
    lastErrorMessage: stored.lastErrorMessage || null,
    lastErrorCode: stored.lastErrorCode || null,
    lastErrorUserMessage: stored.lastErrorUserMessage || null,
    lastCleanupErrorAt: storedSuccessIsCurrent ? stored.lastCleanupErrorAt || null : null,
    lastCleanupErrorMessage: storedSuccessIsCurrent ? stored.lastCleanupErrorMessage || null : null,
    lastCleanupErrorCode: storedSuccessIsCurrent ? stored.lastCleanupErrorCode || null : null,
    lastCleanupErrorUserMessage: storedSuccessIsCurrent ? stored.lastCleanupErrorUserMessage || null : null,
    intervalDays,
    nextScheduledAt: folderState.nextScheduledAt,
    inProgress: isBackupInProgress()
  };
}

let backupStatusBroadcastGeneration = 0;
async function broadcastBackupStatus() {
  const generation = ++backupStatusBroadcastGeneration;
  const status = await getCurrentBackupStatus();
  if (generation !== backupStatusBroadcastGeneration) return status;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('backup:statusUpdated', status);
  }
  refreshTrayMenu(status);
  return status;
}

async function runBackup(force = false) {
  const operation = maybeRunAutoBackup({ getCurrentProject: () => currentProject }, force);
  // maybeRunAutoBackup setzt die zentrale Sperre synchron vor dem ersten await.
  // Dadurch können alle Oberflächen den laufenden Zustand sofort aus derselben
  // Statusquelle übernehmen.
  refreshTrayMenu({ inProgress: isBackupInProgress() });
  void broadcastBackupStatus().catch(error => {
    console.error('[Archiv Wiki] Backup-Status konnte nicht aktualisiert werden:', error?.message || error);
  });
  const result = await operation;
  return { ...result, status: await broadcastBackupStatus() };
}

// Erlaubte Startmodi für das Hauptfenster. Diese Einstellung ist bewusst
// app-weit (app-state.json), weil sie das Programmfenster und nicht den Inhalt
// eines einzelnen Wiki-Projekts betrifft.
const WINDOW_START_BEHAVIORS = new Set(['maximized', 'restore', 'centered']);

function getWindowStartBehavior() {
  const value = readAppState().windowStartBehavior;
  return WINDOW_START_BEHAVIORS.has(value) ? value : 'maximized';
}

function getRestoredWindowBounds() {
  const bounds = readAppState().mainWindowBounds;
  if (!bounds || !Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)
      || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return null;
  if (bounds.width < 960 || bounds.height < 600) return null;

  // Verhindert, dass ein gespeichertes Fenster nach einem Monitorwechsel
  // vollständig außerhalb aller aktuell verfügbaren Bildschirme erscheint.
  const visible = screen.getAllDisplays().some(({ workArea }) => {
    const overlapWidth = Math.max(0, Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x));
    const overlapHeight = Math.max(0, Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y));
    return overlapWidth >= 120 && overlapHeight >= 80;
  });
  return visible ? bounds : null;
}

function rememberMainWindowState() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
  const patch = { mainWindowMaximized: mainWindow.isMaximized() };
  if (!mainWindow.isMaximized() && !mainWindow.isFullScreen()) {
    patch.mainWindowBounds = mainWindow.getBounds();
  }
  writeAppState(patch);
}

// ---------------------------------------------------------------------------
// Fenster-Erstellung
// ---------------------------------------------------------------------------
function secureWindowNavigation(browserWindow, documentPath) {
  const handlers = createNavigationHandlers({
    appDocumentUrl: getAppDocumentUrl(documentPath),
    openExternal: url => shell.openExternal(url),
    // Keine URL aus möglicherweise fremdem Inhalt protokollieren. Der Fehler
    // ist für die Diagnose ausreichend, ohne persönliche Pfade preiszugeben.
    onExternalError: () => console.error('[Archiv Wiki] Externer Link konnte nicht geöffnet werden.')
  });
  browserWindow.webContents.setWindowOpenHandler(handlers.handleWindowOpen);
  browserWindow.webContents.on('will-navigate', handlers.handleWillNavigate);
}

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

  attachWindowDiagnostics(wizardWindow, 'wizard');
  wizardWindow.once('ready-to-show', () => wizardWindow.show());
  secureWindowNavigation(wizardWindow, rendererWizardPath);
  wizardWindow.loadFile(rendererWizardPath);
  wizardWindow.webContents.once('did-finish-load', () => wizardWindow?.webContents.send('update:statusChanged', getUpdateStatusSnapshot()));
  if (isDev) wizardWindow.webContents.openDevTools({ mode: 'detach' });

  // Wenn der Wizard geschlossen wird, OHNE dass ein Projekt fertig eingerichtet
  // wurde (kein Hauptfenster existiert), gibt es nichts mehr zu tun → App beenden.
  wizardWindow.on('closed', () => {
    wizardWindow = null;
    if (!mainWindow) app.quit();
  });
}

// Wird aufgerufen, sobald der Wizard ein Projekt fertig eingerichtet ODER ein
// bestehendes geöffnet hat (Erststart) — UND wiederverwendet für den Wiki-
// Wechsel über "Projektordner öffnen …" bei bereits laufendem Hauptfenster
// (M12). Reihenfolge beim Erststart wichtig: erst Hauptfenster erzeugen, DANN
// den Wizard schließen — sonst würde obiger 'closed'-Handler die App
// fälschlich beenden, weil mainWindow in dem Moment noch null wäre.
function handleProjectReady(projectPath, config) {
  console.log(`[Archiv Wiki] Projekt bereit: ${projectPath}`);
  currentProject = { path: projectPath, config: cloneProjectConfig(config) };
  syncLockStateFromProjectConfig();
  if (mainWindow && !mainWindow.isDestroyed()) {
    // Bereits laufendes Hauptfenster wechselt das Projekt: kompletter Reload
    // lädt den Renderer frisch, dessen init() den jetzt aktuellen
    // currentProject-Stand (siehe 'project:getCurrent') von Grund auf neu
    // aufbaut — keine zweite, parallele Projektwechsel-Logik nötig.
    mainWindow.webContents.reload();
    mainWindow.focus();
  } else {
    createMainWindow();
  }
  if (wizardWindow) {
    wizardWindow.close();
  }
}

function createMainWindow() {
  syncLockStateFromProjectConfig();
  const startBehavior = getWindowStartBehavior();
  const restoredBounds = startBehavior === 'restore' ? getRestoredWindowBounds() : null;
  // Passend zum gespeicherten Hell/Dunkel-Modus (siehe renderer/js/theme.js
  // applyThemeMode) — sonst würde bei "Hell" kurz die alte dunkle Fensterfarbe
  // aufblitzen, bevor der Renderer geladen hat und body.theme-light greift.
  // currentProject.config ist an jeder Aufrufstelle von createMainWindow()
  // bereits gesetzt (siehe handleProjectReady/'ready'-Handler/'activate').
  const isLightMode = currentProject?.config?.themeMode === 'light';
  mainWindow = new BrowserWindow({
    ...(restoredBounds || { width: 1280, height: 800 }),
    minWidth: 960,
    minHeight: 600,
    show: false, // erst zeigen, wenn Inhalt bereit ist (kein weißer Blitz)
    backgroundColor: isLightMode ? '#f5f4f2' : '#0a0d12', // Theme-Hintergrund aus styles.css --bg-color
    // Eigene Titelleiste (Custom Window Chrome): frame:false entfernt sowohl
    // die native KDE/KWin-Fensterdekoration als auch Electrons native
    // Menüzeile unter Linux — renderer/index.html rendert stattdessen den
    // einzigen sichtbaren oberen Fensterbereich (.app-titlebar) inklusive
    // Fenstersteuerung und Menüzugriff (siehe renderer/js/app.js, Abschnitt
    // "Titelleiste", sowie window:*-IPC weiter unten). autoHideMenuBar
    // entfällt dadurch — es gibt keine native Menüzeile mehr, die sie
    // ein-/ausblenden könnte.
    frame: false,
    icon: resolveNativeAssetPath('assets/icons/512x512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });

  attachWindowDiagnostics(mainWindow, 'main');

  mainWindow.once('ready-to-show', () => {
    if (startBehavior === 'maximized') mainWindow.maximize();
    else if (startBehavior === 'centered') mainWindow.center();
    else if (startBehavior === 'restore' && readAppState().mainWindowMaximized) mainWindow.maximize();
    mainWindow.show();
    mainWindow.focus();
  });

  // Ladefehler NIE stillschweigend verschlucken — im Terminal sichtbar machen.
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[Archiv Wiki] Ladefehler (${code}) ${desc} — ${url}`);
  });
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (isDev) console.log(`[Renderer] ${message} (${sourceId}:${line})`);
  });

  // Entwicklertools dürfen bei aktivem App-Passwortschutz nie offen stehen: sie
  // liegen außerhalb des Renderer-Dokuments, wären vom Sperrbildschirm also
  // nicht abgedeckt und böten über die Preload-API einen Weg an der Sperre
  // vorbei. Bewusst als Ereignis-Wächter und bewusst VOR dem openDevTools()
  // weiter unten registriert: das Öffnen schließt asynchron ab, und beim
  // Programmstart mit aktivem Schutz steht die Sperre bereits vorher fest.
  mainWindow.webContents.on('devtools-opened', () => {
    if (appLocked) mainWindow?.webContents.closeDevTools();
  });

  secureWindowNavigation(mainWindow, rendererIndexPath);
  mainWindow.loadFile(rendererIndexPath);
  mainWindow.webContents.once('did-finish-load', () => mainWindow?.webContents.send('update:statusChanged', getUpdateStatusSnapshot()));

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });

  // Rechtschreibprüfung (Nutzer-Feature): nutzt Electrons EINGEBAUTES,
  // natives Spellcheck (dieselben Chromium-Wörterbücher wie in jedem
  // Chrome/Edge) statt einer eigenen Bibliothek. webPreferences.spellcheck:
  // true (oben) sorgt für die roten Wellenlinien unter falsch geschriebenen
  // Wörtern, ganz ohne eigenen Code — das läuft automatisch in JEDEM
  // editierbaren Bereich, inklusive CodeMirrors Editor-Fläche (siehe auch
  // die contentAttributes-Erweiterung in build/editor-entry.js, ohne die
  // CodeMirror die Prüfung für sein eigenes Textfeld selbst deaktiviert
  // hätte). Standardsprache Deutsch, später um weitere Sprachen erweiterbar
  // (siehe session.availableSpellCheckerLanguages).
  // Rückbau: Korrekturvorschläge im eigenen Rechtsklick-Menü (über Electrons
  // context-menu-Ereignis) wieder entfernt — ließ sich nicht zuverlässig zum
  // Laufen bringen. Nur die Wellenlinien selbst bleiben, unverändert.
  mainWindow.webContents.session.setSpellCheckerLanguages(['de']);
  // Anfänglichen Zustand aus der Projekt-Konfiguration übernehmen, falls
  // der Nutzer die Prüfung zuvor schon einmal deaktiviert hatte — Standard
  // ist an (true), wenn noch nie ein Wert gespeichert wurde.
  mainWindow.webContents.session.setSpellCheckerEnabled(currentProject?.config?.editor?.spellcheck !== false);

  // Zentrale Schließen-Logik: liest die gespeicherte Einstellung
  // (main/close-behavior.js) und entscheidet, ob gefragt, minimiert oder
  // wirklich beendet wird. isQuitting bleibt die Ausnahme für "wirklich
  // beenden" (Tray-Menü, Strg+Q, usw.).
  // Reaktiviert (war vorübergehend deaktiviert, bis das Tray-Icon-Problem aus
  // das frühere Tray-Icon-Problem nachweislich behoben war — inzwischen per echtem Build-Test
  // bestätigt, siehe createTray()): ohne diesen Handler griff Electrons
  // Standardverhalten beim X-Klick (Fenster wird tatsächlich zerstört,
  // window-all-closed beendet danach den kompletten Prozess) — die
  // "Auf System-Tray minimieren"-Einstellung wurde dadurch nie gelesen.
  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    handleCloseRequest();
  });

  // Entwicklertools dürfen bei aktivem App-Passwortschutz nie offen stehen: sie
  // liegen außerhalb des Renderer-Dokuments, wären vom Sperrbildschirm also
  // nicht abgedeckt und böten über die Preload-API einen Weg an der Sperre
  // vorbei. Als Ereignis-Wächter statt nur einmalig beim Sperren, weil das
  // Öffnen selbst asynchron abschließt — beim Programmstart mit aktivem Schutz
  // steht die Sperre bereits fest, bevor die Entwicklertools fertig geöffnet sind.
  let rememberWindowTimer = null;
  const scheduleRememberWindowState = () => {
    clearTimeout(rememberWindowTimer);
    rememberWindowTimer = setTimeout(rememberMainWindowState, 250);
  };
  mainWindow.on('resize', scheduleRememberWindowState);
  mainWindow.on('move', scheduleRememberWindowState);
  mainWindow.on('maximize', scheduleRememberWindowState);
  mainWindow.on('unmaximize', scheduleRememberWindowState);

  // Eigene Titelleiste: der sichtbare Maximieren/Wiederherstellen-Knopf muss
  // auch dann synchron bleiben, wenn sich der Fensterzustand NICHT über den
  // Knopf selbst ändert (z. B. KWin-Tastenkürzel, Fenster-Snapping,
  // Doppelklick auf die Drag-Fläche — siehe app.js). Einzige Quelle der
  // Wahrheit bleibt mainWindow.isMaximized(); dieses Ereignis benachrichtigt
  // den Renderer nur zusätzlich darüber.
  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximizedChanged', true));
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximizedChanged', false));

  mainWindow.on('closed', () => {
    clearTimeout(rememberWindowTimer);
    mainWindow = null;
  });
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

// Zentrale Beenden-Sequenz. Ein laufendes Backup darf seinen temporären
// Schreibvorgang zunächst sauber abschließen; bleibt es hängen, bricht das
// Backup-Modul ausschließlich die Temp-Datei kontrolliert ab und räumt sie
// auf. Mehrfaches Beenden startet keine parallelen Beenden-Abläufe.
let quitInProgress = false;
async function quitCleanly() {
  if (quitInProgress) return;
  quitInProgress = true;
  try {
    await finishBackupBeforeQuit();

    // Der Sync-Bereich besitzt weiterhin seine eigene bestehende Warte-Logik;
    // diese Phase verändert ausschließlich die Backup-Sicherheit.
    const syncStart = Date.now();
    while (isSyncInProgress() && Date.now() - syncStart < 5000) {
      await new Promise(r => setTimeout(r, 100));
    }
  } finally {
    isQuitting = true;
    app.quit();
  }
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
          id: 'file.openProject',
          label: 'Projektordner öffnen …',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            // Restliche Ablauf (Dirty-Schutz, Ordnerdialog, Projektwechsel)
            // läuft im Renderer über denselben Weg wie der Erststart-Wizard
            // (dialog:selectDirectory + wizard:openExisting → handleProjectReady).
            mainWindow?.webContents.send('menu:open-project');
          }
        },
        { type: 'separator' },
        {
          id: 'file.exportZip',
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
        { id: 'file.quit', label: 'Beenden', accelerator: 'CmdOrCtrl+Q', click: () => quitCleanly() }
      ]
    },
    {
      label: 'Bearbeiten',
      submenu: [
        { id: 'edit.undo', role: 'undo', label: 'Rückgängig' },
        { id: 'edit.redo', role: 'redo', label: 'Wiederholen' },
        { type: 'separator' },
        { id: 'edit.cut', role: 'cut', label: 'Ausschneiden' },
        { id: 'edit.copy', role: 'copy', label: 'Kopieren' },
        { id: 'edit.paste', role: 'paste', label: 'Einfügen' },
        { id: 'edit.selectAll', role: 'selectAll', label: 'Alles auswählen' },
        { type: 'separator' },
        {
          id: 'edit.findReplace',
          label: 'Suchen und Ersetzen …',
          click: () => {
            mainWindow?.webContents.send('menu:open-find-replace');
          }
        }
      ]
    },
    {
      label: 'Ansicht',
      submenu: [
        { id: 'view.reload', role: 'reload', label: 'Neu laden' },
        { id: 'view.devTools', role: 'toggleDevTools', label: 'Entwicklertools' },
        { type: 'separator' },
        { id: 'view.fullscreen', role: 'togglefullscreen', label: 'Vollbild' }
      ]
    },
    {
      label: 'Hilfe',
      submenu: [
        {
          id: 'help.shortcuts',
          label: 'Tastenkürzel',
          click: () => {
            if (!mainWindow || mainWindow.isDestroyed()) return;
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send('menu:show-shortcuts');
          }
        },
        { type: 'separator' },
        {
          id: 'help.about',
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

  // Referenz behalten (statt Menu.setApplicationMenu(Menu.buildFromTemplate(...))
  // inline) — dieselben Menü-/MenuItem-Objekte werden von 'window:popupMenu'
  // weiter unten als natives Popup-Menü der eigenen Titelleiste geöffnet.
  // setApplicationMenu() bleibt zusätzlich nötig: es registriert die
  // Tastenkürzel (Accelerators) app-weit, unabhängig davon, dass die native
  // Menüzeile bei frame:false gar nicht mehr sichtbar gerendert wird.
  appMenu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(appMenu);
  applyMenuLockState();
}

// Bei aktivem App-Passwortschutz dürfen weder die Menüeinträge selbst noch ihre
// app-weit registrierten Accelerators laufen — sonst wären Projektwechsel,
// Export, Suchen/Ersetzen, Neu laden, Entwicklertools und die Hilfe-Einträge
// trotz Sperrbildschirm per Tastenkürzel erreichbar. Ausgenommen bleiben
// bewusst nur die Standard-Bearbeiten-Rollen: sie wirken immer auf das gerade
// fokussierte Element, und im gesperrten Zustand ist das ausschließlich das
// Passwortfeld (der gesamte App-Bereich ist dann inert, siehe app.js). Dadurch
// bleibt das Einfügen eines Passworts aus einem Passwortmanager möglich, ohne
// dass eine Bearbeiten-Aktion je Wiki-Inhalt erreicht.
const MENU_ROLES_ALLOWED_WHILE_LOCKED = new Set(['undo', 'redo', 'cut', 'copy', 'paste', 'selectall']);

function applyMenuLockState() {
  if (!appMenu) return;
  for (const topLevelItem of appMenu.items) {
    if (!topLevelItem.submenu) continue;
    for (const item of topLevelItem.submenu.items) {
      if (item.type === 'separator') continue;
      const role = typeof item.role === 'string' ? item.role.toLowerCase() : null;
      item.enabled = !appLocked || (role !== null && MENU_ROLES_ALLOWED_WHILE_LOCKED.has(role));
    }
  }
  // Electron übernimmt geänderte enabled-Flags erst mit einem erneuten
  // setApplicationMenu() zuverlässig in die registrierten Accelerators.
  Menu.setApplicationMenu(appMenu);
}

// Einzige Stelle, die den maßgeblichen Sperrzustand des Hauptprozesses ändert.
// Beim Sperren werden zusätzlich bereits offene Entwicklertools geschlossen —
// sie liegen außerhalb des Renderer-Dokuments, ließen sich vom Sperrbildschirm
// also nicht abdecken und böten über die Preload-API (u. a. Notiz-Lesezugriff)
// sonst einen Weg an der Sperre vorbei.
function setMainProcessLockState(locked) {
  const next = Boolean(locked);
  const changed = appLocked !== next;
  appLocked = next;
  if (changed) {
    applyMenuLockState();
    refreshTrayMenu();
  }
  // Bewusst NICHT an "changed" gebunden: beim Programmstart mit aktivem Schutz
  // steht der Sperrzustand schon fest, bevor createMainWindow() das Fenster
  // (und im Entwicklungsmodus dessen Entwicklertools) überhaupt erzeugt hat.
  // Erst die spätere 'app:lockNow'-Meldung des Renderers trifft ein geöffnetes
  // Fenster an — dieser Aufruf muss dann trotz unveränderten Zustands schließen.
  if (appLocked && mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.isDevToolsOpened()) {
    mainWindow.webContents.closeDevTools();
  }
}

// Beim Öffnen eines Projekts (Start oder Projektwechsel) gilt ein aktivierter
// App-Passwortschutz sofort — noch bevor der Renderer geladen ist und seinen
// Sperrbildschirm zeigen kann. Ohne das wären Menü und Accelerators im
// Startfenster kurzzeitig benutzbar.
function syncLockStateFromProjectConfig() {
  setMainProcessLockState(Boolean(currentProject?.config?.appLock?.enabled));
}

// ---------------------------------------------------------------------------
// IPC — Kern-Kanäle (App-Info, generischer Dialog, aktuelles Projekt).
// Dateisystem-Kanäle stehen in main/filesystem-ipc.js, Wizard-Kanäle in
// main/wizard-ipc.js. Suche/Export/Sync kommen in Schritt 6 als eigenes Modul.
// ---------------------------------------------------------------------------
function registerCoreIpc() {
  ipcMain.handle('app:getVersion', () => app.getVersion());

  // Rechtschreibprüfung an-/abschalten (Nutzer-Feature, Einstellungen →
  // Editor) — direkt über Electrons Session-API, kein Neustart nötig.
  ipcMain.handle('app:setSpellCheckEnabled', (_e, enabled) => {
    mainWindow?.webContents.session.setSpellCheckerEnabled(Boolean(enabled));
    return { enabled: Boolean(enabled) };
  });
  ipcMain.handle('app:getSpellCheckEnabled', () => mainWindow?.webContents.session.isSpellCheckerEnabled() ?? true);

  ipcMain.handle('app:getPlatformInfo', () => ({
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }));


  // Lokale Diagnoseberichte: ausschließlich der Main-Prozess schreibt und
  // liest die Berichtdateien. Der Renderer erhält nur bereits anonymisierte
  // Berichtsdaten beziehungsweise den formatierten Text; es existiert kein
  // Upload- oder Telemetriekanal.
  ipcMain.handle('diagnostics:getSummary', () => diagnostics.getSummary());
  ipcMain.handle('diagnostics:listReports', () => diagnostics.listReports());
  ipcMain.handle('diagnostics:getReport', (_event, reportId) => diagnostics.getReport(reportId));
  ipcMain.handle('diagnostics:markNotified', (_event, reportId) => diagnostics.markNotified(reportId));
  ipcMain.handle('diagnostics:createManual', async () => diagnostics.createManual({
    runtime: await buildManualDiagnosticsRuntime()
  }));
  ipcMain.handle('diagnostics:reportRendererError', (_event, payload = {}) => {
    const type = payload?.type === 'unhandled-rejection' ? 'unhandled-rejection' : 'uncaught-error';
    return recordAutomaticDiagnostic({
      source: 'renderer',
      kind: type,
      title: type === 'unhandled-rejection' ? 'Unbehandelter Renderer-Fehler' : 'Renderer-Fehler',
      message: typeof payload?.message === 'string' ? payload.message : 'Unbekannter Renderer-Fehler',
      stack: typeof payload?.stack === 'string' ? payload.stack : null,
      details: {
        filename: typeof payload?.filename === 'string' ? payload.filename : null,
        line: Number.isFinite(payload?.line) ? payload.line : null,
        column: Number.isFinite(payload?.column) ? payload.column : null
      }
    });
  });

  // Flüchtiger Laufzeitstatus des lokalen Web-Clip-Empfangs. Diese Anzeige
  // speichert nichts dauerhaft und verändert weder Native Messaging noch den
  // Clip-Vertrag; sie macht im Einstellungsfenster nur sichtbar, ob der
  // vorhandene Empfänger bereit ist und wann zuletzt ein Browserkontakt war.
  ipcMain.handle('app:getWebClipperStatus', () => webClipReceiver?.getStatus?.() || ({
    receiverReady: false,
    browserConnected: false,
    lastBrowserConnectionAt: null,
    lastClipAt: null,
    lastError: null
  }));

  // Backup-Warnung-Feature: Anzahl aufeinanderfolgender fehlgeschlagener
  // automatischer Backups (siehe main/backup.js) — ab 3 in Folge zeigt die
  // App eine sichtbare Warnung, statt dass es unbemerkt weiter fehlschlägt.
  ipcMain.handle('app:getBackupStatus', async () => getCurrentBackupStatus());

  // "Backup jetzt erstellen"-Button im neuen Einstellungsfenster — erzwingt
  // ein Backup unabhängig vom Intervall. Bugfix (Audit-Punkt 3): löschte
  // vorher das heutige Backup per fs.unlinkSync, BEVOR das neue überhaupt
  // erfolgreich war — bei vollem Datenträger war dadurch auch das alte,
  // funktionierende Backup weg. maybeRunAutoBackup(..., force: true) schreibt
  // jetzt selbst erst in eine temporäre Datei und ersetzt nur bei Erfolg.
  ipcMain.handle('app:runBackupNow', async () => runBackup(true));

  // "Backup-Ordner öffnen"-Button — zeigt den Ordner im Dateimanager des Systems.
  ipcMain.handle('app:openBackupFolder', async () => {
    const backupPath = currentProject?.config?.backupPath;
    if (!backupPath) {
      return { opened: false, error: 'Es wurde noch kein Backup-Ordner ausgewählt.' };
    }
    try {
      const errorMessage = await shell.openPath(backupPath);
      if (errorMessage) return { opened: false, error: errorMessage };
      return { opened: true };
    } catch (error) {
      return { opened: false, error: error?.message || 'Der Backup-Ordner konnte nicht geöffnet werden.' };
    }
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
      // Bugfix (Audit-Punkt 7): fs.cpSync ist synchron/blockierend — bei
      // einem großen Wiki (viele Notizen/Anhänge) würde das die KOMPLETTE
      // App für die Dauer des Kopiervorgangs einfrieren, nicht nur diesen
      // Dialog. fs.promises.cp erledigt dieselbe rekursive Kopie asynchron.
      await fs.promises.cp(oldPath, newPath, { recursive: true });
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
  ipcMain.handle('app:getWindowStartBehavior', () => getWindowStartBehavior());
  ipcMain.handle('app:setWindowStartBehavior', (_e, value) => {
    if (!WINDOW_START_BEHAVIORS.has(value)) throw new Error('Ungültiges Fenster-Startverhalten.');
    rememberMainWindowState();
    writeAppState({ windowStartBehavior: value });
    return value;
  });

  // Bugfix (Nutzer-Meldung: "Einfügen" im Rechtsklick-Menü funktioniert nicht,
  // besonders aus anderen Programmen): Electrons clipboard-Modul ist in einem
  // sandbox:true-Preload-Skript NICHT verfügbar (real mit der hier
  // verwendeten Electron-Version 28.3.3 getestet: clipboard ist dort
  // schlicht undefined) — deshalb hier im Hauptprozess, wo es unabhängig von
  // der Sandbox-Einstellung des Renderers IMMER verfügbar ist, und per IPC
  // an den Renderer weitergereicht. Normales Kopieren/Einfügen per
  // Tastenkürzel funktionierte davon unabhängig schon immer, da Chromium das
  // für editierbare Bereiche selbst nativ regelt — nur die eigene
  // Rechtsklick-Menü-Funktion war betroffen.
  ipcMain.handle('clipboard:writeText', (_e, text) => clipboard.writeText(text));
  ipcMain.handle('clipboard:readText', () => clipboard.readText());
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

  // ---------------------------------------------------------------------
  // Eigene Titelleiste (Custom Window Chrome) — eng begrenzte Fensteraktionen
  // für renderer/js/app.js, kein genereller Electron-/Node-Zugriff (siehe
  // preload.js windowControls.*). "Schließen" ruft bewusst mainWindow.close()
  // auf statt app.quit(): das löst denselben bestehenden 'close'-Ereignis-
  // Ablauf aus (siehe mainWindow.on('close', ...) in createMainWindow()) wie
  // bisher ein Klick auf den nativen X-Button — Rückfrage/Tray/Beenden-
  // Verhalten (handleCloseRequest()) bleibt dadurch vollständig erhalten,
  // kein zweiter, abgekürzter Beenden-Weg.
  // ---------------------------------------------------------------------
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:toggleMaximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.handle('window:close', () => mainWindow?.close());
  ipcMain.handle('window:isMaximized', () => Boolean(mainWindow?.isMaximized()));
  // Öffnet EINES der vier bestehenden Menü-Objekte aus buildMenu() als
  // natives Popup an der von der Titelleiste übergebenen Fensterposition —
  // keine zweite, selbstgebaute HTML-Menüdarstellung für Datei/Bearbeiten/
  // Ansicht/Hilfe.
  ipcMain.handle('window:popupMenu', (_e, label, x, y) => {
    if (!mainWindow || !appMenu) return;
    // Bei aktivem Sperrbildschirm kein natives Popup-Menü öffnen: es liegt
    // außerhalb des Renderer-Dokuments und wäre vom Sperrbildschirm weder
    // verdeckt noch durch dessen inert-Bereiche blockiert.
    if (appLocked) return;
    const item = appMenu.items.find((entry) => entry.label === label);
    if (item?.submenu) item.submenu.popup({ window: mainWindow, x: Math.round(x), y: Math.round(y) });
  });

  // Das Anwendungsmenü der eigenen Titelleiste wird im Renderer als HTML
  // dargestellt (nur so lässt es sich überhaupt einfärben und per Mouseover
  // bedienen — ein natives Popup nimmt die Mauseingabe an sich). Damit dabei
  // KEINE zweite Menüdefinition entsteht, liest der Renderer die Struktur aus
  // genau denselben MenuItem-Objekten, die buildMenu() erzeugt hat: Beschriftung,
  // Kürzel, Trenner und der aktuelle Aktiv-Zustand (den applyMenuLockState()
  // bei gesperrter App setzt) kommen unverändert von hier.
  ipcMain.handle('window:getMenuStructure', () => {
    if (!appMenu) return [];
    return appMenu.items
      .filter((topLevel) => topLevel.submenu)
      .map((topLevel) => ({
        label: topLevel.label,
        enabled: topLevel.enabled !== false,
        items: topLevel.submenu.items.map((item) => (item.type === 'separator'
          ? { type: 'separator' }
          : {
            id: item.id || null,
            label: item.label,
            accelerator: item.accelerator || null,
            enabled: item.enabled !== false
          }))
      }));
  });

  // Führt einen Menüeintrag aus. Die neun Systemeinträge (Rückgängig … Vollbild)
  // waren als native "role" definiert; Electron erledigt sie sonst selbst beim
  // Klick im nativen Menü. Da das Menü jetzt HTML ist, wird jede Rolle hier
  // ausdrücklich auf ihre Entsprechung abgebildet, statt sich auf ein internes
  // Klickverhalten von MenuItem zu verlassen. Alle übrigen Einträge rufen
  // unverändert genau den click()-Handler aus buildMenu() auf.
  ipcMain.handle('window:invokeMenuItem', (_e, id) => {
    if (appLocked) return { invoked: false, reason: 'locked' };
    if (typeof id !== 'string' || !appMenu) return { invoked: false, reason: 'unknown' };
    const item = appMenu.getMenuItemById(id);
    if (!item || item.enabled === false) return { invoked: false, reason: 'disabled' };
    const contents = mainWindow?.webContents;
    switch (item.role) {
      case 'undo': contents?.undo(); break;
      case 'redo': contents?.redo(); break;
      case 'cut': contents?.cut(); break;
      case 'copy': contents?.copy(); break;
      case 'paste': contents?.paste(); break;
      case 'selectAll': contents?.selectAll(); break;
      case 'reload': contents?.reload(); break;
      case 'toggleDevTools': contents?.toggleDevTools(); break;
      case 'togglefullscreen':
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setFullScreen(!mainWindow.isFullScreen());
        break;
      default:
        if (typeof item.click === 'function') item.click(item, mainWindow, {});
        else return { invoked: false, reason: 'no-action' };
    }
    return { invoked: true };
  });

  // Automatisches Update-System (Nutzer-Feature) — nutzt electron-updater
  // direkt auf dem bestehenden GitHub-Releases-Ablauf (derselbe
  // "provider: github, owner: Smashinger, repo: Archiv-Wiki"-Block, den
  // package.json für "npm run release" ohnehin schon hat, siehe build.publish
  // weiter unten in dieser Datei nicht — das Feld existiert nur in der
  // Quell-package.json, electron-updater liest es zur Build-Zeit über
  // electron-builder, nicht zur Laufzeit). Ersetzt den vorherigen, selbst
  // geschriebenen Roh-HTTPS-Aufruf gegen die GitHub-API — electron-updater
  // übernimmt jetzt sowohl die Prüfung als auch (nach ausdrücklicher
  // Zustimmung) das Herunterladen/Installieren, keine zweite, parallele
  // Update-Logik.
  //
  // WICHTIG, bewusste Entscheidung: autoDownload UND autoInstallOnAppQuit
  // bleiben IMMER false. WANN heruntergeladen wird, entscheidet weiter unten
  // unsere eigene, einstellungsgesteuerte Logik — installiert/neu gestartet
  // wird NIEMALS ohne ausdrücklichen Klick des Nutzers. Das ist keine
  // Einstellung, sondern eine feste Regel dieses Programms.
  // Konfiguration und Ereignis-Verdrahtung nur, wenn electron-updater beim
  // Programmstart tatsächlich geladen werden konnte (siehe try/catch um den
  // require-Aufruf am Dateianfang) — ist autoUpdater null, bleibt das
  // Update-System für diese Sitzung einfach inaktiv, ohne die App am Start
  // zu hindern. Jeder IPC-Handler weiter unten prüft das ebenfalls einzeln.
  if (autoUpdater) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    // electron-log wäre eine zusätzliche Abhängigkeit gewesen, nur für
    // Logging — für ein Projekt dieser Größe reicht die normale Ausgabe.
    autoUpdater.logger = {
      info: (...args) => console.log('[Archiv Wiki] [Update]', ...args),
      warn: (...args) => console.warn('[Archiv Wiki] [Update]', ...args),
      error: (...args) => console.error('[Archiv Wiki] [Update]', ...args)
    };

    // Jedes autoUpdater-Ereignis ist von Haus aus asynchron — darf unter
    // keinen Umständen die App zum Absturz bringen, egal was schiefgeht
    // (Netzwerk weg, GitHub nicht erreichbar, Download abgebrochen, ...).
    autoUpdater.on('error', (err) => {
      const technicalMessage = err?.message || String(err || 'Unbekannter Update-Fehler.');
      const installWasRunning = updateInstallInProgress;
      const downloadWasRunning = updateDownloadInProgress;
      console.error('[Archiv Wiki] Update-Fehler:', technicalMessage);

      if (installWasRunning) {
        updateInstallInProgress = false;
        // Das bereits vollständig heruntergeladene Update bleibt erneut
        // installierbar, solange electron-updater keinen neuen Download
        // verlangt. So ist ein erneuter ausdrücklicher Versuch möglich.
        updateReadyToInstall = true;
        isQuitting = false;
        if (!app.hasSingleInstanceLock()) {
          const lockRestored = app.requestSingleInstanceLock();
          if (!lockRestored) {
            console.error('[Archiv Wiki] Single-Instance-Lock konnte nach fehlgeschlagener Update-Installation nicht wiederhergestellt werden.');
          }
        }
        const translated = translateUpdateError(err, 'install');
        setUpdateStatus({
          phase: 'error',
          installReady: true,
          errorType: 'install',
          errorCategory: translated.type,
          errorMessage: translated.message,
          errorDetails: translated.details
        });
        mainWindow?.webContents.send('update:error', {
          stage: 'install', message: updateStatus.errorMessage, details: technicalMessage
        });
        return;
      }

      if (downloadWasRunning) {
        updateDownloadInProgress = false;
        const translated = translateUpdateError(err, 'download');
        setUpdateStatus({
          phase: 'error', downloadPercent: null, installReady: false,
          errorType: 'download', errorCategory: translated.type, errorMessage: translated.message, errorDetails: translated.details
        });
        mainWindow?.webContents.send('update:error', {
          stage: 'download', message: updateStatus.errorMessage, details: technicalMessage
        });
      }
      // Prüfungsfehler werden vom gemeinsamen runUpdateCheck()-Promise an
      // den jeweiligen Aufrufer zurückgegeben und hier nicht als Download-
      // oder Installationsfehler fehlklassifiziert.
    });
    autoUpdater.on('checking-for-update', () => {
      if (!updateDownloadInProgress && !updateReadyToInstall && !updateInstallInProgress) {
        setUpdateStatus({ phase: 'checking', errorType: null, errorMessage: null, errorDetails: null, errorCategory: null });
      }
    });
    autoUpdater.on('update-not-available', () => {
      if (!updateDownloadInProgress && !updateReadyToInstall && !updateInstallInProgress) {
        setUpdateStatus({
          phase: 'upToDate', availableVersion: null, releaseUrl: getUpdateReleaseUrl(),
          downloadPercent: null, installReady: false, errorType: null, errorMessage: null, errorDetails: null,
          errorCategory: null
        });
      }
    });
    autoUpdater.on('update-available', (info) => {
      setUpdateStatus({
        phase: 'updateAvailable', availableVersion: info.version || null,
        releaseUrl: getUpdateReleaseUrl(info.version || null), downloadPercent: null,
        installReady: false, errorType: null, errorMessage: null, errorDetails: null,
        errorCategory: null
      });
      mainWindow?.webContents.send('update:available', { version: info.version });
      // "Updates automatisch herunterladen" (Standard: an) UND "vor dem
      // Herunterladen nachfragen" (Standard: aus) zusammen entscheiden, ob
      // der Download sofort im Hintergrund losläuft oder der Nutzer zuerst
      // gefragt wird — zeigt der Renderer in dem Fall die "Verfügbar"-
      // Meldung selbst.
      const state = readAppState();
      const autoDownload = state.updateAutoDownload !== false;
      const confirmFirst = state.updateConfirmBeforeDownload === true;
      if (autoDownload && !confirmFirst) {
        startUpdateDownload().catch((err) => {
          // startUpdateDownload fängt technische Downloadfehler selbst ab;
          // dieser Catch schützt nur vor unerwarteten Programmierfehlern.
          console.error('[Archiv Wiki] Automatisches Herunterladen konnte nicht gestartet werden:', err?.message || err);
        });
      }
    });
    autoUpdater.on('download-progress', (progress) => {
      const percent = Math.max(0, Math.min(100, Math.round(progress.percent || 0)));
      setUpdateStatus({ phase: 'downloading', downloadPercent: percent, installReady: false, errorType: null, errorMessage: null, errorDetails: null, errorCategory: null });
      mainWindow?.webContents.send('update:download-progress', { percent });
    });
    autoUpdater.on('update-downloaded', () => {
      updateDownloadInProgress = false;
      if (!updateInstallInProgress) updateReadyToInstall = true;
      setUpdateStatus({ phase: 'downloaded', downloadPercent: 100, installReady: true, errorType: null, errorMessage: null, errorDetails: null, errorCategory: null });
      mainWindow?.webContents.send('update:downloaded');
    });

    // electron-updater emittiert dieses Ereignis nach quitAndInstall(). Es
    // markiert den besonderen Update-Beendenpfad ausdrücklich, damit normale
    // Tray-/Fenster-Schließen-Logik und der allgemeine before-quit-Handler
    // den Installationsablauf nicht umlenken.
    autoUpdater.on('before-quit-for-update', () => {
      updateInstallInProgress = true;
      isQuitting = true;
      setUpdateStatus({ phase: 'installing', installReady: true, errorType: null, errorMessage: null, errorDetails: null, errorCategory: null });
    });
  }

  // Weiterhin dieselbe Rückgabe-Form wie vorher ({currentVersion,
  // latestVersion, updateAvailable, releaseUrl}) — Sidebar, Wizard und
  // Einstellungsfenster (alle über renderer/js/update-check.js) laufen
  // dadurch unverändert weiter, ganz ohne dort etwas anpassen zu müssen.
  ipcMain.handle('app:getUpdateStatus', () => getUpdateStatusSnapshot());

  ipcMain.handle('app:checkForUpdate', async () => {
    try {
      await runUpdateCheck();
    } catch (err) {
      console.error('[Archiv Wiki] Update-Check fehlgeschlagen:', err?.message || err);
    }
    return getUpdateStatusSnapshot();
  });

  // Manuelles Auslösen des Downloads — genutzt, wenn der Nutzer auf die
  // "Verfügbar"-Meldung mit "Jetzt herunterladen" reagiert (siehe Einstellung
  // "vor dem Herunterladen nachfragen"), oder als Absicherung, falls der
  // automatische Download (oben) aus irgendeinem Grund nicht gestartet ist.
  ipcMain.handle('app:downloadUpdate', () => startUpdateDownload());

  // Installation + Neustart — AUSSCHLIESSLICH auf ausdrücklichen Klick hin
  // aufgerufen (siehe renderer), niemals von selbst. isQuitting wird bewusst
  // gesetzt, damit die bestehende Schließen-Logik (Tray verstecken/nachfragen,
  // siehe weiter oben) hier nicht dazwischenfunkt — ein Update-Neustart soll
  // immer ein echter, vollständiger Neustart sein.
  ipcMain.handle('app:installUpdateAndRestart', async () => {
    if (!autoUpdater) return { started: false, reason: 'updater-unavailable', error: 'Das Update-System ist derzeit nicht verfügbar.' };
    if (updateInstallInProgress) return { started: false, reason: 'installation-in-progress', error: 'Die Update-Installation läuft bereits.' };
    if (!updateReadyToInstall) return { started: false, reason: 'update-not-ready', error: 'Das Update ist noch nicht zur Installation bereit.' };
    if (updateDownloadInProgress || updateDownloadPromise) return { started: false, reason: 'download-in-progress', error: 'Das Update wird noch heruntergeladen.' };

    updateInstallInProgress = true;
    setUpdateStatus({ phase: 'installing', installReady: true, errorType: null, errorMessage: null, errorDetails: null, errorCategory: null });
    try {
      // Vor dem besonderen Updater-Beendenpfad dieselben kritischen Arbeiten
      // sauber abschließen, die auch der normale Beenden-Ablauf berücksichtigt.
      await finishBackupBeforeQuit();
      const syncStart = Date.now();
      while (isSyncInProgress() && Date.now() - syncStart < 5000) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      isQuitting = true;
      autoUpdater.autoRunAppAfterInstall = true;

      // AppImage startet die neue Version im Rahmen von quitAndInstall(). Der
      // alte Prozess kann zu diesem Zeitpunkt noch leben; deshalb den Lock
      // unmittelbar vorher freigeben, damit der neue Prozess nicht als zweite
      // Instanz beendet wird.
      if (app.hasSingleInstanceLock()) app.releaseSingleInstanceLock();

      // electron-updater 6.8.9: quitAndInstall(isSilent, isForceRunAfter).
      // Nicht-stille Installation plus ausdrücklich erzwungener Neustart;
      // kein paralleles app.relaunch(), weil der Updater den Neustart trägt.
      autoUpdater.quitAndInstall(false, true);
      return { started: true };
    } catch (err) {
      updateInstallInProgress = false;
      updateReadyToInstall = true;
      isQuitting = false;
      if (!app.hasSingleInstanceLock()) app.requestSingleInstanceLock();
      const details = err?.message || String(err);
      console.error('[Archiv Wiki] Update-Installation konnte nicht gestartet werden:', details);
      const translated = translateUpdateError(err, 'install');
      setUpdateStatus({
        phase: 'error', installReady: true, errorType: 'install', errorCategory: translated.type,
        errorMessage: translated.message, errorDetails: translated.details
      });
      mainWindow?.webContents.send('update:error', {
        stage: 'install', message: updateStatus.errorMessage, details
      });
      return {
        started: false,
        reason: 'install-start-failed',
        error: translated.message,
        details: translated.details
      };
    }
  });


  // Update-Einstellungen: app-weit (main/app-state.js), nicht pro Projekt —
  // exakt dasselbe Muster wie das bestehende Schließen-Verhalten
  // (app:getCloseBehavior/app:setCloseBehavior weiter unten), da es sich um
  // eine Eigenschaft der Installation handelt, nicht eines einzelnen Wikis.
  ipcMain.handle('app:getUpdateSettings', () => {
    const state = readAppState();
    return {
      checkOnStart: state.updateCheckOnStart !== false,
      autoDownload: state.updateAutoDownload !== false,
      confirmBeforeDownload: state.updateConfirmBeforeDownload === true,
      lastCheckAt: state.lastUpdateCheckAt || null
    };
  });
  ipcMain.handle('app:setUpdateSetting', (_e, key, value) => {
    // Bewusst eine feste Positivliste statt eines beliebigen Schlüssels —
    // verhindert, dass über diesen Kanal versehentlich (oder böswillig)
    // andere, nicht update-bezogene app-state-Felder überschrieben werden.
    const allowed = ['updateCheckOnStart', 'updateAutoDownload', 'updateConfirmBeforeDownload'];
    if (!allowed.includes(key)) return { saved: false };
    writeAppState({ [key]: value });
    return { saved: true };
  });

  // App-Passwortschutz: Passwort selbst wird nie gespeichert, nur Salt+Hash
  // (siehe main/wizard-ipc.js beim Setzen). Der eigentliche Vergleich läuft
  // über die gemeinsame Prüffunktion aus main/settings-ipc.js — dieselbe, die
  // auch die authentifizierte Passwortänderung verwendet, damit es genau EINE
  // Stelle gibt, an der ein eingegebenes Passwort gegen den gespeicherten Hash
  // geprüft wird.
  //
  // Dieser Kanal bleibt ausschließlich die Entsperr-Operation des
  // Sperrbildschirms; eine Einstellungsänderung wird niemals über ihn
  // autorisiert.
  ipcMain.handle('app:verifyAppLock', (_e, enteredPassword) => {
    const config = requireProjectConfig(currentProject?.path);
    adoptCurrentProjectConfig(currentProject?.path, config);
    const appLock = config?.appLock;
    if (!appLock?.enabled) {
      setMainProcessLockState(false); // kein Schutz gesetzt — nichts zu prüfen
      return { ok: true };
    }
    const ok = matchesStoredAppLockPassword(appLock, enteredPassword);
    // Einziger Weg, der den Hauptprozess wieder entsperrt. Ein falsches
    // Passwort lässt jede Sperre unverändert aktiv.
    if (ok) setMainProcessLockState(false);
    return { ok };
  });

  // Renderer meldet, dass der Sperrbildschirm aktiv wird (Programmstart mit
  // aktivem Schutz oder "Wiki sperren"). Bewusst nur in Richtung SPERREN: ein
  // kompromittierter Renderer kann darüber niemals entsperren, dafür ist
  // ausschließlich 'app:verifyAppLock' oben zuständig.
  ipcMain.handle('app:lockNow', () => {
    setMainProcessLockState(true);
    return { locked: true };
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
function refreshTrayMenu(status = { inProgress: isBackupInProgress() }) {
  if (!tray || tray.isDestroyed()) return;
  function showAndFocus() { mainWindow?.show(); mainWindow?.focus(); }
  // Bei aktivem App-Passwortschutz bleiben nur die beiden Einträge nutzbar, die
  // keinen geschützten Inhalt zeigen oder verändern: Fenster holen (es zeigt
  // dann weiterhin den Sperrbildschirm) und Beenden. Alles andere würde sonst
  // am Sperrbildschirm vorbei Einstellungen, Wiki-Inhalt, Update- oder
  // Backup-Vorgänge auslösen.
  // Die zusätzliche appLocked-Abfrage in den Klick-Handlern selbst deckt den
  // Fall ab, dass ein bereits geöffnetes natives Tray-Menü noch den vorherigen,
  // aktivierten Eintrag auslöst, während zwischenzeitlich gesperrt wurde.
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Fenster öffnen', click: showAndFocus },
    { label: 'Dashboard öffnen', enabled: !appLocked, click: () => { if (appLocked) return; showAndFocus(); mainWindow?.webContents.send('menu:go-home'); } },
    { label: 'Nach Updates suchen', enabled: !appLocked, click: () => { if (appLocked) return; showAndFocus(); mainWindow?.webContents.send('menu:check-for-updates'); } },
    {
      label: status.inProgress ? 'Backup läuft …' : 'Backup jetzt erstellen',
      enabled: !appLocked && !status.inProgress,
      click: async () => { if (appLocked) return; await runBackup(true); }
    },
    { type: 'separator' },
    { label: 'Einstellungen…', enabled: !appLocked, click: () => { if (appLocked) return; showAndFocus(); mainWindow?.webContents.send('menu:open-settings'); } },
    { type: 'separator' },
    { label: 'Beenden', click: () => { isQuitting = true; app.quit(); } }
  ]));
}

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
  tray.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
  refreshTrayMenu();
}

app.whenReady().then(async () => {
  try {
    await prepareAppImageNativeHost();
  } catch (error) {
    // Der Web Clipper ist eine Zusatzfunktion. Eine fehlgeschlagene lokale
    // Registrierung darf den normalen Archiv-Wiki-Start nicht verhindern.
    console.error('[Archiv Wiki] Native Host konnte nicht vorbereitet werden:', error?.message || error);
  }

  // Der ausdrücklich gesetzte AppImage-Schalter bleibt für technische
  // Diagnosen verfügbar. Im normalen Programmablauf wird die Registrierung
  // ausschließlich durch die sichtbare Nutzeraktion in den Einstellungen
  // ausgelöst; ein normaler App-Start installiert die Erweiterung niemals.
  if (installBraveWebClipperRequested) {
    try {
      const result = installBraveWebClipper({
        resourcesPath: process.resourcesPath,
        homePath: app.getPath('home'),
        platform: process.platform,
        isPackaged: app.isPackaged
      });
      console.log('[Archiv Wiki] Brave Web Clipper zur Installation vorbereitet.');
      console.log(`[Archiv Wiki] ID: ${result.extensionId}`);
      console.log(`[Archiv Wiki] Version: ${result.extensionVersion}`);
      console.log(`[Archiv Wiki] CRX: ${result.crxPath}`);
      console.log(`[Archiv Wiki] Registrierung: ${result.registrationPath}`);
      console.log('[Archiv Wiki] Brave muss jetzt vollständig neu gestartet werden.');
    } catch (error) {
      process.exitCode = 1;
      console.error('[Archiv Wiki] Brave Web Clipper konnte nicht zur Installation vorbereitet werden:', error?.message || error);
    }
    app.quit();
    return;
  }

  buildMenu();
  createTray();

  // Jede IPC-Registrierung einzeln absichern: schlägt eine fehl (z. B. ein
  // fehlerhaftes Drittanbieter-Modul), sollen die ANDEREN trotzdem laufen und
  // das Fenster trotzdem öffnen, statt dass die ganze Startsequenz still
  // abbricht. Der Fehler wird klar im Terminal sichtbar statt zu verschwinden.
  // Bugfix (Audit-Punkt 5): registerCoreIpc() lief bisher UNGESCHÜTZT direkt,
  // inkonsistent zu den anderen Modulen darunter — ein Fehler darin hätte die
  // komplette Startsequenz gestoppt, kein Fenster wäre je erschienen. Jetzt
  // genauso abgesichert wie alle anderen.
  function safeRegister(label, fn) {
    try { fn(); }
    catch (err) {
      console.error(`[Archiv Wiki] Registrierung fehlgeschlagen: ${label}`, err);
      recordAutomaticDiagnostic({
        source: 'main',
        kind: 'startup-registration-failed',
        title: 'Technische Komponente konnte nicht gestartet werden',
        message: err?.message || String(err),
        stack: err?.stack || null,
        details: { component: label }
      });
    }
  }
  safeRegister('registerCoreIpc', () => registerCoreIpc());
  safeRegister('registerFilesystemIpc', () => registerFilesystemIpc({
    getCurrentProject: () => currentProject,
    onProjectConfigLoaded: adoptCurrentProjectConfig
  }));
  safeRegister('registerIncomingIpc', () => registerIncomingIpc({ getCurrentProject: () => currentProject }));
  safeRegister('registerWebClipperDistributionIpc', () => registerWebClipperDistributionIpc({
    ipcMain,
    resourcesPath: process.resourcesPath,
    homePath: app.getPath('home'),
    platform: process.platform,
    isPackaged: app.isPackaged
  }));
  safeRegister('startWebClipReceiver', () => {
    webClipReceiver = startWebClipReceiver({
      getCurrentProject: () => currentProject,
      onCreated: (entry) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('incoming:created', entry);
        }
      },
      onStatusChanged: (status) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webclip:statusUpdated', status);
        }
      }
    });
  });
  safeRegister('registerExportIpc', () => registerExportIpc({ getCurrentProject: () => currentProject, getMainWindow: () => mainWindow }));
  safeRegister('registerSyncIpc', () => registerSyncIpc({
    getCurrentProject: () => currentProject,
    getMainWindow: () => mainWindow,
    onProjectConfigLoaded: adoptCurrentProjectConfig
  }));
  safeRegister('registerSettingsIpc', () => registerSettingsIpc({
    getCurrentProject: () => currentProject,
    getMainWindow: () => mainWindow,
    onProjectConfigLoaded: adoptCurrentProjectConfig
  }));
  // Bugfix (Audit-Punkt 6): vorher nur im "kein Projekt bekannt"-Zweig weiter
  // unten registriert — wurde der Wizard stattdessen später über
  // app.on('activate') geöffnet (z. B. falls currentProject.path zwischen-
  // zeitlich wieder leer wäre), hatte er dadurch NIE funktionierende IPC-
  // Kanäle (wizard:finish usw.). Jetzt einmalig und bedingungslos beim Start,
  // unabhängig davon, ob der Wizard sofort oder erst später gezeigt wird —
  // mehrfaches Registrieren wäre ohnehin sinnlos, einmalig reicht.
  safeRegister('registerWizardIpc', () => registerWizardIpc({ getWizardWindow: () => wizardWindow, onProjectReady: handleProjectReady }));

  // Automatisches Backup: einmal am Tag ein ZIP-Snapshot in den beim
  // Einrichten gewählten backupPath (siehe main/backup.js — vorher wurde
  // dieser Pfad nur gespeichert, aber nie genutzt). Kurz nach Start prüfen
  // (falls schon ein Projekt bekannt ist) plus ein Hintergrund-Timer, falls
  // die App über Mitternacht hinaus geöffnet bleibt.
  setTimeout(() => { runBackup(false).catch(() => {}); }, 5000);
  setInterval(() => { runBackup(false).catch(() => {}); }, 10 * 60 * 1000);

  // Automatischer Update-Check beim Start (Nutzer-Feature) — respektiert die
  // Einstellung "Beim Start automatisch nach Updates suchen" (Standard: an).
  // Leicht zeitversetzt zum Backup-Check oben, damit beide Hintergrund-
  // Aktionen nicht exakt gleichzeitig um Netzwerk/Rechenzeit konkurrieren.
  // checkForUpdates() selbst löst bei Erfolg automatisch die oben verdrahteten
  // "update-available"/"update-not-available"-Ereignisse aus — kein
  // zusätzlicher Code hier nötig, rein die Entscheidung ob überhaupt geprüft wird.
  setTimeout(() => {
    if (!autoUpdater) return; // electron-updater beim Start nicht ladbar gewesen — siehe try/catch am Dateianfang
    if (readAppState().updateCheckOnStart === false) return;
    runUpdateCheck().catch((err) => {
      // Kein Internet, GitHub nicht erreichbar, o.Ä. — beim automatischen
      // Start-Check bewusst NUR protokollieren, keine Fehlermeldung an den
      // Nutzer. Ein manueller "Jetzt prüfen"-Klick (Einstellungen) zeigt
      // Fehler weiterhin an, da der Nutzer dort aktiv etwas ausgelöst hat.
      console.error('[Archiv Wiki] Automatischer Update-Check beim Start fehlgeschlagen:', err.message);
    });
  }, 8000);

  const appState = readAppState();
  if (isValidProject(appState.lastProjectPath)) {
    // Bereits eingerichtetes Projekt aus einem früheren Start → Wizard
    // überspringen und direkt ins Hauptfenster.
    console.log(`[Archiv Wiki] Bekanntes Projekt gefunden: ${appState.lastProjectPath}`);
    currentProject = {
      path: appState.lastProjectPath,
      config: cloneProjectConfig(requireProjectConfig(appState.lastProjectPath))
    };
    createMainWindow();
  } else {
    // Kein (gültiges) Projekt bekannt → Setup-Wizard zeigen.
    console.log('[Archiv Wiki] Kein Projekt bekannt — starte Setup-Wizard.');
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
app.on('before-quit', (event) => {
  if (isQuitting) return;
  if (isBackupInProgress()) {
    event.preventDefault();
    quitCleanly();
    return;
  }
  isQuitting = true;
});

app.on('will-quit', () => {
  webClipReceiver?.close();
  webClipReceiver = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
