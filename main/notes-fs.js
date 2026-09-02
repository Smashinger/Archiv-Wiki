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
            categoryPath,
            // Feature A / Block 3: einziges neues Feld am Suchdokument, für
            // den Aktiv/Archiv/Alle-Statusfilter in der Suche (renderer/js/
            // search.js docMatchesFilters()). Keine zweite Datenquelle.
            archived: Boolean(frontmatter.archived)
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
// Bugfix (C3.1): replace() bekommt den Ersatzwert bewusst über eine
// Funktion (() => value), nicht als String — ein String-Replacement wertet
// Sequenzen wie $&, $`, $' oder $1 als Sondermuster aus, ein Titel mit
// genau so einer Zeichenfolge wurde dadurch verfälscht. Der Rückgabewert
// einer Ersetzungsfunktion wird dagegen immer wörtlich eingesetzt.
function resolveTemplateVariables(text, title) {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = String(now.getFullYear());
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return text
    .replace(/\{title\}/g, () => title)
    .replace(/\{date\}/g, () => `${dd}.${mm}.${yyyy}`)
    .replace(/\{time\}/g, () => `${hh}:${min}`)
    .replace(/\{year\}/g, () => yyyy);
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
  const mergedFrontmatter = {
    ...existing.frontmatter,
    ...(frontmatterPatch || {}),
    modified: new Date().toISOString()
  };
  // Ein Patch-Wert von null bedeutet in diesem Projekt durchgängig "dieses
  // Feld entfernen" (bisher genutzt von pinned/backlinkTo, jetzt auch
  // archived/archivedAt) — ein reiner Objekt-Spread setzt den Schlüssel aber
  // nur auf null, entfernt ihn nicht, und matter.stringify()/js-yaml
  // schreiben null-Werte explizit als "key: null" statt den Schlüssel
  // wegzulassen (per Test verifiziert). Deshalb werden alle noch
  // null-wertigen Schlüssel erst hier, am einzigen zentralen Merge-Punkt für
  // Frontmatter-Patches, endgültig entfernt, bevor geschrieben wird.
  const frontmatter = {};
  for (const [key, value] of Object.entries(mergedFrontmatter)) {
    if (value !== null) frontmatter[key] = value;
  }
  const nextBody = body ?? existing.body;
  writeNoteRaw(fullPath, frontmatter, nextBody);
  const written = readNoteRaw(fullPath);
  return { relPath, frontmatter: written.frontmatter, version: noteBodyVersion(written.body) };
}

// ---------------------------------------------------------------------------
// Tag-Massenoperationen (Feature D4 / Block 2) — Umbenennen, Zusammenführen
// und Löschen sind technisch dieselbe Operation (Quelle(n) durch Ziel
// ersetzen oder ganz entfernen, anschließend case-sensitiv deduplizieren):
// eine gemeinsame Kernfunktion statt drei getrennter Schreibsysteme.
// Arbeitet ausschließlich auf frontmatter.tags über den bestehenden
// writeNote()-Weg — kein zweiter Tag-Bestand, kein persistenter Tag-Index.
// Aktive UND archivierte Notizen werden gleichermaßen erfasst (Tags gehören
// zur Notiz unabhängig vom Archivstatus, siehe D4-Audit).
// ---------------------------------------------------------------------------

// "Ausgangszustand" (siehe applyTagOperation unten): liefert für jede Notiz,
// die mindestens einen der angegebenen Tags trägt, den aktuellen Tags-Stand
// und eine Body-Versionsprüfsumme. Dient sowohl als Vorschau (Anzahl
// betroffener Notizen für den Bestätigungsdialog) als auch als Schnappschuss,
// gegen den applyTagOperation() unmittelbar vor jedem Schreiben erneut
// prüft, ob sich die Notiz zwischenzeitlich verändert hat. Nutzt bewusst
// getSearchDocuments() (liest ohnehin jede Notiz komplett) statt eines
// zweiten Baum-Scans.
function collectNotesByTags(projectPath, tags) {
  const tagSet = new Set(Array.isArray(tags) ? tags : [tags]);
  return getSearchDocuments(projectPath)
    .filter(doc => (doc.tags || []).some(t => tagSet.has(t)))
    .map(doc => ({
      relPath: doc.relPath,
      tags: Array.isArray(doc.tags) ? doc.tags : [],
      bodyVersion: noteBodyVersion(doc.body)
    }));
}

// Reine Tags-Array-Transformation, ohne Dateizugriff — leicht einzeln
// nachvollziehbar/testbar. 'rename' und 'merge' laufen über denselben Zweig
// (from -> to ersetzen); 'delete' entfernt den Tag ersatzlos.
function computeTagsAfterOperation(currentTags, operation) {
  const tags = Array.isArray(currentTags) ? currentTags : [];
  const next = operation.type === 'delete'
    ? tags.filter(t => t !== operation.tag)
    : tags.map(t => (t === operation.from ? operation.to : t));
  // Set bewahrt die Reihenfolge des ersten Vorkommens und dedupliziert
  // case-sensitiv (Set-Gleichheit ist strikte ===, "Fedora" !== "fedora").
  return [...new Set(next)];
}

// Wendet eine Tag-Operation auf eine zuvor mit collectNotesByTags() erfasste
// Notizmenge an ("snapshot" = deren Rückgabewert). Pro Notiz:
//  - unmittelbar vor dem Schreiben erneut von Platte lesen (Frischeprüfung)
//  - weichen Tags-Array ODER Body-Hash vom Snapshot ab: NICHT schreiben,
//    als "skipped" protokollieren (kein Überschreiben zwischenzeitlicher
//    externer Änderungen, kein Transaktionssystem — reiner Vergleich)
//  - ergibt die Operation keine tatsächliche Änderung: "unchanged", kein
//    unnötiger Schreibzugriff
//  - einzelne Fehler stoppen die Schleife NICHT — jede Notiz wird unabhängig
//    versucht, das Ergebnis pro Notiz landet immer im results-Array
//    (kein stiller Teilfehler).
function applyTagOperation(projectPath, operation, snapshot) {
  if (operation.type !== 'delete') {
    const to = String(operation.to ?? '').trim();
    if (!to) throw new Error('Ziel-Tag darf nicht leer sein.');
  }
  const results = [];
  for (const entry of snapshot) {
    try {
      const fullPath = resolveSafe(projectPath, entry.relPath);
      const fresh = readNoteRaw(fullPath);
      const freshTags = fresh.frontmatter.tags || [];
      const freshBodyVersion = noteBodyVersion(fresh.body);
      const tagsMatchSnapshot = JSON.stringify(freshTags) === JSON.stringify(entry.tags);
      const bodyMatchesSnapshot = freshBodyVersion === entry.bodyVersion;
      if (!tagsMatchSnapshot || !bodyMatchesSnapshot) {
        results.push({ relPath: entry.relPath, status: 'skipped' });
        continue;
      }
      const newTags = computeTagsAfterOperation(freshTags, operation);
      if (JSON.stringify(newTags) === JSON.stringify(freshTags)) {
        results.push({ relPath: entry.relPath, status: 'unchanged' });
        continue;
      }
      writeNote(projectPath, entry.relPath, undefined, { tags: newTags });
      // previousTags/tags (Feature D4 / Block 3): rein zusätzliche, nicht
      // verhaltensändernde Angaben — dienen ausschließlich dem sitzungslokalen
      // Undo als Grundlage, ändern nichts an Vergleich/Schreiblogik oben.
      results.push({ relPath: entry.relPath, status: 'changed', previousTags: freshTags, tags: newTags });
    } catch (error) {
      results.push({ relPath: entry.relPath, status: 'failed', message: error.message });
    }
  }
  return {
    total: snapshot.length,
    changed: results.filter(r => r.status === 'changed').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    failed: results.filter(r => r.status === 'failed').length,
    unchanged: results.filter(r => r.status === 'unchanged').length,
    results
  };
}

// ---------------------------------------------------------------------------
// Sitzungslokales Undo (Feature D4 / Block 3) für applyTagOperation() oben.
// undoEntries: die 'changed'-Einträge aus deren Ergebnis
// ({relPath, previousTags, tags}). Eigene, kleine Funktion statt einer
// Erweiterung von applyTagOperation()/computeTagsAfterOperation() — Undo
// schreibt einen EXPLIZIT übergebenen Tags-Zustand zurück (kein
// Rename/Merge/Delete-Transform), die bestehende Batch-Kernlogik bleibt
// dadurch unangetastet. Eigene Frischeprüfung: vor dem Zurückschreiben muss
// der aktuelle Tags-Zustand exakt dem vom Batch erzeugten ("tags") Zustand
// entsprechen — sonst NICHT überschreiben, sondern überspringen. Body und
// alle anderen Frontmatter-Felder bleiben unangetastet (writeNote() patcht
// ausschließlich "tags", body bleibt undefined = unverändert). Einzelne
// Fehler stoppen die übrige Verarbeitung nicht, kein stiller Teilfehler.
// ---------------------------------------------------------------------------
function undoTagBatch(projectPath, undoEntries) {
  const results = [];
  for (const entry of undoEntries) {
    try {
      const fullPath = resolveSafe(projectPath, entry.relPath);
      const fresh = readNoteRaw(fullPath);
      const freshTags = fresh.frontmatter.tags || [];
      const stillMatchesBatchResult = JSON.stringify(freshTags) === JSON.stringify(entry.tags);
      if (!stillMatchesBatchResult) {
        results.push({ relPath: entry.relPath, status: 'skipped' });
        continue;
      }
      writeNote(projectPath, entry.relPath, undefined, { tags: entry.previousTags });
      results.push({ relPath: entry.relPath, status: 'restored' });
    } catch (error) {
      results.push({ relPath: entry.relPath, status: 'failed', message: error.message });
    }
  }
  return {
    total: undoEntries.length,
    restored: results.filter(r => r.status === 'restored').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    failed: results.filter(r => r.status === 'failed').length,
    results
  };
}

// ---------------------------------------------------------------------------
// Mehrfachauswahl-Batch (Feature D2 / Block 2) — Verschieben/Archivieren/
// Papierkorb für eine per Sidebar/Dashboard/Archiv-Seite ausgewählte
// Notizmenge (renderer/js/app.js selectedRelPaths). Gleiches Grundmuster wie
// die Tag-Massenoperationen (D4, oben): Snapshot bei Bestätigung -> pro
// Notiz unmittelbar vor der Operation erneut von Platte prüfen -> einzelne
// Fehler stoppen den restlichen Batch nicht -> ein Ergebnis-Array mit
// changed/skipped/failed. Alle drei Operationen nutzen dafür denselben
// Snapshot-/Frischeprüfungs-Kern; die eigentliche Dateisystemarbeit läuft
// weiterhin über die bestehenden Einzel-Funktionen (moveEntry/writeNote/
// deleteEntry) — keine zweite Verschiebe-/Lösch-Engine.
//
// expectedVersion (writeNote) prüft laut Audit ausschließlich den Body-Hash,
// keine Frontmatter- oder Pfadänderungen. Der Snapshot hier erfasst deshalb
// zusätzlich einen Frontmatter-Fingerabdruck (Hash über die sortierten
// Frontmatter-Schlüssel) — zusammen mit dem Body-Hash und der reinen
// Existenzprüfung ergibt das eine leichte, lokale Frischeprüfung ohne
// Transaktionsarchitektur.
// ---------------------------------------------------------------------------
function frontmatterFingerprint(frontmatter) {
  const sortedKeys = Object.keys(frontmatter || {}).sort();
  const sorted = {};
  for (const key of sortedKeys) sorted[key] = frontmatter[key];
  return crypto.createHash('sha256').update(JSON.stringify(sorted), 'utf8').digest('hex');
}

// Ein Snapshot-Eintrag PRO angefragtem relPath (1:1, auch bei einer zu diesem
// Zeitpunkt bereits fehlenden/unlesbaren Notiz) — dadurch entspricht die
// Ergebnisliste jeder Batch-Operation später immer exakt der ursprünglichen
// Auswahlgröße, ohne Sonderbehandlung an anderer Stelle: eine zum
// Snapshot-Zeitpunkt fehlende Notiz bekommt bodyVersion/frontmatterFingerprint
// = null, wodurch checkNoteFreshness() sie unten ganz regulär als
// "zwischenzeitlich verändert" (nicht mehr vorhanden) überspringt.
function snapshotNotesForBatch(projectPath, relPaths) {
  return (Array.isArray(relPaths) ? relPaths : []).map(relPath => {
    try {
      const fullPath = resolveSafe(projectPath, relPath);
      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
        return { relPath, bodyVersion: null, frontmatterFingerprint: null };
      }
      const { frontmatter, body } = readNoteRaw(fullPath);
      return {
        relPath,
        bodyVersion: noteBodyVersion(body),
        frontmatterFingerprint: frontmatterFingerprint(frontmatter)
      };
    } catch {
      return { relPath, bodyVersion: null, frontmatterFingerprint: null };
    }
  });
}

// Unmittelbar vor der eigentlichen Operation aufgerufen: liefert den frisch
// gelesenen Zustand nur, wenn Body UND Frontmatter noch exakt dem Snapshot
// entsprechen (und die Datei überhaupt noch existiert) — sonst null, was der
// Aufrufer als "skipped, zwischenzeitlich geändert" behandelt.
function checkNoteFreshness(projectPath, entry) {
  let fullPath;
  try {
    fullPath = resolveSafe(projectPath, entry.relPath);
  } catch {
    return null;
  }
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) return null;
  let fresh;
  try {
    fresh = readNoteRaw(fullPath);
  } catch {
    return null;
  }
  if (noteBodyVersion(fresh.body) !== entry.bodyVersion) return null;
  if (frontmatterFingerprint(fresh.frontmatter) !== entry.frontmatterFingerprint) return null;
  return fresh;
}

function summarizeBatchResults(total, results) {
  return {
    total,
    changed: results.filter(r => r.status === 'changed').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    failed: results.filter(r => r.status === 'failed').length,
    results
  };
}

// Verschieben: nutzt moveEntry() unverändert (dieselben Ziel-/Namens-/
// Kollisionsregeln wie beim Einzel-Verschieben, keine automatische
// Umbenennung zur Kollisionsvermeidung). moveEntry() selbst erkennt "bereits
// im Ziel" bereits als No-Op (gibt denselben relPath zurück) — das wird hier
// als "skipped" statt "changed" gewertet, damit die Zusammenfassung nicht
// eine tatsächlich nicht stattgefundene Verschiebung als Erfolg zählt.
// oldRelPath/newRelPath stehen bei jedem "changed"-Ergebnis bereit — Grundlage
// für das sitzungslokale Undo aus D2 / Block 3.
function applyBatchMove(projectPath, snapshot, targetRelPath) {
  const results = [];
  for (const entry of snapshot) {
    const fresh = checkNoteFreshness(projectPath, entry);
    if (!fresh) {
      results.push({ relPath: entry.relPath, status: 'skipped' });
      continue;
    }
    try {
      const moved = moveEntry(projectPath, entry.relPath, targetRelPath);
      if (moved.relPath === entry.relPath) {
        results.push({ relPath: entry.relPath, status: 'skipped' });
      } else {
        // Zustand UNMITTELBAR NACH dem Verschieben erfassen (moveEntry()
        // aktualisiert category/mainCategory/modified im Frontmatter, der
        // Body bleibt gleich) — Grundlage für die eigene Frischeprüfung von
        // undoBatchMove() weiter unten (D2 / Block 3): ohne diesen Zustand
        // könnte Undo nicht erkennen, ob die Notiz seit dem Batch erneut
        // verändert/verschoben wurde.
        const movedFullPath = resolveSafe(projectPath, moved.relPath);
        const movedState = readNoteRaw(movedFullPath);
        results.push({
          relPath: entry.relPath,
          status: 'changed',
          oldRelPath: entry.relPath,
          newRelPath: moved.relPath,
          bodyVersion: noteBodyVersion(movedState.body),
          frontmatterFingerprint: frontmatterFingerprint(movedState.frontmatter)
        });
      }
    } catch (error) {
      results.push({ relPath: entry.relPath, status: 'failed', message: error.message });
    }
  }
  return summarizeBatchResults(snapshot.length, results);
}

// ---------------------------------------------------------------------------
// Sitzungslokales Undo für Batch-Verschieben (Feature D2 / Block 3).
// undoEntries: die 'changed'-Einträge aus applyBatchMove() oben
// ({oldRelPath, newRelPath, bodyVersion, frontmatterFingerprint}). Eigene,
// kleine Funktion statt einer Erweiterung von applyBatchMove()/moveEntry() —
// Undo verschiebt einen EXPLIZIT bekannten Pfad zurück (newRelPath ->
// Zielordner von oldRelPath), keine erneute Zielwahl. Vor jedem einzelnen
// Undo: frische Prüfung, dass die Notiz unter newRelPath seit dem Batch
// weder inhaltlich noch im Frontmatter verändert wurde UND dass oldRelPath
// nicht inzwischen erneut belegt ist — sonst "skipped", kein Überschreiben,
// keine automatische Konflikt-Umbenennung. Nutzt für die eigentliche
// Verschiebung weiterhin ausschließlich moveEntry() (kein zweiter
// Verschiebeweg). Einzelne Fehler stoppen die übrige Verarbeitung nicht.
// ---------------------------------------------------------------------------
function undoBatchMove(projectPath, undoEntries) {
  const results = [];
  for (const entry of undoEntries) {
    try {
      const fullPath = resolveSafe(projectPath, entry.newRelPath);
      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
        results.push({ relPath: entry.newRelPath, status: 'skipped' });
        continue;
      }
      const fresh = readNoteRaw(fullPath);
      const stillMatchesBatchResult = noteBodyVersion(fresh.body) === entry.bodyVersion
        && frontmatterFingerprint(fresh.frontmatter) === entry.frontmatterFingerprint;
      if (!stillMatchesBatchResult) {
        results.push({ relPath: entry.newRelPath, status: 'skipped' });
        continue;
      }
      const oldFullPath = resolveSafe(projectPath, entry.oldRelPath);
      if (fs.existsSync(oldFullPath)) {
        // Ursprünglicher Pfad ist inzwischen wieder belegt — nicht
        // überschreiben, keine automatische Umbenennung zur Umgehung.
        results.push({ relPath: entry.newRelPath, status: 'skipped' });
        continue;
      }
      const targetRelPath = path.dirname(entry.oldRelPath);
      const movedBack = moveEntry(projectPath, entry.newRelPath, targetRelPath === '.' ? '' : targetRelPath);
      results.push({ relPath: entry.newRelPath, status: 'restored', restoredRelPath: movedBack.relPath });
    } catch (error) {
      results.push({ relPath: entry.newRelPath, status: 'failed', message: error.message });
    }
  }
  return {
    total: undoEntries.length,
    restored: results.filter(r => r.status === 'restored').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    failed: results.filter(r => r.status === 'failed').length,
    results
  };
}

// Archivieren: derselbe Frontmatter-Patch-Weg wie die bestehende
// Einzel-Archivierung (archiveNoteFlow in app.js) — archived:true/archivedAt
// über writeNote(), keine Dateiverschiebung, keine zweite Archiv-Semantik.
// Ein konsistenter Zeitstempel für den gesamten Batch. Bereits archivierte
// Notizen werden nicht erneut geschrieben, sondern als "skipped" erfasst.
function applyBatchArchive(projectPath, snapshot) {
  const results = [];
  const archivedAt = new Date().toISOString();
  for (const entry of snapshot) {
    const fresh = checkNoteFreshness(projectPath, entry);
    if (!fresh) {
      results.push({ relPath: entry.relPath, status: 'skipped' });
      continue;
    }
    if (fresh.frontmatter.archived) {
      results.push({ relPath: entry.relPath, status: 'skipped' });
      continue;
    }
    try {
      writeNote(projectPath, entry.relPath, undefined, { archived: true, archivedAt });
      results.push({ relPath: entry.relPath, status: 'changed' });
    } catch (error) {
      results.push({ relPath: entry.relPath, status: 'failed', message: error.message });
    }
  }
  return summarizeBatchResults(snapshot.length, results);
}

// Papierkorb: nutzt deleteEntry() unverändert (derselbe Papierkorb-Weg wie
// die bestehende Einzel-Löschung) — kein endgültiges Löschen, Wiederherstellen
// bleibt ausschließlich über den vorhandenen Papierkorb möglich.
function applyBatchTrash(projectPath, snapshot) {
  const results = [];
  for (const entry of snapshot) {
    const fresh = checkNoteFreshness(projectPath, entry);
    if (!fresh) {
      results.push({ relPath: entry.relPath, status: 'skipped' });
      continue;
    }
    try {
      const trashed = deleteEntry(projectPath, entry.relPath);
      results.push({ relPath: entry.relPath, status: 'changed', trashRelPath: trashed.trashRelPath });
    } catch (error) {
      results.push({ relPath: entry.relPath, status: 'failed', message: error.message });
    }
  }
  return summarizeBatchResults(snapshot.length, results);
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
  resolveTemplateVariables,
  readNote,
  writeNote,
  collectNotesByTags,
  computeTagsAfterOperation,
  applyTagOperation,
  undoTagBatch,
  snapshotNotesForBatch,
  applyBatchMove,
  applyBatchArchive,
  applyBatchTrash,
  undoBatchMove,
  renameEntry,
  moveEntry,
  deleteEntry,
  listTrash,
  restoreFromTrash,
  emptyTrash,
  CONFIG_FILENAME,
  TRASH_DIRNAME
};
