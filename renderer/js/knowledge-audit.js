// Wissenspflege-Prüfungen.
// Dieses Modul enthält ausschließlich aus vorhandenen Archivdaten ableitbare
// Analysen und verändert weder Notizen noch Projektkonfiguration.

const WIKILINK_PATTERN = /\[\[([^\]\n|]+?)(?:\|([^\]\n]+?))?\]\]/g;

function visibleNoteTitle(note) {
  return String(note?.frontmatter?.title || note?.name || '')
    .replace(/\.md$/i, '')
    .trim();
}

function maskCodeRegions(markdown) {
  return String(markdown || '')
    // Mehrzeilige, eingerückte oder sprachmarkierte Codeblöcke ignorieren.
    .replace(/(^|\n)([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2\3(?=\n|$)/g, match => ' '.repeat(match.length))
    // Nicht geschlossene Codeblöcke bis zum Dokumentende ebenfalls ignorieren.
    .replace(/(^|\n)([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*$/g, match => ' '.repeat(match.length))
    // Inline-Code mit einer oder mehreren Backticks ignorieren.
    .replace(/(`+)([^\n]*?)\1/g, match => ' '.repeat(match.length));
}



export function findEmptyNotes(notes, documents) {
  const noteList = Array.isArray(notes) ? notes : [];
  const documentList = Array.isArray(documents) ? documents : [];
  const bodyByRelPath = new Map(
    documentList.map(document => [document.relPath, String(document.body || '')])
  );

  return noteList
    .filter(note => {
      const body = bodyByRelPath.get(note.relPath) || '';
      return body.trim().length === 0;
    })
    .map(note => ({
      relPath: note.relPath,
      title: visibleNoteTitle(note),
      category: String(
        note?.frontmatter?.category
        || note?.frontmatter?.mainCategory
        || note?.relPath?.split('/').slice(0, -1).pop()
        || ''
      ).trim()
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'de', {
      sensitivity: 'base',
      numeric: true
    }));
}

export function findNotesWithoutTags(notes) {
  const noteList = Array.isArray(notes) ? notes : [];

  return noteList
    .filter(note => {
      const tags = note?.frontmatter?.tags;
      if (!Array.isArray(tags)) return true;
      return !tags.some(tag => String(tag || '').trim());
    })
    .map(note => ({
      relPath: note.relPath,
      title: visibleNoteTitle(note),
      category: String(
        note?.frontmatter?.category
        || note?.frontmatter?.mainCategory
        || note?.relPath?.split('/').slice(0, -1).pop()
        || ''
      ).trim()
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'de', {
      sensitivity: 'base',
      numeric: true
    }));
}

export function findBrokenWikiLinks(notes, documents) {
  const noteList = Array.isArray(notes) ? notes : [];
  const documentList = Array.isArray(documents) ? documents : [];

  const existingTitles = new Set(
    noteList
      .map(visibleNoteTitle)
      .filter(Boolean)
      .map(title => title.toLocaleLowerCase('de'))
  );
  const noteByRelPath = new Map(noteList.map(note => [note.relPath, note]));
  const brokenLinks = [];

  for (const document of documentList) {
    const sourceNote = noteByRelPath.get(document.relPath);
    if (!sourceNote) continue;

    const sourceTitle = visibleNoteTitle(sourceNote);
    const searchableBody = maskCodeRegions(document.body);
    WIKILINK_PATTERN.lastIndex = 0;

    let match;
    while ((match = WIKILINK_PATTERN.exec(searchableBody)) !== null) {
      const target = match[1].trim();
      if (!target || existingTitles.has(target.toLocaleLowerCase('de'))) continue;

      brokenLinks.push({
        sourceRelPath: sourceNote.relPath,
        sourceTitle,
        target,
        displayText: (match[2] || match[1]).trim(),
        syntax: match[0]
      });
    }
  }

  return brokenLinks.sort((a, b) => {
    const sourceOrder = a.sourceTitle.localeCompare(b.sourceTitle, 'de', {
      sensitivity: 'base',
      numeric: true
    });
    if (sourceOrder !== 0) return sourceOrder;
    return a.target.localeCompare(b.target, 'de', {
      sensitivity: 'base',
      numeric: true
    });
  });
}
