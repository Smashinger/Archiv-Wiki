'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  auditKnowledgeBase,
  findDuplicateNotes,
  findWikilinkCandidates,
  tokenize,
  maskCodeRegions,
  maskRawUrls,
  RAW_URL_PATTERN,
  extractWikilinks
} = require('../main/ai-knowledge');

const root = path.join(__dirname, '..');
const testHome = path.join(root, '.Codex-test-home');

function createKnowledgeTestWiki(t) {
  fs.mkdirSync(testHome, { recursive: true });
  const wikiDir = fs.mkdtempSync(path.join(testHome, 'ai-knowledge-wiki-'));

  // 1. Kategorie A mit NoteA und NoteB
  const subA = path.join(wikiDir, 'Themen', 'Allgemein');
  fs.mkdirSync(subA, { recursive: true });

  // Note A: Verlinkt auf Note B (gültig) und NichtExistierend (defekt)
  const noteA = `---
title: "Notiz A"
tags: ["alpha"]
category: "Allgemein"
mainCategory: "Themen"
---
Hier ist ein Verweis auf [[Notiz B]] und ein defekter Verweis auf [[GibtEsNicht]].
\`\`\`markdown
Code-Block mit [[IgnorierterLink]]
\`\`\`
`;
  fs.writeFileSync(path.join(subA, 'Notiz A.md'), noteA, 'utf8');

  // Note B: Leer (nur Whitespace im Body), hat aber Tags
  const noteB = `---
title: "Notiz B"
tags: ["beta"]
category: "Allgemein"
mainCategory: "Themen"
---
   
`;
  fs.writeFileSync(path.join(subA, 'Notiz B.md'), noteB, 'utf8');

  // 2. Kategorie B mit NoteC und NoteD
  const subB = path.join(wikiDir, 'Entwicklung', 'Workflows');
  fs.mkdirSync(subB, { recursive: true });

  // Note C: Keine Tags
  const noteC = `---
title: "Notiz C"
tags: []
category: "Workflows"
mainCategory: "Entwicklung"
---
Diese Notiz hat überhaupt keine Tags.
`;
  fs.writeFileSync(path.join(subB, 'Notiz C.md'), noteC, 'utf8');

  // Note D: Verwaist (kein Link rein, kein Link raus)
  const noteD = `---
title: "Insel Notiz"
tags: ["insel"]
category: "Workflows"
mainCategory: "Entwicklung"
---
Vollkommen isoliert im Wissensgraphen.
`;
  fs.writeFileSync(path.join(subB, 'Insel Notiz.md'), noteD, 'utf8');

  // 3. Duplikat-Titel in verschiedenen Ordnern
  const subC = path.join(wikiDir, 'Projekte', 'DevOps');
  fs.mkdirSync(subC, { recursive: true });

  const dup1 = `---
title: "Docker Leitfaden"
tags: ["docker", "container", "devops"]
category: "Workflows"
mainCategory: "Entwicklung"
---
Docker Container Bereitstellung, Orchestrierung und Konfiguration für Entwickler.
`;
  fs.writeFileSync(path.join(subB, 'Docker Leitfaden.md'), dup1, 'utf8');

  const dup2 = `---
title: "Docker Leitfaden"
tags: ["docker", "container", "devops"]
category: "DevOps"
mainCategory: "Projekte"
---
Docker Container Anleitung, Orchestrierung und Konfiguration für Entwickler.
`;
  fs.writeFileSync(path.join(subC, 'Docker Leitfaden.md'), dup2, 'utf8');

  t.after(() => {
    fs.rmSync(wikiDir, { recursive: true, force: true });
  });

  return wikiDir;
}

test('AI-Knowledge 1: tokenize und maskCodeRegions filtern Code und Stopwörter', () => {
  const code = 'Vor dem Code `[[InlineLink]]` und\n```markdown\n[[BlockLink]]\n```\nnach dem Code.';
  const masked = maskCodeRegions(code);
  assert.ok(!masked.includes('InlineLink'));
  assert.ok(!masked.includes('BlockLink'));

  const tokens = tokenize('Der schnelle und sichere Docker Container für Linux!');
  assert.ok(tokens.includes('schnelle'));
  assert.ok(tokens.includes('sichere'));
  assert.ok(tokens.includes('docker'));
  assert.ok(tokens.includes('container'));
  assert.ok(tokens.includes('linux'));
  assert.ok(!tokens.includes('der'), 'Stopwort "der" gefiltert');
  assert.ok(!tokens.includes('und'), 'Stopwort "und" gefiltert');
  assert.ok(!tokens.includes('für'), 'Stopwort "für" gefiltert');
});

test('AI-Knowledge 2: auditKnowledgeBase erkennt defekte Links, leere Notizen, fehlende Tags und Insel-Notizen', t => {
  const wikiDir = createKnowledgeTestWiki(t);

  const report = auditKnowledgeBase(wikiDir);
  assert.equal(report.isHealthy, false);
  assert.ok(report.totalNotes >= 5);
  assert.ok(report.totalIssues >= 4);

  // 1. Defekte Links: [[GibtEsNicht]] gefunden, [[Notiz B]] und [[IgnorierterLink]] nicht
  const broken = report.issues.brokenLinks;
  assert.equal(broken.length, 1);
  assert.equal(broken[0].target, 'GibtEsNicht');
  assert.equal(broken[0].sourceTitle, 'Notiz A');

  // 2. Leere Notizen: Notiz B ist leer
  const empty = report.issues.emptyNotes;
  assert.ok(empty.some(n => n.title === 'Notiz B'));

  // 3. Notizen ohne Tags: Notiz C hat keine Tags
  const noTags = report.issues.notesWithoutTags;
  assert.ok(noTags.some(n => n.title === 'Notiz C'));

  // 4. Verwaiste Notizen: Insel Notiz hat 0 Links
  const orphans = report.issues.orphanedNotes;
  assert.ok(orphans.some(n => n.title === 'Insel Notiz'));

  // 5. Namensduplikate: "Docker Leitfaden" existiert doppelt
  const dups = report.issues.potentialDuplicates;
  assert.ok(dups.length >= 1);
  assert.ok(dups.some(d => d.notes.length === 2 && d.notes[0].title === 'Docker Leitfaden'));

  // 6. Zusammenfassung enthält verständlichen Text
  assert.ok(report.summary.includes('Auffälligkeit'));
});

test('AI-Knowledge 3: findDuplicateNotes erkennt inhaltliche und thematische Ähnlichkeiten', t => {
  const wikiDir = createKnowledgeTestWiki(t);

  const res = findDuplicateNotes(wikiDir, { threshold: 0.4 });
  assert.ok(res.duplicatePairs.length >= 1);

  const topPair = res.duplicatePairs[0];
  assert.ok(topPair.noteA.title === 'Docker Leitfaden' && topPair.noteB.title === 'Docker Leitfaden');
  assert.ok(topPair.similarityScore >= 0.7);
  assert.ok(topPair.commonTerms.includes('docker'));
  assert.ok(topPair.commonTerms.includes('container'));

  // Mit Filter-Query
  const filtered = findDuplicateNotes(wikiDir, { query: 'Docker', threshold: 0.3 });
  assert.equal(filtered.evaluatedNotes, 2);
  assert.equal(filtered.duplicatePairs.length, 1);

  // Mit Filter-Query ohne Treffer
  const empty = findDuplicateNotes(wikiDir, { query: 'GibtEsÜberhauptNicht12345' });
  assert.equal(empty.duplicatePairs.length, 0);
});

test('AI-Knowledge 4: Sicherheitsvalidierung fängt fehlende Argumente ab', () => {
  assert.throws(() => auditKnowledgeBase(null), /Kein Projektordner/);
  assert.throws(() => findDuplicateNotes(null), /Kein Projektordner/);
  assert.throws(() => findWikilinkCandidates(null), /Kein Projektordner/);
  assert.throws(() => findWikilinkCandidates('/dummy', {}), /Weder relPath noch content/);
});

test('AI-Knowledge 5: findWikilinkCandidates schlägt passende Wikilinks vor und ignoriert Code/Links', t => {
  const wikiDir = createKnowledgeTestWiki(t);

  // In createKnowledgeTestWiki gibt es u.a.:
  // - Themen/Allgemein/Notiz B.md (title: "Notiz B")
  // - Entwicklung/Workflows/Insel Notiz.md (title: "Insel Notiz")
  // - Entwicklung/Workflows/Docker Leitfaden.md (title: "Docker Leitfaden")

  const text = `
Hier ist ein Verweis auf Insel Notiz im Text.
Und hier erwähnen wir Docker Leitfaden.
In einem Codeblock wird \`Insel Notiz\` aber nicht als Wikilink vorgeschlagen:
\`\`\`
Insel Notiz im Code
\`\`\`
Und ein existierender Link [[Notiz B]] wird ebenfalls nicht erneut vorgeschlagen.
Und ein Markdown-Link [Insel Notiz](http://example.com) wird auch ignoriert.
`;

  const res = findWikilinkCandidates(wikiDir, {
    relPath: 'Themen/Allgemein/Notiz A.md',
    content: text
  });

  assert.ok(res);
  assert.equal(res.relPath, 'Themen/Allgemein/Notiz A.md');
  assert.ok(Array.isArray(res.candidates));

  // Insel Notiz soll 1x gefunden werden (außerhalb Code und Markdown-Link)
  const inselCandidate = res.candidates.find(c => c.term === 'Insel Notiz');
  assert.ok(inselCandidate, 'Insel Notiz als Kandidat gefunden');
  assert.equal(inselCandidate.occurrences, 1);
  assert.equal(inselCandidate.suggestedSyntax, '[[Insel Notiz]]');

  // Docker Leitfaden soll gefunden werden
  const dockerCandidate = res.candidates.find(c => c.term === 'Docker Leitfaden');
  assert.ok(dockerCandidate, 'Docker Leitfaden als Kandidat gefunden');

  // Notiz B ist bereits ein Wikilink im Text ([[Notiz B]]) und darf NICHT als Kandidat auftauchen
  const notizBCandidate = res.candidates.find(c => c.term === 'Notiz B');
  assert.equal(notizBCandidate, undefined, 'Bereits verlinkte Notiz B wird nicht vorgeschlagen');

  // Eigene Notiz (Notiz A) darf nicht vorgeschlagen werden
  const notizACandidate = res.candidates.find(c => c.term === 'Notiz A');
  assert.equal(notizACandidate, undefined, 'Eigene Notiz wird nicht vorgeschlagen');
});

test('AI-Knowledge 6: M6 - maskRawUrls und findWikilinkCandidates maskieren rohe URLs positionsstabil', t => {
  // 1. maskRawUrls direkt prüfen
  const rawSample = 'Vor der URL https://example.org/Docker-Leitfaden und mailto:admin@test.de nach der URL.';
  const masked = maskRawUrls(rawSample);
  assert.equal(masked.length, rawSample.length, 'Länge bleibt nach Maskierung exakt identisch (positionsstabil)');
  assert.ok(!masked.includes('https://'), 'https-URL maskiert');
  assert.ok(!masked.includes('Docker-Leitfaden'), 'Docker-Leitfaden innerhalb der URL maskiert');
  assert.ok(!masked.includes('mailto:'), 'mailto-URL maskiert');
  assert.ok(masked.startsWith('Vor der URL '), 'Text vor der URL bleibt erhalten');
  assert.ok(masked.endsWith(' nach der URL.'), 'Text nach der URL bleibt erhalten');

  // 2. Integration in findWikilinkCandidates
  const wikiDir = createKnowledgeTestWiki(t);
  const textWithUrls = `
Hier ist echter Text mit Docker Leitfaden.
Hier ist eine rohe URL: https://example.org/Docker-Leitfaden
Und eine Mail-Adresse: mailto:Docker-Leitfaden@example.com
`;

  const res = findWikilinkCandidates(wikiDir, {
    relPath: 'Themen/Allgemein/Notiz A.md',
    content: textWithUrls
  });

  const candidate = res.candidates.find(c => c.term === 'Docker Leitfaden');
  assert.ok(candidate, 'Docker Leitfaden im Fließtext gefunden');
  // Muss exakt 1x gefunden werden (nur im Fließtext, nicht in der URL und nicht in der Mailadresse)
  assert.equal(candidate.occurrences, 1, 'Treffer in rohen URLs und Mailto werden nicht gezählt');
});

test('AI-Knowledge 7: M7 - findDuplicateNotes validiert threshold strikt und skaliert performant', t => {
  const wikiDir = createKnowledgeTestWiki(t);

  // 1. threshold außerhalb des Bereichs (zu klein) wird auf mindestens 0.1 geclampt
  const resLow = findDuplicateNotes(wikiDir, { threshold: -0.5 });
  assert.equal(resLow.threshold, 0.1, 'Negativer threshold wird auf 0.1 geclampt');

  // 2. threshold außerhalb des Bereichs (zu groß) wird auf 1.0 geclampt
  const resHigh = findDuplicateNotes(wikiDir, { threshold: 2.0 });
  assert.equal(resHigh.threshold, 1.0, 'Überhöhter threshold wird auf 1.0 geclampt');

  // 3. Nicht-numerischer threshold fällt auf Standard 0.45 zurück
  const resNaN = findDuplicateNotes(wikiDir, { threshold: 'keine-zahl' });
  assert.equal(resNaN.threshold, 0.45, 'Ungültiger threshold fällt auf 0.45 zurück');

  // 4. Sehr hoher threshold (1.0) schließt Paare mit geringerem Score aus
  assert.ok(resHigh.duplicatePairs.every(p => p.similarityScore >= 1.0), 'Nur perfekte Übereinstimmungen (Score 1.0)');
});

