// renderer/js/update-check.js
// Einzige Stelle, an der die Update-Version abgefragt und ausgewertet wird.
// Wird von app.js (Sidebar-Footer), wizard.js (Einrichtungs-Hinweis) UND dem
// Einstellungsfenster gemeinsam genutzt — garantiert dadurch identische
// Ergebnisse überall, statt (wie vorher) an jeder Stelle eigenen,
// duplizierten Anzeige-Code mit demselben zugrundeliegenden Kanal.

export async function fetchUpdateStatus() {
  try {
    return await window.archivAPI.checkForUpdate();
  } catch {
    // Netzwerk-Aussetzer o.Ä. auf der Renderer-Seite — genau wie im Hintergrund
    // (main.js) lieber "keine Info verfügbar" liefern als die Aufrufer mit
    // einer geworfenen Exception zu überraschen.
    return { currentVersion: null, latestVersion: null, updateAvailable: false, releaseUrl: null };
  }
}

// Setzt Punkt-Farbe + Beschriftung auf die übergebenen Elemente — identischer
// Wortlaut, identische Logik an jeder Einsatzstelle. labelBaseClass ist
// optional (z. B. "update-status-label" im Sidebar-Footer), damit dort
// zusätzlich bestehendes Layout-CSS erhalten bleibt.
export function renderUpdateStatus(dotEl, labelEl, status, labelBaseClass = '') {
  const base = labelBaseClass ? labelBaseClass + ' ' : '';
  if (status.updateAvailable && status.latestVersion) {
    dotEl.className = 'update-dot dot-available';
    labelEl.className = base + 'label-available';
    labelEl.textContent = `Neue Version verfügbar ${status.latestVersion}`;
  } else {
    dotEl.className = 'update-dot dot-neutral';
    labelEl.className = base + 'label-neutral';
    labelEl.textContent = 'Auf dem neuesten Stand';
  }
}
