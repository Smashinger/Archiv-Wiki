// renderer/js/wiki-switcher-data.js
// Wiki-Wechsler: reine Ansichtslogik (kein DOM, keine IPC) für das Auswahlmenü
// am Wiki-Namen in der Titelleiste. Die Daten liefert der Hauptprozess
// (projects:getKnown, main/known-projects.js); app.js hängt nur die Aktionen an.

import { escapeHtml } from './html-export.js';

// Gleich lautende Wiki-Namen werden um den Ordnernamen ergänzt, damit sich
// zwei Einträge in der Liste immer unterscheiden lassen.
function folderName(projectPath) {
  const parts = String(projectPath || '').split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || String(projectPath || '');
}

export function buildWikiSwitcherEntries(projects) {
  const list = Array.isArray(projects) ? projects : [];
  const nameCounts = new Map();
  for (const project of list) {
    nameCounts.set(project.name, (nameCounts.get(project.name) || 0) + 1);
  }
  return list.map((project) => {
    const duplicate = nameCounts.get(project.name) > 1;
    let hint = '';
    if (project.status === 'missing') hint = 'nicht gefunden';
    else if (project.status === 'invalid') hint = 'nicht lesbar';
    else if (duplicate) hint = folderName(project.path);
    return {
      path: project.path,
      name: project.name || folderName(project.path),
      isCurrent: Boolean(project.isCurrent),
      reachable: project.status === 'ok',
      hint
    };
  });
}

function renderEntryButton(entry, action) {
  const classes = ['wiki-switcher-item'];
  if (entry.isCurrent) classes.push('is-current');
  if (!entry.reachable) classes.push('is-unreachable');
  const current = entry.isCurrent ? ' aria-current="true"' : '';
  const hint = entry.hint ? `<span class="wiki-switcher-hint">${escapeHtml(entry.hint)}</span>` : '';
  return `<button type="button" class="${classes.join(' ')}" data-wiki-action="${action}" data-wiki-path="${escapeHtml(entry.path)}" title="${escapeHtml(entry.path)}"${current}>`
    + `<span class="wiki-switcher-check" aria-hidden="true">${entry.isCurrent ? '✓' : ''}</span>`
    + `<span class="wiki-switcher-name">${escapeHtml(entry.name)}</span>${hint}</button>`;
}

export function buildWikiSwitcherMenuHtml(projects) {
  const entries = buildWikiSwitcherEntries(projects);
  const canForget = entries.some(entry => !entry.isCurrent);
  return [
    '<div class="context-menu-label" aria-hidden="true">Wiki wechseln</div>',
    ...entries.map(entry => renderEntryButton(entry, 'switch')),
    entries.length ? '<hr>' : '',
    '<button type="button" data-wiki-action="open">Weiteren Wiki-Ordner öffnen …</button>',
    canForget ? '<button type="button" data-wiki-action="forget-menu">Aus Liste entfernen …</button>' : ''
  ].join('');
}

// Zweite Stufe von "Aus Liste entfernen …": nur Wikis, die gerade NICHT
// geöffnet sind — das aktive Wiki bleibt immer in der Liste.
export function buildWikiForgetMenuHtml(projects) {
  const entries = buildWikiSwitcherEntries(projects).filter(entry => !entry.isCurrent);
  return [
    '<div class="context-menu-label" aria-hidden="true">Aus Liste entfernen</div>',
    ...entries.map(entry => renderEntryButton(entry, 'forget'))
  ].join('');
}
