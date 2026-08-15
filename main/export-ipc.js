// main/export-ipc.js — Schritt 6: Export (PDF, HTML, ZIP)
'use strict';

// archiver ist (zumindest in der aktuell installierten Version) ein reines
// ESM-Paket — require() dafür crasht die ganze App schon beim Start
// (ERR_REQUIRE_ESM), da main/export-ipc.js als CommonJS läuft. Deshalb hier
// bewusst NICHT top-level per require() laden, sondern erst bei tatsächlicher
// Nutzung per dynamischem import() (das funktioniert auch aus CommonJS heraus).
const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { TRASH_DIRNAME } = require('./project');

function createArchiveSourceError(message, cause) {
  const error = new Error(message);
  error.code = 'BACKUP_SOURCE_CHANGED';
  if (cause) error.cause = cause;
  return error;
}

function archivePathOf(relativePath, isDirectory = false) {
  const normalized = relativePath.split(path.sep).join('/');
  return isDirectory ? `${normalized}/` : normalized;
}

// Erfasst genau den Bestand, den der bisherige ZIP-Vertrag einschließt.
// .wiki-trash bleibt als bewusste Produktentscheidung ausgenommen; ein
// innerhalb des Projekts gewähltes ZIP-Ziel wird nicht in sich selbst gepackt.
function collectProjectArchiveInventory(projectPath, excludedPaths = []) {
  const projectRoot = path.resolve(projectPath);
  const excluded = new Set(excludedPaths.map(filePath => path.resolve(filePath)));
  let rootStat;
  try {
    rootStat = fs.statSync(projectRoot);
  } catch (error) {
    throw createArchiveSourceError('Der Wiki-Ordner ist für das Backup nicht lesbar.', error);
  }
  if (!rootStat.isDirectory()) {
    throw createArchiveSourceError('Der Wiki-Ordner ist für das Backup nicht lesbar.');
  }

  const inventory = [];
  function visit(directoryPath, relativeDirectory = '') {
    let entries;
    try {
      entries = fs.readdirSync(directoryPath, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch (error) {
      throw createArchiveSourceError('Das Backup konnte den erwarteten Wiki-Inhalt nicht vollständig erfassen.', error);
    }

    for (const entry of entries) {
      if (!relativeDirectory && entry.name === TRASH_DIRNAME) continue;
      const absolutePath = path.join(directoryPath, entry.name);
      if (excluded.has(path.resolve(absolutePath))) continue;

      let stats;
      try {
        stats = fs.lstatSync(absolutePath);
      } catch (error) {
        throw createArchiveSourceError('Eine erwartete Wiki-Datei ist während der Backup-Erstellung nicht mehr verfügbar.', error);
      }

      const relativePath = relativeDirectory
        ? path.join(relativeDirectory, entry.name)
        : entry.name;
      let type;
      let linkTarget = null;
      if (stats.isDirectory()) type = 'directory';
      else if (stats.isFile()) type = 'file';
      else if (stats.isSymbolicLink()) {
        type = 'symlink';
        try {
          linkTarget = fs.readlinkSync(absolutePath);
        } catch (error) {
          throw createArchiveSourceError('Eine erwartete Wiki-Verknüpfung konnte nicht gelesen werden.', error);
        }
      } else {
        throw createArchiveSourceError('Der Wiki-Ordner enthält einen Dateityp, der nicht zuverlässig gesichert werden kann.');
      }

      inventory.push({
        absolutePath,
        archivePath: archivePathOf(relativePath, type === 'directory'),
        type,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
        ctimeMs: stats.ctimeMs,
        linkTarget
      });
      if (type === 'directory') visit(absolutePath, relativePath);
    }
  }

  visit(projectRoot);
  return inventory;
}

function assertSameArchiveInventory(expected, actual) {
  if (expected.length !== actual.length) {
    throw createArchiveSourceError('Der Wiki-Inhalt hat sich während der Backup-Erstellung verändert. Das unvollständige Backup wurde verworfen.');
  }
  const actualByPath = new Map(actual.map(entry => [entry.archivePath, entry]));
  for (const expectedEntry of expected) {
    const actualEntry = actualByPath.get(expectedEntry.archivePath);
    if (!actualEntry
        || actualEntry.type !== expectedEntry.type
        || actualEntry.size !== expectedEntry.size
        || actualEntry.mtimeMs !== expectedEntry.mtimeMs
        || actualEntry.ctimeMs !== expectedEntry.ctimeMs
        || actualEntry.linkTarget !== expectedEntry.linkTarget) {
      throw createArchiveSourceError('Der Wiki-Inhalt hat sich während der Backup-Erstellung verändert. Das unvollständige Backup wurde verworfen.');
    }
  }
}

function archiveSourceProcessingError(error) {
  if (error?.code === 'ENOENT') {
    return createArchiveSourceError('Eine erwartete Wiki-Datei ist während der Backup-Erstellung verschwunden. Das unvollständige Backup wurde verworfen.', error);
  }
  if (['EACCES', 'EPERM', 'EBUSY', 'EIO'].includes(error?.code)) {
    return createArchiveSourceError('Eine erwartete Wiki-Datei konnte während der Backup-Erstellung nicht vollständig gelesen werden.', error);
  }
  return error;
}

async function zipInventoryTo(inventory, destFilePath, options = {}) {
  const { signal } = options;
  const { ZipArchive } = await import('archiver');
  if (typeof ZipArchive !== 'function') {
    throw new Error(
      "archiver-Paket hat nicht die erwartete 'ZipArchive'-Klasse (Version prüfen: package.json erwartet ^8.0.0). " +
      "Im Projektordner 'npm install' ausführen und Electron neu starten."
    );
  }

  if (signal?.aborted) {
    const err = new Error('Die ZIP-Erstellung wurde abgebrochen.');
    err.code = 'BACKUP_ABORTED';
    throw err;
  }

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destFilePath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const expectedByPath = new Map(inventory.map(entry => [entry.archivePath, entry]));
    const processedPaths = new Set();
    let settled = false;
    let failure = null;

    function finishResolve() {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', handleAbort);
      resolve({ entries: processedPaths.size });
    }

    function finishReject(error) {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', handleAbort);
      reject(error);
    }

    function fail(error) {
      if (settled || failure) return;
      failure = error;
      try { archive.abort(); } catch { /* Archiv kann bereits abgeschlossen sein */ }
      if (!output.destroyed) output.destroy();
      if (output.closed) finishReject(failure);
    }

    function handleAbort() {
      const err = new Error('Die ZIP-Erstellung wurde abgebrochen.');
      err.code = 'BACKUP_ABORTED';
      fail(err);
    }

    output.on('close', () => {
      if (failure) {
        finishReject(failure);
        return;
      }
      if (processedPaths.size !== expectedByPath.size) {
        finishReject(createArchiveSourceError('Das Backup enthält nicht alle erwarteten Wiki-Dateien. Das unvollständige Backup wurde verworfen.'));
        return;
      }
      finishResolve();
    });
    output.on('error', fail);
    // Da ausschließlich vorher inventarisierte Einträge verarbeitet werden,
    // bezeichnet jede Archiver-Warnung ein Problem mit erwartetem Bestand.
    // Bekannte Quellfehler werden nutzerfreundlich klassifiziert; unbekannte
    // Warnungen bleiben mit ihrem technischen Fehlercode fatal sichtbar.
    archive.on('error', error => fail(archiveSourceProcessingError(error)));
    archive.on('warning', error => fail(archiveSourceProcessingError(error)));
    archive.on('entry', entry => {
      const expected = expectedByPath.get(entry.name);
      if (!expected || processedPaths.has(entry.name) || entry.type !== expected.type) {
        fail(createArchiveSourceError('Die erzeugten ZIP-Einträge stimmen nicht mit dem erwarteten Wiki-Inhalt überein.'));
        return;
      }
      processedPaths.add(entry.name);
    });
    signal?.addEventListener('abort', handleAbort, { once: true });
    if (signal?.aborted) {
      handleAbort();
      return;
    }

    archive.pipe(output);
    for (const entry of inventory) {
      archive.file(entry.absolutePath, { name: entry.archivePath });
    }
    Promise.resolve(archive.finalize()).catch(fail);
  });
}

// Kernlogik ohne Dialog — direkt wiederverwendbar sowohl vom manuellen
// Export (unten, mit Speichern-Dialog) als auch vom automatischen
// Hintergrund-Backup (main/backup.js), damit beide exakt dieselbe
// Zip-Erstellung (inkl. .wiki-trash-Ausschluss) nutzen statt sie zu duplizieren.
async function zipProjectTo(projectPath, destFilePath, options = {}) {
  const projectRoot = path.resolve(projectPath);
  const destination = path.resolve(destFilePath);
  const relativeDestination = path.relative(projectRoot, destination);
  const destinationInsideProject = relativeDestination !== ''
    && relativeDestination !== '..'
    && !relativeDestination.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relativeDestination);
  const excludedPaths = destinationInsideProject ? [destination] : [];
  const inventory = collectProjectArchiveInventory(projectRoot, excludedPaths);

  try {
    await zipInventoryTo(inventory, destination, options);
    const finalInventory = collectProjectArchiveInventory(projectRoot, excludedPaths);
    assertSameArchiveInventory(inventory, finalInventory);
  } catch (error) {
    try { fs.unlinkSync(destination); } catch { /* Datei wurde evtl. nicht angelegt */ }
    throw error;
  }
}

async function exportProjectZip({ getCurrentProject, getMainWindow }) {
  const projectPath = getCurrentProject()?.path;
  if (!projectPath) { throw new Error('Kein Projekt geöffnet.'); }
  const win = getMainWindow();
  const defaultName = path.basename(projectPath) + '-backup.zip';
  const result = await dialog.showSaveDialog(win, {
    title: 'Projekt als ZIP exportieren',
    defaultPath: defaultName,
    filters: [{ name: 'ZIP-Archiv', extensions: ['zip'] }]
  });
  if (result.canceled || !result.filePath) return { saved: false };

  await zipProjectTo(projectPath, result.filePath);

  return { saved: true, filePath: result.filePath };
}

function writeHtmlExportFile(filePath, html) {
  if (typeof html !== 'string') throw new TypeError('HTML-Export erwartet Textinhalt.');
  fs.writeFileSync(filePath, html, 'utf8');
}

function registerExportIpc({ getCurrentProject, getMainWindow }) {
  function requireProjectPath() {
    const projectPath = getCurrentProject()?.path;
    if (!projectPath) throw new Error('Kein Projekt geöffnet.');
    return projectPath;
  }

  // ---------------------------------------------------------------------
  // HTML-Export (einzelne Notiz) — der Renderer schickt das fertige,
  // eigenständige HTML-Dokument (inkl. eingebettetem CSS), main.js zeigt
  // nur den Speichern-Dialog und schreibt die Datei.
  // ---------------------------------------------------------------------
  ipcMain.handle('export:saveHtml', async (_e, html, suggestedName) => {
    const win = getMainWindow();
    const result = await dialog.showSaveDialog(win, {
      title: 'Als HTML exportieren',
      defaultPath: suggestedName,
      filters: [{ name: 'HTML-Datei', extensions: ['html'] }]
    });
    if (result.canceled || !result.filePath) return { saved: false };
    writeHtmlExportFile(result.filePath, html);
    return { saved: true, filePath: result.filePath };
  });

  // Einzelne Notiz als reine .md-Datei exportieren — z. B. zum Teilen/
  // Weiterverwenden außerhalb der App. Identisches Muster wie der HTML-
  // Export oben, nur andere Dateiendung/Beschriftung.
  ipcMain.handle('export:saveMarkdown', async (_e, markdown, suggestedName) => {
    const win = getMainWindow();
    const result = await dialog.showSaveDialog(win, {
      title: 'Als Markdown-Datei exportieren',
      defaultPath: suggestedName,
      filters: [{ name: 'Markdown-Datei', extensions: ['md'] }]
    });
    if (result.canceled || !result.filePath) return { saved: false };
    fs.writeFileSync(result.filePath, markdown, 'utf8');
    return { saved: true, filePath: result.filePath };
  });

  // ---------------------------------------------------------------------
  // PDF-Export (einzelne Notiz) — nutzt Electrons eingebautes printToPDF
  // auf dem AKTUELL SICHTBAREN Hauptfenster. @media print in components.css
  // blendet Sidebar/Toolbar/Editor-Quelltext aus, sodass nur die gerenderte
  // Vorschau gedruckt wird. Bewusst NUR printBackground als Option — die
  // genauen aktuellen Feldnamen für pageSize/margins ließen sich hier ohne
  // echtes Electron-Fenster nicht verlässlich verifizieren, ein falscher
  // Feldname hätte den Export riskiert.
  // ---------------------------------------------------------------------
  ipcMain.handle('export:notePdf', async (_e, suggestedName) => {
    const win = getMainWindow();
    const result = await dialog.showSaveDialog(win, {
      title: 'Als PDF exportieren',
      defaultPath: suggestedName,
      filters: [{ name: 'PDF-Datei', extensions: ['pdf'] }]
    });
    if (result.canceled || !result.filePath) return { saved: false };
    const pdfBuffer = await win.webContents.printToPDF({ printBackground: true });
    fs.writeFileSync(result.filePath, pdfBuffer);
    return { saved: true, filePath: result.filePath };
  });

  // ---------------------------------------------------------------------
  // ZIP-Export (ganzes Projekt inkl. Ordnerstruktur) — .wiki-trash wird
  // bewusst ausgeschlossen (gelöschte Inhalte gehören nicht ins Backup).
  // ---------------------------------------------------------------------
  ipcMain.handle('export:projectZip', () => exportProjectZip({ getCurrentProject, getMainWindow }));
}

module.exports = {
  registerExportIpc,
  exportProjectZip,
  zipProjectTo,
  writeHtmlExportFile
};
