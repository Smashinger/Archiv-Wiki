// main/ai-tools.js — Read-Only Werkzeuge für die lokale KI-Integration (Phase 3).
// Ermöglicht dem KI-Assistenten das Durchsuchen, Auflisten und Lesen von Notizen
// ausschließlich innerhalb des geöffneten Wiki-Projektordners.
// Alle Datei-Operationen sind strikt read-only und durch resolveSafe abgesichert.

'use strict';

const path = require('path');
const notesFs = require('./notes-fs');
const aiProposals = require('./ai-proposals');
const aiKnowledge = require('./ai-knowledge');
const { readProjectConfig } = require('./project');

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
      description: 'Listet vorhandene Notizen im Wiki auf, optional gefiltert nach einer Kategorie. Der Filter erwartet einen EXAKTEN Namen oder Pfad (case-insensitiv), keinen Teilstring — nutze bevorzugt den relPath einer Unterkategorie aus list_categories für eindeutige Ergebnisse. WICHTIG: Existieren zwei unterschiedliche Unterkategorien mit demselben Namen in unterschiedlicher Groß-/Kleinschreibung, liefert das Ergebnis "ambiguous": true mit einer Liste konkreter Pfade (candidates) statt beide stillschweigend zu vermischen — zeige diese dem Nutzer zur Auswahl an und rufe list_notes danach erneut mit dem exakten Pfad auf.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Exakter Name einer Haupt- oder Unterkategorie, oder ihr voller relativer Pfad (z. B. "Alle/Notizen") für eindeutige Treffer.'
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
      description: 'Liefert die zuletzt bearbeiteten Notizen im Wiki, sortiert nach Änderungsdatum (neueste zuerst) — exakt dieselbe Reihenfolge wie der Bereich "Zuletzt bearbeitet" auf dem Dashboard. Nutze dieses Werkzeug BEVOR du open_note aufrufst, sobald sich die Anfrage auf die zeitliche Reihenfolge bearbeiteter Notizen bezieht, egal wie kurz, umgangssprachlich oder als indirekte Frage formuliert — z. B. "zuletzt bearbeitet", "das zuletzt Bearbeitete", "die letzte Notiz", "meine neueste Notiz", "woran habe ich zuletzt gearbeitet", "was war meine letzte Notiz", "zweitletzte bearbeitete Notiz" (zweiter Eintrag der zurückgegebenen Liste). Antworte NICHT nur beschreibend im Fließtext — rufe das Werkzeug tatsächlich auf. WICHTIG: Auch wenn bereits eine andere Notiz geöffnet ist (Block <current_note> vorhanden), ist DIESE nicht automatisch die "zuletzt bearbeitete" — rufe get_recent_notes trotzdem auf, um den tatsächlich aktuellsten Eintrag zu ermitteln, statt dich auf <current_note> zu verlassen.',
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
      description: 'Öffnet eine Notiz direkt im Editor der Benutzeroberfläche (echte Navigation, kein reines Lesen wie read_note). Rufe dieses Werkzeug bei JEDER Anfrage auf, die eine Notiz sichtbar machen/öffnen/starten soll — auch bei kurzen, umgangssprachlichen Formulierungen oder indirekten Fragen ohne das Wort "öffne", z. B. "Notiz Fedora", "zeig mir X", "geh zu X", "das zuletzt Bearbeitete", "meine letzte Notiz", "woran habe ich zuletzt gearbeitet". Das gilt auch dann, wenn bereits eine andere Notiz im Editor offen ist (Block <current_note>) — diese ist NICHT automatisch das Ziel, außer der Nutzer bezieht sich ausdrücklich auf sie. Nutze relPath, sobald er bereits sicher bekannt ist (z. B. aus search_notes, list_notes oder get_recent_notes). Nutze title nur, wenn der Nutzer ausschließlich einen Titel genannt hat, keinen Pfad. WICHTIG bei mehreren Notizen mit demselben Titel: Rate NICHT, welche gemeint ist. Das Ergebnis liefert dann "ambiguous": true mit einer Liste von Kandidaten (Titel + Kategorie) — zeige diese dem Nutzer zur Auswahl an und rufe open_note danach erneut mit dem exakten relPath des gewählten Kandidaten auf. Existiert keine passende Notiz, bleibt die aktuelle Ansicht unverändert.',
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
  },
  {
    type: 'function',
    function: {
      name: 'list_categories',
      description: 'Liefert ein vollständiges, strukturiertes Bild aller Haupt- und Unterkategorien im Wiki: Namen, relative Pfade, Anzahl enthaltener aktiver (nicht archivierter) Notizen, in der aktuell sichtbaren Reihenfolge (wie in der Seitenleiste, inklusive per Drag gesetzter eigener Sortierung). Enthält keine versteckten Ordner, keinen Papierkorb und keine internen Projektdateien. Der <wiki_structure>-Block im Kontext kann bei großen Wikis gekürzt sein — rufe list_categories auf, statt dich bei Fragen zu vorhandenen Kategorien, ihrer genauen Anzahl an Notizen oder ihrer Reihenfolge allein darauf zu verlassen.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_rename_category',
      description: 'Schlägt das Umbenennen einer bestehenden Haupt- ODER Unterkategorie vor (z. B. "Benenne die Hauptkategorie Linux in Linux & System um" oder "Benenne die Unterkategorie Anleitungen in Leitfäden um"). Nutze zuerst list_categories, um den exakten relPath zu ermitteln. Ändert nur den Namen, nicht die Position in der Struktur. Erfordert Bestätigung durch den Nutzer.',
      parameters: {
        type: 'object',
        properties: {
          relPath: {
            type: 'string',
            description: 'Der relative Pfad der umzubenennenden Haupt- oder Unterkategorie (z. B. "Linux" oder "Entwicklung/Anleitungen").'
          },
          newName: {
            type: 'string',
            description: 'Der neue Name der Kategorie.'
          },
          reason: {
            type: 'string',
            description: 'Kurze Begründung für die Umbenennung.'
          }
        },
        required: ['relPath', 'newName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_move_subcategory',
      description: 'Schlägt das Verschieben einer Unterkategorie in eine andere Hauptkategorie vor (z. B. "Verschiebe die Unterkategorie Ollama von Software nach KI"). NUR für Unterkategorien — eine Hauptkategorie kann nicht verschoben werden. Nutze zuerst list_categories, um die exakten relPaths zu ermitteln. Erfordert Bestätigung durch den Nutzer.',
      parameters: {
        type: 'object',
        properties: {
          relPath: {
            type: 'string',
            description: 'Der relative Pfad der zu verschiebenden Unterkategorie (z. B. "Software/Ollama").'
          },
          targetMainCategoryRelPath: {
            type: 'string',
            description: 'Der relative Pfad der Ziel-Hauptkategorie (z. B. "KI").'
          },
          reason: {
            type: 'string',
            description: 'Kurze Begründung für die Verschiebung.'
          }
        },
        required: ['relPath', 'targetMainCategoryRelPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_reorder_entries',
      description: 'Schlägt eine neue sichtbare Reihenfolge vor — entweder für alle Hauptkategorien (parentRelPath weglassen oder leer lassen) oder für die Unterkategorien EINER bestimmten Hauptkategorie (parentRelPath = deren relPath). Ändert NUR die Anzeige-Reihenfolge (wie in der Seitenleiste per Drag&Drop), keine Dateien oder Namen. Nicht erwähnte, tatsächlich vorhandene Einträge werden automatisch ans Ende gehängt, nicht entfernt. Erfordert Bestätigung durch den Nutzer.',
      parameters: {
        type: 'object',
        properties: {
          parentRelPath: {
            type: 'string',
            description: 'Leer/weglassen für die Reihenfolge der Hauptkategorien selbst, sonst der relPath einer Hauptkategorie für ihre Unterkategorien.'
          },
          orderedNames: {
            type: 'array',
            items: { type: 'string' },
            description: 'Die gewünschten Namen (nicht Pfade) in der neuen Reihenfolge, z. B. ["KI", "Entwicklung", "Rezepte"].'
          },
          reason: {
            type: 'string',
            description: 'Kurze Begründung für die neue Reihenfolge.'
          }
        },
        required: ['orderedNames']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyze_category_notes',
      description: 'Liest mehrere Notizen EINER Haupt- oder Unterkategorie in einem einzigen Aufruf (kein eigener Aufruf pro Notiz nötig) — für Aufträge wie "Analysiere alle Notizen in X und plane, wie sie umgeschrieben/sortiert werden sollten". Liefert nur Rohdaten (Titel, Pfad, Tags, Inhalt, gefundene [[Wikilinks]]); die eigentliche Analyse (Textvorschlag, neuer Titel, Position, Zielkategorie, Wikilink-Risiken) formulierst DU selbst daraus. Begrenzt auf standardmäßig 20, maximal 25 Notizen sowie ein Gesamt-Zeichenbudget — sehr große Notizen bekommen status "zu_gross" ohne Inhalt, bei Erreichen des Budgets status "uebersprungen_budget". WICHTIG: Dieses Werkzeug schreibt NICHTS und erzeugt KEINE Proposals — erst nach Rückmeldung des Nutzers zum Gesamtplan folgt ggf. EIN gebündelter propose_batch_content_update-Vorschlag für mehrere Notizen gemeinsam (separater Schritt, siehe dort).',
      parameters: {
        type: 'object',
        properties: {
          categoryRelPath: {
            type: 'string',
            description: 'Der relative Pfad der zu analysierenden Haupt- oder Unterkategorie (z. B. "Wissen/Software").'
          },
          limit: {
            type: 'integer',
            description: 'Maximale Anzahl analysierter Notizen (Standard: 20, absolute Obergrenze: 25).'
          }
        },
        required: ['categoryRelPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_batch_content_update',
      description: 'Schlägt mehrere Notiz-Änderungen (Inhalt, Titel und/oder Ziel-Unterkategorie) GEBÜNDELT als EINEN gemeinsamen Vorschlag vor, statt viele einzelne propose_update_note-Aufrufe zu erzeugen. Nutze dieses Werkzeug NACHDEM zuvor analyze_category_notes aufgerufen wurde UND der Nutzer dem daraus vorgelegten Gesamtplan zugestimmt hat (z. B. "setz das um", "ja, mach das so"). Für JEDE ausgewählte Notiz genau EINEN Eintrag in items übergeben (relPath verpflichtend, mindestens eines von newContent/newTitle/targetSubCategoryRelPath). Ungültige Einzeleinträge (z. B. nicht existierende Notiz, Namenskollision) werden übersprungen und im Vorschlag als Warnung angezeigt statt den gesamten Vorschlag scheitern zu lassen. Der Nutzer kann vor der Übernahme einzelne Notizen in der Vorschau abwählen; beim Anwenden wird jede Notiz unabhängig gespeichert (ein Fehler oder eine zwischenzeitliche Änderung bei EINER Notiz verhindert nicht die anderen). NICHT für Tag-Änderungen (dafür weiterhin propose_update_note) und NICHT für eine neue Reihenfolge (dafür weiterhin propose_reorder_entries) verwenden. Erfordert Bestätigung durch den Nutzer.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            description: 'Liste der einzelnen Notiz-Änderungen, ein Eintrag pro Notiz.',
            items: {
              type: 'object',
              properties: {
                relPath: {
                  type: 'string',
                  description: 'Der relative Pfad der zu ändernden Notiz (z. B. "Alle/Notizen/Fastfetch.md").'
                },
                newContent: {
                  type: 'string',
                  description: 'Optionaler vollständiger neuer Markdown-Inhalt. Weglassen, wenn nur Titel oder Kategorie geändert werden soll.'
                },
                newTitle: {
                  type: 'string',
                  description: 'Optionaler neuer Titel der Notiz.'
                },
                targetSubCategoryRelPath: {
                  type: 'string',
                  description: 'Optionale neue Ziel-Unterkategorie (Tiefe 2), falls die Notiz in eine andere Kategorie verschoben werden soll.'
                }
              },
              required: ['relPath']
            }
          },
          reason: {
            type: 'string',
            description: 'Kurze, für den Nutzer verständliche Begründung für den gesamten Batch (z. B. "Vereinfachte Sprache und aktualisierte Tags gemäß Analyse").'
          }
        },
        required: ['items']
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

function noteSummary(doc) {
  return {
    title: doc.title,
    relPath: doc.relPath,
    categoryPath: doc.categoryPath,
    tags: doc.tags || []
  };
}

// Bugfix (Nutzerfund 25.09.2026): listNotes() filterte bisher per
// ungeankertem, kleingeschriebenem Teilstring über category/mainCategory/
// categoryPath gleichzeitig. Dadurch matchte z. B. ein Filter "Notizen"
// jede Kategorie, die diese Zeichenfolge irgendwo enthielt (auch "Wichtige
// Notizen" oder eine völlig andere Hauptkategorie mit "notizen" im Namen)
// UND vermischte im echten Testwiki zwei tatsächlich unterschiedliche
// Unterkategorien ("Alle/Notizen" und "Alle/NOTIZEN") unbemerkt zu einem
// einzigen Ergebnis. Löst jetzt exakt auf, in derselben Reihenfolge wie
// resolveNoteForOpen() für Notiztitel: voller Pfad vor bloßem Namen, jeweils
// case-sensitiv vor case-insensitiv. Ein Hauptkategorie-Name darf bewusst
// mehrere Unterkategorien zusammenfassen (das ist der gewollte Sammel-Fall);
// trifft ein Unterkategorie-Name dagegen auf mehr als einen eigenständigen
// Ordnerpfad, wird NICHT stillschweigend vermischt, sondern eine
// Kandidatenliste zurückgegeben — dasselbe Prinzip wie bei mehreren
// gleichnamigen Notiztiteln.
function resolveCategoryScope(docs, rawFilter) {
  const folderPathOf = (doc) => path.dirname(doc.relPath).replace(/\\/g, '/');
  const lowerFilter = rawFilter.toLowerCase();

  const byExactFolderPath = (caseSensitive) => docs.filter(doc => {
    const folderPath = folderPathOf(doc);
    return (caseSensitive ? folderPath : folderPath.toLowerCase()) === (caseSensitive ? rawFilter : lowerFilter);
  });
  const byExactMainCategory = (caseSensitive) => docs.filter(doc => {
    const mainCat = doc.mainCategory || '';
    return (caseSensitive ? mainCat : mainCat.toLowerCase()) === (caseSensitive ? rawFilter : lowerFilter);
  });
  const byExactSubCategory = (caseSensitive) => docs.filter(doc => {
    const cat = doc.category || '';
    return (caseSensitive ? cat : cat.toLowerCase()) === (caseSensitive ? rawFilter : lowerFilter);
  });

  for (const matched of [byExactFolderPath(true), byExactFolderPath(false), byExactMainCategory(true)]) {
    if (matched.length > 0) return { matched };
  }

  for (const matched of [byExactSubCategory(true), byExactMainCategory(false), byExactSubCategory(false)]) {
    if (matched.length === 0) continue;
    const distinctFolderPaths = [...new Set(matched.map(folderPathOf))];
    if (distinctFolderPaths.length > 1) return { ambiguous: true, candidatePaths: distinctFolderPaths.sort() };
    return { matched };
  }

  return { matched: [] };
}

function listNotes(projectPath, { category = '', limit = 15 } = {}) {
  const maxResults = Math.min(50, Math.max(1, Number(limit) || 15));
  const docs = notesFs.getSearchDocuments(projectPath).filter(doc => !doc.archived);
  const rawFilter = String(category || '').trim();

  if (!rawFilter) {
    const sorted = [...docs].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de'));
    return {
      category: null,
      totalCount: sorted.length,
      notes: sorted.slice(0, maxResults).map(noteSummary)
    };
  }

  const scope = resolveCategoryScope(docs, rawFilter);
  if (scope.ambiguous) {
    return {
      category: rawFilter,
      ambiguous: true,
      candidates: scope.candidatePaths.map(candidatePath => ({ path: candidatePath })),
      totalCount: 0,
      notes: []
    };
  }

  const sorted = [...scope.matched].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de'));
  return {
    category: rawFilter,
    totalCount: sorted.length,
    notes: sorted.slice(0, maxResults).map(noteSummary)
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

// KI-Block 2: vollständige, strukturierte Kategorieliste. Nutzt bewusst
// dieselben Bausteine wie die Seitenleiste (notesFs.listProjectTree für
// Struktur + Ausschluss von versteckten/internen Einträgen und Papierkorb,
// notesFs.applyChildOrder für die per Drag gesetzte sichtbare Reihenfolge)
// statt einer eigenen zweiten Baum-/Sortierlogik.
function countActiveNotes(node) {
  if (node.type === 'note') return node.frontmatter?.archived ? 0 : 1;
  if (node.type === 'folder') {
    return (node.children || []).reduce((sum, child) => sum + countActiveNotes(child), 0);
  }
  return 0;
}

function listCategories(projectPath) {
  let tree = notesFs.listProjectTree(projectPath);

  // Fehlende/kaputte .wiki-config.json ist für eine reine Auflistung kein
  // Fehlerfall — die Reihenfolge bleibt dann einfach die alphabetische aus
  // listProjectTree() (dieselbe Rückfallregel wie beim ersten Laden eines
  // Projekts, bevor überhaupt einmal etwas per Drag umsortiert wurde).
  let config = {};
  try {
    const stored = readProjectConfig(projectPath);
    if (stored) config = stored;
  } catch { /* siehe Kommentar oben */ }

  if (config.childOrder) tree = notesFs.applyChildOrder(tree, '', config.childOrder);

  // Notizen direkt unter einer Hauptkategorie (ältere/abweichende Strukturen,
  // siehe getDepth()-Kommentar in notes-fs.js) fließen in deren noteCount ein,
  // erscheinen aber bewusst nicht als eigene "Unterkategorie" — list_categories
  // bildet nur echte Ordner als Kategorien ab.
  const mainCategories = tree
    .filter(node => node.type === 'folder')
    .map(mainNode => {
      const subCategories = (mainNode.children || [])
        .filter(child => child.type === 'folder')
        .map(subNode => ({
          name: subNode.name,
          relPath: subNode.relPath,
          noteCount: countActiveNotes(subNode)
        }));
      return {
        name: mainNode.name,
        relPath: mainNode.relPath,
        noteCount: countActiveNotes(mainNode),
        subCategories
      };
    });

  return {
    totalMainCategories: mainCategories.length,
    totalSubCategories: mainCategories.reduce((sum, m) => sum + m.subCategories.length, 0),
    categories: mainCategories
  };
}

// KI-Block 4: reine Batch-Analyse. Liest mehrere Notizen EINER Kategorie in
// einem einzigen Werkzeugaufruf (kein eigener Modell-Aufruf pro Notiz nötig)
// und liefert dem Modell die Rohdaten, mit denen es selbst einen Plan
// formuliert — dieses Werkzeug bewertet oder verändert nichts inhaltlich,
// es begrenzt nur Menge und Umfang der gelesenen Daten. Schreibt nichts.
const ANALYZE_DEFAULT_LIMIT = 20;
const ANALYZE_HARD_LIMIT = 25;
// Gesamtbudget über den ganzen Auftrag hinweg (Schutz vor Kontext-Überlauf
// bei vielen mittelgroßen Notizen zusammen), zusätzlich zum Einzel-Limit
// unten für eine einzelne sehr große Notiz.
const ANALYZE_MAX_TOTAL_CHARS = 60000;
const ANALYZE_MAX_PER_NOTE_CHARS = 8000;

// Grobe, rein lexikalische Erkennung von [[Wikilink]]- bzw. [[Ziel|Anzeige]]-
// Syntax — dieselbe Zwecksetzung wie die vorhandene Wikilink-Erkennung in
// ai-knowledge.js, hier aber bewusst nur als Rohdaten-Liste ohne eigene
// Bewertung ("Risiko" bleibt die Einschätzung des Modells anhand des bereits
// mitgelieferten Inhalts, keine zweite Audit-Logik).
function extractWikilinkTargets(body) {
  const targets = new Set();
  const pattern = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let match;
  while ((match = pattern.exec(body)) !== null) {
    const target = match[1].trim();
    if (target) targets.add(target);
  }
  return [...targets];
}

function analyzeCategoryNotes(projectPath, { categoryRelPath, limit } = {}) {
  const cleanCategory = String(categoryRelPath || '').trim();
  if (!cleanCategory) {
    throw new Error('categoryRelPath muss angegeben werden.');
  }
  const kind = notesFs.classifyEntry(projectPath, cleanCategory);
  if (kind !== 'mainCategory' && kind !== 'subCategory') {
    throw new Error('categoryRelPath muss eine Haupt- oder Unterkategorie sein.');
  }

  const prefix = `${cleanCategory}/`;
  const allInCategory = notesFs.getSearchDocuments(projectPath)
    .filter(doc => !doc.archived && doc.relPath.startsWith(prefix))
    .sort((a, b) => a.relPath.localeCompare(b.relPath, 'de'));

  const maxResults = Math.min(ANALYZE_HARD_LIMIT, Math.max(1, Number(limit) || ANALYZE_DEFAULT_LIMIT));
  const selected = allInCategory.slice(0, maxResults);
  const omittedByLimit = allInCategory.length - selected.length;

  let remainingBudget = ANALYZE_MAX_TOTAL_CHARS;
  let totalCharsRead = 0;
  const notes = selected.map(doc => {
    const sizeChars = (doc.body || '').length;
    if (sizeChars > ANALYZE_MAX_PER_NOTE_CHARS) {
      return {
        title: doc.title,
        relPath: doc.relPath,
        categoryPath: doc.categoryPath,
        tags: doc.tags || [],
        sizeChars,
        status: 'zu_gross',
        truncated: false,
        content: null,
        wikilinks: []
      };
    }
    if (remainingBudget <= 0) {
      return {
        title: doc.title,
        relPath: doc.relPath,
        categoryPath: doc.categoryPath,
        tags: doc.tags || [],
        sizeChars,
        status: 'uebersprungen_budget',
        truncated: false,
        content: null,
        wikilinks: []
      };
    }
    const takeChars = Math.min(sizeChars, remainingBudget);
    const truncated = takeChars < sizeChars;
    const content = (doc.body || '').slice(0, takeChars);
    remainingBudget -= takeChars;
    totalCharsRead += takeChars;
    return {
      title: doc.title,
      relPath: doc.relPath,
      categoryPath: doc.categoryPath,
      tags: doc.tags || [],
      sizeChars,
      status: 'lesbar',
      truncated,
      content,
      wikilinks: extractWikilinkTargets(content)
    };
  });

  return {
    categoryRelPath: cleanCategory,
    totalNotesInCategory: allInCategory.length,
    includedCount: notes.length,
    omittedByLimitCount: omittedByLimit,
    totalCharsRead,
    notes
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
      case 'list_categories':
        return { success: true, data: listCategories(projectPath) };
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
      case 'propose_rename_category': {
        const proposal = aiProposals.createProposal(projectPath, {
          type: 'rename_category',
          relPath: args.relPath,
          newName: args.newName,
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
            message: `Vorschlag zum Umbenennen von „${proposal.sourceRelPath}“ in „${proposal.title}“ wurde erstellt und wartet auf deine Freigabe.`
          }
        };
      }
      case 'propose_move_subcategory': {
        const proposal = aiProposals.createProposal(projectPath, {
          type: 'move_subcategory',
          relPath: args.relPath,
          targetMainCategoryRelPath: args.targetMainCategoryRelPath,
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
            message: `Vorschlag zum Verschieben von „${proposal.sourceRelPath}“ nach „${proposal.relPath}“ wurde erstellt und wartet auf deine Freigabe.`
          }
        };
      }
      case 'propose_reorder_entries': {
        const proposal = aiProposals.createProposal(projectPath, {
          type: 'reorder_entries',
          parentRelPath: args.parentRelPath,
          orderedNames: args.orderedNames,
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
            message: `Vorschlag zur neuen Reihenfolge von „${proposal.title}“ wurde erstellt und wartet auf deine Freigabe.`
          }
        };
      }
      case 'analyze_category_notes':
        return { success: true, data: analyzeCategoryNotes(projectPath, args) };
      case 'propose_batch_content_update': {
        const proposal = aiProposals.createProposal(projectPath, {
          type: 'batch_update',
          items: args.items,
          reason: args.reason
        });
        return {
          success: true,
          data: {
            proposalId: proposal.id,
            type: proposal.type,
            title: proposal.title,
            reason: proposal.reason,
            counts: proposal.counts,
            warnings: proposal.warnings,
            // Nur die für Vorschau/Anwenden nötigen Felder je Notiz zurückgeben
            // (relPath, Titel, Diff) — der vollständige neue/alte Inhalt bleibt
            // serverseitig im Proposal (activeProposals) und wird nicht doppelt
            // in den Modellkontext zurückgespeist (derselbe Grundsatz wie beim
            // einzelnen propose_update_note, das ebenfalls nur diff liefert).
            items: (proposal.items || []).map(item => ({
              relPath: item.relPath,
              targetRelPath: item.targetRelPath,
              title: item.title,
              newTitle: item.newTitle,
              targetSubCategoryRelPath: item.targetSubCategoryRelPath,
              diff: item.diff
            })),
            requiresConfirmation: true,
            message: `Batch-Vorschlag für ${proposal.counts?.total ?? 0} Notiz(en) wurde erstellt und wartet auf deine Freigabe.`
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
  listCategories,
  analyzeCategoryNotes,
  executeAiTool,
  auditKnowledgeBase: aiKnowledge.auditKnowledgeBase,
  findDuplicateNotes: aiKnowledge.findDuplicateNotes,
  suggestWikilinks: aiKnowledge.findWikilinkCandidates,
  findWikilinkCandidates: aiKnowledge.findWikilinkCandidates
};
