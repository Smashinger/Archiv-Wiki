// renderer/js/trash-data.js
// Designunabhängige Datenaufbereitung der Papierkorb-Ansicht (Phase 2B der
// Multi-Design-Vorbereitung). Reine Daten: kein DOM, kein HTML, kein CSS,
// keine Classic-IDs, keine Event-Listener, keine Seiteneffekte.
//
// Gleiches Muster und derselbe Ablageort wie stats-data.js und
// knowledge-audit.js: Rohdaten hinein, reines View-Model heraus.
//
// Bewusst NICHT hier: Wiederherstellen, endgültiges Leeren,
// Bestätigungsdialoge und der anschließende Refresh. Das sind Fachaktionen,
// keine Anzeigedaten — sie bleiben unverändert im Renderer bzw. in den
// bestehenden fs-Funktionen.
//
// Die Sortierung (zuletzt gelöscht zuerst) entsteht bereits im Hauptprozess
// (main/notes-fs.js listTrash) und wird hier bewusst nicht erneut angewendet,
// damit es nur eine Stelle mit Sortierregel gibt.

/**
 * Baut das reine Papierkorb-View-Model.
 *
 * @param {Array<{
 *   trashRelPath: string,
 *   type: string,
 *   title: string,
 *   originalRelPath: string,
 *   deletedAt: string
 * }>} entries Papierkorb-Einträge in der vom Hauptprozess gelieferten
 *   Reihenfolge.
 * @returns {{
 *   totalCount: number,
 *   entries: Array<{
 *     trashRelPath: string,
 *     type: string,
 *     title: string,
 *     originalRelPath: string,
 *     deletedAt: string
 *   }>
 * }}
 */
export function buildTrashViewModel(entries) {
  const list = Array.isArray(entries) ? entries : [];
  return {
    totalCount: list.length,
    // Bewusst eine ausdrückliche Feldauswahl statt der Rohobjekte: damit ist
    // der Datenvertrag der Ansicht sichtbar festgeschrieben. Werte werden
    // unverändert durchgereicht (keine Ersatzwerte), damit sich das Verhalten
    // bei unvollständigen Einträgen nicht von bisher unterscheidet.
    entries: list.map(entry => ({
      trashRelPath: entry.trashRelPath,
      type: entry.type,
      title: entry.title,
      originalRelPath: entry.originalRelPath,
      // Bestimmt die vom Hauptprozess gelieferte Reihenfolge und ist echtes
      // vorhandenes Datenfeld — Classic zeigt es heute nicht an.
      deletedAt: entry.deletedAt
    }))
  };
}
