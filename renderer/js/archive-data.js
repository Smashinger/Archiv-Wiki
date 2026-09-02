// renderer/js/archive-data.js
// Designunabhängige Datenlogik der Archiv-Ansicht (Phase 2D der Multi-
// Design-Vorbereitung). Kein DOM, kein HTML, kein CSS, keine Classic-IDs,
// keine Event-Listener, keine Seiteneffekte.
//
// Gleiches Muster wie stats-data.js/trash-data.js/knowledge-care-data.js:
// Rohdaten hinein, reines View-Model heraus. Archivierung selbst bleibt
// unverändert reine Frontmatter-Logik (archived/archivedAt) — dieses Modul
// liest diese Felder nur, verändert sie nie.
//
// Bewusst NICHT hier: die eigentliche Zeilendarstellung (buildDashboardRow()
// in app.js) — diese Funktion wird bereits von Dashboard, Archiv UND
// Tag-Übersicht gemeinsam genutzt und ist damit selbst schon eine geteilte
// Komponente. Sie hier zu duplizieren oder zu umgehen würde eine zweite,
// parallele Zeilen-Logik schaffen, die der Auftrag ausdrücklich vermeiden
// soll. Ebenso NICHT hier: Wiederherstellen, Mehrfachauswahl-Zustand und
// jede Art von Datumsformatierung für die Anzeige — das bleibt Classic-
// Darstellungssache (formatAbsoluteDate() in app.js).

/**
 * Wählt die archivierten Notizen aus und bringt sie in die Archiv-
 * Reihenfolge (zuletzt archiviert zuerst). Rein synchron, keine
 * Seiteneffekte — bewusst von buildArchiveViewModel() getrennt, damit
 * renderArchive() wie bisher VOR einer Dokumenten-Abfrage wissen kann,
 * ob das Archiv leer ist (kein unnötiger IPC-Aufruf im Leerzustand).
 *
 * @param {Array} notes Notizen aus dem geladenen Projektbaum (fs.flattenNotes).
 * @returns {Array} Archivierte Notizen, absteigend nach archivedAt sortiert.
 */
export function selectArchivedNotes(notes) {
  const archived = (notes || []).filter(note => note.frontmatter?.archived === true);
  return archived.sort((a, b) => {
    const ta = a.frontmatter?.archivedAt || '';
    const tb = b.frontmatter?.archivedAt || '';
    return tb.localeCompare(ta);
  });
}

/**
 * Baut das reine Archiv-View-Model aus bereits ausgewählten archivierten
 * Notizen (siehe selectArchivedNotes()) und den zugehörigen Notiztexten.
 *
 * @param {object} input
 * @param {Array} input.archivedNotes Ergebnis von selectArchivedNotes().
 * @param {Map<string, string>} [input.bodyByRelPath] Notiztexte je relPath.
 *   Fehlt ein Eintrag, ergibt sich ein leeres Exzerpt — wie bisher, wenn der
 *   Suchindex nicht verfügbar ist.
 * @param {(text: string) => string} input.stripMarkdown Wird bewusst
 *   übergeben statt hier dupliziert: dieselbe Funktion wird auch von anderen
 *   Ansichten genutzt und lebt weiterhin an genau einer Stelle.
 * @returns {{
 *   totalCount: number,
 *   entries: Array<{
 *     note: object,
 *     relPath: string,
 *     title: string,
 *     archivedAt: string | null,
 *     excerpt: string
 *   }>
 * }}
 */
export function buildArchiveViewModel({ archivedNotes, bodyByRelPath = new Map(), stripMarkdown }) {
  const entries = (archivedNotes || []).map(note => ({
    // Die ursprüngliche Notiz bleibt Teil des Eintrags: Classic übergibt sie
    // unverändert an buildDashboardRow(), das selbst weiterhin Titel,
    // Kategorie, Tags und Icon aus dem rohen Notizobjekt ableitet — keine
    // zweite Ableitung dieser Werte an dieser Stelle.
    note,
    relPath: note.relPath,
    // Titel zusätzlich hier bereitgestellt (identische Regel wie in
    // buildDashboardRow): ein künftiges Design braucht diesen Wert als
    // reine Daten, ohne buildDashboardRow bzw. Classic-Markup zu kennen.
    title: note.frontmatter?.title || note.name,
    archivedAt: note.frontmatter?.archivedAt || null,
    excerpt: stripMarkdown(bodyByRelPath.get(note.relPath)).slice(0, 60)
  }));

  return {
    totalCount: entries.length,
    entries
  };
}
