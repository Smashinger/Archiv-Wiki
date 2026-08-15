# Archiv-Wiki Web Clipper

Der Archiv-Wiki Web Clipper sammelt Webinhalte **nur nach einer bewussten Aktion des Nutzers** und übergibt sie lokal an den Eingang von Archiv-Wiki.

Unterstützte Sammelarten:

- **Nur URL** – Seitentitel und URL
- **Markierter Text** – Seitentitel, URL und die aktuelle Textauswahl
- **Ganze Seite** – Seitentitel, URL und der sichtbare Seitentext
- **Bilder** – genau ein vom Nutzer ausgewähltes sichtbares Bild, Seitentitel, Seiten-URL und – falls vorhanden – die Bild-URL

Die Erweiterung sammelt nicht automatisch im Hintergrund und besitzt keine dauerhafte Berechtigung für alle Webseiten.

## Voraussetzungen

- Linux
- Archiv-Wiki als AppImage
- normal installiertes Firefox oder ein Chromium-kompatibler Browser wie Brave
- ein in Archiv-Wiki geöffnetes Projekt

Firefox als Flatpak wird derzeit nicht unterstützt.

## Einrichtung für Endnutzer

1. Archiv-Wiki als AppImage starten.
2. Den passenden Browserweg verwenden:
   - **Firefox:** Den Web Clipper über [Mozilla Add-ons](https://addons.mozilla.org/de/firefox/addon/archiv-wiki-web-clipper/) installieren.
   - **Brave als Flatpak:** In Archiv-Wiki **Einstellungen → Web Clipper** öffnen und **„Brave / Chromium“** wählen; danach Brave vollständig schließen und neu starten.
3. Eine normale Webseite öffnen und den Web Clipper verwenden.

Ein separat installiertes Node.js, ein Archiv-Wiki-Quellordner und eine manuelle Native-Host-Installation sind für Endnutzer nicht erforderlich.

Die bestätigte lokale Brave-Installation benötigt weder Entwicklermodus noch Administratorrechte. Wird der Web Clipper in Brave bewusst entfernt, bleibt er auch nach einem Neustart entfernt. Brave blockiert danach die erneute automatische Installation derselben externen Erweiterungs-ID; Archiv-Wiki umgeht diese Browserentscheidung nicht.

Archiv-Wiki muss beim Clip-Vorgang laufen und ein Projekt geöffnet haben.

## Signierte Chromium-/Brave-Ausgabe

- Endgültige Erweiterungs-ID: `dengpgfllpkndkgkbikigaejieogndbp`
- Aktuelle CRX-Version: `0.2.0`
- Die signierte CRX ist ein öffentlich verteilbares Laufzeitartefakt und wird beim AppImage-Build außerhalb von `app.asar` eingebunden.
- Der private Chromium-Signierschlüssel gehört ausschließlich zum externen Release-Material. Er ist weder Bestandteil des Projekts noch des AppImage und wird von Archiv-Wiki zur Laufzeit nicht benötigt.
- Für einen lokalen AppImage-Build wird die bereits signierte CRX unter `extension/distribution/chromium/archiv-wiki-web-clipper.crx` bereitgestellt. Der Build prüft Format, ID und Version vor dem Paketieren.

## Private und Inkognito-Fenster

Der Web Clipper ist in privaten Firefox-Fenstern und im Inkognitomodus Chromium-kompatibler Browser deaktiviert. Dadurch können Inhalte aus privaten Sitzungen nicht an Archiv-Wiki übergeben und dort dauerhaft gespeichert werden.

## Berechtigungen

Das Manifest verwendet drei Berechtigungen:

| Berechtigung | Verwendung | Warum erforderlich |
| --- | --- | --- |
| `activeTab` | Vorübergehender Zugriff auf die aktuell aktive Seite nach einer bewussten Clipper-Aktion | Ermöglicht Titel, URL und den für den gewählten Clip benötigten Seitenzugriff, ohne eine dauerhafte Freigabe für alle Webseiten anzufordern. |
| `scripting` | Führt den enthaltenen Content-Code nur für den ausdrücklich gestarteten Clip auf der aktiven Seite aus | Wird für markierten Text, sichtbaren Seitentext und die gezielte Bildauswahl benötigt. |
| `nativeMessaging` | Übergibt den fertigen Clip an die lokal laufende Archiv-Wiki-Anwendung | Stellt die lokale Verbindung zwischen Browser und Archiv-Wiki her. |

Nicht vorhanden sind unter anderem:

- keine `host_permissions` und kein `<all_urls>`
- keine `tabs`-Berechtigung
- keine `storage`-Berechtigung
- keine Berechtigungen für Cookies, Verlaufverwaltung, Lesezeichen, Downloads, Identität oder Web-Request-Überwachung

## Datenfluss

```text
Browser-Erweiterung
        ↓
Native Messaging
        ↓
lokal laufendes Archiv-Wiki
        ↓
Eingang
```

Es findet technisch eine Übertragung aus der Browser-Erweiterung an die lokale Archiv-Wiki-Desktopanwendung statt. Die Erweiterung sendet Clip-Inhalte nicht an einen von Archiv-Wiki betriebenen Cloud-Dienst, Analyseanbieter oder Werbenetzwerk.

Es gibt kein Tracking, keine Telemetrie, keine automatische Inhaltsanalyse und keinen Verkauf von Nutzerdaten. Ein Archiv-Wiki-Konto ist nicht erforderlich.

Die Erweiterung speichert Clip-Inhalte nicht dauerhaft im Browser. Die dauerhafte Ablage erfolgt lokal durch Archiv-Wiki im Eingang des geöffneten Projekts.

Weitere Angaben stehen in [PRIVACY.md](PRIVACY.md).

## Store-Unterlagen

- [STORE-LISTING.md](STORE-LISTING.md) – direkt kopierbare Firefox- und Chrome-Texte, Berechtigungsbegründungen und Reviewer-Hinweise
- [STORE-ASSETS.md](STORE-ASSETS.md) – vorhandene Icons sowie verpflichtend noch aufzunehmende Store-Grafiken
- [PRIVACY.md](PRIVACY.md) – tatsächliche Datenverarbeitung und Store-Datenkategorien

Store-Veröffentlichungen und deren Prüfung bleiben von der lokalen Brave-Distribution getrennt.

Die Firefox-Version `0.2.0` ist von Mozilla freigegeben und öffentlich über AMO verfügbar. Eine Veröffentlichung im Chrome Web Store wird damit nicht behauptet.
