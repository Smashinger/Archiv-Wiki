// test/enduser-report-fixes.test.js
// Regressionstests zum Endbenutzerbericht 2.3.0 (19.09.2026). Wie in
// ux-regressions.test.js: ohne Electron und ohne DOM. Reine Logik wird direkt
// importiert, Verdrahtung und Layoutregeln werden am Quelltext geprüft. Das
// tatsächliche Verhalten wurde zusätzlich in der laufenden App getestet.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const importRenderer = (rel) => import(pathToFileURL(path.join(root, rel)).href);

// Liefert den Quelltext einer (nicht exportierten, auch verschachtelten)
// Funktion aus app.js – vom Kopf bis zur passenden schließenden Klammer.
// Grobe Klammerzählung ohne Rücksicht auf Klammern in Zeichenketten; reicht
// für die hier geprüften Funktionen.
function functionSource(source, name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `Funktion ${name} nicht gefunden`);
  const open = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
}

// ---------------------------------------------------------------------------
// H2 – Suchindex nach dem Speichern
// ---------------------------------------------------------------------------

test('H2: erfolgreiches Speichern stößt eine entprellte Index-Aktualisierung an', () => {
  const app = read('renderer/js/app.js');
  const helper = functionSource(app, 'scheduleSearchIndexRefresh');
  assert.match(helper, /clearTimeout\(searchIndexRefreshTimer\)/, 'muss entprellen');
  assert.match(helper, /rebuildIndex\(\)/);
  const onSaved = functionSource(app, 'onSaved');
  assert.match(onSaved, /scheduleSearchIndexRefresh\(\)/, 'onSaved (Autosave/Strg+S) muss den Index aktualisieren');
  const onSaveError = functionSource(app, 'onSaveError');
  assert.doesNotMatch(onSaveError, /scheduleSearchIndexRefresh|rebuildIndex/, 'ein Speicherfehler darf den Index nicht umbauen');
});

// ---------------------------------------------------------------------------
// H3 – Wikilink-Vervollständigung und automatisch ergänztes "]]"
// ---------------------------------------------------------------------------

test('H3: Übernahme ersetzt das von closeBrackets ergänzte "]]" statt es zu verdoppeln', async () => {
  const { wikiLinkCompletionChange } = await importRenderer('renderer/js/vendor/editor-bundle.js');
  // "Test: [[Pfa|]]" – Cursor bei 11, dahinter das automatisch ergänzte "]]".
  const change = wikiLinkCompletionChange(']]', 'Pfannkuchen', 8, 11);
  assert.deepEqual(change, { from: 8, to: 13, insert: 'Pfannkuchen]]', cursor: 21 });
  const doc = 'Test: [[Pfa]]';
  const result = doc.slice(0, change.from) + change.insert + doc.slice(change.to);
  assert.equal(result, 'Test: [[Pfannkuchen]]');
  assert.equal(result.slice(change.cursor), '', 'Cursor steht direkt hinter "]]"');
});

test('H3: ohne folgende Klammern wird "]]" ergänzt, eine einzelne "]" wird mit ersetzt', async () => {
  const { wikiLinkCompletionChange } = await importRenderer('renderer/js/vendor/editor-bundle.js');
  assert.deepEqual(wikiLinkCompletionChange(' Rest', 'A', 2, 4), { from: 2, to: 4, insert: 'A]]', cursor: 5 });
  assert.deepEqual(wikiLinkCompletionChange(']x', 'A', 2, 4), { from: 2, to: 5, insert: 'A]]', cursor: 5 });
});

test('H3: das Editor-Bundle ist mit der Quelle synchron gebaut', () => {
  const entry = read('build/editor-entry.js');
  const bundle = read('renderer/js/vendor/editor-bundle.js');
  assert.match(entry, /apply: applyWikiLinkCompletion/);
  assert.match(bundle, /apply: applyWikiLinkCompletion/);
  assert.doesNotMatch(bundle, /apply: `\$\{n\.title\}\]\]`/, 'alter fester Einfügetext darf nicht mehr im Bundle stehen');
});

// ---------------------------------------------------------------------------
// H4 – Warnung vor defekten Links beim Umbenennen
// ---------------------------------------------------------------------------

test('H4: verlinkende Notizen werden wie die Link-Auflösung (ohne Groß-/Kleinschreibung) erkannt', async () => {
  const { findNotesLinkingToTitle, bodyLinksToTitle } = await importRenderer('renderer/js/wikilink-refs.js');
  const docs = [
    { relPath: 'A/B/Pfannkuchen.md', title: 'Pfannkuchen', body: 'siehe [[Pfannkuchen]] selbst' },
    { relPath: 'A/B/Liste.md', title: 'Liste', body: 'Für das Rezept [[pfannkuchen]] brauche ich Mehl.' },
    { relPath: 'A/B/Alias.md', title: 'Alias', body: '[[Pfannkuchen|Anzeige]]' },
    { relPath: 'A/B/Andere.md', title: 'Andere', body: '[[Pfannkuchenteig]] und Pfannkuchen ohne Link' }
  ];
  const found = findNotesLinkingToTitle(docs, 'A/B/Pfannkuchen.md', 'Pfannkuchen').map(d => d.title);
  assert.deepEqual(found, ['Liste', 'Alias'], 'eigene Notiz und Teiltreffer zählen nicht');
  assert.equal(bodyLinksToTitle('', 'X'), false);
  assert.equal(bodyLinksToTitle('[[X]]', ''), false);
});

test('H4: reiner Wechsel der Groß-/Kleinschreibung bricht keine Links', async () => {
  const { renameBreaksTitleLinks } = await importRenderer('renderer/js/wikilink-refs.js');
  assert.equal(renameBreaksTitleLinks('Pfannkuchen', 'pfannkuchen'), false);
  assert.equal(renameBreaksTitleLinks('Pfannkuchen', 'Crepes'), true);
});

test('H4: beide Umbenennen-Wege fragen vorher nach, ohne andere Notizen zu ändern', () => {
  const app = read('renderer/js/app.js');
  const confirm = functionSource(app, 'confirmRenameDespiteLinks');
  assert.match(confirm, /findNotesLinkingToTitle/);
  assert.match(confirm, /showConfirmDialog/);
  assert.doesNotMatch(confirm, /saveNote|writeNote|renameEntry/, 'die Warnung darf nichts schreiben');
  const menu = functionSource(app, 'showContextMenu');
  assert.match(menu, /confirmRenameDespiteLinks\(relPath, currentName, newName\)\)\.proceed/);
  assert.match(app, /const renameCheck = await confirmRenameDespiteLinks\(relPath, title, newTitle\);/, 'Titelfeld-Umbenennen muss ebenfalls warnen');
});

// ---------------------------------------------------------------------------
// H5 – Rückfragedialoge im Einrichtungsassistenten
// ---------------------------------------------------------------------------

test('H5: wizard.css gestaltet die Dialoge aus dialog.js als festes Overlay', () => {
  const css = read('renderer/css/wizard.css');
  const overlay = css.match(/\n\.prompt-overlay \{([^}]*)\}/);
  assert.ok(overlay, '.prompt-overlay-Regel fehlt');
  assert.match(overlay[1], /position:fixed/);
  assert.match(overlay[1], /inset:0/);
  assert.match(css, /\.prompt-overlay \.prompt-modal \{/);
  assert.match(css, /\.prompt-overlay \.btn\.primary \{/);
  const wizardJs = read('renderer/js/wizard.js');
  assert.match(wizardJs, /showConfirmDialog/, 'Voraussetzung: der Assistent nutzt dialog.js');
});

// ---------------------------------------------------------------------------
// M1 – Schließen-Dialog
// ---------------------------------------------------------------------------

test('M1: der Schließen-Dialog bietet nur ausführbare Aktionen an', () => {
  const dialog = functionSource(read('renderer/js/app.js'), 'showCloseDialog');
  assert.doesNotMatch(dialog, /value="ask"/, '"Immer nachfragen" + OK tat nichts');
  assert.match(dialog, /value="quit" checked/);
  assert.match(dialog, /value="tray"/);
  assert.match(dialog, /'Minimieren' : 'Beenden'/, 'Hauptknopf nennt die gewählte Aktion');
});

// ---------------------------------------------------------------------------
// M2 – veraltete Rückgängig-Aktion und Rohfehler
// ---------------------------------------------------------------------------

test('M2: Rückgängig prüft den Ort und Dateifehler werden verständlich gemeldet', () => {
  const app = read('renderer/js/app.js');
  const undo = functionSource(app, 'showMoveUndoToast');
  assert.match(undo, /treeContainsRelPath\(tree, moved\.relPath\)/);
  assert.match(undo, /Rückgängig nicht mehr möglich/);
  const readable = functionSource(app, 'readableIpcErrorMessage');
  assert.match(readable, /Error invoking remote method/);
  const mutation = functionSource(app, 'performEntryPathMutation');
  const mutateCatch = mutation.slice(mutation.indexOf('result = await mutate();'), mutation.indexOf('if (!result?.relPath)'));
  assert.match(mutateCatch, /isMissingEntryError\(error\)/);
  assert.match(mutateCatch, /readableIpcErrorMessage\(error\)/);
  assert.doesNotMatch(mutateCatch, /error\?\.message/, 'kein roher error.message im Dateifehler-Dialog');
});

// ---------------------------------------------------------------------------
// M3 – Aufklapp-Pfeile im Classic-Baum
// ---------------------------------------------------------------------------

test('M3: Classic dreht den nach rechts zeigenden Chevron offen nach unten', () => {
  const css = read('renderer/css/components.css');
  assert.match(css, /\.group-header \.g-chevron\{[^}]*transform: rotate\(90deg\)/);
  assert.match(css, /\.nav-group\.collapsed > \.group-header-row \.g-chevron\{ transform: rotate\(0deg\); \}/);
  assert.doesNotMatch(css, /\.nav-group\.collapsed \.g-chevron\{ transform: rotate\(-90deg\); \}/);
  assert.match(read('renderer/js/app.js'), /<polyline points="9 6 15 12 9 18"\/>/, 'Pfad zeigt nach rechts');
});

// ---------------------------------------------------------------------------
// M6 / M8 / M10 / N-Befunde
// ---------------------------------------------------------------------------

test('M6: "+ Notiz" im leeren Wiki bietet das Anlegen der Kategorien an', () => {
  const app = read('renderer/js/app.js');
  assert.match(app, /title: 'Zuerst eine Unterkategorie anlegen'/);
  const sub = functionSource(app, 'createSubCategoryFlow');
  assert.match(sub, /await createMainCategoryFlow\(\);/);
});

test('M8: Classic-Hinweistext erreicht WCAG AA auf den Kartenflächen', () => {
  const lum = (hex) => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const faints = [...read('renderer/css/styles.css').matchAll(/--text-faint: (#[0-9a-f]{6});/gi)].map(m => m[1]);
  assert.equal(faints.length, 2, 'Dunkel- und Hell-Token erwartet');
  const [dark, light] = faints;
  for (const bg of ['#121519', '#171b21', '#2b2b2b']) assert.ok(ratio(dark, bg) >= 4.5, `dunkel ${dark} auf ${bg}`);
  for (const bg of ['#ffffff', '#f5f4f2']) assert.ok(ratio(light, bg) >= 4.5, `hell ${light} auf ${bg}`);
});

test('M10: Papierkorb zeigt die Herkunft in Klartext und meldet die Wiederherstellung', () => {
  const app = read('renderer/js/app.js');
  assert.doesNotMatch(app, />war: \$\{escapeHtml\(item\.originalRelPath\)\}</, 'kein roher Dateipfad mehr');
  const origin = functionSource(app, 'trashOriginLabel');
  assert.match(origin, /slice\(0, -1\)/);
  const restore = functionSource(app, 'restoreTrashEntry');
  assert.match(restore, /showQuickFeedback\(/);
  assert.match(read('renderer/css/components.css'), /\.trash-card\{/);
});

test('N1/N3: Kategorie hat ein eigenes Label, Notizen lassen sich per Kontextmenü verschieben', () => {
  const app = read('renderer/js/app.js');
  assert.match(app, /<span class="note-meta-pair"><span class="note-meta-label">Kategorie<\/span><button type="button" class="category-badge"/);
  assert.match(app, /data: \{ action: 'move' \}/);
  assert.match(functionSource(app, 'moveNoteToOtherCategoryFlow'), /fs\.moveEntry\(relPath, targetRelPath\)/);
});

test('N6: sichtbarer Produktname einheitlich "Archiv-Wiki"', () => {
  const html = read('renderer/index.html') + read('renderer/wizard.html');
  const visible = html.replace(/<!--[\s\S]*?-->/g, '');
  assert.doesNotMatch(visible, /Archiv Wiki/);
  assert.match(read('renderer/js/ui-design.js'), /design2: 'Design 2'/);
});
