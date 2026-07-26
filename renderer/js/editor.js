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
let dirty = false;
// Sync-Scroll (Nutzer-Feature): ein/ausschaltbar, Standardwert an.
let syncScrollEnabled = true;
export function setSyncScrollEnabled(enabled) { syncScrollEnabled = enabled; }

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
  onSaveError,
  getNoteIndex,
  projectPath,
  onSlashCommand
}) {
  closeEditor();
  currentProjectPath = projectPath || null;

  const note = await readNote(relPath);
  currentRelPath = relPath;
  dirty = false;

  function updatePreview(text) {
    if (previewContainer) previewContainer.innerHTML = renderPreview(text, { noteIndex: getNoteIndex?.() || [], projectPath: currentProjectPath });
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
      scheduleAutosave(autoSaveSeconds, onSaved, onSaveError);
    },
    onCursorActivity,
    onSave: () => saveNow(onSaved, onSaveError),
    onSlashCommand,
    // Scroll-Verhältnis (0-1) 1:1 auf die Vorschau übertragen — nicht
    // Pixel-für-Pixel, da beide Seiten unterschiedlich hoch sind (siehe
    // Kommentar in editor-entry.js).
    onScroll: (ratio) => {
      if (!syncScrollEnabled || !previewContainer) return;
      const maxScroll = previewContainer.scrollHeight - previewContainer.clientHeight;
      if (maxScroll > 0) previewContainer.scrollTop = ratio * maxScroll;
    }
  });

  return { frontmatter: note.frontmatter, body: note.body };
}

function scheduleAutosave(autoSaveSeconds, onSaved, onSaveError) {
  clearTimeout(autosaveTimer);
  if (!autoSaveSeconds) return; // 0 = "Aus" (siehe Wizard-Konfiguration, Schritt 2)
  autosaveTimer = setTimeout(() => saveNow(onSaved, onSaveError), autoSaveSeconds * 1000);
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

// Brücke von der Header-Suche zum Editor: springt zur ersten Fundstelle der
// übergebenen Suchanfrage, über dieselbe CodeMirror-Suchmechanik wie die
// manuelle Editor-Suche (kein zweites, separates Hervorhebungssystem).
export function jumpToMatchInEditor(query) {
  currentEditor?.jumpToMatch(query);
}

export function closeEditor() {
  clearTimeout(autosaveTimer);
  if (currentEditor) currentEditor.destroy();
  currentEditor = null;
  currentRelPath = null;
  dirty = false;
}

export { renderPreview };
