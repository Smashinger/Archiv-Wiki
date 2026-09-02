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
const { atomicWriteFileSync } = require('./atomic-write');
const { cloneProjectConfig, requireProjectConfig, updateProjectConfig } = require('./project');
// D4 / Block 3: derselbe Sync-Mutex wie für echte Sync-Vorgänge (main/sync-ipc.js)
// — keine zweite Sperre. runExclusiveSyncMutation() setzt/löst die bestehende
// zentrale syncInProgress-Sperre per try/finally, dadurch pausiert Auto-Sync
// zuverlässig während einer Tag-Batch-/Undo-Operation und wird danach (auch
// bei Fehler/Exception) garantiert wieder freigegeben.
const { runExclusiveSyncMutation } = require('./sync-ipc');

function registerFilesystemIpc({ getCurrentProject, onProjectConfigLoaded }) {
  function requireProjectPath() {
    const projectPath = getCurrentProject()?.path;
    if (!projectPath) throw new Error('Kein Projekt geöffnet.');
    return projectPath;
  }

  function adoptConfig(projectPath, config) {
    onProjectConfigLoaded?.(projectPath, config);
    return cloneProjectConfig(config);
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
    const config = requireProjectConfig(projectPath);
    adoptConfig(projectPath, config);
    if (config.childOrder) tree = applyChildOrder(tree, '', config.childOrder);
    if (config.categoryIcons) tree = applyCategoryIcons(tree, config.categoryIcons);
    return tree;
  });

  ipcMain.handle('fs:reorderChildren', (_e, parentRelPath, orderedNames) => {
    const projectPath = requireProjectPath();
    const config = updateProjectConfig(projectPath, draft => {
      draft.childOrder = { ...(draft.childOrder || {}), [parentRelPath]: orderedNames };
    });
    return { saved: true, config: adoptConfig(projectPath, config) };
  });

  ipcMain.handle('fs:setCategoryIcon', (_e, relPath, icon) => {
    const projectPath = requireProjectPath();
    const config = updateProjectConfig(projectPath, draft => {
      draft.categoryIcons = { ...(draft.categoryIcons || {}), [relPath]: icon };
    });
    return { saved: true, config: adoptConfig(projectPath, config) };
  });

  // Generischer Setter für einzelne Top-Level-Einstellungen in .wiki-config.json
  // (aktuell: Akzentfarbe nachträglich ändern — siehe "⋮"-Menü in der Sidebar).
  // Bewusst generisch statt eines eigenen Kanals pro Feld, da weitere
  // nachträglich änderbare Einstellungen absehbar dazukommen werden.
  //
  // Ausnahme: der App-Passwortschutz. Er ist die einzige Einstellung, deren
  // Änderung eine Authentifizierung mit dem bestehenden Passwort voraussetzt,
  // und läuft ausschließlich über den dafür vorgesehenen, authentifizierten
  // Kanal 'settings:setAppLockPassword' (main/settings-ipc.js). Ohne diese
  // Sperre ließe sich der Schutz hier passwortlos abschalten. Bewusst ein
  // harter Fehler statt stillem Ignorieren — sonst käme "saved: true" für
  // etwas zurück, das nicht gespeichert wurde.
  ipcMain.handle('fs:setProjectSetting', (_e, key, value) => {
    const projectPath = requireProjectPath();
    // Der Schlüssel wird unten als Objekteigenschaft geschrieben (draft[key]).
    // Ein nicht-primitiver Schlüssel — etwa das Array ['appLock'] — ist beim
    // strikten Vergleich key === 'appLock' NICHT gleich, wird bei der
    // Eigenschaftszuweisung aber zu "appLock" umgewandelt und könnte so den
    // App-Passwortschutz passwortlos überschreiben. Deshalb hart abweisen,
    // BEVOR verglichen oder zugewiesen wird. Bewusst KEINE String(key)-
    // Normalisierung: sie würde ['appLock'] gerade wieder zu "appLock" machen
    // und die Lücke offen lassen. Ein String-Wrapper (new String(...)) hat
    // typeof 'object' und wird damit ebenfalls abgewiesen.
    if (typeof key !== 'string') {
      const error = new Error(
        'Ungültiger Einstellungsschlüssel: Es wird ein einfacher Text erwartet.'
      );
      error.code = 'PROJECT_SETTING_KEY_INVALID';
      throw error;
    }
    if (key === 'appLock') {
      const error = new Error(
        'Der App-Passwortschutz kann nur über die Sicherheitseinstellungen mit dem aktuellen Passwort geändert werden.'
      );
      error.code = 'APP_LOCK_REQUEST_INVALID';
      throw error;
    }
    const config = updateProjectConfig(projectPath, draft => {
      draft[key] = value;
    });
    return { saved: true, config: adoptConfig(projectPath, config) };
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
    atomicWriteFileSync(path.join(attachDir, finalName), Buffer.from(data));
    return { fileName: finalName };
  });

  // Rückbauhilfe ausschließlich für noch nicht fertig gespeicherte
  // Eingang-Entwürfe. Der Renderer kann nur einen einzelnen Dateinamen aus
  // .attachments zurückgeben; Pfade oder Unterordner werden strikt abgelehnt.
  ipcMain.handle('fs:deleteAttachment', (_e, fileName) => {
    const projectPath = requireProjectPath();
    const rawName = String(fileName || '');
    const safeName = path.basename(rawName);
    if (!safeName || safeName !== rawName || safeName === '.' || safeName === '..') {
      throw new Error('Ungültiger Anhang-Dateiname.');
    }

    const fullPath = path.join(projectPath, '.attachments', safeName);
    if (!fs.existsSync(fullPath)) return { deleted: false };
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) throw new Error('Der Anhang ist keine Datei.');
    fs.unlinkSync(fullPath);
    return { deleted: true };
  });

  ipcMain.handle('fs:getSearchDocuments', () => nfs.getSearchDocuments(requireProjectPath()));

  ipcMain.handle('fs:createMainCategory', (_e, name) =>
    nfs.createMainCategory(requireProjectPath(), name));

  ipcMain.handle('fs:createSubCategory', (_e, mainCategoryRelPath, name) =>
    nfs.createSubCategory(requireProjectPath(), mainCategoryRelPath, name));

  ipcMain.handle('fs:createNote', (_e, categoryRelPath, title, templateBody, options) =>
    nfs.createNote(requireProjectPath(), categoryRelPath, title, templateBody, options));

  // D5: reiner Lesezugriff auf dieselbe {title}/{date}/{time}/{year}-Auflösung,
  // die createNote() bereits intern verwendet — kein Datei-/Projektzugriff,
  // deshalb bewusst ohne requireProjectPath(). Wird für die Eingang→neue-Notiz
  // Template-Vorschau gebraucht, bevor die Notiz überhaupt geschrieben wird.
  ipcMain.handle('fs:resolveTemplateVariables', (_e, text, title) =>
    nfs.resolveTemplateVariables(String(text ?? ''), String(title ?? '')));

  ipcMain.handle('fs:readNote', (_e, relPath) =>
    nfs.readNote(requireProjectPath(), relPath));

  ipcMain.handle('fs:writeNote', (_e, relPath, body, frontmatterPatch, expectedVersion) =>
    nfs.writeNote(requireProjectPath(), relPath, body, frontmatterPatch, expectedVersion));

  ipcMain.handle('fs:collectNotesByTags', (_e, tags) =>
    nfs.collectNotesByTags(requireProjectPath(), tags));

  ipcMain.handle('fs:applyTagOperation', (_e, operation, snapshot) =>
    runExclusiveSyncMutation(() => nfs.applyTagOperation(requireProjectPath(), operation, snapshot)));

  ipcMain.handle('fs:undoTagOperation', (_e, undoEntries) =>
    runExclusiveSyncMutation(() => nfs.undoTagBatch(requireProjectPath(), undoEntries)));

  // D2 / Block 2: Mehrfachauswahl-Batch (Verschieben/Archivieren/Papierkorb).
  // Derselbe Sync-Mutex wie die Tag-Batches oben (runExclusiveSyncMutation) —
  // keine zweite Sperre, Auto-Sync pausiert dadurch zuverlässig auch während
  // dieser Batches und wird per finally garantiert wieder freigegeben.
  ipcMain.handle('fs:collectNoteSnapshots', (_e, relPaths) =>
    nfs.snapshotNotesForBatch(requireProjectPath(), relPaths));

  ipcMain.handle('fs:applyBatchMove', (_e, snapshot, targetRelPath) =>
    runExclusiveSyncMutation(() => nfs.applyBatchMove(requireProjectPath(), snapshot, targetRelPath)));

  ipcMain.handle('fs:applyBatchArchive', (_e, snapshot) =>
    runExclusiveSyncMutation(() => nfs.applyBatchArchive(requireProjectPath(), snapshot)));

  ipcMain.handle('fs:applyBatchTrash', (_e, snapshot) =>
    runExclusiveSyncMutation(() => nfs.applyBatchTrash(requireProjectPath(), snapshot)));

  // D2 / Block 3: sitzungslokales Undo für Batch-Verschieben — ebenfalls
  // unter demselben Sync-Mutex, damit Auto-Sync auch während des Undos pausiert.
  ipcMain.handle('fs:undoBatchMove', (_e, undoEntries) =>
    runExclusiveSyncMutation(() => nfs.undoBatchMove(requireProjectPath(), undoEntries)));

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
