// renderer/js/sync-shared.js
// EIN gemeinsames Array für die Sync-Intervall-Dropdown-Optionen, genutzt von
// sowohl renderer/wizard.js (Ersteinrichtung) als auch renderer/js/app.js
// (Cloud-Sync-Fenster in der fertigen App). Vorher gab es das nur in app.js,
// hart codiert direkt im HTML-Template — bei einer künftigen Änderung hätte
// man leicht vergessen können, beide Stellen zu synchronisieren.
//
// Werte sind immer in MINUTEN (so speichert main/sync-ipc.js sie auch in
// .wiki-config.json unter config.sync.autoSync.intervalMinutes) — die Labels
// zeigen zur besseren Lesbarkeit größere Einheiten (Std./Tag/Woche) an.
export const SYNC_INTERVAL_OPTIONS = [
  { minutes: 5, label: '5 Min.' },
  { minutes: 15, label: '15 Min.' },
  { minutes: 30, label: '30 Min.' },
  { minutes: 60, label: '1 Std.' },
  { minutes: 180, label: '3 Std.' },
  { minutes: 360, label: '6 Std.' },
  { minutes: 720, label: '12 Std.' },
  { minutes: 1440, label: '1 Tag' },
  { minutes: 10080, label: '1 Woche' }
];

export function buildSyncIntervalOptionsHtml(selectedMinutes) {
  return SYNC_INTERVAL_OPTIONS.map(o =>
    `<option value="${o.minutes}"${Number(selectedMinutes) === o.minutes ? ' selected' : ''}>${o.label}</option>`
  ).join('');
}
