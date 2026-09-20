'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const importRenderer = (rel) => import(pathToFileURL(path.join(root, rel)).href);

test('Phase 2: details/summary und open sind an der Vorschau-Grenze freigegeben', () => {
  const sanitizer = read('build/preview-sanitizer.js');
  assert.match(sanitizer, /PREVIEW_ALLOWED_TAGS[\s\S]*'details'/);
  assert.match(sanitizer, /PREVIEW_ALLOWED_TAGS[\s\S]*'summary'/);
  assert.match(sanitizer, /PREVIEW_ALLOWED_ATTRIBUTES[\s\S]*'open'/);
  assert.match(sanitizer, /ALLOW_DATA_ATTR: false/);
  assert.match(sanitizer, /ALLOW_ARIA_ATTR: false/);
  assert.doesNotMatch(sanitizer.match(/PREVIEW_ALLOWED_ATTRIBUTES = \[[\s\S]*?\];/)[0], /'onclick'|'ontoggle'|'style'/);
});

test('Phase 2: Faltbereiche sind in Classic und Design 2 bedienbar gestaltet', () => {
  const classic = read('renderer/css/styles.css');
  const design2 = read('renderer/css/design2.css');
  assert.match(classic, /\.preview-pane details\{/);
  assert.match(classic, /\.preview-pane summary\{[\s\S]*?cursor: pointer/);
  assert.match(classic, /\.preview-pane details\[open\] > summary\{/);
  assert.match(design2, /\[data-ui-design="design2"\] \.preview-pane summary\{/);
});

test('Phase 2: Vorschau-Platzhalter kollidieren nicht mit normalem Notiztext', async () => {
  const { createPreviewPlaceholderPrefix } = await importRenderer('renderer/js/vendor/editor-bundle.js');
  assert.equal(createPreviewPlaceholderPrefix('normaler Text'), '@@ARCHIVWIKI_0_');
  assert.equal(
    createPreviewPlaceholderPrefix('Text @@ARCHIVWIKI_0_MATH0@@ und @@MATH0@@'),
    '@@ARCHIVWIKI_1_'
  );

  const entry = read('build/editor-entry.js');
  for (const kind of ['CODE', 'CALLOUT', 'WIKILINK', 'MATH']) {
    assert.ok(entry.includes(`placeholderPrefix}${kind}`), `${kind} nutzt nicht den kollisionsfreien Präfix`);
  }
  assert.ok(entry.includes('activePlaceholderPrefix}TASKCHECKBOX'));
  assert.doesNotMatch(entry, /return `@@(?:CODE|CALLOUT|WIKILINK|MATH|TASKCHECKBOX)/);
});

test('Phase 2: Wiki/Mathe in Callouts und Checklisten-Reihenfolge bleiben erhalten', () => {
  const entry = read('build/editor-entry.js');
  const wiki = entry.indexOf('renderWikiLinksToPlaceholders(codeProtected');
  const math = entry.indexOf('renderMathToPlaceholders(wikiProtected');
  const callout = entry.indexOf('renderCalloutsToPlaceholders(mathProtected');
  assert.ok(wiki > 0 && math > wiki && callout > math, 'Callouts dürfen Wiki-/Mathe-Platzhalter nicht verstecken');
  assert.match(entry, /TASKCHECKBOX_\$\{checked \? '1' : '0'\}@@/);
  assert.match(entry, /html = html\.replace\(new RegExp\(`\$\{placeholderPrefix\}TASKCHECKBOX_\(0\|1\)@@`/);
});

test('Phase 2: gebautes Editor-Bundle enthält die neue Sanitizer- und Token-Policy', () => {
  const bundle = read('renderer/js/vendor/editor-bundle.js');
  assert.match(bundle, /ARCHIVWIKI_/);
  assert.match(bundle, /"details"/);
  assert.match(bundle, /"summary"/);
  assert.match(bundle, /"open"/);
});

test('Phase 2: Vorschau behält den Zustand geöffneter details-Faltbereiche bei Re-Rendern bei', () => {
  const editorSource = read('renderer/js/editor.js');
  assert.ok(editorSource.includes('previewContainer.querySelectorAll(\'details\')'), 'editor.js muss details-Elemente vor Re-Render erfassen');
  assert.ok(editorSource.includes('target.open = item.open'), 'editor.js muss den open-Zustand nach Re-Render wiederherstellen');

  const appSource = read('renderer/js/app.js');
  assert.ok(appSource.includes('e.stopPropagation();'), 'Checkbox-Klick muss stopPropagation aufrufen');
});
