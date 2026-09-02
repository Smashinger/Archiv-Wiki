// main/backup.js
// Zentrale Backup-Logik für automatische, manuelle und über das Tray
// gestartete Sicherungen. Intervall, Status und Sperre gelten pro geöffnetem
// Projekt; die eigentliche Archivierung wird mit der Export-Funktion geteilt.
'use strict';

const fs = require('fs');
const path = require('path');
const { Reader, ZipReader } = require('@zip.js/zip.js');
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
    BACKUP_ZIP_INTEGRITY: 'Das Backup konnte nicht vollständig überprüft werden und wurde nicht übernommen.',
    BACKUP_ZIP_UNSUPPORTED: 'Das erstellte Backup verwendet ein nicht unterstütztes ZIP-Format.',
    BACKUP_SOURCE_CHANGED: 'Das Backup konnte nicht vollständig erstellt werden. Wiki-Dateien wurden währenddessen verändert oder waren nicht lesbar.',
    BACKUP_ABORTED: 'Das Backup wurde beim Beenden kontrolliert abgebrochen.',
    BACKUP_PATH_MISSING: 'Es wurde kein Backup-Ordner ausgewählt.',
    BACKUP_PATH_UNAVAILABLE: 'Der konfigurierte Backup-Ordner ist nicht verfügbar. Bitte prüfe das Laufwerk oder wähle den Ordner erneut aus.',
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

// Ein bereits konfiguriertes Ziel wird bei einem Backup niemals neu angelegt.
// Das ist insbesondere für entfernte Laufwerke wichtig: Ein verschwundener
// Unterordner unterhalb eines nicht eingehängten Mountpoints darf nicht
// unbemerkt auf dem lokalen Dateisystem neu entstehen. Das bewusste Einrichten
// eines neuen Zielordners bleibt ausschließlich validateBackupDestinationAccess
// beziehungsweise dem Setup-Wizard vorbehalten.
function requireExistingBackupDestination(projectPath, backupPath) {
  if (!backupPath || typeof backupPath !== 'string') {
    throw createBackupError('Es wurde kein Backup-Ordner ausgewählt.', 'BACKUP_PATH_MISSING');
  }

  const { backupRoot } = validateBackupDestination(projectPath, backupPath);
  let stat;
  try {
    stat = fs.statSync(backupRoot);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      const unavailable = createBackupError(
        'Der konfigurierte Backup-Ordner existiert nicht mehr und wurde nicht automatisch neu angelegt.',
        'BACKUP_PATH_UNAVAILABLE'
      );
      unavailable.cause = error;
      throw unavailable;
    }
    throw error;
  }
  if (!stat.isDirectory()) {
    throw createBackupError('Der ausgewählte Backup-Pfad ist kein Ordner.', 'ENOTDIR');
  }
  return backupRoot;
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

// Löscht nur vollständig geprüfte Archiv-Wiki-Backups und zählt beschädigte
// oder fremde Dateien nicht gegen die Aufbewahrungsgrenze. Zukunftsdatierte
// Kandidaten bleiben entsprechend dem Status-/Fälligkeitsvertrag unangetastet.
// Fehler beim Aufräumen ändern den erfolgreichen Zustand des neuen Snapshots
// nicht; nach dem ersten Löschfehler wird kein weiterer Kandidat angefasst.
async function pruneOldBackups(backupPath, keepCount = DEFAULT_KEEP_COUNT, options = {}) {
  const errors = [];
  const now = normalizeNow(options.now);
  const today = localCalendarDay(now);
  let dirents;
  try {
    dirents = await fs.promises.readdir(backupPath, { withFileTypes: true });
  } catch (err) {
    console.error('[Archiv Wiki] Backup-Aufbewahrung konnte nicht geprüft werden:', err.message);
    errors.push({ fileName: null, error: err });
    return errors;
  }

  const candidates = dirents
    .filter(dirent => dirent.isFile())
    .map(dirent => ({ fileName: dirent.name, backupDate: parseBackupDate(dirent.name) }))
    .filter(candidate => candidate.backupDate && localCalendarDay(candidate.backupDate) <= today)
    .sort((left, right) => {
      const dateDifference = localCalendarDay(left.backupDate) - localCalendarDay(right.backupDate);
      return dateDifference || left.fileName.localeCompare(right.fileName);
    });

  const validCandidates = [];
  for (const candidate of candidates) {
    const filePath = path.join(backupPath, candidate.fileName);
    let stat;
    try {
      stat = await fs.promises.stat(filePath);
      const result = await validateExistingBackup(filePath, stat);
      if (!result.valid) continue;
      const finalStat = await fs.promises.stat(filePath);
      if (backupValidationKey(filePath, finalStat) !== backupValidationKey(filePath, stat)) continue;
      validCandidates.push({ ...candidate, filePath, stat: finalStat });
    } catch {
      // Verschwundene oder nicht lesbare Kandidaten werden nicht gelöscht.
    }
  }

  const normalizedKeepCount = Number.isInteger(keepCount) && keepCount >= 0
    ? keepCount
    : DEFAULT_KEEP_COUNT;
  const excess = validCandidates.length - normalizedKeepCount;
  if (excess <= 0) return errors;

  for (const candidate of validCandidates.slice(0, excess)) {
    try {
      const currentStat = await fs.promises.stat(candidate.filePath);
      if (backupValidationKey(candidate.filePath, currentStat)
          !== backupValidationKey(candidate.filePath, candidate.stat)) {
        throw createBackupError(
          'Der Backup-Kandidat wurde während der Aufbewahrungsprüfung verändert.',
          'BACKUP_ROTATION_CHANGED'
        );
      }
      await fs.promises.unlink(candidate.filePath);
    } catch (err) {
      console.error(`[Archiv Wiki] Altes Backup konnte nicht gelöscht werden (${candidate.fileName}):`, err.message);
      errors.push({ fileName: candidate.fileName, error: err });
      break;
    }
  }
  return errors;
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

class FileHandleZipReader extends Reader {
  constructor(fileHandle, size) {
    super();
    this.fileHandle = fileHandle;
    this.size = size;
  }

  async readUint8Array(offset, length) {
    const available = Math.max(0, Math.min(length, this.size - offset));
    if (available === 0) return new Uint8Array();

    const buffer = Buffer.allocUnsafe(available);
    let bytesRead = 0;
    while (bytesRead < available) {
      const result = await this.fileHandle.read(
        buffer,
        bytesRead,
        available - bytesRead,
        offset + bytesRead
      );
      if (result.bytesRead === 0) break;
      bytesRead += result.bytesRead;
    }
    return new Uint8Array(buffer.buffer, buffer.byteOffset, bytesRead);
  }
}

function normalizeZipEntryPath(entryPath) {
  const normalized = path.posix
    .normalize(String(entryPath || '').replace(/\\/g, '/'))
    .replace(/^(\.\/)+/, '')
    .replace(/\/+$/, '');
  return normalized.normalize('NFC');
}

async function validateZipEntryData(zipPath) {
  const fileHandle = await fs.promises.open(zipPath, 'r');
  let reader;

  try {
    const stat = await fileHandle.stat();
    reader = new ZipReader(new FileHandleZipReader(fileHandle, stat.size), {
      checkAmbiguity: true,
      checkCrc32: true,
      checkSignature: true,
      checkOverlappingEntry: true,
      strictness: 'strict',
      useWebWorkers: false
    });
    const entries = await reader.getEntries();
    const normalizedPaths = new Set();
    let filesChecked = 0;
    let uncompressedBytes = 0;
    let hasProjectConfig = false;

    for (const entry of entries) {
      const normalizedPath = normalizeZipEntryPath(entry.filename);
      if (!normalizedPath || normalizedPaths.has(normalizedPath)) {
        throw createBackupError(
          'Das Backup enthält doppelte oder ungültige normalisierte ZIP-Pfade.',
          'BACKUP_ZIP_INTEGRITY'
        );
      }
      normalizedPaths.add(normalizedPath);

      if (entry.directory) continue;
      if (normalizedPath === '.wiki-config.json') hasProjectConfig = true;

      let entryBytes = 0;
      const discardStream = new WritableStream({
        write(chunk) {
          entryBytes += chunk.byteLength;
          if (entryBytes > entry.uncompressedSize) {
            throw createBackupError(
              `Die entpackte Größe von ${entry.filename} ist inkonsistent.`,
              'BACKUP_ZIP_INTEGRITY'
            );
          }
        }
      });

      await entry.getData(discardStream, {
        checkAmbiguity: true,
        checkCrc32: true,
        checkSignature: true,
        checkOverlappingEntry: true,
        strictness: 'strict',
        useWebWorkers: false
      });

      if (entryBytes !== entry.uncompressedSize) {
        throw createBackupError(
          `Die entpackte Größe von ${entry.filename} ist inkonsistent.`,
          'BACKUP_ZIP_INTEGRITY'
        );
      }
      filesChecked += 1;
      uncompressedBytes += entryBytes;
    }

    return { entries: entries.length, filesChecked, uncompressedBytes, hasProjectConfig };
  } catch (error) {
    if (error?.code === 'BACKUP_ZIP_INTEGRITY') throw error;
    const integrityError = createBackupError(
      `Die ZIP-Nutzdatenprüfung ist fehlgeschlagen: ${error?.message || 'Unbekannter Integritätsfehler'}`,
      'BACKUP_ZIP_INTEGRITY'
    );
    integrityError.cause = error;
    throw integrityError;
  } finally {
    try {
      if (reader) await reader.close();
    } finally {
      await fileHandle.close();
    }
  }
}

// Prüft die tatsächliche ZIP-Struktur: Abschlussdatensatz, zentrales
// Verzeichnis und alle referenzierten lokalen Dateiköpfe. Anschließend werden
// alle regulären Einträge vollständig dekomprimiert und per CRC-32 sowie
// unkomprimierter Größe geprüft. Die Nutzdaten werden dabei verworfen und
// nicht vollständig im Arbeitsspeicher gesammelt.
async function validateZipArchive(zipPath) {
  let structuralEntries = 0;
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
    structuralEntries = entriesRead;
  } finally {
    await fileHandle.close();
  }

  const dataValidation = await validateZipEntryData(zipPath);
  if (dataValidation.entries !== structuralEntries) {
    throw createBackupError(
      'Struktur- und Nutzdatenprüfung melden unterschiedliche ZIP-Einträge.',
      'BACKUP_ZIP_INTEGRITY'
    );
  }

  return {
    valid: true,
    entries: structuralEntries,
    filesChecked: dataValidation.filesChecked,
    uncompressedBytes: dataValidation.uncompressedBytes,
    hasProjectConfig: dataValidation.hasProjectConfig
  };
}

async function validateArchivWikiBackup(zipPath) {
  const validation = await validateZipArchive(zipPath);
  if (!validation.hasProjectConfig) {
    throw createBackupError(
      'Das ZIP enthält keine .wiki-config.json im Projektwurzelverzeichnis.',
      'BACKUP_ZIP_INVALID'
    );
  }
  return validation;
}

// Bereits geprüfte historische ZIPs werden innerhalb eines App-Laufs nur
// erneut dekomprimiert, wenn sich ihre Dateimetadaten geändert haben. Der
// Cache ist keine persistente Wahrheitsquelle: Nach jedem Neustart erfolgt
// mindestens eine neue M-09b-Prüfung des tatsächlich verwendeten Kandidaten.
const existingBackupValidationCache = new Map();

function normalizeNow(now) {
  const date = now instanceof Date ? new Date(now.getTime()) : new Date(now ?? Date.now());
  if (!Number.isFinite(date.getTime())) throw new TypeError('Ungültiger Zeitpunkt für die Backup-Prüfung.');
  return date;
}

function parseBackupDate(fileName) {
  const match = String(fileName || '').match(BACKUP_FILENAME_RE);
  if (!match) return null;
  const [year, month, day] = match[1].split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function localCalendarDay(date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

function backupValidationKey(filePath, stat) {
  return [
    path.resolve(filePath),
    stat.size,
    stat.mtimeMs,
    stat.ctimeMs,
    stat.ino ?? ''
  ].join('\0');
}

async function validateExistingBackup(filePath, stat) {
  if (!stat.isFile() || stat.size === 0) return { valid: false, validation: null };

  const cacheKey = backupValidationKey(filePath, stat);
  let cached = existingBackupValidationCache.get(cacheKey);
  if (!cached) {
    cached = validateArchivWikiBackup(filePath)
      .then(validation => ({ valid: true, validation }))
      .catch(error => {
        console.warn(
          `[Archiv Wiki] Backup-Kandidat ist ungültig (${path.basename(filePath)}):`,
          error?.message || 'Validierung fehlgeschlagen'
        );
        return { valid: false, validation: null };
      });
    existingBackupValidationCache.set(cacheKey, cached);
    if (existingBackupValidationCache.size > 256) existingBackupValidationCache.clear();
  }
  return cached;
}

async function rememberValidatedBackup(filePath, validation) {
  const stat = await fs.promises.stat(filePath);
  existingBackupValidationCache.set(
    backupValidationKey(filePath, stat),
    Promise.resolve({ valid: true, validation })
  );
  return stat;
}

async function findLatestValidBackup(backupPath, options = {}) {
  const now = normalizeNow(options.now);
  const today = localCalendarDay(now);
  let dirents;
  try {
    dirents = await fs.promises.readdir(backupPath, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('[Archiv Wiki] Backup-Status konnte den Backup-Ordner nicht lesen:', error?.message || error);
    }
    return null;
  }

  const candidates = dirents
    .filter(dirent => dirent.isFile())
    .map(dirent => ({ fileName: dirent.name, backupDate: parseBackupDate(dirent.name) }))
    .filter(candidate => candidate.backupDate && localCalendarDay(candidate.backupDate) <= today)
    .sort((left, right) => {
      const dateDifference = localCalendarDay(right.backupDate) - localCalendarDay(left.backupDate);
      return dateDifference || right.fileName.localeCompare(left.fileName);
    });

  for (const candidate of candidates) {
    const filePath = path.join(backupPath, candidate.fileName);
    let stat;
    try {
      stat = await fs.promises.stat(filePath);
    } catch {
      continue;
    }
    const result = await validateExistingBackup(filePath, stat);
    if (!result.valid) continue;
    let finalStat;
    try {
      finalStat = await fs.promises.stat(filePath);
    } catch {
      continue;
    }
    if (backupValidationKey(filePath, finalStat) !== backupValidationKey(filePath, stat)) continue;
    return {
      ...candidate,
      filePath,
      stat: finalStat,
      validation: result.validation
    };
  }
  return null;
}

function isBackupDue(latestValidBackup, intervalDays, now = new Date()) {
  if (!intervalDays || intervalDays <= 0) return false;
  if (!latestValidBackup) return true;
  const elapsedDays = localCalendarDay(normalizeNow(now)) - localCalendarDay(latestValidBackup.backupDate);
  return elapsedDays < 0 || elapsedDays >= intervalDays;
}

async function getBackupFolderState(backupPath, intervalDays, options = {}) {
  const now = normalizeNow(options.now);
  if (!backupPath) return { latestValidBackup: null, due: false, nextScheduledAt: null };
  const latestValidBackup = await findLatestValidBackup(backupPath, { now });
  const due = isBackupDue(latestValidBackup, intervalDays, now);
  let nextScheduledAt = null;
  if (intervalDays > 0) {
    nextScheduledAt = latestValidBackup
      ? new Date(latestValidBackup.backupDate.getFullYear(), latestValidBackup.backupDate.getMonth(), latestValidBackup.backupDate.getDate() + intervalDays)
      : now;
  }
  return { latestValidBackup, due, nextScheduledAt };
}

function storedSuccessMatchesBackup(latestValidBackup, storedStatus) {
  return Boolean(latestValidBackup)
    && storedStatus?.lastSuccessFileName === latestValidBackup.fileName
    && storedStatus?.lastSuccessFileSize === latestValidBackup.stat.size
    && storedStatus?.lastSuccessFileMtimeMs === latestValidBackup.stat.mtimeMs
    && storedStatus?.lastSuccessFileCtimeMs === latestValidBackup.stat.ctimeMs
    && storedStatus?.lastSuccessFileIno === (latestValidBackup.stat.ino ?? null);
}

function resolveBackupSuccessAt(latestValidBackup, storedStatus, now = new Date()) {
  if (!latestValidBackup) return null;
  const currentTime = normalizeNow(now).getTime();
  const storedTime = new Date(storedStatus?.lastSuccessAt || '').getTime();
  if (storedSuccessMatchesBackup(latestValidBackup, storedStatus)
      && Number.isFinite(storedTime) && storedTime <= currentTime) {
    return new Date(storedTime).toISOString();
  }

  return latestValidBackup.backupDate.toISOString();
}

let backupInProgress = false;
let activeBackupPromise = null;
let activeBackupAbortController = null;
function isBackupInProgress() { return backupInProgress; }

async function maybeRunAutoBackup({ getCurrentProject }, force = false, options = {}) {
  if (backupInProgress) return { started: false, reason: 'busy' };

  const project = getCurrentProject();
  const projectPath = project?.path;
  const backupPath = project?.config?.backupPath;
  const intervalDays = project?.config?.backupIntervalDays ?? 1;
  if (!projectPath || !backupPath) return { started: false, reason: 'not-configured' };
  if (!force && intervalDays <= 0) return { started: false, reason: 'disabled' };

  const now = normalizeNow(options.now);
  let tempPath = null;
  const abortController = new AbortController();

  backupInProgress = true;
  activeBackupAbortController = abortController;
  const operation = (async () => {
    try {
      if (!force) {
        const folderState = await getBackupFolderState(backupPath, intervalDays, { now });
        if (!folderState.due) {
          return {
            started: false,
            reason: 'not-due',
            latestValidBackup: folderState.latestValidBackup?.fileName || null
          };
        }
      }

      const backupRoot = requireExistingBackupDestination(projectPath, backupPath);
      const destPath = path.join(backupRoot, backupFileNameFor(now));
      tempPath = `${destPath}.tmp-${process.pid}`;
      cleanupStaleBackupTemps(backupRoot);

      await zipProjectTo(projectPath, tempPath, { signal: abortController.signal });
      if (abortController.signal.aborted) {
        throw createBackupError('Das Backup wurde beim Beenden kontrolliert abgebrochen.', 'BACKUP_ABORTED');
      }

      const validation = await validateArchivWikiBackup(tempPath);
      if (abortController.signal.aborted) {
        throw createBackupError('Das Backup wurde beim Beenden kontrolliert abgebrochen.', 'BACKUP_ABORTED');
      }

      fs.renameSync(tempPath, destPath);
      const finalStat = await rememberValidatedBackup(destPath, validation);
      let pruneErrors;
      try {
        pruneErrors = await pruneOldBackups(backupRoot, DEFAULT_KEEP_COUNT, { now });
      } catch (error) {
        console.error('[Archiv Wiki] Backup-Aufbewahrung ist unerwartet fehlgeschlagen:', error?.message || error);
        pruneErrors = [{ fileName: null, error }];
      }
      const firstPruneError = pruneErrors[0]?.error || null;
      const status = writeProjectBackupStatus(projectPath, {
        consecutiveFailures: 0,
        lastSuccessAt: now.toISOString(),
        lastSuccessFileName: path.basename(destPath),
        lastSuccessFileSize: finalStat.size,
        lastSuccessFileMtimeMs: finalStat.mtimeMs,
        lastSuccessFileCtimeMs: finalStat.ctimeMs,
        lastSuccessFileIno: finalStat.ino ?? null,
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
      if (tempPath) {
        try { fs.unlinkSync(tempPath); } catch { /* Temp-Datei existiert evtl. nicht */ }
      }
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

module.exports = {
  maybeRunAutoBackup,
  pruneOldBackups,
  backupFileNameFor,
  findLatestValidBackup,
  getBackupFolderState,
  isBackupDue,
  resolveBackupSuccessAt,
  storedSuccessMatchesBackup,
  isBackupInProgress,
  readProjectBackupStatus,
  validateBackupDestination,
  validateBackupDestinationAccess,
  requireExistingBackupDestination,
  cleanupStaleBackupTemps,
  validateZipArchive,
  validateArchivWikiBackup,
  finishBackupBeforeQuit
};
