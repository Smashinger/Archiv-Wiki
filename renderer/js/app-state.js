// renderer/js/app-state.js
// Designunabhängiger Fach-/Anwendungszustand (Phase 1A der Multi-Design-
// Vorbereitung): das aktuell geöffnete Projekt und der geladene Notiz-/
// Kategorie-Baum. Das sind die einzigen modulweiten app.js-Zustände, die
// nachweislich auch eine strukturell andere, vollständige UI-Shell benötigen
// würde — nicht nur Archiv-Wiki Classic.
//
// Kein DOM-Zugriff, keine HTML-Erzeugung, keine CSS-Klassen, keine Dialoge,
// keine Navigation, keine Fachlogik. Reine Zustandsquelle mit kleiner
// expliziter API. Absichtlich NICHT verschoben: Classic-spezifischer UI-
// Zustand (Sidebar-Auf-/Zuklappen, Such-Dropdown, Splitter-Drag, Dashboard-
// Rendergeneration usw.) bleibt bei Classic in app.js — siehe Abschluss-
// bericht Phase 1A.

let project = null;
let tree = [];

export function getProject() {
  return project;
}

export function setProject(value) {
  project = value;
}

export function getTree() {
  return tree;
}

export function setTree(value) {
  tree = value;
}
