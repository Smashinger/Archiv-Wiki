// main/notes-fs.js
// Schritt 3: Alle Datei-Operationen rund um Notizen und Kategorien.
// Bewusst als reine, von Electron unabhängige Funktionen geschrieben
// (nur 'fs'/'path' + das npm-Paket 'gray-matter') — dadurch ohne laufende
// App direkt mit Node testbar und leicht wiederverwendbar.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const matter = require('gray-matter');
const { CONFIG_FILENAME, TRASH_DIRNAME, INCOMING_DIRNAME, INCOMING_MARKER_FILENAME } = require('./project');
const { atomicWriteFileSync } = require('./atomic-write');

const NOTE_EXT = '.md';
const NOTE_CONFLICT_MARKER = 'ARCHIV_WIKI_NOTE_CONFLICT:';

// ---------------------------------------------------------------------------
// Namens- und Pfad-Sicherheit
// ---------------------------------------------------------------------------

// Macht aus einem Nutzer-Eingabetext einen sicheren Datei-/Ordnernamen.
// Verbietet Pfadtrenner und Zeichen, die auf gängigen Dateisystemen Probleme
// machen — bewusst grosszügig bei Umlauten/Unicode (Emojis im Titel sind
// im Original-Wiki ausdrücklich gewünscht, siehe utils.js extractLeadingEmoji).
function sanitizeName(name) {
  const trimmed = String(name ?? '').trim();
  const cleaned = trimmed
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'Unbenannt';
}

// Verhindert Path-Traversal: relPath darf den Projektordner nie verlassen,
// egal was aus dem Renderer hereinkommt (z. B. "../../etc").
function resolveSafe(projectPath, relPath) {
  const root = path.resolve(projectPath);
  const target = path.resolve(root, relPath || '.');
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error('Ungültiger Pfad außerhalb des Projektordners.');
  }
  return target;
}

function isHidden(entryName) {
  return entryName.startsWith('.');
}

// Der Eingang ist ein eigener Projekt-Speicherbereich und keine Kategorie.
// Nur der gleichnamige Ordner direkt in der Projektwurzel wird ausgeblendet;
// Unterkategorien mit diesem Namen bleiben weiterhin normale Wiki-Struktur.
function isProjectSystemEntry(projectPath, entryName, relPath) {
  if (relPath || entryName !== INCOMING_DIRNAME) return false;
  return fs.existsSync(path.join(projectPath, INCOMING_DIRNAME, INCOMING_MARKER_FILENAME));
}

// ---------------------------------------------------------------------------
// Eindeutige Datei-/Ordnernamen (verhindert versehentliches Überschreiben)
// ---------------------------------------------------------------------------
function uniquePath(dirPath, baseName, ext, ignorePath) {
  let candidate = path.join(dirPath, `${baseName}${ext}`);
  let n = 2;
  while (fs.existsSync(candidate) && candidate !== ignorePath) {
    candidate = path.join(dirPath, `${baseName} ${n}${ext}`);
    n += 1;
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// Frontmatter lesen/schreiben (via gray-matter)
// ---------------------------------------------------------------------------
function readNoteRaw(fullPath) {
  const raw = fs.readFileSync(fullPath, 'utf8');
  const parsed = matter(raw);
  return { frontmatter: parsed.data || {}, body: parsed.content.replace(/^\n/, '') };
}

function writeNoteRaw(fullPath, frontmatter, body) {
  const fileString = matter.stringify(body || '', frontmatter || {});
  atomicWriteFileSync(fullPath, fileString, 'utf8');
}

function noteBodyVersion(body) {
  return crypto.createHash('sha256').update(String(body ?? ''), 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Baum lesen (für Sidebar) — rekursiv, überspringt .wiki-config.json,
// .wiki-trash/ und versteckte Dateien.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Für den Volltextsuche-Index (Schritt 6): liest JEDE Notiz komplett (nicht
// nur Frontmatter wie listProjectTree) — Titel, Body und Tags in einem Rutsch,
// damit der Renderer daraus einen FlexSearch-Index bauen kann.
// ---------------------------------------------------------------------------
function getSearchDocuments(projectPath) {
  const docs = [];
  // Hinweis (Audit-Punkt 10): entry.isDirectory()/isFile() liefern für
  // Symlinks beide false (Node prüft den Dirent-Typ selbst, folgt dem Link
  // dabei nicht) — Symlinks werden hier deshalb bewusst still übersprungen,
  // weder als Ordner noch als Datei behandelt. Kein Absturz, keine
  // Endlosschleife bei zirkulären Links, aber verlinkte Notizen/Ordner
  // erscheinen dadurch nirgends in Suche oder Baum. Absichtlich so gelöst statt
  // Symlinks aufzulösen, um deren Sonderfälle (kaputte/zirkuläre Verweise)
  // gar nicht erst behandeln zu müssen.
  function walk(dirPath, relPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(e => !isHidden(e.name) && !isProjectSystemEntry(projectPath, e.name, relPath));
    for (const entry of entries) {
      const entryRelPath = relPath ? path.join(relPath, entry.name) : entry.name;
      const entryFullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(entryFullPath, entryRelPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(NOTE_EXT)) {
        try {
          const { frontmatter, body } = readNoteRaw(entryFullPath);
          const categoryParts = path.dirname(entryRelPath)
            .split(path.sep)
            .filter(part => part && part !== '.');
          const mainCategory = frontmatter.mainCategory || categoryParts[0] || '';
          const subCategory = frontmatter.category || categoryParts.at(-1) || '';
          const categoryPath = categoryParts.length
            ? categoryParts.join(' / ')
            : [mainCategory, subCategory].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(' / ');

          docs.push({
            relPath: entryRelPath,
            title: frontmatter.title || entry.name,
            body,
            tags: frontmatter.tags || [],
            icon: frontmatter.icon || '',
            category: subCategory || mainCategory,
            mainCategory,
            subCategory,
            categoryPath
          });
        } catch { /* defekte Notiz — einfach überspringen statt Index-Aufbau abzubrechen */ }
      }
    }
  }
  walk(path.resolve(projectPath), '');
  return docs;
}

function listProjectTree(projectPath) {
  // Hinweis (Audit-Punkt 10): siehe gleichlautender Kommentar in
  // getSearchDocuments() oben — Symlinks werden hier aus demselben Grund
  // ebenso still übersprungen.
  function walk(dirPath, relPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(e => !isHidden(e.name) && !isProjectSystemEntry(projectPath, e.name, relPath))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));

    const folders = [];
    const notes = [];

    for (const entry of entries) {
      const entryRelPath = relPath ? path.join(relPath, entry.name) : entry.name;
      const entryFullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        folders.push({
          type: 'folder',
          name: entry.name,
          relPath: entryRelPath,
          children: walk(entryFullPath, entryRelPath)
        });
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(NOTE_EXT)) {
        let frontmatter = {};
        try {
          frontmatter = readNoteRaw(entryFullPath).frontmatter;
        } catch {
          frontmatter = {};
        }
        notes.push({
          type: 'note',
          name: entry.name,
          relPath: entryRelPath,
          frontmatter
        });
      }
    }
    return [...folders, ...notes];
  }

  return walk(path.resolve(projectPath), '');
}

// ---------------------------------------------------------------------------
// Strikte 3-Ebenen-Hierarchie (Nutzerfeedback): Hauptkategorie (Tiefe 1)
// → Unterkategorie (Tiefe 2) → Notiz (Datei in einer Unterkategorie).
// Diese Regeln gelten für NEUE Operationen (Anlegen/Verschieben). Bereits
// bestehende, davon abweichende Strukturen (z. B. Notizen direkt in einer
// Hauptkategorie aus einem älteren Projektstand) werden beim Lesen NICHT
// versteckt oder migriert — listProjectTree() bleibt bewusst generisch.
// ---------------------------------------------------------------------------
function getDepth(relPath) {
  return String(relPath || '').split(path.sep).filter(Boolean).length;
}

function classifyEntry(projectPath, relPath) {
  const fullPath = resolveSafe(projectPath, relPath);
  const stat = fs.statSync(fullPath);
  if (!stat.isDirectory()) return 'note';
  return getDepth(relPath) === 1 ? 'mainCategory' : 'subCategory';
}

// ---------------------------------------------------------------------------
// Kategorien (Ordner)
// ---------------------------------------------------------------------------
function createMainCategory(projectPath, name) {
  const root = path.resolve(projectPath);
  const baseName = sanitizeName(name || 'Neues Thema');
  const candidate = uniqueDirPath(root, baseName);
  fs.mkdirSync(candidate, { recursive: true });
  return { relPath: path.relative(projectPath, candidate), name: path.basename(candidate) };
}

function createSubCategory(projectPath, mainCategoryRelPath, name) {
  const mainDir = resolveSafe(projectPath, mainCategoryRelPath);
  if (getDepth(mainCategoryRelPath) !== 1 || !fs.existsSync(mainDir) || !fs.statSync(mainDir).isDirectory()) {
    throw new Error('Ungültige Hauptkategorie — Unterkategorien können nur direkt in einer Hauptkategorie angelegt werden.');
  }
  const baseName = sanitizeName(name || 'Neue Unterkategorie');
  const candidate = uniqueDirPath(mainDir, baseName);
  fs.mkdirSync(candidate, { recursive: true });
  return { relPath: path.relative(projectPath, candidate), name: path.basename(candidate) };
}

function uniqueDirPath(parentDir, baseName) {
  let candidate = path.join(parentDir, baseName);
  let n = 2;
  while (fs.existsSync(candidate)) { candidate = path.join(parentDir, `${baseName} ${n}`); n += 1; }
  return candidate;
}

// Template-Variablen (eingebaute und benutzerdefinierte Vorlagen laufen
// beide über createNote unten, also genügt diese eine Stelle). Jede Variable
// wird einzeln per festem Suchbegriff ersetzt (kein generischer
// "{beliebigesWort}"-Parser) — dadurch bleiben unbekannte Platzhalter wie
// {foo} unangetastet, auch bei mehrfachem oder gemischtem Vorkommen. Datum/
// Zeit manuell (statt toLocaleDateString) zusammengesetzt, im selben
// DD.MM.YYYY/HH:MM-Format wie die bestehenden Datumsanzeigen im Renderer
// (siehe formatAbsoluteDate/formatTime in app.js) — new Date() liefert dabei
// die lokale Systemzeit des Rechners, auf dem der Hauptprozess läuft.
function resolveTemplateVariables(text, title) {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = String(now.getFullYear());
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return text
    .replace(/\{title\}/g, title)
    .replace(/\{date\}/g, `${dd}.${mm}.${yyyy}`)
    .replace(/\{time\}/g, `${hh}:${min}`)
    .replace(/\{year\}/g, yyyy);
}

// ---------------------------------------------------------------------------
// Notizen — dürfen ausschließlich in einer Unterkategorie (Tiefe 2) liegen
// (strikte 3-Ebenen-Regel: Hauptkategorie → Unterkategorie → Notiz).
// ---------------------------------------------------------------------------
function createNote(projectPath, subCategoryRelPath, title, templateBody, options) {
  const dirPath = resolveSafe(projectPath, subCategoryRelPath || '.');
  if (getDepth(subCategoryRelPath || '') !== 2 || !fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    throw new Error('Notizen können nur in einer Unterkategorie angelegt werden.');
  }
  const displayTitle = String(title ?? '').trim() || 'Neue Notiz';
  const baseName = sanitizeName(displayTitle);
  const filePath = uniquePath(dirPath, baseName, NOTE_EXT);

  const creationOptions = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  const requestedFrontmatter = creationOptions.frontmatterPatch
    && typeof creationOptions.frontmatterPatch === 'object'
    && !Array.isArray(creationOptions.frontmatterPatch)
    ? creationOptions.frontmatterPatch
    : {};
  // Zusätzliche Herkunfts-/Import-Metadaten dürfen das normale Notizmodell
  // nicht überschreiben. Titel, Kategorie, Tags und Zeitstempel bleiben daher
  // weiterhin ausschließlich in der Verantwortung der bestehenden Notizlogik.
  const reservedFrontmatterKeys = new Set(['title', 'tags', 'category', 'mainCategory', 'created', 'modified']);
  const extraFrontmatter = Object.fromEntries(
    Object.entries(requestedFrontmatter).filter(([key]) => !reservedFrontmatterKeys.has(key))
  );

  const now = new Date().toISOString();
  const frontmatter = {
    ...extraFrontmatter,
    title: displayTitle,
    tags: [],
    category: path.basename(dirPath),
    mainCategory: path.basename(path.dirname(dirPath)),
    created: now,
    modified: now
  };
  // Reguläre Vorlagen ersetzen weiterhin {title}, zusätzlich {date}/{time}/
  // {year}. Ein explizit als literalBody markierter Inhalt (z. B. ein
  // bearbeiteter Eingang-Entwurf) wird dagegen unverändert als Inhalt
  // behandelt und nicht als Vorlage interpretiert.
  const body = creationOptions.literalBody
    ? String(templateBody ?? '')
    : templateBody
      ? resolveTemplateVariables(templateBody, displayTitle)
      : `# ${displayTitle}\n\n`;
  writeNoteRaw(filePath, frontmatter, body);

  return { relPath: path.relative(projectPath, filePath), frontmatter };
}

function readNote(projectPath, relPath) {
  const fullPath = resolveSafe(projectPath, relPath);
  const { frontmatter, body } = readNoteRaw(fullPath);
  return { relPath, frontmatter, body, version: noteBodyVersion(body) };
}

function writeNote(projectPath, relPath, body, frontmatterPatch, expectedVersion) {
  const fullPath = resolveSafe(projectPath, relPath);
  const existing = readNoteRaw(fullPath);
  const currentVersion = noteBodyVersion(existing.body);
  if (typeof expectedVersion === 'string' && expectedVersion !== currentVersion) {
    const error = new Error(
      `${NOTE_CONFLICT_MARKER} Die Notiz wurde außerhalb von Archiv-Wiki geändert. `
      + 'Deine Änderungen wurden nicht überschrieben. Lade die Notiz neu, bevor du weiterarbeitest.'
    );
    error.code = 'NOTE_CONFLICT';
    throw error;
  }
  const frontmatter = {
    ...existing.frontmatter,
    ...(frontmatterPatch || {}),
    modified: new Date().toISOString()
  };
  const nextBody = body ?? existing.body;
  writeNoteRaw(fullPath, frontmatter, nextBody);
  const written = readNoteRaw(fullPath);
  return { relPath, frontmatter: written.frontmatter, version: noteBodyVersion(written.body) };
}

// ---------------------------------------------------------------------------
// Umbenennen (Notiz oder Kategorie) — bei Notizen synchronisiert der
// Frontmatter-Titel mit, wie in der Spec gefordert.
// ---------------------------------------------------------------------------
// Verschiebt/benennt fullPath zu newPath um. Bugfix (Audit-Punkt 11):
// fs.renameSync wirft EXDEV, wenn Quelle und Ziel auf unterschiedlichen
// Dateisystemen liegen (seltener Sonderfall, z. B. bei ungewöhnlichen
// Mount-Konstellationen innerhalb des Projektordners) — vorher wäre das als
// roher, für den Nutzer unverständlicher Node-Fehler durchgereicht worden.
// Fällt in diesem einen Fall auf Kopieren+Löschen zurück, sonst identisches
// Ergebnis wie ein echtes Rename.
function renameOrMove(fullPath, newPath) {
  try {
    fs.renameSync(fullPath, newPath);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    fs.cpSync(fullPath, newPath, { recursive: true });
    fs.rmSync(fullPath, { recursive: true, force: true });
  }
}

function renameEntry(projectPath, relPath, newName) {
  const fullPath = resolveSafe(projectPath, relPath);
  const stat = fs.statSync(fullPath);
  const parentDir = path.dirname(fullPath);
  const isDir = stat.isDirectory();
  const ext = isDir ? '' : NOTE_EXT;
  const baseName = sanitizeName(newName);

  const newPath = uniquePath(parentDir, baseName, ext, fullPath);
  renameOrMove(fullPath, newPath);

  if (!isDir) {
    const { frontmatter, body } = readNoteRaw(newPath);
    writeNoteRaw(newPath, { ...frontmatter, title: baseName, modified: new Date().toISOString() }, body);
  }

  return { relPath: path.relative(projectPath, newPath) };
}

// ---------------------------------------------------------------------------
// Verschieben (Drag & Drop) — erzwingt die 3-Ebenen-Regeln:
//  - Hauptkategorie: nicht verschiebbar (bleibt immer oberste Ebene)
//  - Unterkategorie: nur in eine (andere) Hauptkategorie verschiebbar
//  - Notiz: nur in eine (andere) Unterkategorie verschiebbar
// ---------------------------------------------------------------------------
function moveEntry(projectPath, relPath, targetRelPath) {
  const kind = classifyEntry(projectPath, relPath);
  if (kind === 'mainCategory') {
    throw new Error('Hauptkategorien können nicht verschoben werden.');
  }

  const fullPath = resolveSafe(projectPath, relPath);
  const targetDir = resolveSafe(projectPath, targetRelPath || '.');
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    throw new Error('Zielordner existiert nicht.');
  }
  const targetDepth = getDepth(targetRelPath || '');

  if (kind === 'note' && targetDepth !== 2) {
    throw new Error('Notizen können nur in eine Unterkategorie verschoben werden.');
  }
  if (kind === 'subCategory' && targetDepth !== 1) {
    throw new Error('Unterkategorien können nur in eine Hauptkategorie verschoben werden.');
  }
  if (path.dirname(relPath) === targetRelPath) {
    return { relPath }; // bereits dort — No-Op statt Duplikat anzulegen
  }

  const stat = fs.statSync(fullPath);
  const isDir = stat.isDirectory();
  const ext = isDir ? '' : path.extname(fullPath);
  const baseName = isDir ? path.basename(fullPath) : path.basename(fullPath, ext);

  const destPath = uniquePath(targetDir, baseName, ext);
  renameOrMove(fullPath, destPath);

  if (!isDir) {
    const { frontmatter, body } = readNoteRaw(destPath);
    writeNoteRaw(destPath, {
      ...frontmatter,
      category: path.basename(targetDir),
      mainCategory: path.basename(path.dirname(targetDir)),
      modified: new Date().toISOString()
    }, body);
  }

  return { relPath: path.relative(projectPath, destPath) };
}

// ---------------------------------------------------------------------------
// Papierkorb — verschiebt statt zu löschen (siehe Spec: "kein direkter Lösch").
// Alle Einträge liegen FLACH direkt in .wiki-trash/ (kein Spiegeln der
// Ordnerstruktur — das führte zu Kollisionen zwischen "ganze Kategorie
// gelöscht" und "einzelne Notiz aus dieser Kategorie gelöscht"). Der
// ursprüngliche Pfad wird stattdessen in trash-index.json vermerkt, damit
// "Wiederherstellen" weiß, wohin ein Eintrag zurückgehört.
// ---------------------------------------------------------------------------
const TRASH_INDEX_FILE = 'trash-index.json';

function trashDirOf(projectPath) {
  return path.join(path.resolve(projectPath), TRASH_DIRNAME);
}

function createTrashError(code, message, cause, rollbackCause) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  if (rollbackCause) error.rollbackCause = rollbackCause;
  return error;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSafeTrashName(value) {
  return typeof value === 'string'
    && value.length > 0
    && value !== '.'
    && value !== '..'
    && value !== TRASH_INDEX_FILE
    && !value.includes('/')
    && !value.includes('\\')
    && !value.includes('\0');
}

function isSafeOriginalRelPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\0') || path.isAbsolute(value)) return false;
  const portablePath = value.replace(/\\/g, '/');
  if (portablePath.startsWith('/') || /^[a-z]:\//i.test(portablePath)) return false;
  const parts = portablePath.split('/');
  return parts.every(part => part && part !== '.' && part !== '..');
}

function validateTrashIndexSchema(value) {
  if (!isPlainObject(value)) {
    throw createTrashError('TRASH_INDEX_INVALID', 'Der Papierkorbindex besitzt kein gültiges Format. Papierkorbänderungen wurden abgebrochen.');
  }

  const normalized = Object.create(null);
  for (const [trashName, meta] of Object.entries(value)) {
    const validDeletedAt = typeof meta?.deletedAt === 'string'
      && meta.deletedAt.length > 0
      && !Number.isNaN(Date.parse(meta.deletedAt));
    if (!isSafeTrashName(trashName)
        || !isPlainObject(meta)
        || !isSafeOriginalRelPath(meta.originalRelPath)
        || !['note', 'folder'].includes(meta.type)
        || !validDeletedAt) {
      throw createTrashError('TRASH_INDEX_INVALID', 'Der Papierkorbindex enthält ungültige Herkunftsinformationen. Papierkorbänderungen wurden abgebrochen.');
    }
    normalized[trashName] = {
      originalRelPath: meta.originalRelPath,
      type: meta.type,
      deletedAt: meta.deletedAt
    };
  }
  return normalized;
}

function trashEntries(trashDir) {
  if (!fs.existsSync(trashDir)) return [];
  try {
    return fs.readdirSync(trashDir, { withFileTypes: true })
      .filter(entry => entry.name !== TRASH_INDEX_FILE);
  } catch (error) {
    throw createTrashError('TRASH_INDEX_UNREADABLE', 'Der Papierkorbzustand konnte nicht gelesen werden. Papierkorbänderungen wurden abgebrochen.', error);
  }
}

function assertTrashIndexMatchesDirectory(trashDir, index) {
  const actualEntries = trashEntries(trashDir);
  const actualNames = actualEntries.map(entry => entry.name);
  const indexedNames = Object.keys(index);
  const actualSet = new Set(actualNames);
  if (actualNames.some(name => !Object.prototype.hasOwnProperty.call(index, name))
      || indexedNames.some(name => !actualSet.has(name))
      || actualEntries.some(entry => index[entry.name]?.type !== (entry.isDirectory() ? 'folder' : 'note'))) {
    throw createTrashError(
      'TRASH_INDEX_INCONSISTENT',
      'Papierkorb und Herkunftsindex stimmen nicht überein. Es wurden keine Änderungen vorgenommen.'
    );
  }
}

function readTrashIndex(trashDir) {
  const indexPath = path.join(trashDir, TRASH_INDEX_FILE);
  if (!fs.existsSync(indexPath)) {
    if (trashEntries(trashDir).length > 0) {
      throw createTrashError(
        'TRASH_INDEX_MISSING',
        'Für vorhandene Papierkorbeinträge fehlen die Herkunftsinformationen. Es wurden keine Änderungen vorgenommen.'
      );
    }
    return Object.create(null);
  }

  let raw;
  try {
    raw = fs.readFileSync(indexPath, 'utf8');
  } catch (error) {
    throw createTrashError('TRASH_INDEX_UNREADABLE', 'Der Papierkorbindex konnte nicht gelesen werden. Papierkorbänderungen wurden abgebrochen.', error);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw createTrashError('TRASH_INDEX_INVALID', 'Der Papierkorbindex ist beschädigt. Papierkorbänderungen wurden abgebrochen.', error);
  }

  const index = validateTrashIndexSchema(parsed);
  assertTrashIndexMatchesDirectory(trashDir, index);
  return index;
}

function writeTrashIndex(trashDir, index) {
  const validated = validateTrashIndexSchema(index);
  atomicWriteFileSync(path.join(trashDir, TRASH_INDEX_FILE), JSON.stringify(validated, null, 2), 'utf8');
}

function rollbackTrashMove(sourcePath, targetPath) {
  if (fs.existsSync(targetPath)) {
    const collision = new Error('Rollback-Ziel existiert bereits.');
    collision.code = 'EEXIST';
    throw collision;
  }
  renameOrMove(sourcePath, targetPath);
}

function trashMutationError(action, writeError, rollbackError) {
  if (rollbackError) {
    return createTrashError(
      'TRASH_ROLLBACK_FAILED',
      `Der Eintrag konnte nicht sicher ${action} werden und die Rücknahme ist ebenfalls fehlgeschlagen. Der Papierkorbzustand muss geprüft werden.`,
      writeError,
      rollbackError
    );
  }
  return createTrashError(
    'TRASH_INDEX_WRITE_FAILED',
    `Der Eintrag konnte nicht sicher ${action} werden. Die Dateisystemänderung wurde zurückgenommen.`,
    writeError
  );
}

function deleteEntry(projectPath, relPath) {
  const fullPath = resolveSafe(projectPath, relPath);
  const trashDir = trashDirOf(projectPath);
  fs.mkdirSync(trashDir, { recursive: true });
  const index = readTrashIndex(trashDir);

  const stat = fs.statSync(fullPath);
  const isDir = stat.isDirectory();
  const ext = isDir ? '' : path.extname(fullPath);
  const baseName = isDir ? path.basename(fullPath) : path.basename(fullPath, ext);

  const destInTrash = uniquePath(trashDir, baseName, ext);
  const trashName = path.basename(destInTrash);
  const nextIndex = { ...index, [trashName]: {
    originalRelPath: path.relative(projectPath, fullPath),
    type: isDir ? 'folder' : 'note',
    deletedAt: new Date().toISOString()
  } };

  renameOrMove(fullPath, destInTrash);
  try {
    writeTrashIndex(trashDir, nextIndex);
  } catch (writeError) {
    try {
      rollbackTrashMove(destInTrash, fullPath);
    } catch (rollbackError) {
      throw trashMutationError('in den Papierkorb verschoben', writeError, rollbackError);
    }
    throw trashMutationError('in den Papierkorb verschoben', writeError);
  }

  return { trashRelPath: trashName };
}

function listTrash(projectPath) {
  const trashDir = trashDirOf(projectPath);
  if (!fs.existsSync(trashDir)) return [];

  const index = readTrashIndex(trashDir);

  return fs.readdirSync(trashDir, { withFileTypes: true })
    .filter(e => e.name !== TRASH_INDEX_FILE)
    .map(e => {
      const meta = index[e.name];
      let title = e.name;
      if (e.isFile() && e.name.toLowerCase().endsWith(NOTE_EXT)) {
        try { title = readNoteRaw(path.join(trashDir, e.name)).frontmatter.title || e.name; } catch { /* Frontmatter defekt, egal */ }
      }
      return {
        trashRelPath: e.name,
        type: meta.type,
        title,
        originalRelPath: meta.originalRelPath,
        deletedAt: meta.deletedAt
      };
    })
    .sort((a, b) => (a.deletedAt || '') < (b.deletedAt || '') ? 1 : -1);
}

function restoreFromTrash(projectPath, trashRelPath) {
  const trashDir = trashDirOf(projectPath);
  if (!isSafeTrashName(trashRelPath)) {
    throw createTrashError('TRASH_ENTRY_INVALID', 'Der ausgewählte Papierkorbeintrag ist ungültig.');
  }
  const source = path.join(trashDir, trashRelPath);
  const index = readTrashIndex(trashDir);
  const meta = index[trashRelPath];
  if (!meta) {
    throw createTrashError('TRASH_ENTRY_METADATA_MISSING', 'Für den Papierkorbeintrag fehlen gültige Herkunftsinformationen. Die Wiederherstellung wurde abgebrochen.');
  }
  if (!fs.existsSync(source)) {
    throw createTrashError('TRASH_ENTRY_MISSING', 'Der Papierkorbeintrag wurde nicht gefunden. Die Wiederherstellung wurde abgebrochen.');
  }
  const originalRelPath = meta.originalRelPath;

  const destParentDir = resolveSafe(projectPath, path.dirname(originalRelPath) || '.');
  fs.mkdirSync(destParentDir, { recursive: true }); // falls Ursprungsordner zwischenzeitlich weg ist

  const ext = path.extname(originalRelPath);
  const baseName = path.basename(originalRelPath, ext || undefined);
  const destPath = uniquePath(destParentDir, baseName, ext);

  const nextIndex = { ...index };
  delete nextIndex[trashRelPath];
  renameOrMove(source, destPath);
  try {
    writeTrashIndex(trashDir, nextIndex);
  } catch (writeError) {
    try {
      rollbackTrashMove(destPath, source);
    } catch (rollbackError) {
      throw trashMutationError('wiederhergestellt', writeError, rollbackError);
    }
    throw trashMutationError('wiederhergestellt', writeError);
  }

  return { relPath: path.relative(projectPath, destPath) };
}

function emptyTrash(projectPath) {
  const trashDir = trashDirOf(projectPath);
  // Ein beschädigter oder bereits inkonsistenter Index wird nicht durch
  // endgültiges Leeren still als neue Wahrheit überschrieben.
  if (fs.existsSync(trashDir)) readTrashIndex(trashDir);
  fs.rmSync(trashDir, { recursive: true, force: true });
  fs.mkdirSync(trashDir, { recursive: true });
  // Ein fehlender Index ist für einen tatsächlich leeren Papierkorb ein
  // gültiger Zustand. Dadurch gibt es nach dem irreversiblen Entfernen keinen
  // zweiten Schreibschritt mehr, der einen halben Leerzustand erzeugen kann.
  return { ok: true };
}

module.exports = {
  sanitizeName,
  resolveSafe,
  getDepth,
  classifyEntry,
  listProjectTree,
  getSearchDocuments,
  createMainCategory,
  createSubCategory,
  createNote,
  readNote,
  writeNote,
  renameEntry,
  moveEntry,
  deleteEntry,
  listTrash,
  restoreFromTrash,
  emptyTrash,
  CONFIG_FILENAME,
  TRASH_DIRNAME
};
