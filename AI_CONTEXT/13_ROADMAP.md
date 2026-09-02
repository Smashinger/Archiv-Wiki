# Archiv-Wiki — Roadmap

**Status: Masterplan Phase 1–3 vollständig abgeschlossen.** Dieser Abschnitt beschreibt den historischen, tatsächlich beschlossenen Entwicklungsplan sowie seinen Abschlussstand. Phase 1, Phase 2 und Phase 3 sind laut aktuellem Codestand vollständig umgesetzt und real getestet (siehe Abschnitte unten). Die Reihenfolge und Arbeitsweise bleiben als Historie/Referenz erhalten. Ein weiterhin offener, separat beschlossener Bereich ist der Web-Clipper-Browser-Kompatibilitätsausbau (siehe eigener Abschnitt weiter unten).

## Arbeitsweise (verbindlich für alle Phasen)

- Kleiner Entwicklungsblock → Test → Commit → nächster Block.
- Keine großen Sammelimplementierungen.
- Zeitangaben sind grobe Schätzungen, keine feste Zusage. Der tatsächliche Aufwand hängt insbesondere vom Ergebnis der Realprüfungen bei B5 und D1 ab.

## C-Nummerierung (verbindlich)

- **C1** = Find & Replace
- **C2** = Tabellenbearbeitung
- **C3** = Templates / Template-Variablen
- **C4** = Multi-Cursor
- **C5** = Markdown-Formatter

## Phase 1 — abgeschlossen

Alle elf Punkte sind umgesetzt und im Code bestätigt (C1 über `@codemirror/search`, C4 über `allowMultipleSelections`/`drawSelection`, C3 über `resolveTemplateVariables()`, B1–B5 sowie D1/D5 jeweils im bestehenden Suchsystem, Dashboard, Einstellungen und Eingang). Die folgende Reihenfolge bleibt als historische Referenz erhalten.

1. **C1** – Find & Replace sichtbar/dokumentiert
2. **C4** – Multi-Cursor-Shortcuts sichtbar/dokumentiert
3. **C3** – Templates: `{date}`, `{time}`, `{year}`
4. **B3** – bessere Settings-Erklärungen
5. **B4** – „Weiterarbeiten" + Empty States
6. **B5** – Realprüfung Fenster/Auflösung, nur bestätigte Fixes (siehe unten)
7. **B1** – Search/Filter
8. **B2** – Sticky Search
9. **D1** – Code-Audit Eingang/Capture (siehe unten)
10. **D1** – bestätigten bestehenden Eingang verbessern (Umfang erst nach Audit festlegen)
11. **D5** – Template-Auswahl bei Eingang → neue Notiz

C2 und C5 sind nicht Teil von Phase 1.

### B5 — Klarstellung

B5 bedeutet **nicht** pauschal „Window Constraints implementieren". B5 ist:

- echte Electron-Konfiguration prüfen
- reale Tests bei kleinen Fensterhöhen/Auflösungen
- Mindesthöhe nur falls tatsächlich notwendig
- Settings-Scroll nur falls tatsächlich problematisch
- Split-Pane-Minimum nur falls tatsächlich problematisch

Nur bestätigte Probleme werden geändert.

### D1 — Audit-first (verbindlich)

Vor jeder D1-Implementierung ist zwingend der echte, bestehende Code zu prüfen:

- vorhandene Eingangs-UI
- Listview
- Mehrfachauswahl
- Sammellöschung
- IPC-Kanäle
- incoming-store
- webclip-receiver

Erst danach wird der tatsächliche Implementierungsumfang bestimmt. Keine neue parallele Eingangs-/Capture-Architektur auf Verdacht.

## Phase 2 — abgeschlossen

- **Feature A** – Archivierung. Umgesetzt: Archivieren/Wiederherstellen, eigene Archiv-Seite, aktive Ansichten blenden archivierte Notizen aus, Such-Status Aktiv/Archiv/Alle (siehe `12_KNOWN_DECISIONS.md`, Abschnitt „Archivierung").
- **D4** – Tag-Management, eigener sicherheitskritischer Block. Umgesetzt inklusive Umbenennen/Zusammenführen/Löschen als gemeinsame Kernoperation, Frischeprüfung, Vor-Batch-Backup, sitzungslokalem Undo und Sync-Sperre (siehe `12_KNOWN_DECISIONS.md`, Abschnitt „Tag-Verwaltung"). Die für diesen Block geforderte Sicherheitsabsicherung ist vollständig umgesetzt.

## Phase 3 — abgeschlossen

- **D2** – Batch-Ops. Die vorab geforderte Sicherheits-/Rollback-Spezifikation wurde umgesetzt: Body- und Frontmatter-Frischeprüfung, Vor-Batch-Backup (kein „trotzdem fortfahren"), sitzungslokales Undo für Batch-Verschieben, gemeinsame Sync-Sperre. Verschieben, Archivieren und Papierkorb sind als zentraler Auswahlmodus in Sidebar/Dashboard/Archiv verfügbar (siehe `12_KNOWN_DECISIONS.md`, Abschnitt „Mehrfachauswahl / Batch Operations").

## Schutzgrenzen (phasenübergreifend verbindlich)

- Firefox-/Brave-Web-Clipper nicht unnötig verändern.
- GitHub Release-/Update-System nicht verändern.
- Wiki-Link-Integrität nicht beschädigen.
- Keine Architekturänderung ohne echten Bedarf.

---

Hinweis für die Pflege dieser Datei: Ein Eintrag gehört erst hierher, wenn er tatsächlich als Vorhaben beschlossen ist — eine architektonisch mögliche, aber nicht konkret eingeplante Erweiterung (wie sie an einzelnen Stellen in `06_DASHBOARD.md`, `08_EDITOR.md`, `09_SETTINGS.md`, `10_SEARCH.md` oder `11_BACKUP.md` erwähnt wird) ist kein Roadmap-Punkt, solange sie nicht ausdrücklich als geplant bestätigt wurde. Änderungen an der oben festgehaltenen Phase-1-Reihenfolge erfordern eine erneute ausdrückliche Bestätigung.

---

## Zusätzlich verbindlich geplanter Bereich

### Web Clipper — Browser-Kompatibilität und zentraler Installer

Nach dem abgeschlossenen Firefox-/Brave-Release wird die Browserintegration schrittweise erweitert.

Ziel ist ein zentraler Installationsweg innerhalb von Archiv-Wiki, der erkennt, welche unterstützten Browser und Installationsarten auf dem Linux-System vorhanden sind, und daraufhin ausschließlich die jeweils passenden Installationsmöglichkeiten anbietet.

Der bestehende Firefox- und Brave-Support bildet dabei die funktionale Ausgangsbasis und darf durch die Erweiterung nicht verschlechtert werden.

**Aktueller Stand (bestätigt, nicht Teil des offenen Ausbaus):** Die gemeinsame Extension-Codebasis (Manifest V3), Native Messaging, der Eingang-Übergabeweg sowie Firefox- und Chromium/Brave-Unterstützung sind implementiert. Der Firefox Web Clipper ist öffentlich über Mozilla Add-ons verfügbar; Chromium/Brave läuft über eine signierte CRX und die AppImage-Native-Host-Vorbereitung (siehe `16_WEB_CLIPPER.md`). **Offen ist ausschließlich** die hier beschriebene Erweiterung auf automatische Erkennung weiterer Browser/Installationsarten und ein zentraler, browserübergreifender Installationsablauf — dafür bestehen noch keine Umsetzungsspuren im Code.

---

### Prioritäten

1. **Browser und Installationsart erkennen**

   Archiv-Wiki soll unterstützte installierte Browser sowie deren Installationsart erkennen können.

   Dabei werden insbesondere unterschiedliche Linux-Installationswege wie Flatpak und normale Systeminstallationen berücksichtigt.

2. **Passenden Installationsweg auswählen**

   Die Anwendung soll abhängig vom erkannten Browser automatisch den technisch passenden Weg für Browser-Erweiterung und Native Messaging vorbereiten.

   Browser- oder paketbezogene Sonderwege sollen nicht mehr hinter einer allgemeinen Schaltfläche verborgen sein, wenn sie für den erkannten Browser nicht geeignet sind.

3. **Installation verständlich in den Einstellungen darstellen**

   Im Bereich „Web Clipper“ sollen nur tatsächlich verfügbare beziehungsweise für das aktuelle System passende Installationswege angeboten werden.

   Nicht erkannte oder nicht unterstützte Kombinationen sollen klar von verfügbaren Wegen unterschieden werden.

4. **Weitere Browser und Installationsarten einzeln real testen**

   Neue Browser- oder Paketkombinationen gelten erst als unterstützt, nachdem der vollständige Ablauf real getestet wurde:

   - Erweiterung installieren
   - Native Messaging herstellen
   - URL sammeln
   - markierten Text sammeln
   - ganze Seite sammeln
   - Bild sammeln
   - Übergabe an den Eingang prüfen
   - Neustart von Browser und Archiv-Wiki prüfen

5. **Keine Einzel-Releases für jede neue Kombination**

   Weitere Browser und Installationsarten werden zunächst gesammelt entwickelt und real getestet.

   Sie werden nicht nach jeder einzelnen Erweiterung sofort veröffentlicht.

   Erst nach Abschluss eines sinnvollen Pakets folgt ein gemeinsamer Browser-Kompatibilitäts-Release.

---

### Geplante Funktionen

#### Automatische Browser-Erkennung

Archiv-Wiki erkennt unterstützte Browser auf dem lokalen Linux-System.

Die Erkennung dient ausschließlich dazu, passende lokale Installationswege anzubieten. Sie führt keine Telemetrie ein und überträgt keine Browserinformationen.

#### Erkennung der Installationsart

Soweit technisch zuverlässig möglich, wird unterschieden, auf welchem Weg ein Browser installiert wurde, beispielsweise:

- Flatpak
- normale Systeminstallation

Die konkrete Paketart wird nur berücksichtigt, wenn daraus tatsächlich ein unterschiedlicher Installations- oder Native-Messaging-Weg entsteht.

#### Zentraler Web-Clipper-Installer

Die bestehenden browserbezogenen Installationswege werden hinter einem gemeinsamen Ablauf zusammengeführt.

Dieser Ablauf:

1. erkennt den Browser,
2. bestimmt den passenden Installationsweg,
3. bereitet Native Messaging vor,
4. bietet die passende Erweiterungsinstallation an,
5. erklärt erforderliche Browser-Neustarts,
6. meldet verständlich, wenn eine Kombination noch nicht unterstützt wird.

Es wird keine zweite parallele Web-Clipper-Architektur aufgebaut. Die bestehende gemeinsame Extension-Codebasis und der bestehende Native-Messaging-Transport bleiben erhalten.

#### Schutz bewusster Nutzerentscheidungen

Eine vom Nutzer bewusst entfernte oder deaktivierte Browser-Erweiterung wird nicht ungefragt erneut installiert.

Automatische Erkennung bedeutet nicht automatische Installation ohne Nutzeraktion.

---

### Release-Strategie

Der Browser-Kompatibilitätsausbau erfolgt bewusst in mehreren internen Testschritten.

Firefox und Brave bleiben die bereits etablierte Ausgangsbasis.

Weitere Browser und Installationsarten werden einzeln entwickelt und real geprüft, aber anschließend in einem gemeinsamen größeren Kompatibilitäts-Release veröffentlicht.

Damit sollen viele kleine Releases vermieden und stattdessen ein nachvollziehbarer, zusammenhängender Ausbau der Browserunterstützung bereitgestellt werden.

---

---

### Langfristige Ziele

Nach Abschluss des zentralen Installations- und Erkennungswegs soll die Web-Clipper-Integration so aufgebaut sein, dass zusätzliche Browser oder Linux-Installationsarten später ergänzt werden können, ohne für jeden Browser einen vollständig unabhängigen Installationsmechanismus entwickeln zu müssen.

Konkrete weitere Browser werden erst dann als Roadmap-Punkt aufgenommen, wenn ihre Unterstützung ausdrücklich beschlossen wurde.
