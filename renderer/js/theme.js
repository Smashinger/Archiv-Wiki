// renderer/js/theme.js
// Wählbare Akzentfarben-Paletten. Jede Farbe hat drei Abstufungen (wie
// bisher fest im CSS: --accent-color/--accent-dim/--accent-soft), damit
// Buttons/Hover/Glow-Schatten weiterhin stimmig zusammenpassen, egal welche
// Farbe gewählt ist. Alle Töne bewusst entsättigt gehalten, passend zum eher
// zurückhaltenden Look der App — keine grellen Neonfarben.

export const ACCENT_PALETTES = {
  orange:  { label: 'Archiv Orange (Standard)', color: '#c17d45', dim: '#9c6537', soft: 'rgba(193,125,69,0.08)' },
  ocean:   { label: 'Ocean Blue',                color: '#4a80a8', dim: '#3a6688', soft: 'rgba(74,128,168,0.08)' },
  emerald: { label: 'Emerald Green',             color: '#4f9b73', dim: '#3e7d5c', soft: 'rgba(79,155,115,0.08)' },
  violet:  { label: 'Violet',                    color: '#8a6fb5', dim: '#6d5892', soft: 'rgba(138,111,181,0.08)' },
  crimson: { label: 'Crimson Red',                color: '#b0495a', dim: '#8f3a48', soft: 'rgba(176,73,90,0.08)' },
  cyan:    { label: 'Cyan',                      color: '#3fa3ab', dim: '#327f86', soft: 'rgba(63,163,171,0.08)' },
  rose:    { label: 'Rose',                      color: '#b5688a', dim: '#914f6d', soft: 'rgba(181,104,138,0.08)' },
  amber:   { label: 'Amber',                     color: '#b8953f', dim: '#937632', soft: 'rgba(184,149,63,0.08)' },
  slate:   { label: 'Slate',                     color: '#6b7d94', dim: '#556377', soft: 'rgba(107,125,148,0.08)' },
  lime:    { label: 'Lime',                      color: '#8a9b4f', dim: '#6e7c3e', soft: 'rgba(138,155,79,0.08)' },
  indigo:  { label: 'Indigo',                    color: '#5f6bb0', dim: '#4a548c', soft: 'rgba(95,107,176,0.08)' }
};

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
export function applyAccentPalette(key, customHex) {
  let color, dim, soft;
  if (key === 'custom' && customHex) {
    color = customHex;
    ({ dim, soft } = deriveAccentShades(customHex));
  } else {
    const palette = ACCENT_PALETTES[key] || ACCENT_PALETTES.orange;
    ({ color, dim, soft } = palette);
  }
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
    sidebarPad: '14px 10px 8px',
    navFont: '11.5px', navPad: '4px 7px', navGap: '7px',
    groupFont: '11px', groupPad: '5px 7px 4px', groupGap: '6px',
    iconSize: '11px'
  },
  standard: {
    label: 'Standard',
    sidebarPad: '16px 12px 10px',
    navFont: '12.5px', navPad: '5px 8px', navGap: '8px',
    groupFont: '11.5px', groupPad: '6px 8px 5px', groupGap: '7px',
    iconSize: '12px'
  },
  gross: {
    label: 'Groß',
    sidebarPad: '20px 16px 12px',
    navFont: '14px', navPad: '7px 10px', navGap: '10px',
    groupFont: '13px', groupPad: '8px 10px 7px', groupGap: '9px',
    iconSize: '14px'
  }
};

export function applySidebarDensity(key) {
  const preset = SIDEBAR_DENSITY_PRESETS[key] || SIDEBAR_DENSITY_PRESETS.standard;
  const root = document.documentElement.style;
  root.setProperty('--density-sidebar-pad', preset.sidebarPad);
  root.setProperty('--density-nav-font', preset.navFont);
  root.setProperty('--density-nav-pad', preset.navPad);
  root.setProperty('--density-nav-gap', preset.navGap);
  root.setProperty('--density-group-font', preset.groupFont);
  root.setProperty('--density-group-pad', preset.groupPad);
  root.setProperty('--density-group-gap', preset.groupGap);
  root.setProperty('--density-icon-size', preset.iconSize);
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

// Fokus-Modus: hier zentral, damit app.js (Werkzeugleisten-Knopf und
// Tastenkürzel) diese Logik nutzen kann, ohne sie dort zu duplizieren.
export function isFocusModeAvailable() {
  const editor = document.getElementById('editorContainer');
  return Boolean(editor && editor.isConnected);
}

export function setFocusMode(active) {
  const nextActive = Boolean(active && isFocusModeAvailable());
  document.body.classList.toggle('focus-mode', nextActive);
  delete document.body.dataset.focusIntensity;

  const focusButton = document.getElementById('btnFocusMode');
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
