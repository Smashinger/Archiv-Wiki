// extension/archiv-wiki-bridge.js
// Transportgrenze zum Desktop-Programm über Browser Native Messaging.

'use strict';

(function exposeArchivWikiBridge(root, factory) {
  const api = factory(root, root.ArchivWikiWebClip);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.ArchivWikiBridge = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, (root, webClipContract) => {
  const NATIVE_HOST_NAME = 'de.smashii.archivwiki.webclip';
  const TRANSPORT_STATUS = 'native-messaging';
  const MAX_MESSAGE_BYTES = 10 * 1024 * 1024;
  const RESPONSE_TIMEOUT_MS = 10000;

  function byteLengthUtf8(value) {
    const text = String(value ?? '');
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).byteLength;
    if (typeof Buffer === 'function') return Buffer.byteLength(text, 'utf8');
    return unescape(encodeURIComponent(text)).length;
  }

  function unavailableResult(error = '') {
    const detail = String(error || '').trim();
    const hostMissing = /native messaging host.*not found|specified native messaging host|access to the specified native messaging host/i.test(detail);
    return {
      ok: false,
      status: 'native-host-unavailable',
      error: hostMissing
        ? 'Die Native-Messaging-Verbindung zu Archiv-Wiki wurde nicht gefunden. Prüfe die Native-Host-Installation und lade die Erweiterung neu.'
        : 'Archiv-Wiki ist nicht erreichbar. Starte Archiv-Wiki und versuche den Clip erneut.'
    };
  }

  async function sendWebClip(data) {
    const createClip = webClipContract?.createClip || webClipContract?.createWebClip;
    if (typeof createClip !== 'function') {
      throw new Error('Der Web-Clip-Datenvertrag ist nicht geladen.');
    }

    const clip = createClip(data);
    const nativeMessage = { version: 1, type: 'webclip', payload: clip };
    const serializedMessage = JSON.stringify(nativeMessage);
    if (byteLengthUtf8(serializedMessage) > MAX_MESSAGE_BYTES) {
      return {
        ok: false,
        status: 'clip-too-large',
        error: 'Der Clip ist zu groß. Bitte sammle einen kleineren Inhalt oder ein kleineres Bild.'
      };
    }

    const runtime = root?.chrome?.runtime;
    if (!runtime?.sendNativeMessage) {
      return {
        ok: false,
        status: 'native-messaging-unavailable',
        error: 'Native Messaging ist in diesem Browser nicht verfügbar.'
      };
    }

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(result);
      };

      const timeoutId = setTimeout(() => {
        finish({
          ok: false,
          status: 'native-host-timeout',
          error: 'Archiv-Wiki antwortet nicht. Prüfe, ob Archiv-Wiki geöffnet ist, und versuche den Clip erneut.'
        });
      }, RESPONSE_TIMEOUT_MS);

      try {
        runtime.sendNativeMessage(NATIVE_HOST_NAME, nativeMessage, (response) => {
          const lastError = runtime.lastError;
          if (lastError) {
            finish(unavailableResult(lastError.message));
            return;
          }
          if (!response || typeof response !== 'object') {
            finish({
              ok: false,
              status: 'native-messaging-invalid-response',
              error: 'Archiv-Wiki hat keine gültige Antwort gesendet. Versuche den Clip erneut.'
            });
            return;
          }
          finish({ ...response, status: TRANSPORT_STATUS });
        });
      } catch (error) {
        finish(unavailableResult(error?.message || error));
      }
    });
  }

  return Object.freeze({
    NATIVE_HOST_NAME,
    TRANSPORT_STATUS,
    MAX_MESSAGE_BYTES,
    RESPONSE_TIMEOUT_MS,
    sendWebClip
  });
});
