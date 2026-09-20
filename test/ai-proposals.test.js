'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const notesFs = require('../main/notes-fs');
const aiProposals = require('../main/ai-proposals');

const root = path.join(__dirname, '..');
const testHome = path.join(root, '.Codex-test-home');

function createTestWikiFixture(t) {
  fs.mkdirSync(testHome, { recursive: true });
  const wikiDir = fs.mkdtempSync(path.join(testHome, 'ai-prop-wiki-'));

  const subCatDir = path.join(wikiDir, 'Entwicklung', 'Workflows');
  fs.mkdirSync(subCatDir, { recursive: true });

  const existingNoteContent = `---
title: "Git Leitfaden"
tags: ["git", "vcs"]
category: "Workflows"
mainCategory: "Entwicklung"
---
# Git Leitfaden

Schritt 1: git status
Schritt 2: git add
`;

  fs.writeFileSync(path.join(subCatDir, 'Git Leitfaden.md'), existingNoteContent, 'utf8');

  t.after(() => {
    aiProposals.clearAllProposals();
    fs.rmSync(wikiDir, { recursive: true, force: true });
  });

  return wikiDir;
}

test('AI-Proposals 1: computeLineDiff berechnet Hinzufügungen, Löschungen und Gleichheiten', () => {
  const oldText = 'Zeile 1\nZeile 2\nZeile 3';
  const newText = 'Zeile 1\nZeile 2 modifiziert\nZeile 3\nZeile 4';

  const diff = aiProposals.computeLineDiff(oldText, newText);
  assert.ok(Array.isArray(diff));
  assert.ok(diff.length > 0);

  const types = diff.map(d => d.type);
  assert.ok(types.includes('same'), 'Enthält unveränderte Zeilen');
  assert.ok(types.includes('add') || types.includes('remove'), 'Enthält Änderungen');

  const diffNew = aiProposals.computeLineDiff('', '# Neuer Titel\nInhalt');
  assert.ok(diffNew.every(d => d.type === 'add'));
});

test('AI-Proposals 2: createProposal erzeugt Proposal im Speicher OHNE Datei auf Festplatte anzulegen', t => {
  const wikiDir = createTestWikiFixture(t);

  const proposal = aiProposals.createProposal(wikiDir, {
    type: 'create',
    subCategoryRelPath: 'Entwicklung/Workflows',
    title: 'Code Review Richtlinien',
    content: '# Richtlinien\n\n1. Freundlich bleiben.\n2. Tests prüfen.',
    tags: ['review', 'qualität'],
    reason: 'Neue Dokumentation für Code Reviews'
  });

  assert.ok(proposal.id.startsWith('prop_'));
  assert.equal(proposal.type, 'create');
  assert.equal(proposal.title, 'Code Review Richtlinien');
  assert.equal(proposal.subCategoryRelPath, 'Entwicklung/Workflows');
  assert.ok(proposal.relPath.includes('Code Review Richtlinien.md'));
  assert.deepEqual(proposal.tags, ['review', 'qualität']);
  assert.ok(proposal.diff.length > 0);

  const targetFile = path.join(wikiDir, proposal.relPath);
  assert.equal(fs.existsSync(targetFile), false, 'Vor der Freigabe darf keine Datei existieren!');

  const stored = aiProposals.getProposal(proposal.id);
  assert.equal(stored.id, proposal.id);
});

test('AI-Proposals 3: createProposal validiert 3-Ebenen-Regel und weist ungültige Tiefen ab', t => {
  const wikiDir = createTestWikiFixture(t);

  assert.throws(() => {
    aiProposals.createProposal(wikiDir, {
      type: 'create',
      subCategoryRelPath: 'Entwicklung',
      title: 'Ungültig',
      content: 'Inhalt'
    });
  }, /Unterkategorie \(Tiefe 2\)/);

  assert.throws(() => {
    aiProposals.createProposal(wikiDir, {
      type: 'create',
      subCategoryRelPath: '',
      title: 'Ungültig',
      content: 'Inhalt'
    });
  }, /subCategoryRelPath angegeben werden/);
});

test('AI-Proposals 4: createProposal weist Path-Traversal Versuche strikt ab', t => {
  const wikiDir = createTestWikiFixture(t);

  assert.throws(() => {
    aiProposals.createProposal(wikiDir, {
      type: 'create',
      subCategoryRelPath: '../../../../etc',
      title: 'Hack',
      content: 'Inhalt'
    });
  });

  assert.throws(() => {
    aiProposals.createProposal(wikiDir, {
      type: 'update',
      relPath: '../../../../etc/passwd',
      content: 'Inhalt'
    });
  });
});

test('AI-Proposals 5: applyProposal führt Erstellung atomar aus und speichert Notiz', t => {
  const wikiDir = createTestWikiFixture(t);

  const proposal = aiProposals.createProposal(wikiDir, {
    type: 'create',
    subCategoryRelPath: 'Entwicklung/Workflows',
    title: 'Freigegebene Notiz',
    content: '# Freigegeben\n\nVom Nutzer bestätigt.',
    tags: ['freigegeben', 'test']
  });

  const result = aiProposals.applyProposal(proposal.id, wikiDir);
  assert.equal(result.success, true);
  assert.equal(result.action, 'created');
  assert.ok(result.relPath.includes('Freigegebene Notiz.md'));

  const targetFile = path.join(wikiDir, result.relPath);
  assert.ok(fs.existsSync(targetFile), 'Nach applyProposal muss die Datei existieren');

  const note = notesFs.readNote(wikiDir, result.relPath);
  assert.equal(note.body.trim(), '# Freigegeben\n\nVom Nutzer bestätigt.');
  assert.deepEqual(note.frontmatter.tags, ['freigegeben', 'test']);

  assert.equal(aiProposals.getProposal(proposal.id), null);

  assert.throws(() => {
    aiProposals.applyProposal(proposal.id, wikiDir);
  }, /existiert nicht oder wurde bereits verarbeitet/);
});

test('AI-Proposals 6: applyProposal aktualisiert bestehende Notiz sicher', t => {
  const wikiDir = createTestWikiFixture(t);

  const proposal = aiProposals.createProposal(wikiDir, {
    type: 'update',
    relPath: 'Entwicklung/Workflows/Git Leitfaden.md',
    content: '# Git Leitfaden\n\nSchritt 1: git status\nSchritt 2: git add\nSchritt 3: git commit',
    tags: ['git', 'vcs', 'release'],
    reason: 'Schritt 3 hinzugefügt'
  });

  assert.equal(proposal.type, 'update');
  assert.ok(proposal.oldContent.includes('Schritt 1: git status'));

  const result = aiProposals.applyProposal(proposal.id, wikiDir);
  assert.equal(result.success, true);
  assert.equal(result.action, 'updated');

  const updatedNote = notesFs.readNote(wikiDir, 'Entwicklung/Workflows/Git Leitfaden.md');
  assert.ok(updatedNote.body.includes('Schritt 3: git commit'));
  assert.deepEqual(updatedNote.frontmatter.tags, ['git', 'vcs', 'release']);
});

test('AI-Proposals 7: rejectProposal verwirft Vorschlag ohne Dateiänderung', t => {
  const wikiDir = createTestWikiFixture(t);

  const proposal = aiProposals.createProposal(wikiDir, {
    type: 'create',
    subCategoryRelPath: 'Entwicklung/Workflows',
    title: 'Abgelehnte Notiz',
    content: '# Ungewollt',
    tags: []
  });

  const res = aiProposals.rejectProposal(proposal.id);
  assert.equal(res.success, true);
  assert.equal(res.rejected, true);

  assert.equal(aiProposals.getProposal(proposal.id), null);

  const targetFile = path.join(wikiDir, proposal.relPath);
  assert.equal(fs.existsSync(targetFile), false);
});

test('AI-Proposals 8: create_category Proposal erstellt Haupt- oder Unterkategorie nach Freigabe', t => {
  const wikiDir = createTestWikiFixture(t);

  // 1. Unterkategorie in bestehender Hauptkategorie
  const subProp = aiProposals.createProposal(wikiDir, {
    type: 'create_category',
    name: 'CI-CD',
    parentCategoryRelPath: 'Entwicklung',
    reason: 'Neuer Bereich für Automatisierung'
  });
  assert.equal(subProp.type, 'create_category');
  assert.equal(subProp.relPath, 'Entwicklung/CI-CD');
  // Noch nicht auf der Festplatte
  assert.equal(fs.existsSync(path.join(wikiDir, 'Entwicklung', 'CI-CD')), false);

  const subRes = aiProposals.applyProposal(subProp.id, wikiDir);
  assert.equal(subRes.success, true);
  assert.equal(subRes.action, 'created_category');
  assert.ok(fs.existsSync(path.join(wikiDir, 'Entwicklung', 'CI-CD')), 'Unterkategorie muss angelegt sein');

  // 2. Neue Hauptkategorie
  const mainProp = aiProposals.createProposal(wikiDir, {
    type: 'create_category',
    name: 'Wissen',
    reason: 'Neues Hauptthema'
  });
  assert.equal(mainProp.relPath, 'Wissen');
  assert.equal(fs.existsSync(path.join(wikiDir, 'Wissen')), false);

  const mainRes = aiProposals.applyProposal(mainProp.id, wikiDir);
  assert.equal(mainRes.success, true);
  assert.ok(fs.existsSync(path.join(wikiDir, 'Wissen')), 'Hauptkategorie muss angelegt sein');

  // 3. Ungültige Parent-Tiefe wird abgewiesen
  assert.throws(() => {
    aiProposals.createProposal(wikiDir, {
      type: 'create_category',
      name: 'ZuTief',
      parentCategoryRelPath: 'Entwicklung/Workflows' // Tiefe 2 statt 1
    });
  }, /Tiefe 1/);
});

test('AI-Proposals 9: move Proposal verschiebt Notiz erst nach Bestätigung', t => {
  const wikiDir = createTestWikiFixture(t);

  // Ziel-Unterkategorie anlegen
  const targetSubDir = path.join(wikiDir, 'Entwicklung', 'DevOps');
  fs.mkdirSync(targetSubDir, { recursive: true });

  const moveProp = aiProposals.createProposal(wikiDir, {
    type: 'move',
    relPath: 'Entwicklung/Workflows/Git Leitfaden.md',
    targetSubCategoryRelPath: 'Entwicklung/DevOps',
    reason: 'Passt besser zu DevOps'
  });
  assert.equal(moveProp.type, 'move');
  assert.ok(moveProp.relPath.includes('Entwicklung/DevOps/Git Leitfaden.md'));

  // Vor Freigabe noch am alten Ort
  assert.ok(fs.existsSync(path.join(wikiDir, 'Entwicklung/Workflows/Git Leitfaden.md')));
  assert.equal(fs.existsSync(path.join(wikiDir, 'Entwicklung/DevOps/Git Leitfaden.md')), false);

  const moveRes = aiProposals.applyProposal(moveProp.id, wikiDir);
  assert.equal(moveRes.success, true);
  assert.equal(moveRes.action, 'moved');

  // Nach Freigabe verschoben
  assert.equal(fs.existsSync(path.join(wikiDir, 'Entwicklung/Workflows/Git Leitfaden.md')), false);
  assert.ok(fs.existsSync(path.join(wikiDir, 'Entwicklung/DevOps/Git Leitfaden.md')));

  const movedNote = notesFs.readNote(wikiDir, 'Entwicklung/DevOps/Git Leitfaden.md');
  assert.equal(movedNote.frontmatter.category, 'DevOps');
  assert.equal(movedNote.frontmatter.mainCategory, 'Entwicklung');
});

test('AI-Proposals 10: rename Proposal benennt Notiz und Frontmatter-Titel um', t => {
  const wikiDir = createTestWikiFixture(t);

  const renameProp = aiProposals.createProposal(wikiDir, {
    type: 'rename',
    relPath: 'Entwicklung/Workflows/Git Leitfaden.md',
    newTitle: 'Git und GitHub Handbuch',
    reason: 'Ausführlicherer Titel'
  });
  assert.equal(renameProp.type, 'rename');
  assert.ok(renameProp.relPath.includes('Git und GitHub Handbuch.md'));

  // Vor Freigabe noch alter Name
  assert.ok(fs.existsSync(path.join(wikiDir, 'Entwicklung/Workflows/Git Leitfaden.md')));
  assert.equal(fs.existsSync(path.join(wikiDir, 'Entwicklung/Workflows/Git und GitHub Handbuch.md')), false);

  const renameRes = aiProposals.applyProposal(renameProp.id, wikiDir);
  assert.equal(renameRes.success, true);
  assert.equal(renameRes.action, 'renamed');

  // Nach Freigabe umbenannt
  assert.equal(fs.existsSync(path.join(wikiDir, 'Entwicklung/Workflows/Git Leitfaden.md')), false);
  assert.ok(fs.existsSync(path.join(wikiDir, 'Entwicklung/Workflows/Git und GitHub Handbuch.md')));

  const renamedNote = notesFs.readNote(wikiDir, 'Entwicklung/Workflows/Git und GitHub Handbuch.md');
  assert.equal(renamedNote.frontmatter.title, 'Git und GitHub Handbuch');
});

test('AI-Proposals 11: delete Proposal verschiebt Notiz in den Papierkorb (.wiki-trash/)', t => {
  const wikiDir = createTestWikiFixture(t);

  const delProp = aiProposals.createProposal(wikiDir, {
    type: 'delete',
    relPath: 'Entwicklung/Workflows/Git Leitfaden.md',
    reason: 'Veraltet, wird nicht mehr benötigt'
  });
  assert.equal(delProp.type, 'delete');

  // Vor Freigabe noch vorhanden
  assert.ok(fs.existsSync(path.join(wikiDir, 'Entwicklung/Workflows/Git Leitfaden.md')));

  const delRes = aiProposals.applyProposal(delProp.id, wikiDir);
  assert.equal(delRes.success, true);
  assert.equal(delRes.action, 'deleted');
  assert.ok(delRes.trashRelPath);

  // Nach Freigabe nicht mehr im Wiki-Ordner
  assert.equal(fs.existsSync(path.join(wikiDir, 'Entwicklung/Workflows/Git Leitfaden.md')), false);

  // Aber im Papierkorb auffindbar
  const trashItems = notesFs.listTrash(wikiDir);
  assert.ok(trashItems.length >= 1);
  assert.ok(trashItems.some(item => item.originalRelPath?.includes('Git Leitfaden') || item.title?.includes('Git Leitfaden') || item.trashRelPath?.includes('Git Leitfaden')));
});

test('AI-Proposals 12: applyProposal legt fehlende Haupt- und Unterkategorie beim Notiz-Erstellen automatisch an', t => {
  const wikiDir = createTestWikiFixture(t);

  // Weder "Wissen" noch "Wissen/Rezepte" existieren bisher im Test-Wiki
  assert.equal(fs.existsSync(path.join(wikiDir, 'Wissen')), false);
  assert.equal(fs.existsSync(path.join(wikiDir, 'Wissen/Rezepte')), false);

  const proposal = aiProposals.createProposal(wikiDir, {
    type: 'create',
    subCategoryRelPath: 'Wissen/Rezepte',
    title: 'Käsekuchen',
    content: '# Käsekuchen\n\nRezept für leckeren Kuchen.',
    tags: ['rezept', 'backen'],
    reason: 'Neue Kategorie und Notiz in einem Schritt angelegt'
  });

  assert.equal(proposal.type, 'create');
  assert.equal(proposal.subCategoryRelPath, 'Wissen/Rezepte');
  assert.ok(proposal.relPath.includes('Käsekuchen.md'));

  // Vor Freigabe existiert noch nichts
  assert.equal(fs.existsSync(path.join(wikiDir, 'Wissen')), false);

  // Freigabe ausführen
  const result = aiProposals.applyProposal(proposal.id, wikiDir);
  assert.equal(result.success, true);
  assert.equal(result.action, 'created');

  // Jetzt existieren Ordner und Datei
  assert.ok(fs.existsSync(path.join(wikiDir, 'Wissen')));
  assert.ok(fs.existsSync(path.join(wikiDir, 'Wissen/Rezepte')));
  const noteFile = path.join(wikiDir, 'Wissen/Rezepte/Käsekuchen.md');
  assert.ok(fs.existsSync(noteFile));

  const note = notesFs.readNote(wikiDir, 'Wissen/Rezepte/Käsekuchen.md');
  assert.equal(note.frontmatter.title, 'Käsekuchen');
  assert.equal(note.frontmatter.category, 'Rezepte');
  assert.equal(note.frontmatter.mainCategory, 'Wissen');
});

