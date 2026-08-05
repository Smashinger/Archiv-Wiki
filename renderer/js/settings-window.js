// renderer/js/settings-window.js
// Das neue, zentrale Einstellungsfenster — modular aufgebaut: jeder Bereich
// (Allgemein/Darstellung/Editor/Backup/Updates/Sicherheit) ist eine eigene,
// unabhängige render-Funktion. Ein künftiger Bereich (Synchronisation,
// Plugins, Sprache, Tastenkürzel, ...) wird einfach als ein weiterer Eintrag
// in SETTINGS_SECTIONS ergänzt — an der Fenster-/Navigations-Logik selbst
// muss dafür nichts geändert werden.
//
// Alle Änderungen werden sofort live angewendet (siehe apply*-Aufrufe direkt
// neben jedem Feld) UND sofort über den Settings-Service (settings:update)
// gespeichert — kein Neustart nötig, kein separater "Speichern"-Button.

import { ACCENT_PALETTES, applyAccentPalette, buildAccentSwatchesHtml, SIDEBAR_DENSITY_PRESETS, applySidebarDensity, applyEditorFontSize, setFocusMode, isFocusModeAvailable, syncFocusIntensitySelection, READING_WIDTH_PRESETS, applyReadingWidth, generateRandomAccentColor } from './theme.js';
import { fetchUpdateStatus, requestUpdateCheck, onUpdateStatusChanged, renderUpdateStatus } from './update-check.js';
import { animateIn, animateOut } from './motion.js';
import { manageModalDialog } from './dialog.js';

function escapeAttr(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

const BACKUP_INTERVAL_OPTIONS = [
  { value: 0, label: 'Deaktiviert' },
  { value: 1, label: 'Täglich' },
  { value: 3, label: 'Alle 3 Tage' },
  { value: 7, label: 'Wöchentlich' },
  { value: 14, label: 'Alle 2 Wochen' },
  { value: 30, label: 'Monatlich' }
];

let closeActiveSettingsWindow = null;
let settingsWindowOpenGeneration = 0;

function renderSettingsLoading(el, title, message) {
  el.innerHTML = `<h3>${escapeAttr(title)}</h3><p class="settings-hint">${escapeAttr(message)}</p>`;
}

function renderSettingsError(el, title, message) {
  el.innerHTML = `<h3>${escapeAttr(title)}</h3><p class="settings-hint settings-hint-error">${escapeAttr(message)}</p>`;
}

function showInlineSettingsError(el, message) {
  if (!el?.isConnected) return;
  let errorEl = el.querySelector('[data-settings-error]');
  if (!errorEl) {
    errorEl = document.createElement('p');
    errorEl.className = 'settings-hint settings-hint-error';
    errorEl.dataset.settingsError = '';
    el.appendChild(errorEl);
  }
  errorEl.textContent = message;
}

function clearInlineSettingsError(el) {
  el?.querySelector('[data-settings-error]')?.remove();
}

const SETTINGS_SECTIONS = [
  { id: 'general', label: 'Allgemein', render: renderGeneralSection },
  { id: 'appearance', label: 'Darstellung', render: renderAppearanceSection },
  { id: 'editor', label: 'Editor', render: renderEditorSection },
  { id: 'backup', label: 'Backup', render: renderBackupSection },
  { id: 'updates', label: 'Updates', render: renderUpdatesSection },
  { id: 'security', label: 'Sicherheit', render: renderSecuritySection }
];

export async function showSettingsWindow(context = {}) {
  const openGeneration = ++settingsWindowOpenGeneration;
  // Falls der Dialog durch einen zweiten Auslöser erneut geöffnet wird, zuerst
  // den vorhandenen Dialog sauber schließen (inkl. Fokus-/Hintergrundzustand).
  if (closeActiveSettingsWindow) closeActiveSettingsWindow({ immediate: true, restoreFocus: false });

  const previouslyFocused = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  let config;
  let configLoadError = null;
  try {
    config = await window.archivAPI.settings.get();
  } catch (error) {
    console.error('Einstellungen konnten nicht geladen werden:', error);
    config = {};
    configLoadError = error;
  }
  if (openGeneration !== settingsWindowOpenGeneration) return;
  let activeId = SETTINGS_SECTIONS[0].id;
  let isClosing = false;
  const backupUiState = { manualInProgress: false, feedback: null };

  const overlay = document.createElement('div');
  overlay.className = 'settings-overlay';
  overlay.innerHTML = `
    <div class="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settingsDialogTitle">
      <div class="settings-modal-header">
        <span id="settingsDialogTitle"><img class="lib-icon dialog-title-icon" src="assets/icon-library/projects/settings.svg" alt="">Einstellungen</span>
        <button type="button" class="modal-close-x" data-action="close-x" title="Schließen" aria-label="Einstellungen schließen">✕</button>
      </div>
      <div class="settings-modal-body">
        <nav class="settings-nav" aria-label="Einstellungsbereiche">
          ${SETTINGS_SECTIONS.map(s => `<button type="button" data-section="${s.id}">${escapeAttr(s.label)}</button>`).join('')}
        </nav>
        <div class="settings-content" id="settingsContent"></div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  const modal = overlay.querySelector('.settings-modal');
  animateIn(modal);

  function hasActiveChildDialog() {
    return [...document.querySelectorAll('.prompt-overlay, .table-editor-overlay, .image-lightbox-overlay')]
      .some(element => element !== overlay && element.isConnected && element.getClientRects().length > 0);
  }

  let stopBackupStatusUpdates = null;
  let stopUpdateStatusUpdates = null;
  let dialogController = null;

  function finishClose(restoreFocus = true) {
    stopBackupStatusUpdates?.();
    stopUpdateStatusUpdates?.();
    dialogController?.destroy({ restoreFocus });
    closeActiveSettingsWindow = null;
  }

  function closeSettings({ immediate = false, restoreFocus = true } = {}) {
    if (isClosing) return;
    isClosing = true;
    if (immediate) finishClose(restoreFocus);
    else animateOut(modal, () => finishClose(restoreFocus));
  }

  closeActiveSettingsWindow = closeSettings;
  dialogController = manageModalDialog({
    overlay,
    dialog: modal,
    titleElement: overlay.querySelector('#settingsDialogTitle'),
    initialFocus: () => overlay.querySelector('.settings-nav button'),
    onRequestClose: () => closeSettings(),
    closeOnBackdrop: false,
    canCloseOnEscape: () => !hasActiveChildDialog()
  });

  // Sofort speichern UND zurückgeben — jede Sektion wendet das Ergebnis
  // selbst live an (z. B. applyAccentPalette), kein Neustart nötig.
  async function updateSetting(patch) {
    try {
      config = await window.archivAPI.settings.update(patch);
      if (context.onConfigChange) context.onConfigChange(config);
      clearInlineSettingsError(overlay.querySelector('#settingsContent'));
      return config;
    } catch (error) {
      console.error('Einstellung konnte nicht gespeichert werden:', error);
      showInlineSettingsError(overlay.querySelector('#settingsContent'), 'Die Einstellung konnte nicht gespeichert werden.');
      return config;
    }
  }

  let renderGeneration = 0;

  async function renderActive(overrides = {}) {
    const section = SETTINGS_SECTIONS.find(s => s.id === activeId);
    if (!section) return;
    const generation = ++renderGeneration;

    overlay.querySelectorAll('.settings-nav button').forEach(button => {
      const isActive = button.dataset.section === activeId;
      button.classList.toggle('active', isActive);
      if (isActive) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });

    const contentEl = overlay.querySelector('#settingsContent');
    contentEl.innerHTML = '';
    if (configLoadError) {
      renderSettingsError(contentEl, section.label, 'Die Einstellungen konnten nicht geladen werden. Bitte öffne das Fenster erneut.');
      return;
    }
    const lifecycle = {
      isCurrent: () => !isClosing
        && overlay.isConnected
        && generation === renderGeneration
        && activeId === section.id
    };

    try {
      await section.render(contentEl, config, updateSetting, { ...context, backupUiState, ...overrides }, lifecycle);
    } catch (error) {
      if (!lifecycle.isCurrent()) return;
      console.error(`Einstellungsbereich "${section.id}" konnte nicht geladen werden:`, error);
      renderSettingsError(contentEl, section.label, 'Der Bereich konnte nicht geladen werden. Bitte versuche es erneut.');
    }
  }

  stopBackupStatusUpdates = window.archivAPI.onBackupStatusUpdated?.((status) => {
    if (!overlay.isConnected || activeId !== 'backup' || backupUiState.manualInProgress) return;
    renderActive({ backupStatus: status });
  });

  stopUpdateStatusUpdates = onUpdateStatusChanged((status) => {
    if (!overlay.isConnected || activeId !== 'updates') return;
    renderActive({ updateStatus: status });
  });

  overlay.querySelector('.settings-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-section]');
    if (!btn) return;
    activeId = btn.dataset.section;
    renderActive();
  });

  // Klicks außerhalb schließen den Dialog weiterhin bewusst nicht.
  overlay.querySelector('[data-action="close-x"]').addEventListener('click', () => closeSettings());

  renderActive();
  requestAnimationFrame(() => {
    overlay.querySelector('.settings-nav button[data-section]')?.focus({ preventScroll: true });
  });
}
// --- Allgemein ---
async function renderGeneralSection(el, config, updateSetting, context, lifecycle) {
  renderSettingsLoading(el, 'Allgemein', 'Lade Einstellungen …');
  const [closeBehavior, windowStartBehavior] = await Promise.all([
    window.archivAPI.getCloseBehavior(),
    window.archivAPI.getWindowStartBehavior()
  ]);
  if (!lifecycle.isCurrent()) return;
  const closeOptions = [
    { value: 'ask', label: 'Immer nachfragen (Standard)' },
    { value: 'tray', label: 'Immer in den System-Tray minimieren' },
    { value: 'quit', label: 'Immer vollständig beenden' }
  ];
  const windowStartOptions = [
    { value: 'maximized', label: 'Maximiert (empfohlen)' },
    { value: 'restore', label: 'Letzten Zustand wiederherstellen' },
    { value: 'centered', label: 'Zentriert' }
  ];
  const categoryStartupOptions = [
    { value: 'closed', label: 'Alles geschlossen (Standard)' },
    { value: 'restore', label: 'Letzten Zustand wiederherstellen' },
    { value: 'topLevelOpen', label: 'Hauptkategorien geöffnet' },
    { value: 'allOpen', label: 'Alles geöffnet' }
  ];
  const categoryStartupBehavior = config.categoryStartupBehavior || 'closed';
  el.innerHTML = `
    <h3>Allgemein</h3>
    <section class="settings-group" aria-labelledby="stGeneralWikiGroup">
      <h4 id="stGeneralWikiGroup">Wiki</h4>
    <label class="settings-field">
      <span>Wiki-Name</span>
      <input type="text" id="stWikiName" value="${escapeAttr(config.wikiName || '')}" placeholder="z. B. Max">
    </label>
    <div class="settings-field">
      <span>Speicherort</span>
      <div class="settings-readonly-value" id="stProjectPath">${escapeAttr(context.projectPath || '')}</div>
      <button type="button" class="btn ghost settings-inline-btn" id="stMoveProjectFolder">Wiki-Speicherort ändern…</button>
      <p class="settings-hint" id="stMoveHint">Kopiert das Wiki an den neuen Ort. Der bisherige Ordner bleibt zur Sicherheit bestehen und kann anschließend manuell gelöscht werden. Der neue Ordner muss leer sein.</p>
    </div>
    </section>
    <section class="settings-group" aria-labelledby="stGeneralBehaviorGroup">
      <h4 id="stGeneralBehaviorGroup">Start und Schließen</h4>
    <div class="settings-field">
      <span>Fensterverhalten</span>
      <div class="close-dialog-options" id="stWindowStartOptions">
        ${windowStartOptions.map(o => `<label class="close-dialog-option"><input type="radio" name="stWindowStart" value="${o.value}" ${windowStartBehavior === o.value ? 'checked' : ''}> ${escapeAttr(o.label)}</label>`).join('')}
      </div>
      <p class="settings-hint">Die Änderung gilt beim nächsten Programmstart.</p>
    </div>
    <div class="settings-field">
      <span>Kategorien beim Start</span>
      <div class="close-dialog-options" id="stCategoryStartupOptions">
        ${categoryStartupOptions.map(o => `<label class="close-dialog-option"><input type="radio" name="stCategoryStartup" value="${o.value}" ${categoryStartupBehavior === o.value ? 'checked' : ''}> ${escapeAttr(o.label)}</label>`).join('')}
      </div>
      <p class="settings-hint">Bestimmt nur den Zustand beim Programmstart — während der Nutzung lässt sich jede Kategorie weiterhin ganz normal einzeln auf- und zuklappen, und das Öffnen einer Notiz klappt bei Bedarf automatisch die passende Kategorie auf.</p>
    </div>
    <div class="settings-field">
      <span>Verhalten beim Schließen über X</span>
      <div class="close-dialog-options" id="stCloseBehaviorOptions">
        ${closeOptions.map(o => `<label class="close-dialog-option"><input type="radio" name="stCloseBehavior" value="${o.value}" ${closeBehavior === o.value ? 'checked' : ''}> ${escapeAttr(o.label)}</label>`).join('')}
      </div>
    </div>
    </section>
    <section class="settings-group" aria-labelledby="stGeneralHelpGroup">
      <h4 id="stGeneralHelpGroup">Hilfe</h4>
      <div class="settings-field">
        <span>Tastenkürzel</span>
        <button type="button" class="btn ghost settings-inline-btn" id="stShowShortcuts">Übersicht öffnen</button>
        <p class="settings-hint">Zeigt die vorhandene Übersicht aller Tastenkürzel.</p>
      </div>
    </section>
  `;
  el.querySelector('#stShowShortcuts').addEventListener('click', () => {
    context.onShowShortcuts?.();
  });
  el.querySelector('#stWikiName').addEventListener('change', async (e) => {
    const name = e.target.value.trim();
    await updateSetting({ wikiName: name });
    const brandText = document.getElementById('sidebarBrandText');
    const brand = document.getElementById('sidebarBrand');
    if (brandText && brand) {
      if (name) { brandText.textContent = `Wiki von ${name}`; brand.style.display = ''; }
      else { brand.style.display = 'none'; }
    }
  });
  el.querySelector('#stWindowStartOptions').addEventListener('change', async (e) => {
    if (e.target.name !== 'stWindowStart') return;
    clearInlineSettingsError(el);
    try {
      await window.archivAPI.setWindowStartBehavior(e.target.value);
    } catch (error) {
      console.error('Fenster-Startverhalten konnte nicht gespeichert werden:', error);
      showInlineSettingsError(el, 'Das Fenster-Startverhalten konnte nicht gespeichert werden.');
    }
  });
  el.querySelector('#stCategoryStartupOptions').addEventListener('change', async (e) => {
    if (e.target.name !== 'stCategoryStartup') return;
    await updateSetting({ categoryStartupBehavior: e.target.value });
  });
  el.querySelector('#stCloseBehaviorOptions').addEventListener('change', async (e) => {
    if (e.target.name !== 'stCloseBehavior') return;
    clearInlineSettingsError(el);
    const input = e.target;
    try {
      await window.archivAPI.setCloseBehavior(input.value);
    } catch (error) {
      console.error('Schließen-Verhalten konnte nicht gespeichert werden:', error);
      showInlineSettingsError(el, 'Das Schließen-Verhalten konnte nicht gespeichert werden.');
    }
  });
  el.querySelector('#stMoveProjectFolder').addEventListener('click', async (e) => {
    const btn = e.target;
    const hint = el.querySelector('#stMoveHint');
    btn.disabled = true;
    btn.textContent = 'Wird kopiert …';
    try {
      const result = await window.archivAPI.moveProjectFolder();
      if (!lifecycle.isCurrent() || !result) return;
      if (result.error) {
        hint.textContent = result.error;
        hint.classList.add('settings-hint-error');
        return;
      }
      if (result.moved) {
        el.querySelector('#stProjectPath').textContent = result.newPath;
        if (context.onProjectPathChange) context.onProjectPathChange(result.newPath);
        hint.classList.remove('settings-hint-error');
        hint.textContent = `Verschoben. Die alten Dateien liegen weiterhin unter: ${result.oldPath}`;
      }
    } catch (error) {
      console.error('Wiki-Speicherort konnte nicht geändert werden:', error);
      if (lifecycle.isCurrent()) {
        hint.textContent = 'Der Speicherort konnte nicht geändert werden.';
        hint.classList.add('settings-hint-error');
      }
    } finally {
      if (btn.isConnected) {
        btn.disabled = false;
        btn.textContent = 'Wiki-Speicherort ändern…';
      }
    }
    // result.moved === false ohne error: Nutzer hat den Dialog abgebrochen — nichts weiter tun
  });
}

// --- Darstellung ---
function renderAppearanceSection(el, config, updateSetting) {
  el.innerHTML = `
    <h3>Darstellung</h3>
    <section class="settings-group" aria-labelledby="stAppearanceColorsGroup">
      <h4 id="stAppearanceColorsGroup">Farben</h4>
    <div class="settings-field">
      <span>Akzentfarbe</span>
      <div class="color-swatches" id="stAccentSwatches">
        ${buildAccentSwatchesHtml(config.accentKey || 'orange')}
        <button type="button" class="color-swatch color-swatch-random" id="stRandomAccent" data-accent="random" title="Neue Zufallsfarbe erzeugen"><img class="lib-icon dialog-inline-icon" src="assets/icon-library/projects/sparkles.svg" alt=""></button>
      </div>
      <input type="color" id="stCustomColorInput" class="settings-hidden-color-input" aria-label="Eigene Akzentfarbe auswählen" value="${escapeAttr(config.customAccentColor || '#c17d45')}">
      <div class="settings-hex-input-row">
        <input type="text" class="settings-hex-input" id="stHexInput" aria-label="Eigener Farbcode" placeholder="#RRGGBB" maxlength="7" value="${config.accentKey === 'custom' ? escapeAttr(config.customAccentColor || '') : ''}">
        <span class="settings-hint" id="stHexHint">oder Farbcode eingeben</span>
      </div>
    </div>
    </section>
    <section class="settings-group" aria-labelledby="stAppearanceInterfaceGroup">
      <h4 id="stAppearanceInterfaceGroup">Oberfläche</h4>
    <div class="settings-field">
      <span>Sidebar-Größe</span>
      <div class="density-option-row" id="stDensityRow" role="group" aria-label="Sidebar-Größe">
        ${Object.entries(SIDEBAR_DENSITY_PRESETS).map(([key, preset]) =>
          `<button type="button" class="density-option ${config.sidebarDensity === key ? 'active' : ''}" data-density="${key}">${escapeAttr(preset.label)}</button>`
        ).join('')}
      </div>
    </div>
    </section>
    <section class="settings-group" aria-labelledby="stAppearanceWorkspaceGroup">
      <h4 id="stAppearanceWorkspaceGroup">Arbeitsansicht</h4>
    <div class="settings-field">
      <span>Fokus-Modus</span>
      <label class="settings-checkbox-row">
        <input type="checkbox" id="stFocusModeEnabled" ${document.body.classList.contains('focus-mode') ? 'checked' : ''} ${isFocusModeAvailable() ? '' : 'disabled'}>
        <span>Fokus-Modus aktivieren</span>
      </label>
      <div class="density-option-row" id="stFocusIntensityRow" role="group" aria-label="Stärke des Fokus-Modus">
        ${[{ v: 'light', l: 'Leicht' }, { v: 'medium', l: 'Mittel' }, { v: 'strong', l: 'Stark' }, { v: 'stronger', l: 'Sehr stark' }].map(o =>
          `<button type="button" aria-pressed="${(config.focusModeIntensity || 'medium') === o.v ? 'true' : 'false'}" class="density-option ${(config.focusModeIntensity || 'medium') === o.v ? 'active' : ''}" data-intensity="${o.v}">${o.l}</button>`
        ).join('')}
      </div>
    </div>
    <div class="settings-field">
      <span>Lesebreite</span>
      <label class="settings-checkbox-row">
        <input type="checkbox" id="stReadingWidthEnabled" ${config.readingWidthEnabled ? 'checked' : ''}>
        <span>Optimale Lesebreite verwenden</span>
      </label>
      <div class="density-option-row" id="stReadingWidthRow" role="group" aria-label="Lesebreite">
        ${Object.entries(READING_WIDTH_PRESETS).map(([key, preset]) =>
          `<button type="button" class="density-option ${(config.readingWidthKey || 'standard') === key ? 'active' : ''}" data-reading-width="${key}">${escapeAttr(preset.label)}</button>`
        ).join('')}
      </div>
      <p class="settings-hint">Begrenzt Editor und Vorschau auf eine angenehme Breite. Breite Tabellen und lange Codezeilen bleiben innerhalb ihres Bereichs horizontal scrollbar.</p>
    </div>
    </section>
  `;
  const customSwatch = el.querySelector('.color-swatch-custom');
  const customColorInput = el.querySelector('#stCustomColorInput');
  const hexInput = el.querySelector('#stHexInput');
  const hexHint = el.querySelector('#stHexHint');
  // Aktuell gewählte eigene Farbe als Hintergrund zeigen — bewusst per JS
  // gesetzt statt als Inline-Style im HTML-String (letzteres würde im Wizard
  // durch dessen strengere CSP blockiert; hier zwar unkritisch, aber gleiches
  // Muster überall beibehalten, siehe Kommentar in theme.js).
  if (config.accentKey === 'custom' && config.customAccentColor) {
    customSwatch.style.background = config.customAccentColor;
    customSwatch.textContent = '';
  }
  // Gemeinsame Anwenden-Funktion für JEDEN Weg zu einer eigenen Farbe (native
  // Farbwahl, Zufalls-Kreis, oder das Hex-Textfeld weiter unten) — vermeidet,
  // dieselben drei Schritte (anwenden, speichern, Kreis-Zustand aktualisieren)
  // an drei Stellen zu wiederholen.
  async function applyCustomColor(hex) {
    applyAccentPalette('custom', hex);
    await updateSetting({ accentKey: 'custom', customAccentColor: hex });
    customSwatch.style.background = hex;
    customSwatch.textContent = '';
    el.querySelectorAll('#stAccentSwatches button').forEach(s => s.classList.toggle('active', s === customSwatch));
    hexInput.value = hex;
    hexInput.classList.remove('invalid');
  }
  el.querySelector('#stAccentSwatches').addEventListener('click', async (e) => {
    const swatch = e.target.closest('[data-accent]');
    if (!swatch) return;
    const key = swatch.dataset.accent;
    if (key === 'custom') { customColorInput.click(); return; }
    // Zufalls-Akzentfarbe (Nutzer-Feature): wird bewusst wie eine ganz
    // normale, manuell gewählte eigene Farbe behandelt (accentKey:'custom')
    // — keine eigene, vierte Kategorie dafür, nur dass der Hex-Wert nicht
    // vom Nutzer, sondern von generateRandomAccentColor() kommt.
    if (key === 'random') { await applyCustomColor(generateRandomAccentColor()); return; }
    applyAccentPalette(key);
    await updateSetting({ accentKey: key });
    el.querySelectorAll('#stAccentSwatches button').forEach(s => s.classList.toggle('active', s.dataset.accent === key));
    hexInput.value = '';
    hexInput.classList.remove('invalid');
  });
  customColorInput.addEventListener('input', (e) => {
    // Live-Vorschau schon während des Ziehens im Farbwähler, noch ungespeichert.
    applyAccentPalette('custom', e.target.value);
    customSwatch.style.background = e.target.value;
    customSwatch.textContent = '';
    hexInput.value = e.target.value;
  });
  customColorInput.addEventListener('change', async (e) => {
    await applyCustomColor(e.target.value);
  });
  // Eigener Hex-Code (Nutzer-Feature): Ersatzweg zum nativen Systemdialog,
  // der unter manchen Linux-Desktops die Hex-Eingabe hinter einer
  // zusätzlichen "+"-Kachel versteckt, statt sie direkt anzuzeigen — mit
  // diesem Feld ist man davon unabhängig, unabhängig vom jeweiligen
  // Betriebssystem-Dialog.
  const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
  hexInput.addEventListener('input', (e) => {
    const value = e.target.value.trim();
    hexInput.classList.toggle('invalid', value.length > 0 && !HEX_PATTERN.test(value));
  });
  hexInput.addEventListener('change', async (e) => {
    let value = e.target.value.trim();
    if (value && !value.startsWith('#')) value = '#' + value; // "a3f5c2" genauso akzeptieren wie "#a3f5c2"
    if (!HEX_PATTERN.test(value)) {
      hexInput.classList.add('invalid');
      hexHint.textContent = 'Ungültig — bitte im Format #RRGGBB eingeben';
      return;
    }
    hexHint.textContent = 'oder Farbcode eingeben';
    await applyCustomColor(value);
  });
  el.querySelector('#stDensityRow').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-density]');
    if (!btn) return;
    applySidebarDensity(btn.dataset.density);
    await updateSetting({ sidebarDensity: btn.dataset.density });
    el.querySelectorAll('#stDensityRow button').forEach(b => b.classList.toggle('active', b === btn));
  });
  // Fokus-Modus: die Checkbox schaltet direkt live um (Einstellungsfenster
  // läuft im selben Dokument wie die Hauptansicht, kein separates
  // BrowserWindow — siehe setFocusMode in theme.js). Die Intensität ist eine
  // Stil-Vorliebe und wird gespeichert; ist der Modus gerade aktiv, wirkt sie
  // sofort sichtbar.
  el.querySelector('#stFocusModeEnabled').addEventListener('change', (e) => {
    const active = setFocusMode(e.target.checked, config.focusModeIntensity);
    e.target.checked = active;
  });
  el.querySelector('#stFocusIntensityRow').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-intensity]');
    if (!btn) return;
    await updateSetting({ focusModeIntensity: btn.dataset.intensity });
    config.focusModeIntensity = btn.dataset.intensity;
    if (document.body.classList.contains('focus-mode')) setFocusMode(true, btn.dataset.intensity);
    syncFocusIntensitySelection(btn.dataset.intensity);
  });
  // Lesebreite: läuft im selben Dokument wie die Hauptansicht (siehe Kommentar
  // beim Fokus-Modus oben) — Checkbox und Breiten-Auswahl wirken deshalb ohne
  // Umweg sofort sichtbar in der offenen Notiz, kein Neustart nötig.
  el.querySelector('#stReadingWidthEnabled').addEventListener('change', async (e) => {
    applyReadingWidth(e.target.checked, config.readingWidthKey || 'standard');
    await updateSetting({ readingWidthEnabled: e.target.checked });
  });
  el.querySelector('#stReadingWidthRow').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-reading-width]');
    if (!btn) return;
    await updateSetting({ readingWidthKey: btn.dataset.readingWidth });
    config.readingWidthKey = btn.dataset.readingWidth;
    applyReadingWidth(config.readingWidthEnabled, btn.dataset.readingWidth);
    el.querySelectorAll('#stReadingWidthRow button').forEach(b => b.classList.toggle('active', b === btn));
  });
}

// --- Editor ---
function renderEditorSection(el, config, updateSetting) {
  const editor = config.editor || {};
  el.innerHTML = `
    <h3>Editor</h3>
    <section class="settings-group" aria-labelledby="stEditorWritingGroup">
      <h4 id="stEditorWritingGroup">Schreiben</h4>
    <label class="settings-field">
      <span>Editor-Schriftgröße</span>
      <select id="stFontSize">
        ${[12, 13, 14, 16, 18].map(px => `<option value="${px}" ${Number(config.editorFontSize) === px ? 'selected' : ''}>${px}px</option>`).join('')}
      </select>
    </label>
    <label class="settings-field">
      <span>Automatisches Speichern (Sekunden)</span>
      <input type="number" id="stAutoSave" min="0" max="300" step="5" value="${escapeAttr(editor.autoSave ?? 30)}">
    </label>
    <p class="settings-hint">0 Sekunden deaktiviert das automatische Speichern.</p>
    <label class="settings-field">
      <span>Einrückung (Leerzeichen pro Tab)</span>
      <input type="number" id="stTabSize" min="1" max="8" value="${escapeAttr(editor.tabSize ?? 2)}">
    </label>
    </section>
    <section class="settings-group" aria-labelledby="stEditorLanguageGroup">
      <h4 id="stEditorLanguageGroup">Sprache</h4>
    <label class="settings-checkbox-row">
      <input type="checkbox" id="stSpellcheck" ${editor.spellcheck !== false ? 'checked' : ''}>
      <span>Rechtschreibprüfung im Editor</span>
    </label>
    <p class="settings-hint">Die Rechtschreibprüfung verwendet derzeit Deutsch.</p>
    </section>
  `;
  el.querySelector('#stFontSize').addEventListener('change', async (e) => {
    const px = applyEditorFontSize(Number(e.target.value));
    await updateSetting({ editorFontSize: px });
  });
  el.querySelector('#stAutoSave').addEventListener('change', async (e) => {
    const raw = Number(e.target.value);
    const val = Number.isNaN(raw) ? 30 : Math.min(300, Math.max(0, raw));
    e.target.value = val;
    await updateSetting({ editor: { autoSave: val } });
  });
  el.querySelector('#stTabSize').addEventListener('change', async (e) => {
    const val = Math.min(8, Math.max(1, Number(e.target.value) || 2));
    e.target.value = val;
    await updateSetting({ editor: { tabSize: val } });
  });
  // Rechtschreibprüfung (Nutzer-Feature): wirkt sofort live über Electrons
  // Session-API (kein Neustart nötig) UND wird dauerhaft über denselben
  // generischen Einstellungs-Mechanismus wie automatisches Speichern/Einrückung gespeichert.
  el.querySelector('#stSpellcheck').addEventListener('change', async (e) => {
    await window.archivAPI.setSpellCheckEnabled(e.target.checked);
    await updateSetting({ editor: { spellcheck: e.target.checked } });
  });
}

// --- Backup ---
async function renderBackupSection(el, config, updateSetting, context, lifecycle) {
  renderSettingsLoading(el, 'Backup', 'Lade Status …');
  const status = context.backupStatus || await window.archivAPI.getBackupStatus();
  if (!lifecycle.isCurrent()) return;

  const isRunning = Boolean(status.inProgress || context.backupUiState.manualInProgress);
  const lastSuccessText = status.lastSuccessAt ? formatRelative(status.lastSuccessAt) : 'Noch kein Backup erstellt.';
  const feedback = context.backupUiState.feedback;
  const feedbackHtml = feedback
    ? `<p class="settings-hint settings-hint-${escapeAttr(feedback.type)}" role="status" data-backup-feedback>${escapeAttr(feedback.message)}</p>`
    : '';
  const lastErrorHtml = status.lastErrorAt
    ? `
      <div class="backup-status-message backup-status-message-error" role="status">
        <strong>Letztes Backup fehlgeschlagen</strong>
        <span>${escapeAttr(status.lastErrorUserMessage || status.lastErrorMessage || 'Das Backup konnte nicht erstellt werden.')}</span>
        <span class="backup-status-time">${escapeAttr(formatRelative(status.lastErrorAt))}</span>
        <button type="button" class="backup-error-details-toggle" id="stBackupErrorDetailsToggle">Technische Details anzeigen</button>
        <pre class="backup-error-details" id="stBackupErrorDetails" style="display:none;">${escapeAttr([status.lastErrorCode, status.lastErrorMessage].filter(Boolean).join('\n') || 'Keine weiteren Details verfügbar.')}</pre>
      </div>`
    : '';
  const cleanupHtml = status.lastCleanupErrorAt
    ? `
      <div class="backup-status-message backup-status-message-warning" role="status">
        <strong>Backup erstellt</strong>
        <span>${escapeAttr(status.lastCleanupErrorUserMessage || 'Das neue Backup wurde erstellt, aber ältere Sicherungen konnten nicht vollständig entfernt werden.')}</span>
        <span class="backup-status-time">${escapeAttr(formatRelative(status.lastCleanupErrorAt))}</span>
        <button type="button" class="backup-error-details-toggle" id="stBackupCleanupDetailsToggle">Technische Details anzeigen</button>
        <pre class="backup-error-details" id="stBackupCleanupDetails" style="display:none;">${escapeAttr([status.lastCleanupErrorCode, status.lastCleanupErrorMessage].filter(Boolean).join('\n') || 'Keine weiteren Details verfügbar.')}</pre>
      </div>`
    : '';

  el.innerHTML = `
    <h3>Backup</h3>
    <section class="settings-group" aria-labelledby="stBackupSetupGroup">
      <h4 id="stBackupSetupGroup">Speicherort und Zeitplan</h4>
      <div class="settings-field">
        <span>Backup-Ordner</span>
        <div class="settings-readonly-value" id="stBackupPath">${escapeAttr(config.backupPath || 'Noch kein Backup-Ordner ausgewählt.')}</div>
        <button type="button" class="btn ghost settings-inline-btn" id="stChangeBackupPath">Backup-Ordner wählen…</button>
      </div>
      <label class="settings-field">
        <span>Automatisches Backup</span>
        <select id="stBackupInterval">
          ${BACKUP_INTERVAL_OPTIONS.map(o => `<option value="${o.value}" ${(config.backupIntervalDays ?? 1) === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>
      </label>
    </section>
    <section class="settings-group" aria-labelledby="stBackupStatusGroup">
      <h4 id="stBackupStatusGroup">Status</h4>
      ${feedbackHtml}
      ${lastErrorHtml}
      ${cleanupHtml}
      <div class="settings-field">
        <span>Letztes erfolgreiches Backup</span>
        <div class="settings-readonly-value">${escapeAttr(lastSuccessText)}</div>
      </div>
      <div class="settings-field">
        <span>Nächstes geplantes Backup</span>
        <div class="settings-readonly-value">${escapeAttr(formatFuture(status.nextScheduledAt))}</div>
      </div>
      <div class="settings-button-row">
        <button type="button" class="btn ghost" id="stRunBackupNow" ${isRunning ? 'disabled' : ''}>${isRunning ? 'Backup läuft …' : 'Backup jetzt erstellen'}</button>
        <button type="button" class="btn ghost" id="stOpenBackupFolder">Backup-Ordner öffnen</button>
      </div>
    </section>
    <section class="settings-group" aria-labelledby="stBackupRestoreGroup">
      <h4 id="stBackupRestoreGroup">Wiederherstellung</h4>
      <p class="settings-hint backup-restore-hint">Backup-Ordner öffnen, gewünschte ZIP-Datei auswählen und entpacken. Anschließend den entpackten Wiki-Ordner in Archiv-Wiki öffnen.</p>
    </section>
  `;

  function wireDetailsToggle(toggleId, detailsId) {
    const toggle = el.querySelector(`#${toggleId}`);
    const details = el.querySelector(`#${detailsId}`);
    if (!toggle || !details) return;
    toggle.addEventListener('click', () => {
      const show = details.style.display === 'none';
      details.style.display = show ? 'block' : 'none';
      toggle.textContent = show ? 'Technische Details ausblenden' : 'Technische Details anzeigen';
      toggle.setAttribute('aria-expanded', String(show));
    });
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', detailsId);
  }
  wireDetailsToggle('stBackupErrorDetailsToggle', 'stBackupErrorDetails');
  wireDetailsToggle('stBackupCleanupDetailsToggle', 'stBackupCleanupDetails');

  el.querySelector('#stChangeBackupPath').addEventListener('click', async () => {
    clearInlineSettingsError(el);
    context.backupUiState.feedback = null;
    try {
      const chosen = await window.archivAPI.chooseBackupFolder?.();
      if (!chosen || !lifecycle.isCurrent()) return;
      await updateSetting({ backupPath: chosen });
      if (!lifecycle.isCurrent()) return;
      el.querySelector('#stBackupPath').textContent = chosen;
    } catch (error) {
      console.error('Backup-Ordner konnte nicht geändert werden:', error);
      showInlineSettingsError(el, 'Der Backup-Ordner konnte nicht geändert werden.');
    }
  });
  el.querySelector('#stBackupInterval').addEventListener('change', async (e) => {
    clearInlineSettingsError(el);
    context.backupUiState.feedback = null;
    try {
      await updateSetting({ backupIntervalDays: Number(e.target.value) });
    } catch (error) {
      console.error('Backup-Intervall konnte nicht gespeichert werden:', error);
      showInlineSettingsError(el, 'Das Backup-Intervall konnte nicht gespeichert werden.');
    }
  });
  el.querySelector('#stRunBackupNow').addEventListener('click', async (e) => {
    const button = e.currentTarget;
    clearInlineSettingsError(el);
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
        await renderBackupSection(el, config, updateSetting, { ...context, backupStatus: result?.status }, lifecycle);
        return;
      }
      if (result?.success === false) {
        context.backupUiState.feedback = {
          type: 'error',
          message: result.error?.userMessage || result.status?.lastErrorUserMessage || result.error?.message || 'Das Backup konnte nicht erstellt werden.'
        };
        await renderBackupSection(el, config, updateSetting, { ...context, backupStatus: result?.status }, lifecycle);
        return;
      }
      context.backupUiState.feedback = {
        type: 'success',
        message: result?.cleanupWarnings > 0
          ? 'Backup erfolgreich erstellt. Ältere Sicherungen konnten nicht vollständig entfernt werden.'
          : 'Backup erfolgreich erstellt.'
      };
      await renderBackupSection(el, config, updateSetting, { ...context, backupStatus: result?.status }, lifecycle);
    } catch (error) {
      context.backupUiState.manualInProgress = false;
      console.error('Backup konnte nicht erstellt werden:', error);
      context.backupUiState.feedback = { type: 'error', message: 'Das Backup konnte nicht erstellt werden.' };
      if (lifecycle.isCurrent()) {
        const latestStatus = await window.archivAPI.getBackupStatus().catch(() => status);
        if (lifecycle.isCurrent()) await renderBackupSection(el, config, updateSetting, { ...context, backupStatus: latestStatus }, lifecycle);
      }
    }
  });
  el.querySelector('#stOpenBackupFolder').addEventListener('click', async () => {
    clearInlineSettingsError(el);
    context.backupUiState.feedback = null;
    try {
      const result = await window.archivAPI.openBackupFolder();
      if (!lifecycle.isCurrent()) return;
      if (!result?.opened) {
        context.backupUiState.feedback = { type: 'error', message: 'Der Backup-Ordner konnte nicht geöffnet werden.' };
        await renderBackupSection(el, config, updateSetting, { ...context, backupStatus: status }, lifecycle);
      }
    } catch (error) {
      console.error('Backup-Ordner konnte nicht geöffnet werden:', error);
      context.backupUiState.feedback = { type: 'error', message: 'Der Backup-Ordner konnte nicht geöffnet werden.' };
      if (lifecycle.isCurrent()) await renderBackupSection(el, config, updateSetting, { ...context, backupStatus: status }, lifecycle);
    }
  });
}

// --- Updates ---
async function renderUpdatesSection(el, config, updateSetting, context, lifecycle) {
  renderSettingsLoading(el, 'Updates', 'Prüfe …');
  const [status, updateSettings] = await Promise.all([
    context.updateStatus ? Promise.resolve(context.updateStatus) : fetchUpdateStatus(),
    window.archivAPI.getUpdateSettings()
  ]);
  if (!lifecycle.isCurrent()) return;
  const lastCheckLabel = status.lastCheckAt
    ? new Date(status.lastCheckAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
    : 'noch nie geprüft';
  const showUpdateError = status.phase === 'error' || status.phase === 'unavailable';
  const canInstallUpdate = status.phase === 'downloaded' || (status.phase === 'error' && status.installReady);
  const installingUpdate = status.phase === 'installing';
  const updateErrorHtml = showUpdateError ? `
    <div class="settings-hint settings-hint-error" id="stUpdateError">
      ${escapeHtml(status.errorMessage || 'Der Update-Status konnte nicht ermittelt werden.')}
      ${status.errorDetails ? `<details class="settings-technical-details"><summary>Technische Details anzeigen</summary><div>${escapeHtml(status.errorDetails)}</div></details>` : ''}
    </div>` : '';
  el.innerHTML = `
    <h3>Updates</h3>
    <section class="settings-group" aria-labelledby="stUpdateStatusGroup">
      <h4 id="stUpdateStatusGroup">Versionsstatus</h4>
    <div class="settings-field">
      <span>Installierte Version</span>
      <div class="settings-readonly-value">v${escapeAttr(status.currentVersion || '?')}</div>
    </div>
    <div class="settings-field">
      <span>Neueste verfügbare Version</span>
      <div class="settings-readonly-value" id="stLatestVersion">${status.availableVersion ? 'v' + escapeAttr(status.availableVersion) : 'unbekannt'}</div>
    </div>
    <div class="settings-field">
      <span>Letzte Prüfung</span>
      <div class="settings-readonly-value" id="stLastCheck">${escapeAttr(lastCheckLabel)}</div>
    </div>
    <div class="settings-field">
      <span>Status</span>
      <div class="update-status-inline"><span class="update-dot" id="stUpdateDot"></span><span class="update-status-label" id="stUpdateLabel"></span></div>
      ${updateErrorHtml}
    </div>
    <div class="settings-button-row">
      <button type="button" class="btn ghost" id="stCheckNow">Jetzt nach Updates suchen</button>
      ${canInstallUpdate || installingUpdate ? `<button type="button" class="btn" id="stInstallUpdate" ${installingUpdate ? 'disabled' : ''}>${installingUpdate ? 'Update wird installiert …' : 'Jetzt neu starten'}</button>` : ''}
      <button type="button" class="btn ghost" id="stOpenReleases">GitHub-Releases öffnen</button>
    </div>
    </section>
    <section class="settings-group" aria-labelledby="stUpdateBehaviorGroup">
      <h4 id="stUpdateBehaviorGroup">Update-Verhalten</h4>
    <div class="settings-field">
      <span>Automatik und Rückfragen</span>
      <label class="settings-checkbox-row">
        <input type="checkbox" id="stUpdateCheckOnStart" ${updateSettings.checkOnStart ? 'checked' : ''}>
        <span>Beim Start automatisch nach Updates suchen</span>
      </label>
      <label class="settings-checkbox-row">
        <input type="checkbox" id="stUpdateAutoDownload" ${updateSettings.autoDownload ? 'checked' : ''}>
        <span>Verfügbare Updates automatisch herunterladen</span>
      </label>
      <label class="settings-checkbox-row">
        <input type="checkbox" id="stUpdateConfirmDownload" ${updateSettings.confirmBeforeDownload ? 'checked' : ''}>
        <span>Vor jedem Download nachfragen</span>
      </label>
      <label class="settings-checkbox-row">
        <input type="checkbox" checked disabled>
        <span>Vor dem Neustart immer nachfragen</span>
      </label>
      <p class="settings-hint">Ist „Vor jedem Download nachfragen“ aktiviert, beginnt der Download erst nach deiner Bestätigung – auch wenn automatisches Herunterladen eingeschaltet ist. Archiv-Wiki installiert ein Update nie selbstständig und startet nie ohne Rückfrage neu.</p>
    </div>
    </section>
  `;
  renderUpdateStatus(el.querySelector('#stUpdateDot'), el.querySelector('#stUpdateLabel'), status);
  el.querySelector('#stCheckNow').addEventListener('click', async (e) => {
    const button = e.currentTarget;
    clearInlineSettingsError(el);
    button.disabled = true;
    button.textContent = 'Prüfe …';
    try {
      const fresh = await requestUpdateCheck();
      if (!lifecycle.isCurrent()) return;
      if (fresh.phase === 'error' || fresh.phase === 'unavailable') {
        showInlineSettingsError(el, fresh.errorMessage || 'Die Update-Prüfung ist fehlgeschlagen.');
      }
      await renderUpdatesSection(el, config, updateSetting, { ...context, updateStatus: fresh }, lifecycle);
    } catch (error) {
      console.error('Update-Prüfung fehlgeschlagen:', error);
      showInlineSettingsError(el, 'Die Update-Prüfung ist fehlgeschlagen.');
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = 'Jetzt nach Updates suchen';
      }
    }
  });
  el.querySelector('#stInstallUpdate')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    clearInlineSettingsError(el);
    button.disabled = true;
    button.textContent = 'Update wird installiert …';
    try {
      const result = await window.archivAPI.installUpdateAndRestart();
      if (!result?.started && lifecycle.isCurrent()) {
        showInlineSettingsError(el, result?.error || 'Der Installations- und Neustartvorgang konnte nicht gestartet werden.');
        button.disabled = false;
        button.textContent = 'Jetzt neu starten';
      }
    } catch (error) {
      console.error('Update-Installation konnte nicht gestartet werden:', error);
      if (lifecycle.isCurrent()) {
        showInlineSettingsError(el, 'Der Installations- und Neustartvorgang konnte nicht gestartet werden.');
        button.disabled = false;
        button.textContent = 'Jetzt neu starten';
      }
    }
  });
  el.querySelector('#stOpenReleases').addEventListener('click', () => {
    window.open(status.releaseUrl || 'https://github.com/Smashinger/Archiv-Wiki/releases', '_blank');
  });
  // Update-Einstellungen sind app-weit (main/app-state.js), nicht Teil der
  // projektbezogenen config — deshalb direkt über window.archivAPI statt
  // über das hier übliche updateSetting(), exakt wie beim bestehenden
  // Schließen-Verhalten weiter oben in dieser Datei.
  const saveUpdateSetting = async (input, key) => {
    clearInlineSettingsError(el);
    const nextValue = input.checked;
    try {
      const result = await window.archivAPI.setUpdateSetting(key, nextValue);
      if (!result?.saved) throw new Error('Einstellung wurde nicht gespeichert.');
    } catch (error) {
      console.error(`Update-Einstellung "${key}" konnte nicht gespeichert werden:`, error);
      if (input.isConnected) input.checked = !nextValue;
      showInlineSettingsError(el, 'Die Update-Einstellung konnte nicht gespeichert werden.');
    }
  };
  el.querySelector('#stUpdateCheckOnStart').addEventListener('change', (e) => {
    saveUpdateSetting(e.currentTarget, 'updateCheckOnStart');
  });
  el.querySelector('#stUpdateAutoDownload').addEventListener('change', (e) => {
    saveUpdateSetting(e.currentTarget, 'updateAutoDownload');
  });
  el.querySelector('#stUpdateConfirmDownload').addEventListener('change', (e) => {
    saveUpdateSetting(e.currentTarget, 'updateConfirmBeforeDownload');
  });
}

// --- Sicherheit ---
function renderSecuritySection(el, config, updateSetting) {
  const enabled = Boolean(config.appLock?.enabled);
  el.innerHTML = `
    <h3>Sicherheit</h3>
    <div class="settings-field">
      <span>App-Passwortschutz</span>
      <div class="settings-readonly-value">${enabled ? 'Aktiviert' : 'Deaktiviert'}</div>
    </div>
    <label class="settings-field">
      <span>${enabled ? 'Neues Passwort setzen' : 'Passwort setzen'}</span>
      <input type="password" id="stAppLockPw" placeholder="Passwort eingeben">
    </label>
    <div class="settings-button-row">
      <button type="button" class="btn ghost" id="stSetAppLockPw">${enabled ? 'Passwort ändern' : 'Passwort setzen'}</button>
      ${enabled ? '<button type="button" class="btn ghost" id="stRemoveAppLockPw">Schutz entfernen</button>' : ''}
    </div>
  `;
  el.querySelector('#stSetAppLockPw').addEventListener('click', async () => {
    const pw = el.querySelector('#stAppLockPw').value;
    if (!pw.trim()) return;
    clearInlineSettingsError(el);
    try {
      config = await window.archivAPI.settings.setAppLockPassword(pw);
      if (el.isConnected) renderSecuritySection(el, config, updateSetting);
    } catch (error) {
      console.error('App-Passwort konnte nicht gespeichert werden:', error);
      showInlineSettingsError(el, 'Das App-Passwort konnte nicht gespeichert werden.');
    }
  });
  el.querySelector('#stRemoveAppLockPw')?.addEventListener('click', async () => {
    clearInlineSettingsError(el);
    try {
      config = await window.archivAPI.settings.setAppLockPassword('');
      if (el.isConnected) renderSecuritySection(el, config, updateSetting);
    } catch (error) {
      console.error('App-Passwortschutz konnte nicht entfernt werden:', error);
      showInlineSettingsError(el, 'Der App-Passwortschutz konnte nicht entfernt werden.');
    }
  });
}
