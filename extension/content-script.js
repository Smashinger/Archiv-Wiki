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
  // webclip-contract.js wird von background.js unmittelbar vor dieser Datei
  // injiziert. Ohne den gemeinsamen Vertrag wird fail-closed abgebrochen,
  // statt eine zweite, möglicherweise abweichende Grenzdefinition zu führen.
  if (typeof ArchivWikiWebClip === 'undefined'
      || !Number.isFinite(ArchivWikiWebClip.MAX_EARLY_TEXT_BYTES)
      || typeof ArchivWikiWebClip.measureUtf8Bytes !== 'function') {
    throw new Error('Der Web-Clip-Datenvertrag ist nicht geladen.');
  }
  const { MAX_EARLY_TEXT_BYTES, measureUtf8Bytes } = ArchivWikiWebClip;

  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;

  let imagePickCleanup = null;

  // "Ganze Seite" darf niemals script-/style-/Vorlageninhalt zählen — diese
  // Elemente tragen auch bei document.body.innerText nie zum Ergebnis bei.
  const EXCLUDED_TEXT_ANCESTOR_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
  // innerText/Selection können zusätzlich zu DOM-Textknoten Strukturzeichen
  // wie Zeilenumbrüche oder Tabellen-Trenner erzeugen. Vier UTF-8-Bytes pro
  // beteiligtem Element sind absichtlich konservativ und verhindern, dass der
  // Preflight diese browserseitig ergänzten Zeichen systematisch unterschätzt.
  const MAX_STRUCTURAL_TEXT_OVERHEAD_BYTES_PER_ELEMENT = 4;

  function addTextBytesWithinLimit(text, totalBytes, maxBytes) {
    const measured = measureUtf8Bytes(text, Math.max(0, maxBytes - totalBytes));
    return {
      totalBytes: totalBytes + measured.bytes,
      exceeds: measured.exceeds || totalBytes + measured.bytes > maxBytes
    };
  }

  // Prüft die UTF-8-Größe des möglichen sichtbaren Seitentexts INKREMENTELL,
  // OHNE zuvor document.body.innerText (eine volle Kopie des Textflusses)
  // aufzurufen. CSS-versteckte Knoten werden bewusst mitgezählt; zusammen mit
  // dem Strukturaufschlag ist der Preflight absichtlich konservativ.
  function estimatedVisibleTextExceedsLimit(root, maxBytes) {
    if (!root) return false;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (node.nodeType === Node.ELEMENT_NODE && EXCLUDED_TEXT_ANCESTOR_TAGS.has(node.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let total = 0;
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        total += MAX_STRUCTURAL_TEXT_OVERHEAD_BYTES_PER_ELEMENT;
        if (total > maxBytes) return true;
        continue;
      }

      const measured = addTextBytesWithinLimit(node.nodeValue, total, maxBytes);
      if (measured.exceeds) return true;
      total = measured.totalBytes;
    }
    return false;
  }

  // Dasselbe Prinzip für eine Textauswahl: läuft über die Textknoten jedes
  // Selection-Bereichs, statt zuerst selection.toString() aufzurufen.
  function estimatedSelectionExceedsLimit(selection, maxBytes) {
    let total = 0;
    for (let i = 0; i < selection.rangeCount; i += 1) {
      const range = selection.getRangeAt(i);
      if (range.collapsed) continue;

      const container = range.commonAncestorContainer;
      if (container.nodeType === Node.TEXT_NODE) {
        const measured = addTextBytesWithinLimit(
          container.nodeValue.slice(range.startOffset, range.endOffset),
          total,
          maxBytes
        );
        if (measured.exceeds) return true;
        total = measured.totalBytes;
        continue;
      }

      const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => (range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
      });
      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          total += MAX_STRUCTURAL_TEXT_OVERHEAD_BYTES_PER_ELEMENT;
          if (total > maxBytes) return true;
          continue;
        }

        let value = node.nodeValue;
        if (node === range.startContainer) value = value.slice(range.startOffset);
        if (node === range.endContainer) value = value.slice(0, range.endOffset);

        const measured = addTextBytesWithinLimit(value, total, maxBytes);
        if (measured.exceeds) return true;
        total = measured.totalBytes;
      }
    }
    return false;
  }

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
      // Sicherheitsgrenze WC-SP-003/M16: nur ein echter Nutzerklick darf als
      // Bildauswahl zählen. event.isTrusted ist bei einem von der Seite selbst
      // per dispatchEvent()/element.click() erzeugten Ereignis immer false;
      // ein solches Ereignis wird hier vollständig ignoriert, statt es wie
      // eine bewusste Auswahl zu behandeln.
      if (!event.isTrusted) return;

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
      const selectionObj = typeof window.getSelection === 'function' ? window.getSelection() : null;
      if (selectionObj && estimatedSelectionExceedsLimit(selectionObj, MAX_EARLY_TEXT_BYTES)) {
        sendResponse({ ok: false, error: 'Die Textauswahl ist zu groß für einen Clip. Wähle einen kleineren Textbereich.' });
        return false;
      }
      const selection = selectionObj ? String(selectionObj.toString() || '') : '';
      if (measureUtf8Bytes(selection, MAX_EARLY_TEXT_BYTES).exceeds) {
        sendResponse({ ok: false, error: 'Die Textauswahl ist zu groß für einen Clip. Wähle einen kleineren Textbereich.' });
        return false;
      }

      // Absichtlich keine Textbereinigung: Nur für die Leerprüfung wird später
      // trim() verwendet; gespeichert wird die Browser-Auswahl unverändert.
      sendResponse({ ok: true, text: selection });
      return false;
    }

    if (message?.type === GET_PAGE_TEXT) {
      const root = document.body || document.documentElement;
      if (estimatedVisibleTextExceedsLimit(root, MAX_EARLY_TEXT_BYTES)) {
        sendResponse({ ok: false, error: 'Die Webseite enthält zu viel Text für einen Seiten-Clip. Wähle stattdessen eine kleinere Textauswahl.' });
        return false;
      }
      // "Ganze Seite" sammelt bewusst nur den sichtbaren Textfluss der Seite.
      // HTML, Bilder, Styles oder ein DOM-Snapshot werden nicht übernommen.
      const pageText = String(document.body?.innerText ?? document.documentElement?.innerText ?? '');
      if (measureUtf8Bytes(pageText, MAX_EARLY_TEXT_BYTES).exceeds) {
        sendResponse({ ok: false, error: 'Die Webseite enthält zu viel Text für einen Seiten-Clip. Wähle stattdessen eine kleinere Textauswahl.' });
        return false;
      }
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
