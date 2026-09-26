// test/design3.test.js
// Regressionstests für "Design 3" (isoliert, siehe renderer/css/design3.css).
// Wie die übrigen Tests ohne Electron: reine Logik aus ui-design.js wird
// direkt importiert (mit minimalem document-Ersatz für applyUiDesign), die
// CSS-Einbindung und die strikte Kapselung werden am Quelltext geprüft.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const importRenderer = (rel) => import(pathToFileURL(path.join(root, rel)).href);
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// Zerlegt ein flaches Stylesheet (keine verschachtelten Regeln außer
// @font-face) in { prelude, body }-Paare.
function cssRules(css) {
  const rules = [];
  const clean = stripComments(css);
  let depth = 0;
  let start = 0;
  let prelude = '';
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '{') {
      if (depth === 0) { prelude = clean.slice(start, i).trim(); start = i + 1; }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) { rules.push({ prelude, body: clean.slice(start, i) }); start = i + 1; }
    }
  }
  assert.equal(depth, 0, 'design3.css muss ausgeglichene Klammern haben');
  return rules;
}

// Kommas innerhalb von :is(...)/:not(...) gehören nicht zur Selektorliste.
function splitSelectorList(prelude) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of prelude) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

// ---------------------------------------------------------------------------
// Registrierung, Beschriftung, Auflösung, Anwendung
// ---------------------------------------------------------------------------

test('Design 3: als dritte Auswahl registriert, Reihenfolge Classic → Design 2 → Design 3', async () => {
  const { UI_DESIGNS, UI_DESIGN_LABELS, DEFAULT_UI_DESIGN } = await importRenderer('renderer/js/ui-design.js');
  assert.deepEqual(UI_DESIGNS, ['classic', 'design2', 'design3']);
  assert.deepEqual(Object.keys(UI_DESIGN_LABELS), ['classic', 'design2', 'design3']);
  assert.equal(UI_DESIGN_LABELS.design3, 'Design 3');
  assert.equal(UI_DESIGN_LABELS.design2, 'Design 2');
  assert.equal(UI_DESIGN_LABELS.classic, 'Classic');
  assert.equal(DEFAULT_UI_DESIGN, 'classic');
});

test('Design 3: resolveUiDesign übernimmt "design3", Unbekanntes fällt weiter auf Classic', async () => {
  const { resolveUiDesign } = await importRenderer('renderer/js/ui-design.js');
  assert.equal(resolveUiDesign('design3'), 'design3');
  assert.equal(resolveUiDesign('design2'), 'design2');
  assert.equal(resolveUiDesign('classic'), 'classic');
  for (const bad of [undefined, null, '', 'Design3', 'design4', 3, {}, []]) {
    assert.equal(resolveUiDesign(bad), 'classic', `ungültiger Wert ${JSON.stringify(bad)}`);
  }
});

test('Design 3: applyUiDesign setzt data-ui-design="design3" und meldet den Wechsel', async () => {
  const { applyUiDesign } = await importRenderer('renderer/js/ui-design.js');
  const events = [];
  const previousDocument = globalThis.document;
  globalThis.document = {
    body: { dataset: { uiDesign: 'classic' } },
    dispatchEvent: (event) => events.push(event)
  };
  try {
    assert.equal(applyUiDesign('design3'), 'design3');
    assert.equal(globalThis.document.body.dataset.uiDesign, 'design3');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'archiv-wiki:design-changed');
    assert.deepEqual(events[0].detail, { design: 'design3' });

    // Gleicher Wert erneut: kein zweites Ereignis.
    applyUiDesign('design3');
    assert.equal(events.length, 1);

    // Zurück zu Design 2 bzw. Classic funktioniert unverändert.
    assert.equal(applyUiDesign('design2'), 'design2');
    assert.equal(applyUiDesign('unbekannt'), 'classic');
    assert.equal(globalThis.document.body.dataset.uiDesign, 'classic');
  } finally {
    globalThis.document = previousDocument;
  }
});

test('Design 3: Einstellungsfenster baut die Auswahl weiterhin generisch aus UI_DESIGNS', () => {
  const settings = read('renderer/js/settings-window.js');
  assert.match(settings, /options: UI_DESIGNS\.map\(key => \(\{ value: key, label: UI_DESIGN_LABELS\[key\] \|\| key \}\)\)/);
  assert.match(settings, /const value = resolveUiDesign\(rawValue\);/);
});

test('Design 3: app.js enthält keine Design-3-Sonderwege (rendert über Classic)', () => {
  const app = read('renderer/js/app.js');
  assert.doesNotMatch(app, /design3/);
});

// ---------------------------------------------------------------------------
// CSS-Einbindung
// ---------------------------------------------------------------------------

test('Design 3: design3.css ist eingebunden, als letztes Stylesheet', () => {
  const html = read('renderer/index.html');
  const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1]);
  assert.ok(links.includes('css/design3.css'), 'css/design3.css fehlt in index.html');
  assert.equal(links[links.length - 1], 'css/design3.css');
  assert.equal(links.filter(l => l === 'css/design3.css').length, 1);
  assert.ok(links.indexOf('css/design2.css') < links.indexOf('css/design3.css'));
});

// ---------------------------------------------------------------------------
// Strikte Kapselung
// ---------------------------------------------------------------------------

test('Design 3: jede Regel in design3.css ist unter [data-ui-design="design3"] gekapselt', () => {
  const rules = cssRules(read('renderer/css/design3.css'));
  assert.ok(rules.length > 50, 'design3.css enthält unerwartet wenige Regeln');
  // Erstes Compound muss <body> mit der Design-3-Markierung sein, optional
  // zusätzlich mit Klassen (theme-light, app-locked) am selben Element.
  const scoped = /^body(?:\.[a-z-]+)*\[data-ui-design="design3"\](?:\.[a-z-]+)*(?=$|[\s:>])/;
  for (const { prelude } of rules) {
    if (prelude.startsWith('@')) {
      assert.equal(prelude, '@font-face', `unerwartete @-Regel: ${prelude}`);
      continue;
    }
    for (const selector of splitSelectorList(prelude)) {
      assert.match(selector, scoped, `ungekapselter Design-3-Selektor: ${selector}`);
    }
  }
});

test('Design 3: @font-face nur mit eigenen "D3 …"-Familien und lokalen Dateien', () => {
  const rules = cssRules(read('renderer/css/design3.css')).filter(r => r.prelude === '@font-face');
  assert.ok(rules.length >= 3);
  for (const { body } of rules) {
    assert.match(body, /font-family:\s*'D3 [^']+'/);
    const url = body.match(/url\('([^']+)'\)/);
    assert.ok(url, 'src ohne url()');
    assert.match(url[1], /^\.\.\/assets\/fonts\/[a-z0-9-]+\.woff2$/);
    assert.ok(fs.existsSync(path.join(root, 'renderer/css', url[1])), `Schriftdatei fehlt: ${url[1]}`);
  }
  assert.doesNotMatch(read('renderer/css/design3.css'), /https?:\/\/|@import/);
});

test('Design 3: Hell-Variante über body.theme-light am selben Element', () => {
  const css = stripComments(read('renderer/css/design3.css'));
  assert.match(css, /body\.theme-light\[data-ui-design="design3"\]\{[^}]*--d3-bg:\s*#f3f2ee;/);
  assert.match(css, /body\[data-ui-design="design3"\]\{[^}]*--d3-bg:\s*#16181c;/);
});

test('Design 3: Überschriften und Fließtext nutzen Inter wie Classic und Design 2', () => {
  const css = stripComments(read('renderer/css/design3.css'));
  assert.match(css, /--d3-font-heading:\s*'Inter',\s*system-ui,\s*sans-serif;/);
  assert.match(css, /--d3-font-body:\s*'Inter',\s*system-ui,\s*sans-serif;/);
  assert.doesNotMatch(css, /--d3-font-(?:heading|body):[^;]*Barlow/);
});

test('Design 3: Akzent kommt aus --accent-color, kein fest verdrahteter Übergabe-Akzent', () => {
  const css = stripComments(read('renderer/css/design3.css'));
  assert.match(css, /--d3-accent:\s*var\(--accent-color\);/);
  assert.match(css, /--d3-on-accent:\s*var\(--accent-contrast-text/);
  for (const hex of ['#5ec2e8', '#7fd0ee', '#3fa0c6', '#1c3542', '#0f2530', '#1f7a9c', '#175f7a', '#124a60', '#e2f1f6']) {
    assert.ok(!css.toLowerCase().includes(hex), `fest verdrahteter Akzentwert ${hex} in design3.css`);
  }
  // Die Nutzer-Akzenttokens selbst werden nie überschrieben.
  assert.doesNotMatch(css, /--accent-(color|dim|soft|contrast-text)\s*:/);
});

test('Design 3: Titelleiste behält Geometrie (38px, kein Höhen-/Padding-Override)', () => {
  const rules = cssRules(read('renderer/css/design3.css'));
  const titlebarRules = rules.filter(r => splitSelectorList(r.prelude).some(s => /\.app-titlebar$/.test(s)));
  assert.ok(titlebarRules.length >= 1);
  for (const { body } of titlebarRules) {
    assert.doesNotMatch(body, /(^|;|\s)(min-|max-)?height\s*:/);
    assert.doesNotMatch(body, /(^|;|\s)padding(-top|-bottom)?\s*:/);
  }
  assert.doesNotMatch(stripComments(read('renderer/css/design3.css')), /--titlebar-h\s*:/);
  assert.match(read('renderer/css/styles.css'), /--titlebar-h: 38px;/);
});

test('Design 3: kompakte Sidebar-Werte aus der Übergabe', () => {
  const css = stripComments(read('renderer/css/design3.css'));
  assert.match(css, /\.nav-top \.nav-link\{[^}]*padding: 5px 10px 5px 12px;/);
  assert.match(css, /\.nav-group\.level-1 > \.group-header-row \.group-header\{[^}]*padding: 5px 10px;/);
  assert.match(css, /\.nav-group\.level-2 > \.group-header-row \.group-header\{[^}]*padding: 3px 10px 3px 16px;/);
  assert.match(css, /\.nav-item-row > \.nav-link\{[^}]*padding: 2px 10px 2px 28px;/);
});

// ---------------------------------------------------------------------------
// Trennung zu Classic und Design 2
// ---------------------------------------------------------------------------

test('Design 3: design2.css ist unverändert (Inhalts-Hash)', () => {
  // Stand vor Einführung von Design 3. Wird design2.css später im Rahmen eines
  // ausdrücklichen Design-2-Auftrags geändert, ist dieser Hash bewusst
  // mitzuziehen — ein Design-3-Auftrag darf ihn nie ändern müssen.
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'renderer/css/design2.css'))).digest('hex');
  assert.equal(hash, 'c27b21b64b486022e49ce213a46a7e6784af93c236343dba93a60ee0fe22764d');
});

test('Design 3: keine andere CSS-Datei erwähnt design3, design3.css keine fremden Designs', () => {
  const cssDir = path.join(root, 'renderer/css');
  for (const file of fs.readdirSync(cssDir).filter(f => f.endsWith('.css') && f !== 'design3.css')) {
    assert.doesNotMatch(fs.readFileSync(path.join(cssDir, file), 'utf8'), /design3/, `${file} erwähnt design3`);
  }
  const d3 = stripComments(read('renderer/css/design3.css'));
  assert.doesNotMatch(d3, /data-ui-design="(classic|design2)"/);
  assert.doesNotMatch(d3, /!important/);
});
