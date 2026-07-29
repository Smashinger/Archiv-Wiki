# Archiv Wiki

![Archiv Wiki](docs/branding/readme-banner.png)

Ein persönliches Markdown-Wiki für den Desktop — Notizen, Setups und Checklisten, 100 % lokal. Keine Cloud-Pflicht, keine Telemetrie, kein Account nötig.

Gebaut mit [Electron](https://electronjs.org) für Linux (getestet auf Fedora).

## Was ist das?

Archiv Wiki organisiert Notizen in Haupt- und Unterkategorien, mit einem Markdown-Editor, der direkt neben einer Live-Vorschau sitzt. Gedacht für alles, was man sich sonst über mehrere Textdateien, Sticky Notes und Lesezeichen verteilt merkt: Setup-Anleitungen, Problemlösungen, Checklisten, persönliche Dokumentation.

## Screenshots

**Einrichtung**

| Projektordner wählen | Editor-Konfiguration | Cloud-Sync |
|---|---|---|
| ![Projektordner wählen](docs/screenshots/projektordner.png) | ![Editor-Konfiguration](docs/screenshots/editorkonfig.png) | ![Cloud-Sync](docs/screenshots/cloud.png) |

**Die App**

| Dashboard | Editor (Split-Ansicht) |
|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Editor](docs/screenshots/editor.png) |

| Neue Hauptkategorie | Neue Unterkategorie |
|---|---|
| ![Hauptkategorie anlegen](docs/screenshots/kategorie.png) | ![Unterkategorie anlegen](docs/screenshots/unterkategorie.png) |

## Funktionen

- **Editor mit Split-Ansicht** — Markdown-Quelltext und gerenderte Vorschau nebeneinander, Breite frei verstellbar, Vorschau folgt beim Scrollen automatisch mit (ein-/ausschaltbar)
- **Textformatierung** — Fett, Kursiv, Durchgestrichen, Unterstrichen und mehr, über Werkzeugleiste, Rechtsklick-Menü oder direkte Markdown-Syntax
- **Tabellen** — eigenes Bearbeitungsfenster per Doppelklick (Zeilen/Spalten hinzufügen/entfernen, Ausrichtung pro Spalte), Einfügen über Werkzeugleiste, Rechtsklick-Menü oder einfach `/table` eintippen
- **Callouts** — 7 farbcodierte Hinweisblöcke (Info, Tipp, Warnung, Gefahr, Zusammenfassung, Beispiel, Abstract)
- **Checklisten** — anklickbare Häkchen direkt in der Vorschau, werden in die Notiz zurückgeschrieben
- **Bilder** — per Ziehen-und-Ablegen einfügen, Größe in der Vorschau bequem per Prozent-Auswahl (25/50/75/100 %) anpassen
- **Interne Verlinkung** — Notizen per `[[Name]]` oder `[[Ziel|eigener Text]]` miteinander verknüpfen, fehlende Notizen per Klick sofort anlegen; beim Eintippen erscheinen sortierte Vorschläge aus den eigenen Notizen (exakter Treffer vor Präfix vor Enthält, zuletzt verlinkte Notizen bevorzugt)
- **Code-Blöcke** mit Syntax-Highlighting und Kopieren-Button
- **Icon-Bibliothek** — über 90 kuratierte Symbole (Linux-Distributionen, Programmiersprachen, Hardware, Sicherheit, Dokumente, Projekte) für Kategorien und Notizen, durchsuchbar auch über Alltagsbegriffe statt nur Fachbegriffe, mit Favoriten und Zuletzt-verwendet
- **Rechtsklick-Menü** im Editor — Formatierung, Absatz-Optionen, Tabellen, Hinweisblöcke einfügen, ohne die Maus zur Symbolleiste bewegen zu müssen
- **Zweigeteilte Suche** — im Kopfbereich durchsucht das gesamte Wiki und zeigt zu jedem Treffer Kategorie, Schlagwörter und einen hervorgehobenen Textausschnitt, Klick springt direkt zur Fundstelle; innerhalb einer offenen Notiz klassische Suche mit F3/Umschalt+F3 zum Springen zwischen Treffern
- **Startseite/Dashboard** — zuletzt bearbeitete Notizen getrennt von der Gesamtübersicht, mit automatischem Textausschnitt
- **Fokus-Modus** — die restliche Oberfläche tritt beim Schreiben dezent in den Hintergrund (vier Intensitätsstufen), bleibt dabei vollständig bedienbar
- **Zentrales Einstellungsfenster** — Allgemein, Darstellung, Editor, Backup, Updates und Sicherheit an einem Ort, Änderungen wirken sofort
- **Personalisierung** — 11 feste Akzentfarben oder eine völlig frei wählbare eigene Farbe, Sidebar-Größe und Editor-Schriftgröße einstellbar, eigener Name in der Sidebar
- **System-Tray** — läuft bei Bedarf im Hintergrund weiter, Verhalten beim Schließen frei wählbar (nachfragen, minimieren oder beenden)
- **Cloud-Sync** (Nextcloud/WebDAV) — Verbindungstest, reiner Upload, oder vollständiger Zwei-Wege-Abgleich mit Konflikterkennung; optional automatisch im Hintergrund
- **Automatisches lokales Backup** — Intervall frei einstellbar (täglich bis monatlich), alte Versionen werden selbstständig aufgeräumt; Speicherort der Notizen lässt sich jederzeit direkt aus den Einstellungen an einen neuen Ort verschieben
- **Export** als PDF, HTML oder ZIP (ganzes Projekt)
- **Papierkorb** statt endgültigem Löschen

## Installation

Die fertige App gibt es zum Herunterladen unter [Releases](../../releases) — dort einfach die neueste Datei (endet auf `.AppImage`) herunterladen. Ein AppImage ist eine einzelne Datei, die auf jeder gängigen Linux-Distribution läuft, ganz ohne Installation im klassischen Sinn.

**Beim allerersten Start** muss die heruntergeladene Datei einmalig als "ausführbar" markiert werden — das ist eine übliche Sicherheitsmaßnahme unter Linux, damit nicht versehentlich jede heruntergeladene Datei einfach so gestartet werden kann.

**Der einfachste Weg, nur mit der Maus:**
1. Rechtsklick auf die heruntergeladene Datei → **Eigenschaften**
2. Zum Reiter **"Berechtigungen"** wechseln
3. Häkchen bei **"Ausführung als Programm erlauben"** setzen
4. Fenster schließen, Datei per Doppelklick starten

**Alternative über das Terminal**, falls dir das lieber ist:
```bash
chmod +x Archiv-Wiki-*.AppImage
./Archiv-Wiki-*.AppImage
```
Die erste Zeile erlaubt einmalig das Starten, die zweite startet die App tatsächlich. Bei allen künftigen Starts reicht dann einfach ein Doppelklick auf die Datei.

## Selbst bauen

```bash
git clone https://github.com/Smashinger/Archiv-Wiki.git
cd Archiv-Wiki
npm install
npm run dev      # zum Ausprobieren/Entwickeln
npm run dist     # baut AppImage in dist/
```

## Lizenz

MIT — siehe [LICENSE](LICENSE).

Verwendete Drittanbieter-Bibliotheken, Schriftart und Icon-Quellen samt ihrer
jeweiligen Lizenzen: siehe [THIRD_PARTY.md](THIRD_PARTY.md).
