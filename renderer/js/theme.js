// renderer/js/theme.js
// Wählbare Akzentfarben-Paletten. Jede Farbe hat drei Abstufungen (wie
// bisher fest im CSS: --accent-color/--accent-dim/--accent-soft), damit
// Buttons/Hover/Glow-Schatten weiterhin stimmig zusammenpassen, egal welche
// Farbe gewählt ist. Alle Töne bewusst entsättigt gehalten (wie schon beim
// ursprünglichen Blau), passend zum eher zurückhaltenden Look der App.

export const ACCENT_PALETTES = {
  blau:    { label: 'Blau (Standard)', color: '#5b7fa6', dim: '#47648a', soft: 'rgba(91,127,166,0.08)' },
  gruen:   { label: 'Grün',            color: '#6a9b7a', dim: '#527a5f', soft: 'rgba(106,155,122,0.08)' },
  lila:    { label: 'Lila',            color: '#8a75a8', dim: '#6d5b86', soft: 'rgba(138,117,168,0.08)' },
  koralle: { label: 'Koralle',         color: '#b8735f', dim: '#95594a', soft: 'rgba(184,115,95,0.08)' },
  tuerkis: { label: 'Türkis',          color: '#5a9b9b', dim: '#457878', soft: 'rgba(90,155,155,0.08)' },
  gold:    { label: 'Gold',            color: '#b89550', dim: '#93763e', soft: 'rgba(184,149,80,0.08)' }
};

export function applyAccentPalette(key) {
  const palette = ACCENT_PALETTES[key] || ACCENT_PALETTES.blau;
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
