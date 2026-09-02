# Archiv-Wiki — Einstellungsfenster

## Ziel

Ein einziger, zentraler Ort für die in der Anwendung verfügbaren Einstellungen — übersichtlich nach Themen sortiert, ohne dass der Nutzer suchen muss, in welchem Menü eine bestimmte Option versteckt sein könnte.

## Aufbau

Ein Overlay (kein separates Betriebssystem-Fenster), gestaltet wie ein eigenständiges Fenster: Radius 8 px, eigener Schatten, feste Größe 1180 × 660. Ein gemeinsamer Renderer (`renderer/js/settings-window.js`), dieselben sieben Abschnitte und dieselben Speicherpfade.

Der Aufbau ist ein Raster aus drei Zeilen (`grid-template-rows: 38px 46px 1fr`):

1. **Titelzeile, 38 px** — Zahnrad, Titel in Versalien, Schließen-Knopf. Bei einspaltigen Bereichen trägt der Titel den Bereichsnamen mit (`EINSTELLUNGEN · EDITOR`). Das ersetzt jede Überschrift im Arbeitsbereich; eine Überschrift, die dasselbe sagt wie die Titelzeile, wird nicht gesetzt.
2. **Reiterzeile, 46 px** — alle sieben Abschnitte als waagerechte Reiter (`SETTINGS_SECTIONS`), Reihenfolge unveränderlich. Ein Klick wechselt den Arbeitsbereich, ohne das Overlay neu zu öffnen. Rechts ein Suchfeld, das ausschließlich im Bereich Allgemein erscheint und dort die Zeilen des Bereichs filtert.
3. **Arbeitsbereich** — zweispaltig für Allgemein, Darstellung und Web Clipper; einspaltig für Editor, Backup, Updates und Sicherheit. Die Fenstergröße bleibt beim Reiterwechsel unverändert; einspaltige Bereiche zentrieren darin ihren 580-px-Block.

Das Fenster hat eine eigene, in sich geschlossene Formensprache mit dem Klassenpräfix `aws-` (`renderer/css/settings.css`) und einem eigenen Farbtokensatz (`renderer/css/archiv-wiki-tokens.css`). Es sieht in Classic und Design2 **identisch** aus — die Einstellung „Oberflächen-Design" wirkt auf das Einstellungsfenster nicht. Die Dialogbasis aus `renderer/js/dialog.js` (Escape, Fokusfalle, Fokus-Rückgabe, Hintergrund inert) wird unverändert weiterverwendet.

Die verbindliche Spezifikation für Maße, Farben und Anordnung ist `archiv-wiki-einstellungen.md` im Projektwurzelverzeichnis.

## Kategorien (Abschnitte)

1. **Allgemein** — Wiki-Name, Speicherort (mit Verschieben-Möglichkeit), Verhalten beim Programmstart (Kategorien auf-/zugeklappt), Verhalten beim Schließen über den X-Knopf (immer nachfragen / in den Tray minimieren / vollständig beenden), ein direkter Einstieg in die vorhandene Tastenkürzelübersicht, der Feedback-Bereich für Fragen, Ideen und Vorschläge über GitHub Discussions sowie der lokale Diagnosebereich.
2. **Darstellung** — Akzentfarbe, Hell/Dunkel-Modus, Sidebar-Größe, Oberflächen-Design (Classic/Design2), Lesemodus (optimale Lesebreite an/aus). Der Fokus-Modus ist eine reine Editor-Funktion (Werkzeugleisten-Schaltfläche und Tastenkürzel) und besitzt keinen eigenen Ein-/Aus-Schalter in den Einstellungen, siehe `08_EDITOR.md`. Details zum Oberflächen-Design-Umschalter stehen in `12_KNOWN_DECISIONS.md`.
3. **Editor** — Schriftgröße, Auto-Save-Intervall, Tab-Größe, Rechtschreibprüfung (siehe `08_EDITOR.md` für Details).
4. **Backup** — Backup-Ordner, automatisches Backup, letzter Erfolg, letzter Fehler, Aufräumhinweise, manuelles Backup und kurze Anleitung zur manuellen Wiederherstellung.
5. **Updates** — installierte und neueste verfügbare Version, letzte Prüfung, Status, lokal mitgelieferte Release Notes der aktuell installierten Version sowie Verhalten (automatische Prüfung beim Start, automatischer Download, Rückfrage vor Herunterladen, Rückfrage vor Neustart).
6. **Web Clipper** — Verbindungsstatus, Standard-Sammelmodus, Sichtbarkeit des Eingangs und vorhandene Installationswege der Browser-Erweiterung.
7. **Sicherheit** — App-Passwortschutz (Schalter plus Passwortzeile) sowie ein kurzer, rein informativer Datenschutz-Block.

## Web-Clipper-Einstellungen

- Der Bereich zeigt den Status des lokalen Archiv-Wiki-Empfängers, den aktuellen beziehungsweise zuletzt erkannten Browser-Kontakt und den Zeitpunkt des letzten empfangenen Clips in der laufenden Sitzung. Ein technischer Empfangsfehler wird als Statushinweis angezeigt.
- Der lokale Web-Clip-Empfänger ist nur verfügbar, solange Archiv-Wiki geöffnet ist. Die Browser-Kommunikation verwendet Native Messaging; eine separate manuelle Native-Host-Konfiguration wird im Einstellungsbereich nicht angeboten.
- Als Standard-Sammelmodus kann Markierter Text, Nur URL, Ganze Seite oder Bilder gewählt werden. Die Auswahl wird mit den Wiki-Einstellungen gespeichert.
- Der Schalter „Eingang in der Sidebar“ steuert ausschließlich die Sichtbarkeit des Eingang-Eintrags in der Sidebar. Vorhandene Eingänge und Clips werden beim Ausblenden nicht gelöscht.
- Die Schaltfläche „Installieren“ in der Zeile „Firefox“ öffnet die offizielle Mozilla-Add-ons-Seite des Archiv-Wiki Web Clippers im System-Browser. Archiv-Wiki muss für die anschließende lokale Übergabe von Clips geöffnet sein.
- Die Schaltfläche „Vorbereiten“ in der Zeile „Brave / Chromium“ stößt die Vorbereitung der mitgelieferten Erweiterung für Brave an. Sie benötigt weder Entwicklermodus noch Administratorrechte; anschließend muss Brave vollständig geschlossen und neu gestartet werden.
- „Firefox“ und „Brave / Chromium“ bleiben getrennte Installationswege. Der Firefox-Link richtet keine Firefox-Flatpak-Unterstützung ein; der Brave-/Chromium-Knopf bleibt auf den lokalen Brave-Flatpak-Weg zugeschnitten.
- Nach erfolgreicher Vorbereitung wird der erforderliche Neustart angezeigt. Eine frühere bewusste Entfernung der Erweiterung wird respektiert und nicht automatisch rückgängig gemacht.
- Läuft Brave als Flatpak, wird die dauerhafte Native-Messaging-Berechtigung (`org.freedesktop.Flatpak`) ausschließlich nach ausdrücklicher Zustimmung im Bestätigungsdialog gesetzt, nie automatisch beim App-Start. Ist sie erteilt, erscheint unter der Brave-Zeile die Textaktion „Native-Messaging-Berechtigung entfernen“ — sonst nicht. Sie ist der einzige Weg, eine erteilte Berechtigung wieder zurückzunehmen, und bleibt deshalb erhalten, obwohl `archiv-wiki-einstellungen.md` sie nicht aufführt.

## Bedienung

Jede Änderung wird **sofort** gespeichert — es gibt keinen gesonderten "Speichern"-Knopf und keine Bestätigung, die erst am Ende des Besuchs im Einstellungsfenster ausgelöst wird. Wo eine Einstellung sich unmittelbar auf das Erscheinungsbild oder Verhalten auswirkt (z. B. Akzentfarbe, Rechtschreibprüfung), wird sie sofort live angewendet, ohne dass ein Neustart der Anwendung nötig ist.


## Feedback

- Unter **Allgemein → Hilfe und Feedback** wird ausschließlich die Zeile **„Frage oder Vorschlag“** mit der Textaktion „Auf GitHub teilen“ angeboten. Die Aktion öffnet im Systembrowser die GitHub-Discussions-Übersicht des Repositories; dort dienen die Kategorien **Q&A** und **Ideas** als getrennte Bereiche für Fragen beziehungsweise Ideen und Vorschläge.
- Eine zusätzliche Bug-Meldung oder Weiterleitung zu GitHub Issues wird in den Allgemeinen Einstellungen bewusst nicht angeboten. Für Bugmeldungen genügt der bereits vorhandene Bug-Knopf in der oberen Leiste mit seinem vorbereiteten Bug-Report-Ablauf.
- Archiv-Wiki speichert oder sendet bei der Discussions-Aktion keine Wiki-Inhalte oder Feedbacktexte. Die eigentliche Eingabe und Veröffentlichung erfolgt erst auf GitHub durch den Nutzer.
- Die GitHub-Vorlagen erinnern daran, keine Passwörter, Tokens, privaten Notizinhalte oder andere vertrauliche Daten in öffentliches Feedback aufzunehmen.

## Diagnoseberichte

- Unter **Allgemein → Diagnose** kann der Nutzer vorhandene lokale Diagnoseberichte anzeigen und jederzeit manuell einen neuen Diagnosebericht erstellen.
- Automatische Berichte entstehen nur bei klaren technischen Fehlern: unbehandelte Main-/Renderer-Fehler, unerwartet beendete Renderer-Prozesse, schwerwiegende Ladefehler der Haupt- oder Einrichtungsoberfläche und fehlgeschlagene zentrale Modulregistrierungen. Normale Bedien-, Netzwerk-, Update- oder Backup-Fehler erzeugen nicht bei jedem Auftreten automatisch einen Bericht.
- Automatische Berichte bleiben über Neustarts erhalten. Nach einem noch nicht gemeldeten automatischen Bericht erscheint beim nächsten nutzbaren Hauptfenster einmalig ein dezenter Hinweis „Ein Diagnosebericht vom letzten Programmfehler ist verfügbar.“ mit „Anzeigen“. Kein modales Start-Popup wird erzwungen.
- Es werden höchstens die fünf neuesten Diagnoseberichte aufbewahrt; ältere werden automatisch entfernt. Manuell erstellte Berichte lösen keinen Start-Hinweis aus.
- Der vorhandene Bug-Melden-Dialog in der oberen Leiste bietet bei vorhandenem Bericht zusätzlich **„Diagnosebericht anzeigen“**. Der Bericht wird niemals automatisch an GitHub angehängt oder übertragen; der Nutzer kann ihn im Diagnose-Dialog über das Kopieren-Symbol selbst in die Zwischenablage übernehmen.
- Ein Bericht enthält ausschließlich technische Angaben wie Archiv-Wiki-Version, Betriebssystem, Architektur, Installationsart, Zeitpunkt, Fehlerart/-meldung und – sofern verfügbar – Stacktrace. Ein manueller Bericht ergänzt reduzierte technische Laufzeitstatus zu Updates, Backup, Synchronisierung und Web Clipper, ohne Projektpfade oder Inhalte zu übernehmen.
- Notizinhalte, Zugangsdaten, private URLs und persönliche absolute Pfade werden nicht gezielt erfasst. Vor dem Speichern werden bekannte App-/Projekt-/Benutzerpfade anonymisiert, sonstige absolute Pfade und URLs entfernt sowie typische Tokens, Passwörter, Benutzernamen, E-Mail-Adressen und IP-Adressen redigiert.
- Berichtdateien liegen ausschließlich lokal im app-eigenen Benutzerverzeichnis, nicht im Wiki-Projekt. Das Diagnoseverzeichnis wird mit restriktiven Dateirechten angelegt; es existiert keine Upload-, Telemetrie- oder automatische Übertragungsfunktion.

## Tastenkürzelübersicht

- Unter **Allgemein → Hilfe und Feedback → Tastenkürzel** öffnet die Textaktion „Übersicht öffnen“ dieselbe zentrale Tastenkürzelübersicht wie das globale `?`-Kürzel.
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

Projektbezogene Änderungen gehen als kleine, gezielte Patches an die zentrale Projekt-Konfiguration (Deep-Merge — ein Patch wie eine geänderte Tab-Größe lässt alle anderen, nicht betroffenen Werte unangetastet). Das Ergebnis fließt über einen einzigen, zentralen Rückruf zurück ins Hauptfenster, der dort alle notwendigen, sofort wirksamen Aktualisierungen anstößt. App-weite Einstellungen wie Update- und Schließverhalten verwenden ihre dafür vorgesehenen zentralen Zustände und Schnittstellen. Es gibt keine parallelen Speicherungskopien für live wirksame Einstellungen.

## Design

Das Einstellungsfenster hat eine eigene, in sich geschlossene Formensprache — es ist der einzige Bereich, der bewusst nicht dem allgemeinen Designsystem (`02_DESIGN_GUIDELINES.md`) folgt, sondern `archiv-wiki-einstellungen.md`. Sie liegt vollständig in `renderer/css/settings.css` unter dem Präfix `aws-`; keine Regel aus `components.css` oder `design2.css` gestaltet das Fenster mit.

**Die Zeilenform** ist die wichtigste Regel des Fensters. Jede Einstellung ist gleich gebaut: eine feste Beschriftungsspalte (210 px zweispaltig, 200 px einspaltig), 20 px Abstand, dann das rechtsbündige Bedienelement. Der erklärende Hinweistext steht **unter der Beschriftung**, nie unter dem Feld — nur so bleibt die rechte Kante über alle Zeilen eine gerade Linie. Kein Feld läuft über die volle Breite. Abschnitte bestehen nur aus Marke und Linie, ohne Kasten oder Fläche.

**Fünf Bauformen mit fester Bedeutung** — Eingabefeld, Auswahlliste, Segmentleiste (2–3 kurze Möglichkeiten), Radiopunkt (4 und mehr), Schalter (nur Ein/Aus) — dazu zweitrangige Schaltfläche, Textaktion und Hauptaktion. Die Auswahlliste ist bewusst kein Systemdropdown: sie sieht aus wie das Eingabefeld daneben und klappt bei zu wenig Platz nach oben auf.

**Die Zustandszeile** in Backup und Updates ist die einzige Karte im ganzen Fenster; alles andere sind Zeilen. Ihre linke Kante ist amberfarben bei Handlungsbedarf und blau, wenn alles in Ordnung ist.

**Farben** kommen ausschließlich aus `renderer/css/archiv-wiki-tokens.css`. Beide Themes entstehen allein durch den Tausch des Variablensatzes; keine Komponente fragt das aktive Theme ab. Der Tokensatz ist bewusst auf die Fensterwurzel begrenzt und nicht auf `:root` gesetzt — `layout.css` referenziert mehrere dieser Namen bereits als Fallback für die globale Titelleiste.

Rosé bedeutet im ganzen Fenster dasselbe: der Mensch hat etwas gewählt. Blau bedeutet: die Anwendung meldet einen Zustand oder bietet den Weg nach draußen an. Genau eine blau gefüllte Hauptaktion existiert im ganzen Fenster („Jetzt sichern" im Bereich Backup).

## Release Notes in den Update-Einstellungen

- Unter **Updates** werden die Release Notes der aktuell installierten Archiv-Wiki-Version als kompakter Eintrag „Änderungen in Version vX.Y.Z“ angezeigt.
- Der Eintrag ist eine Textaktion („Änderungen in vX.Y.Z ansehen"), die einen darunterliegenden Textblock ein- und wieder ausblendet.
- Die Notes werden lokal mit der Anwendung ausgeliefert und benötigen keine Internetverbindung.
- Angezeigt werden ausschließlich Notes, deren hinterlegte Versionsnummer exakt mit `app.getVersion()` beziehungsweise dem zentralen Update-Status `currentVersion` übereinstimmt. Alte Notes dürfen niemals unter einer neuen Versionsnummer erscheinen.
- Wortlaut, Einleitung, Kategorien, Reihenfolge und Inhalt entsprechen 1:1 den Release Notes desselben GitHub-Releases; lediglich die visuelle Darstellung folgt dem Archiv-Wiki-Design.
- Der Auf-/Zu-Zustand wird während eines geöffneten Einstellungsfensters auch bei einem Update-Status-Refresh beibehalten, aber nicht dauerhaft gespeichert.
- Die vollständige historische Release-Liste bleibt auf GitHub; die In-App-Anzeige dient ausschließlich der aktuell installierten Version.

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

## Regeln

- Eine neue Einstellung wird immer dem inhaltlich passenden, bestehenden Abschnitt zugeordnet — es wird kein neuer Abschnitt allein für eine einzelne, kleine Option eröffnet.
- Jede Einstellung speichert sofort bei Änderung, nicht gesammelt bei Verlassen des Fensters.
- Ein erklärender Hinweistext wird ergänzt, wenn die Wirkung einer Einstellung nicht bereits aus ihrer Beschriftung eindeutig hervorgeht (z. B. was ein bestimmter Zahlenwert konkret bedeutet).
- Veraltete Hinweistexte, die sich auf inzwischen geändertes oder entferntes Verhalten beziehen, werden korrigiert, sobald sie auffallen — ein Hinweistext beschreibt immer den tatsächlichen, aktuellen Zustand.

## WebDAV-Synchronisierung

- WebDAV-Downloads werden zunächst vollständig geladen und anschließend über die gemeinsame atomare Schreibstrategie übernommen. Bei einem Schreibfehler bleibt eine vorhandene lokale Datei unangetastet.
