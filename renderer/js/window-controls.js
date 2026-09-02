// renderer/js/window-controls.js
// Dünne Schicht über archivAPI.windowControls.* (preload.js) — Fenstersteuerung
// für die eigene Titelleiste (Minimieren/Maximieren/Schließen/Menü-Popup).
// Kein eigener State, keine DOM-Erzeugung, keine Geschäftslogik.

export function minimize() {
  return window.archivAPI.windowControls.minimize();
}

export function toggleMaximize() {
  return window.archivAPI.windowControls.toggleMaximize();
}

export function close() {
  return window.archivAPI.windowControls.close();
}

export function isMaximized() {
  return window.archivAPI.windowControls.isMaximized();
}

export function popupMenu(label, x, y) {
  return window.archivAPI.windowControls.popupMenu(label, x, y);
}

// Anwendungsmenü der eigenen Titelleiste als HTML: Struktur lesen und einen
// Eintrag ausführen. Beide greifen auf dieselben MenuItem-Objekte zu, die
// buildMenu() im Hauptprozess erzeugt — der Renderer hält keine eigene
// Menüdefinition.
export function getMenuStructure() {
  return window.archivAPI.windowControls.getMenuStructure();
}

export function invokeMenuItem(id) {
  return window.archivAPI.windowControls.invokeMenuItem(id);
}

export function onMaximizedChanged(callback) {
  return window.archivAPI.windowControls.onMaximizedChanged(callback);
}
