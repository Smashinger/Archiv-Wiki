// build/editor-entry.js — Schritt 4
// Quellcode für den Editor-Bundle. Wird per esbuild zu einer einzigen,
// abhängigkeitsfreien ESM-Datei gebündelt (renderer/js/vendor/editor-bundle.js),
// damit die Renderer-Seite CodeMirror/marked/highlight.js/KaTeX ohne eigenen
// Bundler per <script type="module"> laden kann (siehe build/build.mjs).

import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage, markdownKeymap } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { tags } from '@lezer/highlight';

import { marked } from 'marked';
import hljs from 'highlight.js/lib/core';
import langJavascript from 'highlight.js/lib/languages/javascript';
import langPython from 'highlight.js/lib/languages/python';
import langBash from 'highlight.js/lib/languages/bash';
import langJson from 'highlight.js/lib/languages/json';
import langYaml from 'highlight.js/lib/languages/yaml';
import langXml from 'highlight.js/lib/languages/xml';
import langCss from 'highlight.js/lib/languages/css';

import katex from 'katex';

hljs.registerLanguage('javascript', langJavascript);
hljs.registerLanguage('js', langJavascript);
hljs.registerLanguage('python', langPython);
hljs.registerLanguage('py', langPython);
hljs.registerLanguage('bash', langBash);
hljs.registerLanguage('sh', langBash);
hljs.registerLanguage('json', langJson);
hljs.registerLanguage('yaml', langYaml);
hljs.registerLanguage('yml', langYaml);
hljs.registerLanguage('xml', langXml);
hljs.registerLanguage('html', langXml);
hljs.registerLanguage('css', langCss);

// ---------------------------------------------------------------------------
// CodeMirror: Dark-Theme passend zu unseren CSS-Variablen (main.css)
// ---------------------------------------------------------------------------
// Liest die AKTUELL gesetzte Akzentfarbe (siehe renderer/js/theme.js) einmalig
// aus, statt sie an >10 Stellen fest zu verdrahten — Editor-Cursor, aktive
// Zeile, Auswahl-Hervorhebung und Überschriften-Farbe folgen so automatisch
// der in den Einstellungen gewählten Farbe.
function readAccentColor() {
  const val = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim();
  return val || '#5b7fa6';
}
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}` : '91,127,166';
}
const ACCENT = readAccentColor();
const ACCENT_RGB = hexToRgb(ACCENT);

const editorTheme = EditorView.theme({
  '&': {
    color: '#e0e0e0',
    backgroundColor: '#171b21',
    height: '100%',
    fontSize: '13.5px'
  },
  '.cm-content': {
    caretColor: ACCENT,
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    padding: '16px 0',
    lineHeight: '1.45'
  },
  '.cm-line': { lineHeight: '1.45' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: ACCENT },
  '.cm-activeLine': { backgroundColor: `rgba(${ACCENT_RGB},0.06)` },
  '.cm-activeLineGutter': { backgroundColor: `rgba(${ACCENT_RGB},0.06)` },
  '.cm-gutters': { backgroundColor: '#171b21', color: '#6e6e6e', border: 'none' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: `rgba(${ACCENT_RGB},0.18) !important`
  },
  '.cm-scroller': { overflow: 'auto' },
  '.cm-tooltip': {
    backgroundColor: '#2b2b2b',
    border: '1px solid #333333',
    borderRadius: '8px'
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: `rgba(${ACCENT_RGB},0.15)`,
    color: ACCENT
  },
  '.cm-tooltip-autocomplete ul li': {
    padding: '4px 8px'
  }
}, { dark: true });

const highlightStyle = HighlightStyle.define([
  { tag: tags.heading1, color: ACCENT, fontWeight: 'bold', fontSize: '1.25em' },
  { tag: tags.heading2, color: ACCENT, fontWeight: 'bold', fontSize: '1.15em' },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], color: ACCENT, fontWeight: 'bold' },
  { tag: tags.strong, fontWeight: 'bold', color: '#e0e0e0' },
  { tag: tags.emphasis, fontStyle: 'italic', color: '#e0e0e0' },
  { tag: tags.link, color: '#5ec8c0', textDecoration: 'underline' },
  { tag: tags.url, color: '#5ec8c0' },
  { tag: tags.monospace, color: '#5b9dd9' },
  { tag: tags.quote, color: '#a0a0a0', fontStyle: 'italic' },
  { tag: tags.list, color: '#e0e0e0' },
  { tag: tags.meta, color: '#6e6e6e' }
]);

// ---------------------------------------------------------------------------
// Wiki-Link-Autovervollständigung: tippt man "[[", werden Notiztitel aus dem
// (live übergebenen) Notiz-Index vorgeschlagen. getNoteIndex() wird bei jedem
// Tastendruck neu aufgerufen, damit auch frisch angelegte Notizen sofort
// auftauchen, ohne den Editor neu erstellen zu müssen.
// ---------------------------------------------------------------------------
export function wikiLinkCompletionSource(getNoteIndex) {
  return (context) => {
    const match = context.matchBefore(/\[\[[^\]\n|]*$/);
    if (!match) return null;
    const query = match.text.slice(2).toLowerCase();
    const notes = typeof getNoteIndex === 'function' ? getNoteIndex() : [];
    const options = notes
      .filter(n => n.title.toLowerCase().includes(query))
      .slice(0, 40)
      .map(n => ({ label: n.title, apply: `${n.title}]]`, type: 'text', detail: 'Notiz' }));
    return { from: match.from + 2, options, validFor: /^[^\]\n]*$/ };
  };
}

// ---------------------------------------------------------------------------
// Editor-Factory
// ---------------------------------------------------------------------------
export function createMarkdownEditor({ parent, doc = '', tabSize = 2, onChange, onSave, onCursorActivity, getNoteIndex }) {
  const saveKeymap = keymap.of([
    { key: 'Mod-s', preventDefault: true, run: () => { onSave?.(); return true; } }
  ]);

  function reportCursor(state) {
    if (!onCursorActivity) return;
    const pos = state.selection.main.head;
    const line = state.doc.lineAt(pos);
    onCursorActivity({ line: line.number, column: pos - line.from + 1, offset: pos });
  }

  const state = EditorState.create({
    doc,
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      history(),
      saveKeymap,
      keymap.of([...markdownKeymap, indentWithTab, ...defaultKeymap, ...historyKeymap, ...completionKeymap]),
      markdown({ base: markdownLanguage }),
      autocompletion({ override: [wikiLinkCompletionSource(getNoteIndex)] }),
      syntaxHighlighting(highlightStyle),
      editorTheme,
      EditorState.tabSize.of(tabSize),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChange?.(update.state.doc.toString());
        if (update.docChanged || update.selectionSet) reportCursor(update.state);
      })
    ]
  });

  const view = new EditorView({ state, parent });
  reportCursor(state);

  return {
    getContent: () => view.state.doc.toString(),
    setContent: (text) => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    },
    insertAtCursor: (text) => {
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length }
      });
      view.focus();
    },
    // Umschließt die aktuelle Auswahl mit `before`/`after` (z.B. ** für Fett).
    // Ohne Auswahl wird stattdessen ein Platzhaltertext eingefügt und markiert,
    // damit man direkt weiterschreiben kann.
    wrapSelection: (before, after, placeholder = '') => {
      const { from, to } = view.state.selection.main;
      const hasSelection = from !== to;
      const inner = hasSelection ? view.state.sliceDoc(from, to) : placeholder;
      view.dispatch({
        changes: { from, to, insert: before + inner + after },
        selection: { anchor: from + before.length, head: from + before.length + inner.length }
      });
      view.focus();
    },
    hasSelection: () => {
      const { from, to } = view.state.selection.main;
      return from !== to;
    },
    getSelectionText: () => {
      const { from, to } = view.state.selection.main;
      return view.state.sliceDoc(from, to);
    },
    deleteSelection: () => {
      const { from, to } = view.state.selection.main;
      view.dispatch({ changes: { from, to, insert: '' } });
      view.focus();
    },
    selectAll: () => {
      view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
      view.focus();
    },
    // Für Rechtsklick: Browser-Koordinaten (clientX/clientY) in eine Dokument-
    // Position umrechnen. Klickt man AUSSERHALB der aktuellen Auswahl, wird
    // der Cursor dorthin verschoben (Standard-Editor-Verhalten) — klickt man
    // INNERHALB einer bestehenden Auswahl, bleibt sie erhalten (damit
    // Ausschneiden/Kopieren weiter auf der Auswahl arbeiten).
    moveCursorToCoords: (x, y) => {
      let pos;
      try { pos = view.posAtCoords({ x, y }); }
      catch { return; } // z. B. Layout noch nicht vollständig berechnet — dann Cursor einfach unverändert lassen
      if (pos == null) return;
      const { from, to } = view.state.selection.main;
      if (pos < from || pos > to) {
        view.dispatch({ selection: { anchor: pos } });
      }
    },
    // Wendet `transformFn(lineText)` auf die Zeile an, in der aktuell der
    // Cursor steht (für Überschriften-Ebenen setzen/entfernen — arbeitet auf
    // der GANZEN Zeile, nicht nur der Auswahl).
    transformCurrentLine: (transformFn) => {
      const pos = view.state.selection.main.head;
      const line = view.state.doc.lineAt(pos);
      const newText = transformFn(line.text);
      view.dispatch({ changes: { from: line.from, to: line.to, insert: newText } });
      view.focus();
    },
    focus: () => view.focus(),
    destroy: () => view.destroy()
  };
}

// ---------------------------------------------------------------------------
// Markdown/Code/Math-Vorschau
// ---------------------------------------------------------------------------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Zähler für Checklisten-Einträge — bei jedem renderPreview()-Aufruf auf 0
// zurückgesetzt, zählt hoch bei jeder Checkbox im Dokument. Ermöglicht das
// Zurück-Zuordnen "welche Checkbox wurde angeklickt" zur entsprechenden
// Zeile in der rohen Markdown-Quelle (siehe toggleTaskCheckbox in app.js).
let taskCheckboxCounter = 0;

marked.use({
  gfm: true,
  breaks: true,
  renderer: {
    code(token) {
      const lang = (token.lang || '').trim().split(/\s+/)[0].toLowerCase();
      let highlighted;
      try {
        highlighted = lang && hljs.getLanguage(lang)
          ? hljs.highlight(token.text, { language: lang }).value
          : hljs.highlightAuto(token.text).value;
      } catch {
        highlighted = escapeHtml(token.text);
      }
      return `<div class="code-block"><span class="lang">${escapeHtml(lang || 'text')}</span><button type="button" class="copy-btn" data-copy-btn>Kopieren</button><pre><code class="hljs">${highlighted}</code></pre></div>`;
    },
    // Standardmäßig rendert marked.js Checkboxen mit disabled="" (rein
    // dekorativ). Für klickbares Abhaken brauchen wir sie OHNE disabled,
    // plus einen Index, über den app.js die richtige Zeile in der Markdown-
    // Quelle wiederfindet und dort [ ] <-> [x] umschaltet.
    checkbox({ checked }) {
      const idx = taskCheckboxCounter++;
      return `<input type="checkbox" data-task-index="${idx}"${checked ? ' checked' : ''}> `;
    }
  }
});

// Schützt Code-Bereiche (Fences + Inline-Code) vor der Mathe-Erkennung —
// sonst würde z. B. ${name}, $HOME oder $1 in Code-Blöcken fälschlich als
// Mathe-Ausdruck interpretiert. Läuft VOR der Mathe-Ersetzung, wird danach
// (mit dem echten Quelltext, nicht HTML) wiederhergestellt, damit marked
// beim Parsen noch den echten Code für das Syntax-Highlighting bekommt.
function protectCodeRegions(text) {
  const store = [];
  function stash(match) {
    store.push(match);
    return `@@CODE${store.length - 1}@@`;
  }
  let out = text.replace(/```[\s\S]*?```/g, stash);
  out = out.replace(/`[^`\n]+`/g, stash);
  return { out, store };
}

function restoreCodeRegions(text, store) {
  return text.replace(/@@CODE(\d+)@@/g, (_, i) => store[Number(i)]);
}

// Ersetzt Mathematik durch Platzhalter VOR dem Markdown-Parsing (damit weder
// marked die LaTeX-Syntax verändert, noch marked das KaTeX-HTML verändert),
// löst die Platzhalter danach im fertigen HTML wieder auf.
function renderMathToPlaceholders(text) {
  const store = [];
  function stash(html) {
    store.push(html);
    return `@@MATH${store.length - 1}@@`;
  }
  let out = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => {
    try { return stash(katex.renderToString(expr.trim(), { displayMode: true, throwOnError: false })); }
    catch { return stash(`<span class="katex-error">${escapeHtml(expr)}</span>`); }
  });
  out = out.replace(/(^|[^\\$])\$([^\$\n]+?)\$/g, (_, pre, expr) => {
    try { return pre + stash(katex.renderToString(expr.trim(), { displayMode: false, throwOnError: false })); }
    catch { return pre + stash(`<span class="katex-error">${escapeHtml(expr)}</span>`); }
  });
  return { out, store };
}

// Ersetzt [[Notizname]] durch Platzhalter VOR dem Markdown-Parsing (läuft auf
// dem code-geschützten Text, damit z. B. eine Doku über die Wiki-Link-Syntax
// selbst in einem Code-Block nicht angefasst wird). noteIndex ist eine Liste
// von { title, relPath } — kommt live aus app.js (siehe getNoteIndex oben).
function renderWikiLinksToPlaceholders(text, noteIndex) {
  const store = [];
  function stash(html) {
    store.push(html);
    return `@@WIKILINK${store.length - 1}@@`;
  }
  // Unterstützt sowohl [[Notizname]] als auch [[Notizname|Eigener Anzeigetext]]
  // (Obsidian-artige Pipe-Syntax) — das Ziel VOR dem "|" bestimmt weiterhin,
  // welche Notiz verlinkt wird, der Text danach wird nur sichtbar angezeigt.
  const out = text.replace(/\[\[([^\]\n|]+?)(?:\|([^\]\n]+?))?\]\]/g, (_, rawTarget, rawDisplay) => {
    const target = rawTarget.trim();
    const display = (rawDisplay || rawTarget).trim();
    const match = (noteIndex || []).find(n => n.title.toLowerCase() === target.toLowerCase());
    if (match) {
      return stash(`<a class="wiki-link" data-wikilink-target="${escapeHtml(match.relPath)}">${escapeHtml(display)}</a>`);
    }
    return stash(`<a class="wiki-link wiki-link-missing" data-wikilink-create="${escapeHtml(target)}" title="Notiz existiert noch nicht — klicken zum Anlegen">${escapeHtml(display)}</a>`);
  });
  return { out, store };
}

// Erkennt Obsidian-artige Callout-Syntax:
//   > [!warning] Optionaler eigener Titel
//   > Inhalt, mehrzeilig möglich
//   > - auch Listen
// und wandelt sie in die 7 farbcodierten Callout-Boxen um (siehe CALLOUT_TYPES).
// Läuft auf dem code-geschützten Text (vor Wiki-Links/Mathe), damit eine
// Doku ÜBER diese Syntax in einem Code-Block nicht selbst umgewandelt wird.
const CALLOUT_TYPES = ['note', 'tip', 'warning', 'danger', 'abstract', 'example', 'info'];

function renderCalloutsToPlaceholders(text, codeStore) {
  const store = [];
  function stash(html) {
    store.push(html);
    return `@@CALLOUT${store.length - 1}@@`;
  }
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^>\s*\[!(\w+)\]\s*(.*)$/);
    if (m && CALLOUT_TYPES.includes(m[1].toLowerCase())) {
      const calloutType = m[1].toLowerCase();
      const customTitle = m[2].trim();
      const bodyLines = [];
      let j = i + 1;
      while (j < lines.length && /^>\s?/.test(lines[j])) {
        bodyLines.push(lines[j].replace(/^>\s?/, ''));
        j++;
      }
      const titleText = customTitle || calloutType.charAt(0).toUpperCase() + calloutType.slice(1);
      // WICHTIG: Code-Platzhalter (@@CODEn@@) MÜSSEN vor diesem verschachtelten
      // marked.parse()-Aufruf aufgelöst werden — sonst sieht dieser Parse nur
      // den Platzhaltertext (keine echten Backticks mehr, da protectCodeRegions
      // bereits vorher GLOBAL gelaufen ist) und rendert ihn als reinen Text.
      // Die äußere restoreCodeRegions() käme dafür zu spät, weil der Callout-
      // Inhalt zu dem Zeitpunkt noch hinter einem eigenen @@CALLOUTn@@-Token
      // versteckt ist. Das war der gemeldete Bug (sichtbare "@@CODE7@@"-Reste).
      const bodyText = restoreCodeRegions(bodyLines.join('\n'), codeStore);
      const bodyHtml = bodyLines.length ? marked.parse(bodyText) : '';
      out.push(stash(`<div class="callout ${calloutType}"><div class="callout-title">${escapeHtml(titleText)}</div>${bodyHtml}</div>`));
      i = j;
    } else {
      out.push(lines[i]);
      i++;
    }
  }
  return { out: out.join('\n'), store };
}

export function renderPreview(markdownText, options = {}) {
  taskCheckboxCounter = 0; // vor JEDEM Render zurücksetzen — auch vor den intern in Callouts genutzten marked.parse()-Aufrufen
  const noteIndex = options.noteIndex || [];
  const { out: codeProtected, store: codeStore } = protectCodeRegions(markdownText || '');
  const { out: calloutProtected, store: calloutStore } = renderCalloutsToPlaceholders(codeProtected, codeStore);
  const { out: wikiProtected, store: wikiStore } = renderWikiLinksToPlaceholders(calloutProtected, noteIndex);
  const { out: mathProtected, store: mathStore } = renderMathToPlaceholders(wikiProtected);
  const restoredCode = restoreCodeRegions(mathProtected, codeStore);
  let html = marked.parse(restoredCode);
  html = html.replace(/@@MATH(\d+)@@/g, (_, i) => mathStore[Number(i)]);
  html = html.replace(/@@WIKILINK(\d+)@@/g, (_, i) => wikiStore[Number(i)]);
  // Callouts zuletzt: marked wrappt eine alleinstehende Platzhalter-Zeile in
  // <p>...</p> — das würde ein Block-Element (unser .callout-div) ungültig
  // in ein Inline-<p> verschachteln. Erst den <p>-Wrapper mit auflösen,
  // "nackte" Vorkommen (falls doch nicht gewrappt) als Sicherheitsnetz danach.
  html = html.replace(/<p>@@CALLOUT(\d+)@@<\/p>/g, (_, i) => calloutStore[Number(i)]);
  html = html.replace(/@@CALLOUT(\d+)@@/g, (_, i) => calloutStore[Number(i)]);

  // Per Drag&Drop eingefügte Bilder werden mit "attachment:dateiname" statt
  // eines relativen Pfades referenziert (siehe Bilder-Drag&Drop-Feature) —
  // vermeidet jede Unsicherheit über Verzeichnistiefe/relative Pfade. Hier
  // erst zur ECHTEN file://-URL aufgelöst, sobald der Projektpfad bekannt ist.
  if (options.projectPath) {
    const base = 'file://' + options.projectPath.replace(/\\/g, '/') + '/.attachments/';
    html = html.replace(/src="attachment:([^"]+)"/g, (_, name) => `src="${base}${encodeURIComponent(name)}"`);
  }

  return html;
}
