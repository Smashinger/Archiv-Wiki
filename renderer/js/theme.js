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

export function applyAccentPalette(key) {
  const palette = ACCENT_PALETTES[key] || ACCENT_PALETTES.orange;
  const root = document.documentElement.style;
  root.setProperty('--accent-color', palette.color);
  root.setProperty('--accent-dim', palette.dim);
  root.setProperty('--accent-soft', palette.soft);
}

// Baut die Farbkreis-Auswahl als feste CSS-Klassen (.color-swatch-<name>)
// statt Inline-Style (style="background:..."). Grund: wizard.html hat eine
// strengere Content-Security-Policy (style-src 'self', ohne 'unsafe-inline')
// als index.html — Inline-Styles wurden dort lautlos blockiert, die Kreise
// erschienen komplett weiß. Feste Klassen umgehen das, ohne die CSP
// aufzuweichen. Von Wizard UND dem In-App-"Akzentfarben ändern"-Menü genutzt.
export function buildAccentSwatchesHtml(selectedKey) {
  return Object.entries(ACCENT_PALETTES).map(([key, p]) =>
    `<button type="button" class="color-swatch color-swatch-${key}${key === selectedKey ? ' active' : ''}" data-accent="${key}" title="${p.label}"></button>`
  ).join('');
}
