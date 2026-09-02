// renderer/js/ui-design.js
// Kleinstmögliches Grundgerüst für mehrere Designs (Phase 3B/3C der Multi-
// Design-Vorbereitung). Enthält die Liste gültiger Designwerte, eine reine,
// DOM-freie Auflösungsfunktion sowie (Phase 3C) die einzige Stelle, die die
// zentrale Root-Markierung für designspezifisches CSS setzt — bewusst keine
// Registry, keine Renderfunktionen-Zuordnung, keine Factory.
//
// Classic bleibt weiterhin der einzige tatsächlich rendernde Pfad: render()
// in app.js ruft für JEDEN aufgelösten Designwert unverändert dieselben
// Classic-render*()-Funktionen auf. "design2" ist absichtlich bereits als
// gültiger, bekannter Wert eingetragen (reserviert für die künftige erste
// Designimplementierung); ab Phase 3C erhält er dadurch bereits eine eigene
// Root-Markierung UND ein eigenes (noch leeres) Stylesheet — beides ändert
// aktuell nichts sichtbar, da weder eine Verzweigung im View-Dispatch noch
// sichtbare CSS-Regeln unter dieser Markierung existieren (siehe
// Abschlussbericht Phase 3C).
//
// uiDesign (WAS gerendert/gestylt wird) und das bestehende Theme-System
// (HELL/DUNKEL, body.theme-light, siehe theme.js) sind zwei unabhängige
// Dimensionen und werden hier bewusst nicht vermischt: applyUiDesign()
// fasst ausschließlich die Design-Root-Markierung an, nie die Theme-Klasse,
// nie die Akzentfarbe.

export const UI_DESIGNS = ['classic', 'design2'];
export const DEFAULT_UI_DESIGN = 'classic';

// Phase 4H (sichtbarer Design-Umschalter): einzige Stelle mit sichtbaren
// Beschriftungen für UI_DESIGNS — bewusst nur ein flaches Label-Mapping,
// keine Registry und keine Render-Zuordnung. Reihenfolge entspricht der
// gewünschten Anzeigereihenfolge im Umschalter.
export const UI_DESIGN_LABELS = {
  classic: 'Classic',
  design2: 'Design2'
};

/**
 * Löst einen gespeicherten Designwert sicher auf.
 *
 * Regel: gültiger bekannter Wert -> unverändert übernommen. Fehlender Wert,
 * unbekannter String, null, oder falscher Typ (Zahl/Objekt/Array) -> immer
 * DEFAULT_UI_DESIGN. Niemals eine Exception, niemals ein Seiteneffekt.
 *
 * @param {unknown} value Gespeicherter Wert, z. B. state.project.config.uiDesign.
 * @returns {string} Einer der Werte aus UI_DESIGNS.
 */
export function resolveUiDesign(value) {
  return UI_DESIGNS.includes(value) ? value : DEFAULT_UI_DESIGN;
}

// Setzt ausschließlich die kanonische Root-Markierung (data-ui-design am
// <body>) — bewusst ein data-*-Attribut statt einer weiteren Klasse: kann
// nicht mit body.theme-light/body.focus-mode kollidieren, erzeugt keine
// Klassenansammlung, und ist aus CSS über [data-ui-design="design2"]
// ebenso einfach selektierbar. Löst den Wert intern sicherheitshalber
// erneut auf (derselbe Selbstschutz wie applyThemeMode in theme.js) —
// dadurch kann hier niemals ein ungültiger Rohwert ins DOM gelangen, selbst
// wenn versehentlich ein unaufgelöster Wert übergeben würde. Setzt keine
// View, keine Theme-Klasse, keine Accent-Konfiguration — reine Ein-Zeilen-
// DOM-Markierung ohne Fachlogik.
//
// Das anschließende CustomEvent ist das exakte Gegenstück zu
// 'archiv-wiki:theme-changed' in theme.js und aus demselben Grund nötig: Der
// CodeMirror-Editor injiziert seine Farben selbst und liest den aktiven
// Design-Zustand nur beim Aufbau seiner Erweiterungen (buildEditorExtensions
// in build/editor-entry.js, dort `document.body.dataset.uiDesign`). Beim
// Designwechsel wird die offene Notiz bewusst NICHT neu gerendert (siehe
// applyPersistedProjectConfig in app.js — ein erneuter render() würde
// ungespeicherte Änderungen gefährden); ohne dieses Ereignis behielte der
// Editor deshalb die Farben des vorherigen Designs. Alle CSS-basierten
// Bereiche wechseln ohnehin allein über [data-ui-design].
export function applyUiDesign(design) {
  const resolved = resolveUiDesign(design);
  const previous = document.body.dataset.uiDesign;
  document.body.dataset.uiDesign = resolved;
  if (previous !== resolved) {
    document.dispatchEvent(new CustomEvent('archiv-wiki:design-changed', { detail: { design: resolved } }));
  }
  return resolved;
}
