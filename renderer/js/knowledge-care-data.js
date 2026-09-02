// renderer/js/knowledge-care-data.js
// Designunabhängiger Datenvertrag der Wissenspflege-Ansicht (Phase 2C der
// Multi-Design-Vorbereitung). Kein DOM, kein HTML, kein CSS, keine
// Classic-IDs, keine Event-Listener, keine Seiteneffekte.
//
// WICHTIG: Die eigentliche Prüf-/Fachlogik liegt unverändert in
// knowledge-audit.js und wird hier ausschließlich AUFGERUFEN, nicht
// dupliziert. Dieses Modul beantwortet nur eine Frage, die bisher
// ausschließlich im Classic-Renderer beantwortet wurde:
// „Woraus besteht die Wissenspflege — welche Prüfungen gehören dazu, mit
// welchen Eingangsdaten, in welcher Reihenfolge?“
//
// Dadurch muss ein späteres alternatives Design weder die Namen der drei
// Prüffunktionen noch deren jeweilige Argumentlisten kennen; es ruft eine
// Funktion auf und erhält die vollständigen Ergebnisse.

import { findBrokenWikiLinks, findNotesWithoutTags, findEmptyNotes } from './knowledge-audit.js';

/**
 * Baut das reine Wissenspflege-View-Model.
 *
 * Die drei Ergebnislisten sind bereits in knowledge-audit.js fertig
 * aufbereitet und sortiert (deutsche Sortierung nach Titel bzw. nach
 * Quelltitel und Ziel) — hier wird bewusst NICHT erneut sortiert oder
 * gefiltert, damit es je Prüfung nur eine Regelstelle gibt.
 *
 * @param {object} input
 * @param {Array} input.notes Notizen aus dem geladenen Projektbaum.
 * @param {Array} input.documents Suchdokumente (`{ relPath, body }`) für die
 *   Prüfungen, die den Notiztext benötigen.
 * @returns {{
 *   brokenLinks: Array<{ sourceRelPath: string, sourceTitle: string, target: string, displayText: string, syntax: string }>,
 *   notesWithoutTags: Array<{ relPath: string, title: string, category: string }>,
 *   emptyNotes: Array<{ relPath: string, title: string, category: string }>
 * }}
 */
export function buildKnowledgeCareViewModel({ notes, documents }) {
  // Aufrufreihenfolge bewusst identisch zur bisherigen Inline-Fassung.
  return {
    brokenLinks: findBrokenWikiLinks(notes, documents),
    notesWithoutTags: findNotesWithoutTags(notes),
    emptyNotes: findEmptyNotes(notes, documents)
  };
}
