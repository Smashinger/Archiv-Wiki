// renderer/js/stats-data.js
// Designunabhängige Datenlogik der Statistik-Ansicht (Phase 2A der
// Multi-Design-Vorbereitung). Reine Berechnung: kein DOM, kein HTML, kein
// CSS, keine Classic-IDs, keine Event-Listener, keine Seiteneffekte.
//
// Gleiches Muster und derselbe Ablageort wie knowledge-audit.js: Rohdaten
// hinein, reines View-Model heraus. Wie diese Zahlen anschließend dargestellt
// werden (Balkenbreiten, Mindestbreiten, Beschriftungen, Zahlenformatierung,
// Markup), entscheidet ausschließlich der jeweilige Renderer — heute
// renderStatsPage() in app.js.

// Anzahl der in der Übersicht berücksichtigten meistgenutzten Tags.
export const TOP_TAG_LIMIT = 5;

/**
 * Baut das reine Statistik-View-Model.
 *
 * @param {object} input
 * @param {Array} input.notes Alle Notizen des Projekts, auch archivierte.
 *   Archivierte werden hier herausgefiltert — dieselbe Regel wie bisher.
 * @param {number} input.mainCategoryCount Anzahl der Hauptthemen.
 * @param {number} input.subCategoryCount Anzahl der Unterthemen.
 * @param {Map<string, string>} [input.bodyByRelPath] Notiztexte je relPath.
 *   Fehlt ein Eintrag, zählt die Notiz mit 0 Wörtern — wie bisher, wenn der
 *   Suchindex nicht verfügbar ist.
 * @param {(text: string) => string} input.stripMarkdown Wird bewusst
 *   übergeben statt hier dupliziert: dieselbe Funktion wird auch von anderen
 *   Ansichten genutzt und lebt weiterhin an genau einer Stelle.
 * @returns {{
 *   totalNotes: number,
 *   mainCategoryCount: number,
 *   subCategoryCount: number,
 *   totalWords: number,
 *   categoryCounts: Array<{ name: string|null, count: number }>,
 *   topTags: Array<{ name: string, count: number }>
 * }}
 */
export function buildStatsViewModel({
  notes,
  mainCategoryCount,
  subCategoryCount,
  bodyByRelPath = new Map(),
  stripMarkdown
}) {
  const activeNotes = (notes || []).filter(note => !note.frontmatter?.archived);

  const totalWords = activeNotes.reduce((sum, note) => {
    const body = bodyByRelPath.get(note.relPath) || '';
    return sum + stripMarkdown(body).split(/\s+/).filter(Boolean).length;
  }, 0);

  // Notizen ohne Hauptthema werden zu EINER Gruppe zusammengefasst. Ihr
  // Schlüssel bleibt bewusst null statt eines sichtbaren Platzhaltertextes —
  // welche Beschriftung eine Oberfläche dafür zeigt, ist Darstellungssache.
  const perMainCategory = new Map();
  activeNotes.forEach(note => {
    const key = note.frontmatter?.mainCategory || null;
    perMainCategory.set(key, (perMainCategory.get(key) || 0) + 1);
  });
  const categoryCounts = [...perMainCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  const tagCounts = new Map();
  activeNotes.forEach(note => {
    (note.frontmatter?.tags || []).forEach(tag => {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    });
  });
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_TAG_LIMIT)
    .map(([name, count]) => ({ name, count }));

  return {
    totalNotes: activeNotes.length,
    mainCategoryCount,
    subCategoryCount,
    totalWords,
    categoryCounts,
    topTags
  };
}
