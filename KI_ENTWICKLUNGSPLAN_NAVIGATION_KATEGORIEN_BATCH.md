# Archiv-Wiki v2.3.1 – KI-Navigation, Kategorien und Batch-Bearbeitung

Stand: 22.09.2026

## Fortschritt (für andere KI-Sitzungen: hier zuerst nachsehen)

| Block | Status |
|---|---|
| 1 – Notizen öffnen und zuletzt bearbeitet | ✅ ABGESCHLOSSEN (23.09.2026) |
| 2 – Kategorien zuverlässig auflisten | ✅ ABGESCHLOSSEN (23.09.2026) |
| 3 – Kategorien umbenennen und verschieben | ✅ ABGESCHLOSSEN (25.09.2026) |
| 4 – Reine Batch-Analyse | ✅ ABGESCHLOSSEN (25.09.2026) |
| 5 – Batch-Proposal für Inhaltsänderungen | ✅ ABGESCHLOSSEN (26.09.2026) |
| 6 – Umbenennungen und Wikilinks | ⬜ offen |
| 7 – Logische Reihenfolge | ⬜ offen |
| Abschließender Integrationsblock | ⬜ offen |

## Zweck dieses Dokuments

Dieses Dokument ist der Entwicklungs- und Übergabeplan für die nächsten Fähigkeiten der lokalen KI-Integration von Archiv-Wiki. Es soll von Claude Code, Codex oder anderen Entwicklungsassistenten verwendet werden können, ohne dass der vorherige Gesprächsverlauf benötigt wird.

Vor jeder Umsetzung müssen `AGENTS.md` und der aktuelle lokale Code erneut gelesen werden. Der aktuelle Code ist maßgeblich. Entwicklungs- und Electron-Tests dürfen ausschließlich mit `.Codex-test-home` und `.Codex-test-wiki` erfolgen. Das echte Benutzerprofil, das echte Wiki und persönliche Notizen dürfen niemals für Tests verwendet werden.

Die Blöcke sind nacheinander und einzeln umzusetzen. Nach jedem Block: gezielte Tests, vollständige Testsuite, Befundbericht und Stopp. Keine nachfolgenden Blöcke vorwegnehmen.

## Bestätigter Ausgangsstand

- Die KI kann unabhängig von der aktuellen Ansicht Notizen über `search_notes`, `read_note` und `list_notes` suchen und lesen.
- Auf dem Dashboard wird keine aktive Notiz an die KI übergeben; Wiki-Struktur und Wiki-Werkzeuge stehen trotzdem zur Verfügung.
- Es gibt kein KI-Werkzeug, das eine Notiz tatsächlich in der Benutzeroberfläche öffnet.
- Das Dashboard bestimmt „zuletzt bearbeitet“ aus `frontmatter.modified`, ersatzweise `frontmatter.created`.
- `list_notes` sortiert alphabetisch und liefert kein Änderungsdatum. Die KI kann „zuletzt bearbeitet“ deshalb aktuell nicht zuverlässig bestimmen.
- Die KI kann Kategorien anlegen, aber keine Kategorien umbenennen, verschieben oder neu anordnen.
- `notesFs.renameEntry()` unterstützt Notizen und Kategorien.
- `notesFs.moveEntry()` unterstützt Notizen und Unterkategorien. Hauptkategorien dürfen nicht unter andere Hauptkategorien verschoben werden.
- Der normale Dateisystem-IPC migriert bei Pfadänderungen gespeicherte Projektkonfigurationen. KI-Proposals dürfen diese Migration nicht umgehen.
- Manuelle Batch-Funktionen für Verschieben, Archivieren und Papierkorb besitzen bereits Snapshot-, Frische- und Teilfehlerlogik. Die KI kann diese Funktionen derzeit nicht nutzen.
- Pro KI-Anfrage sind höchstens 15 Werkzeugausführungen erlaubt. Eine Einzelverarbeitung von 20 Notizen über jeweils Lesen und Proposal-Erzeugung ist dadurch nicht möglich.
- Das Proposal-System bleibt verbindlich non-destruktiv: Inhalts-, Pfad- und Strukturänderungen benötigen eine ausdrückliche Bestätigung.

## Verbindlicher Funktionsvertrag

1. „Öffne“, „starte“ und „zeige Notiz X“ bedeuten: Die betreffende Notiz wird im vorhandenen Editor geöffnet.
2. „Zuletzt bearbeitet“ richtet sich nach dem gespeicherten `frontmatter.modified`, ersatzweise `frontmatter.created`.
3. Bei mehreren gleichnamigen Notizen darf die KI nicht raten. Sie zeigt Titel und Kategorie zur Auswahl.
4. Eine Hauptkategorie kann umbenannt und in der Seitenleiste neu angeordnet werden. Sie kann nicht unter eine andere Hauptkategorie verschoben werden.
5. Eine Unterkategorie kann umbenannt, in eine andere Hauptkategorie verschoben und innerhalb ihrer Hauptkategorie neu angeordnet werden.
6. Inhalts-, Pfad- und Strukturänderungen benötigen eine ausdrückliche Bestätigung.
7. Reine Navigation benötigt kein Proposal, muss aber den bestehenden Schutz ungespeicherter Änderungen durchlaufen.
8. Massenänderungen werden zuerst als Plan dargestellt. Erst nach Bestätigung werden konkrete Proposals erzeugt.
9. „Logisch sortieren“ ändert standardmäßig die gespeicherte sichtbare Reihenfolge über `childOrder`. Dateinamen werden nur auf ausdrücklichen Wunsch nummeriert oder umbenannt.

---

## Entwicklungsblock 1: Notizen durch die KI öffnen

**Status: ✅ ABGESCHLOSSEN (23.09.2026).** Implementiert und getestet
(gezielte Tests + vollständige Testsuite, 342/342 grün). Umgesetzt:
`get_recent_notes` und `open_note` (main/ai-tools.js), Navigations-Event
`ai:stream-navigate` (main/ai-ipc.js, preload.js), Anbindung im Chat
(renderer/js/ai-chat.js) über `onOpenNote` an app.js' bestehenden
`canLeaveCurrentRoute()`/`navigateTo()`-Weg (kein zweiter
Navigationsmechanismus). Sichere Titelauflösung mit Kandidatenliste bei
Mehrdeutigkeit (`resolveNoteForOpen`), keine automatische Navigation bei
mehreren Treffern. "Zuletzt bearbeitet" nutzt exakt dieselbe Sortierregel wie
das Dashboard (`modified`, ersatzweise `created`). Nicht Teil dieses Blocks
(wie vorgesehen): Kategorien und Batch-Operationen. Details siehe
Commit-Historie ab diesem Datum.

### Ziel

Die folgenden Anweisungen funktionieren vom Dashboard, aus einer geöffneten Notiz und aus allen anderen Ansichten:

- „Öffne Notiz Fedora“
- „Starte die Notiz Ollama Installation“
- „Zeige mir die zuletzt bearbeitete Notiz“
- „Öffne die zweitletzte bearbeitete Notiz“

### Geplante Bausteine

1. Ein deterministisches Werkzeug zum Ermitteln aktueller Notizen:
   - `get_recent_notes`
   - sortiert nach `modified`, ersatzweise `created`
   - liefert Titel, relativen Pfad, Kategorie und Änderungszeit

2. Ein Werkzeug für die Navigationsabsicht:
   - `open_note`
   - nimmt einen bereits sicher aufgelösten relativen Notizpfad entgegen
   - akzeptiert keine beliebigen URLs oder Hash-Routen

3. Sichere Titelauflösung:
   - exakter Titel gewinnt
   - danach eindeutiger Treffer ohne Beachtung der Groß-/Kleinschreibung
   - bei mehreren Treffern Auswahl statt automatischer Navigation
   - bei keinem Treffer bleibt die aktuelle Ansicht unverändert

4. Renderer-Navigation:
   - ausschließlich das bestehende `navigateTo('#note/...')` verwenden
   - keine direkte Änderung von `location.hash`
   - keinen zweiten Navigationsmechanismus aufbauen

5. Dirty-Editor-Schutz:
   - bestehende Notiz zuerst speichern
   - bei Speicherfehler sichtbar abbrechen oder Änderungen ausdrücklich verwerfen lassen
   - bei abgebrochenem Dialog keine Navigation
   - bei zwischenzeitlichem Editor- oder Notizwechsel fail-closed abbrechen

### Voraussichtliche Dateien

- `main/ai-tools.js`
- `main/ai-ipc.js`
- `preload.js`
- `renderer/js/ai-chat.js`
- `renderer/js/app.js`
- `test/ai-tools.test.js`
- `test/ai-chat.test.js`
- gegebenenfalls ein kleiner Navigationstest

### Abnahmekriterien

- Öffnen funktioniert vom Dashboard.
- Öffnen funktioniert aus einer anderen geöffneten Notiz.
- Exakter Titel und exakter Pfad funktionieren.
- Gleichnamige Notizen werden nicht verwechselt.
- „Zuletzt bearbeitet“ entspricht exakt der Dashboard-Regel.
- Ungespeicherte Änderungen gehen nicht verloren.
- Ein fehlgeschlagenes Speichern verhindert die Navigation.
- Abbrechen lässt die bisherige Notiz unverändert geöffnet.
- Keine Notiz wird durch die Navigationsfunktion verändert.

### Stopp-Punkt

Nach diesem Block werden nur die Navigationstests und die vollständige Testsuite ausgeführt. Kategorien und Massenoperationen werden noch nicht implementiert.

---

## Entwicklungsblock 2: Kategorien zuverlässig auflisten

**Status: ✅ ABGESCHLOSSEN (23.09.2026).** Implementiert und getestet
(gezielte Tests + vollständige Testsuite, 345/345 grün). Umgesetzt:
`list_categories` (main/ai-tools.js), liefert Haupt- und Unterkategorien mit
relPath und Anzahl aktiver (nicht archivierter) Notizen, in der sichtbaren
Reihenfolge (childOrder aus .wiki-config.json). Keine versteckten Ordner,
kein Papierkorb, keine internen Projektdateien (nutzt dafür dieselbe
notesFs.listProjectTree()-Filterung wie die Seitenleiste). Die
Sortierfunktion `applyChildOrder()` wurde aus main/filesystem-ipc.js nach
main/notes-fs.js verschoben und exportiert, damit Seitenleiste und
list_categories dieselbe Logik nutzen (keine zweite Sortierung). Rein
lesend, keine Schreiboperation eingeführt.

### Ziel

Die KI erhält ein vollständiges, strukturiertes Bild der vorhandenen Haupt- und Unterkategorien, ohne sich auf den begrenzten Wiki-Strukturtext im Systemkontext verlassen zu müssen.

### Geplante Funktion

`list_categories` liefert:

- Hauptkategorien
- zugehörige Unterkategorien
- relative Pfade
- Anzahl enthaltener aktiver Notizen
- vorhandene sichtbare Reihenfolge
- keine versteckten Ordner
- keinen Papierkorb
- keine internen Projektdateien

### Abnahmekriterien

- Vollständige Kategorieauflistung auch bei großen Wikis.
- Interne Dateien und `.wiki-trash` erscheinen nicht.
- Gleichnamige Unterkategorien in verschiedenen Hauptkategorien bleiben unterscheidbar.
- Dieser Block führt keine Schreiboperationen ein.

---

## Entwicklungsblock 3: Kategorien umbenennen und verschieben

**Status: ✅ ABGESCHLOSSEN (25.09.2026).** Implementiert und getestet
(gezielte Tests + vollständige Testsuite, 366/366 grün). Umgesetzt:
`propose_rename_category` (Haupt- ODER Unterkategorie, Typ wird automatisch
per `classifyEntry()` festgestellt), `propose_move_subcategory` (nur
Unterkategorien, Hauptkategorien werden strukturell abgewiesen) und
`propose_reorder_entries` (Hauptkategorien oder die Unterkategorien EINER
Hauptkategorie, nicht erwähnte Einträge werden ans Ende gehängt statt
entfernt). Alle drei nutzen die bestehenden `notesFs.renameEntry()`/
`notesFs.moveEntry()` (dieselbe Struktur-/Tiefenprüfung wie beim manuellen
Verschieben per Drag&Drop) statt einer zweiten Umsetzung.

Sicherheit: `resolveWikiEntrySafe()`/`classifyEntry()` sperren interne/
versteckte Pfade und Path-Traversal (wiederverwendet, keine zweite Prüfung).
Vor der Übernahme werden Quelle/Ziel erneut geprüft (Kollision, Existenz)
und alle betroffenen Notizen per `notesFs.snapshotNotesForBatch()` auf
zwischenzeitliche Änderungen verglichen (neue/entfernte Notizen UND
geänderter Inhalt) - bei reorder_entries wird stattdessen die Menge der
tatsächlichen Unterordner an dieser Stelle verglichen. Ein Projektwechsel
macht jedes Proposal automatisch ungültig (bereits bestehender,
typunabhängiger Mechanismus).

Konfigurationsmigration: `migrateConfigPaths()`/`removeConfigPaths()` wurden
aus main/filesystem-ipc.js nach main/project.js verschoben und exportiert
(vorher nur für die manuelle Sidebar-Bedienung erreichbar) - KI-Proposals
migrieren jetzt Kategorie-Icons, sichtbare Reihenfolge (`childOrder`),
gemerkte Scrollpositionen und eingeklappte Gruppen genauso wie der manuelle
Weg. Eine zuvor geöffnete Notiz innerhalb der umbenannten/verschobenen
Kategorie wird nach Anwendung unter ihrem neuen Pfad automatisch wieder
geöffnet; lag sie im betroffenen Unterbaum, greift vorher der bestehende
Dirty-Editor-Schutz (Speichern oder bewusst Verwerfen).

**Nebenbei gefundener und behobener Bug (nicht Teil des ursprünglichen
Plans, aber direkt die Korrektheit dieses Blocks betreffend):**
`notesFs.moveEntry()` aktualisierte beim Verschieben einer ganzen
Unterkategorie bisher NUR beim Verschieben einer einzelnen Notiz deren
category/mainCategory-Frontmatter - beim Verschieben des gesamten Ordners
blieben die enthaltenen Notizen auf die alte Hauptkategorie eingetragen
(betraf auch das manuelle Drag&Drop-Verschieben, nicht nur die KI). Behoben
in main/notes-fs.js (`updateMovedCategoryNoteFields()`), bewusst ohne
`modified`-Zeitstempel, damit ein Kategorie-Verschieben nicht "Zuletzt
bearbeitet" mit vielen Notizen auf einmal flutet.

### Ziel

Folgende Anweisungen werden als bestätigungspflichtige Vorschläge unterstützt:

- „Benenne die Hauptkategorie Linux in Linux & System um.“
- „Benenne die Unterkategorie Anleitungen in Leitfäden um.“
- „Verschiebe die Unterkategorie Ollama von Software nach KI.“
- „Sortiere die Hauptkategorien in dieser Reihenfolge …“

### Neue Proposal-Arten

1. `propose_rename_category`
2. `propose_move_subcategory`
3. `propose_reorder_entries`

Für Haupt- und Unterkategorien kann ein gemeinsames Rename-Proposal verwendet werden, sofern der Eintragstyp vorher eindeutig festgestellt wird.

### Sicherheitsanforderungen

Vor der Proposal-Erzeugung:

- Quellkategorie muss existieren.
- Zielpfad und Name müssen gültig sein.
- Ziel darf nicht kollidieren.
- Interne und versteckte Pfade sind gesperrt.
- Der vollständige betroffene Teilbaum wird erfasst.
- Enthaltene Notizen erhalten Snapshot-Identitäten.
- Betroffene Projektkonfiguration wird berücksichtigt.

Vor der Übernahme:

- Quelle existiert weiterhin.
- Ziel ist weiterhin frei.
- Betroffene Notizen wurden nicht zwischenzeitlich verändert.
- Ein Projektwechsel macht den Vorschlag ungültig.
- Eine geöffnete Notiz innerhalb der Kategorie wird durch den Dirty-Editor-Schutz geschützt.

Bei der Übernahme:

- gespeicherte Kategorie-Icons werden auf den neuen Pfad migriert
- `childOrder` wird migriert
- gespeicherte Scrollpositionen und weitere Pfadreferenzen werden migriert
- der Projektbaum wird neu geladen
- eine geöffnete betroffene Notiz wird unter dem neuen Pfad wieder geöffnet
- bei Fehlern wird kein falscher Erfolg angezeigt

### Strukturregeln

- Hauptkategorie umbenennen: erlaubt
- Hauptkategorie neu anordnen: erlaubt
- Hauptkategorie unter eine andere Hauptkategorie verschieben: abweisen
- Unterkategorie zwischen Hauptkategorien verschieben: erlaubt
- tiefere Verschachtelung: abweisen
- direkte Notizen unter einer Hauptkategorie nicht neu einführen

### Abnahmekriterien

- Kategoriepfade und Projektkonfiguration bleiben synchron.
- Enthaltene Notizen bleiben auffindbar.
- Keine versteckten oder internen Pfade können adressiert werden.
- Kollisionen verändern nichts.
- Veraltete Proposals verändern nichts.
- Der Dirty Editor wird vor jeder betroffenen Pfadmutation geschützt.

### Stopp-Punkt

Nach diesem Block wird noch keine automatische Bearbeitung vieler Notizen begonnen.

---

## Entwicklungsblock 4: Reine Batch-Analyse

**Status: ✅ ABGESCHLOSSEN (25.09.2026).** Implementiert und getestet
(gezielte Tests + vollständige Testsuite, 372/372 grün). Umgesetzt:
`analyze_category_notes` (Haupt- ODER Unterkategorie, Typ wird wie in Block 3
per `classifyEntry()` festgestellt) liefert für alle enthaltenen, nicht
archivierten Notizen Titel, Pfad, Kategoriepfad, Tags, Größe, Inhalt und
lexikalisch erkannte Wikilink-Ziele in einem einzigen Werkzeugaufruf zurück -
kein zusätzlicher Modell-Aufruf pro Notiz nötig.

Begrenzungen: Standardlimit 20, harte Obergrenze 25 Notizen pro Aufruf
(`ANALYZE_DEFAULT_LIMIT`/`ANALYZE_HARD_LIMIT`), Gesamtbudget 60.000 gelesene
Zeichen (`ANALYZE_MAX_TOTAL_CHARS`) sowie 8.000 Zeichen je Einzelnotiz
(`ANALYZE_MAX_PER_NOTE_CHARS`). Eine einzelne zu große Notiz erhält den
Status `zu_gross` (kein Inhalt), eine Notiz, die erst nach Erschöpfung des
Gesamtbudgets an der Reihe wäre, den Status `uebersprungen_budget`; sonst
`lesbar`, ggf. mit `truncated: true` bei Budget-bedingter Kürzung. Über dem
Limit liegende Notizen werden gezählt (`omittedByLimitCount`), aber nicht
geladen. Bewertung, Umformulierung oder Sortiervorschläge bleiben bewusst
Sache des Sprachmodells anhand der gelieferten Rohdaten - das Werkzeug selbst
verändert und beurteilt inhaltlich nichts und schreibt nichts.

Sicherheit: dieselbe `resolveWikiEntrySafe()`/`classifyEntry()`-Prüfung wie in
Block 1-3 (keine zweite Implementierung), Notiz-Pfade statt Kategorie-Pfade
werden strukturell abgewiesen.

### Ziel

Die KI kann alle Notizen einer ausgewählten Unterkategorie analysieren, ohne bereits Änderungen vorzuschlagen.

Beispiel:

> Analysiere alle Notizen in Wissen/Software und plane, wie sie in einfache Sprache umgeschrieben und logisch sortiert werden sollten.

### Geplanter Ablauf

1. Kategorie eindeutig auflösen.
2. Enthaltene Notizen erfassen.
3. Metadaten und Größen prüfen.
4. Inhalte kontrolliert und paketweise lesen.
5. Analyseergebnis als strukturierten Plan ausgeben.

### Ressourcenbegrenzung

- Standardmäßig höchstens 20 Notizen pro Auftrag.
- Harte Obergrenze beispielsweise 25 Notizen.
- Gesamtzahl der gelesenen Zeichen begrenzen.
- Große Notizen einzeln behandeln.
- Keine Umgehung von `MAX_REQUEST_TOOL_CALLS`.
- Die Batch-Lesefunktion übernimmt das Lesen intern, damit nicht für jede Notiz ein eigener Modell-Werkzeugaufruf erforderlich ist.
- Gekürzte Notizen im Plan sichtbar kennzeichnen.

### Analyseergebnis pro Notiz

- aktueller Titel
- aktueller Pfad
- kurze Inhaltsbeschreibung
- empfohlene Textänderung
- möglicher neuer Titel
- vorgeschlagene Position
- mögliche Zielkategorie
- vorhandene Wikilink-Risiken
- Status `änderbar`, `zu groß`, `unklar` oder `übersprungen`

### Wichtige Grenze

Dieser Block schreibt nichts und erzeugt noch keine Update-Proposals. Der Nutzer prüft zuerst den Gesamtplan.

---

## Entwicklungsblock 5: Batch-Proposal für Inhaltsänderungen

**Status: ✅ ABGESCHLOSSEN (26.09.2026).** Implementiert und getestet
(gezielte Tests + vollständige Testsuite, 381/381 grün). Umgesetzt:
`propose_batch_content_update` erzeugt EINEN gemeinsamen `batch_update`-
Vorschlag für mehrere Notizen gleichzeitig (Inhalt und/oder Titel und/oder
Ziel-Unterkategorie je Notiz), statt vieler einzelner
`propose_update_note`-Karten. Die Vorschau-Karte zeigt Gesamtzahl sowie
Inhalts-/Umbenennungs-/Verschiebungs-Zähler, klappbare Diffs pro Notiz und
eine Checkbox je Notiz zum Abwählen vor der Übernahme.

Anwenden ist pro Notiz unabhängig (wie im Plan gefordert): jede ausgewählte
Notiz bekommt eine eigene Frischeprüfung (wiederverwendet
`verifyProposalFreshness()` aus den bestehenden Einzel-Proposals statt einer
zweiten Prüf-Logik) und wird einzeln gespeichert/umbenannt/verschoben — ein
Fehler oder eine zwischenzeitliche Änderung bei einer Notiz verhindert nicht
die anderen. Der Abschlussbericht unterscheidet `updated`/`skipped_stale`/
`skipped_deselected`/`failed` je Notiz, exakt die im Plan genannten vier
Kategorien.

Ungültige Einzeleinträge beim Erstellen (nicht existierende Notiz, weder
Inhalt/Titel/Kategorie angegeben, Namenskollision am Ziel) werden als
Warnung im Vorschlag markiert statt den gesamten Batch abzulehnen; schlägt
JEDER Eintrag fehl, wird der Vorschlag insgesamt abgelehnt (keine leere
Karte).

**Bewusste Abgrenzung (im Plan als Vorschau-Zähler genannt, hier nicht
umgesetzt):** Tag-Änderungen sind NICHT Teil eines Batch-Eintrags (dafür
weiterhin `propose_update_note` für die jeweilige Einzelnotiz) und eine
"Anzahl Reihenfolgeänderungen" ist ebenfalls nicht Teil dieses
Proposal-Typs — eine neue Reihenfolge ist ein einzelner Config-Schreibvorgang
für einen ganzen Ordner, kein pro-Notiz atomarer Vorgang, und wird bereits
vollständig von `propose_reorder_entries` aus Block 3 abgedeckt. Beides wird
im System-Prompt der KI explizit als weiterhin richtige Wahl genannt.

Sicherheit: Notiz-Pfade werden wie bei jedem anderen KI-Werkzeug über
`classifyEntry()`/`resolveWikiEntrySafe()` geprüft (keine zweite
Implementierung); der volle neue/alte Notizinhalt bleibt serverseitig im
Proposal-Speicher und wird NICHT in den Modellkontext zurückgegeben (nur
Diff, Titel, Pfade) — derselbe Grundsatz wie beim bestehenden
`propose_update_note`.

### Ziel

Nach Zustimmung zum Analyseplan erzeugt die KI einen gemeinsamen, kontrollierbaren Änderungsvorschlag.

### Vorschau

Die Batch-Karte zeigt:

- Anzahl betroffener Notizen
- Anzahl reiner Inhaltsänderungen
- Anzahl Umbenennungen
- Anzahl Verschiebungen
- Anzahl Reihenfolgeänderungen
- Warnungen und ausgelassene Notizen
- aufklappbaren Diff pro Notiz
- Auswahlkästchen für jede Einzeländerung

Der Nutzer kann einzelne Notizen abwählen, bevor er den Batch übernimmt.

### Regeln für „einfache Sprache“

Der Assistent muss:

- die fachliche Bedeutung erhalten
- Überschriften erhalten oder nachvollziehbar verbessern
- Codeblöcke unverändert lassen
- Befehle und Dateipfade unverändert lassen
- URLs erhalten
- vorhandene Wikilinks erhalten
- Tabellen und Checklisten funktionsfähig halten
- Frontmatter nur über definierte Felder verändern
- keine nicht belegten Fakten ergänzen
- Unsicherheiten markieren statt Inhalte zu erfinden

### Anwendung

Für jede ausgewählte Notiz:

1. Frischeprüfung gegen den Analyse-Snapshot.
2. Bei Änderungen seit der Analyse: Notiz überspringen.
3. Einzelne Notiz atomar speichern.
4. Erfolg oder Fehler einzeln erfassen.
5. Nächste Notiz unabhängig bearbeiten.

Der Abschlussbericht enthält:

- erfolgreich geändert
- wegen neuer Änderungen übersprungen
- fehlgeschlagen
- vom Nutzer abgewählt

Eine einzelne fehlerhafte Notiz darf nicht dazu führen, dass die übrigen Ergebnisse falsch als fehlgeschlagen oder erfolgreich gelten.

### Rückgängigmachen

- Verschiebungen können den bestehenden Batch-Undo verwenden.
- Sichtbare Reihenfolge kann durch Wiederherstellen des vorherigen `childOrder` zurückgesetzt werden.
- Inhaltsänderungen benötigen gespeicherte Vorher-Snapshots oder einen bewusst begrenzten sitzungslokalen Undo.
- Ohne belastbaren Undo darf kein globaler „Alles rückgängig“-Knopf angeboten werden.

---

## Entwicklungsblock 6: Umbenennungen und Wikilinks

### Ziel

Massenumbenennungen dürfen keine stillen Linkschäden verursachen.

### Ablauf

Vor jeder vorgeschlagenen Titeländerung:

1. Eingehende `[[Wikilinks]]` ermitteln.
2. In der Vorschau betroffene Quellnotizen anzeigen.
3. Nutzer entscheiden lassen:
   - Titel nicht ändern
   - Titel ändern und defekte Links akzeptieren
   - zusätzliche Link-Update-Proposals erzeugen

Link-Updates bleiben eigenständige, sichtbare Änderungen. Es darf keine stille Bearbeitung fremder Notizen stattfinden.

### Abnahmekriterien

- Kein Titel wird ohne Linkfolgen-Vorschau geändert.
- Link-Updates besitzen eigene Diffs.
- Gleichnamige Titel werden korrekt behandelt.
- Abgewählte Link-Updates werden nicht ausgeführt.

---

## Entwicklungsblock 7: Logische Reihenfolge

### Ziel

Die KI kann eine nachvollziehbare Reihenfolge vorschlagen, ohne Dateinamen zu manipulieren.

### Vorgehen

1. Die KI liefert zunächst:
   - aktuelle Reihenfolge
   - vorgeschlagene Reihenfolge
   - kurze Begründung pro Positionsänderung

2. Die Übernahme ändert ausschließlich `childOrder`.

3. Umbenennungen oder Nummernpräfixe entstehen nur, wenn der Nutzer sie ausdrücklich verlangt.

### Abnahmekriterien

- Notizinhalte bleiben unverändert.
- Dateipfade bleiben unverändert.
- Reihenfolge bleibt nach einem Neustart erhalten.
- Nicht erwähnte Notizen gehen nicht aus der Sortierung verloren.
- Parallel hinzugekommene Notizen werden nicht versehentlich entfernt.

---

## Abschließender Integrationsblock

Nach Umsetzung aller Einzelblöcke folgt eine gemeinsame Prüfung ausschließlich mit `.Codex-test-home` und `.Codex-test-wiki`.

### Pflichtszenarien

1. Notiz vom Dashboard öffnen.
2. Notiz aus einer anderen geöffneten Notiz öffnen.
3. Zuletzt bearbeitete Notiz öffnen.
4. Gleichnamige Notizen unterscheiden.
5. Dirty Editor erfolgreich speichern und navigieren.
6. Speicherfehler und Abbrechen.
7. Hauptkategorie umbenennen.
8. Unterkategorie umbenennen.
9. Unterkategorie verschieben.
10. Hauptkategorien neu anordnen.
11. Kategorieänderung mit geöffneter Notiz.
12. Kategorieänderung mit zwischenzeitlich veränderter Notiz.
13. 20 Notizen analysieren, ohne zu schreiben.
14. Einzelne Batch-Einträge abwählen.
15. Teilweise veralteten Batch anwenden.
16. Einfache-Sprache-Änderung mit Codeblöcken, URLs und Wikilinks.
17. Batch-Verschiebung rückgängig machen.
18. Projektwechsel während Analyse oder Proposal.
19. Chat-Abbruch während einer umfangreichen Analyse.
20. Darstellung und Bedienung in Classic und Design2.

## Empfohlene Arbeitsreihenfolge

| Reihenfolge | Block | Umfang | Risiko |
|---:|---|---:|---:|
| 1 | Notiz öffnen und zuletzt bearbeitet ✅ ABGESCHLOSSEN | klein | gering |
| 2 | Kategorien vollständig auflisten ✅ ABGESCHLOSSEN | klein | gering |
| 3 | Kategorien umbenennen/verschieben ✅ ABGESCHLOSSEN | mittel | hoch |
| 4 | Batch-Analyse ohne Änderungen ✅ ABGESCHLOSSEN | mittel | mittel |
| 5 | Batch-Inhalts-Proposals ✅ ABGESCHLOSSEN | groß | hoch |
| 6 | Umbenennung und Wikilink-Schutz | mittel | hoch |
| 7 | Logische Reihenfolge | klein bis mittel | gering |
| 8 | Gesamtabnahme | mittel | abhängig von Befunden |

## Nächster freigegebener Entwicklungsblock

Entwicklungsblock 1 bis 5 sind abgeschlossen (siehe Fortschritt-Tabelle und
Status-Vermerke oben). Entwicklungsblock 6 („Umbenennungen und Wikilinks")
ist **noch nicht freigegeben** — nicht eigenständig beginnen, ohne dass der
Nutzer das ausdrücklich beauftragt. Block 5 hat mit `propose_batch_content_update`
erstmals echte, mehrfache Inhaltsschreibvorgänge eingeführt (mit Human-in-
the-Loop-Bestätigung und pro-Notiz-Frischeprüfung); Block 6 baut darauf auf
und ergänzt gezielten Wikilink-Schutz bei Massenumbenennungen.
