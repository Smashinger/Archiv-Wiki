// build/search-entry.js — Schritt 6: Volltextsuche
// Kapselt FlexSearch (Document-Index über Titel/Inhalt/Tags/Kategorien) in eine schlanke
// API, die app.js nutzt. Wird von build/build.mjs zu
// renderer/js/vendor/search-bundle.js gebündelt (dieselbe Begründung wie
// beim Editor-Bundle: FlexSearch nutzt intern bare-specifier-Importe, die ein
// Browser ohne Hilfsmittel nicht auflösen kann).

import { Document } from 'flexsearch';

export function createSearchIndex() {
  let index = new Document({
    document: {
      id: 'relPath',
      index: ['title', 'body', 'tags', 'categories']
    },
    tokenize: 'forward'
  });

  return {
    // Baut den Index komplett neu auf (einfacher & robuster als inkrementelles
    // Update/Remove bei jeder Notiz-Änderung — für die realistische Notizmenge
    // einer persönlichen Wiki (siehe Zielvorgabe <200ms/1000 Notizen) schnell genug).
    rebuild(docs) {
      index = new Document({
        document: { id: 'relPath', index: ['title', 'body', 'tags', 'categories'] },
        tokenize: 'forward'
      });
      for (const doc of docs) {
        index.add({
          relPath: doc.relPath,
          title: doc.title || '',
          body: doc.body || '',
          tags: Array.isArray(doc.tags) ? doc.tags.join(' ') : (doc.tags || ''),
          categories: [doc.mainCategory, doc.subCategory, doc.categoryPath].filter(Boolean).join(' ')
        });
      }
    },

    // Gibt die relPaths aller Treffer zurück, ohne Duplikate, ohne Reihenfolge-Garantie.
    // fields (Schritt B1 — Suchbereich): optionale Teilmenge der oben indexierten
    // Felder, um die Suche gezielt auf z. B. nur "title" einzuschränken. FlexSearch
    // unterstützt das bereits nativ über die index-Option — ohne fields wird wie
    // bisher über alle vier Felder gesucht.
    search(query, limit = 50, fields) {
      const q = String(query || '').trim();
      if (!q) return [];
      const searchFields = Array.isArray(fields) && fields.length ? fields : ['title', 'body', 'tags', 'categories'];
      const raw = index.search(q, { index: searchFields, merge: true, limit });
      return raw.map(r => r.id);
    }
  };
}
