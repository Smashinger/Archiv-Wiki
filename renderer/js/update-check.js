// renderer/js/update-check.js
// Gemeinsame Renderer-Schnittstelle für den zentralen Update-Status aus dem
// Main-Prozess. Keine Oberfläche leitet Versionen oder Lifecycle-Zustände
// eigenständig ab.

export async function fetchUpdateStatus() {
  try {
    return await window.archivAPI.getUpdateStatus();
  } catch {
    return {
      phase: 'unavailable', currentVersion: null, availableVersion: null,
      downloadPercent: null, lastCheckAt: null, errorType: 'unavailable',
      errorMessage: 'Das Update-System ist derzeit nicht verfügbar.',
      errorDetails: null,
      errorCategory: 'unavailable',
      updaterAvailable: false, installReady: false, releaseUrl: null
    };
  }
}

export async function requestUpdateCheck() {
  try {
    return await window.archivAPI.checkForUpdate();
  } catch {
    return fetchUpdateStatus();
  }
}

export function onUpdateStatusChanged(callback) {
  return window.archivAPI.onUpdateStatusChanged(callback);
}

export function renderUpdateStatus(dotEl, labelEl, status, labelBaseClass = '') {
  const base = labelBaseClass ? labelBaseClass + ' ' : '';
  const phase = status?.phase || 'idle';
  let label = 'Noch nicht geprüft';
  let available = false;

  if (phase === 'checking') label = 'Wird geprüft …';
  else if (phase === 'upToDate') label = 'Auf dem neuesten Stand';
  else if (phase === 'updateAvailable') {
    label = status.availableVersion ? `Neue Version verfügbar ${status.availableVersion}` : 'Neue Version verfügbar';
    available = true;
  } else if (phase === 'downloading') {
    label = Number.isFinite(status.downloadPercent)
      ? `Update wird heruntergeladen … ${status.downloadPercent} %`
      : 'Update wird heruntergeladen …';
    available = true;
  } else if (phase === 'downloaded') {
    label = 'Neustart erforderlich';
    available = true;
  } else if (phase === 'installing') {
    label = 'Update wird installiert …';
    available = true;
  } else if (phase === 'error') {
    if (status.errorType === 'download') label = 'Download fehlgeschlagen';
    else if (status.errorType === 'install') label = 'Installation fehlgeschlagen';
    else label = 'Update-Prüfung fehlgeschlagen';
  } else if (phase === 'unavailable') label = 'Update-System nicht verfügbar';

  dotEl.className = `update-dot ${available ? 'dot-available' : 'dot-neutral'}`;
  labelEl.className = base + (available ? 'label-available' : 'label-neutral');
  labelEl.textContent = label;
}
