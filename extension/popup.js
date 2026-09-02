// extension/popup.js
// Auswahl der Sammelart und verständliche Rückmeldung für den aktuellen Clip.

'use strict';

const CAPTURE_CURRENT_PAGE = 'archiv-wiki:webclip:capture-current-page';
const browserApi = typeof browser !== 'undefined' ? browser : chrome;

const form = document.getElementById('clipForm');
const submitButton = document.getElementById('clipButton');
const statusElement = document.getElementById('clipStatus');

function selectedCaptureMode() {
  const checked = form?.querySelector('input[name="captureMode"]:checked');
  return checked?.value || 'selection';
}

function setStatus(message, state = '') {
  if (!statusElement) return;
  statusElement.textContent = message;
  if (state) statusElement.dataset.state = state;
  else delete statusElement.dataset.state;
}

function readableClipError(error) {
  const message = String(error?.message || error || '').trim();
  if (!message) return 'Clip konnte nicht gespeichert werden. Bitte versuche es erneut.';

  if (/receiving end does not exist|message port closed|extension context invalidated/i.test(message)) {
    return 'Der Web Clipper konnte nicht ausgeführt werden. Lade die Erweiterung neu und versuche es erneut.';
  }
  return message;
}

async function sendCurrentClip(captureMode) {
  let response;
  try {
    response = await browserApi.runtime.sendMessage({
      type: CAPTURE_CURRENT_PAGE,
      captureMode
    });
  } catch (error) {
    throw new Error(readableClipError(error));
  }

  if (!response?.ok) {
    throw new Error(response?.error || 'Webseite konnte nicht an Archiv-Wiki übergeben werden.');
  }

  return response;
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const captureMode = selectedCaptureMode();

  submitButton.disabled = true;
  setStatus('Wird im Eingang gesammelt …');

  try {
    const response = await sendCurrentClip(captureMode);
    if (response?.awaitingImageSelection) {
      setStatus('Bild auf der Webseite auswählen.');
      setTimeout(() => window.close(), 550);
      return;
    }
    setStatus('Im Eingang gesammelt.');
    setTimeout(() => window.close(), 450);
  } catch (error) {
    const message = readableClipError(error);
    console.error('[Archiv-Wiki Web Clipper]', message);
    setStatus(message, 'error');
    submitButton.disabled = false;
  }
});
