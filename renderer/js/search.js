// renderer/js/search.js — Schritt 6: Volltextsuche
// Hält EINEN FlexSearch-Index im Speicher (siehe vendor/search-bundle.js).
// rebuildIndex() wird von app.js nach jedem refreshAll() aufgerufen (Projekt
// laden, Notiz anlegen/verschieben/löschen/speichern) — für die realistische
// Notizmenge einer persönlichen Wiki ist ein kompletter Neuaufbau schnell
// genug und deutlich einfacher/robuster als inkrementelle Updates.

import { createSearchIndex } from './vendor/search-bundle.js';
import { getSearchDocuments } from './filesystem.js';

let index = createSearchIndex();
let rebuildGeneration = 0;
let searchState = 'loading';
// Zusätzlich zum reinen FlexSearch-Index die vollen Dokumente behalten —
// für die neuen Ergebnis-Karten (Kategorie/Tags/Ausschnitt) braucht es sonst
// einen zweiten Abruf pro Tastenanschlag, was bei größeren Wikis spürbar
// langsamer wäre.
let docsByRelPath = new Map();

export async function rebuildIndex() {
  const generation = ++rebuildGeneration;
  searchState = 'loading';

  try {
    const docs = await getSearchDocuments();
    const nextIndex = createSearchIndex();
    nextIndex.rebuild(docs);
    const nextDocsByRelPath = new Map(docs.map(d => [d.relPath, d]));

    if (generation !== rebuildGeneration) {
      return { applied: false, state: searchState, generation };
    }

    index = nextIndex;
    docsByRelPath = nextDocsByRelPath;
    searchState = 'ready';
    return { applied: true, state: searchState, generation };
  } catch (error) {
    if (generation !== rebuildGeneration) {
      return { applied: false, state: searchState, generation };
    }

    searchState = 'error';
    throw error;
  }
}

export function getSearchState() {
  return searchState;
}

export function search(query) {
  if (searchState !== 'ready') return [];
  return index.search(query);
}

// Entfernt Markdown-Syntax grob (für lesbare Ausschnitte) — bewusst simpel,
// muss keine perfekte Wiedergabe sein. Wikilinks werden ausschließlich für
// die Ergebnisdarstellung in ihren sichtbaren Text umgewandelt; das Markdown
// der Notiz selbst bleibt unverändert.
function stripMarkdown(text) {
  return String(text || '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_`>~]/g, '')
    .replace(/\s+/g, ' ');
}

// Dieselbe einfache Unicode-Grundnormalisierung wird nur zur Ermittlung der
// sichtbaren Fundstelle verwendet. Sie verändert weder FlexSearch noch dessen
// Trefferreihenfolge. So kann z. B. eine Suche nach "uber" die sichtbare
// Schreibweise "Über" im Ergebnis markieren.
function normalizeForDisplay(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('de');
}

function findDisplayMatch(text, query) {
  const source = String(text || '');
  const normalizedQuery = normalizeForDisplay(query).trim();
  if (!source || !normalizedQuery) return null;

  let normalizedText = '';
  const starts = [];
  const ends = [];
  let sourceOffset = 0;

  for (const char of source) {
    const charStart = sourceOffset;
    sourceOffset += char.length;
    const normalizedChar = normalizeForDisplay(char);
    for (const normalizedPart of normalizedChar) {
      normalizedText += normalizedPart;
      starts.push(charStart);
      ends.push(sourceOffset);
    }
  }

  const normalizedOffset = normalizedText.indexOf(normalizedQuery);
  if (normalizedOffset < 0) return null;
  const normalizedEnd = normalizedOffset + normalizedQuery.length - 1;
  return {
    start: starts[normalizedOffset],
    end: ends[normalizedEnd]
  };
}

function hasDisplayMatch(text, query) {
  return Boolean(findDisplayMatch(text, query));
}

// Liefert für jeden Treffer Titel/Kategorie/Tags + einen kurzen Ausschnitt um
// die erste Fundstelle herum, plus deren Zeichen-Position im Originaltext
// (für den Sprung zur Fundstelle im Editor — siehe jumpToMatch im
// Editor-Bundle). SNIPPET_RADIUS_CHARS ist bewusst einfach gehalten.
const SNIPPET_RADIUS_CHARS = 60;

export function searchWithDetails(query, limit = 30) {
  if (searchState !== 'ready') return { results: [], hasMore: false };

  // Ein zusätzlicher Treffer genügt, um transparent anzuzeigen, dass die
  // sichtbare Liste begrenzt ist. Es entsteht weder Paginierung noch ein
  // zweiter Suchweg.
  const relPaths = index.search(query, limit + 1);
  const hasMore = relPaths.length > limit;
  const visibleRelPaths = relPaths.slice(0, limit);

  const results = visibleRelPaths.map(relPath => {
    const doc = docsByRelPath.get(relPath);
    if (!doc) return null;

    const bodyMatch = findDisplayMatch(doc.body, query);
    const titleMatch = hasDisplayMatch(doc.title, query);
    const matchingTags = (Array.isArray(doc.tags) ? doc.tags : [])
      .map((tag, index) => hasDisplayMatch(tag, query) ? index : -1)
      .filter(index => index >= 0);
    const categoryPath = doc.categoryPath || [doc.mainCategory, doc.subCategory]
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index)
      .join(' / ');
    const categoryMatch = hasDisplayMatch(categoryPath, query)
      || hasDisplayMatch(doc.mainCategory, query)
      || hasDisplayMatch(doc.subCategory, query);

    let matchOffset = -1;
    let snippet = '';
    if (bodyMatch) {
      matchOffset = bodyMatch.start;
      const start = Math.max(0, bodyMatch.start - SNIPPET_RADIUS_CHARS);
      const end = Math.min(doc.body.length, bodyMatch.end + SNIPPET_RADIUS_CHARS);
      snippet = (start > 0 ? '…' : '')
        + stripMarkdown(doc.body.slice(start, end)).trim()
        + (end < doc.body.length ? '…' : '');
    } else {
      // Bei Titel-, Tag- oder Kategorie-Treffern bleibt der Anfang der Notiz
      // als ruhiger Kontext sichtbar, statt einen leeren Ergebnisblock zu zeigen.
      snippet = stripMarkdown(doc.body.slice(0, SNIPPET_RADIUS_CHARS * 2)).trim()
        + (doc.body.length > SNIPPET_RADIUS_CHARS * 2 ? '…' : '');
    }

    return {
      relPath: doc.relPath,
      title: doc.title,
      icon: doc.icon || '',
      category: doc.category || '',
      mainCategory: doc.mainCategory || '',
      subCategory: doc.subCategory || '',
      categoryPath,
      tags: Array.isArray(doc.tags) ? doc.tags : [],
      snippet,
      matchOffset,
      matches: {
        title: titleMatch,
        body: Boolean(bodyMatch),
        tags: matchingTags,
        category: categoryMatch
      }
    };
  }).filter(Boolean);

  return { results, hasMore };
}
