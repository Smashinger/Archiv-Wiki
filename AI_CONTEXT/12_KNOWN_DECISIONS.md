# Archiv-Wiki — Bekannte Entscheidungen (zentrales Nachschlagewerk)

## Architektur & Technologie

- Electron als Desktop-Hülle, kein Web-Produkt, keine Web-Version geplant.
- Drei-Schichten-Modell: Hauptprozess, Preload, Renderer.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` — nicht verhandelbar.
- Kommunikation zwischen Renderer und Hauptprozess ausschließlich über `preload.js` + IPC-Kanäle nach dem Schema `<bereich>:<aktion>`.
- Externe Links öffnen immer im System-Browser, nie im App-Fenster.
- CodeMirror 6 als Editor.
- marked.js als Markdown-Renderer.
- highlight.js für Syntax-Highlighting im Vorschau-Code.
- KaTeX für mathematische Formeln.
- FlexSearch für Volltextsuche.
- gray-matter für Frontmatter-Parsing.
- esbuild als Build-Werkzeug, kein Webpack/Vite.
- Editor-Bundle wird vorab gebaut (`npm run build:vendor`), nicht zur Laufzeit einzeln geladen.
- electron-builder für Distribution, Zielformat AppImage (Linux).
- Auto-Update über `electron-updater`.
- Lizenz: MIT.

## Datenmodell

- Ein Projekt ist ein gewöhnlicher Ordner mit `.wiki-config.json`, `.wiki-trash/`, `.attachments/` und Kategorie-Unterordnern.
- Genau zwei Hierarchie-Ebenen: Hauptkategorie → Unterkategorie → Notiz. Keine tiefere Verschachtelung, keine Notizen direkt in einer Hauptkategorie.
- Notizen sind `.md`-Dateien mit YAML-Frontmatter (`title`, `tags`, `category`, `mainCategory`, `created`, `modified`).
- Anhänge/Bilder liegen projektweit gemeinsam in einem `.attachments/`-Ordner, nicht pro Notiz oder Kategorie.
- Bild-Referenzen nutzen die Syntax `attachment:<dateiname>`, aufgelöst zur `file://`-URL im `.attachments/`-Ordner.
- Papierkorb liegt flach (`.wiki-trash/`), keine gespiegelte Ordnerstruktur.
- Der Eingang ist ein eigener Systembereich unter `incoming/` und gehört nicht zum normalen Notizbestand. Die Markerdatei `.archiv-wiki-incoming` kennzeichnet die von Archiv-Wiki verwaltete Struktur und verhindert die Übernahme eines gewöhnlichen vorhandenen Ordners gleichen Namens.
- Projekt-Einstellungen liegen in `.wiki-config.json`, per Deep-Merge aktualisiert.
- Symlinks werden beim Einlesen von Notizen/Suche bewusst übersprungen, nicht aufgelöst.


## Projektidentität

### Entscheidung

Archiv-Wiki verwendet den **normalisierten Projektpfad** als eindeutige Identität für projektbezogene Laufzeitdaten außerhalb des eigentlichen Wiki-Projekts, beispielsweise für den Backup-Status.

Es wird bewusst **keine `projectId` oder UUID** eingeführt. Der Projektpfad bleibt die einzige Identität für projektbezogene Laufzeitdaten.

### Begründung

- Die gesamte Projektarchitektur arbeitet derzeit pfadbasiert.
- Das zuletzt geöffnete Projekt wird bereits über den Projektpfad verwaltet.
- Es existiert aktuell keine allgemeine Projektverwaltung mit mehreren gleichzeitig registrierten Wikis.
- Eine UUID würde zusätzliche Migrationslogik für bestehende Wikis erfordern.
- Beim Kopieren eines Wiki-Ordners müssten doppelte Projekt-IDs erkannt und behandelt werden.
- Der Backup-Status enthält ausschließlich Laufzeitinformationen wie letztes Backup, letzter Fehler und Fehleranzahl, aber keine eigentlichen Projektdaten.
- Beim Verschieben eines Wiki-Ordners gehen keine Notizen, Einstellungen oder Backups verloren. Lediglich die projektbezogenen Laufzeitinformationen beginnen für den neuen Pfad neu.

### Auswirkungen

Das Verschieben eines Wiki-Ordners wird bewusst als **neue Projektinstanz für app-weite Laufzeitdaten** behandelt.

Die eigentlichen Projekteinstellungen bleiben erhalten, da sie sich weiterhin innerhalb der `.wiki-config.json` des Projekts befinden.

### Zukunft

Eine dauerhafte `projectId` oder UUID wird erst eingeführt, wenn Archiv-Wiki eine allgemeine Projektidentität benötigt, beispielsweise für:

- Verwaltung mehrerer Wikis
- Projektübersicht
- Import/Export
- Verschieben von Projekten
- Synchronisation
- weitere projektübergreifende Metadaten

Eine UUID wird dann als allgemeine Architekturentscheidung umgesetzt und nicht ausschließlich für das Backup-System.

## Sicherheit & Datenschutz

- Keine Cloud-Pflicht, keine Telemetrie, kein Konto nötig.
- Cloud-Synchronisierung (WebDAV) ist optional und muss explizit eingerichtet werden.
- Alle Daten liegen als offene `.md`-Dateien lokal, kein proprietäres Format.

## Design

- Farb-, Rundungs-, Abstands- und Übergangswerte ausschließlich über zentrale CSS-Variablen, keine neuen, hartkodierten Werte.
- Standard-Übergangszeit: 150ms.
- Standard-Rundungen: 4px (klein/interaktiv), 6px (Karten), 8px (große Panels).
- Akzentfarbe für normale, aktive und "ungespeichert"-Zustände; Rot ausschließlich für echte Fehler und destruktive Aktionen.
- Kein Schwebe-Hover (Anheben + Schatten) — nur Farbwechsel.
- SVGs dürfen sowohl für thematische als auch für funktionale UI-Icons verwendet werden. Vorhandene zentrale und kuratierte SVG-Systeme werden bevorzugt und bestehende Icons wiederverwendet; parallele Icon-Systeme und unnötige Stil-Mischungen werden nicht eingeführt. Bunte Emoji bleiben für funktionale UI-Elemente ausgeschlossen.
- Monospace-Schrift für Editor-Inhalt und Vorschau-Überschriften; proportionale Schrift für Vorschau-Fließtext.
- Responsiver Hauptumbruchpunkt bei 900px Fensterbreite (Sidebar-Verhalten).
- `prefers-reduced-motion: reduce` wird respektiert.

## Dashboard

- Vier Bereiche: Statistik-Kacheln, angeheftete Notizen, zuletzt bearbeitet, alle Notizen.
- Reihenfolge und Ein-/Ausblendung der Bereiche pro Projekt speicherbar, per Sperr-/Entsperr-Symbol geschützt.
- Statistiken werden ausschließlich aus vorhandenen Frontmatter-Daten berechnet, keine separate Datenerfassung.
- Tipps sind ein einzelnes Symbol im Kopfbereich, kein eigener Dashboard-Bereich mit fester Position.
- Tipps stammen aus einer festen, lokalen Liste, kein externer Abruf.

## Sidebar

- Zwei-Ebenen-Kategorie-Baum, Ein-/Ausklapp-Zustand pro Kategorie gespeichert.
- Aktive Kategorie(n) der offenen Notiz werden dezent hervorgehoben, unabhängig von der Start-Einklapp-Einstellung.
- Sidebar-Breite frei wählbar zwischen 220–480px, Standard 292px, pro Projekt gespeichert.
- Sidebar vollständig einklappbar; Verhalten unterscheidet sich nach Fensterbreite (siehe Designsystem).
- Verschieben/Umsortieren ausschließlich über bei Hover erscheinende Ziehgriffe, kein permanenter Bearbeitungsmodus-Knopf.
- Genau ein Such-/Filter-Mechanismus für das gesamte Wiki, kein zweiter, paralleler.
- Icon-Auswahl für Kategorien/Notizen ausschließlich über die kuratierte SVG-Icon-Bibliothek.
- Notizen, Hauptkategorien und Unterkategorien besitzen keine separaten Drei-Punkte-Schaltflächen. Ihre vorhandenen Aktionen werden ausschließlich über das gemeinsame Kontextmenü per Rechtsklick, `Shift+F10` oder Kontextmenütaste angeboten.

## Eingang

- Der Eingang ist ein eigener Projekt- und Systembereich, getrennt vom normalen Notizbestand. Er enthält importierte oder gesammelte Inhalte vor ihrer Verarbeitung zu normalen Notizen.
- Eingangsdaten werden unter `incoming/` gespeichert. Die Markerdatei `.archiv-wiki-incoming` kennzeichnet die von Archiv-Wiki verwaltete Struktur; ein gewöhnlicher vorhandener Ordner gleichen Namens wird nicht übernommen oder überschrieben.
- Der Eingang nimmt Texte, Dateien, Bilder und Web-Clips auf.
- Die Sichtbarkeit des Eingang-Bereichs in der Sidebar kann abgeschaltet werden, ohne gespeicherte Eingangsdaten zu löschen.
- Die Eingangsliste unterstützt Mehrfachauswahl sowie eine bestätigte Sammellöschung.
- Beim Verarbeiten zu einer neuen Notiz wird der Eingang-Eintrag erst entfernt, nachdem die Notiz erfolgreich gespeichert und anschließend verifiziert wurde. Schlägt die Speicherung oder Verifikation fehl, bleibt der Eingang erhalten.
- Beim Anlegen einer neuen normalen Notiz aus einem Eingang-Eintrag werden vorhandene Herkunftsinformationen im Frontmatter-Objekt `origin` erhalten. `origin.type` ist dabei `incoming`, `origin.incomingId` enthält die ursprüngliche Eingang-ID. Soweit im Eingang vorhanden, werden außerdem die abgeleitete Quellenbezeichnung `source`, die Quell-URL `sourceUrl`, die Bild-URL `imageUrl`, der Seitentitel `pageTitle`, der ursprüngliche Dateiname `fileName`, der Eingang-Typ `importType` und der Erfassungszeitpunkt `capturedAt` (aus `capturedAt`, ersatzweise `createdAt`) übernommen. Nicht vorhandene optionale Herkunftsfelder werden nicht ergänzt.
- Bilder werden bei der Verarbeitung in den regulären projektweiten `.attachments/`-Bereich übernommen.
- Aktueller technischer Stand, keine dauerhafte Zielbeschränkung: Das Ergänzen einer bestehenden Notiz ist noch nicht für alle Eingangstypen verfügbar; aktuell wird dieser Weg für Bilder unterstützt. Eine neue Notiz benötigt derzeit eine bereits vorhandene passende Unterkategorie als Ziel.

## Web Clipper

- Firefox und Chromium/Brave verwenden eine gemeinsame Extension-Codebasis mit Manifest V3. Die aktuelle Extension-Version ist `0.2.0`.
- Native Messaging ist der lokale Transport zwischen Browser-Erweiterung und Archiv-Wiki. Gesammelte Inhalte werden in den Eingang übernommen.
- Unterstützte Sammelarten sind URL, Textauswahl, vollständige Seite und Bilder.
- Private Browserfenster beziehungsweise Inkognito sind im Manifest mit `"incognito": "not_allowed"` gesperrt.
- Die feste Chromium-ID lautet `dengpgfllpkndkgkbikigaejieogndbp`; die feste Gecko-ID lautet `webclip@archiv-wiki.smashii.de`.
- Für Chromium wird eine signierte CRX mitgeführt. Ihre ID und Version werden vor `dist` und `release` geprüft; die CRX wird als `extraResource` in das App-Paket aufgenommen.
- Die Brave-Flatpak-Installation wird ausdrücklich vom Nutzer angestoßen und ohne Root-Rechte vorbereitet. Eine bewusste Entfernung der Erweiterung wird respektiert und nicht automatisch rückgängig gemacht.
- Die AppImage-Ausführung richtet einen stabilen Native-Host-Weg für die Kommunikation mit dem Browser ein.
- Der Firefox Web Clipper `0.2.0` ist unter der festen Gecko-ID öffentlich über Mozilla Add-ons verfügbar; der öffentliche Installations- und Clip-Weg ist real bestätigt. Technische Details und die weiterhin bestehende Grenze für Firefox als Flatpak stehen in `16_WEB_CLIPPER.md`.

## Wissenspflege

- Wissenspflege ist ein eigener, nicht-schreibender Projektbereich zur Qualitätskontrolle des Wiki-Bestands.
- Der Bereich erkennt defekte Wikilinks, Notizen ohne Tags und leere Notizen anhand der vorhandenen Archivdaten.
- Prüfungen verändern weder Notizen noch die Projektkonfiguration; gefundene Einträge führen zur betroffenen Notiz.

## Editor

- Drei Ansichtsmodi (Editor/Split/Vorschau). Ansichtsmodus und Split-Breite sind Projekt-Einstellungen, werden projektweit wiederhergestellt und gehören nicht zum individuellen Notiz-Datenmodell.
- Werkzeugleisten-Elemente einheitlich 32px hoch, 150ms Übergangszeit.
- Automatisches Schließen von Klammern/Anführungszeichen, erweitert um `` ` `` und `*`.
- Editor-Schrift durchgehend Monospace.
- Rechtschreibprüfung aktuell fest auf Deutsch, sofort umschaltbar ohne Neustart.
- Scrollposition (Editor und Vorschau getrennt) wird pro Notiz gespeichert und wiederhergestellt.
- Tab-Größen-Einstellung erfordert gleichzeitig zwei CodeMirror-Facetten (visuelle Breite und tatsächliches Einrückungsverhalten).
- Vorschau-Aktualisierung ist entprellt (kurze Verzögerung nach Tastenanschlag), Render-Ergebnis selbst bleibt unverändert.
- Auto-Save-Intervall wirkt sofort, ohne die Notiz erneut zu öffnen.
- Bild-Größenänderung ausschließlich über Hover-Knöpfe (25/50/75/100 %), nicht per Ziehen am Bild.
- Bildbreiten-Angabe wird über reguläre Markdown-Bildsyntax mit Zusatzattribut transportiert, nie über ein rohes HTML-`<img>`-Tag.
- Der Fokus-Modus konzentriert die Arbeitsfläche auf den Editor: Er blendet die Sidebar aus, gibt ihren Platz für den Editorbereich frei und wechselt beim Aktivieren vorübergehend zur Editoransicht, ohne diesen temporären Ansichtswechsel projektweit zu speichern. Die zurückhaltende neutrale Schattenwirkung bleibt fest erhalten; eine separate Intensitäts- oder Abdunkelungsoption gibt es nicht. Der An/Aus-Zustand wird nicht gespeichert.
- Fokus-Modus-Hervorhebung ist bewusst farblich neutral, ohne Akzentfarbe.
- Tabellen-Bearbeitung über ein eigenes Fenster (Doppelklick in der Vorschau), keine Pfeiltasten-Navigation zwischen Zellen.

## Vorschau

- Callouts und Wikilinks werden über eine Platzhalter-Technik vor dem Markdown-Parsen geschützt und danach wieder eingesetzt.
- Ein einziger, gemeinsamer Inhaltscontainer steuert die Lesebreite; kein Element bekommt eine eigene, unabhängige Breiten-/Zentrierungs-Regel.
- Tabellen und Codeblöcke dürfen breiter sein als übriger Text und scrollen selbst horizontal.
- Überschriften H1–H6 vollständig gestaltet; H4–H6 sinken nie unter Fließtextgröße.
- Horizontale Linie flach/modern statt Browser-Standard.
- Bild-Klick öffnet eine eigene Vergrößerungsansicht (kein Browser-natives Feature).
- Wikilink-Syntax: `[[Notizname]]` sowie `[[Notizname|Anzeigetext]]`.
- Callout-Syntax basiert auf Markdown-Zitat-Syntax (`>`) mit Typ-Kennzeichnung in der ersten Zeile.

## Dialoge

- Alle modalen HTML-Dialoge verwenden die gemeinsame Bedien- und Accessibility-Hilfe in `renderer/js/dialog.js`; parallele eigene Fokusfallen oder Hintergrundsperren sind nicht zulässig.
- Modale Dialoge erhalten `role="dialog"`, `aria-modal="true"`, eine eindeutige Titelverknüpfung und – sofern ein beschreibender Text vorhanden ist – `aria-describedby`.
- Der Fokus startet an einem sinnvollen Bedienelement, bleibt mit Tab/Umschalt+Tab im Dialog und kehrt nach dem Schließen zum Auslöser zurück. Die übrige Oberfläche ist währenddessen nicht fokussierbar.
- Escape schließt Dialoge, sofern kein fachlich kritischer Vorgang dies verhindert. Nicht-destruktive Eingabedialoge können Enter eindeutig auf ihre primäre Aktion abbilden; destruktive oder verlustbehaftete Aktionen werden nicht automatisch durch Enter ausgelöst.
- Kritische Dialoge schließen nicht durch Klick außerhalb. Bewusst nicht-kritische Ansichten wie Bildvergrößerung und Dashboard-Anpassung dürfen weiterhin über den Hintergrund geschlossen werden.
- Einstellungen, Backup-Fehlerdialog, Eingabedialoge, Cloud-Sync, Vorlagen-/Kategorieauswahl, Tastenkürzel, Tabelleneditor, Bildvergrößerung und Dashboard-Anpassung folgen demselben Fokus- und Tastaturstandard.
- `renderer/js/dialog.js` ergänzt bei allen verwalteten HTML-Dialogen dieselben strukturellen Rollen für Dialogfläche, Kopfbereich, Titel, Inhalt und Aktionsleiste. Bestehende visuelle Dialogklassen bleiben dabei erhalten.
- Bestätigungsdialoge ordnen sekundäre Aktionen vor der primären Aktion an. Zusätzliche Werkzeugaktionen bleiben unverändert; destruktive beziehungsweise primäre Aktionen stehen am rechten Ende der gemeinsamen Aktionsleiste.
- Modale HTML-Dialoge verwenden ausschließlich das vorhandene monochrome Icon-System. Emoji in Dialogtiteln und funktionalen Dialogaktionen werden nicht verwendet.
- Alle verwalteten Dialoge teilen gemeinsame visuelle Regeln für Titel, Beschreibung, Aktionsleiste, responsive Größenbegrenzung, Scrollverhalten sowie Hover-, Disabled- und Focus-Visible-Zustände. Bestehende fachlich notwendige Größenunterschiede bleiben erhalten.
- Fehlerdialoge verwenden verständliche Hauptmeldungen; technische Details sind nur ergänzend und optisch nachgeordnet sichtbar.

## Einstellungen

- Ein zentrales Overlay, sieben Abschnitte: Allgemein, Darstellung, Editor, Backup, Updates, Web Clipper, Sicherheit.
- Jede Änderung speichert sofort, kein gesonderter Speichern-Knopf.
- Alle projektbezogenen Einstellungen liegen in der Projekt-Konfiguration, nie in einer separaten, zwischengespeicherten Kopie.
- Live-wirksame Einstellungsänderungen laufen über einen einzigen, zentralen Konfigurationsänderungs-Rückruf.
- Der zentrale Settings-Merge (`deepMerge()` in `main/settings-ipc.js`) verwirft die Schlüssel `__proto__`, `constructor` und `prototype` grundsätzlich, statt sie zu übernehmen oder in sie hinein zu rekursieren — verhindert, dass ein Patch den globalen Objektprototyp verändert.

## Suche

- Ein einziges Such-System (kein separater Baum-Filter zusätzlich zur globalen Suche).
- Volltextsuche über Titel, Fließtext, Schlagworte und Kategorie.
- Ein FlexSearch-Index im Arbeitsspeicher, kompletter Neuaufbau bei Datenänderung statt inkrementeller Aktualisierung.
- Suchergebnisse als Dropdown mit Titel, Kategorie, Schlagworten und Textausschnitt.
- Suchergebnis-Icons verwenden das bestehende Icon-System; Bibliotheks-Fallbacks wie `docs/file-text` werden als SVG gerendert und nie als sichtbarer Text ausgegeben.
- Sidebar-Suche und editor-interne Suche (aktuelle Notiz) sind bewusst getrennte, unterschiedliche Mechanismen.

## Updates

- `electron-updater` bleibt die einzige Update-Engine; es existiert keine parallele eigene Download- oder Installationslogik.
- Gleichzeitige Update-Prüfungen teilen dieselbe Main-Prozess-Promise. Automatische und manuelle Downloads teilen ebenfalls eine einzige zentrale Sperre.
- Ein installationsbereites oder bereits installierendes Update blockiert neue Downloads und weitere Installationsaufrufe.
- Der Installations-IPC bestätigt mit `started`, dass `quitAndInstall()` angestoßen wurde; er behauptet nicht vorzeitig, das Update sei bereits installiert.
- Für Linux-AppImage mit `electron-updater` 6.8.9 wird nach ausdrücklichem Nutzerklick `quitAndInstall(false, true)` ohne zusätzlichen `app.relaunch()`-Pfad verwendet.
- Vor dem Update-Neustart werden die vorhandenen Backup-/Sync-Beendenmechanismen berücksichtigt. Der Single-Instance-Lock wird unmittelbar vor `quitAndInstall()` freigegeben, damit die neu gestartete AppImage-Instanz nicht als unerlaubte zweite Instanz beendet wird.
- Prüfungs-, Download- und Installationsfehler werden getrennt behandelt und setzen nur die jeweils betroffenen Laufzeitwerte zurück.
- Die tatsächliche installierte Version stammt aus `package.json` beziehungsweise `app.getVersion()`; Versionsnummern werden ausschließlich mit `npm version patch|minor|major` geändert.
- Der Main-Prozess ist die einzige Quelle des vollständigen Update-Lifecycle-Status. Alle sichtbaren Oberflächen verwenden dieselbe Statusabfrage und dasselbe Ereignis `update:statusChanged`; lokale Renderer-Kopien von `latestVersion` oder `updateAvailable` sind nicht zulässig.
- Eine erfolgreiche Prüfung ohne neues Release ist der einzige Zustand, der als „Auf dem neuesten Stand“ dargestellt wird. Fehler, Offlinebetrieb, ein noch nicht erfolgter Check und ein nicht verfügbares Updater-Modul bleiben eigenständige Zustände.
- `lastUpdateCheckAt` wird zentral bei jeder erfolgreichen Prüfung aktualisiert, unabhängig davon, welcher Einstiegspunkt die Prüfung ausgelöst hat.
- Update-Fehler werden zentral im Main-Prozess in verständliche Hauptmeldungen übersetzt; technische Originaldetails sind nur ergänzend sichtbar. Renderer-Komponenten implementieren keine eigene parallele Fehlerübersetzung.
- Der Update-Toast ist bewusst nicht-modal, stiehlt keinen Fokus und bleibt während `installing` nicht schließbar. Ein heruntergeladenes Update bleibt unabhängig vom Toast dauerhaft über den zentralen Status und die vorhandenen Update-Oberflächen installierbar.

## Backup

- Alle Backup-Einstiegspunkte (Automatik, Einstellungen, Tray) teilen eine einzige zentrale Laufzeitsperre; parallele Backup-Vorgänge sind nicht zulässig.
- Backup-Erfolg und -Fehlerstatus werden pro Projekt im bestehenden App-Zustand geführt, nicht als globaler Status für alle Wikis.
- Nach jedem Backup-Ergebnis wird der gemeinsame Status zentral an alle vorhandenen Anzeigen übertragen; manuelle Erfolge und Fehler erscheinen zusätzlich unmittelbar im Backup-Bereich.
- Der Backup-Bereich zeigt den letzten projektbezogenen Fehler, getrennte Aufräumwarnungen und eine kurze Anleitung zur manuellen Wiederherstellung. Ein später erfolgreicher Lauf entfernt den alten Fehlerzustand.
- Laufende Backups deaktivieren alle vorhandenen manuellen Startmöglichkeiten und zeigen "Backup läuft …"; die zentrale Sperre bleibt die einzige Wahrheit.
- Backup-Warnungen verwenden das bestehende monochrome SVG-Icon-System. Der Backup-Fehlerdialog folgt dem verbindlichen modalen Dialogstandard und wird nicht durch Klick außerhalb geschlossen.
- Automatisches Hintergrund-Backup als ZIP-Archiv des gesamten Projektordners.
- Intervall wählbar (deaktiviert/täglich/alle 3 Tage/wöchentlich/alle 2 Wochen/monatlich), Standard täglich.
- Aufbewahrung der 14 neuesten Backups, ältere werden automatisch entfernt.
- Backups werden zuerst in eine temporäre Datei geschrieben, strukturell als ZIP validiert und erst danach an die endgültige Stelle verschoben.
- Der Backup-Zielordner darf weder identisch mit dem Projektordner sein noch innerhalb des Projektordners liegen; die zentrale Main-Prozess-Prüfung berücksichtigt normalisierte und über bestehende Symlinks aufgelöste Pfade.
- Veraltete Archiv-Wiki-Temp-Dateien werden vor neuen Läufen gezielt bereinigt; normale ZIP-Dateien und fremde Dateien bleiben unangetastet.
- Beim Beenden wird ein laufendes Backup entweder sauber abgeschlossen oder kontrolliert abgebrochen, bevor die Anwendung endet; eine beschädigte endgültige ZIP-Datei darf nicht entstehen.
- Fehler beim Entfernen alter Backups werden getrennt gespeichert und ändern den Erfolg eines bereits erstellten neuen Snapshots nicht.
- Kein automatischer Wiederherstellungs-Mechanismus innerhalb der Anwendung — Wiederherstellung erfolgt manuell durch Entpacken des Archivs.

## Release-Prozess

- Versionsnummer wird über `npm version patch|minor|major` gesetzt, nicht manuell in `package.json` eingetragen.
- `npm version` erstellt zugleich den Git-Tag, kein separates manuelles Tag-Anlegen.
- Hochladen über `git push origin main --tags`.
- GitHub-Token wird als Umgebungsvariable (`GH_TOKEN`) gesetzt, nie in die Remote-URL eingebettet.
- `npm run release` baut und lädt automatisch einen Entwurf zu GitHub hoch.
- Veröffentlichung erfordert einen manuellen letzten Schritt auf GitHub ("Publish release").
- Release Notes gliedern sich immer in vier Kategorien: ✨ NEU, 🐛 BEHOBEN, 📝 SONSTIGES, ✅ GEMACHT.
- Release Notes nennen nur Fehlerbehebungen an bereits veröffentlichtem Verhalten, keine internen Zwischenstände.
- Release Notes enthalten keinen "Offen"/"Noch zu tun"-Abschnitt.

## Programmierung

- Bestehende Komponenten/Funktionen werden erweitert und wiederverwendet, keine doppelten Funktionen mit ähnlichem Zweck.
- CSS-Änderungen für einen bestimmten Bereich werden auf diesen Bereich beschränkt, keine Änderung allgemeiner, app-weit genutzter Klassen.
- Strukturelle Ursachen werden behoben, keine isolierten Einzelkorrekturen an nur einer betroffenen Stelle.
- Neue Markdown-Syntax nutzt die Platzhalter-Technik, keine direkte Umkonfiguration von marked.js.
- Änderungen an `build/editor-entry.js` erfordern einen erneuten Build, bevor sie wirksam werden.
- Jede Änderung wird vor Abschluss in einer echten, laufenden Instanz nachgewiesen, nicht nur durch Code-Lektüre.

## HTML-Kontextmenüs

- Alle selbst gerenderten HTML-Kontextmenüs verwenden die zentrale Bedienhilfe `manageHtmlContextMenu()` in `renderer/js/app.js`; parallele Tastatur-, Fokus- oder Schließen-Implementierungen in einzelnen Menüs sind nicht zulässig.
- Bestehende Menütypen (`.context-menu` und `.ectx-menu`) bleiben erhalten. Die gemeinsame Hilfe ergänzt ARIA-Rollen, Fokusführung, Pfeiltasten, Home/End, Enter/Leertaste, Escape, Tab, Klick-außerhalb und Fokus-Rückgabe.
- Rechtsklick, `Shift+F10` und die Kontextmenütaste öffnen dieselben vorhandenen HTML-Menüs. Native Electron-Menüs bleiben davon unberührt.
- Untermenüs sind per Tastatur mit Pfeil rechts/links bedienbar und werden über `aria-haspopup`, `aria-expanded` und eigene `role="menu"`-Container ausgezeichnet.

## HTML-Kontextmenüs – Struktur

- Alle selbst gerenderten HTML-Kontextmenüs verwenden die zentralen Hilfen in `renderer/js/app.js` für Erzeugung, Positionierung, Bedienung, Schließen und Listener-Aufräumen. Lokale parallele Varianten dieser allgemeinen Abläufe sind nicht zulässig.
- Einfache Kontextmenüeinträge werden über eine gemeinsame Erzeugungsfunktion aufgebaut; Editor-Menüs behalten ihr bestehendes verschachteltes Datenmodell.
- Trennlinien werden zentral normalisiert: keine Trennlinie am Anfang oder Ende und keine unmittelbar aufeinanderfolgenden Trennlinien.
- Destruktive Aktionen stehen am Ende der vorhandenen Aktionen und werden durch eine einzelne Trennlinie abgesetzt. Das reversible Verschieben in `.wiki-trash/` heißt „In den Papierkorb“; „Endgültig löschen“ bezeichnet ausschließlich irreversible Entfernung.
- Rechtsklick und Tastaturöffnung nutzen dieselbe zentrale Positionierungslogik mit Begrenzung auf das sichtbare Fenster.
## Fokus-Modus – editorgebundener Gültigkeitsbereich

- Der Fokus-Modus ist eine editorgebundene Konzentrationsansicht. Er darf nur bei geöffneter Notiz aktiv sein und wird beim Verlassen des Editors automatisch beendet.
- Beim Wechsel zwischen Notizen bleibt der Modus aktiv; der zentrale Body-Zustand wird beibehalten und der neu gerenderte Toolbar-Button daraus synchronisiert.
- Der aktive Ein/Aus-Zustand wird weiterhin nicht über Sitzungen hinweg gespeichert.
- Der Toolbar-Schalter verwendet einen zentralen semantischen Zustand über `aria-pressed`; sichtbarer und semantischer Zustand dürfen nicht getrennt aktualisiert werden.
- Aktivierung oder Deaktivierung über die Toolbar gibt den Fokus an den Schreibbereich zurück. Im Fokus-Modus wird die Werkzeugleiste bei Tastaturfokus über `:focus-within` vollständig sichtbar.
- Modale Dialoge, Suche und HTML-Kontextmenüs haben bei Shortcut und Escape Vorrang vor dem Fokus-Modus.
- Unter Einstellungen → Darstellung existiert kein eigener Fokus-Modus-Ein-/Aus-Schalter; Aktivierung und Deaktivierung laufen ausschließlich über die Editor-Werkzeugleiste und das vorhandene Tastenkürzel.
- Die sichtbare und dokumentierte Bezeichnung lautet verbindlich „Fokus-Modus“. Bestehende technische Schlüssel oder Klassennamen werden nicht allein aus kosmetischen Gründen migriert.
- Fokus-Modus-spezifische Übergänge verwenden `150ms ease` und werden bei `prefers-reduced-motion: reduce` deaktiviert.
- Der feste neutrale weiche Schatten des Arbeitsbereichs bleibt als bewusste Designausnahme bestehen: Er trennt den aktiven Arbeitsbereich von der umgebenden Oberfläche, ohne Akzentfarbe, Größenänderung oder neue Hervorhebungsart.
## Dashboard-Tipps – dezente, projektbezogene Ausspielung

- Das Tipp-Symbol bleibt auch im leeren Wiki erreichbar und verwendet weiterhin das bestehende kleine Popover; es entsteht kein eigener Dashboard-Bereich, keine Tour und kein automatisches Popup.
- Tipps werden in Erste Schritte, Allgemeine Tipps und ausdrücklich versionsgebundene Neue-Funktionen-Hinweise eingeteilt. Erste-Schritte-Tipps erscheinen projektbezogen nur einmal; allgemeine Tipps laufen in wiederholungsfreien Zyklen.
- Der erste allgemeine Zyklus berücksichtigt die festen Prioritätsstufen hoch, mittel und niedrig. Nach diesem Einführungszyklus werden die jeweils geeigneten allgemeinen Tipps normal durchmischt.
- Versionsbezogene Hinweise werden nur nach ausdrücklicher Registrierung für eine konkrete App-Version und pro Projekt höchstens einmal angezeigt. Ohne freigegebenen Inhalt wird kein künstlicher Neue-Funktionen-Tipp erzeugt.
- Tipp-Status wird ausschließlich über die bestehende Projektkonfiguration gespeichert. Es gibt keine Datenbank, Cloud-Historie, zusätzliche Renderer/Main-Kommunikation oder allgemeines Nutzungs-Tracking.
- Kontextbedingungen dürfen nur aus bereits vorhandenen, eindeutig auswertbaren Projektdaten abgeleitet werden. Derzeit gelten sie für leeres Wiki, Backup-Konfiguration, verwendete Tags und eigene Vorlagen.



## Atomare Schreibstrategie für Primärdaten

Kritische bestehende Dateien werden in Archiv-Wiki nicht direkt überschrieben. Notizen, `.wiki-config.json`, `app-state.json`, Sync-Manifest, verschlüsselte Sync-Zugangsdaten und über WebDAV heruntergeladene Dateien verwenden die gemeinsame Main-Prozess-Hilfe `main/atomic-write.js`.

Die neue Datei wird als eindeutig benannte temporäre Datei im selben Zielordner geschrieben, vollständig abgeschlossen und erst danach atomar auf den endgültigen Pfad umbenannt. Scheitert der Vorgang, wird die temporäre Datei entfernt und eine vorhandene endgültige Datei bleibt unverändert. Bestehende Dateirechte werden nach Möglichkeit beibehalten.

Diese Strategie ist eine dauerhafte Datenintegritätsregel. Neue kritische Schreibpfade müssen dieselbe gemeinsame Hilfe verwenden, statt bestehende Dateien direkt mit `writeFile` oder `writeFileSync` zu überschreiben.
