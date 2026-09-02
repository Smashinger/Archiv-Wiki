// renderer/js/settings-window.js
// Das zentrale Einstellungsfenster — gebaut nach archiv-wiki-einstellungen.md.
//
// Aufbau des Fensters (Abschnitt 1 der Spezifikation): Titelzeile 38 px,
// Reiterzeile 46 px, Arbeitsbereich. Feste Fenstergröße 1180 × 660, damit beim
// Reiterwechsel nichts springt; einspaltige Bereiche zentrieren darin ihren
// 580-px-Block.
//
// Jeder der sieben Bereiche ist eine eigene, unabhängige render-Funktion. Ein
// künftiger Bereich wird als weiterer Eintrag in SETTINGS_SECTIONS ergänzt —
// an der Fenster-/Reiter-Logik selbst muss dafür nichts geändert werden.
//
// Alle Änderungen werden sofort live angewendet (siehe apply*-Aufrufe direkt
// neben jedem Feld) UND sofort über den Settings-Service (settings:update)
// gespeichert — kein Neustart nötig, kein separater "Speichern"-Button.
//
// Die gesamte Optik steckt in renderer/css/settings.css, die Farben in
// renderer/css/archiv-wiki-tokens.css. Hier im JavaScript steht kein
// Farbwert und keine Themenabfrage.

import { ACCENT_PALETTES, ACCENT_SWATCH_ORDER, applyAccentPalette, SIDEBAR_DENSITY_PRESETS, applySidebarDensity, applyEditorFontSize, READING_WIDTH_PRESETS, applyReadingWidth, THEME_MODE_PRESETS, applyThemeMode } from './theme.js';
import { fetchUpdateStatus, requestUpdateCheck, onUpdateStatusChanged } from './update-check.js';
import { animateIn, animateOut } from './motion.js';
import { manageModalDialog, showConfirmDialog } from './dialog.js';
import { getReleaseNotesForVersion } from './release-notes.js';
import { showDiagnosticsDialog } from './diagnostics-ui.js';
import * as fs from './filesystem.js';
import { UI_DESIGNS, resolveUiDesign, applyUiDesign, UI_DESIGN_LABELS } from './ui-design.js';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatRelative(isoString) {
  if (!isoString) return 'noch nie';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.round(hours / 24);
  return `vor ${days} Tag${days === 1 ? '' : 'en'}`;
}

function formatFuture(date) {
  if (!date) return 'deaktiviert';
  const diffMs = new Date(date).getTime() - Date.now();
  if (diffMs <= 0) return 'jederzeit fällig';
  const days = Math.round(diffMs / 86400000);
  if (days < 1) return 'heute';
  return `in ${days} Tag${days === 1 ? '' : 'en'}`;
}

function formatDateTime(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

const GITHUB_REPOSITORY_URL = 'https://github.com/Smashinger/Archiv-Wiki';
const GITHUB_DISCUSSIONS_URL = `${GITHUB_REPOSITORY_URL}/discussions`;
const GITHUB_RELEASES_URL = `${GITHUB_REPOSITORY_URL}/releases`;
const FIREFOX_AMO_URL = 'https://addons.mozilla.org/de/firefox/addon/archiv-wiki-web-clipper/';

const BACKUP_INTERVAL_OPTIONS = [
  { value: 0, label: 'Deaktiviert' },
  { value: 1, label: 'Täglich' },
  { value: 3, label: 'Alle 3 Tage' },
  { value: 7, label: 'Wöchentlich' },
  { value: 14, label: 'Alle 2 Wochen' },
  { value: 30, label: 'Monatlich' }
];

const EDITOR_FONT_SIZE_OPTIONS = [12, 13, 14, 16, 18].map(px => ({ value: String(px), label: `${px} px` }));

const WEB_CLIPPER_CAPTURE_MODES = Object.freeze([
  { value: 'selection', label: 'Markierter Text' },
  { value: 'url', label: 'Nur URL' },
  { value: 'page', label: 'Ganze Seite' },
  { value: 'images', label: 'Bilder' }
]);

// --- Symbole -------------------------------------------------------------
// Inline-SVG statt Dateien aus der Symbolbibliothek: die Spezifikation gibt
// für jedes Symbol Größe und Strichstärke 1.5 vor und verlangt, dass sie die
// Textfarbe des jeweiligen Zustands tragen (Segment aktiv/Ruhe, Reiter-Hover).
// Ein <img> kann seine Farbe nicht vom Zustand erben.
const ICONS = {
  gear: '<svg class="aws-gear" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  close: '<svg viewBox="0 0 24 24" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>',
  search: '<svg viewBox="0 0 24 24" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>',
  moon: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="5" y1="5" x2="6.5" y2="6.5"/><line x1="17.5" y1="17.5" x2="19" y2="19"/><line x1="19" y1="5" x2="17.5" y2="6.5"/><line x1="6.5" y1="17.5" x2="5" y2="19"/></svg>',
  plus: '<svg viewBox="0 0 24 24" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  check: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 12.5 9.5 18 20 6"/></svg>'
};

// --- Bausteine der Zeilenform (Abschnitt 2) ------------------------------

function pane(columns, ...cols) {
  const single = columns === 1;
  return `<div class="aws-pane${single ? ' is-single' : ''}">${cols.map(c => `<div class="aws-col">${c}</div>`).join('')}</div>`;
}

function group(mark, body, { className = '' } = {}) {
  return `<section class="aws-group${className ? ` ${className}` : ''}">
    <div class="aws-group-head"><span>${esc(mark)}</span><i></i></div>${body}</section>`;
}

// Eine Einstellung: Beschriftungsspalte fest, 20 px Abstand, Bedienspalte
// rechtsbündig. Die Erklärung steht IMMER unter der Beschriftung, nie unter
// dem Feld — nur so bleibt die rechte Kante über alle Zeilen eine Linie.
function row(label, note, control, { disabled = false } = {}) {
  const searchText = `${label} ${note || ''}`.toLowerCase();
  return `<div class="aws-row${note ? ' has-note' : ''}${disabled ? ' is-disabled' : ''}" data-search="${esc(searchText)}">
    <div class="aws-label"><b>${esc(label)}</b>${note ? `<div class="aws-note">${esc(note)}</div>` : ''}</div>
    <div class="aws-ctl">${control}</div>
  </div>`;
}

// Blockinhalt in Zeilenbreite (Backup: Umfang, Wiederherstellung) — trägt
// keine Beschriftungsspalte, bleibt aber exakt so breit wie jede Zeile.
function block(body) {
  return `<div class="aws-block">${body}</div>`;
}

// --- Bausteine der Bedienelemente (Abschnitt 3) --------------------------

function textInput({ id, value = '', placeholder = '', type = 'text', className = '', attrs = '' }) {
  return `<input type="${type}" id="${id}" class="aws-input${className ? ` ${className}` : ''}" value="${esc(value)}" placeholder="${esc(placeholder)}"${attrs}>`;
}

function readonlyValue({ id, text, className = 'is-mono' }) {
  return `<div class="aws-input ${className}" id="${id}">${esc(text)}</div>`;
}

function measure({ id, value, unit, min, max, step = '1' }) {
  return `<div class="aws-measure">
    <input type="number" id="${id}" class="aws-input is-mono-13" value="${esc(value)}" min="${min}" max="${max}" step="${step}">
    <span>${esc(unit)}</span>
  </div>`;
}

function select({ id, value, options }) {
  const current = options.find(o => String(o.value) === String(value)) || options[0];
  return `<div class="aws-select" data-select id="${id}">
    <button type="button" class="aws-select-value" aria-haspopup="listbox" aria-expanded="false"><span>${esc(current?.label ?? '')}</span>${ICONS.chevron}</button>
    <div class="aws-select-menu" role="listbox" hidden>
      ${options.map(o => `<button type="button" role="option" class="aws-select-option${String(o.value) === String(value) ? ' is-active' : ''}" data-value="${esc(o.value)}" aria-selected="${String(o.value) === String(value)}">${esc(o.label)}</button>`).join('')}
    </div>
  </div>`;
}

// Segmentleiste — für 2 bis 3 kurze Möglichkeiten.
function segmented({ id, value, options }) {
  return `<div class="aws-seg" id="${id}" role="group">
    ${options.map(o => `<button type="button" class="aws-seg-btn${String(o.value) === String(value) ? ' is-active' : ''}" data-value="${esc(o.value)}" aria-pressed="${String(o.value) === String(value)}">${o.icon ? ICONS[o.icon] : ''}<span>${esc(o.label)}</span></button>`).join('')}
  </div>`;
}

// Radiopunkt — für 4 und mehr sich ausschließende Möglichkeiten.
function radios({ id, name, value, options }) {
  return `<div class="aws-radios" id="${id}" role="radiogroup">
    ${options.map(o => `<label class="aws-radio">
      <input type="radio" name="${name}" value="${esc(o.value)}"${String(o.value) === String(value) ? ' checked' : ''}>
      <span class="aws-dot"></span>
      <span>${esc(o.label)}${o.isDefault ? '<span class="aws-default">Standard</span>' : ''}</span>
    </label>`).join('')}
  </div>`;
}

// Schalter — nur für Ein/Aus.
function toggle({ id, on, disabled = false, label }) {
  return `<button type="button" class="aws-switch" id="${id}" role="switch" aria-checked="${on ? 'true' : 'false'}" aria-label="${esc(label)}"${disabled ? ' disabled' : ''}><i></i></button>`;
}

function toggleWithWord({ id, on, disabled = false, label, word }) {
  return `<div class="aws-switch-line"><span class="aws-state-word">${esc(word)}</span>${toggle({ id, on, disabled, label })}</div>`;
}

function button2(id, label, { disabled = false } = {}) {
  return `<button type="button" class="aws-btn2" id="${id}"${disabled ? ' disabled' : ''}>${esc(label)}</button>`;
}

function button1(id, label, { disabled = false } = {}) {
  return `<button type="button" class="aws-btn1" id="${id}"${disabled ? ' disabled' : ''}>${esc(label)}</button>`;
}

function textAction(id, label, { disabled = false } = {}) {
  return `<button type="button" class="aws-link" id="${id}"${disabled ? ' disabled' : ''}>${esc(label)}</button>`;
}

function inlineGroup(html, { wideGap = false } = {}) {
  return `<div class="aws-inline${wideGap ? ' is-wide-gap' : ''}">${html}</div>`;
}

// Zustandszeile — die einzige Karte im ganzen Fenster (Abschnitt 4).
function stateRow({ id, needsAction, title, sub, subMono = false, action }) {
  return `<div class="aws-state${needsAction ? ' needs-action' : ''}" id="${id}" role="status">
    <div class="aws-state-text">
      <div class="aws-state-title">${esc(title)}</div>
      ${sub ? `<div class="aws-state-sub${subMono ? ' is-mono' : ''}">${esc(sub)}</div>` : ''}
    </div>
    ${action || ''}
  </div>`;
}

function feedbackLine(id, message = '', isError = false) {
  return `<p class="aws-feedback${isError ? ' is-error' : ''}" id="${id}" role="status">${esc(message)}</p>`;
}

function setFeedback(el, id, message, isError = false) {
  const target = el.querySelector(`#${id}`);
  if (!target) return;
  target.textContent = message || '';
  target.classList.toggle('is-error', Boolean(isError && message));
}

// --- Die sieben Bereiche -------------------------------------------------

const SETTINGS_SECTIONS = [
  { id: 'general', label: 'Allgemein', columns: 2, render: renderGeneralSection },
  { id: 'appearance', label: 'Darstellung', columns: 2, render: renderAppearanceSection },
  { id: 'editor', label: 'Editor', columns: 1, render: renderEditorSection },
  { id: 'backup', label: 'Backup', columns: 1, render: renderBackupSection },
  { id: 'updates', label: 'Updates', columns: 1, render: renderUpdatesSection },
  { id: 'webclipper', label: 'Web Clipper', columns: 2, render: renderWebClipperSection },
  { id: 'security', label: 'Sicherheit', columns: 1, render: renderSecuritySection }
];

let closeActiveSettingsWindow = null;
let settingsWindowOpenGeneration = 0;
let releaseNotesExpanded = false;

export async function showSettingsWindow(context = {}) {
  const openGeneration = ++settingsWindowOpenGeneration;
  if (closeActiveSettingsWindow) closeActiveSettingsWindow({ immediate: true, restoreFocus: false });

  let config;
  let configLoadError = null;
  try {
    config = await window.archivAPI.settings.get();
    if (context.onConfigChange) context.onConfigChange(config);
  } catch (error) {
    console.error('Einstellungen konnten nicht geladen werden:', error);
    config = {};
    configLoadError = error;
  }
  if (openGeneration !== settingsWindowOpenGeneration) return;

  let activeId = SETTINGS_SECTIONS[0].id;
  let isClosing = false;
  const backupUiState = { manualInProgress: false, feedback: null };

  const scrim = document.createElement('div');
  scrim.className = 'aws-scrim';
  // .aws-surface ist eine reine Spezifitäts-Verankerung: manageModalDialog()
  // setzt auf dieses Element zusätzlich .dialog-surface, und die
  // [data-ui-design="design2"]-Regel dafür in design2.css läge sonst mit
  // höherer Spezifität über Fläche, Rahmen, Radius, Schatten und Schriftart
  // aus der Spezifikation. Siehe settings.css.
  //
  // .aws-body trägt vorab dialog-body/data-dialog-body: normalizeDialogStructure()
  // in dialog.js sucht genau danach und würde sonst alle drei Fensterzeilen in
  // einen zusätzlichen Wrapper einpacken — der Aufbau
  // "grid-template-rows: 38px 46px 1fr" hätte dann nur noch ein Kind.
  scrim.innerHTML = `
    <div class="aws-window aws-surface" role="dialog" aria-modal="true" aria-labelledby="awsTitle">
      <div class="aws-titlebar">
        ${ICONS.gear}
        <span class="aws-titlebar-title" id="awsTitle">Einstellungen</span>
        <button type="button" class="aws-titlebar-close" id="awsClose" aria-label="Einstellungen schließen" title="Schließen">${ICONS.close}</button>
      </div>
      <div class="aws-tabs" role="tablist" aria-label="Einstellungsbereiche">
        ${SETTINGS_SECTIONS.map(s => `<button type="button" class="aws-tab" role="tab" data-section="${s.id}" aria-selected="false">${esc(s.label)}</button>`).join('')}
        <div class="aws-search" id="awsSearch">
          ${ICONS.search}
          <input type="search" id="awsSearchInput" placeholder="Einstellung suchen" aria-label="Einstellung suchen">
        </div>
      </div>
      <div class="aws-body dialog-body" data-dialog-body id="awsBody"></div>
    </div>
  `;

  document.body.appendChild(scrim);
  const windowEl = scrim.querySelector('.aws-window');
  const bodyEl = scrim.querySelector('#awsBody');
  const titleEl = scrim.querySelector('#awsTitle');
  const searchEl = scrim.querySelector('#awsSearch');
  const searchInput = scrim.querySelector('#awsSearchInput');
  animateIn(windowEl);

  // Genau EINMAL für die Lebensdauer des Fensters. Die Auf-/Zu-Bedienung der
  // Auswahllisten läuft delegiert über #awsBody und funktioniert deshalb auch
  // für später gerenderte Bereiche. Ein Aufruf je Bereichswechsel hätte jedes
  // Mal einen weiteren Listener auf dasselbe, dauerhafte Element gelegt: der
  // erste öffnet die Liste, der zweite sieht sie bereits offen und schließt
  // sie im selben Klick wieder — bei gerader Listener-Anzahl ließ sich keine
  // Auswahlliste mehr öffnen.
  wireSelects(bodyEl);

  function hasActiveChildDialog() {
    return [...document.querySelectorAll('.prompt-overlay, .table-editor-overlay, .image-lightbox-overlay')]
      .some(element => element !== scrim && element.isConnected && element.getClientRects().length > 0);
  }

  let stopBackupStatusUpdates = null;
  let stopUpdateStatusUpdates = null;
  let stopWebClipperStatusUpdates = null;
  let dialogController = null;

  function finishClose(restoreFocus = true) {
    stopBackupStatusUpdates?.();
    stopUpdateStatusUpdates?.();
    stopWebClipperStatusUpdates?.();
    dialogController?.destroy({ restoreFocus });
    closeActiveSettingsWindow = null;
  }

  function closeSettings({ immediate = false, restoreFocus = true } = {}) {
    if (isClosing) return;
    isClosing = true;
    if (immediate) finishClose(restoreFocus);
    else animateOut(windowEl, () => finishClose(restoreFocus));
  }

  closeActiveSettingsWindow = closeSettings;
  // Bewusst ohne titleElement: normalizeDialogStructure() würde dem Titel
  // sonst die Klassen dialog-title/dialog-header aufsetzen und ihn damit der
  // gemeinsamen Dialogtypografie unterstellen. Die Beschriftung des Fensters
  // steht bereits als aria-labelledby="awsTitle" im Markup.
  dialogController = manageModalDialog({
    overlay: scrim,
    dialog: windowEl,
    initialFocus: () => scrim.querySelector('.aws-tab'),
    onRequestClose: () => closeSettings(),
    closeOnBackdrop: false,
    canCloseOnEscape: () => !hasActiveChildDialog()
  });

  // Sofort speichern UND zurückgeben — jede Sektion wendet das Ergebnis selbst
  // live an (z. B. applyAccentPalette), kein Neustart nötig.
  async function updateSetting(patch) {
    try {
      config = await window.archivAPI.settings.update(patch);
      if (context.onConfigChange) context.onConfigChange(config);
      return config;
    } catch (error) {
      console.error('Einstellung konnte nicht gespeichert werden:', error);
      const target = bodyEl.querySelector('[data-generic-feedback]');
      if (target) {
        target.textContent = 'Die Einstellung konnte nicht gespeichert werden.';
        target.classList.add('is-error');
      }
      return config;
    }
  }

  let renderGeneration = 0;

  async function renderActive(overrides = {}) {
    const section = SETTINGS_SECTIONS.find(s => s.id === activeId);
    if (!section) return;
    const generation = ++renderGeneration;

    scrim.querySelectorAll('.aws-tab').forEach(tab => {
      const isActive = tab.dataset.section === activeId;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });

    // Einspaltige Bereiche tragen den Bereichsnamen in der Titelzeile. Das
    // ersetzt jede Überschrift im Arbeitsbereich (Abschnitt 1).
    titleEl.textContent = section.columns === 1
      ? `Einstellungen · ${section.label}`
      : 'Einstellungen';
    // Das Suchfeld ist der Einstieg in den Bereich Allgemein und erscheint nur dort.
    searchEl.hidden = section.id !== 'general';
    if (searchEl.hidden) searchInput.value = '';

    bodyEl.innerHTML = '';
    if (configLoadError) {
      bodyEl.innerHTML = '<p class="aws-pane-error">Die Einstellungen konnten nicht geladen werden. Bitte öffne das Fenster erneut.</p>';
      return;
    }

    const lifecycle = {
      isCurrent: () => !isClosing
        && scrim.isConnected
        && generation === renderGeneration
        && activeId === section.id
    };

    try {
      await section.render(bodyEl, config, updateSetting, { ...context, backupUiState, ...overrides }, lifecycle);
      if (!lifecycle.isCurrent()) return;
      if (section.id === 'general') applySearchFilter(bodyEl, searchInput.value);
    } catch (error) {
      if (!lifecycle.isCurrent()) return;
      console.error(`Einstellungsbereich "${section.id}" konnte nicht geladen werden:`, error);
      bodyEl.innerHTML = '<p class="aws-pane-error">Der Bereich konnte nicht geladen werden. Bitte versuche es erneut.</p>';
    }
  }

  stopBackupStatusUpdates = window.archivAPI.onBackupStatusUpdated?.((status) => {
    if (!scrim.isConnected || activeId !== 'backup' || backupUiState.manualInProgress) return;
    renderActive({ backupStatus: status });
  });

  stopUpdateStatusUpdates = onUpdateStatusChanged((status) => {
    if (!scrim.isConnected || activeId !== 'updates') return;
    renderActive({ updateStatus: status });
  });

  stopWebClipperStatusUpdates = window.archivAPI.webClipper?.onStatusUpdated?.((status) => {
    if (!scrim.isConnected || activeId !== 'webclipper') return;
    renderActive({ webClipperStatus: status });
  });

  scrim.querySelector('.aws-tabs').addEventListener('click', (event) => {
    const tab = event.target.closest('.aws-tab');
    if (!tab) return;
    activeId = tab.dataset.section;
    renderActive();
  });

  searchInput.addEventListener('input', () => applySearchFilter(bodyEl, searchInput.value));

  // Klicks außerhalb schließen das Fenster weiterhin bewusst nicht.
  scrim.querySelector('#awsClose').addEventListener('click', () => closeSettings());

  renderActive();
  requestAnimationFrame(() => {
    scrim.querySelector('.aws-tab')?.focus({ preventScroll: true });
  });
}

// Suchfeld im Bereich Allgemein: blendet nicht passende Zeilen und dadurch
// leer gewordene Abschnitte aus. Bewusst ein Filter der bereits sichtbaren
// Zeilen und kein zweiter Dialog — das Fenster bleibt eine Oberfläche.
function applySearchFilter(bodyEl, term) {
  const needle = String(term || '').trim().toLowerCase();
  bodyEl.querySelectorAll('.aws-row').forEach(rowEl => {
    rowEl.hidden = Boolean(needle) && !(rowEl.dataset.search || '').includes(needle);
  });
  bodyEl.querySelectorAll('.aws-group').forEach(groupEl => {
    const rows = [...groupEl.querySelectorAll('.aws-row')];
    groupEl.hidden = rows.length > 0 && rows.every(rowEl => rowEl.hidden);
  });
}

// Auswahlliste: kein Systemdropdown, deshalb hier die vollständige
// Tastatur-/Maus-Bedienung — einmal zentral für alle Bereiche.
function wireSelects(scope) {
  const closeAll = (except = null) => {
    scope.querySelectorAll('[data-select]').forEach(selectEl => {
      if (selectEl === except) return;
      const menu = selectEl.querySelector('.aws-select-menu');
      menu.hidden = true;
      menu.classList.remove('is-up');
      selectEl.querySelector('.aws-select-value').setAttribute('aria-expanded', 'false');
    });
  };

  // Reicht der Platz unterhalb des Feldes nicht, klappt die Liste nach oben
  // auf. Bewusst erst nach dem Einblenden gemessen — vorher hat ein
  // [hidden]-Element keine Höhe. Der Bezug ist der Arbeitsbereich, nicht das
  // Ansichtsfenster: die Liste soll das Fenster nicht verlassen.
  const placeMenu = (selectEl, menu) => {
    menu.classList.remove('is-up');
    const bounds = scope.getBoundingClientRect();
    const trigger = selectEl.querySelector('.aws-select-value').getBoundingClientRect();
    const spaceBelow = bounds.bottom - trigger.bottom;
    const spaceAbove = trigger.top - bounds.top;
    if (menu.getBoundingClientRect().height > spaceBelow && spaceAbove > spaceBelow) menu.classList.add('is-up');
  };

  scope.addEventListener('click', (event) => {
    const trigger = event.target.closest('.aws-select-value');
    if (trigger) {
      const selectEl = trigger.closest('[data-select]');
      const menu = selectEl.querySelector('.aws-select-menu');
      const willOpen = menu.hidden;
      closeAll(selectEl);
      menu.hidden = !willOpen;
      trigger.setAttribute('aria-expanded', String(willOpen));
      if (willOpen) {
        placeMenu(selectEl, menu);
        menu.querySelector('.aws-select-option.is-active, .aws-select-option')?.focus({ preventScroll: true });
      } else {
        menu.classList.remove('is-up');
      }
      return;
    }
    if (!event.target.closest('.aws-select-menu')) closeAll();
  });

  scope.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const openMenu = [...scope.querySelectorAll('.aws-select-menu')].find(menu => !menu.hidden);
    if (!openMenu) return;
    event.stopPropagation();
    closeAll();
    openMenu.closest('[data-select]').querySelector('.aws-select-value').focus({ preventScroll: true });
  });
}

// Einheitlicher Weg für jede Auswahlliste: Wert setzen, Anzeige und
// Aktiv-Zustand nachziehen, Liste schließen, dann den Aufrufer benachrichtigen.
function onSelectChange(scope, selectId, handler) {
  const selectEl = scope.querySelector(`#${selectId}`);
  if (!selectEl) return;
  selectEl.querySelector('.aws-select-menu').addEventListener('click', async (event) => {
    const option = event.target.closest('.aws-select-option');
    if (!option) return;
    selectEl.querySelectorAll('.aws-select-option').forEach(o => {
      const isActive = o === option;
      o.classList.toggle('is-active', isActive);
      o.setAttribute('aria-selected', String(isActive));
    });
    selectEl.querySelector('.aws-select-value span').textContent = option.textContent;
    const menu = selectEl.querySelector('.aws-select-menu');
    menu.hidden = true;
    menu.classList.remove('is-up');
    selectEl.querySelector('.aws-select-value').setAttribute('aria-expanded', 'false');
    await handler(option.dataset.value);
  });
}

// Einheitlicher Weg für jede Segmentleiste.
function onSegmentChange(scope, segId, handler) {
  const segEl = scope.querySelector(`#${segId}`);
  if (!segEl) return;
  segEl.addEventListener('click', async (event) => {
    const btn = event.target.closest('.aws-seg-btn');
    if (!btn) return;
    segEl.querySelectorAll('.aws-seg-btn').forEach(b => {
      b.classList.toggle('is-active', b === btn);
      b.setAttribute('aria-pressed', String(b === btn));
    });
    await handler(btn.dataset.value);
  });
}

// Einheitlicher Weg für jeden Schalter: optimistisch umschalten, bei einem
// Fehler zurückdrehen — der sichtbare Zustand lügt nie über das Gespeicherte.
function onToggle(scope, toggleId, handler) {
  const btn = scope.querySelector(`#${toggleId}`);
  if (!btn || btn.disabled) return;
  btn.addEventListener('click', async () => {
    const next = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', String(next));
    try {
      await handler(next);
    } catch (error) {
      console.error(`Schalter "${toggleId}" konnte nicht gespeichert werden:`, error);
      if (btn.isConnected) btn.setAttribute('aria-checked', String(!next));
    }
  });
}

// --- 5.1  Allgemein — zweispaltig ---------------------------------------

async function renderGeneralSection(el, config, updateSetting, context, lifecycle) {
  const closeBehavior = await window.archivAPI.getCloseBehavior();
  if (!lifecycle.isCurrent()) return;

  const left = group('Wiki',
    row('Wiki-Name', 'Betrifft nur dieses Wiki.',
      textInput({ id: 'stWikiName', value: config.wikiName || '', placeholder: 'z. B. Max' }))
    + row('Speicherort', 'Kopiert das Wiki; der bisherige Ordner bleibt erhalten.',
      readonlyValue({ id: 'stProjectPath', text: context.projectPath || '' })
      + textAction('stMoveProjectFolder', 'Ändern…')
      + feedbackLine('stMoveFeedback'))
  ) + group('Startverhalten',
    row('Kategorien beim Start', 'Legt fest, welche Kategorien beim Start geöffnet sind.',
      radios({
        id: 'stCategoryStartup', name: 'stCategoryStartup',
        value: config.categoryStartupBehavior || 'closed',
        options: [
          { value: 'closed', label: 'Alles geschlossen', isDefault: true },
          { value: 'restore', label: 'Letzten Zustand wiederherstellen' },
          { value: 'topLevelOpen', label: 'Hauptkategorien geöffnet' },
          { value: 'allOpen', label: 'Alles geöffnet' }
        ]
      }))
  );

  const right = group('Verhalten',
    row('Beim Schließen', 'Was der Schließen-Knopf des Fensters tut. Im Tray bleibt Archiv-Wiki im Hintergrund aktiv.',
      radios({
        id: 'stCloseBehavior', name: 'stCloseBehavior', value: closeBehavior,
        options: [
          { value: 'ask', label: 'Immer nachfragen', isDefault: true },
          { value: 'tray', label: 'In den System-Tray minimieren' },
          { value: 'quit', label: 'Vollständig beenden' }
        ]
      })
      + feedbackLine('stCloseFeedback'))
  ) + group('Hilfe und Feedback',
    row('Tastenkürzel', '', textAction('stShowShortcuts', 'Übersicht öffnen'))
    + row('Frage oder Vorschlag', 'Öffnet GitHub Discussions im Browser. Es werden keine Wiki-Inhalte übertragen.',
      textAction('stOpenDiscussions', 'Auf GitHub teilen'))
  ) + group('Diagnose',
    row('Diagnoseberichte', 'Höchstens fünf, nur lokal, nie automatisch übertragen. Pfade und Zugangsdaten werden vorher anonymisiert.',
      inlineGroup(button2('stViewDiagnostics', 'Berichte anzeigen') + button2('stCreateDiagnostics', 'Erstellen'))
      + feedbackLine('stDiagnosticsFeedback'))
  );

  el.innerHTML = pane(2, left, right);

  el.querySelector('#stWikiName').addEventListener('change', async (event) => {
    const name = event.target.value.trim();
    await updateSetting({ wikiName: name });
    // Design-unabhängig: das Einstellungsfenster kennt keine bestimmte
    // Sidebar-Struktur — die aktive Oberfläche entscheidet selbst, wo sie den
    // Wiki-Namen sichtbar aktualisiert.
    context.onWikiNameChange?.(name);
  });

  el.querySelector('#stCategoryStartup').addEventListener('change', async (event) => {
    if (event.target.name !== 'stCategoryStartup') return;
    await updateSetting({ categoryStartupBehavior: event.target.value });
  });

  // Schließen-Verhalten ist app-weit (main/app-state.js), nicht Teil der
  // projektbezogenen config — deshalb direkt über window.archivAPI.
  el.querySelector('#stCloseBehavior').addEventListener('change', async (event) => {
    if (event.target.name !== 'stCloseBehavior') return;
    setFeedback(el, 'stCloseFeedback', '');
    try {
      await window.archivAPI.setCloseBehavior(event.target.value);
    } catch (error) {
      console.error('Schließen-Verhalten konnte nicht gespeichert werden:', error);
      setFeedback(el, 'stCloseFeedback', 'Konnte nicht gespeichert werden.', true);
    }
  });

  el.querySelector('#stShowShortcuts').addEventListener('click', () => context.onShowShortcuts?.());
  el.querySelector('#stOpenDiscussions').addEventListener('click', () => window.open(GITHUB_DISCUSSIONS_URL, '_blank'));
  el.querySelector('#stViewDiagnostics').addEventListener('click', () => { void showDiagnosticsDialog(); });

  el.querySelector('#stCreateDiagnostics').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    setFeedback(el, 'stDiagnosticsFeedback', '');
    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = 'Wird erstellt …';
    try {
      const report = await window.archivAPI.diagnostics.createManual();
      if (!lifecycle.isCurrent()) return;
      await showDiagnosticsDialog({ initialReportId: report?.id || null });
    } catch (error) {
      console.error('Diagnosebericht konnte nicht erstellt werden:', error);
      setFeedback(el, 'stDiagnosticsFeedback', 'Der Bericht konnte nicht erstellt werden.', true);
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    }
  });

  el.querySelector('#stMoveProjectFolder').addEventListener('click', async (event) => {
    const action = event.currentTarget;
    const originalLabel = action.textContent;
    setFeedback(el, 'stMoveFeedback', '');
    action.disabled = true;
    action.textContent = 'Wird kopiert …';
    try {
      const result = await window.archivAPI.moveProjectFolder();
      if (!lifecycle.isCurrent() || !result) return;
      if (result.error) {
        setFeedback(el, 'stMoveFeedback', result.error, true);
        return;
      }
      if (result.moved) {
        el.querySelector('#stProjectPath').textContent = result.newPath;
        context.onProjectPathChange?.(result.newPath);
        setFeedback(el, 'stMoveFeedback', `Verschoben. Alter Ordner: ${result.oldPath}`);
      }
      // result.moved === false ohne error: Auswahl abgebrochen — nichts tun.
    } catch (error) {
      console.error('Wiki-Speicherort konnte nicht geändert werden:', error);
      if (lifecycle.isCurrent()) setFeedback(el, 'stMoveFeedback', 'Der Speicherort konnte nicht geändert werden.', true);
    } finally {
      if (action.isConnected) {
        action.disabled = false;
        action.textContent = originalLabel;
      }
    }
  });
}

// --- 5.2  Darstellung — zweispaltig -------------------------------------

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

function accentSwatchesHtml(config) {
  const selectedKey = config.accentKey || 'orange';
  const swatches = ACCENT_SWATCH_ORDER.map(key => {
    const palette = ACCENT_PALETTES[key];
    return `<button type="button" class="aws-swatch color-swatch-${key}${selectedKey === key ? ' is-active' : ''}" data-accent="${key}" title="${esc(palette.label)}" aria-label="${esc(palette.label)}"></button>`;
  }).join('');
  // Das Eigenwert-Feld ist das zwölfte Feld derselben Größe, kein Sonderformat.
  const custom = `<button type="button" class="aws-swatch aws-swatch-custom${selectedKey === 'custom' ? ' is-active' : ''}" data-accent="custom" title="Eigenen Farbwert wählen" aria-label="Eigenen Farbwert wählen">${ICONS.plus}</button>`;
  return `<div class="aws-swatches" id="stAccentSwatches">${swatches}${custom}</div>`;
}

function renderAppearanceSection(el, config, updateSetting, context) {
  const isCustomAccent = config.accentKey === 'custom';
  const left = group('Farbe',
    row('Akzentfarbe', 'Trägt Auswahl, Marken und Themenrücken.',
      accentSwatchesHtml(config)
      + `<input type="color" id="stCustomColorInput" class="aws-hidden-color" aria-hidden="true" tabindex="-1" value="${esc(config.customAccentColor || '#CF8A94')}">`
      + `<div class="aws-hex-row">${textInput({
        id: 'stHexInput',
        className: 'is-mono',
        value: isCustomAccent ? (config.customAccentColor || '') : '',
        placeholder: '#RRGGBB',
        attrs: ' maxlength="7" aria-label="Eigener Farbwert"'
      })}<span>eigener Wert</span></div>`)
  ) + group('Modus und Design',
    row('Hell/Dunkel', '',
      segmented({
        id: 'stThemeMode', value: config.themeMode || 'dark',
        options: [
          { value: 'dark', label: THEME_MODE_PRESETS.dark.label, icon: 'moon' },
          { value: 'light', label: THEME_MODE_PRESETS.light.label, icon: 'sun' }
        ]
      }))
    + row('Oberflächen-Design', 'Noch nicht umgestellte Bereiche zeigen weiterhin Classic.',
      segmented({
        id: 'stUiDesign', value: resolveUiDesign(config.uiDesign),
        options: UI_DESIGNS.map(key => ({ value: key, label: UI_DESIGN_LABELS[key] || key }))
      })
      + feedbackLine('stUiDesignFeedback'))
  );

  const right = group('Oberfläche',
    row('Sidebar-Größe', '',
      segmented({
        id: 'stDensity', value: config.sidebarDensity || 'standard',
        options: Object.entries(SIDEBAR_DENSITY_PRESETS).map(([key, preset]) => ({ value: key, label: preset.label }))
      }))
  ) + group('Arbeitsansicht',
    row('Optimale Lesebreite', 'Begrenzt Editor und Vorschau. Breite Tabellen und lange Codezeilen bleiben in ihrem Bereich scrollbar.',
      toggle({ id: 'stReadingWidthEnabled', on: Boolean(config.readingWidthEnabled), label: 'Optimale Lesebreite' }))
    + row('Breite', '',
      segmented({
        id: 'stReadingWidth', value: config.readingWidthKey || 'standard',
        options: Object.entries(READING_WIDTH_PRESETS).map(([key, preset]) => ({ value: key, label: preset.label }))
      }))
  );

  el.innerHTML = pane(2, left, right);

  const customColorInput = el.querySelector('#stCustomColorInput');
  const hexInput = el.querySelector('#stHexInput');

  function markActiveSwatch(accentKey) {
    el.querySelectorAll('#stAccentSwatches .aws-swatch').forEach(swatch => {
      swatch.classList.toggle('is-active', swatch.dataset.accent === accentKey);
    });
  }

  // Gemeinsame Anwenden-Funktion für JEDEN Weg zu einer eigenen Farbe (das
  // Eigenwert-Feld über den nativen Farbwähler oder das Hex-Feld darunter) —
  // vermeidet, dieselben Schritte an mehreren Stellen zu wiederholen.
  async function applyCustomColor(hex) {
    applyAccentPalette('custom', hex);
    await updateSetting({ accentKey: 'custom', customAccentColor: hex });
    markActiveSwatch('custom');
    hexInput.value = hex;
    hexInput.classList.remove('is-invalid');
  }

  el.querySelector('#stAccentSwatches').addEventListener('click', async (event) => {
    const swatch = event.target.closest('[data-accent]');
    if (!swatch) return;
    const key = swatch.dataset.accent;
    if (key === 'custom') { customColorInput.click(); return; }
    applyAccentPalette(key);
    await updateSetting({ accentKey: key });
    markActiveSwatch(key);
    hexInput.value = '';
    hexInput.classList.remove('is-invalid');
  });

  customColorInput.addEventListener('input', (event) => {
    // Live-Vorschau schon während des Ziehens im Farbwähler, noch ungespeichert.
    applyAccentPalette('custom', event.target.value);
    hexInput.value = event.target.value;
  });
  customColorInput.addEventListener('change', (event) => { void applyCustomColor(event.target.value); });

  hexInput.addEventListener('input', (event) => {
    const value = event.target.value.trim();
    hexInput.classList.toggle('is-invalid', value.length > 0 && !HEX_PATTERN.test(value));
  });
  hexInput.addEventListener('change', async (event) => {
    let value = event.target.value.trim();
    if (value && !value.startsWith('#')) value = `#${value}`; // "a3f5c2" wie "#a3f5c2" akzeptieren
    if (!HEX_PATTERN.test(value)) { hexInput.classList.add('is-invalid'); return; }
    await applyCustomColor(value);
  });

  onSegmentChange(el, 'stThemeMode', async (value) => {
    applyThemeMode(value);
    await updateSetting({ themeMode: value });
  });

  onSegmentChange(el, 'stDensity', async (value) => {
    applySidebarDensity(value);
    await updateSetting({ sidebarDensity: value });
  });

  // Oberflächen-Design: bewusst NICHT über updateSetting()/settings:update wie
  // die übrigen Felder, sondern über denselben generischen
  // fs.setProjectSetting()-Mechanismus wie sidebarWidth/viewMode in app.js —
  // uiDesign ist ein einzelner Top-Level-Schlüssel derselben Projekt-
  // Konfiguration, kein zweiter Speicher. Die zentrale Konfigurations-
  // rückmeldung in app.js übernimmt danach applyUiDesign() und einen sicheren
  // Re-Render der aktuellen Ansicht.
  onSegmentChange(el, 'stUiDesign', async (rawValue) => {
    const value = resolveUiDesign(rawValue);
    const previous = resolveUiDesign(config.uiDesign);
    if (value === previous) return;
    applyUiDesign(value);
    try {
      await fs.setProjectSetting('uiDesign', value);
    } catch (error) {
      console.error('Oberflächen-Design konnte nicht gespeichert werden:', error);
      applyUiDesign(previous);
      setFeedback(el, 'stUiDesignFeedback', 'Konnte nicht gespeichert werden.', true);
      return;
    }
    config.uiDesign = value;
    setFeedback(el, 'stUiDesignFeedback', '');
  });

  // Lesebreite: Das Einstellungsfenster läuft im selben Dokument wie die
  // Hauptansicht — Schalter und Breitenauswahl wirken deshalb ohne Umweg
  // sofort sichtbar in der offenen Notiz.
  onToggle(el, 'stReadingWidthEnabled', async (next) => {
    applyReadingWidth(next, config.readingWidthKey || 'standard');
    await updateSetting({ readingWidthEnabled: next });
  });

  onSegmentChange(el, 'stReadingWidth', async (value) => {
    await updateSetting({ readingWidthKey: value });
    applyReadingWidth(config.readingWidthEnabled, value);
  });
}

// --- 5.3  Editor — einspaltig -------------------------------------------

function renderEditorSection(el, config, updateSetting) {
  const editor = config.editor || {};
  el.innerHTML = pane(1,
    group('Schreiben',
      row('Schriftgröße', '',
        select({ id: 'stFontSize', value: String(config.editorFontSize || 13), options: EDITOR_FONT_SIZE_OPTIONS }))
      + row('Automatisches Speichern', '0 schaltet es ab.',
        measure({ id: 'stAutoSave', value: editor.autoSave ?? 30, unit: 'Sekunden', min: 0, max: 300, step: '5' }))
      + row('Einrückung', '',
        measure({ id: 'stTabSize', value: editor.tabSize ?? 2, unit: 'Leerzeichen pro Tab', min: 1, max: 8 }))
    )
    + group('Sprache',
      row('Rechtschreibprüfung', 'Verwendet derzeit Deutsch.',
        toggle({ id: 'stSpellcheck', on: editor.spellcheck !== false, label: 'Rechtschreibprüfung' }))
    )
  );

  onSelectChange(el, 'stFontSize', async (value) => {
    const px = applyEditorFontSize(Number(value));
    await updateSetting({ editorFontSize: px });
  });

  el.querySelector('#stAutoSave').addEventListener('change', async (event) => {
    const raw = Number(event.target.value);
    const value = Number.isNaN(raw) ? 30 : Math.min(300, Math.max(0, raw));
    event.target.value = value;
    await updateSetting({ editor: { autoSave: value } });
  });

  el.querySelector('#stTabSize').addEventListener('change', async (event) => {
    const value = Math.min(8, Math.max(1, Number(event.target.value) || 2));
    event.target.value = value;
    await updateSetting({ editor: { tabSize: value } });
  });

  // Rechtschreibprüfung wirkt sofort live über Electrons Session-API (kein
  // Neustart) UND wird über denselben Einstellungs-Mechanismus gespeichert.
  onToggle(el, 'stSpellcheck', async (next) => {
    await window.archivAPI.setSpellCheckEnabled(next);
    await updateSetting({ editor: { spellcheck: next } });
  });
}

// --- 5.4  Backup — einspaltig -------------------------------------------

async function renderBackupSection(el, config, updateSetting, context, lifecycle) {
  const status = context.backupStatus || await window.archivAPI.getBackupStatus();
  if (!lifecycle.isCurrent()) return;

  const isRunning = Boolean(status.inProgress || context.backupUiState.manualInProgress);
  const nextDue = status.nextScheduledAt ? new Date(status.nextScheduledAt).getTime() <= Date.now() : false;
  // Handlungsbedarf im Sinne von Abschnitt 4: es fehlt etwas oder ist überfällig.
  const needsAction = !status.lastSuccessAt || !config.backupPath || nextDue;

  const backupAction = isRunning
    ? button2('stRunBackupNow', 'Backup läuft …', { disabled: true })
    : needsAction
      ? button1('stRunBackupNow', 'Jetzt sichern')
      : button2('stRunBackupNow', 'Jetzt sichern');

  const feedback = context.backupUiState.feedback;
  const errorMessage = feedback && feedback.type !== 'success'
    ? feedback.message
    : status.lastErrorAt
      ? `${status.lastErrorUserMessage || status.lastErrorMessage || 'Das letzte Backup ist fehlgeschlagen.'} (${formatRelative(status.lastErrorAt)})`
      : '';
  const successMessage = feedback?.type === 'success' ? feedback.message : '';

  el.innerHTML = pane(1,
    stateRow({
      id: 'stBackupState',
      needsAction,
      title: status.lastSuccessAt ? `Letztes Backup ${formatRelative(status.lastSuccessAt)}` : 'Noch kein Backup erstellt',
      sub: `Nächstes geplantes Backup: ${formatFuture(status.nextScheduledAt)}`,
      action: backupAction
    })
    + feedbackLine('stBackupFeedback', errorMessage || successMessage, Boolean(errorMessage))
    + group('Speicherort und Zeitplan',
      row('Backup-Ordner', '',
        readonlyValue({ id: 'stBackupPath', text: config.backupPath || 'nicht ausgewählt', className: config.backupPath ? 'is-mono' : 'is-placeholder' })
        + textAction('stChangeBackupPath', 'Ordner wählen…'))
      + row('Automatisches Backup', '',
        select({
          id: 'stBackupInterval',
          value: String(config.backupIntervalDays ?? 1),
          options: BACKUP_INTERVAL_OPTIONS.map(o => ({ value: String(o.value), label: o.label }))
        }))
    )
    + group('Umfang',
      block('<div class="aws-words"><span>Notizen</span><span>Anhänge</span><span>Wiki-Einstellungen</span></div>'
        + '<p class="aws-block-note">Ein Backup ist eine vollständige Kopie deines Wikis. Bewahre die Dateien sicher auf.</p>')
    )
    + group('Wiederherstellung',
      block(`<div class="aws-split"><p>ZIP entpacken und den Ordner in Archiv-Wiki öffnen.</p>${button2('stOpenBackupFolder', 'Backup-Ordner öffnen')}</div>`)
    )
  );

  async function rerender(nextStatus) {
    if (!lifecycle.isCurrent()) return;
    await renderBackupSection(el, config, updateSetting, { ...context, backupStatus: nextStatus }, lifecycle);
  }

  el.querySelector('#stChangeBackupPath').addEventListener('click', async () => {
    context.backupUiState.feedback = null;
    setFeedback(el, 'stBackupFeedback', '');
    try {
      const chosen = await window.archivAPI.chooseBackupFolder?.();
      if (!chosen || !lifecycle.isCurrent()) return;
      const validation = await window.archivAPI.validateBackupFolder?.(chosen);
      if (!lifecycle.isCurrent()) return;
      if (!validation?.valid) {
        setFeedback(el, 'stBackupFeedback', validation?.message || validation?.details || 'Der ausgewählte Ordner kann nicht verwendet werden.', true);
        return;
      }
      await updateSetting({ backupPath: validation.path || chosen });
      if (!lifecycle.isCurrent()) return;
      await rerender(status);
    } catch (error) {
      console.error('Backup-Ordner konnte nicht geprüft werden:', error);
      if (lifecycle.isCurrent()) setFeedback(el, 'stBackupFeedback', error?.message || 'Der Backup-Ordner konnte nicht geprüft werden.', true);
    }
  });

  onSelectChange(el, 'stBackupInterval', async (value) => {
    context.backupUiState.feedback = null;
    await updateSetting({ backupIntervalDays: Number(value) });
    await rerender(status);
  });

  el.querySelector('#stRunBackupNow').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (button.disabled) return;
    context.backupUiState.feedback = null;
    button.disabled = true;
    button.textContent = 'Backup läuft …';
    context.backupUiState.manualInProgress = true;
    try {
      const result = await window.archivAPI.runBackupNow();
      context.backupUiState.manualInProgress = false;
      if (!lifecycle.isCurrent()) return;
      if (result?.started === false && result.reason === 'busy') {
        context.backupUiState.feedback = { type: 'warning', message: 'Es läuft bereits ein Backup.' };
      } else if (result?.success === false) {
        context.backupUiState.feedback = {
          type: 'error',
          message: result.error?.userMessage || result.status?.lastErrorUserMessage || result.error?.message || 'Das Backup konnte nicht erstellt werden.'
        };
      } else {
        context.backupUiState.feedback = {
          type: 'success',
          message: result?.cleanupWarnings > 0
            ? 'Backup erstellt. Ältere Sicherungen konnten nicht vollständig entfernt werden.'
            : 'Backup erstellt.'
        };
      }
      await rerender(result?.status);
    } catch (error) {
      context.backupUiState.manualInProgress = false;
      console.error('Backup konnte nicht erstellt werden:', error);
      context.backupUiState.feedback = { type: 'error', message: 'Das Backup konnte nicht erstellt werden.' };
      if (!lifecycle.isCurrent()) return;
      const latestStatus = await window.archivAPI.getBackupStatus().catch(() => status);
      await rerender(latestStatus);
    }
  });

  el.querySelector('#stOpenBackupFolder').addEventListener('click', async () => {
    context.backupUiState.feedback = null;
    setFeedback(el, 'stBackupFeedback', '');
    try {
      const result = await window.archivAPI.openBackupFolder();
      if (!lifecycle.isCurrent() || result?.opened) return;
      setFeedback(el, 'stBackupFeedback', 'Der Backup-Ordner konnte nicht geöffnet werden.', true);
    } catch (error) {
      console.error('Backup-Ordner konnte nicht geöffnet werden:', error);
      if (lifecycle.isCurrent()) setFeedback(el, 'stBackupFeedback', 'Der Backup-Ordner konnte nicht geöffnet werden.', true);
    }
  });
}

// --- 5.5  Updates — einspaltig ------------------------------------------

function releaseNotesHtml(version) {
  const normalized = String(version || '').trim().replace(/^v/i, '');
  const notes = getReleaseNotesForVersion(normalized);
  if (!notes?.sections?.length) return '';
  const item = (entry) => typeof entry === 'string'
    ? esc(entry)
    : `${esc(entry?.text || '')}${entry?.strong ? `<strong>${esc(entry.strong)}</strong>` : ''}${esc(entry?.suffix || '')}`;
  return `<div class="aws-notes" id="stReleaseNotes"${releaseNotesExpanded ? '' : ' hidden'}>
    ${notes.intro ? `<p>${esc(notes.intro)}</p>` : ''}
    ${notes.sections.map(section => `<h6>${esc(section.title)}</h6><ul>${section.items.map(entry => `<li>${item(entry)}</li>`).join('')}</ul>`).join('')}
  </div>`;
}

// Übersetzt den zentralen Update-Status in die zwei Formen der Zustandszeile
// (Abschnitt 4): Handlungsbedarf mit amberfarbener Kante, sonst blau.
function updateStateFor(status) {
  const version = status.currentVersion ? `v${status.currentVersion}` : 'Version unbekannt';
  const checked = formatDateTime(status.lastCheckAt);
  const checkedSuffix = checked ? ` · geprüft ${checked}` : ' · noch nicht geprüft';
  switch (status.phase) {
    case 'checking':
      return { needsAction: false, title: 'Suche nach Updates …', sub: `${version}${checkedSuffix}`, action: null };
    case 'updateAvailable':
      return { needsAction: true, title: `Version ${status.availableVersion} ist verfügbar`, sub: `${version}${checkedSuffix}`, action: button1('stDownloadUpdate', 'Jetzt herunterladen') };
    case 'downloading':
      return { needsAction: false, title: 'Update wird heruntergeladen', sub: `${version}${checkedSuffix}`, action: null };
    case 'downloaded':
      return { needsAction: true, title: 'Update ist bereit', sub: `${version}${checkedSuffix}`, action: button1('stInstallUpdate', 'Neu starten und installieren') };
    case 'installing':
      return { needsAction: false, title: 'Update wird installiert …', sub: `${version}${checkedSuffix}`, action: null };
    case 'upToDate':
      return { needsAction: false, title: 'Du verwendest die aktuelle Version', sub: `${version}${checkedSuffix}`, action: button2('stCheckNow', 'Jetzt suchen') };
    case 'error':
    case 'unavailable':
      return {
        needsAction: true,
        title: status.errorMessage || 'Der Update-Status konnte nicht ermittelt werden.',
        sub: `${version}${checkedSuffix}`,
        action: status.installReady
          ? button1('stInstallUpdate', 'Neu starten und installieren')
          : status.errorType === 'download'
            ? button1('stRetryDownload', 'Erneut versuchen')
            : button2('stCheckNow', 'Erneut versuchen')
      };
    default:
      return { needsAction: true, title: 'Noch nicht nach Updates gesucht', sub: `${version}${checkedSuffix}`, action: button2('stCheckNow', 'Jetzt suchen') };
  }
}

async function renderUpdatesSection(el, config, updateSetting, context, lifecycle) {
  const [status, updateSettings] = await Promise.all([
    context.updateStatus ? Promise.resolve(context.updateStatus) : fetchUpdateStatus(),
    window.archivAPI.getUpdateSettings()
  ]);
  if (!lifecycle.isCurrent()) return;

  const state = updateStateFor(status);
  const notesHtml = releaseNotesHtml(status.currentVersion);

  el.innerHTML = pane(1,
    stateRow({ id: 'stUpdateState', needsAction: state.needsAction, title: state.title, sub: state.sub, subMono: true, action: state.action })
    + block(inlineGroup(
      (notesHtml ? textAction('stToggleReleaseNotes', `Änderungen in v${status.currentVersion || '?'} ansehen`) : '')
      + textAction('stOpenReleases', 'GitHub-Releases öffnen'), { wideGap: true })
      + notesHtml)
    + feedbackLine('stUpdateFeedback')
    + group('Update-Verhalten',
      row('Beim Start nach Updates suchen', 'Prüft nur; es wird nichts geladen.',
        toggle({ id: 'stUpdateCheckOnStart', on: Boolean(updateSettings.checkOnStart), label: 'Beim Start nach Updates suchen' }))
      + row('Automatisch herunterladen', 'Installiert wird erst nach deiner Bestätigung.',
        toggle({ id: 'stUpdateAutoDownload', on: Boolean(updateSettings.autoDownload), label: 'Automatisch herunterladen' }))
      + row('Vor jedem Download nachfragen', 'Hat Vorrang vor automatischem Herunterladen.',
        toggle({ id: 'stUpdateConfirmDownload', on: Boolean(updateSettings.confirmBeforeDownload), label: 'Vor jedem Download nachfragen' }))
      + row('Vor dem Neustart nachfragen', 'Immer aktiv — Archiv-Wiki startet nie von selbst neu.',
        toggle({ id: 'stUpdateConfirmRestart', on: true, disabled: true, label: 'Vor dem Neustart nachfragen' })),
      { className: 'has-wide-label' })
  );

  async function rerender(nextStatus) {
    if (!lifecycle.isCurrent()) return;
    await renderUpdatesSection(el, config, updateSetting, { ...context, updateStatus: nextStatus }, lifecycle);
  }

  el.querySelector('#stToggleReleaseNotes')?.addEventListener('click', (event) => {
    const notes = el.querySelector('#stReleaseNotes');
    if (!notes) return;
    releaseNotesExpanded = notes.hidden;
    notes.hidden = !releaseNotesExpanded;
    event.currentTarget.textContent = releaseNotesExpanded
      ? `Änderungen in v${status.currentVersion || '?'} ausblenden`
      : `Änderungen in v${status.currentVersion || '?'} ansehen`;
  });

  el.querySelector('#stOpenReleases').addEventListener('click', () => {
    window.open(status.releaseUrl || GITHUB_RELEASES_URL, '_blank');
  });

  el.querySelector('#stCheckNow')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    setFeedback(el, 'stUpdateFeedback', '');
    button.disabled = true;
    button.textContent = 'Suche …';
    try {
      const fresh = await requestUpdateCheck();
      if (!lifecycle.isCurrent()) return;
      await rerender(fresh);
    } catch (error) {
      console.error('Update-Prüfung fehlgeschlagen:', error);
      if (lifecycle.isCurrent()) setFeedback(el, 'stUpdateFeedback', 'Die Update-Prüfung ist fehlgeschlagen.', true);
      if (button.isConnected) { button.disabled = false; button.textContent = 'Jetzt suchen'; }
    }
  });

  const startDownload = async (button) => {
    setFeedback(el, 'stUpdateFeedback', '');
    button.disabled = true;
    button.textContent = 'Wird heruntergeladen …';
    try {
      const downloadPromise = window.archivAPI.downloadUpdate();
      const fresh = await fetchUpdateStatus();
      if (lifecycle.isCurrent()) await rerender(fresh);
      const result = await downloadPromise;
      if (!result?.started && lifecycle.isCurrent()) await rerender(await fetchUpdateStatus());
    } catch (error) {
      console.error('Update-Download konnte nicht gestartet werden:', error);
      if (lifecycle.isCurrent()) setFeedback(el, 'stUpdateFeedback', 'Der Update-Download konnte nicht gestartet werden.', true);
    }
  };
  el.querySelector('#stDownloadUpdate')?.addEventListener('click', (event) => { void startDownload(event.currentTarget); });
  el.querySelector('#stRetryDownload')?.addEventListener('click', (event) => { void startDownload(event.currentTarget); });

  el.querySelector('#stInstallUpdate')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    setFeedback(el, 'stUpdateFeedback', '');
    button.disabled = true;
    button.textContent = 'Wird installiert …';
    try {
      const result = await window.archivAPI.installUpdateAndRestart();
      if (result?.started || !lifecycle.isCurrent()) return;
      setFeedback(el, 'stUpdateFeedback', result?.error || 'Der Installations- und Neustartvorgang konnte nicht gestartet werden.', true);
      button.disabled = false;
      button.textContent = 'Neu starten und installieren';
    } catch (error) {
      console.error('Update-Installation konnte nicht gestartet werden:', error);
      if (!lifecycle.isCurrent()) return;
      setFeedback(el, 'stUpdateFeedback', 'Der Installations- und Neustartvorgang konnte nicht gestartet werden.', true);
      button.disabled = false;
      button.textContent = 'Neu starten und installieren';
    }
  });

  // Update-Einstellungen sind app-weit (main/app-state.js), nicht Teil der
  // projektbezogenen config — deshalb direkt über window.archivAPI, exakt wie
  // beim Schließen-Verhalten im Bereich Allgemein.
  const saveUpdateSetting = async (key, value) => {
    setFeedback(el, 'stUpdateFeedback', '');
    const result = await window.archivAPI.setUpdateSetting(key, value);
    if (!result?.saved) throw new Error('Einstellung wurde nicht gespeichert.');
  };
  onToggle(el, 'stUpdateCheckOnStart', (next) => saveUpdateSetting('updateCheckOnStart', next));
  onToggle(el, 'stUpdateAutoDownload', (next) => saveUpdateSetting('updateAutoDownload', next));
  onToggle(el, 'stUpdateConfirmDownload', (next) => saveUpdateSetting('updateConfirmBeforeDownload', next));
}

// --- 5.6  Web Clipper — zweispaltig -------------------------------------

function normalizedCaptureMode(value) {
  const candidate = String(value || '').trim();
  return WEB_CLIPPER_CAPTURE_MODES.some(option => option.value === candidate) ? candidate : 'selection';
}

async function renderWebClipperSection(el, config, updateSetting, context, lifecycle) {
  const status = context.webClipperStatus
    || await window.archivAPI.webClipper?.getStatus?.()
    || { receiverReady: false, browserConnected: false, lastBrowserConnectionAt: null, lastClipAt: null, lastError: null };
  if (!lifecycle.isCurrent()) return;

  const browserValue = status.browserConnected
    ? 'gerade verbunden'
    : status.lastBrowserConnectionAt
      ? formatDateTime(status.lastBrowserConnectionAt) || 'in dieser Sitzung keine'
      : 'in dieser Sitzung keine';
  const clipValue = status.lastClipAt
    ? formatDateTime(status.lastClipAt) || 'in dieser Sitzung keiner'
    : 'in dieser Sitzung keiner';

  const left = group('Verbindung',
    row('Archiv-Wiki-Empfang', status.lastError || 'Läuft nur, solange Archiv-Wiki geöffnet ist.',
      `<div class="aws-dot-line"><i></i><span class="aws-state-word">${status.receiverReady ? 'BEREIT' : 'NICHT VERFÜGBAR'}</span></div>`)
    + row('Browser-Verbindung', '', `<div class="aws-value-mono">${esc(browserValue)}</div>`)
    + row('Letzter Clip', '', `<div class="aws-value-mono">${esc(clipValue)}</div>`)
  ) + group('Eingang',
    row('Eingang in der Sidebar', 'Blendet nur den Eintrag aus. Gespeicherte Clips bleiben erhalten.',
      toggle({ id: 'stIncomingShowInSidebar', on: config.incoming?.showInSidebar !== false, label: 'Eingang in der Sidebar' }))
  );

  const right = group('Sammelmodus',
    row('Standard-Sammelmodus', 'Was ein Clip enthält. Wird mit den Wiki-Einstellungen gespeichert.',
      select({
        id: 'stWebClipperDefaultMode',
        value: normalizedCaptureMode(config.webClipper?.defaultCaptureMode),
        options: WEB_CLIPPER_CAPTURE_MODES.map(option => ({ value: option.value, label: option.label }))
      }))
  ) + group('Browser-Erweiterung',
    row('Firefox', 'Öffnet die Erweiterung bei Mozilla Add-ons.', button2('stOpenFirefoxAmo', 'Installieren'))
    + row('Brave / Chromium', 'Bereitet die mitgelieferte Erweiterung ohne Entwicklermodus vor. Wirkt beim nächsten vollständigen Start.',
      button2('stInstallBraveWebClipper', 'Vorbereiten')
      + feedbackLine('stBraveFeedback')
      // Nicht in der Spezifikation, bewusst erhalten: die einzige Stelle, an
      // der die einmal erteilte Flatpak-Native-Messaging-Berechtigung wieder
      // entzogen werden kann. Erscheint nur, wenn sie tatsächlich erteilt ist.
      + `<span id="stRevokeBraveWrap" hidden>${textAction('stRevokeBraveFlatpakPermission', 'Native-Messaging-Berechtigung entfernen')}</span>`)
  );

  el.innerHTML = pane(2, left, right);

  onSelectChange(el, 'stWebClipperDefaultMode', async (value) => {
    await updateSetting({ webClipper: { defaultCaptureMode: normalizedCaptureMode(value) } });
  });

  onToggle(el, 'stIncomingShowInSidebar', async (next) => {
    await updateSetting({ incoming: { showInSidebar: next } });
  });

  el.querySelector('#stOpenFirefoxAmo').addEventListener('click', () => window.open(FIREFOX_AMO_URL, '_blank'));

  const revokeWrap = el.querySelector('#stRevokeBraveWrap');
  const revokeAction = el.querySelector('#stRevokeBraveFlatpakPermission');

  async function refreshBraveFlatpakPermissionUi() {
    const permission = await window.archivAPI.webClipper?.getBraveFlatpakPermissionStatus?.();
    if (!lifecycle.isCurrent()) return;
    revokeWrap.hidden = !(permission?.supported && permission.installed && permission.granted);
  }
  void refreshBraveFlatpakPermissionUi();

  revokeAction.addEventListener('click', async () => {
    revokeAction.disabled = true;
    try {
      await window.archivAPI.webClipper?.revokeBraveFlatpakPermission?.();
    } catch (error) {
      console.error('Native-Messaging-Berechtigung konnte nicht entfernt werden:', error);
      if (lifecycle.isCurrent()) setFeedback(el, 'stBraveFeedback', error?.message || 'Die Berechtigung konnte nicht entfernt werden.', true);
    } finally {
      if (lifecycle.isCurrent()) revokeAction.disabled = false;
    }
    await refreshBraveFlatpakPermissionUi();
  });

  el.querySelector('#stInstallBraveWebClipper').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Wird vorbereitet …';
    setFeedback(el, 'stBraveFeedback', '');
    try {
      // Brave läuft als Flatpak sandboxed und kann den Native Host ohne eine
      // zusätzliche, persistente Host-Berechtigung nicht starten. Diese
      // Berechtigung wird ausschließlich hier, nach ausdrücklicher Zustimmung,
      // gesetzt — nie automatisch beim App-Start.
      const permission = await window.archivAPI.webClipper?.getBraveFlatpakPermissionStatus?.();
      if (permission?.installed && !permission.granted) {
        const consent = await showConfirmDialog({
          title: 'Native-Messaging-Berechtigung für Brave (Flatpak)',
          message: 'Brave läuft als Flatpak in einer eigenen Sandbox und kann den Archiv-Wiki-Native-Host deshalb nicht direkt starten.\n\nDafür braucht Brave zusätzlich die dauerhafte Berechtigung, mit dem Flatpak-Hostdienst (org.freedesktop.Flatpak) zu sprechen. Das erweitert die Brave-Sandbox gegenüber deinem System und gilt für die gesamte Brave-App, nicht nur für Archiv-Wiki.\n\nDu kannst diese Berechtigung hier jederzeit wieder entfernen.',
          confirmLabel: 'Berechtigung erteilen',
          cancelLabel: 'Abbrechen'
        });
        if (!lifecycle.isCurrent()) return;
        if (!consent) {
          setFeedback(el, 'stBraveFeedback', 'Abgebrochen. Es wurde nichts verändert.');
          button.textContent = 'Erneut versuchen';
          return;
        }
        await window.archivAPI.webClipper.grantBraveFlatpakPermission();
        if (!lifecycle.isCurrent()) return;
        await refreshBraveFlatpakPermissionUi();
      }

      const result = await window.archivAPI.webClipper?.installBrave?.();
      if (!result?.prepared) throw new Error('Die Installation konnte nicht vorbereitet werden.');
      if (!lifecycle.isCurrent()) return;
      setFeedback(el, 'stBraveFeedback', 'Vorbereitet. Brave vollständig schließen und neu starten.');
      button.textContent = 'Erneut vorbereiten';
    } catch (error) {
      if (!lifecycle.isCurrent()) return;
      console.error('Brave Web Clipper konnte nicht vorbereitet werden:', error);
      setFeedback(el, 'stBraveFeedback', error?.message || 'Die Installation konnte nicht vorbereitet werden.', true);
      button.textContent = 'Erneut versuchen';
    } finally {
      if (lifecycle.isCurrent()) button.disabled = false;
    }
  });
}

// --- 5.7  Sicherheit — einspaltig ---------------------------------------

const PRIVACY_POINTS = [
  'Wiki-Dateien liegen lokal',
  'Notizen werden nur lokal verarbeitet',
  'Keine Analysedienste',
  'Keine Übertragung von Inhalten',
  'Internet nur für Updates',
  'Sync nur über deine Dienste'
];

function renderSecuritySection(el, config, updateSetting, context) {
  const enabled = Boolean(config.appLock?.enabled);

  // Bei aktivem Schutz braucht jede Änderung zusätzlich das aktuelle Passwort
  // — der Hauptprozess prüft es und schreibt nur bei Erfolg. Das ist keine
  // zweite Einstellung, sondern derselbe Vorgang; beide Felder stehen
  // deshalb untereinander in derselben Bedienspalte derselben Zeile.
  const passwordFields = (enabled
    ? textInput({ id: 'stCurrentAppLockPw', type: 'password', placeholder: 'Aktuelles Passwort', attrs: ' autocomplete="current-password"' })
    : '')
    + inlineGroup(
      textInput({ id: 'stNewAppLockPw', type: 'password', placeholder: enabled ? 'Neues Passwort' : 'Passwort', attrs: ' autocomplete="new-password"' })
      + button2('stSetAppLockPw', 'Setzen'));

  el.innerHTML = pane(1,
    group('Zugriff',
      row('App-Passwortschutz', 'Schützt den Zugriff in Archiv-Wiki. Die Dateien im Wiki-Ordner werden nicht verschlüsselt.',
        toggleWithWord({ id: 'stAppLockToggle', on: enabled, label: 'App-Passwortschutz', word: enabled ? 'AKTIVIERT' : 'DEAKTIVIERT' }))
      + row('Passwort', '',
        passwordFields + feedbackLine('stAppLockFeedback'),
        { disabled: !enabled })
    )
    + group('Datenschutz',
      block(`<ul class="aws-privacy">${PRIVACY_POINTS.map(point => `<li>${ICONS.check}<span>${esc(point)}</span></li>`).join('')}</ul>`)
    )
  );

  const passwordRow = el.querySelector('#stSetAppLockPw').closest('.aws-row');
  const newPasswordInput = el.querySelector('#stNewAppLockPw');

  function rerender() {
    if (el.isConnected) renderSecuritySection(el, config, updateSetting, context);
  }

  async function applyAppLockChange(newPassword) {
    const currentPassword = el.querySelector('#stCurrentAppLockPw')?.value || '';
    if (enabled && !currentPassword.trim()) {
      setFeedback(el, 'stAppLockFeedback', 'Bitte gib dein aktuelles Passwort ein.', true);
      return false;
    }
    const result = await window.archivAPI.settings.setAppLockPassword({ currentPassword, newPassword });
    if (!result?.ok) {
      setFeedback(el, 'stAppLockFeedback', result?.reason === 'CURRENT_PASSWORD_REQUIRED'
        ? 'Bitte gib dein aktuelles Passwort ein.'
        : 'Das aktuelle Passwort ist nicht korrekt.', true);
      return false;
    }
    config = result.config;
    context.onConfigChange?.(config);
    rerender();
    return true;
  }

  // Der Schalter zeigt immer den tatsächlich gespeicherten Zustand. Bei
  // ausgeschaltetem Schutz gibt es noch kein Passwort — dort gibt der Schalter
  // die Zeile darunter nur frei; scharf wird der Schutz erst mit "Setzen".
  el.querySelector('#stAppLockToggle').addEventListener('click', async () => {
    setFeedback(el, 'stAppLockFeedback', '');
    if (!enabled) {
      passwordRow.classList.remove('is-disabled');
      newPasswordInput.focus();
      setFeedback(el, 'stAppLockFeedback', 'Passwort eingeben und "Setzen" wählen.');
      return;
    }
    try {
      await applyAppLockChange('');
    } catch (error) {
      console.error('App-Passwortschutz konnte nicht entfernt werden:', error);
      setFeedback(el, 'stAppLockFeedback', 'Der App-Passwortschutz konnte nicht entfernt werden.', true);
    }
  });

  el.querySelector('#stSetAppLockPw').addEventListener('click', async () => {
    setFeedback(el, 'stAppLockFeedback', '');
    const newPassword = newPasswordInput.value || '';
    if (!newPassword.trim()) {
      setFeedback(el, 'stAppLockFeedback', enabled ? 'Bitte gib ein neues Passwort ein.' : 'Bitte gib ein Passwort ein.', true);
      return;
    }
    try {
      await applyAppLockChange(newPassword);
    } catch (error) {
      console.error('App-Passwort konnte nicht gespeichert werden:', error);
      setFeedback(el, 'stAppLockFeedback', 'Das App-Passwort konnte nicht gespeichert werden.', true);
    }
  });
}
