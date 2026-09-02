# Archiv-Wiki – verbindliche Regeln für Codex

## Maßgebliche Arbeitsbasis

- Arbeite ausschließlich im aktuell geöffneten Projektordner:
  `/home/smashii/Dokumente/Archiv Wiki/archiv-wiki`
- Dieser lokale Projektordner ist die allein maßgebliche Codebasis.
- Frühere Codex-Web-Sitzungen dürfen nur als Gesprächskontext verwendet werden.
- Verändere keine Dateien außerhalb dieses Projektordners.
- Falls ein Zugriff außerhalb des Projektordners notwendig erscheint: zuerst stoppen und mich fragen.

## Schutz meiner echten Archiv-Wiki-Daten

- Mein normales Archiv-Wiki-Benutzerprofil ist für Entwicklungs- und automatisierte Tests tabu.
- Mein echter Wiki-/Notizordner ist für Entwicklungs- und automatisierte Tests tabu.
- Echte Notizen dürfen niemals für Tests erstellt, verändert, gelöscht, verschoben oder umbenannt werden.
- Keine automatisierten Tests gegen meine persönlichen Archiv-Wiki-Daten durchführen.

## Isolierte Testumgebung

Für Entwicklungs- und Electron-Tests ausschließlich folgende projektlokale Testdaten verwenden:

- Testprofil:
  `/home/smashii/Dokumente/Archiv Wiki/archiv-wiki/.Codex-test-home`

- Test-Wiki:
  `/home/smashii/Dokumente/Archiv Wiki/archiv-wiki/.Codex-test-wiki`

Vor Tests dürfen diese Verzeichnisse bei Bedarf angelegt werden.

Archiv-Wiki niemals einfach mit meinem normalen Benutzerprofil starten.

Für einen Entwicklungsstart bevorzugt dieses Schema verwenden:

HOME="$PWD/.Codex-test-home" \
XDG_CONFIG_HOME="$PWD/.Codex-test-home/.config" \
XDG_CACHE_HOME="$PWD/.Codex-test-home/.cache" \
XDG_DATA_HOME="$PWD/.Codex-test-home/.local/share" \
npm run dev

Falls beim ersten Start ein Wiki-Verzeichnis ausgewählt werden muss, ausschließlich verwenden:

`/home/smashii/Dokumente/Archiv Wiki/archiv-wiki/.Codex-test-wiki`

Falls ein Test nur mit Zugriff auf echte Nutzerdaten möglich wäre:
STOPPEN und zuerst mich fragen.

## Git und GitHub

- Keine GitHub-Branches erstellen.
- Nichts zu GitHub pushen.
- Keine Pull Requests erstellen oder verändern.
- Keine Releases erstellen oder verändern.
- Keine Remote-Repositories verändern.
- Kein Git-Repository initialisieren.
- Keine neuen lokalen Git-Branches anlegen.
- GitHub ist nicht Teil des normalen Entwicklungsablaufs.
- Git-/GitHub-Schreibaktionen nur durchführen, wenn ich sie ausdrücklich für den konkreten Schritt anfordere.
- Read-only Prüfungen wie `git status` sind erlaubt, falls ein Git-Repository vorhanden ist.

## Entwicklungsworkflow

- Kleine, klar begrenzte Entwicklungsblöcke.
- Zuerst aktuellen lokalen Code prüfen.
- Keine Annahmen aus alten Web-Sitzungen als aktuellen Code-Zustand behandeln.
- Bestehende Architektur und Komponenten bevorzugen.
- Keine Architekturänderung ohne echten Bedarf.
- Nach jeder Änderung lokal testen.
- Danach Ergebnis berichten und stoppen.
- Nicht selbstständig mit dem nächsten Masterplan-Punkt beginnen.

## Schutzgrenzen Archiv-Wiki

Ohne ausdrücklichen Auftrag nicht unnötig verändern:

- Web Clipper / Firefox-/Brave-Integration
- GitHub Release-/Update-System
- Wiki-Link-Integrität
- Backup-/Sync-Logik
- Notiz-Speicherformat
- bestehende Nutzerdaten

## Grundsatz

Der lokale Archiv-Wiki-Projektordner ist die Entwicklungsbasis.

Meine persönlichen Archiv-Wiki-Daten sind keine Testdaten.
