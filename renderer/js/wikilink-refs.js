// renderer/js/wikilink-refs.js
// Findet Notizen, deren Text per [[Titel]] bzw. [[Titel|Anzeigetext]] auf
// einen Notiztitel zeigt. Gleiche Regel wie die Link-Auflösung im Editor
// (renderWikiLinksToPlaceholders in build/editor-entry.js): Vergleich des
// Titels ohne Beachtung der Groß-/Kleinschreibung.
//
// Genutzt für die Rückverweise einer Notiz und für die Warnung vor dem
// Umbenennen einer verlinkten Notiz. Liest nur, schreibt nie.

const WIKILINK_RE = /\[\[([^\]\n|]+?)(?:\|[^\]\n]+?)?\]\]/g;

export function bodyLinksToTitle(body, title) {
  const wanted = String(title || '').trim().toLowerCase();
  if (!wanted) return false;
  const re = new RegExp(WIKILINK_RE.source, 'g');
  let match;
  while ((match = re.exec(String(body || '')))) {
    if (match[1].trim().toLowerCase() === wanted) return true;
  }
  return false;
}

// docs: Einträge aus getSearchDocuments() ({ relPath, title, body, ... }).
// Die Notiz selbst (relPath) zählt nicht als Verweis auf sich.
export function findNotesLinkingToTitle(docs, relPath, title) {
  return (Array.isArray(docs) ? docs : [])
    .filter(doc => doc && doc.relPath !== relPath && bodyLinksToTitle(doc.body, title));
}

// Ein reiner Wechsel der Groß-/Kleinschreibung bricht keine Links, weil die
// Auflösung sie ohnehin ignoriert.
export function renameBreaksTitleLinks(oldTitle, newTitle) {
  return String(oldTitle || '').trim().toLowerCase() !== String(newTitle || '').trim().toLowerCase();
}
