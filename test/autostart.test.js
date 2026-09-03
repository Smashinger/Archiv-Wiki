// test/autostart.test.js
// Fokussierte Tests für main/autostart.js. Laufen mit dem eingebauten
// Test-Runner von Node (`node --test`), ohne zusätzliche Abhängigkeiten und
// ohne laufendes Electron: die Electron-/Persistenz-/Plattformgrenzen werden
// über die austauschbare deps-Schicht des Moduls gemockt, das Dateisystem
// arbeitet in isolierten Temp-Ordnern. Es wird niemals die echte
// ~/.config/autostart-Datei angefasst.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const autostart = require('../main/autostart');

function makeTmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `aw-autostart-${prefix}-`));
}

function makeExecutable(dir, name = 'archiv-wiki.AppImage') {
  const p = path.join(dir, name);
  fs.writeFileSync(p, '#!/bin/sh\ntrue\n', { mode: 0o755 });
  return p;
}

// In-Memory-Ersatz für app-state, damit Persistenz kontrolliert (und für
// Fehlerfälle absichtlich zum Scheitern) gebracht werden kann.
function makeState(initial = {}) {
  let store = { lastProjectPath: null, ...initial };
  return {
    read: () => ({ ...store }),
    write: (partial) => { store = { ...store, ...partial }; return { ...store }; },
    get: () => ({ ...store })
  };
}

// Standard-Setup: Linux-Plattform, isolierte Temp-Umgebung, gültige AppImage.
function setupLinux({ envOverrides = {}, stateInitial = {}, appImage } = {}) {
  const home = makeTmpDir('home');
  const execDir = makeTmpDir('exec');
  const appImagePath = appImage === null ? undefined : (appImage || makeExecutable(execDir));
  const state = makeState(stateInitial);
  const env = { ...envOverrides };
  if (appImagePath) env.APPIMAGE = appImagePath;
  autostart.__resetDeps();
  autostart.__setDeps({
    platform: () => 'linux',
    env,
    getHome: () => home,
    getAppPath: () => execDir,
    isPackaged: () => false,
    execPath: () => process.execPath,
    getAppName: () => 'archiv-wiki',
    readAppState: state.read,
    writeAppState: state.write,
    setLoginItem: () => { throw new Error('Login-Item unter Linux nicht erlaubt (Testwächter).'); },
    getLoginItem: () => { throw new Error('Login-Item unter Linux nicht erlaubt (Testwächter).'); }
  });
  return { home, execDir, appImagePath, state, env };
}

function desktopPath(home, xdg) {
  const base = xdg && path.isAbsolute(xdg) ? xdg : path.join(home, '.config');
  return path.join(base, 'autostart', 'archiv-wiki.desktop');
}

function legacyDesktopPath(home) {
  return path.join(home, '.config', 'autostart', 'Archiv-Wiki.desktop');
}

// Inhalt eines GENUINE eigenen Eintrags — dieselben Pflicht-Merkmale, die
// Archiv-Wiki erzeugt (Type, Name, exakter Comment, --autostart-Invocation,
// Archiv-Wiki-Ausführbare). exec: Pfad auf eine plausible Archiv-Wiki-Binärdatei.
function ownedEntryContent(exec, { hidden = false } = {}) {
  const flags = hidden ? '"--hidden" "--autostart"' : '"--autostart"';
  return [
    '[Desktop Entry]', 'Type=Application', 'Version=1.0',
    'Name=Archiv-Wiki', 'Comment=Archiv-Wiki Autostart',
    `Exec="${exec}" ${flags}`,
    'StartupNotify=false', 'Terminal=false',
    'Categories=Office;Utility;', 'X-GNOME-Autostart-enabled=true', ''
  ].join('\n');
}

test.afterEach(() => autostart.__resetDeps());

// 1. XDG_CONFIG_HOME unset und relativ ---------------------------------------
test('resolveConfigHome: unset XDG_CONFIG_HOME → home/.config', () => {
  const home = makeTmpDir('home');
  autostart.__setDeps({ env: {}, getHome: () => home });
  assert.equal(autostart.resolveConfigHome(), path.join(home, '.config'));
});

test('resolveConfigHome: relatives XDG_CONFIG_HOME wird ignoriert → home/.config', () => {
  const home = makeTmpDir('home');
  autostart.__setDeps({ env: { XDG_CONFIG_HOME: 'relative/config' }, getHome: () => home });
  assert.equal(autostart.resolveConfigHome(), path.join(home, '.config'));
});

test('resolveConfigHome: absolutes XDG_CONFIG_HOME wird verwendet', () => {
  const home = makeTmpDir('home');
  const xdg = makeTmpDir('xdg');
  autostart.__setDeps({ env: { XDG_CONFIG_HOME: xdg }, getHome: () => home });
  assert.equal(autostart.resolveConfigHome(), xdg);
});

test('kein gültiges Home/Config → getAutostartDesktopFilePath wirft, ohne zu schreiben', () => {
  autostart.__setDeps({ env: {}, getHome: () => '' });
  assert.equal(autostart.resolveConfigHome(), null);
  assert.throws(() => autostart.getAutostartDesktopFilePath(), /Kein gültiger/);
});

// 2. Exec-Serialisierung von Sonderzeichen -----------------------------------
test('quoteExecArgument: Leerzeichen, ", \\, $, `, %', () => {
  assert.equal(autostart.quoteExecArgument('/a b/c'), '"/a b/c"');
  assert.equal(autostart.quoteExecArgument('a"b'), '"a\\"b"');
  assert.equal(autostart.quoteExecArgument('a\\b'), '"a\\\\b"');
  assert.equal(autostart.quoteExecArgument('a$b'), '"a\\$b"');
  assert.equal(autostart.quoteExecArgument('a`b'), '"a\\`b"');
  assert.equal(autostart.quoteExecArgument('a%b'), '"a%%b"');
});

test('buildExecValue: jedes Argument einzeln serialisiert, roundtrip des Befehls', () => {
  const cmd = '/opt/Archiv Wiki/archiv-wiki';
  const value = autostart.buildExecValue(cmd, ['--hidden', '--autostart']);
  assert.equal(value, '"/opt/Archiv Wiki/archiv-wiki" "--hidden" "--autostart"');
  assert.equal(autostart.extractExecCommand(value), cmd);
});

test('extractExecCommand: gibt %% wieder als % zurück', () => {
  const value = autostart.buildExecValue('/x/100%done', ['--autostart']);
  assert.equal(autostart.extractExecCommand(value), '/x/100%done');
});

// 3. Erfolgreiches Ein- und Ausschalten --------------------------------------
test('enable dann disable: Datei entsteht mit korrektem Inhalt und verschwindet', () => {
  const { home, appImagePath } = setupLinux();
  const file = desktopPath(home);

  autostart.updateLinuxAutostart(true, false);
  assert.ok(fs.existsSync(file), 'Datei nach enable vorhanden');
  const content = fs.readFileSync(file, 'utf8');
  assert.match(content, /^\[Desktop Entry\]/);
  assert.match(content, /Type=Application/);
  assert.match(content, /Name=Archiv-Wiki/);
  assert.ok(content.includes(`"${appImagePath}"`), 'Exec enthält die AppImage');
  assert.ok(content.includes('--autostart'), 'Exec enthält --autostart');
  assert.ok(!content.includes('--hidden'), 'kein --hidden ohne startMinimized');
  assert.equal(autostart.isLinuxAutostartEnabled(), true);

  autostart.updateLinuxAutostart(false, false);
  assert.ok(!fs.existsSync(file), 'Datei nach disable entfernt');
  assert.equal(autostart.isLinuxAutostartEnabled(), false);
});

test('setAutoStartSettings enable: OS-Datei geschrieben UND app-state persistiert', () => {
  const { home, state } = setupLinux();
  const result = autostart.setAutoStartSettings({ openAtLogin: true, startMinimized: true });
  assert.equal(result.openAtLogin, true);
  assert.equal(result.startMinimized, true);
  assert.ok(fs.existsSync(desktopPath(home)));
  assert.equal(state.get().autoStart, true);
  assert.equal(state.get().startMinimized, true);
  assert.match(fs.readFileSync(desktopPath(home), 'utf8'), /--hidden/);
});

// 4. Schreibfehler ------------------------------------------------------------
test('Schreibfehler: updateLinuxAutostart wirft, wenn Zielordner nicht anlegbar', () => {
  const { home } = setupLinux();
  // Eine Datei namens "autostart" blockiert das Anlegen des gleichnamigen Ordners.
  const cfgDir = path.join(home, '.config');
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(path.join(cfgDir, 'autostart'), 'ich bin eine Datei, kein Ordner');
  assert.throws(() => autostart.updateLinuxAutostart(true, false), /nicht geschrieben werden/);
});

test('Schreibfehler über setAutoStartSettings: kein Zustand behauptet, kein autoStart persistiert', () => {
  const { home, state } = setupLinux({ stateInitial: { autoStart: false, startMinimized: false } });
  const cfgDir = path.join(home, '.config');
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(path.join(cfgDir, 'autostart'), 'blockiert');
  let thrown = null;
  try { autostart.setAutoStartSettings({ openAtLogin: true }); }
  catch (e) { thrown = e; }
  assert.ok(thrown, 'muss werfen');
  assert.equal(thrown.autoStart.openAtLogin, false, 'beobachteter Zustand bleibt aus');
  assert.equal(state.get().autoStart, false, 'gewünschtes autoStart=true wurde NICHT persistiert');
});

// 5. Entfernfehler ------------------------------------------------------------
test('Entfernfehler: updateLinuxAutostart(false) wirft, wenn ein eigener Eintrag nicht gelöscht werden kann', () => {
  const { home, appImagePath } = setupLinux();
  const file = desktopPath(home);
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  // Ein GENUINE eigener, lesbarer Eintrag, dessen Löschen dennoch fehlschlägt:
  // der enthaltende Ordner wird schreibgeschützt (0o500) → unlink verweigert,
  // Lesen (Eigentümerschaftsprüfung) klappt aber weiterhin.
  fs.writeFileSync(file, ownedEntryContent(appImagePath));
  fs.chmodSync(dir, 0o500);
  try {
    assert.throws(() => autostart.updateLinuxAutostart(false, false), /nicht entfernt werden/);
  } finally {
    fs.chmodSync(dir, 0o700); // Aufräumen ermöglichen
  }
});

// 6. app-state-Schreibfehler NACH OS-Änderung → Rollback ---------------------
test('Persistenzfehler nach enable: OS-Änderung wird zurückgerollt (Datei entfernt)', () => {
  const home = makeTmpDir('home');
  const execDir = makeTmpDir('exec');
  const appImagePath = makeExecutable(execDir);
  autostart.__resetDeps();
  autostart.__setDeps({
    platform: () => 'linux',
    env: { APPIMAGE: appImagePath },
    getHome: () => home,
    getAppPath: () => execDir,
    isPackaged: () => false,
    execPath: () => process.execPath,
    getAppName: () => 'archiv-wiki',
    readAppState: () => ({ autoStart: false, startMinimized: false }),
    writeAppState: () => { throw new Error('Platte voll'); }
  });
  let thrown = null;
  try { autostart.setAutoStartSettings({ openAtLogin: true }); }
  catch (e) { thrown = e; }
  assert.ok(thrown, 'muss werfen');
  assert.match(thrown.message, /nicht gespeichert/);
  assert.ok(!fs.existsSync(desktopPath(home)), 'Datei nach Rollback wieder weg');
  assert.equal(thrown.autoStart.openAtLogin, false, 'beobachteter Zustand = zurückgerollt');
});

// 7. Stale / verschobene AppImage --------------------------------------------
test('inspect: Exec zeigt auf nicht mehr existierende ausführbare Datei → nicht aktiviert', () => {
  const { home } = setupLinux();
  const file = desktopPath(home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Genuine eigener Eintrag, aber die Archiv-Wiki-AppImage existiert nicht mehr.
  fs.writeFileSync(file, ownedEntryContent('/nicht/vorhanden/archiv-wiki.AppImage'));
  assert.equal(autostart.inspectAutostartEntry(file).reason, 'exec-missing');
  assert.equal(autostart.isLinuxAutostartEnabled(), false);
});

test('inspect: Exec zeigt in transienten AppImage-Mount → nicht aktiviert', () => {
  const { home } = setupLinux();
  const file = desktopPath(home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Genuine eigener Eintrag, aber der Exec-Pfad liegt in einem transienten Mount.
  fs.writeFileSync(file, ownedEntryContent('/tmp/.mount_ArchivXYZ/archiv-wiki'));
  const res = autostart.inspectAutostartEntry(file);
  assert.ok(res.reason === 'exec-transient' || res.reason === 'exec-missing');
  assert.equal(res.enabled, false);
});

// 8. Hidden=true --------------------------------------------------------------
test('inspect: Hidden=true → nicht aktiviert', () => {
  const { home, appImagePath } = setupLinux();
  const file = desktopPath(home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, [
    '[Desktop Entry]', 'Type=Application', 'Name=Archiv-Wiki',
    `Exec="${appImagePath}" --autostart`, 'Hidden=true', ''
  ].join('\n'));
  assert.equal(autostart.inspectAutostartEntry(file).reason, 'hidden');
  assert.equal(autostart.isLinuxAutostartEnabled(), false);
});

// 9. Fehlerhafte / fremde Einträge -------------------------------------------
test('inspect: fehlender Type → nicht aktiviert', () => {
  const { home, appImagePath } = setupLinux();
  const file = desktopPath(home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, ['[Desktop Entry]', 'Name=Archiv-Wiki', `Exec="${appImagePath}" --autostart`, ''].join('\n'));
  assert.equal(autostart.inspectAutostartEntry(file).reason, 'bad-type');
});

test('inspect: fremder Eintrag (anderes Programm) → als unrelated abgelehnt', () => {
  const { home } = setupLinux();
  const someExe = makeExecutable(makeTmpDir('other'), 'firefox');
  const file = desktopPath(home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, [
    '[Desktop Entry]', 'Type=Application', 'Name=Firefox', `Exec="${someExe}"`, ''
  ].join('\n'));
  assert.equal(autostart.inspectAutostartEntry(file).reason, 'unrelated');
  assert.equal(autostart.isLinuxAutostartEnabled(), false);
});

test('inspect: Exec fehlt → nicht aktiviert', () => {
  const { home } = setupLinux();
  const file = desktopPath(home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, ['[Desktop Entry]', 'Type=Application', 'Name=Archiv-Wiki', ''].join('\n'));
  assert.equal(autostart.inspectAutostartEntry(file).reason, 'no-exec');
});

// 10. startMinimized=false erzeugt kein --hidden -----------------------------
test('buildAutostartArgs / Datei: startMinimized=false → kein --hidden', () => {
  assert.deepEqual(autostart.buildAutostartArgs(false), ['--autostart']);
  assert.deepEqual(autostart.buildAutostartArgs(true), ['--hidden', '--autostart']);
  const { home } = setupLinux();
  autostart.updateLinuxAutostart(true, false);
  assert.ok(!fs.readFileSync(desktopPath(home), 'utf8').includes('--hidden'));
});

// 11. Tray-Fehlschlag erzwingt sichtbares Fenster ----------------------------
test('shouldStartHidden: verstecktes Starten nur mit nutzbarem Tray', () => {
  assert.deepEqual(
    autostart.shouldStartHidden({ argv: ['--hidden'], trayAvailable: false }),
    { wantsHidden: true, hidden: false }
  );
  assert.deepEqual(
    autostart.shouldStartHidden({ argv: ['--hidden'], trayAvailable: true }),
    { wantsHidden: true, hidden: true }
  );
  assert.deepEqual(
    autostart.shouldStartHidden({ argv: ['--autostart'], startMinimized: true, trayAvailable: false }),
    { wantsHidden: true, hidden: false }
  );
  assert.deepEqual(
    autostart.shouldStartHidden({ argv: ['--autostart'], startMinimized: false, trayAvailable: true }),
    { wantsHidden: false, hidden: false }
  );
});

// 12. Zweiter Start holt vorhandenes verstecktes Fenster ---------------------
test('revealExistingWindow: minimiertes/verstecktes Fenster wird wiederhergestellt, gezeigt, fokussiert', () => {
  const calls = [];
  const win = {
    _visible: false, _min: true,
    isDestroyed: () => false,
    isMinimized() { return this._min; },
    isVisible() { return this._visible; },
    restore() { calls.push('restore'); this._min = false; },
    show() { calls.push('show'); this._visible = true; },
    focus() { calls.push('focus'); }
  };
  assert.equal(autostart.revealExistingWindow(win), true);
  assert.deepEqual(calls, ['restore', 'show', 'focus']);
});

test('revealExistingWindow: zerstörtes/fehlendes Fenster → keine Aktion', () => {
  assert.equal(autostart.revealExistingWindow(null), false);
  assert.equal(autostart.revealExistingWindow({ isDestroyed: () => true }), false);
});

// 13. Plattform-Verzweigung nutzt unter Linux KEINE Login-Item-API -----------
test('Linux: weder get- noch setLoginItem werden aufgerufen', () => {
  const home = makeTmpDir('home');
  const execDir = makeTmpDir('exec');
  const appImagePath = makeExecutable(execDir);
  let loginCalls = 0;
  const state = makeState({ autoStart: false, startMinimized: false });
  autostart.__resetDeps();
  autostart.__setDeps({
    platform: () => 'linux',
    env: { APPIMAGE: appImagePath },
    getHome: () => home,
    getAppPath: () => execDir,
    isPackaged: () => false,
    execPath: () => process.execPath,
    getAppName: () => 'archiv-wiki',
    readAppState: state.read,
    writeAppState: state.write,
    setLoginItem: () => { loginCalls += 1; },
    getLoginItem: () => { loginCalls += 1; return { openAtLogin: true }; }
  });
  autostart.getAutoStartSettings();
  autostart.setAutoStartSettings({ openAtLogin: true, startMinimized: true });
  assert.equal(loginCalls, 0, 'Login-Item-API darf unter Linux nie aufgerufen werden');
});

// 14. Windows-Argumente unterscheiden normalen und versteckten Start ----------
test('Windows: args = [--autostart] normal, [--hidden, --autostart] versteckt', () => {
  const captured = [];
  const state = makeState({ autoStart: false, startMinimized: false });
  autostart.__resetDeps();
  autostart.__setDeps({
    platform: () => 'win32',
    readAppState: state.read,
    writeAppState: state.write,
    setLoginItem: (s) => captured.push(s),
    getLoginItem: () => ({ openAtLogin: state.get().autoStart || false })
  });

  autostart.setAutoStartSettings({ openAtLogin: true, startMinimized: false });
  assert.deepEqual(captured.at(-1).args, ['--autostart']);
  assert.equal(captured.at(-1).openAtLogin, true);

  autostart.setAutoStartSettings({ openAtLogin: true, startMinimized: true });
  assert.deepEqual(captured.at(-1).args, ['--hidden', '--autostart']);
});

test('macOS: openAsHidden folgt startMinimized (Electron 28)', () => {
  const captured = [];
  const state = makeState({ autoStart: false, startMinimized: false });
  autostart.__resetDeps();
  autostart.__setDeps({
    platform: () => 'darwin',
    readAppState: state.read,
    writeAppState: state.write,
    setLoginItem: (s) => captured.push(s),
    getLoginItem: () => ({ openAtLogin: false })
  });
  autostart.setAutoStartSettings({ openAtLogin: true, startMinimized: true });
  assert.equal(captured.at(-1).openAsHidden, true);
  assert.equal(captured.at(-1).openAtLogin, true);
  assert.ok(!('args' in captured.at(-1)), 'macOS setzt keine Windows-args');
});

// Zusatz: Legacy-Migration (gestärkt) ----------------------------------------
test('Migration: GENUINE eigener Legacy-Eintrag wird beim Schreiben über den kanonischen Pfad entfernt', () => {
  const { home } = setupLinux();
  const dir = path.join(home, '.config', 'autostart');
  fs.mkdirSync(dir, { recursive: true });
  const legacy = legacyDesktopPath(home);
  fs.writeFileSync(legacy, ownedEntryContent('/opt/archiv-wiki/archiv-wiki'));
  autostart.updateLinuxAutostart(true, false);
  assert.ok(!fs.existsSync(legacy), 'eigener Legacy-Eintrag entfernt');
  assert.ok(fs.existsSync(desktopPath(home)), 'kanonischer Eintrag über den sicheren Schreibpfad vorhanden');
});

test('Migration: fremder Legacy-Eintrag mit gleichem Dateinamen bleibt unangetastet', () => {
  const { home } = setupLinux();
  const dir = path.join(home, '.config', 'autostart');
  fs.mkdirSync(dir, { recursive: true });
  const foreign = legacyDesktopPath(home);
  fs.writeFileSync(foreign, ['[Desktop Entry]', 'Type=Application', 'Name=Etwas ganz anderes', 'Exec="/usr/bin/other"', ''].join('\n'));
  autostart.updateLinuxAutostart(true, false);
  assert.ok(fs.existsSync(foreign), 'fremder Eintrag NICHT gelöscht');
});

// ===========================================================================
// Korrekturblock: Legacy-Erkennung, strenge Eigentümerschaft, Entfern-Fehler
// ===========================================================================

// L1. Legacy-only aktiver Zustand → Autostart gilt als aktiviert -------------
test('Legacy-only: gültiger eigener Archiv-Wiki.desktop ohne kanonischen Eintrag → Autostart aktiviert', () => {
  const { home, appImagePath, state } = setupLinux();
  const dir = path.join(home, '.config', 'autostart');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(legacyDesktopPath(home), ownedEntryContent(appImagePath));
  assert.ok(!fs.existsSync(desktopPath(home)), 'kanonischer Eintrag existiert bewusst nicht');
  assert.equal(autostart.isLinuxAutostartEnabled(), true, 'Legacy-Aktivzustand wird erkannt');
  // Die Settings-API darf NICHT "aus" melden, während der Legacy-Eintrag startet.
  state.write({ autoStart: false });
  assert.equal(autostart.getAutoStartSettings().openAtLogin, true);
});

// L2. Erfolgreiches Deaktivieren entfernt den Legacy-Eintrag -----------------
test('Legacy disable: Deaktivieren entfernt den eigenen Legacy-Eintrag und meldet deaktiviert', () => {
  const { home, appImagePath } = setupLinux();
  const dir = path.join(home, '.config', 'autostart');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(legacyDesktopPath(home), ownedEntryContent(appImagePath));
  assert.equal(autostart.isLinuxAutostartEnabled(), true);

  const result = autostart.setAutoStartSettings({ openAtLogin: false });
  assert.equal(result.openAtLogin, false);
  assert.ok(!fs.existsSync(legacyDesktopPath(home)), 'Legacy-Eintrag entfernt');
  assert.equal(autostart.isLinuxAutostartEnabled(), false);
});

// L3. Legacy-Löschfehler → kein falscher Erfolg ------------------------------
test('Legacy delete failure: Deaktivieren wirft und meldet NICHT fälschlich deaktiviert', () => {
  const { home, appImagePath, state } = setupLinux({ stateInitial: { autoStart: true, startMinimized: false } });
  const dir = path.join(home, '.config', 'autostart');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(legacyDesktopPath(home), ownedEntryContent(appImagePath));
  fs.chmodSync(dir, 0o500); // unlink verweigert, Lesen weiter möglich
  let thrown = null;
  try {
    try { autostart.setAutoStartSettings({ openAtLogin: false }); }
    catch (e) { thrown = e; }
    assert.ok(thrown, 'muss werfen');
    assert.match(thrown.message, /nicht entfernt werden|weiterhin aktiv/);
    assert.equal(thrown.autoStart.openAtLogin, true, 'beobachteter Zustand bleibt AKTIV (kein Falsch-Aus)');
    assert.equal(state.get().autoStart, true, 'gewünschtes autoStart=false NICHT persistiert');
    assert.ok(fs.existsSync(legacyDesktopPath(home)), 'Legacy-Eintrag bleibt (Löschen scheiterte)');
  } finally {
    fs.chmodSync(dir, 0o700);
  }
});

// L4. Fremder Eintrag mit --autostart → nie als eigen, nie gelöscht ----------
test('Foreign --autostart: misleitender Fremdeintrag wird nicht als eigen erkannt und nicht gelöscht', () => {
  const { home } = setupLinux();
  const dir = path.join(home, '.config', 'autostart');
  fs.mkdirSync(dir, { recursive: true });
  // Fremd: anderer Name, anderer Comment, fremde Ausführbare — aber mit --autostart.
  const foreign = legacyDesktopPath(home);
  fs.writeFileSync(foreign, [
    '[Desktop Entry]', 'Type=Application', 'Name=Nextcloud',
    'Comment=Nextcloud desktop sync client', 'Exec="/usr/bin/nextcloud" --autostart', ''
  ].join('\n'));
  assert.equal(autostart.isOwnedArchivWikiEntry(autostart.parseDesktopEntry(fs.readFileSync(foreign, 'utf8'))), false);
  assert.equal(autostart.isLinuxAutostartEnabled(), false, 'fremder --autostart-Eintrag zählt nicht als aktiv');
  // Deaktivieren darf ihn nicht anrühren.
  autostart.updateLinuxAutostart(false, false);
  assert.ok(fs.existsSync(foreign), 'fremder Eintrag bleibt unangetastet');
});

// L5. Sonstige irreführende Teiltreffer werden abgelehnt und bewahrt ---------
test('Partial matches: name-only / substring-only / invocation-only werden NICHT als eigen erkannt', () => {
  const appImage = makeExecutable(makeTmpDir('exec2'));
  const P = autostart.parseDesktopEntry;
  const owned = autostart.isOwnedArchivWikiEntry;

  // Nur Name-Treffer (kein Comment, keine --autostart-Invocation, fremde Exec).
  assert.equal(owned(P([
    '[Desktop Entry]', 'Type=Application', 'Name=Archiv-Wiki', 'Exec="/usr/bin/firefox"', ''
  ].join('\n'))), false);

  // Nur 'archiv-wiki'-Substring irgendwo (falscher Name/Comment).
  assert.equal(owned(P([
    '[Desktop Entry]', 'Type=Application', 'Name=Notizen', 'Comment=siehe archiv-wiki docs',
    'Exec="/usr/bin/other" --autostart', ''
  ].join('\n'))), false);

  // Korrekte Identität, aber KEIN --autostart (nur --hidden) → keine Invocation.
  assert.equal(owned(P([
    '[Desktop Entry]', 'Type=Application', 'Name=Archiv-Wiki', 'Comment=Archiv-Wiki Autostart',
    `Exec="${appImage}" "--hidden"`, ''
  ].join('\n'))), false);

  // Korrekte Identität + --autostart, aber Exec verweist NICHT auf Archiv-Wiki.
  assert.equal(owned(P([
    '[Desktop Entry]', 'Type=Application', 'Name=Archiv-Wiki', 'Comment=Archiv-Wiki Autostart',
    'Exec="/usr/bin/firefox" --autostart', ''
  ].join('\n'))), false);

  // Vollständige, korrekte Belege → eigen.
  assert.equal(owned(P(ownedEntryContent(appImage))), true);
  assert.equal(owned(P(ownedEntryContent(appImage, { hidden: true }))), true);
});

// L6. Kanonisch + Legacy koexistieren ----------------------------------------
test('Koexistenz: Deaktivieren entfernt BEIDE eigenen Einträge', () => {
  const { home, appImagePath } = setupLinux();
  const dir = path.join(home, '.config', 'autostart');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(desktopPath(home), ownedEntryContent(appImagePath));
  fs.writeFileSync(legacyDesktopPath(home), ownedEntryContent(appImagePath));
  assert.equal(autostart.isLinuxAutostartEnabled(), true);

  autostart.updateLinuxAutostart(false, false);
  assert.ok(!fs.existsSync(desktopPath(home)), 'kanonischer Eintrag entfernt');
  assert.ok(!fs.existsSync(legacyDesktopPath(home)), 'Legacy-Eintrag entfernt');
  assert.equal(autostart.isLinuxAutostartEnabled(), false);
});

test('Koexistenz: Aktivieren schreibt kanonisch und entfernt den eigenen Legacy-Eintrag', () => {
  const { home, appImagePath } = setupLinux();
  const dir = path.join(home, '.config', 'autostart');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(legacyDesktopPath(home), ownedEntryContent(appImagePath));

  autostart.updateLinuxAutostart(true, false);
  assert.ok(fs.existsSync(desktopPath(home)), 'kanonischer Eintrag geschrieben');
  assert.ok(!fs.existsSync(legacyDesktopPath(home)), 'eigener Legacy-Eintrag migriert/entfernt');
});

// L7. Exec-Tokenizer ----------------------------------------------------------
test('parseExecArgv: zerlegt quotierte Argumente und entschärft %% korrekt', () => {
  assert.deepEqual(
    autostart.parseExecArgv('"/opt/Archiv Wiki/archiv-wiki" "--hidden" "--autostart"'),
    ['/opt/Archiv Wiki/archiv-wiki', '--hidden', '--autostart']
  );
  assert.deepEqual(
    autostart.parseExecArgv('/usr/bin/x --autostart'),
    ['/usr/bin/x', '--autostart']
  );
  assert.deepEqual(autostart.parseExecArgv('"/x/100%%done" "--autostart"'), ['/x/100%done', '--autostart']);
});

// ===========================================================================
// Zweite Korrektur: Kanonische Kollision, strenge Befehlsformen, Migrations-
// Rollback (Codex-Defekte 1–3)
// ===========================================================================

// --- Defekt 1: Aktivieren überschreibt keinen fremden kanonischen Eintrag ----
test('D1: Aktivieren über fremden kanonischen Eintrag → Konflikt, Datei byte-genau bewahrt, nichts persistiert', () => {
  const { home, state } = setupLinux();
  const dir = path.join(home, '.config', 'autostart');
  fs.mkdirSync(dir, { recursive: true });
  const foreignBytes = [
    '[Desktop Entry]', 'Type=Application', 'Name=Ein anderes Programm',
    'Comment=Nicht Archiv-Wiki', 'Exec="/usr/bin/foreign" --autostart', ''
  ].join('\n');
  fs.writeFileSync(desktopPath(home), foreignBytes);

  let thrown = null;
  try { autostart.setAutoStartSettings({ openAtLogin: true }); }
  catch (e) { thrown = e; }
  assert.ok(thrown, 'muss werfen');
  assert.match(thrown.message, /fremder\/uneindeutiger Eintrag|nicht überschrieben/);
  assert.equal(fs.readFileSync(desktopPath(home), 'utf8'), foreignBytes, 'fremde Datei unverändert (byte-genau)');
  assert.equal(state.get().autoStart, undefined, 'gewünschtes autoStart NICHT persistiert');
});

test('D1: Aktivieren über eigenen kanonischen Eintrag → Aktualisierung erlaubt', () => {
  const { home, appImagePath } = setupLinux();
  const dir = path.join(home, '.config', 'autostart');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(desktopPath(home), ownedEntryContent(appImagePath)); // eigener Bestand
  autostart.updateLinuxAutostart(true, true); // auf versteckt umstellen
  const content = fs.readFileSync(desktopPath(home), 'utf8');
  assert.match(content, /--hidden/);
  assert.equal(autostart.isLinuxAutostartEnabled(), true);
});

test('D1: unlesbarer kanonischer Eintrag → Konflikt, wird nicht überschrieben', () => {
  const { home, state } = setupLinux();
  const dir = path.join(home, '.config', 'autostart');
  fs.mkdirSync(dir, { recursive: true });
  const file = desktopPath(home);
  fs.writeFileSync(file, 'irgendein bestehender Inhalt');
  fs.chmodSync(file, 0o000); // nicht lesbar (als Nicht-root)
  try {
    let thrown = null;
    try { autostart.setAutoStartSettings({ openAtLogin: true }); }
    catch (e) { thrown = e; }
    assert.ok(thrown, 'muss werfen');
    assert.match(thrown.message, /nicht lesbar|nicht überschrieben/);
    assert.ok(fs.existsSync(file), 'Datei bleibt erhalten');
    assert.equal(state.get().autoStart, undefined, 'nichts persistiert');
  } finally {
    fs.chmodSync(file, 0o600);
    assert.equal(fs.readFileSync(file, 'utf8'), 'irgendein bestehender Inhalt', 'Inhalt unverändert');
  }
});

// --- Defekt 2: strenge Befehlsformen ----------------------------------------
const P = (s) => autostart.parseDesktopEntry(s);
const ownedWithExec = (execLine, { name = 'Archiv-Wiki', comment = 'Archiv-Wiki Autostart' } = {}) =>
  [
    '[Desktop Entry]', 'Type=Application', 'Version=1.0',
    `Name=${name}`, `Comment=${comment}`, `Exec=${execLine}`,
    'StartupNotify=false', 'Terminal=false', 'Categories=Office;Utility;',
    'X-GNOME-Autostart-enabled=true', ''
  ].join('\n');

test('D2 negativ: fremde Ausführbare + /tmp/archiv-wiki + --autostart ist NICHT eigen', () => {
  // Exakte Codex-Reproduktion.
  assert.equal(autostart.isOwnedArchivWikiEntry(P(ownedWithExec(
    '"/usr/bin/foreign-program" "/tmp/archiv-wiki" "--autostart"'
  ))), false);
});

test('D2 negativ: weitere irreführende Befehlsformen werden abgelehnt', () => {
  const owned = autostart.isOwnedArchivWikiEntry;
  const exec = '/opt/archiv-wiki/archiv-wiki';
  // zusätzliches Nicht-Flag-Argument
  assert.equal(owned(P(ownedWithExec(`"${exec}" "/tmp/extra" "--autostart"`))), false);
  // dupliziertes --autostart
  assert.equal(owned(P(ownedWithExec(`"${exec}" "--autostart" "--autostart"`))), false);
  // dupliziertes --hidden
  assert.equal(owned(P(ownedWithExec(`"${exec}" "--hidden" "--hidden" "--autostart"`))), false);
  // umgeordnete Flags
  assert.equal(owned(P(ownedWithExec(`"${exec}" "--autostart" "--hidden"`))), false);
  // unbekanntes Flag
  assert.equal(owned(P(ownedWithExec(`"${exec}" "--foo" "--autostart"`))), false);
  // Feldcode als Zusatzargument
  assert.equal(owned(P(ownedWithExec(`"${exec}" "%U" "--autostart"`))), false);
  // missgebildete/unabgeschlossene Quotierung
  assert.equal(owned(P(ownedWithExec(`"${exec} --autostart`))), false);
});

test('D2 positiv: exakt erzeugte Formen bleiben erkannt', () => {
  const owned = autostart.isOwnedArchivWikiEntry;
  // installierte Binärdatei, normal + versteckt
  assert.equal(owned(P(ownedWithExec('"/opt/archiv-wiki/archiv-wiki" "--autostart"'))), true);
  assert.equal(owned(P(ownedWithExec('"/opt/archiv-wiki/archiv-wiki" "--hidden" "--autostart"'))), true);
  // AppImage, normal + versteckt
  assert.equal(owned(P(ownedWithExec('"/home/u/Archiv-Wiki-2.2.0.AppImage" "--autostart"'))), true);
  assert.equal(owned(P(ownedWithExec('"/home/u/Archiv-Wiki-2.2.0.AppImage" "--hidden" "--autostart"'))), true);
  // Entwicklungsform: electron + App-Pfad
  assert.equal(owned(P(ownedWithExec('"/proj/node_modules/electron/dist/electron" "/proj/archiv-wiki" "--autostart"'))), true);
  assert.equal(owned(P(ownedWithExec('"/proj/node_modules/electron/dist/electron" "/proj/archiv-wiki" "--hidden" "--autostart"'))), true);
});

test('D2: Entwicklungsform nur mit echter Electron-Binärdatei als erstem Token', () => {
  const owned = autostart.isOwnedArchivWikiEntry;
  // fremde erste Binärdatei → abgelehnt (verhindert die Codex-Fremdform)
  assert.equal(owned(P(ownedWithExec('"/usr/bin/foreign-program" "/proj/archiv-wiki" "--autostart"'))), false);
  // electron + fremder zweiter Pfad → abgelehnt
  assert.equal(owned(P(ownedWithExec('"/x/electron" "/tmp/not-us" "--autostart"'))), false);
});

test('D2: fremder Eintrag mit mehrteiliger Befehlsform wird bei disable NICHT gelöscht', () => {
  const { home } = setupLinux();
  const dir = path.join(home, '.config', 'autostart');
  fs.mkdirSync(dir, { recursive: true });
  const foreign = legacyDesktopPath(home);
  fs.writeFileSync(foreign, ownedWithExec('"/usr/bin/foreign-program" "/tmp/archiv-wiki" "--autostart"'));
  autostart.updateLinuxAutostart(false, false);
  assert.ok(fs.existsSync(foreign), 'fremder mehrteiliger Eintrag bleibt erhalten');
});

test('D2: parseExecArgvStrict meldet unabgeschlossene Quotierung als null', () => {
  assert.equal(autostart.parseExecArgvStrict('"/x/archiv-wiki --autostart'), null);
  assert.deepEqual(autostart.parseExecArgvStrict('"/x" "--autostart"'), ['/x', '--autostart']);
});

// --- Defekt 3: Migrations-Löschfehler → Rollback des kanonischen Eintrags ----
function setupLinuxWithUnlinkFailure(failBasenames) {
  const home = makeTmpDir('home');
  const execDir = makeTmpDir('exec');
  const appImagePath = makeExecutable(execDir);
  const state = makeState({ autoStart: false, startMinimized: false });
  autostart.__resetDeps();
  autostart.__setDeps({
    platform: () => 'linux',
    env: { APPIMAGE: appImagePath },
    getHome: () => home,
    getAppPath: () => execDir,
    isPackaged: () => false,
    execPath: () => process.execPath,
    getAppName: () => 'archiv-wiki',
    readAppState: state.read,
    writeAppState: state.write,
    unlink: (p) => {
      if (failBasenames.includes(path.basename(p))) {
        throw new Error(`erzwungener Lösch-Fehler: ${path.basename(p)}`);
      }
      return fs.unlinkSync(p);
    }
  });
  return { home, execDir, appImagePath, state };
}

test('D3: Legacy-Löschfehler nach kanonischem Schreiben → Rollback, kein Doppel-Eintrag', () => {
  const { home, appImagePath, state } = setupLinuxWithUnlinkFailure(['Archiv-Wiki.desktop']);
  const dir = path.join(home, '.config', 'autostart');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(legacyDesktopPath(home), ownedEntryContent(appImagePath)); // gültiger eigener Legacy
  assert.ok(!fs.existsSync(desktopPath(home)), 'kanonisch existiert vorher nicht');

  let thrown = null;
  try { autostart.setAutoStartSettings({ openAtLogin: true }); }
  catch (e) { thrown = e; }
  assert.ok(thrown, 'muss werfen');
  assert.match(thrown.message, /Migration/);
  assert.equal(state.get().autoStart, false, 'gewünschtes autoStart=true NICHT persistiert');
  assert.ok(!fs.existsSync(desktopPath(home)), 'frisch erzeugter kanonischer Eintrag zurückgenommen');
  assert.ok(fs.existsSync(legacyDesktopPath(home)), 'Legacy-Eintrag bleibt (Löschen scheiterte)');
  // Kein Zustand mit ZWEI aktiven Einträgen: nur der Legacy ist noch da.
  assert.equal(fs.existsSync(desktopPath(home)), false);
});

test('D3: vorbestehender EIGENER kanonischer Eintrag wird byte-genau wiederhergestellt', () => {
  const { home, appImagePath, state } = setupLinuxWithUnlinkFailure(['Archiv-Wiki.desktop']);
  const dir = path.join(home, '.config', 'autostart');
  fs.mkdirSync(dir, { recursive: true });
  const originalCanonical = ownedEntryContent(appImagePath); // normal (kein --hidden)
  fs.writeFileSync(desktopPath(home), originalCanonical);
  fs.writeFileSync(legacyDesktopPath(home), ownedEntryContent(appImagePath));

  let thrown = null;
  try { autostart.updateLinuxAutostart(true, true); } // versucht auf versteckt umzuschreiben
  catch (e) { thrown = e; }
  assert.ok(thrown, 'muss werfen');
  assert.equal(thrown.rollbackSucceeded, true, 'Rollback als erfolgreich gemeldet');
  assert.equal(fs.readFileSync(desktopPath(home), 'utf8'), originalCanonical, 'kanonische Vorbytes exakt wiederhergestellt');
  assert.ok(fs.existsSync(legacyDesktopPath(home)), 'Legacy bleibt');
});

test('D3: schlägt auch der Rollback fehl, werden BEIDE Fehler klar gemeldet', () => {
  // Sowohl Legacy- als auch kanonischer unlink schlagen fehl → kombinierter Fehler.
  const { home, appImagePath } = setupLinuxWithUnlinkFailure(['Archiv-Wiki.desktop', 'archiv-wiki.desktop']);
  const dir = path.join(home, '.config', 'autostart');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(legacyDesktopPath(home), ownedEntryContent(appImagePath));
  assert.ok(!fs.existsSync(desktopPath(home)));

  let thrown = null;
  try { autostart.updateLinuxAutostart(true, false); }
  catch (e) { thrown = e; }
  assert.ok(thrown, 'muss werfen');
  assert.equal(thrown.rollbackSucceeded, false, 'Rollback als fehlgeschlagen gemeldet');
  assert.match(thrown.message, /Migration/);
  assert.match(thrown.message, /Rücknahme/);
  assert.ok(thrown.migrationError && thrown.rollbackError, 'beide Einzelfehler beigefügt');
});

// ===========================================================================
// Dritte Korrektur: Eigentümer-Marker (umbenannte AppImage), konservative
// unmarkierte Erkennung, strengere Quotierung (Codex-Defekte 1–3)
// ===========================================================================

const MARKER_LINE = `${autostart.OWNED_MARKER_KEY}=${autostart.OWNED_MARKER_VALUE}`;

// Markierter Eintrag (neue Fassung): wie ownedWithExec, aber MIT Marker.
function markedWithExec(execLine, { name = 'Archiv-Wiki', comment = 'Archiv-Wiki Autostart', type = 'Application', extra = [] } = {}) {
  return [
    '[Desktop Entry]', `Type=${type}`, 'Version=1.0',
    `Name=${name}`, `Comment=${comment}`, `Exec=${execLine}`,
    'StartupNotify=false', 'Terminal=false', 'Categories=Office;Utility;',
    'X-GNOME-Autostart-enabled=true', MARKER_LINE, ...extra, ''
  ].join('\n');
}

// --- Markierte kanonische Einträge (Defekt 1) -------------------------------

test('M1: erzeugter kanonischer Inhalt enthält den exakten Eigentümer-Marker', () => {
  const { home } = setupLinux();
  autostart.updateLinuxAutostart(true, false);
  const content = fs.readFileSync(desktopPath(home), 'utf8');
  assert.ok(content.includes('X-Archiv-Wiki-Autostart=true'), 'Marker vorhanden');
});

test('M2: umbenannte AppImage mit Leerzeichen — vollständiger enable/read/update/disable-Fluss', () => {
  const appDir = makeTmpDir('appimg');
  const renamed = makeExecutable(appDir, 'Mein Wiki.AppImage');
  const { home, state } = setupLinux({ appImage: renamed });

  // enable
  const enabled = autostart.setAutoStartSettings({ openAtLogin: true });
  assert.equal(enabled.openAtLogin, true, 'enable meldet openAtLogin true');
  assert.equal(state.get().autoStart, true, 'Zustand persistiert');
  const file = desktopPath(home);
  assert.ok(fs.existsSync(file));
  const content = fs.readFileSync(file, 'utf8');
  assert.ok(content.includes('X-Archiv-Wiki-Autostart=true'), 'Marker geschrieben');
  assert.ok(content.includes('"' + renamed + '"'), 'umbenannte AppImage im Exec');

  // read/inspect
  const insp = autostart.inspectAutostartEntry(file);
  assert.equal(insp.enabled, true, 'als eigen erkannt und aktiv');
  assert.equal(insp.reason, 'ok');
  assert.equal(autostart.getAutoStartSettings().openAtLogin, true, 'Settings zeigt weiterhin aktiv');

  // update auf versteckt
  autostart.setAutoStartSettings({ startMinimized: true });
  assert.match(fs.readFileSync(file, 'utf8'), /--hidden/);
  assert.equal(autostart.isLinuxAutostartEnabled(), true);

  // disable
  const disabled = autostart.setAutoStartSettings({ openAtLogin: false });
  assert.equal(disabled.openAtLogin, false);
  assert.ok(!fs.existsSync(file), 'markierter Eintrag entfernt');
  assert.equal(state.get().autoStart, false);
});

test('M3: umbenannte AppImage mit literalem Prozentzeichen — %%-Roundtrip', () => {
  const appDir = makeTmpDir('appimg');
  const renamed = makeExecutable(appDir, 'Mein 100% Wiki.AppImage');
  const { home } = setupLinux({ appImage: renamed });
  autostart.updateLinuxAutostart(true, false);
  const content = fs.readFileSync(desktopPath(home), 'utf8');
  assert.ok(content.includes('100%% Wiki'), 'Prozent als %% serialisiert');
  const insp = autostart.inspectAutostartEntry(desktopPath(home));
  assert.equal(insp.enabled, true, 'Pfad mit % wird korrekt zurückgewonnen und existiert');
});

test('M4: markierte installierte Form (auch umbenannt) wird erkannt', () => {
  const owned = autostart.isOwnedArchivWikiEntry;
  assert.equal(owned(P(markedWithExec('"/opt/archiv-wiki/archiv-wiki" "--autostart"'))), true);
  assert.equal(owned(P(markedWithExec('"/opt/archiv-wiki/archiv-wiki" "--hidden" "--autostart"'))), true);
  // umbenannte AppImage, Basisname ähnelt Archiv-Wiki NICHT — nur durch Marker eigen
  assert.equal(owned(P(markedWithExec('"/opt/apps/Totally Renamed.AppImage" "--autostart"'))), true);
  assert.equal(owned(P(markedWithExec('"/home/u/Mein Wiki.AppImage" "--hidden" "--autostart"'))), true);
});

test('M5: markierte Entwicklungs-Form wird erkannt', () => {
  const owned = autostart.isOwnedArchivWikiEntry;
  assert.equal(owned(P(markedWithExec('"/proj/node_modules/electron/dist/electron" "/proj/archiv-wiki" "--autostart"'))), true);
  // markiert erlaubt beliebiges absolutes App-Verzeichnis
  assert.equal(owned(P(markedWithExec('"/x/electron" "/some/dev/checkout-dir" "--autostart"'))), true);
});

test('M6: Marker vorhanden, aber sonst ungültig → abgelehnt', () => {
  const owned = autostart.isOwnedArchivWikiEntry;
  const exec = '/opt/archiv-wiki/archiv-wiki';
  assert.equal(owned(P(markedWithExec(`"${exec}" "--autostart"`, { type: 'Link' }))), false, 'falscher Type');
  assert.equal(owned(P(markedWithExec(`"${exec}" "--autostart"`, { name: 'Etwas' }))), false, 'falscher Name');
  assert.equal(owned(P(markedWithExec(`"${exec}" "--autostart"`, { comment: 'Anders' }))), false, 'falscher Comment');
  assert.equal(owned(P(markedWithExec('"/opt/x --autostart'))), false, 'missgebildeter Exec');
  assert.equal(owned(P(markedWithExec('"archiv-wiki" "--autostart"'))), false, 'relativer Befehl');
  assert.equal(owned(P(markedWithExec(`"${exec}" "--hidden"`))), false, 'ungültiges Suffix');
  assert.equal(owned(P(markedWithExec(`"${exec}" "/tmp/extra" "--autostart"`))), false, 'Zusatzargument (installiert)');
  assert.equal(owned(P(markedWithExec(`"/x/electron" "/proj/archiv-wiki" "/tmp/extra" "--autostart"`))), false, 'Zusatzargument (dev)');
});

test('M6b: markierter aber ungültiger Eintrag am kanonischen Pfad wird bewahrt (Konflikt)', () => {
  const { home, state } = setupLinux();
  const dir = path.join(home, '.config', 'autostart');
  fs.mkdirSync(dir, { recursive: true });
  const bogus = markedWithExec('"/opt/archiv-wiki/archiv-wiki" "--autostart"', { name: 'Fremd' });
  fs.writeFileSync(desktopPath(home), bogus);
  let thrown = null;
  try { autostart.setAutoStartSettings({ openAtLogin: true }); }
  catch (e) { thrown = e; }
  assert.ok(thrown, 'Konflikt geworfen');
  assert.equal(fs.readFileSync(desktopPath(home), 'utf8'), bogus, 'byte-genau bewahrt');
  assert.equal(state.get().autoStart, undefined, 'nichts persistiert');
});

// --- Unmarkierte Legacy-Kompatibilität --------------------------------------

test('U7: echter alter (unmarkierter) Archiv-Wiki.desktop wird erkannt', () => {
  const { home, appImagePath } = setupLinux();
  const dir = path.join(home, '.config', 'autostart');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(legacyDesktopPath(home), ownedEntryContent(appImagePath)); // unmarkiert
  assert.ok(!fs.readFileSync(legacyDesktopPath(home), 'utf8').includes('X-Archiv-Wiki-Autostart'));
  assert.equal(autostart.isLinuxAutostartEnabled(), true);
});

test('U8/U9: alter Eintrag wird migriert; migrierter kanonischer Eintrag trägt den Marker', () => {
  const { home, appImagePath } = setupLinux();
  const dir = path.join(home, '.config', 'autostart');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(legacyDesktopPath(home), ownedEntryContent(appImagePath));
  autostart.updateLinuxAutostart(true, false);
  assert.ok(!fs.existsSync(legacyDesktopPath(home)), 'Legacy migriert/entfernt');
  const content = fs.readFileSync(desktopPath(home), 'utf8');
  assert.ok(content.includes('X-Archiv-Wiki-Autostart=true'), 'migrierter kanonischer Eintrag markiert');
});

test('U10: unmarkierter EIGENER kanonischer Eintrag wird beim Aktivieren auf die markierte Form angehoben', () => {
  const { home, appImagePath } = setupLinux();
  const dir = path.join(home, '.config', 'autostart');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(desktopPath(home), ownedEntryContent(appImagePath)); // unmarkiert, eigen
  autostart.updateLinuxAutostart(true, false);
  assert.ok(fs.readFileSync(desktopPath(home), 'utf8').includes('X-Archiv-Wiki-Autostart=true'), 'auf markierte Form angehoben');
});

test('U11: unmarkierter, uneindeutiger kanonischer Eintrag wird bewahrt (sicherer Konflikt)', () => {
  const { home, state } = setupLinux();
  const dir = path.join(home, '.config', 'autostart');
  fs.mkdirSync(dir, { recursive: true });
  const ambiguous = ownedEntryContent('/tmp/archiv-wiki.sh'); // .sh → keine dokumentierte Form
  fs.writeFileSync(desktopPath(home), ambiguous);
  let thrown = null;
  try { autostart.setAutoStartSettings({ openAtLogin: true }); }
  catch (e) { thrown = e; }
  assert.ok(thrown, 'Konflikt geworfen');
  assert.equal(fs.readFileSync(desktopPath(home), 'utf8'), ambiguous, 'byte-genau bewahrt');
  assert.equal(state.get().autoStart, undefined, 'nichts persistiert');
});

// --- Abgelehnte Pfad-Formen (Defekt 2) --------------------------------------

test('R12: nicht-erzeugte Befehlsformen zählen NICHT als unmarkierte Eigentümerschaft', () => {
  const owned = autostart.isOwnedArchivWikiEntry;
  // Einzelbefehl-Formen
  assert.equal(owned(P(ownedWithExec('"archiv-wiki" "--autostart"'))), false, 'relativer Befehl');
  assert.equal(owned(P(ownedWithExec('"/tmp/archiv-wiki.sh" "--autostart"'))), false, '.sh');
  assert.equal(owned(P(ownedWithExec('"/tmp/archiv-wiki.txt" "--autostart"'))), false, '.txt');
  assert.equal(owned(P(ownedWithExec('"/tmp/archiv-wiki.desktop" "--autostart"'))), false, '.desktop');
  assert.equal(owned(P(ownedWithExec('"relative/path/archiv-wiki" "--autostart"'))), false, 'relativer Pfad');
  // Entwicklungs-Form mit relativem App-Pfad
  assert.equal(owned(P(ownedWithExec('"/x/electron" "relative/path/archiv-wiki" "--autostart"'))), false, 'dev relativer App-Pfad');

  // Direkt am konservativen Erkenner:
  const legacy = autostart.isLegacyArchivWikiExecutable;
  assert.equal(legacy('archiv-wiki'), false);
  assert.equal(legacy('/tmp/archiv-wiki.sh'), false);
  assert.equal(legacy('/tmp/archiv-wiki.txt'), false);
  assert.equal(legacy('/tmp/archiv-wiki.desktop'), false);
  assert.equal(legacy('relative/path/archiv-wiki'), false);
  // dokumentierte Formen bleiben akzeptiert
  assert.equal(legacy('/usr/bin/archiv-wiki'), true);
  assert.equal(legacy('/opt/Archiv-Wiki-2.2.0.AppImage'), true);
});

test('R13: abgelehnte (nicht-eigene) Datei wird beim Deaktivieren NICHT gelöscht', () => {
  const { home } = setupLinux();
  const dir = path.join(home, '.config', 'autostart');
  fs.mkdirSync(dir, { recursive: true });
  const foreign = legacyDesktopPath(home);
  fs.writeFileSync(foreign, ownedEntryContent('/tmp/archiv-wiki.sh')); // nicht eigen
  autostart.updateLinuxAutostart(false, false);
  assert.ok(fs.existsSync(foreign), 'nicht-eigene Datei bleibt erhalten');
});

test('R14: abgelehnte Datei am kanonischen Pfad wird beim Aktivieren NICHT überschrieben', () => {
  const { home, state } = setupLinux();
  const dir = path.join(home, '.config', 'autostart');
  fs.mkdirSync(dir, { recursive: true });
  const foreign = ownedEntryContent('/tmp/archiv-wiki.sh');
  fs.writeFileSync(desktopPath(home), foreign);
  let thrown = null;
  try { autostart.setAutoStartSettings({ openAtLogin: true }); }
  catch (e) { thrown = e; }
  assert.ok(thrown, 'Konflikt');
  assert.equal(fs.readFileSync(desktopPath(home), 'utf8'), foreign, 'byte-genau bewahrt');
  assert.equal(state.get().autoStart, undefined);
});

// --- Strenge Quotierung (Defekt 3) ------------------------------------------

test('Q15: aneinandergrenzende quotierte Argumente ohne Trenner werden abgelehnt', () => {
  assert.equal(autostart.parseExecArgvStrict('"/tmp/archiv-wiki""--autostart"'), null);
  assert.equal(autostart.isOwnedArchivWikiEntry(P(ownedWithExec('"/tmp/archiv-wiki""--autostart"'))), false);
});

test('Q16: unerwartetes Anführungszeichen in unquotiertem Token wird abgelehnt', () => {
  assert.equal(autostart.parseExecArgvStrict('/tmp/ar"chiv --autostart'), null);
  assert.equal(autostart.parseExecArgvStrict('/tmp/x" "--autostart"'), null);
});

test('Q17: unabgeschlossene Quotes und missgebildete Escape-Grenzen werden abgelehnt', () => {
  assert.equal(autostart.parseExecArgvStrict('"/tmp/archiv-wiki'), null, 'unabgeschlossen');
  assert.equal(autostart.parseExecArgvStrict('"/tmp/archiv-wiki\\'), null, 'Backslash am Ende, unabgeschlossen');
  assert.equal(autostart.parseExecArgvStrict('"/tmp/x" "--autostart'), null, 'zweites Token unabgeschlossen');
});

test('Q18: exakte buildExecValue-Ausgabe rundläuft mit Sonderzeichen', () => {
  const cmd = '/opt/Mein Wiki $pecial `x` 100% \\back "q".AppImage';
  const value = autostart.buildExecValue(cmd, ['--hidden', '--autostart']);
  assert.deepEqual(autostart.parseExecArgvStrict(value), [cmd, '--hidden', '--autostart']);
  // und der Befehl wird identisch zurückgewonnen
  assert.equal(autostart.extractExecCommand(value), cmd);
});
