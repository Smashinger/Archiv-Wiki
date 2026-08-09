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
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return null;
  }
}

function writeProjectConfig(projectPath, config) {
  const configPath = path.join(projectPath, CONFIG_FILENAME);
  atomicWriteFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  return config;
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
  return Boolean(projectPath) && fs.existsSync(projectPath) && readProjectConfig(projectPath) !== null;
}

module.exports = {
  CONFIG_FILENAME,
  TRASH_DIRNAME,
  INCOMING_DIRNAME,
  INCOMING_MARKER_FILENAME,
  isDirWritable,
  hasExistingConfig,
  readProjectConfig,
  writeProjectConfig,
  defaultBackupPath,
  isValidProject
};
