// build/editor-entry.js — Schritt 4
// Quellcode für den Editor-Bundle. Wird per esbuild zu einer einzigen,
// abhängigkeitsfreien ESM-Datei gebündelt (renderer/js/vendor/editor-bundle.js),
// damit die Renderer-Seite CodeMirror/marked/highlight.js/KaTeX ohne eigenen
// Bundler per <script type="module"> laden kann (siehe build/build.mjs).

import { EditorState, RangeSetBuilder, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, Decoration, ViewPlugin, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage, markdownKeymap } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle, syntaxTree, indentUnit } from '@codemirror/language';
import { GFM } from '@lezer/markdown';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { search, searchKeymap, setSearchQuery, SearchQuery, findNext, findPrevious, closeSearchPanel, openSearchPanel, getSearchQuery } from '@codemirror/search';
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
import { sanitizePreviewHtml } from './preview-sanitizer.js';

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
  return val || '#c17d45';
}
// Wird von theme.js (applyAccentPalette) gesetzt — bei eigenen (frei
// gewählten) Akzentfarben automatisch berechnet, damit der markierte
// Suchtreffer bei JEDER Farbe lesbar bleibt, nicht nur bei den 11 Presets.
function readAccentContrastText() {
  const val = getComputedStyle(document.documentElement).getPropertyValue('--accent-contrast-text').trim();
  return val || '#12151a';
}
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}` : '91,127,166';
}
// Hell/Dunkel-Modus (Einstellungen → Darstellung → Modus, siehe
// renderer/js/theme.js applyThemeMode): CodeMirrors Theme/Highlighting wird
// per style-mod als eigenes <style>-Element injiziert (siehe CSP-Hinweis in
// index.html) — externe CSS-Variablen erreichen NUR Eigenschaften, die eine
// äußere Regel mit !important überschreibt (siehe .cm-editor in
// components.css für die Schriftgröße). Für Struktur- UND Syntaxfarben reicht
// das nicht zuverlässig aus (siehe unten), deshalb werden beide hier über
// dieselben Hex-Werte wie renderer/css/styles.css (:root/body.theme-light)
// direkt in JS aufgebaut.
const EDITOR_PALETTE = {
  dark: {
    bg: '#171b21', text: '#e0e0e0', gutterText: '#6e6e6e',
    tooltipBg: '#2b2b2b', tooltipBorder: '#333333',
    panelsBg: '#171b21', panelsBorder: '#2a2f38', searchLabel: '#9a9a9a',
    fieldBg: '#22262d', fieldBorder: '#333a45', fieldText: '#e0e0e0', buttonText: '#c8c8c8',
    strong: '#e0e0e0', link: '#5ec8c0', mono: '#5b9dd9', quote: '#a0a0a0', meta: '#6e6e6e'
  },
  light: {
    bg: '#ffffff', text: '#201e1b', gutterText: '#888175',
    tooltipBg: '#eae7e2', tooltipBorder: '#d9d5cf',
    panelsBg: '#ffffff', panelsBorder: '#e7e4df', searchLabel: '#6b665f',
    fieldBg: '#eae7e2', fieldBorder: '#d9d5cf', fieldText: '#201e1b', buttonText: '#6b665f',
    strong: '#201e1b', link: '#237a74', mono: '#2171b9', quote: '#6b665f', meta: '#888175'
  }
};

// Baut Theme + Syntax-Highlighting NEU auf — aufgerufen bei JEDEM Öffnen
// einer Notiz (siehe createMarkdownEditor unten), nicht nur einmalig beim
// Laden des Bundles. Ein bereits GEÖFFNETER Editor färbt sich dadurch nicht
// mitten in der Sitzung rückwirkend um (dafür bräuchte es CodeMirror-
// Compartments, siehe Hinweis unten) — beim Öffnen der nächsten Notiz (oder
// nach einem Neustart) greifen ein neu gewählter Modus UND eine neu gewählte
// Akzentfarbe aber zuverlässig, genau wie bisher schon bei der Akzentfarbe
// allein (ACCENT wurde auch vorher schon bei jedem Editor-Aufbau frisch
// gelesen — hier lediglich um denselben Mechanismus für den Modus ergänzt).
function buildEditorExtensions() {
  const ACCENT = readAccentColor();
  const ACCENT_CONTRAST_TEXT = readAccentContrastText();
  const ACCENT_RGB = hexToRgb(ACCENT);
  const isLight = typeof document !== 'undefined' && document.body.classList.contains('theme-light');
  const isDesign2 = typeof document !== 'undefined' && document.body.dataset.uiDesign === 'design2';
  const classicPalette = isLight ? EDITOR_PALETTE.light : EDITOR_PALETTE.dark;
  const readDesign2Token = (name, fallback) => {
    if (!isDesign2) return fallback;
    return getComputedStyle(document.body).getPropertyValue(name).trim() || fallback;
  };
  // CodeMirror injiziert seine Theme-Werte selbst und kann die äußeren
  // Design2-Variablen deshalb nicht überall direkt verwenden. Die Werte
  // werden beim Aufbau/Reconfigure aus den zentralen CSS-Rollen gelesen;
  // Classic behält seine bisherige feste Palette vollständig unverändert.
  const P = isDesign2 ? {
    bg: readDesign2Token('--d2-surface-1', classicPalette.bg),
    text: readDesign2Token('--d2-text', classicPalette.text),
    gutterText: readDesign2Token('--d2-gutter', classicPalette.gutterText),
    tooltipBg: readDesign2Token('--d2-surface-3', classicPalette.tooltipBg),
    tooltipBorder: readDesign2Token('--d2-line-strong', classicPalette.tooltipBorder),
    panelsBg: readDesign2Token('--d2-surface-1', classicPalette.panelsBg),
    panelsBorder: readDesign2Token('--d2-line', classicPalette.panelsBorder),
    searchLabel: readDesign2Token('--d2-muted', classicPalette.searchLabel),
    fieldBg: readDesign2Token('--d2-surface-2', classicPalette.fieldBg),
    fieldBorder: readDesign2Token('--d2-line-strong', classicPalette.fieldBorder),
    fieldText: readDesign2Token('--d2-text', classicPalette.fieldText),
    buttonText: readDesign2Token('--d2-dim', classicPalette.buttonText),
    strong: readDesign2Token('--d2-text', classicPalette.strong),
    link: readDesign2Token('--d2-system', classicPalette.link),
    mono: readDesign2Token('--d2-system', classicPalette.mono),
    quote: readDesign2Token('--d2-dim', classicPalette.quote),
    meta: readDesign2Token('--d2-faint', classicPalette.meta),
    mark: readDesign2Token('--d2-mark', classicPalette.meta)
  } : classicPalette;
  const activeLineOpacity = isDesign2 ? (isLight ? 0.07 : 0.08) : 0.06;
  const MARK_RGB = isDesign2 ? hexToRgb(P.mark) : ACCENT_RGB;
  const cursorColor = isDesign2 ? P.mark : ACCENT;
  const activeRGB = isDesign2 ? MARK_RGB : ACCENT_RGB;

  const editorTheme = EditorView.theme({
    '&': {
      color: P.text,
      backgroundColor: P.bg,
      height: '100%',
      fontSize: '13.5px'
    },
    '.cm-content': {
      caretColor: cursorColor,
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      padding: '16px 0',
      lineHeight: '1.45'
    },
    '.cm-line': { lineHeight: '1.45' },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: cursorColor,
      borderLeftWidth: isDesign2 ? '2px' : '1.2px',
      height: isDesign2 ? '16px' : 'auto',
      marginTop: isDesign2 ? '5px' : '0'
    },
    '.cm-activeLine': { backgroundColor: `rgba(${activeRGB},${activeLineOpacity})` },
    '.cm-activeLineGutter': { backgroundColor: `rgba(${activeRGB},${activeLineOpacity})` },
    '.cm-gutters': { backgroundColor: P.bg, color: P.gutterText, border: 'none' },
    '&.cm-focused': { outline: 'none' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: `rgba(${ACCENT_RGB},0.18) !important`
    },
    '.cm-scroller': { overflow: 'auto' },
    '.cm-tooltip': {
      backgroundColor: P.tooltipBg,
      border: `1px solid ${P.tooltipBorder}`,
      borderRadius: '8px'
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: `rgba(${ACCENT_RGB},0.15)`,
      color: ACCENT
    },
    '.cm-tooltip-autocomplete ul li': {
      padding: '4px 8px'
    },
    // Such-Panel (@codemirror/search) — Standardaussehen ist hell/unpassend,
    // hier ans jeweils aktuelle Theme + aktuelle Akzentfarbe angeglichen.
    '.cm-panels': { backgroundColor: P.panelsBg, color: P.text, border: 'none' },
    '.cm-panels.cm-panels-top': { borderBottom: `1px solid ${P.panelsBorder}` },
    '.cm-search': { padding: '6px 8px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
    '.cm-search label': { fontSize: '11.5px', color: P.searchLabel },
    '.cm-textfield': {
      backgroundColor: P.fieldBg, border: `1px solid ${P.fieldBorder}`, borderRadius: '6px',
      color: P.fieldText, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: '12px', padding: '4px 7px'
    },
    '.cm-button': {
      backgroundImage: 'none', backgroundColor: P.fieldBg, border: `1px solid ${P.fieldBorder}`, borderRadius: '6px',
      color: P.buttonText, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: '11.5px', padding: '3px 9px', cursor: 'pointer'
    },
    '.cm-button:hover': { borderColor: ACCENT, color: ACCENT },
    // Alle Treffer hervorgehoben (dezent, Akzentfarbe), aktueller Treffer stärker.
    '.cm-searchMatch': { backgroundColor: `rgba(${ACCENT_RGB},0.28)`, borderRadius: '2px' },
    '.cm-searchMatch-selected': { backgroundColor: ACCENT, color: ACCENT_CONTRAST_TEXT, borderRadius: '2px' }
  }, { dark: !isLight });

  const headingContentColor = isDesign2 ? P.text : ACCENT;
  const markerColor = isDesign2 ? P.mark : P.meta;
  const highlightStyle = HighlightStyle.define([
    { tag: tags.heading1, color: headingContentColor, fontWeight: 'bold', fontSize: '1.25em' },
    { tag: tags.heading2, color: headingContentColor, fontWeight: 'bold', fontSize: '1.15em' },
    { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], color: headingContentColor, fontWeight: 'bold' },
    { tag: tags.strong, fontWeight: 'bold', color: P.strong },
    { tag: tags.emphasis, fontStyle: 'italic', color: P.strong },
    { tag: tags.link, color: P.link, textDecoration: 'underline' },
    { tag: tags.url, color: P.link },
    { tag: tags.monospace, color: P.mono },
    { tag: tags.quote, color: P.quote, fontStyle: 'italic' },
    { tag: tags.list, color: markerColor },
    { tag: tags.meta, color: markerColor }
  ]);

  return { editorTheme, highlightStyle };
}

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
export function createMarkdownEditor({ parent, doc = '', tabSize = 2, readOnly = false, onChange, onSave, onCursorActivity, getNoteIndex, onScroll, onSlashCommand, onSearchQueryChange }) {
  let view; // wird weiter unten zugewiesen — der updateListener (Teil von state,
  // das VOR view erstellt wird) greift per Funktionsabschluss später darauf zu,
  // erst wenn tatsächlich getippt wird, also lange nachdem view existiert.
  const saveKeymap = keymap.of([
    { key: 'Mod-s', preventDefault: true, run: () => { onSave?.(); return true; } },
    // Zusätzlich zu den Standard-Suchkürzeln (Strg+F öffnet, Strg+G/Umschalt+Strg+G
    // weiter/zurück) — F3/Umschalt+F3 sind aus Browsern/VS Code/Obsidian vertraut.
    { key: 'F3', preventDefault: true, run: findNext },
    { key: 'Shift-F3', preventDefault: true, run: findPrevious },
    { key: 'Escape', run: closeSearchPanel }
  ]);

  function reportCursor(state) {
    if (!onCursorActivity) return;
    const pos = state.selection.main.head;
    const line = state.doc.lineAt(pos);
    onCursorActivity({ line: line.number, column: pos - line.from + 1, offset: pos });
  }

  // Frisch aufgebaut bei JEDEM Öffnen einer Notiz — siehe Kommentar bei
  // buildEditorExtensions() oben (Hell/Dunkel-Modus + Akzentfarbe aktuell).
  // themeCompartment/highlightCompartment machen dieselben zwei Erweiterungen
  // AUSSERDEM zur Laufzeit neu konfigurierbar (siehe refreshColorMode im
  // Rückgabeobjekt weiter unten) — für den Fall, dass der Hell/Dunkel-Modus
  // wechselt, WÄHREND diese Notiz schon geöffnet ist. Ohne Compartment ließe
  // sich eine bereits im EditorState verbaute Extension nicht mehr ersetzen,
  // nur über eine komplette neue EditorView (mit Verlust von Cursor,
  // Auswahl, Scrollposition, Undo-Verlauf) — genau das vermeidet dispatch()
  // mit einem reconfigure-Effekt auf ein und demselben Compartment.
  const themeCompartment = new Compartment();
  const highlightCompartment = new Compartment();
  const { editorTheme, highlightStyle } = buildEditorExtensions();

  const state = EditorState.create({
    doc,
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      history(),
      saveKeymap,
      search({ top: true }),
      // Multi-Cursor (Ctrl/Cmd+D, Ctrl/Cmd+Shift+L, aus searchKeymap unten):
      // ohne allowMultipleSelections reduziert CodeMirror JEDE Selektion bei
      // JEDER Transaktion sofort wieder auf eine einzige Range (siehe
      // EditorState.create/apply in @codemirror/state) — die Shortcuts
      // matchten zwar, blieben aber wirkungslos. drawSelection() zeichnet die
      // dadurch entstehenden mehreren Cursor/Selektionen selbst, weil der
      // native Browser (Chromium) ohnehin nur eine einzige Selection-Range
      // gleichzeitig darstellen kann.
      EditorState.allowMultipleSelections.of(true),
      drawSelection(),
      EditorState.phrases.of({
        'Find': 'Suchen',
        'Replace': 'Ersetzen',
        'next': 'Nächster Treffer',
        'previous': 'Vorheriger Treffer',
        'all': 'Alle Treffer',
        'match case': 'Groß-/Kleinschreibung beachten',
        'regexp': 'Reguläre Ausdrücke',
        'by word': 'Ganze Wörter suchen',
        'replace': 'Ersetzen',
        'replace all': 'Alle ersetzen',
        'close': 'Suche schließen'
      }),
      keymap.of([...markdownKeymap, indentWithTab, ...defaultKeymap, ...historyKeymap, ...completionKeymap, ...searchKeymap]),
      markdown({ base: markdownLanguage, extensions: [GFM] }),
      autocompletion({ override: [wikiLinkCompletionSource(getNoteIndex)] }),
      highlightCompartment.of(syntaxHighlighting(highlightStyle)),
      themeCompartment.of(editorTheme),
      EditorState.tabSize.of(tabSize),
      EditorState.readOnly.of(Boolean(readOnly)),
      EditorView.editable.of(!readOnly),
      // Bugfix (Editor-Audit Phase 10): tabSize allein steuert nur die
      // visuelle Breite eines bereits vorhandenen Tab-Zeichens, NICHT wie
      // viele Leerzeichen indentWithTab beim Drücken der Tab-Taste
      // tatsächlich einfügt — dafür ist diese separate Facet zuständig.
      indentUnit.of(' '.repeat(tabSize)),
      closeBrackets(),
      keymap.of(closeBracketsKeymap),
      // Automatische Zeichenpaar-Ergänzung (Nutzer-Feature): CodeMirrors
      // eigener closeBrackets-Baustein, um Backtick (Inline-Code) und
      // Sternchen (Betonung) erweitert — zusätzlich zu den Standard-Klammern
      // und Anführungszeichen, die closeBrackets() bereits von Haus aus
      // abdeckt. Bei markiertem Text umschließt closeBrackets die Auswahl
      // automatisch (z. B. Text markieren, * drücken → *Text*), statt nur
      // ein leeres Paar einzufügen. Echtes **fett** über ein einziges
      // Tastenpaar bräuchte eine eigene, spezifisch für Markdown-Doppel-
      // zeichen geschriebene Lösung, bewusst nicht umgesetzt — hier kommt
      // ausschließlich CodeMirrors eigener Mechanismus zum Einsatz.
      EditorState.languageData.of(() => [{ closeBrackets: { brackets: ['(', '[', '{', "'", '"', '`', '*'] } }]),
      EditorView.lineWrapping,
      readingWidthNowrapPlugin,
      // Bugfix (Nutzer-Meldung: Rechtschreibprüfung funktioniert nicht):
      // CodeMirror setzt als Code-Editor SELBST standardmäßig
      // spellcheck="false" auf sein eigenes Textfeld — unabhängig von
      // Electrons webPreferences.spellcheck (main.js), das dadurch komplett
      // wirkungslos blieb, da es sich immer auf DIESES eine, überschriebene
      // Element bezieht. Über CodeMirrors eigene, offizielle
      // contentAttributes-Erweiterung hier ausdrücklich wieder aktiviert.
      EditorView.contentAttributes.of({ spellcheck: 'true' }),
      EditorView.updateListener.of((update) => {
        if (onSearchQueryChange) {
          const query = getSearchQuery(update.state);
          const previousQuery = getSearchQuery(update.startState);
          const currentSpec = {
            search: query?.search || '',
            caseSensitive: Boolean(query?.caseSensitive),
            regexp: Boolean(query?.regexp),
            wholeWord: Boolean(query?.wholeWord)
          };
          const previousSpec = {
            search: previousQuery?.search || '',
            caseSensitive: Boolean(previousQuery?.caseSensitive),
            regexp: Boolean(previousQuery?.regexp),
            wholeWord: Boolean(previousQuery?.wholeWord)
          };
          if (JSON.stringify(currentSpec) !== JSON.stringify(previousSpec)) onSearchQueryChange(currentSpec);
        }
        if (update.docChanged) onChange?.(update.state.doc.toString());
        if (update.docChanged || update.selectionSet) reportCursor(update.state);
        // Slash-Befehl (Nutzer-Feature, neben Werkzeugleiste + Rechtsklick-Menü
        // zum Tabelle-Einfügen): tippt man "/table" unmittelbar vor dem Cursor,
        // wird der Befehlstext entfernt und der Aufruf nach außen gemeldet —
        // app.js öffnet daraufhin denselben Tabellen-Picker wie die anderen
        // beiden Wege (keine doppelte Logik).
        if (update.docChanged && onSlashCommand) {
          const pos = update.state.selection.main.head;
          const textBefore = update.state.doc.sliceString(Math.max(0, pos - 6), pos);
          if (textBefore === '/table') {
            view.dispatch({ changes: { from: pos - 6, to: pos, insert: '' } });
            const coords = view.coordsAtPos(pos - 6) || { left: 20, bottom: 20 };
            onSlashCommand('table', { left: coords.left, top: coords.bottom + 6 });
          }
        }
      })
    ]
  });

  view = new EditorView({ state, parent });
  reportCursor(state);

  // Sync-Scroll mit der Vorschau (Nutzer-Feature): meldet das Scroll-
  // VERHÄLTNIS (0 bis 1), nicht die Pixel-Position — Editor und Vorschau sind
  // unterschiedlich hoch, ein reiner Pixel-Abgleich würde nicht zusammenpassen.
  // rAF-gedrosselt, damit schnelles Scrollen nicht ruckelt (kein Debounce mit
  // Wartezeit, da Sync-Scroll ja gerade sofort mitlaufen soll).
  if (onScroll) {
    let scrollScheduled = false;
    view.scrollDOM.addEventListener('scroll', () => {
      if (scrollScheduled) return;
      scrollScheduled = true;
      requestAnimationFrame(() => {
        scrollScheduled = false;
        const { scrollTop, scrollHeight, clientHeight } = view.scrollDOM;
        const maxScroll = scrollHeight - clientHeight;
        onScroll(maxScroll > 0 ? scrollTop / maxScroll : 0);
      });
    });
  }

  return {
    getContent: () => view.state.doc.toString(),
    setContent: (text) => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    },
    // Brücke von der Header-Suche: setzt dieselbe Suchanfrage, die auch die
    // manuelle Editor-Suche (Strg+F) nutzt, und springt zum ersten Treffer —
    // dadurch läuft Hervorhebung/Navigation über EIN einziges System,
    // nicht über eine zweite, separat gebaute Markierungslogik.
    jumpToMatch: (query) => {
      if (!query) return;
      view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: query })) });
      findNext(view);
      view.focus();
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
    openSearch: () => openSearchPanel(view),
    focus: () => view.focus(),
    // Wird von renderer/js/editor.js aufgerufen, sobald sich der zentrale
    // Hell/Dunkel-Modus ändert (siehe theme.js applyThemeMode), während DIESE
    // Notiz bereits offen ist. dispatch() mit reconfigure-Effekten auf den
    // beiden oben angelegten Compartments tauscht ausschließlich Theme und
    // Syntax-Highlighting aus — Dokumentinhalt, Cursor, Auswahl,
    // Scrollposition und Undo-/Redo-Verlauf gehören zu keinem der beiden
    // Compartments und bleiben deshalb unverändert erhalten. Liest den
    // aktuellen Modus frisch aus dem body-Klassennamen (siehe
    // buildEditorExtensions oben) — dieselbe Quelle wie beim ursprünglichen
    // Aufbau, kein zweiter, separater Theme-Zustand.
    refreshColorMode: () => {
      const next = buildEditorExtensions();
      view.dispatch({
        effects: [
          themeCompartment.reconfigure(next.editorTheme),
          highlightCompartment.reconfigure(syntaxHighlighting(next.highlightStyle))
        ]
      });
    },
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
      return `<div class="code-block"><span class="lang">${escapeHtml(lang || 'text')}</span><pre><code class="hljs">${highlighted}</code></pre></div>`;
    },
    // Standardmäßig rendert marked.js Checkboxen mit disabled="" (rein
    // dekorativ). Für klickbares Abhaken brauchen wir sie OHNE disabled,
    // plus einen Index, über den app.js die richtige Zeile in der Markdown-
    // Quelle wiederfindet und dort [ ] <-> [x] umschaltet.
    checkbox({ checked }) {
      const idx = taskCheckboxCounter++;
      return `@@TASKCHECKBOX${idx}_${checked ? '1' : '0'}@@ `;
    }
  }
});

// Lesebreite im Editor (Nutzer-Feature): normale Zeilen werden per CSS
// zentriert und auf die Lesebreite begrenzt (siehe reading-width-Regeln in
// styles.css). Für Bereiche, in denen eine feste Breite den Arbeitsfluss
// verschlechtern würde (Tabellen, Code-Blöcke), wird hier GENERISCH über
// den echten Markdown-Syntaxbaum erkannt, ob eine Zeile zu einem dieser
// "nicht umbrechen"-Knotentypen gehört — keine Heuristik auf Zeicheninhalt
// (z. B. "enthält viele |-Zeichen"), sondern dieselbe Erkennung, die
// CodeMirror ohnehin schon für die Syntax-Hervorhebung nutzt (siehe GFM-
// Erweiterung weiter oben, nötig damit Tabellen überhaupt als eigener
// Knotentyp erkannt werden, nicht nur als normaler Absatz). Neue, ähnliche
// Knotentypen (z. B. HTMLBlock) ließen sich später einfach hier ergänzen,
// ohne die eigentliche Erkennungs-Logik anzufassen.
const NOWRAP_NODE_TYPES = new Set(['FencedCode', 'CodeBlock', 'Table']);

function lineHasNowrapNode(state, line) {
  let node = syntaxTree(state).resolve(line.from, 1);
  while (node) {
    if (NOWRAP_NODE_TYPES.has(node.type.name)) return true;
    node = node.parent;
  }
  return false;
}

const readingWidthNowrapPlugin = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = this.buildDecorations(view); }
  update(update) {
    // Nur bei tatsächlichen Änderungen neu berechnen (Text, sichtbarer
    // Bereich beim Scrollen) — nicht bei jeder reinen Cursor-Bewegung.
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }
  buildDecorations(view) {
    const builder = new RangeSetBuilder();
    // Nur sichtbare Zeilen prüfen (Performance bei großen Dokumenten) — das
    // von CodeMirror selbst empfohlene Muster für zeilenweise Dekorationen,
    // statt bei jeder Änderung das gesamte Dokument zu durchlaufen.
    for (const { from, to } of view.visibleRanges) {
      let pos = from;
      while (pos <= to) {
        const line = view.state.doc.lineAt(pos);
        if (lineHasNowrapNode(view.state, line)) {
          builder.add(line.from, line.from, Decoration.line({ class: 'cm-line-nowrap' }));
        }
        pos = line.to + 1;
      }
    }
    return builder.finish();
  }
}, { decorations: v => v.decorations });

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
    try { return stash(katex.renderToString(expr.trim(), { displayMode: true, throwOnError: false, output: 'html', trust: false })); }
    catch { return stash(`<span class="katex-error">${escapeHtml(expr)}</span>`); }
  });
  out = out.replace(/(^|[^\\$])\$([^\$\n]+?)\$/g, (_, pre, expr) => {
    try { return pre + stash(katex.renderToString(expr.trim(), { displayMode: false, throwOnError: false, output: 'html', trust: false })); }
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
  function stash(entry) {
    store.push(entry);
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
      return stash({ target, display, relPath: match.relPath });
    }
    return stash({ target, display, relPath: null });
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

function attachmentPreviewSource(projectPath, rawName) {
  const name = String(rawName || '');
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) return '';
  const base = 'file://' + String(projectPath).replace(/\\/g, '/').replace(/\/+$/, '') + '/.attachments/';
  return base + encodeURIComponent(name);
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
    html = html.replace(/src="attachment:([^"]+)"/g, (_, name) => `src="${attachmentPreviewSource(options.projectPath, name)}"`);
  }

  // Aus der Icon-Bibliothek eingefügte Symbole (siehe showIconPicker in
  // app.js) werden mit "icon:kategorie/name" referenziert — gleiches Prinzip
  // wie bei attachment:, nur zeigt es auf die mit der App mitgelieferte
  // Icon-Bibliothek statt auf projekteigene Anhänge.
  html = html.replace(/src="icon:([^"]+)"/g, (_, id) => `src="assets/icon-library/${id}.svg"`);

  // Gemeinsamer Inhaltscontainer (Bugfix): EINZIGER Ort, an dem die
  // Lesebreite greift. Vorher wurde jedes direkte Kind von .preview-pane
  // einzeln zentriert — funktionierte für normale Block-Elemente (Absatz,
  // Überschrift, Tabelle), führte aber zu Problemen, sobald ein einzelnes
  // Element (z. B. das Bild) eine eigene, abweichende Zentrierungslogik
  // bekam. Jetzt bestimmt dieser eine Wrapper die Breite, alle Inhalte
  // (inklusive Bilder, die innerhalb eines <p> liegen) folgen ihm über den
  // normalen Dokumentfluss, ohne eigene Regeln pro Element.
  return sanitizePreviewHtml(html, {
    mathStore,
    wikiStore,
    taskCheckboxCount: taskCheckboxCounter,
    projectPath: options.projectPath
  });
}
