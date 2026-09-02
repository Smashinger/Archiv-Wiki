# Archiv-Wiki — Editor

Diese Datei fasst den endgültigen Stand des gesamten Editor-Bereichs zusammen — Schreibfläche, Vorschau, Werkzeugleiste und alles, was direkt mit dem Bearbeiten einer Notiz zu tun hat.

## Ziel

Der Editor soll sich anfühlen wie ein durchdachtes, ruhiges Schreibwerkzeug — nicht wie eine technische Textfläche mit angehängter Vorschau. Schreiben und Lesen (Vorschau) sind gleichwertige, nebeneinander bestehende Tätigkeiten, keine getrennten Modi mit Kompromissen.

## Layout

Classic ordnet Kopfbereich → Werkzeugleiste → Editor-/Vorschau-Bereich → lokale Fußzeile. Design2 ordnet Werkzeugleiste → Kopfbereich → Arbeitsbereich und schließt den gesamten App-Frame mit einer globalen 30px-Statusleiste ab; die lokale `.note-bottombar` bleibt dort unsichtbar. Editor und Vorschau teilen sich im Split-Modus eine gemeinsame, ziehbare Trennlinie.

## Statusleiste

Design2 verwendet genau eine globale Statusleiste unter Sidebar und Hauptbereich. Außerhalb des Editors zeigt sie Bereitschaft, die zuletzt bearbeitete geladene Notiz sowie ausschließlich tatsächlich vorhandene Backup- und zentrale Versions-/Update-Daten. Im Editor übernimmt sie Speicherzustand, den vorhandenen Sync-Laufzeitstatus sowie dieselben einmal berechneten Wort-, Zeilen-, Lesezeit- und Cursorwerte wie Classics lokale Fußzeile. Ein fehlender WebDAV-Lauf oder ein fehlendes erfolgreiches Backup erzeugt keine erfundene Erfolgsmeldung. Classic behält seine lokale `.note-bottombar` und den Sidebar-Footer unverändert. Der Fokus-Modus blendet die globale Design2-Statusleiste nicht aus.

## Werkzeugleiste

Enthält Formatierungs-Knöpfe, Ansichts-Umschalter (Editor/Split/Vorschau), Schriftgrößen-Auswahl, Sync-Scroll-Umschalter und den Speichern-Knopf. Alle Bedienelemente teilen sich eine einheitliche Höhe (32px) und dieselbe Übergangszeit (150ms) — siehe `02_DESIGN_GUIDELINES.md` für die allgemeinen Werte. Design2 setzt diese unveränderten 32px-Bedienelemente in eine insgesamt 42px hohe Leiste mit 20px horizontalem Innenabstand und 18px hohen Gruppentrennern; die Schriftgrößen-Auswahl steht mit den rechts verankerten Dokumentaktionen, der monochrome Emoji-Zugang im Einfügen-Cluster. Classic behält seine höhere, beschriftete Werkzeugleisten-Komposition und ursprüngliche Reihenfolge. Icon-Sprache: Buchstaben, die ihre eigene Formatierung visuell zeigen (F/K/D/U für Fett/Kursiv/Durchgestrichen/Unterstrichen), sowie Symbole, die möglichst die tatsächliche Markdown-Syntax abbilden (`{ }` für Code, `1.` für nummerierte Liste, `↗` für Link, `▤` für Callout).

Das Überschriften-Menü in der Werkzeugleiste und das vorhandene Format-Menü bieten Zugriff auf H1–H6 sowie das Zurücksetzen einer Überschrift. Die Tabellen-Schaltfläche verwendet den bestehenden Tabellen-Einfügeweg; es wird dafür keine zweite Tabellenlogik geführt.

## Lesebreite

Eine optionale, vom Nutzer aktivierbare Einstellung, die sowohl Editor als auch Vorschau auf eine feste, zentrierte Breite begrenzt. Wird über einen einzigen, gemeinsamen Inhaltscontainer gesteuert (siehe Vorschau-Abschnitt unten) — kein Element bekommt eine eigene, unabhängige Breiten-/Zentrierungs-Regel. Tabellen und Codeblöcke dürfen breiter sein als der übrige Text und scrollen bei Bedarf selbst horizontal, statt gestaucht zu werden.

Unabhängig von dieser Nutzeroption begrenzt Design2 im reinen Editor-Modus seine Manuskriptfläche auf maximal 720px. Der sichtbare Editorinhalt verwendet dort IBM Plex Mono in der gewählten Editor-Schriftgröße (standardmäßig 14px) mit 1,95 Zeilenhöhe. Diese Design2-Regeln ändern weder CodeMirror-Zustand noch Cursor-/Auswahllogik und greifen nicht in Classic oder in die beiden Spalten des Split-Modus ein.

## Split View

Drei Ansichtsmodi: reiner Editor, geteilte Ansicht, reine Vorschau. Ansichtsmodus und Split-Breite sind projektweite Einstellungen, werden in der Projektkonfiguration gespeichert und für das gesamte Projekt wiederhergestellt. Beide gehören nicht zum individuellen Notiz-Datenmodell.

**Trenner (Design2, D5).** Die Ziehfläche bleibt in beiden Designs dieselben 14px breit — sie ist das bewusst großzügige, unsichtbare Interaktionsziel; Ziehlogik, Mindestbreiten (120px je Spalte), Klemmung bei kleinem Fenster und Persistenz sind designunabhängig. Design2 zeigt darauf rein visuell die Referenzgeometrie: eine 6px-Trennzone im Fensterkörper-Ton mit einem mittigen, dekorativen 2×34px-Griff in der dritten Flächenstufe. Die verbleibenden 4px links und rechts der Zone tragen die Editor- beziehungsweise die Vorschaufläche, damit die breitere Ziehfläche nahtlos anschließt. Hover und aktives Ziehen heben ausschließlich den Griff hervor (Akzentfarbe = unmittelbare Nutzerinteraktion); die Zone selbst bleibt ruhig. Classic behält seine 1px-Trennlinie unverändert. Dark und Light besitzen jeweils einen bestätigten eigenen Vorschau-Flächenton (`--d2-preview-surface`), sodass Editor, Trennzone und Vorschau in beiden Themes unterscheidbar bleiben.

**Spaltenköpfe (Design2, D7).** Ausschließlich unter Design2 und ausschließlich in der geteilten Ansicht trägt jede Spalte oben einen 26px hohen Kopf mit 1px-Abschlusslinie: links „Markdown" in Nutzer-Akzentfarbe (die aktive menschliche Schreibseite), rechts „Vorschau" im festen Systemtoken. Rechtsbündig steht je Spalte ein Metawert in Mono — die aktuelle Cursorzeile beziehungsweise die reale Lesezeit. Beide Werte stammen aus genau denselben zentralen Aufrufen, die auch die globale Design2-Statusleiste und Classics lokale Fußzeile versorgen; es gibt keine zweite Berechnung und keine neue Kennzahl. Die Köpfe sind rein dekorative CSS-Ebenen auf den bereits vorhandenen Panes (kein zusätzliches DOM, kein Wrapper um den Split, kein Kopf innerhalb des Vorschau-Inhalts, den die nächste Vorschau-Aktualisierung wieder löschen würde); die Benennung der beiden Bereiche für Screenreader läuft über die ARIA-Beschriftung der Panes selbst. In reiner Editor- und reiner Vorschauansicht entfallen die Köpfe vollständig, ohne Restabstand.

## Design2 Randspalte (Rückverweise)

Design2 besitzt im reinen Editor-Ansichtsmodus eine rechte Randspalte (250px, 34px Abstand zur Manuskriptfläche) innerhalb des Editorbereichs — keine dritte globale App-Spalte, gehört ausschließlich zum Notiz-Editor. Sie zeigt ausschließlich die bereits vorhandenen automatischen Rückverweise (dieselbe Suche/Berechnung wie Classics Banner oberhalb der Werkzeugleiste, ein einziges Ausgabeziel wird lediglich um ein zweites ergänzt — keine zweite Berechnung). Das Classic-Banner bleibt in Design2 verborgen, damit dieselben Rückverweise nicht doppelt erscheinen. Ohne Rückverweise bleibt die Randspalte leer und unsichtbar, der Editor nutzt die volle Breite. In Split- und Vorschau-Ansicht sowie im Fokus-Modus bleibt sie verborgen. Classic behält seine bisherige Rückverweise-Darstellung (Banner oberhalb der Werkzeugleiste) unverändert bei.

Ausdrücklich nicht Teil der Randspalte: ausgehende Links ("Verweist auf"), Gliederung, Randnotizen — diese drei zusätzlichen Widgets der Design-Referenz existieren als Datenlogik heute nicht und sind nicht implementiert.

## Schreibkomfort

- **Automatisches Schließen von Klammern/Anführungszeichen**, erweitert um `` ` `` (Inline-Code) und `*` (Hervorhebung).
- **Listen- und Checklisten-Fortsetzung** beim Drücken von Enter.
- **Tab/Shift+Tab** rücken ein/aus.
- **Schriftart bewusst durchgehend Monospace** im Editor — passt zur technischen, markdown-basierten Natur des Schreibens; die Vorschau nutzt bewusst eine andere, proportionale Schrift für den Fließtext (siehe `02_DESIGN_GUIDELINES.md`).
- **Rechtschreibprüfung** über Electrons native Rechtschreib-Engine, sofort umschaltbar ohne Neustart, aktuell auf Deutsch festgelegt.
- **Multi-Cursor** über die vorhandenen CodeMirror-Tastenkürzel `Strg/Cmd+D` (nächstes gleiches Vorkommen zur Auswahl hinzufügen) und `Strg/Cmd+Umschalt+L` (alle gleichen Vorkommen auswählen) — dafür sind `EditorState.allowMultipleSelections` und `drawSelection()` aktiv; ohne beide reduziert CodeMirror jede Mehrfachauswahl sofort wieder auf eine einzige Range.

## Navigation

Cursor- und Mausnavigation folgen vollständig dem unveränderten Standardverhalten des Editors — keine eigene, abweichende Logik für Pfeiltasten, Doppelklick, Textmarkierung. Zusätzlich, editor-eigen:
- **Scrollposition wird pro Notiz gespeichert** (Editor und Vorschau getrennt) und beim erneuten Öffnen wiederhergestellt.
- **Wikilinks** navigieren direkt zur Zielnotiz; "Zurück zur vorherigen Notiz" funktioniert über die normale Verlaufs-Navigation des zugrunde liegenden Fensters, da die Notiz-Navigation auf Adress-Fragmenten basiert.
- Die Tabellen-Bearbeitung (eigenes Fenster, siehe Vorschau-Abschnitt) hat keine Pfeiltasten-Navigation zwischen Zellen, nur Standard-Tab-Fokuswechsel.

## Vorschau

- **Rendering-Grundlage:** marked.js, mit einer Platzhalter-Technik für Callouts und Wikilinks (vor dem eigentlichen Parsen durch eindeutige Tokens ersetzt, danach wieder eingesetzt) — verhindert, dass die Markdown-Bibliothek diese besondere Syntax fehlinterpretiert.
- **Gemeinsamer Inhaltscontainer:** Das gesamte gerenderte HTML liegt in einem einzigen Wrapper, der die Lesebreite steuert. Normale Inhalte (Text, Überschriften, Bilder, Zitate) teilen sich eine gemeinsame Breiten-/Zentrierungs-Regel; Tabellen/Code dürfen den volleren, breiteren Rahmen nutzen.
- **Design2-Rhythmus (D10):** Ohne aktivierte Nutzer-Lesebreite ist derselbe Inhaltscontainer maximal 560px breit. Direkte Markdown-Blöcke stehen im 16px-Rhythmus; Aufzählungen verwenden 7px Zeilenabstand und die feste Manuskript-Markierungsfarbe mit 11px Abstand zum Text. Aktivierte Lesebreiten-Presets bleiben vorrangig. Classic bleibt unverändert.
- **Überschriften H1–H6:** durchgehend Monospace, logisch absteigende Größe; H4–H6 sinken nie unter die Fließtextgröße, ab H5 übernehmen Schriftstärke/Großschreibung die weitere Abstufung.
- **Bilder:** Größenänderung per Hover-Knöpfe (25/50/75/100 %). Eine gewählte Breite wird über reguläre Markdown-Bildsyntax mit einem zusätzlichen Attribut transportiert, nicht über ein rohes HTML-`<img>`-Tag — ein alleinstehendes HTML-Tag würde von der Markdown-Verarbeitung als eigenständiger Block ohne umschließenden Absatz behandelt und aus dem normalen Textfluss herausfallen. Klick auf ein Bild öffnet eine Vergrößerungsansicht (eigenes Overlay, kein Browser-natives Feature).
- **Callouts (Design2, D9):** Die sieben vorhandenen Typen und ihre Markdown-Erkennung bleiben unverändert — Design2 belegt lediglich dieselbe bestehende Variablen-Mechanik neu: Fläche zweite Flächenstufe, kein umlaufender Rahmen, linker 3px-Statusstreifen, Radius 6px, Innenabstand 12/16px, versaler Mono-Titel, Inhalt gedämpft. Die semantische Unterscheidung bleibt erhalten, aber nicht als siebenfarbige Palette: neutrale Informationstypen (`note`, `info`, `abstract`, `example`, `tip`) tragen gemeinsam die feste, nicht nutzerwählbare Systemrolle, `warning` behält die Amber-Warnrolle, `danger` die rote Gefahrenrolle. Violett und Grün kommen unter Design2 nicht mehr vor; die Nutzer-Akzentfarbe wird bewusst nicht verwendet, da ein Callout ein Informations-/Warnzustand ist und keine Auswahl. Normale Zitate bleiben davon getrennt: kein Flächenton, kein Radius, nur ein linker Streifen aus der gedämpften Akzentrolle mit kursivem, gedämpftem Text. Classic behält seine bisherige, farbcodierte Callout-Darstellung unverändert.
- **Horizontale Linie:** flacher, moderner Strich statt Browser-Standarddarstellung.
- **Tabellen-Bearbeitung:** eigenes Fenster per Doppelklick auf eine Tabelle in der Vorschau. Die drei GFM-Spaltenausrichtungen werden vor der Preview-Sicherheitsgrenze auf feste `markdown-align-left|center|right`-Klassen normalisiert; dadurch bleiben die erlaubten Ausrichtungen nach DOMPurify erhalten und gelten gemeinsam in Design2 und Classic.
- **KaTeX, Codeblöcke mit Kopieren-Knopf, Druckansicht:** vollständig unterstützt.

## Einstellungen

Alle editor-bezogenen Einstellungen (Tab-Größe, Auto-Save-Intervall, Rechtschreibprüfung, Schriftgröße) werden direkt aus der Projekt-Konfiguration gelesen, nie aus einer separaten, zwischengespeicherten Kopie. Auto-Save-Intervall wirkt sofort, ohne die Notiz erneut zu öffnen. Tab-Größe betrifft zwei voneinander unabhängige, aber gemeinsam zu setzende Aspekte: die visuelle Darstellungsbreite eines Tab-Zeichens und das tatsächliche Einrückungsverhalten der Tab-Taste — beide müssen bei einer Änderung gemeinsam berücksichtigt werden.

## Performance

- Der Editor selbst zeigt zu jedem Zeitpunkt nur die tatsächlich sichtbaren Zeilen als echte Bildschirmelemente an (Virtualisierung), unabhängig von der Gesamtlänge der Notiz.
- Die Vorschau-Aktualisierung ist entprellt — sie baut sich nicht bei jedem einzelnen Tastendruck neu auf, sondern erst nach einer kurzen Schreibpause. Das eigentliche Rendering-Ergebnis bleibt davon unverändert, nur der Zeitpunkt der Aktualisierung.
- Automatisches Speichern läuft über einen eigenen, separat entprellten Timer.

## UX-Regeln

- Einheitliche Höhe von 32px und Übergangszeit von 150ms für alle Werkzeugleisten-Bedienelemente; Design2 verwendet dafür eine 42px hohe Gesamtleiste.
- Ein normaler "ungespeichert"-Zustand verwendet die Akzentfarbe, nicht Rot — nur ein echter Speicherfehler wird rot dargestellt.
- Keine Schwebe-Hover-Effekte (Anheben + Schatten); nur Farbwechsel.
- Funktionale Werkzeugleisten-Icons bleiben monochrom/Text-basiert, keine bunten Emoji.

## Regeln für zukünftige Änderungen

- Kein einzelnes Vorschau-Element bekommt jemals eine eigene, unabhängige `margin`/`width`-Regel — Breite und Zentrierung laufen ausschließlich über den einen gemeinsamen Inhaltscontainer.
- Neue Markdown-Syntax mit eigener Bedeutung wird über dieselbe Platzhalter-Technik geschützt wie Callouts/Wikilinks, nicht durch direkte Umkonfiguration von marked.js.
- Attribute an Bildern (oder vergleichbaren, im Textfluss bleibenden Elementen) werden über reguläre Markdown-Syntax mit Zusatzangaben transportiert, nie über rohes, alleinstehendes HTML.
- Eine neue Editor-Einstellung wird direkt aus der Projekt-Konfiguration gelesen; soll sie ohne erneutes Öffnen der Notiz wirken, wird sie als Modul-Variable gehalten und über den zentralen Konfigurationsänderungs-Mechanismus aktualisiert.
- Betrifft eine neue CodeMirror-Einstellung mehrere, technisch getrennte Aspekte (wie bei der Tab-Größe visuelle Darstellung und tatsächliches Einrückungsverhalten), müssen alle betroffenen Aspekte gemeinsam gesetzt werden.
- Neue, bei jedem Tastendruck potenziell ausgelöste Aktionen werden nach demselben, bestehenden Entprellungs-Muster behandelt.

## Bewusst verworfene Ideen

- **Bild-Größenänderung per direktem Ziehen am Bild.** Wurde verworfen, weil das Ziehen auf dem `<img>`-Element selbst unzuverlässig war und die dafür nötigen laufenden Beobachter den Editor bei jedem Tastenanschlag störten. Ersetzt durch einfache Hover-Knöpfe mit festen Prozentstufen (25/50/75/100 %) — keine Beobachter, keine dynamische Größenmessung mehr nötig.
- **Ein vollständig ausblendender Konzentrationsmodus, der Sidebar, Kopfzeile und Werkzeugleiste gemeinsam verbirgt.** Wurde verworfen, weil dabei zu leicht die Orientierung verloren geht. Der heutige Fokus-Modus blendet ausschließlich die Sidebar vollständig aus und gibt ihren Platz für den räumlich hervorgehobenen Editorbereich frei; Kopfzeile, Werkzeugleiste und Statusleiste bleiben sichtbar und bedienbar. Beim Aktivieren wechselt die Anwendung vorübergehend zur Editoransicht, ohne diese temporäre Auswahl als projektweiten Ansichtsmodus zu speichern. Der bestehende weiche, neutrale Fokusmodus-Schatten unterstützt die Hervorhebung weiterhin zurückhaltend und ohne Akzentfarbe. Kein echtes Vollbild, Fensterrahmen bleiben unverändert. Der An/Aus-Zustand wird bewusst nicht gespeichert und ist ein reiner Sitzungszustand.
- **Gültigkeitsbereich des Fokus-Modus:** Der Modus ist ausschließlich an eine geöffnete Notiz gebunden. Beim Wechsel zwischen Notizen bleibt er aktiv; der bei jedem Notizwechsel neu erzeugte Toolbar-Button wird aus dem bestehenden `body.focus-mode`-Zustand synchronisiert. Beim Wechsel zum Dashboard, Papierkorb, zu Tags, Statistiken oder einer anderen Route ohne offenen Editor wird der Modus über `setFocusMode(false)` automatisch beendet. Eine Aktivierung ohne vorhandenen Editor ist nicht möglich.
- **Accessibility und Fokus:** Der Toolbar-Schalter spiegelt seinen Zustand zentral mit `aria-pressed`; sichtbare `active`-Klasse und semantischer Zustand werden gemeinsam in `setFocusMode()` aktualisiert. Bei Aktivierung oder Deaktivierung über die Toolbar wechselt der Fokus zurück in den Schreibbereich (Vorschau in der reinen Vorschauansicht, ansonsten Editor). Die Werkzeugleiste wird im Fokus-Modus bei `:focus-within` ebenso wie bei Hover vollständig sichtbar.
- **Prioritäten für Tastaturbefehle:** Modale Dialoge, die globale Suche und ein geöffnetes HTML-Kontextmenü haben Vorrang vor dem Fokus-Modus. `Strg/Cmd + Umschalt + F` verändert den Fokus-Modus nicht, solange eine dieser Oberflächen aktiv ist; Escape schließt zuerst die vorrangige Oberfläche und beendet den Fokus-Modus erst bei einem weiteren, nicht abgefangenen Escape.
- **Finale visuelle Regeln:** Alle Fokus-Modus-spezifischen Übergänge verwenden den Projektstandard `150ms ease`. Bei reduzierter Bewegung werden diese Übergänge deaktiviert.
- **Neutrale Hervorhebung:** Der Arbeitsbereich behält den vorhandenen festen, weichen und neutralen Schatten als bewusste Ausnahme von der überwiegend flachen Designsprache. Er dient ausschließlich der räumlichen Trennung von der umgebenden Oberfläche, verwendet keine Akzentfarbe und verändert weder Breite noch Ausrichtung von Editor, Vorschau oder Splitter.

## Spätere Erweiterungsmöglichkeiten

Die Architektur lässt bewusst Raum für:
- **Mehrsprachige Rechtschreibprüfung** — der zugrunde liegende Mechanismus unterstützt bereits Sprachwechsel, aktuell ist nur Deutsch aktiv gewählt.
- **Zell-zu-Zell-Navigation im Tabellen-Bearbeitungsfenster** — das Fenster selbst existiert bereits und könnte um Pfeiltasten-Navigation erweitert werden, ohne die Grundstruktur zu ändern.
- **Weitere Lesebreite-Voreinstellungen** — das bestehende Container-Prinzip trägt zusätzliche Breitenstufen, ohne die Architektur zu verändern.

Diese Punkte sind architektonisch möglich, aber nicht konkret angekündigt oder eingeplant.
