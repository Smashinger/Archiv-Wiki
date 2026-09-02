# Design 2 – Farben, Werte und CSS-Tokens

Dieses Dokument enthält eine vollständige und präzise Referenz aller Farben, CSS-Variablen, Typografie-Werte, Dichtestufen und Layout-Maße des **Design 2** im Archiv-Wiki.

---

## 1. Design2-Foundation-Tokens (Farbpalette & Rollen)

Alle Design 2 spezifischen CSS-Variablen liegen unter dem Selektor `[data-ui-design="design2"]`.

### Dark Theme (Standard-Farbschema)

| CSS-Variable | Hex- / Farbwert | Beschreibung / Verwendung |
|---|---|---|
| `--d2-chrome` | `#120d0c` | Obere Titelleiste, untere Statusleiste |
| `--d2-ground` | `#171110` | Grundhintergrund der App |
| `--d2-surface-1` | `#201917` | Hauptarbeitsbereich / Content-Fläche (`.content-scroll`) |
| `--d2-surface-2` | `#2a2220` | Karten, Hover-Zustände, Eingabefelder, Chips |
| `--d2-surface-3` | `#342b28` | Sekundärknöpfe, inaktive Schalter |
| `--d2-preview-surface` | `#1b1413` | Markdown-Vorschau-Hintergrund |
| `--d2-gutter` | `#4a3d3a` | Inaktive Trennlinien / Rinnen |
| `--d2-text` | `#ece5df` | Primäre Textfarbe (Hoher Kontrast) |
| `--d2-dim` | `#c4b9b2` | Sekundärer Text / Fließtext |
| `--d2-muted` | `#9b8f89` | Inaktive Reiter, gedämpfte Icons & Beschriftungen |
| `--d2-faint` | `#7a6f6a` | Platzhalter, Metadaten, Zeitstempel, Statuspunkte |
| `--d2-line` | `rgba(236, 229, 223, 0.09)` | Subtile Trennlinien |
| `--d2-line-strong` | `rgba(236, 229, 223, 0.16)` | Deutliche Trennlinien / Umrandungen |
| `--d2-system` | `#5b9bf8` | System-Zustände, Info-Badges (Blau) |
| `--d2-system-tint` | `rgba(91, 155, 248, 0.13)` | Transparente Tönung für System-Zustände |
| `--d2-on-system` | `#0d1726` | Text auf blauem Systemhintergrund |
| `--d2-mark` | `#cf8a94` | Statische Abschnittsmarken (Rosé) |
| `--d2-category` | `#d9a05b` | Dekorativer Kategorie-Farbstreifen (Amber) |
| `--d2-selection-tint` | `color-mix(in srgb, var(--accent-color) 13%, transparent)` | Auswahlhintergrund (dynamisch nach Nutzerakzent) |
| `--d2-scrim` | `rgba(10, 7, 6, 0.62)` | Abdunklungs-Overlay hinter Dialogen |

---

### Light Theme (`[data-ui-design="design2"].theme-light`)

| CSS-Variable | Hex- / Farbwert | Beschreibung / Verwendung |
|---|---|---|
| `--d2-chrome` | `#e8e2da` | Titelleiste / Statusleiste (Hell) |
| `--d2-ground` | `#f2ede6` | Grundhintergrund (Hell) |
| `--d2-surface-1` | `#fbf8f3` | Hauptarbeitsbereich (Hell) |
| `--d2-surface-2` | `#f0eae1` | Felder / Karten / Hover (Hell) |
| `--d2-surface-3` | `#e4dcd1` | Sekundärknöpfe (Hell) |
| `--d2-preview-surface` | `#f6f1ea` | Vorschau-Hintergrund (Hell) |
| `--d2-gutter` | `#b6aba0` | Trennrinnen (Hell) |
| `--d2-text` | `#241d1a` | Haupttext (Dunkelbraun) |
| `--d2-dim` | `#4a403b` | Sekundärtext (Hell-Modus) |
| `--d2-muted` | `#6e625b` | Gedämpfter Text (Hell-Modus) |
| `--d2-faint` | `#8e827a` | Erklärungen / Platzhalter |
| `--d2-line` | `rgba(36, 29, 26, 0.10)` | Trennlinien (Hell) |
| `--d2-line-strong` | `rgba(36, 29, 26, 0.18)` | Umrandungen (Hell) |
| `--d2-system` | `#2c6bd4` | System-Zustände (Dunkelblau) |
| `--d2-system-tint` | `rgba(44, 107, 212, 0.10)` | System-Tönung (Hell) |
| `--d2-on-system` | `#ffffff` | Text auf blauem Hintergrund |
| `--d2-mark` | `#a85260` | Abschnittsmarken (Dunkelrosé) |
| `--d2-category` | `#a9702a` | Kategorie-Akzent (Dunkelamber) |
| `--d2-selection-tint` | `color-mix(in srgb, var(--accent-color) 12%, transparent)` | Auswahlhintergrund (Hell-Modus) |
| `--d2-scrim` | `rgba(36, 29, 26, 0.28)` | Dialog-Hintergrund-Overlay |

---

## 2. Token-System des Einstellungsfensters (`archiv-wiki-tokens.css`)

Für das Einstellungsfenster (`.aws-scrim`) sowie den Sidebar-Baum gilt folgendes isoliertes Farbset (`--c-*`):

```css
/* Dunkel-Modus (Standard) */
--c-shell:   #120D0C;               /* Titelzeile, Reiterzeile, Grundfläche Baum */
--c-s1:      #201917;               /* Arbeitsbereich */
--c-s2:      #2A2220;               /* Felder, Segmenthülle, Zustandszeile */
--c-s3:      #342B28;               /* Zweitrangige Buttons, Hover, Schalter aus */
--c-rose:    #CF8A94;               /* Abschnittsmarken, Auswahl, Schalter an */
--c-rose-t:  rgba(207,138,148,.13); /* Aktiver Reiter, aktives Segment */
--c-rose-on: #F6DFE2;               /* Text auf Rosé-Tönung */
--c-on-rose: #2A1418;               /* Schalterknopf auf Rosé */
--c-blue:    #5B9BF8;               /* Hauptaktionen, Fokus, Statuspunkte */
--c-on-blue: #0D1726;               /* Text auf blauer Fläche */
--c-amber:   #D9A05B;               /* Kante der Zustandszeile bei Handlungsbedarf */
--c-green:   #7FB08A;               /* Erfolg / Häkchen */
--c-text:    #ECE5DF;               /* Beschriftungen, Feldinhalt */
--c-dim:     #C4B9B2;               /* Fließtext, Button-Text */
--c-muted:   #9B8F89;               /* Inaktive Reiter, Icons in Ruhe */
--c-faint:   #7A6F6A;               /* Erklärungen, Platzhalter, Einheiten */
--c-line:    rgba(236,229,223,.09); /* Abschnittslinien */
--c-shadow:  0 24px 60px rgba(0,0,0,.50);

/* Hell-Modus (body.theme-light) */
--c-shell:   #E8E2DA;
--c-s1:      #FBF8F3;
--c-s2:      #F0EAE1;
--c-s3:      #E4DCD1;
--c-rose:    #A85260;
--c-rose-t:  rgba(168,82,96,.12);
--c-rose-on: #6E2A36;
--c-on-rose: #FFFFFF;
--c-blue:    #2C6BD4;
--c-on-blue: #FFFFFF;
--c-amber:   #A9702A;
--c-green:   #4E7A54;
--c-text:    #241D1A;
--c-dim:     #4A403B;
--c-muted:   #6E625B;
--c-faint:   #8E827A;
--c-line:    rgba(36,29,26,.10);
--c-shadow:  0 18px 44px rgba(36,29,26,.14);
```

---

## 3. Akzentfarben-Paletten (`ACCENT_PALETTES`)

Die 11 vordefinierten Nutzer-Akzentfarben (steuerbar über `--accent-color`, `--accent-dim`, `--accent-soft`):

| Palette Key | Name | Main (`--accent-color`) | Dim (`--accent-dim`) | Soft (`--accent-soft`) |
|---|---|---|---|---|
| `orange` | Archiv Orange | `#D9A05B` | `#ae804a` | `rgba(217,160,91,0.08)` |
| `ocean` | Ocean Blue | `#5B9BF8` | `#497cc6` | `rgba(91,155,248,0.08)` |
| `emerald` | Emerald Green | `#7FB08A` | `#668d6e` | `rgba(127,176,138,0.08)` |
| `violet` | Violet | `#A98BC8` | `#876fa0` | `rgba(169,139,200,0.08)` |
| `crimson` | Crimson Red | `#CF8A94` | `#a66e76` | `rgba(207,138,148,0.08)` |
| `cyan` | Cyan | `#63A9A4` | `#4f8783` | `rgba(99,169,164,0.08)` |
| `rose` | Rose | `#C98BA8` | `#a16f86` | `rgba(201,139,168,0.08)` |
| `amber` | Amber | `#C4A64E` | `#9d853e` | `rgba(196,166,78,0.08)` |
| `slate` | Slate | `#8B96A8` | `#6f7886` | `rgba(139,150,168,0.08)` |
| `lime` | Lime | `#9BAF63` | `#7c8c4f` | `rgba(155,175,99,0.08)` |
| `indigo` | Indigo | `#7E8BD1` | `#656fa7` | `rgba(126,139,209,0.08)` |

---

## 4. Typografie & Schriftfamilien

Design 2 verwendet drei streng getrennte Schriftrollen:

| Rolle | CSS-Variable | Schriftfamilie | Verwendung |
|---|---|---|---|
| **Body / Standard UI** | `--d2-font-body` | `Inter`, sans-serif | Oberflächentext, Fließtext, Titel, Buttons |
| **Abschnittsköpfe** | `--d2-font-heading-condensed` | `'Barlow Condensed'`, sans-serif | Versale Abschnittsüberschriften (`font-weight: 500/600`) |
| **Metadaten & Codes** | `--d2-font-mono` | `'IBM Plex Mono'`, monospace | Zahlen, Status, Datumsangaben, Tags, Code |

### Schriftgrößen-Konfiguration für den Editor

- **Minimum**: `12px`
- **Standard**: `13px` (`--editor-font-size: 13px`)
- **Maximum**: `18px`

---

## 5. Dichtestufen der Sidebar (`SIDEBAR_DENSITY_PRESETS`)

Drei auswählbare Dichtestufen für die Navigationsleiste:

| Eigenschaft | Kompakt (`kompakt`) | Standard (`standard`) | Groß (`gross`) |
|---|---|---|---|
| **Sidebar Padding** | `14px 10px 8px` | `16px 12px 10px` | `20px 16px 12px` |
| **Nav Textgröße** | `11.5px` | `12.5px` | `14px` |
| **Nav Padding** | `4px 7px` | `5px 8px` | `7px 10px` |
| **Gruppen Textgröße** | `11px` | `11.5px` | `13px` |
| **Icon Größe** | `11px` | `12px` | `14px` |
| **Zeilenhöhe Hauptkat.** | `26px` | `28px` | `32px` |
| **Zeilenhöhe Unterkat.** | `24px` | `26px` | `29px` |
| **Zeilenhöhe Notiz** | `23px` | `25px` | `28px` |

---

## 6. Layout-Maße & Abstände

- **Standard Sidebar-Breite**: `--sidebar-w: 236px` (Standard in Design 2, verstellbar von `220px` bis `480px`)
- **Titelleisten-Höhe**: `--titlebar-h: 38px`
- **Statusleisten-Höhe**: `--d2-statusbar-h: 30px`
- **Inhalts-Rundung (Content Corner)**: `border-radius: 8px 0 0 0` am Hauptfenster
- **Dashboard Grid Spalten**: `grid-template-columns: 1fr 330px` (Hauptspalte + Randspalte)
- **Dashboard Spaltenabstand**: `gap: 24px`

---

## 7. Schatten, Effekte & Verläufe

### Schatten (`[data-ui-design="design2"]`)

- **Dark Dialog-Schatten**: `--d2-shadow-dialog: 0 22px 50px rgba(0,0,0, .55)`
- **Dark Menü-Schatten**: `--d2-shadow-menu: 0 18px 40px rgba(0,0,0, .55)`
- **Dark Toast-Schatten**: `--d2-shadow-toast: 0 14px 34px rgba(0,0,0, .45)`
- **Light Dialog-Schatten**: `--d2-shadow-dialog: 0 16px 36px rgba(36,29,26, .16)`
- **Light Menü-Schatten**: `--d2-shadow-menu: 0 12px 28px rgba(36,29,26, .16)`
- **Light Toast-Schatten**: `--d2-shadow-toast: 0 10px 24px rgba(36,29,26, .14)`

### Ausgewählter Verlauf (Selected Gradient)

```css
--d2-nav-select-gradient: linear-gradient(
  90deg,
  color-mix(in srgb, var(--accent-color) 17%, transparent),
  color-mix(in srgb, var(--accent-color) 2%, transparent)
);
```

---

> [!NOTE]
> Alle hier aufgeführten Werte entsprechen der aktiven Implementierung im Projektordner (`renderer/css/design2.css`, `archiv-wiki-tokens.css` und `renderer/js/theme.js`).
