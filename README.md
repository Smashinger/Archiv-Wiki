# Archiv-Wiki

![Archiv-Wiki](docs/branding/readme-banner.png)

**Ein persönliches Markdown-Wiki für den Linux-Desktop – für Notizen, Anleitungen, Setups und Checklisten.**

Archiv-Wiki speichert dein Wissen lokal in einem eigenen Projektordner. Es benötigt keinen Account, sendet keine Telemetriedaten und funktioniert ohne Cloud. Eine optionale WebDAV-Synchronisierung kann bei Bedarf zusätzlich eingerichtet werden.

## Kurzüberblick

- **Local First:** Deine Notizen bleiben als Markdown-Dateien in deinem eigenen Ordner.
- **Struktur statt Dateichaos:** Hauptkategorien, Unterkategorien, Tags und interne Verlinkungen schaffen Übersicht.
- **Schreiben und Lesen in einer Ansicht:** Markdown-Editor, Split-Ansicht und gerenderte Vorschau sind direkt integriert.
- **Schnell wiederfinden:** Die Volltextsuche durchsucht Titel, Inhalte, Tags und Kategorien.
- **Daten absichern:** Lokale Backups, Papierkorb und Exporte schützen vor versehentlichem Verlust.
- **Optional synchronisieren:** WebDAV kann für den Abgleich mit einem eigenen Cloud-Speicher verwendet werden.

## Dashboard

![Dashboard von Archiv-Wiki](docs/screenshots/dashboard-aktuell.png)

Das Dashboard bündelt zuletzt bearbeitete, angepinnte und vorhandene Notizen. Statistiken und dezente Bedienhinweise geben Orientierung, ohne den persönlichen Arbeitsbereich zu überladen.

## Was ist Archiv-Wiki?

Archiv-Wiki ist eine Desktop-Anwendung für Wissen, das dauerhaft auffindbar bleiben soll: Installationsanleitungen, Problemlösungen, persönliche Dokumentationen, Ideen oder wiederkehrende Checklisten.

Statt Informationen über einzelne Textdateien, Haftnotizen, Browser-Lesezeichen und Chatverläufe zu verteilen, werden sie in einem lokalen Wiki gesammelt. Die Anwendung verbindet die Offenheit von Markdown mit einer festen, übersichtlichen Oberfläche – ohne Plugin-Pflicht und ohne Bindung an einen Online-Dienst.

## Die Anwendung

### Schreiben mit direkter Vorschau

![Editor mit Sidebar und Split-Ansicht](docs/screenshots/editor-split.png)

Der Editor bietet Quelltext, Vorschau oder eine frei einstellbare Split-Ansicht. Werkzeugleiste, Kontextmenü und direkte Markdown-Syntax unterstützen unterschiedliche Arbeitsweisen.

### Inhalte schnell wiederfinden

<p align="center">
  <img src="docs/screenshots/suche.png" alt="Volltextsuche in Archiv-Wiki" width="460">
</p>

Die Suche zeigt Titel, Textausschnitte, Tags und Kategoriepfade. Treffer werden hervorgehoben und lassen sich vollständig per Tastatur bedienen.

### Einstellungen an einem Ort

![Einstellungsfenster von Archiv-Wiki](docs/screenshots/einstellungen.png)

Allgemeine Optionen, Darstellung, Editor, Backup, Updates und Sicherheit sind in einem gemeinsamen Einstellungsfenster zusammengefasst.

### Lokale Backups

![Backup-Einstellungen von Archiv-Wiki](docs/screenshots/backup.png)

Backups können automatisch nach einem gewählten Zeitplan oder jederzeit manuell erstellt werden. Status, Speicherort und Hinweise zur Wiederherstellung bleiben direkt in der Anwendung sichtbar.

### Fokus-Modus

![Fokus-Modus von Archiv-Wiki](docs/screenshots/fokus-modus.png)

Der Fokus-Modus dimmt die umgebende Oberfläche in vier wählbaren Stufen. Editor und Vorschau bleiben im Mittelpunkt, während Navigation und Werkzeuge weiterhin erreichbar sind.

## Funktionen

### Schreiben und Darstellen

- Markdown-Editor mit Editor-, Split- und Vorschauansicht
- frei verstellbare Split-Breite und optionale Lesebreite
- Formatierung über Werkzeugleiste, Kontextmenü oder Markdown-Syntax
- Tabellen, Checklisten, Bilder, Codeblöcke, Formeln und Hinweisblöcke
- Syntaxhervorhebung und Kopieren-Schaltfläche für Code
- eigene Notizvorlagen für wiederkehrende Inhalte
- Fokus-Modus für konzentriertes Schreiben und Lesen

### Organisieren

- Hauptkategorien, Unterkategorien und Notizen in einer festen Baumstruktur
- Tags für bereichsübergreifende Zuordnung
- interne Wikilinks mit `[[Notizname]]`
- angepinnte und zuletzt bearbeitete Notizen im Dashboard
- kuratierte Icons für Kategorien und Notizen
- Papierkorb mit Wiederherstellung vor dem endgültigen Löschen

### Suchen und Navigieren

- Volltextsuche über Titel, Inhalt, Tags und Kategorien
- verständliche Treffergründe und hervorgehobene Fundstellen
- Suche innerhalb einer geöffneten Notiz
- Kontextmenüs sowie umfassende Tastaturbedienung
- zentrale Übersicht der verfügbaren Tastenkürzel

### Daten und Sicherheit

- lokale Markdown-Dateien im frei gewählten Projektordner
- automatische und manuelle ZIP-Backups
- überprüfte Backup-Archive und sichere temporäre Speicherung
- Export als Markdown, HTML, PDF oder ZIP
- optionales App-Passwort
- verständliche Fehler- und Statusmeldungen

### Desktop-Komfort

- zentrale Einstellungen für Darstellung, Editor, Backup und Updates
- anpassbare Akzentfarbe, Sidebar-Dichte und Editor-Schriftgröße
- System-Tray mit wählbarem Verhalten beim Schließen
- integrierte Update-Prüfung mit Downloadfortschritt und Neustart
- optionale WebDAV-Synchronisierung mit einem eigenen Server oder Nextcloud
- ruhige Animationen und Unterstützung für reduzierte Bewegung

## Installation

Archiv-Wiki wird aktuell für **Linux** als AppImage bereitgestellt und auf **Fedora** getestet.

1. Öffne die [Releases](../../releases).
2. Lade die neueste Datei mit der Endung `.AppImage` herunter.
3. Markiere die Datei einmalig als ausführbar.
4. Starte Archiv-Wiki per Doppelklick.

### Ausführbar machen – grafisch

1. Rechtsklick auf die heruntergeladene Datei
2. **Eigenschaften** öffnen
3. Unter **Berechtigungen** die Ausführung als Programm erlauben
4. Datei per Doppelklick starten

### Ausführbar machen – Terminal

```bash
chmod +x Archiv-Wiki-*.AppImage
./Archiv-Wiki-*.AppImage
```

Beim ersten Start führt ein Einrichtungsassistent durch Projektordner, Wiki-Name und grundlegende Optionen. WebDAV ist optional; Archiv-Wiki kann vollständig lokal verwendet werden.

## Dokumentation

Weiterführende Anleitungen zur Einrichtung und Bedienung befinden sich im [GitHub-Wiki](../../wiki).

Änderungen und Downloads einzelner Versionen sind unter [Releases](../../releases) dokumentiert.

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
