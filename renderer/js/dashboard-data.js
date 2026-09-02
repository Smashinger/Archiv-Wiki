// renderer/js/dashboard-data.js
// Designunabhängige Datenlogik des Dashboards (Phase 2G der Multi-Design-
// Vorbereitung). Kein DOM, kein HTML, kein CSS, keine Classic-IDs, keine
// Event-Listener, keine Seiteneffekte, kein IPC, keine Layout-/Höhenmessung.
//
// Die vier Bereiche selbst (Statistik-Kacheln, Angeheftet, Zuletzt
// bearbeitet, Alle Notizen), ihre projektbezogene Reihenfolge/Sichtbarkeit
// und die Regeln zum Zusammenführen mit den Standardwerten sind kanonisch in
// AI_CONTEXT/06_DASHBOARD.md dokumentiert — dieses Modul setzt diese Regeln
// nur um, entscheidet sie nicht neu.
//
// DEFAULT_DASHBOARD_SECTIONS/RECENT_SIZE_OPTIONS/DASHBOARD_SIZE_OPTIONS
// bleiben bewusst als einzige Quelle in app.js (dort auch von der
// Personalisierungs-UI selbst benötigt) und werden hier als Parameter
// hereingereicht statt dupliziert — dasselbe Injection-Muster wie
// stripMarkdown in stats-data.js/archive-data.js/tags-data.js.
//
// Bewusst NICHT hier: dashboardRenderGeneration (Race-/Stale-Guard für
// asynchrones Rendering — schützt den Rendervorgang, nicht die
// Datenbedeutung), das gesamte Personalisierungs-UI (Zahnrad-Dialog,
// Sperr-/Entsperr-Symbol samt Kontextmenü, Umsortier-Pfeile), die adaptive
// Listenhöhe (notesArePaired/fitNoteListHeight — reines Classic-
// Layoutverhalten), das Tipp-System und jeglicher Classic-Text
// (Begrüßung, "Weiterarbeiten"-Kontextzeile, Bereichsüberschriften,
// Empty-State-Texte).

/**
 * Löst die Dashboard-Personalisierung auf und leitet die vier
 * Notizlisten sowie die Statistik-Kennzahlen ab — exakt dieselbe Logik, die
 * zuvor inline in renderHome() stand, nur ohne DOM-Bezug.
 *
 * @param {object} input
 * @param {Array} input.notes Notizen aus dem geladenen Projektbaum
 *   (fs.flattenNotes(state.tree)) — noch NICHT nach Archiv gefiltert, das
 *   übernimmt diese Funktion selbst (wie selectArchivedNotes() in
 *   archive-data.js filtert auch diese Funktion aus den Rohdaten).
 * @param {object} [input.config] state.project.config.
 * @param {Array<{key:string, enabled:boolean}>} input.defaultSections
 *   DEFAULT_DASHBOARD_SECTIONS aus app.js.
 * @param {number[]} input.recentSizeOptions RECENT_SIZE_OPTIONS aus app.js.
 * @param {number[]} input.allSizeOptions DASHBOARD_SIZE_OPTIONS aus app.js
 *   (für "Alle Notizen").
 * @param {number[]} input.pinnedSizeOptions DASHBOARD_SIZE_OPTIONS aus
 *   app.js (für "Angeheftet") — im bestehenden Code dieselbe Konstante wie
 *   allSizeOptions, hier bewusst getrennt benannt, falls beide künftig
 *   unterschiedliche Werte bräuchten.
 * @param {number} [input.now] Referenzzeitpunkt für die Wochenstatistik,
 *   Standard Date.now() — als Parameter statt fest verdrahtet, damit die
 *   Funktion ohne Abhängigkeit von der echten Uhrzeit testbar ist; das
 *   Standardverhalten bleibt dabei unverändert.
 * @returns {{
 *   notes: Array,
 *   sections: Array<{key:string, enabled:boolean}>,
 *   recentCount: number, allCount: number, pinnedCount: number,
 *   recent: Array, pinnedAll: Array, pinned: Array, all: Array,
 *   stats: { editedThisWeek: number, categoryCount: number, tagCount: number, mostUsedCategory: string | undefined }
 * }}
 */
export function buildDashboardViewModel({
  notes,
  config = {},
  defaultSections,
  recentSizeOptions,
  allSizeOptions,
  pinnedSizeOptions,
  now = Date.now()
}) {
  // Archivierte Notizen fließen bewusst nicht ein — dieselbe Ausnahme wie
  // bisher gilt für alle vier Bereiche gemeinsam (siehe 06_DASHBOARD.md).
  const activeNotes = (notes || []).filter(n => !n.frontmatter?.archived);

  // Gespeicherte Bereichsreihenfolge ist die Grundlage; ein neuer Bereich
  // wird ergänzt, ein nicht mehr existierender herausgefiltert.
  const validKeys = new Set(defaultSections.map(d => d.key));
  const savedSections = Array.isArray(config.dashboardSections) ? config.dashboardSections : null;
  const sections = savedSections
    ? [...savedSections.filter(s => validKeys.has(s.key)), ...defaultSections.filter(def => !savedSections.some(s => s.key === def.key))]
    : defaultSections.map(def => ({ ...def }));

  const recentCount = recentSizeOptions.includes(config.dashboardRecentCount) ? config.dashboardRecentCount : 4;
  const allCount = allSizeOptions.includes(config.dashboardAllCount) ? config.dashboardAllCount : 10;
  const pinnedCount = pinnedSizeOptions.includes(config.dashboardPinnedCount) ? config.dashboardPinnedCount : 5;

  // "Zuletzt bearbeitet" und Angeheftet bleiben nach Änderungsdatum sortiert
  // (Angeheftet erbt bewusst dieselbe Reihenfolge, kein eigener Sortierlauf).
  const sortedByModified = [...activeNotes].sort((a, b) => {
    const ta = a.frontmatter?.modified || a.frontmatter?.created || '';
    const tb = b.frontmatter?.modified || b.frontmatter?.created || '';
    return tb.localeCompare(ta);
  });
  const recent = sortedByModified.slice(0, recentCount);
  const pinnedAll = sortedByModified.filter(n => n.frontmatter?.pinned);
  const pinned = pinnedAll.slice(0, pinnedCount);

  // "Alle Notizen": stabile alphabetische Übersicht nach sichtbarem Titel.
  const all = [...activeNotes].sort((a, b) => {
    const aTitle = String(a.frontmatter?.title || a.name || '').replace(/\.md$/i, '');
    const bTitle = String(b.frontmatter?.title || b.name || '').replace(/\.md$/i, '');
    return aTitle.localeCompare(bTitle, 'de', { sensitivity: 'base', numeric: true });
  });

  const oneWeekAgo = now - 7 * 24 * 3600 * 1000;
  const editedThisWeek = activeNotes.filter(n => {
    const t = n.frontmatter?.modified || n.frontmatter?.created;
    return t && new Date(t).getTime() >= oneWeekAgo;
  }).length;
  const categoryTally = new Map();
  activeNotes.forEach(n => {
    const cat = n.frontmatter?.category || n.frontmatter?.mainCategory;
    if (cat) categoryTally.set(cat, (categoryTally.get(cat) || 0) + 1);
  });
  const categoryCount = categoryTally.size;
  const tagCount = new Set(activeNotes.flatMap(n => n.frontmatter?.tags || [])).size;
  // Aktuell von Classic ungenutzt (bereits im ursprünglichen Inline-Code so
  // berechnet, aber nirgends dargestellt) — unverändert mitgeführt, da Phase
  // 2G weder neue Werte einführt noch bestehende entfernt.
  const mostUsedCategory = [...categoryTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    notes: activeNotes,
    sections,
    recentCount, allCount, pinnedCount,
    recent, pinnedAll, pinned, all,
    stats: { editedThisWeek, categoryCount, tagCount, mostUsedCategory }
  };
}

/**
 * Leitet das Exzerpt einer Dashboard-Notizzeile ab — dieselbe Formel wie
 * bereits in archive-data.js/tags-data.js etabliert (Markdown entfernen,
 * auf 60 Zeichen kürzen). Bewusst eine eigene, kleine Funktion statt eines
 * Imports aus einem der beiden anderen Module: keines der beiden kennt das
 * Dashboard, und ein neuer, ausschließlich für diese eine Formel
 * geschaffener geteilter Hilfsbaustein wäre für Phase 2G eine
 * Scope-Erweiterung ohne echten Wartungsvorteil (siehe Abschlussbericht).
 *
 * @param {object} note Rohes Notizobjekt.
 * @param {Map<string, string>} bodyByRelPath Notiztexte je relPath.
 * @param {(text: string) => string} stripMarkdown Injiziert, siehe
 *   buildStatsViewModel()/buildArchiveViewModel()/buildTagEntriesViewModel()
 *   für dasselbe Muster.
 * @returns {string}
 */
export function dashboardExcerptFor(note, bodyByRelPath, stripMarkdown) {
  return stripMarkdown(bodyByRelPath.get(note.relPath)).slice(0, 60);
}
