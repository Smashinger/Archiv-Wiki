# Archiv-Wiki — Projektstatus

## Aktueller lokaler technischer Stand

v2.2.0

Diese Angabe beschreibt den lokal bestätigten technischen Stand der Anwendung (`package.json`). Ein öffentlicher Veröffentlichungsstatus von v2.1.1 wird daraus nicht abgeleitet.

## Aktueller Entwicklungsstand

Archiv-Wiki ist eine vollständig funktionsfähige, im täglichen Gebrauch befindliche Desktop-Anwendung. Alle Kernbereiche (Notizverwaltung, Editor, Vorschau, Einstellungen, Eingang, Web Clipper, Wissenspflege, Backup, Export, Synchronisierung) sind implementiert und einsatzbereit. Funktional ist die Anwendung damit fertig; die **visuelle Angleichung von Design2 an den bestätigten Ziel-Referenzentwurf ist ein aktiver, noch nicht abgeschlossener Arbeitsstrang**. Editor und Dashboard sind funktional abgeschlossen und in Classic final poliert; für Design2 gilt das nur für die konkret einzeln akzeptierten Teilblöcke unten — keine der beiden Ansichten gilt insgesamt als visuell final.

## Fertiggestellte Hauptbereiche

- **Editor** (Layout, Werkzeugleiste, Schreibkomfort, Vorschau-Rendering, Navigation, Performance, Einstellungen, visuelle Feinabstimmung) — in Classic vollständig überarbeitet und final poliert
- **Vorschau-Rendering** (Markdown-Darstellung, Callouts, Wikilinks, Bilder, Tabellen, Codeblöcke, KaTeX, Lesebreite, Druckansicht)
- **Sidebar/Navigation** (Kategorie-Baum, Ein-/Ausklappen, Größenänderung, aktive Kategorie-Hervorhebung)
- **Dashboard** (Statistiken, angeheftete/zuletzt bearbeitete Notizen, Sperr-/Umsortier-Funktion)
- **Einstellungsfenster** (alle sieben Abschnitte: Allgemein, Darstellung, Editor, Backup, Updates, Web Clipper, Sicherheit)
- **Eingang** (getrennter Sammelbereich für Texte, Dateien, Bilder und Web-Clips mit Auswahl, Löschung und Verarbeitung zu Notizen)
- **Web Clipper** (Firefox Web Clipper öffentlich über Mozilla Add-ons verfügbar und als Endnutzerweg real bestätigt; Brave-/Chromium-Weg, Native Messaging, Eingang-Anbindung und signierte Chromium-CRX sind ebenfalls vorhanden)
- **Wissenspflege** (Prüfung auf defekte Wikilinks, Notizen ohne Tags und leere Notizen)
- **Papierkorb** (weiches Löschen, Wiederherstellung, endgültiges Leeren)
- **Archivierung** (Archivieren/Wiederherstellen, eigene Archiv-Seite, aktive Ansichten blenden archivierte Notizen aus, Such-Status Aktiv/Archiv/Alle)
- **Zentrale Tag-Verwaltung** (globale Übersicht inkl. archivierter Notizen, Umbenennen/Zusammenführen/Löschen als abgesicherte Massenoperation mit Backup-, Frische- und Undo-Schutz)
- **Mehrfachauswahl/Batch Operations** (zentraler Auswahlmodus für Notizen in Sidebar/Dashboard/Archiv; Verschieben, Archivieren, In den Papierkorb; jeweils mit Backup-, Frische- und Sync-Schutz; sitzungslokales Undo für Verschieben)
- **Eigene Titelleiste** (in die Anwendung integrierter oberer Fensterbereich ersetzt native Fensterdekoration und native Menüzeile unter Linux; Menüzugriff, Fenstersteuerung und bestehender Schließen-Ablauf bleiben vollständig erhalten)
- **Tags/Schlagworte** (Übersicht, Filterung)
- **Backup** (automatische Sicherung)
- **Export** (PDF, HTML, Markdown, ZIP)
- **Ersteinrichtungs-Assistent**

## AI_CONTEXT-Wissensbasis

Die `AI_CONTEXT`-Wissensbasis ist vollständig aufgebaut, strukturiert und fachlich bereinigt. Ihre kanonischen Zuständigkeiten sind festgelegt; sie dient als einsatzbereiter Projektkontext für zukünftige Entwicklungsarbeit.

Aktuell befindet sich die visuelle Design2-Angleichung als laufender Arbeitsstrang in Bearbeitung (siehe „Aktuelle Priorität"); kein anderer Hauptbereich ist aktiv in Überarbeitung.

## Noch nicht begonnene Hauptbereiche

Keine bekannten, vollständig fehlenden Hauptbereiche. Der Funktionsumfang der Anwendung ist vollständig; offene Punkte betreffen einzelne, kleinere Aspekte innerhalb bereits bestehender Bereiche (siehe unten) sowie die laufende Design2-Fidelity-Arbeit, keine gänzlich neuen Anwendungsteile.

## Design2-Fidelity-Stand

Folgende abgegrenzte Design2-Blöcke sind einzeln akzeptiert:

- **P1-B2**: live Design2-Navigationszähler für Eingang und Archiv.
- **P1-C1**: eine globale, 30px hohe Design2-Statusleiste über den bestehenden gemeinsamen Statusquellen.
- **P1-D1**: gemeinsame Design2-Dialogschale über der bestehenden Dialogstruktur.
- **P1-D2**: Design2-Einstellungen — Navigation und Inhalt über alle sieben bestehenden Abschnitte.

Alle vier Blöcke sind Teilblöcke, keine Aussage über eine vollständige Design2-Fidelity von Dashboard, Editor oder anderen Bereichen.

## Aktuelle Priorität

Der nächste Design2-Block ist noch nicht ausgewählt. Er wird aus einem aktuellen Soll-Ist-Abgleich von Code und Referenzentwurf bestimmt und erst nach ausdrücklicher Nutzerfreigabe begonnen — nicht automatisch aus einer alten Prioritätsangabe abgeleitet. Der Web-Clipper Security-&-Privacy-Audit bleibt ein möglicher, davon getrennter künftiger Auftrag, ist aber derzeit nicht die ausgewählte nächste Aufgabe und startet nicht implizit.

## Bekannte größere Baustellen

- **Rechtschreibprüfung** ist aktuell fest auf Deutsch beschränkt, keine Mehrsprachigkeit.
- **Tabellen-Bearbeitungsfenster** bietet keine Zell-zu-Zell-Navigation per Pfeiltasten (nur Standard-Tab-Fokuswechsel) und ist ausschließlich per Mausklick (Doppelklick in der Vorschau) erreichbar, nicht über die Tastatur.
- **Bild-Größen-Wrapper** passt seine eigene Breite nicht automatisch an, wenn ein Bild prozentual verkleinert wird — der umschließende Rahmen bleibt bei der ursprünglichen Breite stehen, auch wenn das sichtbare Bild selbst kleiner ist.
- **Vorschau-Rendering bei sehr großen Dokumenten** bleibt rechenintensiv; die Häufigkeit der Aktualisierung wurde entkoppelt (Entprellung), die zugrundeliegende Rendering-Dauer selbst ist unverändert hoch.


## Technische Grundlagen des aktuellen Stands

- Kritische Primärschreibpfade für Notizen, `.wiki-config.json`, `app-state.json` und WebDAV-Downloads verwenden die gemeinsame atomare Schreibstrategie. Vorhandene Dateien bleiben bei einem fehlgeschlagenen Schreiben unverändert; temporäre Dateien werden bestmöglich entfernt.
- Eine `package-lock.json` für den tatsächlich bisher verwendeten Abhängigkeitsstand ist Bestandteil des Projekts. Sie fixiert unter anderem Electron 28.3.3 und electron-updater 6.8.9.
- Der atomare Schreibhelfer sowie die Anbindung von Notizen, Projektkonfiguration und App-State wurden mit Erfolg und simuliertem Übernahmefehler geprüft. JavaScript-Syntax und Lockdatei-Metadaten wurden erfolgreich validiert.
- WebDAV wurde vom Nutzer im realen Betrieb als zuverlässig bestätigt. Die Downloadpfade übernehmen lokale Dateien erst nach vollständig abgeschlossenem Download atomar.
- Bekannte Einschränkung der isolierten Build-Umgebung: `npm ci` konnte hier nicht vollständig ausgeführt werden, weil die bereitgestellte npm-Paketquelle benötigte Pakete mit HTTP 404 nicht auslieferte. Ein lokaler `npm ci`-Test mit normalem npm-Registry-Zugriff bleibt vor Veröffentlichung erforderlich.
- Der echte AppImage-zu-AppImage-End-to-End-Test bleibt der abschließende manuelle technische Release-Test.
