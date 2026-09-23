# Archiv-Wiki v2.3.1 – KI-Navigation, Kategorien und Batch-Bearbeitung

Stand: 22.09.2026

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
| 1 | Notiz öffnen und zuletzt bearbeitet | klein | gering |
| 2 | Kategorien vollständig auflisten | klein | gering |
| 3 | Kategorien umbenennen/verschieben | mittel | hoch |
| 4 | Batch-Analyse ohne Änderungen | mittel | mittel |
| 5 | Batch-Inhalts-Proposals | groß | hoch |
| 6 | Umbenennung und Wikilink-Schutz | mittel | hoch |
| 7 | Logische Reihenfolge | klein bis mittel | gering |
| 8 | Gesamtabnahme | mittel | abhängig von Befunden |

## Nächster freigegebener Entwicklungsblock

Als Nächstes ausschließlich Entwicklungsblock 1 umsetzen:

> Notizen aus jeder Ansicht öffnen und „zuletzt bearbeitet“ zuverlässig auflösen.

Dieser Block ist fachlich geschlossen, verwendet die vorhandene Navigation und lässt sich unabhängig von Kategorie- und Batch-Operationen vollständig testen. Keine Kategorie- oder Batch-Funktion in diesem Block vorwegnehmen.
