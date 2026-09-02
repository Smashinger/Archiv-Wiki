// renderer/js/tags-data.js
// Designunabhängige Datenlogik der Tag-Übersicht (Phase 2F der Multi-
// Design-Vorbereitung). Kein DOM, kein HTML, kein CSS, keine Classic-IDs,
// keine Event-Listener, keine Seiteneffekte, kein IPC.
//
// Fachregeln bleiben unverändert und werden hier nur GELESEN, nie neu
// entschieden: frontmatter.tags ist weiterhin die einzige Tag-Quelle,
// Tag-Vergleiche bleiben case-sensitiv (kein toLowerCase()), aktive UND
// archivierte Notizen werden bewusst gemeinsam gezählt/gefiltert (die
// zentrale Tag-Verwaltung ist die dokumentierte Ausnahme zum sonst üblichen
// Ausblenden archivierter Notizen).
//
// Bewusst NICHT hier: Tag-Umbenennen/Zusammenführen/Löschen
// (runTagBatchOperation und der zugehörige Batch-Cluster), das Vor-Batch-
// Backup-Gate (runBackupBeforeTagBatch — wird nachweislich auch von der
// allgemeinen D2-Mehrfachauswahl genutzt und bleibt deshalb unverändert an
// seiner bestehenden gemeinsamen Stelle in app.js), Undo-Toast und
// Ergebniszusammenfassungen (reine Classic-Textformatierung aus bereits
// vollständig informativen main-seitigen Ergebnisobjekten — siehe
// Abschlussbericht Phase 2F für die ausführliche Begründung, warum dort
// keine Auslagerung sinnvoll ist).

/**
 * Zählt, wie oft jeder Tag über alle (aktiven UND archivierten) Notizen
 * vergeben ist, und sortiert absteigend nach Häufigkeit. Bei gleicher
 * Häufigkeit bleibt die bisherige Reihenfolge erhalten (stabiler Sort,
 * Ausgangsreihenfolge = erstes Auftreten beim Durchlaufen der Notizen) —
 * exakt dasselbe Verhalten wie die ursprüngliche Inline-Berechnung.
 *
 * @param {Array} notes Notizen aus dem geladenen Projektbaum (fs.flattenNotes).
 * @returns {{ totalTagCount: number, tags: Array<{ name: string, count: number }> }}
 */
export function buildTagCloudViewModel(notes) {
  const tagCounts = new Map();
  (notes || []).forEach(note => (note.frontmatter?.tags || []).forEach(tag => {
    tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  }));
  const tags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
  return { totalTagCount: tags.length, tags };
}

/**
 * Wählt alle Notizen (aktiv UND archiviert), die den übergebenen Tag exakt
 * (case-sensitiv) tragen. Ohne activeTag ein leeres Array — wie bisher.
 *
 * @param {Array} notes Notizen aus dem geladenen Projektbaum.
 * @param {string|null|undefined} activeTag
 * @returns {Array} Gefilterte, rohe Notizobjekte.
 */
export function selectNotesForTag(notes, activeTag) {
  if (!activeTag) return [];
  return (notes || []).filter(note => (note.frontmatter?.tags || []).includes(activeTag));
}

/**
 * Baut das reine View-Model für die Notizzeilen eines aktiven Tags. Das
 * rohe Notizobjekt bleibt je Eintrag erhalten (`note`) — Classic übergibt es
 * weiterhin unverändert an buildDashboardRow(), das selbst weiterhin Titel,
 * Kategorie, Tags und Icon daraus ableitet.
 *
 * @param {object} input
 * @param {Array} input.taggedNotes Ergebnis von selectNotesForTag().
 * @param {Map<string, string>} [input.bodyByRelPath] Notiztexte je relPath.
 * @param {(text: string) => string} input.stripMarkdown Wird bewusst
 *   übergeben statt hier dupliziert (siehe archive-data.js/stats-data.js für
 *   dasselbe Muster) — dieselbe Funktion lebt weiterhin an genau einer
 *   Stelle in app.js.
 * @returns {{ totalCount: number, entries: Array<{
 *   note: object, relPath: string, title: string, excerpt: string,
 *   sourceDate: string | null
 * }> }}
 */
export function buildTagEntriesViewModel({ taggedNotes, bodyByRelPath = new Map(), stripMarkdown }) {
  const entries = (taggedNotes || []).map(note => ({
    note,
    relPath: note.relPath,
    title: note.frontmatter?.title || note.name,
    excerpt: stripMarkdown(bodyByRelPath.get(note.relPath)).slice(0, 60),
    // Dieselbe Fallback-Reihenfolge wie zuvor inline in renderTagsOverview():
    // modified, ersatzweise created. Formatierung bleibt Classic-Sache
    // (formatAbsoluteDate() in app.js).
    sourceDate: note.frontmatter?.modified || note.frontmatter?.created || null
  }));
  return { totalCount: entries.length, entries };
}
