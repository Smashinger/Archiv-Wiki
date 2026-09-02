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

## Oberflächen-Design (Multi-Design-Grundgerüst)

- Archiv-Wiki ist technisch darauf vorbereitet, künftig mehr als ein Oberflächen-Design nebeneinander zu unterstützen. Das bestehende, vollständig ausgearbeitete Design heißt **Classic**.
- Der Nutzer kann das Oberflächen-Design unter **Einstellungen → Darstellung → Oberflächen-Design** zwischen Classic und Design2 umschalten (`renderAppearanceSection()` in `renderer/js/settings-window.js`, Segmented-Control-Muster wie Hell/Dunkel-Modus/Sidebar-Größe). Die Auswahl ist projektbezogen, ohne App-Neustart wirksam und derzeit noch nicht für alle Bereiche vollständig umgesetzt — nicht umgesetzte Bereiche fallen dabei bewusst auf Classic zurück.
- Welches Design aktiv ist, wird über einen projektbezogenen Konfigurationswert (`uiDesign`) bestimmt — über denselben Mechanismus wie jede andere Projekteinstellung, kein zweiter Konfigurationsspeicher, kein eigener IPC-Kanal. Der Umschalter persistiert über den generischen `fs.setProjectSetting('uiDesign', …)`-Weg (dasselbe Muster wie sidebarWidth/viewMode/dashboard* u. a. in `renderer/js/app.js`), nicht über den sektionsinternen `settings:update`-Patch-Mechanismus der übrigen Darstellungsfelder.
- Fehlt der Wert, ist er unbekannt oder falsch typisiert, wird immer **Classic** verwendet — niemals ein Fehler, niemals eine blockierende Rückfrage. Das bloße Öffnen eines Projekts oder der Einstellungen ohne gespeicherten Wert schreibt diesen nicht automatisch in die Konfiguration.
- Das aktive UI-Design wird über eine zentrale Root-Markierung (`data-ui-design` an `<body>`, gesetzt von `applyUiDesign()` in `renderer/js/ui-design.js`) für designspezifisches CSS exponiert. Theme (Hell/Dunkel) und UI-Design bleiben zwei unabhängige Dimensionen und werden nie vermischt; ein Designwechsel lässt Theme und Akzentfarbe unverändert.
- Ein Designwechsel wird zentral in `applyPersistedProjectConfig()` (`renderer/js/app.js`, hängt an `fs.setProjectConfigPersistedHandler()`) angewendet: Root-Markierung aktualisieren und die aktuell offene Route sicher neu rendern. Editor (`#note/…`), Eingang-Detail (`#incoming/<id>`) und Notiz-Entwurf (`#incoming-draft/<id>`) werden dabei bewusst NICHT neu gerendert, damit ein Designwechsel keinen offenen Dirty-State/Entwurf gefährdet — für sie ändert sich nur die Root-Markierung.
- Design2 wird View für View eingeführt, nicht als einmaliger Komplettumbau. Eine View ohne eigene Design2-Implementierung rendert unter `design2` weiterhin bewusst über Classic — kein Fehler, keine Lücke. Umgesetzte Views: Archiv (`#archive`), Papierkorb (`#trash`), Tags (`#tags`), Dashboard (`#home`), Statistik (`#stats`), Wissenspflege (`#knowledge-care`), Eingang-LISTE (`#incoming`; Eingang-Detail `#incoming/<id>` und Notiz-Entwurf `#incoming-draft/<id>` bleiben bewusst Classic, siehe Abschlussbericht Phase 4G). Beide Renderer einer View nutzen dieselbe designunabhängige Datenquelle (z. B. `archive-data.js`/`trash-data.js`/`tags-data.js`/`dashboard-data.js`/`stats-data.js`/`knowledge-care-data.js`/`incoming-data.js`) und dieselben Fach-Aktionen (Rename/Merge/Delete, Backup-Gate, Undo, Dashboard-Sperren/-Einstellungen, Eingang-Mehrfachauswahl/-Löschung, Navigation); nur die Darstellungsschicht ist pro Design eigenständig. Ab drei Views mit nachweislich identischer visueller Basis (Zeilenabstand, Radius, Hover, Icon-/Titel-/Meta-Typografie, Abschnittsköpfe) dürfen die Design2-CSS-Regeln dafür gruppiert/konsolidiert werden — weiterhin ohne gemeinsame JS-Renderfunktion oder Registry.
- Das Design2-Dashboard (`renderHomeDesign2()`) folgt seit Phase 5C (Dashboard Fidelity) dem echten Referenz-Artboard: Hauptspalte + eine feste rechte Zusatzspalte innerhalb des Dashboard-Inhaltsbereichs (`.d2-dash-layout`, CSS-Grid `1fr 330px`, bei knapper Fensterbreite einspaltig) — das ist eine Dashboard-interne Content-Randspalte, keine dritte globale App-Spalte. Die Randspalte nutzt ausschließlich bereits vorhandene Daten über bereits bestehende, designunabhängige Funktionen (`buildTagCloudViewModel()` aus `tags-data.js` für „Häufige Tags", `incoming.loadIncoming()`/`buildIncomingViewModel()` für die Eingang-Vorschau) — keine zweite Zähl-/Sortierlogik. Der aus der Referenz stammende „Schnellzugriff" (Strg+1–4) ist seit Block C1/C3/C5 umgesetzt — ausdrückliche Nutzerentscheidung, ausschließlich auf Basis der bereits vorhandenen angehefteten Notizen (`frontmatter.pinned`): kein zweites Favoritenmodell, keine zweite Persistenz, höchstens vier Design2-Plätze, Sichtbarkeit über den vorhandenen Bereichszustand „Angepinnte Notizen". Details siehe `06_DASHBOARD.md`, Abschnitt „Schnellzugriff (Design2)". Dashboard-Zeilen zeigen als Metadatum die Kategorie (`noteCategoryLabel()`, aus `noteTagLabel()` herausgelöst), nicht mehr Tags — als schlichten großgeschriebenen Mono-Text ohne Hintergrund/Pille und ohne Kategorie-Farbe (Themenfarben sind weiterhin keine Produktfunktion).
- Die Sidebar folgt einem eigenen, bewusst abweichenden Muster (Phase 5A/5D): Anders als die routenbasierten Views oben gibt es keine zweite `renderSidebarDesign2()`-Funktion und kein eigenes Sidebar-Markup. Die Sidebar bleibt EINE einzige, dauerhaft im DOM verankerte Region — `renderNavTree()`/`renderGroup()`/`renderNoteItem()`, Baumdaten (`state.tree`), Drag&Drop, das globale Kontextmenü, Badges, Sidebar-Breite/-Dichte und die aktive Route (`setActiveNav()`) bleiben vollständig gemeinsam und unverändert. `design2` restyled ausschließlich das bestehende Classic-Markup unter `[data-ui-design="design2"] .sidebar …` (CSS-only, siehe `renderer/css/design2.css`, Abschnitt „Design2 Sidebar"). Seit Phase 5D zeigt Design2 vor dem Kategoriebaum eine „Themen"-Abschnittsüberschrift (`.sidebar-section-label` in `renderer/index.html`, in Classic per Default via `display:none` in `components.css` ausgeblendet) mit einem Zähler, der ausschließlich aus der bereits vorhandenen Hauptkategorien-Anzahl (`state.tree`-Filterung in `renderNavTree()`) abgeleitet wird — keine neue Zähllogik. Der Notizbereich des Baums folgt seit dem Umbau nach `archiv-wiki-sidebar-notizen.md` einer eigenen Formensprache in `renderer/css/sidebar-tree.css` (siehe `07_SIDEBAR.md`, Abschnitt „Design2 — Notizbereich"); sie ist ebenfalls CSS-only über `[data-ui-design="design2"]` und lässt Classic unverändert. Der frühere feste Einheitsstreifen am Zeilenrand der Hauptkategorien ist dort durch einen 3 × 15 px breiten Rücken **innerhalb** der Zeile ersetzt, der zugleich das Ordner-Icon ablöst; seine Farbe wird reihum aus vier Tokens vergeben (rosé → blau → amber → grün). Sie bleibt weiterhin **keine** gespeicherte Kategorie-Eigenschaft: kein Kategorie-Farbfeld, keine Zuweisung/Auswahl-UI, keine Persistenz, kein Sichtbarkeits-Schalter. Ein per Hauptkategorie frei wählbares Mehrfarbmodell bleibt keine Produktfunktion, solange es dafür keine Speicherung gibt. Unterkategorien, Notizen, Dashboard und alle übrigen Ansichten erhalten keinen Rücken. Der „+ Notiz"-Button in der Sidebar (ebenso wie sein Pendant in der Referenz) nutzt seit Phase 5D `--d2-system` statt der Nutzer-Akzentfarbe — die aktive Navigation (Punkt „Akzent = Auswahl/Nutzerinteraktion") bleibt davon unberührt und weiterhin `--accent-color`.
- Fach-Aktionen, die eine View nach einer Konfigurationsänderung selbst neu rendern müssen (z. B. Dashboard-Sperren, Dashboard-Einstellungen), rufen dafür niemals fest einen bestimmten Design-Renderer auf. Sie verwenden denselben zentralen `activeUiDesign()`-Abfragepunkt wie der Routen-Dispatch (z. B. über eine kleine `renderActive<View>()`-Hilfsfunktion), damit sie unter Classic UND Design2 korrekt den jeweils aktiven Renderer aktualisieren.
- Design2 bezieht seine Grundfarben aus einem eigenen Foundation-Token-Set (`--d2-chrome`/`--d2-ground`/`--d2-surface-1`/`-2`/`-3`/`--d2-preview-surface`/`--d2-gutter`/`--d2-text`/`--d2-dim`/`--d2-muted`/`--d2-faint`/`--d2-line`/`--d2-line-strong`/`--d2-system`/`--d2-system-tint`/`--d2-on-system`/`--d2-mark`/`--d2-category` sowie themenabhängigen Auswahl-, Scrim- und Schattenrollen, definiert unter `[data-ui-design="design2"]` in `renderer/css/design2.css`) statt der bisherigen 1:1-Zuordnung auf die globalen Classic-Farbtokens — Rundungen/Übergangszeiten bleiben weiterhin die gemeinsamen `--radius-*`-Werte. Dark und Light bilden die bestätigte gemeinsame Referenz `archiv-wiki-designdokument.html` direkt ab; `archiv-wiki-tokens.css` ist die lesbare Wertetabelle dazu. Beide Quelldateien liegen außerhalb des Laufzeitprojekts und werden nicht importiert. Classic behält seine globalen Farbtokens unverändert.
- Design2 trennt vier Farbrollen strikt: die bestehende Nutzer-Akzentfarbe (`--accent-color`/`--accent-dim`/`--accent-soft`, weiterhin frei wählbar, unverändert gemeinsam mit Classic) für Auswahl/aktive Navigation/interaktive Hervorhebung; einen zusätzlichen, NICHT nutzerwählbaren, festen Systemstatus-Token (`--d2-system`/`--d2-system-tint`) für echte Systemzustände (nicht-interaktive Statusindikatoren); einen festen Referenzmarken-Token (`--d2-mark`, Dark `#cf8a94`, Light `#a85260`) ausschließlich für statische, kleine Abschnittslabels; und einen eigenen, NICHT nutzerwählbaren, festen dekorativen Kategorie-Hierarchie-Token (`--d2-category`), der seit dem Umbau des Notizbereichs nur noch den Streifen der Suchtreffer trägt — der Rücken der Hauptkategorien im Baum bezieht seine vier Farben aus `archiv-wiki-tokens.css` (siehe `07_SIDEBAR.md`). Ein Designwechsel oder eine geänderte Akzentfarbe überschreibt weder `--d2-system`, `--d2-mark` noch `--d2-category` je.
- Design2 nutzt für die normale Oberfläche über `--d2-font-body` das bereits lokal vorhandene Inter (`var(--sans)`) — Fließtext, Titel und Aktionsbeschriftungen bleiben dadurch ruhig und gut lesbar. Die lokal gebündelten Spezialrollen bleiben getrennt: `--d2-font-heading-condensed` (Barlow Condensed — ausschließlich kleine, versale Abschnittsköpfe) und `--d2-font-mono` (IBM Plex Mono — Metadaten/Zahlen/Zeiten/Tags/Badges/Status). Keine Laufzeit-Webfont-Requests, kein Google Fonts, ausschließlich `font-src 'self'`. Classic verwendet unverändert `var(--sans)`/`var(--mono)` (Inter/JetBrains Mono).

## Datenmodell

- Ein Projekt ist ein gewöhnlicher Ordner mit `.wiki-config.json`, `.wiki-trash/`, `.attachments/` und Kategorie-Unterordnern.
- Genau zwei Hierarchie-Ebenen: Hauptkategorie → Unterkategorie → Notiz. Keine tiefere Verschachtelung, keine Notizen direkt in einer Hauptkategorie.
- Notizen sind `.md`-Dateien mit YAML-Frontmatter (`title`, `tags`, `category`, `mainCategory`, `created`, `modified`, optional `archived`, `archivedAt`).
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

## Eigene Titelleiste (Custom Window Chrome)

- Das Hauptfenster läuft ohne native Fensterdekoration (`BrowserWindow`-Option `frame: false`); unter Linux entfällt dadurch zugleich die native Electron-Menüzeile. Der einzige sichtbare obere Fensterbereich ist die eigene `.app-titlebar` in `renderer/index.html`/`renderer/css/layout.css` — keine zweite, aufgesetzte Leiste.
- Der Ersteinrichtungs-Assistent (`wizardWindow`) ist von dieser Umstellung nicht betroffen und behält seine native Fensterdekoration.
- Datei/Bearbeiten/Ansicht/Hilfe öffnen dasselbe, bereits bestehende native `Menu`-Objekt aus `main.js` `buildMenu()` als natives Popup-Menü an der Klickposition (`window:popupMenu`-IPC) — keine zweite, selbstgebaute HTML-Menüdarstellung und keine doppelte Menülogik. `Menu.setApplicationMenu()` bleibt zusätzlich gesetzt, damit die Tastenkürzel (Accelerators) unabhängig von der (nicht mehr gerenderten) nativen Menüzeile weiterhin funktionieren.
- Fenstersteuerung (Minimieren, Maximieren/Wiederherstellen, Schließen) läuft über eng begrenzte `window:*`-IPC-Kanäle (`preload.js` `windowControls.*`) — kein genereller Electron- oder Node-Zugriff im Renderer.
- Der Schließen-Knopf ruft `mainWindow.close()` auf und löst dadurch denselben bestehenden `'close'`-Ereignis-Ablauf aus wie zuvor der native Fenster-X-Button (Rückfrage/Tray-Minimierung/Beenden, siehe `handleCloseRequest()`) — kein separater, abgekürzter Beenden-Weg.
- Der sichtbare Maximieren/Wiederherstellen-Zustand wird ausschließlich aus dem echten `mainWindow.isMaximized()` abgeleitet; das Hauptfenster meldet Zustandsänderungen zusätzlich per Ereignis (`window:maximizedChanged`) an den Renderer, auch wenn sie nicht über den Knopf selbst ausgelöst wurden (z. B. Fenstertastenkürzel, Snapping).
- Doppelklick auf die freie Titelleistenfläche maximiert/stellt wieder her. Unter Linux/KWin liefert die `-webkit-app-region: drag`-Fläche dieses Verhalten anders als unter Windows/macOS nicht automatisch mit; es ist deshalb im Renderer bewusst nachgebildet (per `dblclick`-Listener auf die Titelleiste, mit Ausnahme von Menü und Fensterknöpfen).
- Menü- und Fensterknöpfe sind reguläre `<button>`-Elemente ohne eigene Tastatur-/Fokuslogik — Fokusreihenfolge, `:focus-visible` und Enter/Leertaste-Aktivierung ergeben sich automatisch aus der bestehenden globalen Fokus-Darstellung.
- `-webkit-app-region` ist entgegen einer früheren Annahme in dieser Chromium-Version KEIN vererbtes CSS-Property — `.app-titlebar-spacer` setzt es deshalb (seit Phase 5E) selbst explizit auf `drag`, statt sich auf Vererbung vom `.app-titlebar`-Elternelement zu verlassen (galt bereits vorher für Classic, war aber unbemerkt wirkungslos).
- Design2 restylt dieselbe `.app-titlebar` zu einer eigenen, referenznahen Kommandoleiste (Phase 5E) — keine zweite Fenster-Engine, dieselben Window-Control-IPC-Kanäle, dasselbe `windowControls.popupMenu()` für Datei/Bearbeiten/Ansicht/Hilfe (jetzt über einen kompakten „≡"-Button statt vier sichtbarer Einzelknöpfe, beide Wege lösen exakt dieselben vier echten Electron-Menüs aus). Höhe 38px (`--titlebar-h`, referenzgenau — `.shell`/`.sidebar` beziehen ihre Höhe/oberen Versatz automatisch über dieselbe Variable). Die globale Suche (EIN DOM-Knoten, EINE `search.js`-Engine) sitzt unter Design2 zentral in dieser Kommandoleiste statt in der Sidebar — `applySearchZonePlacement()` in `app.js` verschiebt denselben `.search-zone`-Knoten beim Start und bei jedem Designwechsel, erzeugt kein zweites Suchfeld (siehe auch `10_SEARCH.md`). „Neue Notiz" in der Kommandoleiste löst per Klick-Weiterleitung denselben `#btnAddNote`-Ablauf aus wie das Sidebar-Pendant „+ Notiz" (kein zweiter Erstellen-Flow) und nutzt wie dieses seit Phase 5D `--d2-system` statt Nutzerakzent. Der vorhandene Live-WebDAV-Laufzeitstatus bleibt am echten Sync-Button angebunden und speist zusätzlich die globale Design2-Statusleiste; ohne Laufzeitbeleg wird dort kein Erfolg behauptet. Bewusst NICHT umgesetzt bleibt das „Struktur ⌘O"-Element aus der Referenz.
- Design2 besitzt seit P1-C1 genau eine globale, 30px hohe Statusleiste als Abschluss des gemeinsamen App-Frames unter Sidebar und Hauptbereich. Sie verwendet die bestehenden zentralen Update-, Backup- und Sync-Statusquellen sowie die bereits im Editor berechneten Speicher-, Wort-, Zeilen-, Lesezeit- und Cursorwerte; es gibt keinen zweiten Statusautomaten und keine zweite Zählung. Außerhalb editorartiger Routen zeigt sie „Bereit", die zuletzt bearbeitete aktive Notiz aus dem bestehenden Dashboard-Modell und nur tatsächlich vorhandene Backup-/Update-Daten. Classic behält lokale `.note-bottombar` und Sidebar-Update-Footer unverändert; Design2 blendet die lokale Editor-Fußzeile aus und hält die globale Leiste auch im Fokus-Modus sichtbar.
- Ergebnis-/Verlaufs-Dropdown und Filter-Panel hängen unter Design2 nur, solange sie sichtbar sind, an `document.body` mit fest berechneter Position (`syncSearchOverlayPosition()`), statt regulär in `.search-zone` verschachtelt zu bleiben — reine Positionierung, nötig weil `.app-titlebar` einen absichtlich sehr hohen z-index trägt (Fenstersteuerung bleibt über Dialogen/Sperrbildschirm erreichbar) und ein normal verschachteltes Overlay sonst fälschlich selbst über Dialogen erschiene.

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

## Archivierung

- Archivierung ist rein Frontmatter-basiert (`archived: true`, `archivedAt: <ISO-Zeitstempel>`) über denselben Schreibweg wie jeder andere Frontmatter-Patch — keine Dateiverschiebung, keine eigene Speicherstruktur.
- Die Notiz bleibt physisch unverändert an ihrem ursprünglichen Pfad. Archiv ist damit ausdrücklich **kein** Papierkorb — beides sind unabhängige, nicht austauschbare Zustände (Papierkorb verschiebt die Datei nach `.wiki-trash/`, Archivierung nicht).
- Aktive Ansichten (Sidebar-Baum, Dashboard-Listen, Tags-Übersicht-Notizliste ausgenommen) blenden archivierte Notizen standardmäßig aus. Die eigene Archiv-Seite (`#archive`) zeigt ausschließlich archivierte Notizen über dieselben gemeinsamen Zeilen-Render-Funktionen wie das Dashboard.
- Wiederherstellen entfernt lediglich `archived`/`archivedAt` wieder aus dem Frontmatter (Patch-Wert `null`) — keine zweite Restore-Logik.
- Die Suche kennt einen Status-Filter Aktiv/Archiv/Alle (Standard: Aktiv), der über dieselbe Filterlogik wie Kategorie/Tags läuft (siehe `10_SEARCH.md`).
- Die Wiki-Link-Auflösung bleibt vollständig unabhängig vom Archivstatus einer Notiz — ein Link zu einer archivierten Notiz funktioniert unverändert.

## Tag-Verwaltung

- Einzige Quelle für Tags bleibt `frontmatter.tags` jeder Notiz — kein zweiter Tag-Bestand, kein persistenter Tag-Index.
- Tag-Vergleiche sind case-sensitiv (`"Fedora"` und `"fedora"` gelten als unterschiedliche Tags).
- Die globale Tag-Übersicht sowie alle Tag-Massenoperationen berücksichtigen aktive **und** archivierte Notizen gleichermaßen.
- Umbenennen und Zusammenführen laufen über dieselbe Kernoperation (Quelle(n) durch Ziel ersetzen, anschließend deduplizieren); Löschen entfernt den Tag ersatzlos.
- Vor jeder Tag-Massenoperation läuft ein Pflicht-Backup über den bestehenden manuellen Backup-Weg (`window.archivAPI.runBackupNow()`) — kein „trotzdem fortfahren" bei Backup-Fehlschlag.
- Eine leichte Frischeprüfung (Tags-Array- und Body-Hash-Vergleich unmittelbar vor dem Schreiben) verhindert das Überschreiben zwischenzeitlich geänderter Notizen; abweichende Notizen werden übersprungen, nicht überschrieben.
- Nach einer erfolgreichen Massenoperation wird sitzungslokales Undo angeboten (kein Neustart-Persistieren, kein Transaktionsjournal).
- Alle Tag-Massenoperationen laufen unter der bestehenden zentralen `runExclusiveSyncMutation()`-Sperre — keine zweite Sync-Sperre.

## Mehrfachauswahl / Batch Operations

- Ein zentraler, sitzungslokaler Auswahlzustand (`Set<relPath>`) gilt einheitlich für Sidebar, Dashboard und Archiv-Seite — dieselbe Notiz ist über alle Ansichten hinweg automatisch nur einmal ausgewählt.
- Der Eingang besitzt bewusst weiterhin sein eigenes, unabhängiges Selection-System (eigener `Set` für Eingang-IDs) — beide Systeme werden nicht zusammengeführt.
- Unterstützte Batch-Aktionen: Verschieben, Archivieren, In den Papierkorb.
- Vor jeder Batch-Operation läuft dieselbe leichte Frischeprüfung wie bei den Tag-Massenoperationen (Body-Hash **und** ein Frontmatter-Fingerabdruck über sortierte Frontmatter-Schlüssel samt Werten) — erkennt sowohl inhaltliche als auch reine Frontmatter-Änderungen (z. B. `archived: false → true`) zuverlässig.
- Vor jeder Batch-Operation läuft ein Pflicht-Backup über denselben bestehenden manuellen Backup-Weg wie bei der Tag-Verwaltung — kein „trotzdem fortfahren" bei Backup-Fehlschlag; Auswahl und Auswahlmodus bleiben in diesem Fall erhalten.
- Alle Batch-Mutationen laufen unter derselben zentralen `runExclusiveSyncMutation()`-Sperre wie die Tag-Massenoperationen.
- Sitzungslokales Undo existiert ausschließlich für Batch-Verschieben (eigene Frischeprüfung vor dem Zurückverschieben, kein Überschreiben zwischenzeitlicher Änderungen). Archivieren und Papierkorb erhalten **kein** eigenes Batch-Undo — die bestehende Archiv-Wiederherstellung beziehungsweise der vorhandene Papierkorb bleiben die vorgesehenen Rückwege.

## Editor

- Drei Ansichtsmodi (Editor/Split/Vorschau). Ansichtsmodus und Split-Breite sind Projekt-Einstellungen, werden projektweit wiederhergestellt und gehören nicht zum individuellen Notiz-Datenmodell.
- Werkzeugleisten-Elemente einheitlich 32px hoch, 150ms Übergangszeit. Design2 setzt sie in eine 42px hohe Gesamtleiste mit 20px horizontalem Innenabstand und 18px hohen Gruppentrennern; Schriftgröße und Dokumentaktionen stehen rechts, Emoji monochrom im Einfügen-Cluster. Classic behält Komposition und Reihenfolge.
- Automatisches Schließen von Klammern/Anführungszeichen, erweitert um `` ` `` und `*`.
- Editor-Schrift durchgehend Monospace. Design2 verwendet für den sichtbaren CodeMirror-Inhalt IBM Plex Mono mit 1,95 Zeilenhöhe und begrenzt die Manuskriptfläche im reinen Editor-Modus auf maximal 720px; Classic und Split-Modus behalten ihre bisherigen Geometrien.
- Rechtschreibprüfung aktuell fest auf Deutsch, sofort umschaltbar ohne Neustart.
- Scrollposition (Editor und Vorschau getrennt) wird pro Notiz gespeichert und wiederhergestellt.
- Tab-Größen-Einstellung erfordert gleichzeitig zwei CodeMirror-Facetten (visuelle Breite und tatsächliches Einrückungsverhalten).
- Vorschau-Aktualisierung ist entprellt (kurze Verzögerung nach Tastenanschlag), Render-Ergebnis selbst bleibt unverändert.
- Auto-Save-Intervall wirkt sofort, ohne die Notiz erneut zu öffnen.
- Bild-Größenänderung ausschließlich über Hover-Knöpfe (25/50/75/100 %), nicht per Ziehen am Bild.
- Bildbreiten-Angabe wird über reguläre Markdown-Bildsyntax mit Zusatzattribut transportiert, nie über ein rohes HTML-`<img>`-Tag.
- Der Fokus-Modus konzentriert die Arbeitsfläche auf den Editor: Er blendet die Sidebar aus, gibt ihren Platz für den Editorbereich frei und wechselt beim Aktivieren vorübergehend zur Editoransicht, ohne diesen temporären Ansichtswechsel projektweit zu speichern. Die zurückhaltende neutrale Schattenwirkung bleibt fest erhalten; eine separate Intensitäts- oder Abdunkelungsoption gibt es nicht. Der An/Aus-Zustand wird nicht gespeichert.
- Fokus-Modus-Hervorhebung ist bewusst farblich neutral, ohne Akzentfarbe.
- Tabellen-Bearbeitung über ein eigenes Fenster (Doppelklick in der Vorschau), keine Pfeiltasten-Navigation zwischen Zellen. Die von marked erzeugte GFM-Spaltenausrichtung wird vor DOMPurify auf drei feste, erlaubte Vorschauklassen normalisiert und dadurch gemeinsam in Design2 und Classic sichtbar angewendet.

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
- Verwaltete modale Dialoge nutzen weiterhin dieselbe gemeinsame DOM-Struktur und `renderer/js/dialog.js`; Design2 ändert daran ausschließlich die skopierte visuelle Schale (`[data-ui-design="design2"]` in `renderer/css/design2.css`), keine zweite Dialogarchitektur.
- Die Bildvergrößerung (`.image-lightbox-overlay`) bleibt von der normalen Design2-Dialogschalen-Behandlung ausgenommen (vollflächige Sonderdarstellung, kein Standard-`.dialog-surface`-Rahmen).

## Einstellungen

- Ein zentrales Overlay, sieben Abschnitte: Allgemein, Darstellung, Editor, Backup, Updates, Web Clipper, Sicherheit.
- Jede Änderung speichert sofort, kein gesonderter Speichern-Knopf.
- Alle projektbezogenen Einstellungen liegen in der Projekt-Konfiguration, nie in einer separaten, zwischengespeicherten Kopie.
- Live-wirksame Einstellungsänderungen laufen über einen einzigen, zentralen Konfigurationsänderungs-Rückruf.
- Der zentrale Settings-Merge (`deepMerge()` in `main/settings-ipc.js`) verwirft die Schlüssel `__proto__`, `constructor` und `prototype` grundsätzlich, statt sie zu übernehmen oder in sie hinein zu rekursieren — verhindert, dass ein Patch den globalen Objektprototyp verändert.
- Das Einstellungsfenster ist der einzige Bereich, der bewusst nicht am Oberflächen-Design hängt: Classic und Design2 zeigen dasselbe Fenster mit derselben Optik. Seine Gestaltung liegt vollständig in `renderer/css/settings.css` (Präfix `aws-`) und `renderer/css/archiv-wiki-tokens.css`; keine `[data-ui-design]`-Regel gestaltet es mit. Verbindlich ist `archiv-wiki-einstellungen.md`, nicht `02_DESIGN_GUIDELINES.md` — siehe `09_SETTINGS.md`.
- Die Umsetzung blieb ein Overlay im Hauptdokument, obwohl die Spezifikation von „einem eigenen Fenster" spricht. Bewusste Entscheidung: Akzentfarbe, Hell/Dunkel, Lesebreite und Sidebar-Größe wirken dadurch ohne zusätzliche IPC-Wege sofort live in der Hauptansicht.

## Suche

- Ein einziges Such-System (kein separater Baum-Filter zusätzlich zur globalen Suche).
- Volltextsuche über Titel, Fließtext, Schlagworte und Kategorie.
- Ein FlexSearch-Index im Arbeitsspeicher, kompletter Neuaufbau bei Datenänderung statt inkrementeller Aktualisierung.
- Suchergebnisse als Dropdown mit Titel, Kategorie, Schlagworten und Textausschnitt.
- Suchergebnis-Icons verwenden das bestehende Icon-System; Bibliotheks-Fallbacks wie `docs/file-text` werden als SVG gerendert und nie als sichtbarer Text ausgegeben.
- Sidebar-Suche und editor-interne Suche (aktuelle Notiz) sind bewusst getrennte, unterschiedliche Mechanismen.

## Updates

- Die Update-Einstellungen zeigen lokal mitgelieferte Release Notes ausschließlich für die tatsächlich installierte App-Version. Die Auswahl erfolgt über einen exakten Versionsabgleich; es gibt keinen Laufzeitabruf der Notes von GitHub.
- Release Notes sind direkt in den Update-Einstellungen auf-/einklappbar und bleiben dort für die gesamte Lebensdauer der installierten Version verfügbar. Mit einem späteren Release wird durch den versionsgebundenen Datensatz automatisch der neue, passende Inhalt gewählt.
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

## Diagnoseberichte

- Diagnoseberichte sind eine ausschließlich lokale Support-Funktion. Es existiert kein automatischer Upload, keine Telemetrie und kein eigener Serverweg.
- Automatische Berichte entstehen nur bei klaren technischen Fehlern beziehungsweise Abstürzen: unbehandelte Main-/Renderer-Fehler, unerwartet beendete Renderer-Prozesse, schwere Ladefehler der Haupt- oder Einrichtungsoberfläche und fehlgeschlagene zentrale Modulregistrierungen. Routinefehler wie ein nicht erreichbarer Update-Server erzeugen nicht automatisch bei jedem Auftreten einen Bericht.
- Berichte werden im app-eigenen Benutzerverzeichnis außerhalb des Wiki-Projekts gespeichert und überleben Neustarts. Maximal die fünf neuesten Berichte werden behalten; ältere werden automatisch entfernt.
- Nach einem noch nicht angezeigten automatischen Bericht erscheint einmalig ein dezenter, nicht-modaler Hinweis. Der Bericht selbst bleibt unabhängig vom Hinweis über den Bug-Melden-Dialog und unter **Einstellungen → Allgemein → Diagnose** erreichbar.
- Der Nutzer kann zusätzlich jederzeit manuell einen Diagnosebericht erstellen. Dieser ergänzt ausschließlich reduzierte technische Zustände von Update, Backup, Synchronisierung und Web Clipper; Projektpfade, Konfliktdateien, Notizinhalte oder Zugangsdaten werden nicht übernommen.
- Die einzige Berichtanzeige wird zentral wiederverwendet. Sie bietet Auswahl der vorhandenen Berichte und ein Kopieren-Symbol für die Zwischenablage. Der vorhandene Bug-Melden-Weg kann einen Bericht anzeigen, hängt ihn aber niemals automatisch an ein GitHub-Issue an.
- Vor dem Speichern werden bekannte Projekt-, Home-, App-Daten- und Temp-Pfade anonymisiert; sonstige absolute Pfade und URLs werden entfernt. Typische Passwörter, Tokens, Benutzernamen, E-Mail-Adressen und IP-Adressen werden zusätzlich redigiert. Interne App-Quellpfade dürfen als `<APP>/…` erhalten bleiben, soweit sie für einen Stacktrace technisch nützlich sind.
- Berichtdateien und Diagnoseverzeichnis werden mit restriktiven Benutzerrechten angelegt. Gespeichert werden nur explizit ausgewählte technische Felder und bereits anonymisierte Fehlerdaten, niemals vollständige Projektkonfigurationen oder beliebige Objekt-Dumps.

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
