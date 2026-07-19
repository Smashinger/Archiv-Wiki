// main/filesystem-ipc.js
// Schritt 3: Registriert alle IPC-Kanäle für Notizen/Kategorien/Papierkorb.
// Arbeitet ausschließlich gegen das aktuell offene Projekt (getCurrentProject().path)
// — der Renderer kann keinen beliebigen Pfad von außerhalb übergeben, notes-fs.js
// prüft zusätzlich bei jeder Operation, dass relative Pfade den Projektordner
// nicht verlassen (siehe resolveSafe in notes-fs.js).

'use strict';

const { ipcMain } = require('electron');
const nfs = require('./notes-fs');
const { readProjectConfig, writeProjectConfig } = require('./project');

function registerFilesystemIpc({ getCurrentProject }) {
  function requireProjectPath() {
    const projectPath = getCurrentProject()?.path;
    if (!projectPath) throw new Error('Kein Projekt geöffnet.');
    return projectPath;
  }

  // Jede Ordner-Ebene (Wurzel = Hauptkategorien, jede Unterkategorie = ihre
  // Notizen, jede Hauptkategorie = ihre Unterkategorien) wird vom
  // Dateisystem selbst immer alphabetisch geliefert. Eine per Drag gesetzte
  // eigene Reihenfolge wird deshalb separat in .wiki-config.json gemerkt —
  // ein Objekt "übergeordneter Pfad -> Namensliste" (Wurzel = ""), rein
  // anzeige-seitig, rührt keine Datei an. Einträge, die (noch) nicht in
  // einer gespeicherten Liste stehen (z. B. gerade neu angelegt), werden
  // ans Ende ihrer jeweiligen Ebene gehängt.
  function applyChildOrder(nodes, parentRelPath, childOrder) {
    const order = childOrder?.[parentRelPath];
    let sorted = nodes;
    if (Array.isArray(order) && order.length > 0) {
      const byName = new Map(nodes.map(n => [n.name, n]));
      const ordered = order.filter(name => byName.has(name)).map(name => byName.get(name));
      const remaining = nodes.filter(n => !order.includes(n.name));
      sorted = [...ordered, ...remaining];
    }
    for (const node of sorted) {
      if (node.type === 'folder') node.children = applyChildOrder(node.children, node.relPath, childOrder);
    }
    return sorted;
  }

  ipcMain.handle('fs:listTree', () => {
    const projectPath = requireProjectPath();
    const tree = nfs.listProjectTree(projectPath);
    const childOrder = readProjectConfig(projectPath)?.childOrder;
    if (!childOrder) return tree;
    return applyChildOrder(tree, '', childOrder);
  });

  ipcMain.handle('fs:reorderChildren', (_e, parentRelPath, orderedNames) => {
    const projectPath = requireProjectPath();
    const config = readProjectConfig(projectPath) || {};
    config.childOrder = { ...(config.childOrder || {}), [parentRelPath]: orderedNames };
    writeProjectConfig(projectPath, config);
    return { saved: true };
  });

  ipcMain.handle('fs:getSearchDocuments', () => nfs.getSearchDocuments(requireProjectPath()));

  ipcMain.handle('fs:createMainCategory', (_e, name) =>
    nfs.createMainCategory(requireProjectPath(), name));

  ipcMain.handle('fs:createSubCategory', (_e, mainCategoryRelPath, name) =>
    nfs.createSubCategory(requireProjectPath(), mainCategoryRelPath, name));

  ipcMain.handle('fs:createNote', (_e, categoryRelPath, title) =>
    nfs.createNote(requireProjectPath(), categoryRelPath, title));

  ipcMain.handle('fs:readNote', (_e, relPath) =>
    nfs.readNote(requireProjectPath(), relPath));

  ipcMain.handle('fs:writeNote', (_e, relPath, body, frontmatterPatch) =>
    nfs.writeNote(requireProjectPath(), relPath, body, frontmatterPatch));

  ipcMain.handle('fs:renameEntry', (_e, relPath, newName) =>
    nfs.renameEntry(requireProjectPath(), relPath, newName));

  ipcMain.handle('fs:moveEntry', (_e, relPath, targetCategoryRelPath) =>
    nfs.moveEntry(requireProjectPath(), relPath, targetCategoryRelPath));

  ipcMain.handle('fs:deleteEntry', (_e, relPath) =>
    nfs.deleteEntry(requireProjectPath(), relPath));

  ipcMain.handle('fs:listTrash', () => nfs.listTrash(requireProjectPath()));

  ipcMain.handle('fs:restoreFromTrash', (_e, trashRelPath) =>
    nfs.restoreFromTrash(requireProjectPath(), trashRelPath));

  ipcMain.handle('fs:emptyTrash', () => nfs.emptyTrash(requireProjectPath()));
}

module.exports = { registerFilesystemIpc };
