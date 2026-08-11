# Archiv-Wiki — Design Guidelines

Diese Datei beschreibt ausschließlich endgültige, geltende Designregeln. Jede neue Oberflächen-Änderung ordnet sich in dieses System ein, statt eigene, abweichende Werte einzuführen.

## Designsystem — Grundprinzip

Das gesamte visuelle Erscheinungsbild basiert auf CSS-Variablen (definiert in `renderer/css/styles.css`), nicht auf verstreuten, hartkodierten Werten. Farbe, Rundung, Schriftart — alles wird über diese Variablen referenziert. Eine neue Komponente verwendet immer eine bestehende Variable; ein neuer, eigener Farb- oder Rundungswert wird nur dann definiert, wenn tatsächlich eine neue, dauerhafte Bedeutung entsteht (nicht als bequeme Abkürzung für den Einzelfall).

## Farben

| Variable | Wert | Bedeutung |
|---|---|---|
| `--bg-color` | `#121519` | Fenster-Grundhintergrund |
| `--bg-elev` | `#171b21` | Erhöhte Flächen — Panels, Karten, Chips |
| `--bg-elev-2` | `#2b2b2b` | Stärker abgesetzte Flächen — Eingabefelder, Knöpfe, Hover-Zustand von Karten |
| `--border` | `#333333` | Standard-Rahmenfarbe |
| `--border-soft` | `#262626` | Dezentere Trennlinien (z. B. innerhalb der Vorschau) |
| `--text-main` | `#e0e0e0` | Haupttext |
| `--text-muted` | `#a0a0a0` | Sekundärer Text |
| `--text-faint` | `#6e6e6e` | Am stärksten zurückgenommener Text |
| `--accent-color` | `#c17d45` (Standard, vom Nutzer änderbar) | Auswahl, aktive Zustände, normaler "ungespeichert"-Status |
| `--accent-dim` | `#9c6537` | Abgesetzte Variante der Akzentfarbe, u. a. für Rahmen bei Hover |
| `--red` | `#e2585a` | Ausschließlich für echte Fehler und destruktive Aktionen |
| `--green` | `#6ec97b` | Erfolg/Verfügbarkeit |
| `--cyan`, `--blue`, `--purple`, `--amber`, `--yellow` | — | Zusätzliche, thematische Farben (u. a. für Callout-Typen), nicht für allgemeine UI-Zustände |

**Verbindliche Regel:** Ein normaler, laufender Arbeitszustand (z. B. ungespeicherte Änderungen während des Schreibens) verwendet die Akzentfarbe, niemals Rot — Rot ist ausschließlich echten Fehlern und destruktiven Aktionen vorbehalten. Die Akzentfarbe selbst ist vom Nutzer über eine Paletten-Auswahl änderbar (`renderer/js/theme.js`); neuer Code verweist immer auf die Variable, nie auf einen festen Hex-Wert.

## Panels

Große, flächige Bereiche (Editor, Vorschau) folgen einem einheitlichen Muster: `border: 1px solid var(--border)`, `background: var(--bg-elev)`, `border-radius: var(--radius-lg)`, großzügiges Innenpolster (im Bereich 16–22px). Panels sind die größte visuelle Einheit im System und bekommen deshalb die größte Rundung.

## Karten (Chips/Kacheln)

Kleinere, klickbare Flächeneinheiten (Statistik-Kacheln, angeheftete Notizen) folgen einem eigenen, aber verwandten Muster: `background: var(--bg-elev)`, `border: 1px solid var(--border)`, `border-radius: var(--radius-md)`. Im Hover-Zustand wechseln Rahmen zu `--accent-dim` und Hintergrund zu `--bg-elev-2` — ausschließlich ein Farbwechsel, keine Bewegung, kein Schatten.

## Rundungen

Drei zentrale Stufen bilden die bevorzugten Standardwerte für normale UI-Komponenten und werden nach Elementgröße vergeben:

- `--radius-sm` (4px) — kleine interaktive Elemente: Knöpfe, Eingabefelder, einzelne Icon-Flächen
- `--radius-md` (6px) — mittlere Flächen: Karten, Chips
- `--radius-lg` (8px) — große Panels: Editor, Vorschau, Overlays

Bestehende funktionale Sonderformen dürfen davon abweichen. Dazu gehören vollständig runde Elemente (`50%`), Pill- und Badge-Formen (`999px`), sehr kleine funktionale Elemente mit etablierten Werten wie `2px` oder `3px` sowie bereits vorhandene spezielle Komponenten. Diese Ausnahmen erweitern die Radius-Skala nicht beliebig: Neue Komponenten verwenden zuerst einen der zentralen Standard-Radien. Ein abweichender Sonderwert wird nur mit konkretem funktionalem oder geometrischem Grund verwendet und nicht als frei gewählte Gestaltungsvariante eingeführt.

## Hover-Verhalten

Zwei zulässige Muster, keine weiteren:
1. **Standard (die meisten Elemente):** Farbwechsel bei Rahmen und/oder Text, z. B. `border-color` zu `--accent-dim`, Text zu `--text-main`. Übergangsdauer 150ms.
2. **Primäre Knöpfe (Akzentfarbe als Hintergrund):** `filter: brightness(1.08)` statt Farbwechsel, da der Hintergrund bereits die Akzentfarbe selbst ist.

**Ausdrücklich nicht verwendet:** Anheben (`transform: translateY`) kombiniert mit Schatten als Hover-Effekt. Dieses "schwebende" Muster wurde aus der Anwendung bewusst entfernt und darf nicht wieder eingeführt werden — es widerspricht der ruhigen, zurückhaltenden Grundhaltung.

## Animationen/Übergänge

- **Bevorzugter Standardwert: 150ms, `ease`.** Kurze allgemeine UI-Übergänge verwenden grundsätzlich diesen Wert. Bestehende Komponenten dürfen begründete abweichende Dauern verwenden, wenn ihre Funktion oder Wahrnehmung dies erfordert; die etablierten Abläufe mit `200ms` oder `220ms` sind deshalb keine Regelverletzung. Neue Dauerwerte werden nicht ohne konkreten funktionalen Grund eingeführt. Alle Übergänge bleiben ruhig, kurz und funktional.
- Übergänge betreffen bevorzugt Farbe, Rahmen und Hintergrund. Funktionale Schattenübergänge zur Ebenentrennung oder Fokusführung bleiben zulässig; Positions- oder Größenanimationen mit Schwebe-Charakter werden nicht eingeführt.
- Schatten werden sparsam und funktional eingesetzt, nicht als allgemeine Dekoration. Geeignete Einsatzfälle sind modale Dialoge, Kontextmenüs, Picker und andere schwebende Overlays, der Fokus-Modus sowie die Bild-Vergrößerungsansicht. Dort dienen sie der Ebenentrennung, Fokusführung oder räumlichen Zuordnung.
- Nicht verwendet werden dekoratives Hover-Anheben, dauerhaft schwebende Karten, starke Glow-Effekte oder Schatten ohne funktionale Bedeutung.
- Die Betriebssystem-Einstellung "Bewegung reduzieren" (`prefers-reduced-motion: reduce`) wird respektiert — Animationen deaktivieren sich für Nutzer, die das systemweit eingestellt haben. Neue Animationen müssen dieselbe Rücksicht nehmen.

## Icons

SVGs dürfen sowohl für thematische als auch für funktionale UI-Icons verwendet werden. Vorhandene zentrale beziehungsweise kuratierte Icon-Systeme und bereits vorhandene Icons werden bevorzugt wiederverwendet; für denselben funktionalen Bereich werden keine parallelen Stile oder konkurrierenden Icon-Systeme eingeführt. Zusammengehörige funktionale Icons bleiben in Strichstärke, Größe, Farbe und visueller Sprache konsistent.

Unicode-Symbole und Text bleiben zulässig, wenn sie im bestehenden Kontext bewusst vorgesehen und unmittelbar verständlich sind. Das gilt insbesondere für Editor-Werkzeuge, bei denen das sichtbare Zeichen die ausgelöste Markdown-Syntax direkt erklärt (`{ }` für Code, `1.` für nummerierte Listen). Daraus folgt weder eine SVG-Pflicht für jedes UI-Zeichen noch eine pauschale Bevorzugung von Unicode gegenüber vorhandenen funktionalen SVGs.

Bunte, verspielte Emoji-Symbole werden für funktionale UI-Elemente bewusst vermieden. In thematischen Auswahldialogen (z. B. Callout-Typ-Auswahl), wo ein Emoji tatsächlich inhaltliche Bedeutung trägt, sind sie weiterhin zulässig.

## Typografie

- **Monospace (JetBrains Mono):** Editor-Inhalt, Überschriften in der Vorschau (H1–H6), Codeblöcke, viele funktionale UI-Beschriftungen.
- **Sans-Serif (Inter):** Fließtext in der Vorschau. Bewusster Kontrast: Schreiben in Monospace, Lesen in einer für längeren Fließtext angenehmeren, proportionalen Schrift.
- **Überschriften-Hierarchie:** H1–H3 mit klar abgestufter Größe (H2 zusätzlich mit Trennlinie, H3 in Akzentfarbe). H4–H6 bleiben ebenfalls in Monospace, sinken aber nie unter die Fließtextgröße — die weitere Abstufung erfolgt ab H5 über Schriftstärke und Großschreibung, nicht über weiter sinkende Größe.

## Abstände

Kein starres Rastermaß, aber eine klare Tendenz: kompakte, funktionale Elemente (Knöpfe, kleine Eingabefelder) liegen im Bereich 6–10px Innenabstand, größere Flächen (Panels) im Bereich 16–22px. Neue Elemente ordnen sich in diese Größenordnung ein, orientiert an vergleichbaren, bereits bestehenden Elementen derselben Kategorie — kein beliebig gewählter neuer Wert.

## Responsives Verhalten

Ein einziger, entscheidender Umbruchpunkt bei **900px** Fensterbreite:
- **Darüber:** Die Sidebar kann dauerhaft eingeklappt werden; der Hauptbereich rückt dabei tatsächlich nach (Platz wird freigegeben, nicht nur überdeckt).
- **Darunter:** Die Sidebar verhält sich als Overlay — sie schiebt sich über den Inhalt, mit abgedunkeltem Hintergrund dahinter, statt Platz freizugeben.

Ein zweiter, kleinerer Umbruchpunkt bei 560px lässt Kartenraster (z. B. Notiz-Übersicht) auf eine einzelne Spalte zusammenfallen.

Die Anwendung ist auf Desktop-Fenstergrößen ausgelegt (Mindestbreite 960px laut Fensterkonfiguration) — die 900px/560px-Umbrüche fangen ungewöhnlich schmale Fenster ab, sind aber keine mobile-first-Gestaltung.

## Modale HTML-Dialoge

Alle modalen HTML-Dialoge verwenden denselben Bedien- und Accessibility-Standard, ohne ihre jeweilige visuelle Struktur zu ersetzen:

- `role="dialog"`, `aria-modal="true"` sowie eine eindeutige Verknüpfung mit Titel und vorhandener Beschreibung.
- Sinnvoller initialer Fokus innerhalb des Dialogs; der Hintergrund ist währenddessen per `inert` und `aria-hidden` nicht erreichbar.
- Tab und Umschalt+Tab bleiben zyklisch innerhalb des Dialogs.
- Escape schließt den Dialog, sofern kein fachlich kritischer Vorgang dies ausdrücklich verhindert.
- Nach dem Schließen kehrt der Fokus zum auslösenden Element zurück, sofern es noch existiert.
- Nicht-destruktive Eingabedialoge dürfen Enter eindeutig auf ihre primäre Aktion abbilden; destruktive oder verlustbehaftete Aktionen werden nicht automatisch durch Enter ausgelöst.
- Kritische Dialoge schließen nicht durch einen versehentlichen Klick auf den abgedunkelten Hintergrund. Nicht-kritische Ansichten wie Bildvergrößerung oder Dashboard-Anpassung dürfen dieses Verhalten bewusst beibehalten.
- Interaktive Elemente verwenden den vorhandenen dezenten `:focus-visible`-Stil mit der bestehenden Akzentvariable.

Die gemeinsame Logik liegt in `renderer/js/dialog.js`. Einzelne Dialoge dürfen keine parallele eigene Fokusfalle oder Hintergrundsperre implementieren.

Die bestehende Dialoghilfe vereinheitlicht zusätzlich die strukturellen Rollen aller verwalteten HTML-Dialoge:

- Dialogfläche (`dialog-surface`)
- Kopfbereich und Titel (`dialog-header`, `dialog-title`)
- layoutneutrale Inhaltshülle (`dialog-body`)
- gemeinsame Aktionsleiste (`dialog-actions`)
- primäre und sekundäre Aktionen über `data-dialog-action`

Bestehende visuelle Klassen bleiben erhalten. Die gemeinsame Struktur ergänzt die vorhandenen Dialoge, statt deren individuelles Layout oder ihre Fachlogik zu ersetzen. In Bestätigungsdialogen steht die sekundäre Aktion vor der primären Aktion; zusätzliche Werkzeugaktionen behalten ihre fachlich notwendige Position.

## Desktop-Feeling

Die Oberfläche vermeidet bewusst alles, was an eine Webseite erinnert: kein endloses Scrollen ohne klare Begrenzung, keine aufdringlichen Benachrichtigungs-Banner, keine ständigen Lade-Indikatoren für lokale, sofort verfügbare Daten. Interaktionen reagieren unmittelbar; wo eine Aktion tatsächlich Zeit braucht, ist das die Ausnahme, nicht die Regel. Fenster-typische Bedienelemente (eigene Titelleiste, natives Kontextmenü, native Dialoge für Dateiauswahl) werden bevorzugt gegenüber selbstgebauten Web-Nachbildungen.

## Dialoge – visueller Standard

- Alle HTML-Dialoge verwenden für funktionale Symbole das bestehende monochrome Icon-System; bunte Emoji in Dialogtiteln, Dialogaktionen oder Statuszeilen sind nicht zulässig.
- Dialogtitel, Beschreibungen, Aktionsleisten und technische Detailbereiche verwenden gemeinsame Typografie-, Abstands- und Größenregeln. Fachlich unterschiedliche Größenklassen (kompakt, mittel, groß) bleiben erhalten, folgen aber denselben responsiven Begrenzungen.
- Dialoge verwenden ruhige, einheitliche Hover-, Disabled- und Focus-Visible-Zustände mit den bestehenden Designvariablen und 150-ms-Übergängen.
- Fehlerdialoge zeigen eine kurze verständliche Hauptmeldung; technische Details bleiben optisch nachgeordnet und optional.

## HTML-Kontextmenüs – Bedienung und Accessibility

Alle selbst gerenderten HTML-Kontextmenüs verwenden einen gemeinsamen Bedienstandard, ohne ihre bestehende visuelle Struktur oder Fachlogik zu ersetzen:

- Das Menü besitzt `role="menu"`; ausführbare Einträge verwenden `role="menuitem"`, Trennlinien `role="separator"`.
- Untermenüs verwenden ebenfalls `role="menu"`; übergeordnete Einträge kennzeichnen sie mit `aria-haspopup="menu"` und `aria-expanded`.
- Beim Öffnen erhält der erste verfügbare Eintrag den Fokus. Deaktivierte Einträge werden übersprungen.
- Pfeil hoch/runter navigiert zyklisch, Home/End springt zum ersten/letzten verfügbaren Eintrag.
- Enter und Leertaste führen den fokussierten Eintrag aus. Bei einem Untermenü öffnen sie dieses und fokussieren dessen ersten Eintrag.
- Pfeil rechts öffnet ein Untermenü; Pfeil links kehrt zum übergeordneten Eintrag zurück.
- Escape und Tab schließen das Menü. Nach dem Schließen kehrt der Fokus zum auslösenden Element zurück, sofern es noch existiert.
- Rechtsklick, `Shift+F10` und die Kontextmenütaste verwenden dieselbe vorhandene Menüimplementierung.
- Klick außerhalb und die Auswahl einer Aktion schließen das Menü zuverlässig.
- Kontextmenü-Einträge verwenden den bestehenden dezenten `:focus-visible`-Stil mit der Akzentvariable.

Die gemeinsame Bedienlogik liegt zentral in `renderer/js/app.js` bei `manageHtmlContextMenu()`. Einzelne HTML-Kontextmenüs dürfen keine parallelen globalen Escape-, Klick-außerhalb- oder Pfeiltasten-Listener anlegen.

## HTML-Kontextmenüs – Struktur und Aktionsordnung

Alle selbst gerenderten HTML-Kontextmenüs verwenden zusätzlich zur gemeinsamen Bedienlogik dieselben strukturellen Regeln:

- Erzeugung, Öffnen, Positionieren, Schließen und Listener-Aufräumen laufen zentral über die vorhandenen Kontextmenü-Hilfen in `renderer/js/app.js`.
- Einfache Menüs verwenden eine gemeinsame Element-Erzeugung; Editor-Untermenüs behalten ihr bestehendes Datenmodell, werden aber vor dem Rendern zentral von führenden, abschließenden oder doppelten Trennlinien bereinigt.
- Aktionsgruppen folgen, soweit die vorhandenen Aktionen dies zulassen, der Reihenfolge: Erstellen/Hinzufügen, Öffnen/Bearbeiten, Organisieren, Informationen, destruktive Aktionen.
- Destruktive Aktionen stehen am Ende und werden bei vorangehenden normalen Aktionen durch genau eine Trennlinie abgesetzt.
- Trennlinien erscheinen ausschließlich zwischen inhaltlichen Gruppen; führende, abschließende und doppelte Trennlinien sind nicht zulässig.
- Das Verschieben einer Notiz oder Kategorie in den vorhandenen Papierkorb heißt einheitlich „In den Papierkorb“. „Endgültig löschen“ bleibt ausschließlich irreversiblen Löschvorgängen vorbehalten.
- Maus- und Tastaturöffnung verwenden dieselbe zentrale Fensterbegrenzung. Menüs werden anhand der angeforderten Position beziehungsweise des auslösenden Elements innerhalb des sichtbaren Fensters platziert.
- Beim Schließen werden Listener und Referenzen auf das vorherige Ziel zentral entfernt; höchstens ein HTML-Kontextmenü ist gleichzeitig aktiv.

Die bestehenden visuellen Klassen `.context-menu` und `.ectx-menu`, ihre Icons, Größen und Hover-Darstellung bleiben erhalten.
