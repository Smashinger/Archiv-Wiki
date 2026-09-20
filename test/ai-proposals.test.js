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
