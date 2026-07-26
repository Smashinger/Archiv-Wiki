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
const { readAppState, writeAppState } = require('./app-state');

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

// Datum der neuesten vorhandenen Backup-Datei in diesem Ordner (oder null,
// falls noch keine existiert) — bewusst aus den Dateinamen selbst abgeleitet
// statt aus einem globalen App-Zustand, damit das Intervall korrekt PRO
// PROJEKT funktioniert (ein globaler Zeitstempel würde sich bei mehreren
// verschiedenen Projekten/Backup-Ordnern gegenseitig verwechseln).
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

// Wird regelmäßig aufgerufen (siehe Timer in main.js) — entscheidet selbst,
// ob laut eingestelltem Intervall ein neues Backup fällig ist, und legt bei
// Bedarf eins an. intervalDays: 0 = deaktiviert, sonst Anzahl Tage seit dem
// letzten vorhandenen Backup IN DIESEM Ordner (Standard 1 = täglich, wie
// bisher fest verdrahtet).
// Für sauberes Beenden (main.js quitCleanly): zeigt an, ob GERADE ein
// automatisches Backup läuft, damit das Beenden kurz darauf warten kann statt
// mitten im Zip-Schreiben abzubrechen.
let backupInProgress = false;
function isBackupInProgress() { return backupInProgress; }

// force: für den "Backup jetzt erstellen"-Knopf (Einstellungen/Tray) — erzwingt
// ein Backup unabhängig vom Intervall, OHNE das ggf. schon vorhandene
// heutige Backup vorher zu löschen (Bugfix Audit-Punkt 3: vorher wurde die
// bestehende Datei per fs.unlinkSync VOR dem neuen Versuch entfernt — schlug
// das Schreiben danach fehl, z. B. voller Datenträger, war auch das alte,
// funktionierende Backup weg). Jetzt: erst in eine temporäre Datei schreiben,
// nur bei Erfolg per renameSync (atomar, gleiches Dateisystem) ersetzen.
async function maybeRunAutoBackup({ getCurrentProject }, force = false) {
  const project = getCurrentProject();
  const projectPath = project?.path;
  const backupPath = project?.config?.backupPath;
  const intervalDays = project?.config?.backupIntervalDays ?? 1;
  if (!projectPath || !backupPath) return;
  if (!force && intervalDays <= 0) return; // per Einstellung deaktiviert

  if (!force) {
    const lastDate = latestBackupDate(backupPath);
    if (lastDate) {
      const daysSinceLast = (Date.now() - lastDate.getTime()) / 86400000;
      if (daysSinceLast < intervalDays) return; // laut Intervall noch nicht fällig
    }
  }

  const destPath = path.join(backupPath, backupFileNameFor(new Date()));
  if (!force && fs.existsSync(destPath)) return; // heute schon gesichert (z. B. mehrere Programmstarts am selben Tag)
  const tempPath = `${destPath}.tmp-${process.pid}`;

  backupInProgress = true;
  try {
    fs.mkdirSync(backupPath, { recursive: true });
    await zipProjectTo(projectPath, tempPath);
    // Erst JETZT, nach erfolgreichem Schreiben, das eigentliche Ziel ersetzen —
    // renameSync auf demselben Dateisystem ist atomar, das alte Backup ist
    // bis zu diesem Moment durchgehend unangetastet vorhanden.
    fs.renameSync(tempPath, destPath);
    pruneOldBackups(backupPath);
    writeAppState({ backupConsecutiveFailures: 0, backupLastSuccessAt: new Date().toISOString() });
    console.log(`[Archiv Wiki] Automatisches Backup erstellt: ${destPath}`);
  } catch (err) {
    try { fs.unlinkSync(tempPath); } catch { /* Temp-Datei existiert evtl. gar nicht erst */ }
    // Ein fehlgeschlagenes Hintergrund-Backup soll die App nicht stören —
    // nur loggen, beim nächsten Timer-Tick (oder morgen) erneut versuchen.
    // ZUSÄTZLICH aber zählen (Backup-Warnung-Feature): mehrere Fehlschläge
    // hintereinander sollen dem Nutzer sichtbar auffallen, statt komplett
    // unbemerkt zu bleiben.
    // Bugfix (Nutzer-Meldung: "keine aussagekräftige Fehlermeldung, auch
    // nicht in den DevTools"): der echte Fehlertext wurde bisher NUR in die
    // Konsole geloggt, nirgends dauerhaft gespeichert — wer nicht im exakten
    // Moment des Fehlschlags hinschaute, sah nachträglich nichts mehr davon.
    // Jetzt wird er mitgespeichert, damit die Oberfläche ihn später zeigen kann.
    const prevCount = readAppState().backupConsecutiveFailures || 0;
    writeAppState({
      backupConsecutiveFailures: prevCount + 1,
      backupLastErrorAt: new Date().toISOString(),
      backupLastErrorMessage: err.message,
      backupLastErrorCode: err.code || null
    });
    console.error('[Archiv Wiki] Automatisches Backup fehlgeschlagen:', err.message);
  } finally {
    backupInProgress = false;
  }
}

// Für die Anzeige im Einstellungsfenster ("Nächstes geplantes Backup") —
// reine Berechnung, kein Seiteneffekt. Nutzt dieselbe projektspezifische
// Grundlage wie maybeRunAutoBackup (siehe latestBackupDate).
function nextScheduledBackup(backupPath, intervalDays) {
  if (!intervalDays || intervalDays <= 0) return null; // deaktiviert
  const lastDate = latestBackupDate(backupPath);
  if (!lastDate) return new Date(); // noch nie gesichert → jederzeit fällig
  const next = new Date(lastDate);
  next.setDate(next.getDate() + intervalDays);
  return next;
}

module.exports = { maybeRunAutoBackup, pruneOldBackups, backupFileNameFor, nextScheduledBackup, latestBackupDate, isBackupInProgress };
