// main/backup.js
// Zentrale Backup-Logik für automatische, manuelle und über das Tray
// gestartete Sicherungen. Intervall, Status und Sperre gelten pro geöffnetem
// Projekt; die eigentliche Archivierung wird mit der Export-Funktion geteilt.
'use strict';

const fs = require('fs');
const path = require('path');
const { zipProjectTo } = require('./export-ipc');
const { readAppState, writeAppState } = require('./app-state');

const BACKUP_FILENAME_RE = /^backup-(\d{4}-\d{2}-\d{2})\.zip$/;
const BACKUP_TEMP_FILENAME_RE = /^backup-\d{4}-\d{2}-\d{2}\.zip\.tmp-\d+$/;
const DEFAULT_KEEP_COUNT = 14;
const BACKUP_QUIT_GRACE_MS = 30000;

function projectStatusKey(projectPath) {
  return path.resolve(projectPath || '');
}

function readProjectBackupStatus(projectPath) {
  if (!projectPath) return {};
  const state = readAppState();
  const all = state.backupStatusByProject && typeof state.backupStatusByProject === 'object'
    ? state.backupStatusByProject
    : {};
  return all[projectStatusKey(projectPath)] || {};
}

function writeProjectBackupStatus(projectPath, patch) {
  if (!projectPath) return {};
  const state = readAppState();
  const all = state.backupStatusByProject && typeof state.backupStatusByProject === 'object'
    ? state.backupStatusByProject
    : {};
  const key = projectStatusKey(projectPath);
  const nextStatus = { ...(all[key] || {}), ...patch };
  writeAppState({ backupStatusByProject: { ...all, [key]: nextStatus } });
  return nextStatus;
}

function backupFileNameFor(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `backup-${yyyy}-${mm}-${dd}.zip`;
}

function createBackupError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function backupUserMessage(code) {
  const messages = {
    ENOENT: 'Der Backup-Ordner wurde nicht gefunden.',
    EACCES: 'Archiv-Wiki hat keine Schreibberechtigung für den Backup-Ordner.',
    EPERM: 'Archiv-Wiki hat keine Schreibberechtigung für den Backup-Ordner.',
    ENOSPC: 'Auf dem Ziellaufwerk ist nicht genügend Speicherplatz verfügbar.',
    EBUSY: 'Eine benötigte Datei wird gerade von einem anderen Programm verwendet.',
    ENOTDIR: 'Der ausgewählte Backup-Pfad ist kein Ordner.',
    EROFS: 'Das Ziellaufwerk ist schreibgeschützt.',
    BACKUP_PATH_INSIDE_PROJECT: 'Der Backup-Ordner darf nicht im Wiki-Ordner liegen.',
    BACKUP_ZIP_INVALID: 'Das erstellte Backup war beschädigt und wurde nicht übernommen.',
    BACKUP_ZIP_UNSUPPORTED: 'Das erstellte Backup verwendet ein nicht unterstütztes ZIP-Format.',
    BACKUP_ABORTED: 'Das Backup wurde beim Beenden kontrolliert abgebrochen.',
    BACKUP_PATH_MISSING: 'Es wurde kein Backup-Ordner ausgewählt.',
    BACKUP_PATH_INVALID: 'Der Backup-Ordner ist nicht verwendbar.'
  };
  return messages[code] || 'Das Backup konnte nicht erstellt werden.';
}

// Liefert auch für noch nicht existierende Zielordner einen kanonischen Pfad:
// Der nächste existierende Elternordner wird per realpath aufgelöst und der
// fehlende Rest anschließend wieder angehängt. Damit werden auch Symlinks in
// bereits existierenden Elternpfaden zuverlässig berücksichtigt.
function canonicalPath(targetPath) {
  let resolved = path.resolve(targetPath);
  const missingSegments = [];
  let existing = resolved;

  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    missingSegments.unshift(path.basename(existing));
    existing = parent;
  }

  if (fs.existsSync(existing)) {
    const realExisting = fs.realpathSync.native
      ? fs.realpathSync.native(existing)
      : fs.realpathSync(existing);
    resolved = path.join(realExisting, ...missingSegments);
  }

  return path.normalize(resolved);
}

function validateBackupDestination(projectPath, backupPath) {
  const projectRoot = canonicalPath(projectPath);
  const backupRoot = canonicalPath(backupPath);
  const relative = path.relative(projectRoot, backupRoot);
  const isSamePath = relative === '';
  const isInsideProject = !isSamePath && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);

  if (isSamePath || isInsideProject) {
    throw createBackupError(
      'Der Backup-Ordner darf nicht mit dem Wiki-Ordner identisch sein oder innerhalb des Wiki-Ordners liegen.',
      'BACKUP_PATH_INSIDE_PROJECT'
    );
  }

  return { projectRoot, backupRoot };
}

// Entfernt ausschließlich eindeutig von Archiv-Wiki angelegte, unvollständige
// Temp-Dateien. Normale ZIP-Dateien und fremde Dateien bleiben unangetastet.

function validateBackupDestinationAccess(projectPath, backupPath) {
  try {
    if (!backupPath || typeof backupPath !== 'string') {
      throw createBackupError('Es wurde kein Backup-Ordner ausgewählt.', 'BACKUP_PATH_MISSING');
    }

    const { backupRoot } = validateBackupDestination(projectPath, backupPath);
    fs.mkdirSync(backupRoot, { recursive: true });

    const stat = fs.statSync(backupRoot);
    if (!stat.isDirectory()) {
      throw createBackupError('Der ausgewählte Backup-Pfad ist kein Ordner.', 'ENOTDIR');
    }

    const probeName = `.archiv-wiki-write-test-${process.pid}-${Date.now()}`;
    const probePath = path.join(backupRoot, probeName);
    let created = false;
    try {
      fs.writeFileSync(probePath, 'Archiv-Wiki Schreibtest', { flag: 'wx' });
      created = true;
    } finally {
      if (created) {
        try { fs.unlinkSync(probePath); } catch {}
      }
    }

    return { valid: true, path: backupRoot, message: 'Backup-Ordner verfügbar' };
  } catch (error) {
    const code = error?.code || 'BACKUP_PATH_INVALID';
    return {
      valid: false,
      code,
      message: backupUserMessage(code),
      details: error?.message || 'Der Backup-Ordner ist nicht verwendbar.'
    };
  }
}

function cleanupStaleBackupTemps(backupPath) {
  const errors = [];
  let files;
  try {
    files = fs.readdirSync(backupPath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('[Archiv Wiki] Temporäre Backup-Dateien konnten nicht geprüft werden:', err.message);
      errors.push(err);
    }
    return errors;
  }

  for (const fileName of files) {
    if (!BACKUP_TEMP_FILENAME_RE.test(fileName)) continue;
    try {
      fs.unlinkSync(path.join(backupPath, fileName));
    } catch (err) {
      console.error(`[Archiv Wiki] Veraltete Backup-Temp-Datei konnte nicht gelöscht werden (${fileName}):`, err.message);
      errors.push(err);
    }
  }
  return errors;
}

// Löscht die ältesten Backups, wenn mehr als keepCount vorhanden sind.
// Fehler beim Aufräumen ändern den erfolgreichen Zustand des neuen Snapshots
// nicht; sie werden separat zurückgegeben und später getrennt gespeichert.
function pruneOldBackups(backupPath, keepCount = DEFAULT_KEEP_COUNT) {
  const errors = [];
  let files;
  try {
    files = fs.readdirSync(backupPath).filter(f => BACKUP_FILENAME_RE.test(f)).sort();
  } catch (err) {
    console.error('[Archiv Wiki] Backup-Aufbewahrung konnte nicht geprüft werden:', err.message);
    errors.push({ fileName: null, error: err });
    return errors;
  }

  const excess = files.length - keepCount;
  if (excess <= 0) return errors;

  for (const fileName of files.slice(0, excess)) {
    try {
      fs.unlinkSync(path.join(backupPath, fileName));
    } catch (err) {
      console.error(`[Archiv Wiki] Altes Backup konnte nicht gelöscht werden (${fileName}):`, err.message);
      errors.push({ fileName, error: err });
    }
  }
  return errors;
}

function latestBackupDate(backupPath) {
  let files;
  try {
    files = fs.readdirSync(backupPath).filter(f => BACKUP_FILENAME_RE.test(f)).sort();
  } catch {
    return null;
  }
  if (files.length === 0) return null;
  const match = files[files.length - 1].match(BACKUP_FILENAME_RE);
  return new Date(match[1]);
}

function readUInt64LEAsNumber(buffer, offset, label) {
  const value = buffer.readBigUInt64LE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw createBackupError(`ZIP-Struktur ist für ${label} zu groß.`, 'BACKUP_ZIP_UNSUPPORTED');
  }
  return Number(value);
}

async function readExactly(fileHandle, length, position) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await fileHandle.read(buffer, 0, length, position);
  if (bytesRead !== length) {
    throw createBackupError('Das Backup-Archiv ist unvollständig.', 'BACKUP_ZIP_INVALID');
  }
  return buffer;
}

function findEndOfCentralDirectory(tail) {
  for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
    if (tail.readUInt32LE(offset) !== 0x06054b50) continue;
    const commentLength = tail.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === tail.length) return offset;
  }
  return -1;
}

function parseZip64Extra(extra, needs) {
  let offset = 0;
  while (offset + 4 <= extra.length) {
    const headerId = extra.readUInt16LE(offset);
    const dataSize = extra.readUInt16LE(offset + 2);
    const dataStart = offset + 4;
    const dataEnd = dataStart + dataSize;
    if (dataEnd > extra.length) break;

    if (headerId === 0x0001) {
      let cursor = dataStart;
      const result = {};
      for (const field of ['uncompressedSize', 'compressedSize', 'localHeaderOffset', 'diskStart']) {
        if (!needs[field]) continue;
        const size = field === 'diskStart' ? 4 : 8;
        if (cursor + size > dataEnd) {
          throw createBackupError('Die ZIP64-Zusatzdaten sind unvollständig.', 'BACKUP_ZIP_INVALID');
        }
        result[field] = size === 8
          ? readUInt64LEAsNumber(extra, cursor, field)
          : extra.readUInt32LE(cursor);
        cursor += size;
      }
      return result;
    }
    offset = dataEnd;
  }
  throw createBackupError('Erforderliche ZIP64-Zusatzdaten fehlen.', 'BACKUP_ZIP_INVALID');
}

// Prüft die tatsächliche ZIP-Struktur: Abschlussdatensatz, zentrales
// Verzeichnis und alle referenzierten lokalen Dateiköpfe. Eine reine
// Dateigrößenprüfung reicht ausdrücklich nicht aus.
async function validateZipArchive(zipPath) {
  const fileHandle = await fs.promises.open(zipPath, 'r');
  try {
    const stat = await fileHandle.stat();
    if (stat.size < 22) {
      throw createBackupError('Das Backup-Archiv ist unvollständig.', 'BACKUP_ZIP_INVALID');
    }

    const tailLength = Math.min(stat.size, 22 + 0xffff);
    const tailStart = stat.size - tailLength;
    const tail = await readExactly(fileHandle, tailLength, tailStart);
    const eocdOffsetInTail = findEndOfCentralDirectory(tail);
    if (eocdOffsetInTail < 0) {
      throw createBackupError('Das Backup-Archiv besitzt keinen gültigen ZIP-Abschluss.', 'BACKUP_ZIP_INVALID');
    }

    const eocd = tail.subarray(eocdOffsetInTail, eocdOffsetInTail + 22);
    let totalEntries = eocd.readUInt16LE(10);
    let centralSize = eocd.readUInt32LE(12);
    let centralOffset = eocd.readUInt32LE(16);
    const diskNumber = eocd.readUInt16LE(4);
    const centralDisk = eocd.readUInt16LE(6);

    if (diskNumber !== 0 || centralDisk !== 0) {
      throw createBackupError('Mehrteilige ZIP-Archive werden für Backups nicht unterstützt.', 'BACKUP_ZIP_UNSUPPORTED');
    }

    if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
      const eocdAbsolute = tailStart + eocdOffsetInTail;
      if (eocdAbsolute < 20) {
        throw createBackupError('Die ZIP64-Struktur ist unvollständig.', 'BACKUP_ZIP_INVALID');
      }
      const locator = await readExactly(fileHandle, 20, eocdAbsolute - 20);
      if (locator.readUInt32LE(0) !== 0x07064b50) {
        throw createBackupError('Der ZIP64-Locator fehlt.', 'BACKUP_ZIP_INVALID');
      }
      const zip64Offset = readUInt64LEAsNumber(locator, 8, 'ZIP64-Verzeichnis');
      const zip64Header = await readExactly(fileHandle, 56, zip64Offset);
      if (zip64Header.readUInt32LE(0) !== 0x06064b50) {
        throw createBackupError('Der ZIP64-Abschluss ist ungültig.', 'BACKUP_ZIP_INVALID');
      }
      if (zip64Header.readUInt32LE(16) !== 0 || zip64Header.readUInt32LE(20) !== 0) {
        throw createBackupError('Mehrteilige ZIP64-Archive werden nicht unterstützt.', 'BACKUP_ZIP_UNSUPPORTED');
      }
      totalEntries = readUInt64LEAsNumber(zip64Header, 32, 'Eintragszahl');
      centralSize = readUInt64LEAsNumber(zip64Header, 40, 'Größe des zentralen Verzeichnisses');
      centralOffset = readUInt64LEAsNumber(zip64Header, 48, 'Position des zentralen Verzeichnisses');
    }

    const centralEnd = centralOffset + centralSize;
    if (centralOffset < 0 || centralEnd > stat.size || centralEnd < centralOffset) {
      throw createBackupError('Das zentrale ZIP-Verzeichnis liegt außerhalb der Datei.', 'BACKUP_ZIP_INVALID');
    }

    let cursor = centralOffset;
    let entriesRead = 0;
    while (cursor < centralEnd) {
      const header = await readExactly(fileHandle, 46, cursor);
      if (header.readUInt32LE(0) !== 0x02014b50) {
        throw createBackupError('Das zentrale ZIP-Verzeichnis ist beschädigt.', 'BACKUP_ZIP_INVALID');
      }

      let compressedSize = header.readUInt32LE(20);
      let uncompressedSize = header.readUInt32LE(24);
      const fileNameLength = header.readUInt16LE(28);
      const extraLength = header.readUInt16LE(30);
      const commentLength = header.readUInt16LE(32);
      let diskStart = header.readUInt16LE(34);
      let localHeaderOffset = header.readUInt32LE(42);
      const entryLength = 46 + fileNameLength + extraLength + commentLength;

      if (cursor + entryLength > centralEnd) {
        throw createBackupError('Ein Eintrag im zentralen ZIP-Verzeichnis ist unvollständig.', 'BACKUP_ZIP_INVALID');
      }

      const variable = await readExactly(fileHandle, fileNameLength + extraLength, cursor + 46);
      const centralFileName = variable.subarray(0, fileNameLength);
      const extra = variable.subarray(fileNameLength);
      const needsZip64 = {
        uncompressedSize: uncompressedSize === 0xffffffff,
        compressedSize: compressedSize === 0xffffffff,
        localHeaderOffset: localHeaderOffset === 0xffffffff,
        diskStart: diskStart === 0xffff
      };
      if (Object.values(needsZip64).some(Boolean)) {
        const zip64 = parseZip64Extra(extra, needsZip64);
        if (needsZip64.uncompressedSize) uncompressedSize = zip64.uncompressedSize;
        if (needsZip64.compressedSize) compressedSize = zip64.compressedSize;
        if (needsZip64.localHeaderOffset) localHeaderOffset = zip64.localHeaderOffset;
        if (needsZip64.diskStart) diskStart = zip64.diskStart;
      }
      if (diskStart !== 0) {
        throw createBackupError('Mehrteilige ZIP-Einträge werden nicht unterstützt.', 'BACKUP_ZIP_UNSUPPORTED');
      }

      const localHeader = await readExactly(fileHandle, 30, localHeaderOffset);
      if (localHeader.readUInt32LE(0) !== 0x04034b50) {
        throw createBackupError('Ein lokaler ZIP-Dateikopf fehlt oder ist beschädigt.', 'BACKUP_ZIP_INVALID');
      }
      const localNameLength = localHeader.readUInt16LE(26);
      const localExtraLength = localHeader.readUInt16LE(28);
      const localFileName = await readExactly(fileHandle, localNameLength, localHeaderOffset + 30);
      if (!localFileName.equals(centralFileName)) {
        throw createBackupError('Dateiname im ZIP-Verzeichnis und Dateikopf stimmen nicht überein.', 'BACKUP_ZIP_INVALID');
      }
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const dataEnd = dataStart + compressedSize;
      if (dataStart < 0 || dataEnd > centralOffset || dataEnd < dataStart) {
        throw createBackupError('Ein ZIP-Dateieintrag liegt außerhalb des gültigen Datenbereichs.', 'BACKUP_ZIP_INVALID');
      }

      entriesRead += 1;
      cursor += entryLength;
    }

    if (cursor !== centralEnd || entriesRead !== totalEntries) {
      throw createBackupError('Die Anzahl oder Länge der ZIP-Einträge ist inkonsistent.', 'BACKUP_ZIP_INVALID');
    }

    return { valid: true, entries: entriesRead };
  } finally {
    await fileHandle.close();
  }
}

let backupInProgress = false;
let activeBackupPromise = null;
let activeBackupAbortController = null;
function isBackupInProgress() { return backupInProgress; }

async function maybeRunAutoBackup({ getCurrentProject }, force = false) {
  if (backupInProgress) return { started: false, reason: 'busy' };

  const project = getCurrentProject();
  const projectPath = project?.path;
  const backupPath = project?.config?.backupPath;
  const intervalDays = project?.config?.backupIntervalDays ?? 1;
  if (!projectPath || !backupPath) return { started: false, reason: 'not-configured' };
  if (!force && intervalDays <= 0) return { started: false, reason: 'disabled' };

  if (!force) {
    const lastDate = latestBackupDate(backupPath);
    if (lastDate) {
      const daysSinceLast = (Date.now() - lastDate.getTime()) / 86400000;
      if (daysSinceLast < intervalDays) return { started: false, reason: 'not-due' };
    }
  }

  const destPath = path.join(backupPath, backupFileNameFor(new Date()));
  if (!force && fs.existsSync(destPath)) return { started: false, reason: 'already-created' };
  const tempPath = `${destPath}.tmp-${process.pid}`;
  const abortController = new AbortController();

  backupInProgress = true;
  activeBackupAbortController = abortController;
  const operation = (async () => {
    try {
      validateBackupDestination(projectPath, backupPath);
      fs.mkdirSync(backupPath, { recursive: true });
      cleanupStaleBackupTemps(backupPath);

      await zipProjectTo(projectPath, tempPath, { signal: abortController.signal });
      if (abortController.signal.aborted) {
        throw createBackupError('Das Backup wurde beim Beenden kontrolliert abgebrochen.', 'BACKUP_ABORTED');
      }

      await validateZipArchive(tempPath);
      if (abortController.signal.aborted) {
        throw createBackupError('Das Backup wurde beim Beenden kontrolliert abgebrochen.', 'BACKUP_ABORTED');
      }

      fs.renameSync(tempPath, destPath);
      const pruneErrors = pruneOldBackups(backupPath);
      const firstPruneError = pruneErrors[0]?.error || null;
      const status = writeProjectBackupStatus(projectPath, {
        consecutiveFailures: 0,
        lastSuccessAt: new Date().toISOString(),
        lastErrorAt: null,
        lastErrorMessage: null,
        lastErrorCode: null,
        lastErrorUserMessage: null,
        lastCleanupErrorAt: firstPruneError ? new Date().toISOString() : null,
        lastCleanupErrorMessage: firstPruneError
          ? `${firstPruneError.message}${pruneErrors.length > 1 ? ` (${pruneErrors.length} Aufräumfehler)` : ''}`
          : null,
        lastCleanupErrorCode: firstPruneError?.code || null,
        lastCleanupErrorUserMessage: firstPruneError
          ? 'Das neue Backup wurde erstellt, aber ältere Sicherungen konnten nicht vollständig entfernt werden.'
          : null
      });
      console.log(`[Archiv Wiki] Backup erstellt: ${destPath}`);
      return {
        started: true,
        success: true,
        filePath: destPath,
        cleanupWarnings: pruneErrors.length,
        status
      };
    } catch (err) {
      try { fs.unlinkSync(tempPath); } catch { /* Temp-Datei existiert evtl. nicht */ }
      const previous = readProjectBackupStatus(projectPath);
      const status = writeProjectBackupStatus(projectPath, {
        consecutiveFailures: (previous.consecutiveFailures || 0) + 1,
        lastErrorAt: new Date().toISOString(),
        lastErrorMessage: err.message,
        lastErrorCode: err.code || null,
        lastErrorUserMessage: backupUserMessage(err.code)
      });
      console.error('[Archiv Wiki] Backup fehlgeschlagen:', err.message);
      return {
        started: true,
        success: false,
        error: {
          message: err.message,
          code: err.code || null,
          userMessage: backupUserMessage(err.code)
        },
        status
      };
    }
  })();

  activeBackupPromise = operation;
  try {
    return await operation;
  } finally {
    if (activeBackupPromise === operation) {
      activeBackupPromise = null;
      activeBackupAbortController = null;
      backupInProgress = false;
    }
  }
}

// Beim Beenden erhält das laufende Backup zunächst Zeit, sauber fertig zu
// werden. Bleibt es darüber hinaus aktiv, wird ausschließlich die temporäre
// Archivierung kontrolliert abgebrochen; die endgültige ZIP-Datei wurde zu
// diesem Zeitpunkt noch nicht ersetzt.
async function finishBackupBeforeQuit(graceMs = BACKUP_QUIT_GRACE_MS) {
  const operation = activeBackupPromise;
  if (!operation) return { hadBackup: false, aborted: false };

  let timer;
  const graceExpired = new Promise(resolve => {
    timer = setTimeout(() => resolve('timeout'), graceMs);
  });
  const completed = operation.then(() => 'completed', () => 'completed');
  const outcome = await Promise.race([completed, graceExpired]);
  clearTimeout(timer);

  if (outcome === 'completed') return { hadBackup: true, aborted: false };

  activeBackupAbortController?.abort();
  await operation.catch(() => {});
  return { hadBackup: true, aborted: true };
}

function nextScheduledBackup(backupPath, intervalDays) {
  if (!intervalDays || intervalDays <= 0) return null;
  const lastDate = latestBackupDate(backupPath);
  if (!lastDate) return new Date();
  const next = new Date(lastDate);
  next.setDate(next.getDate() + intervalDays);
  return next;
}

module.exports = {
  maybeRunAutoBackup,
  pruneOldBackups,
  backupFileNameFor,
  nextScheduledBackup,
  latestBackupDate,
  isBackupInProgress,
  readProjectBackupStatus,
  validateBackupDestination,
  validateBackupDestinationAccess,
  cleanupStaleBackupTemps,
  validateZipArchive,
  finishBackupBeforeQuit
};
