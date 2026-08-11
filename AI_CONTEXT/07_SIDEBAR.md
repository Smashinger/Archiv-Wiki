# Archiv-Wiki — Sidebar

## Ziel

Die Sidebar ist der primäre Navigationsweg durch das gesamte Wiki: feste Projektbereiche, Kategorie-Baum, schnelle Volltextsuche, Umsortieren und Verschieben von Einträgen. Sie soll auch bei vielen Kategorien und Notizen übersichtlich bleiben, ohne dass der Nutzer zur Bedienung eigens in einen speziellen "Bearbeitungsmodus" wechseln muss.

## Aufbau

Unterhalb der Projektbezeichnung folgen die globale Wiki-Suche und die vorhandenen Erstellen-Aktionen. Danach stehen die festen Navigationsbereiche in der Reihenfolge **Start**, **Eingang**, **Wissenspflege**. Darunter liegt der scrollbare Wiki-Baum mit Hauptkategorien, Unterkategorien und Notizen; am unteren Rand folgt der Update-Status. Der vertikale Ziehgriff an der Sidebar-Kante verändert ihre Breite.

## Feste Navigationsbereiche

- **Start** öffnet das Dashboard.
- **Eingang** öffnet den eigenen Bereich für gesammelte oder importierte Inhalte. Seine Sichtbarkeit in der Sidebar ist in den Einstellungen konfigurierbar; das Ausblenden entfernt weder Eingangseinträge noch gespeicherte Clips.
- **Wissenspflege** öffnet den bestehenden Bereich zur Qualitätskontrolle des Wiki-Bestands.
- Eingang und Wissenspflege sind feste Projektbereiche und keine normalen Kategorie-, Unterkategorie- oder Notizknoten des Wiki-Baums.

## Kategorien und Unterkategorien

- Eine Notiz liegt immer innerhalb einer Unterkategorie, eine Unterkategorie immer innerhalb einer Hauptkategorie — keine tiefere Verschachtelung.
- Hauptkategorien und Unterkategorien lassen sich einzeln ein-/ausklappen; der Zustand wird gemerkt.
- Kategoriezeilen zeigen die Anzahl der enthaltenen Notizen; bei Hauptkategorien umfasst der Zähler auch die Notizen ihrer Unterkategorien.
- Die Kategorie(n), zu denen die aktuell geöffnete Notiz gehört, werden dezent hervorgehoben (Akzentfarbe am Kategorie-Titel) — von der obersten Hauptkategorie bis zur direkten Elternkategorie. Das gilt unabhängig von der separaten Einstellung, ob Kategorien beim Programmstart eingeklappt sein sollen; diese Einstellung bestimmt nur den Zustand beim Start, nicht das Verhalten beim späteren Navigieren zu einer Notiz.

## Navigation

Klick auf eine Notiz öffnet sie im Hauptbereich. Klick auf eine Kategorie klappt sie auf/zu. Aktionen für Notizen, Hauptkategorien und Unterkategorien werden ausschließlich über das gemeinsame Kontextmenü erreicht: per Rechtsklick, `Shift+F10` oder Kontextmenütaste. Drei-Punkte-Schaltflächen neben den Einträgen werden bewusst nicht angezeigt, damit die Sidebar ruhig und platzsparend bleibt.

## Suche

Ein einziges Suchfeld oberhalb des Baums durchsucht das **gesamte Wiki** per echter Volltextsuche (Titel, Inhalt und Schlagworte, über die gebündelte FlexSearch-Instanz) und zeigt die Treffer als eigenständiges Dropdown (Titel, Kategorie, Schlagworte, Textausschnitt) — sie filtert nicht den sichtbaren Baum selbst. Diese Suche ist bewusst getrennt von der editor-internen Suche (CodeMirror-Suche innerhalb der gerade offenen Notiz): Die Sidebar-Suche durchsucht immer das gesamte Wiki, die Editor-Suche immer nur die aktuell geöffnete Notiz. Es gibt bewusst nur diesen einen, einheitlichen Such-Mechanismus für das gesamte Wiki, keinen zweiten, parallelen.

## Aktionsmenü

Notizen, Hauptkategorien und Unterkategorien besitzen kein separates Drei-Punkte-Menü. Das vorhandene HTML-Kontextmenü ist die einzige Aktionsoberfläche für Umbenennen, Icon-Wechsel und Verschieben in den Papierkorb. Dadurch existiert keine doppelte Bedienlogik und die volle Zeilenbreite bleibt für Titel und Kategorienamen verfügbar.

Die Bedienwege sind gleichwertig:

- Maus: Rechtsklick auf den Eintrag
- Tastatur: fokussierten Eintrag mit `Shift+F10` oder der Kontextmenütaste öffnen
- Innerhalb des Menüs: Pfeiltasten, Home/End, Enter und Escape

Reine Erstellen-Schaltflächen wie „Neue Kategorie“, „Neue Unterkategorie“ und „Neue Notiz“ besitzen kein Kontextmenü; sie werden regulär mit Klick, Enter oder Leertaste ausgelöst.

## Drag & Drop

Jede Zeile (Hauptkategorie, Unterkategorie, Notiz) bekommt bei Hover einen Ziehgriff (⠿-Symbol), über den sich der Eintrag umsortieren oder in eine andere Kategorie verschieben lässt. Der Griff ist permanent im DOM vorhanden, aber nur bei Mausüberfahrt sichtbar — kein separater Modus muss dafür aktiviert werden. Ein Verschieben löst eine Toast-Benachrichtigung mit Rückgängig-Möglichkeit aus.

## Speicherverhalten

Ein-/Ausklapp-Zustand von Kategorien, Sidebar-Breite und Sidebar-Einklapp-Zustand werden pro Projekt gespeichert, nicht app-weit.

## Sidebar-Breite

Frei verstellbar zwischen 220px und 480px, Standardwert 292px. Doppelklick auf den Ziehgriff setzt die Breite auf den Standardwert zurück; ein Rechtsklick-Kontextmenü bietet denselben Reset ebenfalls an.

## Einklappen

Die Sidebar lässt sich vollständig einklappen. Ihr Verhalten unterscheidet sich je nach Fensterbreite (siehe `02_DESIGN_GUIDELINES.md`, Umbruchpunkt 900px): Oberhalb davon gibt die eingeklappte Sidebar den Platz tatsächlich frei (der Hauptbereich rückt nach); unterhalb davon verhält sich die (dann nicht dauerhaft eingeklappte, sondern situativ geöffnete) Sidebar als Overlay über dem Inhalt.

## Icons

Kategorien und einzelne Notizen können ein thematisches Icon aus der kuratierten SVG-Icon-Bibliothek erhalten; der Auswahldialog besitzt eine eigene Suche. Funktionale Navigations- und Aktionsicons dürfen ebenfalls aus den bestehenden zentralen SVG-Systemen stammen. Vorhandene Icons werden wiederverwendet und innerhalb eines funktionalen Bereichs visuell konsistent gehalten; eine neue parallele Icon-Bibliothek wird nicht eingeführt. Bewusst eingesetzte Unicode-Symbole oder Text bleiben in ihrem bestehenden Kontext zulässig.

## Hover

Ziehgriffe erscheinen ausschließlich bei Hover (Opacity-Übergang, 150ms). Ansonsten folgt die Sidebar denselben allgemeinen Hover-Regeln wie der Rest der Anwendung (Farbwechsel, keine Bewegung, kein Schatten).

## Designregeln

Die Sidebar verwendet dieselben Farb-, Abstands- und Rundungswerte wie der Rest der Anwendung (siehe `02_DESIGN_GUIDELINES.md`) — keine eigene, abweichende Optik.

## Regeln für zukünftige Änderungen

- Es darf zu keinem Zeitpunkt zwei parallele Such-/Filter-Mechanismen für dieselbe Aufgabe (Navigation im Wiki finden) gleichzeitig geben — bewusste, bestätigte Entscheidung. Eine Erweiterung der Suche geschieht am bestehenden, einen Mechanismus, nicht durch einen zusätzlichen, zweiten.
- Verschiebe-/Umsortier-Funktionalität bleibt an den Hover-Ziehgriff gebunden, nicht an einen wiederkehrenden, permanenten Bearbeitungsmodus-Knopf.

## Bewusst verworfene Ideen

- **Ein eigener, aktivierbarer "Bearbeitungsmodus"-Knopf** für Sidebar-Umsortierung wurde entfernt und durch die bei Hover erscheinenden Ziehgriffe ersetzt, die permanent (aber unauffällig) an jeder Zeile verfügbar sind — kein zusätzlicher Zustand, den man erst aktivieren muss.
- **Ein reiner, direkter Baum-Filter** (der bei Eingabe unpassende Zeilen im sichtbaren Baum ausblendet) wurde zugunsten der einheitlichen Header-Suche mit Ergebnis-Dropdown verworfen. Zwei parallele Mechanismen für dieselbe Aufgabe (etwas im Wiki finden) wurden als weniger übersichtlich bewertet als ein einziger, vollständiger Weg.
