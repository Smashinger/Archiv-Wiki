// main/ai-knowledge.js — Wissenspflege- und Qualitätsprüfungs-Engine
// Analysiert das geöffnete Wiki auf defekte Links, leere Notizen, fehlende Tags,
// verwaiste Notizen und thematische/inhaltliche Duplikate.

'use strict';

const path = require('path');
const notesFs = require('./notes-fs');

const WIKILINK_PATTERN = /\[\[([^\]\n|]+?)(?:\|([^\]\n]+?))?\]\]/g;

const GERMAN_STOPWORDS = new Set([
  'aber', 'alle', 'allem', 'allen', 'aller', 'alles', 'als', 'also', 'am', 'an',
  'andere', 'anderem', 'anderen', 'anderer', 'anderes', 'anderm', 'andern', 'anderr', 'anders',
  'auch', 'auf', 'aus', 'bei', 'beide', 'beiden', 'beider', 'beides', 'beim', 'bereits',
  'bin', 'bis', 'bist', 'da', 'damit', 'dann', 'das', 'dass', 'daß', 'dein', 'deine',
  'deinem', 'deinen', 'deiner', 'deines', 'dem', 'demselben', 'den', 'denen', 'denn',
  'denselben', 'der', 'dere', 'deren', 'derer', 'derselbe', 'derselben', 'des', 'desselben',
  'dessen', 'dich', 'die', 'dies', 'diese', 'dieselbe', 'dieselben', 'diesem', 'diesen',
  'dieser', 'dieses', 'dir', 'doch', 'dort', 'du', 'durch', 'ein', 'eine', 'einem',
  'einen', 'einer', 'eines', 'einige', 'einigen', 'einiger', 'einiges', 'einmal', 'er',
  'es', 'etwas', 'euch', 'euer', 'eure', 'eurem', 'euren', 'eurer', 'eures', 'für',
  'gegen', 'gewesen', 'hab', 'habe', 'haben', 'hat', 'hatte', 'hatten', 'hier', 'hin',
  'hinter', 'ich', 'ihm', 'ihn', 'ihnen', 'ihr', 'ihre', 'ihrem', 'ihren', 'ihrer',
  'ihres', 'im', 'immer', 'in', 'indem', 'ins', 'ist', 'jede', 'jedem', 'jeden',
  'jeder', 'jedes', 'jene', 'jenem', 'jenen', 'jener', 'jenes', 'jetzt', 'kann',
  'kannst', 'können', 'könnt', 'machen', 'man', 'manche', 'manchem', 'manchen', 'mancher',
  'manches', 'mein', 'meine', 'meinem', 'meinen', 'meiner', 'meines', 'mich', 'mir',
  'mit', 'muss', 'musste', 'nach', 'nicht', 'nichts', 'noch', 'nun', 'nur', 'oder',
  'ohne', 'sehr', 'sein', 'seine', 'seinem', 'seinen', 'seiner', 'seines', 'selbst',
  'sich', 'sie', 'sind', 'so', 'solche', 'solchem', 'solchen', 'solcher', 'solches',
  'soll', 'sollte', 'sondern', 'sonst', 'über', 'um', 'und', 'uns', 'unser',
  'unsere', 'unserem', 'unseren', 'unserer', 'unseres', 'unter', 'viel', 'vom', 'von',
  'vor', 'war', 'waren', 'warst', 'was', 'weg', 'weil', 'weiter', 'welche',
  'welchem', 'welchen', 'welcher', 'welches', 'wenn', 'wer', 'werde', 'werden', 'wie',
  'wieder', 'will', 'wir', 'wird', 'wirst', 'wo', 'wollen', 'wollte', 'würde',
  'würden', 'zu', 'zum', 'zur', 'zwar', 'zwischen'
]);

function maskCodeRegions(markdown) {
  return String(markdown || '')
    .replace(/(^|\n)([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2\3(?=\n|$)/g, match => ' '.repeat(match.length))
    .replace(/(^|\n)([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*$/g, match => ' '.repeat(match.length))
    .replace(/(`+)([^\n]*?)\1/g, match => ' '.repeat(match.length));
}

function extractWikilinks(body) {
  const links = [];
  const text = maskCodeRegions(body);
  WIKILINK_PATTERN.lastIndex = 0;
  let match;
  while ((match = WIKILINK_PATTERN.exec(text)) !== null) {
    const target = match[1].trim();
    if (target) {
      links.push({
        target,
        displayText: (match[2] || match[1]).trim(),
        syntax: match[0]
      });
    }
  }
  return links;
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]/gi, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 3 && !GERMAN_STOPWORDS.has(token));
}

function auditKnowledgeBase(projectPath) {
  if (!projectPath) {
    throw new Error('Kein Projektordner angegeben.');
  }

  const docs = notesFs.getSearchDocuments(projectPath) || [];
  const activeDocs = docs.filter(d => !d.archived);

  // Erstelle Such-Index für existierende Titel und Dateinamen (case-insensitive)
  const existingTitles = new Set();
  const existingBaseNames = new Set();
  const docByRelPath = new Map();

  for (const doc of activeDocs) {
    const titleNorm = String(doc.title || '').trim().toLocaleLowerCase('de');
    if (titleNorm) existingTitles.add(titleNorm);
    const baseNorm = path.basename(doc.relPath, '.md').trim().toLocaleLowerCase('de');
    if (baseNorm) existingBaseNames.add(baseNorm);
    docByRelPath.set(doc.relPath, doc);
  }

  const brokenLinks = [];
  const emptyNotes = [];
  const notesWithoutTags = [];
  const incomingLinkCounts = new Map();
  const outgoingLinkCounts = new Map();
  const titleMap = new Map();

  // Initialisiere Link-Zähler
  for (const doc of activeDocs) {
    incomingLinkCounts.set(doc.relPath, 0);
    outgoingLinkCounts.set(doc.relPath, 0);

    // Titel-Duplikat-Prüfung (Normalisierter Titel)
    const normKey = String(doc.title || path.basename(doc.relPath, '.md'))
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]/g, '');

    if (normKey) {
      if (!titleMap.has(normKey)) titleMap.set(normKey, []);
      titleMap.get(normKey).push({
        relPath: doc.relPath,
        title: doc.title,
        category: doc.category || ''
      });
    }
  }

  // Analysiere Notizen
  for (const doc of activeDocs) {
    // 1. Leere Notizen
    const bodyTrim = String(doc.body || '').trim();
    if (bodyTrim.length === 0) {
      emptyNotes.push({
        relPath: doc.relPath,
        title: doc.title,
        category: doc.category || ''
      });
    }

    // 2. Notizen ohne Tags
    const tags = Array.isArray(doc.tags) ? doc.tags.map(t => String(t).trim()).filter(Boolean) : [];
    if (tags.length === 0) {
      notesWithoutTags.push({
        relPath: doc.relPath,
        title: doc.title,
        category: doc.category || ''
      });
    }

    // 3. Wikilinks auswerten
    const links = extractWikilinks(doc.body);
    outgoingLinkCounts.set(doc.relPath, links.length);

    for (const link of links) {
      const targetNorm = link.target.toLocaleLowerCase('de');
      const exists = existingTitles.has(targetNorm) || existingBaseNames.has(targetNorm);

      if (!exists) {
        const sourceDir = path.dirname(doc.relPath).replace(/\\/g, '/');
        brokenLinks.push({
          sourceRelPath: doc.relPath,
          sourceTitle: doc.title,
          target: link.target,
          displayText: link.displayText,
          syntax: link.syntax,
          suggestedSubCategory: sourceDir !== '.' ? sourceDir : (doc.category || '')
        });
      } else {
        // Zähle eingehenden Link auf passendes Dokument
        for (const targetDoc of activeDocs) {
          const tDocTitle = String(targetDoc.title || '').trim().toLocaleLowerCase('de');
          const tDocBase = path.basename(targetDoc.relPath, '.md').trim().toLocaleLowerCase('de');
          if (tDocTitle === targetNorm || tDocBase === targetNorm) {
            incomingLinkCounts.set(targetDoc.relPath, (incomingLinkCounts.get(targetDoc.relPath) || 0) + 1);
          }
        }
      }
    }
  }

  // 4. Verwaiste Notizen (0 eingehende UND 0 ausgehende Links)
  const orphanedNotes = [];
  for (const doc of activeDocs) {
    const incoming = incomingLinkCounts.get(doc.relPath) || 0;
    const outgoing = outgoingLinkCounts.get(doc.relPath) || 0;
    if (incoming === 0 && outgoing === 0) {
      orphanedNotes.push({
        relPath: doc.relPath,
        title: doc.title,
        category: doc.category || ''
      });
    }
  }

  // 5. Potenzielle Titel-Duplikate filtern
  const potentialDuplicates = [];
  for (const [normKey, noteList] of titleMap.entries()) {
    if (noteList.length > 1) {
      potentialDuplicates.push({
        normalizedTitle: normKey,
        count: noteList.length,
        notes: noteList
      });
    }
  }

  const totalIssues = brokenLinks.length + emptyNotes.length + notesWithoutTags.length + orphanedNotes.length + potentialDuplicates.length;
  const isHealthy = totalIssues === 0;

  let summary = `Wissenspflege-Prüfung abgeschlossen für ${activeDocs.length} Notizen: `;
  if (isHealthy) {
    summary += 'Alles in bester Ordnung! Keine defekten Links, leeren Notizen oder verwaisten Einträge gefunden.';
  } else {
    const parts = [];
    if (brokenLinks.length > 0) parts.push(`${brokenLinks.length} defekte(r) Wikilink(s)`);
    if (emptyNotes.length > 0) parts.push(`${emptyNotes.length} leere Notiz(en)`);
    if (notesWithoutTags.length > 0) parts.push(`${notesWithoutTags.length} Notiz(en) ohne Tags`);
    if (orphanedNotes.length > 0) parts.push(`${orphanedNotes.length} verwaiste Notiz(en)`);
    if (potentialDuplicates.length > 0) parts.push(`${potentialDuplicates.length} mögliche(s) Namensduplikat(e)`);
    summary += `${totalIssues} Auffälligkeit(en) gefunden (${parts.join(', ')}).`;
  }

  return {
    totalNotes: activeDocs.length,
    isHealthy,
    totalIssues,
    summary,
    issues: {
      brokenLinks,
      emptyNotes,
      notesWithoutTags,
      orphanedNotes,
      potentialDuplicates
    }
  };
}

function findDuplicateNotes(projectPath, { query = '', threshold = 0.45 } = {}) {
  if (!projectPath) {
    throw new Error('Kein Projektordner angegeben.');
  }

  const docs = notesFs.getSearchDocuments(projectPath) || [];
  let candidateDocs = docs.filter(d => !d.archived);

  if (query && String(query).trim()) {
    const cleanQ = String(query).trim().toLowerCase();
    candidateDocs = candidateDocs.filter(d => {
      return (
        String(d.title || '').toLowerCase().includes(cleanQ) ||
        String(d.body || '').toLowerCase().includes(cleanQ) ||
        (Array.isArray(d.tags) && d.tags.some(t => String(t).toLowerCase().includes(cleanQ)))
      );
    });
  }

  if (candidateDocs.length < 2) {
    return {
      query: query || null,
      evaluatedNotes: candidateDocs.length,
      duplicatePairs: [],
      message: candidateDocs.length === 0
        ? 'Keine passenden Notizen für die Analyse gefunden.'
        : 'Zu wenige Notizen für einen Duplikatsvergleich (mindestens 2 erforderlich).'
    };
  }

  // Erstelle Token-Sets für jedes Dokument mit Gewichtung
  const docTokens = candidateDocs.map(doc => {
    const titleTokens = tokenize(doc.title);
    const tagTokens = tokenize((doc.tags || []).join(' '));
    const bodyTokens = tokenize(doc.body);

    // Alle eindeutigen Tokens sammeln
    const allTokens = new Set([
      ...titleTokens,
      ...tagTokens,
      ...bodyTokens
    ]);

    return {
      doc,
      titleTokens: new Set(titleTokens),
      tagTokens: new Set(tagTokens),
      allTokens,
      tokenCount: allTokens.size
    };
  });

  const duplicatePairs = [];

  // Paarweiser Vergleich
  for (let i = 0; i < docTokens.length; i++) {
    for (let j = i + 1; j < docTokens.length; j++) {
      const a = docTokens[i];
      const b = docTokens[j];

      if (a.tokenCount === 0 || b.tokenCount === 0) continue;

      // Schnittmenge berechnen
      const commonTerms = [];
      for (const term of a.allTokens) {
        if (b.allTokens.has(term)) {
          commonTerms.push(term);
        }
      }

      // Dice-Koeffizient: 2 * |A ∩ B| / (|A| + |B|)
      let dice = (2 * commonTerms.length) / (a.tokenCount + b.tokenCount);

      // Bonus für übereinstimmende Titel-Tokens
      let titleOverlapCount = 0;
      for (const t of a.titleTokens) {
        if (b.titleTokens.has(t)) titleOverlapCount++;
      }
      if (titleOverlapCount > 0) {
        dice = Math.min(1.0, dice + 0.15 * titleOverlapCount);
      }

      // Bonus für identische Tags
      let tagOverlapCount = 0;
      for (const t of a.tagTokens) {
        if (b.tagTokens.has(t)) tagOverlapCount++;
      }
      if (tagOverlapCount > 0) {
        dice = Math.min(1.0, dice + 0.1 * tagOverlapCount);
      }

      const score = Math.round(dice * 100) / 100;
      if (score >= threshold) {
        duplicatePairs.push({
          noteA: {
            relPath: a.doc.relPath,
            title: a.doc.title,
            category: a.doc.category || ''
          },
          noteB: {
            relPath: b.doc.relPath,
            title: b.doc.title,
            category: b.doc.category || ''
          },
          similarityScore: score,
          commonTerms: commonTerms.slice(0, 8),
          reason: `Gemeinsame Schlüsselbegriffe: ${commonTerms.slice(0, 5).join(', ')}${titleOverlapCount > 0 ? ' (sehr ähnlicher Titel)' : ''}`
        });
      }
    }
  }

  duplicatePairs.sort((x, y) => y.similarityScore - x.similarityScore);

  return {
    query: query || null,
    evaluatedNotes: candidateDocs.length,
    threshold,
    duplicatePairs: duplicatePairs.slice(0, 20),
    message: duplicatePairs.length > 0
      ? `${duplicatePairs.length} potenzielle(s) Notiz-Duplikat(e) mit Ähnlichkeit >= ${threshold} gefunden.`
      : `Keine auffälligen Duplikate mit Ähnlichkeit >= ${threshold} gefunden.`
  };
}

function findWikilinkCandidates(projectPath, { relPath, title, content, limit = 15 } = {}) {
  if (!projectPath) {
    throw new Error('Kein Projektordner angegeben.');
  }

  let cleanRelPath = relPath ? String(relPath).trim() : '';
  const hasContent = typeof content === 'string' && content.length > 0;

  if (!cleanRelPath && !hasContent && !title) {
    throw new Error('Weder relPath noch content angegeben.');
  }

  const docs = notesFs.getSearchDocuments(projectPath) || [];

  // Falls kein relPath, aber ein Titel übergeben wurde: Notiz im Index suchen
  if (!cleanRelPath && title) {
    const searchTitle = String(title).trim().toLowerCase();
    const match = docs.find(d => !d.archived && (d.title || '').toLowerCase() === searchTitle);
    if (match) {
      cleanRelPath = match.relPath;
    }
  }

  let noteBody = '';
  let noteTitle = '';

  if (typeof content === 'string' && content.length > 0) {
    noteBody = content;
    if (cleanRelPath) {
      const matchDoc = docs.find(d => d.relPath === cleanRelPath);
      noteTitle = matchDoc?.title || path.basename(cleanRelPath, '.md');
    } else if (title) {
      noteTitle = String(title).trim();
    }
  } else if (cleanRelPath) {
    const note = notesFs.readNote(projectPath, cleanRelPath);
    noteBody = note.body || '';
    noteTitle = note.frontmatter?.title || path.basename(cleanRelPath, '.md');
  } else {
    throw new Error('Weder relPath noch content angegeben.');
  }

  // Zielnotizen: nicht archiviert, und nicht die untersuchte Notiz selbst
  const activeTargets = docs.filter(d => !d.archived && (!cleanRelPath || d.relPath !== cleanRelPath));

  if (activeTargets.length === 0 || !noteBody.trim()) {
    return {
      relPath: cleanRelPath || null,
      noteTitle: noteTitle || null,
      candidatesCount: 0,
      candidates: []
    };
  }

  // Sammle eindeutige Zielbegriffe (Titel und Dateibasenamen)
  const targetsMap = new Map();
  const currentTitleNorm = noteTitle ? noteTitle.trim().toLowerCase() : '';

  for (const doc of activeTargets) {
    const docTitle = String(doc.title || '').trim();
    const baseName = path.basename(doc.relPath, '.md').trim();

    // 1. Titel als Ziel
    if (docTitle.length >= 3 && !GERMAN_STOPWORDS.has(docTitle.toLowerCase())) {
      const norm = docTitle.toLowerCase();
      if (!targetsMap.has(norm) && norm !== currentTitleNorm) {
        targetsMap.set(norm, {
          term: docTitle,
          targetTitle: docTitle,
          targetRelPath: doc.relPath,
          length: docTitle.length
        });
      }
    }

    // 2. BaseName als Ziel (falls sinnvoll und nicht identisch mit Titel)
    if (baseName.length >= 3 && !GERMAN_STOPWORDS.has(baseName.toLowerCase())) {
      const norm = baseName.toLowerCase();
      if (!targetsMap.has(norm) && norm !== currentTitleNorm) {
        targetsMap.set(norm, {
          term: baseName,
          targetTitle: docTitle || baseName,
          targetRelPath: doc.relPath,
          length: baseName.length
        });
      }
    }
  }

  // Nach Begriffslänge absteigend sortieren, damit längere Phrasen zuerst matchen
  const sortedTargets = Array.from(targetsMap.values()).sort((a, b) => b.length - a.length);

  // Maskiere Code-Blöcke
  let searchContext = maskCodeRegions(noteBody);
  // Maskiere YAML-Frontmatter falls im übergebenen Text vorhanden
  searchContext = searchContext.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, match => ' '.repeat(match.length));
  // Maskiere bereits existierende Wikilinks [[...]]
  searchContext = searchContext.replace(WIKILINK_PATTERN, match => ' '.repeat(match.length));
  // Maskiere Markdown-Links und Bilder [text](url)
  searchContext = searchContext.replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, match => ' '.repeat(match.length));
  // Maskiere HTML-Tags
  searchContext = searchContext.replace(/<[^>\n]+>/g, match => ' '.repeat(match.length));

  const candidates = [];

  for (const target of sortedTargets) {
    const escaped = target.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<![\\p{L}\\p{N}_])(${escaped})(?![\\p{L}\\p{N}_])`, 'gui');

    let matchCount = 0;
    let m;
    while ((m = regex.exec(searchContext)) !== null) {
      matchCount++;
    }

    if (matchCount > 0) {
      const suggestedSyntax = target.targetTitle.toLowerCase() === target.term.toLowerCase()
        ? `[[${target.targetTitle}]]`
        : `[[${target.targetTitle}|${target.term}]]`;

      candidates.push({
        term: target.term,
        targetTitle: target.targetTitle,
        targetRelPath: target.targetRelPath,
        occurrences: matchCount,
        suggestedSyntax
      });

      // Maskiere gefundene Treffer, damit kürzere Teilbegriffe nicht redundant matchen
      searchContext = searchContext.replace(regex, match => ' '.repeat(match.length));
    }
  }

  // Sortiere Kandidaten nach Häufigkeit (occurrences) absteigend
  candidates.sort((a, b) => b.occurrences - a.occurrences);

  const maxLimit = Math.max(1, Math.min(50, Number(limit) || 15));

  return {
    relPath: cleanRelPath || null,
    noteTitle: noteTitle || null,
    candidatesCount: candidates.length,
    candidates: candidates.slice(0, maxLimit)
  };
}

module.exports = {
  auditKnowledgeBase,
  findDuplicateNotes,
  findWikilinkCandidates,
  maskCodeRegions,
  extractWikilinks,
  tokenize
};
