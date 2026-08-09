// extension/content-script.js
// Liest ausschließlich ausdrücklich angeforderte Inhalte der aktuellen Seite.
// Für den Bilder-Modus aktiviert es kurzzeitig eine gezielte Einzelauswahl;
// automatisch werden keine Bilder gesammelt.

'use strict';

(() => {
  const INSTALL_FLAG = '__archivWikiContentBridgeInstalled';
  const GET_SELECTION = 'archiv-wiki:webclip:get-selection';
  const GET_PAGE_TEXT = 'archiv-wiki:webclip:get-page-text';
  const START_IMAGE_PICK = 'archiv-wiki:webclip:start-image-pick';
  const IMAGE_PICKED = 'archiv-wiki:webclip:image-picked';
  const browserApi = typeof browser !== 'undefined' ? browser : chrome;

  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;

  let imagePickCleanup = null;

  function startImagePick() {
    imagePickCleanup?.();

    if (!document.querySelector('img')) {
      throw new Error('Auf der aktuellen Webseite wurde kein auswählbares Bild gefunden.');
    }

    const style = document.createElement('style');
    style.dataset.archivWikiImagePick = 'true';
    style.textContent = `
      html.archiv-wiki-image-pick, html.archiv-wiki-image-pick * { cursor: crosshair !important; }
      img.archiv-wiki-image-pick-hover { outline: 3px solid #c17d45 !important; outline-offset: 2px !important; }
    `;
    document.documentElement.appendChild(style);
    document.documentElement.classList.add('archiv-wiki-image-pick');

    const hint = document.createElement('div');
    hint.textContent = 'Archiv-Wiki: Bild anklicken · Esc zum Abbrechen';
    Object.assign(hint.style, {
      position: 'fixed',
      zIndex: '2147483647',
      top: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      maxWidth: 'min(680px, calc(100vw - 24px))',
      padding: '8px 12px',
      borderRadius: '6px',
      border: '1px solid #333333',
      background: '#171b21',
      color: '#e0e0e0',
      font: '13px/1.3 system-ui, sans-serif',
      boxShadow: '0 2px 10px rgba(0,0,0,.35)',
      pointerEvents: 'none',
      textAlign: 'center'
    });
    document.documentElement.appendChild(hint);

    let hovered = null;
    let active = true;
    let hintTimer = null;

    const closestImage = (target) => target instanceof Element ? target.closest('img') : null;

    function clearHover() {
      if (hovered) hovered.classList.remove('archiv-wiki-image-pick-hover');
      hovered = null;
    }

    function removeHintLater(delay) {
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => hint.remove(), delay);
    }

    function showResult(message, isError = false) {
      hint.textContent = `Archiv-Wiki: ${message}`;
      hint.style.borderColor = isError ? '#e2585a' : '#333333';
      hint.style.color = isError ? '#ffb3b4' : '#e0e0e0';
      removeHintLater(isError ? 6500 : 1800);
    }

    function cleanup({ keepHint = false } = {}) {
      if (!active) {
        if (!keepHint) hint.remove();
        return;
      }
      active = false;
      clearHover();
      document.documentElement.classList.remove('archiv-wiki-image-pick');
      style.remove();
      if (!keepHint) hint.remove();
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('pointerout', onPointerOut, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
      if (imagePickCleanup === cleanup) imagePickCleanup = null;
    }

    function onPointerOver(event) {
      const image = closestImage(event.target);
      if (!image || image === hovered) return;
      clearHover();
      hovered = image;
      image.classList.add('archiv-wiki-image-pick-hover');
    }

    function onPointerOut(event) {
      const image = closestImage(event.target);
      if (image && image === hovered && !image.contains(event.relatedTarget)) clearHover();
    }

    function onKeyDown(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      cleanup();
    }

    async function onClick(event) {
      const image = closestImage(event.target);
      if (!image) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const rect = image.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) {
        hint.textContent = 'Archiv-Wiki: Dieses Bild kann nicht erfasst werden.';
        return;
      }

      const payload = {
        imageUrl: String(image.currentSrc || image.src || ''),
        altText: String(image.alt || ''),
        rect: {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        },
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        pageTitle: String(document.title || ''),
        pageUrl: String(location.href || '')
      };

      cleanup({ keepHint: true });
      hint.textContent = 'Archiv-Wiki: Bild wird im Eingang gesammelt …';

      try {
        const response = await browserApi.runtime.sendMessage({ type: IMAGE_PICKED, payload });
        if (!response?.ok) {
          showResult(response?.error || 'Bild konnte nicht gespeichert werden.', true);
          return;
        }
        showResult('Bild im Eingang gesammelt.');
      } catch (error) {
        showResult(error?.message || 'Bild konnte nicht gespeichert werden. Versuche es erneut.', true);
      }
    }

    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    imagePickCleanup = cleanup;
  }

  browserApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === GET_SELECTION) {
      const selection = typeof window.getSelection === 'function'
        ? String(window.getSelection()?.toString() || '')
        : '';

      // Absichtlich keine Textbereinigung: Nur für die Leerprüfung wird später
      // trim() verwendet; gespeichert wird die Browser-Auswahl unverändert.
      sendResponse({ ok: true, text: selection });
      return false;
    }

    if (message?.type === GET_PAGE_TEXT) {
      // "Ganze Seite" sammelt bewusst nur den sichtbaren Textfluss der Seite.
      // HTML, Bilder, Styles oder ein DOM-Snapshot werden nicht übernommen.
      const pageText = String(document.body?.innerText ?? document.documentElement?.innerText ?? '');
      sendResponse({ ok: true, text: pageText });
      return false;
    }

    if (message?.type === START_IMAGE_PICK) {
      try {
        startImagePick();
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
      return false;
    }

    return false;
  });
})();
