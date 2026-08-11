# AI_CONTEXT — Handbuch für künftige KI-Modelle

## Was ist AI_CONTEXT?

`AI_CONTEXT` ist die dauerhafte, kanonische und nicht chronologische Wissensbasis von Archiv-Wiki. Sie enthält den aktuellen Projektstatus sowie langfristig gültige Entscheidungen über Architektur, Design, Bedienkonzepte und Arbeitsweise. Ein neuer Coding-Agent soll Archiv-Wiki damit schnell verstehen können, ohne den gesamten Quellcode oder eine Entwicklungsgeschichte durcharbeiten zu müssen.

## Warum existiert AI_CONTEXT?

Ohne eine solche Wissensbasis müsste jedes neu hinzukommende KI-Modell dieselben architektonischen Entscheidungen, Designregeln und Projektprinzipien erneut aus dem Code herauslesen oder erraten — mit dem Risiko, bereits getroffene, bewusste Entscheidungen unabsichtlich zu wiederholen, zu widersprechen oder rückgängig zu machen. `AI_CONTEXT` macht dieses Wissen explizit und sofort verfügbar.

## Was AI_CONTEXT NICHT ist

- **Kein Ersatz für Code-Dokumentation.** Wie eine Funktion oder ein Modul im Detail funktioniert, steht im Code selbst, nicht hier.
- **Kein Ersatz für Kommentare im Quellcode.** Technische Begründungen einzelner Codezeilen gehören in den Code, nicht in `AI_CONTEXT`.
- **Kein Ort für Analysen, Testberichte oder Chatverläufe.** `AI_CONTEXT` beschreibt ausschließlich den aktuellen, endgültigen Zustand und dauerhaft gültige Regeln — nicht, wie dieser Zustand entstanden ist, welche Zwischenschritte es gab oder was in welcher Unterhaltung besprochen wurde.
- **Keine Sammlung alter Arbeitsaufträge oder Übergaben.** Historische Projekt- und Entwicklungsdokumente gehören außerhalb von `AI_CONTEXT`, beispielsweise nach `docs/history/`.
- **Keine Release-Chronik.** Veröffentlichungsregeln stehen hier, einzelne historische Releases und Tagesstände nicht.

## Wie die Dateien genutzt werden sollen

Jede Datei besitzt eine klare Zuständigkeit. Vor Änderungen werden mindestens die allgemeinen Projektregeln und die für den Auftrag zuständigen Fachdateien vollständig gelesen. Es ist nicht erforderlich, für jede kleine Änderung alle Dateien erneut zu lesen. Berühren mehrere Dokumente dasselbe Thema, gilt die jeweils benannte Detailquelle; übergreifende Zusammenfassungen ersetzen sie nicht.

## Empfohlene Lesereihenfolge für neue KI-Modelle

1. **`README.md`** — Aufbau, Zuständigkeiten und Nutzung von `AI_CONTEXT`
2. **`00_PROJECT_STATUS.md`** — aktueller technischer und funktionaler Projektstand
3. **`01_PROJECT_PHILOSOPHY.md`** — Grundprinzipien und Ausrichtung des Projekts
4. **`03_PROGRAMMING_RULES.md`** — verbindliche Regeln für Architektur und Code-Arbeit
5. **`12_KNOWN_DECISIONS.md`** — dauerhafte, übergreifende Entscheidungen
6. Danach die für den konkreten Auftrag zuständigen Fachdateien. Bei Oberflächenarbeit gehören je nach Umfang `02_DESIGN_GUIDELINES.md`, `14_DESIGNSYSTEM.md` und `15_HUMAN_INTERFACE.md` dazu.
7. **`05_DELIVERY_STANDARD.md`** vor der Übergabe fertiger Arbeit und **`04_RELEASE_WORKFLOW.md`** nur bei Packaging- oder Release-Aufgaben.
8. **`13_ROADMAP.md`** nur für tatsächlich beschlossene zukünftige Vorhaben, nicht als Sammlung von Ideen oder alten Arbeitsaufträgen.

## Kanonische Zuständigkeiten

- `00_PROJECT_STATUS.md` ist die Quelle für den aktuellen Projektstatus.
- `07_SIDEBAR.md`, `08_EDITOR.md`, `09_SETTINGS.md`, `10_SEARCH.md` und `11_BACKUP.md` sind die Detailquellen ihrer gleichnamigen Fachbereiche.
- `04_RELEASE_WORKFLOW.md` ist die Detailquelle für Packaging und Release.
- `12_KNOWN_DECISIONS.md` enthält dauerhafte, übergreifende Entscheidungen und das Eingang-Datenmodell. Ergänzende aktuelle Aussagen zum Eingang stehen in `00_PROJECT_STATUS.md`, `07_SIDEBAR.md` und `09_SETTINGS.md`; eine eigene Eingang-Datei ist nicht vorgesehen.
- `16_WEB_CLIPPER.md` ist die kanonische technische Quelle für Web-Clipper-Architektur und Browserintegration: gemeinsame Extension-Codebasis, Native Messaging, Browser-IDs, Firefox, Brave/Chromium, AppImage, Brave Flatpak, signierte CRX sowie technische Privacy- und Security-Grenzen. Release-Details bleiben in `04_RELEASE_WORKFLOW.md`, sichtbare Einstellungen in `09_SETTINGS.md` und Eingang-Entscheidungen in `12_KNOWN_DECISIONS.md`.
- `02_DESIGN_GUIDELINES.md` enthält allgemeine visuelle Regeln und Designprinzipien. `14_DESIGNSYSTEM.md` beschreibt die konkrete strukturelle UI-Systematik und die Beziehungen der Oberflächenbereiche. `15_HUMAN_INTERFACE.md` regelt Bedienprinzipien, Interaktionsverhalten und Nutzerführung. Die drei Dateien ergänzen sich und sind keine konkurrierenden Designquellen.

## Wie AI_CONTEXT gepflegt wird

Nach einem abgeschlossenen Hauptbereich werden die zuständigen `AI_CONTEXT`-Dateien aktualisiert, wenn dauerhaftes Projektwissen betroffen ist. Eine Aktualisierung beschreibt ausschließlich den gültigen Zustand und die bleibenden Regeln, nicht den Weg dorthin. Neue Funktionen folgen den bereits dokumentierten Projektregeln. Tatsächlich beschlossene zukünftige Vorhaben gehören in `13_ROADMAP.md`; Ideen und unverbindliche Wünsche werden nicht automatisch zur Roadmap.

## Übersicht aller Dateien

| Datei | Zweck | Aktualisieren, wenn … |
|---|---|---|
| `README.md` | Inventar, Zuständigkeiten und Lesereihenfolge von `AI_CONTEXT` | sich die kanonische Struktur oder Nutzung von `AI_CONTEXT` ändert |
| `00_PROJECT_STATUS.md` | Momentaufnahme des aktuellen Entwicklungsstands | sich Version, fertiggestellte oder laufende Bereiche ändern |
| `01_PROJECT_PHILOSOPHY.md` | Grundhaltung und Werte des Projekts | sich die grundsätzliche Ausrichtung des Projekts bewusst ändert (selten) |
| `02_DESIGN_GUIDELINES.md` | Allgemeine visuelle Regeln und Designprinzipien | eine dauerhafte allgemeine Designregel entsteht oder sich ändert |
| `03_PROGRAMMING_RULES.md` | Verbindliche Programmier- und Architekturregeln | eine neue, dauerhafte Regel für die Code-Arbeit entsteht |
| `04_RELEASE_WORKFLOW.md` | Packaging- und Release-Ablauf | sich der tatsächliche Packaging- oder Release-Ablauf ändert |
| `05_DELIVERY_STANDARD.md` | Standard für die Übergabe fertiger Arbeit | sich die Art und Weise der Arbeitsübergabe ändert |
| `06_DASHBOARD.md` | Kanonisches Konzept des Dashboards | eine dauerhafte Dashboard-Änderung abgeschlossen wird |
| `07_SIDEBAR.md` | Kanonisches Konzept der Sidebar | eine dauerhafte Sidebar-Änderung abgeschlossen wird |
| `08_EDITOR.md` | Kanonisches Konzept des Editor-Bereichs | eine dauerhafte Editor-Änderung abgeschlossen wird |
| `09_SETTINGS.md` | Kanonisches Konzept des Einstellungsfensters | eine dauerhafte Einstellungsänderung abgeschlossen wird |
| `10_SEARCH.md` | Kanonisches Konzept des Suchsystems | eine dauerhafte Suchänderung abgeschlossen wird |
| `11_BACKUP.md` | Kanonisches Konzept des Backup-Systems | eine dauerhafte Backup-Änderung abgeschlossen wird |
| `12_KNOWN_DECISIONS.md` | Übergreifende Entscheidungen und Eingang-Datenmodell | eine dauerhafte, bereichsübergreifende Entscheidung entsteht oder sich ändert |
| `13_ROADMAP.md` | Tatsächlich beschlossene zukünftige Vorhaben | eine verbindliche neue Priorität oder Planung feststeht |
| `14_DESIGNSYSTEM.md` | Strukturelle UI-Systematik und Beziehungen der Oberflächenbereiche | sich die konkrete UI-Struktur oder ihre systematische Beziehung ändert |
| `15_HUMAN_INTERFACE.md` | Bedienprinzipien, Interaktionsverhalten und Nutzerführung | sich ein dauerhaftes Interaktions- oder Bedienprinzip ändert |
| `16_WEB_CLIPPER.md` | Technische Web-Clipper-Architektur und Browserintegration | sich Web-Clipper-Codebasis, Transport, Browserintegration oder Distribution dauerhaft ändert |

Die historische Entwicklungsübergabe liegt unter `docs/history/Archiv-Wiki_Entwicklungsübergabe.md`. Sie ist kein aktiver Bestandteil der kanonischen `AI_CONTEXT`-Wissensbasis.

## Regeln für zukünftige KI-Modelle

- **Vor jeder Änderung die allgemeinen Regeln und zuständigen Fachdateien lesen** — nicht direkt in den Code springen, aber auch nicht unnötig jede Kontextdatei laden.
- **Bestehende Architektur respektieren**, statt sie für eine einzelne Änderung zu umgehen.
- **Bestehendes Designsystem verwenden**, keine neuen, abweichenden visuellen Werte einführen.
- **Keine doppelten Funktionen entwickeln** — vor neuem Code prüfen, ob bereits etwas Vergleichbares existiert.
- **Bereits getroffene Projektentscheidungen beachten**, auch wenn eine andere Lösung im Moment naheliegender erscheint.
- **`AI_CONTEXT` nach jedem abgeschlossenen Hauptbereich aktuell halten**, damit die Wissensbasis nie hinter dem tatsächlichen Zustand des Projekts zurückbleibt.
- **Vor größeren Änderungen zunächst den betroffenen Bereich analysieren.**
- **Erst nach einer gemeinsamen Entscheidung mit dem Nutzer Änderungen umsetzen.**
- **Keine umfangreichen Umbauten ohne vorherige Abstimmung durchführen.**
- **Vor dem Abschluss eines größeren Arbeitsbereichs prüfen, ob `AI_CONTEXT` aktualisiert werden muss.**
- **Dauerhaftes Projektwissen unmittelbar dokumentieren und nicht erst nach mehreren Releases.**
