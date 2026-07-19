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

export async function rebuildIndex() {
  const docs = await getSearchDocuments();
  index.rebuild(docs);
  ready = true;
}

export function search(query) {
  if (!ready) return [];
  return index.search(query);
}
