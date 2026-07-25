// renderer/js/search.js — Schritt 6: Volltextsuche
// Hält EINEN FlexSearch-Index im Speicher (siehe vendor/search-bundle.js).
// rebuildIndex() wird von app.js nach jedem refreshAll() aufgerufen (Projekt
// laden, Notiz anlegen/verschieben/löschen/speichern) — für die realistische
// Notizmenge einer persönlichen Wiki ist ein kompletter Neuaufbau schnell
// genug und deutlich einfacher/robuster als inkrementelle Updates.

import { createSearchIndex } from './vendor/search-bundle.js';
import { getSearchDocuments } from './filesystem.js';

const index = createSearchIndex();
let ready = false;
// Zusätzlich zum reinen FlexSearch-Index die vollen Dokumente behalten —
// für die neuen Ergebnis-Karten (Kategorie/Tags/Ausschnitt) braucht es sonst
// einen zweiten Abruf pro Tastenanschlag, was bei größeren Wikis spürbar
// langsamer wäre.
let docsByRelPath = new Map();

export async function rebuildIndex() {
  const docs = await getSearchDocuments();
  index.rebuild(docs);
  docsByRelPath = new Map(docs.map(d => [d.relPath, d]));
  ready = true;
}

export function search(query) {
  if (!ready) return [];
  return index.search(query);
}

// Entfernt Markdown-Syntax grob (für lesbare Ausschnitte) — bewusst simpel,
// muss keine perfekte Wiedergabe sein, nur störende Zeichen wie #/*/[]() weg.
function stripMarkdown(text) {
  return text.replace(/[#*_`>~]|\[([^\]]*)\]\([^)]*\)/g, (m, label) => label ?? '').replace(/\s+/g, ' ');
}

// Liefert für jeden Treffer Titel/Kategorie/Tags + einen kurzen Ausschnitt um
// die erste Fundstelle herum, plus deren Zeichen-Position im Originaltext
// (für den Sprung zur Fundstelle im Editor — siehe jumpToMatch im
// Editor-Bundle). SNIPPET_RADIUS_WORDS grob in Zeichen statt echter
// Wort-Tokenisierung — für kurze Ausschnitte reicht das, ohne zusätzliche
// Bibliothek/Aufwand.
const SNIPPET_RADIUS_CHARS = 60;

export function searchWithDetails(query, limit = 30) {
  if (!ready) return [];
  const relPaths = index.search(query).slice(0, limit);
  const q = query.trim().toLowerCase();
  return relPaths.map(relPath => {
    const doc = docsByRelPath.get(relPath);
    if (!doc) return null;
    const bodyLower = doc.body.toLowerCase();
    const titleLower = doc.title.toLowerCase();
    let matchOffset = bodyLower.indexOf(q);
    let snippet = '';
    if (matchOffset >= 0) {
      const start = Math.max(0, matchOffset - SNIPPET_RADIUS_CHARS);
      const end = Math.min(doc.body.length, matchOffset + q.length + SNIPPET_RADIUS_CHARS);
      snippet = (start > 0 ? '…' : '') + stripMarkdown(doc.body.slice(start, end)).trim() + (end < doc.body.length ? '…' : '');
    } else if (titleLower.includes(q)) {
      // Treffer nur im Titel/Tags, nicht im Fließtext — Anfang der Notiz zeigen statt gar nichts.
      snippet = stripMarkdown(doc.body.slice(0, SNIPPET_RADIUS_CHARS * 2)).trim() + (doc.body.length > SNIPPET_RADIUS_CHARS * 2 ? '…' : '');
      matchOffset = -1;
    }
    return {
      relPath: doc.relPath,
      title: doc.title,
      category: doc.category || '',
      tags: Array.isArray(doc.tags) ? doc.tags : [],
      snippet,
      matchOffset
    };
  }).filter(Boolean);
}
