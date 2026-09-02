// renderer/js/incoming-data.js
// Designunabhängige Datenlogik der Eingang-Ansicht (Phase 2E der Multi-
// Design-Vorbereitung). Kein DOM, kein HTML, kein CSS, keine Classic-IDs,
// keine Event-Listener, keine Seiteneffekte, kein IPC.
//
// Diese Funktionen sind hierher VERSCHOBEN, nicht neu erfunden: sie lagen
// zuvor unverändert inline in app.js und wurden dort bereits von mehreren
// Ansichten gemeinsam genutzt (Eingang-Liste, Eingang-Detailseite,
// Notiz-Entwurf aus einem Eingang-Eintrag). Diese Mehrfachnutzung ist der
// Beleg, dass es sich bereits um geteilte, designunabhängige Logik handelt.
//
// Bewusst NICHT hier: incomingListIconSrc() (Classic-Icon-Pfad, bleibt in
// app.js), incomingEditorContent() und incomingSourceMetadata() (gehören zur
// Verarbeitung eines Eingang-Eintrags zu einer Notiz bzw. zu den
// Herkunftsfeldern im Frontmatter — beides ausdrücklich Fachlogik, die nicht
// Teil von Phase 2E ist).

function normalizeIncomingType(entry) {
  return String(entry?.type || '').trim().toLowerCase();
}

/**
 * Liefert den ersten nicht-leeren, getrimmten String aus den übergebenen
 * Werten — der zentrale Fallback-Baustein für alle Eingang-Ableitungen.
 */
export function incomingFirstText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function isIncomingWebpage(entry) {
  const type = normalizeIncomingType(entry);
  return type === 'web' || type === 'website' || type === 'webpage' || type === 'url';
}

export function incomingTypeLabel(entry) {
  const type = normalizeIncomingType(entry);
  const labels = {
    text: 'Text',
    web: 'Webseite',
    website: 'Webseite',
    webpage: 'Webseite',
    url: 'Webseite',
    file: 'Datei',
    image: 'Bild'
  };
  return labels[type] || 'Eingang';
}

/**
 * Fallback-Reihenfolge für das sichtbare Label eines Eingang-Eintrags:
 * expliziter Titel/Datei-/Name-Feld -> erste Zeile eines Text-Inhalts
 * (auf 72 Zeichen gekürzt) -> URL/Quelle -> fester Platzhaltertext.
 */
export function incomingDisplayTitle(entry) {
  const explicit = incomingFirstText(entry?.title, entry?.name, entry?.fileName, entry?.filename);
  if (explicit) return explicit;

  const text = incomingFirstText(entry?.text, entry?.content);
  if (text) {
    const firstLine = text.split(/\r?\n/, 1)[0].trim();
    if (firstLine) return firstLine.length > 72 ? firstLine.slice(0, 69) + '…' : firstLine;
  }

  const source = incomingFirstText(entry?.url, entry?.sourceUrl, entry?.source?.url);
  return source || 'Eingang ohne Titel';
}

/**
 * Sichtbare Vorschau eines Eingang-Eintrags, je nach Typ unterschiedlich
 * priorisiert (Bild/Datei/Webseite/generischer Fallback).
 */
export function incomingPreview(entry) {
  const type = normalizeIncomingType(entry);
  const fileName = incomingFirstText(
    entry?.fileName,
    entry?.filename,
    entry?.attachment?.fileName,
    entry?.source?.fileName,
    entry?.source?.filename
  );

  if (type === 'image') {
    const sourceUrl = incomingFirstText(entry?.sourceUrl, entry?.url, entry?.source?.url);
    const imageLabel = fileName ? `Bild: ${fileName}` : 'Bild-Anhang';
    return sourceUrl ? `${imageLabel} · Quelle: ${sourceUrl}` : imageLabel;
  }
  if (type === 'file') return fileName ? `Datei: ${fileName}` : 'Datei-Anhang';

  if (isIncomingWebpage(entry)) {
    const sourceUrl = incomingFirstText(entry?.url, entry?.sourceUrl, entry?.source?.url);
    const contentPreview = incomingFirstText(entry?.excerpt, entry?.text, entry?.content).replace(/\s+/g, ' ');
    if (contentPreview) {
      const text = contentPreview.length > 120 ? contentPreview.slice(0, 117) + '…' : contentPreview;
      return sourceUrl ? `${text} · Quelle: ${sourceUrl}` : text;
    }
    if (sourceUrl) return `Quelle: ${sourceUrl}`;
  }

  const preview = incomingFirstText(
    entry?.excerpt,
    entry?.text,
    entry?.content,
    entry?.url,
    entry?.sourceUrl,
    entry?.source?.url,
    fileName
  ).replace(/\s+/g, ' ');

  if (!preview) return 'Noch keine Vorschau verfügbar.';
  return preview.length > 180 ? preview.slice(0, 177) + '…' : preview;
}

/**
 * Baut das reine Eingang-Listen-View-Model. Das rohe Eingang-Objekt bleibt
 * je Eintrag erhalten (`entry`) — Classic verwendet es weiterhin unverändert
 * für Checkbox-Dataset, Klick-Navigation und den eigenen, hier bewusst NICHT
 * berührten Eingang-Auswahlzustand.
 *
 * @param {Array} entries Rohe Eingang-Einträge aus incoming.loadIncoming().
 * @returns {{
 *   totalCount: number,
 *   entries: Array<{
 *     entry: object,
 *     id: string | null,
 *     type: string,
 *     title: string,
 *     typeLabel: string,
 *     preview: string,
 *     createdAt: string | null
 *   }>
 * }}
 */
export function buildIncomingViewModel(entries) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  return {
    totalCount: safeEntries.length,
    entries: safeEntries.map(entry => ({
      entry,
      id: typeof entry?.id === 'string' ? entry.id : null,
      type: normalizeIncomingType(entry),
      title: incomingDisplayTitle(entry),
      typeLabel: incomingTypeLabel(entry),
      preview: incomingPreview(entry),
      // Dieselbe Fallback-Reihenfolge wie zuvor inline in renderIncoming():
      // createdAt, ersatzweise updatedAt. Formatierung bleibt Classic-Sache
      // (formatAbsoluteDate() in app.js).
      createdAt: entry?.createdAt || entry?.updatedAt || null
    }))
  };
}
