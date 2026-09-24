// main/project.js
// Kleine, abhängigkeitsfreie Helfer rund um den Projektordner und seine
// .wiki-config.json. Wird vom Setup-Wizard (Schritt 2) geschrieben und
// später von filesystem.js (Schritt 3) gelesen/aktualisiert.

'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { atomicWriteFileSync } = require('./atomic-write');

const CONFIG_FILENAME = '.wiki-config.json';
const TRASH_DIRNAME = '.wiki-trash';
const INCOMING_DIRNAME = 'incoming';
const INCOMING_MARKER_FILENAME = '.archiv-wiki-incoming';

function createProjectConfigError(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateProjectConfig(config) {
  if (!isPlainObject(config)) {
    throw createProjectConfigError(
      'PROJECT_CONFIG_INVALID_STRUCTURE',
      'Die Projektkonfiguration ist strukturell ungültig und konnte nicht verwendet werden. Die Datei wurde nicht verändert.'
    );
  }
  return config;
}

function cloneProjectConfig(config) {
  validateProjectConfig(config);
  return validateProjectConfig(JSON.parse(JSON.stringify(config)));
}

function adoptProjectConfig(currentProject, projectPath, config) {
  if (!projectPath || currentProject?.path !== projectPath) return currentProject;
  return { ...currentProject, config: cloneProjectConfig(config) };
}

function isDirWritable(dirPath) {
  try {
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function hasExistingConfig(dirPath) {
  return fs.existsSync(path.join(dirPath, CONFIG_FILENAME));
}

function readProjectConfig(projectPath) {
  const configPath = path.join(projectPath, CONFIG_FILENAME);
  let raw;
  try {
    raw = fs.readFileSync(configPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw createProjectConfigError(
      'PROJECT_CONFIG_UNREADABLE',
      'Die Projektkonfiguration konnte nicht gelesen werden. Die Datei wurde nicht verändert.',
      error
    );
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (error) {
    throw createProjectConfigError(
      'PROJECT_CONFIG_INVALID_JSON',
      'Die Projektkonfiguration ist beschädigt und konnte nicht gelesen werden. Die Datei wurde nicht verändert.',
      error
    );
  }

  return validateProjectConfig(config);
}

function requireProjectConfig(projectPath) {
  const config = readProjectConfig(projectPath);
  if (config === null) {
    throw createProjectConfigError(
      'PROJECT_CONFIG_MISSING',
      'Die Projektkonfiguration fehlt. Es wurden keine Änderungen gespeichert.'
    );
  }
  return config;
}

function writeProjectConfig(projectPath, config, options = {}) {
  const configPath = path.join(projectPath, CONFIG_FILENAME);
  validateProjectConfig(config);

  if (options.create === true) {
    if (readProjectConfig(projectPath) !== null) {
      throw createProjectConfigError(
        'PROJECT_CONFIG_ALREADY_EXISTS',
        'In diesem Ordner ist bereits eine Projektkonfiguration vorhanden. Sie wurde nicht überschrieben.'
      );
    }
  } else {
    // Jede Mutation einer bestehenden Config prüft unmittelbar vor dem
    // atomaren Schreiben erneut, dass die vorhandene Datei lesbar und als
    // Objekt verwendbar ist. Ein Parse-/Lese-/Basistypfehler kann dadurch nie
    // als leere Konfiguration überschrieben werden.
    requireProjectConfig(projectPath);
  }

  let serializedConfig;
  try {
    serializedConfig = JSON.stringify(config, null, 2);
    atomicWriteFileSync(configPath, serializedConfig, 'utf8');
  } catch (error) {
    throw createProjectConfigError(
      'PROJECT_CONFIG_WRITE_FAILED',
      'Die Projektkonfiguration konnte nicht gespeichert werden. Die bisherige Datei blieb unverändert.',
      error
    );
  }

  // Die Rückgabe bildet exakt den JSON-Zustand ab, der erfolgreich auf Disk
  // geschrieben wurde. Dadurch übernehmen Main-Cache und Renderer nicht eine
  // davon abweichende, noch mutierbare Eingabereferenz.
  return validateProjectConfig(JSON.parse(serializedConfig));
}

// Pfadumschreibung in .wiki-config.json nach Umbenennen/Verschieben eines
// Eintrags (Notiz ODER Kategorie). Ursprünglich nur lokal in
// main/filesystem-ipc.js (für die manuelle Sidebar-Bedienung). Seit KI-Block 3
// auch von main/ai-proposals.js genutzt (propose_rename_category,
// propose_move_subcategory) — keine zweite Migrationslogik für denselben
// Zweck. Rein reines Datenobjekt-Update, kein Dateizugriff.
function migrateConfigPaths(config, oldRelPath, newRelPath) {
  if (!config || typeof config !== 'object') return false;
  let changed = false;

  if (config.categoryIcons && typeof config.categoryIcons === 'object') {
    const updatedIcons = {};
    for (const [key, icon] of Object.entries(config.categoryIcons)) {
      if (key === oldRelPath) {
        updatedIcons[newRelPath] = icon;
        changed = true;
      } else if (key.startsWith(oldRelPath + '/')) {
        updatedIcons[newRelPath + key.slice(oldRelPath.length)] = icon;
        changed = true;
      } else {
        updatedIcons[key] = icon;
      }
    }
    if (changed) config.categoryIcons = updatedIcons;
  }

  if (config.childOrder && typeof config.childOrder === 'object') {
    const updatedOrder = {};
    const oldParent = oldRelPath.includes('/') ? oldRelPath.split('/').slice(0, -1).join('/') : '';
    const newParent = newRelPath.includes('/') ? newRelPath.split('/').slice(0, -1).join('/') : '';
    const oldName = oldRelPath.split('/').pop();
    const newName = newRelPath.split('/').pop();

    for (const [parentKey, list] of Object.entries(config.childOrder)) {
      let targetParentKey = parentKey;
      if (parentKey === oldRelPath) {
        targetParentKey = newRelPath;
        changed = true;
      } else if (parentKey.startsWith(oldRelPath + '/')) {
        targetParentKey = newRelPath + parentKey.slice(oldRelPath.length);
        changed = true;
      }

      if (Array.isArray(list)) {
        let nextList = list;
        if (parentKey === oldParent) {
          if (oldParent === newParent) {
            nextList = list.map(item => (item === oldName ? newName : item));
            if (nextList.some((item, i) => item !== list[i])) changed = true;
          } else {
            nextList = list.filter(item => item !== oldName);
            if (nextList.length !== list.length) changed = true;
          }
        }
        updatedOrder[targetParentKey] = nextList;
      } else {
        updatedOrder[targetParentKey] = list;
      }
    }
    if (changed) config.childOrder = updatedOrder;
  }

  if (Array.isArray(config.savedCollapsedGroups)) {
    const nextCollapsed = config.savedCollapsedGroups.map(p => {
      if (p === oldRelPath) {
        changed = true;
        return newRelPath;
      }
      if (p.startsWith(oldRelPath + '/')) {
        changed = true;
        return newRelPath + p.slice(oldRelPath.length);
      }
      return p;
    });
    if (changed) config.savedCollapsedGroups = nextCollapsed;
  }

  if (config.noteScrollPositions && typeof config.noteScrollPositions === 'object') {
    const updatedPositions = {};
    for (const [key, pos] of Object.entries(config.noteScrollPositions)) {
      if (key === oldRelPath) {
        updatedPositions[newRelPath] = pos;
        changed = true;
      } else if (key.startsWith(oldRelPath + '/')) {
        updatedPositions[newRelPath + key.slice(oldRelPath.length)] = pos;
        changed = true;
      } else {
        updatedPositions[key] = pos;
      }
    }
    if (changed) config.noteScrollPositions = updatedPositions;
  }

  return changed;
}

// Pfadbereinigung in .wiki-config.json nach endgültiger Entfernung eines
// Eintrags (Papierkorb). Gleiche Herkunft/Nutzung wie migrateConfigPaths()
// oben.
function removeConfigPaths(config, relPath) {
  if (!config || typeof config !== 'object') return false;
  let changed = false;

  if (config.categoryIcons && typeof config.categoryIcons === 'object') {
    for (const key of Object.keys(config.categoryIcons)) {
      if (key === relPath || key.startsWith(relPath + '/')) {
        delete config.categoryIcons[key];
        changed = true;
      }
    }
  }

  if (config.childOrder && typeof config.childOrder === 'object') {
    const parentDir = relPath.includes('/') ? relPath.split('/').slice(0, -1).join('/') : '';
    const baseName = relPath.split('/').pop();
    for (const [parentKey, list] of Object.entries(config.childOrder)) {
      if (parentKey === relPath || parentKey.startsWith(relPath + '/')) {
        delete config.childOrder[parentKey];
        changed = true;
      } else if (parentKey === parentDir && Array.isArray(list)) {
        const nextList = list.filter(item => item !== baseName);
        if (nextList.length !== list.length) {
          config.childOrder[parentKey] = nextList;
          changed = true;
        }
      }
    }
  }

  if (Array.isArray(config.savedCollapsedGroups)) {
    const nextCollapsed = config.savedCollapsedGroups.filter(
      p => p !== relPath && !p.startsWith(relPath + '/')
    );
    if (nextCollapsed.length !== config.savedCollapsedGroups.length) {
      config.savedCollapsedGroups = nextCollapsed;
      changed = true;
    }
  }

  if (config.noteScrollPositions && typeof config.noteScrollPositions === 'object') {
    for (const key of Object.keys(config.noteScrollPositions)) {
      if (key === relPath || key.startsWith(relPath + '/')) {
        delete config.noteScrollPositions[key];
        changed = true;
      }
    }
  }

  return changed;
}

function updateProjectConfig(projectPath, mutateConfig) {
  if (typeof mutateConfig !== 'function') {
    throw new TypeError('Config-Mutation muss eine Funktion sein.');
  }

  // Sämtliche heutigen Config-IPC-Handler arbeiten synchron. Der Main-
  // Eventloop führt deshalb diese vollständige Read/Modify/Write-Sequenz aus,
  // bevor die nächste Mutation beginnen kann. Jede Mutation basiert dabei auf
  // dem frisch validierten Disk-Stand, nicht auf currentProject.config.
  const draft = cloneProjectConfig(requireProjectConfig(projectPath));
  const mutationResult = mutateConfig(draft);
  const nextConfig = mutationResult === undefined ? draft : mutationResult;
  return writeProjectConfig(projectPath, nextConfig);
}

// XDG-Konvention: ~/.local/share/archiv-wiki/backups (so in der Spec gefordert;
// bewusst NICHT Electrons app.getPath('userData'), das auf Linux ~/.config wäre).
function defaultBackupPath() {
  return path.join(app.getPath('home'), '.local', 'share', 'archiv-wiki', 'backups');
}

// Bugfix (Audit-Punkt 4): vorher wurde nur geprüft, ob die Datei EXISTIERT
// (hasExistingConfig), nicht ob sie gültiges JSON enthält. Bei einer
// beschädigten .wiki-config.json startete die App dadurch trotzdem direkt
// ins Hauptfenster, allerdings mit config: null — alle Einstellungen fielen
// dadurch lautlos auf Standardwerte zurück, ohne dass der Nutzer je erfuhr,
// dass seine Konfigurationsdatei kaputt war. Jetzt: tatsächlicher Parse-
// Versuch, nicht nur Existenzprüfung.
function isValidProject(projectPath) {
  if (!projectPath || !fs.existsSync(projectPath)) return false;
  try {
    return readProjectConfig(projectPath) !== null;
  } catch {
    return false;
  }
}

module.exports = {
  CONFIG_FILENAME,
  TRASH_DIRNAME,
  INCOMING_DIRNAME,
  INCOMING_MARKER_FILENAME,
  isDirWritable,
  hasExistingConfig,
  readProjectConfig,
  requireProjectConfig,
  validateProjectConfig,
  cloneProjectConfig,
  adoptProjectConfig,
  writeProjectConfig,
  updateProjectConfig,
  migrateConfigPaths,
  removeConfigPaths,
  defaultBackupPath,
  isValidProject
};
