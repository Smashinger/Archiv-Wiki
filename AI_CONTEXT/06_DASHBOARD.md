# Archiv-Wiki — Dashboard

## Ziel

Das Dashboard ist die Startseite der Anwendung und beantwortet auf einen Blick drei Fragen: Wie viel Wissen ist hier gesammelt? Woran habe ich zuletzt gearbeitet? Was brauche ich gerade häufig (angeheftete Notizen)? Es ist bewusst keine reine Auflistung, sondern ein knapper, persönlicher Überblick.

## Aufbau

Das Dashboard besteht aus vier Bereichen in vom Nutzer bestimmbarer Reihenfolge: Statistik-Kacheln, angeheftete Notizen, zuletzt bearbeitete Notizen, alle Notizen. Jeder Bereich kann einzeln ein-/ausgeblendet werden. Ist keine einzige Notiz im Projekt vorhanden, ersetzt ein Leerzustand mit klarer Handlungsaufforderung ("+ Thema" anlegen, dann "+ Notiz" darin) sämtliche Bereiche.

## Bereiche im Einzelnen

- **Statistik-Kacheln:** Anzahl Notizen insgesamt, diese Woche bearbeitete Seiten, Anzahl Kategorien, Anzahl verwendeter Schlagworte. Classic fasst die Wochenaktivität zusätzlich in einer Begrüßungs-Unterzeile zusammen; Design2 zeigt sie ausschließlich einmal in seiner kompakten Statistikzeile. Der vorhandene „Weiterarbeiten“-Knopf öffnet die zuletzt bearbeitete Notiz. **Grundregel:** Jede Statistik wird ausschließlich aus bereits vorhandenen Frontmatter-Daten (Titel, Datum, Kategorie, Schlagworte) berechnet — es gibt keine separate Erfassung oder Speicherung eigens für die Statistik.
- **Angeheftete Notizen:** Notizen, die der Nutzer explizit markiert hat, in einer wählbaren Anzahl (5/10/20, Standard 5). Diese Mengenwahl gilt ausschließlich für Classic; Design2 stellt denselben Bereich als „Schnellzugriff" mit fester Obergrenze von vier Plätzen dar (siehe „Schnellzugriff (Design2)" unten).
- **Zuletzt bearbeitet:** Nach Änderungsdatum sortiert, in einer wählbaren Anzahl (4/10/20, Standard 4). Bis zu 4 Einträgen passt sich die Höhe dem tatsächlichen Inhalt an, darüber wird fest gescrollt.
- **Alle Notizen:** Alphabetisch nach sichtbarem Titel sortiert (`localeCompare`, stabile Übersicht — bewusst NICHT dieselbe Sortierung wie „Zuletzt bearbeitet"), in einer wählbaren Anzahl (5/10/20, Standard 10), mit absolutem statt relativem Datum. Design2 benennt diese reale Reihenfolge im Abschnittskopf als „Sortiert nach Titel"; der Hinweis ist reiner Text, es gibt kein Sortiermenü und keine alternative Reihenfolge.

Die aktiven Dashboard-Listen ("Angeheftete Notizen", "Zuletzt bearbeitet", "Alle Notizen") blenden archivierte Notizen aus; archivierte Notizen erscheinen ausschließlich auf der eigenen Archiv-Seite (siehe `12_KNOWN_DECISIONS.md`, Abschnitt „Archivierung").

Im aktivierten Mehrfachauswahlmodus (siehe `07_SIDEBAR.md`, Abschnitt „Mehrfachauswahl") zeigen die Dashboard-Zeilen zusätzlich eine Checkbox und tragen denselben zentralen, sitzungslokalen Auswahlzustand wie Sidebar und Archiv-Seite. Die normale Zeilennavigation (Öffnen der Notiz per Klick) bleibt davon unverändert; ein Klick auf die Checkbox selbst öffnet die Notiz nicht.

## Schnellzugriff (Design2)

Unter Design2 erscheint der Bereich „Angeheftete Notizen" ausschließlich als **Schnellzugriff** in der Dashboard-internen Randspalte, in der festen Reihenfolge Eingang → Schnellzugriff → Häufige Tags. Der frühere Streifen in der Hauptspalte entfällt dort, damit dieselbe Notiz nicht doppelt dargestellt wird. Classic behält seinen bisherigen Pinned-Bereich und sein bisheriges Layout unverändert.

- **Datenquelle:** ausschließlich das vorhandene `frontmatter.pinned` über `buildDashboardViewModel().pinnedAll` — bereits archivgefiltert und nach Änderungsdatum sortiert. Es gibt kein zweites Favoritenmodell, keine zweite Sammlung und keine zusätzliche Persistenz.
- **Obergrenze:** höchstens vier Plätze. Weitere angeheftete Notizen bleiben vollständig erhalten und erscheinen weiterhin nach Classic-Verhalten; sie werden nur nicht als zusätzlicher Design2-Platz dargestellt.
- **Sichtbarkeit:** gesteuert vom vorhandenen Ein/Aus-Zustand des Bereichs „Angepinnte Notizen" — kein eigener Konfigurationswert. Ist der Bereich deaktiviert, entfällt die Karte vollständig und `Strg+1–4` öffnet nichts.
- **Gespeicherte Werte:** `dashboardPinnedCount` (5/10/20) bleibt unverändert erhalten und gilt weiterhin für Classic. Die gespeicherte Bereichsreihenfolge bleibt ebenfalls unangetastet.
- **Einstellungsdialog:** unter Design2 zeigt derselbe gemeinsame Dialog statt der dort wirkungslosen Mengenwahl einen kurzen Hinweis (höchstens vier Plätze, Ein/Aus über den Bereichsschalter) und deaktiviert die Positionspfeile dieses einen Bereichs mit Begründung. Classic behält Mengenwahl und Pfeile unverändert.

### Tastenkürzel `Strg+1–4`

Öffnen die Schnellzugriff-Plätze 1–4 über den bestehenden zentralen Tastaturweg und dieselbe Navigation wie jede andere Dashboard-Zeile. Sie sind ein **zentraler Design2-Schnellzugriff** und greifen auf jeder geeigneten App-Route (Dashboard, Archiv, Tags, Wissenspflege, Eingang-Liste, offene Notiz, weitere nichtmodale Ansichten) — nicht nur auf der Startseite und unabhängig davon, ob das Dashboard zuvor gerendert wurde. Sie greifen ausschließlich, wenn Design2 aktiv ist, ein Projekt geöffnet ist, der Bereich aktiviert ist und der Platz tatsächlich existiert. Sie sind blockiert bei aktiver App-Sperre, geöffnetem Dialog/Menü/Overlay/Such-Dropdown/Filterpanel, Fokus in `input`/`textarea`/`select`/CodeMirror/`contenteditable` sowie bei zusätzlich gedrücktem Umschalt oder Alt. Die Ziele werden bei jedem Tastendruck frisch aus `state.tree` und der Projektkonfiguration über dieselbe `buildDashboardViewModel().pinnedAll`-Auswahl abgeleitet, die auch die sichtbare Karte füllt — es gibt keine gehaltene Zielliste und keinen zweiten Auswahlweg. Eine inzwischen entpinnte, archivierte, verschobene oder gelöschte Notiz fällt dadurch automatisch aus den Zielen und führt still zu keiner Aktion statt zu einer Navigation ins Leere. Unter Classic existieren die Kürzel nicht; die zentrale Tastenkürzelübersicht blendet sie dort entsprechend aus.

## Informationsarchitektur

Die Reihenfolge der vier Bereiche wird pro Projekt gespeichert. Beim Laden wird die gespeicherte Reihenfolge mit den tatsächlich existierenden Bereichen zusammengeführt: ein neuer, künftig hinzugekommener Bereich wird für bestehende Nutzer automatisch ergänzt (nicht vergessen, nur weil er beim letzten Speichern noch nicht existierte); ein gespeicherter, aber nicht mehr existierender Bereich wird stillschweigend herausgefiltert, statt als wirkungsloser Eintrag stehen zu bleiben.

## Bedienung

- Ein Sperr-/Entsperr-Symbol steuert, ob die Reihenfolge der Bereiche und ihre Ein-/Aus-Zustände verändert werden können — im gesperrten Zustand sind die Umsortier-Pfeile deaktiviert.
- Umsortierung erfolgt über Pfeile (rauf/runter) in einem eigenen Einstellungsdialog, nicht per Ziehen mit der Maus.
- Ein kleines Hinweis-Symbol im Kopfbereich zeigt bei Klick einen zufällig gewählten, kurzen Tipp zur Bedienung der Anwendung.


## Dashboard-Tipps

Das Tipp-Symbol bleibt ein kleines, unaufdringliches Bedienelement im Dashboard-Kopfbereich. Es ist auch bei einem vollständig leeren Wiki sichtbar, sofern der Nutzer das Symbol nicht über die Dashboard-Einstellungen ausgeblendet hat. Die Hilfe bleibt damit bereits vor der ersten Notiz erreichbar, ohne einen neuen Dashboard-Bereich oder ein automatisches Popup einzuführen.

### Tipp-Kategorien

Die feste lokale Tipp-Sammlung verwendet drei kleine Kategorien innerhalb derselben bestehenden Liste:

- **Erste Schritte:** einmalige Grundlagen für Nutzer, die den Tipp-Status des Projekts noch nicht durchlaufen haben. Dazu gehören erste Notiz, Kontextmenü, Suche und Tastenkürzelübersicht. Ein Eintrag wird nach seiner Anzeige projektbezogen als gesehen gespeichert und danach nicht erneut als Erste-Schritte-Tipp angeboten.
- **Allgemeine Tipps:** zeitlose Bedienhinweise. Sie werden in Zyklen ohne Wiederholung ausgespielt; erst wenn alle aktuell geeigneten Einträge eines Zyklus gezeigt wurden, wird ein neuer Zyklus aufgebaut.
- **Neue Funktionen:** eine kleine versionsbezogene Registrierung. Ein ausdrücklich für eine App-Version eingetragener Hinweis wird pro Projekt und Version höchstens einmal gezeigt. Derzeit ist kein konkreter Versionshinweis freigegeben; die Registrierung bleibt deshalb leer, statt eine neue Funktion zu behaupten.

Die Speicherung verwendet ausschließlich die bestehende projektbezogene `.wiki-config.json` über `fs.setProjectSetting`. Es gibt keine Datenbank, keine Cloud-Speicherung, keinen neuen IPC-Kanal und keine zweite Tipp-Engine.

### Inhalte und Prioritäten

Die Sammlung enthält aktuell **14 feste lokale Tipps**:

**Erste Schritte / hohe Priorität**

1. „Erstelle zuerst ein Thema und darin deine erste Notiz.“
2. „Weitere Aktionen für Notizen und Kategorien findest du per Rechtsklick, Umschalt+F10 oder Kontextmenütaste.“
3. „Mit Strg+K springst du im Hauptfenster direkt zur Suche.“
4. „Mit ? öffnest du im Hauptfenster die Übersicht aller Tastenkürzel.“

**Allgemein / hohe Priorität**

5. „Du kannst Notizen mit [[doppelten eckigen Klammern]] direkt miteinander verlinken.“

**Allgemein / mittlere Priorität**

6. „Bilder lassen sich direkt per Ziehen-und-Ablegen in eine Notiz einfügen.“
7. „Angepinnte Notizen sind auf dem Dashboard schnell erreichbar — ideal für Notizen, die du oft brauchst.“
8. „Backups richtest du in den Einstellungen ein und kannst sie dort jederzeit manuell starten.“
9. „Gelöschte Notizen landen zuerst im Papierkorb und können dort wiederhergestellt werden.“
10. „Der Fokus-Modus in der Editor-Werkzeugleiste blendet die Sidebar aus und schafft mehr Platz für konzentriertes Schreiben und Lesen.“
11. „Eigene Notiz-Vorlagen lassen sich speichern und für neue Notizen wiederverwenden.“

**Allgemein / niedrige Priorität**

12. „Über das Zahnrad kannst du die Bereiche des Dashboards ein- oder ausblenden und neu anordnen.“
13. „Schlagworte helfen dir, Notizen unabhängig von Kategorien gemeinsam wiederzufinden.“
14. „Über die Einstellungen lässt sich eine eigene Akzentfarbe wählen — auch als Zufallsfarbe per Klick.“

### Ausspielung

- Zuerst werden noch nicht gesehene, aktuell relevante Erste-Schritte-Tipps in der festgelegten Reihenfolge angeboten.
- Danach würde ein freigegebener Neue-Funktionen-Tipp der laufenden App-Version einmalig erscheinen.
- Der erste allgemeine Zyklus ordnet die Einträge nach den drei Prioritätsstufen; innerhalb einer Stufe wird zufällig gemischt.
- Nach dem ersten vollständigen Zyklus werden alle aktuell geeigneten allgemeinen Tipps gemeinsam zufällig gemischt.
- Innerhalb eines Zyklus erscheint kein Tipp doppelt. Erst nach Abschluss des Zyklus können allgemeine Tipps erneut vorkommen.

### Kontextbezogene Hinweise

Nur eindeutig aus bereits vorhandenen Projektdaten ableitbare Bedingungen werden berücksichtigt:

- Der Hinweis zur ersten Notiz ist nur bei einem leeren Wiki relevant.
- Der Backup-Hinweis wird nur angeboten, solange kein Backup-Ordner konfiguriert ist.
- Der Tag-Hinweis wird nur angeboten, solange noch keine Schlagworte verwendet werden.
- Der Vorlagen-Hinweis wird nur angeboten, solange keine eigene Vorlage gespeichert ist.

Eine Nutzung des Kontextmenüs oder Fokus-Modus wird nicht zusätzlich verfolgt, weil dafür bisher kein vorhandener, verlässlicher Projektzustand existiert. Es wurde bewusst kein neues Nutzungs-Tracking eingeführt.


### Tastenkürzel-Hinweis und Hilfe-Symbol

- Der Erste-Schritte-Tipp verweist eindeutig auf die bestehende gemeinsame Tastenkürzelübersicht: „Mit ? öffnest du im Hauptfenster die Übersicht aller Tastenkürzel.“
- Das vorhandene Tipp-Symbol im Dashboard bleibt unverändert positioniert und öffnet weiterhin ausschließlich die Dashboard-Tipps. Tooltip und `aria-label` lauten einheitlich „Tipp zur Bedienung anzeigen“.
- Das Tipp-Symbol besitzt einen klaren `:focus-visible`-Zustand mit den vorhandenen Designvariablen und bleibt vollständig per Tastatur bedienbar.
- Die Tastenkürzelübersicht selbst wird nicht im Dashboard dupliziert; der Dashboard-Tipp verweist auf denselben zentralen Dialog, der auch über `?`, Einstellungen und das vorhandene Hilfe-Menü erreichbar ist.

### Bestätigte Prüfungen

- JavaScript-Syntax der geänderten Dashboard-Datei ist gültig.
- Alle 14 Tipp-IDs und Texte sind eindeutig.
- Die vier Erste-Schritte-Tipps werden einmalig und ohne Wiederholung angeboten.
- Im ersten allgemeinen Zyklus stehen hohe vor mittleren und niedrigen Prioritäten.
- Innerhalb des ersten und eines folgenden allgemeinen Zyklus tritt kein Tipp doppelt auf.
- Backup-, Tag- und Vorlagenhinweise werden bei eindeutig nicht mehr passendem Projektzustand herausgefiltert.
- Tipp-Status wird projektbezogen über die bestehende Konfigurationsspeicherung geschrieben.
- Die frühere direkte Zufallsauswahl pro Klick ist entfernt; Tipp-Symbol, Sprechblase, Position und Schließverhalten bleiben bestehen.
- Tooltip, `aria-label` und Tastaturfokus des Tipp-Symbols sind eindeutig und verwenden den bestehenden Focus-Visible-Standard.
- Der Tastenkürzel-Tipp verweist auf die zentrale, nicht duplizierte Tastenkürzelübersicht.

Ein vollständiger visueller Electron-Test bei unterschiedlichen Fenstergrößen muss weiterhin lokal durchgeführt werden.

## Designregeln

Karten/Kacheln des Dashboards folgen exakt dem allgemeinen Karten-Muster aus `02_DESIGN_GUIDELINES.md` (Hintergrund, Rahmen, Rundung `--radius-md`, Hover als reiner Farbwechsel) — das Dashboard führt keine eigene, abweichende Kartenoptik.

## Zukünftige Regeln für Änderungen

- Ein neuer Dashboard-Bereich wird in `DEFAULT_DASHBOARD_SECTIONS` ergänzt; die bestehende Zusammenführungs-Logik (siehe Informationsarchitektur) sorgt automatisch dafür, dass er bei bestehenden Nutzern erscheint, ohne gespeicherte Reihenfolgen zu zerstören.
- Wird ein Bereich künftig entfernt, wird derselbe Filter-Mechanismus verwendet, der bereits einen entfernten Bereich sauber aus gespeicherten, älteren Konfigurationen herausnimmt — kein manueller Migrationsschritt für bestehende Projekte nötig.
- Jede neue Statistik-Kennzahl wird aus bereits vorhandenen Notiz-Daten abgeleitet, nicht durch eine neue, eigene Datenerfassung.
- Asynchron ladende Bereiche berücksichtigen die bestehende "Generation"-Absicherung (ein Zähler, der verhindert, dass ein veralteter, noch laufender Ladevorgang seine Ergebnisse in eine inzwischen neu aufgebaute Ansicht schreibt) — ein neuer, asynchron nachladender Bereich folgt demselben Muster.

## Bewusst verworfene Konzepte

**Tipps als eigener Dashboard-Bereich mit fester Position.** Tipps waren früher eine eigene Zeile innerhalb der Dashboard-Reihenfolge, wie die anderen vier Bereiche. Das wurde bewusst verworfen zugunsten eines kleinen, unauffälligen Symbols im Kopfbereich: Ein Tipp ist inhaltlich keine Nutzerdaten-Ansicht wie die übrigen Bereiche, und es gibt keine sinnvolle Präferenz dafür, ob er "über" oder "unter" den eigenen Notizen erscheinen soll. Tipps werden weiterhin aus einer festen, lokalen Liste zufällig gezogen — kein externer Abruf, kein zusätzlicher Wartungsaufwand.

## Geplante Erweiterungsmöglichkeiten

Die Architektur ist bewusst so gebaut, dass ein zusätzlicher, fünfter (oder weiterer) Bereich sich einreiht, ohne bestehende, gespeicherte Nutzer-Reihenfolgen zu brechen (siehe "Zukünftige Regeln für Änderungen"). Es gibt aktuell keine konkret geplante, neue Bereichs-Art — die Erweiterbarkeit ist ein architektonisches Merkmal, keine Ankündigung einer bestimmten, kommenden Funktion.
