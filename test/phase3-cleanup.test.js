const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Phase 3 Cleanup: theme.js bereinigte und verbleibende Exporte', async () => {
  const themeModule = await import('../renderer/js/theme.js');

  // Entfernte Altlasten dürfen nicht mehr exportiert werden
  assert.equal(themeModule.generateRandomAccentColor, undefined, 'generateRandomAccentColor ist entfernt');
  assert.equal(themeModule.buildAccentSwatchesHtml, undefined, 'buildAccentSwatchesHtml ist entfernt');

  // Aktive Kernfunktionen und Paletten müssen intakt bleiben
  assert.ok(themeModule.ACCENT_PALETTES, 'ACCENT_PALETTES existiert');
  assert.ok(themeModule.ACCENT_PALETTES.orange, 'Orange Palette existiert');
  assert.equal(typeof themeModule.applyAccentPalette, 'function', 'applyAccentPalette ist eine Funktion');
  assert.equal(typeof themeModule.getContrastTextColor, 'function', 'getContrastTextColor ist eine Funktion');
  assert.equal(typeof themeModule.applySidebarDensity, 'function', 'applySidebarDensity ist eine Funktion');
  assert.equal(typeof themeModule.applyEditorFontSize, 'function', 'applyEditorFontSize ist eine Funktion');
  assert.equal(typeof themeModule.applyReadingWidth, 'function', 'applyReadingWidth ist eine Funktion');
  assert.equal(typeof themeModule.applyThemeMode, 'function', 'applyThemeMode ist eine Funktion');
});

test('Phase 3 Cleanup: filesystem.js bereinigte und verbleibende Exporte', async () => {
  const fsModule = await import('../renderer/js/filesystem.js');

  // listCategories darf nicht mehr existieren
  assert.equal(fsModule.listCategories, undefined, 'listCategories ist entfernt');

  // Kernfunktionen müssen intakt bleiben
  assert.equal(typeof fsModule.flattenNotes, 'function', 'flattenNotes ist eine Funktion');
  assert.equal(typeof fsModule.findNode, 'function', 'findNode ist eine Funktion');
  assert.equal(typeof fsModule.saveNote, 'function', 'saveNote ist eine Funktion');
  assert.equal(typeof fsModule.createNote, 'function', 'createNote ist eine Funktion');
});

test('Phase 3 Cleanup: search.js Exporte und app.js Modul-Integrität', async () => {
  const searchModule = await import('../renderer/js/search.js');

  assert.equal(typeof searchModule.searchWithDetails, 'function', 'searchWithDetails ist eine Funktion');
  assert.equal(typeof searchModule.rebuildIndex, 'function', 'rebuildIndex ist eine Funktion');
  assert.equal(typeof searchModule.getSearchState, 'function', 'getSearchState ist eine Funktion');
  assert.ok(searchModule.SEARCH_SCOPES, 'SEARCH_SCOPES existiert');

  const appJsSource = fs.readFileSync(path.join(__dirname, '../renderer/js/app.js'), 'utf8');
  // Keine ungenutzten Importe in app.js
  assert.ok(!appJsSource.includes('search as searchNotes'), 'search as searchNotes ist aus app.js entfernt');
  assert.ok(!appJsSource.includes('buildAccentSwatchesHtml'), 'buildAccentSwatchesHtml ist aus app.js entfernt');
  assert.ok(!appJsSource.includes('SIDEBAR_DENSITY_PRESETS'), 'SIDEBAR_DENSITY_PRESETS ist aus app.js entfernt');
});

test('Phase 3 Cleanup: Verwaiste CSS-Selektoren sind entfernt', () => {
  const compCss = fs.readFileSync(path.join(__dirname, '../renderer/css/components.css'), 'utf8');
  const d2Css = fs.readFileSync(path.join(__dirname, '../renderer/css/design2.css'), 'utf8');
  const layoutCss = fs.readFileSync(path.join(__dirname, '../renderer/css/layout.css'), 'utf8');
  const wizCss = fs.readFileSync(path.join(__dirname, '../renderer/css/wizard.css'), 'utf8');

  // components.css
  assert.ok(!compCss.includes('.sidebar-brand{'), '.sidebar-brand ist aus components.css entfernt');
  assert.ok(!compCss.includes('.brand-cursor{'), '.brand-cursor ist aus components.css entfernt');
  assert.ok(!compCss.includes('.sidebar-brand-count{'), '.sidebar-brand-count ist aus components.css entfernt');
  assert.ok(!compCss.includes('brand-cursor-blink'), 'brand-cursor-blink ist aus components.css entfernt');
  assert.ok(!compCss.includes('.color-swatch-random'), '.color-swatch-random ist aus components.css entfernt');
  assert.ok(!compCss.includes('.btn-mt{'), '.btn-mt ist aus components.css entfernt');
  assert.ok(!compCss.includes('.note-grid{'), '.note-grid ist aus components.css entfernt');

  // design2.css
  assert.ok(!d2Css.includes('.sidebar .sidebar-brand{'), '.sidebar-brand ist aus design2.css entfernt');
  assert.ok(!d2Css.includes('.sidebar #sidebarBrandText{'), '#sidebarBrandText ist aus design2.css entfernt');
  assert.ok(!d2Css.includes('.sidebar .brand-cursor{'), '.brand-cursor ist aus design2.css entfernt');
  assert.ok(!d2Css.includes('.app-titlebar-brand{'), '.app-titlebar-brand ist aus design2.css entfernt');
  assert.ok(!d2Css.includes('.sidebar .sidebar-brand-count{'), '.sidebar-brand-count ist aus design2.css entfernt');

  // layout.css
  assert.ok(!layoutCss.includes('.app-titlebar-brand{'), '.app-titlebar-brand ist aus layout.css entfernt');
  assert.ok(!layoutCss.includes('.app-titlebar-icon{'), '.app-titlebar-icon ist aus layout.css entfernt');
  assert.ok(!layoutCss.includes('.breadcrumb .crumb-current{'), '.crumb-current ist aus layout.css entfernt');
  assert.ok(!layoutCss.includes('.breadcrumb .crumb-sep{'), '.crumb-sep ist aus layout.css entfernt');

  // wizard.css
  assert.ok(!wizCss.includes('.wz-ctl-duo'), '.wz-ctl-duo ist aus wizard.css entfernt');
  assert.ok(!wizCss.includes('.wz-radios'), '.wz-radios ist aus wizard.css entfernt');
  assert.ok(!wizCss.includes('.wz-radio-dot'), '.wz-radio-dot ist aus wizard.css entfernt');
});

test('Phase 3 Cleanup: CSS-Dateien haben ausgeglichene geschweifte Klammern', () => {
  const cssFiles = ['components.css', 'design2.css', 'layout.css', 'wizard.css', 'styles.css', 'sidebar-tree.css', 'settings.css'];
  for (const file of cssFiles) {
    const filePath = path.join(__dirname, '../renderer/css', file);
    const content = fs.readFileSync(filePath, 'utf8');
    // Einfache Klammerbalance-Prüfung (außerhalb von Kommentaren und Strings)
    const clean = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"[^"\r\n]*"/g, '').replace(/'[^'\r\n]*'/g, '');
    let openCount = 0;
    let closeCount = 0;
    for (const char of clean) {
      if (char === '{') openCount++;
      if (char === '}') closeCount++;
    }
    assert.equal(openCount, closeCount, `CSS-Datei ${file} muss ausgeglichene Klammern haben (${openCount} vs ${closeCount})`);
  }
});
