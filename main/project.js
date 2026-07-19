// main/project.js
// Kleine, abhängigkeitsfreie Helfer rund um den Projektordner und seine
// .wiki-config.json. Wird vom Setup-Wizard (Schritt 2) geschrieben und
// später von filesystem.js (Schritt 3) gelesen/aktualisiert.

'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const CONFIG_FILENAME = '.wiki-config.json';
const TRASH_DIRNAME = '.wiki-trash';

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
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  return config;
}

// XDG-Konvention: ~/.local/share/archiv-wiki/backups (so in der Spec gefordert;
// bewusst NICHT Electrons app.getPath('userData'), das auf Linux ~/.config wäre).
function defaultBackupPath() {
  return path.join(app.getPath('home'), '.local', 'share', 'archiv-wiki', 'backups');
}

function isValidProject(projectPath) {
  return Boolean(projectPath) && fs.existsSync(projectPath) && hasExistingConfig(projectPath);
}

module.exports = {
  CONFIG_FILENAME,
  TRASH_DIRNAME,
  isDirWritable,
  hasExistingConfig,
  readProjectConfig,
  writeProjectConfig,
  defaultBackupPath,
  isValidProject
};
