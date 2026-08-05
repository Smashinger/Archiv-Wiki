# Archiv-Wiki — Editor

Diese Datei fasst den endgültigen Stand des gesamten Editor-Bereichs zusammen — Schreibfläche, Vorschau, Werkzeugleiste und alles, was direkt mit dem Bearbeiten einer Notiz zu tun hat.

## Ziel

Der Editor soll sich anfühlen wie ein durchdachtes, ruhiges Schreibwerkzeug — nicht wie eine technische Textfläche mit angehängter Vorschau. Schreiben und Lesen (Vorschau) sind gleichwertige, nebeneinander bestehende Tätigkeiten, keine getrennten Modi mit Kompromissen.

## Layout

Kopfbereich (Titel, Tags, Kategorie) → Werkzeugleiste → Editor-/Vorschau-Bereich → Fußzeile (Wortzahl, Speicherstatus). Editor und Vorschau teilen sich im Split-Modus eine gemeinsame, ziehbare Trennlinie.

## Werkzeugleiste

Enthält Formatierungs-Knöpfe, Ansichts-Umschalter (Editor/Split/Vorschau), Schriftgrößen-Auswahl, Sync-Scroll-Umschalter und den Speichern-Knopf. Alle Elemente teilen sich eine einheitliche Höhe (32px) und dieselbe Übergangszeit (150ms) — siehe `02_DESIGN_GUIDELINES.md` für die allgemeinen Werte. Icon-Sprache: Buchstaben, die ihre eigene Formatierung visuell zeigen (F/K/D/U für Fett/Kursiv/Durchgestrichen/Unterstrichen), sowie Symbole, die möglichst die tatsächliche Markdown-Syntax abbilden (`{ }` für Code, `1.` für nummerierte Liste, `↗` für Link, `▤` für Callout).

## Lesebreite

Eine optionale, vom Nutzer aktivierbare Einstellung, die sowohl Editor als auch Vorschau auf eine feste, zentrierte Breite begrenzt. Wird über einen einzigen, gemeinsamen Inhaltscontainer gesteuert (siehe Vorschau-Abschnitt unten) — kein Element bekommt eine eigene, unabhängige Breiten-/Zentrierungs-Regel. Tabellen und Codeblöcke dürfen breiter sein als der übrige Text und scrollen bei Bedarf selbst horizontal, statt gestaucht zu werden.

## Split View

Drei Ansichtsmodi: reiner Editor, geteilte Ansicht, reine Vorschau. Ansichtsmodus und Split-Breite werden **pro Notiz** gespeichert (nicht global), damit jede Notiz beim erneuten Öffnen in der zuletzt gewählten Ansicht erscheint.

## Schreibkomfort

- **Automatisches Schließen von Klammern/Anführungszeichen**, erweitert um `` ` `` (Inline-Code) und `*` (Hervorhebung).
- **Listen- und Checklisten-Fortsetzung** beim Drücken von Enter.
- **Tab/Shift+Tab** rücken ein/aus.
- **Schriftart bewusst durchgehend Monospace** im Editor — passt zur technischen, markdown-basierten Natur des Schreibens; die Vorschau nutzt bewusst eine andere, proportionale Schrift für den Fließtext (siehe `02_DESIGN_GUIDELINES.md`).
- **Rechtschreibprüfung** über Electrons native Rechtschreib-Engine, sofort umschaltbar ohne Neustart, aktuell auf Deutsch festgelegt.

## Navigation

Cursor- und Mausnavigation folgen vollständig dem unveränderten Standardverhalten des Editors — keine eigene, abweichende Logik für Pfeiltasten, Doppelklick, Textmarkierung. Zusätzlich, editor-eigen:
- **Scrollposition wird pro Notiz gespeichert** (Editor und Vorschau getrennt) und beim erneuten Öffnen wiederhergestellt.
- **Wikilinks** navigieren direkt zur Zielnotiz; "Zurück zur vorherigen Notiz" funktioniert über die normale Verlaufs-Navigation des zugrunde liegenden Fensters, da die Notiz-Navigation auf Adress-Fragmenten basiert.
- Die Tabellen-Bearbeitung (eigenes Fenster, siehe Vorschau-Abschnitt) hat keine Pfeiltasten-Navigation zwischen Zellen, nur Standard-Tab-Fokuswechsel.

## Vorschau

- **Rendering-Grundlage:** marked.js, mit einer Platzhalter-Technik für Callouts und Wikilinks (vor dem eigentlichen Parsen durch eindeutige Tokens ersetzt, danach wieder eingesetzt) — verhindert, dass die Markdown-Bibliothek diese besondere Syntax fehlinterpretiert.
- **Gemeinsamer Inhaltscontainer:** Das gesamte gerenderte HTML liegt in einem einzigen Wrapper, der die Lesebreite steuert. Normale Inhalte (Text, Überschriften, Bilder, Zitate) teilen sich eine gemeinsame Breiten-/Zentrierungs-Regel; Tabellen/Code dürfen den volleren, breiteren Rahmen nutzen.
- **Überschriften H1–H6:** durchgehend Monospace, logisch absteigende Größe; H4–H6 sinken nie unter die Fließtextgröße, ab H5 übernehmen Schriftstärke/Großschreibung die weitere Abstufung.
- **Bilder:** Größenänderung per Hover-Knöpfe (25/50/75/100 %). Eine gewählte Breite wird über reguläre Markdown-Bildsyntax mit einem zusätzlichen Attribut transportiert, nicht über ein rohes HTML-`<img>`-Tag — ein alleinstehendes HTML-Tag würde von der Markdown-Verarbeitung als eigenständiger Block ohne umschließenden Absatz behandelt und aus dem normalen Textfluss herausfallen. Klick auf ein Bild öffnet eine Vergrößerungsansicht (eigenes Overlay, kein Browser-natives Feature).
- **Horizontale Linie:** flacher, moderner Strich statt Browser-Standarddarstellung.
- **Tabellen-Bearbeitung:** eigenes Fenster per Doppelklick auf eine Tabelle in der Vorschau.
- **KaTeX, Codeblöcke mit Kopieren-Knopf, Druckansicht:** vollständig unterstützt.

## Einstellungen

Alle editor-bezogenen Einstellungen (Tab-Größe, Auto-Save-Intervall, Rechtschreibprüfung, Schriftgröße) werden direkt aus der Projekt-Konfiguration gelesen, nie aus einer separaten, zwischengespeicherten Kopie. Auto-Save-Intervall wirkt sofort, ohne die Notiz erneut zu öffnen. Tab-Größe betrifft zwei voneinander unabhängige, aber gemeinsam zu setzende Aspekte: die visuelle Darstellungsbreite eines Tab-Zeichens und das tatsächliche Einrückungsverhalten der Tab-Taste — beide müssen bei einer Änderung gemeinsam berücksichtigt werden.

## Performance

- Der Editor selbst zeigt zu jedem Zeitpunkt nur die tatsächlich sichtbaren Zeilen als echte Bildschirmelemente an (Virtualisierung), unabhängig von der Gesamtlänge der Notiz.
- Die Vorschau-Aktualisierung ist entprellt — sie baut sich nicht bei jedem einzelnen Tastendruck neu auf, sondern erst nach einer kurzen Schreibpause. Das eigentliche Rendering-Ergebnis bleibt davon unverändert, nur der Zeitpunkt der Aktualisierung.
- Automatisches Speichern läuft über einen eigenen, separat entprellten Timer.

## UX-Regeln

- Einheitliche Werkzeugleisten-Höhe (32px) und Übergangszeit (150ms) für alle Bedienelemente.
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
- **Ein vollständig ausblendender Konzentrationsmodus, der Sidebar, Kopfzeile und Werkzeugleiste verbirgt.** Wurde verworfen, weil dabei zu leicht die Orientierung verloren geht. Ersetzt durch den heutigen Fokus-Modus: Die übrige Oberfläche bleibt vollständig sichtbar und bedienbar, tritt aber optisch zurück (reduzierte Deckkraft, leichte Entsättigung); der Editor-Bereich selbst bekommt stattdessen eine dezente, bewusst neutrale Hervorhebung (kein Einsatz der Akzentfarbe, damit es zu jeder gewählten Akzentfarbe passt). Kein echtes Vollbild, Fensterrahmen bleiben unverändert. Der An/Aus-Zustand wird bewusst nicht gespeichert (reiner Sitzungszustand); die gewählte Intensitätsstufe dagegen schon, da sie eine dauerhafte Stilvorliebe ist.
- **Gültigkeitsbereich des Fokus-Modus:** Der Modus ist ausschließlich an eine geöffnete Notiz gebunden. Beim Wechsel zwischen Notizen bleibt er mit unveränderter Intensität aktiv; der bei jedem Notizwechsel neu erzeugte Toolbar-Button wird aus dem bestehenden `body.focus-mode`-Zustand synchronisiert. Beim Wechsel zum Dashboard, Papierkorb, zu Tags, Statistiken oder einer anderen Route ohne offenen Editor wird der Modus über `setFocusMode(false, ...)` automatisch beendet. Eine Aktivierung ohne vorhandenen Editor ist nicht möglich.
- **Accessibility und Fokus:** Der Toolbar-Schalter spiegelt seinen Zustand zentral mit `aria-pressed`; sichtbare `active`-Klasse und semantischer Zustand werden gemeinsam in `setFocusMode()` aktualisiert. Die Intensitätsbuttons bleiben native Buttons und kennzeichnen genau eine Auswahl über `aria-pressed`. Bei Aktivierung oder Deaktivierung über die Toolbar wechselt der Fokus zurück in den Schreibbereich (Vorschau in der reinen Vorschauansicht, ansonsten Editor). Aktivierung über die Einstellungen verändert den Fokus des Einstellungsdialogs nicht. Die Werkzeugleiste wird im Fokus-Modus bei `:focus-within` ebenso wie bei Hover vollständig sichtbar.
- **Prioritäten für Tastaturbefehle:** Modale Dialoge, die globale Suche und ein geöffnetes HTML-Kontextmenü haben Vorrang vor dem Fokus-Modus. `Strg/Cmd + Umschalt + F` verändert den Fokus-Modus nicht, solange eine dieser Oberflächen aktiv ist; Escape schließt zuerst die vorrangige Oberfläche und beendet den Fokus-Modus erst bei einem weiteren, nicht abgefangenen Escape.
- **Finale visuelle Regeln:** Alle Fokus-Modus-spezifischen Übergänge verwenden den Projektstandard `150ms ease`. Bei reduzierter Bewegung werden diese Übergänge deaktiviert. Die vier Intensitätsstufen Leicht, Mittel, Stark und Sehr stark bleiben erhalten; Hover und `:focus-within` hellen gedimmte Bedienbereiche vollständig auf.
- **Neutrale Hervorhebung:** Der Arbeitsbereich behält den vorhandenen weichen, neutralen Schatten als bewusste Ausnahme von der überwiegend flachen Designsprache. Er dient ausschließlich der räumlichen Trennung vom gedimmten Umfeld, verwendet keine Akzentfarbe und verändert weder Breite noch Ausrichtung von Editor, Vorschau oder Splitter.

## Spätere Erweiterungsmöglichkeiten

Die Architektur lässt bewusst Raum für:
- **Mehrsprachige Rechtschreibprüfung** — der zugrunde liegende Mechanismus unterstützt bereits Sprachwechsel, aktuell ist nur Deutsch aktiv gewählt.
- **Zell-zu-Zell-Navigation im Tabellen-Bearbeitungsfenster** — das Fenster selbst existiert bereits und könnte um Pfeiltasten-Navigation erweitert werden, ohne die Grundstruktur zu ändern.
- **Weitere Lesebreite-Voreinstellungen** — das bestehende Container-Prinzip trägt zusätzliche Breitenstufen, ohne die Architektur zu verändern.

Diese Punkte sind architektonisch möglich, aber nicht konkret angekündigt oder eingeplant.
