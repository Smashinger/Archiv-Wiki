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

// ---------------------------------------------------------------------------
// Phase 2 – Werkzeugleisten-Überlauf (B) und Suchfeld (C)
// ---------------------------------------------------------------------------

const importRenderer = (rel) => import(require('url').pathToFileURL(path.join(root, rel)).href);

test('B: Sichtbarkeitsprüfung erkennt links, rechts und teilweise verdeckte Werkzeuge', async () => {
  const { isOutsideVisibleRange } = await importRenderer('renderer/js/toolbar-overflow.js');
  const visible = [100, 500];
  assert.equal(isOutsideVisibleRange({ left: 120, right: 152 }, ...visible), false, 'vollständig sichtbar');
  assert.equal(isOutsideVisibleRange({ left: 480, right: 512 }, ...visible), true, 'rechts angeschnitten (z. B. unter „Weitere“)');
  assert.equal(isOutsideVisibleRange({ left: 90, right: 122 }, ...visible), true, 'links herausgescrollt');
  assert.equal(isOutsideVisibleRange({ left: 700, right: 732 }, ...visible), true, 'komplett außerhalb');
  assert.equal(isOutsideVisibleRange({ left: 99.6, right: 500.4 }, ...visible), false, 'Rundung innerhalb der Toleranz');
});

test('B: Menübeschriftung folgt aria-label vor title vor Text und ist nie leer', async () => {
  const { toolbarControlLabel } = await importRenderer('renderer/js/toolbar-overflow.js');
  assert.equal(toolbarControlLabel({ ariaLabel: 'Notiz exportieren', title: 'x', text: '⬇' }), 'Notiz exportieren');
  assert.equal(toolbarControlLabel({ title: 'Fett (**Text**)', text: 'F' }), 'Fett (**Text**)');
  assert.equal(toolbarControlLabel({ text: '  Split \n ' }), 'Split');
  assert.equal(toolbarControlLabel({}), 'Werkzeug');
});

test('B: „Weitere“ nutzt das vorhandene HTML-Menü und löst nur Original-Klicks aus', () => {
  const app = read('renderer/js/app.js');
  assert.match(app, /setupToolbarOverflow\(document\.querySelector\('\.note-toolbar\[aria-label="Editor-Werkzeugleiste"\]'\),\s*\{\s*createMenu:\s*createHtmlContextMenu,\s*closeMenu:\s*closeHtmlContextMenu/);
  const mod = read('renderer/js/toolbar-overflow.js');
  assert.match(mod, /control\.click\(\)/, 'Befehle laufen über den Originalknopf');
  assert.doesNotMatch(mod, /insertAtCursor|fs\.|archivAPI/, 'keine eigene Befehlslogik im Überlaufmenü');
  assert.match(mod, /aria-haspopup', 'menu'/);
  assert.match(mod, /button\.hidden = true/, 'Knopf ist ohne Überlauf verborgen');
});

test('B: Hineingescrolltes Werkzeug landet nicht unter dem klebenden „Weitere“-Knopf', () => {
  const css = read('renderer/css/components.css');
  assert.match(css, /\.note-toolbar > \.toolbar-overflow-btn\{[^}]*position:sticky;\s*right:0/);
  // Knopfbreite plus Leisten-Innenabstand (Design2: 20 px) muss eingerechnet sein
  assert.match(css, /scroll-padding-inline-end:calc\(var\(--toolbar-overflow-w\) \+ (\d+)px\)/);
  const extra = Number(css.match(/scroll-padding-inline-end:calc\(var\(--toolbar-overflow-w\) \+ (\d+)px\)/)[1]);
  assert.ok(extra >= 20, `Zuschlag ${extra}px deckt den Design2-Innenabstand nicht ab`);
});

test('C: Schmales Suchfeld blendet „Ctrl K“ samt Platzreserve aus, Kürzel bleibt hinterlegt', () => {
  const css = read('renderer/css/layout.css');
  assert.match(css, /\.d2-titlebar-search-slot \.search-wrap\{ container-type:inline-size; \}/);
  const block = css.match(/@container \(max-width: (\d+)px\)\{([\s\S]*?)\n\}/);
  assert.ok(block, 'Container-Regel für das Suchfeld fehlt');
  assert.match(block[2], /search-wrap kbd\{ display:none; \}/);
  assert.match(block[2], /search-wrap input\{ padding-right:12px; \}/);
  assert.match(read('renderer/index.html'), /id="navSearch"[^>]*aria-keyshortcuts="Control\+K"/);
});

// ---------------------------------------------------------------------------
// Phase 3 – Kategorie-Beschriftungen (D) und leere Eingaben (E)
// ---------------------------------------------------------------------------

function showPromptModalSource() {
  const app = read('renderer/js/app.js');
  const start = app.indexOf('function showPromptModal(');
  const end = app.indexOf('\nfunction ', start + 10);
  assert.ok(start > 0 && end > start, 'showPromptModal() nicht gefunden');
  return app.slice(start, end);
}

test('E: showPromptModal deaktiviert OK bei leerer bzw. nur aus Leerzeichen bestehender Eingabe', () => {
  const src = showPromptModalSource();
  assert.match(src, /const isEmpty = \(\) => !input\.value\.trim\(\);/);
  assert.match(src, /okButton\.disabled = empty;/);
  assert.match(src, /input\.addEventListener\('input', \(\) => syncValidity/);
  assert.match(src, /syncValidity\(\);\s*\n\s*overlay\.querySelector\('\[data-action="cancel"\]'\)/, 'Anfangszustand muss geprüft werden (leerer Vorschlagswert)');
});

test('E: Enter und Mausklick umgehen die Validierung nicht, Abbrechen bleibt möglich', () => {
  const src = showPromptModalSource();
  // Enter läuft über manageModalDialog → primaryAction.click(); der Handler prüft zusätzlich selbst
  assert.match(src, /okButton\.addEventListener\('click', \(\) => \{ if \(!isEmpty\(\)\) close\(input\.value\); \}\);/);
  assert.match(src, /enterActivatesPrimary: true/);
  // Klick auf deaktiviertes OK darf den Fokus nicht aus dem Feld ziehen
  assert.match(src, /okButton\.addEventListener\('pointerdown'[\s\S]*?event\.preventDefault\(\);[\s\S]*?input\.focus/);
  assert.match(src, /data-action="cancel"\]'\)\.addEventListener\('click', \(\) => close\(null\)\)/);
  assert.match(src, /onRequestClose: \(\) => close\(null\)/, 'Escape/Schließen liefern weiterhin null');
});

test('E: Keine zweite Eingabedialog-Implementierung, alle Aufrufer behandeln leer als Abbruch', () => {
  const app = read('renderer/js/app.js');
  assert.equal((app.match(/function showPromptModal\(/g) || []).length, 1);
  // Jede Aufrufstelle prüft das Ergebnis mit einem Falsy-Check – leere Eingaben waren nie gewollt.
  const calls = [...app.matchAll(/const (\w+) = await showPromptModal\(/g)].map(m => m[1]);
  assert.ok(calls.length >= 8, `unerwartet wenige Aufrufstellen: ${calls.length}`);
  for (const variable of new Set(calls)) {
    // negativ (`if (!name) return`) oder positiv (`if (url) …`, `if (newName && …)`)
    assert.match(app, new RegExp(`if \\(!?${variable}\\b`), `Aufrufer mit „${variable}“ prüft das Ergebnis nicht`);
  }
});

test('D: „+ Haupt“ / „+ Unter“ / „+ Notiz“ tragen erklärende Beschriftungen', () => {
  const html = read('renderer/index.html');
  for (const [id, text] of [['segAddMain', 'Hauptkategorie'], ['segAddSub', 'Unterkategorie'], ['btnAddNote', 'Notiz']]) {
    const tag = html.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`));
    assert.ok(tag, `${id} fehlt`);
    assert.match(tag[0], new RegExp(`title="[^"]*${text}[^"]*"`), `${id}: title fehlt`);
    assert.match(tag[0], new RegExp(`aria-label="[^"]*${text}[^"]*"`), `${id}: aria-label fehlt`);
  }
});

test('D: Einheitliche Begriffe – keine „Hauptthema“/„Unterthema“-Vorschläge, Leerzustände nennen die echten Knöpfe', () => {
  const app = read('renderer/js/app.js');
  assert.doesNotMatch(app, /Neues (Haupt|Unter)thema/);
  assert.doesNotMatch(app, /Erstelle zuerst ein Thema/);
  assert.doesNotMatch(app, /Erstelle Themen,/);
  assert.match(app, /defaultValue: 'Neue Hauptkategorie'/);
  assert.match(app, /defaultValue: 'Neue Unterkategorie'/);
  // Bereichsüberschrift „Themen“ bleibt bewusst erhalten
  assert.match(read('renderer/index.html'), /<span class="ssl-text">Themen<\/span>/);
});
