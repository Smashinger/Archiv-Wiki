// main/ai-proposals.js — Verwaltet Änderungsvorschläge (Proposals) der KI
// Garantiert Human-in-the-Loop: Kein Schreibzugriff ohne explizite Nutzer-Bestätigung.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const notesFs = require('./notes-fs');

const activeProposals = new Map();
const MAX_ACTIVE_PROPOSALS = 50;
const PROPOSAL_TTL_MS = 60 * 60 * 1000; // 1 Stunde
const MAX_CONTENT_LENGTH = 500 * 1024; // 500 KB

function cleanupExpiredProposals(now = Date.now()) {
  for (const [id, proposal] of activeProposals.entries()) {
    if (now - (proposal.createdAtTimestamp || 0) > PROPOSAL_TTL_MS) {
      activeProposals.delete(id);
    }
  }
  while (activeProposals.size >= MAX_ACTIVE_PROPOSALS) {
    const oldestKey = activeProposals.keys().next().value;
    if (oldestKey) {
      activeProposals.delete(oldestKey);
    } else {
      break;
    }
  }
}

function generateProposalId() {
  return `prop_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function createStaleProposalError(message) {
  const err = new Error(message || 'Die Notiz wurde zwischenzeitlich geändert. Der Vorschlag ist veraltet und kann nicht angewendet werden.');
  err.code = 'AI_PROPOSAL_STALE';
  return err;
}

function computeFrontmatterFingerprint(frontmatter) {
  if (!frontmatter || typeof frontmatter !== 'object') return '';
  const sortedKeys = Object.keys(frontmatter).sort();
  const normalized = {};
  for (const key of sortedKeys) {
    normalized[key] = frontmatter[key];
  }
  return crypto.createHash('sha1').update(JSON.stringify(normalized)).digest('hex');
}

function verifyProposalFreshness(proposal) {
  const sourcePath = proposal.sourceRelPath || proposal.relPath;
  const fullPath = notesFs.resolveWikiEntrySafe(proposal.projectPath, sourcePath);
  if (!fs.existsSync(fullPath)) {
    throw createStaleProposalError('Die betroffene Notiz existiert nicht mehr. Der Vorschlag ist veraltet und kann nicht angewendet werden.');
  }
  const current = notesFs.readNote(proposal.projectPath, sourcePath);
  const currentFingerprint = computeFrontmatterFingerprint(current.frontmatter);
  if (proposal.baseVersion && current.version !== proposal.baseVersion) {
    throw createStaleProposalError('Der Inhalt der Notiz wurde zwischenzeitlich geändert. Der Vorschlag ist veraltet und kann nicht angewendet werden.');
  }
  if (proposal.baseFrontmatterFingerprint && currentFingerprint !== proposal.baseFrontmatterFingerprint) {
    throw createStaleProposalError('Die Metadaten der Notiz wurden zwischenzeitlich geändert. Der Vorschlag ist veraltet und kann nicht angewendet werden.');
  }
  return current;
}

function computeLineDiff(oldText = '', newText = '') {
  const cleanOld = String(oldText ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const cleanNew = String(newText ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  if (cleanOld.includes('\0') || cleanNew.includes('\0')) {
    throw new Error('Binäre Inhalte werden nicht unterstützt.');
  }

  if (!cleanOld) {
    const newLines = cleanNew.split('\n');
    const maxNew = 150;
    if (newLines.length <= maxNew) {
      return newLines.map(line => ({ type: 'add', line }));
    }
    const truncated = newLines.slice(0, maxNew).map(line => ({ type: 'add', line }));
    truncated.push({
      type: 'truncated',
      line: `… und ${newLines.length - maxNew} weitere Zeilen (insgesamt ${newLines.length} Zeilen)`
    });
    return truncated;
  }

  const oldLines = cleanOld.split('\n');
  const newLines = cleanNew.split('\n');

  let prefixEnd = 0;
  while (prefixEnd < oldLines.length && prefixEnd < newLines.length && oldLines[prefixEnd] === newLines[prefixEnd]) {
    prefixEnd++;
  }

  let oldSuffix = oldLines.length - 1;
  let newSuffix = newLines.length - 1;
  while (oldSuffix >= prefixEnd && newSuffix >= prefixEnd && oldLines[oldSuffix] === newLines[newSuffix]) {
    oldSuffix--;
    newSuffix--;
  }

  const prefix = oldLines.slice(0, prefixEnd).map(line => ({ type: 'same', line }));
  const suffix = oldLines.slice(oldSuffix + 1).map(line => ({ type: 'same', line }));

  const aMiddle = oldLines.slice(prefixEnd, oldSuffix + 1);
  const bMiddle = newLines.slice(prefixEnd, newSuffix + 1);

  const M = aMiddle.length;
  const N = bMiddle.length;

  let middleDiff = [];
  if (M === 0 && N === 0) {
    middleDiff = [];
  } else if (M === 0) {
    middleDiff = bMiddle.map(line => ({ type: 'add', line }));
  } else if (N === 0) {
    middleDiff = aMiddle.map(line => ({ type: 'remove', line }));
  } else if (M * N <= 250000) {
    const dp = Array.from({ length: M + 1 }, () => new Uint16Array(N + 1));
    for (let i = 0; i < M; i++) {
      for (let j = 0; j < N; j++) {
        if (aMiddle[i] === bMiddle[j]) {
          dp[i + 1][j + 1] = dp[i][j] + 1;
        } else {
          dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
    }
    let i = M;
    let j = N;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && aMiddle[i - 1] === bMiddle[j - 1]) {
        middleDiff.push({ type: 'same', line: aMiddle[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        middleDiff.push({ type: 'add', line: bMiddle[j - 1] });
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        middleDiff.push({ type: 'remove', line: aMiddle[i - 1] });
        i--;
      }
    }
    middleDiff.reverse();
  } else {
    middleDiff = [
      ...aMiddle.map(line => ({ type: 'remove', line })),
      ...bMiddle.map(line => ({ type: 'add', line }))
    ];
  }

  const fullDiff = [...prefix, ...middleDiff, ...suffix];
  const maxDiff = 200;
  if (fullDiff.length <= maxDiff) {
    return fullDiff;
  }

  // Stufenweise adaptive Faltung: Unveränderte Zeilen als Kontext einklappen,
  // sodass Änderungen (add/remove) stets sichtbar bleiben (M5).
  // Reduziert bei vielen Hunks schrittweise von 3 auf 1 bzw. 0 Kontextzeilen.
  function foldWithContext(contextLines) {
    const totalLen = fullDiff.length;
    const keep = new Uint8Array(totalLen);
    let hasChanges = false;

    for (let idx = 0; idx < totalLen; idx++) {
      if (fullDiff[idx].type !== 'same') {
        hasChanges = true;
        const start = Math.max(0, idx - contextLines);
        const end = Math.min(totalLen - 1, idx + contextLines);
        for (let k = start; k <= end; k++) {
          keep[k] = 1;
        }
      }
    }

    if (!hasChanges) {
      return [
        ...fullDiff.slice(0, Math.min(maxDiff, 10)),
        { type: 'truncated', line: `… (${totalLen - Math.min(maxDiff, 10)} unveränderte Zeilen)` }
      ];
    }

    const folded = [];
    let skipped = 0;

    for (let idx = 0; idx < totalLen; idx++) {
      if (keep[idx] === 1) {
        if (skipped > 0) {
          folded.push({
            type: 'truncated',
            line: `… (${skipped} unveränderte Zeilen übersprungen)`
          });
          skipped = 0;
        }
        folded.push(fullDiff[idx]);
      } else {
        skipped++;
      }
    }

    if (skipped > 0) {
      folded.push({
        type: 'truncated',
        line: `… (${skipped} unveränderte Zeilen übersprungen)`
      });
    }

    return folded;
  }

  // 1. Versuch: 3 Kontextzeilen
  let result = foldWithContext(3);
  if (result.length <= maxDiff) return result;

  // 2. Versuch: 1 Kontextzeile
  result = foldWithContext(1);
  if (result.length <= maxDiff) return result;

  // 3. Versuch: 0 Kontextzeilen (nur reine Änderungen)
  result = foldWithContext(0);
  if (result.length <= maxDiff) return result;

  // 4. Extremfall: Selbst ohne Kontext überschreiten die Änderungshunks das
  // Anzeigeziel. In diesem Fall darf keine tatsächliche Änderung verschwinden;
  // deshalb alle Änderungen und die Faltungsmarker vollständig zurückgeben.
  return result;
}

function createProposal(projectPath, {
  type = 'create', // 'create' | 'update' | 'create_category' | 'move' | 'rename' | 'delete'
  subCategoryRelPath,
  relPath,
  title,
  content,
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

  if (content !== undefined && content !== null) {
    if (typeof content === 'string') {
      if (content.includes('\0')) {
        throw new Error('Binäre Inhalte werden nicht unterstützt.');
      }
      if (content.length > MAX_CONTENT_LENGTH) {
        throw new Error(`Inhalt überschreitet die maximale Größe von ${Math.round(MAX_CONTENT_LENGTH / 1024)} KB.`);
      }
    }
  }

  cleanupExpiredProposals();
  const proposalId = generateProposalId();
  let baseVersion = null;
  let baseFrontmatterFingerprint = null;
  let oldContent = '';
  let targetRelPath = relPath;
  let computedDiff = null;

  if (type === 'create') {
    if (!subCategoryRelPath) {
      throw new Error('Für eine neue Notiz muss subCategoryRelPath angegeben werden.');
    }
    // Sichere Auflösung und 3-Ebenen-Prüfung (Tiefe 2)
    const targetDir = notesFs.resolveWikiEntrySafe(projectPath, subCategoryRelPath);
    if (notesFs.getDepth(subCategoryRelPath) !== 2) {
      throw new Error('Notizen können ausschließlich in einer Unterkategorie (Tiefe 2) angelegt werden.');
    }
    const cleanTitle = String(title || 'Neue Notiz').trim();
    targetRelPath = path.join(subCategoryRelPath, `${notesFs.sanitizeName(cleanTitle)}.md`);
    const finalContent = content ?? '';
    computedDiff = computeLineDiff('', finalContent);
    content = finalContent;
  } else if (type === 'update') {
    if (!relPath) {
      throw new Error('Für die Bearbeitung einer Notiz muss relPath angegeben werden.');
    }
    notesFs.resolveWikiEntrySafe(projectPath, relPath);
    const existing = notesFs.readNote(projectPath, relPath);
    baseVersion = existing.version;
    baseFrontmatterFingerprint = computeFrontmatterFingerprint(existing.frontmatter);
    oldContent = existing.body || '';
    if (!title) {
      title = existing.frontmatter?.title || path.basename(relPath, '.md');
    }
    const finalContent = (content !== undefined && content !== null) ? String(content) : oldContent;
    content = finalContent;
    if (finalContent === oldContent && Array.isArray(tags) && tags.length > 0) {
      computedDiff = [{ type: 'add', line: `+ Tags: ${tags.map(t => '#' + String(t).replace(/^#/, '')).join(' ')}` }];
    } else {
      computedDiff = computeLineDiff(oldContent, finalContent);
    }
  } else if (type === 'create_category') {
    const categoryName = String(name || '').trim();
    if (!categoryName) {
      throw new Error('Für eine neue Kategorie muss ein Name angegeben werden.');
    }
    if (parentCategoryRelPath) {
      const cleanParent = String(parentCategoryRelPath).trim();
      notesFs.resolveWikiEntrySafe(projectPath, cleanParent);
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
    notesFs.resolveWikiEntrySafe(projectPath, relPath);
    notesFs.resolveWikiEntrySafe(projectPath, cleanTarget);
    if (notesFs.getDepth(cleanTarget) !== 2) {
      throw new Error('Notizen können nur in eine Unterkategorie (Tiefe 2) verschoben werden.');
    }
    const existing = notesFs.readNote(projectPath, relPath);
    baseVersion = existing.version;
    baseFrontmatterFingerprint = computeFrontmatterFingerprint(existing.frontmatter);
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
    notesFs.resolveWikiEntrySafe(projectPath, relPath);
    const existing = notesFs.readNote(projectPath, relPath);
    baseVersion = existing.version;
    baseFrontmatterFingerprint = computeFrontmatterFingerprint(existing.frontmatter);
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
    notesFs.resolveWikiEntrySafe(projectPath, relPath);
    const existing = notesFs.readNote(projectPath, relPath);
    baseVersion = existing.version;
    baseFrontmatterFingerprint = computeFrontmatterFingerprint(existing.frontmatter);
    title = existing.frontmatter?.title || path.basename(relPath, '.md');
    targetRelPath = relPath;
    computedDiff = [
      { type: 'remove', line: `- [PAPIERKORB] ${relPath}` }
    ];
  } else {
    throw new Error(`Unbekannter Proposal-Typ: ${type}`);
  }

  const nowMs = Date.now();
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
    baseVersion,
    baseFrontmatterFingerprint,
    createdAt: new Date(nowMs).toISOString(),
    createdAtTimestamp: nowMs
  };

  activeProposals.set(proposalId, proposal);
  return proposal;
}

function getProposal(proposalId) {
  const proposal = activeProposals.get(proposalId);
  if (!proposal) return null;
  if (Date.now() - (proposal.createdAtTimestamp || 0) > PROPOSAL_TTL_MS) {
    activeProposals.delete(proposalId);
    return null;
  }
  return proposal;
}

function applyProposal(proposalId, currentProjectPath) {
  const proposal = activeProposals.get(proposalId);
  if (!proposal) {
    throw createStaleProposalError('Der Änderungsvorschlag existiert nicht oder wurde bereits verarbeitet.');
  }
  if (Date.now() - (proposal.createdAtTimestamp || 0) > PROPOSAL_TTL_MS) {
    activeProposals.delete(proposalId);
    throw createStaleProposalError('Der Vorschlag ist abgelaufen (TTL) und kann nicht mehr angewendet werden.');
  }

  const resolvedCurrent = path.resolve(currentProjectPath);
  if (proposal.projectPath !== resolvedCurrent) {
    throw new Error('Der Vorschlag gehört nicht zum aktuell geöffneten Wiki.');
  }

  let result;
  if (proposal.type === 'create') {
    const subCategoryDir = notesFs.resolveWikiEntrySafe(proposal.projectPath, proposal.subCategoryRelPath);
    if (notesFs.getDepth(proposal.subCategoryRelPath) !== 2) {
      throw new Error('Notizen können ausschließlich in einer Unterkategorie (Tiefe 2) angelegt werden.');
    }
    const targetFullPath = notesFs.resolveWikiEntrySafe(proposal.projectPath, proposal.relPath);
    if (fs.existsSync(targetFullPath)) {
      throw createStaleProposalError('Die Notiz existiert bereits. Der Vorschlag ist veraltet und kann nicht angewendet werden.');
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
        literalBody: true,
        tags: Array.isArray(proposal.tags) ? proposal.tags : []
      }
    );
    activeProposals.delete(proposalId);
    return {
      success: true,
      action: 'created',
      relPath: result.relPath,
      title: proposal.title
    };
  } else if (proposal.type === 'update') {
    verifyProposalFreshness(proposal);
    result = notesFs.writeNote(
      proposal.projectPath,
      proposal.relPath,
      proposal.content,
      proposal.tags && proposal.tags.length > 0 ? { tags: proposal.tags } : null,
      proposal.baseVersion
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
      const parentDir = notesFs.resolveWikiEntrySafe(proposal.projectPath, proposal.parentCategoryRelPath);
      if (!fs.existsSync(parentDir)) {
        throw createStaleProposalError('Die übergeordnete Kategorie existiert nicht mehr. Der Vorschlag ist veraltet und kann nicht angewendet werden.');
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
    verifyProposalFreshness(proposal);
    const targetDir = notesFs.resolveWikiEntrySafe(proposal.projectPath, proposal.targetSubCategoryRelPath);
    const targetFullPath = path.join(targetDir, path.basename(proposal.sourceRelPath));
    if (fs.existsSync(targetFullPath)) {
      throw createStaleProposalError('Am Zielort existiert bereits eine Notiz mit diesem Namen. Der Vorschlag ist veraltet und kann nicht angewendet werden.');
    }
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
    verifyProposalFreshness(proposal);
    const targetFullPath = notesFs.resolveWikiEntrySafe(proposal.projectPath, proposal.relPath);
    if (fs.existsSync(targetFullPath)) {
      throw createStaleProposalError('Eine Notiz mit dem neuen Namen existiert bereits. Der Vorschlag ist veraltet und kann nicht angewendet werden.');
    }
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
    verifyProposalFreshness(proposal);
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
  return {
    success: false,
    error: 'Vorschlag nicht gefunden oder bereits abgewickelt.',
    code: 'PROPOSAL_NOT_FOUND',
    category: 'proposal'
  };
}

function clearAllProposals() {
  activeProposals.clear();
}

function clearProposalsForProject(projectPath) {
  if (!projectPath) return;
  const resolved = path.resolve(projectPath);
  for (const [id, proposal] of activeProposals.entries()) {
    if (proposal.projectPath === resolved) {
      activeProposals.delete(id);
    }
  }
}

module.exports = {
  createProposal,
  getProposal,
  applyProposal,
  rejectProposal,
  clearAllProposals,
  clearProposalsForProject,
  computeLineDiff,
  computeFrontmatterFingerprint,
  createStaleProposalError,
  MAX_ACTIVE_PROPOSALS,
  PROPOSAL_TTL_MS,
  MAX_CONTENT_LENGTH
};
