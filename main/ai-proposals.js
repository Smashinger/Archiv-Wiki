// main/ai-proposals.js — Verwaltet Änderungsvorschläge (Proposals) der KI
// Garantiert Human-in-the-Loop: Kein Schreibzugriff ohne explizite Nutzer-Bestätigung.

'use strict';

const path = require('path');
const crypto = require('crypto');
const notesFs = require('./notes-fs');

const activeProposals = new Map();

function generateProposalId() {
  return `prop_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function computeLineDiff(oldText = '', newText = '') {
  const oldLines = String(oldText || '').split('\n');
  const newLines = String(newText || '').split('\n');

  if (!oldText) {
    return newLines.slice(0, 150).map(line => ({ type: 'add', line }));
  }

  const diff = [];
  let i = 0;
  let j = 0;
  const maxDiff = 200;

  while ((i < oldLines.length || j < newLines.length) && diff.length < maxDiff) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      diff.push({ type: 'same', line: oldLines[i] });
      i++;
      j++;
    } else {
      if (i < oldLines.length && (j >= newLines.length || oldLines[i] !== newLines[j])) {
        diff.push({ type: 'remove', line: oldLines[i] });
        i++;
      }
      if (j < newLines.length && (i >= oldLines.length || oldLines[i - 1] !== newLines[j])) {
        diff.push({ type: 'add', line: newLines[j] });
        j++;
      }
    }
  }

  return diff;
}

function createProposal(projectPath, {
  type = 'create', // 'create' | 'update'
  subCategoryRelPath,
  relPath,
  title,
  content = '',
  tags = [],
  reason = ''
} = {}) {
  if (!projectPath) {
    throw new Error('Kein Projektordner angegeben.');
  }

  const proposalId = generateProposalId();
  let oldContent = '';
  let targetRelPath = relPath;

  if (type === 'create') {
    if (!subCategoryRelPath) {
      throw new Error('Für eine neue Notiz muss subCategoryRelPath angegeben werden.');
    }
    // Sichere Auflösung und 3-Ebenen-Prüfung (Tiefe 2)
    const targetDir = notesFs.resolveSafe(projectPath, subCategoryRelPath);
    if (notesFs.getDepth(subCategoryRelPath) !== 2) {
      throw new Error('Notizen können ausschließlich in einer Unterkategorie (Tiefe 2) angelegt werden.');
    }
    const cleanTitle = String(title || 'Neue Notiz').trim();
    targetRelPath = path.join(subCategoryRelPath, `${notesFs.sanitizeName(cleanTitle)}.md`);
  } else if (type === 'update') {
    if (!relPath) {
      throw new Error('Für die Bearbeitung einer Notiz muss relPath angegeben werden.');
    }
    const existing = notesFs.readNote(projectPath, relPath);
    oldContent = existing.body || '';
    if (!title) {
      title = existing.frontmatter?.title || path.basename(relPath, '.md');
    }
  } else {
    throw new Error(`Unbekannter Proposal-Typ: ${type}`);
  }

  const diff = computeLineDiff(oldContent, content);

  const proposal = {
    id: proposalId,
    type,
    projectPath: path.resolve(projectPath),
    subCategoryRelPath: subCategoryRelPath || null,
    relPath: targetRelPath,
    title: String(title || 'Notiz').trim(),
    content: String(content || ''),
    oldContent,
    diff,
    tags: Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean) : [],
    reason: String(reason || ''),
    createdAt: new Date().toISOString()
  };

  activeProposals.set(proposalId, proposal);
  return proposal;
}

function getProposal(proposalId) {
  return activeProposals.get(proposalId) || null;
}

function applyProposal(proposalId, currentProjectPath) {
  const proposal = activeProposals.get(proposalId);
  if (!proposal) {
    throw new Error('Der Änderungsvorschlag existiert nicht oder wurde bereits verarbeitet.');
  }

  const resolvedCurrent = path.resolve(currentProjectPath);
  if (proposal.projectPath !== resolvedCurrent) {
    throw new Error('Der Vorschlag gehört nicht zum aktuell geöffneten Wiki.');
  }

  let result;
  if (proposal.type === 'create') {
    result = notesFs.createNote(
      proposal.projectPath,
      proposal.subCategoryRelPath,
      proposal.title,
      proposal.content,
      {
        literalBody: true
      }
    );
    if (proposal.tags && proposal.tags.length > 0) {
      result = notesFs.writeNote(
        proposal.projectPath,
        result.relPath,
        proposal.content,
        { tags: proposal.tags }
      );
    }
  } else if (proposal.type === 'update') {
    result = notesFs.writeNote(
      proposal.projectPath,
      proposal.relPath,
      proposal.content,
      proposal.tags && proposal.tags.length > 0 ? { tags: proposal.tags } : null
    );
  }

  activeProposals.delete(proposalId);

  return {
    success: true,
    action: proposal.type === 'create' ? 'created' : 'updated',
    relPath: result.relPath,
    title: proposal.title
  };
}

function rejectProposal(proposalId) {
  const proposal = activeProposals.get(proposalId);
  if (proposal) {
    activeProposals.delete(proposalId);
    return { success: true, rejected: true, id: proposalId };
  }
  return { success: false, error: 'Vorschlag nicht gefunden.' };
}

function clearAllProposals() {
  activeProposals.clear();
}

module.exports = {
  createProposal,
  getProposal,
  applyProposal,
  rejectProposal,
  clearAllProposals,
  computeLineDiff
};
