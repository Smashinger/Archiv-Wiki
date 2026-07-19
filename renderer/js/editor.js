// renderer/js/editor.js — Schritt 4
// Verbindet den gebündelten Editor (vendor/editor-bundle.js) mit dem
// Dateisystem-Modul: öffnet Notizen, hält den Editor-State, kümmert sich um
// Live-Vorschau und konfigurierbares Auto-Save (Intervall aus der
// Wizard-Konfiguration, 0 = Aus).

import { createMarkdownEditor, renderPreview } from './vendor/editor-bundle.js';
import { readNote, saveNote } from './filesystem.js';

let currentEditor = null;
let currentRelPath = null;
let autosaveTimer = null;
let dirty = false;

// Öffnet eine Notiz im Editor. Räumt einen evtl. vorher offenen Editor sauber
// auf (destroy), damit nie zwei CodeMirror-Instanzen um denselben Container
// konkurrieren.
export async function openNoteInEditor({
  relPath,
  editorContainer,
  previewContainer,
  tabSize = 2,
  autoSaveSeconds = 30,
  onChange,
  onCursorActivity,
  onSaved,
  getNoteIndex
}) {
  closeEditor();

  const note = await readNote(relPath);
  currentRelPath = relPath;
  dirty = false;

  function updatePreview(text) {
    if (previewContainer) previewContainer.innerHTML = renderPreview(text, { noteIndex: getNoteIndex?.() || [] });
  }
  updatePreview(note.body);

  currentEditor = createMarkdownEditor({
    parent: editorContainer,
    doc: note.body,
    tabSize,
    getNoteIndex,
    onChange: (text) => {
      updatePreview(text);
      dirty = true;
      onChange?.(true, text);
      scheduleAutosave(autoSaveSeconds, onSaved);
    },
    onCursorActivity,
    onSave: () => saveNow(onSaved)
  });

  return { frontmatter: note.frontmatter, body: note.body };
}

function scheduleAutosave(autoSaveSeconds, onSaved) {
  clearTimeout(autosaveTimer);
  if (!autoSaveSeconds) return; // 0 = "Aus" (siehe Wizard-Konfiguration, Schritt 2)
  autosaveTimer = setTimeout(() => saveNow(onSaved), autoSaveSeconds * 1000);
}

// Manuelles Speichern (Ctrl/Cmd+S oder Auto-Save-Timer). Tut nichts, wenn
// gerade kein Editor offen ist oder es nichts Ungespeichertes gibt.
export async function saveNow(onSaved) {
  if (!currentEditor || !currentRelPath || !dirty) return null;
  const content = currentEditor.getContent();
  const result = await saveNote(currentRelPath, content);
  dirty = false;
  onSaved?.(result);
  return result;
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

export function closeEditor() {
  clearTimeout(autosaveTimer);
  if (currentEditor) currentEditor.destroy();
  currentEditor = null;
  currentRelPath = null;
  dirty = false;
}

export { renderPreview };
