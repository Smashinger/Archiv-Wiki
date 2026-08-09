// main/incoming-store.js
// Persistente, projektbezogene Speicherbasis für den Eingang. Dieses Modul ist
// bewusst Electron-unabhängig: Dateisystemzugriff bleibt im Main-Prozess, die
// UI erhält später ausschließlich die begrenzte IPC-Schnittstelle.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { INCOMING_DIRNAME, INCOMING_MARKER_FILENAME } = require('./project');
const { atomicWriteFileSync, atomicCopyFileSync } = require('./atomic-write');

const ENTRY_EXT = '.json';
const WEB_CLIP_TYPE = 'webpage';
const IMAGE_CLIP_TYPE = 'image';
const WEB_CLIP_CAPTURE_MODES = new Set(['selection', 'url', 'page', 'images']);
const MAX_WEB_CLIP_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_WEB_CLIP_CONTENT_BYTES = 9 * 1024 * 1024;
const FILES_DIRNAME = 'files';
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif']);
const IMAGE_MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif'
};
const ENTRY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function incomingDirOf(projectPath) {
  return path.join(path.resolve(projectPath), INCOMING_DIRNAME);
}

function ensureIncomingStorage(projectPath) {
  const incomingDir = incomingDirOf(projectPath);
  const markerPath = path.join(incomingDir, INCOMING_MARKER_FILENAME);

  if (fs.existsSync(incomingDir)) {
    if (!fs.statSync(incomingDir).isDirectory()) {
      throw new Error('Der Eingang-Speicherpfad ist kein Ordner.');
    }
    // Ein bereits vorhandener normaler Wiki-Ordner namens "incoming" wird
    // niemals still zum Systemordner umgewidmet. So bleiben bestehende
    // Kategorien und Notizen unangetastet.
    if (!fs.existsSync(markerPath)) {
      throw new Error('Der Ordner "incoming" wird bereits anderweitig verwendet.');
    }
    return incomingDir;
  }

  fs.mkdirSync(incomingDir, { recursive: true });
  atomicWriteFileSync(markerPath, 'Archiv-Wiki Eingang\n', 'utf8');
  return incomingDir;
}

function requireEntryId(id) {
  const value = String(id || '').trim();
  if (!ENTRY_ID_PATTERN.test(value)) {
    throw new Error('Ungültige Eingang-ID.');
  }
  return value;
}

function entryPathOf(projectPath, id) {
  return path.join(ensureIncomingStorage(projectPath), `${requireEntryId(id)}${ENTRY_EXT}`);
}

function managedFileDirOf(projectPath, id) {
  return path.join(ensureIncomingStorage(projectPath), FILES_DIRNAME, requireEntryId(id));
}

function managedFileRef(id, fileName) {
  return path.posix.join(FILES_DIRNAME, requireEntryId(id), fileName);
}

function imageMimeTypeForFileName(fileName) {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  return IMAGE_MIME_TYPES[ext] || null;
}

function requireSupportedImageFile(fileName) {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) {
    throw new Error('Bitte eine unterstützte Bilddatei auswählen.');
  }
  return IMAGE_MIME_TYPES[ext];
}

function cloneSerializableObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Eingang-Daten müssen als Objekt übergeben werden.');
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    throw new Error('Eingang-Daten konnten nicht gespeichert werden.');
  }
}

function readEntryFile(fullPath) {
  const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Ungültige Eingang-Datei.');
  }
  return parsed;
}

function getIncoming(projectPath, id) {
  const fullPath = entryPathOf(projectPath, id);
  if (!fs.existsSync(fullPath)) {
    throw new Error('Eingang wurde nicht gefunden.');
  }
  return readEntryFile(fullPath);
}

function loadIncoming(projectPath) {
  const incomingDir = ensureIncomingStorage(projectPath);
  const entries = [];

  for (const dirent of fs.readdirSync(incomingDir, { withFileTypes: true })) {
    if (!dirent.isFile() || !dirent.name.endsWith(ENTRY_EXT)) continue;

    try {
      entries.push(readEntryFile(path.join(incomingDir, dirent.name)));
    } catch (error) {
      // Eine beschädigte Eingang-Datei darf die übrigen Eingänge nicht blockieren.
      console.warn(`[Archiv Wiki] Eingang konnte nicht geladen werden (${dirent.name}): ${error.message}`);
    }
  }

  return entries.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
}

function createIncoming(projectPath, data = {}) {
  const payload = cloneSerializableObject(data);
  delete payload.id;
  delete payload.createdAt;
  delete payload.updatedAt;

  const now = new Date().toISOString();
  let id;
  let fullPath;
  do {
    id = crypto.randomUUID();
    fullPath = entryPathOf(projectPath, id);
  } while (fs.existsSync(fullPath));

  const entry = {
    id,
    ...payload,
    createdAt: now,
    updatedAt: now
  };

  atomicWriteFileSync(fullPath, JSON.stringify(entry, null, 2), 'utf8');
  return entry;
}

function createIncomingFromFile(projectPath, sourcePath, options = {}) {
  const selectedPath = path.resolve(String(sourcePath || ''));
  if (!selectedPath || !fs.existsSync(selectedPath)) {
    throw new Error('Die ausgewählte Datei wurde nicht gefunden.');
  }

  const stat = fs.statSync(selectedPath);
  if (!stat.isFile()) {
    throw new Error('Bitte eine Datei auswählen.');
  }

  const fileName = path.basename(selectedPath);
  const type = options.type === 'image' ? 'image' : 'file';
  const mimeType = type === 'image' ? requireSupportedImageFile(fileName) : null;
  const id = crypto.randomUUID();
  const targetDir = managedFileDirOf(projectPath, id);
  const targetPath = path.join(targetDir, fileName);
  const entryPath = entryPathOf(projectPath, id);

  fs.mkdirSync(targetDir, { recursive: true });
  try {
    // Datei- und Bild-Eingänge verwenden denselben verwalteten Anhangspfad.
    // Die Originaldatei bleibt unangetastet und die Kopie wird atomar übernommen.
    atomicCopyFileSync(selectedPath, targetPath);

    const now = new Date().toISOString();
    const entry = {
      id,
      title: fileName,
      fileName,
      type,
      attachment: {
        kind: 'managed-file',
        ref: managedFileRef(id, fileName),
        fileName,
        size: stat.size,
        ...(mimeType ? { mimeType } : {})
      },
      createdAt: now,
      updatedAt: now
    };

    atomicWriteFileSync(entryPath, JSON.stringify(entry, null, 2), 'utf8');
    return entry;
  } catch (error) {
    try { fs.rmSync(targetDir, { recursive: true, force: true }); } catch { /* best effort */ }
    throw error;
  }
}

function createIncomingFromImage(projectPath, sourcePath) {
  return createIncomingFromFile(projectPath, sourcePath, { type: 'image' });
}

function normalizeHttpUrl(value, label = 'URL') {
  const raw = String(value || '').trim();
  if (!raw) throw new Error(`${label} ist erforderlich.`);

  let parsedUrl;
  try { parsedUrl = new URL(raw); }
  catch { throw new Error(`${label} ist ungültig.`); }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(`${label} unterstützt nur HTTP- oder HTTPS-URLs.`);
  }
  return parsedUrl.href;
}

function sanitizeImageClipFileName(value) {
  let fileName = String(value || 'Webbild.png')
    .replace(/[\\/\0<>:\"|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  fileName = path.basename(fileName || 'Webbild.png').replace(/\.[a-z0-9]{1,8}$/i, '').trim();
  return `${fileName || 'Webbild'}.png`;
}

function normalizeImageClipData(data = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Bild-Clip-Daten müssen als Objekt übergeben werden.');
  }

  const requestedType = String(data.type || '').trim().toLowerCase();
  const captureMode = String(data.captureMode || '').trim().toLowerCase();
  if (requestedType !== IMAGE_CLIP_TYPE || captureMode !== 'images') {
    throw new Error('Bild-Clips müssen Typ "image" und Sammelmodus "images" verwenden.');
  }

  const pageTitle = String(data.pageTitle || '').trim();
  if (!pageTitle) throw new Error('Bild-Clips benötigen den Seitentitel.');
  const sourceUrl = normalizeHttpUrl(data.url, 'Die Quell-URL');

  let imageUrl = '';
  if (data.imageUrl) {
    try { imageUrl = normalizeHttpUrl(data.imageUrl, 'Die Bild-URL'); }
    catch { imageUrl = ''; }
  }

  const imageData = data.imageData;
  if (!imageData || typeof imageData !== 'object' || Array.isArray(imageData)) {
    throw new Error('Bild-Clips enthalten keine Bilddaten.');
  }
  const mimeType = String(imageData.mimeType || '').trim().toLowerCase();
  const base64 = typeof imageData.base64 === 'string' ? imageData.base64.trim() : '';
  if (mimeType !== 'image/png') throw new Error('Bild-Clips verwenden derzeit PNG-Bilddaten.');
  if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error('Bild-Clip enthält ungültige Bilddaten.');
  }

  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length || buffer.length > MAX_WEB_CLIP_IMAGE_BYTES) {
    throw new Error('Das ausgewählte Bild ist zu groß.');
  }
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < pngSignature.length || !buffer.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error('Bild-Clip enthält keine gültige PNG-Datei.');
  }

  let capturedAt = null;
  if (data.createdAt) {
    const parsed = new Date(String(data.createdAt));
    if (!Number.isNaN(parsed.getTime())) capturedAt = parsed.toISOString();
  }

  const fileName = sanitizeImageClipFileName(imageData.fileName || data.fileName || data.title);
  return {
    title: fileName,
    fileName,
    pageTitle,
    sourceUrl,
    imageUrl,
    captureMode: 'images',
    capturedAt,
    mimeType,
    buffer
  };
}

function createIncomingFromImageClip(projectPath, data = {}) {
  const clip = normalizeImageClipData(data);
  const id = crypto.randomUUID();
  const targetDir = managedFileDirOf(projectPath, id);
  const targetPath = path.join(targetDir, clip.fileName);
  const entryPath = entryPathOf(projectPath, id);

  fs.mkdirSync(targetDir, { recursive: true });
  try {
    atomicWriteFileSync(targetPath, clip.buffer);
    const now = new Date().toISOString();
    const entry = {
      id,
      title: clip.title,
      fileName: clip.fileName,
      type: IMAGE_CLIP_TYPE,
      captureMode: clip.captureMode,
      sourceUrl: clip.sourceUrl,
      pageTitle: clip.pageTitle,
      ...(clip.imageUrl ? { imageUrl: clip.imageUrl } : {}),
      ...(clip.capturedAt ? { capturedAt: clip.capturedAt } : {}),
      source: {
        url: clip.sourceUrl,
        title: clip.pageTitle,
        ...(clip.imageUrl ? { imageUrl: clip.imageUrl } : {})
      },
      attachment: {
        kind: 'managed-file',
        ref: managedFileRef(id, clip.fileName),
        fileName: clip.fileName,
        size: clip.buffer.length,
        mimeType: clip.mimeType
      },
      createdAt: now,
      updatedAt: now
    };

    atomicWriteFileSync(entryPath, JSON.stringify(entry, null, 2), 'utf8');
    return entry;
  } catch (error) {
    try { fs.rmSync(targetDir, { recursive: true, force: true }); } catch { /* best effort */ }
    throw error;
  }
}

function normalizeWebClipData(data = {}) {
  const payload = cloneSerializableObject(data);
  const title = String(payload.title || '').trim();
  const url = String(payload.url || '').trim();
  const content = typeof payload.content === 'string' ? payload.content : '';
  const requestedType = String(payload.type || WEB_CLIP_TYPE).trim().toLowerCase();
  const rawCaptureMode = payload.captureMode == null ? '' : String(payload.captureMode).trim().toLowerCase();

  if (!title) {
    throw new Error('Web-Clips benötigen einen Titel.');
  }
  if (!url) {
    throw new Error('Web-Clips benötigen eine URL.');
  }
  if (requestedType !== WEB_CLIP_TYPE) {
    throw new Error('Web-Clips müssen den Typ "webpage" verwenden.');
  }
  if (rawCaptureMode && !WEB_CLIP_CAPTURE_MODES.has(rawCaptureMode)) {
    throw new Error('Web-Clip-Sammelart ist ungültig.');
  }
  if (rawCaptureMode === 'selection' && !content.trim()) {
    throw new Error('Markierter Text ist leer. Es wurde kein Eingang erstellt.');
  }
  if (rawCaptureMode === 'page' && !content.trim()) {
    throw new Error('Der Seiteninhalt ist leer. Es wurde kein Eingang erstellt.');
  }
  if (Buffer.byteLength(content, 'utf8') > MAX_WEB_CLIP_CONTENT_BYTES) {
    throw new Error('Der gesammelte Seiteninhalt ist zu groß. Bitte sammle einen kleineren Abschnitt.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('Die Web-Clip-URL ist ungültig.');
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Web-Clips unterstützen nur HTTP- oder HTTPS-URLs.');
  }

  // Der Web-Clip-Vertrag ist absichtlich klein und transportiert nur bereits
  // erfasste Daten. Ein späterer Browser-Adapter kann genau dieses Objekt an
  // Archiv-Wiki übergeben, ohne dass der Eingang selbst Netzwerkzugriffe kennt.
  return {
    title,
    url: parsedUrl.href,
    content,
    type: WEB_CLIP_TYPE,
    ...(rawCaptureMode ? { captureMode: rawCaptureMode } : {})
  };
}

function receiveWebClip(projectPath, data = {}) {
  const requestedType = String(data?.type || WEB_CLIP_TYPE).trim().toLowerCase();
  if (requestedType === IMAGE_CLIP_TYPE) {
    return createIncomingFromImageClip(projectPath, data);
  }

  const webClip = normalizeWebClipData(data);

  // Text-/URL-/Seiten-Clips landen über den allgemeinen Eingang-Schreibpfad.
  // Bild-Clips verwenden denselben Eingang-Speicher, legen ihre Binärdaten aber
  // wie bestehende Bild-Eingänge als verwalteten Anhang ab.
  return createIncoming(projectPath, webClip);
}

function createIncomingFromWebpage(projectPath, data = {}) {
  // Kompatibilitätsname aus Q-012.5.1: bewusst nur Weiterleitung auf den einen
  // zentralen Web-Clip-Empfangsweg, keine zweite Webseiten-Speicherlogik.
  return receiveWebClip(projectPath, data);
}

function getIncomingImagePreview(projectPath, id) {
  const entry = getIncoming(projectPath, id);
  if (String(entry?.type || '').toLowerCase() !== 'image' || entry?.attachment?.kind !== 'managed-file') {
    throw new Error('Dieser Eingang enthält kein verwaltetes Bild.');
  }

  const fileName = path.basename(String(entry.attachment.fileName || entry.fileName || ''));
  const mimeType = entry.attachment.mimeType || imageMimeTypeForFileName(fileName);
  if (!fileName || !mimeType) {
    throw new Error('Das Bildformat wird nicht unterstützt.');
  }

  const fullPath = path.join(managedFileDirOf(projectPath, id), fileName);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    throw new Error('Der Bild-Anhang wurde nicht gefunden.');
  }

  return {
    fileName,
    mimeType,
    dataUrl: `data:${mimeType};base64,${fs.readFileSync(fullPath).toString('base64')}`
  };
}

function saveIncoming(projectPath, id, patch = {}) {
  const fullPath = entryPathOf(projectPath, id);
  if (!fs.existsSync(fullPath)) {
    throw new Error('Eingang wurde nicht gefunden.');
  }

  const current = readEntryFile(fullPath);
  const payload = cloneSerializableObject(patch);
  delete payload.id;
  delete payload.createdAt;
  delete payload.updatedAt;

  const entry = {
    ...current,
    ...payload,
    id: requireEntryId(id),
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString()
  };

  atomicWriteFileSync(fullPath, JSON.stringify(entry, null, 2), 'utf8');
  return entry;
}

function deleteIncoming(projectPath, id) {
  const fullPath = entryPathOf(projectPath, id);
  if (!fs.existsSync(fullPath)) return { deleted: false };

  const entry = readEntryFile(fullPath);
  fs.unlinkSync(fullPath);

  // Erst nachdem der eigentliche Eingang entfernt wurde, räumen wir genau den
  // zu diesem Eingang gehörenden verwalteten Dateiordner auf. Scheitert das
  // Aufräumen, bleibt höchstens eine verwaiste Kopie zurück – niemals ein
  // Eingang, der auf eine bereits gelöschte Datei verweist.
  let attachmentCleanupFailed = false;
  if (entry?.attachment?.kind === 'managed-file') {
    try {
      fs.rmSync(managedFileDirOf(projectPath, id), { recursive: true, force: true });
    } catch (error) {
      attachmentCleanupFailed = true;
      console.warn(`[Archiv Wiki] Eingang-Dateianhang konnte nicht entfernt werden (${id}): ${error.message}`);
    }
  }

  return { deleted: true, attachmentCleanupFailed };
}

module.exports = {
  ensureIncomingStorage,
  loadIncoming,
  getIncoming,
  createIncoming,
  createIncomingFromFile,
  createIncomingFromImage,
  normalizeImageClipData,
  createIncomingFromImageClip,
  normalizeWebClipData,
  receiveWebClip,
  createIncomingFromWebpage,
  getIncomingImagePreview,
  saveIncoming,
  deleteIncoming
};
