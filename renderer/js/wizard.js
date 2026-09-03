// renderer/js/wizard.js — Setup-Wizard-Logik.
// Reiner UI-Zustandsautomat; alle Dateisystem-Operationen laufen über
// window.archivAPI (preload.js) im Main-Prozess. Die Darstellung folgt der
// Einrichtungsassistent-Spezifikation (renderer/css/wizard.css).

import './diagnostics-capture.js';
import { buildSyncIntervalOptionsHtml } from './sync-shared.js';
import { applyAccentPalette } from './theme.js';
import { fetchUpdateStatus, onUpdateStatusChanged } from './update-check.js';
import { showMessageDialog, showConfirmDialog } from './dialog.js';

const TOTAL_STEPS = 3;
const STAGE_NAMES = ['Ordner', 'Editor', 'Sync'];

// Zwölf Farbfelder der Akzentwahl (Spezifikation, Abschnitt 1): elf feste
// Farben plus Eigenwert-Knopf. Alle elf werden als frei gewählte Akzentfarbe
// (accentKey 'custom' + Hex) angewandt/gespeichert — dieselbe Machinerie wie
// im Einstellungsfenster (theme.js applyAccentPalette('custom', hex),
// config.customAccentColor).
const SWATCH_COLORS = [
  '#C8834A', '#4A90D9', '#6BAA6B', '#A98BC8', '#CF8A94', '#5FB0A8',
  '#C98BA8', '#C4A64E', '#8B96A8', '#9BAF63', '#7E8BD1'
];

const state = {
  step: 1,
  projectPath: null,
  alreadyConfigured: false,
  backupPath: null,
  accentKey: 'custom',
  customAccentColor: SWATCH_COLORS[0],
};

const els = {
  wzShell: document.getElementById('wzShell'),
  wzSteps: document.getElementById('wzSteps'),
  wzCounter: document.getElementById('wzCounter'),
  steps: document.querySelectorAll('.wz-step'),

  wzMin: document.getElementById('wzMin'),
  wzClose: document.getElementById('wzClose'),

  btnBack: document.getElementById('btnBack'),
  btnCancel: document.getElementById('btnCancel'),
  btnNext: document.getElementById('btnNext'),
  btnFinish: document.getElementById('btnFinish'),
  btnSkip: document.getElementById('btnSkip'),
  footHint: document.getElementById('footHint'),
  footVersion: document.getElementById('wizardUpdateHintText'),
  footVersionDot: document.getElementById('wizardUpdateDot'),
  footVersionLabel: document.getElementById('wizardUpdateLabel'),

  btnSelectFolder: document.getElementById('btnSelectFolder'),
  projectPathLabel: document.getElementById('projectPathLabel'),
  folderErrorBanner: document.getElementById('folderErrorBanner'),
  folderExistingBanner: document.getElementById('folderExistingBanner'),
  btnOpenExisting: document.getElementById('btnOpenExisting'),
  folderChecks: document.getElementById('folderChecks'),

  accentSwatchRow: document.getElementById('accentSwatchRow'),
  customAccentInput: document.getElementById('customAccentInput'),

  backupPathLabel: document.getElementById('backupPathLabel'),
  btnChangeBackup: document.getElementById('btnChangeBackup'),

  btnConnect: document.getElementById('btnConnect'),
  syncTestStatus: document.getElementById('syncTestStatus'),
  syncRemember: document.getElementById('wizardSyncRemember'),
  rememberLabel: document.getElementById('wizardRememberLabel'),
  syncAuto: document.getElementById('wizardSyncAuto'),
  autoLabel: document.getElementById('wizardAutoLabel'),
  autoRow: document.getElementById('wizardAutoRow'),
  syncInterval: document.getElementById('wizardSyncInterval'),
};

// ---------------------------------------------------------------------------
// Fenstersteuerung der eigenen (rahmenlosen) Titelleiste
// ---------------------------------------------------------------------------
els.wzMin.addEventListener('click', () => window.archivAPI.wizardMinimize?.());
els.wzClose.addEventListener('click', () => window.archivAPI.wizardClose?.());

// Rahmenloses Fenster nie scrollen lassen: nach jedem Layoutwechsel die
// gemessene Inhaltshöhe an den Main-Prozess melden, der die Fensterhöhe
// entsprechend setzt (min 600, wächst mit).
function requestResize() {
  requestAnimationFrame(() => {
    const h = els.wzShell?.offsetHeight || document.body.scrollHeight || 600;
    window.archivAPI.wizardResizeToContent?.(h);
  });
}

// ---------------------------------------------------------------------------
// Update-/Versionsstatus in der Fußleiste (Schritt 2)
// ---------------------------------------------------------------------------
let wizardUpdateStatus = null;
function renderFooterVersion(status) {
  wizardUpdateStatus = status;
  const phase = status?.phase;
  if (phase === 'updateAvailable' && status?.releaseUrl) {
    els.footVersion.classList.add('is-update');
    els.footVersionLabel.textContent = 'Update verfügbar';
  } else if (phase === 'checking') {
    els.footVersion.classList.remove('is-update');
    els.footVersionLabel.textContent = 'Prüfe …';
  } else {
    els.footVersion.classList.remove('is-update');
    els.footVersionLabel.textContent = 'Aktuelle Version';
  }
}
els.footVersion.addEventListener('click', () => {
  if (wizardUpdateStatus?.phase === 'updateAvailable' && wizardUpdateStatus.releaseUrl) {
    window.open(wizardUpdateStatus.releaseUrl, '_blank');
  }
});
onUpdateStatusChanged(renderFooterVersion);
fetchUpdateStatus().then(renderFooterVersion);

// ---------------------------------------------------------------------------
// Sync-Intervall (gleiche Optionen wie das In-App-Sync-Fenster)
// ---------------------------------------------------------------------------
els.syncInterval.innerHTML = buildSyncIntervalOptionsHtml(15);

// ---------------------------------------------------------------------------
// Akzentfarben — zwölf Felder (elf fest + Eigenwert)
// ---------------------------------------------------------------------------
function markSwatchActive(el) {
  els.accentSwatchRow.querySelectorAll('.wz-swatch').forEach(b => b.classList.remove('active'));
  el?.classList.add('active');
}

function buildSwatches() {
  els.accentSwatchRow.innerHTML = '';
  SWATCH_COLORS.forEach((hex, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wz-swatch';
    b.style.backgroundColor = hex; // per JS gesetzt → von der Wizard-CSP erlaubt
    b.dataset.hex = hex;
    b.title = hex;
    if (i === 0) b.classList.add('active');
    b.addEventListener('click', () => {
      state.accentKey = 'custom';
      state.customAccentColor = hex;
      applyAccentPalette('custom', hex);
      markSwatchActive(b);
    });
    els.accentSwatchRow.appendChild(b);
  });

  const custom = document.createElement('button');
  custom.type = 'button';
  custom.className = 'wz-swatch wz-swatch-custom';
  custom.title = 'Eigene Farbe wählen…';
  custom.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>';
  custom.addEventListener('click', () => {
    els.customAccentInput.value = /^#[0-9a-fA-F]{6}$/.test(state.customAccentColor) ? state.customAccentColor : '#C8834A';
    els.customAccentInput.click();
  });
  els.accentSwatchRow.appendChild(custom);
  els._customSwatch = custom;
}
buildSwatches();
applyAccentPalette('custom', state.customAccentColor);

els.customAccentInput.addEventListener('input', (e) => {
  const hex = e.target.value;
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  state.accentKey = 'custom';
  state.customAccentColor = hex;
  applyAccentPalette('custom', hex);
  els._customSwatch.style.backgroundColor = hex; // Eigenwert-Feld zeigt die Farbe
  markSwatchActive(els._customSwatch);
});

// ---------------------------------------------------------------------------
// Automatischer Abgleich braucht ein gespeichertes Passwort → an
// "Passwort merken" gekoppelt (exakt wie im In-App-Sync-Fenster).
// ---------------------------------------------------------------------------
let encryptionAvailable = false;
window.archivAPI.isEncryptionAvailable().then((available) => {
  encryptionAvailable = available;
  if (!available) {
    els.syncRemember.disabled = true;
    els.rememberLabel.title = 'Auf diesem System nicht verfügbar (kein Schlüsselbund gefunden).';
  }
  refreshAutoAvailability();
});

function refreshAutoAvailability() {
  const available = encryptionAvailable && els.syncRemember.checked;
  els.syncAuto.disabled = !available;
  els.autoRow.classList.toggle('is-disabled', !available);
  if (!available) {
    els.syncAuto.checked = false;
    els.autoLabel.title = 'Braucht „Passwort merken".';
  } else {
    els.autoLabel.title = '';
  }
}
els.syncRemember.addEventListener('change', refreshAutoAvailability);
refreshAutoAvailability();

// ---------------------------------------------------------------------------
// Pfad-Zeile mit Kürzung in der Mitte (Anfang schrumpft, Ende bleibt lesbar)
// ---------------------------------------------------------------------------
function renderPath(el, fullPath, emptyText) {
  el.innerHTML = '';
  if (!fullPath) {
    el.textContent = emptyText;
    el.classList.add('is-empty');
    el.removeAttribute('title');
    return;
  }
  el.classList.remove('is-empty');
  el.title = fullPath;
  const trimmed = fullPath.replace(/\/+$/, '');
  const idx = trimmed.lastIndexOf('/');
  let head, tail;
  if (idx <= 0) { head = ''; tail = trimmed; } else { head = trimmed.slice(0, idx); tail = trimmed.slice(idx); }
  const h = document.createElement('span');
  h.className = 'wz-path-head';
  h.textContent = head;
  const t = document.createElement('span');
  t.className = 'wz-path-tail';
  t.textContent = tail;
  el.appendChild(h);
  el.appendChild(t);
}

// ---------------------------------------------------------------------------
// Schrittleiste + Schritt-Umschaltung
// ---------------------------------------------------------------------------
function renderStepbar() {
  els.wzSteps.innerHTML = '';
  STAGE_NAMES.forEach((name, i) => {
    const n = i + 1;
    const stage = document.createElement('div');
    stage.className = 'wz-stage ' + (n < state.step ? 'done' : n === state.step ? 'current' : 'upcoming');
    const dot = document.createElement('span');
    dot.className = 'wz-stage-dot';
    const label = document.createElement('span');
    label.className = 'wz-stage-label';
    label.textContent = name;
    stage.appendChild(dot);
    stage.appendChild(label);
    if (n < STAGE_NAMES.length) {
      const line = document.createElement('span');
      line.className = 'wz-stage-line';
      stage.appendChild(line);
    }
    els.wzSteps.appendChild(stage);
  });
  els.wzCounter.textContent = `${state.step} / ${TOTAL_STEPS}`;
}

function renderStep() {
  els.steps.forEach(s => s.classList.toggle('active', Number(s.dataset.step) === state.step));
  renderStepbar();

  const s = state.step;
  els.btnBack.classList.toggle('is-hidden', s === 1);
  els.btnNext.classList.toggle('is-hidden', s === TOTAL_STEPS);
  els.btnFinish.classList.toggle('is-hidden', s !== TOTAL_STEPS);
  els.btnSkip.classList.toggle('is-hidden', s !== TOTAL_STEPS);
  els.footVersion.classList.toggle('is-hidden', s !== 2);

  updateNextEnabled();
  requestResize();
}

function updateNextEnabled() {
  if (state.step === 1) {
    const ready = Boolean(state.projectPath && !state.alreadyConfigured);
    els.btnNext.disabled = !ready;
    els.footHint.classList.toggle('is-hidden', ready);
  } else {
    els.btnNext.disabled = false;
    els.footHint.classList.add('is-hidden');
  }
}

// ---------------------------------------------------------------------------
// Schritt 1 — Projektordner + PRÜFUNG
// ---------------------------------------------------------------------------
function formatBytes(n) {
  if (!Number.isFinite(n)) return 'unbekannt';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  const dec = i <= 1 || v >= 100 ? 0 : v >= 10 ? 0 : 1;
  return `${v.toFixed(dec)} ${units[i]}`;
}

function setCheck(name, okState, value) {
  const row = els.folderChecks.querySelector(`[data-check="${name}"]`);
  if (!row) return;
  row.classList.toggle('ok', okState === true);
  row.classList.toggle('fail', okState === false);
  row.querySelector('.wz-check-value').textContent = value;
}

function applyChecks(r) {
  setCheck('writable', r.writable, r.writable ? 'beschreibbar' : 'nicht beschreibbar');
  if (r.empty === null || r.empty === undefined) {
    setCheck('empty', null, 'unbekannt');
  } else if (r.empty) {
    setCheck('empty', true, 'leer');
  } else {
    setCheck('empty', false, `${r.entryCount} Eintrag${r.entryCount === 1 ? '' : 'e'}`);
  }
  if (r.freeBytes === null || r.freeBytes === undefined) {
    setCheck('free', null, 'unbekannt');
  } else {
    setCheck('free', true, `${formatBytes(r.freeBytes)} frei`);
  }
}

els.btnSelectFolder.addEventListener('click', async () => {
  const result = await window.archivAPI.selectProjectFolder();
  els.folderErrorBanner.classList.remove('show');
  els.folderExistingBanner.classList.remove('show');

  if (!result) return; // Dialog abgebrochen

  state.projectPath = result.path;
  state.alreadyConfigured = result.alreadyConfigured;
  renderPath(els.projectPathLabel, result.path, 'noch kein Ordner gewählt');
  applyChecks(result);

  if (!result.writable) {
    els.folderErrorBanner.textContent = 'Dieser Ordner ist nicht beschreibbar. Bitte einen anderen wählen.';
    els.folderErrorBanner.classList.add('show');
    state.projectPath = null;
  } else if (result.alreadyConfigured) {
    els.folderExistingBanner.classList.add('show');
  }

  updateNextEnabled();
  requestResize();
});

els.btnOpenExisting.addEventListener('click', async () => {
  try {
    await window.archivAPI.openExistingProject(state.projectPath);
  } catch (err) {
    els.folderErrorBanner.textContent = err.message;
    els.folderErrorBanner.classList.add('show');
    requestResize();
  }
});

// ---------------------------------------------------------------------------
// Schritt 2 — Backup-Pfad
// ---------------------------------------------------------------------------
async function loadDefaultBackupPath() {
  const defaultPath = await window.archivAPI.getDefaultBackupPath();
  if (!state.backupPath) {
    state.backupPath = defaultPath;
    renderPath(els.backupPathLabel, defaultPath, '');
  }
}
loadDefaultBackupPath();

els.btnChangeBackup.addEventListener('click', async () => {
  const chosen = await window.archivAPI.selectBackupFolder();
  if (chosen) {
    state.backupPath = chosen;
    renderPath(els.backupPathLabel, chosen, '');
    requestResize();
  }
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
els.btnNext.addEventListener('click', () => {
  if (state.step < TOTAL_STEPS) {
    state.step += 1;
    renderStep();
  }
});
els.btnBack.addEventListener('click', () => {
  if (state.step > 1) {
    state.step -= 1;
    renderStep();
  }
});
els.btnCancel.addEventListener('click', async () => {
  const confirmed = await showConfirmDialog({
    title: 'Einrichtung abbrechen?',
    message: 'Bisherige Eingaben gehen verloren.',
    confirmLabel: 'Einrichtung abbrechen',
    danger: true
  });
  if (confirmed) window.archivAPI.wizardClose?.();
});

// ---------------------------------------------------------------------------
// Schritt 3 / Fertigstellen
// ---------------------------------------------------------------------------
async function doFinish({ skipSync = false } = {}) {
  els.btnFinish.disabled = true;
  els.btnSkip.disabled = true;
  const prevHtml = els.btnFinish.innerHTML;
  els.btnFinish.textContent = 'Lege an …';

  const wikiName = document.getElementById('fWikiName').value.trim();
  const editorConfig = {
    tabSize: Number(document.getElementById('fTabSize').value),
    autoSave: Number(document.getElementById('fAutoSave').value),
  };

  const syncUrl = document.getElementById('syncUrl').value.trim();
  const syncUser = document.getElementById('syncUser').value.trim();
  const syncPassword = document.getElementById('syncPass').value;
  const rememberPassword = !skipSync && els.syncRemember.checked;
  const sync = (!skipSync && syncUrl)
    ? {
        enabled: false,
        url: syncUrl,
        username: syncUser,
        autoSync: { enabled: els.syncAuto.checked, intervalMinutes: Number(els.syncInterval.value) }
      }
    : { enabled: false };

  try {
    await window.archivAPI.finishWizard({
      projectPath: state.projectPath,
      editorConfig,
      wikiName,
      accentKey: state.accentKey,
      customAccentColor: state.accentKey === 'custom' ? state.customAccentColor : undefined,
      appLockPassword: document.getElementById('fAppLockPassword').value,
      backupPath: state.backupPath,
      sync,
      password: skipSync ? '' : syncPassword,
      rememberPassword,
      windowStartBehavior: document.querySelector('input[name="wizardWindowStart"]:checked')?.value || 'maximized',
    });
    // Main-Prozess öffnet jetzt das Hauptfenster und schließt dieses hier.
  } catch (err) {
    els.btnFinish.disabled = false;
    els.btnSkip.disabled = false;
    els.btnFinish.innerHTML = prevHtml;
    await showMessageDialog({
      title: 'Projekt konnte nicht angelegt werden',
      message: err.message
    });
  }
}

els.btnFinish.addEventListener('click', () => doFinish({ skipSync: false }));
els.btnSkip.addEventListener('click', () => doFinish({ skipSync: true }));

// ---------------------------------------------------------------------------
// Verbindung testen — dieselbe testConnection-IPC wie das In-App-Sync-Modal
// ---------------------------------------------------------------------------
els.btnConnect.addEventListener('click', async () => {
  const url = document.getElementById('syncUrl').value.trim();
  const username = document.getElementById('syncUser').value.trim();
  const password = document.getElementById('syncPass').value;
  if (!url) {
    els.syncTestStatus.textContent = 'Bitte zuerst eine URL eingeben.';
    return;
  }
  els.syncTestStatus.textContent = 'Verbinde …';
  try {
    await window.archivAPI.syncApi.testConnection({ url, username, password });
    els.syncTestStatus.textContent = '✓ Verbindung erfolgreich.';
  } catch (err) {
    els.syncTestStatus.textContent = '✕ ' + err.message;
  }
  requestResize();
});

// Initialer Aufbau
renderPath(els.projectPathLabel, null, 'noch kein Ordner gewählt');
renderStep();
