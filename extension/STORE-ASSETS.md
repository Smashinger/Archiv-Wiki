# Store-Assets – Archiv-Wiki Web Clipper

Stand: 9. August 2026

Diese Datei dokumentiert die vorhandenen Store-Assets für Firefox Add-ons und den Chrome Web Store. Die Screenshots stammen aus dem real getesteten Web-Clipper-Ablauf. Sie wurden ausschließlich zugeschnitten und auf das zulässige Store-Format verkleinert; sichtbare Produktinhalte wurden nicht künstlich erzeugt oder verändert.

## Extension-Icons

| Datei | Größe | Format | Manifest | Status |
| --- | ---: | --- | --- | --- |
| `icons/icon-16.png` | 16 × 16 px | PNG mit Transparenz | referenziert | vorhanden |
| `icons/icon-32.png` | 32 × 32 px | PNG mit Transparenz | referenziert | vorhanden |
| `icons/icon-48.png` | 48 × 48 px | PNG mit Transparenz | referenziert | vorhanden |
| `icons/icon-128.png` | 128 × 128 px | PNG mit Transparenz | referenziert | vorhanden und grundsätzlich storefähig |

Das 128×128-PNG besitzt transparenten Rand. Das sichtbare Motiv belegt ungefähr 56 × 72 Pixel und ist damit kleiner als die typische Chrome-Gestaltungsempfehlung. Das ist kein technischer Paketfehler. Vor der Einreichung soll das Icon in der echten Store-Vorschau auf ausreichende Erkennbarkeit geprüft werden. Das Logo wurde nicht verändert.

---

# Store-Screenshots

## Screenshot 1 – Web Clipper auf einer normalen Webseite

```text
store-assets/01-web-clipper-sammelvorgang-1280x800.png
```

- 1280 × 800 Pixel
- PNG
- zeigt eine normale Webseite mit markiertem Text
- zeigt das geöffnete Web-Clipper-Popup und alle vier Sammelarten
- enthält keine erkennbaren privaten Konten, E-Mail-Adressen, Lesezeichen oder lokalen Entwicklerpfade

## Screenshot 2 – Angekommene Clips im Eingang

```text
store-assets/02-archiv-wiki-eingang-webclip-1280x800.png
```

- 1280 × 800 Pixel
- PNG
- zeigt den Archiv-Wiki-Eingang
- zeigt die im realen Test angekommenen URL-, Text-, Seiten- und Bild-Clips
- Titel, Quelle und Clip-Arten sind sichtbar

Die zwei Screenshots decken den vollständigen Nutzerablauf ohne unnötige Wiederholung ab: Sammeln im Browser und Ergebnis im lokalen Eingang. Ein dritter Screenshot ist für die Einreichung nicht erforderlich.

---

# Firefox / AMO

## Vorhanden

- Extension-Icons in 16, 32, 48 und 128 Pixeln
- zwei echte Web-Clipper-Screenshots in 1280 × 800 Pixeln

## Status

Für Firefox fehlt keine weitere Store-Grafik. Die beiden Screenshots sind optional, können aber für das AMO-Listing verwendet werden.

---

# Chrome Web Store

## Vorhanden

- 128×128-Extension-Icon als PNG im Browserpaket
- zwei echte Screenshots in 1280 × 800 Pixeln
- Small Promotional Image in 440 × 280 Pixeln

## Small Promotional Image

```text
store-assets/chrome-small-promo-440x280.png
```

- exakt 440 × 280 Pixel
- PNG
- basiert ausschließlich auf der vorhandenen Markenfläche `docs/branding/social-preview.png`
- verwendet das vorhandene Archiv-Wiki-Logo, den vorhandenen Namen und die vorhandenen Markenfarben
- ist kein gequetschter Produktscreenshot
- enthält kein neues Logo und keine neue Markenidentität

## Status

Die für das Chrome-Listing benötigten Grafiken sind im Projekt vorhanden. Vor dem endgültigen Upload müssen Screenshot, Promobild und Extension-Icon noch in der echten Chrome-Store-Vorschau kontrolliert werden.

Optional bleibt ein Marquee Promotional Image mit 1400 × 560 Pixeln. Es ist keine Voraussetzung für die normale Einreichung und wird in diesem Schritt nicht erstellt.

---

# Nicht in den Store-Grafiken enthalten

- Entwicklerkonsole oder Quellcode
- Erweiterungs-Debuggingseiten
- Testprofile oder lokale Entwicklerpfade
- private Browserfenster oder Inkognito-Inhalte
- persönliche Konten, E-Mail-Adressen oder private URLs

