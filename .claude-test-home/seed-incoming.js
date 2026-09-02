// Einmalig ausgeführtes Seed-Skript für den D1-Dialog-Test — legt für jeden
// Eingangstyp genau einen Eintrag direkt über incoming-store.js an (dieselbe
// Speicherfunktion, die auch der echte Web Clipper/die App nutzen — kein
// separater Testpfad, keine Änderung an der Speicherlogik selbst).
'use strict';

const path = require('path');
const incomingStore = require(path.join('/home/smashii/Dokumente/Archiv Wiki/archiv-wiki', 'main/incoming-store.js'));

const projectPath = '/home/smashii/Dokumente/Archiv Wiki/archiv-wiki/.claude-test-wiki';

incomingStore.ensureIncomingStorage(projectPath);

incomingStore.createIncoming(projectPath, {
  title: 'Testtext',
  text: 'Ein einfacher Text-Eingang zum Testen der Verarbeitungs-Optionen.',
  type: 'text'
});

incomingStore.receiveWebClip(projectPath, {
  title: 'Test Textauswahl',
  url: 'https://example.com/selection',
  content: 'Markierter Text zum Testen der Sammelart "selection".',
  type: 'webpage',
  captureMode: 'selection'
});

incomingStore.receiveWebClip(projectPath, {
  title: 'Test URL',
  url: 'https://example.com/url-clip',
  content: '',
  type: 'webpage',
  captureMode: 'url'
});

incomingStore.receiveWebClip(projectPath, {
  title: 'Test ganze Seite',
  url: 'https://example.com/page-clip',
  content: 'Der vollständige gesammelte Seiteninhalt zum Testen der Sammelart "page".',
  type: 'webpage',
  captureMode: 'page'
});

incomingStore.createIncomingFromFile(
  projectPath,
  '/home/smashii/Dokumente/Archiv Wiki/archiv-wiki/.claude-test-home/seed-source.txt',
  { type: 'file' }
);

incomingStore.createIncomingFromFile(
  projectPath,
  '/home/smashii/Dokumente/Archiv Wiki/archiv-wiki/extension/icons/icon-48.png',
  { type: 'image' }
);

const entries = incomingStore.loadIncoming(projectPath);
console.log('seeded entries:', entries.map(e => ({ id: e.id, type: e.type, captureMode: e.captureMode, title: e.title })));
