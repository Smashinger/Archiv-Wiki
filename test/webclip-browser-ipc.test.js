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
const vm = require('vm');

const { registerWebClipperDistributionIpc } = require('../main/webclip-distribution');

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
          installBrave: async () => ({ prepared: true })
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
    'webclip:getBraveFlatpakPermissionStatus',
    'webclip:grantBraveFlatpakPermission',
    'webclip:revokeBraveFlatpakPermission',
    'webclip:detectBrowsers'
  ];

  for (const channel of expectedChannels) {
    assert.ok(channels.includes(channel), `Kanal ${channel} muss registriert sein`);
  }
  assert.equal(channels.length, expectedChannels.length, 'Genau die 5 erwarteten Kanäle registriert');
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

// 5. Chromium system: Keine Einrichtungsaktion
test('B3-05. Chromium system erhält keine Einrichtungsaktion', () => {
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
  assert.ok(html.includes('Einrichtung für diese Installationsart noch nicht verfügbar.'));
  assert.ok(!html.includes('stInstallBraveWebClipper'));
  assert.ok(!html.includes('stOpenFirefoxAmo'));
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

// 9. Vivaldi system: Keine Einrichtungsaktion
test('B3-09. Vivaldi system erhält keine Einrichtungsaktion', () => {
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
  assert.ok(html.includes('Systeminstallation erkannt'));
  assert.ok(html.includes('Einrichtung für diese Installationsart noch nicht verfügbar.'));
  assert.ok(!html.includes('stInstallBraveWebClipper'));
  assert.ok(!html.includes('stOpenFirefoxAmo'));
});

// 10. Vivaldi Flatpak: Keine Einrichtungsaktion
test('B3-10. Vivaldi Flatpak erhält keine Einrichtungsaktion', () => {
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
  assert.ok(html.includes('Flatpak erkannt'));
  assert.ok(html.includes('Einrichtung für diese Installationsart noch nicht verfügbar.'));
  assert.ok(!html.includes('stInstallBraveWebClipper'));
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
  assert.ok(html.includes('Firefox Flatpak'));
  assert.ok(html.includes('Brave System'));
  assert.ok(html.includes('Chromium'));

  // Genau 1x Firefox-Aktion und 1x Brave-Aktion
  assert.equal(html.split('stOpenFirefoxAmo').length - 1, 1);
  assert.equal(html.split('stInstallBraveWebClipper').length - 1, 1);
  // Genau 3x Hinweis auf Nichtverfügbarkeit
  assert.equal(html.split('Einrichtung für diese Installationsart noch nicht verfügbar.').length - 1, 3);
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
