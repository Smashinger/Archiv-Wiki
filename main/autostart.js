// main/autostart.js
// Verwaltet die Systemeinstellungen für Autostart beim Anmelden sowie
// das minimierte Starten im System-Tray.
//
// Grundsätze dieser Neufassung:
// - Linux nutzt AUSSCHLIESSLICH einen XDG-Autostart-Desktopeintrag, niemals
//   Electrons Login-Item-API (die unter Linux ohnehin kein zuverlässiges
//   Autostart-Verhalten liefert).
// - Windows/macOS nutzen app.setLoginItemSettings().
// - Betriebssystem-Änderung und app-state.json werden als EIN logischer
//   Vorgang behandelt: schlägt das BS fehl, wird nichts persistiert; schlägt
//   die Persistenz fehl, wird die BS-Änderung zurückgerollt. Fehlgeschlagene
//   Änderungen werden NIE als Erfolg gemeldet.
// - Die stabile Desktop-Identität steht an genau einer Stelle (LINUX_DESKTOP_ID)
//   und ist an der Paketierung ausgerichtet, nicht am veränderlichen app.name.

'use strict';

// require('electron') liefert im normalen Electron-Hauptprozess das Objekt mit
// `app`; in einem reinen Node-Prozess (z. B. `node --test`) liefert es nur den
// Pfad zur Electron-Binärdatei (ein String), sodass `app` hier `undefined`
// wird. Alle App-Zugriffe laufen deshalb über die austauschbare `deps`-Schicht
// weiter unten und werden erst zur Laufzeit aufgelöst — das macht das Modul
// ohne laufendes Electron testbar.
let app;
try { ({ app } = require('electron')); } catch { app = undefined; }

const path = require('path');
const fs = require('fs');
const os = require('os');
const appStateModule = require('./app-state');
const { atomicWriteFileSync } = require('./atomic-write');

// ---------------------------------------------------------------------------
// Stabile Identität (Punkt 9)
// ---------------------------------------------------------------------------
// Bewusst NICHT aus dem veränderlichen app.name abgeleitet, sondern fest an der
// Paketierung ausgerichtet: package.json → build.linux.executableName =
// 'archiv-wiki' (electron-builder erzeugt daraus die installierte
// 'archiv-wiki.desktop'), build.appId = 'de.smashii.archivwiki'. Diese eine
// Konstante ist die einzige Quelle der Wahrheit für den Dateinamen des
// Autostart-Eintrags.
const LINUX_DESKTOP_ID = 'archiv-wiki';
const DESKTOP_ENTRY_NAME = 'Archiv-Wiki';
// Alte Fassungen legten den Eintrag als `${app.name}.desktop` an; app.name ist
// die productName 'Archiv-Wiki', der Legacy-Dateiname also fest
// 'Archiv-Wiki.desktop'. Bewusst als KONSTANTE (nicht aus dem veränderlichen
// app.name zur Laufzeit) — so wird ein echter Alt-Eintrag zuverlässig erkannt,
// unabhängig davon, was app.name gerade liefert.
const LEGACY_DESKTOP_ID = DESKTOP_ENTRY_NAME;
// Exakter Kommentar, den sowohl die alte als auch die neue Fassung erzeugt.
// Dient als eines von mehreren Pflicht-Merkmalen der Eigentümerschaft.
const OWNED_COMMENT = 'Archiv-Wiki Autostart';
// Stabiler, anwendungsspezifischer Eigentümer-Marker (gültiger freedesktop
// X-Schlüssel). NEU erzeugte kanonische Einträge tragen ihn IMMER. Er erlaubt,
// einen von uns geschriebenen Eintrag zweifelsfrei zu erkennen, selbst wenn die
// zugrunde liegende AppImage vom Nutzer umbenannt wurde (der APPIMAGE-Pfad darf
// jeden Dateinamen haben). Der Marker ERSETZT keine andere Prüfung — er ist ein
// starkes Signal, kombiniert mit exakter Struktur, Identität und Invocation.
const OWNED_MARKER_KEY = 'X-Archiv-Wiki-Autostart';
const OWNED_MARKER_VALUE = 'true';

// ---------------------------------------------------------------------------
// Austauschbare Abhängigkeiten (nur für Tests überschrieben)
// ---------------------------------------------------------------------------
function defaultDeps() {
  return {
    platform: () => process.platform,
    env: process.env,
    execPath: () => process.execPath,
    getHome: () => {
      try { if (app && typeof app.getPath === 'function') return app.getPath('home'); } catch { /* fallthrough */ }
      return os.homedir();
    },
    getAppPath: () => {
      try { if (app && typeof app.getAppPath === 'function') return app.getAppPath(); } catch { /* fallthrough */ }
      return process.cwd();
    },
    isPackaged: () => Boolean(app && app.isPackaged),
    getAppName: () => (app && app.name) ? app.name : LINUX_DESKTOP_ID,
    readAppState: () => appStateModule.readAppState(),
    writeAppState: (partial) => appStateModule.writeAppState(partial),
    // Löschen als austauschbarer Seam (wie die übrigen deps): erlaubt Tests, ein
    // Lösch-Fehlschlag für einen bestimmten Pfad zu erzwingen. Auf Linux ist ein
    // echter unlink-Fehlschlag sonst nur über einen nicht schreibbaren
    // Elternordner simulierbar — der aber zugleich das kanonische Schreiben im
    // selben Ordner verhindern würde und die Migrations-Rollback-Fälle daher
    // nicht isolierbar macht.
    unlink: (p) => fs.unlinkSync(p),
    setLoginItem: (settings) => {
      if (!app || typeof app.setLoginItemSettings !== 'function') {
        throw new Error('Login-Item-API nicht verfügbar.');
      }
      return app.setLoginItemSettings(settings);
    },
    getLoginItem: () => {
      if (!app || typeof app.getLoginItemSettings !== 'function') return null;
      return app.getLoginItemSettings();
    }
  };
}
let deps = defaultDeps();
function resetDeps() { deps = defaultDeps(); }

function fileExists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

// ---------------------------------------------------------------------------
// XDG-Pfade (Punkt 7)
// ---------------------------------------------------------------------------
// $XDG_CONFIG_HOME nur verwenden, wenn ABSOLUT. Sonst home/.config. Kein
// /tmp-Fallback. Kann kein gültiger Ort ermittelt werden, wird null geliefert
// und der Aufrufer bricht ausdrücklich ab, ohne irgendetwas zu schreiben.
function resolveConfigHome() {
  const xdg = deps.env.XDG_CONFIG_HOME;
  if (typeof xdg === 'string' && xdg.length > 0 && path.isAbsolute(xdg)) {
    return xdg;
  }
  const home = deps.getHome();
  if (typeof home === 'string' && home.length > 0 && path.isAbsolute(home)) {
    return path.join(home, '.config');
  }
  return null;
}

function getAutostartDir() {
  const configHome = resolveConfigHome();
  return configHome ? path.join(configHome, 'autostart') : null;
}

function getAutostartDesktopFilePath() {
  const dir = getAutostartDir();
  if (!dir) {
    throw new Error('Kein gültiger HOME-/XDG_CONFIG_HOME-Pfad auflösbar — Autostart-Datei wird nicht angerührt.');
  }
  return path.join(dir, `${LINUX_DESKTOP_ID}.desktop`);
}

// Legacy-Eintrag, den eine frühere Fassung als 'Archiv-Wiki.desktop' angelegt
// haben kann (fester, dokumentierter Alt-Dateiname — siehe LEGACY_DESKTOP_ID).
function getLegacyDesktopFilePath() {
  const dir = getAutostartDir();
  if (!dir) return null;
  if (`${LEGACY_DESKTOP_ID}.desktop` === `${LINUX_DESKTOP_ID}.desktop`) return null;
  return path.join(dir, `${LEGACY_DESKTOP_ID}.desktop`);
}

// ---------------------------------------------------------------------------
// Desktop-Entry Exec-Serialisierung (Punkt 4)
// ---------------------------------------------------------------------------
// KEIN Shell-Escaping. Serialisierung nach den freedesktop Desktop-Entry
// Exec-Regeln: Jedes Argument wird einzeln in doppelte Anführungszeichen
// gesetzt; innerhalb davon werden \, ", $ und ` mit Backslash geschützt.
// Ein literaler Prozentsatz % wird als %% geschrieben (Feldcode-Escaping).
function quoteExecArgument(arg) {
  const withFieldCodes = String(arg).replace(/%/g, '%%');
  const escaped = withFieldCodes
    .replace(/\\/g, '\\\\') // zuerst: vorhandene Backslashes verdoppeln
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`');
  return `"${escaped}"`;
}

function buildExecValue(command, args) {
  return [command, ...args].map(quoteExecArgument).join(' ');
}

// Umkehrung nur so weit wie nötig: Ersten Token (den Befehl) aus einem von uns
// erzeugten Exec-Wert zurückgewinnen, um Existenz/Zugehörigkeit zu prüfen.
function extractExecCommand(execValue) {
  const s = String(execValue || '').trim();
  if (!s) return '';
  if (s[0] === '"') {
    let out = '';
    let i = 1;
    while (i < s.length) {
      const c = s[i];
      if (c === '\\' && i + 1 < s.length) { out += s[i + 1]; i += 2; continue; }
      if (c === '"') break;
      out += c; i += 1;
    }
    return out.replace(/%%/g, '%');
  }
  const firstSpace = s.indexOf(' ');
  const token = firstSpace === -1 ? s : s.slice(0, firstSpace);
  return token.replace(/%%/g, '%');
}

// Vollständige Zerlegung eines Exec-Werts in einzelne Argumente nach denselben
// (doppelt-quotierten) Regeln, nach denen wir schreiben. Wird für die strenge
// Eigentümerschafts-Prüfung gebraucht (exakte --autostart-Invocation,
// Ausführbaren-Zuordnung). Bewusst eng gehalten — kein allgemeiner Shell-Parser.
function parseExecArgv(execValue) {
  const s = String(execValue || '');
  const args = [];
  let i = 0;
  const n = s.length;
  while (i < n) {
    while (i < n && (s[i] === ' ' || s[i] === '\t')) i += 1;
    if (i >= n) break;
    let token = '';
    if (s[i] === '"') {
      i += 1; // öffnendes Anführungszeichen
      while (i < n) {
        const c = s[i];
        if (c === '\\' && i + 1 < n) { token += s[i + 1]; i += 2; continue; }
        if (c === '"') { i += 1; break; }
        token += c; i += 1;
      }
    } else {
      while (i < n && s[i] !== ' ' && s[i] !== '\t') { token += s[i]; i += 1; }
    }
    args.push(token.replace(/%%/g, '%'));
  }
  return args;
}

// Strenge Variante für die Eigentümerschafts-Prüfung: liefert `null`, wenn die
// Quotierung fehlerhaft/unabgeschlossen ist (offenes Anführungszeichen).
// Bewusst getrennt von parseExecArgv (das nachsichtig bleibt), damit ein
// missgebildeter Exec-Wert niemals fälschlich als eigener Eintrag durchgeht.
function parseExecArgvStrict(execValue) {
  const s = String(execValue || '');
  const args = [];
  let i = 0;
  const n = s.length;
  const isSep = (c) => c === ' ' || c === '\t';
  while (i < n) {
    while (i < n && isSep(s[i])) i += 1;
    if (i >= n) break;
    let token = '';
    if (s[i] === '"') {
      i += 1;
      let closed = false;
      while (i < n) {
        const c = s[i];
        if (c === '\\' && i + 1 < n) { token += s[i + 1]; i += 2; continue; }
        if (c === '"') { i += 1; closed = true; break; }
        token += c; i += 1;
      }
      if (!closed) return null; // unabgeschlossene Quotierung → missgebildet
      // Nach dem schließenden Anführungszeichen ist NUR Whitespace oder das
      // Dateiende zulässig. Der Serializer trennt Argumente immer mit genau
      // einem Leerzeichen; aneinandergrenzende Quotes ("a""b") sind missgebildet.
      if (i < n && !isSep(s[i])) return null;
    } else {
      // Unquotiertes Token: ein Anführungszeichen darf hier nicht auftauchen
      // (unerwartete Quote-Grenze) — der Serializer quotiert stets vollständig.
      while (i < n && !isSep(s[i])) {
        if (s[i] === '"') return null;
        token += s[i]; i += 1;
      }
    }
    args.push(token.replace(/%%/g, '%'));
  }
  return args;
}

// Erkennt die Electron-Binärdatei (nur für die exakte Entwicklungs-Form der
// Eigentümerschaft). In der Entwicklung ist der Befehl process.execPath, dessen
// Basisname 'electron' lautet.
function isElectronBinaryToken(token) {
  if (typeof token !== 'string' || token.length === 0) return false;
  const base = path.basename(token).toLowerCase().replace(/\.exe$/, '');
  return base === 'electron';
}

// ---------------------------------------------------------------------------
// Start-Argumente (Punkt 4 / 10)
// ---------------------------------------------------------------------------
// --autostart IMMER (Start über den Autostart-Eintrag), --hidden NUR bei
// startMinimized.
function buildAutostartArgs(startMinimized) {
  return startMinimized ? ['--hidden', '--autostart'] : ['--autostart'];
}

// ---------------------------------------------------------------------------
// Auflösung der ausführbaren Datei (Punkt 5)
// ---------------------------------------------------------------------------
function isTransientMountPath(p) {
  if (typeof p !== 'string') return false;
  if (p.includes(`${path.sep}.mount_`) || p.includes('/.mount_')) return true;
  const appDir = deps.env.APPDIR;
  if (appDir && path.isAbsolute(appDir) && (p === appDir || p.startsWith(appDir + path.sep))) return true;
  return false;
}

function usableExecutable(p) {
  return typeof p === 'string'
    && p.length > 0
    && path.isAbsolute(p)
    && !isTransientMountPath(p)
    && fileExists(p);
}

function resolveLinuxLaunch() {
  // 1. Echte AppImage: der APPIMAGE-Pfad zeigt auf die stabile .AppImage-Datei
  //    auf der Platte (nicht auf den transienten /tmp/.mount_-Ordner). Nur
  //    verwenden, wenn absolut, vorhanden und nicht transient.
  const appImage = deps.env.APPIMAGE;
  if (appImage && path.isAbsolute(appImage) && !isTransientMountPath(appImage) && fileExists(appImage)) {
    return { command: appImage, prefixArgs: [] };
  }

  const execPath = deps.execPath();

  // 2. Installierte (paketierte) Nicht-AppImage-Builds: execPath ist die stabile
  //    Binärdatei. Ist sie transient/unbrauchbar, klar scheitern statt einen
  //    kaputten Eintrag zu schreiben.
  if (deps.isPackaged()) {
    if (usableExecutable(execPath)) return { command: execPath, prefixArgs: [] };
    throw new Error('Kein stabiler ausführbarer Pfad für den Autostart auflösbar (installierte App, execPath unbrauchbar oder transient).');
  }

  // 3. Entwicklungs-/unpackaged Modus: ausdrücklich definiertes, FUNKTIONIERENDES
  //    Verhalten — die Electron-Binärdatei MIT dem App-Verzeichnis als erstem
  //    Argument, damit der Eintrag nicht nur Electron ohne die Anwendung startet.
  const appPath = deps.getAppPath();
  if (usableExecutable(execPath) && typeof appPath === 'string' && appPath.length > 0 && fileExists(appPath)) {
    return { command: execPath, prefixArgs: [appPath] };
  }
  throw new Error('Kein stabiler ausführbarer Pfad für den Autostart auflösbar (Entwicklungsmodus ohne brauchbare Electron-/App-Pfade).');
}

// ---------------------------------------------------------------------------
// TryExec (Punkt 8) — nur setzen, wenn der Pfad eindeutig unproblematisch ist.
// ---------------------------------------------------------------------------
// TryExec ist KEIN Exec-quoted Feld und kann Leerzeichen/Sonderzeichen nicht
// sicher darstellen. Ein falsch dargestelltes TryExec würde den Eintrag als
// "nicht installiert" gelten lassen und damit ignorieren. Deshalb im Zweifel
// weglassen.
function tryExecFor(command) {
  if (typeof command !== 'string' || command.length === 0) return null;
  if (!path.isAbsolute(command)) return null;
  if (/[\s"'`$\\%=]/.test(command)) return null;
  return command;
}

// ---------------------------------------------------------------------------
// Icon (Punkt 6) — nur ein STABIL installierter Icon-Name, sonst weglassen.
// ---------------------------------------------------------------------------
// Niemals ein Icon in app.asar oder einem transienten AppImage-Mount. Kann
// kein installiertes Icon nachgewiesen werden, wird Icon= bewusst weggelassen
// (gültiger Eintrag, nur ohne Symbol). KEIN zweites Icon-Installationssystem.
function resolveInstalledIconName() {
  try {
    const dataDirs = [];
    const dataHome = deps.env.XDG_DATA_HOME;
    if (dataHome && path.isAbsolute(dataHome)) {
      dataDirs.push(dataHome);
    } else {
      const home = deps.getHome();
      if (home && path.isAbsolute(home)) dataDirs.push(path.join(home, '.local', 'share'));
    }
    dataDirs.push('/usr/share', '/usr/local/share');
    const sizes = ['scalable', '512x512', '256x256', '128x128', '64x64', '48x48', '32x32'];
    const exts = ['png', 'svg'];
    for (const base of dataDirs) {
      for (const size of sizes) {
        for (const ext of exts) {
          const candidate = path.join(base, 'icons', 'hicolor', size, 'apps', `${LINUX_DESKTOP_ID}.${ext}`);
          if (fileExists(candidate)) return LINUX_DESKTOP_ID;
        }
      }
    }
  } catch { /* Icon ist optional */ }
  return null;
}

// ---------------------------------------------------------------------------
// Desktop-Datei erzeugen / lesen
// ---------------------------------------------------------------------------
function buildDesktopFileContent({ execValue, tryExec, iconName }) {
  const lines = [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    `Name=${DESKTOP_ENTRY_NAME}`,
    'Comment=Archiv-Wiki Autostart',
    `Exec=${execValue}`
  ];
  if (tryExec) lines.push(`TryExec=${tryExec}`);
  lines.push('StartupNotify=false', 'Terminal=false');
  if (iconName) lines.push(`Icon=${iconName}`);
  lines.push(
    'Categories=Office;Utility;',
    'X-GNOME-Autostart-enabled=true',
    `${OWNED_MARKER_KEY}=${OWNED_MARKER_VALUE}`, // stabiler Eigentümer-Marker
    ''
  );
  return lines.join('\n');
}

// Eng umrissener Parser (Punkt 8): nur die [Desktop Entry]-Gruppe, key=value,
// erster Treffer gewinnt. KEIN allgemeiner Desktop-Datei-Parser.
function parseDesktopEntry(content) {
  const result = {};
  let inGroup = false;
  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      inGroup = line === '[Desktop Entry]';
      continue;
    }
    if (!inGroup) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || key in result) continue;
    result[key] = line.slice(eq + 1).trim();
  }
  return result;
}

function hasOwnedMarker(parsed) {
  return (parsed[OWNED_MARKER_KEY] || '').trim().toLowerCase() === OWNED_MARKER_VALUE;
}

function isAbsolutePathToken(token) {
  return typeof token === 'string' && token.length > 0 && path.isAbsolute(token);
}

// KONSERVATIVE Erkennung eines UNMARKIERTEN Einzel-Befehls, wie ihn eine frühere
// Fassung erzeugt hat: nur ABSOLUTE Pfade, entweder die exakte installierte
// Binärdatei 'archiv-wiki' oder ein dokumentiertes Archiv-Wiki-AppImage-
// Dateinamenmuster. KEIN "beliebige Endung abschneiden und akzeptieren" — damit
// scheiden /tmp/archiv-wiki.sh, .txt, .desktop, .exe und relative Befehle aus.
function isLegacyArchivWikiExecutable(token) {
  if (!isAbsolutePathToken(token)) return false;
  const base = path.basename(token);
  const lower = base.toLowerCase();
  if (base === LINUX_DESKTOP_ID) return true;                        // installierte Binärdatei, exakt 'archiv-wiki'
  if (lower === `${LINUX_DESKTOP_ID}.appimage`) return true;         // 'archiv-wiki.AppImage'
  if (/^archiv-wiki[-_.][^/]*\.appimage$/.test(lower)) return true;  // 'archiv-wiki-2.2.0.AppImage'
  return false;
}

// KONSERVATIVE Erkennung des UNMARKIERTEN Entwicklungs-App-Pfads: absolut und
// Basisname exakt 'archiv-wiki' (das Projektverzeichnis).
function isLegacyArchivWikiAppPath(token) {
  if (!isAbsolutePathToken(token)) return false;
  return path.basename(token).toLowerCase() === LINUX_DESKTOP_ID;
}

// EINE autoritative Eigentümerschafts-Entscheidung (Punkt 2/3, verschärft): ein
// Eintrag gilt NUR dann als von Archiv-Wiki erzeugt, wenn seine GESAMTE
// Argumentkette exakt einer der Formen entspricht, die der Serializer selbst
// erzeugt — niemals aufgrund eines einzelnen passenden Tokens. Immer nötig:
//   1. Struktur:              Type=Application
//   2. Archiv-Wiki-Identität: Name === 'Archiv-Wiki' UND Comment === OWNED_COMMENT
//   3. wohlgeformte Quotierung (parseExecArgvStrict liefert sonst null)
//   4. exaktes Autostart-Suffix: genau ['--autostart'] oder ['--hidden','--autostart']
//   5. keine zusätzlichen/duplizierten/unbekannten Flags, absolute Pfade
//
// Die AUSFÜHRBAREN-Zuordnung unterscheidet zwei Fälle:
//   • MARKIERT (X-Archiv-Wiki-Autostart=true, von der neuen Fassung geschrieben):
//     ein umbenanntes AppImage ist erlaubt — der Einzelbefehl muss nur ein
//     absoluter Pfad sein; die Entwicklungs-Form electron + absoluter App-Pfad.
//     Der Basisname wird NICHT herangezogen (APPIMAGE darf jeden Namen haben).
//   • UNMARKIERT (ältere Einträge): konservativ auf die dokumentierten Formen
//     beschränkt (exakt 'archiv-wiki', dokumentierte AppImage-Muster, exakte
//     Entwicklungs-Form) — KEINE beliebigen Ausführbaren.
// Bei der geringsten Abweichung → NICHT im Besitz (Datei wird bewahrt). Ein
// falsch-negativ, das eine Datei bewahrt, ist gewollt gegenüber einem
// falsch-positiv, das fremde Dateien anfasst.
function isOwnedArchivWikiEntry(parsed) {
  if (!parsed) return false;
  if ((parsed['Type'] || '') !== 'Application') return false;
  if ((parsed['Name'] || '') !== DESKTOP_ENTRY_NAME) return false;
  if ((parsed['Comment'] || '') !== OWNED_COMMENT) return false;

  const exec = parsed['Exec'] || '';
  if (!exec) return false;
  const argv = parseExecArgvStrict(exec);
  if (!argv) return false; // missgebildete/unabgeschlossene Quotierung

  // Exaktes Autostart-Suffix bestimmen und abtrennen.
  let prefix;
  if (argv.length >= 2 && argv[argv.length - 1] === '--autostart' && argv[argv.length - 2] === '--hidden') {
    prefix = argv.slice(0, argv.length - 2);
  } else if (argv.length >= 1 && argv[argv.length - 1] === '--autostart') {
    prefix = argv.slice(0, argv.length - 1);
  } else {
    return false; // kein exaktes Suffix (falsche Reihenfolge, Duplikate, o. Ä.)
  }

  // Im Präfix sind KEINE Flags erlaubt — dadurch fallen zusätzliche,
  // duplizierte, umgeordnete oder unbekannte Flags weg. Der Serializer erzeugt
  // stets ABSOLUTE Pfade; relative Befehle scheiden damit aus.
  if (prefix.length === 0) return false;
  if (prefix.some(a => a.startsWith('-'))) return false;
  if (!prefix.every(isAbsolutePathToken)) return false;

  const marked = hasOwnedMarker(parsed);

  // Installiert/AppImage: genau ein Token (die Ausführbare/AppImage).
  if (prefix.length === 1) {
    // Markiert: umbenanntes AppImage erlaubt (absoluter Pfad genügt).
    // Unmarkiert: nur dokumentierte Archiv-Wiki-Formen.
    return marked ? true : isLegacyArchivWikiExecutable(prefix[0]);
  }

  // Entwicklung: genau zwei Token — Electron-Binärdatei + Archiv-Wiki-App-Pfad.
  if (prefix.length === 2) {
    if (!isElectronBinaryToken(prefix[0])) return false;
    // Markiert: jeder absolute App-Pfad; Unmarkiert: nur das dokumentierte
    // Projektverzeichnis 'archiv-wiki'.
    return marked ? true : isLegacyArchivWikiAppPath(prefix[1]);
  }

  // Alles andere (willkürliche Zusatzargumente) → nicht im Besitz.
  return false;
}

// Tatsächlichen Zustand ermitteln (Punkt 8), nicht bloß Dateiexistenz.
function inspectAutostartEntry(filePath) {
  if (!filePath || !fileExists(filePath)) return { enabled: false, reason: 'missing' };
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); }
  catch { return { enabled: false, reason: 'unreadable' }; }

  const parsed = parseDesktopEntry(content);
  if ((parsed['Type'] || '') !== 'Application') return { enabled: false, reason: 'bad-type' };
  if (!parsed['Name']) return { enabled: false, reason: 'no-name' };
  const exec = parsed['Exec'] || '';
  if (!exec) return { enabled: false, reason: 'no-exec' };
  if ((parsed['Hidden'] || '').toLowerCase() === 'true') return { enabled: false, reason: 'hidden' };
  if ((parsed['X-GNOME-Autostart-enabled'] || '').toLowerCase() === 'false') {
    return { enabled: false, reason: 'gnome-disabled' };
  }
  if (!isOwnedArchivWikiEntry(parsed)) return { enabled: false, reason: 'unrelated' };

  const command = extractExecCommand(exec);
  if (!command) return { enabled: false, reason: 'no-command' };

  const tryExec = parsed['TryExec'];
  if (tryExec && path.isAbsolute(tryExec) && !fileExists(tryExec)) {
    return { enabled: false, reason: 'tryexec-missing' };
  }
  if (path.isAbsolute(command)) {
    if (isTransientMountPath(command)) return { enabled: false, reason: 'exec-transient' };
    if (!fileExists(command)) return { enabled: false, reason: 'exec-missing' };
  }
  return { enabled: true, reason: 'ok' };
}

// Alle Kandidaten-Pfade eines eigenen Autostart-Eintrags: kanonisch zuerst,
// danach der Legacy-Name 'Archiv-Wiki.desktop'.
function listCandidateEntryPaths() {
  const paths = [];
  try { paths.push(getAutostartDesktopFilePath()); } catch { /* kein gültiger Ort */ }
  try { const legacy = getLegacyDesktopFilePath(); if (legacy) paths.push(legacy); } catch { /* ignore */ }
  return paths;
}

// Erster aktiver, tatsächlich EIGENER Eintrag (kanonisch oder Legacy) oder null.
// Grundlage der Aktiv-Erkennung: nur ein streng als eigen erkannter, nutzbarer
// Eintrag zählt (siehe inspectAutostartEntry → isOwnedArchivWikiEntry).
function getActiveOwnedEntry() {
  for (const p of listCandidateEntryPaths()) {
    if (inspectAutostartEntry(p).enabled) return p;
  }
  return null;
}

function isLinuxAutostartEnabled() {
  return Boolean(getActiveOwnedEntry());
}

// Entfernt filePath NUR, wenn sein Inhalt streng als eigener Eintrag bewiesen
// ist. Rückgaben: 'absent' (nicht vorhanden), 'unreadable' (nicht lesbar →
// Eigentümerschaft nicht beweisbar, wird bewahrt), 'foreign' (fremd → bewahrt),
// 'removed' (war eigen und gelöscht). Wirft NUR, wenn das Löschen eines
// bewiesen eigenen Eintrags fehlschlägt — Fehler werden nicht verschluckt.
function removeOwnedEntry(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return 'absent';
  let parsed;
  try { parsed = parseDesktopEntry(fs.readFileSync(filePath, 'utf8')); }
  catch { return 'unreadable'; }
  if (!isOwnedArchivWikiEntry(parsed)) return 'foreign';
  try { deps.unlink(filePath); }
  catch (err) {
    throw new Error(`Autostart-Eintrag konnte nicht entfernt werden (${path.basename(filePath)}): ${err.message}`);
  }
  return 'removed';
}

// Entfernt einen EIGENEN Legacy-Eintrag im Rahmen der Migration. Fremde oder
// nicht lesbare Legacy-Dateien bleiben unangetastet. Ein Fehlschlag beim
// Löschen eines eigenen Legacy-Eintrags wird NICHT verschluckt, sondern
// weitergereicht.
function removeOwnedLegacyEntry() {
  const legacy = getLegacyDesktopFilePath();
  if (!legacy) return 'absent';
  return removeOwnedEntry(legacy);
}

// ---------------------------------------------------------------------------
// Linux-BS-Änderung (Punkt 2 / 3) — wirft bei Fehlschlag, meldet NIE falschen
// Erfolg. Schreibt die .desktop-Datei atomar (Temp-Datei im selben Ordner +
// rename, inkl. Aufräumen bei Fehler über atomicWriteFileSync).
// ---------------------------------------------------------------------------
function updateLinuxAutostart(enabled, startMinimized) {
  const filePath = getAutostartDesktopFilePath(); // wirft, falls kein gültiger Ort
  const dir = path.dirname(filePath);

  if (!enabled) {
    // ALLE eigenen aktiven Einträge entfernen (kanonisch UND Legacy). Fehler
    // werden nicht verschluckt; bleibt danach ein eigener Eintrag aktiv, ist
    // das ein Fehlschlag — kein falsch gemeldetes "deaktiviert".
    let firstError = null;
    for (const target of listCandidateEntryPaths()) {
      try { removeOwnedEntry(target); }
      catch (err) { if (!firstError) firstError = err; }
    }
    const stillActive = getActiveOwnedEntry();
    if (stillActive) {
      throw firstError || new Error(`Autostart-Eintrag konnte nicht entfernt werden: ${stillActive} ist weiterhin aktiv.`);
    }
    if (firstError) throw firstError; // Löschen schlug fehl → niemals als Erfolg melden
    return;
  }

  // Defekt 1: einen bereits vorhandenen kanonischen Eintrag NICHT blind
  // überschreiben. Vorher prüfen und die Vorbytes für einen möglichen Rollback
  // sichern. Nur ein nachweislich eigener Eintrag darf über den atomaren
  // Schreiber aktualisiert werden; alles Fremde/Uneindeutige/Unlesbare wird
  // byte-genau bewahrt und der Vorgang mit einem Konflikt abgebrochen.
  let previousCanonicalBytes = null; // Buffer der vorherigen EIGENEN Datei (Rollback)
  let canonicalExistedOwned = false;
  if (fs.existsSync(filePath)) {
    let raw;
    try { raw = fs.readFileSync(filePath); }
    catch (err) {
      throw new Error(`Vorhandener kanonischer Autostart-Eintrag ist nicht lesbar und wird NICHT überschrieben: ${filePath}: ${err.message}`);
    }
    if (!isOwnedArchivWikiEntry(parseDesktopEntry(raw.toString('utf8')))) {
      throw new Error(`Am kanonischen Autostart-Pfad liegt ein fremder/uneindeutiger Eintrag — er wird bewahrt und NICHT überschrieben: ${filePath}`);
    }
    previousCanonicalBytes = raw;
    canonicalExistedOwned = true;
  }

  const { command, prefixArgs } = resolveLinuxLaunch(); // wirft, falls kein stabiler Pfad
  const execValue = buildExecValue(command, [...prefixArgs, ...buildAutostartArgs(startMinimized)]);
  const content = buildDesktopFileContent({
    execValue,
    tryExec: tryExecFor(command),
    iconName: resolveInstalledIconName()
  });

  try {
    fs.mkdirSync(dir, { recursive: true });
    atomicWriteFileSync(filePath, content, 'utf8');
  } catch (err) {
    throw new Error(`Autostart-Eintrag konnte nicht geschrieben werden: ${err.message}`);
  }

  // Defekt 3: kanonisches Schreiben und Entfernen des EIGENEN Legacy-Eintrags
  // sind EIN zusammenhängender Vorgang. Schlägt das Legacy-Entfernen fehl, wird
  // der kanonische Pfad exakt auf seinen Vorzustand zurückgesetzt (frisch
  // erzeugte Datei entfernen bzw. vorherige eigene Bytes wiederherstellen),
  // damit niemals BEIDE Einträge aktiv bleiben. Gelingt der Rollback nicht,
  // werden Migrations- UND Rollback-Fehler klar gemeinsam gemeldet.
  try {
    removeOwnedLegacyEntry();
  } catch (migrationErr) {
    try {
      if (canonicalExistedOwned) {
        atomicWriteFileSync(filePath, previousCanonicalBytes); // exakte Vorbytes zurück
      } else if (fs.existsSync(filePath)) {
        deps.unlink(filePath); // frisch erzeugten kanonischen Eintrag entfernen
      }
    } catch (rollbackErr) {
      const combined = new Error(
        `Migration des Legacy-Autostart-Eintrags fehlgeschlagen UND Rücknahme des kanonischen Eintrags fehlgeschlagen. ` +
        `Migration: ${migrationErr.message}; Rücknahme: ${rollbackErr.message}`
      );
      combined.migrationError = migrationErr;
      combined.rollbackError = rollbackErr;
      combined.rollbackSucceeded = false;
      throw combined;
    }
    const e = new Error(`Migration des Legacy-Autostart-Eintrags fehlgeschlagen — kanonischer Eintrag wurde zurückgenommen: ${migrationErr.message}`);
    e.migrationError = migrationErr;
    e.rollbackSucceeded = true;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Windows/macOS-BS-Änderung (Punkt 10)
// ---------------------------------------------------------------------------
// Klar getrennt gehalten, damit der spätere Wegfall von openAsHidden in neueren
// Electron-Versionen genau hier angepasst werden kann, ohne das ganze Modul
// umzuschreiben.
function applyLoginItem(platform, { openAtLogin, startMinimized }) {
  const settings = { openAtLogin };
  if (platform === 'win32') {
    // --autostart bei normalem Start, --hidden --autostart nur bei verstecktem
    // Tray-Start.
    settings.args = buildAutostartArgs(startMinimized);
  } else if (platform === 'darwin') {
    // Electron 28: openAsHidden steuert den versteckten Start unter macOS.
    // (In neueren Electron-Versionen entfällt openAsHidden — dann greift nur
    // noch openAtLogin und ausschließlich diese Zeile müsste angepasst werden.)
    settings.openAsHidden = startMinimized;
  }
  deps.setLoginItem(settings); // wirft, falls API nicht verfügbar
}

// ---------------------------------------------------------------------------
// Öffentliche Lese-/Schreib-API
// ---------------------------------------------------------------------------
function getAutoStartSettings() {
  const state = deps.readAppState();
  const startMinimized = Boolean(state.startMinimized);
  const platform = deps.platform();

  if (platform === 'linux') {
    // Ausschließlich Datei-Inspektion, KEINE Electron-Login-Item-API.
    return { openAtLogin: isLinuxAutostartEnabled(), startMinimized };
  }

  let openAtLogin = Boolean(state.autoStart);
  try {
    const login = deps.getLoginItem();
    if (login && typeof login.openAtLogin === 'boolean') openAtLogin = login.openAtLogin;
  } catch { openAtLogin = Boolean(state.autoStart); }
  return { openAtLogin, startMinimized };
}

function annotate(err, observed) {
  err.autoStart = observed;
  return err;
}

function setAutoStartSettings({ openAtLogin, startMinimized } = {}) {
  const previous = getAutoStartSettings(); // tatsächlich beobachteter Vorzustand
  const nextOpenAtLogin = typeof openAtLogin === 'boolean' ? openAtLogin : previous.openAtLogin;
  const nextStartMinimized = typeof startMinimized === 'boolean' ? startMinimized : previous.startMinimized;
  const platform = deps.platform();

  const applyOs = (open, min) => {
    if (platform === 'linux') updateLinuxAutostart(open, min);
    else applyLoginItem(platform, { openAtLogin: open, startMinimized: min });
  };

  // 1. BS-Änderung ZUERST. Schlägt sie fehl, wird der gewünschte Zustand NICHT
  //    persistiert; zurückgegeben/geworfen wird der tatsächlich beobachtete.
  try {
    applyOs(nextOpenAtLogin, nextStartMinimized);
  } catch (err) {
    throw annotate(
      new Error(`Autostart konnte nicht angewendet werden: ${err.message}`),
      getAutoStartSettings()
    );
  }

  // 2. Persistenz. Schlägt sie fehl, wird die BS-Änderung wieder zurückgerollt.
  try {
    deps.writeAppState({ autoStart: nextOpenAtLogin, startMinimized: nextStartMinimized });
  } catch (persistErr) {
    try { applyOs(previous.openAtLogin, previous.startMinimized); }
    catch (rollbackErr) {
      console.warn('[Archiv Wiki] Rückrollen des Autostart-BS-Zustands nach Persistenzfehler fehlgeschlagen:', rollbackErr.message);
    }
    throw annotate(
      new Error(`Autostart-Einstellung konnte nicht gespeichert werden: ${persistErr.message}`),
      getAutoStartSettings()
    );
  }

  return getAutoStartSettings();
}

// ---------------------------------------------------------------------------
// Fenster-/Tray-Hilfen (Punkt 1) — reine Entscheidungslogik, damit sie ohne
// laufendes Electron testbar ist. main.js verdrahtet sie mit den echten
// Tray-/Fensterobjekten.
// ---------------------------------------------------------------------------
function shouldStartHidden({ argv = [], startMinimized = false, trayAvailable = false } = {}) {
  const wantsHidden = argv.includes('--hidden')
    || argv.includes('--minimized')
    || (argv.includes('--autostart') && Boolean(startMinimized));
  return { wantsHidden, hidden: wantsHidden && Boolean(trayAvailable) };
}

function revealExistingWindow(win) {
  if (!win) return false;
  if (typeof win.isDestroyed === 'function' && win.isDestroyed()) return false;
  if (typeof win.isMinimized === 'function' && win.isMinimized() && typeof win.restore === 'function') {
    win.restore();
  }
  const visible = typeof win.isVisible === 'function' ? win.isVisible() : true;
  if (!visible && typeof win.show === 'function') win.show();
  if (typeof win.focus === 'function') win.focus();
  return true;
}

module.exports = {
  getAutoStartSettings,
  setAutoStartSettings,
  updateLinuxAutostart,
  shouldStartHidden,
  revealExistingWindow,
  // Wiederverwendung / Tests:
  quoteExecArgument,
  buildExecValue,
  extractExecCommand,
  buildAutostartArgs,
  buildDesktopFileContent,
  parseDesktopEntry,
  parseExecArgv,
  parseExecArgvStrict,
  isOwnedArchivWikiEntry,
  isLegacyArchivWikiExecutable,
  inspectAutostartEntry,
  isLinuxAutostartEnabled,
  getActiveOwnedEntry,
  getLegacyDesktopFilePath,
  resolveConfigHome,
  getAutostartDesktopFilePath,
  resolveInstalledIconName,
  tryExecFor,
  LINUX_DESKTOP_ID,
  DESKTOP_ENTRY_NAME,
  OWNED_MARKER_KEY,
  OWNED_MARKER_VALUE,
  __setDeps: (partial) => { Object.assign(deps, partial); return deps; },
  __resetDeps: resetDeps,
  __getDeps: () => deps
};
