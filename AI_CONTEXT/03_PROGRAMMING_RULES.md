# Archiv-Wiki — Programmierregeln

Diese Regeln gelten für jede Änderung am Code, unabhängig davon, ob sie von einem Menschen oder einem KI-Modell vorgenommen wird. Sie sind verbindlich, nicht optional.

## Architektur respektieren

- Die bestehende Drei-Schichten-Trennung (Hauptprozess, Preload, Renderer) wird nicht umgangen. Neue Funktionalität, die Dateisystem- oder Systemzugriff braucht, bekommt einen neuen IPC-Kanal nach dem bestehenden Namensschema (`<bereich>:<aktion>`) — niemals direkten Node-Zugriff im Renderer.
- Das Sicherheitsmodell (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`) wird niemals aufgeweicht, auch nicht vorübergehend oder für einen Einzelfall.
- Bestehende Module werden entsprechend ihrer bisherigen Verantwortung erweitert, nicht durch parallele, neue Module mit überlappendem Zweck ersetzt.

## Bestehende Komponenten und Services verwenden

- Vor dem Schreiben neuer Funktionalität wird geprüft, ob eine bestehende Komponente, Funktion oder Hilfsfunktion bereits denselben oder einen sehr ähnlichen Zweck erfüllt. Wiederverwendung hat Vorrang vor Neubau.
- Gemeinsam genutzte Logik (z. B. Pfad-Aufbau, Formatierung, Validierung) lebt an genau einer Stelle. Zwei Funktionen, die denselben Sachverhalt auf unterschiedliche Weise berechnen, sind ein Zeichen für nötige Konsolidierung, nicht für zulässige Vielfalt.
- Keine doppelten Funktionen mit demselben oder nahezu demselben Zweck unter verschiedenen Namen.

## Designsystem verbindlich verwenden

- Farben, Rundungen, Übergangszeiten und Schriftarten werden ausschließlich über die bestehenden CSS-Variablen referenziert, niemals als neue, hartkodierte Werte.
- Keine neuen Farben einführen, solange eine bestehende Variable denselben Zweck erfüllen kann. Eine neue Farbe entsteht nur, wenn tatsächlich eine neue, dauerhafte Bedeutung im Designsystem entsteht — nicht als bequeme Lösung für einen Einzelfall.
- Neue Übergänge verwenden den bestehenden Standardwert, statt eine neue Zeit zu erfinden.
- CSS-Änderungen für einen spezifischen Bereich werden auf diesen Bereich beschränkt (spezifischer Vorfahren-Selektor). Allgemeine, app-weit verwendete Klassen werden nicht verändert, um eine lokale Anpassung zu erreichen.

## Keine Quick Fixes

- Ein sichtbares Problem wird an seiner strukturellen Ursache behoben, nicht durch eine isolierte, lokale Korrektur (z. B. ein einzelnes zusätzliches `margin` oder eine feste Positionierung an nur einer Stelle), die das zugrunde liegende Muster unangetastet lässt.
- Betrifft ein Problem mehrere, gleichartige Elemente, wird die gemeinsame Regel korrigiert, nicht jedes betroffene Element einzeln.
- Eine Korrektur, die nur den aktuell sichtbaren Einzelfall behebt, aber dieselbe Fehlerursache an vergleichbarer Stelle unberührt lässt, gilt nicht als abgeschlossen.

## Einstellungen

- Projektbezogene Einstellungen werden ausschließlich in der Projekt-Konfigurationsdatei gespeichert, niemals in einer separaten, app-weiten Ablage oder einer lokal zwischengespeicherten Kopie.
- Eine Einstellung wird beim Lesen immer direkt aus der aktuellen, einzigen Quelle gelesen — nie aus einer Kopie, die veralten könnte, ohne dass ein sichtbarer Fehler entsteht.
- Soll eine Einstellung ohne Neustart oder erneutes Öffnen sofort wirken, wird sie über den bestehenden, zentralen Konfigurationsänderungs-Mechanismus angebunden, nicht über einen neuen, separaten Weg.
- Betrifft eine Einstellung mehrere technisch unabhängige, aber inhaltlich zusammengehörige Wirkungen, müssen alle davon betroffenen Stellen gemeinsam berücksichtigt werden, nicht nur die naheliegendste.

## Performance

- Aktionen, die bei jedem Tastendruck ausgelöst werden könnten, aber nicht bei jedem einzelnen ausgelöst werden müssen, werden entprellt — nach demselben, bestehenden Entprellungs-Muster, nicht durch ein neu erfundenes Verfahren.
- Bei umfangreichen Inhalten wird bevorzugt nur der sichtbare/relevante Ausschnitt verarbeitet, nicht grundsätzlich das gesamte Dokument, wo eine Beschränkung auf den sichtbaren Bereich möglich ist.
- Eine Änderung, die spürbar langsamer wird, wird nicht als abgeschlossen betrachtet, nur weil sie funktional korrekt ist.

## Markdown- und Inhaltsverarbeitung

- Neue Markdown-Syntax mit eigener Bedeutung wird über eine Platzhalter-Technik vor dem eigentlichen Parsen geschützt und danach wieder eingesetzt, nicht durch direkte Umkonfiguration der Markdown-Bibliothek.
- Für Inhalte, die im normalen Dokumentfluss bleiben sollen, wird reguläre Markdown-Syntax mit Attributen bevorzugt gegenüber rohem, eingebettetem HTML, wenn beide denselben Zweck erfüllen können.

## Atomare Schreibvorgänge

- Bestehende Notizen, `.wiki-config.json`, `app-state.json` und über WebDAV heruntergeladene Dateien werden nicht direkt überschrieben. Kritische Schreibpfade verwenden die gemeinsame Main-Prozess-Hilfe `main/atomic-write.js`.
- Die temporäre Datei liegt immer im selben Zielordner. Erst nach vollständig abgeschlossenem Schreiben und `fsync` ersetzt ein atomarer Rename die Zieldatei.
- Scheitert Schreiben oder Übernahme, wird die temporäre Datei bestmöglich entfernt und die bisherige Zieldatei bleibt unangetastet. Bestehende Dateirechte werden nach Möglichkeit übernommen.
- Dateiformate, Dateinamen, Pfadvalidierung und bestehende Fehlerwege bleiben dabei unverändert.

## Build-Prozess

- Änderungen am gebündelten Editor-Quellcode werden erst nach einem erneuten Build wirksam. Eine Änderung ohne anschließenden Build gilt nicht als angewendet.

## Dokumentation im Code

- Kommentare erklären, **warum** eine Entscheidung getroffen wurde, nicht nur, was der Code tut — insbesondere bei nicht offensichtlichen Lösungen.
- Funktionen und Module tragen eine kurze Beschreibung ihrer Verantwortung, wenn diese nicht bereits aus dem Namen eindeutig hervorgeht.

## Verifikation vor Abschluss

- Eine Änderung gilt erst als abgeschlossen, wenn ihr tatsächliches Verhalten in einer echten, laufenden Instanz der Anwendung nachgewiesen wurde — reines Lesen des Codes oder plausible Herleitung reichen nicht aus.
- Eine Korrektur wird auch auf unbeabsichtigte Nebenwirkungen an benachbarter, bereits funktionierender Funktionalität geprüft, nicht nur auf das ursprünglich behobene Verhalten selbst.

## Arbeitsweise

Bei größeren Änderungen gilt grundsätzlich:

1. Analyse des bestehenden Bereichs
2. Gemeinsame Entscheidung mit dem Nutzer
3. Umsetzung
4. Test
5. Dokumentation in AI_CONTEXT
6. Release
