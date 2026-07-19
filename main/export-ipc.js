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

// Kernlogik ohne Dialog — direkt wiederverwendbar sowohl vom manuellen
// Export (unten, mit Speichern-Dialog) als auch vom automatischen
// Hintergrund-Backup (main/backup.js), damit beide exakt dieselbe
// Zip-Erstellung (inkl. .wiki-trash-Ausschluss) nutzen statt sie zu duplizieren.
async function zipProjectTo(projectPath, destFilePath) {
  const { ZipArchive } = await import('archiver');
  if (typeof ZipArchive !== 'function') {
    throw new Error(
      "archiver-Paket hat nicht die erwartete 'ZipArchive'-Klasse (Version prüfen: package.json erwartet ^8.0.0). " +
      "Im Projektordner 'npm install' ausführen und Electron neu starten."
    );
  }
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destFilePath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.on('warning', (err) => { if (err.code !== 'ENOENT') reject(err); });
    archive.pipe(output);
    archive.directory(projectPath, false, (entry) => {
      if (entry.name === TRASH_DIRNAME || entry.name.startsWith(TRASH_DIRNAME + '/')) return false;
      return entry;
    });
    archive.finalize();
  });
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
    fs.writeFileSync(result.filePath, html, 'utf8');
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

module.exports = { registerExportIpc, exportProjectZip, zipProjectTo };
