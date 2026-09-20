'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const testHome = path.join(root, '.Codex-test-home');
const nfs = require('../main/notes-fs');
const { registerFilesystemIpc } = require('../main/filesystem-ipc');
const { writeProjectConfig, readProjectConfig } = require('../main/project');

function makeTestDir(t, prefix) {
  fs.mkdirSync(testHome, { recursive: true });
  const dir = fs.mkdtempSync(path.join(testHome, `${prefix}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeSimpleNote(projectPath, relPath, content = 'Inhalt') {
  const fullPath = path.join(projectPath, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
  return fullPath;
}

function registerTestIpc(projectPath) {
  const handlers = new Map();
  registerFilesystemIpc({
    getCurrentProject: () => ({ path: projectPath }),
    ipcMainApi: { handle: (channel, handler) => handlers.set(channel, handler) },
    isTrustedSender: () => true
  });
  return handlers;
}

test('Block 3 Wikilinks: Links in Fenced-Codeblöcken und Inline-Code werden ignoriert', async () => {
  const { bodyLinksToTitle, maskCodeRegions } = await import('../renderer/js/wikilink-refs.js');

  const docWithFencedCode = [
    'Hier ist Doku über Wikilinks:',
    '```markdown',
    'Schreibe [[Zielnotiz]] um zu verlinken.',
    '```',
    'Kein echter Link hier.'
  ].join('\n');

  const docWithInlineCode = 'Syntax ist `[[Zielnotiz]]` im Text.';
  const docWithRealLink = 'Echter Link: [[Zielnotiz]].';

  assert.equal(bodyLinksToTitle(docWithFencedCode, 'Zielnotiz'), false, 'Fenced Code darf keinen Link erzeugen');
  assert.equal(bodyLinksToTitle(docWithInlineCode, 'Zielnotiz'), false, 'Inline Code darf keinen Link erzeugen');
  assert.equal(bodyLinksToTitle(docWithRealLink, 'Zielnotiz'), true, 'Echter Link außerhalb von Code wird erkannt');

  // Prüft auch maskCodeRegions direkt
  const masked = maskCodeRegions(docWithFencedCode);
  assert.doesNotMatch(masked, /\[\[Zielnotiz\]\]/);
});

test('Block 3 Wikilinks: findNotesLinkingToTitle liefert saubere Titel ohne .md', async () => {
  const { findNotesLinkingToTitle } = await import('../renderer/js/wikilink-refs.js');

  const docs = [
    { relPath: 'A/B/Quelle.md', title: 'Quelle.md', body: 'Link auf [[Ziel]].' },
    { relPath: 'A/B/Ziel.md', title: 'Ziel', body: 'Inhalt' }
  ];

  const linking = findNotesLinkingToTitle(docs, 'A/B/Ziel.md', 'Ziel');
  assert.equal(linking.length, 1);
  assert.equal(linking[0].title, 'Quelle', 'Dateiendung .md muss bereinigt sein');
});

test('Block 3 Dateisystem: getSearchDocuments bereinigt .md bei Notizen ohne YAML-Titel', t => {
  const projectPath = makeTestDir(t, 'block3-searchdocs');
  writeSimpleNote(projectPath, path.join('Haupt', 'Unter', 'OhneTitel.md'), '# Roher Text ohne Frontmatter');

  const docs = nfs.getSearchDocuments(projectPath);
  const doc = docs.find(d => d.relPath.includes('OhneTitel.md'));
  assert.ok(doc, 'Dokument muss vorhanden sein');
  assert.equal(doc.title, 'OhneTitel', 'Titel darf keine .md Endung tragen');
});

test('Block 3 Config-Migration: Umbenennen migriert Icons, Reihenfolge und Zustände', t => {
  const projectPath = makeTestDir(t, 'block3-rename-cfg');
  fs.mkdirSync(path.join(projectPath, 'AlteKategorie', 'Unter'), { recursive: true });
  writeSimpleNote(projectPath, path.join('AlteKategorie', 'Unter', 'Notiz.md'), '---\ntitle: Notiz\n---\nText');

  writeProjectConfig(projectPath, {
    categoryIcons: {
      'AlteKategorie': '📁',
      'AlteKategorie/Unter': '📌'
    },
    childOrder: {
      '': ['AlteKategorie'],
      'AlteKategorie': ['Unter'],
      'AlteKategorie/Unter': ['Notiz.md']
    },
    savedCollapsedGroups: ['AlteKategorie', 'AlteKategorie/Unter'],
    noteScrollPositions: {
      'AlteKategorie/Unter/Notiz.md': { editor: 100, preview: 50 }
    }
  }, { create: true });

  const handlers = registerTestIpc(projectPath);

  // Kategorie umbenennen
  handlers.get('fs:renameEntry')({}, 'AlteKategorie', 'NeueKategorie');

  const updatedConfig = readProjectConfig(projectPath);
  assert.equal(updatedConfig.categoryIcons['NeueKategorie'], '📁');
  assert.equal(updatedConfig.categoryIcons['NeueKategorie/Unter'], '📌');
  assert.equal(updatedConfig.categoryIcons['AlteKategorie'], undefined);

  assert.deepEqual(updatedConfig.childOrder[''], ['NeueKategorie']);
  assert.deepEqual(updatedConfig.childOrder['NeueKategorie'], ['Unter']);
  assert.deepEqual(updatedConfig.childOrder['NeueKategorie/Unter'], ['Notiz.md']);

  assert.deepEqual(updatedConfig.savedCollapsedGroups, ['NeueKategorie', 'NeueKategorie/Unter']);
  assert.deepEqual(updatedConfig.noteScrollPositions['NeueKategorie/Unter/Notiz.md'], { editor: 100, preview: 50 });
});

test('Block 3 Config-Migration: Verschieben aktualisiert Eltern-Reihenfolge und Pfade', t => {
  const projectPath = makeTestDir(t, 'block3-move-cfg');
  fs.mkdirSync(path.join(projectPath, 'Haupt1', 'Unter1'), { recursive: true });
  fs.mkdirSync(path.join(projectPath, 'Haupt2', 'Unter2'), { recursive: true });
  writeSimpleNote(projectPath, path.join('Haupt1', 'Unter1', 'Notiz.md'), '---\ntitle: Notiz\n---\nText');

  writeProjectConfig(projectPath, {
    childOrder: {
      'Haupt1/Unter1': ['Notiz.md'],
      'Haupt2/Unter2': []
    },
    noteScrollPositions: {
      'Haupt1/Unter1/Notiz.md': { editor: 42, preview: 21 }
    }
  }, { create: true });

  const handlers = registerTestIpc(projectPath);

  // Notiz von Unter1 nach Unter2 verschieben
  handlers.get('fs:moveEntry')({}, 'Haupt1/Unter1/Notiz.md', 'Haupt2/Unter2');

  const updatedConfig = readProjectConfig(projectPath);
  assert.deepEqual(updatedConfig.childOrder['Haupt1/Unter1'], []);
  assert.deepEqual(updatedConfig.noteScrollPositions['Haupt2/Unter2/Notiz.md'], { editor: 42, preview: 21 });
});

test('Block 3 Config-Migration: Löschen bereinigt Einträge aus der Konfiguration', t => {
  const projectPath = makeTestDir(t, 'block3-del-cfg');
  fs.mkdirSync(path.join(projectPath, 'Haupt', 'Unter'), { recursive: true });
  writeSimpleNote(projectPath, path.join('Haupt', 'Unter', 'Notiz.md'), '---\ntitle: Notiz\n---\nText');

  writeProjectConfig(projectPath, {
    categoryIcons: {
      'Haupt': '🚀',
      'Haupt/Unter': '⭐'
    },
    childOrder: {
      '': ['Haupt'],
      'Haupt': ['Unter'],
      'Haupt/Unter': ['Notiz.md']
    },
    savedCollapsedGroups: ['Haupt', 'Haupt/Unter'],
    noteScrollPositions: {
      'Haupt/Unter/Notiz.md': { editor: 10 }
    }
  }, { create: true });

  const handlers = registerTestIpc(projectPath);

  // Notiz löschen
  handlers.get('fs:deleteEntry')({}, 'Haupt/Unter/Notiz.md');

  let updatedConfig = readProjectConfig(projectPath);
  assert.deepEqual(updatedConfig.childOrder['Haupt/Unter'], []);
  assert.equal(updatedConfig.noteScrollPositions['Haupt/Unter/Notiz.md'], undefined);

  // Kategorie löschen
  handlers.get('fs:deleteEntry')({}, 'Haupt');
  updatedConfig = readProjectConfig(projectPath);
  assert.equal(updatedConfig.categoryIcons['Haupt'], undefined);
  assert.equal(updatedConfig.categoryIcons['Haupt/Unter'], undefined);
  assert.deepEqual(updatedConfig.childOrder[''], []);
  assert.deepEqual(updatedConfig.savedCollapsedGroups, []);
});

test('Block 3 Editor & App: Typensicherheit bei numerischen YAML-Titeln', () => {
  const appCode = fs.readFileSync(path.join(__dirname, '../renderer/js/app.js'), 'utf8');
  assert.match(appCode, /String\(note\.frontmatter\?\.title/);

  const editorEntry = fs.readFileSync(path.join(__dirname, '../build/editor-entry.js'), 'utf8');
  assert.match(editorEntry, /String\(n\?\.title || ''\)\.toLowerCase/);
});

test('Block 3 Navigation: canLeaveCurrentRoute serialisiert parallele Aufrufe', () => {
  const appCode = fs.readFileSync(path.join(__dirname, '../renderer/js/app.js'), 'utf8');
  assert.match(appCode, /activeLeavePromise/);
  assert.match(appCode, /const previousResult = await activeLeavePromise;/);
});

test('Block 3 Navigation: setActiveNav(null) wird in Standardansichten aufgerufen', () => {
  const appCode = fs.readFileSync(path.join(__dirname, '../renderer/js/app.js'), 'utf8');
  assert.match(appCode, /async function renderArchive\(\)[\s\S]*?setActiveNav\(null\);/);
  assert.match(appCode, /async function renderTagsOverview\(activeTag\)[\s\S]*?setActiveNav\(null\);/);
  assert.match(appCode, /async function renderStatsPage\(\)[\s\S]*?setActiveNav\(null\);/);
});
