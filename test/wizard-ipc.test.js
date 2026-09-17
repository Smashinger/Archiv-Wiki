// test/wizard-ipc.test.js
// Fokussierte Tests für die Ersteinrichtungs-Revision (main/wizard-ipc.js) und
// die eng benannten Brücken. Laufen mit dem eingebauten Node-Test-Runner
// (`node --test`), ohne zusätzliche Abhängigkeiten und ohne laufendes Electron.
// Sicherheitskritische Logik (App-Passwortschutz) wird auf der richtigen Ebene
// geprüft: im Hauptprozess. Reine Renderer-UI-Zustände werden hier NICHT
// gemockt (siehe Bericht: isolierte manuelle Laufzeitprüfung).

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const wiz = require('../main/wizard-ipc.js');

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `aw-wiz-${prefix}-`));
}

// --- App-Passwortschutz: vertrauenswürdige Validierung im Hauptprozess ------

test('App-Lock aus → kein Passwortschutz (auch wenn ein Passwort mitkommt)', () => {
  assert.deepEqual(wiz.buildAppLock({ appLockEnabled: false }), { enabled: false });
  // Gefälschtes Payload: Schutz aus, aber Passwortfelder gesetzt → ignoriert.
  assert.deepEqual(
    wiz.buildAppLock({ appLockEnabled: false, appLockPassword: 'x', appLockPasswordConfirm: 'y' }),
    { enabled: false }
  );
  // Fehlendes Feld zählt nicht als aktiviert.
  assert.deepEqual(wiz.buildAppLock({}), { enabled: false });
});

test('App-Lock an, leeres Passwort → wird abgelehnt', () => {
  assert.throws(() => wiz.buildAppLock({ appLockEnabled: true, appLockPassword: '', appLockPasswordConfirm: '' }), /Passwort eingeben/);
});

test('App-Lock an, nicht übereinstimmend (gefälschtes Payload) → wird abgelehnt', () => {
  assert.throws(
    () => wiz.buildAppLock({ appLockEnabled: true, appLockPassword: 'geheim', appLockPasswordConfirm: 'anders' }),
    /stimmen nicht überein/
  );
});

test('App-Lock an, passend → Salt+scrypt-Hash, kein Klartext', () => {
  const pw = 'MeinGeheimesPasswort';
  const lock = wiz.buildAppLock({ appLockEnabled: true, appLockPassword: pw, appLockPasswordConfirm: pw });
  assert.equal(lock.enabled, true);
  assert.equal(typeof lock.salt, 'string');
  assert.equal(typeof lock.hash, 'string');
  assert.ok(lock.salt.length > 0 && lock.hash.length > 0);
  // Derselbe scrypt-Hash wie bisher (verifizierbar) …
  assert.equal(crypto.scryptSync(pw, lock.salt, 64).toString('hex'), lock.hash);
  // … und nirgends Klartext, so wie er in die Projektkonfiguration ginge.
  const serializedConfig = JSON.stringify({ appLock: lock });
  assert.ok(!serializedConfig.includes(pw), 'kein Klartext-Passwort in der Konfiguration');
});

test('zwei aufeinanderfolgende Sperren nutzen unterschiedliche Salts', () => {
  const a = wiz.buildAppLock({ appLockEnabled: true, appLockPassword: 'gleich', appLockPasswordConfirm: 'gleich' });
  const b = wiz.buildAppLock({ appLockEnabled: true, appLockPassword: 'gleich', appLockPasswordConfirm: 'gleich' });
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
});

// --- Editor-Standardwerte bleiben erhalten ----------------------------------

test('Editor-Standardwerte: Tab 2, Auto-Save 30 bleiben die Vorgaben', () => {
  assert.deepEqual(wiz.resolveEditorConfig(undefined), { tabSize: 2, autoSave: 30 });
  assert.deepEqual(wiz.resolveEditorConfig({}), { tabSize: 2, autoSave: 30 });
  // Übergebene Werte gewinnen, Fehlendes fällt auf die Vorgabe zurück.
  assert.deepEqual(wiz.resolveEditorConfig({ tabSize: 4 }), { tabSize: 4, autoSave: 30 });
  assert.deepEqual(wiz.resolveEditorConfig({ autoSave: 0 }), { tabSize: 2, autoSave: 0 });
});

// --- Neue Projektkonfiguration ------------------------------------------------

test('Neues Wiki startet in Design2, eigene Akzentfarbe nur mit gültigem Hex', () => {
  const base = { wikiName: '  Test  ', appLock: { enabled: false }, editor: { tabSize: 2, autoSave: 30 }, backupPath: '/tmp/b' };
  const config = wiz.buildNewProjectConfig({ ...base, accentKey: 'custom', customAccentColor: '#12aB9f' });
  assert.equal(config.uiDesign, 'design2');
  assert.equal(config.wikiName, 'Test');
  assert.equal(config.customAccentColor, '#12aB9f');
  assert.equal(wiz.buildNewProjectConfig({ ...base }).accentKey, 'orange');
  assert.equal('customAccentColor' in wiz.buildNewProjectConfig({ ...base, accentKey: 'custom', customAccentColor: 'rot' }), false);
});

// --- Sync-Sanitisierung: Auto-Sync nur mit sicher gespeicherten Zugangsdaten -

test('sanitizeSyncConfig: ohne URL → deaktiviert', () => {
  assert.deepEqual(wiz.sanitizeSyncConfig({}, true), { enabled: false });
  assert.deepEqual(wiz.sanitizeSyncConfig({ url: '   ' }, true), { enabled: false });
  assert.deepEqual(wiz.sanitizeSyncConfig(undefined, true), { enabled: false });
});

test('sanitizeSyncConfig: Auto-Sync bleibt aus, wenn Zugangsdaten NICHT sicher gespeichert', () => {
  const out = wiz.sanitizeSyncConfig(
    { url: 'https://s/dav', username: 'u', autoSync: { enabled: true, intervalMinutes: 30 } },
    false // credentialsStored
  );
  assert.equal(out.enabled, false);
  assert.equal(out.url, 'https://s/dav');
  assert.equal(out.username, 'u');
  assert.equal(out.autoSync.enabled, false, 'Auto-Sync ohne gespeicherte Zugangsdaten deaktiviert');
  assert.equal(out.autoSync.intervalMinutes, 30);
});

test('sanitizeSyncConfig: Auto-Sync an, wenn Zugangsdaten sicher gespeichert', () => {
  const out = wiz.sanitizeSyncConfig(
    { url: 'https://s/dav', username: 'u', autoSync: { enabled: true, intervalMinutes: 60 } },
    true
  );
  assert.equal(out.autoSync.enabled, true);
  assert.equal(out.autoSync.intervalMinutes, 60);
});

test('sanitizeSyncConfig: gefälschte Zusatzfelder (z. B. Klartext-Passwort) werden verworfen', () => {
  const out = wiz.sanitizeSyncConfig(
    { url: 'https://s/dav', username: 'u', password: 'GEHEIM', enabled: true, autoSync: { enabled: false } },
    true
  );
  assert.ok(!('password' in out), 'kein Passwortfeld in der Sync-Konfiguration');
  assert.equal(out.enabled, false, 'Sync wird nie schon im Wizard aktiviert');
  assert.ok(!JSON.stringify(out).includes('GEHEIM'));
});

test('sanitizeSyncConfig: ungültiges Intervall fällt auf 15 zurück', () => {
  const out = wiz.sanitizeSyncConfig({ url: 'https://s/dav', autoSync: { enabled: false, intervalMinutes: 'x' } }, true);
  assert.equal(out.autoSync.intervalMinutes, 15);
});

test('Sync-Passwort wird nur für eine echte URL und ausdrückliches Merken vorgesehen', () => {
  assert.equal(wiz.shouldStoreSyncPassword({ rawSync: {}, rememberPassword: true, password: 'geheim' }), false);
  assert.equal(wiz.shouldStoreSyncPassword({ rawSync: { url: '   ' }, rememberPassword: true, password: 'geheim' }), false);
  assert.equal(wiz.shouldStoreSyncPassword({ rawSync: { url: 'https://s/dav' }, rememberPassword: false, password: 'geheim' }), false);
  assert.equal(wiz.shouldStoreSyncPassword({ rawSync: { url: 'https://s/dav' }, rememberPassword: true, password: '' }), false);
  assert.equal(wiz.shouldStoreSyncPassword({ rawSync: { url: ' https://s/dav ' }, rememberPassword: true, password: 'geheim' }), true);
});

test('persistWizardConfig: ohne URL entsteht kein Zugangsdaten-Eintrag', () => {
  let saveCalls = 0;
  let writtenConfig = null;
  const result = wiz.persistWizardConfig({
    projectPath: '/tmp/wiki',
    config: { version: '1.0.0' },
    rawSync: { enabled: false },
    rememberPassword: true,
    password: 'darf-nicht-gespeichert-werden'
  }, {
    isEncryptionAvailable: () => true,
    savePassword: () => { saveCalls += 1; },
    restorePassword: () => assert.fail('kein Rollback ohne Speicherung'),
    writeConfig: (_projectPath, config) => { writtenConfig = config; return config; },
    logger: { warn() {}, error() {} }
  });
  assert.equal(saveCalls, 0);
  assert.deepEqual(writtenConfig.sync, { enabled: false });
  assert.deepEqual(result, writtenConfig);
});

test('persistWizardConfig: Config-Fehler stellt vorherige Zugangsdaten exakt wieder her', () => {
  const previous = { existed: true, value: 'vorheriger-verschluesselter-wert' };
  let restored = null;
  assert.throws(() => wiz.persistWizardConfig({
    projectPath: '/tmp/wiki',
    config: { version: '1.0.0' },
    rawSync: { url: 'https://s/dav', autoSync: { enabled: true, intervalMinutes: 15 } },
    rememberPassword: true,
    password: 'geheim'
  }, {
    isEncryptionAvailable: () => true,
    savePassword: () => previous,
    restorePassword: (projectPath, snapshot) => { restored = { projectPath, snapshot }; },
    writeConfig: () => { throw new Error('Config-Schreibfehler'); },
    logger: { warn() {}, error() {} }
  }), /Config-Schreibfehler/);
  assert.deepEqual(restored, { projectPath: '/tmp/wiki', snapshot: previous });
});

test('persistWizardConfig: auch ein Rollback-Fehler wird gemeldet', () => {
  assert.throws(() => wiz.persistWizardConfig({
    projectPath: '/tmp/wiki',
    config: { version: '1.0.0' },
    rawSync: { url: 'https://s/dav' },
    rememberPassword: true,
    password: 'geheim'
  }, {
    isEncryptionAvailable: () => true,
    savePassword: () => ({ existed: false, value: null }),
    restorePassword: () => { throw new Error('Rollback fehlgeschlagen'); },
    writeConfig: () => { throw new Error('Config-Schreibfehler'); },
    logger: { warn() {}, error() {} }
  }), /Config-Schreibfehler.*Rollback fehlgeschlagen/);
});

// --- Ordner-Inspektion (Datengrundlage der drei Ordner-Fälle) ---------------

test('inspectProjectFolder: leerer beschreibbarer Ordner → empty true', () => {
  const dir = tmpDir('empty');
  const r = wiz.inspectProjectFolder(dir);
  assert.equal(r.writable, true);
  assert.equal(r.alreadyConfigured, false);
  assert.equal(r.empty, true);
  assert.equal(r.entryCount, 0);
  assert.equal(typeof r.freeBytes, 'number');
});

test('inspectProjectFolder: nicht-leerer Ordner ohne Projekt → empty false', () => {
  const dir = tmpDir('nonempty');
  fs.writeFileSync(path.join(dir, 'meine-datei.txt'), 'hallo');
  const r = wiz.inspectProjectFolder(dir);
  assert.equal(r.writable, true);
  assert.equal(r.alreadyConfigured, false);
  assert.equal(r.empty, false);
  assert.equal(r.entryCount, 1);
});

test('inspectProjectFolder: bestehendes Archiv-Wiki-Projekt → alreadyConfigured true', () => {
  const dir = tmpDir('existing');
  fs.writeFileSync(path.join(dir, '.wiki-config.json'), JSON.stringify({ version: '1.0.0' }));
  const r = wiz.inspectProjectFolder(dir);
  assert.equal(r.alreadyConfigured, true, 'Direkt-öffnen-Pfad bleibt erkennbar');
  assert.equal(r.projectConfigError, null);
});

test('inspectProjectFolder: beschädigte Projektkonfiguration ist kein bestehendes Wiki', () => {
  const dir = tmpDir('invalid-existing');
  fs.writeFileSync(path.join(dir, '.wiki-config.json'), '{ ungültig');
  const r = wiz.inspectProjectFolder(dir);
  assert.equal(r.alreadyConfigured, false);
  assert.match(r.projectConfigError, /beschädigt|ungültig/i);
});

// --- preload.js: nur eng benannte Fenster-Start-Brücken ---------------------

test('preload.js exponiert genau die beiden Fenster-Start-Methoden, keinen generischen IPC', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
  assert.match(src, /getWindowStartBehavior:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('app:getWindowStartBehavior'\)/);
  assert.match(src, /setWindowStartBehavior:\s*\(value\)\s*=>\s*ipcRenderer\.invoke\('app:setWindowStartBehavior',\s*value\)/);
  // Kein generischer Passthrough, der einen beliebigen Kanalnamen erlaubt.
  assert.doesNotMatch(src, /invoke:\s*\(channel/);
  assert.doesNotMatch(src, /ipcRenderer\.invoke\(channel/);
});

// --- main.js: Fenster-Start-Allowlist im Hauptprozess bleibt erhalten -------

test('main.js validiert das Fenster-Startverhalten weiterhin gegen die Allowlist', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert.match(src, /WINDOW_START_BEHAVIORS\s*=\s*new Set\(\['maximized',\s*'restore',\s*'centered'\]\)/);
  assert.match(src, /ipcMain\.handle\('app:setWindowStartBehavior'/);
  assert.match(src, /WINDOW_START_BEHAVIORS\.has\(value\)/);
});
