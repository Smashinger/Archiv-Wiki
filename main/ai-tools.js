// main/ai-tools.js — Read-Only Werkzeuge für die lokale KI-Integration (Phase 3).
// Ermöglicht dem KI-Assistenten das Durchsuchen, Auflisten und Lesen von Notizen
// ausschließlich innerhalb des geöffneten Wiki-Projektordners.
// Alle Datei-Operationen sind strikt read-only und durch resolveSafe abgesichert.

'use strict';

const path = require('path');
const notesFs = require('./notes-fs');
const aiProposals = require('./ai-proposals');
const aiKnowledge = require('./ai-knowledge');

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
  },
  {
    type: 'function',
    function: {
      name: 'propose_create_note',
      description: 'Schlägt das Erstellen einer neuen Notiz im Wiki vor. WICHTIG: Notizen liegen immer in einer Unterkategorie (Format: "Hauptkategorie/Unterkategorie"). Falls die Hauptkategorie oder Unterkategorie noch nicht existiert, wird sie beim Anwenden der Notiz AUTOMATISCH mit angelegt! Wenn der Nutzer darum bittet, eine Oberkategorie, eine Unterkategorie und eine Notiz mit Inhalt zu erstellen (oder eine Notiz in einer neuen Kategorie wünscht), rufe SOFORT und DIREKT dieses Werkzeug mit "subCategoryRelPath": "Hauptkategorie/Unterkategorie", dem Titel und dem vollständigen Markdown-Inhalt auf. Erfordert Freigabe durch den Nutzer.',
      parameters: {
        type: 'object',
        properties: {
          subCategoryRelPath: {
            type: 'string',
            description: 'Der relative Pfad der Unterkategorie im Format "Hauptkategorie/Unterkategorie" (z. B. "Entwicklung/Workflows" oder "Wissen/Software"). Noch nicht existierende Ordner werden automatisch mit erstellt.'
          },
          title: {
            type: 'string',
            description: 'Der Titel der neuen Notiz.'
          },
          content: {
            type: 'string',
            description: 'Der vollständige, strukturierte Markdown-Textinhalt der neuen Notiz.'
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optionale Liste von Schlagwörtern / Tags für die Notiz.'
          },
          reason: {
            type: 'string',
            description: 'Kurze Begründung für den Vorschlag (z. B. "Neue Notiz und Kategorie basierend auf Nutzeranfrage").'
          }
        },
        required: ['subCategoryRelPath', 'title', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_update_note',
      description: 'Schlägt eine Änderung oder Aktualisierung einer bestehenden Notiz vor. Gibt dem Nutzer eine Diff-Vorschau zur Freigabe. Erfordert eine explizite Bestätigung durch den Nutzer. WICHTIG: Wenn nur Tags ergänzt oder geändert werden, muss der Parameter content nicht angegeben werden (der bisherige Notizinhalt bleibt unverändert erhalten).',
      parameters: {
        type: 'object',
        properties: {
          relPath: {
            type: 'string',
            description: 'Der relative Pfad der zu bearbeitenden Notiz (z. B. "Entwicklung/Workflows/Git und Release-Leitfaden.md").'
          },
          content: {
            type: 'string',
            description: 'Optionaler vollständiger neuer Markdown-Inhalt der Notiz. Wenn nur Tags aktualisiert werden sollen, weglassen.'
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optionale aktualisierte Schlagwörter / Tags.'
          },
          reason: {
            type: 'string',
            description: 'Kurze Erklärung der Änderungen für den Nutzer (z. B. "Schritt zur Checkliste hinzugefügt" oder "Passende Tags ergänzt").'
          }
        },
        required: ['relPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_create_category',
      description: 'Schlägt das Erstellen einer leeren Kategorie im Wiki vor. WICHTIG: Nutze dieses Werkzeug NUR DANN, wenn der Nutzer AUSSCHLIESSLICH leere Kategorien/Ordner ohne Notizen anlegen möchte. Wenn der Nutzer eine Notiz in neuen Kategorien wünscht, nutze stattdessen direkt propose_create_note, da fehlende Ordner dort automatisch mit angelegt werden. Erfordert Bestätigung durch den Nutzer.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name der neuen Kategorie.'
          },
          parentCategoryRelPath: {
            type: 'string',
            description: 'Optionaler Pfad der übergeordneten Hauptkategorie (z. B. "Entwicklung" oder "Privat"), um eine Unterkategorie anzulegen. Wenn weggelassen, wird eine Hauptkategorie angelegt.'
          },
          reason: {
            type: 'string',
            description: 'Kurze Begründung für den Vorschlag (z. B. "Neuer Bereich für Leitfäden").'
          }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_move_note',
      description: 'Schlägt das Verschieben einer Notiz in eine andere Unterkategorie vor. Erfordert explizite Bestätigung durch den Nutzer.',
      parameters: {
        type: 'object',
        properties: {
          relPath: {
            type: 'string',
            description: 'Der relative Pfad der zu verschiebenden Notiz (z. B. "Allgemein/Notizen/MeinThema.md").'
          },
          targetSubCategoryRelPath: {
            type: 'string',
            description: 'Der relative Pfad der Ziel-Unterkategorie (Tiefe 2, z. B. "Entwicklung/Workflows").'
          },
          reason: {
            type: 'string',
            description: 'Kurze Begründung für die Verschiebung.'
          }
        },
        required: ['relPath', 'targetSubCategoryRelPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_rename_note',
      description: 'Schlägt das Umbenennen einer Notiz vor (aktualisiert Dateiname und Frontmatter-Titel). Erfordert explizite Bestätigung durch den Nutzer.',
      parameters: {
        type: 'object',
        properties: {
          relPath: {
            type: 'string',
            description: 'Der relative Pfad der umzubenennenden Notiz (z. B. "Entwicklung/Workflows/Alt.md").'
          },
          newTitle: {
            type: 'string',
            description: 'Der neue Titel der Notiz.'
          },
          reason: {
            type: 'string',
            description: 'Kurze Begründung für die Umbenennung.'
          }
        },
        required: ['relPath', 'newTitle']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_delete_note',
      description: 'Schlägt das Verschieben einer Notiz in den Papierkorb vor (.wiki-trash/). Die Notiz wird nicht unwiderruflich gelöscht, sondern kann aus dem Papierkorb wiederhergestellt werden. Erfordert explizite Bestätigung durch den Nutzer.',
      parameters: {
        type: 'object',
        properties: {
          relPath: {
            type: 'string',
            description: 'Der relative Pfad der zu löschenden Notiz (z. B. "Entwicklung/Workflows/AlteNotiz.md").'
          },
          reason: {
            type: 'string',
            description: 'Wichtige Erklärung, warum die Notiz in den Papierkorb verschoben werden soll.'
          }
        },
        required: ['relPath', 'reason']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'audit_knowledge_base',
      description: 'Führt eine automatische Wissenspflege-Prüfung des gesamten Wikis durch. Findet defekte Wikilinks, leere Notizen, Notizen ohne Schlagworte/Tags, verwaiste Notizen (weder eingehende noch ausgehende Wikilinks) und potenzielle Titel-Duplikate.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_duplicate_notes',
      description: 'Sucht nach inhaltlichen oder thematischen Duplikaten und Redundanzen zwischen Notizen anhand von Begriffen, Tags und Titeln. Berechnet Ähnlichkeits-Scores und gemeinsame Schlüsselbegriffe.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Optionales Thema oder Suchbegriff, um die Duplikatsuche einzugrenzen.'
          },
          threshold: {
            type: 'number',
            description: 'Ähnlichkeits-Schwellenwert zwischen 0.1 und 1.0 (Standard: 0.45).'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_wiki_tags',
      description: 'Liest alle bisher im gesamten Wiki verwendeten Schlagwörter (Tags) sortiert nach Häufigkeit aus. Nutze dieses Werkzeug IMMER, bevor du Tags für Notizen vorschlägst oder aktualisierst, um bestehende Tags wiederzuverwenden und Tag-Wildwuchs zu vermeiden.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'integer',
            description: 'Maximale Anzahl zurückgegebener Tags (Standard: 50, Maximum: 100).'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'suggest_wikilinks',
      description: 'Analysiert den Text einer Notiz und schlägt passende interne [[Wikilinks]] zu anderen bereits existierenden Notizen im Wiki vor.',
      parameters: {
        type: 'object',
        properties: {
          relPath: {
            type: 'string',
            description: 'Der relative Pfad der zu analysierenden Notiz.'
          },
          title: {
            type: 'string',
            description: 'Optionaler Titel der Notiz, falls der relative Pfad nicht genau bekannt ist.'
          },
          limit: {
            type: 'integer',
            description: 'Maximale Anzahl Vorschläge zwischen 1 und 100 (Standard: 15).'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_notes',
      description: 'Liefert die zuletzt bearbeiteten Notizen im Wiki, sortiert nach Änderungsdatum (neueste zuerst) — exakt dieselbe Reihenfolge wie der Bereich "Zuletzt bearbeitet" auf dem Dashboard. Nutze dieses Werkzeug BEVOR du open_note aufrufst, sobald sich die Anfrage auf die zeitliche Reihenfolge bearbeiteter Notizen bezieht, egal wie kurz oder umgangssprachlich formuliert — z. B. "zuletzt bearbeitet", "das zuletzt Bearbeitete", "die letzte Notiz", "meine neueste Notiz", "woran habe ich zuletzt gearbeitet", "zweitletzte bearbeitete Notiz" (zweiter Eintrag der zurückgegebenen Liste).',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'integer',
            description: 'Maximale Anzahl zurückgegebener Notizen (Standard: 10, Maximum: 30).'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_note',
      description: 'Öffnet eine Notiz direkt im Editor der Benutzeroberfläche (echte Navigation, kein reines Lesen wie read_note). Rufe dieses Werkzeug bei JEDER Anfrage auf, die eine Notiz sichtbar machen/öffnen/starten soll — auch bei kurzen, umgangssprachlichen Formulierungen ohne das Wort "öffne", z. B. "Notiz Fedora", "zeig mir X", "geh zu X", "das zuletzt Bearbeitete", "meine letzte Notiz". Nutze relPath, sobald er bereits sicher bekannt ist (z. B. aus search_notes, list_notes oder get_recent_notes). Nutze title nur, wenn der Nutzer ausschließlich einen Titel genannt hat, keinen Pfad. WICHTIG bei mehreren Notizen mit demselben Titel: Rate NICHT, welche gemeint ist. Das Ergebnis liefert dann "ambiguous": true mit einer Liste von Kandidaten (Titel + Kategorie) — zeige diese dem Nutzer zur Auswahl an und rufe open_note danach erneut mit dem exakten relPath des gewählten Kandidaten auf. Existiert keine passende Notiz, bleibt die aktuelle Ansicht unverändert.',
      parameters: {
        type: 'object',
        properties: {
          relPath: {
            type: 'string',
            description: 'Der bereits sicher aufgelöste relative Pfad der zu öffnenden Notiz (bevorzugt).'
          },
          title: {
            type: 'string',
            description: 'Der genaue Titel der zu öffnenden Notiz, falls der Pfad nicht bekannt ist.'
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

function getWikiTags(projectPath, { limit = 50 } = {}) {
  const maxLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const docs = notesFs.getSearchDocuments(projectPath);
  const tagCounts = new Map();

  for (const doc of docs) {
    if (doc.archived) continue;
    if (Array.isArray(doc.tags)) {
      for (const rawTag of doc.tags) {
        const tag = String(rawTag).trim();
        if (tag) {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
      }
    }
  }

  const sortedTags = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'de'));

  return {
    totalDistinctTags: sortedTags.length,
    tags: sortedTags.slice(0, maxLimit)
  };
}

// KI-Block 1 (Baustein 1): "Zuletzt bearbeitet" für die KI — dieselbe Sortier-
// regel wie buildDashboardViewModel() in renderer/js/dashboard-data.js
// (modified, ersatzweise created, absteigend über String-Vergleich auf den
// ISO-Zeitstempeln). Bewusst keine eigene Zeitquelle und keine eigene Regel:
// weicht die KI-Antwort von "zeigt die zuletzt bearbeitete Notiz" auf dem
// Dashboard ab, wäre das für den Nutzer nicht nachvollziehbar.
function getRecentNotes(projectPath, { limit = 10 } = {}) {
  const maxResults = Math.min(30, Math.max(1, Number(limit) || 10));
  const docs = notesFs.getSearchDocuments(projectPath).filter(doc => !doc.archived);

  const sorted = [...docs].sort((a, b) => {
    const ta = a.modified || a.created || '';
    const tb = b.modified || b.created || '';
    return tb.localeCompare(ta);
  });

  return {
    totalCount: sorted.length,
    notes: sorted.slice(0, maxResults).map(doc => ({
      title: doc.title,
      relPath: doc.relPath,
      categoryPath: doc.categoryPath,
      modified: doc.modified || null,
      created: doc.created || null
    }))
  };
}

// KI-Block 1 (Baustein 3): sichere Titelauflösung für open_note.
// Reihenfolge exakt nach Funktionsvertrag:
//   1. relPath, falls angegeben, gewinnt immer (bereits sicher aufgelöst).
//   2. sonst: exakter Titel (case-sensitive) gewinnt vor case-insensitivem
//      Treffer — beide Stufen getrennt auf Eindeutigkeit geprüft.
//   3. mehrere Treffer auf derselben Stufe: keine automatische Navigation,
//      stattdessen Kandidatenliste (Titel + Kategorie) zur Auswahl.
//   4. kein Treffer: opened:false, aktuelle Ansicht bleibt unverändert.
function resolveNoteForOpen(projectPath, { relPath, title } = {}) {
  const trimmedRelPath = relPath ? String(relPath).trim() : '';
  if (trimmedRelPath) {
    try {
      const note = notesFs.readNote(projectPath, trimmedRelPath);
      return {
        opened: true,
        relPath: note.relPath,
        title: note.frontmatter?.title || path.basename(trimmedRelPath, '.md'),
        category: note.frontmatter?.category || note.frontmatter?.mainCategory || ''
      };
    } catch (error) {
      return { opened: false, error: `Die Notiz unter „${trimmedRelPath}“ wurde nicht gefunden.` };
    }
  }

  const trimmedTitle = title ? String(title).trim() : '';
  if (!trimmedTitle) {
    return { opened: false, error: 'Weder relPath noch title angegeben.' };
  }

  const docs = notesFs.getSearchDocuments(projectPath).filter(doc => !doc.archived);
  const exactMatches = docs.filter(doc => doc.title === trimmedTitle);
  const pool = exactMatches.length > 0
    ? exactMatches
    : docs.filter(doc => (doc.title || '').toLowerCase() === trimmedTitle.toLowerCase());

  if (pool.length === 0) {
    return { opened: false, error: `Keine Notiz mit dem Titel „${trimmedTitle}“ gefunden.` };
  }
  if (pool.length > 1) {
    return {
      opened: false,
      ambiguous: true,
      candidates: pool.map(doc => ({ relPath: doc.relPath, title: doc.title, categoryPath: doc.categoryPath })),
      error: `Mehrere Notizen mit dem Titel „${trimmedTitle}“ gefunden. Bitte anhand der Kategorie auswählen.`
    };
  }

  const match = pool[0];
  return {
    opened: true,
    relPath: match.relPath,
    title: match.title,
    category: match.category || match.mainCategory || ''
  };
}

async function executeAiTool(projectPath, name, args = {}) {
  if (!projectPath) {
    return { success: false, error: 'Kein Wiki-Projektpfad angegeben.' };
  }
  try {
    switch (name) {
      case 'get_wiki_tags':
        return { success: true, data: getWikiTags(projectPath, args) };
      case 'search_notes':
        return { success: true, data: searchNotes(projectPath, args) };
      case 'read_note':
        return { success: true, data: readNote(projectPath, args) };
      case 'list_notes':
        return { success: true, data: listNotes(projectPath, args) };
      case 'get_recent_notes':
        return { success: true, data: getRecentNotes(projectPath, args) };
      case 'open_note':
        return { success: true, data: resolveNoteForOpen(projectPath, args) };
      case 'propose_create_note': {
        const proposal = aiProposals.createProposal(projectPath, {
          type: 'create',
          subCategoryRelPath: args.subCategoryRelPath,
          title: args.title,
          content: args.content,
          tags: args.tags,
          reason: args.reason
        });
        return {
          success: true,
          data: {
            proposalId: proposal.id,
            type: proposal.type,
            title: proposal.title,
            relPath: proposal.relPath,
            sourceRelPath: proposal.sourceRelPath,
            diff: proposal.diff,
            reason: proposal.reason,
            requiresConfirmation: true,
            message: `Änderungsvorschlag für die neue Notiz „${proposal.title}“ wurde erstellt und wartet auf deine Freigabe.`
          }
        };
      }
      case 'propose_update_note': {
        const proposal = aiProposals.createProposal(projectPath, {
          type: 'update',
          relPath: args.relPath,
          content: args.content,
          tags: args.tags,
          reason: args.reason
        });
        return {
          success: true,
          data: {
            proposalId: proposal.id,
            type: proposal.type,
            title: proposal.title,
            relPath: proposal.relPath,
            sourceRelPath: proposal.sourceRelPath,
            diff: proposal.diff,
            reason: proposal.reason,
            requiresConfirmation: true,
            message: `Änderungsvorschlag für Notiz „${proposal.title}“ wurde erstellt und wartet auf deine Freigabe.`
          }
        };
      }
      case 'propose_create_category': {
        const proposal = aiProposals.createProposal(projectPath, {
          type: 'create_category',
          name: args.name,
          parentCategoryRelPath: args.parentCategoryRelPath,
          reason: args.reason
        });
        return {
          success: true,
          data: {
            proposalId: proposal.id,
            type: proposal.type,
            title: proposal.title,
            relPath: proposal.relPath,
            sourceRelPath: proposal.sourceRelPath,
            diff: proposal.diff,
            reason: proposal.reason,
            requiresConfirmation: true,
            message: `Vorschlag zum Anlegen der Kategorie „${proposal.title}“ wurde erstellt und wartet auf deine Freigabe.`
          }
        };
      }
      case 'propose_move_note': {
        const proposal = aiProposals.createProposal(projectPath, {
          type: 'move',
          relPath: args.relPath,
          targetSubCategoryRelPath: args.targetSubCategoryRelPath,
          reason: args.reason
        });
        return {
          success: true,
          data: {
            proposalId: proposal.id,
            type: proposal.type,
            title: proposal.title,
            relPath: proposal.relPath,
            sourceRelPath: proposal.sourceRelPath,
            diff: proposal.diff,
            reason: proposal.reason,
            requiresConfirmation: true,
            message: `Vorschlag zum Verschieben von „${proposal.title}“ wurde erstellt und wartet auf deine Freigabe.`
          }
        };
      }
      case 'propose_rename_note': {
        const proposal = aiProposals.createProposal(projectPath, {
          type: 'rename',
          relPath: args.relPath,
          newTitle: args.newTitle,
          reason: args.reason
        });
        return {
          success: true,
          data: {
            proposalId: proposal.id,
            type: proposal.type,
            title: proposal.title,
            relPath: proposal.relPath,
            sourceRelPath: proposal.sourceRelPath,
            diff: proposal.diff,
            reason: proposal.reason,
            requiresConfirmation: true,
            message: `Vorschlag zum Umbenennen von „${proposal.title}“ wurde erstellt und wartet auf deine Freigabe.`
          }
        };
      }
      case 'propose_delete_note': {
        const proposal = aiProposals.createProposal(projectPath, {
          type: 'delete',
          relPath: args.relPath,
          reason: args.reason
        });
        return {
          success: true,
          data: {
            proposalId: proposal.id,
            type: proposal.type,
            title: proposal.title,
            relPath: proposal.relPath,
            sourceRelPath: proposal.sourceRelPath,
            diff: proposal.diff,
            reason: proposal.reason,
            isDanger: true,
            requiresConfirmation: true,
            message: `Vorschlag zum Verschieben von „${proposal.title}“ in den Papierkorb wurde erstellt und wartet auf deine Freigabe.`
          }
        };
      }
      case 'audit_knowledge_base': {
        const report = aiKnowledge.auditKnowledgeBase(projectPath);
        const proposals = [];
        if (Array.isArray(report?.issues?.notesWithoutTags)) {
          for (const note of report.issues.notesWithoutTags.slice(0, 5)) {
            try {
              const parts = String(note.relPath || '').split('/');
              const suggestedTags = [];
              if (parts.length >= 2) {
                const mainClean = parts[0].toLowerCase().replace(/[^a-z0-9äöü]/g, '');
                if (mainClean && mainClean.length > 2) suggestedTags.push(mainClean);
                const subClean = parts[1].toLowerCase().replace(/[^a-z0-9äöü]/g, '');
                if (subClean && subClean !== mainClean) suggestedTags.push(subClean);
              }
              if (suggestedTags.length === 0) {
                suggestedTags.push('notiz');
              }
              const proposal = aiProposals.createProposal(projectPath, {
                type: 'update',
                relPath: note.relPath,
                title: note.title,
                tags: suggestedTags,
                reason: `Vorgeschlagene Tags: #${suggestedTags.join(' #')}`
              });
              proposals.push({
                proposalId: proposal.id,
                type: proposal.type,
                title: proposal.title,
                relPath: proposal.relPath,
                sourceRelPath: proposal.sourceRelPath,
                diff: proposal.diff,
                reason: proposal.reason,
                requiresConfirmation: true,
                message: `Änderungsvorschlag für Tags bei „${proposal.title}“ wartet auf deine Freigabe.`
              });
            } catch {}
          }
        }
        return { success: true, data: { ...report, proposals } };
      }
      case 'find_duplicate_notes': {
        let threshold = 0.45;
        if (args.threshold !== undefined && args.threshold !== null) {
          const t = Number(args.threshold);
          if (Number.isFinite(t) && t >= 0.1 && t <= 1.0) {
            threshold = t;
          } else {
            return { success: false, error: 'Ungültiger Ähnlichkeits-Schwellenwert (threshold muss zwischen 0.1 und 1.0 liegen).' };
          }
        }
        const duplicates = aiKnowledge.findDuplicateNotes(projectPath, {
          query: args.query,
          threshold
        });
        return { success: true, data: duplicates };
      }
      case 'suggest_wikilinks': {
        let limit = 15;
        if (args.limit !== undefined && args.limit !== null) {
          const l = Number(args.limit);
          if (Number.isInteger(l) && l >= 1 && l <= 100) {
            limit = l;
          } else {
            return { success: false, error: 'Ungültiges Limit für Wikilinks (muss eine Ganzzahl zwischen 1 und 100 sein).' };
          }
        }
        const result = aiKnowledge.findWikilinkCandidates(projectPath, {
          relPath: args.relPath,
          title: args.title,
          content: args.content,
          limit
        });
        return { success: true, data: result };
      }
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
  getWikiTags,
  getRecentNotes,
  resolveNoteForOpen,
  executeAiTool,
  auditKnowledgeBase: aiKnowledge.auditKnowledgeBase,
  findDuplicateNotes: aiKnowledge.findDuplicateNotes,
  suggestWikilinks: aiKnowledge.findWikilinkCandidates,
  findWikilinkCandidates: aiKnowledge.findWikilinkCandidates
};
