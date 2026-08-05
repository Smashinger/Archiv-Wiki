# Archiv-Wiki — Backup-System

## Ziel

Eine stille, im Hintergrund laufende Absicherung gegen Datenverlust — ohne dass der Nutzer sich aktiv darum kümmern muss. Backups dienen der Notfall-Wiederherstellung, nicht der Versionsgeschichte einzelner Notizen.

## Automatische Backups

Läuft als Hintergrund-Vorgang, unabhängig von Nutzerinteraktion. Format: ein vollständiges ZIP-Archiv des gesamten Projektordners (dieselbe Zip-Funktion wie beim manuellen Projekt-Export), benannt nach Datum (`backup-JJJJ-MM-TT.zip`).

- **Intervall wählbar:** Deaktiviert, Täglich (Standard), Alle 3 Tage, Wöchentlich, Alle 2 Wochen, Monatlich.
- **Ein Lauf pro fälligem Zeitpunkt genügt:** Ob ein Backup fällig ist, wird direkt aus dem Datum der zuletzt vorhandenen Backup-Datei in diesem Ordner abgeleitet, nicht aus einem separaten, globalen Zeitstempel — dadurch funktioniert das Intervall korrekt pro Projekt, auch wenn mehrere Projekte unterschiedliche Backup-Ordner verwenden.
- **Aufbewahrung:** Die 14 neuesten Backups bleiben erhalten (bei täglichem Rhythmus etwa zwei Wochen), ältere werden automatisch entfernt.
- **Sicheres Schreiben:** Ein neues Backup wird zunächst vollständig in eine temporäre Datei geschrieben und erst nach erfolgreichem Abschluss an die endgültige Stelle verschoben. Ein vorhandenes, bereits funktionierendes Backup wird dadurch nie durch einen fehlgeschlagenen, neuen Versuch beschädigt oder verloren.
- **Fehlschläge werden sichtbar gemerkt:** Anzahl aufeinanderfolgender Fehlschläge sowie die letzte Fehlermeldung werden dauerhaft und eindeutig pro Projekt gespeichert (nicht nur in der Konsole protokolliert), damit ein wiederholtes Scheitern dem Nutzer auffällt, auch wenn er nicht im exakten Moment hinsieht.
- Ein fehlgeschlagenes Hintergrund-Backup unterbricht die Anwendung nicht — es wird beim nächsten fälligen Zeitpunkt erneut versucht.

## Manuelle Backups

Ein "Backup jetzt erstellen"-Knopf in den Einstellungen erzwingt ein Backup unabhängig vom eingestellten Intervall — mit derselben sicheren Schreib-Logik wie automatische Backups (temporäre Datei, erst bei Erfolg übernommen). Während eines laufenden Backups sind weitere manuelle Startmöglichkeiten deaktiviert und zeigen den gemeinsamen laufenden Zustand. Nach Abschluss erscheint im Backup-Bereich eine kurze Inline-Rückmeldung über Erfolg oder Fehler.

## Speicherort

Ein frei wählbarer Ordner, pro Projekt festgelegt (beim Einrichten des Projekts gewählt, später jederzeit änderbar). Ein Knopf öffnet den Backup-Ordner direkt im Dateimanager des Betriebssystems.

## Wiederherstellung

Es gibt **keinen automatischen "Wiederherstellen"-Knopf innerhalb der Anwendung.** Ein Backup ist ein gewöhnliches ZIP-Archiv mit dem vollständigen Projektordner-Inhalt — die Wiederherstellung erfolgt manuell: Backup-Ordner öffnen, gewünschtes Archiv entpacken, Inhalt an die gewünschte Stelle kopieren. Das ist eine bewusste Einfachheit: kein zusätzlicher, fehleranfälliger automatischer Wiederherstellungs-Mechanismus, der selbst wieder Fehlerquellen mitbringen würde.

## Einstellungen

Im Einstellungsfenster, Abschnitt "Backup" (siehe `09_SETTINGS.md`): Backup-Ordner (mit Ändern-Möglichkeit), Intervall-Auswahl, Anzeige des letzten erfolgreichen sowie des nächsten geplanten Backups, letzter projektbezogener Fehler, getrennte Aufräumwarnung, die beiden Knöpfe "Backup jetzt erstellen" und "Backup-Ordner öffnen" sowie eine kurze Anleitung zur manuellen Wiederherstellung.

## Regeln

- Automatische, manuelle und über das Tray gestartete Backups verwenden dieselbe modulweite Sperre. Solange ein Backup läuft, startet kein zweiter Vorgang parallel.
- Erfolg, letzter Fehler, Fehleranzahl und zugehörige Zeitstempel werden projektbezogen im bestehenden App-Zustand gespeichert; beim Wechsel des Projekts darf kein Status eines anderen Projekts angezeigt werden.
- Nach jedem Backup-Ergebnis wird genau ein zentral erzeugter Status an die Oberfläche übertragen. Backup-Bereich und vorhandene Warnindikatoren beziehen ihren Zustand aus dieser gemeinsamen Statusquelle.
- Ein manuell gestartetes Backup liefert sein konkretes Ergebnis an den Backup-Bereich zurück; Erfolg und Fehler werden dort unmittelbar inline angezeigt. Hintergrund-Backups bleiben nicht-blockierend.
- Der letzte projektbezogene Backup-Fehler bleibt im Backup-Bereich sichtbar, bis ein erfolgreiches Backup ihn zurücksetzt. Technische Details sind zurückhaltend aufklappbar.
- Ein Aufräumfehler wird getrennt und weniger kritisch dargestellt: Das neue Backup gilt weiterhin als erfolgreich.
- Kann der Backup-Ordner nicht im Dateimanager geöffnet werden, erscheint eine verständliche Inline-Fehlermeldung statt eines stillen Fehlers.
- Das Toolbar-Warnsymbol verwendet das bestehende monochrome SVG-Icon-System. Der Fehlerdialog folgt dem modalen Dialogstandard mit Semantik, initialem Fokus, Fokusfalle, Escape-Schließen und Fokus-Rückgabe; Klick außerhalb schließt ihn nicht.
- Backups verwenden ausschließlich die bereits bestehende Zip-Export-Funktion — keine eigene, zweite Archivierungslogik.
- Ein neues Backup wird niemals durch Löschen der bestehenden, letzten guten Datei VOR dem eigentlichen Schreibvorgang vorbereitet — immer erst temporär schreiben, die ZIP-Struktur prüfen und erst danach bei Erfolg ersetzen.
- Der Backup-Ordner darf weder mit dem Projektordner identisch sein noch innerhalb des Projektordners liegen. Diese Prüfung erfolgt zentral im Hauptprozess und berücksichtigt normalisierte beziehungsweise über bestehende Symlinks aufgelöste Pfade.
- Vor einem neuen Lauf werden ausschließlich eindeutig zu Archiv-Wiki gehörende, veraltete Temp-Dateien im Format `backup-JJJJ-MM-TT.zip.tmp-<pid>` entfernt. Normale ZIP-Dateien und fremde Dateien werden nie berührt.
- Die temporäre ZIP-Datei wird vor der finalen Übernahme strukturell validiert: ZIP-Abschluss, zentrales Verzeichnis und referenzierte lokale Dateiköpfe müssen konsistent und lesbar sein.
- Beim Beenden erhält ein laufendes Backup zunächst Zeit zum sauberen Abschluss. Bleibt es aktiv, wird ausschließlich der temporäre Schreibvorgang kontrolliert abgebrochen und die Temp-Datei entfernt; eine bestehende endgültige Sicherung bleibt unangetastet.
- Fehler beim Löschen alter Backups werden getrennt als Aufräumfehler gespeichert. Sie machen einen bereits erfolgreich erstellten neuen Snapshot nicht nachträglich zu einem fehlgeschlagenen Backup.
- Fehlschläge werden immer sowohl protokolliert als auch dauerhaft gespeichert, damit sie später in der Oberfläche sichtbar gemacht werden können — ein reines Konsolen-Log allein genügt nicht.
- Die Backup-Fälligkeit wird immer aus dem tatsächlichen Zustand des jeweiligen Backup-Ordners abgeleitet, nie aus einem globalen, app-weiten Zeitstempel.

## Spätere Erweiterungen

Eine In-App-Wiederherstellungsfunktion ist architektonisch denkbar (Backups sind bereits strukturierte, vorhersehbar benannte ZIP-Archive), aber aktuell bewusst nicht gebaut und nicht konkret geplant.
