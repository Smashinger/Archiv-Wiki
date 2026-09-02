// main/sync-classify.js — reine Entscheidungslogik für den Sync-Abgleich
// (Schritt 6, Stufe 3). Bewusst OHNE jede Abhängigkeit zu electron/fs/webdav,
// damit diese (nicht ganz triviale) Logik direkt getestet werden kann.
'use strict';

const TRASH_DIRNAME = '.wiki-trash';
const MANIFEST_FILENAME = '.wiki-sync-manifest.json';

const CONFIG_FILENAME = '.wiki-config.json';

function isExcluded(relPath) {
  // .wiki-config.json bewusst ausgeschlossen: enthält u. a. den Backup-Pfad,
  // der pro Gerät unterschiedlich sein kann (und meistens auch sollte) —
  // gehört daher grundsätzlich nicht synchronisiert, jedes Gerät behält seine
  // eigenen Einstellungen (Nutzer-Meldung: sonst wiederkehrender Konflikt
  // bei praktisch jedem Start).
  return relPath === TRASH_DIRNAME || relPath.startsWith(TRASH_DIRNAME + '/') || relPath === MANIFEST_FILENAME || relPath === CONFIG_FILENAME;
}

// ---------------------------------------------------------------------------
// Eingabe: Existenz auf beiden Seiten, ob ein Manifest-Eintrag existiert
// (= schon mal synchronisiert), ob lokal/remote seit dem Manifest-Stand
// geändert wurden, und (nur relevant wenn beide Seiten existieren UND die
// Metadaten allein auf einen Konflikt hindeuten würden) ob der tatsächliche
// Inhalt trotzdem identisch ist.
//
// Bugfix (Nutzer-Meldung: wiederkehrender Konflikt bei unveränderten
// Notizen): Metadaten (Zeitstempel/Größe/ETag) sind nur ein HINWEIS, kein
// Beweis für einen echten inhaltlichen Unterschied — ein Cloud-Speicher kann
// z. B. bei einem internen Datei-Scan eine neue ETag vergeben, ohne dass sich
// der Inhalt ändert. contentIdentical wird deshalb jetzt in ZWEI Fällen vom
// Aufrufer geprüft (siehe sync-ipc.js): beim allerersten Abgleich einer Datei
// (wie schon vorher) UND wenn Metadaten "beide Seiten geändert" nahelegen.
// Bewusst NICHT umgekehrt gelöst (z. B. einen Konflikt einfach nach einer
// gewissen Zeit "verjähren" lassen) — ein ECHTER Konflikt (Inhalt tatsächlich
// unterschiedlich) soll weiterhin bei jedem Abgleich gemeldet werden, bis der
// Nutzer ihn bewusst auflöst. Alles andere wäre ein stilles Verschwinden
// eines ungelösten, echten Unterschieds.
//
// Rückgabe: { action } mit action ∈
//   'upload' | 'download' | 'skip' | 'cleanup' |
//   'delete-local' | 'delete-remote' | 'conflict' (+ reason)
// ---------------------------------------------------------------------------
function classifyFile({ localExists, remoteExists, hasManifestEntry, localChanged, remoteChanged, contentIdentical }) {
  if (!localExists && !remoteExists) return { action: 'cleanup' };

  if (!hasManifestEntry) {
    if (localExists && remoteExists) {
      return contentIdentical
        ? { action: 'skip' }
        : { action: 'conflict', reason: 'Auf beiden Seiten unabhängig angelegt, mit unterschiedlichem Inhalt.' };
    }
    return localExists ? { action: 'upload' } : { action: 'download' };
  }

  // War schon mal synchronisiert.
  if (!localExists && remoteExists) {
    return remoteChanged
      ? { action: 'conflict', reason: 'Lokal gelöscht, aber remote seitdem geändert.' }
      : { action: 'delete-remote' };
  }
  if (localExists && !remoteExists) {
    return localChanged
      ? { action: 'conflict', reason: 'Remote gelöscht, aber lokal seitdem geändert.' }
      : { action: 'delete-local' };
  }
  // Beide vorhanden:
  if (localChanged && remoteChanged) {
    // Metadaten sagen "beide Seiten geändert" — das allein reicht nicht mehr,
    // erst der echte Inhalt entscheidet (siehe Kommentar oben).
    return contentIdentical
      ? { action: 'skip' }
      : { action: 'conflict', reason: 'Auf beiden Seiten seit dem letzten Abgleich geändert.' };
  }
  if (localChanged) return { action: 'upload' };
  if (remoteChanged) return { action: 'download' };
  return { action: 'skip' };
}

module.exports = { classifyFile, isExcluded, TRASH_DIRNAME, MANIFEST_FILENAME };
