// main/ai-proposals.js — Verwaltet Änderungsvorschläge (Proposals) der KI
// Garantiert Human-in-the-Loop: Kein Schreibzugriff ohne explizite Nutzer-Bestätigung.

'use strict';

const fs = require('fs');
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
  type = 'create', // 'create' | 'update' | 'create_category' | 'move' | 'rename' | 'delete'
  subCategoryRelPath,
  relPath,
  title,
  content = '',
  tags = [],
  reason = '',
  name,
  parentCategoryRelPath,
  targetSubCategoryRelPath,
  newTitle
} = {}) {
  if (!projectPath) {
    throw new Error('Kein Projektordner angegeben.');
  }

  const proposalId = generateProposalId();
  let oldContent = '';
  let targetRelPath = relPath;
  let computedDiff = null;

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
    computedDiff = computeLineDiff('', content);
  } else if (type === 'update') {
    if (!relPath) {
      throw new Error('Für die Bearbeitung einer Notiz muss relPath angegeben werden.');
    }
    notesFs.resolveSafe(projectPath, relPath);
    const existing = notesFs.readNote(projectPath, relPath);
    oldContent = existing.body || '';
    if (!title) {
      title = existing.frontmatter?.title || path.basename(relPath, '.md');
    }
    computedDiff = computeLineDiff(oldContent, content);
  } else if (type === 'create_category') {
    const categoryName = String(name || '').trim();
    if (!categoryName) {
      throw new Error('Für eine neue Kategorie muss ein Name angegeben werden.');
    }
    if (parentCategoryRelPath) {
      const cleanParent = String(parentCategoryRelPath).trim();
      notesFs.resolveSafe(projectPath, cleanParent);
      if (notesFs.getDepth(cleanParent) !== 1) {
        throw new Error('Unterkategorien können nur in einer Hauptkategorie (Tiefe 1) angelegt werden.');
      }
      targetRelPath = path.join(cleanParent, notesFs.sanitizeName(categoryName));
    } else {
      targetRelPath = notesFs.sanitizeName(categoryName);
    }
    title = categoryName;
    computedDiff = [{ type: 'add', line: `+ Kategorie: ${targetRelPath}` }];
  } else if (type === 'move') {
    if (!relPath) {
      throw new Error('Für das Verschieben muss relPath angegeben werden.');
    }
    if (!targetSubCategoryRelPath) {
      throw new Error('Für das Verschieben muss targetSubCategoryRelPath angegeben werden.');
    }
    const cleanTarget = String(targetSubCategoryRelPath).trim();
    notesFs.resolveSafe(projectPath, relPath);
    notesFs.resolveSafe(projectPath, cleanTarget);
    if (notesFs.getDepth(cleanTarget) !== 2) {
      throw new Error('Notizen können nur in eine Unterkategorie (Tiefe 2) verschoben werden.');
    }
    const existing = notesFs.readNote(projectPath, relPath);
    title = existing.frontmatter?.title || path.basename(relPath, '.md');
    targetRelPath = path.join(cleanTarget, path.basename(relPath));
    computedDiff = [
      { type: 'remove', line: `- ${relPath}` },
      { type: 'add', line: `+ ${targetRelPath}` }
    ];
  } else if (type === 'rename') {
    if (!relPath) {
      throw new Error('Für das Umbenennen muss relPath angegeben werden.');
    }
    const cleanNewTitle = String(newTitle || '').trim();
    if (!cleanNewTitle) {
      throw new Error('Für das Umbenennen muss newTitle angegeben werden.');
    }
    notesFs.resolveSafe(projectPath, relPath);
    const existing = notesFs.readNote(projectPath, relPath);
    const oldTitle = existing.frontmatter?.title || path.basename(relPath, '.md');
    title = cleanNewTitle;
    targetRelPath = path.join(path.dirname(relPath), `${notesFs.sanitizeName(cleanNewTitle)}.md`);
    computedDiff = [
      { type: 'remove', line: `- Titel: ${oldTitle}` },
      { type: 'add', line: `+ Titel: ${cleanNewTitle}` }
    ];
  } else if (type === 'delete') {
    if (!relPath) {
      throw new Error('Für das Löschen muss relPath angegeben werden.');
    }
    notesFs.resolveSafe(projectPath, relPath);
    const existing = notesFs.readNote(projectPath, relPath);
    title = existing.frontmatter?.title || path.basename(relPath, '.md');
    targetRelPath = relPath;
    computedDiff = [
      { type: 'remove', line: `- [PAPIERKORB] ${relPath}` }
    ];
  } else {
    throw new Error(`Unbekannter Proposal-Typ: ${type}`);
  }

  const proposal = {
    id: proposalId,
    type,
    projectPath: path.resolve(projectPath),
    sourceRelPath: relPath || null,
    subCategoryRelPath: subCategoryRelPath || null,
    relPath: targetRelPath,
    targetRelPath: targetRelPath || null,
    title: String(title || name || 'Notiz').trim(),
    content: String(content || ''),
    oldContent,
    diff: computedDiff || [],
    tags: Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean) : [],
    reason: String(reason || ''),
    name: name || null,
    parentCategoryRelPath: parentCategoryRelPath || null,
    targetSubCategoryRelPath: targetSubCategoryRelPath || null,
    newTitle: newTitle || null,
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
    const subCategoryDir = notesFs.resolveSafe(proposal.projectPath, proposal.subCategoryRelPath);
    if (notesFs.getDepth(proposal.subCategoryRelPath) !== 2) {
      throw new Error('Notizen können ausschließlich in einer Unterkategorie (Tiefe 2) angelegt werden.');
    }
    if (!fs.existsSync(subCategoryDir)) {
      fs.mkdirSync(subCategoryDir, { recursive: true });
    }
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
    activeProposals.delete(proposalId);
    return {
      success: true,
      action: 'created',
      relPath: result.relPath,
      title: proposal.title
    };
  } else if (proposal.type === 'update') {
    result = notesFs.writeNote(
      proposal.projectPath,
      proposal.relPath,
      proposal.content,
      proposal.tags && proposal.tags.length > 0 ? { tags: proposal.tags } : null
    );
    activeProposals.delete(proposalId);
    return {
      success: true,
      action: 'updated',
      relPath: result.relPath,
      title: proposal.title
    };
  } else if (proposal.type === 'create_category') {
    if (proposal.parentCategoryRelPath) {
      const parentDir = notesFs.resolveSafe(proposal.projectPath, proposal.parentCategoryRelPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      result = notesFs.createSubCategory(proposal.projectPath, proposal.parentCategoryRelPath, proposal.name);
    } else {
      result = notesFs.createMainCategory(proposal.projectPath, proposal.name);
    }
    activeProposals.delete(proposalId);
    return {
      success: true,
      action: 'created_category',
      relPath: result.relPath,
      name: result.name
    };
  } else if (proposal.type === 'move') {
    const targetDir = notesFs.resolveSafe(proposal.projectPath, proposal.targetSubCategoryRelPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    result = notesFs.moveEntry(proposal.projectPath, proposal.sourceRelPath, proposal.targetSubCategoryRelPath);
    activeProposals.delete(proposalId);
    return {
      success: true,
      action: 'moved',
      oldRelPath: proposal.sourceRelPath,
      relPath: result.relPath,
      title: proposal.title
    };
  } else if (proposal.type === 'rename') {
    result = notesFs.renameEntry(proposal.projectPath, proposal.sourceRelPath, proposal.newTitle);
    activeProposals.delete(proposalId);
    return {
      success: true,
      action: 'renamed',
      oldRelPath: proposal.sourceRelPath,
      relPath: result.relPath,
      title: proposal.newTitle
    };
  } else if (proposal.type === 'delete') {
    result = notesFs.deleteEntry(proposal.projectPath, proposal.sourceRelPath || proposal.relPath);
    activeProposals.delete(proposalId);
    return {
      success: true,
      action: 'deleted',
      relPath: proposal.sourceRelPath || proposal.relPath,
      trashRelPath: result.trashRelPath,
      title: proposal.title
    };
  }
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
