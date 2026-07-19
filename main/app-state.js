// main/app-state.js
// Speichert app-weite Einstellungen (aktuell nur: zuletzt geöffneter
// Projektordner) in Electrons userData-Verzeichnis. Bewusst getrennt von
// .wiki-config.json, das PRO PROJEKT im jeweiligen Projektordner liegt.

'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

function getAppStatePath() {
  return path.join(app.getPath('userData'), 'app-state.json');
}

function readAppState() {
  try {
    const raw = fs.readFileSync(getAppStatePath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return { lastProjectPath: null };
  }
}

function writeAppState(partial) {
  const next = { ...readAppState(), ...partial };
  fs.mkdirSync(path.dirname(getAppStatePath()), { recursive: true });
  fs.writeFileSync(getAppStatePath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

module.exports = { readAppState, writeAppState, getAppStatePath };
