// renderer/js/incoming.js
// Dünne Schicht über archivAPI.incoming.* (preload.js) — projektbezogene,
// vom Notizspeicher getrennte Eingang-Ablage. Kein eigener State, keine
// Geschäftslogik; ruft ausschließlich die bestehenden IPC-Kanäle auf.

export async function loadIncoming() {
  return window.archivAPI.incoming.load();
}

export async function getIncomingEntry(id) {
  return window.archivAPI.incoming.get(id);
}

export async function createIncomingEntry(data) {
  return window.archivAPI.incoming.create(data);
}

export async function receiveWebClip(data) {
  return window.archivAPI.incoming.receiveWebClip(data);
}

export async function addIncomingFile() {
  return window.archivAPI.incoming.addFile();
}

export async function addIncomingImage() {
  return window.archivAPI.incoming.addImage();
}

export async function getIncomingImagePreview(id) {
  return window.archivAPI.incoming.getImagePreview(id);
}

export async function saveIncomingEntry(id, patch) {
  return window.archivAPI.incoming.save(id, patch);
}

export async function deleteIncomingEntry(id) {
  return window.archivAPI.incoming.delete(id);
}

export function onIncomingCreated(callback) {
  return window.archivAPI.incoming.onCreated?.(callback);
}
