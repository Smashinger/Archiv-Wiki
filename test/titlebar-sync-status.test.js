// @ts-check
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'renderer/js/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'renderer/index.html'), 'utf8');
const layout = fs.readFileSync(path.join(root, 'renderer/css/layout.css'), 'utf8');
const design3 = fs.readFileSync(path.join(root, 'renderer/css/design3.css'), 'utf8');

test('Titelleiste zeigt immer nur WEBDAV und erklärt den Zustand barrierefrei', () => {
  assert.match(html, /id="titlebarSyncText">WEBDAV<\/span>/);
  assert.match(html, /id="titlebarSyncDot" aria-hidden="true"/);
  assert.match(app, /titlebarSyncText\.textContent = 'WEBDAV'/);
  assert.match(app, /setAttribute\('aria-label'/);
  assert.doesNotMatch(app, /text: 'WEBDAV (?:AUS|BEREIT|SYNCHRONISIERT)'/);
});

test('WebDAV-Zustände verwenden die vereinbarten vier Punktklassen', () => {
  assert.match(app, /status\.state === 'syncing'[\s\S]*?cls: 'is-syncing'/);
  assert.match(app, /status\.state === 'error'[\s\S]*?cls: 'is-error'/);
  assert.match(app, /status\.state === 'conflicts'[\s\S]*?cls: 'is-error'/);
  assert.match(app, /!configured[\s\S]*?cls: 'is-offline'/);
  assert.match(app, /status\.lastSyncAt[\s\S]*?cls: 'is-ok'/);
});

test('Punktfarben sind in allen Designs klar: grün, blau, rot und grau', () => {
  for (const source of [layout, design3]) {
    assert.match(source, /\.app-titlebar-sync-dot\.is-ok\s*\{[^}]*background:/);
    assert.match(source, /\.app-titlebar-sync-dot\.is-syncing\s*\{[^}]*background:/);
    assert.match(source, /\.app-titlebar-sync-dot\.is-error\s*\{[^}]*background:/);
    assert.match(source, /\.app-titlebar-sync-dot\.is-offline\s*\{[^}]*background:/);
  }
  assert.match(layout, /\.is-ok\{ background: var\(--green\)/);
  assert.match(layout, /\.is-syncing\{ background: var\(--blue\)/);
  assert.match(layout, /\.is-error\{ background: var\(--red\)/);
  assert.match(layout, /\.is-offline\{ background: var\(--text-faint\)/);
});
