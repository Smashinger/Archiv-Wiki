'use strict';

const path = require('node:path');
const notesFs = require('./notes-fs');

const DEFAULT_MAX_STRUCTURE_CHARS = 8000;
const DEFAULT_MAX_NOTE_CONTENT_CHARS = 12000;
const DEFAULT_MAX_SELECTION_CHARS = 3000;

function buildWikiStructureSnapshot(projectPath, { maxChars = DEFAULT_MAX_STRUCTURE_CHARS, fsModule = notesFs } = {}) {
  if (!projectPath || typeof projectPath !== 'string') return '';
  let tree = [];
  try {
    tree = fsModule.listProjectTree(projectPath);
  } catch {
    return '';
  }
  if (!Array.isArray(tree) || tree.length === 0) {
    return 'Das aktuelle Wiki ist noch leer (keine Kategorien oder Notizen vorhanden).';
  }

  const lines = ['Bestehende Wiki-Struktur (Hauptkategorien, Unterkategorien und Notizen):'];
  let currentLength = lines[0].length;

  function appendLine(line) {
    if (currentLength + line.length + 1 > maxChars) {
      lines.push('  ... [weitere Einträge gekürzt]');
      return false;
    }
    lines.push(line);
    currentLength += line.length + 1;
    return true;
  }

  for (const mainEntry of tree) {
    if (mainEntry.type === 'folder') {
      const mainName = mainEntry.name;
      const subFolders = (mainEntry.children || []).filter(c => c.type === 'folder');
      const directNotes = (mainEntry.children || []).filter(c => c.type === 'note');

      let mainDesc = `📁 Hauptkategorie „${mainName}“`;
      if (directNotes.length > 0 && subFolders.length === 0) {
        const noteNames = directNotes.map(n => n.name.replace(/\.md$/i, '')).join(', ');
        mainDesc += ` (Notizen: ${noteNames})`;
      }
      if (!appendLine(mainDesc)) break;

      for (const sub of subFolders) {
        const subNotes = (sub.children || []).filter(c => c.type === 'note');
        let subLine = `  📂 Unterkategorie „${sub.name}“ (Pfad: „${mainName}/${sub.name}“)`;
        if (subNotes.length > 0) {
          const names = subNotes.map(n => n.name.replace(/\.md$/i, '')).join(', ');
          subLine += ` — Notizen: ${names}`;
        } else {
          subLine += ' — (noch leer)';
        }
        if (!appendLine(subLine)) break;
      }
    } else if (mainEntry.type === 'note') {
      const name = mainEntry.name.replace(/\.md$/i, '');
      if (!appendLine(`📄 Notiz im Hauptverzeichnis: ${name}`)) break;
    }
  }

  return lines.join('\n');
}

function formatActiveNoteContext(activeNote, {
  maxContentChars = DEFAULT_MAX_NOTE_CONTENT_CHARS,
  maxSelectionChars = DEFAULT_MAX_SELECTION_CHARS
} = {}) {
  if (!activeNote || typeof activeNote !== 'object') return '';
  const relPath = typeof activeNote.relPath === 'string' ? activeNote.relPath.trim() : '';
  const content = typeof activeNote.content === 'string' ? activeNote.content : '';
  const selection = typeof activeNote.selection === 'string' ? activeNote.selection.trim() : '';

  if (!relPath && !content && !selection) return '';

  const parts = [];

  if (relPath || content) {
    let safeContent = content;
    let truncated = false;
    if (safeContent.length > maxContentChars) {
      safeContent = safeContent.slice(0, maxContentChars);
      truncated = true;
    }

    parts.push(
      `<current_note path="${relPath || 'Unbekannt'}">\n` +
      `Aktuell im Editor geöffnete Notiz:\n` +
      `---\n` +
      safeContent +
      (truncated ? '\n\n... [Inhalt für Chat-Kontext gekürzt; nutze read_note für den vollen Text]' : '') +
      `\n---\n` +
      `</current_note>`
    );
  }

  if (selection) {
    let safeSelection = selection;
    if (safeSelection.length > maxSelectionChars) {
      safeSelection = safeSelection.slice(0, maxSelectionChars) + '\n... [Auswahl gekürzt]';
    }
    parts.push(
      `<editor_selection>\n` +
      `Aktuell im Editor markierter Text:\n` +
      safeSelection +
      `\n</editor_selection>`
    );
  }

  return parts.join('\n\n');
}

module.exports = {
  DEFAULT_MAX_STRUCTURE_CHARS,
  DEFAULT_MAX_NOTE_CONTENT_CHARS,
  DEFAULT_MAX_SELECTION_CHARS,
  buildWikiStructureSnapshot,
  formatActiveNoteContext
};
