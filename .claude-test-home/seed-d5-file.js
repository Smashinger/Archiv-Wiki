'use strict';
const incomingStore = require('/home/smashii/Dokumente/Archiv Wiki/archiv-wiki/main/incoming-store.js');
const projectPath = '/home/smashii/Dokumente/Archiv Wiki/archiv-wiki/.claude-test-wiki';
incomingStore.createIncomingFromFile(
  projectPath,
  '/home/smashii/Dokumente/Archiv Wiki/archiv-wiki/.claude-test-home/seed-source.txt',
  { type: 'file' }
);
console.log('file entry re-seeded');
