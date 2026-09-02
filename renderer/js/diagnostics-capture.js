// Zentrale Renderer-Erfassung für unbehandelte JavaScript-Fehler.
// Sie verändert das normale Browser-/Electron-Fehlerverhalten nicht und
// übergibt ausschließlich Fehler-Metadaten an den Main-Prozess. Dort erfolgt
// die verbindliche Anonymisierung, bevor etwas lokal gespeichert wird.

let lastSignature = null;
let lastSentAt = 0;

function send(payload) {
  const api = window.archivAPI?.diagnostics;
  if (!api?.reportRendererError) return;

  const signature = `${payload.type}|${payload.message}|${payload.stack || ''}`;
  const now = Date.now();
  if (signature === lastSignature && now - lastSentAt < 5000) return;
  lastSignature = signature;
  lastSentAt = now;

  Promise.resolve(api.reportRendererError(payload)).catch(() => {
    // Diagnoseerfassung darf niemals selbst einen weiteren sichtbaren Fehler
    // oder eine rekursive Fehlerkette erzeugen.
  });
}

window.addEventListener('error', (event) => {
  const error = event.error;
  send({
    type: 'uncaught-error',
    message: error?.message || event.message || 'Unbekannter Renderer-Fehler',
    stack: error?.stack || null,
    filename: event.filename || null,
    line: Number.isFinite(event.lineno) ? event.lineno : null,
    column: Number.isFinite(event.colno) ? event.colno : null
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  send({
    type: 'unhandled-rejection',
    message: reason?.message || String(reason ?? 'Unbekannte Promise-Rejection'),
    stack: reason?.stack || null,
    filename: null,
    line: null,
    column: null
  });
});
