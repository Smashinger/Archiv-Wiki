// extension/webclip-contract.js
// Gemeinsamer Datenvertrag innerhalb der Browser-Erweiterung für Web-Clips.

'use strict';

(function exposeWebClipContract(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.ArchivWikiWebClip = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, () => {
  const CLIP_TYPES = Object.freeze({
    WEBPAGE: 'webpage',
    IMAGE: 'image'
  });
  const WEB_CLIP_TYPE = CLIP_TYPES.WEBPAGE;
  const CAPTURE_MODES = Object.freeze({
    SELECTION: 'selection',
    URL: 'url',
    PAGE: 'page',
    IMAGES: 'images'
  });
  const DEFAULT_CAPTURE_MODE = CAPTURE_MODES.SELECTION;
  const VALID_CAPTURE_MODES = new Set(Object.values(CAPTURE_MODES));

  function normalizeCreatedAt(value) {
    const raw = String(value || '').trim();
    if (!raw) return new Date().toISOString();

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error('Web-Clip-Erstellungsdatum ist ungültig.');
    }
    return parsed.toISOString();
  }

  function normalizeCaptureMode(value) {
    const mode = String(value || DEFAULT_CAPTURE_MODE).trim().toLowerCase();
    if (!VALID_CAPTURE_MODES.has(mode)) {
      throw new Error('Die gewählte Web-Clip-Sammelart ist ungültig.');
    }
    return mode;
  }

  function normalizeHttpUrl(value, label) {
    const raw = String(value || '').trim();
    if (!raw) throw new Error(`${label} ist erforderlich.`);

    let parsedUrl;
    try {
      parsedUrl = new URL(raw);
    } catch {
      throw new Error(`${label} ist ungültig.`);
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error(`${label} unterstützt nur HTTP- oder HTTPS-URLs.`);
    }
    return parsedUrl.href;
  }

  function normalizeOptionalHttpUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const parsedUrl = new URL(raw);
      return ['http:', 'https:'].includes(parsedUrl.protocol) ? parsedUrl.href : '';
    } catch {
      return '';
    }
  }

  function createWebClip(data = {}) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Web-Clip-Daten müssen als Objekt übergeben werden.');
    }

    const title = String(data.title || '').trim();
    const content = typeof data.content === 'string' ? data.content : '';
    const type = String(data.type || WEB_CLIP_TYPE).trim().toLowerCase();
    const captureMode = normalizeCaptureMode(data.captureMode);

    if (!title) throw new Error('Web-Clips benötigen einen Titel.');
    if (type !== WEB_CLIP_TYPE) {
      throw new Error('Web-Clips müssen den Typ "webpage" verwenden.');
    }
    if (captureMode === CAPTURE_MODES.IMAGES) {
      throw new Error('Der Bilder-Modus benötigt einen Bild-Clip.');
    }
    if (captureMode === CAPTURE_MODES.SELECTION && !content.trim()) {
      throw new Error('Auf der aktuellen Webseite ist kein Text markiert.');
    }
    if (captureMode === CAPTURE_MODES.PAGE && !content.trim()) {
      throw new Error('Auf der aktuellen Webseite wurde kein Seiteninhalt gefunden.');
    }

    return {
      title,
      url: normalizeHttpUrl(data.url, 'Die Web-Clip-URL'),
      content,
      type: WEB_CLIP_TYPE,
      createdAt: normalizeCreatedAt(data.createdAt),
      captureMode
    };
  }

  function createImageClip(data = {}) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Bild-Clip-Daten müssen als Objekt übergeben werden.');
    }

    const type = String(data.type || CLIP_TYPES.IMAGE).trim().toLowerCase();
    const captureMode = normalizeCaptureMode(data.captureMode || CAPTURE_MODES.IMAGES);
    const title = String(data.title || data.fileName || 'Webbild').trim();
    const pageTitle = String(data.pageTitle || '').trim();
    const imageData = data.imageData && typeof data.imageData === 'object' && !Array.isArray(data.imageData)
      ? data.imageData
      : null;

    if (type !== CLIP_TYPES.IMAGE) throw new Error('Bild-Clips müssen den Typ "image" verwenden.');
    if (captureMode !== CAPTURE_MODES.IMAGES) throw new Error('Bild-Clips müssen den Sammelmodus "images" verwenden.');
    if (!title) throw new Error('Bild-Clips benötigen einen Namen.');
    if (!pageTitle) throw new Error('Bild-Clips benötigen den Seitentitel.');
    if (!imageData) throw new Error('Bild-Clips benötigen Bilddaten.');

    const mimeType = String(imageData.mimeType || '').trim().toLowerCase();
    const base64 = typeof imageData.base64 === 'string' ? imageData.base64.trim() : '';
    const fileName = String(imageData.fileName || data.fileName || title || 'Webbild.png').trim();
    if (mimeType !== 'image/png') throw new Error('Bild-Clips verwenden derzeit PNG-Bilddaten.');
    if (!base64) throw new Error('Bild-Clips enthalten keine Bilddaten.');

    return {
      title,
      pageTitle,
      url: normalizeHttpUrl(data.url, 'Die Quell-URL'),
      imageUrl: normalizeOptionalHttpUrl(data.imageUrl),
      type: CLIP_TYPES.IMAGE,
      captureMode: CAPTURE_MODES.IMAGES,
      createdAt: normalizeCreatedAt(data.createdAt),
      imageData: {
        mimeType,
        fileName,
        base64
      }
    };
  }

  function createClip(data = {}) {
    const type = String(data?.type || CLIP_TYPES.WEBPAGE).trim().toLowerCase();
    return type === CLIP_TYPES.IMAGE ? createImageClip(data) : createWebClip(data);
  }

  return Object.freeze({
    CLIP_TYPES,
    WEB_CLIP_TYPE,
    CAPTURE_MODES,
    DEFAULT_CAPTURE_MODE,
    normalizeCaptureMode,
    createWebClip,
    createImageClip,
    createClip
  });
});
