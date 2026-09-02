// renderer/js/theme.js
// Wählbare Akzentfarben-Paletten. Jede Farbe hat drei Abstufungen (wie
// bisher fest im CSS: --accent-color/--accent-dim/--accent-soft), damit
// Buttons/Hover/Glow-Schatten weiterhin stimmig zusammenpassen, egal welche
// Farbe gewählt ist. Alle Töne bewusst entsättigt gehalten, passend zum eher
// zurückhaltenden Look der App — keine grellen Neonfarben.

export const ACCENT_PALETTES = {
  orange:  { label: 'Archiv Orange (Standard)', color: '#D9A05B', dim: '#ae804a', soft: 'rgba(217,160,91,0.08)' },
  ocean:   { label: 'Ocean Blue',                color: '#5B9BF8', dim: '#497cc6', soft: 'rgba(91,155,248,0.08)' },
  emerald: { label: 'Emerald Green',             color: '#7FB08A', dim: '#668d6e', soft: 'rgba(127,176,138,0.08)' },
  violet:  { label: 'Violet',                    color: '#A98BC8', dim: '#876fa0', soft: 'rgba(169,139,200,0.08)' },
  crimson: { label: 'Crimson Red',                color: '#CF8A94', dim: '#a66e76', soft: 'rgba(207,138,148,0.08)' },
  cyan:    { label: 'Cyan',                      color: '#63A9A4', dim: '#4f8783', soft: 'rgba(99,169,164,0.08)' },
  rose:    { label: 'Rose',                      color: '#C98BA8', dim: '#a16f86', soft: 'rgba(201,139,168,0.08)' },
  amber:   { label: 'Amber',                     color: '#C4A64E', dim: '#9d853e', soft: 'rgba(196,166,78,0.08)' },
  slate:   { label: 'Slate',                     color: '#8B96A8', dim: '#6f7886', soft: 'rgba(139,150,168,0.08)' },
  lime:    { label: 'Lime',                      color: '#9BAF63', dim: '#7c8c4f', soft: 'rgba(155,175,99,0.08)' },
  indigo:  { label: 'Indigo',                    color: '#7E8BD1', dim: '#656fa7', soft: 'rgba(126,139,209,0.08)' }
};

// Reihenfolge der elf Farbfelder im Einstellungsfenster (Abschnitt 5.2 der
// Spezifikation). Bewusst getrennt von der Reihenfolge in ACCENT_PALETTES:
// die Schlüssel dort sind der gespeicherte Wert (config.accentKey) und dürfen
// sich nicht verschieben, ohne bestehende Wikis umzudeuten — die Anordnung im
// Fenster ist reine Darstellung.
export const ACCENT_SWATCH_ORDER = Object.freeze([
  'crimson', 'orange', 'emerald', 'ocean', 'violet', 'cyan',
  'rose', 'amber', 'slate', 'lime', 'indigo'
]);

// --- Hilfsfunktionen für eigene (freie) Akzentfarben ---
function hexToRgbTuple(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b];
}

// Leitet aus einer frei gewählten Farbe automatisch "dim" (etwas dunkler,
// für Hover-Zustände) und "soft" (8% deckend, für dezente Hintergründe) ab —
// dieselben zwei Abstufungen, die jede feste Palette auch hat.
function deriveAccentShades(hex) {
  const [r, g, b] = hexToRgbTuple(hex);
  const dim = '#' + [r, g, b].map(c => Math.max(0, Math.round(c * 0.8)).toString(16).padStart(2, '0')).join('');
  const soft = `rgba(${r},${g},${b},0.08)`;
  return { dim, soft };
}

// Kontrast-Sicherheit (Nutzer-Anforderung): einfacher, bewährter Luminanz-Test
// nach WCAG-Näherung — entscheidet, ob Text AUF der Akzentfarbe (z. B. der
// markierte Suchtreffer im Editor) hell oder dunkel sein muss, damit er bei
// JEDER frei gewählten Farbe lesbar bleibt.
export function getContrastTextColor(hex) {
  const [r, g, b] = hexToRgbTuple(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#12151a' : '#f5f5f5';
}

// Zufalls-Akzentfarbe (Nutzer-Feature): NUR der Farbton wird zufällig über
// den ganzen Kreis gewählt (0-360°) — Sättigung und Helligkeit bleiben in
// dem engen Band, das die bestehenden 11 Paletten-Farben (siehe
// ACCENT_PALETTES oben) bereits nutzen (per HSL-Umrechnung ermittelt: gut
// 32-50% Sättigung, 46-57% Helligkeit, siehe "Slate" als bewusster
// Ausreißer für einen neutralen Grauton). Dadurch fühlt sich eine
// Zufallsfarbe wie eine zwölfte, dreizehnte usw. Variante der bestehenden
// Palette an, statt wie ein Fremdkörper — und die Kontrast-Frage stellt
// sich praktisch nie, weil dieses Band nie "fast weiß" oder "fast schwarz"
// erzeugen kann. Ergebnis wird wie jede andere frei gewählte Farbe
// behandelt (siehe Aufrufer in settings-window.js) — keine eigene,
// parallele Logik dafür nötig.
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function generateRandomAccentColor() {
  const hue = Math.floor(Math.random() * 360);
  const saturation = 35 + Math.random() * 13; // 35–48%, angelehnt an die bestehenden Farben
  const lightness = 47 + Math.random() * 8;   // 47–55%, angelehnt an die bestehenden Farben
  return hslToHex(hue, saturation, lightness);
}

// key: entweder einer der 11 Preset-Schlüssel, ODER 'custom' (dann customHex
// verwenden, dessen dim/soft-Abstufungen automatisch abgeleitet werden).
export function applyAccentPalette(key, customHex, shadeOverrides = null) {
  let color, dim, soft;
  if (key === 'custom' && customHex) {
    color = customHex;
    ({ dim, soft } = deriveAccentShades(customHex));
  } else {
    const palette = ACCENT_PALETTES[key] || ACCENT_PALETTES.orange;
    ({ color, dim, soft } = palette);
  }
  if (shadeOverrides?.dim) dim = shadeOverrides.dim;
  if (shadeOverrides?.soft) soft = shadeOverrides.soft;
  const root = document.documentElement.style;
  root.setProperty('--accent-color', color);
  root.setProperty('--accent-dim', dim);
  root.setProperty('--accent-soft', soft);
  root.setProperty('--accent-contrast-text', key === 'custom' && customHex ? getContrastTextColor(customHex) : '#12151a');
}

// Baut die Farbkreis-Auswahl als feste CSS-Klassen (.color-swatch-<name>)
// statt Inline-Style (style="background:..."). Grund: wizard.html hat eine
// strengere Content-Security-Policy (style-src 'self', ohne 'unsafe-inline')
// als index.html — Inline-Styles wurden dort lautlos blockiert, die Kreise
// erschienen komplett weiß. Feste Klassen umgehen das, ohne die CSP
// aufzuweichen. Von Wizard UND dem In-App-"Akzentfarben ändern"-Menü genutzt.
export function buildAccentSwatchesHtml(selectedKey) {
  const presets = Object.entries(ACCENT_PALETTES).map(([key, p]) =>
    `<button type="button" class="color-swatch color-swatch-${key}${key === selectedKey ? ' active' : ''}" data-accent="${key}" title="${p.label}"></button>`
  ).join('');
  // Bewusst OHNE Inline-Style (würde im Wizard durch dessen strengere CSP
  // stillschweigend blockiert, siehe Kommentar oben) — Auswahl-Zustand läuft
  // nur über die "active"-Klasse mit Rahmen, wie bei den festen Farben auch.
  const custom = `<button type="button" class="color-swatch color-swatch-custom${selectedKey === 'custom' ? ' active' : ''}" data-accent="custom" title="Eigene Farbe wählen…">🎨</button>`;
  return presets + custom;
}

// Drei wählbare Sidebar-Dichte-Stufen. "Standard" entspricht der neuen,
// bereits verdichteten Basis (siehe --density-* Variablen in styles.css) —
// NICHT dem ursprünglichen, großzügigeren Zustand. "Groß" kommt in etwa dem
// alten Verhalten von vor der Verdichtung nahe, für Nutzer, die es lieber
// etwas geräumiger/lesbarer mögen.
export const SIDEBAR_DENSITY_PRESETS = {
  kompakt: {
    label: 'Kompakt',
    sidebarPad: '14px 10px 8px', sidebarPadX: '10px',
    navFont: '11.5px', navPad: '4px 7px', navGap: '7px',
    groupFont: '11px', groupPad: '5px 7px 4px', groupGap: '6px',
    iconSize: '11px',
    treeRowMain: '26px', treeRowSub: '24px', treeRowNote: '23px'
  },
  standard: {
    label: 'Standard',
    sidebarPad: '16px 12px 10px', sidebarPadX: '12px',
    navFont: '12.5px', navPad: '5px 8px', navGap: '8px',
    groupFont: '11.5px', groupPad: '6px 8px 5px', groupGap: '7px',
    iconSize: '12px',
    treeRowMain: '28px', treeRowSub: '26px', treeRowNote: '25px'
  },
  gross: {
    label: 'Groß',
    sidebarPad: '20px 16px 12px', sidebarPadX: '16px',
    navFont: '14px', navPad: '7px 10px', navGap: '10px',
    groupFont: '13px', groupPad: '8px 10px 7px', groupGap: '9px',
    iconSize: '14px',
    treeRowMain: '32px', treeRowSub: '29px', treeRowNote: '28px'
  }
};

export function applySidebarDensity(key) {
  const preset = SIDEBAR_DENSITY_PRESETS[key] || SIDEBAR_DENSITY_PRESETS.standard;
  const root = document.documentElement.style;
  root.setProperty('--density-sidebar-pad', preset.sidebarPad);
  // Reine Zusatz-Ableitung des bereits vorhandenen waagerechten Anteils aus
  // "sidebarPad" (dort nur als Kurzschrift verfügbar, aus der CSS den
  // Einzelwert nicht herauslösen kann). Ausschließlich von Design2 gelesen
  // (aktive Navigationszeile bis zur Sidebar-Kante, siehe design2.css) —
  // Classic referenziert die Variable nirgends und bleibt unverändert.
  root.setProperty('--density-sidebar-pad-x', preset.sidebarPadX);
  root.setProperty('--density-nav-font', preset.navFont);
  root.setProperty('--density-nav-pad', preset.navPad);
  root.setProperty('--density-nav-gap', preset.navGap);
  root.setProperty('--density-group-font', preset.groupFont);
  root.setProperty('--density-group-pad', preset.groupPad);
  root.setProperty('--density-group-gap', preset.groupGap);
  root.setProperty('--density-icon-size', preset.iconSize);
  // Notizbereich der Sidebar: Die Sidebar-Größe ändert dort ausschließlich die
  // Zeilenhöhen, nie Schriftgrößen, Einzüge oder Icon-Größen (siehe
  // archiv-wiki-sidebar-notizen.md, Abschnitt 11). Die drei Werte hier sind
  // deshalb die EINZIGEN Dichte-Variablen, die sidebar-tree.css liest.
  root.setProperty('--tree-row-main', preset.treeRowMain);
  root.setProperty('--tree-row-sub', preset.treeRowSub);
  root.setProperty('--tree-row-note', preset.treeRowNote);
}

// Editor-Schriftgröße — sitzt direkt in der Editor-Werkzeugleiste als kleines
// Dropdown (Punkt 2 der Korrektur-Runde: kein Menüpunkt/Popup mehr).
// Übersteuert von außen die im Editor-Bundle mitgelieferte Basisgröße
// (siehe components.css .cm-editor).
export const EDITOR_FONT_SIZE_MIN = 12;
export const EDITOR_FONT_SIZE_MAX = 18;
export const EDITOR_FONT_SIZE_DEFAULT = 13;

export function applyEditorFontSize(px) {
  const clamped = Math.min(EDITOR_FONT_SIZE_MAX, Math.max(EDITOR_FONT_SIZE_MIN, Number(px) || EDITOR_FONT_SIZE_DEFAULT));
  document.documentElement.style.setProperty('--editor-font-size', `${clamped}px`);
  return clamped;
}

// Hell/Dunkel-Modus (Einstellungen → Darstellung → Modus): zwei feste
// Optionen, bewusst KEIN dritter "Folgt Betriebssystem"-Automatikmodus —
// entspricht der einfachen, direkten Zwei-Wege-Auswahl, die dieselbe
// .density-option-row-Optik im restlichen Darstellung-Abschnitt bereits
// für Sidebar-Größe und Lesebreite verwendet (siehe settings-window.js).
export const THEME_MODE_PRESETS = {
  dark: { label: 'Dunkel' },
  light: { label: 'Hell' }
};

// Setzt ausschließlich die body-Klasse; alle eigentlichen Farben stehen als
// CSS-Variablen in styles.css (:root vs. body.theme-light). Fehlender/
// unbekannter Wert fällt auf 'dark' zurück — bestehende Wikis ohne
// gespeicherten themeMode sehen unverändert das bisherige Dunkel-Theme.
// Das anschließende CustomEvent (gleiches Muster wie 'archiv-wiki:lock-now')
// ist die EINZIGE Verbindung zum CodeMirror-Editor: editor.js hört darauf und
// stößt bei bereits offener Notiz ein Compartment-Reconfigure an (siehe
// refreshColorMode in build/editor-entry.js) — keine zweite, unabhängige
// Theme-Logik, der Editor hängt sich an genau diesen zentralen Wechsel an.
export function applyThemeMode(mode) {
  const resolved = mode === 'light' ? 'light' : 'dark';
  document.body.classList.toggle('theme-light', resolved === 'light');
  // Zusätzlich als data-theme am Wurzelelement: layout.css tauscht darüber das
  // Sonne-/Mond-Symbol in der Titelleiste. Bewusst HIER, damit wirklich JEDER
  // Weg zum Themewechsel beide Markierungen setzt — der Knopf in der
  // Titelleiste hat das früher selbst gemacht und dabei diese eine zentrale
  // Funktion umgangen, wodurch das Ereignis unten ausblieb und der Editor
  // (der seine Farben nur bei diesem Ereignis neu liest) im alten Modus
  // hängen blieb.
  document.documentElement.setAttribute('data-theme', resolved);
  document.dispatchEvent(new CustomEvent('archiv-wiki:theme-changed', { detail: { mode: resolved } }));
  return resolved;
}

// Fokus-Modus: hier zentral, damit app.js (Werkzeugleisten-Knopf und
// Tastenkürzel) diese Logik nutzen kann, ohne sie dort zu duplizieren.
// Design-unabhängig (Phase 1F der Multi-Design-Vorbereitung): theme.js
// setzt keine bestimmte Editor-Chrome-Struktur mehr voraus, sondern erhält
// die betroffenen Elemente vom Aufrufer — Classic übergibt dafür weiterhin
// exakt dieselben Elemente wie bisher (#editorContainer/#btnFocusMode), ein
// künftiges anderes Design entscheidet selbst, welche Elemente das sind.
export function isFocusModeAvailable(editorEl) {
  return Boolean(editorEl && editorEl.isConnected);
}

export function setFocusMode(active, { editorEl = null, focusButton = null } = {}) {
  const nextActive = Boolean(active && isFocusModeAvailable(editorEl));
  document.body.classList.toggle('focus-mode', nextActive);
  delete document.body.dataset.focusIntensity;

  if (focusButton) {
    focusButton.classList.toggle('active', nextActive);
    focusButton.setAttribute('aria-pressed', nextActive ? 'true' : 'false');
  }

  return nextActive;
}

// Lesemodus mit fester Textbreite (Nutzer-Feature): begrenzt die Vorschau auf
// eine angenehme Lesebreite, Fließtext bleibt dabei mittig. Nur Werte hier
// gepflegt (statt drei einzelner CSS-Regeln je Breite) — die eigentliche
// Begrenzung in components.css referenziert ausschließlich --read-width.
export const READING_WIDTH_PRESETS = {
  schmal: { label: 'Schmal', width: '620px' },
  standard: { label: 'Standard', width: '760px' },
  breit: { label: 'Breit', width: '920px' }
};

export function applyReadingWidth(enabled, key) {
  const preset = READING_WIDTH_PRESETS[key] || READING_WIDTH_PRESETS.standard;
  document.documentElement.style.setProperty('--read-width', preset.width);
  document.body.classList.toggle('reading-width', Boolean(enabled));
}
