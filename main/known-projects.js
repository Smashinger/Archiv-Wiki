// main/known-projects.js
// Wiki-Wechsler: Liste der bekannten Archiv-Wiki-Projektordner. Es ist
// immer genau EIN Wiki aktiv (currentProject in main.js); diese Liste dient
// nur dem schnellen Wechsel zwischen bereits geöffneten Wikis. Gespeichert
// wird sie app-weit in app-state.json (Feld knownProjects), nie im
// Projektordner selbst — ein Wiki-Ordner bleibt dadurch unverändert.
//
// Die Listenlogik (normalize/remember/forget/describe) ist bewusst frei von
// Electron-Abhängigkeiten und damit direkt mit `node --test` prüfbar. Nur
// registerKnownProjectsIpc() braucht ipcMain.

'use strict';

const path = require('path');
const fs = require('fs');
const { readProjectConfig, isDirWritable } = require('./project');

// Obergrenze, damit die Liste in app-state.json nicht unbegrenzt wächst. Die
// am längsten nicht mehr geöffneten Einträge fallen zuerst heraus.
const MAX_KNOWN_PROJECTS = 20;

function normalizeProjectPath(projectPath) {
  if (typeof projectPath !== 'string' || !projectPath.trim()) return null;
  return path.resolve(projectPath);
}

function fallbackProjectName(projectPath) {
  return path.basename(projectPath) || projectPath;
}

function cleanName(name) {
  return typeof name === 'string' ? name.trim() : '';
}

// Macht aus einem beliebigen (evtl. beschädigten oder von Hand bearbeiteten)
// app-state-Wert eine saubere Liste: nur Einträge mit Pfad, jeder Pfad nur
// einmal, neueste zuerst, höchstens MAX_KNOWN_PROJECTS Einträge.
function normalizeKnownProjects(list) {
  if (!Array.isArray(list)) return [];
  const byPath = new Map();
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const projectPath = normalizeProjectPath(entry.path);
    if (!projectPath) continue;
    const lastOpened = typeof entry.lastOpened === 'string' ? entry.lastOpened : null;
    const previous = byPath.get(projectPath);
    if (previous && String(previous.lastOpened || '') >= String(lastOpened || '')) continue;
    byPath.set(projectPath, {
      name: cleanName(entry.name) || fallbackProjectName(projectPath),
      path: projectPath,
      lastOpened
    });
  }
  return [...byPath.values()]
    .sort((a, b) => String(b.lastOpened || '').localeCompare(String(a.lastOpened || '')))
    .slice(0, MAX_KNOWN_PROJECTS);
}

// Trägt ein gerade geöffnetes Wiki ein bzw. aktualisiert Name und Zeitpunkt.
function rememberKnownProject(list, { path: projectPath, name } = {}, now = new Date()) {
  const normalizedPath = normalizeProjectPath(projectPath);
  if (!normalizedPath) return normalizeKnownProjects(list);
  const rest = normalizeKnownProjects(list).filter(entry => entry.path !== normalizedPath);
  return normalizeKnownProjects([
    {
      name: cleanName(name) || fallbackProjectName(normalizedPath),
      path: normalizedPath,
      lastOpened: now.toISOString()
    },
    ...rest
  ]);
}

// Entfernt ein Wiki NUR aus der Liste. Der Ordner selbst wird nie angefasst.
function forgetKnownProject(list, projectPath) {
  const normalizedPath = normalizeProjectPath(projectPath);
  return normalizeKnownProjects(list).filter(entry => entry.path !== normalizedPath);
}

// Reiner Lesezugriff: prüft, ob der Ordner noch da ist und ein gültiges
// Archiv-Wiki enthält. 'missing' = Ordner fehlt (gelöscht, verschoben,
// Laufwerk nicht verbunden), 'invalid' = Ordner da, aber kein lesbares Wiki.
function inspectKnownProject(projectPath) {
  try {
    if (!fs.statSync(projectPath).isDirectory()) return { status: 'missing', config: null };
  } catch {
    return { status: 'missing', config: null };
  }
  try {
    const config = readProjectConfig(projectPath);
    return config ? { status: 'ok', config } : { status: 'invalid', config: null };
  } catch {
    return { status: 'invalid', config: null };
  }
}

// Ansichtsdaten für die Auswahlliste im Renderer. Der Name wird für
// vorhandene Wikis frisch aus deren Konfiguration gelesen (wikiName), damit
// eine Umbenennung in den Einstellungen sofort sichtbar ist.
function describeKnownProjects(list, currentPath, inspect = inspectKnownProject) {
  const normalizedCurrent = normalizeProjectPath(currentPath);
  return normalizeKnownProjects(list).map((entry) => {
    const { status, config } = inspect(entry.path);
    const liveName = cleanName(config?.wikiName);
    return {
      name: liveName || entry.name,
      path: entry.path,
      lastOpened: entry.lastOpened,
      isCurrent: entry.path === normalizedCurrent,
      status
    };
  });
}

function missingProjectMessage(projectPath) {
  return `Das Wiki wurde unter „${projectPath}“ nicht gefunden. Vielleicht wurde der Ordner verschoben, umbenannt oder gelöscht, oder ein Laufwerk ist gerade nicht verbunden.`;
}

function invalidProjectMessage(projectPath) {
  return `Im Ordner „${projectPath}“ ist kein lesbares Archiv-Wiki (mehr) vorhanden. Der Ordner wurde nicht verändert.`;
}

// Prüft einen im Ordnerdialog („Weiteren Wiki-Ordner öffnen …“) gewählten
// Ordner, BEVOR er geöffnet wird — reiner Lesezugriff:
// 'wiki'    = enthält ein Archiv-Wiki → normal öffnen
// 'no-wiki' = Ordner ohne .wiki-config.json (z. B. gerade im Dialog neu
//             angelegt) → statt eines Fehlers ein neues Wiki anbieten
// 'invalid' = Konfiguration vorhanden, aber beschädigt/unlesbar
// 'missing' = Ordner existiert nicht (mehr)
function inspectFolderForOpening(folderPath) {
  const target = normalizeProjectPath(folderPath);
  if (!target) return { status: 'missing', path: null, message: 'Es wurde kein Ordner angegeben.' };
  try {
    if (!fs.statSync(target).isDirectory()) {
      return { status: 'missing', path: target, message: missingFolderMessage(target) };
    }
  } catch {
    return { status: 'missing', path: target, message: missingFolderMessage(target) };
  }
  let config;
  try {
    config = readProjectConfig(target);
  } catch (error) {
    return { status: 'invalid', path: target, message: error?.message || invalidProjectMessage(target) };
  }
  if (config) return { status: 'wiki', path: target };
  let entryCount = null;
  try { entryCount = fs.readdirSync(target).length; } catch { /* nicht lesbar → unbekannt */ }
  const writable = isDirWritable(target);
  return {
    status: 'no-wiki',
    path: target,
    writable,
    entryCount,
    message: writable ? noWikiMessage(target) : noWikiNotWritableMessage(target)
  };
}

function missingFolderMessage(folderPath) {
  return `Der Ordner „${folderPath}“ wurde nicht gefunden.`;
}

function noWikiMessage(folderPath) {
  return `Im Ordner „${folderPath}“ gibt es noch kein Archiv-Wiki.`;
}

function noWikiNotWritableMessage(folderPath) {
  return `Im Ordner „${folderPath}“ gibt es kein Archiv-Wiki, und die App darf dort auch keins anlegen (keine Schreibrechte). Bitte wähle einen anderen Ordner. Es wurde nichts verändert.`;
}

function registerKnownProjectsIpc({
  ipcMain,
  getCurrentProject,
  readAppState,
  writeAppState,
  onProjectReady,
  onCreateWikiInFolder
}) {
  const readList = () => normalizeKnownProjects(readAppState().knownProjects);

  ipcMain.handle('projects:getKnown', () => {
    const currentPath = getCurrentProject()?.path || null;
    return {
      currentPath: normalizeProjectPath(currentPath),
      projects: describeKnownProjects(readList(), currentPath)
    };
  });

  ipcMain.handle('projects:switchTo', (_event, projectPath) => {
    const targetPath = normalizeProjectPath(projectPath);
    if (!targetPath) return { ok: false, reason: 'invalid', message: 'Es wurde kein Wiki-Ordner angegeben.' };
    // Nur Wikis aus der eigenen Liste — neue Ordner laufen weiterhin über den
    // Ordnerdialog (wizard:openExisting).
    if (!readList().some(entry => entry.path === targetPath)) {
      return { ok: false, reason: 'unknown', message: 'Dieses Wiki steht nicht in der Liste der bekannten Wikis.' };
    }
    if (normalizeProjectPath(getCurrentProject()?.path) === targetPath) {
      return { ok: true, unchanged: true };
    }
    const { status, config } = inspectKnownProject(targetPath);
    if (status === 'missing') return { ok: false, reason: 'missing', message: missingProjectMessage(targetPath) };
    if (status !== 'ok') return { ok: false, reason: 'invalid', message: invalidProjectMessage(targetPath) };
    writeAppState({ lastProjectPath: targetPath });
    // onProjectReady (handleProjectReady in main.js) trägt das Wiki erneut
    // in die Liste ein und lädt das Hauptfenster neu.
    onProjectReady(targetPath, config);
    return { ok: true };
  });

  ipcMain.handle('projects:forget', (_event, projectPath) => {
    const targetPath = normalizeProjectPath(projectPath);
    if (!targetPath) return { ok: false, message: 'Es wurde kein Wiki-Ordner angegeben.' };
    if (normalizeProjectPath(getCurrentProject()?.path) === targetPath) {
      return { ok: false, message: 'Das gerade geöffnete Wiki kann nicht aus der Liste entfernt werden.' };
    }
    writeAppState({ knownProjects: forgetKnownProject(readList(), targetPath) });
    return { ok: true };
  });

  ipcMain.handle('projects:inspectFolder', (_event, folderPath) => inspectFolderForOpening(folderPath));

  // Neues Wiki in einem Ordner ohne Wiki anlegen: öffnet den
  // Einrichtungsassistenten mit diesem Ordner. Angelegt wird erst dort beim
  // Abschließen (wizard:finish) — hier wird nichts geschrieben.
  ipcMain.handle('projects:createInFolder', (_event, folderPath) => {
    const inspected = inspectFolderForOpening(folderPath);
    if (inspected.status === 'wiki') {
      return { ok: false, message: 'In diesem Ordner gibt es bereits ein Archiv-Wiki. Es wurde nichts verändert.' };
    }
    if (inspected.status !== 'no-wiki' || !inspected.writable) {
      return { ok: false, message: inspected.message };
    }
    if (typeof onCreateWikiInFolder !== 'function') {
      return { ok: false, message: 'Der Einrichtungsassistent ist gerade nicht verfügbar.' };
    }
    return onCreateWikiInFolder(inspected.path);
  });
}

module.exports = {
  MAX_KNOWN_PROJECTS,
  normalizeProjectPath,
  normalizeKnownProjects,
  rememberKnownProject,
  forgetKnownProject,
  inspectKnownProject,
  describeKnownProjects,
  inspectFolderForOpening,
  missingProjectMessage,
  invalidProjectMessage,
  registerKnownProjectsIpc
};
