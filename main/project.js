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
  defaultBackupPath,
  isValidProject
};
