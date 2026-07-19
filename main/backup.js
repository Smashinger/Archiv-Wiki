// main/backup.js
// Automatisches Hintergrund-Backup — nutzt denselben backupPath, der beim
// Einrichten des Projekts gewählt/angelegt wurde (siehe main/wizard-ipc.js),
// der bis hierhin ungenutzt war (siehe Gespräch: "Karteileiche"-Bug).
//
// Bewusst simple Tages-Kadenz statt konfigurierbarem Intervall wie beim
// Cloud-Sync — ein Backup pro Tag reicht für den Zweck (Notfall-Wiederher-
// stellung), mehr würde nur unnötig Platz verbrauchen. Ein Lauf pro Tag wird
// über den Dateinamen selbst erkannt (siehe backupFileNameFor): existiert die
// heutige Datei schon, wird nichts erneut getan.
'use strict';

const fs = require('fs');
const path = require('path');
const { zipProjectTo } = require('./export-ipc');

const BACKUP_FILENAME_RE = /^backup-(\d{4}-\d{2}-\d{2})\.zip$/;
const DEFAULT_KEEP_COUNT = 14; // ~2 Wochen tägliche Backups

function backupFileNameFor(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `backup-${yyyy}-${mm}-${dd}.zip`;
}

// Löscht die ältesten Backups, wenn mehr als keepCount vorhanden sind.
// Dateinamen sind YYYY-MM-DD-basiert, sortieren also schon rein alphabetisch
// korrekt chronologisch — kein Datei-Datum-Stat nötig.
function pruneOldBackups(backupPath, keepCount = DEFAULT_KEEP_COUNT) {
  let files;
  try {
    files = fs.readdirSync(backupPath).filter(f => BACKUP_FILENAME_RE.test(f)).sort();
  } catch {
    return; // Ordner existiert (noch) nicht o.ä. — nichts zum Aufräumen
  }
  const excess = files.length - keepCount;
  if (excess <= 0) return;
  for (const f of files.slice(0, excess)) {
    try { fs.unlinkSync(path.join(backupPath, f)); }
    catch (err) { console.error(`[Archiv Wiki] Altes Backup konnte nicht gelöscht werden (${f}):`, err.message); }
  }
}

// Wird regelmäßig aufgerufen (siehe Timer in main.js) — entscheidet selbst,
// ob heute schon ein Backup existiert, und legt bei Bedarf eins an.
async function maybeRunAutoBackup({ getCurrentProject }) {
  const project = getCurrentProject();
  const projectPath = project?.path;
  const backupPath = project?.config?.backupPath;
  if (!projectPath || !backupPath) return;

  const destPath = path.join(backupPath, backupFileNameFor(new Date()));
  if (fs.existsSync(destPath)) return; // heute schon gesichert

  try {
    fs.mkdirSync(backupPath, { recursive: true });
    await zipProjectTo(projectPath, destPath);
    pruneOldBackups(backupPath);
    console.log(`[Archiv Wiki] Automatisches Backup erstellt: ${destPath}`);
  } catch (err) {
    // Ein fehlgeschlagenes Hintergrund-Backup soll die App nicht stören —
    // nur loggen, beim nächsten Timer-Tick (oder morgen) erneut versuchen.
    console.error('[Archiv Wiki] Automatisches Backup fehlgeschlagen:', err.message);
  }
}

module.exports = { maybeRunAutoBackup, pruneOldBackups, backupFileNameFor };
