# Archiv-Wiki — Web Clipper

Diese Datei ist die kanonische technische Quelle für die Web-Clipper-Architektur und Browserintegration von Archiv-Wiki. Sie beschreibt den aktuellen Hauptquellstand, keine Entwicklungs- oder Store-Chronik.

## Zuständigkeit

- `16_WEB_CLIPPER.md` beschreibt Extension, Datenvertrag, lokalen Transport, Browseridentitäten und Distribution.
- `09_SETTINGS.md` beschreibt Einstellungen und den sichtbaren UI-Zustand.
- `04_RELEASE_WORKFLOW.md` beschreibt den vollständigen Packaging- und Release-Ablauf.
- `12_KNOWN_DECISIONS.md` enthält übergreifende Entscheidungen sowie das Eingang-Datenmodell und die Herkunftsmetadaten neuer Notizen.
- `00_PROJECT_STATUS.md` enthält den aktuellen Projektstatus.

## Aufgabe und Datenfluss

Der Web Clipper sammelt ausdrücklich ausgewählte Inhalte aus einem unterstützten Browser und übergibt sie lokal an die laufende Archiv-Wiki-Anwendung. Dort werden sie zunächst im Eingang des geöffneten Projekts gespeichert.

```text
Browser-Erweiterung
→ Browser Native Messaging
→ Native-Messaging-Host
→ lokaler IPC-Socket
→ Archiv-Wiki-Main-Prozess
→ Eingang des geöffneten Projekts
→ spätere, separate Verarbeitung zu einer normalen Notiz
```

Die Komponenten besitzen getrennte Zuständigkeiten:

- `extension/popup.*` bietet die Sammelart an und zeigt die Rückmeldung des Clip-Vorgangs.
- `extension/content-script.js` liest nach einer bewussten Aktion die Textauswahl, den sichtbaren Seitentext oder die Position eines gezielt ausgewählten Bildes.
- `extension/background.js` steuert die Erfassung der aktuellen HTTP-/HTTPS-Seite und bereitet den Clip vor.
- `extension/webclip-contract.js` validiert und normalisiert den gemeinsamen Clip-Datenvertrag.
- `extension/archiv-wiki-bridge.js` übergibt den Clip an den Native-Messaging-Host `de.smashii.archivwiki.webclip`.
- `extension/native-host/native-host.js` übersetzt das Browser-stdio-Protokoll in das lokale Socket-Protokoll; der Host speichert selbst keine Projektdaten.
- `main/webclip-receiver.js` nimmt die lokale Socket-Verbindung an und übergibt validierte Nutzdaten an `main/incoming-store.js`.
- `main/incoming-store.js` ist die einzige persistente Speichergrenze für den Eingang.
- `main/webclip-distribution.js` prüft die signierte CRX und bereitet den vorhandenen Brave-Flatpak-Distributionsweg vor.

Der Transport implementiert keinen HTTP-Server und keinen Cloud-Endpunkt.

## Gemeinsame Extension-Codebasis

Firefox und Chromium/Brave verwenden dieselbe Extension-Codebasis. Browserunterschiede werden innerhalb dieser Architektur behandelt, insbesondere durch `browser`-/`chrome`-API-Kompatibilität sowie die gemeinsamen Manifestangaben für Firefox-Background-Skripte und den Chromium-Service-Worker. Eine zweite unabhängig entwickelte Extension-Implementierung ist nicht vorgesehen.

Das gemeinsame Manifest verwendet:

- Manifest V3
- Web-Clipper-Version `0.2.0`
- Chromium-ID `dengpgfllpkndkgkbikigaejieogndbp`
- Firefox-Gecko-ID `webclip@archiv-wiki.smashii.de`
- Native-Messaging-Host `de.smashii.archivwiki.webclip`
- `"incognito": "not_allowed"`

Die Web-Clipper-Version und die Archiv-Wiki-App-Version sind getrennte Versionsbereiche und müssen nicht übereinstimmen. Die Chromium-ID wird aus dem öffentlichen Manifest-Schlüssel und der signierten CRX abgeleitet; eine neue ID wird nicht zur Laufzeit erzeugt.

## Sammelarten

| Modus | Technisches Verhalten |
| --- | --- |
| `url` | Speichert Seitentitel und normalisierte HTTP-/HTTPS-URL, ohne Seiteninhalt. |
| `selection` | Speichert Seitentitel, URL und die vom Nutzer markierte Textauswahl. Eine leere Auswahl wird abgewiesen. |
| `page` | Speichert Seitentitel, URL und den über `innerText` ermittelten sichtbaren Seitentext. HTML, Styles, Bilder und DOM-Snapshots werden nicht als Seiteninhalt übernommen. |
| `images` | Lässt den Nutzer genau ein sichtbares Bild auswählen, erfasst dessen sichtbaren Bildausschnitt als PNG und übernimmt Seitentitel, Seiten-URL sowie eine vorhandene Bild-URL. |

Es werden nur normale HTTP-/HTTPS-Seiten akzeptiert. Der Bilder-Modus sammelt nicht automatisch mehrere Bilder und erlaubt den Abbruch der Auswahl mit Escape.

Der gemeinsame Nachrichtenrahmen ist auf 10 MiB begrenzt. Textinhalt darf höchstens 9 MiB umfassen; ein erfasster PNG-Bildclip höchstens 6 MiB. Diese Grenzen werden vor beziehungsweise während der lokalen Speicherung erneut geprüft.

## Eingang als Ziel

Ein empfangener Clip wird als projektbezogener Eingang-Eintrag gespeichert. Der Eingang bleibt ein eigener Systembereich außerhalb des normalen Notizbestands; die Browser-Erweiterung schreibt keine Notizdatei direkt.

Die Verarbeitung zu einer normalen Notiz ist ein späterer, ausdrücklich ausgelöster Schritt innerhalb von Archiv-Wiki. Die dabei erhaltenen Herkunftsmetadaten und die Regel, den Eingang erst nach erfolgreicher und verifizierter Speicherung zu entfernen, sind in `12_KNOWN_DECISIONS.md` dokumentiert.

## Lokaler Transport und Erreichbarkeit

Die Extension sendet genau eine Native-Messaging-Nachricht mit Protokollversion `1`, Typ `webclip` und dem validierten Clip als Nutzdaten. Der Browser startet den registrierten Native Host. Dieser leitet die Nachricht über einen lokalen IPC-Endpunkt an den laufenden Archiv-Wiki-Main-Prozess weiter:

- unter Unix über einen benutzerbezogenen Unix-Domain-Socket in `XDG_RUNTIME_DIR`, ersatzweise im temporären Systemordner;
- unter Windows über eine benutzerbezogene Named Pipe.

Der Unix-Socket erhält nach dem Start nach Möglichkeit Modus `0600`. Der Receiver läuft nur, solange Archiv-Wiki geöffnet ist. Zusätzlich muss ein Archiv-Wiki-Projekt geöffnet sein, weil ausschließlich dessen Eingang als Ziel verwendet wird.

Fehlt die Native-Host-Registrierung, ist Archiv-Wiki nicht geöffnet, antwortet die Anwendung nicht innerhalb von zehn Sekunden oder ist kein Projekt geöffnet, wird kein Eingang erzeugt. Die Extension erhält eine entsprechende Fehlerantwort und bietet keinen alternativen Cloud- oder Browser-Speicherpfad an.

## Native-Host-Registrierung

`extension/native-host/install-native-host.sh` erzeugt Browser-Manifeste für denselben Hostnamen und beschränkt den Zugriff auf die festen Extension-IDs:

- Chromium-Manifeste verwenden `allowed_origins` mit der aktiven Chromium-ID.
- Das Firefox-Manifest verwendet `allowed_extensions` mit der Gecko-ID.

Im Entwicklungsmodus verwendet der Host das lokal verfügbare Node.js. Erkannte normale Chromium-Installationen erhalten benutzerbezogene Native-Messaging-Manifeste. Für ein erkanntes Brave-Flatpak legt der Installer zusätzlich einen Wrapper innerhalb des Flatpak-Benutzerbereichs an, der den Host über `flatpak-spawn --host` startet und die erforderliche benutzerbezogene Flatpak-Berechtigung setzt. Im AppImage-Modus führt dieser Wrapper zum stabil vorbereiteten AppImage-Host; nur der Entwicklungsmodus verwendet dafür Node.js und den Projektquellstand.

## Firefox

Firefox-Unterstützung ist technisch in der gemeinsamen Extension vorhanden: Manifest V3, Gecko-ID, Native Messaging und die Sperre privater Fenster sind implementiert. Der Native-Host-Installer registriert normal installiertes Firefox unter dem benutzerbezogenen Mozilla-Pfad.

Firefox als Flatpak wird vom vorhandenen Installer bewusst nicht eingerichtet. Im Einstellungsfenster ist der Firefox-Installationsknopf derzeit deaktiviert und mit „Firefox (folgt)“ bezeichnet. Dieser UI-Zustand ist vom technischen Extension-Support zu unterscheiden.

Ein öffentlicher AMO-Status wird aus dem lokalen Quellstand nicht abgeleitet und bleibt außerhalb dieser technischen Dokumentation.

## Chromium und Brave

Für normal installierte Chromium-basierte Browser kennt der Native-Host-Installer benutzerbezogene Manifestpfade für Chromium, Google Chrome, Brave und Vivaldi. Daraus folgt kein gemeinsamer automatischer Installationsweg der Extension für alle diese Browser.

Die aktive Schaltfläche „Brave / Chromium“ in den Einstellungen ruft tatsächlich den Linux-spezifischen Brave-Flatpak-Weg in `main/webclip-distribution.js` auf. Dieser Weg:

- verlangt den vorhandenen Brave-Flatpak-Benutzerbereich `com.brave.Browser`;
- prüft die mitgelieferte signierte CRX vor der Vorbereitung;
- kopiert sie atomar in einen stabilen Pfad innerhalb des Brave-Flatpak-Datenbereichs;
- schreibt dort benutzerbezogen eine `External Extensions`-Registrierung für die feste Chromium-ID und Version `0.2.0`;
- benötigt weder Root-Rechte noch Chromium-Entwicklermodus;
- erfordert anschließend einen vollständigen Brave-Neustart.

Die Vorbereitung wird ausdrücklich vom Nutzer in den Einstellungen ausgelöst; ein normaler App-Start installiert die Erweiterung nicht automatisch. Entfernt der Nutzer die externe Erweiterung bewusst, wird der daraus entstehende Brave-Blockierungszustand weder umgangen noch zurückgesetzt. Eine erneute automatische Installation derselben ID wird nicht erzwungen.

Die UI-Bezeichnung „Brave / Chromium“ darf daher nicht als Zusage verstanden werden, dass dieser Installationsknopf jeden Chromium-basierten Browser unterstützt. Der aktuell implementierte UI-Distributionsweg ist auf Brave als Linux-Flatpak zugeschnitten.

## AppImage-Rolle

Das AppImage enthält als Web-Clipper-Ressourcen den Native Host, den Installer, den lokalen Transportcode und die signierte Chromium-CRX. `main/webclip-transport.js` wird zusätzlich aus `app.asar` entpackt, damit der externe Host ihn als echte Runtime-Datei laden kann.

Beim Start einer verpackten Linux-AppImage-Ausführung mit gültigem absolutem `APPIMAGE`-Pfad führt Archiv-Wiki den Installer im AppImage-Modus aus. Dieser kopiert Host- und Transportdateien in einen stabilen benutzerbezogenen XDG-Datenpfad und erzeugt einen Wrapper, der genau das aktuelle AppImage mit `ELECTRON_RUN_AS_NODE=1` als Native Host startet. Anschließend werden die Native-Messaging-Manifeste für normal installiertes Firefox und die bekannten normalen Chromium-Profilpfade auf diesen stabilen Wrapper ausgerichtet.

Ist Brave als Flatpak installiert, erzeugt derselbe AppImage-Start zusätzlich im Brave-Flatpak-Benutzerbereich das Native-Messaging-Manifest und einen Sandbox-Wrapper. Dieser verwendet `flatpak-spawn --host`, um den bereits vorbereiteten stabilen AppImage-Host auf dem Hostsystem zu starten; eine lokale Node.js-Installation oder ein Projektquellstand werden dafür nicht benötigt. Die erforderliche benutzerbezogene Berechtigung für `org.freedesktop.Flatpak` wird dabei eingerichtet. Dieser automatische Schritt bereitet ausschließlich Native Messaging vor und installiert die Browser-Erweiterung nicht.

Ein entpackter `linux-unpacked`-Build wird nicht dauerhaft registriert. Ein Fehler bei der AppImage-Host-Vorbereitung wird protokolliert, verhindert aber nicht den normalen Start von Archiv-Wiki. Die Extension selbst wird durch diese Startvorbereitung nicht automatisch installiert.

## Signierte Chromium-CRX

Die aktive signierte Chromium-CRX liegt im Entwicklungsbaum unter:

`extension/distribution/chromium/archiv-wiki-web-clipper.crx`

Sie gehört zur festen Chromium-ID `dengpgfllpkndkgkbikigaejieogndbp` und zur Web-Clipper-Version `0.2.0`. Im gepackten AppImage-Ressourcenbereich liegt sie unter `web-clipper/chromium/archiv-wiki-web-clipper.crx`.

Der öffentliche Manifest-Schlüssel dient der stabilen ID-Zuordnung. Der private Signierschlüssel gehört weder in das Repository noch in das App-Paket, AI_CONTEXT oder ein öffentliches Release-Artefakt. Zur Laufzeit wird ausschließlich die bereits signierte CRX benötigt.

## Release-Schutz

`npm run dist` und `npm run release` führen vor `electron-builder` automatisch `build/verify-webclip-crx.mjs` aus. Die Prüfung muss fehlschlagen und damit Build beziehungsweise Release stoppen, wenn die CRX fehlt, nicht lesbar oder beschädigt ist, keine gültige CRX3-Struktur besitzt, einer anderen signierten beziehungsweise aus dem Manifest-Schlüssel abgeleiteten ID zugeordnet ist oder nicht Version `0.2.0` enthält.

`electron-builder` paketiert die geprüfte CRX als `extraResource`. Der vollständige Release-Ablauf und seine manuellen Prüfungen stehen in `04_RELEASE_WORKFLOW.md`.

## Privacy- und Sicherheitsgrenzen

- Ein Clip beginnt nur durch eine bewusste Nutzeraktion im Extension-Popup; der Content Script wird über `activeTab` und `scripting` für den konkreten Vorgang injiziert.
- Das Manifest besitzt keine dauerhaften `host_permissions`. Native Messaging ist der einzige implementierte Übergabekanal zur Desktop-Anwendung.
- Private Firefox-Fenster und Inkognito-Fenster Chromium-basierter Browser sind durch `"incognito": "not_allowed"` gesperrt.
- Der Native Host besitzt keinen eigenen Speicherpfad für Clips und keinen direkten Projektzugriff; persistiert wird ausschließlich über den laufenden Archiv-Wiki-Receiver in den lokalen Eingang.
- Private Signierschlüssel sind keine Projekt- oder Laufzeitressource.

## CRX-Pfadauflösung nach Laufart

Der Main-Prozess übergibt den tatsächlichen Zustand `app.isPackaged` an `main/webclip-distribution.js`. In der gepackten Anwendung wird die CRX ausschließlich unter `process.resourcesPath/web-clipper/chromium/archiv-wiki-web-clipper.crx` aufgelöst. Im ungepackten Entwicklungsstart leitet das Distributionsmodul den Projektpfad aus seinem eigenen Modulkontext ab und verwendet `extension/distribution/chromium/archiv-wiki-web-clipper.crx`.

Beide Laufarten übergeben den jeweils aufgelösten Pfad an dieselbe CRX-Prüfung. Format, feste Chromium-ID und Web-Clipper-Version werden daher auch im Entwicklungsmodus vollständig validiert. Der gepackte Endnutzerweg besitzt keinen Fallback auf Dateien außerhalb des App-Pakets.
