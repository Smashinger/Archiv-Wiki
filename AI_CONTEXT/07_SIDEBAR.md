# Archiv-Wiki — Sidebar

## Ziel

Die Sidebar ist der primäre Navigationsweg durch das gesamte Wiki: feste Projektbereiche, Kategorie-Baum, schnelle Volltextsuche, Umsortieren und Verschieben von Einträgen. Sie soll auch bei vielen Kategorien und Notizen übersichtlich bleiben, ohne dass der Nutzer zur Bedienung eigens in einen speziellen "Bearbeitungsmodus" wechseln muss.

## Aufbau

Unterhalb der Projektbezeichnung folgen die globale Wiki-Suche und die vorhandenen Erstellen-Aktionen. Danach stehen die festen Navigationsbereiche in der Reihenfolge **Start**, **Eingang**, **Wissenspflege**. Darunter liegt der scrollbare Wiki-Baum mit Hauptkategorien, Unterkategorien und Notizen; am unteren Rand folgt der Update-Status. Der vertikale Ziehgriff an der Sidebar-Kante verändert ihre Breite.

## Feste Navigationsbereiche

- **Start** öffnet das Dashboard.
- **Eingang** öffnet den eigenen Bereich für gesammelte oder importierte Inhalte. Seine Sichtbarkeit in der Sidebar ist in den Einstellungen konfigurierbar; das Ausblenden entfernt weder Eingangseinträge noch gespeicherte Clips.
- **Archiv** öffnet die eigene Archiv-Seite mit allen archivierten Notizen (siehe `12_KNOWN_DECISIONS.md`, Abschnitt „Archivierung").
- **Wissenspflege** öffnet den bestehenden Bereich zur Qualitätskontrolle des Wiki-Bestands.
- Eingang, Archiv und Wissenspflege sind feste Projektbereiche und keine normalen Kategorie-, Unterkategorie- oder Notizknoten des Wiki-Baums.

## Kategorien und Unterkategorien

- Eine Notiz liegt immer innerhalb einer Unterkategorie, eine Unterkategorie immer innerhalb einer Hauptkategorie — keine tiefere Verschachtelung.
- Hauptkategorien und Unterkategorien lassen sich einzeln ein-/ausklappen; der Zustand wird gemerkt.
- Kategoriezeilen zeigen die Anzahl der enthaltenen Notizen; bei Hauptkategorien umfasst der Zähler auch die Notizen ihrer Unterkategorien.
- Die Kategorie(n), zu denen die aktuell geöffnete Notiz gehört, werden dezent hervorgehoben — von der obersten Hauptkategorie bis zur direkten Elternkategorie. In Classic geschieht das über die Akzentfarbe am Kategorie-Titel, in Design2 über einen helleren Text ohne eigene Fläche (siehe „Design2" weiter unten: dort trägt höchstens **eine** Zeile im ganzen Baum eine Auswahlkante). Das gilt unabhängig von der separaten Einstellung, ob Kategorien beim Programmstart eingeklappt sein sollen; diese Einstellung bestimmt nur den Zustand beim Start, nicht das Verhalten beim späteren Navigieren zu einer Notiz.

## Navigation

Klick auf eine Notiz öffnet sie im Hauptbereich. Klick auf eine Kategorie klappt sie auf/zu. Aktionen für Notizen, Hauptkategorien und Unterkategorien werden ausschließlich über das gemeinsame Kontextmenü erreicht: per Rechtsklick, `Shift+F10` oder Kontextmenütaste. Drei-Punkte-Schaltflächen neben den Einträgen werden bewusst nicht angezeigt, damit die Sidebar ruhig und platzsparend bleibt.

## Suche

Ein einziges Suchfeld oberhalb des Baums durchsucht das **gesamte Wiki** per echter Volltextsuche (Titel, Inhalt und Schlagworte, über die gebündelte FlexSearch-Instanz) und zeigt die Treffer als eigenständiges Dropdown (Titel, Kategorie, Schlagworte, Textausschnitt) — sie filtert nicht den sichtbaren Baum selbst. Diese Suche ist bewusst getrennt von der editor-internen Suche (CodeMirror-Suche innerhalb der gerade offenen Notiz): Die Sidebar-Suche durchsucht immer das gesamte Wiki, die Editor-Suche immer nur die aktuell geöffnete Notiz. Es gibt bewusst nur diesen einen, einheitlichen Such-Mechanismus für das gesamte Wiki, keinen zweiten, parallelen.

## Aktionsmenü

Notizen, Hauptkategorien und Unterkategorien besitzen kein separates Drei-Punkte-Menü. Das vorhandene HTML-Kontextmenü ist die einzige Aktionsoberfläche für Umbenennen, Icon-Wechsel, Archivieren (nur bei Notizen) und Verschieben in den Papierkorb. Dadurch existiert keine doppelte Bedienlogik und die volle Zeilenbreite bleibt für Titel und Kategorienamen verfügbar.

Die Bedienwege sind gleichwertig:

- Maus: Rechtsklick auf den Eintrag
- Tastatur: fokussierten Eintrag mit `Shift+F10` oder der Kontextmenütaste öffnen
- Innerhalb des Menüs: Pfeiltasten, Home/End, Enter und Escape

Reine Erstellen-Schaltflächen wie „Neue Kategorie“, „Neue Unterkategorie“ und „Neue Notiz“ besitzen kein Kontextmenü; sie werden regulär mit Klick, Enter oder Leertaste ausgelöst.

## Drag & Drop

Jede Zeile (Hauptkategorie, Unterkategorie, Notiz) bekommt bei Hover einen Ziehgriff, über den sich der Eintrag umsortieren oder in eine andere Kategorie verschieben lässt. Der Griff ist permanent im DOM vorhanden, aber nur bei Mausüberfahrt sichtbar — kein separater Modus muss dafür aktiviert werden. Classic zeigt dafür das ⠿-Symbol, Design2 sechs gestrichelte Punkte (Lucide `grip-vertical`, 11 px); beide Varianten stehen im selben Markup und werden per CSS umgeschaltet. Ein Verschieben löst eine Toast-Benachrichtigung mit Rückgängig-Möglichkeit aus.

## Mehrfachauswahl

Ein Umschalt-Knopf in der Topbar aktiviert einen eigenen Auswahlmodus für Notizen (getrennt von der einzelnen Drag&Drop-Verschiebung oben). Im aktiven Auswahlmodus erhält jede auswählbare Notizzeile in Sidebar, Dashboard und Archiv-Seite eine Checkbox; alle drei Ansichten teilen sich denselben zentralen, sitzungslokalen Auswahlzustand über den jeweiligen relPath, sodass eine in einer Ansicht ausgewählte Notiz in den anderen Ansichten sofort ebenfalls als ausgewählt erscheint. Eine eigene Auswahlleiste in der Sidebar zeigt die Anzahl ausgewählter Notizen, bietet „Auswahl aufheben" sowie die Batch-Aktionen Verschieben, Archivieren und In den Papierkorb (siehe `12_KNOWN_DECISIONS.md`, Abschnitt „Mehrfachauswahl / Batch Operations"). Der Eingang besitzt weiterhin sein eigenes, unabhängiges Mehrfachauswahl-System und ist von diesem Mechanismus nicht betroffen.

## Speicherverhalten

Ein-/Ausklapp-Zustand von Kategorien, Sidebar-Breite und Sidebar-Einklapp-Zustand werden pro Projekt gespeichert, nicht app-weit.

## Sidebar-Breite

Frei verstellbar zwischen 220px und 480px, Standardwert 292px. Doppelklick auf den Ziehgriff setzt die Breite auf den Standardwert zurück; ein Rechtsklick-Kontextmenü bietet denselben Reset ebenfalls an.

## Einklappen

Die Sidebar lässt sich vollständig einklappen. Ihr Verhalten unterscheidet sich je nach Fensterbreite (siehe `02_DESIGN_GUIDELINES.md`, Umbruchpunkt 900px): Oberhalb davon gibt die eingeklappte Sidebar den Platz tatsächlich frei (der Hauptbereich rückt nach); unterhalb davon verhält sich die (dann nicht dauerhaft eingeklappte, sondern situativ geöffnete) Sidebar als Overlay über dem Inhalt.

## Icons

Kategorien und einzelne Notizen können ein thematisches Icon aus der kuratierten SVG-Icon-Bibliothek erhalten; der Auswahldialog besitzt eine eigene Suche. Funktionale Navigations- und Aktionsicons dürfen ebenfalls aus den bestehenden zentralen SVG-Systemen stammen. Vorhandene Icons werden wiederverwendet und innerhalb eines funktionalen Bereichs visuell konsistent gehalten; eine neue parallele Icon-Bibliothek wird nicht eingeführt. Bewusst eingesetzte Unicode-Symbole oder Text bleiben in ihrem bestehenden Kontext zulässig.

Der Design2-Baum zeigt diese gewählten Icons bewusst **nicht** an: Kategorien tragen dort statt eines Ordner-Icons den farbigen Rücken, Notizen ein einheitliches `file-text` (siehe „Design2" unten). Das gewählte Icon bleibt dabei unverändert gespeichert, ist über das Kontextmenü weiterhin änderbar und erscheint überall sonst — im Classic-Baum, im Dashboard, in der Suche und auf den Notizseiten. Ein Designwechsel ändert also nur die Darstellung im Baum, nie die Daten.

## Hover

Ziehgriffe erscheinen ausschließlich bei Hover (reiner Opacity-Übergang, 150 ms in Classic, 120 ms im Design2-Baum). Ansonsten folgt die Sidebar denselben allgemeinen Hover-Regeln wie der Rest der Anwendung (Farbwechsel, keine Bewegung, kein Schatten). Im Design2-Baum liegt die Hover-Fläche über der vollen Zeilenbreite, ohne Radius und ohne Rand — ein abgesetzter Balken würde den Einzug optisch brechen.

## Designregeln

Die Sidebar verwendet dieselben Farb-, Abstands- und Rundungswerte wie der Rest der Anwendung (siehe `02_DESIGN_GUIDELINES.md`) — keine eigene, abweichende Optik. Eine Ausnahme besteht: der Notizbereich des Baums in Design2, siehe den folgenden Abschnitt. Sie ist ausdrücklich auf diesen einen Bereich begrenzt und gilt weder für Classic noch für die übrigen Teile der Sidebar.

### Design2 — Notizbereich

Der Baum unter **THEMEN** (Hauptkategorie › Unterkategorie › Notiz) hat in Design2 eine eigene, in sich geschlossene Formensprache. Verbindlich dafür ist `archiv-wiki-sidebar-notizen.md` im Projektwurzelverzeichnis, nicht `02_DESIGN_GUIDELINES.md`. Die Umsetzung liegt vollständig in `renderer/css/sidebar-tree.css`; die Farben kommen aus `renderer/css/archiv-wiki-tokens.css`.

**Classic bleibt davon unberührt.** Der Baum liefert an drei Stellen beide Varianten im selben Markup — Ordner-Icon ↔ Rücken, ⠿ ↔ Griffpunkte, freies Notiz-Icon ↔ `file-text` — und blendet per CSS je Design genau eine aus. Es gibt also weiterhin ein DOM und eine Renderlogik (`renderGroup()`/`renderNoteItem()` in `renderer/js/app.js`); ein Wechsel des Oberflächen-Designs wirkt sofort, ohne dass der Baum neu gerendert werden muss.

**Marke.** Über dem Baum steht die Marke `THEMEN` mit der Anzahl der Hauptkategorien. In Classic bleibt sie ausgeblendet.

**Zeilenform.** Alle Zeilen laufen über die volle Breite des Baums. Der Einzug entsteht ausschließlich über `padding-left` — nie über Ränder, Abstände oder eingerückte Container, weil sonst die Hover-Fläche an der falschen Stelle abbräche.

| Ebene | Zeilenhöhe | Einzug | Chevron | Rücken | Icon | Text |
| --- | --- | --- | --- | --- | --- | --- |
| Hauptkategorie | 28 px | 12 px | 12 px | 3 × 15 px | — | 13 px |
| Unterkategorie | 26 px | 29 px | 11 px | — | — | 12,5 px |
| Notiz | 25 px | 49 px | — | — | 11 px | 12,5 px |

**Rücken statt Ordner-Icon.** Eine Hauptkategorie wird durch einen 3 × 15 px breiten farbigen Rücken zwischen Chevron und Name markiert, nicht durch ein Ordner-Icon. Unterkategorien tragen keinen Rücken: Sie gehören sichtbar zur Hauptkategorie darüber, weil sie eingerückt darunter stehen, und ein zweiter Farbstreifen macht die Spalte unruhig.

Die Farbe wird derzeit reihum nach Position der Hauptkategorie vergeben: rosé → blau → amber → grün. Sie ist damit **noch keine gespeicherte Kategorie-Eigenschaft** und nicht nutzerwählbar; eine beim Anlegen frei gewählte Themenfarbe wäre eine eigene Erweiterung mit neuer Speicherung. Der frühere, rein dekorative Einheitsstreifen (`--d2-category`) am Zeilenrand ist damit abgelöst.

**Zustände.** Höchstens **eine** Zeile im ganzen Baum trägt die Auswahlkante — zwei Marker nebeneinander sind ein Fehler.

- Ruhe: keine Fläche.
- Hover: Fläche über die volle Zeilenbreite, ohne Radius und ohne Rand.
- Ausgewählt: 3 px Kante innen an der Zeile plus nach rechts auslaufende Tönung.
- Aufgeklappte Kategorie ohne Auswahl: keine Fläche, hellerer Text, Chevron in Rosé.
- Der offene Chevron in Rosé ist neben Rücken und Auswahl der einzige Farbträger im Baum und zeigt auf einen Blick, welcher Zweig aufgeklappt ist.

**Sidebar-Größe.** Die Einstellung ändert im Baum **nur** die Zeilenhöhen (26/24/23 · 28/26/25 · 32/29/28), nie Schriftgrößen, Einzüge oder Icon-Größen. Die drei Werte kommen als einzige Dichte-Variablen aus `SIDEBAR_DENSITY_PRESETS` in `renderer/js/theme.js`.

**Bewusst nicht umgesetzt.** Die Spezifikation nennt drei Dinge, die es im Programm nicht gibt und die hier deshalb offen bleiben, statt erfunden zu werden: das Kürzel `Ctrl O` für eine Struktur-Palette (die Palette existiert nicht, und `Strg+O` ist mit „Projektordner öffnen" belegt), die Wahl der Themenfarbe beim Anlegen und eine gedämpfte Sidebar während Editor/Split. Der Baum malt außerdem seine Grundfläche nicht selbst, sondern sitzt auf der Fläche der Sidebar — ein eigener Anstrich würde die Sidebar zweifarbig teilen, weil Kopf, Bereiche und Fußbereich nicht Teil dieses Umbaus waren.

**Geltungsbereich.** Kopf, Suche, feste Bereiche (Start/Eingang/Archiv/Wissenspflege), Anlegen-Knöpfe, Auswahlleiste und Fußbereich der Sidebar sind nicht Teil dieser Formensprache und behalten ihre bisherige Design2-Gestaltung.

## Regeln für zukünftige Änderungen

- Es darf zu keinem Zeitpunkt zwei parallele Such-/Filter-Mechanismen für dieselbe Aufgabe (Navigation im Wiki finden) gleichzeitig geben — bewusste, bestätigte Entscheidung. Eine Erweiterung der Suche geschieht am bestehenden, einen Mechanismus, nicht durch einen zusätzlichen, zweiten.
- Verschiebe-/Umsortier-Funktionalität einzelner Einträge bleibt an den Hover-Ziehgriff gebunden, nicht an einen wiederkehrenden, permanenten Bearbeitungsmodus-Knopf.

## Bewusst verworfene Ideen

- **Ein eigener, aktivierbarer "Bearbeitungsmodus"-Knopf** für Sidebar-**Umsortierung einzelner Einträge** wurde entfernt und durch die bei Hover erscheinenden Ziehgriffe ersetzt, die permanent (aber unauffällig) an jeder Zeile verfügbar sind — kein zusätzlicher Zustand, den man erst aktivieren muss. Diese Entscheidung betraf ausschließlich das Umsortieren/Verschieben einzelner Einträge, **nicht** den heutigen, expliziten Mehrfachauswahlmodus (siehe Abschnitt „Mehrfachauswahl" oben): Eine Mehrfachauswahl über mehrere Notizen hinweg benötigt zwingend einen erkennbaren An/Aus-Zustand (Checkboxen erscheinen/verschwinden, Auswahlleiste), anders als das rein einzeilige Umsortieren per Ziehgriff. Beide Entscheidungen bestehen unabhängig voneinander weiter.
- **Ein reiner, direkter Baum-Filter** (der bei Eingabe unpassende Zeilen im sichtbaren Baum ausblendet) wurde zugunsten der einheitlichen Header-Suche mit Ergebnis-Dropdown verworfen. Zwei parallele Mechanismen für dieselbe Aufgabe (etwas im Wiki finden) wurden als weniger übersichtlich bewertet als ein einziger, vollständiger Weg.
