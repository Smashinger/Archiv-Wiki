// main/ai-tools.js — Read-Only Werkzeuge für die lokale KI-Integration (Phase 3).
// Ermöglicht dem KI-Assistenten das Durchsuchen, Auflisten und Lesen von Notizen
// ausschließlich innerhalb des geöffneten Wiki-Projektordners.
// Alle Datei-Operationen sind strikt read-only und durch resolveSafe abgesichert.

'use strict';

const path = require('path');
const notesFs = require('./notes-fs');

const AI_TOOLS_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'search_notes',
      description: 'Sucht im lokalen Archiv-Wiki nach Notizen anhand eines Suchbegriffs (sucht in Titeln, Tags und Notizinhalten). Gibt eine Liste passender Notizen mit Pfad und Textauszug zurück.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Der Suchbegriff oder die Suchwörter.'
          },
          limit: {
            type: 'integer',
            description: 'Maximale Anzahl an Treffern (Standard: 5, Maximum: 20).'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_note',
      description: 'Liest den vollständigen Textinhalt und die Metadaten einer Notiz anhand ihres relativen Pfads (z. B. "Projekte/Website/Start.md") oder ihres genauen Titels.',
      parameters: {
        type: 'object',
        properties: {
          relPath: {
            type: 'string',
            description: 'Der relative Pfad der Notiz im Wiki (bevorzugt).'
          },
          title: {
            type: 'string',
            description: 'Der Titel der Notiz, falls der Pfad nicht genau bekannt ist.'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_notes',
      description: 'Listet vorhandene Notizen im Wiki auf, optional gefiltert nach einer Kategorie.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Optionaler Filter nach einer Haupt- oder Unterkategorie.'
          },
          limit: {
            type: 'integer',
            description: 'Maximale Anzahl zurückgegebener Notizen (Standard: 15, Maximum: 50).'
          }
        }
      }
    }
  }
];

function createSnippet(text, query, maxLength = 200) {
  if (!text || typeof text !== 'string') return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!query) return clean.slice(0, maxLength);

  const idx = clean.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return clean.slice(0, maxLength) + (clean.length > maxLength ? ' …' : '');

  const start = Math.max(0, idx - 60);
  const end = Math.min(clean.length, idx + query.length + 120);
  let snippet = clean.slice(start, end);
  if (start > 0) snippet = '… ' + snippet;
  if (end < clean.length) snippet = snippet + ' …';
  return snippet;
}

function searchNotes(projectPath, { query = '', limit = 5 } = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) {
    return { query: '', totalMatches: 0, results: [] };
  }

  const maxResults = Math.min(20, Math.max(1, Number(limit) || 5));
  const docs = notesFs.getSearchDocuments(projectPath);

  const scored = [];
  for (const doc of docs) {
    if (doc.archived) continue; // Archivierte Notizen standardmäßig nicht in KI-Trefferliste

    let score = 0;
    const titleLower = (doc.title || '').toLowerCase();
    const bodyLower = (doc.body || '').toLowerCase();
    const tagsLower = Array.isArray(doc.tags) ? doc.tags.map(t => String(t).toLowerCase()) : [];

    if (titleLower === q) score += 100;
    else if (titleLower.includes(q)) score += 50;

    if (tagsLower.includes(q)) score += 40;
    else if (tagsLower.some(t => t.includes(q))) score += 20;

    if (bodyLower.includes(q)) score += 10;

    if (score > 0) {
      scored.push({
        score,
        title: doc.title,
        relPath: doc.relPath,
        categoryPath: doc.categoryPath,
        tags: doc.tags || [],
        snippet: createSnippet(doc.body, q)
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, maxResults).map(({ score, ...rest }) => rest);

  return {
    query,
    totalMatches: scored.length,
    results
  };
}

function readNote(projectPath, { relPath, title } = {}) {
  let targetRelPath = relPath ? String(relPath).trim() : null;

  // Falls kein Pfad, aber ein Titel übergeben wurde: Notiz im Index suchen
  if (!targetRelPath && title) {
    const searchTitle = String(title).trim().toLowerCase();
    const docs = notesFs.getSearchDocuments(projectPath);
    const match = docs.find(d => !d.archived && (d.title || '').toLowerCase() === searchTitle);
    if (match) {
      targetRelPath = match.relPath;
    }
  }

  if (!targetRelPath) {
    return {
      found: false,
      error: title ? `Keine Notiz mit dem Titel „${title}“ gefunden.` : 'Weder relPath noch title angegeben.'
    };
  }

  try {
    const note = notesFs.readNote(projectPath, targetRelPath);
    const content = note.body || '';
    const maxChars = 30000; // Schutz vor Kontext-Überlauf
    const truncated = content.length > maxChars;

    return {
      found: true,
      title: note.frontmatter?.title || path.basename(targetRelPath, '.md'),
      relPath: note.relPath,
      category: note.frontmatter?.category || '',
      mainCategory: note.frontmatter?.mainCategory || '',
      tags: note.frontmatter?.tags || [],
      modified: note.frontmatter?.modified || null,
      content: truncated ? content.slice(0, maxChars) + '\n\n… <Notizinhalt aus Kontextschutz gekürzt>' : content,
      truncated
    };
  } catch (error) {
    return {
      found: false,
      error: error?.message || 'Die Notiz konnte nicht gelesen werden.'
    };
  }
}

function listNotes(projectPath, { category = '', limit = 15 } = {}) {
  const maxResults = Math.min(50, Math.max(1, Number(limit) || 15));
  const docs = notesFs.getSearchDocuments(projectPath);
  const catFilter = String(category || '').trim().toLowerCase();

  const filtered = docs.filter(doc => {
    if (doc.archived) return false;
    if (!catFilter) return true;
    const cat = (doc.category || '').toLowerCase();
    const mainCat = (doc.mainCategory || '').toLowerCase();
    const catPath = (doc.categoryPath || '').toLowerCase();
    return cat.includes(catFilter) || mainCat.includes(catFilter) || catPath.includes(catFilter);
  });

  filtered.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de'));

  return {
    category: category || null,
    totalCount: filtered.length,
    notes: filtered.slice(0, maxResults).map(doc => ({
      title: doc.title,
      relPath: doc.relPath,
      categoryPath: doc.categoryPath,
      tags: doc.tags || []
    }))
  };
}

async function executeAiTool(projectPath, name, args = {}) {
  if (!projectPath) {
    return { success: false, error: 'Kein Wiki-Projektpfad angegeben.' };
  }
  try {
    switch (name) {
      case 'search_notes':
        return { success: true, data: searchNotes(projectPath, args) };
      case 'read_note':
        return { success: true, data: readNote(projectPath, args) };
      case 'list_notes':
        return { success: true, data: listNotes(projectPath, args) };
      default:
        return { success: false, error: `Unbekanntes KI-Werkzeug: ${name}` };
    }
  } catch (error) {
    return { success: false, error: error?.message || 'Fehler bei der Werkzeugausführung.' };
  }
}

module.exports = {
  AI_TOOLS_DEFINITIONS,
  createSnippet,
  searchNotes,
  readNote,
  listNotes,
  executeAiTool
};
