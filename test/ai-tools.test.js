'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  AI_TOOLS_DEFINITIONS,
  createSnippet,
  searchNotes,
  readNote,
  listNotes,
  executeAiTool
} = require('../main/ai-tools');

const root = path.join(__dirname, '..');
const testHome = path.join(root, '.Codex-test-home');

function createTestWikiFixture(t) {
  fs.mkdirSync(testHome, { recursive: true });
  const wikiDir = fs.mkdtempSync(path.join(testHome, 'ai-tools-wiki-'));

  // Teststruktur anlegen
  const catDir = path.join(wikiDir, 'Projekte', 'Archiv-Wiki');
  fs.mkdirSync(catDir, { recursive: true });

  const note1 = `---
title: "Architektur und Schnittstellen"
tags: ["architektur", "electron", "ipc"]
category: "Archiv-Wiki"
mainCategory: "Projekte"
---
# Architektur und Schnittstellen

Archiv-Wiki basiert auf Electron und nutzt eine strikte Trennung zwischen Main und Renderer.
Hier steht wichtiges Wissen über lokale KI-Modelle.
`;

  const note2 = `---
title: "Rezept für Pfannkuchen"
tags: ["kochen", "rezept"]
category: "Küche"
mainCategory: "Privat"
---
# Pfannkuchen

Zutaten: Mehl, Milch, Eier und eine Prise Salz. Alles gut verrühren und in der Pfanne backen.
`;

  const noteArchived = `---
title: "Alte Notiz"
tags: ["alt"]
archived: true
---
Dieser Inhalt ist archiviert.
`;

  fs.writeFileSync(path.join(catDir, 'Architektur.md'), note1, 'utf8');

  const privatDir = path.join(wikiDir, 'Privat', 'Küche');
  fs.mkdirSync(privatDir, { recursive: true });
  fs.writeFileSync(path.join(privatDir, 'Pfannkuchen.md'), note2, 'utf8');

  const archiveDir = path.join(wikiDir, 'Archiv');
  fs.mkdirSync(archiveDir, { recursive: true });
  fs.writeFileSync(path.join(archiveDir, 'AlteNotiz.md'), noteArchived, 'utf8');

  t.after(() => {
    fs.rmSync(wikiDir, { recursive: true, force: true });
  });

  return wikiDir;
}

test('KI-Tools 1: AI_TOOLS_DEFINITIONS enthält gültige Lese- und Proposal-Werkzeuge', () => {
  assert.ok(Array.isArray(AI_TOOLS_DEFINITIONS));
  assert.equal(AI_TOOLS_DEFINITIONS.length, 11);

  const names = AI_TOOLS_DEFINITIONS.map(d => d.function?.name);
  assert.ok(names.includes('search_notes'), 'search_notes ist definiert');
  assert.ok(names.includes('read_note'), 'read_note ist definiert');
  assert.ok(names.includes('list_notes'), 'list_notes ist definiert');
  assert.ok(names.includes('propose_create_note'), 'propose_create_note ist definiert');
  assert.ok(names.includes('propose_update_note'), 'propose_update_note ist definiert');
  assert.ok(names.includes('propose_create_category'), 'propose_create_category ist definiert');
  assert.ok(names.includes('propose_move_note'), 'propose_move_note ist definiert');
  assert.ok(names.includes('propose_rename_note'), 'propose_rename_note ist definiert');
  assert.ok(names.includes('propose_delete_note'), 'propose_delete_note ist definiert');
  assert.ok(names.includes('audit_knowledge_base'), 'audit_knowledge_base ist definiert');
  assert.ok(names.includes('find_duplicate_notes'), 'find_duplicate_notes ist definiert');

  // Keine direkten Schreibwerkzeuge (Human-in-the-Loop Zwang)
  assert.ok(!names.includes('write_note'), 'write_note darf nicht existieren');
  assert.ok(!names.includes('create_note'), 'create_note darf nicht existieren');
  assert.ok(!names.includes('delete_note'), 'delete_note darf nicht existieren');
});

test('KI-Tools 2: searchNotes findet Notizen über Titel, Tags und Inhalt', t => {
  const wikiDir = createTestWikiFixture(t);

  // Leere Suche
  const empty = searchNotes(wikiDir, { query: '' });
  assert.equal(empty.totalMatches, 0);
  assert.deepEqual(empty.results, []);

  // Titelsuche
  const titleSearch = searchNotes(wikiDir, { query: 'Architektur' });
  assert.ok(titleSearch.totalMatches >= 1);
  assert.equal(titleSearch.results[0].title, 'Architektur und Schnittstellen');

  // Tagsuche
  const tagSearch = searchNotes(wikiDir, { query: 'kochen' });
  assert.ok(tagSearch.totalMatches >= 1);
  assert.equal(tagSearch.results[0].title, 'Rezept für Pfannkuchen');

  // Volltextsuche
  const bodySearch = searchNotes(wikiDir, { query: 'Pfanne' });
  assert.ok(bodySearch.totalMatches >= 1);
  assert.ok(bodySearch.results[0].snippet.includes('Pfanne'));

  // Archivierte Notizen werden standardmäßig ausgeschlossen
  const archiveSearch = searchNotes(wikiDir, { query: 'archiviert' });
  assert.equal(archiveSearch.totalMatches, 0);
});

test('KI-Tools 3: readNote liest Notizen sicher und sperrt Path Traversal', t => {
  const wikiDir = createTestWikiFixture(t);

  // Lesen über relPath
  const read1 = readNote(wikiDir, { relPath: 'Privat/Küche/Pfannkuchen.md' });
  assert.equal(read1.found, true);
  assert.equal(read1.title, 'Rezept für Pfannkuchen');
  assert.ok(read1.content.includes('Zutaten: Mehl, Milch'));

  // Lesen über Titel
  const read2 = readNote(wikiDir, { title: 'Architektur und Schnittstellen' });
  assert.equal(read2.found, true);
  assert.ok(read2.content.includes('Archiv-Wiki basiert auf Electron'));

  // Path Traversal Versuch muss sicher abgewiesen werden
  const traversal = readNote(wikiDir, { relPath: '../../../../etc/passwd' });
  assert.equal(traversal.found, false);
  assert.ok(traversal.error, 'Fehlermeldung bei Traversal-Versuch');

  // Nicht existierende Notiz
  const missing = readNote(wikiDir, { title: 'GibtEsNicht' });
  assert.equal(missing.found, false);
});

test('KI-Tools 4: listNotes listet Notizen sauber auf und filtert nach Kategorie', t => {
  const wikiDir = createTestWikiFixture(t);

  const all = listNotes(wikiDir);
  assert.equal(all.totalCount, 2); // 2 aktive Notizen (Archiv ausgenommen)

  const filtered = listNotes(wikiDir, { category: 'Küche' });
  assert.equal(filtered.totalCount, 1);
  assert.equal(filtered.notes[0].title, 'Rezept für Pfannkuchen');
});

test('KI-Tools 5: executeAiTool routet Aufrufe und fängt Fehler ab', async t => {
  const wikiDir = createTestWikiFixture(t);

  const res = await executeAiTool(wikiDir, 'search_notes', { query: 'Milch' });
  assert.equal(res.success, true);
  assert.ok(res.data.results.length >= 1);

  const unknown = await executeAiTool(wikiDir, 'unbekanntes_werkzeug', {});
  assert.equal(unknown.success, false);
  assert.ok(unknown.error.includes('Unbekanntes KI-Werkzeug'));

  const noProject = await executeAiTool(null, 'search_notes', { query: 'test' });
  assert.equal(noProject.success, false);
});

test('KI-Tools 6: executeAiTool routet propose_create_note und propose_update_note', async t => {
  const wikiDir = createTestWikiFixture(t);

  const createRes = await executeAiTool(wikiDir, 'propose_create_note', {
    subCategoryRelPath: 'Projekte/Archiv-Wiki',
    title: 'Neues Modul',
    content: '# Neues Modul\n\nBeschreibung',
    tags: ['modul']
  });
  assert.equal(createRes.success, true);
  assert.ok(createRes.data.proposalId);
  assert.equal(createRes.data.requiresConfirmation, true);

  const updateRes = await executeAiTool(wikiDir, 'propose_update_note', {
    relPath: 'Projekte/Archiv-Wiki/Architektur.md',
    content: '# Neue Architektur\n\nAktualisiert'
  });
  assert.equal(updateRes.success, true);
  assert.ok(updateRes.data.proposalId);
  assert.equal(updateRes.data.requiresConfirmation, true);
});

test('KI-Tools 7: executeAiTool routet die Phase-6-Werkzeuge (Kategorie, Verschieben, Umbenennen, Löschen)', async t => {
  const wikiDir = createTestWikiFixture(t);

  // 1. propose_create_category
  const catRes = await executeAiTool(wikiDir, 'propose_create_category', {
    name: 'Dokumentation',
    parentCategoryRelPath: 'Projekte',
    reason: 'Neuer Bereich für Dokumentation'
  });
  assert.equal(catRes.success, true);
  assert.equal(catRes.data.type, 'create_category');
  assert.equal(catRes.data.requiresConfirmation, true);
  assert.ok(catRes.data.proposalId);

  // 2. propose_move_note
  const moveRes = await executeAiTool(wikiDir, 'propose_move_note', {
    relPath: 'Privat/Küche/Pfannkuchen.md',
    targetSubCategoryRelPath: 'Projekte/Archiv-Wiki',
    reason: 'Falsch abgelegt'
  });
  assert.equal(moveRes.success, true);
  assert.equal(moveRes.data.type, 'move');
  assert.equal(moveRes.data.requiresConfirmation, true);
  assert.ok(moveRes.data.proposalId);

  // 3. propose_rename_note
  const renameRes = await executeAiTool(wikiDir, 'propose_rename_note', {
    relPath: 'Privat/Küche/Pfannkuchen.md',
    newTitle: 'Pfannkuchen Klassisch',
    reason: 'Präzisere Benennung'
  });
  assert.equal(renameRes.success, true);
  assert.equal(renameRes.data.type, 'rename');
  assert.equal(renameRes.data.requiresConfirmation, true);
  assert.ok(renameRes.data.proposalId);

  // 4. propose_delete_note
  const deleteRes = await executeAiTool(wikiDir, 'propose_delete_note', {
    relPath: 'Privat/Küche/Pfannkuchen.md',
    reason: 'Nicht mehr relevant'
  });
  assert.equal(deleteRes.success, true);
  assert.equal(deleteRes.data.type, 'delete');
  assert.equal(deleteRes.data.isDanger, true);
  assert.equal(deleteRes.data.requiresConfirmation, true);
  assert.ok(deleteRes.data.proposalId);
});

test('KI-Tools 8: executeAiTool führt audit_knowledge_base und find_duplicate_notes aus', async t => {
  const wikiDir = createTestWikiFixture(t);

  // 1. audit_knowledge_base
  const auditRes = await executeAiTool(wikiDir, 'audit_knowledge_base', {});
  assert.equal(auditRes.success, true);
  assert.ok(auditRes.data);
  assert.equal(typeof auditRes.data.isHealthy, 'boolean');
  assert.ok(auditRes.data.issues);
  assert.ok(Array.isArray(auditRes.data.issues.emptyNotes));
  assert.ok(Array.isArray(auditRes.data.issues.brokenLinks));

  // 2. find_duplicate_notes
  const dupRes = await executeAiTool(wikiDir, 'find_duplicate_notes', { threshold: 0.3 });
  assert.equal(dupRes.success, true);
  assert.ok(dupRes.data);
  assert.ok(Array.isArray(dupRes.data.duplicatePairs));
  assert.equal(typeof dupRes.data.evaluatedNotes, 'number');
});


