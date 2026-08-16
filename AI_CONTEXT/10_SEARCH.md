# Archiv-Wiki — Suchsystem

## Sidebar-Suche und globale Suche — ein einziges System

Es gibt bewusst **nur einen** Such-Mechanismus, keine zwei getrennten. Das Suchfeld sitzt oberhalb des Kategorie-Baums in der Sidebar, durchsucht aber immer das **gesamte Wiki** — die Bezeichnungen "Sidebar-Suche" und "globale Suche" beschreiben denselben, einen Mechanismus aus zwei Blickwinkeln (wo er bedient wird, und wie weit er reicht), nicht zwei verschiedene Funktionen. Ein früherer, zusätzlicher reiner Baum-Filter-Mechanismus wurde bewusst entfernt und nicht wieder eingeführt — zwei parallele Wege für dieselbe Aufgabe wurden als weniger übersichtlich bewertet.

Diese Suche ist bewusst getrennt von der editor-internen Suche (Finden innerhalb der gerade offenen Notiz, über die Editor-Bibliothek selbst): Die Sidebar-Suche durchsucht immer alle Notizen, die Editor-Suche immer nur die aktuell geöffnete.

## Suchlogik

- **Grundlage:** Ein einziger, vollständiger Volltextindex (FlexSearch) im Arbeitsspeicher, der Titel, Fließtext, Schlagworte und Kategorie jeder Notiz enthält.
- **Index-Aufbau:** Der Index wird komplett neu aufgebaut (nicht inkrementell aktualisiert) nach jeder relevanten Änderung — Projekt laden, Notiz anlegen, verschieben, löschen oder speichern. Bewusste Entscheidung: Für die realistische Notizmenge eines persönlichen Wikis ist ein vollständiger Neuaufbau schnell genug und deutlich einfacher/robuster als das Nachführen einzelner, inkrementeller Änderungen.
- **Zusätzlich zum reinen Index** werden die vollständigen Notiz-Dokumente im Speicher gehalten (nach Pfad), damit für die Ergebnis-Anzeige (Kategorie, Schlagworte, Textausschnitt) kein zweiter Abruf pro Tastenanschlag nötig ist.
- **Textausschnitt (Snippet):** Ein kurzer Ausschnitt um die erste Fundstelle herum, mit grob entfernter Markdown-Syntax (Sonderzeichen wie `#`/`*`/`_` werden entfernt, Links zeigen nur ihren sichtbaren Text) — bewusst einfach gehalten, keine perfekte Wiedergabe nötig. Findet sich der Suchbegriff nur im Titel, nicht im Fließtext, wird stattdessen der Anfang der Notiz gezeigt.
- **Symlinks** werden beim Aufbau des Index bewusst übersprungen (weder als Ordner noch als Datei behandelt) — verhindert Probleme mit kaputten oder zirkulären Verknüpfungen, bedeutet aber, dass über Symlinks eingebundene Inhalte nicht durchsucht werden.
- **Beschädigte Notizen** (z. B. fehlerhaftes Frontmatter) werden beim Index-Aufbau übersprungen, statt den gesamten Aufbau abzubrechen.

## Performance

Die Suche selbst arbeitet ausschließlich auf dem bereits fertig aufgebauten, im Speicher gehaltenen Index — eine einzelne Sucheingabe löst keinen Datei- oder Festplattenzugriff aus. Für die Notizmenge, für die Archiv-Wiki gedacht ist, ist ein vollständiger Index-Neuaufbau bei Datenänderungen ausreichend performant; eine feinere, inkrementelle Aktualisierung wurde bewusst nicht gebaut, da sie zusätzliche Komplexität ohne spürbaren Nutzen bedeuten würde.

## Bedienung

- Eingabe löst die Suche **sofort bei jedem Tastenanschlag** aus (kein Bestätigen mit Enter nötig), Ergebnisse erscheinen als Dropdown direkt unterhalb des Suchfelds.
- Jedes Ergebnis zeigt Titel (mit hervorgehobenem Treffer), Kategorie, Schlagworte und einen Textausschnitt (ebenfalls mit hervorgehobenem Treffer).
- Navigation zwischen Ergebnissen per Pfeiltasten hoch/runter, Öffnen des markierten Ergebnisses per Enter — genauso funktioniert ein Klick mit der Maus.
- Beim Öffnen eines Ergebnisses springt der Editor direkt zur ersten Fundstelle in der Notiz, nicht nur zum Anfang der Notiz.
- Ein Tastenkürzel fokussiert das Suchfeld von überall in der Anwendung aus.
- Leeren des Suchfelds schließt das Ergebnis-Dropdown — **außer** wenn mindestens ein Filter aktiv ist (dann bleibt die gefilterte Ergebnisliste sichtbar, siehe "Filter" unten) oder ein Suchverlauf vorhanden ist (dann erscheint dieser stattdessen, siehe "Suchverlauf" unten).

## Suchbereich (Scope)

Eine kompakte Auswahl unterhalb des Suchfelds (Alle / Titel / Inhalt / Tags / Kategorie, Alle ist Standard) schränkt EINE Suche gezielt auf ein Feld ein. Technisch mappt das nur auf das ohnehin vorhandene `index`-Argument von FlexSearchs `.search()` (die vier Felder aus dem Grundlagen-Abschnitt oben) — keine eigene Query-Syntax, kein zweiter Suchmechanismus. Der Scope wird beim Neustart der App nicht gemerkt (bewusst wie der übrige Suchzustand transient, siehe "Regeln").

## Filter

Ein kompakter "Filter"-Button neben dem Scope öffnet ein kleines Panel mit **Kategorie** (Einfachauswahl, da eine Notiz genau einen Kategoriepfad hat) und **Tags** (Mehrfachauswahl als anklickbare Chips). Beide Filter sind UND-verknüpft, ebenso mehrere gewählte Tags untereinander. Filter wirken **auch bei leerem Suchfeld** (z. B. leere Suche + Tag "Fedora" → alle Notizen mit diesem Tag) — dafür wird bei leerem Suchtext direkt über die im Speicher gehaltenen Dokumente iteriert statt über den FlexSearch-Index (der bei leerem Text grundsätzlich nichts liefert), kein zweiter Suchweg. Aktive Filter erscheinen als entfernbare Chips unterhalb des Suchfelds; ein "Filter zurücksetzen"-Button im Panel leert beide auf einmal. Es gibt bewusst **keinen Status-/Archiviert-Filter** — die Notiz hat aktuell kein Status-/Archiv-Konzept; das kommt erst mit Feature A (Archivierung).

## Suchverlauf

Die letzten bis zu 10 tatsächlich eingegebenen Suchbegriffe (keine reinen Filter-ohne-Text-Aktionen) werden projektbezogen über `setProjectSetting('searchHistory', …)` gespeichert — dasselbe Muster wie `sidebarWidth`/`dashboardSections`/`splitEditorWidth`, keine neue Speicherform, kein Cloud-Abgleich. Neueste zuerst, ein wiederholter Begriff erzeugt keinen zweiten Eintrag, sondern rückt an den Anfang. Beim Fokussieren eines leeren, filterlosen Suchfelds erscheint der Verlauf im selben Dropdown wie sonst die Treffer; ein Klick auf einen Eintrag führt die Suche erneut aus, "Verlauf löschen" leert die Liste.

## Design

Das Ergebnis-Dropdown folgt dem allgemeinen Karten-/Overlay-Erscheinungsbild (siehe `02_DESIGN_GUIDELINES.md`) — keine eigene, abweichende Optik. Der gefundene Suchbegriff wird innerhalb der Ergebnisse hervorgehoben, nicht der gesamte Treffer. Filter-Panel und Verlauf teilen sich denselben Anker-Bereich unterhalb von Suchfeld und Scope/Filter-Zeile (`.search-zone`) und schließen sich gegenseitig aus, statt sich zu überlappen.

## Regeln

- Es darf zu keinem Zeitpunkt einen zweiten, parallelen Such- oder Filter-Mechanismus für dieselbe Aufgabe (Notizen im Wiki finden) geben. Eine Erweiterung der Suche geschieht am bestehenden, einen Mechanismus.
- Der Suchindex bleibt eine reine Im-Speicher-Struktur, die nach Datenänderungen komplett neu aufgebaut wird — keine separate, persistente Index-Datei auf der Festplatte.
- Neue, durchsuchbare Eigenschaften einer Notiz (über Titel/Fließtext/Schlagworte/Kategorie hinaus) werden dem bestehenden Dokument-Objekt hinzugefügt, das dem Index beim Aufbau übergeben wird, nicht über einen separaten, zweiten Suchweg nachgerüstet.
- Scope und Filter bleiben reiner UI-Zustand im Speicher (wie das übrige Suchdropdown) und werden nicht projektbezogen gespeichert — nur der Suchverlauf ist bewusst persistent, weil er über App-Neustarts hinweg nützlich bleibt.
- Kein Status-/Archiviert-Filter, bevor Feature A (Archivierung) ein echtes Status-Konzept einführt.

## Spätere Erweiterungen

Die Architektur (ein zentraler Index, ein Dokument-Objekt pro Notiz) lässt weiterhin Raum für zusätzliche, durchsuchbare Eigenschaften, ohne den grundlegenden Aufbau zu verändern. Bewusst NICHT umgesetzt (kein aktueller Plan): Backlinks/Verweise auf eine Notiz, ähnliche-Inhalte-Vorschläge, automatische Link-Vorschläge, gespeicherte Suchen/Suchfavoriten, Regex- oder boolesche Suchsyntax, KI-gestützte Suche. Ein Archiv-Filter kommt erst mit Feature A.
## Suchergebnis-Icons

Suchergebnisse verwenden das vorhandene Notiz-Icon-System. Besitzt eine Notiz kein eigenes Icon, wird die vorhandene Bibliotheks-ID `docs/file-text` als SVG-Fallback gerendert. Fallback-IDs mit dem Format `kategorie/name` müssen dabei genauso wie reguläre Icon-Werte durch die zentrale `renderIconHtml()`-Funktion aufgelöst werden und dürfen niemals als sichtbarer Text im Ergebnis erscheinen.
