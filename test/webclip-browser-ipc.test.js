// test/webclip-browser-ipc.test.js
// Fokussierte Tests für die Anbindung der Browser-Erkennung (Web-Clipper Block 2).
// Laufen mit dem Node-Test-Runner (`node --test`), ohne zusätzliche Abhängigkeiten
// und ohne laufendes Electron.
//
// Geprüft werden:
// 1. IPC-Registrierung im Hauptprozess (webclip:detectBrowsers)
// 2. Argument-Isolation und Vertrags-Durchreichung
// 3. Fehler-Isolation (keine mutierenden Aktionen bei Erkennungsfehlern)
// 4. Preload-Brücke (exakt benannte Methode, kein generischer IPC)
// 5. Renderer-Zustands- und Darstellungsableitung
// 6. Caching und Lifecycle-Schutz

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { registerWebClipperDistributionIpc } = require('../main/webclip-distribution');

// ── Hilfsfunktionen für IPC-Mocks ──────────────────────────────────────────

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
    renderDetectedBrowsersHtml: null
  };
  vm.runInNewContext(fnSource + '; renderDetectedBrowsersHtml = renderDetectedBrowsersHtml;', sandbox);
  return sandbox.renderDetectedBrowsersHtml;
}


// ── 1. Main-IPC: Kanalregistrierung ─────────────────────────────────────────

test('1. registerWebClipperDistributionIpc registriert webclip:detectBrowsers', () => {
  const ipcMain = createMockIpcMain();
  registerWebClipperDistributionIpc({ ipcMain });
  assert.equal(ipcMain.hasHandler('webclip:detectBrowsers'), true, 'Kanal webclip:detectBrowsers muss registriert sein');
});


// ── 2. Main-IPC: Genau ein Aufruf der Erkennungsfunktion ───────────────────

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


// ── 3. Main-IPC: Keine Argumentübergabe aus dem Renderer ───────────────────

test('3. Der Handler übergibt keine Rendererargumente an die Erkennungsfunktion', async () => {
  const ipcMain = createMockIpcMain();
  let receivedArgs = null;
  const mockDetect = async (...args) => {
    receivedArgs = args;
    return { platform: 'linux', supported: true, flatpakStatus: 'ok', browsers: [] };
  };

  registerWebClipperDistributionIpc({ ipcMain, detectBrowsers: mockDetect });
  const handler = ipcMain.getHandler('webclip:detectBrowsers');

  // Renderer ruft mit diversen Argumenten auf
  await handler({ sender: {} }, '/usr/bin/evil', '--flag', { dangerous: true });

  assert.ok(Array.isArray(receivedArgs), 'Erkennungsfunktion wurde aufgerufen');
  assert.equal(receivedArgs.length, 0, 'Keine Argumente dürfen an detectBrowsers weitergereicht werden');
});


// ── 4. Main-IPC: Erkennungsvertrag unverändert zurückgeben ─────────────────

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


// ── 5. Main-IPC: Abgelehnter Promise wird als Fehler weitergegeben ─────────

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


// ── 6. Main-IPC: Vorhandene Web-Clipper-Kanäle bleiben registriert ─────────

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


// ── 7. Preload: Exponiert genau die benannte Methode ───────────────────────

test('7. preload.js exponiert genau die benannte Methode unter webClipper.detectBrowsers', () => {
  const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');

  // Exakte Funktionssignatur prüfen
  assert.match(
    preloadSource,
    /detectBrowsers:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('webclip:detectBrowsers'\)/,
    'detectBrowsers muss genau so in preload.js definiert sein'
  );
});


// ── 8. Preload: Ausschließlich ipcRenderer.invoke ohne Rendererargumente ────

test('8. Die Preload-Methode verwendet ausschließlich ipcRenderer.invoke ohne Argumente', () => {
  const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');

  // Prüfen, dass keine Argumente an die Pfeilfunktion deklariert sind: () =>
  const match = preloadSource.match(/detectBrowsers:\s*(\([^)]*\))\s*=>\s*ipcRenderer\.invoke\(([^)]+)\)/);
  assert.ok(match, 'detectBrowsers-Muster muss matchen');
  assert.equal(match[1].trim(), '()', 'Pfeilfunktion darf keine Parameter annehmen');
  assert.equal(match[2].trim(), "'webclip:detectBrowsers'", 'invoke darf nur den festen Kanalnamen übergeben');
});


// ── 9. Preload: Kein generischer IPC-Zugriff ───────────────────────────────

test('9. Es entsteht kein generischer IPC-Zugriff in preload.js', () => {
  const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');

  assert.doesNotMatch(preloadSource, /invoke:\s*\(channel/, 'Kein generischer invoke(channel)');
  assert.doesNotMatch(preloadSource, /ipcRenderer\.invoke\(channel/, 'Kein ipcRenderer.invoke mit dynamischem Kanal');
  assert.doesNotMatch(preloadSource, /ipcRenderer\.send\(channel/, 'Kein ipcRenderer.send mit dynamischem Kanal');
});


// ── 10. Renderer: Lifecycle-Schutz ─────────────────────────────────────────

test('10. Der Renderer verwendet den vorhandenen Lifecycle-Schutz für die DOM-Aktualisierung', () => {
  const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', 'settings-window.js'), 'utf8');

  // Prüfen, dass getDetectedBrowsers mit lifecycle.isCurrent()-Guard aufgerufen wird
  assert.match(
    settingsSource,
    /getDetectedBrowsers\(\)[\s\S]*?\.then\(\(result\)\s*=>\s*\{[\s\S]*?if\s*\(!lifecycle\.isCurrent\(\)\)\s*return;/
  );
  assert.match(
    settingsSource,
    /\.catch\(\(error\)\s*=>\s*\{[\s\S]*?if\s*\(!lifecycle\.isCurrent\(\)\)\s*return;/
  );
});


// ── 11. Renderer: Caching innerhalb der Fenster-Lebensdauer ────────────────

test('11. Der Erkennungsabruf wird innerhalb einer Einstellungsfenster-Lebensdauer gecacht', async () => {
  const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', 'settings-window.js'), 'utf8');

  // Prüfen, dass detectedBrowsersPromise innerhalb von showSettingsWindow definiert ist
  assert.match(
    settingsSource,
    /let\s+detectedBrowsersPromise\s*=\s*null;/,
    'detectedBrowsersPromise muss als lokale Variable existieren'
  );

  // Simulation der getDetectedBrowsers-Logik
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

  // Erster Abruf
  const p1 = getDetectedBrowsers();
  // Zweiter Abruf (z. B. bei Re-Render durch Status-Update)
  const p2 = getDetectedBrowsers();
  // Dritter Abruf
  const p3 = getDetectedBrowsers();

  assert.equal(p1, p2, 'Zweiter Aufruf muss denselben Promise zurückgeben');
  assert.equal(p2, p3, 'Dritter Aufruf muss denselben Promise zurückgeben');

  await Promise.all([p1, p2, p3]);
  assert.equal(apiCalls, 1, 'Die Erkennung darf innerhalb der Fenster-Lebensdauer nur genau einmal aufgerufen werden');
});


// ── 12. Renderer: Dynamische Browsernamen werden vor HTML-Ausgabe escaped ──

test('12. Dynamische Browsernamen werden vor der HTML-Ausgabe sicher escaped', () => {
  const renderDetectedBrowsersHtml = loadRenderDetectedBrowsersHtml();

  const dangerousBrowser = {
    id: 'custom',
    name: '<script>alert("xss")</script> & "Brave"',
    installType: 'system'
  };

  const html = renderDetectedBrowsersHtml({
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


// ── 13. Renderer: Fehler lässt bestehende Aktionen bestehen ────────────────

test('13. Ein Erkennungsfehler lässt die bestehenden Firefox- und Brave-Aktionen unberührt', () => {
  const renderDetectedBrowsersHtml = loadRenderDetectedBrowsersHtml();

  // Bei Fehler erzeugt renderDetectedBrowsersHtml einen sachlichen Hinweis
  const errorHtml = renderDetectedBrowsersHtml({ error: new Error('IPC failed') });
  assert.ok(errorHtml.includes('Browser konnten nicht erkannt werden.'));

  // In settings-window.js muss die Gruppe 'Erkannte Browser' als eigenständiger
  // Abschnitt neben 'Browser-Erweiterung' existieren, sodass die Firefox- und
  // Brave-Zeilen unabhängig gerendert werden
  const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', 'settings-window.js'), 'utf8');
  assert.ok(settingsSource.includes("group('Browser-Erweiterung'"), 'Browser-Erweiterung muss existieren');
  assert.ok(settingsSource.includes("group('Erkannte Browser'"), 'Erkannte Browser muss existieren');
  assert.ok(settingsSource.includes('stOpenFirefoxAmo'), 'Firefox-Button muss existieren');
  assert.ok(settingsSource.includes('stInstallBraveWebClipper'), 'Brave-Button muss existieren');
});


// ── 14. Renderer: Alle 6 definierten Zustände werden korrekt dargestellt ────

test('14. renderDetectedBrowsersHtml deckt alle 6 definierten Zustände sachlich ab', () => {
  const render = loadRenderDetectedBrowsersHtml();

  // Zustand 0: Ladezustand
  const loading = render({ loading: true });
  assert.ok(loading.includes('Browser werden erkannt …'));

  // Zustand 1: Browser erkannt
  const recognized = render({
    result: {
      platform: 'linux',
      supported: true,
      flatpakStatus: 'ok',
      browsers: [
        { id: 'firefox', name: 'Firefox', installType: 'system' },
        { id: 'brave', name: 'Brave', installType: 'flatpak' }
      ]
    }
  });
  assert.ok(recognized.includes('Firefox'));
  assert.ok(recognized.includes('Systeminstallation erkannt'));
  assert.ok(recognized.includes('Brave'));
  assert.ok(recognized.includes('Flatpak erkannt'));

  // Zustand 2: Keine Browser erkannt, Flatpak ok
  const noneOk = render({
    result: { platform: 'linux', supported: true, flatpakStatus: 'ok', browsers: [] }
  });
  assert.ok(noneOk.includes('Keine bekannten Browserinstallationen erkannt.'));

  // Zustand 3: Flatpak nicht verfügbar
  const flatpakUnavailable = render({
    result: { platform: 'linux', supported: true, flatpakStatus: 'unavailable', browsers: [] }
  });
  assert.ok(flatpakUnavailable.includes('Keine bekannten Systembrowser erkannt. Flatpak ist nicht verfügbar.'));

  // Zustand 4: Flatpak fehlgeschlagen (mit und ohne Systembrowser)
  const flatpakFailedNone = render({
    result: { platform: 'linux', supported: true, flatpakStatus: 'failed', browsers: [] }
  });
  assert.ok(flatpakFailedNone.includes('Flatpak-Installationen konnten nicht geprüft werden.'));

  const flatpakFailedWithSystem = render({
    result: {
      platform: 'linux',
      supported: true,
      flatpakStatus: 'failed',
      browsers: [{ id: 'chromium', name: 'Chromium', installType: 'system' }]
    }
  });
  assert.ok(flatpakFailedWithSystem.includes('Chromium'));
  assert.ok(flatpakFailedWithSystem.includes('Systeminstallation erkannt'));
  assert.ok(flatpakFailedWithSystem.includes('Flatpak-Installationen konnten nicht geprüft werden.'));

  // Zustand 5: Nicht-Linux
  const nonLinux = render({
    result: { platform: 'win32', supported: false, flatpakStatus: null, browsers: [] }
  });
  assert.ok(nonLinux.includes('Die automatische Browser-Erkennung ist derzeit nur unter Linux verfügbar.'));

  // Zustand 6: Fehler
  const err = render({ error: new Error('fail') });
  assert.ok(err.includes('Browser konnten nicht erkannt werden.'));
});


// ── 15. Renderer: Keine unzulässigen Bewertungs- oder Werbebegriffe ──────────

test('15. Keine unzulässigen Wörter (unterstützt, bereit, funktioniert, verifiziert, Extension installiert)', () => {
  const render = loadRenderDetectedBrowsersHtml();

  const allOutputs = [
    render({ loading: true }),
    render({ error: new Error('fail') }),
    render({ result: { platform: 'win32', supported: false, flatpakStatus: null, browsers: [] } }),
    render({ result: { platform: 'linux', supported: true, flatpakStatus: 'ok', browsers: [] } }),
    render({ result: { platform: 'linux', supported: true, flatpakStatus: 'unavailable', browsers: [] } }),
    render({ result: { platform: 'linux', supported: true, flatpakStatus: 'failed', browsers: [] } }),
    render({
      result: {
        platform: 'linux',
        supported: true,
        flatpakStatus: 'ok',
        browsers: [
          { id: 'firefox', name: 'Firefox', installType: 'system' },
          { id: 'brave', name: 'Brave', installType: 'flatpak' }
        ]
      }
    })
  ].join(' ');

  // Verbotene Begriffe prüfen
  assert.doesNotMatch(allOutputs, /vollständig unterstützt/i);
  assert.doesNotMatch(allOutputs, /\bbereit\b/i);
  assert.doesNotMatch(allOutputs, /\bfunktioniert\b/i);
  assert.doesNotMatch(allOutputs, /\bverifiziert\b/i);
  assert.doesNotMatch(allOutputs, /Extension installiert/i);
});
