# Store-Unterlagen – Archiv-Wiki Web Clipper

Stand: 12. August 2026

Diese Datei enthält die für Firefox Add-ons (AMO) verwendeten sowie die für den Chrome Web Store vorbereiteten Listing-Texte. Der Firefox Web Clipper ist veröffentlicht; für den Chrome Web Store wird keine Veröffentlichung behauptet.

## Verbindliche Produktangaben

- Der Web Clipper sammelt nur nach einer bewussten Aktion des Nutzers.
- Unterstützt werden URL, markierter Text, sichtbarer Seitentext und ein gezielt ausgewähltes Bild.
- Die Übergabe erfolgt über Native Messaging an die lokal laufende Archiv-Wiki-Anwendung.
- Der Clip landet im Archiv-Wiki **Eingang**.
- Archiv-Wiki wird als Linux-AppImage gestartet und richtet den Native Host automatisch ein.
- Ein separat installiertes Node.js und ein Archiv-Wiki-Quellordner sind für Endnutzer nicht erforderlich.
- Es gibt keine Cloud-Pflicht und kein Archiv-Wiki-Konto.
- Der Clipper ist in privaten beziehungsweise Inkognito-Browserfenstern deaktiviert.

---

# Firefox / AMO

## Veröffentlichungsstatus

- Eingereicht und von Mozilla freigegeben
- Öffentlich verfügbar in Version `0.2.0`
- <https://addons.mozilla.org/de/firefox/addon/archiv-wiki-web-clipper/>

## Name

```text
Archiv-Wiki Web Clipper
```

## Summary

```text
Sammle Webseiten, markierte Texte und Bilder direkt im lokalen Eingang von Archiv-Wiki.
```

## Description

```text
Mit dem Archiv-Wiki Web Clipper sammelst du Inhalte der aktuellen Webseite direkt im Eingang deiner lokalen Archiv-Wiki-Anwendung.

Du entscheidest bei jedem Clip selbst, was übernommen wird:

• Nur URL – Seitentitel und URL sammeln
• Markierter Text – ausgewählten Text zusammen mit Titel und URL sammeln
• Ganze Seite – den sichtbaren Textinhalt der aktuellen Seite sammeln
• Bilder – gezielt ein einzelnes sichtbares Bild auswählen und sammeln

Der Web Clipper arbeitet nur nach deiner bewussten Aktion. Archiv-Wiki muss lokal als Linux-AppImage laufen und ein Projekt geöffnet haben. Beim Start richtet Archiv-Wiki die lokale Verbindung zur Browser-Erweiterung automatisch ein. Ein separat installiertes Node.js, ein Quellordner oder ein Archiv-Wiki-Konto sind nicht erforderlich.

Die Clip-Daten werden an die lokal laufende Archiv-Wiki-Anwendung übergeben und dort zunächst im Eingang abgelegt. Für diese Übergabe ist kein von Archiv-Wiki betriebener Cloud-Dienst erforderlich.

Der Web Clipper ist in privaten Firefox-Fenstern deaktiviert, damit Inhalte aus privaten Sitzungen nicht dauerhaft in Archiv-Wiki gespeichert werden.
```

## Kategorie-Empfehlung

**Bookmarks**

Diese eine Kategorie beschreibt den Zweck ausreichend. Keine zweite Kategorie wird nur zur Erhöhung der Sichtbarkeit empfohlen.

## Lizenz

**MIT License**

Die Lizenz entspricht der vorhandenen Projektdatei `LICENSE`.

## Support

**Support-Website**

```text
https://github.com/Smashinger/Archiv-Wiki
```

**Support-E-Mail**

```text
MANUELL NOCH EINZUTRAGEN – im Projekt ist keine bestätigte öffentliche Support-E-Mail hinterlegt.
```

Die in `package.json` stehende Adresse `smashii@example.com` ist erkennbar ein Platzhalter und darf nicht für den Store verwendet werden.

## Firefox-Datenkategorien

### `browsingActivity`

```text
Wird für Informationen über die vom Nutzer bewusst gesammelte aktuelle Webseite benötigt, insbesondere deren URL. Es findet keine automatische oder dauerhafte Erfassung des Browserverlaufs statt.
```

### `websiteContent`

```text
Wird für den vom Nutzer gewählten Inhalt der aktuellen Webseite benötigt: Seitentitel, markierter Text, sichtbarer Seitentext oder ein gezielt ausgewähltes Bild. Die Verarbeitung erfolgt ausschließlich für den ausgelösten Clip.
```

Es sind keine weiteren Datenkategorien im Manifest deklariert und keine weiteren Kategorien hinzuzufügen.

## Notes for Reviewers

Vor dem Kopieren muss nur der markierte AppImage-Link eingesetzt werden.

```text
This extension works with the local Archiv-Wiki desktop application for Linux.

Reviewer AppImage download:
[MANUALLY INSERT THE STABLE DOWNLOAD URL FOR THE TESTED ARCHIV-WIKI APPIMAGE]

Test steps:
1. Download the Archiv-Wiki Linux AppImage, make it executable, and start it.
2. Complete the local first-run setup or open an existing Archiv-Wiki project.
3. Install the submitted Firefox extension.
4. Open a normal HTTP or HTTPS webpage.
5. Open the Archiv-Wiki Web Clipper popup.
6. Select "Nur URL", "Markierter Text", "Ganze Seite", or "Bilder" and start the clip. For "Bilder", select one visible image on the page.
7. Return to Archiv-Wiki. The submitted clip appears in the local "Eingang" (inbox).

Archiv-Wiki automatically registers the native messaging host locally when the AppImage starts. A separately installed Node.js runtime, a developer checkout, and an account are not required.

Private Firefox windows are excluded by "incognito": "not_allowed" in manifest.json. The extension cannot collect or transmit data from private windows.

The only transmitted data is the current page URL/title and the content explicitly selected by the reviewer for the requested clip mode. Native Messaging sends it to the locally running Archiv-Wiki application. No telemetry or analytics are used.

The extension does not execute remote code. All executable extension JavaScript is included in the submitted package in readable, unminified, and unbundled form. There is no extension build step and no login is required.
```

## Source-Code-Frage

**Antwort:** Kein zusätzliches Source-Code-Paket erforderlich.

Das tatsächliche Browserpaket enthält normal lesbare, nicht minifizierte und nicht gebündelte JavaScript-Dateien. Es gibt keinen Build- oder Transpilierungsprozess für die Extension. Falls AMO bei der Einreichung dennoch ausdrücklich Quellen anfordert, nicht eigenmächtig eine neue Buildstruktur erzeugen, sondern den Befund erneut prüfen.

---

# Chrome Web Store

## Name

```text
Archiv-Wiki Web Clipper
```

## Short Description

```text
Sammle Webseiten, markierte Texte und Bilder direkt im lokalen Eingang von Archiv-Wiki.
```

## Detailed Description

```text
Mit dem Archiv-Wiki Web Clipper sammelst du Inhalte der aktuellen Webseite direkt im Eingang deiner lokalen Archiv-Wiki-Anwendung.

Du wählst bei jedem Clip selbst aus:

• Nur URL – Seitentitel und URL
• Markierter Text – ausgewählter Text mit Titel und URL
• Ganze Seite – sichtbarer Textinhalt der aktuellen Seite
• Bilder – ein gezielt ausgewähltes sichtbares Bild

Der Clipper arbeitet nur nach einer bewussten Nutzeraktion. Archiv-Wiki muss lokal als Linux-AppImage laufen und ein Projekt geöffnet haben. Beim Start richtet Archiv-Wiki die lokale Verbindung zur Browser-Erweiterung automatisch ein. Ein separat installiertes Node.js, ein Quellordner oder ein Archiv-Wiki-Konto sind nicht erforderlich.

Die ausgewählten Daten werden über Native Messaging an die lokal laufende Archiv-Wiki-Anwendung übergeben und dort zunächst im Eingang gespeichert. Es besteht keine Cloud-Pflicht.

Der Web Clipper ist im Inkognitomodus deaktiviert, damit Inhalte aus Inkognito-Sitzungen nicht dauerhaft in Archiv-Wiki gespeichert werden.
```

## Single Purpose

```text
Der Archiv-Wiki Web Clipper sammelt vom Nutzer ausgewählte Inhalte der aktuellen Webseite und übergibt sie an die lokal installierte Archiv-Wiki-Anwendung.
```

## Permission Justifications

### `activeTab`

```text
activeTab gewährt erst nach einer bewussten Clipper-Aktion vorübergehenden Zugriff auf die aktuell verwendete Webseite. Der Zugriff wird benötigt, um Titel, URL und den für den gewählten Clip erforderlichen Inhalt zu erfassen, ohne eine dauerhafte Freigabe für alle Webseiten anzufordern.
```

### `scripting`

```text
scripting ist erforderlich, um den im Browserpaket enthaltenen Content-Code ausschließlich für den bewusst gestarteten Clip auf der aktuell ausgewählten Webseite auszuführen. Dadurch können markierter Text, sichtbarer Seitentext oder die gezielte Bildauswahl erfasst werden.
```

### `nativeMessaging`

```text
nativeMessaging ist erforderlich, um den vom Nutzer ausgewählten Clip an die lokal laufende Archiv-Wiki-Desktopanwendung zu übergeben. Die Kommunikation erfolgt mit dem lokalen, von Archiv-Wiki automatisch eingerichteten Native Host.
```

Das Manifest enthält keine weiteren deklarationspflichtigen Extension-Berechtigungen.

## Remote Code Declaration

**Auswahl im Dashboard:**

```text
No, I am not using remote code.
```

**Begründung, falls ein Textfeld angezeigt wird:**

```text
Die Erweiterung führt keinen Remote-Code aus. Der gesamte ausführbare Extension-Code befindet sich im Browserpaket. Native Messaging wird ausschließlich für die lokale Übergabe des ausgewählten Clips an die Archiv-Wiki-Desktopanwendung verwendet und lädt keinen ausführbaren Code nach.
```

## Privacy / Data Usage

Chrome verlangt die Angabe auch dann, wenn Daten nur lokal auf dem Gerät verarbeitet werden.

### Auszuwählende Datenkategorien

#### `Web history` / Browserverlauf

```text
Betroffen ist die URL der aktuell geöffneten Webseite, die der Nutzer bewusst mit dem Clipper sammelt. Sie wird ausschließlich benötigt, um die Quelle des Clips im Archiv-Wiki Eingang zu speichern. Es findet keine automatische, fortlaufende oder profilbildende Erfassung des Browserverlaufs statt.
```

**Verwendungszweck:** App functionality.

#### `Website content` / Website-Inhalte

```text
Betroffen sind je nach bewusst gewählter Sammelart der Seitentitel, markierter Text, sichtbarer Seitentext, ein ausgewähltes Bild und gegebenenfalls dessen Quell-URL. Diese Daten werden ausschließlich benötigt, um den vom Nutzer ausgelösten Clip im Archiv-Wiki Eingang abzulegen.
```

**Verwendungszweck:** App functionality.

### Nicht auszuwählende Datenkategorien

Der Clipper erfasst nicht gezielt oder gesondert:

- Personally identifiable information
- Health information
- Financial and payment information
- Authentication information
- Personal communications
- Location
- User activity

Webseiteninhalte können abhängig von der vom Nutzer gewählten Seite von Natur aus persönliche oder sensible Angaben enthalten. Der Clipper analysiert oder klassifiziert diese nicht; der tatsächliche Datenfluss wird durch `Website content` und für die URL durch `Web history` abgebildet.

### Limited-Use-Bestätigungen

Die zutreffenden Dashboard-Bestätigungen können abgegeben werden:

```text
Die Daten werden nicht an Dritte verkauft.
Die Daten werden nicht für Zwecke verwendet oder übertragen, die nicht dem offengelegten einzigen Zweck des Web Clippers dienen.
Die Daten werden nicht zur Kreditwürdigkeitsprüfung oder für Kreditvergabezwecke verwendet oder übertragen.
```

Weitere zutreffende Angaben:

```text
Keine Telemetrie.
Kein Tracking.
Kein Werbenetzwerk.
Keine personalisierte Werbung.
Kein Verkauf von Nutzerdaten.
Keine Nutzung für Profilbildung oder allgemeine Analyse.
Keine automatische Hintergrundsammlung.
```

## Privacy Policy URL

```text
MANUELL NOCH EINZUTRAGEN – PRIVACY.md muss vor der Einreichung unter einer dauerhaft öffentlich erreichbaren URL veröffentlicht werden.
```

## Store-Status

- Firefox / AMO: eingereicht, von Mozilla freigegeben und als Version `0.2.0` öffentlich verfügbar
- Firefox / AMO: <https://addons.mozilla.org/de/firefox/addon/archiv-wiki-web-clipper/>
- Chrome Web Store: kein Upload und keine Veröffentlichung dokumentiert
