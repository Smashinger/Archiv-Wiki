# Archiv-Wiki — Projektstatus

## Aktuelle Version

v2.0.0 (technischer Release-Kandidat)

## Aktueller Entwicklungsstand

Archiv-Wiki ist eine vollständig funktionsfähige, im täglichen Gebrauch befindliche Desktop-Anwendung. Alle Kernbereiche (Notizverwaltung, Editor, Vorschau, Einstellungen, Backup, Export, Synchronisierung) sind implementiert und einsatzbereit. Der Editor-Bereich hat gerade eine umfassende, mehrstufige Überarbeitung und Politur durchlaufen und gilt aus UX-Sicht als abgeschlossen.

## Fertiggestellte Hauptbereiche

- **Editor** (Layout, Werkzeugleiste, Schreibkomfort, Vorschau-Rendering, Navigation, Performance, Einstellungen, visuelle Feinabstimmung) — vollständig überarbeitet und final poliert
- **Vorschau-Rendering** (Markdown-Darstellung, Callouts, Wikilinks, Bilder, Tabellen, Codeblöcke, KaTeX, Lesebreite, Druckansicht)
- **Sidebar/Navigation** (Kategorie-Baum, Ein-/Ausklappen, Größenänderung, aktive Kategorie-Hervorhebung)
- **Dashboard** (Statistiken, angeheftete/zuletzt bearbeitete Notizen, Sperr-/Umsortier-Funktion)
- **Einstellungsfenster** (alle sechs Abschnitte: Allgemein, Darstellung, Editor, Backup, Updates, Sicherheit)
- **Papierkorb** (weiches Löschen, Wiederherstellung, endgültiges Leeren)
- **Tags/Schlagworte** (Übersicht, Filterung)
- **Backup** (automatische Sicherung)
- **Export** (PDF, HTML, Markdown, ZIP)
- **Ersteinrichtungs-Assistent**

## Bereiche in Arbeit

- **AI_CONTEXT-Wissensbasis** — wird gerade aufgebaut (dieser Ordner selbst)

Darüber hinaus ist aktuell kein Hauptbereich in aktiver, laufender Überarbeitung.

## Noch nicht begonnene Hauptbereiche

Keine bekannten, vollständig fehlenden Hauptbereiche. Der Funktionsumfang der Anwendung ist vollständig; offene Punkte betreffen einzelne, kleinere Aspekte innerhalb bereits bestehender Bereiche (siehe unten), keine gänzlich neuen Anwendungsteile.

## Aktuelle Priorität

Aufbau der `AI_CONTEXT`-Wissensbasis, damit künftige Arbeit (durch Menschen oder KI-Modelle) ohne erneute vollständige Code-Durchsicht anschlussfähig ist.

## Bekannte größere Baustellen

- **Rechtschreibprüfung** ist aktuell fest auf Deutsch beschränkt, keine Mehrsprachigkeit.
- **Tabellen-Bearbeitungsfenster** bietet keine Zell-zu-Zell-Navigation per Pfeiltasten (nur Standard-Tab-Fokuswechsel) und ist ausschließlich per Mausklick (Doppelklick in der Vorschau) erreichbar, nicht über die Tastatur.
- **Bild-Größen-Wrapper** passt seine eigene Breite nicht automatisch an, wenn ein Bild prozentual verkleinert wird — der umschließende Rahmen bleibt bei der ursprünglichen Breite stehen, auch wenn das sichtbare Bild selbst kleiner ist.
- **Vorschau-Rendering bei sehr großen Dokumenten** bleibt rechenintensiv; die Häufigkeit der Aktualisierung wurde entkoppelt (Entprellung), die zugrundeliegende Rendering-Dauer selbst ist unverändert hoch.


## Technischer Abschlussstand für 2.0.0

- Kritische Primärschreibpfade für Notizen, `.wiki-config.json`, `app-state.json` und WebDAV-Downloads verwenden die gemeinsame atomare Schreibstrategie. Vorhandene Dateien bleiben bei einem fehlgeschlagenen Schreiben unverändert; temporäre Dateien werden bestmöglich entfernt.
- Eine `package-lock.json` für den tatsächlich bisher verwendeten Abhängigkeitsstand ist Bestandteil des Projekts. Sie fixiert unter anderem Electron 28.3.3 und electron-updater 6.8.9.
- Der atomare Schreibhelfer sowie die Anbindung von Notizen, Projektkonfiguration und App-State wurden mit Erfolg und simuliertem Übernahmefehler geprüft. JavaScript-Syntax und Lockdatei-Metadaten wurden erfolgreich validiert.
- WebDAV wurde vom Nutzer im realen Betrieb als zuverlässig bestätigt. Die Downloadpfade übernehmen lokale Dateien erst nach vollständig abgeschlossenem Download atomar.
- Bekannte Einschränkung der isolierten Build-Umgebung: `npm ci` konnte hier nicht vollständig ausgeführt werden, weil die bereitgestellte npm-Paketquelle benötigte Pakete mit HTTP 404 nicht auslieferte. Ein lokaler `npm ci`-Test mit normalem npm-Registry-Zugriff bleibt vor Veröffentlichung erforderlich.
- Der echte AppImage-zu-AppImage-End-to-End-Test bleibt der abschließende manuelle technische Release-Test.
