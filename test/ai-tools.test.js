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
  getWikiTags,
  getRecentNotes,
  resolveNoteForOpen,
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
created: "2026-01-01T09:00:00.000Z"
modified: "2026-01-05T09:00:00.000Z"
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
created: "2026-01-02T09:00:00.000Z"
modified: "2026-01-10T09:00:00.000Z"
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
  assert.equal(AI_TOOLS_DEFINITIONS.length, 15);

  const names = AI_TOOLS_DEFINITIONS.map(d => d.function?.name);
  assert.ok(names.includes('search_notes'), 'search_notes ist definiert');
  assert.ok(names.includes('read_note'), 'read_note ist definiert');
  assert.ok(names.includes('list_notes'), 'list_notes ist definiert');
  assert.ok(names.includes('get_recent_notes'), 'get_recent_notes ist definiert');
  assert.ok(names.includes('open_note'), 'open_note ist definiert');
  assert.ok(names.includes('get_wiki_tags'), 'get_wiki_tags ist definiert');
  assert.ok(names.includes('suggest_wikilinks'), 'suggest_wikilinks ist definiert');
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
  // open_note ist reine Navigation (kein Proposal, kein requiresConfirmation
  // in seiner Beschreibung) — bewusst kein Schreibwerkzeug im obigen Sinn.
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

test('KI-Tools 9: getWikiTags liefert vorhandene Tags sortiert nach Häufigkeit', async t => {
  const wikiDir = createTestWikiFixture(t);

  const res = await executeAiTool(wikiDir, 'get_wiki_tags', { limit: 10 });
  assert.equal(res.success, true);
  assert.ok(res.data);
  assert.equal(typeof res.data.totalDistinctTags, 'number');
  assert.ok(Array.isArray(res.data.tags));
  assert.ok(res.data.totalDistinctTags >= 2, 'Mindestens die Test-Tags electron und nodejs sind vorhanden');

  const hasElectron = res.data.tags.some(item => item.tag === 'electron');
  assert.ok(hasElectron, 'Tag "electron" wurde in der Sammlung gefunden');
});

test('KI-Tools 10: executeAiTool führt suggest_wikilinks aus', async t => {
  const wikiDir = createTestWikiFixture(t);

  // In Architektur.md steht: "Hier steht wichtiges Wissen über lokale KI-Modelle."
  // Wir testen suggest_wikilinks mit direktem content, der "Pfannkuchen" erwähnt
  const res = await executeAiTool(wikiDir, 'suggest_wikilinks', {
    relPath: 'Projekte/Archiv-Wiki/Architektur.md',
    content: 'Hier testen wir die Architektur. Danach backen wir leckere Pfannkuchen in der Küche.'
  });

  assert.equal(res.success, true);
  assert.ok(res.data);
  assert.equal(res.data.relPath, 'Projekte/Archiv-Wiki/Architektur.md');
  assert.ok(Array.isArray(res.data.candidates));
  assert.ok(res.data.candidates.length >= 1, 'Mindestens 1 Kandidat gefunden');

  const pfannkuchenMatch = res.data.candidates.find(c => c.term === 'Pfannkuchen');
  assert.ok(pfannkuchenMatch, 'Kandidat Pfannkuchen gefunden');
  assert.equal(pfannkuchenMatch.targetTitle, 'Rezept für Pfannkuchen');
  assert.equal(pfannkuchenMatch.occurrences, 1);
  assert.equal(pfannkuchenMatch.suggestedSyntax, '[[Rezept für Pfannkuchen|Pfannkuchen]]');
});

test('KI-Tools 11: M7 - executeAiTool validiert threshold und limit strikt', async t => {
  const wikiDir = createTestWikiFixture(t);

  // 1. Ungültiger threshold bei find_duplicate_notes (zu hoch)
  const resHigh = await executeAiTool(wikiDir, 'find_duplicate_notes', { threshold: 1.5 });
  assert.equal(resHigh.success, false);
  assert.ok(resHigh.error.includes('Ähnlichkeits-Schwellenwert'));

  // 2. Ungültiger threshold (negativ)
  const resNeg = await executeAiTool(wikiDir, 'find_duplicate_notes', { threshold: -0.2 });
  assert.equal(resNeg.success, false);
  assert.ok(resNeg.error.includes('Ähnlichkeits-Schwellenwert'));

  // 3. Ungültiges limit bei suggest_wikilinks (0)
  const resLimit0 = await executeAiTool(wikiDir, 'suggest_wikilinks', {
    relPath: 'Projekte/Archiv-Wiki/Architektur.md',
    limit: 0
  });
  assert.equal(resLimit0.success, false);
  assert.ok(resLimit0.error.includes('Limit'));

  // 4. Ungültiges limit bei suggest_wikilinks (> 100)
  const resLimit101 = await executeAiTool(wikiDir, 'suggest_wikilinks', {
    relPath: 'Projekte/Archiv-Wiki/Architektur.md',
    limit: 101
  });
  assert.equal(resLimit101.success, false);
  assert.ok(resLimit101.error.includes('Limit'));
});

test('KI-Tools 12: Block 1 - getRecentNotes sortiert nach modified (ersatzweise created), archivierte ausgeschlossen', t => {
  const wikiDir = createTestWikiFixture(t);

  const res = getRecentNotes(wikiDir);
  assert.equal(res.totalCount, 2, 'archivierte Notiz zählt nicht mit');
  // Pfannkuchen wurde später geändert (10.01.) als Architektur (05.01.) -> zuerst.
  assert.equal(res.notes[0].title, 'Rezept für Pfannkuchen');
  assert.equal(res.notes[1].title, 'Architektur und Schnittstellen');
  assert.equal(res.notes[0].modified, '2026-01-10T09:00:00.000Z');
  assert.ok(!('body' in res.notes[0]), 'Notizinhalt wird nicht mitgeliefert (nur Metadaten)');

  const limited = getRecentNotes(wikiDir, { limit: 1 });
  assert.equal(limited.notes.length, 1);
  assert.equal(limited.notes[0].title, 'Rezept für Pfannkuchen');
});

function createDuplicateTitleFixture(t) {
  fs.mkdirSync(testHome, { recursive: true });
  const wikiDir = fs.mkdtempSync(path.join(testHome, 'ai-tools-dupe-'));

  const dirA = path.join(wikiDir, 'Arbeit', 'Notizen');
  const dirB = path.join(wikiDir, 'Privat', 'Notizen');
  fs.mkdirSync(dirA, { recursive: true });
  fs.mkdirSync(dirB, { recursive: true });

  fs.writeFileSync(path.join(dirA, 'Meeting.md'), `---\ntitle: "Wochenplan"\ncategory: "Notizen"\nmainCategory: "Arbeit"\ncreated: "2026-02-01T08:00:00.000Z"\nmodified: "2026-02-03T08:00:00.000Z"\n---\n# Wochenplan (Arbeit)\n`, 'utf8');
  fs.writeFileSync(path.join(dirB, 'Privatplan.md'), `---\ntitle: "Wochenplan"\ncategory: "Notizen"\nmainCategory: "Privat"\ncreated: "2026-02-02T08:00:00.000Z"\nmodified: "2026-02-04T08:00:00.000Z"\n---\n# Wochenplan (Privat)\n`, 'utf8');
  // Groß-/kleinschreibungs-Variante mit anderem Titel als Kontrolle:
  fs.writeFileSync(path.join(dirA, 'Anders.md'), `---\ntitle: "wochenplan"\ncategory: "Notizen"\nmainCategory: "Arbeit"\ncreated: "2026-02-05T08:00:00.000Z"\nmodified: "2026-02-06T08:00:00.000Z"\n---\n# klein geschrieben\n`, 'utf8');

  t.after(() => {
    fs.rmSync(wikiDir, { recursive: true, force: true });
  });

  return wikiDir;
}

test('KI-Tools 13: Block 1 - resolveNoteForOpen löst relPath und eindeutigen Titel sicher auf', t => {
  const wikiDir = createTestWikiFixture(t);

  // relPath gewinnt immer und wird unabhängig von Groß-/Kleinschreibung des Titels aufgelöst.
  const byPath = resolveNoteForOpen(wikiDir, { relPath: 'Privat/Küche/Pfannkuchen.md' });
  assert.equal(byPath.opened, true);
  assert.equal(byPath.title, 'Rezept für Pfannkuchen');
  assert.equal(byPath.relPath, 'Privat/Küche/Pfannkuchen.md');

  // Ungültiger/fehlender Pfad: aktuelle Ansicht bleibt unverändert (opened:false), kein Absturz.
  const missingPath = resolveNoteForOpen(wikiDir, { relPath: 'Existiert/Nicht.md' });
  assert.equal(missingPath.opened, false);
  assert.ok(missingPath.error);

  // Eindeutiger Titel ohne relPath.
  const byTitle = resolveNoteForOpen(wikiDir, { title: 'Architektur und Schnittstellen' });
  assert.equal(byTitle.opened, true);
  assert.equal(byTitle.relPath, 'Projekte/Archiv-Wiki/Architektur.md');

  // Kein Treffer.
  const noMatch = resolveNoteForOpen(wikiDir, { title: 'Gibt es nicht' });
  assert.equal(noMatch.opened, false);
  assert.ok(noMatch.error);

  // Weder relPath noch title.
  const nothing = resolveNoteForOpen(wikiDir, {});
  assert.equal(nothing.opened, false);
});

test('KI-Tools 14: Block 1 - resolveNoteForOpen rät bei mehreren gleichnamigen Notizen nicht, sondern liefert Kandidaten', t => {
  const wikiDir = createDuplicateTitleFixture(t);

  // Exakter Titel "Wochenplan" trifft zwei Notizen (Arbeit + Privat) — die
  // klein geschriebene dritte Variante gehört NICHT zur exakten Stufe.
  const ambiguous = resolveNoteForOpen(wikiDir, { title: 'Wochenplan' });
  assert.equal(ambiguous.opened, false);
  assert.equal(ambiguous.ambiguous, true);
  assert.equal(ambiguous.candidates.length, 2, 'nur die beiden exakten Treffer, nicht die Kleinschreibvariante');
  const relPaths = ambiguous.candidates.map(c => c.relPath).sort();
  assert.deepEqual(relPaths, ['Arbeit/Notizen/Meeting.md', 'Privat/Notizen/Privatplan.md']);

  // Case-insensitive Suche ohne exakten Treffer: alle drei Groß-/
  // Kleinschreibungsvarianten sind dann mehrdeutig.
  const ambiguousCaseInsensitive = resolveNoteForOpen(wikiDir, { title: 'WOCHENPLAN' });
  assert.equal(ambiguousCaseInsensitive.opened, false);
  assert.equal(ambiguousCaseInsensitive.ambiguous, true);
  assert.equal(ambiguousCaseInsensitive.candidates.length, 3);

  // Danach erneuter Aufruf mit dem exakten relPath des gewählten Kandidaten:
  const resolved = resolveNoteForOpen(wikiDir, { relPath: 'Arbeit/Notizen/Meeting.md' });
  assert.equal(resolved.opened, true);
  assert.equal(resolved.category, 'Notizen', 'category ist die Unterkategorie, wie bei den übrigen Werkzeugen (doc.category)');
});

test('KI-Tools 15: executeAiTool routet get_recent_notes und open_note', async t => {
  const wikiDir = createTestWikiFixture(t);

  const recentRes = await executeAiTool(wikiDir, 'get_recent_notes', {});
  assert.equal(recentRes.success, true);
  assert.equal(recentRes.data.notes[0].title, 'Rezept für Pfannkuchen');

  const openRes = await executeAiTool(wikiDir, 'open_note', { relPath: 'Projekte/Archiv-Wiki/Architektur.md' });
  assert.equal(openRes.success, true);
  assert.equal(openRes.data.opened, true);
  assert.equal(openRes.data.relPath, 'Projekte/Archiv-Wiki/Architektur.md');

  const openMissing = await executeAiTool(wikiDir, 'open_note', { title: 'Gibt es nicht' });
  assert.equal(openMissing.success, true, 'kein Treffer ist kein Werkzeugfehler, sondern ein reguläres Ergebnis');
  assert.equal(openMissing.data.opened, false);
});



