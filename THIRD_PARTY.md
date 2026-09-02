# Third-Party-Komponenten

Archiv-Wiki nutzt folgende Bibliotheken, Schriftarten und Icon-Quellen. Alle sind
permissiv lizenziert (keine Copyleft-Pflichten wie GPL). Die vollständigen
Original-Lizenztexte für Schriftart und Icon-Bibliothek liegen zusätzlich direkt
neben den jeweiligen Dateien im Projekt (siehe Pfadangaben unten).

## Laufzeit-Abhängigkeiten (npm)

| Paket | Lizenz | Zweck |
|---|---|---|
| [gray-matter](https://www.npmjs.com/package/gray-matter) | MIT | Frontmatter aus Markdown-Dateien lesen |
| [archiver](https://www.npmjs.com/package/archiver) | MIT | ZIP-Erstellung (Export, Backup) |
| [webdav](https://www.npmjs.com/package/webdav) | MIT | Cloud-Sync (Nextcloud/WebDAV) |
| [marked](https://www.npmjs.com/package/marked) | MIT | Markdown → HTML (Vorschau) |
| [katex](https://www.npmjs.com/package/katex) | MIT | Mathe-Formel-Darstellung |
| [highlight.js](https://www.npmjs.com/package/highlight.js) | BSD-3-Clause | Code-Syntax-Highlighting |
| [flexsearch](https://www.npmjs.com/package/flexsearch) | Apache-2.0 | Volltextsuche |
| [@codemirror/*](https://codemirror.net/) (state, view, commands, language, lang-markdown, autocomplete) | MIT | Editor-Grundlage |
| [@lezer/highlight](https://lezer.codemirror.net/) | MIT | Syntax-Baum fürs Editor-Highlighting |

## Entwicklungs-Werkzeuge (nicht im ausgelieferten Programm enthalten)

| Paket | Lizenz | Zweck |
|---|---|---|
| [electron](https://www.electronjs.org/) | MIT | Anwendungs-Framework |
| [electron-builder](https://www.electron.build/) | MIT | Baut die AppImage |
| [esbuild](https://esbuild.github.io/) | MIT | Bündelt Editor/Such-Code |

## Schriftart

**Oswald** (SemiBold) — verwendet für den Sidebar-Titel ("Wiki von ...").
Lizenz: **SIL Open Font License 1.1**, Copyright The Oswald Project Authors.
Original-Lizenztext liegt bei: `renderer/assets/fonts/OFL.txt`
Quelle: https://fonts.google.com/specimen/Oswald

## Icon-Bibliothek

Kuratierte Auswahl (97 Dateien, keine vollständigen Bibliotheken) aus drei Quellen:

- **[Lucide](https://lucide.dev/)** (generische Symbole wie Terminal, Schloss, Ordner) —
  Lizenz: **ISC**. Lizenztext: `renderer/assets/icon-library/LICENSES/lucide-ISC.txt`
  (steht zusätzlich als Kommentar in jeder einzelnen Lucide-SVG-Datei)
- **[Simple Icons](https://simpleicons.org/)** (Marken-/Distro-Logos: Debian, Ubuntu,
  Fedora, Arch Linux, openSUSE, GitHub, Docker, Kubernetes u. a.) —
  Lizenz: **CC0 1.0** (gemeinfrei, keine Namensnennung erforderlich).
  Lizenztext: `renderer/assets/icon-library/LICENSES/simple-icons-CC0.txt`
- **Tux** (Linux-Maskottchen, als generisches "Linux"-Symbol) — Original von Larry
  Ewing, vektorisiert von Garrett LeSage (https://github.com/garrett/Tux).
  Lizenz: **Public Domain / CC0**.
  Details: `renderer/assets/icon-library/LICENSES/tux-CC0.txt`

Markenlogos wie Debian, Ubuntu, Fedora, GitHub oder Docker werden ausschließlich
als vom Nutzer wählbare Kennzeichnungs-Icons für eigene Notizen/Kategorien
verwendet — nicht als Teil der Archiv-Wiki-eigenen Marke, ohne Behauptung einer
Verbindung zu den jeweiligen Unternehmen/Projekten.

## App-eigenes Icon/Logo

Das Archiv-Wiki-Icon und -Logo (`assets/branding/`, `docs/branding/`) sind
eigenständige, für dieses Projekt erstellte Gestaltungen — keine Ableitung
fremder Marken.
