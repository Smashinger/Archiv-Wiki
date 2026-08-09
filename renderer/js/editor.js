// renderer/js/editor.js — Schritt 4
// Verbindet den gebündelten Editor (vendor/editor-bundle.js) mit dem
// Dateisystem-Modul: öffnet Notizen, hält den Editor-State, kümmert sich um
// Live-Vorschau und konfigurierbares Auto-Save (Intervall aus der
// Wizard-Konfiguration, 0 = Aus).

import { createMarkdownEditor, renderPreview } from './vendor/editor-bundle.js';
import { readNote, saveNote } from './filesystem.js';

let currentEditor = null;
let currentRelPath = null;
let currentProjectPath = null;
let autosaveTimer = null;
// Vorschau-Entprellung (Nutzer-Feature): exakt dasselbe Prinzip wie
// autosaveTimer direkt darunter — Timer wird bei jeder Änderung
// zurückgesetzt, löst erst nach einer kurzen Schreibpause tatsächlich aus.
let previewDebounceTimer = null;
let dirty = false;
// Sync-Scroll (Nutzer-Feature): ein/ausschaltbar, Standardwert an.
let syncScrollEnabled = true;
// Auto-Save-Intervall (Bugfix, Editor-Audit Phase 10): als Modul-Variable
// gehalten (statt nur als einmaliger Parameter beim Öffnen), damit eine
// Änderung in den Einstellungen sofort wirkt, ohne die Notiz erneut öffnen
// zu müssen — exakt dasselbe Prinzip wie syncScrollEnabled/
// setSyncScrollEnabled direkt darüber. onSaved/onSaveError ebenfalls als
// Modul-Variablen gehalten, damit ein bereits laufender Timer bei einer
// Intervalländerung mit den richtigen Callbacks neu geplant werden kann.
let currentAutoSaveSeconds = 30;
let currentOnSaved = null;
let currentOnSaveError = null;
let currentPreviewContainer = null;
let currentPreviewSearch = { search: '', caseSensitive: false, regexp: false, wholeWord: false };
export function setSyncScrollEnabled(enabled) { syncScrollEnabled = enabled; }

function clearPreviewSearchHighlights() {
  if (!currentPreviewContainer) return;
  currentPreviewContainer.querySelectorAll('mark.preview-search-match').forEach((mark) => {
    mark.replaceWith(document.createTextNode(mark.textContent || ''));
  });
  currentPreviewContainer.normalize();
}

function buildPreviewSearchRegex(spec) {
  if (!spec?.search) return null;
  let source = spec.search;
  if (!spec.regexp) source = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (spec.wholeWord) source = `\\b(?:${source})\\b`;
  try { return new RegExp(source, spec.caseSensitive ? 'g' : 'gi'); }
  catch { return null; }
}

function applyPreviewSearchHighlights() {
  clearPreviewSearchHighlights();
  const regex = buildPreviewSearchRegex(currentPreviewSearch);
  if (!currentPreviewContainer || !regex) return;

  const blocked = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'BUTTON']);
  const walker = document.createTreeWalker(currentPreviewContainer, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || blocked.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return node.nodeValue ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach((node) => {
    const text = node.nodeValue || '';
    regex.lastIndex = 0;
    let match;
    let last = 0;
    let found = false;
    const fragment = document.createDocumentFragment();
    while ((match = regex.exec(text))) {
      if (!match[0]) { regex.lastIndex += 1; continue; }
      found = true;
      fragment.append(document.createTextNode(text.slice(last, match.index)));
      const mark = document.createElement('mark');
      mark.className = 'preview-search-match';
      mark.textContent = match[0];
      fragment.append(mark);
      last = match.index + match[0].length;
    }
    if (!found) return;
    fragment.append(document.createTextNode(text.slice(last)));
    node.replaceWith(fragment);
  });
}

export function openDocumentSearch() {
  return currentEditor?.openSearch() ?? false;
}


// Auto-Save-Intervall live ändern (Bugfix/Nutzer-Feature) — wirkt sofort,
// auch ohne die Notiz erneut zu öffnen. Läuft gerade ein Timer (es gibt
// ungespeicherte Änderungen), wird er mit dem neuen Intervall neu geplant,
// statt auf den nächsten Tastendruck zu warten. Läuft keiner, wird auch
// keiner unnötig gestartet — clearTimeout(alterTimer) stellt dabei sicher,
// dass nie zwei Auto-Save-Timer parallel existieren.
export function setAutoSaveSeconds(seconds) {
  currentAutoSaveSeconds = seconds;
  if (autosaveTimer) scheduleAutosave(currentOnSaved, currentOnSaveError);
}

// Öffnet eine Notiz im Editor. Räumt einen evtl. vorher offenen Editor sauber
// auf (destroy), damit nie zwei CodeMirror-Instanzen um denselben Container
// konkurrieren.
function mountEditorDocument({
  doc = '',
  relPath = null,
  editorContainer,
  previewContainer,
  tabSize = 2,
  autoSaveSeconds = 30,
  readOnly = false,
  onChange,
  onCursorActivity,
  onSaved,
  onSaveError,
  getNoteIndex,
  projectPath,
  onSlashCommand,
  onPreviewRendered
}) {
  closeEditor();
  currentProjectPath = projectPath || null;
  currentPreviewContainer = previewContainer || null;
  currentAutoSaveSeconds = readOnly ? 0 : autoSaveSeconds;
  currentOnSaved = readOnly ? null : onSaved;
  currentOnSaveError = readOnly ? null : onSaveError;
  currentRelPath = relPath;
  dirty = false;

  function updatePreview(text) {
    if (previewContainer) {
      previewContainer.innerHTML = renderPreview(text, { noteIndex: getNoteIndex?.() || [], projectPath: currentProjectPath });
      onPreviewRendered?.(previewContainer, text);
      applyPreviewSearchHighlights();
    }
  }

  function schedulePreviewUpdate(text) {
    clearTimeout(previewDebounceTimer);
    previewDebounceTimer = setTimeout(() => updatePreview(text), 180);
  }

  updatePreview(doc);

  currentEditor = createMarkdownEditor({
    parent: editorContainer,
    doc,
    tabSize,
    readOnly,
    getNoteIndex,
    onChange: readOnly ? undefined : (text) => {
      schedulePreviewUpdate(text);
      dirty = true;
      onChange?.(true, text);
      scheduleAutosave(onSaved, onSaveError);
    },
    onCursorActivity,
    onSave: readOnly ? undefined : () => saveNow(onSaved, onSaveError),
    onSlashCommand: readOnly ? undefined : onSlashCommand,
    onSearchQueryChange: (spec) => {
      currentPreviewSearch = spec;
      applyPreviewSearchHighlights();
    },
    onScroll: (ratio) => {
      if (!syncScrollEnabled || !previewContainer) return;
      const maxScroll = previewContainer.scrollHeight - previewContainer.clientHeight;
      if (maxScroll > 0) previewContainer.scrollTop = ratio * maxScroll;
    }
  });
}

// Öffnet eine normale Notiz über denselben Editor-Aufbau wie bisher. Das
// Lesen/Speichern der Notiz bleibt vollständig an den bestehenden Dateisystem-
// Service gebunden.
export async function openNoteInEditor({
  relPath,
  editorContainer,
  previewContainer,
  tabSize = 2,
  autoSaveSeconds = 30,
  onChange,
  onCursorActivity,
  onSaved,
  onSaveError,
  getNoteIndex,
  projectPath,
  onSlashCommand
}) {
  const note = await readNote(relPath);
  mountEditorDocument({
    doc: note.body,
    relPath,
    editorContainer,
    previewContainer,
    tabSize,
    autoSaveSeconds,
    onChange,
    onCursorActivity,
    onSaved,
    onSaveError,
    getNoteIndex,
    projectPath,
    onSlashCommand
  });
  return { frontmatter: note.frontmatter, body: note.body };
}

// Eingänge nutzen denselben CodeMirror-/Vorschau-Arbeitsbereich, bleiben in
// diesem Vorbereitungsschritt aber bewusst schreibgeschützt. Dadurch entsteht
// keine zweite Editor-Implementierung und es kann nichts versehentlich als
// Notiz oder Eingang gespeichert werden.
export function openIncomingInEditor({
  content = '',
  editorContainer,
  previewContainer,
  tabSize = 2,
  onCursorActivity,
  getNoteIndex,
  projectPath
}) {
  mountEditorDocument({
    doc: String(content ?? ''),
    editorContainer,
    previewContainer,
    tabSize,
    readOnly: true,
    onCursorActivity,
    getNoteIndex,
    projectPath
  });
}

// Ein neuer Notiz-Entwurf aus einem Eingang verwendet denselben Editor wie
// normale Notizen, besitzt aber noch keinen Dateipfad. Dadurch ist der Inhalt
// vollständig bearbeitbar, während saveNow() mangels relPath bewusst nichts
// auf das Dateisystem schreibt. Auto-Save bleibt für diesen Zwischenzustand
// deaktiviert; gespeichert wird der Entwurf ausschließlich über den expliziten
// Eingang-Verarbeitungsweg in app.js.
export function openNoteDraftInEditor({
  content = '',
  editorContainer,
  previewContainer,
  tabSize = 2,
  onChange,
  onCursorActivity,
  getNoteIndex,
  projectPath,
  onSlashCommand,
  onPreviewRendered
}) {
  mountEditorDocument({
    doc: String(content ?? ''),
    relPath: null,
    editorContainer,
    previewContainer,
    tabSize,
    autoSaveSeconds: 0,
    readOnly: false,
    onChange,
    onCursorActivity,
    getNoteIndex,
    projectPath,
    onSlashCommand,
    onPreviewRendered
  });
}

function scheduleAutosave(onSaved, onSaveError) {
  clearTimeout(autosaveTimer);
  if (!currentAutoSaveSeconds) { autosaveTimer = null; return; } // 0 = "Aus" (siehe Wizard-Konfiguration, Schritt 2)
  autosaveTimer = setTimeout(() => { autosaveTimer = null; saveNow(onSaved, onSaveError); }, currentAutoSaveSeconds * 1000);
}

// Manuelles Speichern (Ctrl/Cmd+S oder Auto-Save-Timer). Tut nichts, wenn
// gerade kein Editor offen ist oder es nichts Ungespeichertes gibt.
// Bugfix (Audit-Punkt 1, KRITISCH): schlug das eigentliche Schreiben fehl
// (z. B. voller Datenträger, Berechtigung entzogen, Netzlaufwerk getrennt —
// siehe main/notes-fs.js writeNoteRaw, reines fs.writeFileSync), gab es dafür
// bisher KEINERLEI Rückmeldung — weder beim Auto-Save noch bei Strg+S, nur
// eine unbehandelte Ausnahme in der Konsole. dirty blieb dabei unverändert
// (Zeile stand hinter dem fehlgeschlagenen Aufruf), was zufällig richtig war,
// aber ungewollt. Jetzt: try/catch, onSaveError informiert sichtbar die
// Oberfläche. dirty bleibt bei Fehlschlag bewusst weiterhin true, damit der
// NÄCHSTE Auto-Save-Durchlauf bzw. ein erneutes Strg+S es automatisch wieder
// versucht, statt den ungespeicherten Stand für immer als "erledigt" zu markieren.
export async function saveNow(onSaved, onSaveError) {
  if (!currentEditor || !currentRelPath || !dirty) return null;
  const content = currentEditor.getContent();
  try {
    const result = await saveNote(currentRelPath, content);
    dirty = false;
    onSaved?.(result);
    return result;
  } catch (err) {
    console.error('[Archiv Wiki] Speichern fehlgeschlagen:', err.message);
    onSaveError?.(err);
    return null;
  }
}

export function isDirty() {
  return dirty;
}

export function insertAtCursor(text) {
  currentEditor?.insertAtCursor(text);
}

export function wrapSelection(before, after, placeholder = '') {
  currentEditor?.wrapSelection(before, after, placeholder);
}

export function editorHasSelection() {
  return currentEditor?.hasSelection() ?? false;
}

export function getEditorSelectionText() {
  return currentEditor?.getSelectionText() ?? '';
}

export function deleteEditorSelection() {
  currentEditor?.deleteSelection();
}

export function selectAllInEditor() {
  currentEditor?.selectAll();
}

export function moveEditorCursorToCoords(x, y) {
  currentEditor?.moveCursorToCoords(x, y);
}

export function transformCurrentLine(transformFn) {
  currentEditor?.transformCurrentLine(transformFn);
}

export function getEditorContent() {
  return currentEditor?.getContent() ?? '';
}

export function setEditorContent(text) {
  currentEditor?.setContent(text);
}

export function getOpenRelPath() {
  return currentRelPath;
}

export function focusEditor() {
  currentEditor?.focus();
}

// Brücke von der Header-Suche zum Editor: springt zur ersten Fundstelle der
// übergebenen Suchanfrage, über dieselbe CodeMirror-Suchmechanik wie die
// manuelle Editor-Suche (kein zweites, separates Hervorhebungssystem).
export function jumpToMatchInEditor(query) {
  currentEditor?.jumpToMatch(query);
}

export function closeEditor() {
  clearTimeout(autosaveTimer);
  clearTimeout(previewDebounceTimer);
  if (currentEditor) currentEditor.destroy();
  currentEditor = null;
  clearPreviewSearchHighlights();
  currentPreviewContainer = null;
  currentPreviewSearch = { search: '', caseSensitive: false, regexp: false, wholeWord: false };
  currentRelPath = null;
  dirty = false;
}

export { renderPreview };
