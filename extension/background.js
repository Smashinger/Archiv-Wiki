// extension/background.js
// Erfasst Titel/URL und je nach ausdrücklich gewählter Sammelart markierten
// Text, sichtbaren Seitentext oder genau ein vom Nutzer ausgewähltes Bild.

'use strict';

if (typeof importScripts === 'function') {
  importScripts('webclip-contract.js', 'archiv-wiki-bridge.js');
}

const browserApi = typeof browser !== 'undefined' ? browser : chrome;

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const MESSAGE_TYPES = Object.freeze({
  PREPARE_WEB_CLIP: 'archiv-wiki:webclip:prepare',
  SEND_WEB_CLIP: 'archiv-wiki:webclip:send',
  CAPTURE_CURRENT_PAGE: 'archiv-wiki:webclip:capture-current-page',
  TRANSPORT_STATUS: 'archiv-wiki:webclip:transport-status',
  GET_SELECTION: 'archiv-wiki:webclip:get-selection',
  GET_PAGE_TEXT: 'archiv-wiki:webclip:get-page-text',
  START_IMAGE_PICK: 'archiv-wiki:webclip:start-image-pick',
  IMAGE_PICKED: 'archiv-wiki:webclip:image-picked'
});

function resultFromError(error) {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error)
  };
}

function setActionFeedback(tabId, text) {
  if (!Number.isInteger(tabId) || !browserApi.action?.setBadgeText) return;
  try {
    const result = browserApi.action.setBadgeText({ tabId, text });
    result?.catch?.(() => {});
  } catch { /* Rückmeldung ist rein informativ */ }
  if (text) {
    setTimeout(() => {
      try {
        const result = browserApi.action.setBadgeText({ tabId, text: '' });
        result?.catch?.(() => {});
      } catch { /* Rückmeldung ist rein informativ */ }
    }, 1800);
  }
}

async function getCurrentTab() {
  const tabs = await browserApi.tabs.query({ active: true, currentWindow: true });
  const tab = Array.isArray(tabs) ? tabs[0] : null;
  if (!tab) throw new Error('Aktuelle Browser-Seite konnte nicht ermittelt werden.');
  return tab;
}

async function ensureContentScript(tabId) {
  if (!Number.isInteger(tabId)) throw new Error('Die aktuelle Browser-Seite ist nicht verfügbar.');
  // activeTab + scripting hält den Seitenzugriff auf den ausdrücklich
  // ausgelösten Clip beschränkt; es gibt keine dauerhafte Host-Berechtigung.
  try {
    await browserApi.scripting.executeScript({
      target: { tabId },
      files: ['content-script.js']
    });
  } catch (error) {
    console.warn('[Archiv-Wiki Web Clipper] Seitenzugriff fehlgeschlagen:', error?.message || error);
    throw new Error('Diese Browser-Seite kann vom Web Clipper nicht gelesen werden. Öffne eine normale HTTP-/HTTPS-Webseite.');
  }
}

function requireHttpPageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('Die URL der aktuellen Seite ist nicht verfügbar.');
  let parsed;
  try { parsed = new URL(raw); }
  catch { throw new Error('Die URL der aktuellen Seite ist ungültig.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Diese Browser-Seite kann nicht gesammelt werden. Unterstützt werden normale HTTP-/HTTPS-Webseiten.');
  }
  return parsed.href;
}

async function requestPageText(tabId, messageType, emptyMessage, readErrorMessage) {
  await ensureContentScript(tabId);

  const response = await browserApi.tabs.sendMessage(tabId, { type: messageType });
  if (!response?.ok) {
    throw new Error(response?.error || readErrorMessage);
  }

  const text = typeof response.text === 'string' ? response.text : '';
  if (!text.trim()) {
    throw new Error(emptyMessage);
  }
  return text;
}

function captureSelectedText(tabId) {
  return requestPageText(
    tabId,
    MESSAGE_TYPES.GET_SELECTION,
    'Auf der aktuellen Webseite ist kein Text markiert.',
    'Markierter Text konnte nicht gelesen werden.'
  );
}

function captureWholePageText(tabId) {
  return requestPageText(
    tabId,
    MESSAGE_TYPES.GET_PAGE_TEXT,
    'Auf der aktuellen Webseite wurde kein Seiteninhalt gefunden.',
    'Der Seiteninhalt konnte nicht gelesen werden.'
  );
}

async function startImageSelection(tabId) {
  await ensureContentScript(tabId);
  const response = await browserApi.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.START_IMAGE_PICK });
  if (!response?.ok) throw new Error(response?.error || 'Bildauswahl konnte nicht gestartet werden.');
  return { ok: true, awaitingImageSelection: true, captureMode: ArchivWikiWebClip.CAPTURE_MODES.IMAGES };
}

function safeImageFileName(imageUrl, altText) {
  let candidate = '';
  try {
    const parsed = new URL(String(imageUrl || ''));
    candidate = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
  } catch { /* optionale Bild-URL */ }

  if (!candidate) candidate = String(altText || '').trim();
  candidate = candidate
    .replace(/[\\/\0<>:"|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  candidate = candidate.replace(/\.[a-z0-9]{1,8}$/i, '').trim();
  return `${candidate || 'Webbild'}.png`;
}

function uint8ToBase64(bytes) {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function cropVisibleTabToImage(tab, payload) {
  const rect = payload?.rect || {};
  const viewport = payload?.viewport || {};
  const viewportWidth = Number(viewport.width);
  const viewportHeight = Number(viewport.height);
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) {
    throw new Error('Bildposition konnte nicht bestimmt werden.');
  }

  const left = Math.max(0, Number(rect.x));
  const top = Math.max(0, Number(rect.y));
  const right = Math.min(viewportWidth, Number(rect.x) + Number(rect.width));
  const bottom = Math.min(viewportHeight, Number(rect.y) + Number(rect.height));
  if (!(right > left) || !(bottom > top)) {
    throw new Error('Das ausgewählte Bild liegt außerhalb des sichtbaren Bereichs.');
  }

  const screenshotDataUrl = await browserApi.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const screenshotBlob = await (await fetch(screenshotDataUrl)).blob();
  const bitmap = await createImageBitmap(screenshotBlob);

  try {
    const scaleX = bitmap.width / viewportWidth;
    const scaleY = bitmap.height / viewportHeight;
    const sx = Math.max(0, Math.round(left * scaleX));
    const sy = Math.max(0, Math.round(top * scaleY));
    const sw = Math.min(bitmap.width - sx, Math.max(1, Math.round((right - left) * scaleX)));
    const sh = Math.min(bitmap.height - sy, Math.max(1, Math.round((bottom - top) * scaleY)));

    if (!(sw > 0) || !(sh > 0)) throw new Error('Das ausgewählte Bild liegt außerhalb des sichtbaren Bereichs.');

    const canvas = new OffscreenCanvas(sw, sh);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Bild konnte nicht vorbereitet werden.');
    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);

    const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
    const bytes = new Uint8Array(await croppedBlob.arrayBuffer());
    if (!bytes.length) throw new Error('Das ausgewählte Bild enthält keine Bilddaten.');
    if (bytes.length > MAX_IMAGE_BYTES) {
      throw new Error('Das ausgewählte Bild ist zu groß. Bitte wähle ein kleineres Bild.');
    }
    return {
      mimeType: 'image/png',
      base64: uint8ToBase64(bytes),
      size: bytes.length
    };
  } finally {
    bitmap.close?.();
  }
}

async function capturePickedImage(tab, payload = {}) {
  if (!Number.isInteger(tab?.id) || !Number.isInteger(tab?.windowId)) {
    throw new Error('Die Browser-Seite des ausgewählten Bildes ist nicht verfügbar.');
  }

  const pageTitle = String(payload.pageTitle || tab.title || '').trim();
  const pageUrl = requireHttpPageUrl(payload.pageUrl || tab.url);
  if (!pageTitle) throw new Error('Der Seitentitel ist nicht verfügbar.');

  const imageData = await cropVisibleTabToImage(tab, payload);
  const fileName = safeImageFileName(payload.imageUrl, payload.altText);
  const clip = ArchivWikiWebClip.createImageClip({
    title: fileName,
    fileName,
    pageTitle,
    url: pageUrl,
    imageUrl: payload.imageUrl,
    type: 'image',
    captureMode: ArchivWikiWebClip.CAPTURE_MODES.IMAGES,
    createdAt: new Date().toISOString(),
    imageData: {
      mimeType: imageData.mimeType,
      fileName,
      base64: imageData.base64
    }
  });

  const result = await ArchivWikiBridge.sendWebClip(clip);
  if (!result?.ok) throw new Error(result?.error || 'Bild konnte nicht an Archiv-Wiki übergeben werden.');
  return result;
}

async function captureCurrentPage(tab, captureMode = ArchivWikiWebClip.DEFAULT_CAPTURE_MODE) {
  const title = String(tab?.title || '').trim();
  const url = requireHttpPageUrl(tab?.url);
  if (!title) throw new Error('Der Seitentitel der aktuellen Seite ist nicht verfügbar.');

  const normalizedMode = ArchivWikiWebClip.normalizeCaptureMode(captureMode);
  if (normalizedMode === ArchivWikiWebClip.CAPTURE_MODES.IMAGES) {
    return startImageSelection(tab?.id);
  }

  let content = '';
  if (normalizedMode === ArchivWikiWebClip.CAPTURE_MODES.SELECTION) {
    content = await captureSelectedText(tab?.id);
  } else if (normalizedMode === ArchivWikiWebClip.CAPTURE_MODES.PAGE) {
    content = await captureWholePageText(tab?.id);
  }

  const webClip = ArchivWikiWebClip.createWebClip({
    title,
    url,
    content,
    type: 'webpage',
    createdAt: new Date().toISOString(),
    captureMode: normalizedMode
  });

  const result = await ArchivWikiBridge.sendWebClip(webClip);
  if (!result?.ok) throw new Error(result?.error || 'Webseite konnte nicht an Archiv-Wiki übergeben werden.');
  return { ...result, captureMode: webClip.captureMode };
}

browserApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;

  if (message.type === MESSAGE_TYPES.PREPARE_WEB_CLIP) {
    try {
      sendResponse({
        ok: true,
        webClip: ArchivWikiWebClip.createClip(message.payload)
      });
    } catch (error) {
      sendResponse(resultFromError(error));
    }
    return false;
  }

  if (message.type === MESSAGE_TYPES.SEND_WEB_CLIP) {
    ArchivWikiBridge.sendWebClip(message.payload)
      .then(sendResponse)
      .catch((error) => sendResponse(resultFromError(error)));
    return true;
  }

  if (message.type === MESSAGE_TYPES.CAPTURE_CURRENT_PAGE) {
    let tabId = null;
    getCurrentTab()
      .then((tab) => {
        tabId = tab?.id;
        return captureCurrentPage(tab, message.captureMode);
      })
      .then((result) => {
        if (!result?.awaitingImageSelection) setActionFeedback(tabId, '✓');
        sendResponse({ ok: true, ...result });
      })
      .catch((error) => {
        console.error('[Archiv-Wiki Web Clipper]', error?.message || error);
        setActionFeedback(tabId, '!');
        sendResponse(resultFromError(error));
      });
    return true;
  }

  if (message.type === MESSAGE_TYPES.IMAGE_PICKED) {
    const tab = sender?.tab;
    capturePickedImage(tab, message.payload)
      .then((result) => {
        setActionFeedback(tab?.id, '✓');
        sendResponse({ ok: true, ...result });
      })
      .catch((error) => {
        console.error('[Archiv-Wiki Web Clipper]', error?.message || error);
        setActionFeedback(tab?.id, '!');
        sendResponse(resultFromError(error));
      });
    return true;
  }

  if (message.type === MESSAGE_TYPES.TRANSPORT_STATUS) {
    sendResponse({
      ok: true,
      status: ArchivWikiBridge.TRANSPORT_STATUS
    });
    return false;
  }

  return false;
});
