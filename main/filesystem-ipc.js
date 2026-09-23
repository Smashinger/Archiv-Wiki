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

function invalidIpcArgument(channel, detail) {
  const error = new TypeError(`Ungültige Argumente für ${channel}: ${detail}`);
  error.code = 'IPC_ARGUMENT_INVALID';
  return error;
}

function assertString(channel, value, label, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0) || value.includes('\0')) {
    throw invalidIpcArgument(channel, `${label} muss ein gültiger Text sein.`);
  }
}

function assertOptionalString(channel, value, label) {
  if (value !== undefined && value !== null) assertString(channel, value, label, { allowEmpty: true });
}

function assertPlainObject(channel, value, label, { optional = false } = {}) {
  if (optional && (value === undefined || value === null)) return;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw invalidIpcArgument(channel, `${label} muss ein einfaches Objekt sein.`);
  }
}

function assertStringArray(channel, value, label) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.includes('\0'))) {
    throw invalidIpcArgument(channel, `${label} muss eine Liste aus Textwerten sein.`);
  }
}

function assertEntryArray(channel, value, label, pathKeys = ['relPath']) {
  if (!Array.isArray(value)) throw invalidIpcArgument(channel, `${label} muss eine Liste sein.`);
  for (const entry of value) {
    assertPlainObject(channel, entry, label);
    const pathKey = pathKeys.find(key => Object.hasOwn(entry, key));
    if (!pathKey) throw invalidIpcArgument(channel, `${label} enthält keinen gültigen Notizpfad.`);
    assertString(channel, entry[pathKey], `${label}.${pathKey}`);
  }
}

function validateFilesystemArguments(channel, args) {
  const stringAt = (index, label, options) => assertString(channel, args[index], label, options);
  switch (channel) {
    case 'fs:reorderChildren':
      stringAt(0, 'parentRelPath', { allowEmpty: true });
      assertStringArray(channel, args[1], 'orderedNames');
      break;
    case 'fs:setCategoryIcon':
      stringAt(0, 'relPath'); stringAt(1, 'icon'); break;
    case 'fs:setProjectSetting':
      stringAt(0, 'key'); break;
    case 'fs:saveAttachment':
      stringAt(0, 'fileName');
      if (!(args[1] instanceof ArrayBuffer) && !ArrayBuffer.isView(args[1])) {
        throw invalidIpcArgument(channel, 'data muss Binärdaten enthalten.');
      }
      break;
    case 'fs:deleteAttachment':
    case 'fs:createMainCategory':
    case 'fs:readNote':
    case 'fs:deleteEntry':
    case 'fs:restoreFromTrash':
      stringAt(0, 'Pfad oder Name'); break;
    case 'fs:createSubCategory':
    case 'fs:renameEntry':
    case 'fs:moveEntry':
      stringAt(0, 'relPath'); stringAt(1, 'Name oder Zielpfad'); break;
    case 'fs:createNote':
      stringAt(0, 'categoryRelPath'); stringAt(1, 'title');
      assertOptionalString(channel, args[2], 'templateBody');
      assertPlainObject(channel, args[3], 'options', { optional: true });
      break;
    case 'fs:resolveTemplateVariables':
      stringAt(0, 'text', { allowEmpty: true }); stringAt(1, 'title', { allowEmpty: true }); break;
    case 'fs:writeNote':
      stringAt(0, 'relPath');
      assertOptionalString(channel, args[1], 'body');
      assertPlainObject(channel, args[2], 'frontmatterPatch', { optional: true });
      assertOptionalString(channel, args[3], 'expectedVersion');
      break;
    case 'fs:collectNotesByTags':
    case 'fs:collectNoteSnapshots':
    case 'fs:deleteFromTrash':
      assertStringArray(channel, args[0], 'Einträge'); break;
    case 'fs:applyTagOperation': {
      assertPlainObject(channel, args[0], 'operation');
      if (!['rename', 'merge', 'delete'].includes(args[0].type)) {
        throw invalidIpcArgument(channel, 'operation.type ist nicht zulässig.');
      }
      if (args[0].type === 'delete') {
        assertString(channel, args[0].tag, 'operation.tag');
      } else {
        assertString(channel, args[0].from, 'operation.from');
        assertString(channel, args[0].to, 'operation.to');
      }
      assertEntryArray(channel, args[1], 'snapshot');
      break;
    }
    case 'fs:undoTagOperation':
    case 'fs:applyBatchArchive':
    case 'fs:applyBatchTrash':
      assertEntryArray(channel, args[0], 'Einträge'); break;
    case 'fs:applyBatchMove':
      assertEntryArray(channel, args[0], 'snapshot'); stringAt(1, 'targetRelPath'); break;
    case 'fs:undoBatchMove':
      assertEntryArray(channel, args[0], 'undoEntries', ['newRelPath']); break;
    default:
      break;
  }
}

function migrateConfigPaths(config, oldRelPath, newRelPath) {
  if (!config || typeof config !== 'object') return false;
  let changed = false;

  if (config.categoryIcons && typeof config.categoryIcons === 'object') {
    const updatedIcons = {};
    for (const [key, icon] of Object.entries(config.categoryIcons)) {
      if (key === oldRelPath) {
        updatedIcons[newRelPath] = icon;
        changed = true;
      } else if (key.startsWith(oldRelPath + '/')) {
        updatedIcons[newRelPath + key.slice(oldRelPath.length)] = icon;
        changed = true;
      } else {
        updatedIcons[key] = icon;
      }
    }
    if (changed) config.categoryIcons = updatedIcons;
  }

  if (config.childOrder && typeof config.childOrder === 'object') {
    const updatedOrder = {};
    const oldParent = oldRelPath.includes('/') ? oldRelPath.split('/').slice(0, -1).join('/') : '';
    const newParent = newRelPath.includes('/') ? newRelPath.split('/').slice(0, -1).join('/') : '';
    const oldName = oldRelPath.split('/').pop();
    const newName = newRelPath.split('/').pop();

    for (const [parentKey, list] of Object.entries(config.childOrder)) {
      let targetParentKey = parentKey;
      if (parentKey === oldRelPath) {
        targetParentKey = newRelPath;
        changed = true;
      } else if (parentKey.startsWith(oldRelPath + '/')) {
        targetParentKey = newRelPath + parentKey.slice(oldRelPath.length);
        changed = true;
      }

      if (Array.isArray(list)) {
        let nextList = list;
        if (parentKey === oldParent) {
          if (oldParent === newParent) {
            nextList = list.map(item => (item === oldName ? newName : item));
            if (nextList.some((item, i) => item !== list[i])) changed = true;
          } else {
            nextList = list.filter(item => item !== oldName);
            if (nextList.length !== list.length) changed = true;
          }
        }
        updatedOrder[targetParentKey] = nextList;
      } else {
        updatedOrder[targetParentKey] = list;
      }
    }
    if (changed) config.childOrder = updatedOrder;
  }

  if (Array.isArray(config.savedCollapsedGroups)) {
    const nextCollapsed = config.savedCollapsedGroups.map(p => {
      if (p === oldRelPath) {
        changed = true;
        return newRelPath;
      }
      if (p.startsWith(oldRelPath + '/')) {
        changed = true;
        return newRelPath + p.slice(oldRelPath.length);
      }
      return p;
    });
    if (changed) config.savedCollapsedGroups = nextCollapsed;
  }

  if (config.noteScrollPositions && typeof config.noteScrollPositions === 'object') {
    const updatedPositions = {};
    for (const [key, pos] of Object.entries(config.noteScrollPositions)) {
      if (key === oldRelPath) {
        updatedPositions[newRelPath] = pos;
        changed = true;
      } else if (key.startsWith(oldRelPath + '/')) {
        updatedPositions[newRelPath + key.slice(oldRelPath.length)] = pos;
        changed = true;
      } else {
        updatedPositions[key] = pos;
      }
    }
    if (changed) config.noteScrollPositions = updatedPositions;
  }

  return changed;
}

function removeConfigPaths(config, relPath) {
  if (!config || typeof config !== 'object') return false;
  let changed = false;

  if (config.categoryIcons && typeof config.categoryIcons === 'object') {
    for (const key of Object.keys(config.categoryIcons)) {
      if (key === relPath || key.startsWith(relPath + '/')) {
        delete config.categoryIcons[key];
        changed = true;
      }
    }
  }

  if (config.childOrder && typeof config.childOrder === 'object') {
    const parentDir = relPath.includes('/') ? relPath.split('/').slice(0, -1).join('/') : '';
    const baseName = relPath.split('/').pop();
    for (const [parentKey, list] of Object.entries(config.childOrder)) {
      if (parentKey === relPath || parentKey.startsWith(relPath + '/')) {
        delete config.childOrder[parentKey];
        changed = true;
      } else if (parentKey === parentDir && Array.isArray(list)) {
        const nextList = list.filter(item => item !== baseName);
        if (nextList.length !== list.length) {
          config.childOrder[parentKey] = nextList;
          changed = true;
        }
      }
    }
  }

  if (Array.isArray(config.savedCollapsedGroups)) {
    const nextCollapsed = config.savedCollapsedGroups.filter(
      p => p !== relPath && !p.startsWith(relPath + '/')
    );
    if (nextCollapsed.length !== config.savedCollapsedGroups.length) {
      config.savedCollapsedGroups = nextCollapsed;
      changed = true;
    }
  }

  if (config.noteScrollPositions && typeof config.noteScrollPositions === 'object') {
    for (const key of Object.keys(config.noteScrollPositions)) {
      if (key === relPath || key.startsWith(relPath + '/')) {
        delete config.noteScrollPositions[key];
        changed = true;
      }
    }
  }

  return changed;
}

function registerFilesystemIpc({
  getCurrentProject,
  onProjectConfigLoaded,
  getMainWindow,
  ipcMainApi = ipcMain,
  isTrustedSender
}) {
  const senderIsTrusted = isTrustedSender || (event => {
    const window = getMainWindow?.();
    const contents = window && !window.isDestroyed?.() ? window.webContents : null;
    return Boolean(contents && event?.sender === contents && event?.senderFrame === contents.mainFrame);
  });

  function handle(channel, handler) {
    ipcMainApi.handle(channel, (event, ...args) => {
      if (!senderIsTrusted(event)) {
        const error = new Error('IPC-Aufruf stammt nicht aus dem Hauptfenster.');
        error.code = 'IPC_SENDER_INVALID';
        throw error;
      }
      validateFilesystemArguments(channel, args);
      return handler(event, ...args);
    });
  }
  function requireProjectPath() {
    const projectPath = getCurrentProject()?.path;
    if (!projectPath) throw new Error('Kein Projekt geöffnet.');
    return projectPath;
  }

  function syncConfigOnPathMutation(projectPath, oldRelPath, newRelPath) {
    if (!oldRelPath || !newRelPath || oldRelPath === newRelPath) return;
    try {
      const config = updateProjectConfig(projectPath, draft => {
        migrateConfigPaths(draft, oldRelPath, newRelPath);
      });
      adoptConfig(projectPath, config);
    } catch { /* Config-Update schlägt nicht die Dateimutierung fehl */ }
  }

  function syncConfigOnPathDeletion(projectPath, relPath) {
    if (!relPath) return;
    try {
      const config = updateProjectConfig(projectPath, draft => {
        removeConfigPaths(draft, relPath);
      });
      adoptConfig(projectPath, config);
    } catch { /* Config-Update schlägt nicht die Dateilöschung fehl */ }
  }

  function adoptConfig(projectPath, config) {
    onProjectConfigLoaded?.(projectPath, config);
    return cloneProjectConfig(config);
  }

  // Sichtbare Reihenfolge aus .wiki-config.json (childOrder) — die
  // eigentliche Sortierlogik lebt jetzt zentral in notes-fs.js
  // (applyChildOrder), seit KI-Block 2 auch von main/ai-tools.js
  // (list_categories) genutzt. Keine zweite Sortierlogik hier.

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

  handle('fs:listTree', () => {
    const projectPath = requireProjectPath();
    let tree = nfs.listProjectTree(projectPath);
    const config = requireProjectConfig(projectPath);
    adoptConfig(projectPath, config);
    if (config.childOrder) tree = nfs.applyChildOrder(tree, '', config.childOrder);
    if (config.categoryIcons) tree = applyCategoryIcons(tree, config.categoryIcons);
    return tree;
  });

  handle('fs:reorderChildren', (_e, parentRelPath, orderedNames) => {
    const projectPath = requireProjectPath();
    const config = updateProjectConfig(projectPath, draft => {
      draft.childOrder = { ...(draft.childOrder || {}), [parentRelPath]: orderedNames };
    });
    return { saved: true, config: adoptConfig(projectPath, config) };
  });

  handle('fs:setCategoryIcon', (_e, relPath, icon) => {
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
  handle('fs:setProjectSetting', (_e, key, value) => {
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
  handle('fs:saveAttachment', (_e, fileName, data) => {
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
  handle('fs:deleteAttachment', (_e, fileName) => {
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

  handle('fs:getSearchDocuments', () => nfs.getSearchDocuments(requireProjectPath()));

  handle('fs:createMainCategory', (_e, name) =>
    nfs.createMainCategory(requireProjectPath(), name));

  handle('fs:createSubCategory', (_e, mainCategoryRelPath, name) =>
    nfs.createSubCategory(requireProjectPath(), mainCategoryRelPath, name));

  handle('fs:createNote', (_e, categoryRelPath, title, templateBody, options) =>
    nfs.createNote(requireProjectPath(), categoryRelPath, title, templateBody, options));

  // D5: reiner Lesezugriff auf dieselbe {title}/{date}/{time}/{year}-Auflösung,
  // die createNote() bereits intern verwendet — kein Datei-/Projektzugriff,
  // deshalb bewusst ohne requireProjectPath(). Wird für die Eingang→neue-Notiz
  // Template-Vorschau gebraucht, bevor die Notiz überhaupt geschrieben wird.
  handle('fs:resolveTemplateVariables', (_e, text, title) =>
    nfs.resolveTemplateVariables(String(text ?? ''), String(title ?? '')));

  handle('fs:readNote', (_e, relPath) =>
    nfs.readNote(requireProjectPath(), relPath));

  handle('fs:writeNote', (_e, relPath, body, frontmatterPatch, expectedVersion) =>
    nfs.writeNote(requireProjectPath(), relPath, body, frontmatterPatch, expectedVersion));

  handle('fs:collectNotesByTags', (_e, tags) =>
    nfs.collectNotesByTags(requireProjectPath(), tags));

  handle('fs:applyTagOperation', (_e, operation, snapshot) =>
    runExclusiveSyncMutation(() => nfs.applyTagOperation(requireProjectPath(), operation, snapshot)));

  handle('fs:undoTagOperation', (_e, undoEntries) =>
    runExclusiveSyncMutation(() => nfs.undoTagBatch(requireProjectPath(), undoEntries)));

  // D2 / Block 2: Mehrfachauswahl-Batch (Verschieben/Archivieren/Papierkorb).
  // Derselbe Sync-Mutex wie die Tag-Batches oben (runExclusiveSyncMutation) —
  // keine zweite Sperre, Auto-Sync pausiert dadurch zuverlässig auch während
  // dieser Batches und wird per finally garantiert wieder freigegeben.
  handle('fs:collectNoteSnapshots', (_e, relPaths) =>
    nfs.snapshotNotesForBatch(requireProjectPath(), relPaths));

  handle('fs:applyBatchMove', (_e, snapshot, targetRelPath) =>
    runExclusiveSyncMutation(() => nfs.applyBatchMove(requireProjectPath(), snapshot, targetRelPath)));

  handle('fs:applyBatchArchive', (_e, snapshot) =>
    runExclusiveSyncMutation(() => nfs.applyBatchArchive(requireProjectPath(), snapshot)));

  handle('fs:applyBatchTrash', (_e, snapshot) =>
    runExclusiveSyncMutation(() => nfs.applyBatchTrash(requireProjectPath(), snapshot)));

  // D2 / Block 3: sitzungslokales Undo für Batch-Verschieben — ebenfalls
  // unter demselben Sync-Mutex, damit Auto-Sync auch während des Undos pausiert.
  handle('fs:undoBatchMove', (_e, undoEntries) =>
    runExclusiveSyncMutation(() => nfs.undoBatchMove(requireProjectPath(), undoEntries)));

  handle('fs:renameEntry', (_e, relPath, newName) => {
    const projectPath = requireProjectPath();
    const result = nfs.renameEntry(projectPath, relPath, newName);
    syncConfigOnPathMutation(projectPath, relPath, result.relPath);
    return result;
  });

  handle('fs:moveEntry', (_e, relPath, targetCategoryRelPath) => {
    const projectPath = requireProjectPath();
    const result = nfs.moveEntry(projectPath, relPath, targetCategoryRelPath);
    syncConfigOnPathMutation(projectPath, relPath, result.relPath);
    return result;
  });

  handle('fs:deleteEntry', (_e, relPath) => {
    const projectPath = requireProjectPath();
    const result = nfs.deleteEntry(projectPath, relPath);
    syncConfigOnPathDeletion(projectPath, relPath);
    return result;
  });

  handle('fs:listTrash', () => nfs.listTrash(requireProjectPath()));

  handle('fs:restoreFromTrash', (_e, trashRelPath) =>
    nfs.restoreFromTrash(requireProjectPath(), trashRelPath));

  handle('fs:deleteFromTrash', (_e, trashRelPaths) =>
    nfs.deleteFromTrash(requireProjectPath(), trashRelPaths));

  handle('fs:emptyTrash', () => nfs.emptyTrash(requireProjectPath()));
}

module.exports = { registerFilesystemIpc };
