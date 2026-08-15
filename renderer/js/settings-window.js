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

import { ACCENT_PALETTES, applyAccentPalette, buildAccentSwatchesHtml, SIDEBAR_DENSITY_PRESETS, applySidebarDensity, applyEditorFontSize, READING_WIDTH_PRESETS, applyReadingWidth, generateRandomAccentColor } from './theme.js';
import { fetchUpdateStatus, requestUpdateCheck, onUpdateStatusChanged, renderUpdateStatus } from './update-check.js';
import { animateIn, animateOut } from './motion.js';
import { manageModalDialog, showConfirmDialog } from './dialog.js';

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
  { id: 'webclipper', label: 'Web Clipper', render: renderWebClipperSection },
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
      <div class="settings-save-feedback" id="settingsSaveFeedback" role="status" aria-live="polite">✓ Gespeichert</div>
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
  let stopWebClipperStatusUpdates = null;
  let dialogController = null;
  let saveFeedbackTimer = null;

  function showSettingsSavedFeedback() {
    const feedbackEl = overlay.querySelector('#settingsSaveFeedback');
    if (!feedbackEl || isClosing) return;

    clearTimeout(saveFeedbackTimer);
    feedbackEl.classList.remove('is-visible');
    void feedbackEl.offsetWidth;
    feedbackEl.classList.add('is-visible');

    saveFeedbackTimer = setTimeout(() => {
      feedbackEl.classList.remove('is-visible');
      saveFeedbackTimer = null;
    }, 1600);
  }

  function finishClose(restoreFocus = true) {
    stopBackupStatusUpdates?.();
    stopUpdateStatusUpdates?.();
    stopWebClipperStatusUpdates?.();
    clearTimeout(saveFeedbackTimer);
    saveFeedbackTimer = null;
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
      showSettingsSavedFeedback();
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
      await section.render(contentEl, config, updateSetting, { ...context, backupUiState, showSettingsSavedFeedback, ...overrides }, lifecycle);
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

  stopWebClipperStatusUpdates = window.archivAPI.webClipper?.onStatusUpdated?.((status) => {
    if (!overlay.isConnected || activeId !== 'webclipper') return;
    renderActive({ webClipperStatus: status });
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
  const closeBehavior = await window.archivAPI.getCloseBehavior();
  if (!lifecycle.isCurrent()) return;
  const closeOptions = [
    { value: 'ask', label: 'Immer nachfragen (Standard)' },
    { value: 'tray', label: 'Immer in den System-Tray minimieren' },
    { value: 'quit', label: 'Immer vollständig beenden' }
  ];
  const categoryStartupOptions = [
    { value: 'closed', label: 'Alles geschlossen (Standard)' },
    { value: 'restore', label: 'Letzten Zustand wiederherstellen' },
    { value: 'topLevelOpen', label: 'Hauptkategorien geöffnet' },
    { value: 'allOpen', label: 'Alles geöffnet' }
  ];
  const categoryStartupBehavior = config.categoryStartupBehavior || 'closed';
  el.innerHTML = `
    <div class="settings-general-compact">
      <h3>Allgemein</h3>

      <section class="settings-group" aria-labelledby="stGeneralWikiGroup">
        <h4 id="stGeneralWikiGroup">Wiki</h4>
        <p class="settings-hint settings-group-description">Name und Speicherort des Wikis.</p>

        <label class="settings-field">
          <span>Wiki-Name</span>
          <input type="text" id="stWikiName" value="${escapeAttr(config.wikiName || '')}" placeholder="z. B. Max">
          <p class="settings-hint">Diese Einstellung betrifft nur dieses Wiki.</p>
        </label>

        <div class="settings-field">
          <span>Wiki-Speicherort</span>
          <div class="settings-readonly-value" id="stProjectPath">${escapeAttr(context.projectPath || '')}</div>
          <button type="button" class="btn ghost settings-inline-btn" id="stMoveProjectFolder">Speicherort ändern…</button>
          <p class="settings-hint" id="stMoveHint">Kopiert das Wiki; der bisherige Ordner bleibt erhalten.</p>
        </div>
      </section>

      <section class="settings-group" aria-labelledby="stGeneralStartupGroup">
        <h4 id="stGeneralStartupGroup">Startverhalten</h4>
        <p class="settings-hint settings-group-description">Festlegen, wie Archiv-Wiki startet.</p>

        <div class="settings-field">
          <span>Kategorien beim Start</span>
          <div class="close-dialog-options" id="stCategoryStartupOptions">
            ${categoryStartupOptions.map(o => `<label class="close-dialog-option"><input type="radio" name="stCategoryStartup" value="${o.value}" ${categoryStartupBehavior === o.value ? 'checked' : ''}> ${escapeAttr(o.label)}</label>`).join('')}
          </div>
          <p class="settings-hint">Legt fest, welche Kategorien beim Start geöffnet sind.</p>
        </div>
      </section>

      <section class="settings-group" aria-labelledby="stGeneralBehaviorGroup">
        <h4 id="stGeneralBehaviorGroup">Verhalten</h4>
        <p class="settings-hint settings-group-description">Allgemeine Abläufe anpassen.</p>

        <div class="settings-field">
          <span>Verhalten beim Schließen</span>
          <div class="close-dialog-options" id="stCloseBehaviorOptions">
            ${closeOptions.map(o => `<label class="close-dialog-option"><input type="radio" name="stCloseBehavior" value="${o.value}" ${closeBehavior === o.value ? 'checked' : ''}> ${escapeAttr(o.label)}</label>`).join('')}
          </div>
        </div>
      </section>

      <section class="settings-group" aria-labelledby="stGeneralHelpGroup">
        <h4 id="stGeneralHelpGroup">Hilfe &amp; Tastenkürzel</h4>
        <p class="settings-hint settings-group-description">Schnellübersicht der Tastenkürzel.</p>

        <div class="settings-field">
          <span>Tastenkürzel</span>
          <button type="button" class="btn ghost settings-inline-btn" id="stShowShortcuts">Übersicht öffnen</button>
        </div>
      </section>
    </div>
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
      context.showSettingsSavedFeedback?.();
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
        hint.textContent = `Verschoben. Alter Ordner: ${result.oldPath}`;
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
  // Lesebreite: Einstellungsfenster läuft im selben Dokument wie die
  // Hauptansicht (kein separates BrowserWindow) — Checkbox und
  // Breiten-Auswahl wirken deshalb ohne Umweg sofort sichtbar in der
  // offenen Notiz, kein Neustart nötig.
  el.querySelector('#stReadingWidthEnabled').addEventListener('change', async (e) => {
    applyReadingWidth(e.target.checked, config.readingWidthKey || 'standard');
    await updateSetting({ readingWidthEnabled: e.target.checked });
  });
  el.querySelector('#stReadingWidthRow').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-reading-width]');
    if (!btn) return;
    await updateSetting({ readingWidthKey: btn.dataset.readingWidth });
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
  const actionFeedbackHtml = feedback?.type === 'success'
    ? `<p class="backup-action-feedback settings-hint-success" role="status" data-backup-feedback>✓ ${escapeAttr(feedback.message)}</p>`
    : '';

  const feedbackHtml = feedback && feedback.type !== 'success'
    ? `<p class="settings-hint settings-hint-${escapeAttr(feedback.type)}" role="status" data-backup-feedback>${escapeAttr(feedback.message)}</p>`
    : '';
  const lastErrorHtml = status.lastErrorAt
    ? `
      <div class="backup-status-message backup-status-message-error" role="status">
        <strong>Letztes Backup fehlgeschlagen</strong>
        <span>${escapeAttr(status.lastErrorUserMessage || status.lastErrorMessage || 'Das Backup konnte nicht erstellt werden.')}</span>
        <span class="backup-status-time">${escapeAttr(formatRelative(status.lastErrorAt))}</span>
        <button type="button" class="backup-error-details-toggle" id="stBackupErrorDetailsToggle">Technische Details anzeigen</button>
        <pre class="backup-error-details" id="stBackupErrorDetails" style="display:none;">${escapeAttr([status.lastErrorCode, status.lastErrorMessage].filter(Boolean).join('\n') || 'Information nicht verfügbar.')}</pre>
      </div>`
    : '';
  const cleanupHtml = status.lastCleanupErrorAt
    ? `
      <div class="backup-status-message backup-status-message-warning" role="status">
        <strong>Backup erstellt</strong>
        <span>${escapeAttr(status.lastCleanupErrorUserMessage || 'Das neue Backup wurde erstellt, aber ältere Sicherungen konnten nicht vollständig entfernt werden.')}</span>
        <span class="backup-status-time">${escapeAttr(formatRelative(status.lastCleanupErrorAt))}</span>
        <button type="button" class="backup-error-details-toggle" id="stBackupCleanupDetailsToggle">Technische Details anzeigen</button>
        <pre class="backup-error-details" id="stBackupCleanupDetails" style="display:none;">${escapeAttr([status.lastCleanupErrorCode, status.lastCleanupErrorMessage].filter(Boolean).join('\n') || 'Information nicht verfügbar.')}</pre>
      </div>`
    : '';

  const statusSectionHtml = (feedbackHtml || lastErrorHtml || cleanupHtml)
    ? `
      <section class="settings-group" aria-labelledby="stBackupStatusGroup">
        <h4 id="stBackupStatusGroup">Status</h4>
        ${feedbackHtml}
        ${lastErrorHtml}
        ${cleanupHtml}
      </section>`
    : '';

  el.innerHTML = `
    <h3>Backup</h3>
    <p class="settings-hint settings-scope-hint">Diese Einstellungen gelten nur für dieses Wiki.</p>
    <section class="backup-info-card" aria-labelledby="stBackupInfoTitle">
      <div class="backup-info-title" id="stBackupInfoTitle">Backup schützt dein Wiki</div>
      <p class="backup-info-text">Gesichert werden:</p>
      <ul class="backup-info-list">
        <li>Notizen</li>
        <li>Anhänge</li>
        <li>Wiki-bezogene Einstellungen</li>
      </ul>
      <p class="settings-hint backup-security-hint">Backups enthalten eine vollständige Kopie deines Wikis.<br>Bewahre Backup-Dateien sicher auf.</p>
      <div class="backup-info-status">
        <div>
          <span>Letztes erfolgreiches Backup</span>
          <strong>${escapeAttr(lastSuccessText)}</strong>
        </div>
        <div>
          <span>Nächstes geplantes Backup</span>
          <strong>${escapeAttr(formatFuture(status.nextScheduledAt))}</strong>
        </div>
      </div>
    </section>
    <div class="backup-action-area">
      <div class="settings-button-row backup-primary-actions">
        <button type="button" class="btn ghost" id="stRunBackupNow" ${isRunning ? 'disabled' : ''}>${isRunning ? 'Backup läuft …' : 'Backup jetzt erstellen'}</button>
        <button type="button" class="btn ghost" id="stOpenBackupFolder">Backup-Ordner öffnen</button>
      </div>
      ${actionFeedbackHtml}
    </div>
    <section class="settings-group" aria-labelledby="stBackupSetupGroup">
      <h4 id="stBackupSetupGroup">Speicherort und Zeitplan</h4>
      <div class="settings-field">
        <span>Backup-Ordner</span>
        <div class="settings-readonly-value" id="stBackupPath">${escapeAttr(config.backupPath || 'Noch kein Backup-Ordner ausgewählt.')}</div>
        <button type="button" class="btn ghost settings-inline-btn" id="stChangeBackupPath">Backup-Ordner wählen…</button>
        <div class="backup-folder-validation" id="stBackupFolderValidation" role="status" aria-live="polite"></div>
      </div>
      <label class="settings-field">
        <span>Automatisches Backup</span>
        <select id="stBackupInterval">
          ${BACKUP_INTERVAL_OPTIONS.map(o => `<option value="${o.value}" ${(config.backupIntervalDays ?? 1) === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>
      </label>
    </section>
    ${statusSectionHtml}
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
    const validationEl = el.querySelector('#stBackupFolderValidation');
    if (validationEl) {
      validationEl.className = 'backup-folder-validation';
      validationEl.textContent = '';
    }

    try {
      const chosen = await window.archivAPI.chooseBackupFolder?.();
      if (!chosen || !lifecycle.isCurrent()) return;

      const validation = await window.archivAPI.validateBackupFolder?.(chosen);
      if (!lifecycle.isCurrent()) return;

      if (!validation?.valid) {
        if (validationEl) {
          validationEl.className = 'backup-folder-validation is-error';
          validationEl.innerHTML = `
            <strong>❌ Backup-Ordner nicht verwendbar</strong>
            <span>${escapeAttr(validation?.message || validation?.details || 'Der ausgewählte Ordner kann nicht verwendet werden.')}</span>`;
        }
        return;
      }

      await updateSetting({ backupPath: validation.path || chosen });
      if (!lifecycle.isCurrent()) return;
      el.querySelector('#stBackupPath').textContent = validation.path || chosen;

      if (validationEl) {
        validationEl.className = 'backup-folder-validation is-success';
        validationEl.innerHTML = '<strong>✓ Backup-Ordner verfügbar</strong>';
      }
    } catch (error) {
      console.error('Backup-Ordner konnte nicht geprüft werden:', error);
      if (validationEl) {
        validationEl.className = 'backup-folder-validation is-error';
        validationEl.innerHTML = `
          <strong>❌ Backup-Ordner nicht verwendbar</strong>
          <span>${escapeAttr(error?.message || 'Der Backup-Ordner konnte nicht geprüft werden.')}</span>`;
      }
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
    : 'Noch nicht geprüft';

  const availableVersionLabel = status.availableVersion
    ? `v${status.availableVersion}`
    : status.phase === 'upToDate' && status.currentVersion
      ? `v${status.currentVersion}`
      : status.phase === 'checking'
        ? 'Suche nach Updates...'
        : 'Noch nicht geprüft';
  const showUpdateError = status.phase === 'error' || status.phase === 'unavailable';
  const downloadingUpdate = status.phase === 'downloading';
  const installingUpdate = status.phase === 'installing';
  const updateReady = status.phase === 'downloaded' || (status.phase === 'error' && status.installReady);
  const updateAvailable = status.phase === 'updateAvailable';

  let primaryActionHtml = '';
  if (updateAvailable) {
    primaryActionHtml = '<button type="button" class="btn" id="stDownloadUpdate">Jetzt herunterladen</button>';
  } else if (updateReady) {
    primaryActionHtml = '<button type="button" class="btn" id="stInstallUpdate">Neu starten und installieren</button>';
  } else if (status.phase === 'error') {
    if (status.errorType === 'download') {
      primaryActionHtml = '<button type="button" class="btn" id="stRetryDownload">Erneut versuchen</button>';
    } else if (status.errorType === 'install' && status.installReady) {
      primaryActionHtml = '<button type="button" class="btn" id="stInstallUpdate">Erneut versuchen</button>';
    } else {
      primaryActionHtml = '<button type="button" class="btn" id="stCheckNow">Erneut versuchen</button>';
    }
  } else if (!downloadingUpdate && !installingUpdate) {
    primaryActionHtml = '<button type="button" class="btn ghost" id="stCheckNow">Jetzt nach Updates suchen</button>';
  }

  const secondaryActionsHtml = downloadingUpdate || installingUpdate
    ? ''
    : '<button type="button" class="btn ghost" id="stOpenReleases">GitHub-Releases öffnen</button>';

  const updateErrorHtml = showUpdateError ? `
    <div class="settings-hint settings-hint-error" id="stUpdateError">
      ${escapeAttr(status.errorMessage || 'Der Update-Status konnte nicht ermittelt werden.')}
      ${status.errorDetails ? `<details class="settings-technical-details"><summary>Technische Details anzeigen</summary><div>${escapeAttr(status.errorDetails)}</div></details>` : ''}
    </div>` : '';
  el.innerHTML = `
    <h3>Updates</h3>
    <p class="settings-hint settings-scope-hint">Diese Einstellungen gelten für die Anwendung.</p>
    <section class="settings-group" aria-labelledby="stUpdateStatusGroup">
      <h4 id="stUpdateStatusGroup">Versionsstatus</h4>
    <div class="settings-field">
      <span>Installierte Version</span>
      <div class="settings-readonly-value">v${escapeAttr(status.currentVersion || '?')}</div>
    </div>
    <div class="settings-field">
      <span>Neueste verfügbare Version</span>
      <div class="settings-readonly-value" id="stLatestVersion">${escapeAttr(availableVersionLabel)}</div>
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
      ${primaryActionHtml}
      ${secondaryActionsHtml}
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
  el.querySelector('#stCheckNow')?.addEventListener('click', async (e) => {
    const button = e.currentTarget;
    clearInlineSettingsError(el);
    button.disabled = true;
    button.textContent = 'Suche nach Updates...';
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
  const startVisibleUpdateDownload = async (button) => {
    clearInlineSettingsError(el);
    button.disabled = true;
    button.textContent = 'Update wird heruntergeladen';
    try {
      const downloadPromise = window.archivAPI.downloadUpdate();
      const fresh = await fetchUpdateStatus();
      if (lifecycle.isCurrent()) {
        await renderUpdatesSection(el, config, updateSetting, { ...context, updateStatus: fresh }, lifecycle);
      }
      const result = await downloadPromise;
      if (!result?.started && lifecycle.isCurrent()) {
        const latest = await fetchUpdateStatus();
        await renderUpdatesSection(el, config, updateSetting, { ...context, updateStatus: latest }, lifecycle);
      }
    } catch (error) {
      console.error('Update-Download konnte nicht gestartet werden:', error);
      if (lifecycle.isCurrent()) {
        showInlineSettingsError(el, 'Der Update-Download konnte nicht gestartet werden.');
      }
    }
  };

  el.querySelector('#stDownloadUpdate')?.addEventListener('click', (event) => {
    startVisibleUpdateDownload(event.currentTarget);
  });

  el.querySelector('#stRetryDownload')?.addEventListener('click', (event) => {
    startVisibleUpdateDownload(event.currentTarget);
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
        button.textContent = 'Neu starten und installieren';
      }
    } catch (error) {
      console.error('Update-Installation konnte nicht gestartet werden:', error);
      if (lifecycle.isCurrent()) {
        showInlineSettingsError(el, 'Der Installations- und Neustartvorgang konnte nicht gestartet werden.');
        button.disabled = false;
        button.textContent = 'Neu starten und installieren';
      }
    }
  });
  el.querySelector('#stOpenReleases')?.addEventListener('click', () => {
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
      context.showSettingsSavedFeedback?.();
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

// --- Web Clipper ---
const FIREFOX_AMO_URL = 'https://addons.mozilla.org/de/firefox/addon/archiv-wiki-web-clipper/';
const WEB_CLIPPER_CAPTURE_MODES = Object.freeze([
  { value: 'selection', label: '✍ Markierter Text' },
  { value: 'url', label: '🔗 Nur URL' },
  { value: 'page', label: '🌐 Ganze Seite' },
  { value: 'images', label: '🖼 Bilder' }
]);

function normalizedWebClipperCaptureMode(value) {
  const candidate = String(value || '').trim();
  return WEB_CLIPPER_CAPTURE_MODES.some(option => option.value === candidate)
    ? candidate
    : 'selection';
}

function formatWebClipperTimestamp(isoString) {
  if (!isoString) return 'Noch keine Verbindung in dieser Sitzung erkannt';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Zeitpunkt nicht verfügbar';
  return date.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

async function renderWebClipperSection(el, config, updateSetting, context, lifecycle) {
  renderSettingsLoading(el, 'Web Clipper', 'Prüfe Verbindung …');
  const status = context.webClipperStatus
    || await window.archivAPI.webClipper?.getStatus?.()
    || { receiverReady: false, browserConnected: false, lastBrowserConnectionAt: null, lastClipAt: null, lastError: null };
  if (!lifecycle.isCurrent()) return;

  const defaultCaptureMode = normalizedWebClipperCaptureMode(config.webClipper?.defaultCaptureMode);
  const showIncomingInSidebar = config.incoming?.showInSidebar !== false;
  const receiverLabel = status.receiverReady ? 'Bereit' : 'Nicht verfügbar';
  const browserLabel = status.browserConnected
    ? 'Browser gerade verbunden'
    : status.lastBrowserConnectionAt
      ? `Zuletzt erkannt: ${formatWebClipperTimestamp(status.lastBrowserConnectionAt)}`
      : 'Noch keine Verbindung in dieser Sitzung erkannt';
  const lastClipLabel = status.lastClipAt
    ? formatWebClipperTimestamp(status.lastClipAt)
    : 'Noch kein Clip in dieser Sitzung empfangen';

  el.innerHTML = `
    <h3>Web Clipper</h3>
    <p class="settings-hint settings-scope-hint">Übersicht und Einstellungen für die separate Browser-Erweiterung.</p>

    <section class="settings-group" aria-labelledby="stWebClipperStatusGroup">
      <h4 id="stWebClipperStatusGroup">Verbindung</h4>
      <div class="settings-field">
        <span>Archiv-Wiki-Empfang</span>
        <div class="update-status-inline">
          <span class="update-dot ${status.receiverReady ? 'dot-available' : 'dot-neutral'}" aria-hidden="true"></span>
          <span>${escapeAttr(receiverLabel)}</span>
        </div>
        ${status.lastError ? `<p class="settings-hint settings-hint-error">${escapeAttr(status.lastError)}</p>` : '<p class="settings-hint">Der lokale Web-Clip-Empfänger läuft nur, solange Archiv-Wiki geöffnet ist.</p>'}
      </div>
      <div class="settings-field">
        <span>Browser-Verbindung</span>
        <div class="settings-readonly-value">${escapeAttr(browserLabel)}</div>
      </div>
      <div class="settings-field">
        <span>Letzter empfangener Clip</span>
        <div class="settings-readonly-value">${escapeAttr(lastClipLabel)}</div>
      </div>
    </section>

    <section class="settings-group" aria-labelledby="stWebClipperModeGroup">
      <h4 id="stWebClipperModeGroup">Sammelmodus</h4>
      <label class="settings-field">
        <span>Standard-Sammelmodus</span>
        <select id="stWebClipperDefaultMode">
          ${WEB_CLIPPER_CAPTURE_MODES.map(option => `<option value="${option.value}" ${defaultCaptureMode === option.value ? 'selected' : ''}>${escapeAttr(option.label)}</option>`).join('')}
        </select>
        <p class="settings-hint">Die Auswahl wird mit den bestehenden Wiki-Einstellungen gespeichert.</p>
      </label>
    </section>

    <section class="settings-group" aria-labelledby="stIncomingVisibilityGroup">
      <h4 id="stIncomingVisibilityGroup">Eingang</h4>
      <label class="settings-field">
        <span>📥 Eingang anzeigen</span>
        <input type="checkbox" id="stIncomingShowInSidebar" ${showIncomingInSidebar ? 'checked' : ''}>
        <p class="settings-hint">Steuert nur den Eintrag in der Sidebar. Gespeicherte Eingänge und Clips bleiben vollständig erhalten.</p>
      </label>
    </section>

    <section class="settings-group" aria-labelledby="stWebClipperStoreGroup">
      <h4 id="stWebClipperStoreGroup">Browser-Erweiterung</h4>
      <div class="settings-field">
        <span>Installationswege</span>
        <div class="settings-button-row" role="group" aria-label="Installationswege für die Browser-Erweiterung">
          <button type="button" class="btn ghost" id="stOpenFirefoxAmo">Firefox</button>
          <button type="button" class="btn ghost" id="stInstallBraveWebClipper">Brave / Chromium</button>
        </div>
        <p class="settings-hint">Firefox: Öffnet die offizielle Erweiterung bei Mozilla Add-ons. Archiv-Wiki muss für die lokale Übergabe von Clips geöffnet sein.</p>
        <p class="settings-hint">Brave / Chromium: Bereitet die mitgelieferte Erweiterung ohne Entwicklermodus und ohne Administratorrechte für den nächsten vollständigen Brave-Start vor.</p>
        <p class="settings-hint" id="stBraveInstallStatus" role="status" aria-live="polite"></p>
        <p class="settings-hint" id="stBraveFlatpakPermissionStatus" role="status" aria-live="polite" hidden></p>
        <div class="settings-button-row" id="stBraveFlatpakPermissionActions" style="display:none;">
          <button type="button" class="btn ghost" id="stRevokeBraveFlatpakPermission">Native-Messaging-Berechtigung entfernen</button>
        </div>
      </div>
    </section>
  `;

  el.querySelector('#stWebClipperDefaultMode').addEventListener('change', async (event) => {
    const value = normalizedWebClipperCaptureMode(event.target.value);
    await updateSetting({ webClipper: { defaultCaptureMode: value } });
  });

  el.querySelector('#stIncomingShowInSidebar').addEventListener('change', async (event) => {
    await updateSetting({ incoming: { showInSidebar: event.target.checked } });
  });

  el.querySelector('#stOpenFirefoxAmo').addEventListener('click', () => {
    window.open(FIREFOX_AMO_URL, '_blank');
  });

  // M15: read-only Statusanzeige für die Brave-Flatpak-Native-Messaging-
  // Berechtigung (org.freedesktop.Flatpak). Nur sichtbar, wenn Brave
  // tatsächlich als Flatpak installiert ist; auf anderen Systemen bleibt
  // dieser Bereich verborgen statt eine irrelevante Zeile anzuzeigen.
  const permissionStatusEl = el.querySelector('#stBraveFlatpakPermissionStatus');
  const permissionActionsEl = el.querySelector('#stBraveFlatpakPermissionActions');
  const revokePermissionButton = el.querySelector('#stRevokeBraveFlatpakPermission');

  async function refreshBraveFlatpakPermissionUi() {
    const status = await window.archivAPI.webClipper?.getBraveFlatpakPermissionStatus?.();
    if (!lifecycle.isCurrent()) return;
    if (!status?.supported || !status.installed) {
      permissionStatusEl.hidden = true;
      permissionActionsEl.style.display = 'none';
      return;
    }
    permissionStatusEl.hidden = false;
    permissionStatusEl.className = 'settings-hint';
    permissionStatusEl.textContent = status.granted
      ? 'Native-Messaging-Berechtigung für Brave (Flatpak): vorhanden.'
      : 'Native-Messaging-Berechtigung für Brave (Flatpak): noch nicht erteilt.';
    // .settings-button-row erzwingt display:flex per Klasse — [hidden] allein
    // würde von dieser Regel überschrieben, daher hier gezielt per Inline-Style.
    permissionActionsEl.style.display = status.granted ? 'flex' : 'none';
  }
  void refreshBraveFlatpakPermissionUi();

  revokePermissionButton.addEventListener('click', async () => {
    revokePermissionButton.disabled = true;
    try {
      await window.archivAPI.webClipper?.revokeBraveFlatpakPermission?.();
    } catch (error) {
      if (!lifecycle.isCurrent()) return;
      console.error('Native-Messaging-Berechtigung konnte nicht entfernt werden:', error);
      permissionStatusEl.hidden = false;
      permissionStatusEl.className = 'settings-hint settings-hint-error';
      permissionStatusEl.textContent = error?.message || 'Die Berechtigung konnte nicht entfernt werden.';
    } finally {
      if (lifecycle.isCurrent()) revokePermissionButton.disabled = false;
    }
    await refreshBraveFlatpakPermissionUi();
  });

  el.querySelector('#stInstallBraveWebClipper').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const statusEl = el.querySelector('#stBraveInstallStatus');
    button.disabled = true;
    button.textContent = 'Installation wird vorbereitet …';
    statusEl.className = 'settings-hint';
    statusEl.textContent = '';

    try {
      // M15: Brave läuft als Flatpak sandboxed und kann den Native Host ohne
      // eine zusätzliche, persistente Host-Berechtigung nicht starten. Diese
      // Berechtigung wird ausschließlich hier, nach ausdrücklicher Zustimmung,
      // gesetzt — nie automatisch beim App-Start.
      const permissionStatus = await window.archivAPI.webClipper?.getBraveFlatpakPermissionStatus?.();
      if (permissionStatus?.installed && !permissionStatus.granted) {
        const consent = await showConfirmDialog({
          title: 'Native-Messaging-Berechtigung für Brave (Flatpak)',
          message: 'Brave läuft als Flatpak in einer eigenen Sandbox und kann den Archiv-Wiki-Native-Host deshalb nicht direkt starten.\n\nDafür braucht Brave zusätzlich die dauerhafte Berechtigung, mit dem Flatpak-Hostdienst (org.freedesktop.Flatpak) zu sprechen. Das erweitert die Brave-Sandbox gegenüber deinem System und gilt für die gesamte Brave-App, nicht nur für Archiv-Wiki.\n\nDu kannst diese Berechtigung hier jederzeit wieder entfernen.',
          confirmLabel: 'Berechtigung erteilen',
          cancelLabel: 'Abbrechen'
        });
        if (!lifecycle.isCurrent()) return;
        if (!consent) {
          statusEl.className = 'settings-hint';
          statusEl.textContent = 'Abgebrochen. Es wurde keine Berechtigung gesetzt und nichts verändert.';
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
      statusEl.className = 'settings-hint settings-hint-success';
      statusEl.textContent = 'Vorbereitet. Schließe Brave vollständig und starte es neu. Falls du den Web Clipper zuvor bewusst entfernt hast, respektiert Brave diese Entscheidung und installiert ihn nicht automatisch erneut.';
      button.textContent = 'Erneut vorbereiten';
    } catch (error) {
      if (!lifecycle.isCurrent()) return;
      console.error('Brave Web Clipper konnte nicht vorbereitet werden:', error);
      statusEl.className = 'settings-hint settings-hint-error';
      statusEl.textContent = error?.message || 'Die Installation konnte nicht vorbereitet werden.';
      button.textContent = 'Erneut versuchen';
    } finally {
      if (lifecycle.isCurrent()) button.disabled = false;
    }
  });
}

// --- Sicherheit ---
function renderSecuritySection(el, config, updateSetting, context) {
  const enabled = Boolean(config.appLock?.enabled);

  const passwordFieldsHtml = enabled
    ? `
      <label class="settings-field">
        <span>Aktuelles Passwort</span>
        <input type="password" id="stCurrentAppLockPw" autocomplete="current-password" placeholder="Aktuelles Passwort eingeben">
      </label>
      <label class="settings-field">
        <span>Neues Passwort</span>
        <input type="password" id="stNewAppLockPw" autocomplete="new-password" placeholder="Neues Passwort eingeben">
      </label>
      <label class="settings-field">
        <span>Neues Passwort bestätigen</span>
        <input type="password" id="stConfirmAppLockPw" autocomplete="new-password" placeholder="Neues Passwort wiederholen">
      </label>`
    : `
      <label class="settings-field">
        <span>Passwort setzen</span>
        <input type="password" id="stNewAppLockPw" autocomplete="new-password" placeholder="Passwort eingeben">
      </label>`;

  el.innerHTML = `
    <h3>Sicherheit</h3>
    <p class="settings-hint settings-scope-hint">Diese Einstellungen gelten nur für dieses Wiki.</p>
    <div class="settings-field">
      <span>App-Passwortschutz</span>
      <div class="settings-readonly-value">${enabled ? 'Aktiviert' : 'Deaktiviert'}</div>
      <p class="settings-hint">Schützt den Zugriff auf dieses Wiki in Archiv-Wiki.<br>Die Dateien im Wiki-Ordner werden nicht verschlüsselt.</p>
    </div>

    ${passwordFieldsHtml}

    <div class="settings-button-row">
      <button type="button" class="btn ghost" id="stSetAppLockPw">${enabled ? 'Passwort ändern' : 'Passwort setzen'}</button>
      ${enabled ? '<button type="button" class="btn ghost" id="stRemoveAppLockPw">Schutz entfernen</button>' : ''}
    </div>

    <section class="settings-group privacy-overview" aria-labelledby="stPrivacyOverviewTitle">
      <h4 id="stPrivacyOverviewTitle">Datenschutz</h4>
      <p class="settings-hint privacy-overview-intro">Deine Daten bleiben unter deiner Kontrolle.</p>
      <ul class="privacy-overview-list">
        <li>Wiki-Dateien werden lokal gespeichert</li>
        <li>Inhalte deiner Notizen werden nur lokal verarbeitet.</li>
        <li>Deine Daten werden nicht an externe Analysedienste übertragen.</li>
        <li>Keine automatische Übertragung deiner Wiki-Inhalte</li>
        <li>Internetverbindungen werden nur für Funktionen wie Updates genutzt</li>
        <li>Synchronisation erfolgt nur über von dir eingerichtete Dienste</li>
      </ul>
    </section>
  `;

  async function verifyCurrentPassword() {
    const currentPassword = el.querySelector('#stCurrentAppLockPw')?.value || '';
    if (!currentPassword.trim()) {
      showInlineSettingsError(el, 'Bitte gib dein aktuelles Passwort ein.');
      return false;
    }

    const result = await window.archivAPI.verifyAppLock(currentPassword);
    if (!result?.ok) {
      showInlineSettingsError(el, 'Das aktuelle Passwort ist nicht korrekt.');
      return false;
    }

    return true;
  }

  el.querySelector('#stSetAppLockPw').addEventListener('click', async () => {
    const newPassword = el.querySelector('#stNewAppLockPw')?.value || '';
    const confirmedPassword = el.querySelector('#stConfirmAppLockPw')?.value || '';

    clearInlineSettingsError(el);

    if (!newPassword.trim()) {
      showInlineSettingsError(el, enabled
        ? 'Bitte gib ein neues Passwort ein.'
        : 'Bitte gib ein Passwort ein.');
      return;
    }

    if (enabled && newPassword !== confirmedPassword) {
      showInlineSettingsError(el, 'Die neuen Passwörter stimmen nicht überein.');
      return;
    }

    try {
      if (enabled && !(await verifyCurrentPassword())) return;

      config = await window.archivAPI.settings.setAppLockPassword(newPassword);
      context.onConfigChange?.(config);
      context.showSettingsSavedFeedback?.();
      if (el.isConnected) renderSecuritySection(el, config, updateSetting, context);
    } catch (error) {
      console.error('App-Passwort konnte nicht gespeichert werden:', error);
      showInlineSettingsError(el, 'Das App-Passwort konnte nicht gespeichert werden.');
    }
  });

  el.querySelector('#stRemoveAppLockPw')?.addEventListener('click', async () => {
    clearInlineSettingsError(el);

    try {
      if (!(await verifyCurrentPassword())) return;

      config = await window.archivAPI.settings.setAppLockPassword('');
      context.onConfigChange?.(config);
      context.showSettingsSavedFeedback?.();
      if (el.isConnected) renderSecuritySection(el, config, updateSetting, context);
    } catch (error) {
      console.error('App-Passwortschutz konnte nicht entfernt werden:', error);
      showInlineSettingsError(el, 'Der App-Passwortschutz konnte nicht entfernt werden.');
    }
  });
}
