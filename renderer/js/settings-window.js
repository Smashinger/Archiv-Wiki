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

import { ACCENT_PALETTES, applyAccentPalette, buildAccentSwatchesHtml, SIDEBAR_DENSITY_PRESETS, applySidebarDensity, applyEditorFontSize } from './theme.js';
import { fetchUpdateStatus, renderUpdateStatus } from './update-check.js';
import { animateIn, animateOut } from './motion.js';

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

const SETTINGS_SECTIONS = [
  { id: 'general', label: 'Allgemein', render: renderGeneralSection },
  { id: 'appearance', label: 'Darstellung', render: renderAppearanceSection },
  { id: 'editor', label: 'Editor', render: renderEditorSection },
  { id: 'backup', label: 'Backup', render: renderBackupSection },
  { id: 'updates', label: 'Updates', render: renderUpdatesSection },
  { id: 'security', label: 'Sicherheit', render: renderSecuritySection }
];

export async function showSettingsWindow(context = {}) {
  document.querySelectorAll('.settings-overlay').forEach(o => o.remove());
  let config = await window.archivAPI.settings.get();
  let activeId = SETTINGS_SECTIONS[0].id;

  const overlay = document.createElement('div');
  overlay.className = 'settings-overlay';
  overlay.innerHTML = `
    <div class="settings-modal">
      <div class="settings-modal-header">
        <span>⚙ Einstellungen</span>
        <button type="button" class="modal-close-x" data-action="close-x" title="Schließen" aria-label="Schließen">✕</button>
      </div>
      <div class="settings-modal-body">
        <nav class="settings-nav">
          ${SETTINGS_SECTIONS.map(s => `<button type="button" data-section="${s.id}">${escapeAttr(s.label)}</button>`).join('')}
        </nav>
        <div class="settings-content" id="settingsContent"></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  animateIn(overlay.querySelector('.settings-modal'));

  // Sofort speichern UND zurückgeben — jede Sektion wendet das Ergebnis
  // selbst live an (z. B. applyAccentPalette), kein Neustart nötig.
  async function updateSetting(patch) {
    config = await window.archivAPI.settings.update(patch);
    if (context.onConfigChange) context.onConfigChange(config);
    return config;
  }

  function renderActive() {
    overlay.querySelectorAll('.settings-nav button').forEach(b => b.classList.toggle('active', b.dataset.section === activeId));
    const contentEl = overlay.querySelector('#settingsContent');
    contentEl.innerHTML = '';
    SETTINGS_SECTIONS.find(s => s.id === activeId).render(contentEl, config, updateSetting, context);
  }

  overlay.querySelector('.settings-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-section]');
    if (!btn) return;
    activeId = btn.dataset.section;
    renderActive();
  });

  // Bewusst NUR über X schließbar (Anforderung) — kein Klick-außerhalb, kein Escape.
  overlay.querySelector('[data-action="close-x"]').addEventListener('click', () => {
    animateOut(overlay.querySelector('.settings-modal'), () => overlay.remove());
  });

  renderActive();
}

// --- Allgemein ---
async function renderGeneralSection(el, config, updateSetting, context) {
  const closeBehavior = await window.archivAPI.getCloseBehavior();
  const closeOptions = [
    { value: 'ask', label: 'Immer nachfragen (Standard)' },
    { value: 'tray', label: 'Immer in den System-Tray minimieren' },
    { value: 'quit', label: 'Immer vollständig beenden' }
  ];
  el.innerHTML = `
    <h3>Allgemein</h3>
    <label class="settings-field">
      <span>Wiki-Name</span>
      <input type="text" id="stWikiName" value="${escapeAttr(config.wikiName || '')}" placeholder="z. B. Max">
    </label>
    <div class="settings-field">
      <span>Speicherort</span>
      <div class="settings-readonly-value" id="stProjectPath">${escapeAttr(context.projectPath || '')}</div>
      <button type="button" class="btn ghost settings-inline-btn" id="stMoveProjectFolder">Ändern…</button>
      <p class="settings-hint" id="stMoveHint">Kopiert alles an den neuen Ort — der alte Ordner bleibt zur Sicherheit zusätzlich bestehen, du kannst ihn danach selbst löschen. Der neue Ordner muss leer sein.</p>
    </div>
    <div class="settings-field">
      <span>Verhalten beim Schließen (X-Button)</span>
      <div class="close-dialog-options" id="stCloseBehaviorOptions">
        ${closeOptions.map(o => `<label class="close-dialog-option"><input type="radio" name="stCloseBehavior" value="${o.value}" ${closeBehavior === o.value ? 'checked' : ''}> ${escapeAttr(o.label)}</label>`).join('')}
      </div>
    </div>
    <p class="settings-hint">Mehrere Wikis gleichzeitig zu verwalten ist noch nicht möglich — dieser Bereich ist aber bereits dafür vorbereitet.</p>
  `;
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
  el.querySelector('#stCloseBehaviorOptions').addEventListener('change', async (e) => {
    if (e.target.name !== 'stCloseBehavior') return;
    await window.archivAPI.setCloseBehavior(e.target.value);
  });
  el.querySelector('#stMoveProjectFolder').addEventListener('click', async (e) => {
    const btn = e.target;
    const hint = el.querySelector('#stMoveHint');
    btn.disabled = true;
    btn.textContent = 'Wird kopiert …';
    const result = await window.archivAPI.moveProjectFolder();
    btn.disabled = false;
    btn.textContent = 'Ändern…';
    if (!result) return;
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
    // result.moved === false ohne error: Nutzer hat den Dialog abgebrochen — nichts weiter tun
  });
}

// --- Darstellung ---
function renderAppearanceSection(el, config, updateSetting) {
  el.innerHTML = `
    <h3>Darstellung</h3>
    <div class="settings-field">
      <span>Akzentfarbe</span>
      <div class="color-swatches" id="stAccentSwatches">${buildAccentSwatchesHtml(config.accentKey || 'orange')}</div>
      <input type="color" id="stCustomColorInput" class="settings-hidden-color-input" value="${escapeAttr(config.customAccentColor || '#c17d45')}">
    </div>
    <div class="settings-field">
      <span>Sidebar-Größe</span>
      <div class="density-option-row" id="stDensityRow">
        ${Object.entries(SIDEBAR_DENSITY_PRESETS).map(([key, preset]) =>
          `<button type="button" class="density-option ${config.sidebarDensity === key ? 'active' : ''}" data-density="${key}">${escapeAttr(preset.label)}</button>`
        ).join('')}
      </div>
    </div>
  `;
  const customSwatch = el.querySelector('.color-swatch-custom');
  const customColorInput = el.querySelector('#stCustomColorInput');
  // Aktuell gewählte eigene Farbe als Hintergrund zeigen — bewusst per JS
  // gesetzt statt als Inline-Style im HTML-String (letzteres würde im Wizard
  // durch dessen strengere CSP blockiert; hier zwar unkritisch, aber gleiches
  // Muster überall beibehalten, siehe Kommentar in theme.js).
  if (config.accentKey === 'custom' && config.customAccentColor) {
    customSwatch.style.background = config.customAccentColor;
    customSwatch.textContent = '';
  }
  el.querySelector('#stAccentSwatches').addEventListener('click', async (e) => {
    const swatch = e.target.closest('[data-accent]');
    if (!swatch) return;
    const key = swatch.dataset.accent;
    if (key === 'custom') { customColorInput.click(); return; }
    applyAccentPalette(key);
    await updateSetting({ accentKey: key });
    el.querySelectorAll('#stAccentSwatches button').forEach(s => s.classList.toggle('active', s.dataset.accent === key));
  });
  customColorInput.addEventListener('input', (e) => {
    // Live-Vorschau schon während des Ziehens im Farbwähler, noch ungespeichert.
    applyAccentPalette('custom', e.target.value);
    customSwatch.style.background = e.target.value;
    customSwatch.textContent = '';
  });
  customColorInput.addEventListener('change', async (e) => {
    const hex = e.target.value;
    applyAccentPalette('custom', hex);
    await updateSetting({ accentKey: 'custom', customAccentColor: hex });
    el.querySelectorAll('#stAccentSwatches button').forEach(s => s.classList.toggle('active', s === customSwatch));
  });
  el.querySelector('#stDensityRow').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-density]');
    if (!btn) return;
    applySidebarDensity(btn.dataset.density);
    await updateSetting({ sidebarDensity: btn.dataset.density });
    el.querySelectorAll('#stDensityRow button').forEach(b => b.classList.toggle('active', b === btn));
  });
}

// --- Editor ---
function renderEditorSection(el, config, updateSetting) {
  const editor = config.editor || {};
  el.innerHTML = `
    <h3>Editor</h3>
    <label class="settings-field">
      <span>Editor-Schriftgröße</span>
      <select id="stFontSize">
        ${[12, 13, 14, 16, 18].map(px => `<option value="${px}" ${Number(config.editorFontSize) === px ? 'selected' : ''}>${px}px</option>`).join('')}
      </select>
    </label>
    <label class="settings-field">
      <span>Auto-Save-Intervall (Sekunden)</span>
      <input type="number" id="stAutoSave" min="5" max="300" step="5" value="${escapeAttr(editor.autoSave ?? 30)}">
    </label>
    <label class="settings-field">
      <span>Tab-Größe (Leerzeichen)</span>
      <input type="number" id="stTabSize" min="1" max="8" value="${escapeAttr(editor.tabSize ?? 2)}">
    </label>
    <p class="settings-hint">Der "Bearbeiten-Modus" (zum Umsortieren in der Sidebar) bleibt bewusst im "⋮"-Menü — das ist eine kurzzeitige Aktion, keine dauerhafte Einstellung.</p>
  `;
  el.querySelector('#stFontSize').addEventListener('change', async (e) => {
    const px = applyEditorFontSize(Number(e.target.value));
    await updateSetting({ editorFontSize: px });
  });
  el.querySelector('#stAutoSave').addEventListener('change', async (e) => {
    const val = Math.min(300, Math.max(5, Number(e.target.value) || 30));
    e.target.value = val;
    await updateSetting({ editor: { autoSave: val } });
  });
  el.querySelector('#stTabSize').addEventListener('change', async (e) => {
    const val = Math.min(8, Math.max(1, Number(e.target.value) || 2));
    e.target.value = val;
    await updateSetting({ editor: { tabSize: val } });
  });
}

// --- Backup ---
async function renderBackupSection(el, config, updateSetting) {
  el.innerHTML = `<h3>Backup</h3><p class="settings-hint">Lade Status …</p>`;
  const status = await window.archivAPI.getBackupStatus();
  el.innerHTML = `
    <h3>Backup</h3>
    <div class="settings-field">
      <span>Backup-Ordner</span>
      <div class="settings-readonly-value" id="stBackupPath">${escapeAttr(config.backupPath || '')}</div>
      <button type="button" class="btn ghost settings-inline-btn" id="stChangeBackupPath">Ändern…</button>
    </div>
    <label class="settings-field">
      <span>Automatisches Backup</span>
      <select id="stBackupInterval">
        ${BACKUP_INTERVAL_OPTIONS.map(o => `<option value="${o.value}" ${(config.backupIntervalDays ?? 1) === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
      </select>
    </label>
    <div class="settings-field">
      <span>Letztes erfolgreiches Backup</span>
      <div class="settings-readonly-value">${escapeAttr(formatRelative(status.lastSuccessAt))}</div>
    </div>
    <div class="settings-field">
      <span>Nächstes geplantes Backup</span>
      <div class="settings-readonly-value">${escapeAttr(formatFuture(status.nextScheduledAt))}</div>
    </div>
    <div class="settings-button-row">
      <button type="button" class="btn ghost" id="stRunBackupNow">Backup jetzt erstellen</button>
      <button type="button" class="btn ghost" id="stOpenBackupFolder">Backup-Ordner öffnen</button>
    </div>
  `;
  el.querySelector('#stChangeBackupPath').addEventListener('click', async () => {
    const chosen = await window.archivAPI.chooseBackupFolder?.();
    if (chosen) {
      await updateSetting({ backupPath: chosen });
      el.querySelector('#stBackupPath').textContent = chosen;
    }
  });
  el.querySelector('#stBackupInterval').addEventListener('change', async (e) => {
    await updateSetting({ backupIntervalDays: Number(e.target.value) });
  });
  el.querySelector('#stRunBackupNow').addEventListener('click', async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Läuft …';
    await window.archivAPI.runBackupNow();
    renderBackupSection(el, config, updateSetting);
  });
  el.querySelector('#stOpenBackupFolder').addEventListener('click', () => window.archivAPI.openBackupFolder());
}

// --- Updates ---
async function renderUpdatesSection(el) {
  el.innerHTML = `<h3>Updates</h3><p class="settings-hint">Prüfe …</p>`;
  const status = await fetchUpdateStatus();
  el.innerHTML = `
    <h3>Updates</h3>
    <div class="settings-field">
      <span>Installierte Version</span>
      <div class="settings-readonly-value">v${escapeAttr(status.currentVersion || '?')}</div>
    </div>
    <div class="settings-field">
      <span>Neueste verfügbare Version</span>
      <div class="settings-readonly-value" id="stLatestVersion">${status.latestVersion ? 'v' + escapeAttr(status.latestVersion) : 'unbekannt'}</div>
    </div>
    <div class="settings-field">
      <span>Status</span>
      <div class="update-status-inline"><span class="update-dot" id="stUpdateDot"></span><span class="update-status-label" id="stUpdateLabel"></span></div>
    </div>
    <div class="settings-button-row">
      <button type="button" class="btn ghost" id="stCheckNow">Jetzt nach Updates suchen</button>
      <button type="button" class="btn ghost" id="stOpenReleases">GitHub-Releases öffnen</button>
    </div>
  `;
  renderUpdateStatus(el.querySelector('#stUpdateDot'), el.querySelector('#stUpdateLabel'), status);
  el.querySelector('#stCheckNow').addEventListener('click', async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Prüfe …';
    const fresh = await fetchUpdateStatus();
    el.querySelector('#stLatestVersion').textContent = fresh.latestVersion ? 'v' + fresh.latestVersion : 'unbekannt';
    renderUpdateStatus(el.querySelector('#stUpdateDot'), el.querySelector('#stUpdateLabel'), fresh);
    e.target.disabled = false;
    e.target.textContent = 'Jetzt nach Updates suchen';
  });
  el.querySelector('#stOpenReleases').addEventListener('click', () => {
    window.open(status.releaseUrl || 'https://github.com/Smashinger/archiv-wiki/releases', '_blank');
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
    config = await window.archivAPI.settings.setAppLockPassword(pw);
    renderSecuritySection(el, config, updateSetting);
  });
  el.querySelector('#stRemoveAppLockPw')?.addEventListener('click', async () => {
    config = await window.archivAPI.settings.setAppLockPassword('');
    renderSecuritySection(el, config, updateSetting);
  });
}
