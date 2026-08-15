// main/sync-ipc.js — Schritt 6, Sync: Verbindungstest, reiner Upload (Stufe 1),
// Abgleich mit Sync-Manifest + echter Konflikt-/Löschungserkennung (Stufe 3).
//
// WICHTIG (Lehre aus dem archiver-ESM-Vorfall — und hier zunächst nur HALB
// angewendet, siehe Nutzer-Bugreport): 'webdav' wird NICHT per require()
// geladen (auch nicht lazy!), sondern per dynamischem import() innerhalb der
// Funktionen, die es brauchen. require() eines ESM-Pakets schlägt IMMER fehl,
// unabhängig davon ob es oben in der Datei oder erst bei Bedarf aufgerufen
// wird — nur der Zeitpunkt (Start vs. Funktionsaufruf) entscheidet, OB es die
// ganze App crasht oder nur diese eine Funktion.
'use strict';

const { ipcMain, app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { URL } = require('url');
const { cloneProjectConfig, requireProjectConfig, updateProjectConfig, TRASH_DIRNAME } = require('./project');
const { classifyFile, isExcluded, MANIFEST_FILENAME } = require('./sync-classify');
const { readAppState, writeAppState } = require('./app-state');
const { atomicWriteFileSync } = require('./atomic-write');
const { resolveSafe } = require('./notes-fs');

const INVALID_SYNC_PATH_MESSAGE = 'Ungültiger Synchronisierungspfad.';
const HTTPS_REQUIRED_MESSAGE = 'Für WebDAV ist eine verschlüsselte HTTPS-Verbindung erforderlich.';

// Zentrale Transportgrenze für jeden WebDAV-Netzwerkeinstieg. Archiv-Wiki
// besitzt derzeit keinen vertraglich benötigten lokalen HTTP-Testserver;
// deshalb gilt HTTPS ohne Loopback-Ausnahme. Erst nach erfolgreicher Prüfung
// wird das WebDAV-Modul geladen und ein Client mit Zugangsdaten erzeugt.
function validateWebDavUrl(url) {
  const candidate = typeof url === 'string' ? url.trim() : '';
  if (!candidate) throw new Error('Bitte eine WebDAV-URL angeben.');

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('Bitte eine gültige WebDAV-URL angeben.');
  }

  if (!parsed.hostname) throw new Error('Bitte eine gültige WebDAV-URL angeben.');
  if (parsed.protocol !== 'https:') throw new Error(HTTPS_REQUIRED_MESSAGE);
  return candidate;
}

async function createSecureWebDavClient(url, username, password) {
  const validatedUrl = validateWebDavUrl(url);
  const { createClient } = await import('webdav');
  return createClient(validatedUrl, { username, password });
}

function isPathInside(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function realpathSync(fullPath) {
  return fs.realpathSync.native ? fs.realpathSync.native(fullPath) : fs.realpathSync(fullPath);
}

// Zentrale lokale Sicherheitsgrenze für sämtliche Sync-Pfade. resolveSafe()
// liefert die bereits im Notiz-Dateisystem verwendete lexikalische
// Projektgrenze. Ergänzend werden absolute/portable Traversal-Formen und
// bestehende Symlink-Ziele über die reale Projektwurzel geprüft.
function resolveSyncLocalPath(projectPath, relPath) {
  if (typeof relPath !== 'string' || !relPath || relPath.includes('\0')) {
    throw new Error(INVALID_SYNC_PATH_MESSAGE);
  }

  const portablePath = relPath.replace(/\\/g, '/');
  const portableNormalized = path.posix.normalize(portablePath);
  if (
    path.posix.isAbsolute(portablePath)
    || path.win32.isAbsolute(relPath)
    || portableNormalized === '.'
    || portableNormalized === '..'
    || portableNormalized.startsWith('../')
  ) {
    throw new Error(INVALID_SYNC_PATH_MESSAGE);
  }

  let candidatePath;
  try {
    candidatePath = resolveSafe(projectPath, relPath);
  } catch {
    throw new Error(INVALID_SYNC_PATH_MESSAGE);
  }

  try {
    const realRoot = realpathSync(path.resolve(projectPath));
    let existingPath = candidatePath;
    while (!fs.existsSync(existingPath)) {
      const parentPath = path.dirname(existingPath);
      if (parentPath === existingPath) throw new Error(INVALID_SYNC_PATH_MESSAGE);
      existingPath = parentPath;
    }
    if (!isPathInside(realRoot, realpathSync(existingPath))) {
      throw new Error(INVALID_SYNC_PATH_MESSAGE);
    }
  } catch (error) {
    if (error?.message === INVALID_SYNC_PATH_MESSAGE) throw error;
    throw new Error(INVALID_SYNC_PATH_MESSAGE);
  }

  return candidatePath;
}

// webdav liefert Einträge beim Listing üblicherweise mit genau einem '/'
// als Remote-Root-Markierung. Diese Transportdarstellung wird bewusst separat
// entfernt; doppelte führende Slashes und jedes anschließende Traversal werden
// nicht umgedeutet, sondern vom lokalen Guard abgelehnt.
function remoteFilenameToRelative(filename) {
  if (typeof filename !== 'string' || !filename) throw new Error(INVALID_SYNC_PATH_MESSAGE);
  if (!filename.startsWith('/')) return filename;
  if (filename.startsWith('//')) throw new Error(INVALID_SYNC_PATH_MESSAGE);
  return filename.slice(1);
}

// Sync-Verlauf/Protokoll (Punkt 3.3): letzte 20 Abgleiche, jeweils mit
// Zeitstempel, Dauer, Anzahl übertragener Dateien, Erfolg/Fehler und
// Warnungen (= ungelöste Konflikte). Gleiches Speicher-Muster wie der
// Backup-Status in app-state.js — bewusst nicht pro Projekt, sondern global,
// konsistent mit dem bestehenden backupConsecutiveFailures-Ansatz.
const MAX_SYNC_HISTORY = 20;
function recordSyncHistory(entry) {
  const state = readAppState();
  const history = Array.isArray(state.syncHistory) ? state.syncHistory : [];
  history.unshift(entry); // neueste zuerst
  writeAppState({ syncHistory: history.slice(0, MAX_SYNC_HISTORY) });
}

// Merkt sich pro Datei den Stand ZUM ZEITPUNKT DES LETZTEN ERFOLGREICHEN
// ABGLEICHS (lokales mtime+size, Remote-ETag+size). Damit lässt sich beim
// nächsten Abgleich unterscheiden: "seit dem letzten Mal unverändert" vs.
// "seitdem geändert" vs. "seitdem gelöscht" — nicht nur "welche Seite ist
// neuer" wie in Stufe 2. Lebt IM Projektordner (keine Geheimnisse drin,
// reine Buchhaltung) und wird beim Abgleich selbst von der Übertragung
// ausgeschlossen (siehe isExcluded() in sync-classify.js).

function loadManifest(projectPath) {
  const p = resolveSyncLocalPath(projectPath, MANIFEST_FILENAME);
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
}

function saveManifest(projectPath, manifest) {
  atomicWriteFileSync(resolveSyncLocalPath(projectPath, MANIFEST_FILENAME), JSON.stringify(manifest, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Sichere Passwort-Speicherung (Stufe 5): über Electrons safeStorage — nutzt
// den OS-Schlüsselbund (Keychain/libsecret/kwallet/DPAPI), kein Klartext.
// Liegt bewusst NICHT im Projektordner, sondern in Electrons userData
// (app-eigen, nicht Teil des ggf. geteilten/gesyncten Wiki-Ordners), verknüpft
// über den Projektpfad als Schlüssel.
// ---------------------------------------------------------------------------
function credentialsFilePath() {
  return path.join(app.getPath('userData'), 'sync-credentials.json');
}

function loadCredentialsStore() {
  const p = credentialsFilePath();
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
}

function saveCredentialsStore(store) {
  fs.mkdirSync(path.dirname(credentialsFilePath()), { recursive: true });
  atomicWriteFileSync(credentialsFilePath(), JSON.stringify(store, null, 2), 'utf8');
}

// Von main/wizard-ipc.js genutzt: der Wizard hat beim Speichern des Passworts
// noch kein "aktuelles Projekt" (das gibt es erst nach diesem Aufruf), kennt
// aber schon den fertigen projectPath direkt — deshalb hier als eigenständige
// Funktion mit explizitem Pfad statt über requireProjectPath()/getCurrentProject().
function savePasswordForProject(projectPath, password) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Sichere Speicherung ist auf diesem System nicht verfügbar (kein Schlüsselbund gefunden).');
  }
  const store = loadCredentialsStore();
  store[projectPath] = safeStorage.encryptString(password || '').toString('base64');
  saveCredentialsStore(store);
}

// ---------------------------------------------------------------------------
// Automatischer Hintergrund-Abgleich (Stufe 6). Läuft NUR, wenn:
//   - für das aktuelle Projekt aktiviert (config.sync.autoSync.enabled)
//   - eine WebDAV-URL hinterlegt ist
//   - ein Passwort sicher gespeichert ist (siehe Stufe 5) — ohne gespeichertes
//     Passwort ist automatischer Sync nicht möglich, da niemand da ist, der
//     es eintippen könnte.
// Ein einziger Minuten-Tick prüft jedes Mal, ob laut konfiguriertem Intervall
// "dran" ist — einfacher und robuster als verschachtelte Timer, die bei
// Einstellungsänderungen neu aufgesetzt werden müssten.
// ---------------------------------------------------------------------------
const SYNC_BUSY_MESSAGE = 'Synchronisierung läuft bereits.';
let syncInProgress = false;

// Eine einzige Main-Prozess-Sperre schützt alle Vorgänge, die lokalen oder
// entfernten Sync-Zustand verändern. Manuelle Aufrufe werden bei einer
// Überschneidung verständlich abgelehnt; der Auto-Sync überspringt seinen
// Tick still. `finally` gibt die Sperre auch nach Fehlern zuverlässig frei.
async function runExclusiveSyncMutation(operation, { skipIfBusy = false } = {}) {
  if (syncInProgress) {
    if (skipIfBusy) return null;
    throw new Error(SYNC_BUSY_MESSAGE);
  }

  syncInProgress = true;
  try {
    return await operation();
  } finally {
    syncInProgress = false;
  }
}

// Für sauberes Beenden (main.js quitCleanly): zeigt an, ob GERADE ein
// mutierender Cloud-Abgleich läuft.
function isSyncInProgress() { return syncInProgress; }

let lastAutoSyncAt = 0;
let currentStatus = { state: 'idle', lastSyncAt: null, lastError: null, conflictCount: 0, conflicts: [] };

function broadcastStatus(getMainWindow) {
  const win = getMainWindow?.();
  if (win && !win.isDestroyed()) win.webContents.send('sync:statusUpdate', currentStatus);
}

async function maybeRunAutoSync({ getCurrentProject, getMainWindow, onProjectConfigLoaded }) {
  const project = getCurrentProject?.();
  if (!project?.path) return;
  const config = requireProjectConfig(project.path);
  onProjectConfigLoaded?.(project.path, config);
  const autoSync = config.sync?.autoSync;
  if (!autoSync?.enabled) return;

  const intervalMs = Math.max(1, Number(autoSync.intervalMinutes) || 15) * 60 * 1000;
  if (Date.now() - lastAutoSyncAt < intervalMs) return;

  if (!safeStorage.isEncryptionAvailable()) return;
  const store = loadCredentialsStore();
  const encB64 = store[project.path];
  if (!encB64) return; // kein gespeichertes Passwort -> kein automatischer Sync möglich
  let password;
  try { password = safeStorage.decryptString(Buffer.from(encB64, 'base64')); } catch { return; }

  const url = config.sync?.url;
  if (!url) return;

  return runExclusiveSyncMutation(async () => {
    lastAutoSyncAt = Date.now();
    currentStatus = { ...currentStatus, state: 'syncing' };
    broadcastStatus(getMainWindow);

    try {
      const startedAt = Date.now();
      const result = await performSyncAll({ projectPath: project.path, url, username: config.sync?.username || '', password });
      currentStatus = {
        state: result.conflicts.length ? 'conflicts' : 'idle',
        lastSyncAt: new Date().toISOString(),
        lastError: null,
        conflictCount: result.conflicts.length,
        conflicts: result.conflicts
      };
      recordSyncHistory({
        timestamp: currentStatus.lastSyncAt,
        durationMs: Date.now() - startedAt,
        filesCount: result.uploaded + result.downloaded + result.deletedLocal + result.deletedRemote,
        success: true,
        error: null,
        warnings: result.conflicts.length
      });
    } catch (err) {
      currentStatus = { ...currentStatus, state: 'error', lastError: err.message };
      recordSyncHistory({ timestamp: new Date().toISOString(), durationMs: null, filesCount: 0, success: false, error: err.message, warnings: 0 });
    }
    broadcastStatus(getMainWindow);
  }, { skipIfBusy: true });
}

// ---------------------------------------------------------------------------
// Abgleich-Kernlogik (Stufe 3/6) — als eigenständige Funktion statt nur
// inline im IPC-Handler, damit sowohl ein Button-Klick (Renderer → IPC) als
// auch der Hintergrund-Timer (Stufe 6, rein im Main-Prozess, kein IPC nötig)
// dieselbe Logik nutzen. Siehe classifyFile()-Kommentar für die Regeln.
// ---------------------------------------------------------------------------
async function performSyncAll({ projectPath, url, username, password }) {
  const client = await createSecureWebDavClient(url, username, password);

  const manifest = loadManifest(projectPath);

  // Remote-Dateien (rekursiv, nur type:'file')
  const remoteEntries = await client.getDirectoryContents('/', { deep: true });
  const remoteFiles = new Map(); // relPath -> { etag, size, lastmod }
  for (const entry of remoteEntries) {
    if (entry.type !== 'file') continue;
    const relPath = remoteFilenameToRelative(entry.filename);
    resolveSyncLocalPath(projectPath, relPath);
    if (isExcluded(relPath)) continue;
    // lastmod (Nutzer-Feature: verständlichere Konflikt-Anzeige) liefert die
    // Bibliothek beim ohnehin schon nötigen Verzeichnis-Abruf gleich mit —
    // keine zusätzliche Netzwerk-Anfrage nötig, nur bisher ungenutzt.
    remoteFiles.set(relPath, { etag: entry.etag, size: entry.size, lastmod: entry.lastmod });
  }

  // Lokale Dateien (rekursiv)
  const localFiles = new Map(); // relPath -> { mtime: Date, size, fullPath }
  function walkLocal(dirPath, relPrefix) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (isExcluded(entry.isDirectory() ? relPath + '/' : relPath) || entry.name === TRASH_DIRNAME || entry.name === MANIFEST_FILENAME) continue;
      // Dieselbe Policy wie beim Notizbaum: Symlinks sind weder Dateien noch
      // Verzeichnisse des Wikis und werden nicht verfolgt oder hochgeladen.
      if (entry.isSymbolicLink()) continue;
      const fullPath = resolveSyncLocalPath(projectPath, relPath);
      if (entry.isDirectory()) walkLocal(fullPath, relPath);
      else {
        const stat = fs.statSync(fullPath);
        localFiles.set(relPath, { mtime: stat.mtime, size: stat.size, fullPath });
      }
    }
  }
  walkLocal(projectPath, '');

  async function ensureRemoteDir(relPath) {
    const dir = path.dirname(relPath).replace(/\\/g, '/');
    if (dir === '.' || dir === '') return;
    let acc = '';
    for (const part of dir.split('/')) {
      acc = acc ? `${acc}/${part}` : part;
      try { await client.createDirectory(acc); } catch { /* existiert evtl. schon */ }
    }
  }

  async function doUpload(relPath, local) {
    resolveSyncLocalPath(projectPath, relPath);
    await ensureRemoteDir(relPath);
    const guardedLocalPath = resolveSyncLocalPath(projectPath, relPath);
    await client.putFileContents(relPath, fs.readFileSync(guardedLocalPath), { overwrite: true });
    const newStat = await client.stat(relPath); // echtes neues ETag holen, nicht raten
    manifest[relPath] = { localMtime: local.mtime.toISOString(), localSize: local.size, remoteEtag: newStat.etag, remoteSize: newStat.size };
  }

  async function doDownload(relPath, remote) {
    resolveSyncLocalPath(projectPath, relPath);
    const content = await client.getFileContents(relPath);
    // Nach dem Netzwerk-Wait erneut prüfen, damit eine zwischenzeitlich
    // entstandene Symlink-Komponente nicht ungeprüft beschrieben wird.
    const localFullPath = resolveSyncLocalPath(projectPath, relPath);
    fs.mkdirSync(path.dirname(localFullPath), { recursive: true });
    const guardedWritePath = resolveSyncLocalPath(projectPath, relPath);
    atomicWriteFileSync(guardedWritePath, content);
    const newStat = fs.statSync(guardedWritePath);
    manifest[relPath] = { localMtime: newStat.mtime.toISOString(), localSize: newStat.size, remoteEtag: remote.etag, remoteSize: remote.size };
  }

  let uploaded = 0, downloaded = 0, skipped = 0, deletedLocal = 0, deletedRemote = 0;
  const conflicts = [];
  const allRelPaths = new Set([...localFiles.keys(), ...remoteFiles.keys(), ...Object.keys(manifest)]);

  for (const relPath of allRelPaths) {
    // Manifest- und Remote-Schlüssel sind ebenso wenig vertrauenswürdig wie
    // IPC-Werte. Ungültige Pfade stoppen den Abgleich vor lokaler Mutation.
    resolveSyncLocalPath(projectPath, relPath);
    const local = localFiles.get(relPath);
    const remote = remoteFiles.get(relPath);
    const m = manifest[relPath];

    const localChanged = Boolean(local && m && (local.mtime.toISOString() !== m.localMtime || local.size !== m.localSize));
    const remoteChanged = Boolean(remote && m && (remote.etag !== m.remoteEtag || remote.size !== m.remoteSize));

    // Bugfix (Nutzer-Meldung: wiederkehrender Konflikt bei unveränderten
    // Notizen): Metadaten (Zeitstempel/Größe/ETag) sind nur ein HINWEIS, kein
    // Beweis für einen echten inhaltlichen Unterschied — z. B. kann ein
    // Cloud-Speicher bei einem internen Datei-Scan eine neue ETag vergeben,
    // ohne dass sich der Inhalt ändert. Der Inhalts-Vergleich lief bisher NUR
    // beim allerersten Abgleich einer Datei (kein Manifest-Eintrag) — jetzt
    // zusätzlich auch dann, wenn Metadaten "beide Seiten geändert" nahelegen,
    // also GENAU der Fall, der einen Konflikt auslösen würde. In allen
    // anderen Fällen (nur eine Seite geändert, oder gar keine) bleibt es
    // beim reinen, günstigeren Metadaten-Vergleich, um nicht bei JEDER Datei
    // unnötig herunterzuladen.
    let contentIdentical = false;
    const wouldBeCreateConflict = !m && local && remote;
    const wouldBeUpdateConflict = Boolean(m) && local && remote && localChanged && remoteChanged;
    if (wouldBeCreateConflict || wouldBeUpdateConflict) {
      const localContent = fs.readFileSync(resolveSyncLocalPath(projectPath, relPath));
      const remoteContent = await client.getFileContents(relPath);
      contentIdentical = Buffer.isBuffer(remoteContent)
        ? localContent.equals(remoteContent)
        : localContent.toString('utf8') === remoteContent;
    }

    const decision = classifyFile({
      localExists: Boolean(local),
      remoteExists: Boolean(remote),
      hasManifestEntry: Boolean(m),
      localChanged,
      remoteChanged,
      contentIdentical
    });

    switch (decision.action) {
      case 'cleanup':
        delete manifest[relPath];
        break;
      case 'skip':
        // Deckt jetzt auch den Fall ab, in dem Metadaten einen Konflikt
        // nahelegten, der echte Inhalt sich aber als identisch herausstellte
        // (contentIdentical === true) — der Manifest-Eintrag wird dabei ganz
        // regulär auf den JETZT bekannten Stand aktualisiert, genau wie bei
        // jedem anderen "unverändert"-Fall. Dadurch verschwindet ein reiner
        // Metadaten-Fehlalarm dauerhaft, statt beim nächsten Abgleich erneut
        // aufzutauchen.
        if (local && remote) manifest[relPath] = { localMtime: local.mtime.toISOString(), localSize: local.size, remoteEtag: remote.etag, remoteSize: remote.size };
        skipped++;
        break;
      case 'upload':
        await doUpload(relPath, local); uploaded++;
        break;
      case 'download':
        await doDownload(relPath, remote); downloaded++;
        break;
      case 'delete-remote':
        await client.deleteFile(relPath); delete manifest[relPath]; deletedRemote++;
        break;
      case 'delete-local':
        fs.unlinkSync(resolveSyncLocalPath(projectPath, relPath)); delete manifest[relPath]; deletedLocal++;
        break;
      case 'conflict':
        // Bewusst weiterhin OHNE Manifest-Eintrag (siehe Kommentar in
        // sync-classify.js): ein ECHTER Konflikt (Inhalt tatsächlich
        // unterschiedlich) soll bei jedem Abgleich erneut gemeldet werden,
        // bis der Nutzer ihn bewusst über sync:resolveConflict auflöst —
        // alles andere würde einen ungelösten, echten Unterschied stillschweigend
        // "vergessen" lassen.
        conflicts.push({
          relPath,
          reason: decision.reason,
          localExists: Boolean(local),
          remoteExists: Boolean(remote),
          // Nutzer-Feature: Datum + Größe beider Seiten mitgeben, damit die
          // Konflikt-Auswahl in der Oberfläche eine echte Entscheidungshilfe
          // zeigen kann, statt den Nutzer komplett blind raten zu lassen.
          localMtime: local ? local.mtime.toISOString() : null,
          localSize: local ? local.size : null,
          remoteLastmod: remote ? remote.lastmod : null,
          remoteSize: remote ? remote.size : null
        });
        break;
    }
    // Bugfix (Audit-Punkt 2): Manifest nach JEDER Datei sichern, nicht erst
    // ganz am Ende der Schleife — bricht der Abgleich mittendrin ab
    // (Netzwerk weg, Absturz, Programm wird beendet), bleiben bereits
    // erfolgreich übertragene Dateien dadurch korrekt in der Nachverfolgung
    // stehen, statt beim nächsten Abgleich fälschlich als "neu"/"Konflikt"
    // eingestuft zu werden. Etwas mehr Schreibaufwand, aber unkritisch für
    // die Dateigröße eines Sync-Manifests.
    saveManifest(projectPath, manifest);
  }

  return { success: true, uploaded, downloaded, skipped, deletedLocal, deletedRemote, conflicts };
}

function registerSyncIpc({ getCurrentProject, getMainWindow, onProjectConfigLoaded }) {
  function requireProjectPath() {
    const projectPath = getCurrentProject()?.path;
    if (!projectPath) throw new Error('Kein Projekt geöffnet.');
    return projectPath;
  }

  function adoptConfig(projectPath, config) {
    onProjectConfigLoaded?.(projectPath, config);
    return cloneProjectConfig(config);
  }

  // Jede Minute prüfen, ob laut Einstellungen ein automatischer Abgleich fällig ist.
  setInterval(() => {
    maybeRunAutoSync({ getCurrentProject, getMainWindow, onProjectConfigLoaded }).catch(() => {});
  }, 60 * 1000);

  ipcMain.handle('sync:getAutoSyncSettings', () => {
    const projectPath = requireProjectPath();
    const config = requireProjectConfig(projectPath);
    adoptConfig(projectPath, config);
    return {
      enabled: Boolean(config.sync?.autoSync?.enabled),
      intervalMinutes: config.sync?.autoSync?.intervalMinutes || 15,
      config: cloneProjectConfig(config)
    };
  });

  ipcMain.handle('sync:saveAutoSyncSettings', (_e, { enabled, intervalMinutes }) => {
    const projectPath = requireProjectPath();
    const config = updateProjectConfig(projectPath, draft => {
      draft.sync = { ...(draft.sync || {}), autoSync: { enabled: Boolean(enabled), intervalMinutes: Number(intervalMinutes) || 15 } };
    });
    if (enabled) lastAutoSyncAt = 0; // beim Aktivieren nicht erst ein volles Intervall warten
    return { saved: true, config: adoptConfig(projectPath, config) };
  });

  ipcMain.handle('sync:getStatus', () => currentStatus);

  // -------------------------------------------------------------------------
  // Einstellungen: URL + Benutzername liegen in .wiki-config.json (auch schon
  // vom Wizard so gespeichert). Passwort (Stufe 5): NUR verschlüsselt über
  // safeStorage, und nur wenn der Nutzer das explizit per Checkbox aktiviert
  // hat. Ist auf diesem System kein Schlüsselbund verfügbar, bleibt die
  // Funktion deaktiviert statt unsicher auf Klartext auszuweichen.
  // -------------------------------------------------------------------------
  ipcMain.handle('sync:getSettings', () => {
    const projectPath = requireProjectPath();
    const config = requireProjectConfig(projectPath);
    adoptConfig(projectPath, config);
    const encryptionAvailable = safeStorage.isEncryptionAvailable();
    let savedPassword = '';
    if (encryptionAvailable) {
      const store = loadCredentialsStore();
      const encB64 = store[projectPath];
      if (encB64) {
        try { savedPassword = safeStorage.decryptString(Buffer.from(encB64, 'base64')); } catch { savedPassword = ''; }
      }
    }
    return {
      url: config.sync?.url || '',
      username: config.sync?.username || '',
      savedPassword,
      encryptionAvailable,
      config: cloneProjectConfig(config)
    };
  });

  ipcMain.handle('sync:saveSettings', (_e, { url, username }) => {
    const projectPath = requireProjectPath();
    const config = requireProjectConfig(projectPath);
    const newUrl = url || '', newUsername = username || '';
    // Bugfix (per Nutzer-Meldung: .wiki-config.json tauchte bei JEDEM Abgleich
    // als "Konflikt" auf): vorher wurde hier UNBEDINGT geschrieben, bei jedem
    // Klick auf "Abgleich" — auch wenn sich an URL/Benutzername gar nichts
    // geändert hatte. Das gab der Datei jedes Mal einen frischen Zeitstempel,
    // kurz bevor der Sync-Vergleich überhaupt lief, und ließ sie dadurch
    // fälschlich immer als "gerade eben lokal geändert" erscheinen. Jetzt nur
    // noch schreiben, wenn sich tatsächlich etwas unterscheidet.
    if (config.sync?.url === newUrl && config.sync?.username === newUsername) {
      return { saved: true, config: adoptConfig(projectPath, config) };
    }
    const persistedConfig = updateProjectConfig(projectPath, draft => {
      draft.sync = { ...(draft.sync || {}), url: newUrl, username: newUsername };
    });
    return { saved: true, config: adoptConfig(projectPath, persistedConfig) };
  });

  ipcMain.handle('sync:savePassword', (_e, password) => {
    const projectPath = requireProjectPath();
    savePasswordForProject(projectPath, password);
    return { saved: true };
  });

  ipcMain.handle('sync:clearPassword', () => {
    const projectPath = requireProjectPath();
    const store = loadCredentialsStore();
    delete store[projectPath];
    saveCredentialsStore(store);
    return { cleared: true };
  });

  ipcMain.handle('sync:testConnection', async (_e, { url, username, password }) => {
    const client = await createSecureWebDavClient(url, username, password);
    await client.getDirectoryContents('/'); // wirft bei falscher URL/Zugangsdaten
    return { success: true };
  });

  // ---------------------------------------------------------------------
  // Reiner Upload (Stufe 1): kompletter Projektordner → WebDAV, .wiki-trash
  // ausgeschlossen (wie beim ZIP-Export). NUR Push, kein Abgleich/Konflikt-
  // erkennung — das ist bewusst Stufe 2/3 und noch nicht Teil hiervon.
  // Überschreibt vorhandene Remote-Dateien kommentarlos.
  // ---------------------------------------------------------------------
  ipcMain.handle('sync:uploadAll', (_e, { url, username, password }) => runExclusiveSyncMutation(async () => {
    const projectPath = requireProjectPath();
    const client = await createSecureWebDavClient(url, username, password);

    let uploaded = 0;
    async function walk(remoteRelPath) {
      const guardedDirPath = remoteRelPath
        ? resolveSyncLocalPath(projectPath, remoteRelPath)
        : path.resolve(projectPath);
      const entries = fs.readdirSync(guardedDirPath, { withFileTypes: true });
      for (const entry of entries) {
        const remotePath = remoteRelPath ? `${remoteRelPath}/${entry.name}` : entry.name;
        if (isExcluded(entry.isDirectory() ? remotePath + '/' : remotePath) || entry.name === TRASH_DIRNAME || entry.name === MANIFEST_FILENAME) continue;
        if (entry.isSymbolicLink()) continue;
        resolveSyncLocalPath(projectPath, remotePath);
        if (entry.isDirectory()) {
          try { await client.createDirectory(remotePath); } catch { /* existiert evtl. schon — kein Problem */ }
          await walk(remotePath);
        } else {
          const content = fs.readFileSync(resolveSyncLocalPath(projectPath, remotePath));
          await client.putFileContents(remotePath, content, { overwrite: true });
          uploaded++;
        }
      }
    }
    await walk('');
    return { success: true, uploaded };
  }));

  // ---------------------------------------------------------------------
  // Abgleich (Stufe 3): nutzt ein Sync-Manifest (letzter bekannter Stand pro
  // Datei), um sauber zu unterscheiden zwischen:
  //   - neu (auf einer Seite, nie zuvor gesehen)               → übertragen
  //   - unverändert seit letztem Abgleich                      → überspringen
  //   - nur auf einer Seite geändert                           → übertragen
  //   - auf einer Seite gelöscht, andere Seite unverändert     → Löschung übernehmen
  //   - auf beiden Seiten geändert ODER Löschung+Änderung      → ECHTER KONFLIKT,
  //     wird gemeldet, NICHTS wird automatisch verändert (Auflösung kommt
  //     erst mit der UI in Stufe 4 — hier nur sichere Erkennung, kein Datenverlust)
  //   - beide Seiten haben unabhängig (nie synchronisiert) dieselbe Datei
  //     mit UNTERSCHIEDLICHEM Inhalt angelegt                  → ebenfalls Konflikt
  // ---------------------------------------------------------------------
  ipcMain.handle('sync:getHistory', () => {
    const state = readAppState();
    return Array.isArray(state.syncHistory) ? state.syncHistory : [];
  });

  ipcMain.handle('sync:syncAll', (_e, { url, username, password }) => runExclusiveSyncMutation(async () => {
    const projectPath = requireProjectPath();
    currentStatus = { ...currentStatus, state: 'syncing' };
    broadcastStatus(getMainWindow);
    try {
      const startedAt = Date.now();
      const result = await performSyncAll({ projectPath, url, username, password });
      currentStatus = {
        state: result.conflicts.length ? 'conflicts' : 'idle',
        lastSyncAt: new Date().toISOString(),
        lastError: null,
        conflictCount: result.conflicts.length,
        conflicts: result.conflicts
      };
      recordSyncHistory({
        timestamp: currentStatus.lastSyncAt,
        durationMs: Date.now() - startedAt,
        filesCount: result.uploaded + result.downloaded + result.deletedLocal + result.deletedRemote,
        success: true,
        error: null,
        warnings: result.conflicts.length
      });
      broadcastStatus(getMainWindow);
      return result;
    } catch (err) {
      currentStatus = { ...currentStatus, state: 'error', lastError: err.message };
      recordSyncHistory({ timestamp: new Date().toISOString(), durationMs: null, filesCount: 0, success: false, error: err.message, warnings: 0 });
      broadcastStatus(getMainWindow);
      throw err;
    }
  }));

  // ---------------------------------------------------------------------
  // Konflikt-Auflösung (Stufe 4): EIN einheitliches Modell für alle
  // Konflikttypen (Edit-Edit, Edit-Delete in beide Richtungen, Create-Create):
  //   'keep-local'  → lokale Version gewinnt (übertragen bzw. Remote-Löschung
  //                   übernehmen, falls lokal gar nicht mehr existiert)
  //   'keep-remote' → Remote-Version gewinnt (herunterladen bzw. lokal löschen,
  //                   falls remote gar nicht mehr existiert)
  //   'keep-both'   → nur möglich, wenn BEIDE Seiten aktuell existieren:
  //                   lokale Version wird umbenannt (nichts geht verloren),
  //                   Remote-Version kommt an den Original-Pfad
  // Arbeitet mit dem FRISCH abgefragten Zustand (nicht dem alten Sync-
  // Ergebnis), da seit der Konflikt-Meldung Zeit vergangen sein kann.
  // ---------------------------------------------------------------------
  ipcMain.handle('sync:resolveConflict', (_e, { url, username, password, relPath, resolution }) => runExclusiveSyncMutation(async () => {
    const projectPath = requireProjectPath();
    // relPath kommt aus dem Renderer und wird deshalb VOR Netzwerk- oder
    // Dateizugriff im Main-Prozess gegen die Projektgrenze geprüft.
    const localFullPath = resolveSyncLocalPath(projectPath, relPath);
    const client = await createSecureWebDavClient(url, username, password);

    const localExists = fs.existsSync(localFullPath);
    let remoteExists = true, remoteStat = null;
    try { remoteStat = await client.stat(relPath); } catch { remoteExists = false; }

    const manifest = loadManifest(projectPath);

    async function ensureRemoteDir(rp) {
      const dir = path.dirname(rp).replace(/\\/g, '/');
      if (dir === '.' || dir === '') return;
      let acc = '';
      for (const part of dir.split('/')) {
        acc = acc ? `${acc}/${part}` : part;
        try { await client.createDirectory(acc); } catch { /* existiert evtl. schon */ }
      }
    }

    if (resolution === 'keep-local') {
      if (localExists) {
        await ensureRemoteDir(relPath);
        const guardedLocalPath = resolveSyncLocalPath(projectPath, relPath);
        await client.putFileContents(relPath, fs.readFileSync(guardedLocalPath), { overwrite: true });
        const newStat = await client.stat(relPath);
        const localStat = fs.statSync(resolveSyncLocalPath(projectPath, relPath));
        manifest[relPath] = { localMtime: localStat.mtime.toISOString(), localSize: localStat.size, remoteEtag: newStat.etag, remoteSize: newStat.size };
      } else {
        if (remoteExists) await client.deleteFile(relPath);
        delete manifest[relPath];
      }
    } else if (resolution === 'keep-remote') {
      if (remoteExists) {
        const content = await client.getFileContents(relPath);
        const guardedLocalPath = resolveSyncLocalPath(projectPath, relPath);
        fs.mkdirSync(path.dirname(guardedLocalPath), { recursive: true });
        const guardedWritePath = resolveSyncLocalPath(projectPath, relPath);
        atomicWriteFileSync(guardedWritePath, content);
        const localStat = fs.statSync(guardedWritePath);
        manifest[relPath] = { localMtime: localStat.mtime.toISOString(), localSize: localStat.size, remoteEtag: remoteStat.etag, remoteSize: remoteStat.size };
      } else {
        if (localExists) fs.unlinkSync(resolveSyncLocalPath(projectPath, relPath));
        delete manifest[relPath];
      }
    } else if (resolution === 'keep-both') {
      if (!localExists || !remoteExists) {
        throw new Error('„Beide behalten" ist nur möglich, wenn auf beiden Seiten eine Version existiert.');
      }
      const ext = path.extname(relPath);
      const base = ext ? relPath.slice(0, -ext.length) : relPath;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const conflictRelPath = `${base} (lokale Version, Konflikt ${stamp})${ext}`;
      resolveSyncLocalPath(projectPath, relPath);
      resolveSyncLocalPath(projectPath, conflictRelPath);
      const content = await client.getFileContents(relPath);
      // Auch nach dem Netzwerk-Wait beide Ziele erneut gegen Symlink-Wechsel
      // prüfen, bevor die lokale Konfliktmutation beginnt.
      const guardedLocalPathAfterDownload = resolveSyncLocalPath(projectPath, relPath);
      const conflictFullPathAfterDownload = resolveSyncLocalPath(projectPath, conflictRelPath);
      fs.renameSync(guardedLocalPathAfterDownload, conflictFullPathAfterDownload);
      try {
        atomicWriteFileSync(resolveSyncLocalPath(projectPath, relPath), content);
      } catch (error) {
        try {
          const rollbackLocalPath = resolveSyncLocalPath(projectPath, relPath);
          const rollbackConflictPath = resolveSyncLocalPath(projectPath, conflictRelPath);
          if (!fs.existsSync(rollbackLocalPath) && fs.existsSync(rollbackConflictPath)) {
            fs.renameSync(rollbackConflictPath, rollbackLocalPath);
          }
        } catch { /* ursprünglichen Schreibfehler beibehalten */ }
        throw error;
      }
      const localStat = fs.statSync(resolveSyncLocalPath(projectPath, relPath));
      manifest[relPath] = { localMtime: localStat.mtime.toISOString(), localSize: localStat.size, remoteEtag: remoteStat.etag, remoteSize: remoteStat.size };
      // Die umbenannte Kopie ist jetzt eine neue, unverfolgte lokale Datei —
      // wird beim nächsten Abgleich ganz normal als "neu lokal" hochgeladen.
    } else {
      throw new Error('Unbekannte Auflösung: ' + resolution);
    }

    saveManifest(projectPath, manifest);

    // Status nachziehen: den aufgelösten Konflikt aus der gemerkten Liste
    // entfernen, damit ein erneutes Öffnen des Sync-Fensters ihn nicht wieder
    // als "ungelöst" anzeigt (siehe openSyncSettingsModal in app.js).
    const remainingConflicts = (currentStatus.conflicts || []).filter(c => c.relPath !== relPath);
    currentStatus = {
      ...currentStatus,
      state: remainingConflicts.length ? 'conflicts' : 'idle',
      conflictCount: remainingConflicts.length,
      conflicts: remainingConflicts,
      lastSyncAt: currentStatus.lastSyncAt || new Date().toISOString()
    };
    broadcastStatus(getMainWindow);

    return { success: true };
  }));
}

module.exports = {
  registerSyncIpc,
  savePasswordForProject,
  isSyncInProgress,
  runExclusiveSyncMutation,
  validateWebDavUrl,
  resolveSyncLocalPath,
  remoteFilenameToRelative
};
