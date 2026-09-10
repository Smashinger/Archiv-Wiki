// test/webclip-browser-ipc.test.js
// Fokussierte Tests für die Anbindung der Browser-Erkennung und der dynamischen
// Aktionen im Einstellungsfenster (Web-Clipper Block 2 & Block 3).
// Laufen mit dem Node-Test-Runner (`node --test`), ohne zusätzliche Abhängigkeiten
// und ohne laufendes Electron.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { spawnSync } = require('child_process');

const {
  registerWebClipperDistributionIpc,
  prepareChromiumSystemWebClipper,
  getChromiumSystemStableCrxPath,
  getChromiumSystemRegistrationPath,
  CHROMIUM_EXTENSION_ID,
  CHROMIUM_EXTENSION_VERSION,
  CRX_FILENAME,
  inspectCrxFile
} = require('../main/webclip-distribution');

// ── Hilfsfunktionen für IPC- und Renderer-Mocks ───────────────────────────

function createMockIpcMain() {
  const handlers = new Map();
  return {
    handle: (channel, handler) => {
      if (handlers.has(channel)) {
        throw new Error(`Kanal bereits registriert: ${channel}`);
      }
      handlers.set(channel, handler);
    },
    getHandler: (channel) => handlers.get(channel),
    hasHandler: (channel) => handlers.has(channel),
    getChannels: () => Array.from(handlers.keys())
  };
}

// Lädt renderDetectedBrowsersHtml aus renderer/js/settings-window.js in isoliertem Kontext
function loadRenderDetectedBrowsersHtml() {
  const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', 'settings-window.js'), 'utf8');
  const match = settingsSource.match(/export function renderDetectedBrowsersHtml[\s\S]*?\n\}/);
  if (!match) throw new Error('renderDetectedBrowsersHtml konnte in settings-window.js nicht gefunden werden');

  const fnSource = match[0].replace('export ', '');
  const sandbox = {
    esc: (val) => String(val ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    block: (body) => `<div class="aws-block">${body}</div>`,
    row: (label, note, control) => `<div class="aws-row"><b>${sandbox.esc(label)}</b>${note ? `<span>${sandbox.esc(note)}</span>` : ''}<div>${control}</div></div>`,
    button2: (id, label) => `<button type="button" class="aws-btn2" id="${id}">${sandbox.esc(label)}</button>`,
    feedbackLine: (id) => `<p class="aws-feedback" id="${id}"></p>`,
    textAction: (id, label) => `<button type="button" class="aws-link" id="${id}">${sandbox.esc(label)}</button>`,
    renderDetectedBrowsersHtml: null
  };
  vm.runInNewContext(fnSource + '; renderDetectedBrowsersHtml = renderDetectedBrowsersHtml;', sandbox);
  return sandbox.renderDetectedBrowsersHtml;
}

// Lädt wireDetectedBrowserActions aus renderer/js/settings-window.js in isoliertem Kontext
function loadWireDetectedBrowserActions(customSandbox = {}) {
  const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', 'settings-window.js'), 'utf8');
  const match = settingsSource.match(/export function wireDetectedBrowserActions[\s\S]*?\n\}/);
  if (!match) throw new Error('wireDetectedBrowserActions konnte in settings-window.js nicht gefunden werden');

  const fnSource = match[0].replace('export ', '');
  const sandbox = {
    FIREFOX_AMO_URL: 'https://addons.mozilla.org/de/firefox/addon/archiv-wiki-web-clipper/',
    setFeedback: (el, id, msg, isError = false) => {
      const target = el.querySelector('#' + id);
      if (target) {
        target.textContent = msg || '';
        target.isError = isError;
      }
    },
    showConfirmDialog: async () => true,
    window: {
      open: () => {},
      archivAPI: {
        webClipper: {
          getBraveFlatpakPermissionStatus: async () => ({ supported: true, installed: true, granted: false }),
          grantBraveFlatpakPermission: async () => ({ success: true }),
          revokeBraveFlatpakPermission: async () => ({ success: true }),
          installBrave: async () => ({ prepared: true }),
          prepareChromiumSystem: async () => ({ prepared: true })
        }
      }
    },
    console,
    wireDetectedBrowserActions: null,
    ...customSandbox
  };
  vm.runInNewContext(fnSource + '; wireDetectedBrowserActions = wireDetectedBrowserActions;', sandbox);
  return { wireDetectedBrowserActions: sandbox.wireDetectedBrowserActions, sandbox };
}


// ════════════════════════════════════════════════════════════════════════════
// TEIL 1: IPC- und Preload-Basistests (Block 2)
// ════════════════════════════════════════════════════════════════════════════

test('1. registerWebClipperDistributionIpc registriert webclip:detectBrowsers', () => {
  const ipcMain = createMockIpcMain();
  registerWebClipperDistributionIpc({ ipcMain });
  assert.equal(ipcMain.hasHandler('webclip:detectBrowsers'), true, 'Kanal webclip:detectBrowsers muss registriert sein');
});

test('2. Der Handler ruft die injizierte Erkennungsfunktion genau einmal auf', async () => {
  const ipcMain = createMockIpcMain();
  let calls = 0;
  const mockDetect = async () => {
    calls++;
    return { platform: 'linux', supported: true, flatpakStatus: 'ok', browsers: [] };
  };

  registerWebClipperDistributionIpc({ ipcMain, detectBrowsers: mockDetect });
  const handler = ipcMain.getHandler('webclip:detectBrowsers');

  await handler();
  assert.equal(calls, 1, 'Erkennungsfunktion muss genau einmal aufgerufen werden');
});

test('3. Der Handler übergibt keine Rendererargumente an die Erkennungsfunktion', async () => {
  const ipcMain = createMockIpcMain();
  let receivedArgs = null;
  const mockDetect = async (...args) => {
    receivedArgs = args;
    return { platform: 'linux', supported: true, flatpakStatus: 'ok', browsers: [] };
  };

  registerWebClipperDistributionIpc({ ipcMain, detectBrowsers: mockDetect });
  const handler = ipcMain.getHandler('webclip:detectBrowsers');

  await handler({ sender: {} }, '/usr/bin/evil', '--flag', { dangerous: true });

  assert.ok(Array.isArray(receivedArgs), 'Erkennungsfunktion wurde aufgerufen');
  assert.equal(receivedArgs.length, 0, 'Keine Argumente dürfen an detectBrowsers weitergereicht werden');
});

test('4. Der Handler liefert den Erkennungsvertrag unverändert zurück', async () => {
  const contract = {
    platform: 'linux',
    supported: true,
    flatpakStatus: 'ok',
    browsers: [
      { id: 'brave', name: 'Brave', engine: 'chromium', installType: 'system', execPath: '/usr/bin/brave-browser' },
      { id: 'brave', name: 'Brave', engine: 'chromium', installType: 'flatpak', flatpakId: 'com.brave.Browser' }
    ]
  };

  const ipcMain = createMockIpcMain();
  registerWebClipperDistributionIpc({ ipcMain, detectBrowsers: async () => contract });
  const handler = ipcMain.getHandler('webclip:detectBrowsers');

  const result = await handler();
  assert.deepEqual(result, contract, 'Erkennungsvertrag muss unverändert durchgereicht werden');
});

test('5. Ein abgelehntes Erkennungs-Promise wird als Fehler weitergegeben und löst keine mutierende Aktion aus', async () => {
  const ipcMain = createMockIpcMain();
  const mockDetect = async () => {
    throw new Error('Erkennungsfehler simuliert');
  };

  registerWebClipperDistributionIpc({ ipcMain, detectBrowsers: mockDetect });
  const handler = ipcMain.getHandler('webclip:detectBrowsers');

  await assert.rejects(
    async () => handler(),
    /Erkennungsfehler simuliert/,
    'Fehler muss nach oben durchschlagen'
  );
});

test('6. Die vorhandenen Web-Clipper-Kanäle werden weiterhin vollständig registriert', () => {
  const ipcMain = createMockIpcMain();
  registerWebClipperDistributionIpc({ ipcMain });

  const channels = ipcMain.getChannels();
  const expectedChannels = [
    'webclip:installBrave',
    'webclip:prepareChromiumSystem',
    'webclip:getBraveFlatpakPermissionStatus',
    'webclip:grantBraveFlatpakPermission',
    'webclip:revokeBraveFlatpakPermission',
    'webclip:detectBrowsers'
  ];

  for (const channel of expectedChannels) {
    assert.ok(channels.includes(channel), `Kanal ${channel} muss registriert sein`);
  }
  assert.equal(channels.length, expectedChannels.length, 'Genau die 6 erwarteten Kanäle registriert');
});

test('7. preload.js exponiert genau die benannte Methode unter webClipper.detectBrowsers', () => {
  const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');

  assert.match(
    preloadSource,
    /detectBrowsers:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('webclip:detectBrowsers'\)/,
    'detectBrowsers muss genau so in preload.js definiert sein'
  );
});

test('8. Die Preload-Methode verwendet ausschließlich ipcRenderer.invoke ohne Argumente', () => {
  const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');

  const match = preloadSource.match(/detectBrowsers:\s*(\([^)]*\))\s*=>\s*ipcRenderer\.invoke\(([^)]+)\)/);
  assert.ok(match, 'detectBrowsers-Muster muss matchen');
  assert.equal(match[1].trim(), '()', 'Pfeilfunktion darf keine Parameter annehmen');
  assert.equal(match[2].trim(), "'webclip:detectBrowsers'", 'invoke darf nur den festen Kanalnamen übergeben');
});

test('9. Es entsteht kein generischer IPC-Zugriff in preload.js', () => {
  const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');

  assert.doesNotMatch(preloadSource, /invoke:\s*\(channel/, 'Kein generischer invoke(channel)');
  assert.doesNotMatch(preloadSource, /ipcRenderer\.invoke\(channel/, 'Kein ipcRenderer.invoke mit dynamischem Kanal');
  assert.doesNotMatch(preloadSource, /ipcRenderer\.send\(channel/, 'Kein ipcRenderer.send mit dynamischem Kanal');
});

test('10. Der Renderer verwendet den vorhandenen Lifecycle-Schutz für die DOM-Aktualisierung', () => {
  const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', 'settings-window.js'), 'utf8');

  assert.match(
    settingsSource,
    /getDetectedBrowsers\(\)[\s\S]*?\.then\(\(result\)\s*=>\s*\{[\s\S]*?if\s*\(!lifecycle\.isCurrent\(\)\)\s*return;/
  );
  assert.match(
    settingsSource,
    /\.catch\(\(error\)\s*=>\s*\{[\s\S]*?if\s*\(!lifecycle\.isCurrent\(\)\)\s*return;/
  );
});

test('11. Der Erkennungsabruf wird innerhalb einer Einstellungsfenster-Lebensdauer gecacht', async () => {
  const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', 'settings-window.js'), 'utf8');

  assert.match(
    settingsSource,
    /let\s+detectedBrowsersPromise\s*=\s*null;/,
    'detectedBrowsersPromise muss als lokale Variable existieren'
  );

  let apiCalls = 0;
  const mockApi = {
    detectBrowsers: async () => {
      apiCalls++;
      return { platform: 'linux', supported: true, flatpakStatus: 'ok', browsers: [] };
    }
  };

  let detectedBrowsersPromise = null;
  function getDetectedBrowsers() {
    if (!detectedBrowsersPromise) {
      detectedBrowsersPromise = Promise.resolve().then(() => mockApi.detectBrowsers());
    }
    return detectedBrowsersPromise;
  }

  const p1 = getDetectedBrowsers();
  const p2 = getDetectedBrowsers();
  const p3 = getDetectedBrowsers();

  assert.equal(p1, p2, 'Zweiter Aufruf muss denselben Promise zurückgeben');
  assert.equal(p2, p3, 'Dritter Aufruf muss denselben Promise zurückgeben');

  await Promise.all([p1, p2, p3]);
  assert.equal(apiCalls, 1, 'Die Erkennung darf innerhalb der Fenster-Lebensdauer nur genau einmal aufgerufen werden');
});


// ════════════════════════════════════════════════════════════════════════════
// TEIL 2: Block 3 – Browser-Aktionsmatrix und Sicherheitsanforderungen (1–20)
// ════════════════════════════════════════════════════════════════════════════

// 1. Firefox system: Offizielle AMO-Aktion
test('B3-01. Firefox system erhält die feste AMO-Aktion', () => {
  const render = loadRenderDetectedBrowsersHtml();
  const html = render({
    result: {
      platform: 'linux',
      supported: true,
      flatpakStatus: 'ok',
      browsers: [{ id: 'firefox', name: 'Mozilla Firefox', installType: 'system' }]
    }
  });

  assert.ok(html.includes('Mozilla Firefox'), 'Browsername muss angezeigt werden');
  assert.ok(html.includes('Systeminstallation erkannt'), 'Installationsart muss angezeigt werden');
  assert.ok(html.includes('stOpenFirefoxAmo'), 'AMO-Button muss vorhanden sein');
  assert.ok(html.includes('Installieren'), 'Buttonbeschriftung muss Installieren sein');
  assert.ok(html.includes('Öffnet die Erweiterung bei Mozilla Add-ons.'), 'Erklärung muss vorhanden sein');
  assert.ok(!html.includes('stInstallBraveWebClipper'), 'Kein Brave-Button');
  assert.ok(!html.includes('Einrichtung für diese Installationsart noch nicht verfügbar.'), 'Kein Nicht-verfügbar-Hinweis');
});

// 2. Firefox Flatpak: Keine Einrichtungsaktion
test('B3-02. Firefox Flatpak erhält keine Einrichtungsaktion', () => {
  const render = loadRenderDetectedBrowsersHtml();
  const html = render({
    result: {
      platform: 'linux',
      supported: true,
      flatpakStatus: 'ok',
      browsers: [{ id: 'firefox', name: 'Mozilla Firefox', installType: 'flatpak' }]
    }
  });

  assert.ok(html.includes('Mozilla Firefox'));
  assert.ok(html.includes('Flatpak erkannt'));
  assert.ok(html.includes('Einrichtung für diese Installationsart noch nicht verfügbar.'));
  assert.ok(!html.includes('stOpenFirefoxAmo'), 'Kein AMO-Button');
  assert.ok(!html.includes('stInstallBraveWebClipper'), 'Kein Brave-Button');
});

// 3. Brave Flatpak: Vorbereiten-Aktion und Berechtigungs-UI
test('B3-03. Brave Flatpak erhält die bestehende Vorbereiten-Aktion und Berechtigungs-UI', () => {
  const render = loadRenderDetectedBrowsersHtml();
  const html = render({
    result: {
      platform: 'linux',
      supported: true,
      flatpakStatus: 'ok',
      browsers: [{ id: 'brave', name: 'Brave Browser', installType: 'flatpak' }]
    }
  });

  assert.ok(html.includes('Brave Browser'));
  assert.ok(html.includes('Flatpak erkannt'));
  assert.ok(html.includes('stInstallBraveWebClipper'), 'Vorbereiten-Button muss existieren');
  assert.ok(html.includes('Vorbereiten'));
  assert.ok(html.includes('stBraveFeedback'), 'Feedback-Element muss existieren');
  assert.ok(html.includes('stRevokeBraveFlatpakPermission'), 'Revoke-Aktion muss existieren');
  assert.ok(html.includes('Bereitet die mitgelieferte Erweiterung ohne Entwicklermodus vor.'));
  assert.ok(!html.includes('stOpenFirefoxAmo'));
  assert.ok(!html.includes('Einrichtung für diese Installationsart noch nicht verfügbar.'));
});

// 4. Brave system: Keine Einrichtungsaktion
test('B3-04. Brave system erhält keine Einrichtungsaktion', () => {
  const render = loadRenderDetectedBrowsersHtml();
  const html = render({
    result: {
      platform: 'linux',
      supported: true,
      flatpakStatus: 'ok',
      browsers: [{ id: 'brave', name: 'Brave Browser', installType: 'system' }]
    }
  });

  assert.ok(html.includes('Brave Browser'));
  assert.ok(html.includes('Systeminstallation erkannt'));
  assert.ok(html.includes('Einrichtung für diese Installationsart noch nicht verfügbar.'));
  assert.ok(!html.includes('stInstallBraveWebClipper'), 'Kein Brave-Button');
  assert.ok(!html.includes('stOpenFirefoxAmo'));
});

// 5. Chromium system: Vorbereiten-Aktion
test('B3-05. Chromium system erhält die Vorbereiten-Aktion', () => {
  const render = loadRenderDetectedBrowsersHtml();
  const html = render({
    result: {
      platform: 'linux',
      supported: true,
      flatpakStatus: 'ok',
      browsers: [{ id: 'chromium', name: 'Chromium', installType: 'system' }]
    }
  });

  assert.ok(html.includes('Chromium'));
  assert.ok(html.includes('Systeminstallation erkannt'));
  assert.ok(html.includes('stPrepareChromiumSystemWebClipper'), 'Chromium-Vorbereiten-Button muss existieren');
  assert.ok(html.includes('Vorbereiten'));
  assert.ok(html.includes('stChromiumSystemFeedback'), 'Chromium-Feedback-Element muss existieren');
  assert.ok(html.includes('Bereitet die mitgelieferte Erweiterung ohne Entwicklermodus vor. Wirkt nach einem vollständigen Neustart von Chromium.'));
  assert.ok(!html.includes('stInstallBraveWebClipper'));
  assert.ok(!html.includes('stOpenFirefoxAmo'));
  assert.ok(!html.includes('Einrichtung für diese Installationsart noch nicht verfügbar.'));
});

// 6. Chromium Flatpak: Keine Einrichtungsaktion
test('B3-06. Chromium Flatpak erhält keine Einrichtungsaktion', () => {
  const render = loadRenderDetectedBrowsersHtml();
  const html = render({
    result: {
      platform: 'linux',
      supported: true,
      flatpakStatus: 'ok',
      browsers: [{ id: 'chromium', name: 'Chromium', installType: 'flatpak' }]
    }
  });

  assert.ok(html.includes('Chromium'));
  assert.ok(html.includes('Flatpak erkannt'));
  assert.ok(html.includes('Einrichtung für diese Installationsart noch nicht verfügbar.'));
  assert.ok(!html.includes('stInstallBraveWebClipper'));
  assert.ok(!html.includes('stOpenFirefoxAmo'));
});

// 7. Google Chrome system: Keine Einrichtungsaktion
test('B3-07. Google Chrome system erhält keine Einrichtungsaktion', () => {
  const render = loadRenderDetectedBrowsersHtml();
  const html = render({
    result: {
      platform: 'linux',
      supported: true,
      flatpakStatus: 'ok',
      browsers: [{ id: 'google-chrome', name: 'Google Chrome', installType: 'system' }]
    }
  });

  assert.ok(html.includes('Google Chrome'));
  assert.ok(html.includes('Systeminstallation erkannt'));
  assert.ok(html.includes('Einrichtung für diese Installationsart noch nicht verfügbar.'));
  assert.ok(!html.includes('stInstallBraveWebClipper'));
  assert.ok(!html.includes('stOpenFirefoxAmo'));
});

// 8. Google Chrome Flatpak: Keine Einrichtungsaktion
test('B3-08. Google Chrome Flatpak erhält keine Einrichtungsaktion', () => {
  const render = loadRenderDetectedBrowsersHtml();
  const html = render({
    result: {
      platform: 'linux',
      supported: true,
      flatpakStatus: 'ok',
      browsers: [{ id: 'google-chrome', name: 'Google Chrome', installType: 'flatpak' }]
    }
  });

  assert.ok(html.includes('Google Chrome'));
  assert.ok(html.includes('Flatpak erkannt'));
  assert.ok(html.includes('Einrichtung für diese Installationsart noch nicht verfügbar.'));
  assert.ok(!html.includes('stInstallBraveWebClipper'));
  assert.ok(!html.includes('stOpenFirefoxAmo'));
});

// 9. Vivaldi system: Vivaldi support was removed — falls back to "not available"
test('B3-09. Vivaldi system erhält keine Einrichtungsaktion mehr (Support entfernt)', () => {
  const render = loadRenderDetectedBrowsersHtml();
  const html = render({
    result: {
      platform: 'linux',
      supported: true,
      flatpakStatus: 'ok',
      browsers: [{ id: 'vivaldi', name: 'Vivaldi', installType: 'system' }]
    }
  });

  assert.ok(html.includes('Vivaldi'));
  assert.ok(html.includes('Einrichtung für diese Installationsart noch nicht verfügbar.'));
  assert.ok(!html.includes('stPrepareVivaldiSystemWebClipper'));
  assert.ok(!html.includes('stInstallBraveWebClipper'));
  assert.ok(!html.includes('stOpenFirefoxAmo'));
});

// 10. Vivaldi Flatpak: Vivaldi support was removed — falls back to "not available"
test('B3-10. Vivaldi Flatpak erhält keine Einrichtungsaktion mehr (Support entfernt)', () => {
  const render = loadRenderDetectedBrowsersHtml();
  const html = render({
    result: {
      platform: 'linux',
      supported: true,
      flatpakStatus: 'ok',
      browsers: [{ id: 'vivaldi', name: 'Vivaldi', installType: 'flatpak' }]
    }
  });

  assert.ok(html.includes('Vivaldi'));
  assert.ok(html.includes('Einrichtung für diese Installationsart noch nicht verfügbar.'));
  assert.ok(!html.includes('stInstallVivaldiFlatpakWebClipper'));
  assert.ok(!html.includes('stOpenFirefoxAmo'));
});

// 11. Engine “chromium” alone never enables Brave action
test('B3-11. Browser-Engine "chromium" allein aktiviert niemals die Brave-Aktion', () => {
  const render = loadRenderDetectedBrowsersHtml();
  const html = render({
    result: {
      platform: 'linux',
      supported: true,
      flatpakStatus: 'ok',
      browsers: [{ id: 'other-browser', name: 'Other Browser', engine: 'chromium', installType: 'flatpak' }]
    }
  });

  assert.ok(html.includes('Other Browser'));
  assert.ok(html.includes('Flatpak erkannt'));
  assert.ok(html.includes('Einrichtung für diese Installationsart noch nicht verfügbar.'));
  assert.ok(!html.includes('stInstallBraveWebClipper'), 'Kein Brave-Button für fremde Chromium-Browser');
  assert.ok(!html.includes('Vorbereiten'));
});

// 12. Mixed detection results produce exactly correct actions
test('B3-12. Gemischte Erkennungsergebnisse erzeugen exakt die passenden Aktionen', () => {
  const render = loadRenderDetectedBrowsersHtml();
  const html = render({
    result: {
      platform: 'linux',
      supported: true,
      flatpakStatus: 'ok',
      browsers: [
        { id: 'firefox', name: 'Firefox System', installType: 'system' },
        { id: 'firefox', name: 'Firefox Flatpak', installType: 'flatpak' },
        { id: 'brave', name: 'Brave Flatpak', installType: 'flatpak' },
        { id: 'brave', name: 'Brave System', installType: 'system' },
        { id: 'chromium', name: 'Chromium', installType: 'system' }
      ]
    }
  });

  assert.ok(html.includes('Firefox System'));
  assert.ok(html.includes('stOpenFirefoxAmo'));
  assert.ok(html.includes('Brave Flatpak'));
  assert.ok(html.includes('stInstallBraveWebClipper'));
  assert.ok(html.includes('Chromium'));
  assert.ok(html.includes('stPrepareChromiumSystemWebClipper'));
  assert.ok(html.includes('Firefox Flatpak'));
  assert.ok(html.includes('Brave System'));

  // Genau 1x Firefox-Aktion, 1x Brave-Aktion und 1x Chromium-Aktion
  assert.equal(html.split('stOpenFirefoxAmo').length - 1, 1);
  assert.equal(html.split('stInstallBraveWebClipper').length - 1, 1);
  assert.equal(html.split('stPrepareChromiumSystemWebClipper').length - 1, 1);
  // Genau 2x Hinweis auf Nichtverfügbarkeit (Firefox Flatpak, Brave System)
  assert.equal(html.split('Einrichtung für diese Installationsart noch nicht verfügbar.').length - 1, 2);
});

// 13. Duplicate rendering or status updates do not accumulate action handlers
test('B3-13. Mehrfaches Rendern oder Verdrahten akkumuliert keine doppelten Event-Handler', async () => {
  function createMockElement(id) {
    const listeners = new Map();
    return {
      id,
      disabled: false,
      hidden: false,
      textContent: '',
      _listeners: listeners,
      addEventListener(event, fn) {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event).push(fn);
      },
      click() {
        for (const fn of listeners.get('click') || []) fn({ currentTarget: this });
      }
    };
  }

  const amoButton = createMockElement('stOpenFirefoxAmo');
  const braveButton = createMockElement('stInstallBraveWebClipper');
  const revokeWrap = createMockElement('stRevokeBraveWrap');
  const revokeAction = createMockElement('stRevokeBraveFlatpakPermission');
  const feedback = createMockElement('stBraveFeedback');

  const container = {
    elements: {
      '#stOpenFirefoxAmo': amoButton,
      '#stInstallBraveWebClipper': braveButton,
      '#stRevokeBraveWrap': revokeWrap,
      '#stRevokeBraveFlatpakPermission': revokeAction,
      '#stBraveFeedback': feedback
    },
    querySelector(sel) {
      return this.elements[sel] || null;
    }
  };

  let openCalls = 0;
  const { wireDetectedBrowserActions } = loadWireDetectedBrowserActions({
    window: {
      open: () => { openCalls++; },
      archivAPI: {
        webClipper: {
          getBraveFlatpakPermissionStatus: async () => ({ supported: true, installed: true, granted: false }),
          grantBraveFlatpakPermission: async () => ({ success: true }),
          revokeBraveFlatpakPermission: async () => ({ success: true }),
          installBrave: async () => ({ prepared: true })
        }
      }
    }
  });

  const lifecycle = { isCurrent: () => true };

  // Erste Verdrahtung
  wireDetectedBrowserActions(container, lifecycle);
  assert.equal(amoButton._listeners.get('click')?.length, 1, 'AMO-Button hat genau einen Listener');
  assert.equal(braveButton._listeners.get('click')?.length, 1, 'Brave-Button hat genau einen Listener');
  assert.equal(revokeAction._listeners.get('click')?.length, 1, 'Revoke-Action hat genau einen Listener');

  // Zweite Verdrahtung auf demselben Container (z. B. Status-Update ohne DOM-Neubau)
  wireDetectedBrowserActions(container, lifecycle);
  assert.equal(amoButton._listeners.get('click')?.length, 1, 'AMO-Button akkumuliert keine weiteren Listener');
  assert.equal(braveButton._listeners.get('click')?.length, 1, 'Brave-Button akkumuliert keine weiteren Listener');
  assert.equal(revokeAction._listeners.get('click')?.length, 1, 'Revoke-Action akkumuliert keine weiteren Listener');

  // Klick testen: wird genau 1x ausgeführt
  amoButton.click();
  assert.equal(openCalls, 1, 'window.open wurde genau einmal aufgerufen');
});

// 14. Browser names remain HTML-escaped
test('B3-14. Dynamische Browsernamen bleiben vor HTML-Ausgabe geschützt und escaped', () => {
  const render = loadRenderDetectedBrowsersHtml();
  const dangerousBrowser = {
    id: 'custom',
    name: '<script>alert("xss")</script> & "Brave"',
    installType: 'system'
  };

  const html = render({
    result: {
      platform: 'linux',
      supported: true,
      flatpakStatus: 'ok',
      browsers: [dangerousBrowser]
    }
  });

  assert.doesNotMatch(html, /<script>/, 'Darf kein rohes <script> enthalten');
  assert.ok(html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &quot;Brave&quot;'));
});

// 15. Loading, error, non-Linux, empty, Flatpak-unavailable, and Flatpak-failed states remain correct
test('B3-15. Alle Zustände (Laden, Fehler, Nicht-Linux, Leer, Flatpak-Status) bleiben sachlich korrekt', () => {
  const render = loadRenderDetectedBrowsersHtml();

  // Zustand 0: Ladezustand
  assert.ok(render({ loading: true }).includes('Browser werden erkannt …'));

  // Zustand 1: Fehler
  assert.ok(render({ error: new Error('fail') }).includes('Browser konnten nicht erkannt werden.'));

  // Zustand 2: Nicht-Linux
  assert.ok(render({ result: { platform: 'win32', supported: false, flatpakStatus: null, browsers: [] } })
    .includes('Die automatische Browser-Erkennung ist derzeit nur unter Linux verfügbar.'));

  // Zustand 3: Keine Browser erkannt, Flatpak ok
  assert.ok(render({ result: { platform: 'linux', supported: true, flatpakStatus: 'ok', browsers: [] } })
    .includes('Keine bekannten Browserinstallationen erkannt.'));

  // Zustand 4: Flatpak nicht verfügbar
  assert.ok(render({ result: { platform: 'linux', supported: true, flatpakStatus: 'unavailable', browsers: [] } })
    .includes('Keine bekannten Systembrowser erkannt. Flatpak ist nicht verfügbar.'));

  // Zustand 5: Flatpak fehlgeschlagen (leer)
  assert.ok(render({ result: { platform: 'linux', supported: true, flatpakStatus: 'failed', browsers: [] } })
    .includes('Flatpak-Installationen konnten nicht geprüft werden.'));

  // Zustand 6: Flatpak fehlgeschlagen mit Systembrowser
  const withSystem = render({
    result: {
      platform: 'linux',
      supported: true,
      flatpakStatus: 'failed',
      browsers: [{ id: 'chromium', name: 'Chromium', installType: 'system' }]
    }
  });
  assert.ok(withSystem.includes('Chromium'));
  assert.ok(withSystem.includes('Flatpak-Installationen konnten nicht geprüft werden.'));
});

// 16. Firefox action uses only the existing fixed URL
test('B3-16. Die Firefox-Aktion verwendet ausschließlich die feste offizielle AMO-URL', () => {
  const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', 'settings-window.js'), 'utf8');

  assert.match(
    settingsSource,
    /const\s+FIREFOX_AMO_URL\s*=\s*'https:\/\/addons\.mozilla\.org\/de\/firefox\/addon\/archiv-wiki-web-clipper\/'/
  );

  let openedUrl = null;
  let openedTarget = null;
  const amoButton = {
    id: 'stOpenFirefoxAmo',
    _listeners: new Map(),
    addEventListener(event, fn) {
      if (!this._listeners.has(event)) this._listeners.set(event, []);
      this._listeners.get(event).push(fn);
    },
    click() {
      for (const fn of this._listeners.get('click') || []) fn({ currentTarget: this });
    }
  };

  const container = {
    querySelector: (sel) => sel === '#stOpenFirefoxAmo' ? amoButton : null
  };

  const { wireDetectedBrowserActions } = loadWireDetectedBrowserActions({
    window: {
      open: (url, target) => {
        openedUrl = url;
        openedTarget = target;
      }
    }
  });

  wireDetectedBrowserActions(container, { isCurrent: () => true });
  amoButton.click();

  assert.equal(openedUrl, 'https://addons.mozilla.org/de/firefox/addon/archiv-wiki-web-clipper/');
  assert.equal(openedTarget, '_blank');
});

// 17. Brave action uses only existing fixed preload methods
test('B3-17. Die Brave-Aktion verwendet ausschließlich die bestehenden festen Preload-Methoden', async () => {
  const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', 'settings-window.js'), 'utf8');

  assert.ok(settingsSource.includes('window.archivAPI?.webClipper?.getBraveFlatpakPermissionStatus?.()'));
  assert.ok(settingsSource.includes('window.archivAPI?.webClipper?.grantBraveFlatpakPermission?.()'));
  assert.ok(settingsSource.includes('window.archivAPI?.webClipper?.revokeBraveFlatpakPermission?.()'));
  assert.ok(settingsSource.includes('window.archivAPI?.webClipper?.installBrave?.()'));

  assert.doesNotMatch(settingsSource, /webClipper\[/);

  const calls = [];
  const braveButton = {
    id: 'stInstallBraveWebClipper',
    disabled: false,
    textContent: '',
    _listeners: new Map(),
    addEventListener(e, fn) { (this._listeners.get(e) || (this._listeners.set(e, []), this._listeners.get(e))).push(fn); },
    click() {
      const fns = this._listeners.get('click') || [];
      return Promise.all(fns.map(fn => fn({ currentTarget: this })));
    }
  };
  const revokeWrap = { id: 'stRevokeBraveWrap', hidden: true };
  const revokeAction = {
    id: 'stRevokeBraveFlatpakPermission',
    disabled: false,
    _listeners: new Map(),
    addEventListener(e, fn) { (this._listeners.get(e) || (this._listeners.set(e, []), this._listeners.get(e))).push(fn); },
    click() {
      const fns = this._listeners.get('click') || [];
      return Promise.all(fns.map(fn => fn({ currentTarget: this })));
    }
  };
  const feedback = { id: 'stBraveFeedback', textContent: '' };

  const container = {
    elements: {
      '#stInstallBraveWebClipper': braveButton,
      '#stRevokeBraveWrap': revokeWrap,
      '#stRevokeBraveFlatpakPermission': revokeAction,
      '#stBraveFeedback': feedback
    },
    querySelector(sel) { return this.elements[sel] || null; }
  };

  const { wireDetectedBrowserActions } = loadWireDetectedBrowserActions({
    showConfirmDialog: async () => {
      calls.push('confirmDialog');
      return true;
    },
    window: {
      archivAPI: {
        webClipper: {
          getBraveFlatpakPermissionStatus: async () => {
            calls.push('getStatus');
            return { supported: true, installed: true, granted: false };
          },
          grantBraveFlatpakPermission: async () => {
            calls.push('grantPermission');
            return { success: true };
          },
          revokeBraveFlatpakPermission: async () => {
            calls.push('revokePermission');
            return { success: true };
          },
          installBrave: async () => {
            calls.push('installBrave');
            return { prepared: true };
          }
        }
      }
    }
  });

  wireDetectedBrowserActions(container, { isCurrent: () => true });

  await new Promise(resolve => setImmediate(resolve));
  assert.ok(calls.includes('getStatus'), 'Initialer Statusabruf');

  await braveButton.click();
  assert.ok(calls.includes('confirmDialog'), 'Consent-Dialog muss aufgerufen werden');
  assert.ok(calls.includes('grantPermission'), 'Berechtigung wird erteilt');
  assert.ok(calls.includes('installBrave'), 'Brave-Installation wird vorbereitet');
  assert.equal(feedback.textContent, 'Vorbereitet. Brave vollständig schließen und neu starten.');

  await revokeAction.click();
  assert.ok(calls.includes('revokePermission'), 'Berechtigung wird widerrufen');
});

// 18. No renderer-controlled IPC channel or command introduced
test('B3-18. Kein vom Renderer gesteuerter IPC-Kanal oder Shell-Befehl wird eingeführt', () => {
  const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', 'settings-window.js'), 'utf8');

  assert.doesNotMatch(settingsSource, /ipcRenderer/);
  assert.doesNotMatch(settingsSource, /child_process|exec\(|spawn\(/);
});

// 19. Existing browser-detection and distribution channels remain intact
test('B3-19. Bestehende Erkennungs- und IPC-Verträge bleiben erhalten', () => {
  const distSource = fs.readFileSync(path.join(__dirname, '..', 'main', 'webclip-distribution.js'), 'utf8');
  assert.ok(distSource.includes('webclip:detectBrowsers'));
  assert.ok(distSource.includes('webclip:installBrave'));
  assert.ok(distSource.includes('webclip:getBraveFlatpakPermissionStatus'));
  assert.ok(distSource.includes('webclip:grantBraveFlatpakPermission'));
  assert.ok(distSource.includes('webclip:revokeBraveFlatpakPermission'));
});

// 20. Old unconditional generic action presentation is gone
test('B3-20. Die alten bedingungslosen generischen Setup-Aktionen sind aus dem statischen Template entfernt', () => {
  const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', 'settings-window.js'), 'utf8');

  // Keine statische 'Erkannte Browser'-Gruppe mehr neben 'Browser-Erweiterung'
  assert.doesNotMatch(settingsSource, /group\('Erkannte Browser'/);

  // In renderWebClipperSection dürfen die Firefox- und Brave-Buttons nicht mehr statisch in 'Browser-Erweiterung' stehen
  const clipperFnMatch = settingsSource.match(/async function renderWebClipperSection[\s\S]*?\n\}/);
  assert.ok(clipperFnMatch, 'renderWebClipperSection muss gefunden werden');
  const clipperFn = clipperFnMatch[0];

  assert.doesNotMatch(clipperFn, /row\('Firefox'/);
  assert.doesNotMatch(clipperFn, /row\('Brave \/ Chromium'/);
  assert.ok(clipperFn.includes("group('Browser-Erweiterung',"));
  assert.ok(clipperFn.includes('<div id="stDetectedBrowsers">'));
});


// ════════════════════════════════════════════════════════════════════════════
// TEIL 3: Chromium System-Vorbereitung (Web-Clipper Block 4, Anforderungen 1–25)
// ════════════════════════════════════════════════════════════════════════════

function createTempDir(prefix = 'aw-chrom-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// 1. Linux system-Chromium preparation succeeds.
test('B4-01. Linux system-Chromium preparation succeeds', () => {
  const tempHome = createTempDir('b4-01-');
  try {
    const result = prepareChromiumSystemWebClipper({
      homePath: tempHome,
      platform: 'linux',
      isPackaged: false,
      env: {}
    });

    assert.equal(result.prepared, true);
    assert.equal(result.browser, 'chromium-system');
    assert.equal(result.extensionId, CHROMIUM_EXTENSION_ID);
    assert.equal(result.extensionVersion, CHROMIUM_EXTENSION_VERSION);
    assert.equal(result.browserRestartRequired, true);
    assert.equal(result.crxUpdated, true);
    assert.ok(result.crxSha256);
    assert.equal(result.crxPath, path.join(tempHome, '.local', 'share', 'archiv-wiki', 'web-clipper', 'chromium', CRX_FILENAME));
    assert.equal(result.registrationPath, path.join(tempHome, '.config', 'chromium', 'External Extensions', `${CHROMIUM_EXTENSION_ID}.json`));

    assert.ok(fs.existsSync(result.crxPath), 'Stable CRX must exist');
    assert.equal(fs.statSync(result.crxPath).mode & 0o777, 0o644, 'CRX permissions must be 0644');
    assert.ok(fs.existsSync(result.registrationPath), 'Registration file must exist');
    assert.equal(fs.statSync(result.registrationPath).mode & 0o777, 0o644, 'Registration file permissions must be 0644');
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

// 2. Non-Linux platforms are rejected before persistent writes.
test('B4-02. Non-Linux platforms are rejected before persistent writes', () => {
  const tempHome = createTempDir('b4-02-');
  try {
    assert.throws(
      () => prepareChromiumSystemWebClipper({
        homePath: tempHome,
        platform: 'win32',
        isPackaged: false,
        env: {}
      }),
      /ausschließlich Linux/
    );
    assert.equal(fs.readdirSync(tempHome).length, 0, 'No files or directories should be created on non-Linux');
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

// 3. The existing full CRX validation runs before persistent writes.
test('B4-03. The existing full CRX validation runs before persistent writes', () => {
  const tempHome = createTempDir('b4-03-home-');
  const tempRes = createTempDir('b4-03-res-');
  try {
    const invalidCrxDir = path.join(tempRes, 'web-clipper', 'chromium');
    fs.mkdirSync(invalidCrxDir, { recursive: true });
    fs.writeFileSync(path.join(invalidCrxDir, CRX_FILENAME), 'NOT_A_VALID_CRX_FILE');

    assert.throws(
      () => prepareChromiumSystemWebClipper({
        resourcesPath: tempRes,
        homePath: tempHome,
        platform: 'linux',
        isPackaged: true,
        env: {}
      }),
      /CRX/
    );
    assert.equal(fs.readdirSync(tempHome).length, 0, 'No persistent writes on invalid CRX');
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(tempRes, { recursive: true, force: true });
  }
});

// 4. Invalid CRX input leaves no registration file.
test('B4-04. Invalid CRX input leaves no registration file', () => {
  const tempHome = createTempDir('b4-04-home-');
  const tempRes = createTempDir('b4-04-res-');
  try {
    const invalidCrxDir = path.join(tempRes, 'web-clipper', 'chromium');
    fs.mkdirSync(invalidCrxDir, { recursive: true });
    // Cr24 header but truncated
    fs.writeFileSync(path.join(invalidCrxDir, CRX_FILENAME), Buffer.from('Cr24\x03\x00\x00\x00\x00\x00\x00\x00', 'binary'));

    assert.throws(
      () => prepareChromiumSystemWebClipper({
        resourcesPath: tempRes,
        homePath: tempHome,
        platform: 'linux',
        isPackaged: true,
        env: {}
      }),
      /CRX/
    );
    const regPath = getChromiumSystemRegistrationPath({ homePath: tempHome, env: {} });
    assert.equal(fs.existsSync(regPath), false, 'Registration file must not exist');
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(tempRes, { recursive: true, force: true });
  }
});

// 5. The stable CRX path uses absolute XDG_DATA_HOME when supplied.
test('B4-05. The stable CRX path uses absolute XDG_DATA_HOME when supplied', () => {
  const tempDir = createTempDir('b4-05-');
  try {
    const customData = path.join(tempDir, 'custom-data');
    const resultPath = getChromiumSystemStableCrxPath({
      homePath: path.join(tempDir, 'fallback-home'),
      env: { XDG_DATA_HOME: customData }
    });
    assert.equal(resultPath, path.join(customData, 'archiv-wiki', 'web-clipper', 'chromium', CRX_FILENAME));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// 6. Missing or relative XDG_DATA_HOME falls back safely under absolute homePath.
test('B4-06. Missing or relative XDG_DATA_HOME falls back safely under absolute homePath', () => {
  const tempDir = createTempDir('b4-06-');
  try {
    const absHome = path.join(tempDir, 'abs-home');
    const expected = path.join(absHome, '.local', 'share', 'archiv-wiki', 'web-clipper', 'chromium', CRX_FILENAME);

    // Relative XDG_DATA_HOME
    assert.equal(getChromiumSystemStableCrxPath({ homePath: absHome, env: { XDG_DATA_HOME: 'relative/path' } }), expected);
    // Empty XDG_DATA_HOME
    assert.equal(getChromiumSystemStableCrxPath({ homePath: absHome, env: { XDG_DATA_HOME: '   ' } }), expected);
    // Missing XDG_DATA_HOME
    assert.equal(getChromiumSystemStableCrxPath({ homePath: absHome, env: {} }), expected);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// 7. The registration path uses absolute XDG_CONFIG_HOME when supplied.
test('B4-07. The registration path uses absolute XDG_CONFIG_HOME when supplied', () => {
  const tempDir = createTempDir('b4-07-');
  try {
    const customConfig = path.join(tempDir, 'custom-config');
    const resultPath = getChromiumSystemRegistrationPath({
      homePath: path.join(tempDir, 'fallback-home'),
      env: { XDG_CONFIG_HOME: customConfig }
    });
    assert.equal(resultPath, path.join(customConfig, 'chromium', 'External Extensions', `${CHROMIUM_EXTENSION_ID}.json`));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// 8. Missing or relative XDG_CONFIG_HOME falls back safely under absolute homePath.
test('B4-08. Missing or relative XDG_CONFIG_HOME falls back safely under absolute homePath', () => {
  const tempDir = createTempDir('b4-08-');
  try {
    const absHome = path.join(tempDir, 'abs-home');
    const expected = path.join(absHome, '.config', 'chromium', 'External Extensions', `${CHROMIUM_EXTENSION_ID}.json`);

    // Relative XDG_CONFIG_HOME
    assert.equal(getChromiumSystemRegistrationPath({ homePath: absHome, env: { XDG_CONFIG_HOME: 'relative/config' } }), expected);
    // Empty XDG_CONFIG_HOME
    assert.equal(getChromiumSystemRegistrationPath({ homePath: absHome, env: { XDG_CONFIG_HOME: '' } }), expected);
    // Missing XDG_CONFIG_HOME
    assert.equal(getChromiumSystemRegistrationPath({ homePath: absHome, env: {} }), expected);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// 9. Relative or missing homePath is rejected when required.
test('B4-09. Relative or missing homePath is rejected when required', () => {
  assert.throws(() => getChromiumSystemStableCrxPath({ homePath: 'relative/home', env: {} }), /Pfad sein/);
  assert.throws(() => getChromiumSystemRegistrationPath({ homePath: 'relative/home', env: {} }), /Pfad sein/);
  assert.throws(() => getChromiumSystemStableCrxPath({ env: {} }), /Pfad sein/);
  assert.throws(() => getChromiumSystemRegistrationPath({ env: {} }), /Pfad sein/);
  assert.throws(() => prepareChromiumSystemWebClipper({ homePath: 'relative/home', platform: 'linux', isPackaged: false, env: {} }), /Pfad sein/);
  assert.throws(() => prepareChromiumSystemWebClipper({ platform: 'linux', isPackaged: false, env: {} }), /Pfad sein/);
});

// 10. The exact extension ID and version are written.
test('B4-10. The exact extension ID and version are written', () => {
  const tempHome = createTempDir('b4-10-');
  try {
    const result = prepareChromiumSystemWebClipper({
      homePath: tempHome,
      platform: 'linux',
      isPackaged: false,
      env: {}
    });

    assert.equal(path.basename(result.registrationPath), `${CHROMIUM_EXTENSION_ID}.json`);
    const parsed = JSON.parse(fs.readFileSync(result.registrationPath, 'utf8'));
    assert.equal(parsed.external_version, CHROMIUM_EXTENSION_VERSION);
    assert.equal(parsed.external_version, '0.2.1');
    assert.equal(result.extensionId, 'dengpgfllpkndkgkbikigaejieogndbp');
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

// 11. The JSON contains external_crx and external_version and no unrelated fields.
test('B4-11. The JSON contains external_crx and external_version and no unrelated fields', () => {
  const tempHome = createTempDir('b4-11-');
  try {
    const result = prepareChromiumSystemWebClipper({
      homePath: tempHome,
      platform: 'linux',
      isPackaged: false,
      env: {}
    });

    const raw = fs.readFileSync(result.registrationPath, 'utf8');
    assert.ok(raw.endsWith('\n'), 'JSON must end with a newline');
    const parsed = JSON.parse(raw);
    const keys = Object.keys(parsed).sort();
    assert.deepEqual(keys, ['external_crx', 'external_version']);
    assert.equal(parsed.external_crx, result.crxPath);
    assert.equal(parsed.external_version, '0.2.1');
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

// 12. The CRX is not recopied when its content is unchanged.
test('B4-12. The CRX is not recopied when its content is unchanged', () => {
  const tempHome = createTempDir('b4-12-');
  try {
    const res1 = prepareChromiumSystemWebClipper({
      homePath: tempHome,
      platform: 'linux',
      isPackaged: false,
      env: {}
    });
    assert.equal(res1.crxUpdated, true);

    const stat1 = fs.statSync(res1.crxPath);

    const res2 = prepareChromiumSystemWebClipper({
      homePath: tempHome,
      platform: 'linux',
      isPackaged: false,
      env: {}
    });
    assert.equal(res2.crxUpdated, false, 'CRX should not be recopied if identical');

    const stat2 = fs.statSync(res2.crxPath);
    assert.equal(stat1.mtimeMs, stat2.mtimeMs, 'File modification time should not change');
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

// 13. The CRX is atomically updated when its content differs.
test('B4-13. The CRX is atomically updated when its content differs', () => {
  const tempHome = createTempDir('b4-13-');
  try {
    const res1 = prepareChromiumSystemWebClipper({
      homePath: tempHome,
      platform: 'linux',
      isPackaged: false,
      env: {}
    });
    assert.equal(res1.crxUpdated, true);

    // Overwrite target CRX with different dummy content
    fs.writeFileSync(res1.crxPath, 'different-dummy-content-1234');

    const res2 = prepareChromiumSystemWebClipper({
      homePath: tempHome,
      platform: 'linux',
      isPackaged: false,
      env: {}
    });
    assert.equal(res2.crxUpdated, true, 'CRX must be updated when content differs');

    // Verify it is restored to valid CRX content
    const verified = inspectCrxFile(res2.crxPath);
    assert.equal(verified.extensionId, CHROMIUM_EXTENSION_ID);
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

// 14. Required directories are created, but unrelated files are preserved.
test('B4-14. Required directories are created, but unrelated files are preserved', () => {
  const tempHome = createTempDir('b4-14-');
  try {
    const extDir = path.join(tempHome, '.config', 'chromium', 'External Extensions');
    fs.mkdirSync(extDir, { recursive: true });
    const unrelatedFile = path.join(extDir, 'other-extension.json');
    fs.writeFileSync(unrelatedFile, '{"unrelated": true}');

    const result = prepareChromiumSystemWebClipper({
      homePath: tempHome,
      platform: 'linux',
      isPackaged: false,
      env: {}
    });

    assert.ok(fs.existsSync(result.registrationPath), 'Registration file exists');
    assert.ok(fs.existsSync(unrelatedFile), 'Unrelated file must be preserved');
    assert.equal(fs.readFileSync(unrelatedFile, 'utf8'), '{"unrelated": true}');
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

// 15. The fixed IPC handler is registered.
test('B4-15. The fixed IPC handler is registered', () => {
  const ipcMain = createMockIpcMain();
  registerWebClipperDistributionIpc({ ipcMain });
  assert.equal(ipcMain.hasHandler('webclip:prepareChromiumSystem'), true);
});

// 16. The IPC handler accepts no renderer-controlled browser or path argument.
test('B4-16. The IPC handler accepts no renderer-controlled browser or path argument', async () => {
  const ipcMain = createMockIpcMain();
  let receivedArgs = null;
  const mockPrepare = async (...args) => {
    receivedArgs = args;
    return { prepared: true };
  };

  registerWebClipperDistributionIpc({
    ipcMain,
    resourcesPath: '/app/resources',
    homePath: '/home/user',
    platform: 'linux',
    isPackaged: true,
    prepareChromiumSystem: mockPrepare
  });

  const handler = ipcMain.getHandler('webclip:prepareChromiumSystem');
  await handler({ sender: {} }, 'malicious-browser', '/etc/shadow', { inject: true });

  assert.equal(receivedArgs.length, 1);
  assert.deepEqual(receivedArgs[0], {
    resourcesPath: '/app/resources',
    homePath: '/home/user',
    platform: 'linux',
    isPackaged: true
  });
});

// 17. The preload method invokes only the fixed channel and passes no arguments.
test('B4-17. The preload method invokes only the fixed channel and passes no arguments', () => {
  const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
  assert.match(
    preloadSource,
    /prepareChromiumSystem:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('webclip:prepareChromiumSystem'\)/
  );
  const match = preloadSource.match(/prepareChromiumSystem:\s*(\([^)]*\))\s*=>\s*ipcRenderer\.invoke\(([^)]+)\)/);
  assert.ok(match);
  assert.equal(match[1].trim(), '()', 'prepareChromiumSystem must have no parameters');
  assert.equal(match[2].trim(), "'webclip:prepareChromiumSystem'", 'invoke must pass exactly the fixed channel');
});

// 18. Only chromium/system gets the new UI action.
test('B4-18. Only chromium/system gets the new UI action', () => {
  const render = loadRenderDetectedBrowsersHtml();
  const html = render({
    result: {
      platform: 'linux',
      supported: true,
      flatpakStatus: 'ok',
      browsers: [{ id: 'chromium', name: 'Chromium', installType: 'system' }]
    }
  });

  assert.ok(html.includes('Chromium'));
  assert.ok(html.includes('Systeminstallation erkannt'));
  assert.ok(html.includes('stPrepareChromiumSystemWebClipper'));
  assert.ok(html.includes('Vorbereiten'));
  assert.ok(html.includes('stChromiumSystemFeedback'));
  assert.ok(html.includes('Bereitet die mitgelieferte Erweiterung ohne Entwicklermodus vor. Wirkt nach einem vollständigen Neustart von Chromium.'));
  assert.ok(!html.includes('Einrichtung für diese Installationsart noch nicht verfügbar.'));
});

// 19. Chromium Flatpak does not get the action.
test('B4-19. Chromium Flatpak does not get the action', () => {
  const render = loadRenderDetectedBrowsersHtml();
  const html = render({
    result: {
      platform: 'linux',
      supported: true,
      flatpakStatus: 'ok',
      browsers: [{ id: 'chromium', name: 'Chromium', installType: 'flatpak' }]
    }
  });

  assert.ok(html.includes('Chromium'));
  assert.ok(html.includes('Flatpak erkannt'));
  assert.ok(html.includes('Einrichtung für diese Installationsart noch nicht verfügbar.'));
  assert.ok(!html.includes('stPrepareChromiumSystemWebClipper'));
});

// 20. Google Chrome and Brave system do not get the Chromium action.
test('B4-20. Google Chrome and Brave system do not get the action', () => {
  const render = loadRenderDetectedBrowsersHtml();
  const otherBrowsers = [
    { id: 'google-chrome', name: 'Google Chrome', installType: 'system' },
    { id: 'google-chrome', name: 'Google Chrome', installType: 'flatpak' },
    { id: 'brave', name: 'Brave', installType: 'system' }
  ];

  for (const b of otherBrowsers) {
    const html = render({
      result: { platform: 'linux', supported: true, flatpakStatus: 'ok', browsers: [b] }
    });
    assert.ok(html.includes('Einrichtung für diese Installationsart noch nicht verfügbar.'));
    assert.ok(!html.includes('stPrepareChromiumSystemWebClipper'));
  }
});

// 21. Firefox system behavior remains unchanged.
test('B4-21. Firefox system behavior remains unchanged', () => {
  const render = loadRenderDetectedBrowsersHtml();
  const html = render({
    result: {
      platform: 'linux',
      supported: true,
      flatpakStatus: 'ok',
      browsers: [{ id: 'firefox', name: 'Firefox', installType: 'system' }]
    }
  });

  assert.ok(html.includes('stOpenFirefoxAmo'));
  assert.ok(html.includes('Installieren'));
  assert.ok(html.includes('Öffnet die Erweiterung bei Mozilla Add-ons.'));
  assert.ok(!html.includes('stPrepareChromiumSystemWebClipper'));
});

// 22. Brave Flatpak behavior remains unchanged.
test('B4-22. Brave Flatpak behavior remains unchanged', () => {
  const render = loadRenderDetectedBrowsersHtml();
  const html = render({
    result: {
      platform: 'linux',
      supported: true,
      flatpakStatus: 'ok',
      browsers: [{ id: 'brave', name: 'Brave', installType: 'flatpak' }]
    }
  });

  assert.ok(html.includes('stInstallBraveWebClipper'));
  assert.ok(html.includes('Vorbereiten'));
  assert.ok(html.includes('stBraveFeedback'));
  assert.ok(html.includes('stRevokeBraveWrap'));
  assert.ok(!html.includes('stPrepareChromiumSystemWebClipper'));
});

// 23. Preparation errors remain visible in the UI.
test('B4-23. Preparation errors remain visible in the UI', async () => {
  const chromButton = {
    id: 'stPrepareChromiumSystemWebClipper',
    disabled: false,
    textContent: 'Vorbereiten',
    _listeners: new Map(),
    addEventListener(e, fn) { (this._listeners.get(e) || (this._listeners.set(e, []), this._listeners.get(e))).push(fn); },
    click() {
      const fns = this._listeners.get('click') || [];
      return Promise.all(fns.map(fn => fn({ currentTarget: this })));
    }
  };
  const feedback = { id: 'stChromiumSystemFeedback', textContent: '' };
  const container = {
    elements: {
      '#stPrepareChromiumSystemWebClipper': chromButton,
      '#stChromiumSystemFeedback': feedback
    },
    querySelector(sel) { return this.elements[sel] || null; }
  };

  const { wireDetectedBrowserActions } = loadWireDetectedBrowserActions({
    console: { error: () => {}, log: () => {} },
    window: {
      archivAPI: {
        webClipper: {
          prepareChromiumSystem: async () => {
            throw new Error('Test preparation error: disk full');
          }
        }
      }
    }
  });

  wireDetectedBrowserActions(container, { isCurrent: () => true });
  await chromButton.click();

  assert.equal(feedback.textContent, 'Test preparation error: disk full');
  assert.equal(chromButton.textContent, 'Erneut versuchen');
  assert.equal(chromButton.disabled, false);
});

// 24. The detected browser row remains visible before and after action handling.
test('B4-24. The detected browser row remains visible before and after action handling', async () => {
  const chromButton = {
    id: 'stPrepareChromiumSystemWebClipper',
    disabled: false,
    textContent: 'Vorbereiten',
    _listeners: new Map(),
    addEventListener(e, fn) { (this._listeners.get(e) || (this._listeners.set(e, []), this._listeners.get(e))).push(fn); },
    click() {
      const fns = this._listeners.get('click') || [];
      return Promise.all(fns.map(fn => fn({ currentTarget: this })));
    }
  };
  const feedback = { id: 'stChromiumSystemFeedback', textContent: '' };
  const rowElement = { id: 'row-chromium-system', hidden: false };

  const container = {
    elements: {
      '#row-chromium-system': rowElement,
      '#stPrepareChromiumSystemWebClipper': chromButton,
      '#stChromiumSystemFeedback': feedback
    },
    querySelector(sel) { return this.elements[sel] || null; }
  };

  let prepareCalls = 0;
  const { wireDetectedBrowserActions } = loadWireDetectedBrowserActions({
    window: {
      archivAPI: {
        webClipper: {
          prepareChromiumSystem: async () => {
            prepareCalls++;
            return { prepared: true };
          }
        }
      }
    }
  });

  wireDetectedBrowserActions(container, { isCurrent: () => true });
  assert.equal(rowElement.hidden, false, 'Row is visible initially');

  await chromButton.click();

  assert.equal(prepareCalls, 1);
  assert.equal(rowElement.hidden, false, 'Row remains visible after preparation');
  assert.equal(feedback.textContent, 'Vorbereitet. Chromium vollständig schließen und neu starten. Eine Rückfrage des Browsers zur Erweiterung gegebenenfalls bestätigen.');
  assert.equal(chromButton.textContent, 'Erneut vorbereiten');
  assert.equal(chromButton.disabled, false);
});

// 25. No Chrome Web Store URL or Store wording is introduced.
test('B4-25. No Chrome Web Store URL or Store wording is introduced', () => {
  const filesToCheck = [
    path.join(__dirname, '..', 'main', 'webclip-distribution.js'),
    path.join(__dirname, '..', 'preload.js'),
    path.join(__dirname, '..', 'renderer', 'js', 'settings-window.js')
  ];

  for (const filePath of filesToCheck) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert.doesNotMatch(content, /chrome\.google\.com\/webstore/i, `No Web Store URL in ${path.basename(filePath)}`);
    assert.doesNotMatch(content, /chromewebstore/i, `No chromewebstore in ${path.basename(filePath)}`);
    assert.doesNotMatch(content, /Chrome Web Store/i, `No Chrome Web Store wording in ${path.basename(filePath)}`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// TEIL 4: install-native-host.sh — system-Chromium XDG_CONFIG_HOME path
// alignment correction (fixes a split between the Native Messaging manifest
// directory and the extension-registration directory used by
// main/webclip-distribution.js for normal system Chromium).
//
// Every test below runs the real installer script as a subprocess with a
// fully isolated, temporary environment (HOME, XDG_CONFIG_HOME,
// XDG_DATA_HOME, PATH). Nothing under the real HOME, the real
// XDG_CONFIG_HOME, ~/.config, ~/.mozilla, ~/.var/app, ~/snap, a real
// Chromium/Brave profile, or the real Archiv-Wiki wiki is ever touched.
// A stub "flatpak" binary that always fails is prepended to PATH so no real
// Flatpak installation is ever queried or acted upon. The AppImage passed to
// the installer is a dummy file that is only ever referenced by path — it is
// never executed, which each test verifies via an execution marker.
// ════════════════════════════════════════════════════════════════════════════

const INSTALLER_SCRIPT = path.join(__dirname, '..', 'extension', 'native-host', 'install-native-host.sh');
const NATIVE_HOST_MANIFEST_NAME = 'de.smashii.archivwiki.webclip.json';
const NATIVE_MESSAGING_CHROMIUM_EXTENSION_ORIGIN = 'chrome-extension://dengpgfllpkndkgkbikigaejieogndbp/';

// Creates an isolated run directory containing:
//  - bin/flatpak       a stub that always reports failure (non-success status)
//  - dummy.AppImage    an absolute, executable file that is never invoked by
//                       the installer itself; if it were ever executed, it
//                       would create EXECUTED_MARKER next to itself.
function createIsolatedRun(prefix) {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const binDir = path.join(runDir, 'bin');
  fs.mkdirSync(binDir);

  const flatpakStub = path.join(binDir, 'flatpak');
  fs.writeFileSync(flatpakStub, '#!/usr/bin/env bash\nexit 1\n');
  fs.chmodSync(flatpakStub, 0o755);

  const appImagePath = path.join(runDir, 'Archiv-Wiki-dummy.AppImage');
  const markerPath = path.join(runDir, 'EXECUTED_MARKER');
  fs.writeFileSync(
    appImagePath,
    `#!/usr/bin/env bash\ntouch "${markerPath}"\nexit 1\n`
  );
  fs.chmodSync(appImagePath, 0o755);

  return { runDir, binDir, appImagePath, markerPath };
}

// Runs the real installer in --appimage mode against a fully isolated
// environment. `home`/`xdgConfigHome`/`xdgDataHome` of `undefined` means the
// corresponding variable is entirely absent from the child environment
// (not merely empty) — spawnSync's `env` fully replaces the child's
// environment, it does not merge with process.env.
function runInstaller({ runInfo, home, xdgConfigHome, xdgDataHome, cwd }) {
  const env = {
    PATH: `${runInfo.binDir}:/usr/bin:/bin`
  };
  if (home !== undefined) env.HOME = home;
  if (xdgConfigHome !== undefined) env.XDG_CONFIG_HOME = xdgConfigHome;
  if (xdgDataHome !== undefined) env.XDG_DATA_HOME = xdgDataHome;

  return spawnSync('bash', [INSTALLER_SCRIPT, '--appimage', runInfo.appImagePath], {
    env,
    cwd: cwd || runInfo.runDir,
    encoding: 'utf8',
    timeout: 15000
  });
}

function cleanupRun(runInfo) {
  fs.rmSync(runInfo.runDir, { recursive: true, force: true });
}

function assertAppImageNeverExecuted(runInfo) {
  assert.equal(fs.existsSync(runInfo.markerPath), false, 'Dummy AppImage must never be executed');
}

// 26. Absolute XDG_CONFIG_HOME: manifest lands under XDG_CONFIG_HOME, not under HOME/.config.
test('B4-26. Absolute XDG_CONFIG_HOME places the Chromium manifest under XDG_CONFIG_HOME, never under HOME/.config', () => {
  const runInfo = createIsolatedRun('aw-xdg-abs-');
  try {
    const home = path.join(runInfo.runDir, 'home');
    const xdgConfigHome = path.join(runInfo.runDir, 'custom-config');
    const xdgDataHome = path.join(runInfo.runDir, 'custom-data');
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(xdgConfigHome, { recursive: true });
    fs.mkdirSync(xdgDataHome, { recursive: true });

    const result = runInstaller({ runInfo, home, xdgConfigHome, xdgDataHome });

    assert.equal(result.status, 0, `Installer must succeed. stderr: ${result.stderr}`);

    const expectedManifest = path.join(xdgConfigHome, 'chromium', 'NativeMessagingHosts', NATIVE_HOST_MANIFEST_NAME);
    const legacyManifest = path.join(home, '.config', 'chromium', 'NativeMessagingHosts', NATIVE_HOST_MANIFEST_NAME);

    assert.ok(fs.existsSync(expectedManifest), `Manifest must exist under XDG_CONFIG_HOME: ${expectedManifest}`);
    assert.equal(fs.existsSync(legacyManifest), false, 'No Chromium manifest must exist under HOME/.config when XDG_CONFIG_HOME is absolute');

    assertAppImageNeverExecuted(runInfo);
  } finally {
    cleanupRun(runInfo);
  }
});

// 27. Missing XDG_CONFIG_HOME: HOME/.config fallback is used.
test('B4-27. Missing XDG_CONFIG_HOME falls back to HOME/.config for the Chromium manifest', () => {
  const runInfo = createIsolatedRun('aw-xdg-missing-');
  try {
    const home = path.join(runInfo.runDir, 'home');
    const xdgDataHome = path.join(runInfo.runDir, 'custom-data');
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(xdgDataHome, { recursive: true });

    const result = runInstaller({ runInfo, home, xdgConfigHome: undefined, xdgDataHome });

    assert.equal(result.status, 0, `Installer must succeed. stderr: ${result.stderr}`);

    const expectedManifest = path.join(home, '.config', 'chromium', 'NativeMessagingHosts', NATIVE_HOST_MANIFEST_NAME);
    assert.ok(fs.existsSync(expectedManifest), `Manifest must exist under HOME/.config: ${expectedManifest}`);

    assertAppImageNeverExecuted(runInfo);
  } finally {
    cleanupRun(runInfo);
  }
});

// 28. Empty XDG_CONFIG_HOME: same HOME/.config fallback is used.
test('B4-28. Empty XDG_CONFIG_HOME falls back to HOME/.config for the Chromium manifest', () => {
  const runInfo = createIsolatedRun('aw-xdg-empty-');
  try {
    const home = path.join(runInfo.runDir, 'home');
    const xdgDataHome = path.join(runInfo.runDir, 'custom-data');
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(xdgDataHome, { recursive: true });

    const result = runInstaller({ runInfo, home, xdgConfigHome: '', xdgDataHome });

    assert.equal(result.status, 0, `Installer must succeed. stderr: ${result.stderr}`);

    const expectedManifest = path.join(home, '.config', 'chromium', 'NativeMessagingHosts', NATIVE_HOST_MANIFEST_NAME);
    assert.ok(fs.existsSync(expectedManifest), `Manifest must exist under HOME/.config: ${expectedManifest}`);

    assertAppImageNeverExecuted(runInfo);
  } finally {
    cleanupRun(runInfo);
  }
});

// 29. Relative XDG_CONFIG_HOME: ignored; HOME/.config fallback is used; nothing relative is written.
test('B4-29. Relative XDG_CONFIG_HOME is ignored; HOME/.config fallback is used and nothing relative is written', () => {
  const runInfo = createIsolatedRun('aw-xdg-relative-');
  try {
    const home = path.join(runInfo.runDir, 'home');
    const xdgDataHome = path.join(runInfo.runDir, 'custom-data');
    const cwd = path.join(runInfo.runDir, 'cwd-marker');
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(xdgDataHome, { recursive: true });
    fs.mkdirSync(cwd, { recursive: true });

    const result = runInstaller({ runInfo, home, xdgConfigHome: 'relative/config-dir', xdgDataHome, cwd });

    assert.equal(result.status, 0, `Installer must succeed. stderr: ${result.stderr}`);

    const expectedManifest = path.join(home, '.config', 'chromium', 'NativeMessagingHosts', NATIVE_HOST_MANIFEST_NAME);
    assert.ok(fs.existsSync(expectedManifest), `Manifest must exist under HOME/.config: ${expectedManifest}`);

    // Nothing must have been written relative to the process cwd.
    const relativeTarget = path.join(cwd, 'relative', 'config-dir');
    assert.equal(fs.existsSync(relativeTarget), false, 'No relative XDG_CONFIG_HOME target must be created');
    assert.deepEqual(fs.readdirSync(cwd), [], 'cwd must remain untouched');

    assertAppImageNeverExecuted(runInfo);
  } finally {
    cleanupRun(runInfo);
  }
});

// 30. Missing or relative HOME when the fallback is required: fail clearly, write nothing.
test('B4-30. Missing or relative HOME fails clearly when the HOME/.config fallback is required, writing no Chromium manifest', () => {
  const runInfo = createIsolatedRun('aw-home-invalid-');
  try {
    const xdgDataHome = path.join(runInfo.runDir, 'custom-data');
    fs.mkdirSync(xdgDataHome, { recursive: true });

    // Sub-case A: HOME entirely absent from the environment.
    const cwdA = path.join(runInfo.runDir, 'cwd-a');
    fs.mkdirSync(cwdA, { recursive: true });
    const resultA = runInstaller({ runInfo, home: undefined, xdgConfigHome: undefined, xdgDataHome, cwd: cwdA });
    assert.notEqual(resultA.status, 0, 'Installer must fail when HOME is missing and XDG_CONFIG_HOME is missing');
    assert.match(resultA.stderr, /Chromium-Konfigurationswurzel/, 'Installer must report a clear error');
    assert.deepEqual(fs.readdirSync(cwdA), [], 'No files must be created when HOME is missing');

    // Sub-case B: HOME set to a relative value.
    const cwdB = path.join(runInfo.runDir, 'cwd-b');
    fs.mkdirSync(cwdB, { recursive: true });
    const resultB = runInstaller({ runInfo, home: 'relative-home-dir', xdgConfigHome: undefined, xdgDataHome, cwd: cwdB });
    assert.notEqual(resultB.status, 0, 'Installer must fail when HOME is relative and XDG_CONFIG_HOME is missing');
    assert.match(resultB.stderr, /Chromium-Konfigurationswurzel/, 'Installer must report a clear error');
    assert.deepEqual(fs.readdirSync(cwdB), [], 'No files must be created when HOME is relative');
    assert.equal(fs.existsSync(path.join(cwdB, 'relative-home-dir')), false, 'No relative HOME target must be created');

    assertAppImageNeverExecuted(runInfo);
  } finally {
    cleanupRun(runInfo);
  }
});

// 31. Manifest integrity: filename, allowed_origins, and the stable host path.
test('B4-31. Manifest integrity: filename, allowed_origins, and stable host path are exact', () => {
  const runInfo = createIsolatedRun('aw-integrity-');
  try {
    const home = path.join(runInfo.runDir, 'home');
    const xdgConfigHome = path.join(runInfo.runDir, 'custom-config');
    const xdgDataHome = path.join(runInfo.runDir, 'custom-data');
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(xdgConfigHome, { recursive: true });
    fs.mkdirSync(xdgDataHome, { recursive: true });

    const result = runInstaller({ runInfo, home, xdgConfigHome, xdgDataHome });
    assert.equal(result.status, 0, `Installer must succeed. stderr: ${result.stderr}`);

    const manifestPath = path.join(xdgConfigHome, 'chromium', 'NativeMessagingHosts', NATIVE_HOST_MANIFEST_NAME);
    assert.ok(fs.existsSync(manifestPath));
    assert.equal(path.basename(manifestPath), NATIVE_HOST_MANIFEST_NAME);

    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(parsed.name, 'de.smashii.archivwiki.webclip');
    assert.deepEqual(parsed.allowed_origins, [NATIVE_MESSAGING_CHROMIUM_EXTENSION_ORIGIN]);

    const expectedStableHostPath = path.join(
      xdgDataHome, 'archiv-wiki', 'native-host', 'extension', 'native-host', 'archiv-wiki-native-host'
    );
    assert.equal(parsed.path, expectedStableHostPath, 'Manifest must point to the stable generated Native Messaging host');
    assert.ok(fs.existsSync(expectedStableHostPath), 'The stable generated host file must actually exist');

    assertAppImageNeverExecuted(runInfo);
  } finally {
    cleanupRun(runInfo);
  }
});

// 32. Existing browser boundaries: Firefox, Brave Flatpak, Google Chrome, and Brave system are unchanged.
test('B4-32. Existing Firefox, Brave Flatpak, Google Chrome, and Brave system paths are unchanged by this correction', () => {
  const runInfo = createIsolatedRun('aw-boundaries-');
  try {
    const home = path.join(runInfo.runDir, 'home');
    const xdgConfigHome = path.join(runInfo.runDir, 'custom-config');
    const xdgDataHome = path.join(runInfo.runDir, 'custom-data');
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(xdgConfigHome, { recursive: true });
    fs.mkdirSync(xdgDataHome, { recursive: true });

    const result = runInstaller({ runInfo, home, xdgConfigHome, xdgDataHome });
    assert.equal(result.status, 0, `Installer must succeed. stderr: ${result.stderr}`);

    // Firefox: unrelated to XDG_CONFIG_HOME, still under HOME/.mozilla.
    const firefoxManifest = path.join(home, '.mozilla', 'native-messaging-hosts', NATIVE_HOST_MANIFEST_NAME);
    assert.ok(fs.existsSync(firefoxManifest), 'Firefox manifest path must remain unchanged');

    // Google Chrome, Brave (system): still under HOME/.config, NOT under XDG_CONFIG_HOME.
    const chromeManifest = path.join(home, '.config', 'google-chrome', 'NativeMessagingHosts', NATIVE_HOST_MANIFEST_NAME);
    const braveManifest = path.join(home, '.config', 'BraveSoftware', 'Brave-Browser', 'NativeMessagingHosts', NATIVE_HOST_MANIFEST_NAME);
    assert.ok(fs.existsSync(chromeManifest), 'Google Chrome manifest path must remain unchanged (HOME/.config)');
    assert.ok(fs.existsSync(braveManifest), 'Brave system manifest path must remain unchanged (HOME/.config)');

    const chromeUnderXdg = path.join(xdgConfigHome, 'google-chrome', 'NativeMessagingHosts', NATIVE_HOST_MANIFEST_NAME);
    const braveUnderXdg = path.join(xdgConfigHome, 'BraveSoftware', 'Brave-Browser', 'NativeMessagingHosts', NATIVE_HOST_MANIFEST_NAME);
    assert.equal(fs.existsSync(chromeUnderXdg), false, 'Google Chrome must not follow the new XDG_CONFIG_HOME rule');
    assert.equal(fs.existsSync(braveUnderXdg), false, 'Brave system must not follow the new XDG_CONFIG_HOME rule');

    // Vivaldi support was removed: no vivaldi config directory of any kind
    // must be created by the installer.
    assert.equal(fs.existsSync(path.join(home, '.config', 'vivaldi')), false, 'No Vivaldi config directory must be created');
    assert.equal(fs.existsSync(path.join(xdgConfigHome, 'vivaldi')), false, 'No Vivaldi config directory must be created under XDG_CONFIG_HOME');
    assert.equal(fs.existsSync(path.join(home, '.var', 'app', 'com.vivaldi.Vivaldi')), false, 'No Vivaldi Flatpak directory must be created');

    // Brave Flatpak: our stubbed `flatpak` reports failure, so no Brave Flatpak
    // registration must be attempted or created at all (proves the real
    // Flatpak installation, if any exists on this machine, was never queried
    // for a result that mattered, and nothing was written under it).
    const braveFlatpakManifest = path.join(
      home, '.var', 'app', 'com.brave.Browser', 'config', 'BraveSoftware', 'Brave-Browser', 'NativeMessagingHosts', NATIVE_HOST_MANIFEST_NAME
    );
    assert.equal(fs.existsSync(braveFlatpakManifest), false, 'Brave Flatpak must not be touched when flatpak reports failure');
    assert.equal(fs.existsSync(path.join(home, '.var')), false, 'No .var/app directory must be created when flatpak reports failure');

    assertAppImageNeverExecuted(runInfo);
  } finally {
    cleanupRun(runInfo);
  }
});
