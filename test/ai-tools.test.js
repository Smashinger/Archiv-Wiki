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
  listCategories,
  analyzeCategoryNotes,
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
  assert.equal(AI_TOOLS_DEFINITIONS.length, 21);

  const names = AI_TOOLS_DEFINITIONS.map(d => d.function?.name);
  assert.ok(names.includes('search_notes'), 'search_notes ist definiert');
  assert.ok(names.includes('read_note'), 'read_note ist definiert');
  assert.ok(names.includes('list_notes'), 'list_notes ist definiert');
  assert.ok(names.includes('get_recent_notes'), 'get_recent_notes ist definiert');
  assert.ok(names.includes('open_note'), 'open_note ist definiert');
  assert.ok(names.includes('list_categories'), 'list_categories ist definiert');
  assert.ok(names.includes('propose_rename_category'), 'propose_rename_category ist definiert');
  assert.ok(names.includes('propose_move_subcategory'), 'propose_move_subcategory ist definiert');
  assert.ok(names.includes('propose_reorder_entries'), 'propose_reorder_entries ist definiert');
  assert.ok(names.includes('analyze_category_notes'), 'analyze_category_notes ist definiert');
  assert.ok(names.includes('propose_batch_content_update'), 'propose_batch_content_update ist definiert');
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

function createCategoryListFixture(t) {
  fs.mkdirSync(testHome, { recursive: true });
  const wikiDir = fs.mkdtempSync(path.join(testHome, 'ai-tools-cats-'));

  fs.mkdirSync(path.join(wikiDir, 'Wissen', 'Linux'), { recursive: true });
  fs.mkdirSync(path.join(wikiDir, 'Wissen', 'Windows'), { recursive: true });
  fs.writeFileSync(path.join(wikiDir, 'Wissen', 'Linux', 'Fedora.md'), '# Fedora', 'utf8');
  fs.writeFileSync(path.join(wikiDir, 'Wissen', 'Linux', 'Debian.md'), '# Debian', 'utf8');
  fs.writeFileSync(path.join(wikiDir, 'Wissen', 'Windows', 'Alt.md'), '---\narchived: true\n---\n# Alt', 'utf8');

  fs.mkdirSync(path.join(wikiDir, 'Freizeit', 'Linux'), { recursive: true });
  fs.writeFileSync(path.join(wikiDir, 'Freizeit', 'Linux', 'Gaming.md'), '# Gaming unter Linux', 'utf8');

  fs.mkdirSync(path.join(wikiDir, '.wiki-trash'), { recursive: true });
  fs.writeFileSync(path.join(wikiDir, '.wiki-trash', 'Geloescht.md'), '# Geloescht', 'utf8');
  fs.mkdirSync(path.join(wikiDir, '.versteckt'), { recursive: true });
  fs.writeFileSync(path.join(wikiDir, '.versteckt', 'Verborgen.md'), '# Verborgen', 'utf8');

  fs.writeFileSync(path.join(wikiDir, '.wiki-config.json'), JSON.stringify({
    childOrder: {
      '': ['Freizeit', 'Wissen']
    }
  }, null, 2), 'utf8');

  t.after(() => {
    fs.rmSync(wikiDir, { recursive: true, force: true });
  });

  return wikiDir;
}

test('KI-Tools 16: Block 2 - listCategories liefert vollstaendige Struktur, Zaehlung und sichtbare Reihenfolge', t => {
  const wikiDir = createCategoryListFixture(t);

  const res = listCategories(wikiDir);
  assert.equal(res.totalMainCategories, 2);
  assert.equal(res.totalSubCategories, 3);

  assert.deepEqual(res.categories.map(c => c.name), ['Freizeit', 'Wissen']);

  const wissen = res.categories.find(c => c.name === 'Wissen');
  assert.equal(wissen.relPath, 'Wissen');
  assert.equal(wissen.noteCount, 2);
  assert.equal(wissen.subCategories.length, 2);

  const linuxUnterWissen = wissen.subCategories.find(s => s.relPath === 'Wissen/Linux');
  assert.ok(linuxUnterWissen);
  assert.equal(linuxUnterWissen.noteCount, 2);

  const windowsUnterWissen = wissen.subCategories.find(s => s.relPath === 'Wissen/Windows');
  assert.ok(windowsUnterWissen);
  assert.equal(windowsUnterWissen.noteCount, 0);

  const freizeit = res.categories.find(c => c.name === 'Freizeit');
  const linuxUnterFreizeit = freizeit.subCategories.find(s => s.relPath === 'Freizeit/Linux');
  assert.ok(linuxUnterFreizeit);
  assert.equal(linuxUnterFreizeit.noteCount, 1);
  assert.notEqual(linuxUnterFreizeit.relPath, linuxUnterWissen.relPath);

  const allNames = JSON.stringify(res);
  assert.ok(!allNames.includes('.wiki-trash'));
  assert.ok(!allNames.includes('Geloescht'));
  assert.ok(!allNames.includes('.versteckt'));
  assert.ok(!allNames.includes('Verborgen'));
});

test('KI-Tools 17: Block 2 - listCategories funktioniert auch ohne .wiki-config.json (Fallback alphabetisch)', t => {
  const wikiDir = createTestWikiFixture(t);
  fs.rmSync(path.join(wikiDir, '.wiki-config.json'), { force: true });

  const res = listCategories(wikiDir);
  assert.equal(res.totalMainCategories, 3);
  const archiv = res.categories.find(c => c.name === 'Archiv');
  assert.ok(archiv);
  assert.equal(archiv.subCategories.length, 0);
  assert.equal(archiv.noteCount, 0);
});

test('KI-Tools 18: executeAiTool routet list_categories', async t => {
  const wikiDir = createCategoryListFixture(t);

  const res = await executeAiTool(wikiDir, 'list_categories', {});
  assert.equal(res.success, true);
  assert.equal(res.data.totalMainCategories, 2);
});

function createCaseCollisionFixture(t) {
  fs.mkdirSync(testHome, { recursive: true });
  const wikiDir = fs.mkdtempSync(path.join(testHome, 'ai-tools-collision-'));

  // Reproduziert den echten Nutzerfund: zwei unterschiedliche Unterkategorien
  // im selben Hauptordner, die sich nur in Groß-/Kleinschreibung unterscheiden.
  fs.mkdirSync(path.join(wikiDir, 'Alle', 'Notizen'), { recursive: true });
  fs.mkdirSync(path.join(wikiDir, 'Alle', 'NOTIZEN'), { recursive: true });
  fs.writeFileSync(path.join(wikiDir, 'Alle', 'Notizen', 'A.md'), '# A', 'utf8');
  fs.writeFileSync(path.join(wikiDir, 'Alle', 'Notizen', 'B.md'), '# B', 'utf8');
  fs.writeFileSync(path.join(wikiDir, 'Alle', 'NOTIZEN', 'C.md'), '# C', 'utf8');

  t.after(() => {
    fs.rmSync(wikiDir, { recursive: true, force: true });
  });

  return wikiDir;
}

test('KI-Tools 19: Bugfix - listNotes vermischt keine unterschiedlichen, nur groß-/kleingeschriebenen Unterkategorien mehr', t => {
  const wikiDir = createCaseCollisionFixture(t);

  // Exakte Schreibweise trifft eindeutig die jeweils richtige Kategorie,
  // ohne die andere versehentlich mit hineinzuziehen (der eigentliche Bug).
  const exactLower = listNotes(wikiDir, { category: 'Notizen' });
  assert.equal(exactLower.totalCount, 2);
  assert.deepEqual(exactLower.notes.map(n => n.title).sort(), ['A', 'B']);

  const exactUpper = listNotes(wikiDir, { category: 'NOTIZEN' });
  assert.equal(exactUpper.totalCount, 1);
  assert.equal(exactUpper.notes[0].title, 'C');

  // Case-insensitive Anfrage ohne exakten Treffer: darf NICHT still zu einer
  // 3er-Liste vermischt werden, sondern muss die Mehrdeutigkeit melden.
  const ambiguous = listNotes(wikiDir, { category: 'notizen' });
  assert.equal(ambiguous.ambiguous, true);
  assert.equal(ambiguous.totalCount, 0);
  assert.deepEqual(ambiguous.notes, []);
  assert.deepEqual(ambiguous.candidates.map(c => c.path), ['Alle/NOTIZEN', 'Alle/Notizen']);

  // Voller Pfad ist immer eindeutig, unabhängig von der Groß-/Kleinschreibung
  // der bloßen Namen.
  const byPath = listNotes(wikiDir, { category: 'Alle/NOTIZEN' });
  assert.equal(byPath.totalCount, 1);
  assert.equal(byPath.notes[0].title, 'C');

  // Ein Hauptkategorie-Name bleibt weiterhin ein gewollter Sammel-Filter
  // (kein falscher "ambiguous"), er fasst alle Unterkategorien zusammen.
  const byMain = listNotes(wikiDir, { category: 'Alle' });
  assert.equal(byMain.ambiguous, undefined);
  assert.equal(byMain.totalCount, 3);
});

test('KI-Tools 20: Bugfix - listNotes matcht keine unrelated Kategorien mehr per Teilstring', t => {
  const wikiDir = createTestWikiFixture(t);

  // Vorher matchte ein Teilstring wie "chiv" jede Kategorie, die diese Buch-
  // stabenfolge irgendwo enthielt (z. B. "Archiv-Wiki" als Unterkategorie).
  // Jetzt: kein exakter Name/Pfad -> keine Treffer statt Zufallstreffer.
  const partial = listNotes(wikiDir, { category: 'chiv' });
  assert.equal(partial.totalCount, 0);
  assert.equal(partial.ambiguous, undefined);

  const exactSub = listNotes(wikiDir, { category: 'Archiv-Wiki' });
  assert.equal(exactSub.totalCount, 1);
  assert.equal(exactSub.notes[0].title, 'Architektur und Schnittstellen');
});

test('KI-Tools 21: executeAiTool gibt eine ambiguous list_notes-Antwort unverändert weiter', async t => {
  const wikiDir = createCaseCollisionFixture(t);

  const res = await executeAiTool(wikiDir, 'list_notes', { category: 'notizen' });
  assert.equal(res.success, true);
  assert.equal(res.data.ambiguous, true);
  assert.equal(res.data.candidates.length, 2);
});

test('KI-Tools 22: Block 3 - executeAiTool routet propose_rename_category, propose_move_subcategory und propose_reorder_entries', async t => {
  const wikiDir = createCategoryListFixture(t);

  const renameRes = await executeAiTool(wikiDir, 'propose_rename_category', {
    relPath: 'Wissen/Linux',
    newName: 'Linux & Unix',
    reason: 'Klarer'
  });
  assert.equal(renameRes.success, true);
  assert.ok(renameRes.data.proposalId);
  assert.equal(renameRes.data.requiresConfirmation, true);
  assert.equal(renameRes.data.relPath, 'Wissen/Linux & Unix');

  const moveRes = await executeAiTool(wikiDir, 'propose_move_subcategory', {
    relPath: 'Wissen/Windows',
    targetMainCategoryRelPath: 'Freizeit',
    reason: 'Passt besser'
  });
  assert.equal(moveRes.success, true);
  assert.ok(moveRes.data.proposalId);
  assert.equal(moveRes.data.relPath, 'Freizeit/Windows');

  const reorderRes = await executeAiTool(wikiDir, 'propose_reorder_entries', {
    orderedNames: ['Freizeit', 'Wissen']
  });
  assert.equal(reorderRes.success, true);
  assert.ok(reorderRes.data.proposalId);
});

test('KI-Tools 23: Block 3 - executeAiTool fängt Strukturfehler bei Kategorie-Werkzeugen als reguläres Fehlerergebnis ab', async t => {
  const wikiDir = createCategoryListFixture(t);

  const res = await executeAiTool(wikiDir, 'propose_move_subcategory', {
    relPath: 'Wissen', // Hauptkategorie, nicht Unterkategorie
    targetMainCategoryRelPath: 'Freizeit'
  });
  assert.equal(res.success, false);
  assert.ok(res.error.includes('keine Hauptkategorie'));
});





function createAnalyzeFixture(t) {
  fs.mkdirSync(testHome, { recursive: true });
  const wikiDir = fs.mkdtempSync(path.join(testHome, 'ai-tools-analyze-'));

  fs.mkdirSync(path.join(wikiDir, 'Wissen', 'Linux'), { recursive: true });
  fs.writeFileSync(
    path.join(wikiDir, 'Wissen', 'Linux', 'Debian.md'),
    '---\ntitle: "Debian"\n---\nDebian ist stabil und schlicht.',
    'utf8'
  );
  fs.writeFileSync(
    path.join(wikiDir, 'Wissen', 'Linux', 'Fedora.md'),
    '---\ntitle: "Fedora"\n---\nFedora hängt mit [[Debian]] und [[RedHat|Red Hat]] zusammen.',
    'utf8'
  );
  fs.writeFileSync(
    path.join(wikiDir, 'Wissen', 'Linux', 'Alt.md'),
    '---\ntitle: "Alt"\narchived: true\n---\nArchiviert, darf nicht auftauchen.',
    'utf8'
  );

  t.after(() => {
    fs.rmSync(wikiDir, { recursive: true, force: true });
  });

  return wikiDir;
}

test('KI-Tools 24: Block 4 - analyzeCategoryNotes liefert Inhalt, Wikilinks und schließt archivierte Notizen aus', t => {
  const wikiDir = createAnalyzeFixture(t);

  const res = analyzeCategoryNotes(wikiDir, { categoryRelPath: 'Wissen/Linux' });
  assert.equal(res.categoryRelPath, 'Wissen/Linux');
  assert.equal(res.totalNotesInCategory, 2);
  assert.equal(res.includedCount, 2);
  assert.equal(res.omittedByLimitCount, 0);

  const titles = res.notes.map(n => n.title);
  assert.deepEqual(titles, ['Debian', 'Fedora']);

  const fedora = res.notes.find(n => n.title === 'Fedora');
  assert.equal(fedora.status, 'lesbar');
  assert.equal(fedora.truncated, false);
  assert.ok(fedora.content.includes('Fedora hängt mit'));
  assert.deepEqual(fedora.wikilinks.sort(), ['Debian', 'RedHat']);

  const debian = res.notes.find(n => n.title === 'Debian');
  assert.deepEqual(debian.wikilinks, []);

  assert.ok(!JSON.stringify(res).includes('Archiviert, darf nicht auftauchen'));
});

test('KI-Tools 25: Block 4 - analyzeCategoryNotes markiert zu große Einzelnotizen statt sie zu lesen', t => {
  const wikiDir = createAnalyzeFixture(t);
  const grossDir = path.join(wikiDir, 'Wissen', 'Linux');
  const grossBody = 'X'.repeat(9000);
  fs.writeFileSync(path.join(grossDir, 'Riesig.md'), `---\ntitle: "Riesig"\n---\n${grossBody}`, 'utf8');

  const res = analyzeCategoryNotes(wikiDir, { categoryRelPath: 'Wissen/Linux' });
  const riesig = res.notes.find(n => n.title === 'Riesig');
  assert.ok(riesig, 'Riesig-Notiz muss enthalten sein');
  assert.equal(riesig.status, 'zu_gross');
  assert.equal(riesig.content, null);
  assert.deepEqual(riesig.wikilinks, []);
  assert.ok(riesig.sizeChars > 8000);
});

test('KI-Tools 26: Block 4 - analyzeCategoryNotes respektiert Standard-Limit und harte Obergrenze', t => {
  fs.mkdirSync(testHome, { recursive: true });
  const wikiDir = fs.mkdtempSync(path.join(testHome, 'ai-tools-analyze-limit-'));
  const catDir = path.join(wikiDir, 'Wissen', 'Viele');
  fs.mkdirSync(catDir, { recursive: true });
  for (let i = 1; i <= 30; i++) {
    const name = `Note${String(i).padStart(2, '0')}`;
    fs.writeFileSync(path.join(catDir, `${name}.md`), `---\ntitle: "${name}"\n---\nKurzer Inhalt.`, 'utf8');
  }
  t.after(() => fs.rmSync(wikiDir, { recursive: true, force: true }));

  const defaultRes = analyzeCategoryNotes(wikiDir, { categoryRelPath: 'Wissen/Viele' });
  assert.equal(defaultRes.totalNotesInCategory, 30);
  assert.equal(defaultRes.includedCount, 20);
  assert.equal(defaultRes.omittedByLimitCount, 10);

  const cappedRes = analyzeCategoryNotes(wikiDir, { categoryRelPath: 'Wissen/Viele', limit: 100 });
  assert.equal(cappedRes.includedCount, 25);
  assert.equal(cappedRes.omittedByLimitCount, 5);
});

test('KI-Tools 27: Block 4 - analyzeCategoryNotes bricht das Gesamtbudget kontrolliert ab (Kürzung und Überspringen)', t => {
  fs.mkdirSync(testHome, { recursive: true });
  const wikiDir = fs.mkdtempSync(path.join(testHome, 'ai-tools-analyze-budget-'));
  const catDir = path.join(wikiDir, 'Wissen', 'Budget');
  fs.mkdirSync(catDir, { recursive: true });
  // 8 Notizen à 7500 Zeichen erschöpfen exakt das Gesamtbudget von 60000 Zeichen.
  const chunk = 'A'.repeat(7500);
  for (let i = 1; i <= 9; i++) {
    const name = `Note${String(i).padStart(2, '0')}`;
    fs.writeFileSync(path.join(catDir, `${name}.md`), `---\ntitle: "${name}"\n---\n${chunk}`, 'utf8');
  }
  t.after(() => fs.rmSync(wikiDir, { recursive: true, force: true }));

  const res = analyzeCategoryNotes(wikiDir, { categoryRelPath: 'Wissen/Budget' });
  assert.equal(res.totalNotesInCategory, 9);
  assert.equal(res.includedCount, 9);
  assert.equal(res.omittedByLimitCount, 0);

  const lesbar = res.notes.filter(n => n.status === 'lesbar');
  const uebersprungen = res.notes.filter(n => n.status === 'uebersprungen_budget');
  assert.equal(lesbar.length, 8);
  assert.equal(uebersprungen.length, 1);
  assert.equal(uebersprungen[0].title, 'Note09');
  assert.equal(uebersprungen[0].content, null);
  assert.equal(res.totalCharsRead, 60000);
});

test('KI-Tools 28: Block 4 - analyzeCategoryNotes lehnt Notiz-Pfade und ungültige Kategorien strukturell ab', t => {
  const wikiDir = createAnalyzeFixture(t);

  assert.throws(
    () => analyzeCategoryNotes(wikiDir, { categoryRelPath: 'Wissen/Linux/Debian.md' }),
    /Haupt- oder Unterkategorie/
  );
  assert.throws(() => analyzeCategoryNotes(wikiDir, { categoryRelPath: 'Nicht/Vorhanden' }));
  assert.throws(() => analyzeCategoryNotes(wikiDir, { categoryRelPath: '../etc' }));
  assert.throws(() => analyzeCategoryNotes(wikiDir, { categoryRelPath: '' }), /categoryRelPath muss angegeben/);
});

test('KI-Tools 29: executeAiTool routet analyze_category_notes und fängt dessen Strukturfehler ab', async t => {
  const wikiDir = createAnalyzeFixture(t);

  const ok = await executeAiTool(wikiDir, 'analyze_category_notes', { categoryRelPath: 'Wissen/Linux' });
  assert.equal(ok.success, true);
  assert.equal(ok.data.includedCount, 2);

  const bad = await executeAiTool(wikiDir, 'analyze_category_notes', { categoryRelPath: 'Wissen/Linux/Debian.md' });
  assert.equal(bad.success, false);
  assert.ok(bad.error.includes('Haupt- oder Unterkategorie'));
});
test('KI-Tools 30: Block 5 - executeAiTool routet propose_batch_content_update und gibt nur Diff/Metadaten, keinen Rohinhalt, an den Modellkontext zurück', async t => {
  const wikiDir = createTestWikiFixture(t);

  const res = await executeAiTool(wikiDir, 'propose_batch_content_update', {
    items: [
      { relPath: 'Projekte/Archiv-Wiki/Architektur.md', newContent: 'Neu und einfach erklärt.' },
      { relPath: 'Privat/Küche/Pfannkuchen.md', newTitle: 'Pfannkuchen Rezept' }
    ],
    reason: 'Vereinfachung gemäß Analyse'
  });

  assert.equal(res.success, true);
  assert.equal(res.data.type, 'batch_update');
  assert.equal(res.data.requiresConfirmation, true);
  assert.ok(res.data.proposalId);
  assert.equal(res.data.counts.total, 2);
  assert.equal(res.data.counts.contentChanges, 1);
  assert.equal(res.data.counts.renames, 1);
  assert.equal(res.data.items.length, 2);
  assert.ok(!('newContent' in res.data.items[0]), 'Roher neuer Inhalt wird nicht doppelt in den Modellkontext zurückgegeben');
  assert.ok(!('oldContent' in res.data.items[0]));
  assert.ok(Array.isArray(res.data.items[0].diff));

  // Strukturfehler laufen wie bei den anderen Werkzeugen als reguläres Fehlerergebnis, nicht als Exception
  const badRes = await executeAiTool(wikiDir, 'propose_batch_content_update', { items: [] });
  assert.equal(badRes.success, false);
  assert.ok(badRes.error.includes('nicht-leere Liste'));
});
