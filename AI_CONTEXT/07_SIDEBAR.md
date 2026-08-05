# Archiv-Wiki — Sidebar

## Ziel

Die Sidebar ist der primäre Navigationsweg durch das gesamte Wiki: Kategorie-Baum, schnelle Volltextsuche, Umsortieren und Verschieben von Einträgen. Sie soll auch bei vielen Kategorien und Notizen übersichtlich bleiben, ohne dass der Nutzer zur Bedienung eigens in einen speziellen "Bearbeitungsmodus" wechseln muss.

## Aufbau

Zwei-Ebenen-Baum: Hauptkategorien, darunter Unterkategorien, darunter Notizen. Ganz oben ein Link zum Dashboard, darunter das Suchfeld, darunter der eigentliche Baum. Am unteren Rand der Sidebar sitzt der Ziehgriff zur Breitenänderung.

## Kategorien und Unterkategorien

- Eine Notiz liegt immer innerhalb einer Unterkategorie, eine Unterkategorie immer innerhalb einer Hauptkategorie — keine tiefere Verschachtelung.
- Hauptkategorien und Unterkategorien lassen sich einzeln ein-/ausklappen; der Zustand wird gemerkt.
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

Kategorien und einzelne Notizen können ein Icon aus der kuratierten SVG-Icon-Bibliothek erhalten (thematische Auswahl, mit eigener Such-Funktion innerhalb des Auswahldialogs). Dies ist die einzige Stelle in der Anwendung, an der diese Icon-Bibliothek zum Einsatz kommt — siehe `02_DESIGN_GUIDELINES.md` zur Abgrenzung von funktionalen UI-Symbolen.

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
