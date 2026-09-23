# Archiv-Wiki

![Archiv-Wiki](docs/branding/readme-banner.png)

**Ein persönliches Markdown-Wiki für den Linux-Desktop – für Notizen, Anleitungen, Setups und Checklisten.**

Archiv-Wiki speichert dein Wissen lokal in einem frei wählbaren Ordner als verständliche Markdown-Dateien. Die Anwendung benötigt keinen Account, sendet keinerlei Telemetriedaten und arbeitet vollständig offline. Eine optionale WebDAV-Synchronisierung kann bei Bedarf für den Abgleich mit einer eigenen Nextcloud oder einem WebDAV-Server eingerichtet werden.

---

## Auf einen Blick

- **Local First:** Notizen liegen als lesbare `.md`-Dateien in deinem Dateisystem – volle Kontrolle ohne Vendor-Lock-in.
- **Zweigeteilter Editor:** Leistungsfähige Split-Ansicht mit synchronem Scrollen, Live-Vorschau und moderner Werkzeugleiste.
- **Struktur & Hierarchie:** Haupt- und Unterkategorien mit eigenen Icons, Tags, Backlinks und Favoriten.
- **Lokale KI (optional):** 100% offline via Ollama. Hilft beim Formulieren, Zusammenfassen und findet Querverweise – streng sicher über ein interaktives Vorschlagssystem mit Diff-Vorschau.
- **Web Clipper:** Schnelles Sammeln von Web-Artikeln, Codeblöcken und Bildern aus Firefox, Brave und Chromium direkt in den Eingang.
- **Volltextsuche & Wissenspflege:** Schnelles Finden nach Begriffen, Tags oder Kategorien sowie automatische Erkennung verwaister oder defekter Links.
- **Datensicherheit:** Automatische und manuelle ZIP-Backups, Papierkorb mit Wiederherstellung und optionaler Passwortschutz.

---

## Einblicke

### Schreiben mit Live-Vorschau (Split-Ansicht)

Der Editor verbindet direktes Markdown-Schreiben mit einer synchronen Vorschau. Codeblöcke mit Syntaxhervorhebung, mathematische Formeln (KaTeX), Hinweisblöcke (Callouts), Tabellen und interne Wiki-Links (`[[Notiz]]`) werden in Echtzeit gerendert.

![Editor mit Sidebar und Split-Ansicht](docs/screenshots/mockup-editor-split.png)

### Zentrales Dashboard

Das Dashboard bietet beim Programmstart einen schnellen Überblick über kürzlich bearbeitete Seiten, angepinnte Favoriten, Wiki-Statistiken und die Notizstruktur.

![Dashboard von Archiv-Wiki](docs/screenshots/mockup-dashboard.png)

### Lokaler KI-Assistent & sicheres Vorschlagssystem

Ein optionaler, vollständig lokaler KI-Assistent auf Basis von [Ollama](https://ollama.com/) unterstützt beim Verfassen, Zusammenfassen und Vernetzen von Notizen. Über das schwebende Chat-Panel wird die aktuell geöffnete Notiz direkt mit einbezogen.

**Schutz deiner Daten:** Die KI überschreibt niemals eigenmächtig deine Notizen. Alle Änderungen werden als übersichtliche Vorschlagskarte mit farbigem Diff angezeigt und erst nach deinem Klick auf *„Änderung anwenden“* übernommen.

![Lokaler KI-Assistent und Proposal-System](docs/screenshots/mockup-ai-assistant.png)

### Anpassbare Oberfläche & Einstellungen

Über das zentrale Einstellungsfenster lassen sich Akzentfarben, Modus (Dunkel/Hell), Sidebar-Größe, Lesebreite, Backups, Updates, Web Clipper und der lokale KI-Assistent bequem konfigurieren.

![Einstellungsfenster von Archiv-Wiki](docs/screenshots/mockup-einstellungen.png)

### Alternatives Oberflächendesign (Design 2 Vorschau)

Neben dem bewährten und produktionsreifen **Classic**-Design enthält Archiv-Wiki eine optionale Vorschau auf ein alternatives Oberflächenkonzept (**Design 2**). Es bietet eine neu gestaltete Kopf- und Themenleiste und kann in den Einstellungen jederzeit ausgewählt werden:

![Vorschau auf das alternative Design 2](docs/screenshots/design2-preview.png)

---

## Funktionen

### Schreiben und Gestalten
- **Flexible Ansichten:** Wähle zwischen reinem Editor, synchroner Split-Ansicht oder voller Vorschau.
- **Formatierung:** Schneller Zugriff über Werkzeugleiste, Kontextmenü oder gewohnte Markdown-Syntax.
- **Erweiterte Elemente:** Tabellen (mit interaktivem Raster einfügen), Checklisten, KaTeX-Formeln, Callouts (`> [!TIP]`, `> [!NOTE]`) und Bilder.
- **Bilder unkompliziert einfügen:** Bilder direkt aus der Zwischenablage per `Strg+V` oder über den Dateidialog einbetten.
- **Code mit Komfort:** Syntaxhervorhebung für gängige Sprachen mit praktischer Kopieren-Schaltfläche.
- **Fokus-Modus:** Blendet die Navigation für ablenkungsfreies Arbeiten vollständig aus (`Strg+Umschalt+F`).

### Struktur und Wissensvernetzung
- **Kategorienbaum:** Haupt- und Unterkategorien mit anpassbaren Icons für eine saubere Themenstruktur.
- **Wiki-Links:** Notizen mit doppelten eckigen Klammern `[[Zielnotiz]]` vernetzen; eingehende Verlinkungen (Backlinks) werden automatisch am Notizkopf angezeigt.
- **Tags & Favoriten:** Verschlagwortung über Tags sowie Anpinnen wichtiger Seiten direkt auf das Dashboard.
- **Wissenspflege:** Findet defekte Verlinkungen, Notizen ohne Tags oder leere Einträge mit direktem Korrektursprung.
- **Eingang:** Lokaler Zwischenspeicher für Web-Clips, Notizen und Textfragmente, die erst später einsortiert werden sollen.

### Lokale KI-Unterstützung (optional via Ollama)
- **100% Offline & Privat:** Direkte Anbindung an eine lokale [Ollama](https://ollama.com/)-Instanz – deine Notizen verlassen niemals deinen Rechner.
- **Freie Modellwahl:** Nutze quelloffene Sprachmodelle passend zu deiner Hardware (z. B. Qwen 2.5, Llama 3.1 oder Gemma 2).
- **Non-destruktives Vorschlagssystem:** Die KI überschreibt niemals eigenmächtig deine Notizen. Jede Änderung wird als farbiges Diff dargestellt und erfordert stets deine Bestätigung.
- **Kontext der aktiven Notiz:** Beziehe die geöffnete Notiz oder markierten Text per Mausklick in die Unterhaltung ein.
- **Intelligenter Wikilink-Finder:** Erkennt automatisch passende Textstellen zu existierenden Notizen und schlägt interne Querverweise (`[[Notiz]]`) vor.
- **Kontextmenü-Aktionen:** Schneller Zugriff per Rechtsklick im Editor (z. B. Zusammenfassen, Verbessern oder Wikilinks finden).

### Suchen und Finden
- **Echtzeit-Volltextsuche:** Durchsucht blitzschnell Titel, Textinhalte, Kategorien und Tags.
- **Hervorgehobene Fundstellen:** Zeigt gefundene Textausschnitte mit Markierung an.
- **Tastaturfokus:** Vollständig per Tastatur bedienbar (`Strg+K`).

### Datensicherheit und Privatsphäre
- **Eigene Dateien:** Notizen bleiben ganz normale `.md`-Dateien auf deiner Festplatte.
- **Backups:** Automatische Zeitplan-Backups oder manuelle ZIP-Archive mit Prüfsummenvalidierung.
- **Papierkorb:** Gelöschte Notizen landen im Papierkorb und können jederzeit wiederhergestellt werden.
- **Optionales App-Passwort:** Schützt das Öffnen der Anwendung mit sicherem Argon2id-Hash.
- **Optionale Cloud-Synchronisation:** WebDAV-Integration für eigene Nextcloud-, ownCloud- oder Server-Instanzen.

---

## Installation

Archiv-Wiki wird für **Linux** als transportables AppImage bereitgestellt und auf **Fedora** entwickelt und getestet.

1. Öffne die [Releases](../../releases).
2. Lade die neueste `.AppImage`-Datei herunter.
3. Mache die Datei ausführbar und starte sie.

### Ausführbar machen – grafisch
1. Rechtsklick auf die Datei `Archiv-Wiki-*.AppImage` → **Eigenschaften**.
2. Im Reiter **Berechtigungen** die Option *„Ausführen der Datei als Programm erlauben“* aktivieren.
3. Datei per Doppelklick starten.

### Ausführbar machen – Terminal
```bash
chmod +x Archiv-Wiki-*.AppImage
./Archiv-Wiki-*.AppImage
```

Beim ersten Start führt ein kompakter Einrichtungsassistent durch die Auswahl des Wiki-Speicherorts und grundlegende Optionen.

---

## Web Clipper

Mit dem Web Clipper lassen sich Webseiten, markierte Absätze oder Bilder direkt vom Browser lokal in den Eingang von Archiv-Wiki übergeben:

- **Firefox:** Offiziell über [Mozilla Add-ons](https://addons.mozilla.org/de/firefox/addon/archiv-wiki-web-clipper/) verfügbar.
- **Brave (Flatpak):** Lässt sich unter **Einstellungen → Web Clipper** mit einem Klick für Brave als Linux-Flatpak registrieren – ganz ohne Administratorrechte.
- **Chromium (System):** Ebenfalls unter **Einstellungen → Web Clipper** für systemweit installierte Chromium-Browser vorkonfigurierbar.

*Hinweis: Archiv-Wiki muss geöffnet sein, um Clips aus dem Browser lokal zu empfangen.*

---

## Dokumentation

- Ausführliche Anleitungen zur Einrichtung und Bedienung findest du im [GitHub-Wiki](../../wiki).
- Neuigkeiten und Änderungsprotokolle einzelner Versionen sind in den [Releases](../../releases) zu finden.

---

## Entwicklung & Datenschutz

Archiv-Wiki wurde von Anfang an mit Unterstützung moderner KI-Werkzeuge und Coding-Assistenten entwickelt (Code-Erstellung, Tests, Dokumentation und Reviews). Planung, Funktionsumfang, Designentscheidungen und finale Freigaben bleiben dabei vollständig menschlich gesteuert.

Der in Archiv-Wiki integrierte KI-Assistent arbeitet rein optional und bindet ausschließlich deine eigene, lokale [Ollama](https://ollama.com/)-Instanz an. Eigene Notizen und Wiki-Daten bleiben ausnahmslos auf deiner Festplatte: Es gibt keine Telemetrie, keine Cloud-Zwänge und kein Benutzerkonto.

## Für Entwickler

Voraussetzung: **Node.js 18 oder neuer**.

```bash
git clone https://github.com/Smashinger/Archiv-Wiki.git
cd Archiv-Wiki
npm install
npm run dev
```

Ein AppImage wird mit folgendem Befehl in `dist/` erstellt:

```bash
npm run dist
```

## Lizenz

Archiv-Wiki steht unter der [MIT-Lizenz](LICENSE).

Lizenzen der verwendeten Bibliotheken, Schriftarten und Icon-Quellen sind in [THIRD_PARTY.md](THIRD_PARTY.md) aufgeführt.
