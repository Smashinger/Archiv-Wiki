// main/ai-proposals.js — Verwaltet Änderungsvorschläge (Proposals) der KI
// Garantiert Human-in-the-Loop: Kein Schreibzugriff ohne explizite Nutzer-Bestätigung.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const notesFs = require('./notes-fs');
const { updateProjectConfig, migrateConfigPaths } = require('./project');

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

// KI-Block 3 (Kategorien umbenennen/verschieben/anordnen) — kleine, geteilte
// Helfer. Die eigentliche Struktur-/Existenzprüfung übernehmen weiterhin die
// bestehenden Funktionen aus notes-fs.js (resolveWikiEntrySafe, classifyEntry,
// renameEntry, moveEntry) — hier steht nur, was speziell für Proposals dazu-
// kommt: Betroffene-Notizen-Snapshot und Config-Migration.

// Alle Notiz-relPaths, die unterhalb (oder direkt in) einer Kategorie liegen —
// Grundlage für den Vorher-Snapshot und die Frischeprüfung vor der Übernahme.
function collectNoteRelPathsUnder(projectPath, folderRelPath) {
  const prefix = folderRelPath.endsWith('/') ? folderRelPath : `${folderRelPath}/`;
  return notesFs.getSearchDocuments(projectPath)
    .filter(doc => doc.relPath.startsWith(prefix))
    .map(doc => doc.relPath);
}

// Prüft unmittelbar vor der Übernahme, ob sich der Inhalt der betroffenen
// Kategorie seit der Vorschlagserstellung verändert hat — sowohl neue/
// entfernte Notizen (Pfad-Menge) als auch geänderter Inhalt/Frontmatter
// bereits bekannter Notizen (per notesFs.snapshotNotesForBatch(), derselbe
// Mechanismus wie bei den bestehenden Mehrfachauswahl-Batches, keine zweite
// Frischeprüfung).
function verifyAffectedNotesFreshness(proposal) {
  if (!Array.isArray(proposal.affectedSnapshot)) return;
  const currentRelPaths = collectNoteRelPathsUnder(proposal.projectPath, proposal.sourceRelPath).sort();
  const previousRelPaths = proposal.affectedSnapshot.map(entry => entry.relPath).sort();
  if (JSON.stringify(currentRelPaths) !== JSON.stringify(previousRelPaths)) {
    throw createStaleProposalError('Der Inhalt der Kategorie hat sich zwischenzeitlich geändert (Notizen wurden hinzugefügt oder entfernt). Der Vorschlag ist veraltet und kann nicht angewendet werden.');
  }
  const currentSnapshot = notesFs.snapshotNotesForBatch(proposal.projectPath, currentRelPaths);
  const previousByRelPath = new Map(proposal.affectedSnapshot.map(entry => [entry.relPath, entry]));
  for (const entry of currentSnapshot) {
    const previous = previousByRelPath.get(entry.relPath);
    if (!previous) continue;
    if (entry.bodyVersion !== previous.bodyVersion || entry.frontmatterFingerprint !== previous.frontmatterFingerprint) {
      throw createStaleProposalError('Eine Notiz in dieser Kategorie wurde zwischenzeitlich geändert. Der Vorschlag ist veraltet und kann nicht angewendet werden.');
    }
  }
}

// Dieselbe Konfigurationsmigration wie beim manuellen Umbenennen/Verschieben
// über die Seitenleiste (siehe syncConfigOnPathMutation() in
// main/filesystem-ipc.js) — KI-Proposals dürfen diese Migration nicht
// umgehen (Kategorie-Icons, sichtbare Reihenfolge, gemerkte Scrollpositionen
// usw.). Ein Fehler beim Config-Update macht die bereits erfolgte
// Dateisystem-Änderung bewusst nicht rückgängig (identisches Verhalten zum
// manuellen Weg).
function migrateProjectConfigPaths(projectPath, oldRelPath, newRelPath) {
  if (!oldRelPath || !newRelPath || oldRelPath === newRelPath) return;
  try {
    updateProjectConfig(projectPath, draft => {
      migrateConfigPaths(draft, oldRelPath, newRelPath);
    });
  } catch { /* Config-Update darf die bereits erfolgte Dateimutation nicht rückgängig machen */ }
}

function createProposal(projectPath, {
  type = 'create', // 'create' | 'update' | 'create_category' | 'move' | 'rename' | 'delete' | 'rename_category' | 'move_subcategory' | 'reorder_entries' | 'batch_update'
  subCategoryRelPath,
  relPath,
  title,
  content,
  tags = [],
  reason = '',
  name,
  parentCategoryRelPath,
  targetSubCategoryRelPath,
  newTitle,
  newName,
  targetMainCategoryRelPath,
  parentRelPath,
  orderedNames,
  items
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
  let proposalExtra = null; // KI-Block 3: siehe rename_category/move_subcategory/reorder_entries unten

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
  } else if (type === 'rename_category') {
    if (!relPath) {
      throw new Error('Für das Umbenennen einer Kategorie muss relPath angegeben werden.');
    }
    const cleanNewName = String(newName || '').trim();
    if (!cleanNewName) {
      throw new Error('Für das Umbenennen muss newName angegeben werden.');
    }
    const kind = notesFs.classifyEntry(projectPath, relPath);
    if (kind !== 'mainCategory' && kind !== 'subCategory') {
      throw new Error('Es kann nur eine Haupt- oder Unterkategorie umbenannt werden.');
    }
    const sanitized = notesFs.sanitizeName(cleanNewName);
    const parentDir = path.dirname(relPath);
    targetRelPath = parentDir === '.' ? sanitized : path.join(parentDir, sanitized);
    if (targetRelPath === relPath) {
      throw new Error('Der neue Name entspricht dem aktuellen Namen.');
    }
    const targetFullPath = notesFs.resolveWikiEntrySafe(projectPath, targetRelPath);
    if (fs.existsSync(targetFullPath)) {
      throw new Error('Am Zielort existiert bereits ein Eintrag mit diesem Namen.');
    }
    const oldName = path.basename(relPath);
    const kindLabel = kind === 'mainCategory' ? 'Hauptkategorie' : 'Unterkategorie';
    title = cleanNewName;
    const affectedRelPaths = collectNoteRelPathsUnder(projectPath, relPath);
    const affectedSnapshot = notesFs.snapshotNotesForBatch(projectPath, affectedRelPaths);
    computedDiff = [
      { type: 'remove', line: `- ${kindLabel}: ${oldName}` },
      { type: 'add', line: `+ ${kindLabel}: ${cleanNewName}` },
      { type: 'same', line: `  (${affectedRelPaths.length} betroffene ${affectedRelPaths.length === 1 ? 'Notiz' : 'Notizen'})` }
    ];
    proposalExtra = { affectedSnapshot, categoryKind: kind };
  } else if (type === 'move_subcategory') {
    if (!relPath) {
      throw new Error('Für das Verschieben muss relPath angegeben werden.');
    }
    const cleanTargetMain = String(targetMainCategoryRelPath || '').trim();
    if (!cleanTargetMain) {
      throw new Error('Für das Verschieben muss targetMainCategoryRelPath angegeben werden.');
    }
    const sourceKind = notesFs.classifyEntry(projectPath, relPath);
    if (sourceKind !== 'subCategory') {
      throw new Error('Es kann nur eine Unterkategorie verschoben werden, keine Hauptkategorie.');
    }
    const targetKind = notesFs.classifyEntry(projectPath, cleanTargetMain);
    if (targetKind !== 'mainCategory') {
      throw new Error('Unterkategorien können nur in eine Hauptkategorie verschoben werden.');
    }
    if (path.dirname(relPath) === cleanTargetMain) {
      throw new Error('Die Unterkategorie befindet sich bereits in dieser Hauptkategorie.');
    }
    const baseName = path.basename(relPath);
    targetRelPath = path.join(cleanTargetMain, baseName);
    const targetFullPath = notesFs.resolveWikiEntrySafe(projectPath, targetRelPath);
    if (fs.existsSync(targetFullPath)) {
      throw new Error('Am Zielort existiert bereits eine Unterkategorie mit diesem Namen.');
    }
    title = baseName;
    const affectedRelPaths = collectNoteRelPathsUnder(projectPath, relPath);
    const affectedSnapshot = notesFs.snapshotNotesForBatch(projectPath, affectedRelPaths);
    computedDiff = [
      { type: 'remove', line: `- ${relPath}` },
      { type: 'add', line: `+ ${targetRelPath}` },
      { type: 'same', line: `  (${affectedRelPaths.length} betroffene ${affectedRelPaths.length === 1 ? 'Notiz' : 'Notizen'})` }
    ];
    proposalExtra = { affectedSnapshot, targetMainCategoryRelPath: cleanTargetMain };
  } else if (type === 'reorder_entries') {
    const cleanParent = String(parentRelPath ?? '').trim();
    const parentFullPath = cleanParent
      ? notesFs.resolveWikiEntrySafe(projectPath, cleanParent)
      : notesFs.resolveWikiEntrySafe(projectPath, '.', { allowRoot: true });
    if (cleanParent && notesFs.classifyEntry(projectPath, cleanParent) !== 'mainCategory') {
      throw new Error('Eine eigene Reihenfolge kann nur für die Hauptkategorien selbst oder die Unterkategorien EINER Hauptkategorie festgelegt werden.');
    }
    if (!Array.isArray(orderedNames) || orderedNames.length === 0) {
      throw new Error('orderedNames darf nicht leer sein.');
    }
    const actualChildren = fs.readdirSync(parentFullPath, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => entry.name);
    const cleanNames = [...new Set(orderedNames.map(n => String(n).trim()).filter(Boolean))];
    const missing = cleanNames.filter(n => !actualChildren.includes(n));
    if (missing.length > 0) {
      throw new Error(`Folgende Einträge existieren hier nicht: ${missing.join(', ')}.`);
    }
    const notMentioned = actualChildren.filter(n => !cleanNames.includes(n));
    const finalOrder = [...cleanNames, ...notMentioned];
    targetRelPath = cleanParent;
    title = cleanParent ? path.basename(cleanParent) : 'Hauptkategorien';
    computedDiff = finalOrder.map((n, i) => ({
      type: cleanNames.includes(n) ? 'add' : 'same',
      line: `${i + 1}. ${n}`
    }));
    proposalExtra = {
      reorderParentRelPath: cleanParent,
      reorderOrderedNames: finalOrder,
      reorderKnownChildren: actualChildren.slice().sort()
    };
  } else if (type === 'batch_update') {
    // KI-Block 5 (Batch-Proposal für Inhaltsänderungen): EIN gemeinsamer
    // Vorschlag statt vieler einzelner propose_update_note-Aufrufe. Jede
    // Notiz bleibt beim Anwenden unabhängig (siehe applyProposal unten) —
    // hier nur Erstellung, Validierung pro Eintrag und Diff-Berechnung.
    // Bewusst NICHT unterstützt (Umfang von Block 5): Tag-Änderungen (dafür
    // weiterhin propose_update_note nutzen) und eine gebündelte
    // Reihenfolgeänderung (dafür weiterhin das eigenständige, bereits
    // getestete propose_reorder_entries aus Block 3 nutzen) — eine
    // Reihenfolge ist ein einzelner Config-Schreibvorgang, kein pro-Notiz
    // atomarer Vorgang, und passt daher nicht in dieselbe Anwenden-Schleife.
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Für einen Batch-Vorschlag muss items eine nicht-leere Liste sein.');
    }
    const seenRelPaths = new Set();
    const validItems = [];
    const warnings = [];
    for (const raw of items) {
      const itemRelPath = String(raw?.relPath || '').trim();
      try {
        if (!itemRelPath) throw new Error('relPath fehlt.');
        if (seenRelPaths.has(itemRelPath)) throw new Error('Doppelter Eintrag für dieselbe Notiz im selben Batch.');
        const hasContent = raw.newContent !== undefined && raw.newContent !== null;
        const hasTitle = typeof raw.newTitle === 'string' && raw.newTitle.trim().length > 0;
        const hasMove = typeof raw.targetSubCategoryRelPath === 'string' && raw.targetSubCategoryRelPath.trim().length > 0;
        if (!hasContent && !hasTitle && !hasMove) {
          throw new Error('Mindestens eine Änderung (Inhalt, Titel oder Zielkategorie) muss angegeben werden.');
        }
        if (hasContent) {
          if (String(raw.newContent).includes(' ')) throw new Error('Binäre Inhalte werden nicht unterstützt.');
          if (String(raw.newContent).length > MAX_CONTENT_LENGTH) {
            throw new Error(`Inhalt überschreitet die maximale Größe von ${Math.round(MAX_CONTENT_LENGTH / 1024)} KB.`);
          }
        }
        const kind = notesFs.classifyEntry(projectPath, itemRelPath);
        if (kind !== 'note') throw new Error('Nur einzelne Notizen können Teil eines Batch-Vorschlags sein.');

        const existing = notesFs.readNote(projectPath, itemRelPath);
        const oldContent = existing.body || '';
        const oldTitle = existing.frontmatter?.title || path.basename(itemRelPath, '.md');
        const cleanNewTitle = hasTitle ? raw.newTitle.trim() : null;
        const cleanTargetSub = hasMove ? raw.targetSubCategoryRelPath.trim() : null;

        let itemTargetRelPath = itemRelPath;
        if (hasMove) {
          notesFs.resolveWikiEntrySafe(projectPath, cleanTargetSub);
          if (notesFs.getDepth(cleanTargetSub) !== 2) throw new Error('Zielkategorie muss eine Unterkategorie sein.');
          itemTargetRelPath = path.join(cleanTargetSub, cleanNewTitle ? `${notesFs.sanitizeName(cleanNewTitle)}.md` : path.basename(itemRelPath));
        } else if (hasTitle) {
          itemTargetRelPath = path.join(path.dirname(itemRelPath), `${notesFs.sanitizeName(cleanNewTitle)}.md`);
        }
        if (itemTargetRelPath !== itemRelPath) {
          const itemTargetFullPath = notesFs.resolveWikiEntrySafe(projectPath, itemTargetRelPath);
          if (fs.existsSync(itemTargetFullPath)) throw new Error('Am Zielort existiert bereits eine Notiz mit diesem Namen.');
        }

        const finalItemContent = hasContent ? String(raw.newContent) : oldContent;
        const itemDiff = computeLineDiff(oldContent, finalItemContent);
        if (cleanNewTitle) itemDiff.push({ type: 'add', line: `Titel: „${oldTitle}“ → „${cleanNewTitle}“` });
        if (cleanTargetSub) itemDiff.push({ type: 'add', line: `Kategorie: „${itemRelPath}“ → „${itemTargetRelPath}“` });

        seenRelPaths.add(itemRelPath);
        validItems.push({
          relPath: itemRelPath,
          targetRelPath: itemTargetRelPath,
          title: oldTitle,
          newContent: hasContent ? finalItemContent : null,
          newTitle: cleanNewTitle,
          targetSubCategoryRelPath: cleanTargetSub,
          diff: itemDiff,
          baseVersion: existing.version,
          baseFrontmatterFingerprint: computeFrontmatterFingerprint(existing.frontmatter)
        });
      } catch (err) {
        warnings.push({ relPath: itemRelPath || '(unbekannt)', message: err.message });
      }
    }
    if (validItems.length === 0) {
      throw new Error('Keine der angegebenen Notizen konnte für den Batch-Vorschlag übernommen werden.');
    }
    title = `Batch-Änderung (${validItems.length} ${validItems.length === 1 ? 'Notiz' : 'Notizen'})`;
    proposalExtra = {
      items: validItems,
      warnings,
      counts: {
        total: validItems.length,
        contentChanges: validItems.filter(i => i.newContent !== null).length,
        renames: validItems.filter(i => i.newTitle !== null).length,
        moves: validItems.filter(i => i.targetSubCategoryRelPath !== null).length
      }
    };
    computedDiff = [];
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
    // KI-Block 3: nur bei rename_category/move_subcategory/reorder_entries
    // gesetzt (siehe proposalExtra in den jeweiligen Zweigen oben) — für alle
    // übrigen Typen bleiben es unauffällige null/undefined-Felder.
    affectedSnapshot: proposalExtra?.affectedSnapshot || null,
    targetMainCategoryRelPath: proposalExtra?.targetMainCategoryRelPath || null,
    reorderParentRelPath: proposalExtra?.reorderParentRelPath ?? null,
    reorderOrderedNames: proposalExtra?.reorderOrderedNames || null,
    reorderKnownChildren: proposalExtra?.reorderKnownChildren || null,
    // KI-Block 5 (Batch-Proposal): nur bei batch_update gesetzt.
    items: proposalExtra?.items || null,
    warnings: proposalExtra?.warnings || null,
    counts: proposalExtra?.counts || null,
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

function applyProposal(proposalId, currentProjectPath, options = {}) {
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
  } else if (proposal.type === 'rename_category') {
    const sourceFullPath = notesFs.resolveWikiEntrySafe(proposal.projectPath, proposal.sourceRelPath);
    if (!fs.existsSync(sourceFullPath) || !fs.statSync(sourceFullPath).isDirectory()) {
      throw createStaleProposalError('Die Kategorie existiert nicht mehr. Der Vorschlag ist veraltet und kann nicht angewendet werden.');
    }
    const targetFullPath = notesFs.resolveWikiEntrySafe(proposal.projectPath, proposal.relPath);
    if (fs.existsSync(targetFullPath)) {
      throw createStaleProposalError('Am Zielort existiert bereits ein Eintrag mit diesem Namen. Der Vorschlag ist veraltet und kann nicht angewendet werden.');
    }
    verifyAffectedNotesFreshness(proposal);
    result = notesFs.renameEntry(proposal.projectPath, proposal.sourceRelPath, proposal.title);
    migrateProjectConfigPaths(proposal.projectPath, proposal.sourceRelPath, result.relPath);
    activeProposals.delete(proposalId);
    return {
      success: true,
      action: 'renamed_category',
      oldRelPath: proposal.sourceRelPath,
      relPath: result.relPath,
      title: proposal.title
    };
  } else if (proposal.type === 'move_subcategory') {
    const sourceFullPath = notesFs.resolveWikiEntrySafe(proposal.projectPath, proposal.sourceRelPath);
    if (!fs.existsSync(sourceFullPath) || !fs.statSync(sourceFullPath).isDirectory()) {
      throw createStaleProposalError('Die Unterkategorie existiert nicht mehr. Der Vorschlag ist veraltet und kann nicht angewendet werden.');
    }
    const targetMainFullPath = notesFs.resolveWikiEntrySafe(proposal.projectPath, proposal.targetMainCategoryRelPath);
    if (!fs.existsSync(targetMainFullPath) || !fs.statSync(targetMainFullPath).isDirectory()) {
      throw createStaleProposalError('Die Ziel-Hauptkategorie existiert nicht mehr. Der Vorschlag ist veraltet und kann nicht angewendet werden.');
    }
    const targetFullPath = notesFs.resolveWikiEntrySafe(proposal.projectPath, proposal.relPath);
    if (fs.existsSync(targetFullPath)) {
      throw createStaleProposalError('Am Zielort existiert bereits eine Unterkategorie mit diesem Namen. Der Vorschlag ist veraltet und kann nicht angewendet werden.');
    }
    verifyAffectedNotesFreshness(proposal);
    result = notesFs.moveEntry(proposal.projectPath, proposal.sourceRelPath, proposal.targetMainCategoryRelPath);
    migrateProjectConfigPaths(proposal.projectPath, proposal.sourceRelPath, result.relPath);
    activeProposals.delete(proposalId);
    return {
      success: true,
      action: 'moved_subcategory',
      oldRelPath: proposal.sourceRelPath,
      relPath: result.relPath,
      title: proposal.title
    };
  } else if (proposal.type === 'reorder_entries') {
    const parentRelPath = proposal.reorderParentRelPath || '';
    const parentFullPath = parentRelPath
      ? notesFs.resolveWikiEntrySafe(proposal.projectPath, parentRelPath)
      : notesFs.resolveWikiEntrySafe(proposal.projectPath, '.', { allowRoot: true });
    if (!fs.existsSync(parentFullPath) || !fs.statSync(parentFullPath).isDirectory()) {
      throw createStaleProposalError('Die übergeordnete Kategorie existiert nicht mehr. Der Vorschlag ist veraltet und kann nicht angewendet werden.');
    }
    // Frischeprüfung: dieselbe Menge an Unterordnern wie beim Erstellen des
    // Vorschlags, sonst könnte eine seither umbenannte/gelöschte/neue
    // Kategorie eine veraltete Reihenfolge übernehmen.
    const currentChildren = fs.readdirSync(parentFullPath, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => entry.name)
      .sort();
    if (Array.isArray(proposal.reorderKnownChildren)
      && JSON.stringify(currentChildren) !== JSON.stringify(proposal.reorderKnownChildren)) {
      throw createStaleProposalError('Die Kategorien an dieser Stelle haben sich zwischenzeitlich geändert. Der Vorschlag ist veraltet und kann nicht angewendet werden.');
    }
    updateProjectConfig(proposal.projectPath, draft => {
      draft.childOrder = { ...(draft.childOrder || {}), [parentRelPath]: proposal.reorderOrderedNames };
    });
    activeProposals.delete(proposalId);
    return {
      success: true,
      action: 'reordered',
      relPath: parentRelPath,
      title: proposal.title
    };
  } else if (proposal.type === 'batch_update') {
    // KI-Block 5: jede Notiz wird unabhängig angewendet — ein Fehler oder ein
    // zwischenzeitlich veränderter Eintrag bei EINER Notiz darf die anderen
    // nicht verhindern (siehe Abschnitt "Anwendung" im Entwicklungsplan).
    // deselectedRelPaths kommt vom Renderer (Nutzer hat Notizen in der
    // Vorschau abgewählt) — dieselbe proposal.items-Liste, aber ohne erneute
    // Struktur-/Sicherheitsprüfung (die geschah bereits bei createProposal;
    // resolveWikiEntrySafe/notesFs.* prüfen bei der eigentlichen Anwendung
    // trotzdem erneut, siehe unten).
    const deselected = new Set(Array.isArray(options?.deselectedRelPaths) ? options.deselectedRelPaths : []);
    const results = [];
    const summary = { updated: 0, skippedStale: 0, failed: 0, deselected: 0 };
    for (const item of (proposal.items || [])) {
      if (deselected.has(item.relPath)) {
        results.push({ relPath: item.relPath, outcome: 'skipped_deselected' });
        summary.deselected++;
        continue;
      }
      try {
        // Wiederverwendet dieselbe Frischeprüfung wie bei Einzel-Proposals
        // (verifyProposalFreshness oben), nur pro Batch-Eintrag aufgerufen.
        verifyProposalFreshness({
          projectPath: proposal.projectPath,
          sourceRelPath: item.relPath,
          baseVersion: item.baseVersion,
          baseFrontmatterFingerprint: item.baseFrontmatterFingerprint
        });
        let currentRelPath = item.relPath;
        if (item.newContent !== null && item.newContent !== undefined) {
          notesFs.writeNote(proposal.projectPath, currentRelPath, item.newContent, null, item.baseVersion);
        }
        if (item.newTitle) {
          const renameTargetFullPath = notesFs.resolveWikiEntrySafe(
            proposal.projectPath,
            path.join(path.dirname(currentRelPath), `${notesFs.sanitizeName(item.newTitle)}.md`)
          );
          if (fs.existsSync(renameTargetFullPath)) {
            throw createStaleProposalError('Eine Notiz mit dem neuen Namen existiert bereits. Dieser Eintrag ist veraltet.');
          }
          const renameRes = notesFs.renameEntry(proposal.projectPath, currentRelPath, item.newTitle);
          currentRelPath = renameRes.relPath;
        }
        if (item.targetSubCategoryRelPath) {
          const targetDir = notesFs.resolveWikiEntrySafe(proposal.projectPath, item.targetSubCategoryRelPath);
          const moveTargetFullPath = path.join(targetDir, path.basename(currentRelPath));
          if (fs.existsSync(moveTargetFullPath)) {
            throw createStaleProposalError('Am Zielort existiert bereits eine Notiz mit diesem Namen. Dieser Eintrag ist veraltet.');
          }
          if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
          const moveRes = notesFs.moveEntry(proposal.projectPath, currentRelPath, item.targetSubCategoryRelPath);
          currentRelPath = moveRes.relPath;
        }
        results.push({ relPath: item.relPath, newRelPath: currentRelPath, outcome: 'updated' });
        summary.updated++;
      } catch (err) {
        if (err.code === 'AI_PROPOSAL_STALE') {
          results.push({ relPath: item.relPath, outcome: 'skipped_stale', error: err.message });
          summary.skippedStale++;
        } else {
          results.push({ relPath: item.relPath, outcome: 'failed', error: err.message });
          summary.failed++;
        }
      }
    }
    activeProposals.delete(proposalId);
    return {
      success: true,
      action: 'batch_update',
      title: proposal.title,
      results,
      summary
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
