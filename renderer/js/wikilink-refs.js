// renderer/js/wikilink-refs.js
// Findet Notizen, deren Text per [[Titel]] bzw. [[Titel|Anzeigetext]] auf
// einen Notiztitel zeigt. Gleiche Regel wie die Link-Auflösung im Editor
// (renderWikiLinksToPlaceholders in build/editor-entry.js): Vergleich des
// Titels ohne Beachtung der Groß-/Kleinschreibung.
//
// Genutzt für die Rückverweise einer Notiz und für die Warnung vor dem
// Umbenennen einer verlinkten Notiz. Liest nur, schreibt nie.

const WIKILINK_RE = /\[\[([^\]\n|]+?)(?:\|[^\]\n]+?)?\]\]/g;

export function maskCodeRegions(markdown) {
  return String(markdown || '')
    // Mehrzeilige, eingerückte oder sprachmarkierte Codeblöcke ignorieren.
    .replace(/(^|\n)([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2\3(?=\n|$)/g, match => ' '.repeat(match.length))
    // Nicht geschlossene Codeblöcke bis zum Dokumentende ebenfalls ignorieren.
    .replace(/(^|\n)([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*$/g, match => ' '.repeat(match.length))
    // Inline-Code mit einer oder mehreren Backticks ignorieren.
    .replace(/(`+)([^\n]*?)\1/g, match => ' '.repeat(match.length));
}

export function bodyLinksToTitle(body, title) {
  const wanted = String(title || '').trim().toLowerCase();
  if (!wanted) return false;
  const searchableBody = maskCodeRegions(body);
  const re = new RegExp(WIKILINK_RE.source, 'g');
  let match;
  while ((match = re.exec(searchableBody))) {
    if (match[1].trim().toLowerCase() === wanted) return true;
  }
  return false;
}

// docs: Einträge aus getSearchDocuments() ({ relPath, title, body, ... }).
// Die Notiz selbst (relPath) zählt nicht als Verweis auf sich.
export function findNotesLinkingToTitle(docs, relPath, title) {
  return (Array.isArray(docs) ? docs : [])
    .filter(doc => doc && doc.relPath !== relPath && bodyLinksToTitle(doc.body, title))
    .map(doc => ({
      ...doc,
      title: String(doc.title || '').replace(/\.md$/i, '')
    }));
}

// Ein reiner Wechsel der Groß-/Kleinschreibung bricht keine Links, weil die
// Auflösung sie ohnehin ignoriert.
export function renameBreaksTitleLinks(oldTitle, newTitle) {
  return String(oldTitle || '').trim().toLowerCase() !== String(newTitle || '').trim().toLowerCase();
}
