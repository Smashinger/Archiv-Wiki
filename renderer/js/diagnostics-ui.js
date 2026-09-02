import { manageModalDialog } from './dialog.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

function formatReportLabel(report) {
  const date = new Date(report?.createdAt || '');
  const time = Number.isNaN(date.getTime())
    ? 'Zeitpunkt unbekannt'
    : date.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  const origin = report?.origin === 'manual' ? 'manuell' : 'automatisch';
  return `${time} · ${origin} · ${report?.title || 'Diagnosebericht'}`;
}

export async function showDiagnosticsDialog({ initialReportId = null } = {}) {
  const api = window.archivAPI?.diagnostics;
  if (!api) return;

  let reports = [];
  try { reports = await api.listReports(); }
  catch { reports = []; }

  const overlay = document.createElement('div');
  overlay.className = 'prompt-overlay';
  overlay.innerHTML = `
    <div class="prompt-modal diagnostics-modal">
      <div class="prompt-title" id="diagnosticsDialogTitle">
        <img class="lib-icon dialog-title-icon" src="assets/icon-library/dev/terminal.svg" alt="">Diagnoseberichte
        <button type="button" class="modal-close-x" data-action="close-x" title="Schließen" aria-label="Diagnoseberichte schließen">✕</button>
      </div>
      <p class="sync-modal-note" id="diagnosticsDialogDescription">Die Berichte werden ausschließlich lokal gespeichert. Es wird nichts automatisch übertragen.</p>
      <div class="diagnostics-toolbar" ${reports.length ? '' : 'hidden'}>
        <label class="diagnostics-select-label" for="diagnosticsReportSelect">Bericht</label>
        <select id="diagnosticsReportSelect">
          ${reports.map(report => `<option value="${escapeHtml(report.id)}">${escapeHtml(formatReportLabel(report))}</option>`).join('')}
        </select>
        <button type="button" class="icon-btn diagnostics-copy-btn" id="diagnosticsCopyButton" title="Diagnosebericht kopieren" aria-label="Diagnosebericht in die Zwischenablage kopieren">
          <img class="lib-icon ui-action-icon" src="assets/icon-library/docs/clipboard.svg" alt="">
        </button>
      </div>
      <pre class="diagnostics-report" id="diagnosticsReportText" tabindex="0">${reports.length ? 'Bericht wird geladen …' : 'Noch keine Diagnoseberichte vorhanden.'}</pre>
      <p class="diagnostics-copy-status" id="diagnosticsCopyStatus" role="status" aria-live="polite"></p>
      <div class="prompt-actions">
        <button type="button" class="btn" data-action="close">Schließen</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const select = overlay.querySelector('#diagnosticsReportSelect');
  const reportText = overlay.querySelector('#diagnosticsReportText');
  const copyButton = overlay.querySelector('#diagnosticsCopyButton');
  const copyStatus = overlay.querySelector('#diagnosticsCopyStatus');
  const closeButton = overlay.querySelector('[data-action="close"]');
  const closeX = overlay.querySelector('[data-action="close-x"]');
  let currentText = '';
  let closed = false;
  let controller = null;

  async function loadReport(reportId) {
    if (!reportId) return;
    reportText.textContent = 'Bericht wird geladen …';
    copyStatus.textContent = '';
    copyButton.disabled = true;
    try {
      const result = await api.getReport(reportId);
      if (!result?.text) {
        currentText = '';
        reportText.textContent = 'Der Diagnosebericht ist nicht mehr verfügbar.';
        return;
      }
      currentText = result.text;
      reportText.textContent = currentText;
      copyButton.disabled = false;
    } catch {
      currentText = '';
      reportText.textContent = 'Der Diagnosebericht konnte nicht geladen werden.';
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    controller?.destroy();
  }

  closeButton.addEventListener('click', close);
  closeX.addEventListener('click', close);
  select?.addEventListener('change', () => { void loadReport(select.value); });
  copyButton?.addEventListener('click', async () => {
    if (!currentText) return;
    try {
      await window.archivAPI.clipboard.writeText(currentText);
      copyStatus.textContent = 'Diagnosebericht kopiert.';
    } catch {
      copyStatus.textContent = 'Der Diagnosebericht konnte nicht kopiert werden.';
    }
  });

  controller = manageModalDialog({
    overlay,
    dialog: overlay.querySelector('.diagnostics-modal'),
    titleElement: overlay.querySelector('#diagnosticsDialogTitle'),
    descriptionElement: overlay.querySelector('#diagnosticsDialogDescription'),
    initialFocus: reports.length ? select : closeButton,
    onRequestClose: close,
    closeOnBackdrop: false
  });

  if (reports.length) {
    const selectedId = reports.some(report => report.id === initialReportId)
      ? initialReportId
      : reports[0].id;
    select.value = selectedId;
    await loadReport(selectedId);
  } else {
    copyButton?.setAttribute('disabled', '');
  }
}
