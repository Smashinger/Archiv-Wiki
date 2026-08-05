# Archiv-Wiki — Einstellungsfenster

## Ziel

Ein einziger, zentraler Ort für alle projektbezogenen Einstellungen — übersichtlich nach Themen sortiert, ohne dass der Nutzer suchen muss, in welchem Menü eine bestimmte Option versteckt sein könnte.

## Aufbau

Ein Overlay (kein separates Betriebssystem-Fenster) mit Kopfzeile, linker Navigationsleiste und Inhaltsbereich rechts daneben. Die Navigation listet alle sechs Abschnitte als einfache Knopfleiste; ein Klick wechselt den Inhaltsbereich, ohne das Overlay neu zu öffnen.

## Kategorien (Abschnitte)

1. **Allgemein** — Wiki-Name, Speicherort (mit Verschieben-Möglichkeit), Verhalten beim Programmstart (Kategorien auf-/zugeklappt), Verhalten beim Schließen über den X-Knopf (immer nachfragen / in den Tray minimieren / vollständig beenden) sowie ein direkter Einstieg in die vorhandene Tastenkürzelübersicht.
2. **Darstellung** — Akzentfarbe, Sidebar-Größe, Fokus-Modus (an/aus), Lesemodus (optimale Lesebreite an/aus).

### Fokus-Modus in den Einstellungen

- Der Aktivierungsschalter spiegelt ausschließlich den zentralen `body.focus-mode`-Zustand.
- Ohne geöffnete Notiz ist der Schalter deaktiviert und kann keinen Fokus-Modus vortäuschen.
- Beim automatischen Beenden auf einer Route ohne Editor wird ein geöffnetes Einstellungsfenster unmittelbar synchronisiert.
- Die Intensitätsstufe bleibt unabhängig davon projektbezogen speicherbar; der aktive Ein/Aus-Zustand bleibt ein nicht gespeicherter Sitzungszustand.
- Die vier Intensitätsstufen bilden eine beschriftete Button-Gruppe; genau eine Schaltfläche ist sichtbar und semantisch über `aria-pressed` ausgewählt. Die Auswahl bleibt mit der bestehenden Speicherung synchron.
- Das Ein- oder Ausschalten im Einstellungsfenster behält den Fokus im Dialog; nur die Toolbar-Aktion führt den Fokus zurück in den Schreibbereich.
- Die sichtbare Bezeichnung lautet überall verbindlich „Fokus-Modus“. Ältere Bezeichnungen werden weder in Einstellungen, Tooltips noch Tastenkürzeltexten verwendet.
- Die vier Intensitätsstufen bleiben Leicht, Mittel, Stark und Sehr stark. Ihre Auswahl verändert nur die Dimmung der umgebenden Oberfläche; Editor-, Split- und Vorschau-Layout bleiben unverändert.
3. **Editor** — Schriftgröße, Auto-Save-Intervall, Tab-Größe, Rechtschreibprüfung (siehe `08_EDITOR.md` für Details).
4. **Backup** — Backup-Ordner, automatisches Backup, letzter Erfolg, letzter Fehler, Aufräumhinweise, manuelles Backup und kurze Anleitung zur manuellen Wiederherstellung.
5. **Updates** — installierte und neueste verfügbare Version, letzte Prüfung, Status, sowie Verhalten (automatische Prüfung beim Start, automatischer Download, Rückfrage vor Herunterladen, Rückfrage vor Neustart).
6. **Sicherheit** — App-Passwortschutz (setzen/ändern).

## Bedienung

Jede Änderung wird **sofort** gespeichert — es gibt keinen gesonderten "Speichern"-Knopf und keine Bestätigung, die erst am Ende des Besuchs im Einstellungsfenster ausgelöst wird. Wo eine Einstellung sich unmittelbar auf das Erscheinungsbild oder Verhalten auswirkt (z. B. Akzentfarbe, Rechtschreibprüfung), wird sie sofort live angewendet, ohne dass ein Neustart der Anwendung nötig ist.


## Tastenkürzelübersicht

- Unter **Allgemein → Hilfe → Tastenkürzel** öffnet die Schaltfläche „Übersicht öffnen“ dieselbe zentrale Tastenkürzelübersicht wie das globale `?`-Kürzel.
- Es existiert weiterhin genau eine Dialogfunktion für die Übersicht (`showShortcutsCheatsheet()`); das Einstellungsfenster erhält lediglich einen Rückruf auf diese bestehende Funktion und erzeugt weder eigenen Inhalt noch einen zweiten Dialog.
- Das bereits vorhandene Anwendungsmenü **Hilfe** enthält zusätzlich den Eintrag „Tastenkürzel“ und öffnet über den bestehenden Main→Preload→Renderer-Weg denselben Dialog.
- Wird die Übersicht aus den Einstellungen geöffnet, bleibt das Einstellungsfenster als übergeordneter Dialog bestehen. Nach dem Schließen kehrt der Fokus zum Auslöser in den Einstellungen zurück.
- Die vorhandenen Gruppen und Tastenkombinationen bleiben unverändert: Allgemein, Notiz & Editor sowie In der Suche.
- Die Übersicht bleibt auch direkt über `?` im Hauptfenster erreichbar; es wurden keine neuen Tastenkombinationen eingeführt.

### Bestätigte Prüfungen

- Alle drei Einstiegspunkte (`?`, Einstellungen und Hilfe-Menü) führen zur selben zentralen Dialogfunktion.
- Es existiert keine zweite Tastenkürzelübersicht und keine duplizierte Inhaltsliste.
- JavaScript-Syntax von Main, Preload, Haupt-Renderer und Einstellungsfenster ist gültig.
- Escape, Fokusfalle und Fokus-Rückgabe werden weiterhin von der bestehenden gemeinsamen Dialogbasis übernommen.

## Speicherverhalten

Jede Änderung geht als kleiner, gezielter Patch an die zentrale Projekt-Konfiguration (Deep-Merge — ein Patch wie eine geänderte Tab-Größe lässt alle anderen, nicht betroffenen Werte unangetastet). Das Ergebnis fließt über einen einzigen, zentralen Rückruf zurück ins Hauptfenster, der dort alle notwendigen, sofort wirksamen Aktualisierungen anstößt. Es gibt keinen zweiten, separaten Mechanismus für "Einstellungen, die sofort wirken sollen" — jede neue, live wirksame Einstellung nutzt denselben, bestehenden Rückruf.

## Design

Das Einstellungsfenster folgt vollständig dem allgemeinen Designsystem (`02_DESIGN_GUIDELINES.md`) — keine eigene, abweichende Optik für Eingabefelder, Knöpfe oder Abstände. Erklärende Hinweistexte unterhalb einer Einstellung werden im bestehenden, einheitlichen Hinweistext-Stil dargestellt, nicht als Tooltip oder Popup.

## Update-Lifecycle

- Die intern installierte Version stammt ausschließlich aus `package.json` beziehungsweise im gebauten Programm aus `app.getVersion()`. Ordner- oder ZIP-Namen sind keine Versionsquelle. Versionsänderungen erfolgen ausschließlich über `npm version patch|minor|major` im Release-Workflow.
- Alle Einstiegspunkte für eine Update-Prüfung teilen im Main-Prozess dieselbe laufende Promise. Während eine technische Prüfung aktiv ist, wird keine zweite `checkForUpdates()`-Anfrage gestartet.
- Automatische und manuelle Downloads verwenden dieselbe zentrale Download-Funktion und dieselbe Sperre. Ein zweiter Download ist während eines laufenden Downloads, bei einem bereits installationsbereiten Update oder während der Installation nicht zulässig.
- Die Installation wird nur nach ausdrücklichem Nutzerklick gestartet. Der IPC-Rückgabewert bestätigt ausschließlich, dass der Installations-/Neustartvorgang gestartet wurde (`started`), nicht dass die Installation bereits erfolgreich abgeschlossen ist.
- Für Linux-AppImage mit `electron-updater` 6.8.9 wird `quitAndInstall(false, true)` verwendet. Vorher werden laufende Backup-/Sync-Arbeiten nach dem bestehenden Beenden-Ablauf berücksichtigt und der Single-Instance-Lock unmittelbar vor dem Updater-Neustart freigegeben. Es gibt keinen zusätzlichen parallelen `app.relaunch()`-Pfad.
- Prüfungs-, Download- und Installationsfehler werden im Main-Prozess getrennt behandelt. Ein fehlgeschlagener Vorgang darf keinen dauerhaft widersprüchlichen Laufzeitstatus hinterlassen.
- Der Main-Prozess führt ein einziges gemeinsames Update-Statusobjekt mit den Phasen `idle`, `checking`, `upToDate`, `updateAvailable`, `downloading`, `downloaded`, `installing`, `error` und `unavailable`. `app.getVersion()` bleibt die einzige Quelle der installierten Version.
- Sidebar, Einstellungsfenster, Update-Toast und Wizard laden denselben vollständigen Status über eine zentrale Abfrage und reagieren auf ein gemeinsames Ereignis `update:statusChanged`. Es existiert keine zweite Renderer-Statusverwaltung.
- Eine fehlgeschlagene oder noch nie erfolgte Prüfung wird niemals als „Auf dem neuesten Stand“ dargestellt. `lastUpdateCheckAt` wird ausschließlich nach einer erfolgreichen technischen Prüfung zentral aktualisiert.
- Ein bereits heruntergeladenes Update bleibt im Status `downloaded` erhalten, auch wenn der Toast geschlossen wurde. Weniger wichtige Zustände wie eine neue Prüfung dürfen diesen Zustand nicht überschreiben.
- Typische Netzwerk-, HTTP-, Download-, Integritäts-, Berechtigungs- und Installationsfehler werden zentral im Main-Prozess in kurze deutsche Hauptmeldungen übersetzt. Technische Originaldetails bleiben optional einsehbar, werden aber nicht als Hauptmeldung verwendet.
- Der Update-Toast bleibt nicht-modal und übernimmt beim Erscheinen keinen Fokus. Er verwendet eine passende Status-/Fehlersemantik, eine zugängliche Fortschrittsanzeige mit begrenztem Prozentwert und klar erkennbare `:focus-visible`-Zustände. Escape schließt den Toast, außer während der Phase `installing`.
- Ein heruntergeladenes Update bleibt nach dem Schließen des Toasts über Sidebar und Update-Einstellungen erreichbar. Alle Neustartaktionen verwenden denselben zentralen Installations-IPC und dieselbe Installationssperre.
- Nach dem Klick auf „Jetzt neu starten“ bleibt der Zustand `installing` sichtbar; der Auslöser wird sofort deaktiviert und die Oberfläche behauptet nicht vorzeitig, das Update sei bereits installiert.
- Die Einstellung „Vor jedem Download nachfragen“ hat Vorrang vor dem automatischen Herunterladen. Dieser Zusammenhang wird im Einstellungsfenster ausdrücklich erklärt, ohne die bestehende Logik zu verändern.

## Bekannte Einschränkung des bereitgestellten Quellstands

Der aktuell für diese Phase bereitgestellte Projektstand enthält in `package.json` die Version `1.8.0`, während der bestätigte veröffentlichte GitHub-Stand `v1.13.0` ist. Der bereitgestellte ZIP-Stand enthält keine Git-Metadaten und keine erzeugten Build-Metadaten, daher lässt sich der lokale Git-Checkout des Nutzers daraus nicht verifizieren. Vor dem nächsten Release muss die Versionsnummer ausschließlich über den festgelegten `npm version`-Workflow auf die vorgesehene Zielversion gesetzt werden; sie wird nicht manuell im Quelltext korrigiert.

## Regeln

- Eine neue Einstellung wird immer dem inhaltlich passenden, bestehenden Abschnitt zugeordnet — es wird kein neuer Abschnitt allein für eine einzelne, kleine Option eröffnet.
- Jede Einstellung speichert sofort bei Änderung, nicht gesammelt bei Verlassen des Fensters.
- Ein erklärender Hinweistext wird ergänzt, wenn die Wirkung einer Einstellung nicht bereits aus ihrer Beschriftung eindeutig hervorgeht (z. B. was ein bestimmter Zahlenwert konkret bedeutet).
- Veraltete Hinweistexte, die sich auf inzwischen geändertes oder entferntes Verhalten beziehen, werden korrigiert, sobald sie auffallen — ein Hinweistext beschreibt immer den tatsächlichen, aktuellen Zustand.

## Spätere Erweiterungen

Die Abschnitts-Navigation ist bewusst als offene Liste aufgebaut — ein siebter Abschnitt ließe sich ergänzen, ohne die bestehende Struktur umzubauen. Es gibt aktuell keinen konkret geplanten, zusätzlichen Abschnitt; die Erweiterbarkeit ist ein architektonisches Merkmal, keine Ankündigung.


## Technischer Abschlussstand 2.0.0 – WebDAV

- Der aktuelle App-Stand ist `2.0.0`. Die installierte Version wird weiterhin ausschließlich aus `package.json` beziehungsweise `app.getVersion()` bezogen.
- Die WebDAV-Synchronisierung wurde vom Nutzer im realen Betrieb getestet und als zuverlässig bestätigt. Diese Dokumentation behauptet keine darüber hinausgehenden automatisierten oder in dieser Umgebung ausgeführten End-to-End-Tests.
- WebDAV-Downloads werden seit dem technischen Abschluss zunächst vollständig geladen und anschließend über die gemeinsame atomare Schreibstrategie übernommen. Bei einem Schreibfehler bleibt eine vorhandene lokale Datei unangetastet.
- Bekannte Einschränkung: Ein erneuter automatisierter WebDAV-Test konnte in der isolierten Build-Umgebung nicht durchgeführt werden; der bestätigte reale Nutzer-Test bleibt maßgeblich.
