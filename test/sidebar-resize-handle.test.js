// test/sidebar-resize-handle.test.js
// Sidebar-Griff (Breite ziehen) und sein Rechtsklick-Menü: dünne sichtbare
// Linie statt breitem Balken/Fokusrahmen, einzeiliger Menüeintrag. Reine
// Quelltextprüfungen, ohne Electron.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('Sidebar-Griff: große Greiffläche, aber nur eine 2px-Linie sichtbar', () => {
  const css = read('renderer/css/layout.css');
  assert.match(css, /\.sidebar-resize-handle\{[^}]*width: 6px;[^}]*background: transparent;/);
  assert.match(css, /\.sidebar-resize-handle::after\{[^}]*width:2px;[^}]*pointer-events:none;/);
  assert.match(css, /\.sidebar-resize-handle:focus-visible::after\{ background: var\(--accent-color\); \}/);
  assert.match(css, /\.sidebar-resize-handle:focus-visible\{ outline: none; \}/, 'kein breiter Fokusrahmen um den Griff');
  // Die Greiffläche selbst wird bei Hover/Ziehen nicht mehr eingefärbt.
  assert.doesNotMatch(css, /\.sidebar-resize-handle:hover,\s*\.sidebar-resize-handle\.resizing\{/);
});

test('Sidebar-Griff: nur die linke Maustaste zieht, Rechtsklick öffnet das Menü', () => {
  const app = read('renderer/js/app.js');
  const init = app.match(/\(function initSidebarResize\(\) \{([\s\S]*?)\n\}\)\(\);/);
  assert.ok(init, 'initSidebarResize fehlt');
  assert.match(init[1], /addEventListener\('mousedown', \(e\) => \{\s*(?:\/\/[^\n]*\n\s*)*if \(e\.button !== 0\) return;/);
});

test('Rechtsklick-Menü am Sidebar-Griff: einzeilig, Symbol wie in den anderen Menüs', () => {
  const app = read('renderer/js/app.js');
  assert.match(app, /className: 'context-menu sidebar-width-menu'/);
  assert.match(app, /<span class="context-menu-icon" aria-hidden="true">↺<\/span><span>Standardbreite wiederherstellen<\/span>/);
  const css = read('renderer/css/components.css');
  assert.match(css, /\.sidebar-width-menu\{ max-width:none; \}/);
  assert.match(css, /\.sidebar-width-menu button\{ white-space:nowrap; \}/);
});
