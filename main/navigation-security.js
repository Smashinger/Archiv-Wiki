'use strict';

const path = require('path');
const { URL, pathToFileURL } = require('url');

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:', 'http:']);

function getAppDocumentUrl(documentPath) {
  return pathToFileURL(path.resolve(documentPath)).href;
}

function getDocumentIdentity(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    parsed.hash = '';
    return parsed.href;
  } catch {
    return null;
  }
}

// Nur der Hash darf sich gegenüber dem tatsächlich per loadFile() geladenen
// Dokument unterscheiden. Query, Pfad, Host oder Protokoll gehören zur
// Dokumentidentität und bleiben deshalb Teil des exakten URL-Vergleichs.
function isAllowedAppDocumentNavigation(targetUrl, appDocumentUrl) {
  const targetIdentity = getDocumentIdentity(targetUrl);
  const appIdentity = getDocumentIdentity(appDocumentUrl);
  return targetIdentity !== null && appIdentity !== null && targetIdentity === appIdentity;
}

function getAllowedExternalUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol) || !parsed.hostname) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

// Liefert dieselben beiden Handler für Hauptfenster und Wizard. openExternal
// wird injiziert, damit die Policy ohne echte Betriebssystem-Handler geprüft
// werden kann und kein Test versehentlich ein fremdes Scheme startet.
function createNavigationHandlers({ appDocumentUrl, openExternal, onExternalError = () => {} }) {
  function openExternalIfAllowed(rawUrl) {
    const allowedUrl = getAllowedExternalUrl(rawUrl);
    if (!allowedUrl) return false;

    try {
      Promise.resolve(openExternal(allowedUrl)).catch(onExternalError);
      return true;
    } catch (error) {
      onExternalError(error);
      return false;
    }
  }

  function handleWindowOpen({ url } = {}) {
    openExternalIfAllowed(url);
    return { action: 'deny' };
  }

  function handleWillNavigate(event, url) {
    if (isAllowedAppDocumentNavigation(url, appDocumentUrl)) return;
    event?.preventDefault?.();
    openExternalIfAllowed(url);
  }

  return { handleWindowOpen, handleWillNavigate };
}

module.exports = {
  getAppDocumentUrl,
  isAllowedAppDocumentNavigation,
  getAllowedExternalUrl,
  createNavigationHandlers
};
