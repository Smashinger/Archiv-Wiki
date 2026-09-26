// test/settings-design-look.test.js
// Regression: Das Einstellungsfenster zeigt je Oberflächen-Design sein eigenes
// Aussehen.
//
// Fehlerbild: Classic sah im Einstellungsfenster aus wie Design 2. Ursache war
// kein Umschaltfehler, sondern die Kaskade: settings.css liest nur die
// --c-*-Tokens aus archiv-wiki-tokens.css (Rosé/Braun-Palette von Design 2,
// für JEDES Design an .aws-scrim gesetzt) und setzte Barlow Condensed/IBM Plex
// Mono (Schriften aus design2.css) fest. Nur design3.css legte die Tokens für
// sich um — Classic fiel auf die Design-2-Grundwerte zurück.
//
// Geprüft wird am Quelltext (wie design3.test.js): Classic legt alle Tokens
// um, die Regeln bleiben auf Classic begrenzt, und die Grundwerte für Design 2
// sowie die Design-3-Umlegung bleiben unverändert.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

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
  assert.equal(depth, 0, 'Stylesheet muss ausgeglichene Klammern haben');
  return rules;
}

const declaredProps = (body) => new Set([...body.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));

const tokensCss = read('renderer/css/archiv-wiki-tokens.css');
const settingsCss = read('renderer/css/settings.css');
const design3Css = read('renderer/css/design3.css');

// Alle Farbtoken des Fensters außer dem Schatten (bleibt je Hell/Dunkel gleich).
const baseRule = cssRules(tokensCss).find(r => r.prelude.split(',')[0].trim() === '.aws-scrim');
const colorTokens = [...declaredProps(baseRule.body)].filter(t => t !== '--c-shadow');

// Abschnitt 6 beginnt mit seinem Kommentarkopf; davor liegt der für alle
// Designs gemeinsame Teil.
const classicHeading = settingsCss.indexOf('6  Classic');
const classicSectionStart = settingsCss.lastIndexOf('/*', classicHeading);
const classicRules = cssRules(settingsCss.slice(classicSectionStart));

test('Einstellungsfenster Classic: alle Farbtoken und beide Schrifttoken werden umgelegt', () => {
  assert.ok(colorTokens.length >= 17, 'Tokenliste aus archiv-wiki-tokens.css erwartet');
  const rule = classicRules.find(r => r.prelude === 'body[data-ui-design="classic"] .aws-scrim');
  assert.ok(rule, 'Classic-Tokenblock fehlt in settings.css');
  const props = declaredProps(rule.body);
  for (const token of colorTokens) assert.ok(props.has(token), `Classic legt ${token} nicht um`);
  assert.ok(props.has('--aws-font-head') && props.has('--aws-font-mono'), 'Classic-Schriften fehlen');
  // Classic liest die Classic-Tokens aus styles.css, keine Design-2-Werte.
  assert.match(rule.body, /--c-s1:\s*var\(--bg-elev\)/);
  assert.match(rule.body, /--c-rose:\s*var\(--accent-color\)/);
  assert.match(rule.body, /--aws-font-head:\s*var\(--mono\)/);
  assert.doesNotMatch(rule.body, /#CF8A94|Barlow|IBM Plex/i);
});

test('Einstellungsfenster Classic: Tokenblock schlägt die Hell-Variante aus archiv-wiki-tokens.css', () => {
  // Gleiche Spezifität (0,2,1) wie "body.theme-light .aws-scrim" — deshalb
  // muss settings.css nach archiv-wiki-tokens.css geladen werden.
  const html = read('renderer/index.html');
  assert.ok(html.indexOf('css/archiv-wiki-tokens.css') < html.indexOf('css/settings.css'));
  assert.match(tokensCss, /body\.theme-light \.aws-scrim/);
});

test('Einstellungsfenster Classic: jede Regel des Classic-Abschnitts ist auf Classic begrenzt', () => {
  assert.ok(classicSectionStart > 0, 'Abschnitt "6  Classic" fehlt in settings.css');
  assert.ok(classicRules.length > 0);
  for (const { prelude } of classicRules) {
    for (const selector of prelude.split(/,(?![^()]*\))/)) {
      assert.match(selector.trim(), /^body(\.theme-light)?\[data-ui-design="classic"\]\s/,
        `Regel wirkt nicht nur auf Classic: ${selector.trim()}`);
    }
  }
});

test('Einstellungsfenster: Schriften laufen über überschreibbare Token mit Design-2-Grundwert', () => {
  const clean = stripComments(settingsCss);
  const families = [...clean.matchAll(/font-family:\s*([^;]+);/g)].map(m => m[1].trim());
  for (const family of families) {
    if (/Barlow Condensed/.test(family)) assert.equal(family, "var(--aws-font-head, 'Barlow Condensed', var(--sans))");
    if (/IBM Plex Mono/.test(family)) assert.equal(family, "var(--aws-font-mono, 'IBM Plex Mono', var(--mono))");
  }
  // Außerhalb des Classic-Abschnitts setzt settings.css die Schrifttoken nie —
  // Design 2 und Design 3 behalten damit Barlow Condensed/IBM Plex Mono.
  const beforeClassic = stripComments(settingsCss.slice(0, classicSectionStart));
  assert.doesNotMatch(beforeClassic, /--aws-font-(head|mono)\s*:/);
  assert.doesNotMatch(stripComments(design3Css), /--aws-font-(head|mono)\s*:/);
});

test('Einstellungsfenster: Abschnittsüberschriften sind in allen Designs wie Classic', () => {
  const clean = stripComments(settingsCss);
  const groupHead = clean.match(/\.aws-group-head\s*>\s*span\s*\{([^}]*)\}/)?.[1] || '';
  const notesHead = clean.match(/\.aws-notes\s+h6\s*\{([^}]*)\}/)?.[1] || '';
  for (const rule of [groupHead, notesHead]) {
    assert.match(rule, /font-family:\s*'JetBrains Mono',\s*ui-monospace,\s*monospace/);
    assert.match(rule, /font-size:\s*10\.5px/);
    assert.match(rule, /letter-spacing:\s*\.06em/);
  }
  assert.doesNotMatch(clean, /data-ui-design="classic"[^{}]*\.aws-group-head/);
});

test('Einstellungsfenster Design 2/3: Grundwerte und Design-3-Umlegung bleiben unverändert', () => {
  assert.match(baseRule.body, /--c-rose:\s*#CF8A94;/);
  assert.match(baseRule.body, /--c-s1:\s*#201917;/);
  const d3 = cssRules(design3Css).find(r => r.prelude.startsWith('body[data-ui-design="design3"] .aws-scrim'));
  assert.ok(d3, 'Design-3-Umlegung des Einstellungsfensters fehlt');
  assert.match(d3.body, /--c-s1:\s*var\(--d3-bg-panel\)/);
  // Kein Classic-Selektor außerhalb des Classic-Abschnitts in settings.css.
  assert.doesNotMatch(stripComments(settingsCss.slice(0, classicSectionStart)), /data-ui-design/);
});
