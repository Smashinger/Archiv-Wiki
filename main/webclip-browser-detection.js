// main/webclip-browser-detection.js
// Rein lesende, Linux-spezifische Erkennung installierter Browser und ihrer
// Installationsart (System / Flatpak). Dieses Modul verändert keine Dateien,
// Berechtigungen, Flatpak-Zustände oder Native-Messaging-Manifeste. Es führt
// keine Telemetrie ein und überträgt keine Daten.
//
// Alle Dateisystem- und Prozesszugriffe sind über ein deps-Objekt injizierbar,
// damit Tests ausschließlich kontrollierte Ersatzfunktionen verwenden können.

'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

// ── Browserkandidaten ──────────────────────────────────────────────────────
// Abgeleitet aus extension/native-host/install-native-host.sh (TARGETS,
// BRAVE_FLATPAK_ID) und AI_CONTEXT/16_WEB_CLIPPER.md.

const BROWSER_CANDIDATES = Object.freeze([
  {
    id: 'brave',
    name: 'Brave',
    engine: 'chromium',
    systemNames: ['brave-browser', 'brave-browser-stable'],
    flatpakId: 'com.brave.Browser'
  },
  {
    id: 'chromium',
    name: 'Chromium',
    engine: 'chromium',
    systemNames: ['chromium', 'chromium-browser'],
    flatpakId: 'org.chromium.Chromium'
  },
  {
    id: 'firefox',
    name: 'Firefox',
    engine: 'firefox',
    systemNames: ['firefox'],
    flatpakId: 'org.mozilla.firefox'
  },
  {
    id: 'google-chrome',
    name: 'Google Chrome',
    engine: 'chromium',
    systemNames: ['google-chrome', 'google-chrome-stable'],
    flatpakId: 'com.google.Chrome'
  }
]);

// Exakt erlaubte Flatpak-Application-IDs. Nur IDs, die exakt in dieser Menge
// enthalten sind, werden als erkannter Browser akzeptiert.
const KNOWN_FLATPAK_IDS = new Set(
  BROWSER_CANDIDATES.map(b => b.flatpakId)
);

// Umgekehrte Abbildung: Flatpak-ID → Browserkandidat.
const FLATPAK_ID_TO_CANDIDATE = new Map(
  BROWSER_CANDIDATES.map(b => [b.flatpakId, b])
);

// ── Standard-Abhängigkeiten (Produktion) ───────────────────────────────────

const DEFAULT_DEPS = {
  platform: () => process.platform,
  env: () => process.env,
  accessSync: (filePath, mode) => fs.accessSync(filePath, mode),
  realpathSync: (filePath) => fs.realpathSync(filePath),
  statSync: (filePath) => fs.statSync(filePath),
  execFile: (file, args, opts, cb) => childProcess.execFile(file, args, opts, cb)
};

// ── System-PATH-Erkennung ──────────────────────────────────────────────────

function detectSystemBrowsers(deps) {
  const env = typeof deps.env === 'function' ? deps.env() : deps.env;
  const rawPath = (env && env.PATH) || '';
  const dirs = rawPath.split(':').filter(d => d !== '' && path.isAbsolute(d));

  const results = [];
  // Bereits aufgelöste reale Pfade – verhindert Doppelmeldungen durch
  // Symlinks oder mehrere Aliasnamen derselben Installation.
  const seenRealPaths = new Map(); // browserId → Set<realPath>

  for (const candidate of BROWSER_CANDIDATES) {
    const candidateSeen = seenRealPaths.get(candidate.id) || new Set();
    seenRealPaths.set(candidate.id, candidateSeen);
    let found = false;

    for (const dir of dirs) {
      if (found) break;
      for (const name of candidate.systemNames) {
        if (found) break;
        const fullPath = path.join(dir, name);
        try {
          deps.accessSync(fullPath, fs.constants.X_OK);
        } catch {
          // Nicht vorhanden oder nicht ausführbar → nächsten Alias prüfen.
          continue;
        }

        // Symlink-Auflösung: gleicher realer Pfad → Duplikat.
        let realPath;
        try {
          realPath = deps.realpathSync(fullPath);
        } catch {
          // realpathSync kann scheitern (z.B. defekter Symlink, race
          // condition). Nicht abbrechen — nächsten Alias prüfen.
          continue;
        }

        // Nur reguläre Dateien akzeptieren. Ein ausführbares Verzeichnis
        // oder ein anderer Sondereintrag darf niemals als Browser gelten.
        try {
          const stat = deps.statSync(realPath);
          if (!stat.isFile()) continue;
        } catch {
          // statSync-Fehler → Kandidat überspringen, nicht abbrechen.
          continue;
        }

        if (candidateSeen.has(realPath)) continue;
        candidateSeen.add(realPath);

        results.push({
          id: candidate.id,
          name: candidate.name,
          engine: candidate.engine,
          installType: 'system',
          execPath: fullPath
        });
        found = true;
      }
    }
  }

  return results;
}

// ── Flatpak-Erkennung ──────────────────────────────────────────────────────

function detectFlatpakBrowsers(deps) {
  return new Promise((resolve) => {
    // Fester Befehl: flatpak list --app --columns=application
    // Kein Shell, keine zusammengesetzten Argumente.
    const args = ['list', '--app', '--columns=application'];

    try {
      deps.execFile('flatpak', args, {
        shell: false,
        timeout: 10000,
        maxBuffer: 1024 * 1024,
        encoding: 'utf8'
      }, (error, stdout) => {
        if (error) {
          // ENOENT = flatpak nicht installiert.
          if (error.code === 'ENOENT') {
            resolve({ status: 'unavailable', browsers: [] });
          } else {
            resolve({ status: 'failed', browsers: [] });
          }
          return;
        }

        const lines = (stdout || '').split('\n').map(l => l.trim()).filter(Boolean);
        const browsers = [];
        const seenFlatpakIds = new Set();

        for (const line of lines) {
          if (!KNOWN_FLATPAK_IDS.has(line)) continue;
          if (seenFlatpakIds.has(line)) continue;
          seenFlatpakIds.add(line);

          const candidate = FLATPAK_ID_TO_CANDIDATE.get(line);
          if (!candidate) continue;
          browsers.push({
            id: candidate.id,
            name: candidate.name,
            engine: candidate.engine,
            installType: 'flatpak',
            flatpakId: candidate.flatpakId
          });
        }

        resolve({ status: 'ok', browsers });
      });
    } catch {
      // execFile selbst kann synchron werfen (z.B. ungültige Argumente).
      resolve({ status: 'failed', browsers: [] });
    }
  });
}

// ── Sortierung ─────────────────────────────────────────────────────────────

function sortBrowserResults(browsers) {
  return browsers.slice().sort((a, b) => {
    // Primär alphabetisch nach id.
    const idCmp = a.id.localeCompare(b.id);
    if (idCmp !== 0) return idCmp;
    // Sekundär: system vor flatpak.
    if (a.installType === 'system' && b.installType === 'flatpak') return -1;
    if (a.installType === 'flatpak' && b.installType === 'system') return 1;
    return 0;
  });
}

// ── Hauptfunktion ──────────────────────────────────────────────────────────

async function detectBrowsers(overrides) {
  const deps = { ...DEFAULT_DEPS, ...overrides };
  const platform = typeof deps.platform === 'function' ? deps.platform() : deps.platform;

  if (platform !== 'linux') {
    return {
      platform,
      supported: false,
      flatpakStatus: null,
      browsers: []
    };
  }

  // Systemerkennung (synchron, rein lesend über PATH).
  let systemBrowsers = [];
  try {
    systemBrowsers = detectSystemBrowsers(deps);
  } catch {
    // Fehler bei der Systemerkennung → leeres Ergebnis, kein Abbruch.
    systemBrowsers = [];
  }

  // Flatpak-Erkennung (asynchron, rein lesend).
  let flatpakResult;
  try {
    flatpakResult = await detectFlatpakBrowsers(deps);
  } catch {
    flatpakResult = { status: 'failed', browsers: [] };
  }

  const allBrowsers = sortBrowserResults([
    ...systemBrowsers,
    ...flatpakResult.browsers
  ]);

  return {
    platform: 'linux',
    supported: true,
    flatpakStatus: flatpakResult.status,
    browsers: allBrowsers
  };
}

module.exports = {
  detectBrowsers
};
