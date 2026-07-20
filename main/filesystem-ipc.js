// main/filesystem-ipc.js
// Schritt 3: Registriert alle IPC-Kanäle für Notizen/Kategorien/Papierkorb.
// Arbeitet ausschließlich gegen das aktuell offene Projekt (getCurrentProject().path)
// — der Renderer kann keinen beliebigen Pfad von außerhalb übergeben, notes-fs.js
// prüft zusätzlich bei jeder Operation, dass relative Pfade den Projektordner
// nicht verlassen (siehe resolveSafe in notes-fs.js).

'use strict';

const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
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

  // Eigene Icons pro Kategorie (gesetzt über Rechtsklick → "Icon ändern"),
  // gespeichert als "relPath -> Emoji"-Map in .wiki-config.json — reine
  // Anzeige-Zuordnung, rührt keine Ordner/Dateien an. Rekursiv angewendet,
  // damit auch tief verschachtelte Unterkategorien ihr Icon behalten.
  function applyCategoryIcons(nodes, categoryIcons) {
    if (!categoryIcons) return nodes;
    for (const node of nodes) {
      if (categoryIcons[node.relPath]) node.icon = categoryIcons[node.relPath];
      if (node.type === 'folder') applyCategoryIcons(node.children, categoryIcons);
    }
    return nodes;
  }

  ipcMain.handle('fs:listTree', () => {
    const projectPath = requireProjectPath();
    let tree = nfs.listProjectTree(projectPath);
    const config = readProjectConfig(projectPath) || {};
    if (config.childOrder) tree = applyChildOrder(tree, '', config.childOrder);
    if (config.categoryIcons) tree = applyCategoryIcons(tree, config.categoryIcons);
    return tree;
  });

  ipcMain.handle('fs:reorderChildren', (_e, parentRelPath, orderedNames) => {
    const projectPath = requireProjectPath();
    const config = readProjectConfig(projectPath) || {};
    config.childOrder = { ...(config.childOrder || {}), [parentRelPath]: orderedNames };
    writeProjectConfig(projectPath, config);
    return { saved: true };
  });

  ipcMain.handle('fs:setCategoryIcon', (_e, relPath, icon) => {
    const projectPath = requireProjectPath();
    const config = readProjectConfig(projectPath) || {};
    config.categoryIcons = { ...(config.categoryIcons || {}), [relPath]: icon };
    writeProjectConfig(projectPath, config);
    return { saved: true };
  });

  // Generischer Setter für einzelne Top-Level-Einstellungen in .wiki-config.json
  // (aktuell: Akzentfarbe nachträglich ändern — siehe "⋮"-Menü in der Sidebar).
  // Bewusst generisch statt eines eigenen Kanals pro Feld, da weitere
  // nachträglich änderbare Einstellungen absehbar dazukommen werden.
  ipcMain.handle('fs:setProjectSetting', (_e, key, value) => {
    const projectPath = requireProjectPath();
    const config = readProjectConfig(projectPath) || {};
    config[key] = value;
    writeProjectConfig(projectPath, config);
    return { saved: true };
  });

  // Bilder per Drag&Drop (siehe renderer/js/app.js) — landen gesammelt in
  // EINEM Ordner .attachments/ auf Projekt-Ebene (nicht pro Notiz-Unterordner,
  // das hält es einfach), mit eindeutigem Dateinamen gegen Überschreiben.
  ipcMain.handle('fs:saveAttachment', (_e, fileName, data) => {
    const projectPath = requireProjectPath();
    const attachDir = path.join(projectPath, '.attachments');
    if (!fs.existsSync(attachDir)) fs.mkdirSync(attachDir, { recursive: true });
    const ext = path.extname(fileName) || '.png';
    const base = path.basename(fileName, ext).replace(/[^a-zA-Z0-9_-]/g, '_') || 'bild';
    let finalName = `${base}${ext}`;
    let counter = 1;
    while (fs.existsSync(path.join(attachDir, finalName))) {
      finalName = `${base}-${counter}${ext}`;
      counter++;
    }
    fs.writeFileSync(path.join(attachDir, finalName), Buffer.from(data));
    return { fileName: finalName };
  });

  ipcMain.handle('fs:getSearchDocuments', () => nfs.getSearchDocuments(requireProjectPath()));

  ipcMain.handle('fs:createMainCategory', (_e, name) =>
    nfs.createMainCategory(requireProjectPath(), name));

  ipcMain.handle('fs:createSubCategory', (_e, mainCategoryRelPath, name) =>
    nfs.createSubCategory(requireProjectPath(), mainCategoryRelPath, name));

  ipcMain.handle('fs:createNote', (_e, categoryRelPath, title, templateBody) =>
    nfs.createNote(requireProjectPath(), categoryRelPath, title, templateBody));

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
