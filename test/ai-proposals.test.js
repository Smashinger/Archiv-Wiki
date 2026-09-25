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

test('AI-Proposals 13: applyProposal aktualisiert nur Tags wenn content nicht übergeben wird', t => {
  const wikiDir = createTestWikiFixture(t);

  const proposal = aiProposals.createProposal(wikiDir, {
    type: 'update',
    relPath: 'Entwicklung/Workflows/Git Leitfaden.md',
    tags: ['git', 'neuertag'],
    reason: 'Fehlende Tags ergänzt'
  });

  assert.equal(proposal.type, 'update');
  assert.deepEqual(proposal.diff, [{ type: 'add', line: '+ Tags: #git #neuertag' }]);

  const result = aiProposals.applyProposal(proposal.id, wikiDir);
  assert.equal(result.success, true);
  assert.equal(result.action, 'updated');

  const updatedNote = notesFs.readNote(wikiDir, 'Entwicklung/Workflows/Git Leitfaden.md');
  // Inhalt bleibt vollständig erhalten:
  assert.ok(updatedNote.body.includes('Schritt 1: git status'));
  assert.deepEqual(updatedNote.frontmatter.tags, ['git', 'neuertag']);
});

test('AI-Proposals 14: applyProposal weist veraltetes update-Proposal ab wenn Body geändert wurde (AI_PROPOSAL_STALE)', t => {
  const wikiDir = createTestWikiFixture(t);

  // 1. Proposal für Notiz erstellen
  const proposal = aiProposals.createProposal(wikiDir, {
    type: 'update',
    relPath: 'Entwicklung/Workflows/Git Leitfaden.md',
    content: '# Git Leitfaden\n\nKI-Inhalt.',
    reason: 'Überarbeitung durch KI'
  });

  // 2. Zwischenzeitliche Änderung der Notiz außerhalb des Proposals simulieren
  notesFs.writeNote(wikiDir, 'Entwicklung/Workflows/Git Leitfaden.md', '# Git Leitfaden\n\nManuelle Änderung des Nutzers.');

  // 3. applyProposal muss mit AI_PROPOSAL_STALE fehlschlagen
  assert.throws(() => {
    aiProposals.applyProposal(proposal.id, wikiDir);
  }, err => {
    assert.equal(err.code, 'AI_PROPOSAL_STALE');
    assert.ok(err.message.includes('zwischenzeitlich geändert'));
    return true;
  });

  // 4. Manuelle Änderung des Nutzers muss unversehrt erhalten bleiben
  const currentNote = notesFs.readNote(wikiDir, 'Entwicklung/Workflows/Git Leitfaden.md');
  assert.ok(currentNote.body.includes('Manuelle Änderung des Nutzers.'));
});

test('AI-Proposals 15: applyProposal weist veraltetes update-Proposal ab wenn Frontmatter geändert wurde (AI_PROPOSAL_STALE)', t => {
  const wikiDir = createTestWikiFixture(t);

  const proposal = aiProposals.createProposal(wikiDir, {
    type: 'update',
    relPath: 'Entwicklung/Workflows/Git Leitfaden.md',
    content: '# Git Leitfaden\n\nKI-Inhalt.',
    reason: 'Überarbeitung durch KI'
  });

  // Zwischenzeitliche Änderung nur der Tags im Frontmatter
  notesFs.writeNote(wikiDir, 'Entwicklung/Workflows/Git Leitfaden.md', undefined, { tags: ['git', 'vcs', 'manuell'] });

  assert.throws(() => {
    aiProposals.applyProposal(proposal.id, wikiDir);
  }, err => {
    assert.equal(err.code, 'AI_PROPOSAL_STALE');
    return true;
  });
});

test('AI-Proposals 16: applyProposal weist veraltetes delete-Proposal ab wenn Notiz geändert wurde (AI_PROPOSAL_STALE)', t => {
  const wikiDir = createTestWikiFixture(t);

  const proposal = aiProposals.createProposal(wikiDir, {
    type: 'delete',
    relPath: 'Entwicklung/Workflows/Git Leitfaden.md',
    reason: 'Sollte gelöscht werden'
  });

  // Nutzer hat die Notiz weiterbearbeitet
  notesFs.writeNote(wikiDir, 'Entwicklung/Workflows/Git Leitfaden.md', '# Git Leitfaden\n\nWichtige neue Notizen.');

  assert.throws(() => {
    aiProposals.applyProposal(proposal.id, wikiDir);
  }, err => {
    assert.equal(err.code, 'AI_PROPOSAL_STALE');
    return true;
  });

  // Notiz wurde NICHT gelöscht
  assert.ok(fs.existsSync(path.join(wikiDir, 'Entwicklung/Workflows/Git Leitfaden.md')));
});

test('AI-Proposals 17: applyProposal weist veraltetes move-Proposal ab wenn Notiz geändert wurde oder Zieldatei existiert', t => {
  const wikiDir = createTestWikiFixture(t);
  const targetSubDir = path.join(wikiDir, 'Entwicklung', 'DevOps');
  fs.mkdirSync(targetSubDir, { recursive: true });

  const proposal = aiProposals.createProposal(wikiDir, {
    type: 'move',
    relPath: 'Entwicklung/Workflows/Git Leitfaden.md',
    targetSubCategoryRelPath: 'Entwicklung/DevOps'
  });

  // Fall A: Body geändert
  notesFs.writeNote(wikiDir, 'Entwicklung/Workflows/Git Leitfaden.md', '# Neuer Inhalt');
  assert.throws(() => {
    aiProposals.applyProposal(proposal.id, wikiDir);
  }, err => err.code === 'AI_PROPOSAL_STALE');

  // Fall B: Zieldatei existiert bereits
  const freshProp = aiProposals.createProposal(wikiDir, {
    type: 'move',
    relPath: 'Entwicklung/Workflows/Git Leitfaden.md',
    targetSubCategoryRelPath: 'Entwicklung/DevOps'
  });
  fs.writeFileSync(path.join(targetSubDir, 'Git Leitfaden.md'), '# Kollision', 'utf8');
  assert.throws(() => {
    aiProposals.applyProposal(freshProp.id, wikiDir);
  }, err => err.code === 'AI_PROPOSAL_STALE');
});

test('AI-Proposals 18: applyProposal weist veraltetes rename-Proposal ab wenn Notiz geändert wurde oder Zielname existiert', t => {
  const wikiDir = createTestWikiFixture(t);

  const proposal = aiProposals.createProposal(wikiDir, {
    type: 'rename',
    relPath: 'Entwicklung/Workflows/Git Leitfaden.md',
    newTitle: 'Neuer Titel'
  });

  // Fall A: Notiz zwischenzeitlich geändert
  notesFs.writeNote(wikiDir, 'Entwicklung/Workflows/Git Leitfaden.md', '# Geänderter Inhalt');
  assert.throws(() => {
    aiProposals.applyProposal(proposal.id, wikiDir);
  }, err => err.code === 'AI_PROPOSAL_STALE');

  // Fall B: Zieldatei existiert bereits
  const freshProp = aiProposals.createProposal(wikiDir, {
    type: 'rename',
    relPath: 'Entwicklung/Workflows/Git Leitfaden.md',
    newTitle: 'Kollidierender Titel'
  });
  fs.writeFileSync(path.join(wikiDir, 'Entwicklung/Workflows/Kollidierender Titel.md'), '# Schon da', 'utf8');
  assert.throws(() => {
    aiProposals.applyProposal(freshProp.id, wikiDir);
  }, err => err.code === 'AI_PROPOSAL_STALE');
});

test('AI-Proposals 19: applyProposal weist create-Proposal ab wenn Zieldatei inzwischen existiert', t => {
  const wikiDir = createTestWikiFixture(t);

  const proposal = aiProposals.createProposal(wikiDir, {
    type: 'create',
    subCategoryRelPath: 'Entwicklung/Workflows',
    title: 'Neue Notiz',
    content: '# Neu'
  });

  // Datei wird vor Apply von anderem Prozess/Nutzer angelegt
  fs.writeFileSync(path.join(wikiDir, 'Entwicklung/Workflows/Neue Notiz.md'), '# Schon da', 'utf8');

  assert.throws(() => {
    aiProposals.applyProposal(proposal.id, wikiDir);
  }, err => {
    assert.equal(err.code, 'AI_PROPOSAL_STALE');
    return true;
  });
});

test('AI-Proposals 20: applyProposal weist Proposal ab wenn Notiz zwischenzeitlich gelöscht wurde', t => {
  const wikiDir = createTestWikiFixture(t);

  const proposal = aiProposals.createProposal(wikiDir, {
    type: 'update',
    relPath: 'Entwicklung/Workflows/Git Leitfaden.md',
    content: '# Neuer Inhalt'
  });

  // Notiz wird auf der Festplatte entfernt
  fs.unlinkSync(path.join(wikiDir, 'Entwicklung/Workflows/Git Leitfaden.md'));

  assert.throws(() => {
    aiProposals.applyProposal(proposal.id, wikiDir);
  }, err => {
    assert.equal(err.code, 'AI_PROPOSAL_STALE');
    return true;
  });
});

test('AI-Proposals 21: createProposal weist interne/ausgeblendete Pfade ab und erzeugt keine Ordner (M1)', t => {
  const wikiDir = createTestWikiFixture(t);

  // 1. Neuer Notizvorschlag in .wiki-trash oder .intern
  assert.throws(() => {
    aiProposals.createProposal(wikiDir, {
      type: 'create',
      subCategoryRelPath: '.wiki-trash/geheim',
      title: 'Schädlich',
      content: 'Inhalt'
    });
  }, /Interne oder ungültige Wiki-Pfade sind nicht zulässig/);

  // Es darf kein Ordner angelegt worden sein
  assert.equal(fs.existsSync(path.join(wikiDir, '.wiki-trash', 'geheim')), false);

  // 2. Unterkategorie in .wiki-trash
  assert.throws(() => {
    aiProposals.createProposal(wikiDir, {
      type: 'create_category',
      name: 'Unterordner',
      parentCategoryRelPath: '.wiki-trash'
    });
  }, /Interne oder ungültige Wiki-Pfade sind nicht zulässig/);

  assert.equal(fs.existsSync(path.join(wikiDir, '.wiki-trash', 'Unterordner')), false);
});

test('AI-Proposals 22: M4 - Atomarer Create mit Tags', t => {
  const wikiDir = createTestWikiFixture(t);

  // 1. notesFs.createNote mit options.tags
  const createdRaw = notesFs.createNote(wikiDir, 'Entwicklung/Workflows', 'Atomare Notiz', '# Inhalt', {
    tags: ['tag1', 'tag2', 'tag1'] // deduplizierend
  });
  const readRaw = notesFs.readNote(wikiDir, createdRaw.relPath);
  assert.deepEqual(readRaw.frontmatter.tags, ['tag1', 'tag2'], 'Tags wurden direkt im ersten Schreibvorgang gesetzt');

  // 2. aiProposals.applyProposal mit Create und Tags
  const prop = aiProposals.createProposal(wikiDir, {
    type: 'create',
    subCategoryRelPath: 'Entwicklung/Workflows',
    title: 'Proposal Notiz Mit Tags',
    content: '# Vorschlag Inhalt',
    tags: ['architektur', 'qualität']
  });
  const applyRes = aiProposals.applyProposal(prop.id, wikiDir);
  assert.equal(applyRes.success, true);
  const readApplied = notesFs.readNote(wikiDir, applyRes.relPath);
  assert.deepEqual(readApplied.frontmatter.tags, ['architektur', 'qualität'], 'Tags sind atomar vorhanden');
});

test('AI-Proposals 23: M3 - Speicherverwaltung (Max-Count, TTL, Projekt-Cleanup, Content-Limit)', t => {
  const wikiDir = createTestWikiFixture(t);
  aiProposals.clearAllProposals();

  // 1. Max-Count (50) & FIFO-Eviction
  for (let i = 1; i <= 55; i++) {
    aiProposals.createProposal(wikiDir, {
      type: 'create',
      subCategoryRelPath: 'Entwicklung/Workflows',
      title: `Notiz ${i}`,
      content: `Inhalt ${i}`
    });
  }
  // Überprüfung: Proposal anlegen
  const firstProp = aiProposals.createProposal(wikiDir, {
    type: 'create',
    subCategoryRelPath: 'Entwicklung/Workflows',
    title: 'Test-Verdrängung',
    content: 'Inhalt'
  });
  assert.ok(aiProposals.getProposal(firstProp.id));

  // 2. TTL-Ablauf
  firstProp.createdAtTimestamp = Date.now() - (aiProposals.PROPOSAL_TTL_MS + 5000);
  assert.equal(aiProposals.getProposal(firstProp.id), null, 'Abgelaufener Vorschlag liefert null');
  assert.throws(() => {
    aiProposals.applyProposal(firstProp.id, wikiDir);
  }, err => {
    assert.equal(err.code, 'AI_PROPOSAL_STALE');
    return true;
  });

  // 3. Projekt-Cleanup
  const propProject1 = aiProposals.createProposal(wikiDir, {
    type: 'create',
    subCategoryRelPath: 'Entwicklung/Workflows',
    title: 'Projekt 1 Notiz'
  });
  const otherDir = path.join(testHome, 'ai-prop-other-project');
  fs.mkdirSync(otherDir, { recursive: true });
  t.after(() => fs.rmSync(otherDir, { recursive: true, force: true }));

  const propProject2 = aiProposals.createProposal(otherDir, {
    type: 'create',
    subCategoryRelPath: 'Entwicklung/Workflows',
    title: 'Projekt 2 Notiz'
  });

  aiProposals.clearProposalsForProject(wikiDir);
  assert.equal(aiProposals.getProposal(propProject1.id), null, 'Vorschlag von Projekt 1 wurde aufgeräumt');
  assert.ok(aiProposals.getProposal(propProject2.id), 'Vorschlag von Projekt 2 bleibt erhalten');

  // 4. Content-Limit
  assert.throws(() => {
    aiProposals.createProposal(wikiDir, {
      type: 'create',
      subCategoryRelPath: 'Entwicklung/Workflows',
      title: 'Übergroße Notiz',
      content: 'A'.repeat(aiProposals.MAX_CONTENT_LENGTH + 10)
    });
  }, /Inhalt überschreitet die maximale Größe/);
});

test('AI-Proposals 24: M5 - Diff-Präzision (LCS), CRLF-Normalisierung, NUL-Ablehnung & Truncation-Marker', t => {
  const wikiDir = createTestWikiFixture(t);

  // 1. CRLF-Normalisierung: keine Scheindiffs
  const diffCRLF = aiProposals.computeLineDiff('Zeile 1\r\nZeile 2\r\n', 'Zeile 1\nZeile 2\n');
  assert.ok(diffCRLF.every(d => d.type === 'same'), 'CRLF vs LF führt zu keinem Scheindiff');

  // 2. NUL-Ablehnung
  assert.throws(() => {
    aiProposals.computeLineDiff('Test\0Inhalt', 'Test');
  }, /Binäre Inhalte werden nicht unterstützt/);

  assert.throws(() => {
    aiProposals.createProposal(wikiDir, {
      type: 'create',
      subCategoryRelPath: 'Entwicklung/Workflows',
      title: 'NUL-Notiz',
      content: 'Hallo\0Welt'
    });
  }, /Binäre Inhalte werden nicht unterstützt/);

  // 3. LCS: Einfügung desynchronisiert nachfolgende Zeilen nicht
  const oldText = 'A\nB\nC\nD\nE';
  const newText = 'A\nNEU\nB\nC\nD\nE';
  const diffLCS = aiProposals.computeLineDiff(oldText, newText);
  const types = diffLCS.map(d => d.type);
  assert.deepEqual(types, ['same', 'add', 'same', 'same', 'same', 'same']);
  assert.equal(diffLCS[1].line, 'NEU');

  // 4. Truncation-Marker bei neuen Inhalten (> 150 Zeilen)
  const lines160 = Array.from({ length: 160 }, (_, i) => `Zeile ${i + 1}`).join('\n');
  const diffTruncatedNew = aiProposals.computeLineDiff('', lines160);
  assert.equal(diffTruncatedNew.length, 151); // 150 adds + 1 truncated
  const lastNew = diffTruncatedNew[150];
  assert.equal(lastNew.type, 'truncated');
  assert.ok(lastNew.line.includes('10 weitere Zeilen'));
  assert.ok(lastNew.line.includes('160 Zeilen'));

  // 5. Vollständige Änderungshunks bei komplett ersetztem Inhalt (> 200 Einträge)
  const old250 = Array.from({ length: 250 }, (_, i) => `Alt ${i + 1}`).join('\n');
  const new250 = Array.from({ length: 250 }, (_, i) => `Neu ${i + 1}`).join('\n');
  const diffTruncatedMod = aiProposals.computeLineDiff(old250, new250);
  assert.equal(diffTruncatedMod.filter(d => d.type === 'remove').length, 250);
  assert.equal(diffTruncatedMod.filter(d => d.type === 'add').length, 250);
  assert.equal(diffTruncatedMod.some(d => d.line === 'Alt 250'), true);
  assert.equal(diffTruncatedMod.some(d => d.line === 'Neu 250'), true);
});

test('AI-Proposals 25: M5 - Hunk-Faltung behält Änderungen am Ende langer Dateien (> 300 unveränderte Zeilen) bei', t => {
  const unchangedLines = Array.from({ length: 300 }, (_, i) => `Unverändert Zeile ${i + 1}`).join('\n');
  const oldText = `${unchangedLines}\nAlter Inhalt`;
  const newText = `${unchangedLines}\nNeuer Inhalt`;

  const diff = aiProposals.computeLineDiff(oldText, newText);

  // Die Faltung muss die 300 unveränderten Zeilen zusammenfassen
  const folded = diff.find(d => d.type === 'truncated' && d.line.includes('unveränderte Zeilen übersprungen'));
  assert.ok(folded, 'Unveränderte Zeilen müssen mit Überspringen-Marker gefaltet sein');

  // Die tatsächliche Änderung darf NICHT herausgeschnitten werden!
  const addLine = diff.find(d => d.type === 'add');
  const removeLine = diff.find(d => d.type === 'remove');
  assert.ok(addLine, 'Hinzugefügte Zeile muss im Diff vorhanden sein');
  assert.equal(addLine.line, 'Neuer Inhalt');
  assert.ok(removeLine, 'Gelöschte Zeile muss im Diff vorhanden sein');
  assert.equal(removeLine.line, 'Alter Inhalt');
});

test('AI-Proposals 26: M5 - Hunk-Faltung behält alle verteilten Änderungen über dem Anzeigelimit', () => {
  const oldLines = Array.from({ length: 320 }, (_, i) => `Zeile ${i + 1}`);
  const newLines = oldLines.map((line, i) => i % 4 === 3 ? `${line} geändert` : line);

  const diff = aiProposals.computeLineDiff(oldLines.join('\n'), newLines.join('\n'));
  const additions = diff.filter(entry => entry.type === 'add');
  const removals = diff.filter(entry => entry.type === 'remove');

  assert.equal(additions.length, 80, 'Alle 80 hinzugefügten Zeilen müssen sichtbar sein');
  assert.equal(removals.length, 80, 'Alle 80 entfernten Zeilen müssen sichtbar sein');
  assert.ok(additions.some(entry => entry.line === 'Zeile 320 geändert'), 'Letzte Änderung muss sichtbar bleiben');
  assert.ok(removals.some(entry => entry.line === 'Zeile 320'), 'Letzte entfernte Zeile muss sichtbar bleiben');
});

function createCategoryFixture(t) {
  fs.mkdirSync(testHome, { recursive: true });
  const wikiDir = fs.mkdtempSync(path.join(testHome, 'ai-prop-cats-'));

  fs.mkdirSync(path.join(wikiDir, 'Entwicklung', 'Workflows'), { recursive: true });
  fs.mkdirSync(path.join(wikiDir, 'Entwicklung', 'DevOps'), { recursive: true });
  fs.mkdirSync(path.join(wikiDir, 'Wissen', 'Software'), { recursive: true });

  fs.writeFileSync(path.join(wikiDir, 'Entwicklung', 'Workflows', 'Git Leitfaden.md'), `---
title: "Git Leitfaden"
category: "Workflows"
mainCategory: "Entwicklung"
---
# Git Leitfaden
`, 'utf8');

  fs.writeFileSync(path.join(wikiDir, '.wiki-config.json'), JSON.stringify({
    childOrder: {
      '': ['Entwicklung', 'Wissen'],
      'Entwicklung': ['Workflows', 'DevOps']
    },
    categoryIcons: {
      'Entwicklung': '💻',
      'Entwicklung/Workflows': '🔧'
    },
    noteScrollPositions: {
      'Entwicklung/Workflows/Git Leitfaden.md': { editor: 42, preview: 7 }
    },
    savedCollapsedGroups: ['Entwicklung/Workflows']
  }, null, 2), 'utf8');

  t.after(() => {
    aiProposals.clearAllProposals();
    fs.rmSync(wikiDir, { recursive: true, force: true });
  });

  return wikiDir;
}

function readConfig(wikiDir) {
  return JSON.parse(fs.readFileSync(path.join(wikiDir, '.wiki-config.json'), 'utf8'));
}

test('AI-Proposals 27: Block 3 - rename_category benennt Hauptkategorie um und migriert Icons/Reihenfolge/Scrollpositionen', t => {
  const wikiDir = createCategoryFixture(t);

  const prop = aiProposals.createProposal(wikiDir, {
    type: 'rename_category',
    relPath: 'Entwicklung',
    newName: 'Entwicklung & IT',
    reason: 'Klarerer Name'
  });
  assert.equal(prop.type, 'rename_category');
  assert.equal(prop.relPath, 'Entwicklung & IT');
  assert.ok(fs.existsSync(path.join(wikiDir, 'Entwicklung')), 'vor Freigabe noch am alten Ort');

  const res = aiProposals.applyProposal(prop.id, wikiDir);
  assert.equal(res.success, true);
  assert.equal(res.action, 'renamed_category');
  assert.equal(res.relPath, 'Entwicklung & IT');

  assert.equal(fs.existsSync(path.join(wikiDir, 'Entwicklung')), false);
  assert.ok(fs.existsSync(path.join(wikiDir, 'Entwicklung & IT', 'Workflows', 'Git Leitfaden.md')), 'enthaltene Notizen bleiben auffindbar');

  const config = readConfig(wikiDir);
  assert.deepEqual(config.childOrder[''], ['Entwicklung & IT', 'Wissen'], 'Wurzel-Reihenfolge zeigt jetzt auf den neuen Namen');
  assert.ok(config.childOrder['Entwicklung & IT'], 'Unterkategorie-Reihenfolge unter dem neuen Pfad vorhanden');
  assert.equal(config.childOrder['Entwicklung'], undefined, 'alter Pfad verschwindet aus childOrder');
  assert.equal(config.categoryIcons['Entwicklung & IT'], '💻');
  assert.equal(config.categoryIcons['Entwicklung & IT/Workflows'], '🔧');
  assert.equal(config.categoryIcons['Entwicklung'], undefined);
  assert.ok(config.noteScrollPositions['Entwicklung & IT/Workflows/Git Leitfaden.md'], 'Scrollposition migriert');
  assert.deepEqual(config.savedCollapsedGroups, ['Entwicklung & IT/Workflows']);
});

test('AI-Proposals 28: Block 3 - rename_category benennt Unterkategorie um (Icons bleiben unter dem richtigen Pfad)', t => {
  const wikiDir = createCategoryFixture(t);

  const prop = aiProposals.createProposal(wikiDir, {
    type: 'rename_category',
    relPath: 'Entwicklung/Workflows',
    newName: 'Prozesse'
  });
  assert.equal(prop.relPath, 'Entwicklung/Prozesse');

  const res = aiProposals.applyProposal(prop.id, wikiDir);
  assert.equal(res.success, true);
  assert.ok(fs.existsSync(path.join(wikiDir, 'Entwicklung', 'Prozesse', 'Git Leitfaden.md')));

  const config = readConfig(wikiDir);
  assert.equal(config.categoryIcons['Entwicklung/Prozesse'], '🔧');
  assert.equal(config.categoryIcons['Entwicklung'], '💻', 'Hauptkategorie-Icon bleibt unberührt');
  assert.deepEqual(config.childOrder['Entwicklung'], ['Prozesse', 'DevOps']);
});

test('AI-Proposals 29: Block 3 - move_subcategory verschiebt Unterkategorie in andere Hauptkategorie', t => {
  const wikiDir = createCategoryFixture(t);

  const prop = aiProposals.createProposal(wikiDir, {
    type: 'move_subcategory',
    relPath: 'Entwicklung/Workflows',
    targetMainCategoryRelPath: 'Wissen',
    reason: 'Passt besser zu Wissen'
  });
  assert.equal(prop.type, 'move_subcategory');
  assert.equal(prop.relPath, 'Wissen/Workflows');

  const res = aiProposals.applyProposal(prop.id, wikiDir);
  assert.equal(res.success, true);
  assert.equal(res.action, 'moved_subcategory');
  assert.equal(fs.existsSync(path.join(wikiDir, 'Entwicklung', 'Workflows')), false);
  assert.ok(fs.existsSync(path.join(wikiDir, 'Wissen', 'Workflows', 'Git Leitfaden.md')));

  const movedNote = notesFs.readNote(wikiDir, 'Wissen/Workflows/Git Leitfaden.md');
  assert.equal(movedNote.frontmatter.category, 'Workflows');
  assert.equal(movedNote.frontmatter.mainCategory, 'Wissen');

  const config = readConfig(wikiDir);
  assert.equal(config.categoryIcons['Wissen/Workflows'], '🔧', 'Icon der verschobenen Unterkategorie migriert');
  assert.ok(config.noteScrollPositions['Wissen/Workflows/Git Leitfaden.md']);
});

test('AI-Proposals 30: Block 3 - Strukturregeln: Hauptkategorie kann nicht per move_subcategory verschoben werden', t => {
  const wikiDir = createCategoryFixture(t);

  assert.throws(() => {
    aiProposals.createProposal(wikiDir, {
      type: 'move_subcategory',
      relPath: 'Entwicklung',
      targetMainCategoryRelPath: 'Wissen'
    });
  }, /keine Hauptkategorie/);
});

test('AI-Proposals 31: Block 3 - rename_category weist Notizen als Ziel ab (nur Kategorien)', t => {
  const wikiDir = createCategoryFixture(t);

  assert.throws(() => {
    aiProposals.createProposal(wikiDir, {
      type: 'rename_category',
      relPath: 'Entwicklung/Workflows/Git Leitfaden.md',
      newName: 'Anderer Name'
    });
  }, /Haupt- oder Unterkategorie/);
});

test('AI-Proposals 32: Block 3 - interne/versteckte Pfade werden bei Kategorie-Proposals abgewiesen', t => {
  const wikiDir = createCategoryFixture(t);

  assert.throws(() => {
    aiProposals.createProposal(wikiDir, {
      type: 'rename_category',
      relPath: '.wiki-trash',
      newName: 'Geheim'
    });
  }, /Interne oder ungültige Wiki-Pfade sind nicht zulässig/);

  assert.throws(() => {
    aiProposals.createProposal(wikiDir, {
      type: 'move_subcategory',
      relPath: 'Entwicklung/Workflows',
      targetMainCategoryRelPath: '.wiki-trash'
    });
  }, /Interne oder ungültige Wiki-Pfade sind nicht zulässig/);
});

test('AI-Proposals 33: Block 3 - Kollision am Zielort wird sowohl bei Erstellung als auch bei verspäteter Freigabe abgewiesen', t => {
  const wikiDir = createCategoryFixture(t);

  // Ziel existiert schon zum Zeitpunkt der Vorschlagserstellung.
  assert.throws(() => {
    aiProposals.createProposal(wikiDir, {
      type: 'rename_category',
      relPath: 'Entwicklung/Workflows',
      newName: 'DevOps'
    });
  }, /existiert bereits/);

  // Ziel entsteht ERST NACH der Vorschlagserstellung (Freigabe muss trotzdem ablehnen).
  const prop = aiProposals.createProposal(wikiDir, {
    type: 'rename_category',
    relPath: 'Entwicklung/Workflows',
    newName: 'Prozesse'
  });
  fs.mkdirSync(path.join(wikiDir, 'Entwicklung', 'Prozesse'), { recursive: true });

  assert.throws(() => {
    aiProposals.applyProposal(prop.id, wikiDir);
  }, { code: 'AI_PROPOSAL_STALE' });
  // Die ursprüngliche Unterkategorie bleibt unangetastet.
  assert.ok(fs.existsSync(path.join(wikiDir, 'Entwicklung', 'Workflows', 'Git Leitfaden.md')));
});

test('AI-Proposals 34: Block 3 - veraltetes rename_category/move_subcategory Proposal wird bei geänderter Notiz abgewiesen', t => {
  const wikiDir = createCategoryFixture(t);

  const prop = aiProposals.createProposal(wikiDir, {
    type: 'rename_category',
    relPath: 'Entwicklung/Workflows',
    newName: 'Prozesse'
  });

  // Notiz innerhalb der Kategorie wird zwischenzeitlich verändert.
  fs.writeFileSync(path.join(wikiDir, 'Entwicklung', 'Workflows', 'Git Leitfaden.md'), `---
title: "Git Leitfaden"
category: "Workflows"
mainCategory: "Entwicklung"
---
# Git Leitfaden

Zwischenzeitlich geändert.
`, 'utf8');

  assert.throws(() => {
    aiProposals.applyProposal(prop.id, wikiDir);
  }, { code: 'AI_PROPOSAL_STALE' });
  assert.equal(fs.existsSync(path.join(wikiDir, 'Entwicklung', 'Workflows')), true, 'keine Änderung bei veraltetem Vorschlag');
});

test('AI-Proposals 35: Block 3 - veraltetes Proposal wird abgewiesen wenn eine neue Notiz in der Kategorie erscheint', t => {
  const wikiDir = createCategoryFixture(t);

  const prop = aiProposals.createProposal(wikiDir, {
    type: 'move_subcategory',
    relPath: 'Entwicklung/Workflows',
    targetMainCategoryRelPath: 'Wissen'
  });

  fs.writeFileSync(path.join(wikiDir, 'Entwicklung', 'Workflows', 'Neu.md'), '# Neu', 'utf8');

  assert.throws(() => {
    aiProposals.applyProposal(prop.id, wikiDir);
  }, { code: 'AI_PROPOSAL_STALE' });
});

test('AI-Proposals 36: Block 3 - Projektwechsel macht Kategorie-Proposal ungültig', t => {
  const wikiDir = createCategoryFixture(t);
  const otherWikiDir = createCategoryFixture(t);

  const prop = aiProposals.createProposal(wikiDir, {
    type: 'rename_category',
    relPath: 'Entwicklung/Workflows',
    newName: 'Prozesse'
  });

  assert.throws(() => {
    aiProposals.applyProposal(prop.id, otherWikiDir);
  }, /gehört nicht zum aktuell geöffneten Wiki/);
});

test('AI-Proposals 37: Block 3 - reorder_entries ordnet Hauptkategorien neu (Wurzel) und ergänzt nicht erwähnte am Ende', t => {
  const wikiDir = createCategoryFixture(t);
  fs.mkdirSync(path.join(wikiDir, 'Freizeit'), { recursive: true });

  const prop = aiProposals.createProposal(wikiDir, {
    type: 'reorder_entries',
    parentRelPath: '',
    orderedNames: ['Wissen', 'Entwicklung']
  });
  assert.equal(prop.type, 'reorder_entries');

  const res = aiProposals.applyProposal(prop.id, wikiDir);
  assert.equal(res.success, true);
  assert.equal(res.action, 'reordered');

  const config = readConfig(wikiDir);
  assert.deepEqual(config.childOrder[''], ['Wissen', 'Entwicklung', 'Freizeit'], 'nicht erwähnte Hauptkategorie bleibt erhalten, ans Ende gehängt');
});

test('AI-Proposals 38: Block 3 - reorder_entries ordnet Unterkategorien EINER Hauptkategorie neu', t => {
  const wikiDir = createCategoryFixture(t);

  const prop = aiProposals.createProposal(wikiDir, {
    type: 'reorder_entries',
    parentRelPath: 'Entwicklung',
    orderedNames: ['DevOps', 'Workflows']
  });

  const res = aiProposals.applyProposal(prop.id, wikiDir);
  assert.equal(res.success, true);

  const config = readConfig(wikiDir);
  assert.deepEqual(config.childOrder['Entwicklung'], ['DevOps', 'Workflows']);
});

test('AI-Proposals 39: Block 3 - reorder_entries weist unbekannte Namen ab, statt sie stillschweigend zu ignorieren', t => {
  const wikiDir = createCategoryFixture(t);

  assert.throws(() => {
    aiProposals.createProposal(wikiDir, {
      type: 'reorder_entries',
      parentRelPath: 'Entwicklung',
      orderedNames: ['Workflows', 'GibtEsNicht']
    });
  }, /existieren hier nicht/);
});

test('AI-Proposals 40: Block 3 - reorder_entries weist Notizen/tiefere Pfade als parentRelPath ab', t => {
  const wikiDir = createCategoryFixture(t);

  assert.throws(() => {
    aiProposals.createProposal(wikiDir, {
      type: 'reorder_entries',
      parentRelPath: 'Entwicklung/Workflows',
      orderedNames: ['irgendwas']
    });
  }, /nur für die Hauptkategorien selbst/);
});

test('AI-Proposals 41: Block 3 - veraltetes reorder_entries Proposal wird abgewiesen wenn sich die Kategorien seitdem geändert haben', t => {
  const wikiDir = createCategoryFixture(t);

  const prop = aiProposals.createProposal(wikiDir, {
    type: 'reorder_entries',
    parentRelPath: '',
    orderedNames: ['Wissen', 'Entwicklung']
  });

  fs.mkdirSync(path.join(wikiDir, 'Freizeit'), { recursive: true }); // neue Hauptkategorie seitdem

  assert.throws(() => {
    aiProposals.applyProposal(prop.id, wikiDir);
  }, { code: 'AI_PROPOSAL_STALE' });
});
function createBatchFixture(t) {
  fs.mkdirSync(testHome, { recursive: true });
  const wikiDir = fs.mkdtempSync(path.join(testHome, 'ai-prop-batch-'));

  const workflowsDir = path.join(wikiDir, 'Entwicklung', 'Workflows');
  fs.mkdirSync(workflowsDir, { recursive: true });
  fs.mkdirSync(path.join(wikiDir, 'Entwicklung', 'Projekte'), { recursive: true });

  fs.writeFileSync(path.join(workflowsDir, 'NoteA.md'), '---\ntitle: "Notiz A"\n---\nAlter Inhalt A', 'utf8');
  fs.writeFileSync(path.join(workflowsDir, 'NoteB.md'), '---\ntitle: "Notiz B"\n---\nAlter Inhalt B', 'utf8');
  fs.writeFileSync(path.join(workflowsDir, 'NoteC.md'), '---\ntitle: "Notiz C"\n---\nAlter Inhalt C', 'utf8');
  fs.writeFileSync(path.join(workflowsDir, 'Kollision.md'), '---\ntitle: "Kollision"\n---\nBereits vorhanden', 'utf8');

  t.after(() => {
    aiProposals.clearAllProposals();
    fs.rmSync(wikiDir, { recursive: true, force: true });
  });

  return wikiDir;
}

test('AI-Proposals 42: Block 5 - batch_update erzeugt EINEN Vorschlag mit Diff und Zählung pro Notiz, ohne Dateien zu schreiben', t => {
  const wikiDir = createBatchFixture(t);

  const proposal = aiProposals.createProposal(wikiDir, {
    type: 'batch_update',
    items: [
      { relPath: 'Entwicklung/Workflows/NoteA.md', newContent: 'Neuer Inhalt A' },
      { relPath: 'Entwicklung/Workflows/NoteB.md', newContent: 'Neuer Inhalt B', newTitle: 'Notiz B umbenannt' }
    ],
    reason: 'Vereinfachte Sprache'
  });

  assert.equal(proposal.type, 'batch_update');
  assert.equal(proposal.items.length, 2);
  assert.equal(proposal.counts.total, 2);
  assert.equal(proposal.counts.contentChanges, 2);
  assert.equal(proposal.counts.renames, 1);
  assert.equal(proposal.counts.moves, 0);
  assert.deepEqual(proposal.warnings, []);

  const itemB = proposal.items.find(i => i.relPath === 'Entwicklung/Workflows/NoteB.md');
  assert.equal(itemB.targetRelPath, 'Entwicklung/Workflows/Notiz B umbenannt.md');
  assert.ok(itemB.diff.length > 0);

  assert.equal(fs.existsSync(path.join(wikiDir, 'Entwicklung/Workflows/NoteA.md')), true, 'Ursprungsdatei bleibt vor Freigabe unverändert erreichbar');
  const stillOldContent = fs.readFileSync(path.join(wikiDir, 'Entwicklung/Workflows/NoteA.md'), 'utf8');
  assert.ok(stillOldContent.includes('Alter Inhalt A'), 'Vor der Freigabe darf der Inhalt nicht überschrieben sein');
});

test('AI-Proposals 43: Block 5 - batch_update überspringt ungültige Einzeleinträge als Warnung statt den ganzen Vorschlag abzulehnen', t => {
  const wikiDir = createBatchFixture(t);

  const proposal = aiProposals.createProposal(wikiDir, {
    type: 'batch_update',
    items: [
      { relPath: 'Entwicklung/Workflows/NoteA.md', newContent: 'Gültige Änderung' },
      { relPath: 'Entwicklung/Workflows/NichtVorhanden.md', newContent: 'Egal' },
      { relPath: 'Entwicklung/Workflows/NoteB.md' }, // weder newContent noch newTitle noch Move
      { relPath: 'Entwicklung/Workflows/NoteC.md', newTitle: 'Kollision' } // Zielname existiert bereits
    ]
  });

  assert.equal(proposal.items.length, 1, 'Nur der gültige Eintrag wird übernommen');
  assert.equal(proposal.items[0].relPath, 'Entwicklung/Workflows/NoteA.md');
  assert.equal(proposal.warnings.length, 3);
  const warnedPaths = proposal.warnings.map(w => w.relPath).sort();
  assert.deepEqual(warnedPaths, [
    'Entwicklung/Workflows/NichtVorhanden.md',
    'Entwicklung/Workflows/NoteB.md',
    'Entwicklung/Workflows/NoteC.md'
  ]);
});

test('AI-Proposals 44: Block 5 - batch_update lehnt komplett leere oder vollständig ungültige items-Listen ab', t => {
  const wikiDir = createBatchFixture(t);

  assert.throws(() => {
    aiProposals.createProposal(wikiDir, { type: 'batch_update', items: [] });
  }, /nicht-leere Liste/);

  assert.throws(() => {
    aiProposals.createProposal(wikiDir, {
      type: 'batch_update',
      items: [{ relPath: 'Entwicklung/Workflows/NichtVorhanden.md', newContent: 'X' }]
    });
  }, /Keine der angegebenen Notizen/);
});

test('AI-Proposals 45: Block 5 - applyProposal wendet jede Notiz unabhängig an (Erfolg, Abwahl, veraltet) ohne dass ein Fehler die anderen verhindert', t => {
  const wikiDir = createBatchFixture(t);

  const proposal = aiProposals.createProposal(wikiDir, {
    type: 'batch_update',
    items: [
      { relPath: 'Entwicklung/Workflows/NoteA.md', newContent: 'Frisch geschrieben A' },
      { relPath: 'Entwicklung/Workflows/NoteB.md', newContent: 'Frisch geschrieben B' },
      { relPath: 'Entwicklung/Workflows/NoteC.md', newContent: 'Frisch geschrieben C' }
    ]
  });

  // NoteB wird NACH Vorschlagserstellung, aber VOR Übernahme extern geändert
  // (z. B. manuell im Editor gespeichert) -> muss beim Anwenden übersprungen
  // werden, statt die veraltete Version zu überschreiben.
  fs.writeFileSync(
    path.join(wikiDir, 'Entwicklung/Workflows/NoteB.md'),
    '---\ntitle: "Notiz B"\n---\nZwischenzeitlich von Hand geändert',
    'utf8'
  );

  const result = aiProposals.applyProposal(proposal.id, wikiDir, {
    deselectedRelPaths: ['Entwicklung/Workflows/NoteC.md']
  });

  assert.equal(result.success, true);
  assert.equal(result.summary.updated, 1);
  assert.equal(result.summary.skippedStale, 1);
  assert.equal(result.summary.deselected, 1);
  assert.equal(result.summary.failed, 0);

  const byPath = new Map(result.results.map(r => [r.relPath, r]));
  assert.equal(byPath.get('Entwicklung/Workflows/NoteA.md').outcome, 'updated');
  assert.equal(byPath.get('Entwicklung/Workflows/NoteB.md').outcome, 'skipped_stale');
  assert.equal(byPath.get('Entwicklung/Workflows/NoteC.md').outcome, 'skipped_deselected');

  assert.ok(fs.readFileSync(path.join(wikiDir, 'Entwicklung/Workflows/NoteA.md'), 'utf8').includes('Frisch geschrieben A'));
  assert.ok(fs.readFileSync(path.join(wikiDir, 'Entwicklung/Workflows/NoteB.md'), 'utf8').includes('Zwischenzeitlich von Hand geändert'), 'Die manuelle Änderung darf nicht überschrieben werden');
  assert.ok(fs.readFileSync(path.join(wikiDir, 'Entwicklung/Workflows/NoteC.md'), 'utf8').includes('Alter Inhalt C'), 'Abgewählte Notiz bleibt unverändert');

  assert.equal(aiProposals.getProposal(proposal.id), null, 'Proposal wird nach Anwenden aus dem Speicher entfernt');
});

test('AI-Proposals 46: Block 5 - applyProposal kann Inhalt, Umbenennung und Verschiebung in einem Batch-Eintrag kombinieren', t => {
  const wikiDir = createBatchFixture(t);

  const proposal = aiProposals.createProposal(wikiDir, {
    type: 'batch_update',
    items: [{
      relPath: 'Entwicklung/Workflows/NoteA.md',
      newContent: 'Kombinierter neuer Inhalt',
      newTitle: 'Notiz A Neu',
      targetSubCategoryRelPath: 'Entwicklung/Projekte'
    }]
  });

  const result = aiProposals.applyProposal(proposal.id, wikiDir);
  assert.equal(result.summary.updated, 1);
  const outcome = result.results[0];
  assert.equal(outcome.newRelPath, 'Entwicklung/Projekte/Notiz A Neu.md');

  const finalFullPath = path.join(wikiDir, outcome.newRelPath);
  assert.equal(fs.existsSync(finalFullPath), true);
  const finalNote = notesFs.readNote(wikiDir, outcome.newRelPath);
  assert.equal(finalNote.body.trim(), 'Kombinierter neuer Inhalt');
  assert.equal(finalNote.frontmatter.title, 'Notiz A Neu');
  assert.equal(fs.existsSync(path.join(wikiDir, 'Entwicklung/Workflows/NoteA.md')), false, 'Alte Datei existiert nach Verschieben nicht mehr');
});
