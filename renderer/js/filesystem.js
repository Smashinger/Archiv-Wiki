// renderer/js/filesystem.js — Schritt 3
// Dünne Schicht über archivAPI.fs.* (preload.js). Hält keinen eigenen
// State — ruft bei jeder Mutation einfach listTree() neu ab, damit die
// UI immer den echten Datenträger-Zustand zeigt (kein Caching-Bugpotenzial
// in diesem frühen Stadium). Für 1000+ Notizen kann das in Schritt 6/7
// bei Bedarf auf inkrementelle Updates umgestellt werden.

let onProjectConfigPersisted = null;

export function setProjectConfigPersistedHandler(handler) {
  onProjectConfigPersisted = typeof handler === 'function' ? handler : null;
}

async function runConfigMutation(mutation) {
  const result = await mutation;
  if (result?.config) onProjectConfigPersisted?.(result.config);
  return result;
}

export async function getTree() {
  return window.archivAPI.fs.listTree();
}

export async function reorderChildren(parentRelPath, orderedNames) {
  return runConfigMutation(window.archivAPI.fs.reorderChildren(parentRelPath, orderedNames));
}

export async function setCategoryIcon(relPath, icon) {
  return runConfigMutation(window.archivAPI.fs.setCategoryIcon(relPath, icon));
}

export async function setProjectSetting(key, value) {
  return runConfigMutation(window.archivAPI.fs.setProjectSetting(key, value));
}

export async function saveAttachment(fileName, data) {
  return window.archivAPI.fs.saveAttachment(fileName, data);
}

export async function deleteAttachment(fileName) {
  return window.archivAPI.fs.deleteAttachment(fileName);
}

export async function getSearchDocuments() {
  return window.archivAPI.fs.getSearchDocuments();
}

export function findNode(tree, relPath) {
  for (const node of tree) {
    if (node.relPath === relPath) return node;
    if (node.type === 'folder') {
      const found = findNode(node.children, relPath);
      if (found) return found;
    }
  }
  return null;
}

export function flattenNotes(tree) {
  const out = [];
  for (const node of tree) {
    if (node.type === 'note') out.push(node);
    else if (node.type === 'folder') out.push(...flattenNotes(node.children));
  }
  return out;
}

export function listCategories(tree) {
  return tree.filter(n => n.type === 'folder');
}

export async function createMainCategory(name) {
  return window.archivAPI.fs.createMainCategory(name);
}

export async function createSubCategory(mainCategoryRelPath, name) {
  return window.archivAPI.fs.createSubCategory(mainCategoryRelPath, name);
}

export async function createNote(categoryRelPath, title, templateBody, options) {
  return window.archivAPI.fs.createNote(categoryRelPath, title, templateBody, options);
}

export async function readNote(relPath) {
  return window.archivAPI.fs.readNote(relPath);
}

export async function saveNote(relPath, body, frontmatterPatch, expectedVersion) {
  try {
    return await window.archivAPI.fs.writeNote(relPath, body, frontmatterPatch, expectedVersion);
  } catch (error) {
    const marker = 'ARCHIV_WIKI_NOTE_CONFLICT:';
    const message = String(error?.message || '');
    const markerIndex = message.indexOf(marker);
    if (markerIndex === -1) throw error;

    const conflict = new Error(message.slice(markerIndex + marker.length).trim());
    conflict.code = 'NOTE_CONFLICT';
    throw conflict;
  }
}

export async function renameEntry(relPath, newName) {
  return window.archivAPI.fs.renameEntry(relPath, newName);
}

export async function moveEntry(relPath, targetCategoryRelPath) {
  return window.archivAPI.fs.moveEntry(relPath, targetCategoryRelPath);
}

export async function deleteEntry(relPath) {
  return window.archivAPI.fs.deleteEntry(relPath);
}

export async function getTrash() {
  return window.archivAPI.fs.listTrash();
}

export async function restoreFromTrash(trashRelPath) {
  return window.archivAPI.fs.restoreFromTrash(trashRelPath);
}

export async function emptyTrash() {
  return window.archivAPI.fs.emptyTrash();
}
