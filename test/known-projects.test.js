// test/known-projects.test.js
// Wiki-Wechsler: Liste der bekannten Wikis (main/known-projects.js), die
// Menü-Ansichtslogik (renderer/js/wiki-switcher-data.js) und die Verdrahtung
// in main.js/preload.js/app.js. Läuft mit dem eingebauten Node-Test-Runner
// ohne Electron; alle Ordner sind frische Temp-Verzeichnisse, echte
// Nutzerdaten werden nie berührt.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const known = require('../main/known-projects.js');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const importRenderer = (rel) => import(require('url').pathToFileURL(path.join(root, rel)).href);

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `aw-known-${prefix}-`));
}

function makeWiki(prefix, config = { wikiName: prefix }) {
  const dir = tmpDir(prefix);
  fs.writeFileSync(path.join(dir, '.wiki-config.json'), JSON.stringify(config));
  return dir;
}

// Kleiner Ersatz für ipcMain und app-state.json: hält registrierte Handler
// und einen In-Memory-Zustand.
function createHarness({ currentPath, knownProjects = [] } = {}) {
  const handlers = new Map();
  let appState = { lastProjectPath: currentPath, knownProjects };
  const opened = [];
  const wizardFolders = [];
  known.registerKnownProjectsIpc({
    ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
    getCurrentProject: () => ({ path: currentPath }),
    readAppState: () => appState,
    writeAppState: (partial) => { appState = { ...appState, ...partial }; return appState; },
    onProjectReady: (projectPath, config) => opened.push({ projectPath, config }),
    onCreateWikiInFolder: (folderPath) => { wizardFolders.push(folderPath); return { ok: true }; }
  });
  return {
    invoke: (channel, ...args) => handlers.get(channel)({}, ...args),
    getState: () => appState,
    opened,
    wizardFolders
  };
}

// --- Listenlogik ------------------------------------------------------------

test('normalizeKnownProjects: verwirft Unbrauchbares, entfernt Doppelte, neueste zuerst', () => {
  const list = known.normalizeKnownProjects([
    null,
    'kaputt',
    { name: 'ohne Pfad' },
    { name: 'Alt', path: '/wikis/a', lastOpened: '2026-01-01T00:00:00.000Z' },
    { name: 'Neu', path: '/wikis/a/', lastOpened: '2026-03-01T00:00:00.000Z' },
    { name: '', path: '/wikis/b', lastOpened: '2026-02-01T00:00:00.000Z' }
  ]);
  assert.deepEqual(list.map(entry => entry.path), ['/wikis/a', '/wikis/b']);
  assert.equal(list[0].name, 'Neu', 'bei doppeltem Pfad gewinnt der zuletzt geöffnete Eintrag');
  assert.equal(list[1].name, 'b', 'ohne Namen dient der Ordnername als Anzeige');
  assert.deepEqual(known.normalizeKnownProjects(undefined), []);
  assert.deepEqual(known.normalizeKnownProjects({ nicht: 'eine Liste' }), []);
});

test('rememberKnownProject: neues Wiki landet oben, bekanntes wird aktualisiert statt verdoppelt', () => {
  let list = known.rememberKnownProject([], { path: '/wikis/a', name: 'Haupt' }, new Date('2026-01-01T00:00:00Z'));
  list = known.rememberKnownProject(list, { path: '/wikis/b', name: 'Arbeit' }, new Date('2026-01-02T00:00:00Z'));
  list = known.rememberKnownProject(list, { path: '/wikis/a', name: 'Haupt-Wiki' }, new Date('2026-01-03T00:00:00Z'));
  assert.deepEqual(list.map(entry => entry.path), ['/wikis/a', '/wikis/b']);
  assert.equal(list[0].name, 'Haupt-Wiki');
  assert.equal(list[0].lastOpened, '2026-01-03T00:00:00.000Z');
});

test('rememberKnownProject: Liste bleibt auf MAX_KNOWN_PROJECTS begrenzt', () => {
  let list = [];
  for (let i = 0; i < known.MAX_KNOWN_PROJECTS + 5; i++) {
    list = known.rememberKnownProject(list, { path: `/wikis/w${i}` }, new Date(Date.UTC(2026, 0, 1, 0, i)));
  }
  assert.equal(list.length, known.MAX_KNOWN_PROJECTS);
  assert.equal(list[0].path, `/wikis/w${known.MAX_KNOWN_PROJECTS + 4}`, 'das zuletzt geöffnete bleibt erhalten');
  assert.ok(!list.some(entry => entry.path === '/wikis/w0'), 'das älteste fällt heraus');
});

test('forgetKnownProject entfernt nur den Listeneintrag', () => {
  const dir = makeWiki('forget');
  const list = known.rememberKnownProject([], { path: dir, name: 'X' });
  assert.deepEqual(known.forgetKnownProject(list, dir), []);
  assert.ok(fs.existsSync(path.join(dir, '.wiki-config.json')), 'der Ordner bleibt unangetastet');
});

test('inspectKnownProject unterscheidet vorhanden, fehlend und unlesbar', () => {
  const ok = makeWiki('ok');
  const empty = tmpDir('empty');
  const broken = tmpDir('broken');
  fs.writeFileSync(path.join(broken, '.wiki-config.json'), '{ kaputt');
  assert.equal(known.inspectKnownProject(ok).status, 'ok');
  assert.equal(known.inspectKnownProject(path.join(empty, 'gibt-es-nicht')).status, 'missing');
  assert.equal(known.inspectKnownProject(empty).status, 'invalid');
  assert.equal(known.inspectKnownProject(broken).status, 'invalid');
});

test('describeKnownProjects markiert das aktive Wiki und liest den aktuellen Namen', () => {
  const a = makeWiki('desc-a', { wikiName: 'Umbenannt' });
  const list = known.rememberKnownProject([], { path: a, name: 'Alter Name' });
  const gone = path.join(tmpDir('desc-gone'), 'weg');
  const withMissing = known.rememberKnownProject(list, { path: gone, name: 'Verschwunden' });
  const described = known.describeKnownProjects(withMissing, a);
  const current = described.find(entry => entry.path === a);
  const missing = described.find(entry => entry.path === gone);
  assert.equal(current.isCurrent, true);
  assert.equal(current.name, 'Umbenannt');
  assert.equal(current.status, 'ok');
  assert.equal(missing.isCurrent, false);
  assert.equal(missing.status, 'missing');
  assert.equal(missing.name, 'Verschwunden', 'fehlende Wikis behalten ihren gespeicherten Namen');
});

// --- IPC-Kanäle -------------------------------------------------------------

test('projects:switchTo wechselt zu einem bekannten, vorhandenen Wiki', () => {
  const a = makeWiki('sw-a');
  const b = makeWiki('sw-b', { wikiName: 'Zweites' });
  const list = known.rememberKnownProject(known.rememberKnownProject([], { path: b }), { path: a });
  const h = createHarness({ currentPath: a, knownProjects: list });
  const result = h.invoke('projects:switchTo', b);
  assert.deepEqual(result, { ok: true });
  assert.equal(h.opened.length, 1);
  assert.equal(h.opened[0].projectPath, b);
  assert.equal(h.opened[0].config.wikiName, 'Zweites');
  assert.equal(h.getState().lastProjectPath, b);
});

test('projects:switchTo zum bereits aktiven Wiki lädt nichts neu', () => {
  const a = makeWiki('same');
  const h = createHarness({ currentPath: a, knownProjects: known.rememberKnownProject([], { path: a }) });
  assert.deepEqual(h.invoke('projects:switchTo', a), { ok: true, unchanged: true });
  assert.equal(h.opened.length, 0);
});

test('projects:switchTo meldet fehlende Ordner freundlich und verändert nichts', () => {
  const a = makeWiki('miss-a');
  const gone = path.join(tmpDir('miss'), 'verschoben');
  const list = known.rememberKnownProject(known.rememberKnownProject([], { path: gone, name: 'Alt' }), { path: a });
  const h = createHarness({ currentPath: a, knownProjects: list });
  const result = h.invoke('projects:switchTo', gone);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing');
  assert.match(result.message, /nicht gefunden/);
  assert.match(result.message, /verschoben, umbenannt oder gelöscht/);
  assert.equal(h.opened.length, 0);
  assert.equal(h.getState().lastProjectPath, a, 'das aktive Wiki bleibt gesetzt');
  assert.equal(h.getState().knownProjects.length, 2, 'der Eintrag bleibt in der Liste');
});

test('projects:switchTo lehnt Ordner ab, die nicht in der Liste stehen', () => {
  const a = makeWiki('unk-a');
  const other = makeWiki('unk-b');
  const h = createHarness({ currentPath: a, knownProjects: known.rememberKnownProject([], { path: a }) });
  const result = h.invoke('projects:switchTo', other);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unknown');
  assert.equal(h.opened.length, 0);
});

test('projects:forget entfernt andere Wikis, aber nie das aktive', () => {
  const a = makeWiki('fg-a');
  const b = makeWiki('fg-b');
  const list = known.rememberKnownProject(known.rememberKnownProject([], { path: b }), { path: a });
  const h = createHarness({ currentPath: a, knownProjects: list });
  assert.equal(h.invoke('projects:forget', a).ok, false);
  assert.equal(h.getState().knownProjects.length, 2);
  assert.equal(h.invoke('projects:forget', b).ok, true);
  assert.deepEqual(h.getState().knownProjects.map(entry => entry.path), [path.resolve(a)]);
  assert.ok(fs.existsSync(path.join(b, '.wiki-config.json')), 'der entfernte Ordner bleibt vollständig erhalten');
});

test('projects:getKnown liefert aktives Wiki und Status aller Einträge', () => {
  const a = makeWiki('get-a', { wikiName: 'Haupt' });
  const h = createHarness({ currentPath: a, knownProjects: known.rememberKnownProject([], { path: a }) });
  const result = h.invoke('projects:getKnown');
  assert.equal(result.currentPath, path.resolve(a));
  assert.equal(result.projects.length, 1);
  assert.equal(result.projects[0].name, 'Haupt');
  assert.equal(result.projects[0].isCurrent, true);
});

// --- Menü-Ansichtslogik (Renderer) ------------------------------------------

test('Wiki-Menü: Häkchen beim aktiven Wiki, Hinweis bei fehlenden, Namen sicher maskiert', async () => {
  const { buildWikiSwitcherMenuHtml } = await importRenderer('renderer/js/wiki-switcher-data.js');
  const html = buildWikiSwitcherMenuHtml([
    { name: 'Haupt <b>"Wiki"</b>', path: '/w/a', isCurrent: true, status: 'ok' },
    { name: 'Alt', path: '/w/b', isCurrent: false, status: 'missing' }
  ]);
  assert.match(html, /class="wiki-switcher-item is-current"[^>]*aria-current="true"/);
  assert.match(html, /wiki-switcher-check" aria-hidden="true">✓</);
  assert.match(html, /is-unreachable[\s\S]*nicht gefunden/);
  assert.ok(!html.includes('<b>'), 'Wiki-Namen dürfen kein HTML einschleusen');
  assert.match(html, /data-wiki-action="open">Weiteren Wiki-Ordner öffnen …/);
  assert.match(html, /data-wiki-action="forget-menu">Aus Liste entfernen …/);
});

test('Wiki-Menü: "Aus Liste entfernen" nur, wenn es außer dem aktiven Wiki weitere gibt', async () => {
  const { buildWikiSwitcherMenuHtml, buildWikiForgetMenuHtml } = await importRenderer('renderer/js/wiki-switcher-data.js');
  const onlyCurrent = buildWikiSwitcherMenuHtml([{ name: 'A', path: '/w/a', isCurrent: true, status: 'ok' }]);
  assert.ok(!onlyCurrent.includes('forget-menu'));
  const forgetHtml = buildWikiForgetMenuHtml([
    { name: 'A', path: '/w/a', isCurrent: true, status: 'ok' },
    { name: 'B', path: '/w/b', isCurrent: false, status: 'ok' }
  ]);
  assert.ok(!forgetHtml.includes('data-wiki-path="/w/a"'), 'das aktive Wiki ist nie entfernbar');
  assert.match(forgetHtml, /data-wiki-action="forget" data-wiki-path="\/w\/b"/);
});

test('Wiki-Menü: gleichnamige Wikis werden über den Ordnernamen unterscheidbar', async () => {
  const { buildWikiSwitcherEntries } = await importRenderer('renderer/js/wiki-switcher-data.js');
  const entries = buildWikiSwitcherEntries([
    { name: 'Notizen', path: '/home/x/privat', status: 'ok' },
    { name: 'Notizen', path: '/home/x/arbeit', status: 'ok' }
  ]);
  assert.deepEqual(entries.map(entry => entry.hint), ['privat', 'arbeit']);
});

// --- Verdrahtung --------------------------------------------------------------

test('main.js merkt jedes geöffnete Wiki und registriert die Wiki-Wechsler-Kanäle', () => {
  const main = read('main.js');
  const ready = main.match(/function handleProjectReady\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(ready, 'handleProjectReady fehlt');
  assert.match(ready[1], /rememberOpenedProject\(projectPath, config\)/);
  assert.match(main, /registerKnownProjectsIpc\(\{[\s\S]*?onProjectReady: handleProjectReady/);
  assert.match(main, /askForStartupFallbackProject/, 'Start mit fehlendem Wiki braucht einen Hinweis');
});

test('preload.js stellt die Wiki-Wechsler-Kanäle bereit', () => {
  const preload = read('preload.js');
  assert.match(preload, /ipcRenderer\.invoke\('projects:getKnown'\)/);
  assert.match(preload, /ipcRenderer\.invoke\('projects:switchTo', projectPath\)/);
  assert.match(preload, /ipcRenderer\.invoke\('projects:forget', projectPath\)/);
  assert.match(preload, /ipcRenderer\.invoke\('projects:inspectFolder', folderPath\)/);
  assert.match(preload, /ipcRenderer\.invoke\('projects:createInFolder', folderPath\)/);
  assert.match(preload, /ipcRenderer\.invoke\('wizard:getInitialFolder'\)/);
});

test('app.js sichert ungespeicherte Änderungen vor jedem Wiki-Wechsel', () => {
  const app = read('renderer/js/app.js');
  const fn = app.match(/async function switchToKnownWiki\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(fn, 'switchToKnownWiki fehlt');
  const guard = fn[1].indexOf('canLeaveCurrentRoute()');
  const switchCall = fn[1].indexOf('knownProjects.switchTo(');
  assert.ok(guard > -1 && switchCall > guard, 'canLeaveCurrentRoute() muss VOR dem Wechsel laufen');
  assert.match(fn[1], /appLockActive/, 'kein Wechsel hinter dem Sperrbildschirm');
});

test('Wiki-Wechsler ist bei aktiver App-Sperre nicht bedienbar und kein Fenster-Ziehbereich', () => {
  const app = read('renderer/js/app.js');
  const list = app.match(/const APP_LOCK_TITLEBAR_INERT_SELECTORS = \[([\s\S]*?)\];/);
  assert.ok(list && list[1].includes("'#titlebarWikiSwitchBtn'"));
  const html = read('renderer/index.html');
  assert.match(html, /<button class="app-titlebar-wiki-switch" id="titlebarWikiSwitchBtn"[^>]*aria-haspopup="menu"/);
  assert.match(html, /id="titlebarWikiSwitchBtn"[\s\S]*?id="appTitlebarAppName"/, 'der Wiki-Name bleibt im Auslöser');
  const css = read('renderer/css/layout.css');
  assert.match(css, /\.app-titlebar \.app-titlebar-wiki-switch \.app-titlebar-appname\{[^}]*-webkit-app-region:\s*no-drag/);
  assert.match(css, /\.app-titlebar-wiki-switch\{[^}]*max-width:\s*240px[^}]*-webkit-app-region:\s*no-drag/);
});

// --- Ordner ohne Wiki: öffnen / neues Wiki anlegen ------------------------------
// Nutzer-Rückmeldung: „Weiteren Wiki-Ordner öffnen …“ mit einem Ordner ohne
// .wiki-config.json (oder einem im Dialog neu erstellten Ordner) endete in
// „Error invoking remote method 'wizard:openExisting': Error: Die
// Projektkonfiguration fehlt.“ — ohne Weg, dort ein Wiki anzulegen.

test('Ursache: ein Ordner ohne .wiki-config.json ist für wizard:openExisting kein Wiki', () => {
  const { requireProjectConfig } = require('../main/project.js');
  const dir = tmpDir('plain');
  assert.throws(() => requireProjectConfig(dir), (error) => error.code === 'PROJECT_CONFIG_MISSING');
});

test('inspectFolderForOpening unterscheidet Wiki, Ordner ohne Wiki, beschädigt und fehlend', () => {
  const wiki = makeWiki('open-wiki');
  assert.deepEqual(known.inspectFolderForOpening(wiki), { status: 'wiki', path: wiki });

  const empty = tmpDir('open-empty');
  const emptyResult = known.inspectFolderForOpening(empty);
  assert.equal(emptyResult.status, 'no-wiki');
  assert.equal(emptyResult.writable, true);
  assert.equal(emptyResult.entryCount, 0);
  assert.match(emptyResult.message, /gibt es noch kein Archiv-Wiki/);
  assert.doesNotMatch(emptyResult.message, /Error|Projektkonfiguration/);

  const withFiles = tmpDir('open-files');
  fs.writeFileSync(path.join(withFiles, 'README.md'), '# Code');
  assert.equal(known.inspectFolderForOpening(withFiles).entryCount, 1);

  const broken = tmpDir('open-broken');
  fs.writeFileSync(path.join(broken, '.wiki-config.json'), '{kaputt');
  const brokenResult = known.inspectFolderForOpening(broken);
  assert.equal(brokenResult.status, 'invalid');
  assert.match(brokenResult.message, /beschädigt/);

  const gone = path.join(tmpDir('open-gone'), 'fehlt');
  assert.equal(known.inspectFolderForOpening(gone).status, 'missing');
  assert.equal(known.inspectFolderForOpening('').status, 'missing');
});

test('inspectFolderForOpening: Ordner ohne Schreibrechte bekommt eine eigene, klare Meldung', (t) => {
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    t.skip('als root greifen Schreibrechte nicht');
    return;
  }
  const dir = tmpDir('open-readonly');
  fs.chmodSync(dir, 0o555);
  try {
    const result = known.inspectFolderForOpening(dir);
    assert.equal(result.status, 'no-wiki');
    assert.equal(result.writable, false);
    assert.match(result.message, /keine Schreibrechte/);
  } finally {
    fs.chmodSync(dir, 0o755);
  }
});

test('projects:inspectFolder liefert das Prüfergebnis und verändert nichts', () => {
  const dir = tmpDir('ipc-inspect');
  const harness = createHarness({ currentPath: makeWiki('ipc-inspect-current') });
  assert.equal(harness.invoke('projects:inspectFolder', dir).status, 'no-wiki');
  assert.deepEqual(fs.readdirSync(dir), []);
  assert.deepEqual(harness.opened, []);
});

test('projects:createInFolder öffnet den Assistenten nur für beschreibbare Ordner ohne Wiki', () => {
  const current = makeWiki('create-current');
  const harness = createHarness({ currentPath: current });

  const empty = tmpDir('create-empty');
  assert.deepEqual(harness.invoke('projects:createInFolder', empty), { ok: true });
  assert.deepEqual(harness.wizardFolders, [empty]);
  // Angelegt wird erst im Assistenten — bis dahin bleibt der Ordner leer und
  // das aktuelle Wiki geöffnet.
  assert.deepEqual(fs.readdirSync(empty), []);
  assert.deepEqual(harness.opened, []);

  const wiki = makeWiki('create-existing');
  const existing = harness.invoke('projects:createInFolder', wiki);
  assert.equal(existing.ok, false);
  assert.match(existing.message, /bereits ein Archiv-Wiki/);

  const gone = path.join(tmpDir('create-gone'), 'fehlt');
  assert.equal(harness.invoke('projects:createInFolder', gone).ok, false);
  assert.deepEqual(harness.wizardFolders, [empty]);
});

test('Neues Wiki im Assistenten: leerer Ordner wird zu einem öffnenbaren Wiki', () => {
  const wiz = require('../main/wizard-ipc.js');
  const dir = tmpDir('wizard-new');
  const config = wiz.buildNewProjectConfig({
    wikiName: 'Test',
    appLock: { enabled: false },
    editor: wiz.resolveEditorConfig(undefined),
    backupPath: path.join(dir, 'backup')
  });
  const persisted = wiz.persistWizardConfig({ projectPath: dir, config, rawSync: { enabled: false } });
  assert.equal(persisted.wikiName, 'Test');
  assert.deepEqual(known.inspectFolderForOpening(dir), { status: 'wiki', path: dir });
});

test('app.js prüft den gewählten Ordner vor dem Öffnen und bietet bei fehlendem Wiki ein neues an', () => {
  const app = read('renderer/js/app.js');
  const fn = app.match(/async function handleMenuOpenProjectRequest\(\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(fn, 'handleMenuOpenProjectRequest fehlt');
  const guard = fn[1].indexOf('canLeaveCurrentRoute()');
  const inspect = fn[1].indexOf('knownProjects.inspectFolder(folder)');
  const open = fn[1].indexOf('openExistingProject(folder)');
  assert.ok(guard > -1 && inspect > guard && open > inspect, 'Reihenfolge: sichern → prüfen → öffnen');
  assert.match(fn[1], /status === 'no-wiki'[\s\S]*?offerNewWikiInFolder\(inspected\)/);
  assert.match(fn[1], /readableIpcErrorMessage\(err\)/, 'kein technisches IPC-Präfix in der Meldung');

  const offer = app.match(/async function offerNewWikiInFolder\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(offer, 'offerNewWikiInFolder fehlt');
  const confirm = offer[1].indexOf('showConfirmDialog(');
  const create = offer[1].indexOf('knownProjects.createInFolder(');
  assert.ok(confirm > -1 && create > confirm, 'neues Wiki erst nach Rückfrage');
});

test('main.js öffnet den Assistenten für ein neues Wiki modal mit vorbelegtem Ordner', () => {
  const main = read('main.js');
  assert.match(main, /onCreateWikiInFolder: openWizardForNewWiki/);
  assert.match(main, /consumeInitialFolder: \(\) =>/);
  const fn = main.match(/function openWizardForNewWiki\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(fn, 'openWizardForNewWiki fehlt');
  assert.match(fn[1], /createWizardWindow\(\{ parent: mainWindow \}\)/);
  assert.match(main, /\{ parent, modal: true \}/);
  const wizardIpc = read('main/wizard-ipc.js');
  assert.match(wizardIpc, /ipcMain\.handle\('wizard:getInitialFolder'[\s\S]*?inspectProjectFolder\(folder\)/);
  const wizard = read('renderer/js/wizard.js');
  assert.match(wizard, /getWizardInitialFolder\?\.\(\)[\s\S]*?applyFolderSelection\(result\)/);
  assert.doesNotMatch(wizard, /folderErrorBanner\.textContent = err\.message;/, 'kein technisches IPC-Präfix im Assistenten');
});
