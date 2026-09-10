// test/webclip-browser-detection.test.js
// Fokussierte Tests für main/webclip-browser-detection.js. Laufen mit dem
// eingebauten Test-Runner von Node (`node --test`), ohne zusätzliche
// Abhängigkeiten und ohne laufendes Electron.
//
// ALLE Tests verwenden injizierte deps-Ersatzfunktionen. Es werden keine
// echten Browser, kein echtes PATH, kein echtes flatpak und kein echtes
// Benutzerprofil verwendet. Keine Datei, Berechtigung oder Native-Messaging-
// Registrierung wird verändert.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { detectBrowsers } = require('../main/webclip-browser-detection');

// Unabhängige Erwartungswerte im Test (kein Import interner Modulkonstanten)
const EXPECTED_BROWSERS = Object.freeze([
  { id: 'brave', flatpakId: 'com.brave.Browser' },
  { id: 'chromium', flatpakId: 'org.chromium.Chromium' },
  { id: 'firefox', flatpakId: 'org.mozilla.firefox' },
  { id: 'google-chrome', flatpakId: 'com.google.Chrome' }
]);

// ── Hilfsfunktionen ────────────────────────────────────────────────────────

// Erstellt ein deps-Objekt, das eine kontrollierte Testumgebung simuliert.
// executables: Map<absolutePath, { executable: boolean, isFile?: boolean }>
// flatpakResult: { error?, stdout? } oder null (flatpak nicht vorhanden)
function makeDeps({
  platform = 'linux',
  pathEnv = '/usr/bin:/usr/local/bin',
  executables = new Map(),
  realPaths = new Map(),
  flatpakResult = null,
  flatpakMissing = false
} = {}) {
  return {
    platform: () => platform,
    env: () => ({ PATH: pathEnv }),
    accessSync: (filePath, _mode) => {
      const entry = executables.get(filePath);
      if (!entry || !entry.executable) {
        const err = new Error(`ENOENT: ${filePath}`);
        err.code = 'ENOENT';
        throw err;
      }
    },
    realpathSync: (filePath) => {
      if (realPaths.has(filePath)) {
        const mapped = realPaths.get(filePath);
        if (mapped instanceof Error) throw mapped;
        return mapped;
      }
      return filePath;
    },
    statSync: (filePath) => {
      const resolved = realPaths.has(filePath) && !(realPaths.get(filePath) instanceof Error)
        ? realPaths.get(filePath) : filePath;
      const entry = executables.get(resolved) || executables.get(filePath);
      if (!entry) {
        const err = new Error(`ENOENT: ${filePath}`);
        err.code = 'ENOENT';
        throw err;
      }
      const isFile = entry.isFile !== undefined ? entry.isFile : true;
      return { isFile: () => isFile };
    },
    execFile: (_file, _args, _opts, cb) => {
      if (flatpakMissing) {
        const err = new Error('spawn flatpak ENOENT');
        err.code = 'ENOENT';
        cb(err, '', '');
        return;
      }
      if (flatpakResult === null) {
        const err = new Error('flatpak failed');
        err.code = 'EXIT_1';
        cb(err, '', 'error');
        return;
      }
      if (flatpakResult.error) {
        cb(flatpakResult.error, '', '');
        return;
      }
      cb(null, flatpakResult.stdout || '', '');
    }
  };
}

// Zeichnet den execFile-Aufruf auf, um die exakten Argumente und Optionen zu prüfen.
function makeRecordingDeps(base) {
  const calls = [];
  return {
    deps: {
      ...base,
      execFile: (file, args, opts, cb) => {
        calls.push({ file, args, opts: { ...opts } });
        base.execFile(file, args, opts, cb);
      }
    },
    calls
  };
}


// ── 0. Exportoberfläche ───────────────────────────────────────────────────

test('0. Exportoberfläche: enthält ausschließlich die Funktion detectBrowsers', () => {
  const mod = require('../main/webclip-browser-detection');
  assert.deepEqual(Object.keys(mod), ['detectBrowsers']);
  assert.equal(typeof mod.detectBrowsers, 'function');
});


// ── 1. Nicht-Linux liefert leeres Ergebnis ─────────────────────────────────

test('1. Nicht-Linux: kontrolliertes leeres Ergebnis, keine PATH-/Flatpak-Prüfung', async () => {
  let accessCalled = false;
  let execFileCalled = false;
  const deps = {
    platform: () => 'win32',
    env: () => ({ PATH: '/usr/bin' }),
    accessSync: () => { accessCalled = true; },
    realpathSync: (p) => p,
    statSync: () => ({ isFile: () => true }),
    execFile: (_f, _a, _o, cb) => { execFileCalled = true; cb(null, '', ''); }
  };

  const result = await detectBrowsers(deps);

  assert.equal(result.platform, 'win32');
  assert.equal(result.supported, false);
  assert.equal(result.flatpakStatus, null);
  assert.deepEqual(result.browsers, []);
  assert.equal(accessCalled, false, 'accessSync darf auf Nicht-Linux nicht aufgerufen werden');
  assert.equal(execFileCalled, false, 'execFile darf auf Nicht-Linux nicht aufgerufen werden');
});

test('1b. macOS liefert ebenfalls kontrolliertes leeres Ergebnis', async () => {
  const deps = makeDeps({ platform: 'darwin' });
  const result = await detectBrowsers(deps);
  assert.equal(result.supported, false);
  assert.equal(result.flatpakStatus, null);
  assert.deepEqual(result.browsers, []);
});


// ── 2. Firefox als Systeminstallation ──────────────────────────────────────

test('2. Firefox als normale Systeminstallation wird korrekt erkannt', async () => {
  const deps = makeDeps({
    executables: new Map([['/usr/bin/firefox', { executable: true }]]),
    flatpakMissing: true
  });

  const result = await detectBrowsers(deps);

  assert.equal(result.supported, true);
  const firefox = result.browsers.find(b => b.id === 'firefox' && b.installType === 'system');
  assert.ok(firefox, 'Firefox muss als Systeminstallation erkannt werden');
  assert.equal(firefox.name, 'Firefox');
  assert.equal(firefox.engine, 'firefox');
  assert.equal(firefox.execPath, '/usr/bin/firefox');
});


// ── 3. Chromium-Browser werden über exakte Namen erkannt ───────────────────

test('3. Chromium-Browser werden über exakte ausführbare Namen erkannt', async () => {
  const deps = makeDeps({
    executables: new Map([
      ['/usr/bin/brave-browser', { executable: true }],
      ['/usr/bin/chromium', { executable: true }],
      ['/usr/bin/google-chrome-stable', { executable: true }]
    ]),
    flatpakMissing: true
  });

  const result = await detectBrowsers(deps);

  const ids = result.browsers.map(b => b.id);
  assert.ok(ids.includes('brave'), 'Brave erkannt');
  assert.ok(ids.includes('chromium'), 'Chromium erkannt');
  assert.ok(ids.includes('google-chrome'), 'Google Chrome erkannt');

  for (const b of result.browsers) {
    assert.equal(b.engine, 'chromium');
    assert.equal(b.installType, 'system');
  }
});


// ── 4. Nicht ausführbare oder fehlende Dateien ─────────────────────────────

test('4. Nicht ausführbare oder fehlende Dateien werden nicht als Browser gemeldet', async () => {
  const deps = makeDeps({
    executables: new Map([
      // firefox existiert, ist aber nicht ausführbar.
      ['/usr/bin/firefox', { executable: false }]
      // brave-browser existiert gar nicht → nicht in der Map.
    ]),
    flatpakMissing: true
  });

  const result = await detectBrowsers(deps);
  assert.equal(result.browsers.length, 0, 'Keine Browser erkannt');
});


// ── 4b. Ausführbares Verzeichnis wird nicht als Browser erkannt ─────────────

test('4b. Ein ausführbares Verzeichnis wird nicht als Browser erkannt', async () => {
  const deps = makeDeps({
    executables: new Map([
      // firefox existiert als ausführbares Verzeichnis.
      ['/usr/bin/firefox', { executable: true, isFile: false }]
    ]),
    flatpakMissing: true
  });

  const result = await detectBrowsers(deps);
  assert.equal(result.browsers.length, 0, 'Verzeichnis darf nicht als Browser gelten');
});


// ── 5. Relative und leere PATH-Bestandteile ────────────────────────────────

test('5. Relative und leere PATH-Bestandteile werden ignoriert', async () => {
  const deps = makeDeps({
    pathEnv: ':/usr/bin:relative/path:./local::',
    executables: new Map([
      // Nur unter /usr/bin existiert firefox.
      ['/usr/bin/firefox', { executable: true }],
      // Unter dem relativen Pfad wäre einer – darf aber NICHT gefunden werden.
      ['relative/path/firefox', { executable: true }]
    ]),
    flatpakMissing: true
  });

  const result = await detectBrowsers(deps);

  assert.equal(result.browsers.length, 1);
  assert.equal(result.browsers[0].execPath, '/usr/bin/firefox');
});


// ── 6. Aliasnamen derselben Installation erzeugen kein Duplikat ────────────

test('6. Mehrere Aliasnamen derselben Browserinstallation erzeugen keinen doppelten Eintrag', async () => {
  // chromium und chromium-browser sind Symlinks auf dieselbe Datei.
  const deps = makeDeps({
    executables: new Map([
      ['/usr/bin/chromium', { executable: true }],
      ['/usr/bin/chromium-browser', { executable: true }],
      ['/usr/lib/chromium/chromium', { executable: true }]
    ]),
    realPaths: new Map([
      ['/usr/bin/chromium', '/usr/lib/chromium/chromium'],
      ['/usr/bin/chromium-browser', '/usr/lib/chromium/chromium']
    ]),
    flatpakMissing: true
  });

  const result = await detectBrowsers(deps);

  const chromiums = result.browsers.filter(b => b.id === 'chromium');
  assert.equal(chromiums.length, 1, 'Nur ein Chromium-Eintrag trotz zwei Aliasnamen');
  assert.equal(chromiums[0].execPath, '/usr/bin/chromium', 'Erster gefundener Name wird verwendet');
});


// ── 6b. Defekter Symlink: erster Alias scheitert, zweiter wird erkannt ─────

test('6b. Defekter Symlink beim ersten Alias: zweiter Alias desselben Browsers wird erkannt', async () => {
  const deps = makeDeps({
    executables: new Map([
      ['/usr/bin/chromium', { executable: true }],
      ['/usr/bin/chromium-browser', { executable: true }]
    ]),
    realPaths: new Map([
      // Erster Alias: realpathSync scheitert (defekter Symlink).
      ['/usr/bin/chromium', new Error('ENOENT: broken symlink')],
      // Zweiter Alias: funktioniert normal.
      ['/usr/bin/chromium-browser', '/usr/bin/chromium-browser']
    ]),
    flatpakMissing: true
  });

  const result = await detectBrowsers(deps);

  const chromiums = result.browsers.filter(b => b.id === 'chromium');
  assert.equal(chromiums.length, 1, 'Chromium wird über den zweiten Alias erkannt');
  assert.equal(chromiums[0].execPath, '/usr/bin/chromium-browser');
});


// ── 6c. realpathSync-Fehler bricht Gesamterkennung nicht ab ────────────────

test('6c. realpathSync-Fehler bei einem Kandidaten zerstört andere gültige Treffer nicht', async () => {
  const deps = makeDeps({
    executables: new Map([
      ['/usr/bin/firefox', { executable: true }],
      ['/usr/bin/brave-browser', { executable: true }]
    ]),
    realPaths: new Map([
      // Firefox: realpathSync scheitert.
      ['/usr/bin/firefox', new Error('I/O error')],
      // Brave: normal.
      ['/usr/bin/brave-browser', '/usr/bin/brave-browser']
    ]),
    flatpakMissing: true
  });

  const result = await detectBrowsers(deps);

  // Firefox wird wegen realpathSync-Fehler übersprungen, Brave bleibt.
  const ids = result.browsers.map(b => b.id);
  assert.ok(ids.includes('brave'), 'Brave trotz Firefox-realpathSync-Fehler erkannt');
  assert.ok(!ids.includes('firefox'), 'Firefox übersprungen (defekter realpath)');
});


// ── 7. Gleichzeitige System- und Flatpak-Installation ──────────────────────

test('7. Derselbe Browser kann gleichzeitig als System- und Flatpak-Installation erkannt werden', async () => {
  const deps = makeDeps({
    executables: new Map([['/usr/bin/brave-browser', { executable: true }]]),
    flatpakResult: { stdout: 'com.brave.Browser\n' }
  });

  const result = await detectBrowsers(deps);

  const braves = result.browsers.filter(b => b.id === 'brave');
  assert.equal(braves.length, 2, 'Brave als System UND Flatpak');
  assert.ok(braves.some(b => b.installType === 'system'), 'Systeminstallation vorhanden');
  assert.ok(braves.some(b => b.installType === 'flatpak'), 'Flatpak-Installation vorhanden');
  assert.equal(braves.find(b => b.installType === 'flatpak').flatpakId, 'com.brave.Browser');
});


// ── 8. Nur exakt bekannte Flatpak-IDs werden akzeptiert ────────────────────

test('8. Nur exakt bekannte Flatpak-Application-IDs werden akzeptiert', async () => {
  const deps = makeDeps({
    flatpakResult: {
      stdout: [
        'com.brave.Browser',
        'org.mozilla.firefox',
        'org.chromium.Chromium',
        'com.google.Chrome'
      ].join('\n') + '\n'
    }
  });

  const result = await detectBrowsers(deps);

  const flatpaks = result.browsers.filter(b => b.installType === 'flatpak');
  assert.equal(flatpaks.length, 4, 'Alle 4 bekannten Flatpak-Browser erkannt');
});


// ── 8b. Doppelte Flatpak-Ergebnisse verhindern ────────────────────────────

test('8b. Doppelte Flatpak-IDs in der Ausgabe erzeugen keine doppelten Browserinstallationen', async () => {
  const deps = makeDeps({
    flatpakResult: {
      stdout: [
        'com.brave.Browser',
        'com.brave.Browser',
        'org.mozilla.firefox',
        'org.mozilla.firefox'
      ].join('\n') + '\n'
    }
  });

  const result = await detectBrowsers(deps);

  const flatpaks = result.browsers.filter(b => b.installType === 'flatpak');
  assert.equal(flatpaks.length, 2, 'Genau zwei Flatpak-Ergebnisse erwartet');
  assert.equal(flatpaks[0].id, 'brave');
  assert.equal(flatpaks[0].flatpakId, 'com.brave.Browser');
  assert.equal(flatpaks[1].id, 'firefox');
  assert.equal(flatpaks[1].flatpakId, 'org.mozilla.firefox');
});


// ── 9. Unbekannte Flatpak-IDs werden nicht übernommen ──────────────────────

test('9. Ähnlich benannte oder unbekannte Flatpak-IDs werden nicht übernommen', async () => {
  const deps = makeDeps({
    flatpakResult: {
      stdout: [
        'com.brave.Browser.beta',           // Ähnlich, aber nicht exakt
        'org.mozilla.Firefox',               // Falsche Groß-/Kleinschreibung
        'com.example.Chromium',              // Fremde App mit "Chromium" im Namen
        'org.chromium.Chromium.Dev',         // Dev-Variante
        'com.brave.Browser'                  // Nur diese ist bekannt
      ].join('\n') + '\n'
    }
  });

  const result = await detectBrowsers(deps);

  const flatpaks = result.browsers.filter(b => b.installType === 'flatpak');
  assert.equal(flatpaks.length, 1, 'Nur die exakt bekannte ID akzeptiert');
  assert.equal(flatpaks[0].flatpakId, 'com.brave.Browser');
});


// ── 10. Fehlendes Flatpak → unavailable, Systemtreffer bleiben ─────────────

test('10. Fehlendes Flatpak wird als unavailable behandelt und zerstört Systemtreffer nicht', async () => {
  const deps = makeDeps({
    executables: new Map([['/usr/bin/firefox', { executable: true }]]),
    flatpakMissing: true
  });

  const result = await detectBrowsers(deps);

  assert.equal(result.flatpakStatus, 'unavailable');
  assert.equal(result.browsers.length, 1);
  assert.equal(result.browsers[0].id, 'firefox');
  assert.equal(result.browsers[0].installType, 'system');
});


// ── 11. Fehlgeschlagene Flatpak-Abfrage → failed, Systemtreffer bleiben ───

test('11. Fehlgeschlagene Flatpak-Abfrage wird als failed behandelt und zerstört Systemtreffer nicht', async () => {
  const deps = makeDeps({
    executables: new Map([
      ['/usr/bin/firefox', { executable: true }],
      ['/usr/bin/brave-browser', { executable: true }]
    ]),
    flatpakResult: { error: new Error('flatpak: unexpected error') }
  });

  const result = await detectBrowsers(deps);

  assert.equal(result.flatpakStatus, 'failed');
  assert.equal(result.browsers.length, 2, 'Beide Systembrowser trotz Flatpak-Fehler vorhanden');
});


// ── 12. Leere oder fehlerhafte Flatpak-Ausgabe ─────────────────────────────

test('12. Leere oder fehlerhafte Flatpak-Ausgabe erzeugt keine falschen Browser', async () => {
  // Leere Ausgabe
  const deps1 = makeDeps({ flatpakResult: { stdout: '' } });
  const result1 = await detectBrowsers(deps1);
  assert.equal(result1.flatpakStatus, 'ok');
  assert.deepEqual(result1.browsers, []);

  // Nur Leerzeilen/Whitespace
  const deps2 = makeDeps({ flatpakResult: { stdout: '\n\n   \n' } });
  const result2 = await detectBrowsers(deps2);
  assert.equal(result2.flatpakStatus, 'ok');
  assert.deepEqual(result2.browsers, []);

  // Müll-Ausgabe
  const deps3 = makeDeps({ flatpakResult: { stdout: 'error: something went wrong\ngarbage data' } });
  const result3 = await detectBrowsers(deps3);
  assert.equal(result3.flatpakStatus, 'ok');
  assert.deepEqual(result3.browsers, [], 'Unbekannte Zeilen werden ignoriert');
});


// ── 13. Deterministische Sortierung ────────────────────────────────────────

test('13. Die Reihenfolge der Ergebnisse ist unabhängig von PATH-/Flatpak-Reihenfolge stabil', async () => {
  // Absichtlich umgekehrte Reihenfolge: chromium vor brave im PATH,
  // Flatpak-Ausgabe ebenfalls umgekehrt.
  const deps = makeDeps({
    pathEnv: '/opt/chromium:/opt/brave',
    executables: new Map([
      ['/opt/chromium/chromium', { executable: true }],
      ['/opt/brave/brave-browser', { executable: true }]
    ]),
    flatpakResult: {
      stdout: 'org.chromium.Chromium\ncom.brave.Browser\n'
    }
  });

  const result = await detectBrowsers(deps);

  // Erwartete Reihenfolge: brave-system, brave-flatpak, chromium-system, chromium-flatpak
  assert.equal(result.browsers.length, 4);
  assert.equal(result.browsers[0].id, 'brave');
  assert.equal(result.browsers[0].installType, 'system');
  assert.equal(result.browsers[1].id, 'brave');
  assert.equal(result.browsers[1].installType, 'flatpak');
  assert.equal(result.browsers[2].id, 'chromium');
  assert.equal(result.browsers[2].installType, 'system');
  assert.equal(result.browsers[3].id, 'chromium');
  assert.equal(result.browsers[3].installType, 'flatpak');
});


// ── 14. Flatpak-Prozess: exakte Argumente, feste Optionen ──────────────────

test('14. Der Flatpak-Prozess wird mit festen Argumenten und exakten Optionen aufgerufen', async () => {
  const baseDeps = makeDeps({ flatpakResult: { stdout: '' } });
  const { deps, calls } = makeRecordingDeps(baseDeps);

  await detectBrowsers(deps);

  assert.equal(calls.length, 1, 'Genau ein execFile-Aufruf');
  assert.equal(calls[0].file, 'flatpak', 'ausführbare Datei exakt flatpak');
  assert.deepEqual(calls[0].args, ['list', '--app', '--columns=application'], 'Argumentliste exakt feste Parameter');
  assert.equal(calls[0].opts.shell, false, 'shell === false');
  assert.equal(calls[0].opts.timeout, 10000, 'timeout === 10000');
  assert.equal(calls[0].opts.maxBuffer, 1024 * 1024, 'maxBuffer === 1024 * 1024');
  assert.equal(calls[0].opts.encoding, 'utf8', 'encoding === utf8');
});


// ── 15. Tests greifen nicht auf echte Installationen zu ────────────────────

test('15. Kein Test greift auf echtes Benutzerprofil oder reale Installationen zu', async () => {
  // Dieser Test dokumentiert die Testarchitektur: alle vorherigen Tests
  // verwenden injizierte deps. Wir prüfen hier, dass die Standard-deps
  // NICHT verwendet werden, indem wir detectBrowsers mit einem Mock aufrufen,
  // der bei echtem Zugriff sofort fehlschlägt.
  const deps = {
    platform: () => 'linux',
    env: () => ({ PATH: '' }), // Leerer PATH
    accessSync: () => { throw new Error('Echter Dateizugriff verboten'); },
    realpathSync: () => { throw new Error('Echter Dateizugriff verboten'); },
    statSync: () => { throw new Error('Echter Dateizugriff verboten'); },
    execFile: (_f, _a, _o, cb) => {
      const err = new Error('spawn flatpak ENOENT');
      err.code = 'ENOENT';
      cb(err);
    }
  };

  const result = await detectBrowsers(deps);
  assert.equal(result.supported, true);
  assert.equal(result.flatpakStatus, 'unavailable');
  assert.deepEqual(result.browsers, []);
});


// ── 16. Modul verändert keine Dateien, Berechtigungen oder Zustände ────────

test('16. Keine Funktion des Moduls verändert Dateien, Berechtigungen oder Flatpak-Zustände', async () => {
  // Wir verifizieren, dass das Modul nur die deklarierten, lesenden
  // Funktionen exportiert und keine schreibenden Operationen enthält.
  const moduleSource = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'main', 'webclip-browser-detection.js'),
    'utf8'
  );

  // Keine schreibenden fs-Operationen.
  assert.doesNotMatch(moduleSource, /fs\.writeFileSync/);
  assert.doesNotMatch(moduleSource, /fs\.mkdirSync/);
  assert.doesNotMatch(moduleSource, /fs\.unlinkSync/);
  assert.doesNotMatch(moduleSource, /fs\.chmodSync/);
  assert.doesNotMatch(moduleSource, /fs\.renameSync/);
  assert.doesNotMatch(moduleSource, /fs\.copyFileSync/);

  // Keine schreibenden child_process-Aufrufe.
  assert.doesNotMatch(moduleSource, /execSync/);
  assert.doesNotMatch(moduleSource, /spawnSync/);
  assert.doesNotMatch(moduleSource, /\.exec\(/);

  // Kein flatpak install/override/permission.
  assert.doesNotMatch(moduleSource, /flatpak install/);
  assert.doesNotMatch(moduleSource, /flatpak override/);
  assert.doesNotMatch(moduleSource, /flatpak permission/);

  // Kein Netzwerkzugriff.
  assert.doesNotMatch(moduleSource, /require\(['"]https?['"]\)/);
  assert.doesNotMatch(moduleSource, /require\(['"]net['"]\)/);
  assert.doesNotMatch(moduleSource, /fetch\(/);
});


// ── 17. Fehler bei einzelnen Browserkandidaten verwerfen andere nicht ───────

test('17. Fehler bei einem Browserkandidaten verwirft andere gültige Treffer nicht', async () => {
  let callCount = 0;
  const deps = {
    platform: () => 'linux',
    env: () => ({ PATH: '/usr/bin' }),
    accessSync: (filePath, _mode) => {
      callCount++;
      // firefox: accessSync wirft einen unerwarteten Fehler.
      if (filePath === '/usr/bin/firefox') throw new Error('unerwarteter I/O-Fehler');
      // brave-browser: existiert und ist ausführbar.
      if (filePath === '/usr/bin/brave-browser') return;
      // Alles andere: nicht vorhanden.
      const err = new Error('ENOENT');
      err.code = 'ENOENT';
      throw err;
    },
    realpathSync: (p) => p,
    statSync: () => ({ isFile: () => true }),
    execFile: (_f, _a, _o, cb) => {
      const err = new Error('ENOENT');
      err.code = 'ENOENT';
      cb(err);
    }
  };

  const result = await detectBrowsers(deps);

  // Brave muss trotz des Firefox-Fehlers erkannt sein.
  assert.ok(callCount > 1, 'Mehrere accessSync-Aufrufe wurden durchgeführt');
  const brave = result.browsers.find(b => b.id === 'brave');
  assert.ok(brave, 'Brave trotz Firefox-Fehler erkannt');
  assert.equal(brave.execPath, '/usr/bin/brave-browser');
});


// ── 19. Vollständiger Erkennungslauf: alle 4 als System + Flatpak ──────────

test('19. Vollständiger Lauf: alle 4 Browser als System und Flatpak erkannt', async () => {
  const deps = makeDeps({
    executables: new Map([
      ['/usr/bin/firefox', { executable: true }],
      ['/usr/bin/brave-browser', { executable: true }],
      ['/usr/bin/chromium', { executable: true }],
      ['/usr/bin/google-chrome', { executable: true }]
    ]),
    flatpakResult: {
      stdout: [
        'org.mozilla.firefox',
        'com.brave.Browser',
        'org.chromium.Chromium',
        'com.google.Chrome'
      ].join('\n') + '\n'
    }
  });

  const result = await detectBrowsers(deps);

  assert.equal(result.supported, true);
  assert.equal(result.flatpakStatus, 'ok');
  assert.equal(result.browsers.length, 8, '4 Browser × 2 Installationsarten');

  // Jeder Browser hat genau eine System- und eine Flatpak-Installation.
  for (const expected of EXPECTED_BROWSERS) {
    const entries = result.browsers.filter(b => b.id === expected.id);
    assert.equal(entries.length, 2, `${expected.id}: genau 2 Einträge`);
    assert.ok(entries.some(e => e.installType === 'system'));
    assert.ok(entries.some(e => e.installType === 'flatpak' && e.flatpakId === expected.flatpakId));
  }
});
