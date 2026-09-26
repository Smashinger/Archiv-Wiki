'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const testHome = path.join(root, '.Codex-test-home');
const nfs = require('../main/notes-fs');
const { atomicWriteFileSync, atomicCopyFileSync } = require('../main/atomic-write');
const { registerFilesystemIpc } = require('../main/filesystem-ipc');

function makeTestDir(t, prefix) {
  fs.mkdirSync(testHome, { recursive: true });
  const dir = fs.mkdtempSync(path.join(testHome, `${prefix}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeSimpleNote(projectPath, relPath, body = 'Ausgangstext') {
  const fullPath = path.join(projectPath, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, body, 'utf8');
  return fullPath;
}

function registerTestFilesystemIpc(projectPath) {
  const handlers = new Map();
  registerFilesystemIpc({
    getCurrentProject: () => ({ path: projectPath }),
    ipcMainApi: { handle: (channel, handler) => handlers.set(channel, handler) },
    isTrustedSender: event => event?.trusted === true
  });
  return handlers;
}

test('Phase 2 Dateisystem: Traversal, interne Dateien und Symlinks sind keine Notizen', t => {
  const sandbox = makeTestDir(t, 'phase2-paths');
  const projectPath = path.join(sandbox, 'wiki');
  const outsidePath = path.join(sandbox, 'ausserhalb.md');
  fs.mkdirSync(projectPath);
  fs.writeFileSync(path.join(projectPath, '.wiki-config.json'), '{"secret":true}', 'utf8');
  fs.writeFileSync(outsidePath, 'AUSSEN', 'utf8');
  fs.symlinkSync(outsidePath, path.join(projectPath, 'verknuepfung.md'));

  assert.throws(() => nfs.resolveSafe(projectPath, '../ausserhalb.md'), /außerhalb/);
  assert.throws(() => nfs.readNote(projectPath, '.wiki-config.json'), /Interne|ungültige/);
  assert.throws(() => nfs.readNote(projectPath, 'verknuepfung.md'), /Symbolische/);
  assert.throws(() => nfs.writeNote(projectPath, 'verknuepfung.md', 'NEU'), /Symbolische/);
  assert.equal(fs.readFileSync(outsidePath, 'utf8'), 'AUSSEN');
});

test('Phase 2 Dateisystem: sichtbare Markdown-Notizen bleiben normal les- und schreibbar', t => {
  const projectPath = makeTestDir(t, 'phase2-note');
  writeSimpleNote(projectPath, path.join('Haupt', 'Unter', 'Notiz.md'));

  const before = nfs.readNote(projectPath, path.join('Haupt', 'Unter', 'Notiz.md'));
  const saved = nfs.writeNote(
    projectPath,
    path.join('Haupt', 'Unter', 'Notiz.md'),
    'Gespeichert',
    undefined,
    before.version
  );

  assert.equal(nfs.readNote(projectPath, saved.relPath).body.trim(), 'Gespeichert');
});

test('Phase 2 Dateisystem: konkurrierender Schreibstand wird nicht überschrieben', t => {
  const projectPath = makeTestDir(t, 'phase2-conflict');
  const relPath = path.join('Haupt', 'Unter', 'Notiz.md');
  writeSimpleNote(projectPath, relPath);
  const staleVersion = nfs.readNote(projectPath, relPath).version;

  nfs.writeNote(projectPath, relPath, 'Erster Schreibzugriff', undefined, staleVersion);
  assert.throws(
    () => nfs.writeNote(projectPath, relPath, 'Veralteter Schreibzugriff', undefined, staleVersion),
    error => error?.code === 'NOTE_CONFLICT'
  );
  assert.equal(nfs.readNote(projectPath, relPath).body.trim(), 'Erster Schreibzugriff');
});

test('Phase 2 Dateisystem: Punktpräfixe erzeugen keine versteckten Wiki-Einträge', t => {
  const projectPath = makeTestDir(t, 'phase2-hidden-name');
  const created = nfs.createMainCategory(projectPath, '.Versteckt');

  assert.equal(created.name, 'Versteckt');
  assert.equal(fs.existsSync(path.join(projectPath, 'Versteckt')), true);
  assert.equal(fs.existsSync(path.join(projectPath, '.Versteckt')), false);
});

test('Phase 2 IPC: Dateisystemkanäle sperren fremde Sender vor jeder Operation', t => {
  const projectPath = makeTestDir(t, 'phase2-ipc-sender');
  const handlers = registerTestFilesystemIpc(projectPath);

  assert.throws(
    () => handlers.get('fs:createMainCategory')({ trusted: false }, 'Nicht anlegen'),
    error => error?.code === 'IPC_SENDER_INVALID'
  );
  assert.equal(fs.existsSync(path.join(projectPath, 'Nicht anlegen')), false);
});

test('Phase 2 IPC: Argumenttypen werden vor Dateisystemzugriff strikt abgewiesen', t => {
  const projectPath = makeTestDir(t, 'phase2-ipc-args');
  const handlers = registerTestFilesystemIpc(projectPath);
  const event = { trusted: true };

  assert.throws(
    () => handlers.get('fs:saveAttachment')(event, { name: 'bild.png' }, new Uint8Array([1])),
    error => error?.code === 'IPC_ARGUMENT_INVALID'
  );
  assert.throws(
    () => handlers.get('fs:writeNote')(event, 'Notiz.md', { body: 'kein Text' }),
    error => error?.code === 'IPC_ARGUMENT_INVALID'
  );
  assert.throws(
    () => handlers.get('fs:applyTagOperation')(event, { type: 'shell' }, []),
    error => error?.code === 'IPC_ARGUMENT_INVALID'
  );
  assert.equal(fs.existsSync(path.join(projectPath, '.attachments')), false);
});

test('Phase 2 IPC: gültiger Hauptfenster-Aufruf erreicht die gehärtete Notizgrenze', t => {
  const projectPath = makeTestDir(t, 'phase2-ipc-valid');
  const relPath = path.join('Haupt', 'Unter', 'Notiz.md');
  writeSimpleNote(projectPath, relPath, 'IPC-Inhalt');
  const handlers = registerTestFilesystemIpc(projectPath);

  const note = handlers.get('fs:readNote')({ trusted: true }, relPath);
  assert.equal(note.body.trim(), 'IPC-Inhalt');
  assert.throws(
    () => handlers.get('fs:readNote')({ trusted: true }, '.wiki-config.json'),
    /Interne|ungültige/
  );
});

test('Phase 2 Atomic Write: ENOSPC räumt Temp-Datei auch bei unzuverlässigem existsSync auf', t => {
  const dir = makeTestDir(t, 'phase2-atomic-write');
  const targetPath = path.join(dir, 'notiz.md');
  fs.writeFileSync(targetPath, 'ALT', 'utf8');

  const originalFsyncSync = fs.fsyncSync;
  const originalExistsSync = fs.existsSync;
  fs.fsyncSync = () => {
    const error = new Error('Kein Speicherplatz');
    error.code = 'ENOSPC';
    throw error;
  };
  fs.existsSync = candidate => String(candidate).includes('.tmp-')
    ? false
    : originalExistsSync(candidate);
  t.after(() => {
    fs.fsyncSync = originalFsyncSync;
    fs.existsSync = originalExistsSync;
  });

  assert.throws(() => atomicWriteFileSync(targetPath, 'NEU', 'utf8'), error => error?.code === 'ENOSPC');
  assert.equal(fs.readFileSync(targetPath, 'utf8'), 'ALT');
  assert.deepEqual(fs.readdirSync(dir).filter(name => name.includes('.tmp-')), []);
});

test('Phase 2 Atomic Copy: Fehler vor Rename hinterlässt keine Temp-Datei', t => {
  const dir = makeTestDir(t, 'phase2-atomic-copy');
  const sourcePath = path.join(dir, 'quelle.md');
  const targetPath = path.join(dir, 'ziel.md');
  fs.writeFileSync(sourcePath, 'QUELLE', 'utf8');
  fs.writeFileSync(targetPath, 'ALT', 'utf8');

  const originalFsyncSync = fs.fsyncSync;
  fs.fsyncSync = () => {
    const error = new Error('Keine Berechtigung');
    error.code = 'EACCES';
    throw error;
  };
  t.after(() => { fs.fsyncSync = originalFsyncSync; });

  assert.throws(() => atomicCopyFileSync(sourcePath, targetPath), error => error?.code === 'EACCES');
  assert.equal(fs.readFileSync(targetPath, 'utf8'), 'ALT');
  assert.deepEqual(fs.readdirSync(dir).filter(name => name.includes('.tmp-')), []);
});

test('Phase 2 Integrity: M4 - renameEntry meldet ROLLBACK_FAILED wenn Rollback ebenfalls fehlschlägt', t => {
  const dir = makeTestDir(t, 'phase2-rollback-failed');
  const projectDir = dir;
  const relPath = 'Haupt/Unter/Test.md';
  writeSimpleNote(projectDir, relPath, '---\ntitle: Test\n---\nInhalt');

  const originalRenameSync = fs.renameSync;
  let callCount = 0;
  fs.renameSync = (from, to) => {
    callCount++;
    if (callCount === 1) {
      return originalRenameSync(from, to);
    }
    const error = new Error('I/O error during rollback');
    error.code = 'EIO';
    throw error;
  };
  t.after(() => { fs.renameSync = originalRenameSync; });

  const originalWriteFileSync = fs.writeFileSync;
  fs.writeFileSync = (p, data, opt) => {
    if (String(p).includes('NeuerName')) {
      const err = new Error('Disk full');
      err.code = 'ENOSPC';
      throw err;
    }
    return originalWriteFileSync(p, data, opt);
  };
  t.after(() => { fs.writeFileSync = originalWriteFileSync; });

  assert.throws(
    () => nfs.renameEntry(projectDir, relPath, 'NeuerName'),
    err => {
      assert.equal(err.code, 'ROLLBACK_FAILED');
      assert.ok(err.cause);
      assert.ok(err.rollbackError);
      return true;
    }
  );
});
