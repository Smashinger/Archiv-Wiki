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
const { readProjectConfig, writeProjectConfig, TRASH_DIRNAME } = require('./project');
const { classifyFile, isExcluded, MANIFEST_FILENAME } = require('./sync-classify');
const { readAppState, writeAppState } = require('./app-state');

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
  const p = path.join(projectPath, MANIFEST_FILENAME);
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
}

function saveManifest(projectPath, manifest) {
  fs.writeFileSync(path.join(projectPath, MANIFEST_FILENAME), JSON.stringify(manifest, null, 2), 'utf8');
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
  fs.writeFileSync(credentialsFilePath(), JSON.stringify(store, null, 2), 'utf8');
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
let lastAutoSyncAt = 0;
let currentStatus = { state: 'idle', lastSyncAt: null, lastError: null, conflictCount: 0, conflicts: [] };

function broadcastStatus(getMainWindow) {
  const win = getMainWindow?.();
  if (win && !win.isDestroyed()) win.webContents.send('sync:statusUpdate', currentStatus);
}

async function maybeRunAutoSync({ getCurrentProject, getMainWindow }) {
  const project = getCurrentProject?.();
  if (!project?.path) return;
  const config = readProjectConfig(project.path) || {};
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

  lastAutoSyncAt = Date.now();
  currentStatus = { ...currentStatus, state: 'syncing' };
  broadcastStatus(getMainWindow);

  syncInProgress = true;
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
  } finally {
    syncInProgress = false;
  }
  broadcastStatus(getMainWindow);
}

// ---------------------------------------------------------------------------
// Abgleich-Kernlogik (Stufe 3/6) — als eigenständige Funktion statt nur
// inline im IPC-Handler, damit sowohl ein Button-Klick (Renderer → IPC) als
// auch der Hintergrund-Timer (Stufe 6, rein im Main-Prozess, kein IPC nötig)
// dieselbe Logik nutzen. Siehe classifyFile()-Kommentar für die Regeln.
// ---------------------------------------------------------------------------
// Für sauberes Beenden (main.js quitCleanly): zeigt an, ob GERADE ein
// Cloud-Abgleich läuft.
let syncInProgress = false;
function isSyncInProgress() { return syncInProgress; }

async function performSyncAll({ projectPath, url, username, password }) {
  if (!url) throw new Error('Bitte eine WebDAV-URL angeben.');
  const { createClient } = await import('webdav');
  const client = createClient(url, { username, password });

  const manifest = loadManifest(projectPath);

  // Remote-Dateien (rekursiv, nur type:'file')
  const remoteEntries = await client.getDirectoryContents('/', { deep: true });
  const remoteFiles = new Map(); // relPath -> { etag, size }
  for (const entry of remoteEntries) {
    if (entry.type !== 'file') continue;
    const relPath = entry.filename.replace(/^\/+/, '');
    if (isExcluded(relPath)) continue;
    remoteFiles.set(relPath, { etag: entry.etag, size: entry.size });
  }

  // Lokale Dateien (rekursiv)
  const localFiles = new Map(); // relPath -> { mtime: Date, size, fullPath }
  function walkLocal(dirPath, relPrefix) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (isExcluded(entry.isDirectory() ? relPath + '/' : relPath) || entry.name === TRASH_DIRNAME || entry.name === MANIFEST_FILENAME) continue;
      const fullPath = path.join(dirPath, entry.name);
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
    await ensureRemoteDir(relPath);
    await client.putFileContents(relPath, fs.readFileSync(local.fullPath), { overwrite: true });
    const newStat = await client.stat(relPath); // echtes neues ETag holen, nicht raten
    manifest[relPath] = { localMtime: local.mtime.toISOString(), localSize: local.size, remoteEtag: newStat.etag, remoteSize: newStat.size };
  }

  async function doDownload(relPath, remote) {
    const localFullPath = path.join(projectPath, relPath);
    fs.mkdirSync(path.dirname(localFullPath), { recursive: true });
    const content = await client.getFileContents(relPath);
    fs.writeFileSync(localFullPath, content);
    const newStat = fs.statSync(localFullPath);
    manifest[relPath] = { localMtime: newStat.mtime.toISOString(), localSize: newStat.size, remoteEtag: remote.etag, remoteSize: remote.size };
  }

  let uploaded = 0, downloaded = 0, skipped = 0, deletedLocal = 0, deletedRemote = 0;
  const conflicts = [];
  const allRelPaths = new Set([...localFiles.keys(), ...remoteFiles.keys(), ...Object.keys(manifest)]);

  for (const relPath of allRelPaths) {
    const local = localFiles.get(relPath);
    const remote = remoteFiles.get(relPath);
    const m = manifest[relPath];

    let contentIdentical = false;
    if (!m && local && remote) {
      const localContent = fs.readFileSync(local.fullPath);
      const remoteContent = await client.getFileContents(relPath);
      contentIdentical = Buffer.isBuffer(remoteContent)
        ? localContent.equals(remoteContent)
        : localContent.toString('utf8') === remoteContent;
    }

    const decision = classifyFile({
      localExists: Boolean(local),
      remoteExists: Boolean(remote),
      hasManifestEntry: Boolean(m),
      localChanged: Boolean(local && m && (local.mtime.toISOString() !== m.localMtime || local.size !== m.localSize)),
      remoteChanged: Boolean(remote && m && (remote.etag !== m.remoteEtag || remote.size !== m.remoteSize)),
      contentIdentical
    });

    switch (decision.action) {
      case 'cleanup':
        delete manifest[relPath];
        break;
      case 'skip':
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
        fs.unlinkSync(local.fullPath); delete manifest[relPath]; deletedLocal++;
        break;
      case 'conflict':
        conflicts.push({ relPath, reason: decision.reason, localExists: Boolean(local), remoteExists: Boolean(remote) });
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

function registerSyncIpc({ getCurrentProject, getMainWindow }) {
  function requireProjectPath() {
    const projectPath = getCurrentProject()?.path;
    if (!projectPath) throw new Error('Kein Projekt geöffnet.');
    return projectPath;
  }

  // Jede Minute prüfen, ob laut Einstellungen ein automatischer Abgleich fällig ist.
  setInterval(() => { maybeRunAutoSync({ getCurrentProject, getMainWindow }).catch(() => {}); }, 60 * 1000);

  ipcMain.handle('sync:getAutoSyncSettings', () => {
    const projectPath = requireProjectPath();
    const config = readProjectConfig(projectPath) || {};
    return {
      enabled: Boolean(config.sync?.autoSync?.enabled),
      intervalMinutes: config.sync?.autoSync?.intervalMinutes || 15
    };
  });

  ipcMain.handle('sync:saveAutoSyncSettings', (_e, { enabled, intervalMinutes }) => {
    const projectPath = requireProjectPath();
    const config = readProjectConfig(projectPath) || {};
    config.sync = { ...(config.sync || {}), autoSync: { enabled: Boolean(enabled), intervalMinutes: Number(intervalMinutes) || 15 } };
    writeProjectConfig(projectPath, config);
    if (enabled) lastAutoSyncAt = 0; // beim Aktivieren nicht erst ein volles Intervall warten
    return { saved: true };
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
    const config = readProjectConfig(projectPath) || {};
    const encryptionAvailable = safeStorage.isEncryptionAvailable();
    let savedPassword = '';
    if (encryptionAvailable) {
      const store = loadCredentialsStore();
      const encB64 = store[projectPath];
      if (encB64) {
        try { savedPassword = safeStorage.decryptString(Buffer.from(encB64, 'base64')); } catch { savedPassword = ''; }
      }
    }
    return { url: config.sync?.url || '', username: config.sync?.username || '', savedPassword, encryptionAvailable };
  });

  ipcMain.handle('sync:saveSettings', (_e, { url, username }) => {
    const projectPath = requireProjectPath();
    const config = readProjectConfig(projectPath) || {};
    const newUrl = url || '', newUsername = username || '';
    // Bugfix (per Nutzer-Meldung: .wiki-config.json tauchte bei JEDEM Abgleich
    // als "Konflikt" auf): vorher wurde hier UNBEDINGT geschrieben, bei jedem
    // Klick auf "Abgleich" — auch wenn sich an URL/Benutzername gar nichts
    // geändert hatte. Das gab der Datei jedes Mal einen frischen Zeitstempel,
    // kurz bevor der Sync-Vergleich überhaupt lief, und ließ sie dadurch
    // fälschlich immer als "gerade eben lokal geändert" erscheinen. Jetzt nur
    // noch schreiben, wenn sich tatsächlich etwas unterscheidet.
    if (config.sync?.url === newUrl && config.sync?.username === newUsername) {
      return { saved: true };
    }
    config.sync = { ...(config.sync || {}), url: newUrl, username: newUsername };
    writeProjectConfig(projectPath, config);
    return { saved: true };
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
    if (!url) throw new Error('Bitte eine WebDAV-URL angeben.');
    const { createClient } = await import('webdav');
    const client = createClient(url, { username, password });
    await client.getDirectoryContents('/'); // wirft bei falscher URL/Zugangsdaten
    return { success: true };
  });

  // ---------------------------------------------------------------------
  // Reiner Upload (Stufe 1): kompletter Projektordner → WebDAV, .wiki-trash
  // ausgeschlossen (wie beim ZIP-Export). NUR Push, kein Abgleich/Konflikt-
  // erkennung — das ist bewusst Stufe 2/3 und noch nicht Teil hiervon.
  // Überschreibt vorhandene Remote-Dateien kommentarlos.
  // ---------------------------------------------------------------------
  ipcMain.handle('sync:uploadAll', async (_e, { url, username, password }) => {
    const projectPath = requireProjectPath();
    if (!url) throw new Error('Bitte eine WebDAV-URL angeben.');
    const { createClient } = await import('webdav');
    const client = createClient(url, { username, password });

    let uploaded = 0;
    async function walk(dirPath, remoteRelPath) {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const remotePath = remoteRelPath ? `${remoteRelPath}/${entry.name}` : entry.name;
        if (isExcluded(entry.isDirectory() ? remotePath + '/' : remotePath) || entry.name === TRASH_DIRNAME || entry.name === MANIFEST_FILENAME) continue;
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          try { await client.createDirectory(remotePath); } catch { /* existiert evtl. schon — kein Problem */ }
          await walk(fullPath, remotePath);
        } else {
          const content = fs.readFileSync(fullPath);
          await client.putFileContents(remotePath, content, { overwrite: true });
          uploaded++;
        }
      }
    }
    await walk(projectPath, '');
    return { success: true, uploaded };
  });

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

  ipcMain.handle('sync:syncAll', async (_e, { url, username, password }) => {
    const projectPath = requireProjectPath();
    currentStatus = { ...currentStatus, state: 'syncing' };
    broadcastStatus(getMainWindow);
    syncInProgress = true;
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
    } finally {
      syncInProgress = false;
    }
  });

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
  ipcMain.handle('sync:resolveConflict', async (_e, { url, username, password, relPath, resolution }) => {
    const projectPath = requireProjectPath();
    if (!url) throw new Error('Bitte eine WebDAV-URL angeben.');
    const { createClient } = await import('webdav');
    const client = createClient(url, { username, password });

    const localFullPath = path.join(projectPath, relPath);
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
        await client.putFileContents(relPath, fs.readFileSync(localFullPath), { overwrite: true });
        const newStat = await client.stat(relPath);
        const localStat = fs.statSync(localFullPath);
        manifest[relPath] = { localMtime: localStat.mtime.toISOString(), localSize: localStat.size, remoteEtag: newStat.etag, remoteSize: newStat.size };
      } else {
        if (remoteExists) await client.deleteFile(relPath);
        delete manifest[relPath];
      }
    } else if (resolution === 'keep-remote') {
      if (remoteExists) {
        fs.mkdirSync(path.dirname(localFullPath), { recursive: true });
        const content = await client.getFileContents(relPath);
        fs.writeFileSync(localFullPath, content);
        const localStat = fs.statSync(localFullPath);
        manifest[relPath] = { localMtime: localStat.mtime.toISOString(), localSize: localStat.size, remoteEtag: remoteStat.etag, remoteSize: remoteStat.size };
      } else {
        if (localExists) fs.unlinkSync(localFullPath);
        delete manifest[relPath];
      }
    } else if (resolution === 'keep-both') {
      if (!localExists || !remoteExists) {
        throw new Error('„Beide behalten" ist nur möglich, wenn auf beiden Seiten eine Version existiert.');
      }
      const ext = path.extname(relPath);
      const base = ext ? relPath.slice(0, -ext.length) : relPath;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const conflictFullPath = path.join(projectPath, `${base} (lokale Version, Konflikt ${stamp})${ext}`);
      fs.renameSync(localFullPath, conflictFullPath);
      const content = await client.getFileContents(relPath);
      fs.writeFileSync(localFullPath, content);
      const localStat = fs.statSync(localFullPath);
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
  });
}

module.exports = { registerSyncIpc, savePasswordForProject, isSyncInProgress };
