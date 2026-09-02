// renderer/js/backup.js
// Dünne Schicht über die Backup-Funktionen von archivAPI (preload.js).
// Kein eigener State, keine eigene Backup-Logik — reine Kapselung derselben
// IPC-Aufrufe, die zuvor direkt in app.js standen.

export async function runBackupNow() {
  return window.archivAPI.runBackupNow();
}

export async function getBackupStatus() {
  return window.archivAPI.getBackupStatus();
}

export async function openBackupFolder() {
  return window.archivAPI.openBackupFolder();
}

export function onBackupStatusUpdated(callback) {
  return window.archivAPI.onBackupStatusUpdated?.(callback);
}
