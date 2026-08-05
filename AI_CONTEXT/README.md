# AI_CONTEXT — Handbuch für künftige KI-Modelle

## Was ist AI_CONTEXT?

`AI_CONTEXT` ist die dauerhafte Wissensbasis von Archiv-Wiki. Es ist die Sammlung aller endgültigen, langfristig gültigen Entscheidungen über Architektur, Design, Bedienkonzepte und Arbeitsweise dieses Projekts — geschrieben, damit ein neues KI-Modell (Claude, ChatGPT oder ein anderes) Archiv-Wiki innerhalb weniger Minuten verstehen kann, ohne den gesamten Quellcode oder die gesamte Entwicklungsgeschichte durcharbeiten zu müssen.

## Warum existiert AI_CONTEXT?

Ohne eine solche Wissensbasis müsste jedes neu hinzukommende KI-Modell dieselben architektonischen Entscheidungen, Designregeln und Projektprinzipien erneut aus dem Code herauslesen oder erraten — mit dem Risiko, bereits getroffene, bewusste Entscheidungen unabsichtlich zu wiederholen, zu widersprechen oder rückgängig zu machen. `AI_CONTEXT` macht dieses Wissen explizit und sofort verfügbar.

## Was AI_CONTEXT NICHT ist

- **Kein Ersatz für Code-Dokumentation.** Wie eine Funktion oder ein Modul im Detail funktioniert, steht im Code selbst, nicht hier.
- **Kein Ersatz für Kommentare im Quellcode.** Technische Begründungen einzelner Codezeilen gehören in den Code, nicht in `AI_CONTEXT`.
- **Kein Ort für Analysen, Testberichte oder Chatverläufe.** `AI_CONTEXT` beschreibt ausschließlich den aktuellen, endgültigen Zustand und dauerhaft gültige Regeln — nicht, wie dieser Zustand entstanden ist, welche Zwischenschritte es gab oder was in welcher Unterhaltung besprochen wurde.

## Wie die Dateien genutzt werden sollen

Jede Datei in `AI_CONTEXT` behandelt genau einen Bereich des Projekts und ist in sich abgeschlossen. Ein KI-Modell, das an einem bestimmten Bereich arbeitet (z. B. dem Editor), liest die entsprechende Datei vollständig, bevor es Änderungen vornimmt — nicht nur die vermutlich relevanten Abschnitte. Bestehende Entscheidungen in diesen Dateien werden als verbindlich behandelt, nicht als unverbindliche Vorschläge.

## Empfohlene Lesereihenfolge für neue KI-Modelle

1. **`00_PROJECT_STATUS.md`** — womit wird gerade gearbeitet, was ist fertig
2. **`01_PROJECT_PHILOSOPHY.md`** — warum es dieses Projekt in dieser Form gibt
3. **`02_DESIGN_GUIDELINES.md`** und **`03_PROGRAMMING_RULES.md`** — die beiden bereichsübergreifenden Regelwerke, die für jede Änderung gelten, unabhängig davon, an welchem Teil der Anwendung gearbeitet wird
4. **`04_RELEASE_WORKFLOW.md`** und **`05_DELIVERY_STANDARD.md`** — wie Arbeit abgeschlossen und veröffentlicht wird
5. **`06`–`11`** (Dashboard, Sidebar, Editor, Einstellungen, Suche, Backup) — je nach tatsächlichem Arbeitsbereich, nicht zwingend vollständig, aber immer die Datei des Bereichs, an dem gerade gearbeitet wird
6. **`12_KNOWN_DECISIONS.md`** — als schnelles Nachschlagewerk, sobald eine konkrete Detailfrage auftaucht, ob eine bestimmte Entscheidung bereits getroffen wurde
7. **`13_ROADMAP.md`** — nur relevant, wenn tatsächlich nach zukünftig geplanten Schritten gefragt wird

## Wie AI_CONTEXT gepflegt wird

Nach jedem abgeschlossenen Hauptbereich einer Änderung werden die passenden `AI_CONTEXT`-Dateien aktualisiert — nicht erst am Ende eines größeren Arbeitszyklus. Eine Aktualisierung beschreibt ausschließlich den neuen, endgültigen Zustand, nicht den Weg dorthin. Neue Funktionen werden immer nach den bereits in `AI_CONTEXT` festgehaltenen Projektregeln entwickelt, nicht nach neu erfundenen, abweichenden Mustern.

## Übersicht aller Dateien

| Datei | Zweck | Aktualisieren, wenn … |
|---|---|---|
| `00_PROJECT_STATUS.md` | Momentaufnahme des aktuellen Entwicklungsstands | sich Version, fertiggestellte oder laufende Bereiche ändern |
| `01_PROJECT_PHILOSOPHY.md` | Grundhaltung und Werte des Projekts | sich die grundsätzliche Ausrichtung des Projekts bewusst ändert (selten) |
| `02_DESIGN_GUIDELINES.md` | Verbindliches visuelles Designsystem | eine neue, endgültige Design-Entscheidung getroffen wird |
| `03_PROGRAMMING_RULES.md` | Verbindliche Programmier- und Architekturregeln | eine neue, dauerhafte Regel für die Code-Arbeit entsteht |
| `04_RELEASE_WORKFLOW.md` | Ablauf einer Veröffentlichung | sich der tatsächliche Release-Ablauf ändert |
| `05_DELIVERY_STANDARD.md` | Standard für die Übergabe fertiger Arbeit | sich die Art und Weise der Arbeitsübergabe ändert |
| `06_DASHBOARD.md` | Endgültiges Konzept des Dashboards | eine Änderung am Dashboard abgeschlossen wird |
| `07_SIDEBAR.md` | Endgültiges Konzept der Sidebar | eine Änderung an der Sidebar abgeschlossen wird |
| `08_EDITOR.md` | Endgültiges Konzept des Editor-Bereichs | eine Änderung am Editor abgeschlossen wird |
| `09_SETTINGS.md` | Endgültiges Konzept des Einstellungsfensters | eine Änderung an den Einstellungen abgeschlossen wird |
| `10_SEARCH.md` | Endgültiges Konzept des Suchsystems | eine Änderung an der Suche abgeschlossen wird |
| `11_BACKUP.md` | Endgültiges Konzept des Backup-Systems | eine Änderung am Backup-System abgeschlossen wird |
| `12_KNOWN_DECISIONS.md` | Zentrales, verdichtetes Nachschlagewerk aller Entscheidungen | jede neue, endgültige Entscheidung aus einer anderen Datei ergänzt wird |
| `13_ROADMAP.md` | Tatsächlich beschlossene zukünftige Schritte | eine echte, neue Priorität oder Planung feststeht |

## Regeln für zukünftige KI-Modelle

- **Vor jeder Änderung zuerst `AI_CONTEXT` lesen** — nicht direkt in den Code springen.
- **Bestehende Architektur respektieren**, statt sie für eine einzelne Änderung zu umgehen.
- **Bestehendes Designsystem verwenden**, keine neuen, abweichenden visuellen Werte einführen.
- **Keine doppelten Funktionen entwickeln** — vor neuem Code prüfen, ob bereits etwas Vergleichbares existiert.
- **Bereits getroffene Projektentscheidungen beachten**, auch wenn eine andere Lösung im Moment naheliegender erscheint.
- **`AI_CONTEXT` nach jedem abgeschlossenen Hauptbereich aktuell halten**, damit die Wissensbasis nie hinter dem tatsächlichen Zustand des Projekts zurückbleibt.
- **Vor größeren Änderungen zunächst den betroffenen Bereich analysieren.
- **Erst nach einer gemeinsamen Entscheidung mit dem Nutzer Änderungen umsetzen.
- **Keine umfangreichen Umbauten ohne vorherige Abstimmung durchführen.
- **Vor dem Abschluss eines größeren Arbeitsbereichs prüfen, ob AI_CONTEXT aktualisiert werden muss.
- **Dauerhaftes Projektwissen soll unmittelbar dokumentiert werden und nicht erst nach mehreren Releases.
