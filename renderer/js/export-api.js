// renderer/js/export-api.js
// Dünne Schicht über archivAPI.exportApi.* (preload.js) — PDF-/HTML-/
// Markdown-Export einzelner Notizen sowie ZIP-Export des gesamten Projekts.
// Kein eigener State, keine Geschäftslogik.

export async function saveMarkdownExport(markdown, suggestedName) {
  return window.archivAPI.exportApi.saveMarkdown(markdown, suggestedName);
}

export async function saveHtmlExport(html, suggestedName) {
  return window.archivAPI.exportApi.saveHtml(html, suggestedName);
}

export async function exportNotePdf(suggestedName) {
  return window.archivAPI.exportApi.notePdf(suggestedName);
}

export async function exportProjectZip() {
  return window.archivAPI.exportApi.projectZip();
}
