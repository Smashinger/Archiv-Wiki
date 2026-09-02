# Datenschutz – Archiv-Wiki Web Clipper

Stand: 9. August 2026

## Zweck

Der Archiv-Wiki Web Clipper hat einen einzigen Zweck: Inhalte, die der Nutzer bewusst auf einer Webseite auswählt beziehungsweise zum Sammeln bestimmt, an die lokal laufende Archiv-Wiki-Anwendung zu übergeben und dort im **Eingang** abzulegen.

Der Clipper sammelt nicht automatisch im Hintergrund. Die Verarbeitung beginnt erst, wenn der Nutzer das Erweiterungs-Popup öffnet, eine Sammelart wählt und den Clip auslöst. Im Bilder-Modus wählt der Nutzer anschließend genau ein sichtbares Bild auf der Seite aus.

## Verarbeitete Daten

Je nach gewählter Sammelart verarbeitet der Web Clipper:

| Sammelart | Verarbeitete Daten |
| --- | --- |
| Nur URL | Seitentitel, URL der aktuellen Seite, Clip-Modus, Erstellungszeitpunkt |
| Markierter Text | Seitentitel, URL der aktuellen Seite, bewusst markierter Text, Clip-Modus, Erstellungszeitpunkt |
| Ganze Seite | Seitentitel, URL der aktuellen Seite, sichtbarer Seitentext, Clip-Modus, Erstellungszeitpunkt |
| Bilder | ein bewusst ausgewählter sichtbarer Bildausschnitt als PNG, Dateiname, Seitentitel, Seiten-URL, Bild-URL falls vorhanden, Clip-Modus, Erstellungszeitpunkt |

Webseiteninhalte können abhängig von der vom Nutzer gewählten Seite personenbezogene, vertrauliche oder andere sensible Informationen enthalten. Der Web Clipper bewertet, klassifiziert oder analysiert diese Inhalte nicht. Er verarbeitet ausschließlich die Daten, die für den bewusst ausgelösten Clip erforderlich sind.

## Datenfluss und Übertragung

Der technische Datenfluss lautet:

```text
Browser-Erweiterung
        ↓
Native Messaging
        ↓
lokal laufendes Archiv-Wiki
        ↓
Eingang des geöffneten Projekts
```

Es findet technisch eine Datenübertragung aus der Browser-Erweiterung an die lokale Archiv-Wiki-Desktopanwendung statt. Diese lokale Übertragung ist erforderlich, damit der ausgewählte Clip im Archiv-Wiki Eingang gespeichert werden kann.

Die Browser-Erweiterung sendet Clip-Inhalte nicht an einen von Archiv-Wiki betriebenen Cloud-Dienst, Analyseanbieter oder Werbenetzwerk. Sie lädt keinen ausführbaren Code aus dem Internet nach.

Archiv-Wiki kann unabhängig vom Web Clipper optional mit einem vom Nutzer selbst eingerichteten WebDAV-Speicher synchronisieren. Eine solche spätere Synchronisierung richtet sich ausschließlich nach den Einstellungen der Archiv-Wiki-Desktopanwendung und ist nicht Bestandteil der Browser-Erweiterung oder ihrer lokalen Native-Messaging-Verbindung.

## Speicherung, Dauer und Löschung

Die Browser-Erweiterung besitzt keine `storage`-Berechtigung und speichert Clip-Inhalte nicht dauerhaft im Browser.

Die dauerhafte Speicherung erfolgt durch Archiv-Wiki im lokalen Eingang des geöffneten Projekts. Dort bleiben Einträge erhalten, bis der Nutzer sie in Archiv-Wiki verarbeitet oder löscht. Die Browser-Erweiterung führt keine zusätzliche Kopie und keine eigene Aufbewahrungsfrist.

## Keine weitere Nutzung

Der Web Clipper verwendet die verarbeiteten Daten nicht für:

- Telemetrie oder Nutzungsstatistiken,
- Tracking oder Profilbildung,
- Werbung oder personalisierte Werbung,
- allgemeine Inhaltsanalyse,
- KI-Verarbeitung,
- Verkauf von Nutzerdaten,
- Weitergabe an Datenhändler oder Werbenetzwerke.

Es ist kein Archiv-Wiki-Konto und keine Anmeldung erforderlich.

## Browser-Berechtigungen

Das Manifest verwendet:

- `activeTab` für den vorübergehenden Zugriff auf die aktuelle Seite nach einer bewussten Nutzeraktion,
- `scripting` zum Ausführen des enthaltenen Content-Codes für den konkret gestarteten Clip,
- `nativeMessaging` für die lokale Übergabe an die Archiv-Wiki-Desktopanwendung.

Nicht vorhanden sind dauerhafte `host_permissions` wie `<all_urls>` sowie Berechtigungen für Cookies, Verlaufverwaltung, Lesezeichen, Downloads, Identität oder Browser-Speicher.

## Store-Datenkategorien

### Firefox / AMO

- `browsingActivity`: URL der bewusst gesammelten aktuellen Webseite
- `websiteContent`: Seitentitel, markierter Text, sichtbarer Seitentext und ausgewähltes Bild

### Chrome Web Store

- `Web history`: URL der bewusst gesammelten aktuellen Webseite
- `Website content`: Seitentitel, markierter Text, sichtbarer Seitentext, ausgewähltes Bild und gegebenenfalls dessen Quell-URL

Die lokale Verarbeitung muss in den Store-Angaben offengelegt werden, obwohl keine Übertragung an einen externen Archiv-Wiki-Server stattfindet.

## Private und Inkognito-Fenster

Der Archiv-Wiki Web Clipper ist in privaten Firefox-Fenstern und im Inkognitomodus Chromium-kompatibler Browser deaktiviert. Das gemeinsame Manifest verwendet dafür:

```json
"incognito": "not_allowed"
```

Dadurch können Inhalte aus privaten beziehungsweise Inkognito-Sitzungen nicht mit dem Web Clipper an Archiv-Wiki übergeben und dort dauerhaft gespeichert werden.

## Kontrolle durch den Nutzer

Der Nutzer bestimmt:

1. ob und wann der Web Clipper verwendet wird,
2. welche Sammelart ausgeführt wird,
3. welcher Text beziehungsweise welches Bild gesammelt wird,
4. welche Einträge im Archiv-Wiki Eingang verarbeitet oder gelöscht werden,
5. ob Archiv-Wiki unabhängig vom Clipper mit einem eigenen WebDAV-Speicher synchronisiert wird.

## Kontakt

Projekt- und Supportseite:

```text
https://github.com/Smashinger/Archiv-Wiki
```

Eine bestätigte öffentliche Support-E-Mail ist im Projekt noch nicht hinterlegt und muss vor einer Store-Einreichung manuell ergänzt werden, falls der jeweilige Store sie verlangt.

