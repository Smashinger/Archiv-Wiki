# Archiv-Wiki — Roadmap

**Status: verbindlich beschlossener Plan (Masterplan Phase 1, mit Korrekturen).** Dieser Abschnitt beschreibt tatsächlich beschlossene, verbindliche Entwicklungsschritte. Phase 2 und Phase 3 sind grob vorgemerkt, aber inhaltlich noch nicht im Detail geplant.

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

## Phase 1 — verbindliche Reihenfolge

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

## Phase 2 (grob vorgemerkt)

- **Feature A** – Archivierung
- **D4** – Tag-Management, eigener sicherheitskritischer Block

## Phase 3 (grob vorgemerkt)

- **D2** – Batch-Ops. Benötigt vorher eine eigene Sicherheits-/Rollback-Spezifikation, bevor Implementierung beginnt.

## Schutzgrenzen (phasenübergreifend verbindlich)

- Firefox-/Brave-Web-Clipper nicht unnötig verändern.
- GitHub Release-/Update-System nicht verändern.
- Wiki-Link-Integrität nicht beschädigen.
- Keine Architekturänderung ohne echten Bedarf.

---

Hinweis für die Pflege dieser Datei: Ein Eintrag gehört erst hierher, wenn er tatsächlich als Vorhaben beschlossen ist — eine architektonisch mögliche, aber nicht konkret eingeplante Erweiterung (wie sie an einzelnen Stellen in `06_DASHBOARD.md`, `08_EDITOR.md`, `09_SETTINGS.md`, `10_SEARCH.md` oder `11_BACKUP.md` erwähnt wird) ist kein Roadmap-Punkt, solange sie nicht ausdrücklich als geplant bestätigt wurde. Änderungen an der oben festgehaltenen Phase-1-Reihenfolge erfordern eine erneute ausdrückliche Bestätigung.
