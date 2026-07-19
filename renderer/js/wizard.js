// renderer/js/wizard.js — Schritt 2: Setup-Wizard-Logik.
// Reiner UI-Zustandsautomat; alle Dateisystem-Operationen laufen über
// window.archivAPI (preload.js) im Main-Prozess.

import { buildSyncIntervalOptionsHtml } from './sync-shared.js';

const state = {
  step: 1,
  projectPath: null,
  alreadyConfigured: false,
  backupPath: null,
};

const els = {
  dots: document.querySelectorAll('.wizard-progress .dot'),
  progressLabel: document.getElementById('progressLabel'),
  steps: document.querySelectorAll('.wizard-step'),
  btnBack: document.getElementById('btnBack'),
  btnNext: document.getElementById('btnNext'),
  btnFinish: document.getElementById('btnFinish'),

  btnSelectFolder: document.getElementById('btnSelectFolder'),
  projectPathLabel: document.getElementById('projectPathLabel'),
  folderErrorBanner: document.getElementById('folderErrorBanner'),
  folderExistingBanner: document.getElementById('folderExistingBanner'),
  btnOpenExisting: document.getElementById('btnOpenExisting'),

  backupPathLabel: document.getElementById('backupPathLabel'),
  btnChangeBackup: document.getElementById('btnChangeBackup'),

  btnConnect: document.getElementById('btnConnect'),
  syncTestStatus: document.getElementById('syncTestStatus'),
  syncRemember: document.getElementById('wizardSyncRemember'),
  rememberLabel: document.getElementById('wizardRememberLabel'),
  syncAuto: document.getElementById('wizardSyncAuto'),
  autoLabel: document.getElementById('wizardAutoLabel'),
  syncInterval: document.getElementById('wizardSyncInterval'),
};

const TOTAL_STEPS = 3;

// Sync-Intervall-Dropdown mit den GLEICHEN Optionen wie im späteren
// In-App-Sync-Fenster befüllen (siehe renderer/js/sync-shared.js — Problem 2:
// vorher gab es dafür keine gemeinsame Quelle).
els.syncInterval.innerHTML = buildSyncIntervalOptionsHtml(15);

// "Automatischer Abgleich" braucht zwingend ein gespeichertes Passwort (der
// Hintergrund-Timer kann niemanden fragen) — deshalb an "Passwort merken"
// gekoppelt, exakt wie im Haupt-App-Sync-Fenster (siehe app.js).
let encryptionAvailable = false;
window.archivAPI.isEncryptionAvailable().then((available) => {
  encryptionAvailable = available;
  if (!available) {
    els.syncRemember.disabled = true;
    els.rememberLabel.title = 'Auf diesem System nicht verfügbar (kein Schlüsselbund gefunden).';
    els.rememberLabel.classList.add('sync-remember-disabled');
  }
  refreshAutoAvailability();
});

function refreshAutoAvailability() {
  const available = encryptionAvailable && els.syncRemember.checked;
  els.syncAuto.disabled = !available;
  if (!available) {
    els.syncAuto.checked = false;
    els.autoLabel.title = 'Braucht "Passwort merken".';
    els.autoLabel.classList.add('sync-remember-disabled');
  } else {
    els.autoLabel.title = '';
    els.autoLabel.classList.remove('sync-remember-disabled');
  }
}
els.syncRemember.addEventListener('change', refreshAutoAvailability);
refreshAutoAvailability();

function renderStep() {
  els.steps.forEach(section => {
    section.classList.toggle('active', Number(section.dataset.step) === state.step);
  });
  els.dots.forEach(dot => {
    const n = Number(dot.dataset.dot);
    dot.classList.toggle('active', n === state.step);
    dot.classList.toggle('done', n < state.step);
  });
  els.progressLabel.textContent = `Schritt ${state.step} von ${TOTAL_STEPS}`;

  els.btnBack.style.visibility = state.step === 1 ? 'hidden' : 'visible';
  els.btnNext.style.display = state.step === TOTAL_STEPS ? 'none' : 'inline-flex';
  els.btnFinish.style.display = state.step === TOTAL_STEPS ? 'inline-flex' : 'none';

  updateNextEnabled();
}

function updateNextEnabled() {
  if (state.step === 1) {
    els.btnNext.disabled = !(state.projectPath && !state.alreadyConfigured);
  } else {
    els.btnNext.disabled = false;
  }
}

// --- Schritt 1: Projektordner ---
els.btnSelectFolder.addEventListener('click', async () => {
  const result = await window.archivAPI.selectProjectFolder();
  els.folderErrorBanner.classList.remove('show');
  els.folderExistingBanner.classList.remove('show');

  if (!result) return; // Dialog abgebrochen

  state.projectPath = result.path;
  state.alreadyConfigured = result.alreadyConfigured;
  els.projectPathLabel.textContent = result.path;
  els.projectPathLabel.classList.remove('empty');

  if (!result.writable) {
    els.folderErrorBanner.textContent = 'Dieser Ordner ist nicht beschreibbar. Bitte einen anderen wählen.';
    els.folderErrorBanner.classList.add('show');
    state.projectPath = null;
  } else if (result.alreadyConfigured) {
    els.folderExistingBanner.classList.add('show');
  }

  updateNextEnabled();
});

els.btnOpenExisting.addEventListener('click', async () => {
  try {
    await window.archivAPI.openExistingProject(state.projectPath);
    // Ab hier übernimmt der Main-Prozess: Hauptfenster öffnet sich, dieses
    // Wizard-Fenster wird geschlossen.
  } catch (err) {
    els.folderErrorBanner.textContent = err.message;
    els.folderErrorBanner.classList.add('show');
  }
});

// --- Schritt 2: Backup-Pfad ---
async function loadDefaultBackupPath() {
  const defaultPath = await window.archivAPI.getDefaultBackupPath();
  if (!state.backupPath) {
    state.backupPath = defaultPath;
    els.backupPathLabel.textContent = defaultPath;
  }
}
loadDefaultBackupPath();

els.btnChangeBackup.addEventListener('click', async () => {
  const chosen = await window.archivAPI.selectBackupFolder();
  if (chosen) {
    state.backupPath = chosen;
    els.backupPathLabel.textContent = chosen;
  }
});

// --- Navigation ---
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

// --- Schritt 3 / Fertigstellen ---
els.btnFinish.addEventListener('click', async () => {
  els.btnFinish.disabled = true;
  els.btnFinish.textContent = 'Lege an …';

  const editorConfig = {
    tabSize: Number(document.getElementById('fTabSize').value),
    autoSave: Number(document.getElementById('fAutoSave').value),
  };

  const syncUrl = document.getElementById('syncUrl').value.trim();
  const syncUser = document.getElementById('syncUser').value.trim();
  const syncPassword = document.getElementById('syncPass').value;
  const rememberPassword = els.syncRemember.checked;
  const sync = syncUrl
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
      backupPath: state.backupPath,
      sync,
      password: syncPassword,
      rememberPassword,
    });
    // Main-Prozess öffnet jetzt das Hauptfenster und schließt dieses hier.
  } catch (err) {
    els.btnFinish.disabled = false;
    els.btnFinish.textContent = 'Projekt anlegen ✓';
    alert('Projekt konnte nicht angelegt werden: ' + err.message);
  }
});

renderStep();

// ---------------------------------------------------------------------------
// Verbindung testen — nutzt dieselbe testConnection-IPC
// wie das spätere In-App-Sync-Modal (main/sync-ipc.js).
// ---------------------------------------------------------------------------
els.btnConnect.addEventListener('click', async () => {
  const url = document.getElementById('syncUrl').value.trim();
  const username = document.getElementById('syncUser').value.trim();
  const password = document.getElementById('syncPass').value;
  if (!url) {
    els.syncTestStatus.textContent = 'Bitte zuerst eine URL eingeben.';
    els.syncTestStatus.className = 'sync-test-status sync-status-error';
    return;
  }
  els.syncTestStatus.textContent = 'Verbinde …';
  els.syncTestStatus.className = 'sync-test-status sync-status-pending';
  try {
    await window.archivAPI.syncApi.testConnection({ url, username, password });
    els.syncTestStatus.textContent = '✓ Verbindung erfolgreich.';
    els.syncTestStatus.className = 'sync-test-status sync-status-ok';
  } catch (err) {
    els.syncTestStatus.textContent = '✕ ' + err.message;
    els.syncTestStatus.className = 'sync-test-status sync-status-error';
  }
});
