// test/ux-regressions.test.js
// Regressionstests für die UX-Korrekturen aus dem Endbenutzer-Test (Codex,
// 17.09.2026) und der technischen Gegenprüfung. Laufen mit dem eingebauten
// Node-Test-Runner ohne Electron und ohne DOM: Layoutregeln werden als
// CSS-Quelltext geprüft (die tatsächliche Darstellung wurde zusätzlich in der
// laufenden App gemessen), reine Logik wird direkt importiert.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

// Liefert den Deklarationsblock der ERSTEN Regel mit exakt diesem Selektor.
function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`));
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Phase 1 – Einstellungsfenster (A + A2)
// ---------------------------------------------------------------------------

test('A2: Einstellungs-Scrim beginnt unterhalb der App-Titelleiste', () => {
  const css = read('renderer/css/settings.css');
  const scrim = ruleBody(css, '.aws-scrim');
  assert.ok(scrim, '.aws-scrim-Regel fehlt');
  assert.match(scrim, /top:\s*var\(--titlebar-h/, 'Scrim muss unter der Titelleiste beginnen');
  assert.match(scrim, /padding:\s*16px/, 'Scrim braucht einen festen Innenabstand zum Fensterrand');
});

test('A2: Einstellungsfenster begrenzt sich auf den freien Bereich statt auf 100vh', () => {
  const css = read('renderer/css/settings.css');
  const win = ruleBody(css, '.aws-scrim .aws-window.aws-surface');
  assert.ok(win, 'Fensterregel fehlt');
  assert.match(win, /max-height:\s*100%/);
  assert.match(win, /max-width:\s*100%/);
  assert.doesNotMatch(win, /100vh/, 'eine 100vh-Rechnung ignoriert die Titelleiste');
});

test('A: Zweispaltige Bereiche brechen unterhalb ihrer Mindestbreite einspaltig um', () => {
  const css = read('renderer/css/settings.css');
  assert.match(ruleBody(css, '.aws-body') || '', /container-type:\s*inline-size/,
    'der Arbeitsbereich muss Bezugsgröße des Umbruchs sein');
  // 2 × (210 Beschriftung + 20 Abstand + 270 Bedienspalte) + 44 Spaltenabstand + 60 Rand
  const minTwoColumns = 2 * (210 + 20 + 270) + 44 + 60;
  const query = css.match(/@container\s*\(max-width:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(query, 'Container-Umbruch für .aws-pane fehlt');
  assert.equal(Number(query[1]), minTwoColumns - 1);
  assert.match(query[2], /\.aws-pane:not\(\.is-single\)\s*\{[^}]*display:\s*block/);
});
