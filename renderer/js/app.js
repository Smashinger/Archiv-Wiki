// renderer/js/app.js — Schritt 5: Hauptlogik der echten Oberfläche.
// Ersetzt die provisorischen Test-Seiten aus Schritt 3/4 (fs-test.js,
// editor-test.js, boot.js) durch die vollständige Sidebar/Topbar/Notiz-UI.

import * as fs from './filesystem.js';
import { buildSyncIntervalOptionsHtml } from './sync-shared.js';
import { applyAccentPalette, buildAccentSwatchesHtml, SIDEBAR_DENSITY_PRESETS, applySidebarDensity, applyEditorFontSize, EDITOR_FONT_SIZE_DEFAULT, setFocusMode, applyReadingWidth } from './theme.js';
import { ICON_LIBRARY, ICON_CATEGORIES, searchIconLibrary, resolveIconLibraryPath } from './icon-library.js';
import { escapeHtml, buildStandaloneNoteHtml } from './html-export.js';
import { fetchUpdateStatus, requestUpdateCheck, onUpdateStatusChanged, renderUpdateStatus } from './update-check.js';
import { showSettingsWindow } from './settings-window.js';
import { animateIn, animateOut } from './motion.js';
import { manageModalDialog, closeManagedDialogs, showMessageDialog, showConfirmDialog } from './dialog.js';
import { initEllipsisTooltips } from './tooltip.js';
import { openNoteInEditor, openIncomingInEditor, openNoteDraftInEditor, saveNow, saveUntilClean, isDirty, getOpenRelPath, retargetOpenNote, closeEditor, insertAtCursor, wrapSelection, editorHasSelection, getEditorSelectionText, deleteEditorSelection, selectAllInEditor, moveEditorCursorToCoords, transformCurrentLine, getEditorContent, renderMarkdownForExport, setEditorContent, jumpToMatchInEditor, focusEditor, setSyncScrollEnabled, setAutoSaveSeconds } from './editor.js';
import { rebuildIndex, getSearchState, search as searchNotes, searchWithDetails } from './search.js';
import { findBrokenWikiLinks, findNotesWithoutTags, findEmptyNotes } from './knowledge-audit.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  project: null,
  config: null,
  tree: [],
  collapsedGroups: new Set(),
  viewMode: 'split', // 'split' | 'editor' | 'preview'
  incomingProcessing: null, // { incomingId, mode } – Vorbereitung für den nächsten Verarbeitungsschritt
  incomingNoteDraft: null // { incomingId, title, content, source } – noch nicht gespeicherter Notiz-Entwurf
};

function applyPersistedProjectConfig(config) {
  if (state.project && config) state.project.config = config;
  return config;
}

fs.setProjectConfigPersistedHandler(applyPersistedProjectConfig);

const els = {
  updateStatusTop: document.getElementById('updateStatusTop'),
  updateDot: document.getElementById('updateDot'),
  updateStatusLabel: document.getElementById('updateStatusLabel'),
  updateStatusCurrent: document.getElementById('updateStatusCurrent'),
  navSearch: document.getElementById('navSearch'),
  searchDropdown: document.getElementById('searchDropdown'),
  searchClear: document.getElementById('searchClear'),
  navTree: document.getElementById('navTree'),
  homeLink: document.getElementById('homeLink'),
  incomingLink: document.getElementById('incomingLink'),
  knowledgeCareLink: document.getElementById('knowledgeCareLink'),
  btnAddNote: document.getElementById('btnAddNote'),
  segAddMain: document.getElementById('segAddMain'),
  segAddSub: document.getElementById('segAddSub'),
  sidebar: document.getElementById('sidebar'),
  overlay: document.getElementById('overlay'),
  burgerBtn: document.getElementById('burgerBtn'),
  breadcrumb: document.getElementById('breadcrumb'),
  btnTrash: document.getElementById('btnTrash'),
  trashCount: document.getElementById('trashCount'),
  btnSync: document.getElementById('btnSync'),
  btnBugReport: document.getElementById('btnBugReport'),
  btnAbout: document.getElementById('btnAbout'),
  topbarNoteDates: document.getElementById('topbarNoteDates'),
  contentScroll: document.getElementById('contentScroll'),
};

// Icon-Wert kann jetzt ZWEIERLEI sein: ein klassisches Emoji-Zeichen (wie
// bisher, z. B. "📄") ODER eine ID aus der neuen Icon-Bibliothek (Format
// "kategorie/name", z. B. "os/tux") — bestehende Emoji bleiben dadurch
// vollständig unverändert funktionsfähig, die Bibliothek ergänzt nur.
function renderIconHtml(iconValue, fallbackEmoji) {
  const resolvedIcon = iconValue || fallbackEmoji;
  const libraryPath = resolveIconLibraryPath(resolvedIcon);
  if (libraryPath) {
    return `<img class="lib-icon" src="${escapeHtml(libraryPath)}" alt="">`;
  }
  return escapeHtml(resolvedIcon);
}

function createDialogInlineIcon(iconId) {
  const img = document.createElement('img');
  img.className = 'lib-icon dialog-inline-icon';
  img.src = `assets/icon-library/${iconId}.svg`;
  img.alt = '';
  return img;
}


// ---------------------------------------------------------------------------
// Gemeinsamer Bedienstandard für alle selbst gerenderten HTML-Kontextmenüs.
// Die bestehenden Menütypen (.context-menu und .ectx-menu) bleiben erhalten;
// diese Hilfe ergänzt ausschließlich Fokus, Tastatur, ARIA und sauberes
// Schließen. Einzelne Menüs dürfen keine parallelen document-Listener mehr
// anlegen, weil sonst nach wiederholtem Öffnen veraltete Listener bleiben.
// ---------------------------------------------------------------------------
let activeHtmlContextMenu = null;

function isContextMenuKeyboardEvent(event) {
  const key = event.key || '';
  const code = event.code || '';
  return (
    key === 'ContextMenu' ||
    key === 'Menu' ||
    key === 'Apps' ||
    code === 'ContextMenu' ||
    (event.shiftKey && (key === 'F10' || code === 'F10'))
  );
}

function getContextMenuItems(menuContainer) {
  return [...menuContainer.querySelectorAll(':scope > [role="menuitem"]')]
    .filter(item => item.getAttribute('aria-disabled') !== 'true' && item.offsetParent !== null);
}

function focusContextMenuItem(item) {
  if (!item) return;
  const root = item.closest('.context-menu, .ectx-menu');
  root?.querySelectorAll('[role="menuitem"][tabindex="0"]').forEach(el => { el.tabIndex = -1; });
  item.tabIndex = 0;
  item.focus({ preventScroll: true });
}

function setEditorSubmenuExpanded(item, expanded) {
  const submenu = item?.querySelector(':scope > .ectx-submenu');
  if (!submenu) return false;
  submenu.style.display = expanded ? 'block' : 'none';
  submenu.setAttribute('aria-hidden', expanded ? 'false' : 'true');
  item.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  if (expanded) {
    submenu.style.left = '100%';
    submenu.style.right = 'auto';
    submenu.style.top = '-6px';
    submenu.style.bottom = 'auto';
    const itemRect = item.getBoundingClientRect();
    const submenuRect = submenu.getBoundingClientRect();
    if (itemRect.right + submenuRect.width > window.innerWidth) {
      submenu.style.left = 'auto';
      submenu.style.right = '100%';
    }
    if (itemRect.top + submenuRect.height > window.innerHeight) {
      submenu.style.top = 'auto';
      submenu.style.bottom = '-6px';
    }
  }
  return true;
}

function closeHtmlContextMenu(menu = activeHtmlContextMenu, { restoreFocus = true, reason = 'dismiss' } = {}) {
  if (!menu || menu.dataset.contextMenuClosed === 'true') return;
  menu.dataset.contextMenuClosed = 'true';
  menu.__contextMenuCleanup?.();
  const trigger = menu.__contextMenuTrigger;
  const onDismiss = menu.__contextMenuOnDismiss;
  if (activeHtmlContextMenu === menu) activeHtmlContextMenu = null;
  menu.remove();
  menu.__contextMenuTrigger = null;
  menu.__contextMenuOnDismiss = null;
  menu.__contextMenuCleanup = null;
  if (restoreFocus && trigger?.isConnected && typeof trigger.focus === 'function') {
    trigger.focus({ preventScroll: true });
  }
  if (reason !== 'action') onDismiss?.();
}

function manageHtmlContextMenu(menu, {
  trigger = document.activeElement,
  label = 'Kontextmenü',
  onDismiss = null
} = {}) {
  closeHtmlContextMenu(activeHtmlContextMenu, { restoreFocus: false });
  activeHtmlContextMenu = menu;
  menu.__contextMenuTrigger = trigger;
  menu.__contextMenuOnDismiss = onDismiss;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', label);
  normalizeContextMenuSeparators(menu);

  menu.querySelectorAll(':scope > button').forEach(button => {
    button.setAttribute('role', 'menuitem');
    button.tabIndex = -1;
  });
  menu.querySelectorAll('.ectx-sep').forEach(separator => separator.setAttribute('role', 'separator'));
  menu.querySelectorAll('.ectx-submenu').forEach(submenu => {
    submenu.setAttribute('role', 'menu');
    submenu.setAttribute('aria-hidden', 'true');
  });
  menu.querySelectorAll('.ectx-item').forEach(item => {
    item.setAttribute('role', 'menuitem');
    item.tabIndex = -1;
    if (item.classList.contains('disabled')) item.setAttribute('aria-disabled', 'true');
    if (item.classList.contains('has-submenu')) {
      item.setAttribute('aria-haspopup', 'menu');
      item.setAttribute('aria-expanded', 'false');
      const labelText = item.querySelector(':scope > .ectx-label')?.textContent?.trim();
      const submenu = item.querySelector(':scope > .ectx-submenu');
      if (labelText && submenu) submenu.setAttribute('aria-label', labelText);
    }
  });

  const onDocumentPointerDown = (event) => {
    if (!menu.contains(event.target)) closeHtmlContextMenu(menu);
  };
  const onKeyDown = (event) => {
    const focused = document.activeElement?.closest?.('[role="menuitem"]');
    const currentContainer = focused?.parentElement?.closest?.('[role="menu"]') || menu;
    const items = getContextMenuItems(currentContainer);
    const currentIndex = Math.max(0, items.indexOf(focused));

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeHtmlContextMenu(menu);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      closeHtmlContextMenu(menu);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!items.length) return;
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      focusContextMenuItem(items[(currentIndex + delta + items.length) % items.length]);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      if (!items.length) return;
      event.preventDefault();
      focusContextMenuItem(event.key === 'Home' ? items[0] : items[items.length - 1]);
      return;
    }
    if (event.key === 'ArrowRight' && focused?.classList.contains('has-submenu')) {
      event.preventDefault();
      setEditorSubmenuExpanded(focused, true);
      const submenu = focused.querySelector(':scope > .ectx-submenu');
      focusContextMenuItem(getContextMenuItems(submenu)[0]);
      return;
    }
    if (event.key === 'ArrowLeft') {
      const submenu = focused?.closest('.ectx-submenu');
      const parentItem = submenu?.parentElement?.closest('.ectx-item.has-submenu');
      if (submenu && parentItem) {
        event.preventDefault();
        setEditorSubmenuExpanded(parentItem, false);
        focusContextMenuItem(parentItem);
      }
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && focused) {
      event.preventDefault();
      if (focused.getAttribute('aria-disabled') === 'true') return;
      if (focused.classList.contains('has-submenu')) {
        setEditorSubmenuExpanded(focused, true);
        focusContextMenuItem(getContextMenuItems(focused.querySelector(':scope > .ectx-submenu'))[0]);
      } else {
        focused.click();
      }
    }
  };

  document.addEventListener('pointerdown', onDocumentPointerDown, true);
  menu.addEventListener('keydown', onKeyDown);
  menu.__contextMenuCleanup = () => {
    document.removeEventListener('pointerdown', onDocumentPointerDown, true);
    menu.removeEventListener('keydown', onKeyDown);
  };

  requestAnimationFrame(() => {
    if (!menu.isConnected) return;
    focusContextMenuItem(getContextMenuItems(menu)[0]);
  });
  return menu;
}


function isContextMenuSeparatorElement(element) {
  return element?.matches?.('hr, .ectx-sep, [role="separator"]') || false;
}

function normalizeContextMenuSeparators(container) {
  const children = [...container.children];
  let previousWasSeparator = true;
  for (const child of children) {
    if (!isContextMenuSeparatorElement(child)) {
      previousWasSeparator = false;
      continue;
    }
    if (previousWasSeparator) {
      child.remove();
      continue;
    }
    previousWasSeparator = true;
  }
  const last = container.lastElementChild;
  if (isContextMenuSeparatorElement(last)) last.remove();
}

function positionHtmlContextMenu(menu, { clientX, clientY, anchorEl = null, offsetY = 4 } = {}) {
  const anchorRect = anchorEl?.getBoundingClientRect?.();
  const requestedLeft = Number.isFinite(clientX) ? clientX : (anchorRect?.left ?? 4);
  const requestedTop = Number.isFinite(clientY) ? clientY : ((anchorRect?.bottom ?? 0) + offsetY);
  const rect = menu.getBoundingClientRect();
  const margin = 4;
  const left = Math.max(margin, Math.min(requestedLeft, window.innerWidth - rect.width - margin));
  const top = Math.max(margin, Math.min(requestedTop, window.innerHeight - rect.height - margin));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function createHtmlContextMenu({
  className = 'context-menu',
  html = '',
  trigger = document.activeElement,
  label = 'Kontextmenü',
  position = null,
  onDismiss = null
} = {}) {
  const menu = document.createElement('div');
  menu.className = className;
  menu.innerHTML = html;
  normalizeContextMenuSeparators(menu);
  document.body.appendChild(menu);
  manageHtmlContextMenu(menu, { trigger, label, onDismiss });
  positionHtmlContextMenu(menu, { ...(position || {}), anchorEl: trigger });
  return menu;
}

function renderSimpleContextMenuItems(items) {
  return items.map(item => {
    if (item.separator) return '<hr>';
    const className = item.danger ? ' class="danger"' : '';
    const data = item.data || {};
    const attributes = Object.entries(data)
      .map(([key, value]) => ` data-${key}="${escapeHtml(String(value))}"`)
      .join('');
    return `<button type="button"${className}${attributes}>${item.label}</button>`;
  }).join('');
}

function contextMenuPointForElement(element) {
  const rect = element.getBoundingClientRect();
  return {
    clientX: Math.max(4, Math.min(window.innerWidth - 8, rect.left)),
    clientY: Math.max(4, Math.min(window.innerHeight - 8, rect.bottom + 4))
  };
}

// ---------------------------------------------------------------------------
// Gemeinsames Eingabe-Modal auf Basis des zentralen Dialogsystems. Gibt den
// getrimmten Text zurück, oder null bei Abbruch/
// leerer Eingabe — kompatibel zu den bestehenden `if (!x) return;`-Checks.
// ---------------------------------------------------------------------------
// Zwei Felder statt nur eines (siehe showPromptModal unten) — Ziel bestimmt
// die verlinkte Notiz, Anzeigetext ist optional (Obsidian-artige [[Ziel|Text]]-
// Syntax). Falls beim Öffnen schon Text markiert war, wird der als Anzeigetext
// vorausgefüllt ("diesen Text zu einem Link machen").
function showWikiLinkModal(prefillDisplay = '') {
  return new Promise((resolve) => {
    closeManagedDialogs('.prompt-overlay', { restoreFocus: false });
    const overlay = document.createElement('div');
    overlay.className = 'prompt-overlay';
    overlay.innerHTML = `
      <div class="prompt-modal">
        <div class="prompt-title">Link zu einer Notiz einfügen</div>
        <label class="sync-field-label">Notizname (Ziel)</label>
        <div class="wikilink-target-wrap">
          <input type="text" class="prompt-input" id="wikiLinkTarget" autocomplete="off">
          <div class="wikilink-suggestions" id="wikiLinkSuggestions" style="display:none;"></div>
        </div>
        <label class="sync-field-label">Eigener Anzeigetext (optional)</label>
        <input type="text" class="prompt-input" id="wikiLinkDisplay" autocomplete="off">
        <div class="prompt-actions">
          <button type="button" class="btn" data-action="cancel">Abbrechen</button>
          <button type="button" class="btn primary" data-action="ok">Einfügen</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const targetInput = document.getElementById('wikiLinkTarget');
    const displayInput = document.getElementById('wikiLinkDisplay');
    const suggestionsEl = document.getElementById('wikiLinkSuggestions');
    displayInput.value = prefillDisplay || '';

    const MIN_CHARS = 2;
    const MAX_VISIBLE = 8;
    // "Zuletzt verlinkt" — gleiches Muster wie iconFavorites/iconRecent,
    // dient nur als Gleichstand-Kriterium beim Ranking (siehe rankNotes unten).
    let recentTargets = Array.isArray(state.project?.config?.recentWikilinkTargets) ? state.project.config.recentWikilinkTargets : [];
    let allDocs = [];
    fs.getSearchDocuments().then(docs => { allDocs = docs.map(d => ({ relPath: d.relPath, title: d.title, category: d.category || '' })); }).catch(() => {});

    let activeIndex = -1;
    let currentMatches = [];
    let debounceTimer = null;

    // Rangfolge: exakter Präfix vor Präfix vor Enthält; bei Gleichstand
    // innerhalb einer Stufe gewinnt die zuletzt verlinkte Notiz.
    function rankNotes(query) {
      const q = query.toLowerCase();
      const scored = allDocs
        .filter(d => d.title.toLowerCase().includes(q))
        .map(d => {
          const t = d.title.toLowerCase();
          const tier = t === q ? 0 : t.startsWith(q) ? 1 : 2;
          const recencyIdx = recentTargets.indexOf(d.relPath);
          return { doc: d, tier, recency: recencyIdx === -1 ? Infinity : recencyIdx };
        });
      scored.sort((a, b) => a.tier - b.tier || a.recency - b.recency);
      return scored.map(s => s.doc);
    }

    // Titel, die mehrfach vorkommen, bekommen zusätzlich die Kategorie
    // angezeigt, damit man sie auseinanderhalten kann.
    function titleCounts(docs) {
      const counts = new Map();
      for (const d of docs) counts.set(d.title, (counts.get(d.title) || 0) + 1);
      return counts;
    }

    function renderSuggestions() {
      const query = targetInput.value.trim();
      activeIndex = -1;
      if (query.length < MIN_CHARS) { suggestionsEl.style.display = 'none'; currentMatches = []; return; }
      const ranked = rankNotes(query);
      currentMatches = ranked.slice(0, MAX_VISIBLE);
      if (currentMatches.length === 0) {
        suggestionsEl.innerHTML = `<div class="wikilink-suggestion-empty">Keine Treffer für „${escapeHtml(query)}"</div>`;
        suggestionsEl.style.display = 'block';
        return;
      }
      const dupCounts = titleCounts(currentMatches);
      suggestionsEl.innerHTML = currentMatches.map((d, i) => `
        <button type="button" class="wikilink-suggestion" data-index="${i}">
          ${escapeHtml(d.title)}${dupCounts.get(d.title) > 1 && d.category ? `<span class="wikilink-suggestion-category">${escapeHtml(d.category)}</span>` : ''}
        </button>`).join('')
        + (ranked.length > MAX_VISIBLE ? `<div class="wikilink-suggestion-more">${ranked.length - MAX_VISIBLE} weitere — genauer eingrenzen</div>` : '');
      suggestionsEl.style.display = 'block';
    }

    function updateActiveHighlight() {
      suggestionsEl.querySelectorAll('.wikilink-suggestion').forEach((btn, i) => btn.classList.toggle('active', i === activeIndex));
    }

    function selectMatch(doc) {
      targetInput.value = doc.title;
      if (!displayInput.value.trim()) displayInput.value = doc.title; // nur vorbefüllen, wenn noch leer
      suggestionsEl.style.display = 'none';
      currentMatches = [];
      recentTargets = [doc.relPath, ...recentTargets.filter(r => r !== doc.relPath)].slice(0, 20);
      fs.setProjectSetting('recentWikilinkTargets', recentTargets).catch(() => {});
    }

    targetInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(renderSuggestions, 120);
    });
    suggestionsEl.addEventListener('mousedown', (e) => {
      const btn = e.target.closest('.wikilink-suggestion');
      if (!btn) return;
      e.preventDefault(); // verhindert, dass das Eingabefeld den Fokus verliert, bevor der Klick zählt
      selectMatch(currentMatches[Number(btn.dataset.index)]);
    });
    // Klick außerhalb von Eingabefeld+Dropdown schließt nur das Dropdown,
    // nicht das gesamte Modal (z. B. Klick ins Anzeigetext-Feld).
    overlay.addEventListener('mousedown', (e) => {
      if (!e.target.closest('.wikilink-target-wrap')) { suggestionsEl.style.display = 'none'; }
    });

    let done = false;
    function close(result) {
      if (done) return;
      done = true;
      dialogController.destroy();
      resolve(result);
    }
    function submit() {
      const target = targetInput.value.trim();
      if (!target) { targetInput.focus(); return; }
      close({ target, display: displayInput.value.trim() });
    }
    // Tastatur-Navigation NUR im Zielfeld selbst — Anzeigetext-Feld verhält
    // sich weiterhin normal (Enter dort löst trotzdem "Einfügen" aus, siehe
    // der allgemeine onKeydown weiter unten).
    targetInput.addEventListener('keydown', (e) => {
      const dropdownOpen = suggestionsEl.style.display === 'block' && currentMatches.length > 0;
      if (!dropdownOpen) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, currentMatches.length - 1);
        updateActiveHighlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        updateActiveHighlight();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        selectMatch(currentMatches[activeIndex >= 0 ? activeIndex : 0]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation(); // verhindert, dass das äußere Escape gleich das ganze Modal schließt
        suggestionsEl.style.display = 'none';
      }
    });
    const okButton = overlay.querySelector('[data-action="ok"]');
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.defaultPrevented) {
        e.preventDefault();
        submit();
      }
    });
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => close(null));
    okButton.addEventListener('click', submit);
    const dialogController = manageModalDialog({
      overlay,
      dialog: overlay.querySelector('.prompt-modal'),
      initialFocus: targetInput,
      primaryAction: okButton,
      onRequestClose: () => close(null),
      closeOnBackdrop: false,
      canCloseOnEscape: () => suggestionsEl.style.display !== 'block'
    });
  });
}

function showPromptModal({ title, defaultValue = '', okLabel = 'OK' }) {
  return new Promise((resolve) => {
    closeManagedDialogs('.prompt-overlay', { restoreFocus: false });
    const overlay = document.createElement('div');
    overlay.className = 'prompt-overlay';
    overlay.innerHTML = `
      <div class="prompt-modal">
        <div class="prompt-title">${escapeHtml(title)}</div>
        <input type="text" class="prompt-input" autocomplete="off">
        <div class="prompt-actions">
          <button type="button" class="btn" data-action="cancel">Abbrechen</button>
          <button type="button" class="btn primary" data-action="ok">${escapeHtml(okLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('.prompt-input');
    input.value = defaultValue;

    let done = false;
    function close(value) {
      if (done) return;
      done = true;
      dialogController.destroy();
      resolve(value && value.trim() ? value.trim() : null);
    }
    const okButton = overlay.querySelector('[data-action="ok"]');
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => close(null));
    okButton.addEventListener('click', () => close(input.value));
    const dialogController = manageModalDialog({
      overlay,
      dialog: overlay.querySelector('.prompt-modal'),
      initialFocus: input,
      primaryAction: okButton,
      enterActivatesPrimary: true,
      onRequestClose: () => close(null),
      closeOnBackdrop: false
    });
  });
}

function normalizeRouteHash(hash) {
  const normalized = String(hash || '#home');
  if (!normalized || normalized === '#') return '#home';
  return normalized.startsWith('#') ? normalized : `#${normalized}`;
}

function slugFromHash(hash) {
  return decodeURIComponent(normalizeRouteHash(hash).slice(1)) || 'home';
}

function currentSlug() {
  return slugFromHash(location.hash);
}

// ---------------------------------------------------------------------------
// Sidebar: Mobile Toggle
// ---------------------------------------------------------------------------
function openSidebar() { els.sidebar.classList.add('open'); els.overlay.classList.add('show'); }
function closeSidebar() { els.sidebar.classList.remove('open'); els.overlay.classList.remove('show'); }

// Sidebar ein-/ausklappen (Nutzer-Feature, Desktop, breites Fenster): eigene,
// vom Mobile-Overlay oben komplett unabhängige Funktion — gibt den Platz
// wirklich frei, statt nur über den Inhalt zu schieben. Zustand pro Projekt
// gespeichert, exakt dasselbe Muster wie bei den Dashboard-Einstellungen.
async function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  els.burgerBtn.title = collapsed ? 'Sidebar einblenden' : 'Sidebar ausblenden';
  await fs.setProjectSetting('sidebarCollapsed', collapsed);
}
els.burgerBtn.addEventListener('click', () => {
  // Unterhalb von 901px gilt weiterhin ausschließlich die bestehende,
  // unveränderte Mobile-Logik (Overlay über den Inhalt) — die beiden
  // Mechanismen dürfen sich nicht überschneiden.
  if (window.innerWidth <= 900) {
    els.sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  } else {
    setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
  }
});
els.overlay.addEventListener('click', closeSidebar);

// Sidebar-Breite frei einstellbar (Nutzer-Feature): Standardbreite (292px,
// siehe --sidebar-w in styles.css) bleibt bewusst unverändert der Standard —
// hier kommt nur die Möglichkeit dazu, sie per Ziehen anzupassen und diese
// Wahl dauerhaft zu merken. Bewusst UNABHÄNGIG von der Ein-/Ausklapp-Logik
// oben: Ein-/Ausklappen rührt --sidebar-w selbst nie an (nur transform/
// margin), wodurch nach dem Wiederausklappen automatisch die zuletzt
// gewählte Breite erhalten bleibt, ganz ohne zusätzlichen Code dafür.
const DEFAULT_SIDEBAR_WIDTH = 292;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 480;

async function setSidebarWidth(px) {
  const clamped = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, px));
  document.documentElement.style.setProperty('--sidebar-w', clamped + 'px');
  await fs.setProjectSetting('sidebarWidth', clamped);
}

(function initSidebarResize() {
  const handle = document.getElementById('sidebarResizeHandle');
  handle.tabIndex = 0;
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', 'Sidebar-Breite ändern');
  let startX = 0, startWidth = 0, dragging = false;

  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.clientX;
    startWidth = els.sidebar.getBoundingClientRect().width;
    document.body.classList.add('sidebar-resizing');
    handle.classList.add('resizing');
    e.preventDefault(); // verhindert Text-Markierung während des Ziehens
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const next = startWidth + (e.clientX - startX);
    const clamped = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, next));
    document.documentElement.style.setProperty('--sidebar-w', clamped + 'px');
  });

  document.addEventListener('mouseup', async () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('sidebar-resizing');
    handle.classList.remove('resizing');
    const finalWidth = Math.round(els.sidebar.getBoundingClientRect().width);
    await setSidebarWidth(finalWidth);
  });

  // Doppelklick auf den Ziehbereich: schnell zurück zur Standardbreite,
  // ein gängiges, erwartbares Muster für Ziehgriffe dieser Art.
  handle.addEventListener('dblclick', () => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH));

  // Rechtsklick (Nutzer-Feature): dieselbe Standardbreite-Wiederherstellung
  // auch besser auffindbar über ein Kontextmenü, nicht nur per (weniger
  // offensichtlichem) Doppelklick auf den schmalen Ziehbereich.
  function openSidebarWidthContextMenu(clientX, clientY) {
    const menu = createHtmlContextMenu({
      trigger: handle,
      label: 'Sidebar-Breite',
      position: { clientX, clientY: clientY + 4 },
      html: renderSimpleContextMenuItems([
        { label: '↺ Standardbreite wiederherstellen', data: { action: 'reset-width' } }
      ])
    });
    menu.addEventListener('click', (ev) => {
      if (!ev.target.closest('[data-action="reset-width"]')) return;
      closeHtmlContextMenu(menu, { reason: 'action' });
      setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
    });
  }
  handle.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openSidebarWidthContextMenu(e.clientX, e.clientY);
  });
  handle.addEventListener('keydown', (e) => {
    if (!isContextMenuKeyboardEvent(e)) return;
    e.preventDefault();
    const point = contextMenuPointForElement(handle);
    openSidebarWidthContextMenu(point.clientX, point.clientY);
  });
})();

// ---------------------------------------------------------------------------
// Ziehen-Griffe (⠿) für Notizen/Kategorien: erscheinen jetzt automatisch
// beim Überfahren einer Zeile mit der Maus (siehe .row-handle-CSS) — der
// frühere, extra Bearbeiten-Modus-Knopf ist dadurch überflüssig geworden
// und wurde entfernt. Löschen läuft weiterhin immer über das eigene
// Kontextmenü per Rechtsklick oder Tastatur, unabhängig davon.
// ---------------------------------------------------------------------------

// Akzentfarben nachträglich ändern (bisher nur einmalig im Wizard möglich).
// Wendet die Wahl sofort live an (wie im Wizard) und speichert sie dauerhaft
// in der Projekt-Config.
// Übersetzt gängige technische Fehlercodes (Node.js-Dateisystem) in
// verständliche Sätze — die rohe, technische Meldung bleibt trotzdem über
// "Details" erreichbar, für alle Fälle, die diese Liste nicht abdeckt.
function friendlyBackupErrorText(code, message) {
  const map = {
    ENOENT: 'Der Zielordner existiert nicht (Pfad nicht gefunden).',
    EACCES: 'Schreibrechte für den Zielordner fehlen.',
    EPERM: 'Schreibrechte für den Zielordner fehlen.',
    ENOSPC: 'Kein Speicherplatz mehr auf dem Ziellaufwerk verfügbar.',
    EBUSY: 'Eine Datei wird gerade von einem anderen Programm verwendet.',
    ENOTDIR: 'Der angegebene Backup-Pfad ist kein Ordner.',
    EROFS: 'Das Ziellaufwerk ist schreibgeschützt (nur lesbar).'
  };
  return map[code] || (message ? `Der Fehler konnte nicht genauer bestimmt werden: ${message}` : 'Der Fehler konnte nicht genauer bestimmt werden.');
}

// Erscheint beim X-Klick, sofern noch keine feste Wahl gespeichert ist (siehe
// main.js handleCloseRequest). Ergebnis geht über resolveCloseDialog zurück
// an den Hauptprozess, der dann entsprechend minimiert/beendet/nichts tut.
function showCloseDialog() {
  closeManagedDialogs('.prompt-overlay', { restoreFocus: false });
  const overlay = document.createElement('div');
  overlay.className = 'prompt-overlay';
  overlay.innerHTML = `
    <div class="prompt-modal">
      <div class="prompt-title">Archiv-Wiki schließen?</div>
      <p class="sync-modal-note">Was soll beim Klick auf das X passieren?</p>
      <div class="close-dialog-options">
        <label class="close-dialog-option"><input type="radio" name="closeChoice" value="ask" checked> Immer nachfragen</label>
        <label class="close-dialog-option"><input type="radio" name="closeChoice" value="tray"> In den System-Tray minimieren (läuft im Hintergrund weiter)</label>
        <label class="close-dialog-option"><input type="radio" name="closeChoice" value="quit"> Anwendung vollständig beenden</label>
      </div>
      <label class="close-dialog-remember"><input type="checkbox" id="closeDialogRemember"> Diese Auswahl merken</label>
      <div class="prompt-actions">
        <button type="button" class="btn" data-action="cancel">Abbrechen</button>
        <button type="button" class="btn primary" data-action="ok">OK</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  function close(result = { choice: 'cancel', remember: false }) {
    dialogController.destroy();
    window.archivAPI.resolveCloseDialog(result);
  }
  overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => close());
  overlay.querySelector('[data-action="ok"]').addEventListener('click', () => {
    const choice = overlay.querySelector('input[name="closeChoice"]:checked').value;
    const remember = overlay.querySelector('#closeDialogRemember').checked;
    close({ choice, remember });
  });
  const dialogController = manageModalDialog({
    overlay,
    dialog: overlay.querySelector('.prompt-modal'),
    initialFocus: overlay.querySelector('input[name="closeChoice"]:checked'),
    onRequestClose: () => close(),
    closeOnBackdrop: false,
    enterActivatesPrimary: false
  });
}

function showBackupErrorModal(status) {
  closeManagedDialogs('.backup-error-overlay', { restoreFocus: false });
  const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overlay = document.createElement('div');
  overlay.className = 'prompt-overlay backup-error-overlay';
  const lastError = status.lastErrorAt ? formatRelativeTime(status.lastErrorAt) : 'Zeitpunkt nicht verfügbar';
  overlay.innerHTML = `
    <div class="prompt-modal" role="dialog" aria-modal="true" aria-labelledby="backupErrorDialogTitle" aria-describedby="backupErrorDialogDescription">
      <div class="prompt-title" id="backupErrorDialogTitle"><img class="lib-icon backup-dialog-icon" src="assets/icon-library/security/alert-triangle.svg" alt=""> Backup fehlgeschlagen<button type="button" class="modal-close-x" data-action="close-x" title="Schließen" aria-label="Backup-Fehler schließen">✕</button></div>
      <p class="sync-modal-note" id="backupErrorDialogDescription">${status.consecutiveFailures}x in Folge fehlgeschlagen · zuletzt ${escapeHtml(lastError)}</p>
      <p class="sync-modal-note">${escapeHtml(status.lastErrorUserMessage || friendlyBackupErrorText(status.lastErrorCode, status.lastErrorMessage))}</p>
      <button type="button" class="backup-error-details-toggle" id="backupErrorDetailsToggle" aria-expanded="false" aria-controls="backupErrorDetails">Details anzeigen</button>
      <pre class="backup-error-details" id="backupErrorDetails" style="display:none;">${escapeHtml([status.lastErrorCode, status.lastErrorMessage].filter(Boolean).join('\n') || 'Information nicht verfügbar.')}</pre>
    </div>`;

  document.body.appendChild(overlay);

  const modal = overlay.querySelector('.prompt-modal');
  const closeButton = overlay.querySelector('[data-action="close-x"]');
  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    dialogController.destroy();
  }

  closeButton.addEventListener('click', close);
  overlay.querySelector('#backupErrorDetailsToggle').addEventListener('click', (event) => {
    const details = overlay.querySelector('#backupErrorDetails');
    const nowShown = details.style.display === 'none';
    details.style.display = nowShown ? 'block' : 'none';
    event.currentTarget.textContent = nowShown ? 'Details verbergen' : 'Details anzeigen';
    event.currentTarget.setAttribute('aria-expanded', String(nowShown));
  });
  const dialogController = manageModalDialog({
    overlay,
    dialog: modal,
    titleElement: overlay.querySelector('#backupErrorDialogTitle'),
    descriptionElement: overlay.querySelector('#backupErrorDialogDescription'),
    initialFocus: closeButton,
    onRequestClose: close,
    closeOnBackdrop: false
  });
}

// ---------------------------------------------------------------------------
// Topbar: Papierkorb + Info direkt als Icon-Buttons (kein Dropdown mehr)
// ---------------------------------------------------------------------------
els.btnTrash.addEventListener('click', () => { void navigateTo('#trash'); });
els.btnBugReport.addEventListener('click', async () => {
  await showBugReportModal();
});

// Diagnose-Infos (Version/Plattform/Electron) waren schon länger über
// window.archivAPI verfügbar, wurden bisher aber nirgends genutzt — genau
// das Richtige für einen hilfreichen, vorausgefüllten Bug-Report.
async function showBugReportModal() {
  closeManagedDialogs('.prompt-overlay', { restoreFocus: false });
  const [version, platformInfo] = await Promise.all([
    window.archivAPI.getVersion(),
    window.archivAPI.getPlatformInfo()
  ]);
  const platformLabel = { linux: 'Linux', win32: 'Windows', darwin: 'macOS' }[platformInfo.platform] || platformInfo.platform;

  const overlay = document.createElement('div');
  overlay.className = 'prompt-overlay';
  overlay.innerHTML = `
    <div class="prompt-modal">
      <div class="prompt-title"><img class="lib-icon dialog-title-icon" src="assets/icon-library/dev/bug.svg" alt="">Fehler melden<button type="button" class="modal-close-x" data-action="close-x" title="Schließen" aria-label="Schließen">✕</button></div>
      <div class="bugreport-info">
        <div><span class="bugreport-label">App-Version</span> ${escapeHtml(version)}</div>
        <div><span class="bugreport-label">Plattform</span> ${escapeHtml(platformLabel)} (${escapeHtml(platformInfo.arch)})</div>
        <div><span class="bugreport-label">Electron</span> ${escapeHtml(platformInfo.electron)}</div>
      </div>
      <p class="sync-modal-note">Diese Angaben werden automatisch in den Bug-Report übernommen — hilft beim Nachvollziehen, du musst sie nicht selbst eintippen. Der Bug-Text selbst wird auf GitHub verfasst.</p>
      <div class="prompt-actions">
        <button type="button" class="btn" data-action="cancel">Abbrechen</button>
        <button type="button" class="btn primary" data-action="open-github">Zu GitHub Issues →</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  function close() { dialogController.destroy(); }
  const closeButton = overlay.querySelector('[data-action="close-x"]');
  const openButton = overlay.querySelector('[data-action="open-github"]');
  closeButton.addEventListener('click', close);
  overlay.querySelector('[data-action="cancel"]').addEventListener('click', close);
  openButton.addEventListener('click', () => {
    const body = [
      `**App-Version:** ${version}`,
      `**Plattform:** ${platformLabel} (${platformInfo.arch})`,
      `**Electron:** ${platformInfo.electron}`,
      '',
      '**Was ist passiert?**',
      '',
      '**Was hast du erwartet?**',
      '',
      '**Schritte zum Nachstellen:**',
      '1. '
    ].join('\n');
    const url = 'https://github.com/Smashinger/Archiv-Wiki/issues/new'
      + '?title=' + encodeURIComponent('')
      + '&body=' + encodeURIComponent(body);
    // window.open() wird vom bestehenden setWindowOpenHandler in main.js
    // abgefangen und im System-Browser geöffnet (kein neuer IPC-Kanal nötig).
    window.open(url, '_blank');
    close();
  });
  const dialogController = manageModalDialog({
    overlay,
    dialog: overlay.querySelector('.prompt-modal'),
    initialFocus: closeButton,
    primaryAction: openButton,
    enterActivatesPrimary: false,
    onRequestClose: close,
    closeOnBackdrop: false
  });
}
els.btnAbout.addEventListener('click', async () => {
  const version = await window.archivAPI.getVersion();
  await showMessageDialog({
    title: 'Über Archiv-Wiki',
    message: `Archiv-Wiki v${version}\nAutor: Smashinger\nLizenz: MIT\n\nTipp: Taste "?" zeigt alle Tastenkürzel.`
  });
});

function applyIncomingSidebarVisibility(config = state.project?.config) {
  const visible = config?.incoming?.showInSidebar !== false;
  const row = els.incomingLink?.closest('li');
  if (row) row.hidden = !visible;
}

function openSettingsWindow() {
  showSettingsWindow({
    projectPath: state.project?.path,
    onConfigChange: (newConfig) => {
      if (state.project) state.project.config = newConfig;
      setAutoSaveSeconds(newConfig?.editor?.autoSave ?? 30);
      applyIncomingSidebarVisibility(newConfig);
    },
    onProjectPathChange: (newPath) => { if (state.project) state.project.path = newPath; },
    onShowShortcuts: showShortcutsCheatsheet
  });
}
document.getElementById('btnSettings').addEventListener('click', openSettingsWindow);

// --- Tray-/Menü-Ereignisse aus dem Hauptprozess ---
window.archivAPI.onShowCloseDialog(() => showCloseDialog());
window.archivAPI.onGoHome(() => { void navigateTo('#home'); });
window.archivAPI.onCheckForUpdatesRequested(() => requestUpdateCheck());
window.archivAPI.onOpenSettingsRequested(() => openSettingsWindow());
window.archivAPI.onShowShortcutsRequested?.(() => showShortcutsCheatsheet());

// "Projektordner öffnen …" (Datei-Menü / Strg+O) — Wiki-Wechsel zu einem
// bereits bestehenden Archiv-Wiki-Projekt. Nutzt denselben Ordnerdialog und
// dieselbe Projektöffnungs-Logik wie der Erststart-Wizard
// (dialog:selectDirectory + wizard:openExisting), statt einen zweiten,
// konkurrierenden Projektöffnungsweg zu bauen.
let openProjectRequestPending = false;
async function handleMenuOpenProjectRequest() {
  if (openProjectRequestPending) return;
  openProjectRequestPending = true;
  try {
    // Dieselbe zentrale Dirty-/Save-Barriere wie jede reguläre Navigation
    // weg von der aktuell offenen Notiz — ein Wiki-Wechsel verlässt die
    // aktuelle Route endgültig, ungespeicherte Änderungen dürfen dabei nicht
    // stillschweigend verloren gehen.
    if (!await canLeaveCurrentRoute()) return;

    const folder = await window.archivAPI.selectDirectory();
    if (!folder) return; // Dialog abgebrochen — aktuelles Projekt bleibt unverändert

    // Bei Erfolg lädt der Hauptprozess dieses Fenster selbst neu
    // (main.js, handleProjectReady) — ab hier läuft kein weiterer
    // Renderer-Code mehr in diesem Dokumentkontext.
    await window.archivAPI.openExistingProject(folder);
  } catch (err) {
    await showMessageDialog({
      title: 'Projektordner konnte nicht geöffnet werden',
      message: err?.message || 'Der gewählte Ordner enthält kein bestehendes Archiv-Wiki-Projekt.'
    });
  } finally {
    openProjectRequestPending = false;
  }
}
window.archivAPI.onMenuOpenProject(() => { void handleMenuOpenProjectRequest(); });

// Automatisches Update-System (Nutzer-Feature): dezente Ecken-Benachrichtigung
// statt eines blockierenden Dialogs — passend zum Wunsch "keine aufdringlichen
// Popups". Genau EIN Toast zur Zeit (verfügbar → lädt herunter → bereit sind
// aufeinanderfolgende Zustände derselben Sache, keine drei gleichzeitigen
// Meldungen), daher wird ein evtl. vorhandener Toast bei jedem neuen Aufruf
// zuerst entfernt.
function showUpdateToast({
  message,
  primaryLabel,
  onPrimary,
  showProgress = false,
  progress = 0,
  dismissLabel = 'Später',
  dismissible = true,
  removeOnPrimary = true,
  primaryBusyLabel = null,
  ariaMode = null,
  details = null,
  onDismiss = null
}) {
  document.querySelectorAll('.update-toast').forEach(el => el.remove());
  const safePercent = Math.max(0, Math.min(100, Number(progress) || 0));
  const toast = document.createElement('div');
  toast.className = 'update-toast';
  if (ariaMode) {
    toast.setAttribute('role', 'region');
    toast.setAttribute('aria-label', ariaMode === 'error' ? 'Update-Fehler' : 'Update-Status');
  }
  toast.innerHTML = `
    <div class="update-toast-message"${ariaMode ? ` role="${ariaMode === 'error' ? 'alert' : 'status'}" aria-live="${ariaMode === 'error' ? 'assertive' : 'polite'}" aria-atomic="true"` : ''}>${escapeHtml(message)}</div>
    ${showProgress ? `
      <div class="update-toast-progress-row">
        <div class="update-toast-progress" role="progressbar" aria-label="Downloadfortschritt" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${safePercent}">
          <div class="update-toast-progress-bar" id="updateToastProgressBar" style="width:${safePercent}%"></div>
        </div>
        <span class="update-toast-progress-value" id="updateToastProgressValue" aria-hidden="true">${safePercent} %</span>
      </div>` : ''}
    ${details ? `<details class="update-toast-details"><summary>Technische Details</summary><div>${escapeHtml(details)}</div></details>` : ''}
    ${(dismissible || primaryLabel) ? `<div class="update-toast-actions">
      ${dismissible ? `<button type="button" class="btn ghost small" data-action="dismiss">${escapeHtml(dismissLabel)}</button>` : ''}
      ${primaryLabel ? `<button type="button" class="btn small" data-action="primary">${escapeHtml(primaryLabel)}</button>` : ''}
    </div>` : ''}
  `;
  document.body.appendChild(toast);
  toast.querySelector('[data-action="dismiss"]')?.addEventListener('click', () => {
    onDismiss?.();
    toast.remove();
  });
  const primaryButton = toast.querySelector('[data-action="primary"]');
  if (primaryButton) {
    primaryButton.addEventListener('click', async () => {
      primaryButton.disabled = true;
      const originalLabel = primaryButton.textContent;
      if (primaryBusyLabel) primaryButton.textContent = primaryBusyLabel;
      try {
        const result = await onPrimary?.();
        if (removeOnPrimary) toast.remove();
        else if (result?.started === false && toast.isConnected) {
          primaryButton.disabled = false;
          primaryButton.textContent = originalLabel;
        }
      } catch (error) {
        console.error('[Archiv Wiki] Update-Aktion fehlgeschlagen:', error);
        if (toast.isConnected) {
          primaryButton.disabled = false;
          primaryButton.textContent = originalLabel;
        }
      }
    });
  }
  return toast;
}

// Kurze, dezente Rückmeldung ohne Buttons (Nutzer-Feature: z. B. "Dashboard
// gesperrt") — verschwindet nach 1.8s von selbst, kein Zutun nötig.
// Bild-Lightbox (Nutzer-Feature): eigenes Overlay statt Browserfunktion
// (kein neuer Tab, kein natives Vollbild). ESC und Klick auf den
// abgedunkelten Hintergrund schließen beide die Ansicht — ein Klick auf
// das Bild selbst nicht (e.target === overlay prüft genau das).
function showImageLightbox(src, alt) {
  closeManagedDialogs('.image-lightbox-overlay', { restoreFocus: false });
  const overlay = document.createElement('div');
  overlay.className = 'image-lightbox-overlay';
  const img = document.createElement('img');
  img.src = src;
  if (alt) img.alt = alt;
  overlay.appendChild(img);
  document.body.appendChild(overlay);
  function close() { dialogController.destroy(); }
  const dialogController = manageModalDialog({
    overlay,
    dialog: overlay,
    titleElement: null,
    descriptionElement: null,
    initialFocus: overlay,
    onRequestClose: close,
    closeOnBackdrop: true
  });
}

function showQuickFeedback(message) {
  document.querySelectorAll('.quick-feedback-toast').forEach(el => el.remove());
  const toast = document.createElement('div');
  toast.className = 'quick-feedback-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1800);
}

// Rückgängig für Verschiebungen (Nutzer-Feature): zeigt nach jedem ECHTEN
// Ortswechsel (Kategorie hat sich geändert, nicht nur die Position
// innerhalb derselben Kategorie) eine klare Textmeldung mit Rückgängig-
// Knopf — verhindert, dass eine unbeabsichtigte Verschiebung unbemerkt
// bleibt (Nutzeranliegen: "aus Versehen verschoben, weiß nicht wohin").
// Wiederverwendet die bestehende showUpdateToast() statt eine eigene
// Toast-Variante extra dafür zu bauen.
function showMoveUndoToast(originalRelPath, moved) {
  const originalParent = originalRelPath.includes('/') ? originalRelPath.split('/').slice(0, -1).join('/') : '';
  const targetParent = moved.relPath.includes('/') ? moved.relPath.split('/').slice(0, -1).join('/') : '';
  const itemName = moved.relPath.split('/').pop().replace(/\.md$/, '');
  const targetName = targetParent.split('/').pop() || 'oberste Ebene';
  showUpdateToast({
    message: `„${itemName}" nach „${targetName}" verschoben.`,
    primaryLabel: 'Rückgängig',
    dismissLabel: 'Schließen',
    onPrimary: async () => {
      await mutateEntryPath({
        sourceRelPath: moved.relPath,
        actionLabel: 'Verschieben',
        mutate: () => fs.moveEntry(moved.relPath, originalParent)
      });
    }
  });
}

// Alle sichtbaren Update-Zustände stammen aus dem zentralen Main-Status.
let lastRenderedUpdateToastKey = null;
let dismissedUpdateToastKey = null;

async function installDownloadedUpdate() {
  return window.archivAPI.installUpdateAndRestart();
}

async function renderUpdateToastFromStatus(status) {
  const phase = status?.phase || 'idle';
  const toastKey = `${phase}:${status?.availableVersion || ''}:${status?.errorType || ''}:${status?.errorMessage || ''}`;
  if (dismissedUpdateToastKey === toastKey && phase !== 'installing') return;

  if (phase === 'upToDate') {
    document.querySelectorAll('.update-toast[data-update-phase]').forEach(el => el.remove());
    lastRenderedUpdateToastKey = null;
    dismissedUpdateToastKey = null;
    return;
  }
  if (phase === 'idle' || phase === 'checking') return;

  if (phase === 'downloading') {
    const percent = Math.max(0, Math.min(100, Number(status.downloadPercent) || 0));
    let toast = document.querySelector('.update-toast[data-update-phase="downloading"]');
    if (!toast) {
      toast = showUpdateToast({
        message: 'Update wird heruntergeladen …',
        showProgress: true,
        progress: percent,
        ariaMode: 'status',
        onDismiss: () => { dismissedUpdateToastKey = toastKey; }
      });
      toast.dataset.updatePhase = 'downloading';
    }
    const bar = toast.querySelector('#updateToastProgressBar');
    const progressEl = toast.querySelector('.update-toast-progress');
    const valueEl = toast.querySelector('#updateToastProgressValue');
    if (bar) bar.style.width = `${percent}%`;
    if (progressEl) progressEl.setAttribute('aria-valuenow', String(percent));
    if (valueEl) valueEl.textContent = `${percent} %`;
    lastRenderedUpdateToastKey = toastKey;
    return;
  }

  if (lastRenderedUpdateToastKey === toastKey && document.querySelector(`.update-toast[data-update-phase="${phase}"]`)) return;

  let toast = null;
  if (phase === 'updateAvailable') {
    const settings = await window.archivAPI.getUpdateSettings();
    const needsConfirmation = !settings.autoDownload || settings.confirmBeforeDownload;
    toast = showUpdateToast({
      message: needsConfirmation
        ? `Eine neue Version von Archiv-Wiki ist verfügbar (${status.availableVersion || '?'}).`
        : `Eine neue Version von Archiv-Wiki ist verfügbar (${status.availableVersion || '?'}). Sie wird im Hintergrund heruntergeladen.`,
      primaryLabel: needsConfirmation ? 'Jetzt herunterladen' : null,
      onPrimary: needsConfirmation ? () => window.archivAPI.downloadUpdate() : null,
      primaryBusyLabel: 'Download startet …',
      ariaMode: 'status',
      onDismiss: () => { dismissedUpdateToastKey = toastKey; }
    });
  } else if (phase === 'downloaded') {
    toast = showUpdateToast({
      message: 'Das Update wurde heruntergeladen und ist bereit zur Installation.',
      primaryLabel: 'Jetzt neu starten',
      onPrimary: installDownloadedUpdate,
      primaryBusyLabel: 'Update wird installiert …',
      removeOnPrimary: false,
      ariaMode: 'status',
      onDismiss: () => { dismissedUpdateToastKey = toastKey; }
    });
  } else if (phase === 'installing') {
    toast = showUpdateToast({
      message: 'Update wird installiert …',
      dismissible: false,
      ariaMode: 'status'
    });
  } else if (phase === 'error') {
    toast = showUpdateToast({
      message: status.errorMessage || 'Der Update-Vorgang ist fehlgeschlagen.',
      details: status.errorDetails || null,
      primaryLabel: status.installReady ? 'Erneut installieren' : null,
      onPrimary: status.installReady ? installDownloadedUpdate : null,
      primaryBusyLabel: 'Update wird installiert …',
      removeOnPrimary: false,
      dismissLabel: 'Schließen',
      ariaMode: 'error',
      onDismiss: () => { dismissedUpdateToastKey = toastKey; }
    });
  } else if (phase === 'unavailable') {
    toast = showUpdateToast({
      message: status.errorMessage || 'Das Update-System ist derzeit nicht verfügbar.',
      details: status.errorDetails || null,
      dismissLabel: 'Schließen',
      ariaMode: 'error',
      onDismiss: () => { dismissedUpdateToastKey = toastKey; }
    });
  }

  if (toast) {
    toast.dataset.updatePhase = phase;
    toast.dataset.updateToastKey = toastKey;
    lastRenderedUpdateToastKey = toastKey;
  }
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  const toast = document.querySelector('.update-toast[data-update-phase]');
  if (!toast || toast.dataset.updatePhase === 'installing') return;
  event.preventDefault();
  event.stopPropagation();
  dismissedUpdateToastKey = toast.dataset.updateToastKey || null;
  toast.remove();
  lastRenderedUpdateToastKey = null;
});

let currentSidebarUpdateStatus = null;
els.updateStatusTop.addEventListener('click', async () => {
  if (currentSidebarUpdateStatus?.phase === 'updateAvailable' && currentSidebarUpdateStatus.releaseUrl) {
    window.open(currentSidebarUpdateStatus.releaseUrl, '_blank');
    return;
  }
  if (currentSidebarUpdateStatus?.phase === 'downloaded' || (currentSidebarUpdateStatus?.phase === 'error' && currentSidebarUpdateStatus.installReady)) {
    await installDownloadedUpdate();
  }
});

function applyCentralUpdateStatus(status) {
  currentSidebarUpdateStatus = status;
  els.updateStatusCurrent.textContent = status.currentVersion ? `v${status.currentVersion}` : '';
  renderUpdateStatus(els.updateDot, els.updateStatusLabel, status, 'update-status-label');
  const clickable = (
    (status.phase === 'updateAvailable' && Boolean(status.releaseUrl)) ||
    status.phase === 'downloaded' ||
    (status.phase === 'error' && status.installReady)
  );
  els.updateStatusTop.classList.toggle('clickable', clickable);
  els.updateStatusTop.setAttribute('aria-disabled', clickable ? 'false' : 'true');
  els.updateStatusTop.title = status.phase === 'downloaded'
    ? 'Update installieren und Archiv-Wiki neu starten'
    : status.phase === 'updateAvailable'
      ? 'GitHub-Release öffnen'
      : '';
  renderUpdateToastFromStatus(status);
}

onUpdateStatusChanged(applyCentralUpdateStatus);

// ---------------------------------------------------------------------------
// Sync-Einstellungen — jederzeit über den ☁-Button in der Topbar erreichbar
// (nicht nur einmalig im Wizard). Passwort wird bei aktivierter "Passwort
// merken"-Option sicher über safeStorage vorausgefüllt (siehe main/sync-ipc.js).
// ---------------------------------------------------------------------------
async function openSyncSettingsModal() {
  closeManagedDialogs('.prompt-overlay', { restoreFocus: false });
  const settings = await window.archivAPI.syncApi.getSettings();
  applyPersistedProjectConfig(settings.config);

  const overlay = document.createElement('div');
  overlay.className = 'prompt-overlay';
  overlay.innerHTML = `
    <div class="prompt-modal sync-modal">
      <div class="prompt-title"><img class="lib-icon dialog-title-icon" src="assets/icon-library/network/cloud.svg" alt="">Synchronisation (Nextcloud/WebDAV)<button type="button" class="modal-close-x" data-action="close-x" title="Schließen" aria-label="Schließen">✕</button></div>
      <p class="sync-modal-note">Verbindung testen, reiner Upload, oder Abgleich in beide Richtungen mit Löschungs- und Konflikterkennung.</p>
      <label class="sync-field-label">WebDAV-URL</label>
      <input type="text" class="prompt-input" id="syncModalUrl" placeholder="https://deine-nextcloud.example/remote.php/dav/files/NUTZER/" autocomplete="off">
      <label class="sync-field-label">Benutzername</label>
      <input type="text" class="prompt-input" id="syncModalUser" autocomplete="off">
      <label class="sync-field-label">Passwort</label>
      <input type="password" class="prompt-input" id="syncModalPass" autocomplete="off">
      <label class="sync-remember-label" id="syncRememberLabel">
        <input type="checkbox" id="syncModalRemember"> Passwort merken
      </label>
      <label class="sync-remember-label" id="syncAutoLabel">
        <input type="checkbox" id="syncModalAuto"> Automatische Synchronisation, alle
        <select id="syncModalInterval">
          ${buildSyncIntervalOptionsHtml(15)}
        </select>
      </label>
      <div class="sync-modal-status" id="syncModalStatus"></div>
      <div class="sync-retry-row" id="syncRetryRow"></div>
      <div class="sync-conflict-list" id="syncConflictList"></div>
      <button type="button" class="sync-history-toggle" id="syncHistoryToggle"><img class="lib-icon dialog-inline-icon" src="assets/icon-library/docs/clipboard-list.svg" alt="">Verlauf anzeigen</button>
      <div class="sync-history-list" id="syncHistoryList" style="display:none;"></div>
      <div class="prompt-actions sync-modal-actions">
        <button type="button" class="btn sync-action-btn" data-action="test"><img class="lib-icon sab-icon" src="assets/icon-library/network/plug.svg" alt=""><span class="sab-label">TESTEN</span></button>
        <button type="button" class="btn sync-action-btn" data-action="upload"><img class="lib-icon sab-icon" src="assets/icon-library/network/cloud.svg" alt=""><span class="sab-label">UPLOAD</span></button>
        <button type="button" class="btn primary sync-action-btn" data-action="syncall"><img class="lib-icon sab-icon" src="assets/icon-library/dev/git-merge.svg" alt=""><span class="sab-label">JETZT SYNCHRONISIEREN</span></button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const urlInput = document.getElementById('syncModalUrl');
  const userInput = document.getElementById('syncModalUser');
  const passInput = document.getElementById('syncModalPass');
  const rememberCheckbox = document.getElementById('syncModalRemember');
  const rememberLabel = document.getElementById('syncRememberLabel');
  const autoCheckbox = document.getElementById('syncModalAuto');
  const autoLabel = document.getElementById('syncAutoLabel');
  const intervalSelect = document.getElementById('syncModalInterval');
  const statusEl = document.getElementById('syncModalStatus');
  const conflictListEl = document.getElementById('syncConflictList');

  document.getElementById('syncHistoryToggle').addEventListener('click', async (e) => {
    const listEl = document.getElementById('syncHistoryList');
    const isHidden = listEl.style.display === 'none';
    if (isHidden) {
      const history = await window.archivAPI.syncApi.getHistory();
      listEl.innerHTML = history.length === 0
        ? '<p class="sync-history-empty">Noch keine Synchronisation durchgeführt.</p>'
        : history.map(h => {
            const when = formatRelativeTime(h.timestamp);
            const duration = h.durationMs != null ? `${(h.durationMs / 1000).toFixed(1)}s` : '–';
            if (!h.success) {
              return `<div class="sync-history-row sync-history-error"><img class="lib-icon shr-icon" src="assets/icon-library/security/alert-triangle.svg" alt=""><span class="shr-main">Fehlgeschlagen · ${escapeHtml(when)}</span><span class="shr-detail">${escapeHtml(h.error || 'Der Fehler konnte nicht genauer bestimmt werden.')}</span></div>`;
            }
            return `<div class="sync-history-row"><span class="shr-icon">✓</span><span class="shr-main">${h.filesCount} Datei${h.filesCount === 1 ? '' : 'en'} · ${escapeHtml(when)}</span><span class="shr-detail">${duration}${h.warnings ? ` · ${h.warnings} Warnung${h.warnings === 1 ? '' : 'en'}` : ''}</span></div>`;
          }).join('');
      listEl.style.display = 'block';
      e.target.replaceChildren(createDialogInlineIcon('docs/clipboard-list'), document.createTextNode('Verlauf ausblenden'));
    } else {
      listEl.style.display = 'none';
      e.target.replaceChildren(createDialogInlineIcon('docs/clipboard-list'), document.createTextNode('Verlauf anzeigen'));
    }
  });
  urlInput.value = settings.url || '';
  userInput.value = settings.username || '';
  urlInput.focus();

  const hadSavedPassword = Boolean(settings.savedPassword);
  if (settings.savedPassword) { passInput.value = settings.savedPassword; rememberCheckbox.checked = true; }
  if (!settings.encryptionAvailable) {
    rememberCheckbox.disabled = true;
    rememberLabel.title = 'Auf diesem System nicht verfügbar (kein Schlüsselbund gefunden).';
    rememberLabel.classList.add('sync-remember-disabled');
  }

  // Automatischer Hintergrund-Abgleich braucht zwingend ein gespeichertes
  // Passwort (siehe main/sync-ipc.js) — ohne das kann niemand da sein, der es
  // eintippt. Deshalb an "Passwort merken" gekoppelt, nicht unabhängig davon.
  const autoSettings = await window.archivAPI.syncApi.getAutoSyncSettings();
  applyPersistedProjectConfig(autoSettings.config);
  autoCheckbox.checked = autoSettings.enabled;
  intervalSelect.value = String(autoSettings.intervalMinutes);
  function refreshAutoAvailability() {
    const available = settings.encryptionAvailable && rememberCheckbox.checked;
    autoCheckbox.disabled = !available;
    intervalSelect.disabled = !available;
    if (!available) {
      autoCheckbox.checked = false;
      autoLabel.title = 'Braucht ein gemerktes Passwort (siehe Checkbox oben).';
      autoLabel.classList.add('sync-remember-disabled');
    } else {
      autoLabel.title = '';
      autoLabel.classList.remove('sync-remember-disabled');
    }
  }
  refreshAutoAvailability();
  rememberCheckbox.addEventListener('change', refreshAutoAvailability);

  async function persistAutoSyncSettings() {
    const result = await window.archivAPI.syncApi.saveAutoSyncSettings({ enabled: autoCheckbox.checked, intervalMinutes: Number(intervalSelect.value) });
    applyPersistedProjectConfig(result.config);
  }
  autoCheckbox.addEventListener('change', persistAutoSyncSettings);
  intervalSelect.addEventListener('change', persistAutoSyncSettings);

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = 'sync-modal-status' + (kind ? ' sync-status-' + kind : '');
  }

  async function persistUrlAndUser() {
    const result = await window.archivAPI.syncApi.saveSettings({ url: urlInput.value.trim(), username: userInput.value.trim() });
    applyPersistedProjectConfig(result.config);
  }

  // Nach jeder erfolgreichen Aktion: Passwort merken/vergessen je nach Checkbox-Stand.
  async function maybePersistPassword() {
    if (!settings.encryptionAvailable) return;
    if (rememberCheckbox.checked) {
      if (passInput.value) await window.archivAPI.syncApi.savePassword(passInput.value);
    } else if (hadSavedPassword) {
      await window.archivAPI.syncApi.clearPassword();
    }
  }

  function currentCreds() {
    return { url: urlInput.value.trim(), username: userInput.value.trim(), password: passInput.value };
  }

  function renderConflicts(conflicts) {
    if (!conflicts?.length) { conflictListEl.innerHTML = ''; return; }
    conflictListEl.innerHTML = conflicts.map(c => `
      <div class="sync-conflict-row" data-relpath="${escapeHtml(c.relPath)}">
        <div class="sync-conflict-path">${escapeHtml(c.relPath)}</div>
        <div class="sync-conflict-reason">${escapeHtml(c.reason)}</div>
        <div class="sync-conflict-details">
          ${c.localExists ? `<div><span class="sync-conflict-details-label">Deine Version:</span> ${escapeHtml(formatDateTime(c.localMtime))} · ${escapeHtml(formatBytes(c.localSize))}</div>` : ''}
          ${c.remoteExists ? `<div><span class="sync-conflict-details-label">Cloud-Version:</span> ${escapeHtml(formatDateTime(c.remoteLastmod))} · ${escapeHtml(formatBytes(c.remoteSize))}</div>` : ''}
        </div>
        <div class="sync-conflict-actions">
          <button type="button" data-resolve="keep-local">Meine Version behalten</button>
          <button type="button" data-resolve="keep-remote">Cloud-Version übernehmen</button>
          ${c.localExists && c.remoteExists ? '<button type="button" data-resolve="keep-both">Beide Versionen speichern</button>' : ''}
        </div>
      </div>`).join('');

    conflictListEl.querySelectorAll('.sync-conflict-row').forEach(row => {
      const relPath = row.dataset.relpath;
      row.querySelectorAll('[data-resolve]').forEach(btn => {
        btn.addEventListener('click', async () => {
          row.querySelectorAll('button').forEach(b => b.disabled = true);
          try {
            await window.archivAPI.syncApi.resolveConflict({ ...currentCreds(), relPath, resolution: btn.dataset.resolve });
            row.classList.add('sync-conflict-resolved');
            row.querySelector('.sync-conflict-reason').textContent = '✓ gelöst';
            await refreshAll();
          } catch (err) {
            row.querySelector('.sync-conflict-reason').textContent = err.message;
            row.querySelectorAll('button').forEach(b => b.disabled = false);
          }
        });
      });
    });
  }

  function close() { dialogController.destroy(); }
  async function persistAndClose() { await persistUrlAndUser(); close(); }
  const closeButton = overlay.querySelector('[data-action="close-x"]');
  closeButton.addEventListener('click', persistAndClose);
  const dialogController = manageModalDialog({
    overlay,
    dialog: overlay.querySelector('.prompt-modal'),
    initialFocus: closeButton,
    onRequestClose: persistAndClose,
    closeOnBackdrop: false,
    enterActivatesPrimary: false
  });

  overlay.querySelector('[data-action="test"]').addEventListener('click', async () => {
    setStatus('Verbinde …', 'pending');
    try {
      await persistUrlAndUser();
      await window.archivAPI.syncApi.testConnection(currentCreds());
      await maybePersistPassword();
      setStatus('✓ Verbindung erfolgreich.', 'ok');
    } catch (err) {
      setStatus(err.message, 'error');
    }
  });

  overlay.querySelector('[data-action="upload"]').addEventListener('click', async () => {
    if (!await showConfirmDialog({
      title: 'Wiki zur Cloud hochladen?',
      message: 'Der komplette Wiki-Ordner wird hochgeladen. Vorhandene Remote-Dateien mit gleichem Namen werden überschrieben.',
      confirmLabel: 'Hochladen'
    })) return;
    setStatus('Lade hoch …', 'pending');
    try {
      await persistUrlAndUser();
      const result = await window.archivAPI.syncApi.uploadAll(currentCreds());
      await maybePersistPassword();
      setStatus(`✓ ${result.uploaded} Datei(en) hochgeladen.`, 'ok');
    } catch (err) {
      setStatus(err.message, 'error');
    }
  });

  overlay.querySelector('[data-action="syncall"]').addEventListener('click', async () => {
    if (!await showConfirmDialog({
      title: 'Zwei-Wege-Synchronisation starten?',
      message: 'Eindeutige Änderungen und Löschungen werden automatisch synchronisiert. Bei echten Konflikten wird nichts verändert; stattdessen erscheint eine Liste mit Auflösungsoptionen.',
      confirmLabel: 'Synchronisieren'
    })) return;
    setStatus('Synchronisiere …', 'pending');
    conflictListEl.innerHTML = '';
    try {
      await persistUrlAndUser();
      const result = await window.archivAPI.syncApi.syncAll(currentCreds());
      await maybePersistPassword();
      const parts = [`${result.uploaded} hochgeladen`, `${result.downloaded} heruntergeladen`, `${result.skipped} bereits aktuell`];
      if (result.deletedLocal) parts.push(`${result.deletedLocal} lokal gelöscht (Remote-Löschung übernommen)`);
      if (result.deletedRemote) parts.push(`${result.deletedRemote} remote gelöscht (lokale Löschung übernommen)`);
      if (result.conflicts?.length) {
        setStatus(`${parts.join(', ')}.\n${result.conflicts.length} Konflikt(e) unten — bitte auflösen:`, 'error');
        renderConflicts(result.conflicts);
      } else {
        setStatus(`✓ ${parts.join(', ')}.`, 'ok');
      }
      await refreshAll();
    } catch (err) {
      setStatus(err.message, 'error');
    }
  });

  // Beim Öffnen: letzten bekannten Status zeigen (Fehler/Konflikte/Erfolg),
  // nicht nur auf neue Aktionen INNERHALB dieses Fensters reagieren — vorher
  // war das Fenster beim Öffnen immer leer, selbst wenn z. B. der automatische
  // Hintergrund-Abgleich kurz zuvor fehlgeschlagen war oder Konflikte fand
  // (siehe Bug-Report: "Sync-Icon zeigt Fehler an, aber App zeigt nichts").
  const retryRow = document.getElementById('syncRetryRow');
  try {
    const status = await window.archivAPI.syncApi.getStatus();
    if (status.state === 'error') {
      setStatus('Letzte Synchronisation fehlgeschlagen: ' + (status.lastError || ''), 'error');
      retryRow.innerHTML = '<button type="button" class="btn" id="syncRetryBtn">Erneut versuchen</button>';
      document.getElementById('syncRetryBtn').addEventListener('click', () => {
        overlay.querySelector('[data-action="syncall"]').click();
      });
    } else if (status.state === 'conflicts' && status.conflicts?.length) {
      setStatus(`${status.conflicts.length} ungelöste(r) Konflikt(e) — bitte auflösen:`, 'error');
      renderConflicts(status.conflicts);
    } else if (status.state === 'idle' && status.lastSyncAt) {
      setStatus('Zuletzt erfolgreich synchronisiert: ' + formatRelativeTime(status.lastSyncAt), 'ok');
    }
  } catch { /* Status-Abruf ist rein informativ, sollte das Öffnen nie blockieren */ }
}

els.btnSync.addEventListener('click', () => { openSyncSettingsModal(); });

// ---------------------------------------------------------------------------
// Sync-Status-Icon (Stufe 6): ☁-Button zeigt live, ob gerade synchronisiert
// wird, der letzte Versuch fehlgeschlagen ist, oder ungelöste Konflikte
// vorliegen — unabhängig davon, ob das Modal gerade offen ist.
// ---------------------------------------------------------------------------
function applySyncStatus(status) {
  els.btnSync.classList.remove('sync-status-syncing', 'sync-status-error', 'sync-status-conflicts', 'sync-status-ok');
  if (status.state === 'syncing') { els.btnSync.classList.add('sync-status-syncing'); els.btnSync.title = 'Synchronisiere …'; }
  else if (status.state === 'error') { els.btnSync.classList.add('sync-status-error'); els.btnSync.title = 'Letzte Synchronisation fehlgeschlagen: ' + (status.lastError || ''); }
  else if (status.state === 'conflicts') { els.btnSync.classList.add('sync-status-conflicts'); els.btnSync.title = `${status.conflictCount} ungelöste(r) Konflikt(e)`; }
  else if (status.state === 'idle' && status.lastSyncAt) {
    // Zuvor gab es hierfür GAR keine eigene Kennzeichnung — sah optisch genauso
    // aus wie "noch nie synchronisiert". Jetzt: grüner Punkt = zuletzt erfolgreich.
    els.btnSync.classList.add('sync-status-ok');
    els.btnSync.title = 'Zuletzt erfolgreich synchronisiert: ' + formatRelativeTime(status.lastSyncAt);
  }
  else { els.btnSync.title = 'Synchronisationseinstellungen'; }
}
window.archivAPI.syncApi.getStatus().then(applySyncStatus).catch(() => {});
window.archivAPI.syncApi.onStatusUpdate(applySyncStatus);

// Bug-Fix: "Startseite"/homeLink lag außerhalb von #navTree und wurde daher
// nie von wireNavInteractions() erfasst — hatte bislang GAR keinen Klick-Handler.
els.homeLink.addEventListener('click', () => { void navigateTo('#home'); });
els.incomingLink.addEventListener('click', () => { void navigateTo('#incoming'); });
els.knowledgeCareLink.addEventListener('click', () => { void navigateTo('#knowledge-care'); });
// Tags/Statistik haben keinen eigenen Sidebar-Link mehr — Navigation dorthin
// läuft jetzt über die Dashboard-Kacheln (siehe renderHome), Routen selbst
// bleiben unverändert erreichbar (#tags, #stats).

// ---------------------------------------------------------------------------
// Baum laden + Sidebar/Stats/Home neu rendern
// ---------------------------------------------------------------------------
// Kategorien beim Start (Nutzer-Einstellung, Einstellungsfenster → Allgemein):
// NUR der allererste refreshAll()-Aufruf (also der eigentliche Programmstart)
// wendet die gewählte Start-Option an — spätere Aktualisierungen während der
// laufenden Sitzung (z. B. nach dem Anlegen einer Notiz) lassen den vom
// Nutzer manuell gewählten Auf-/Zuklapp-Zustand unangetastet.
let isInitialLoad = true;

function collectAllGroupRelPaths(nodes, out = []) {
  for (const n of nodes) {
    if (n.type === 'folder') {
      out.push(n.relPath);
      collectAllGroupRelPaths(n.children, out);
    }
  }
  return out;
}

// Für "Hauptkategorien geöffnet": nur Unterkategorien (depth >= 2) sammeln,
// Hauptkategorien (depth 1) bleiben dadurch offen.
function collectSubGroupRelPaths(nodes, depth = 1, out = []) {
  for (const n of nodes) {
    if (n.type === 'folder') {
      if (depth >= 2) out.push(n.relPath);
      collectSubGroupRelPaths(n.children, depth + 1, out);
    }
  }
  return out;
}

// Bestimmt den Start-Zustand gemäß der gewählten Einstellung. 'closed' ist
// sowohl der Standardwert der Einstellung selbst als auch der Rückfallwert,
// falls "Letzten Zustand wiederherstellen" gewählt ist, aber noch nie ein
// Zustand gespeichert wurde.
function initialCollapsedGroups(tree, behavior, savedCollapsedGroups) {
  switch (behavior) {
    case 'allOpen': return new Set();
    case 'topLevelOpen': return new Set(collectSubGroupRelPaths(tree));
    case 'restore': return new Set(Array.isArray(savedCollapsedGroups) && savedCollapsedGroups.length
      ? savedCollapsedGroups
      : collectAllGroupRelPaths(tree));
    case 'closed':
    default: return new Set(collectAllGroupRelPaths(tree));
  }
}

async function refreshAll() {
  state.tree = await fs.getTree();
  if (isInitialLoad) {
    // WICHTIG: passiert VOR renderNavTree() weiter unten, damit der Baum
    // gleich beim allerersten Rendern im korrekten Zustand erscheint — kein
    // kurzes Aufklappen-und-wieder-Schließen sichtbar.
    const behavior = state.project?.config?.categoryStartupBehavior || 'closed';
    state.collapsedGroups = initialCollapsedGroups(state.tree, behavior, state.project?.config?.savedCollapsedGroups);
    isInitialLoad = false;
  }
  renderNavTree();
  render(); // aktuelle Route neu zeichnen (Baum kann sich geändert haben)
  const indexRebuild = rebuildIndex();
  refreshSearchDropdownForCurrentQuery();
  indexRebuild
    .then(result => {
      if (result.applied) refreshSearchDropdownForCurrentQuery();
    })
    .catch(err => {
      console.error('[Archiv Wiki] Such-Index konnte nicht aktualisiert werden', err);
      refreshSearchDropdownForCurrentQuery();
    });
  updateTrashBadge();
}

// Dezente Anzahl-Anzeige am Papierkorb-Symbol — nutzt dasselbe Badge-Muster
// wie die Notiz-Anzahl neben den Kategorien in der Sidebar (.g-count).
// Bewusst nur sichtbar, wenn wirklich etwas im Papierkorb liegt.
async function updateTrashBadge() {
  try {
    const items = await fs.getTrash();
    if (items.length > 0) {
      els.trashCount.textContent = items.length;
      els.trashCount.style.display = '';
    } else {
      els.trashCount.style.display = 'none';
    }
  } catch (err) {
    // Rein informativ, sollte nie den Rest der App blockieren — aber
    // trotzdem protokollieren statt still zu verschlucken, sonst bleibt ein
    // echtes Problem hier unsichtbar.
    console.error('[Archiv Wiki] Papierkorb-Anzahl konnte nicht ermittelt werden:', err);
  }
}

// ---------------------------------------------------------------------------
// Sidebar-Nav-Baum rendern
// ---------------------------------------------------------------------------
function renderNavTree() {
  els.navTree.innerHTML = '';
  const ul = document.createElement('ul');
  ul.className = 'nav-top';
  state.tree.filter(n => n.type === 'folder').forEach(group => ul.appendChild(renderGroup(group, 1)));
  els.navTree.appendChild(ul);
  wireNavInteractions();
}

// depth 1 = Hauptkategorie, depth 2 = Unterkategorie (strikte 3-Ebenen-Regel,
// siehe main/notes-fs.js). depth >=3 kann bei älteren/fremden Projektordnern
// vorkommen (wird nicht gelöscht/migriert) und fällt optisch/funktional auf
// "Unterkategorie" zurück.
function renderGroup(group, depth) {
  const level = Math.min(depth, 2);
  const roleType = depth === 1 ? 'mainCategory' : 'subCategory';
  const li = document.createElement('li');
  li.className = `nav-group level-${level}` + (state.collapsedGroups.has(group.relPath) ? ' collapsed' : '');
  li.dataset.relpath = group.relPath;
  li.dataset.type = roleType;

  const notesCount = fs.flattenNotes(group.children).length;
  const handle = level === 1
    ? `<span class="row-handle" draggable="true" title="Ziehen zum Umsortieren der Hauptkategorien">⠿</span>`
    : `<span class="row-handle" draggable="true" title="Ziehen zum Verschieben in eine andere Hauptkategorie">⠿</span>`;

  li.innerHTML = `
    <div class="group-header-row">
      ${handle}
      <button type="button" class="group-header" data-toggle="${escapeHtml(group.relPath)}">
        <svg class="g-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 6 15 12 9 18"/></svg>
        <span class="g-icon">${renderIconHtml(group.icon, '📁')}</span>
        <span class="g-label">${escapeHtml(group.name)}</span>
        <span class="g-count">${notesCount}</span>
      </button>
    </div>
    <ul class="group-list"></ul>
  `;

  const groupList = li.querySelector('.group-list');
  group.children.forEach(child => {
    if (child.type === 'folder') {
      groupList.appendChild(renderGroup(child, depth + 1));
    } else {
      groupList.appendChild(renderNoteItem(child));
    }
  });

  return li;
}

function renderNoteItem(note) {
  const li = document.createElement('li');
  li.className = 'nav-item-row';
  li.dataset.relpath = note.relPath;
  li.dataset.type = 'note';
  const title = note.frontmatter?.title || note.name;
  li.innerHTML = `
    <span class="row-handle" draggable="true" title="Ziehen zum Verschieben/Umsortieren">⠿</span>
    <a class="nav-link" data-route="note" data-relpath="${escapeHtml(note.relPath)}" tabindex="0">
      <span class="nl-icon">${renderIconHtml(note.icon, '📄')}</span><span class="nl-title">${escapeHtml(title)}</span>
    </a>
  `;
  return li;
}

function wireNavInteractions() {
  els.navTree.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const relPath = btn.dataset.toggle;
      const group = btn.closest('.nav-group');
      const groupList = group.querySelector(':scope > .group-list');
      if (state.collapsedGroups.has(relPath)) state.collapsedGroups.delete(relPath);
      else state.collapsedGroups.add(relPath);

      // Höhe wird jetzt tatsächlich GEMESSEN statt einer festen, geschätzten
      // Obergrenze (900px) zu vertrauen — bei einer Kategorie mit sehr
      // vielen direkten Einträgen wären sonst die Einträge oberhalb dieser
      // Grenze beim Aufklappen unsichtbar geblieben (overflow:hidden schneidet
      // ab, statt zu scrollen). Funktioniert dadurch unabhängig von der
      // tatsächlichen Anzahl an Einträgen in der jeweiligen Kategorie.
      if (groupList) {
        if (group.classList.contains('collapsed')) {
          // Wird jetzt geöffnet: zuerst von 0 aus starten, dann im nächsten
          // Frame zur echten, gemessenen Höhe animieren.
          groupList.style.maxHeight = '0px';
          group.classList.remove('collapsed');
          requestAnimationFrame(() => { groupList.style.maxHeight = groupList.scrollHeight + 'px'; });
          // Nach Abschluss der Animation die Begrenzung wieder ganz aufheben,
          // damit spätere Änderungen (z. B. eine neu angelegte Notiz) nicht
          // durch eine "eingefrorene" alte Höhe abgeschnitten werden.
          setTimeout(() => { if (!group.classList.contains('collapsed')) groupList.style.maxHeight = 'none'; }, 260);
        } else {
          // Wird jetzt geschlossen: zuerst die aktuelle, echte Höhe fixieren
          // (statt weiterhin "none" zu haben, von dem aus sich nicht sauber
          // animieren lässt), dann im nächsten Frame auf 0 übergehen.
          groupList.style.maxHeight = groupList.scrollHeight + 'px';
          requestAnimationFrame(() => {
            group.classList.add('collapsed');
            groupList.style.maxHeight = '0px';
          });
        }
      } else {
        group.classList.toggle('collapsed');
      }

      // Nur speichern, wenn "Letzten Zustand wiederherstellen" gewählt ist —
      // bei den anderen drei Optionen bestimmt ohnehin die Einstellung selbst
      // den Start-Zustand, ein Mitschreiben wäre unnötiger Schreibaufwand.
      if (state.project?.config?.categoryStartupBehavior === 'restore') {
        const saved = [...state.collapsedGroups];
        fs.setProjectSetting('savedCollapsedGroups', saved).catch(() => {});
      }
    });
  });

  // Drag-Start/-Ende: der .row-handle ist jetzt bei ALLEN Zeilentypen
  // draggable="true" (Hauptkategorien seit Aufgabe 1 auch — zum Umsortieren,
  // nicht zum Verschieben zwischen Ordnern). Das dragstart-Event blubbert
  // bis zur Zeile (.nav-item-row / .nav-group) hoch, wo wir Pfad + Typ ablesen.
  els.navTree.querySelectorAll('[data-relpath]').forEach(row => {
    row.addEventListener('dragstart', (e) => {
      e.stopPropagation(); // WICHTIG: sonst bubbelt dragstart zu Eltern-Elementen
      // hoch (Notiz -> Unterkategorie -> Hauptkategorie), die AUCH [data-relpath]
      // haben und ihrerseits denselben Listener auslösen — das überschreibt
      // state.dragRelPath/dragType mit dem FALSCHEN (äußersten) Element.
      state.dragRelPath = row.dataset.relpath;
      state.dragType = row.dataset.type;
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', (e) => {
      e.stopPropagation();
      row.classList.remove('dragging');
      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over', 'invalid'));
      state.dragRelPath = null;
      state.dragType = null;
    });
  });

  els.navTree.querySelectorAll('.nav-group').forEach(group => {
    const headerRow = group.querySelector(':scope > .group-header-row');
    group.addEventListener('dragover', (e) => {
      if (!state.dragRelPath) {
        // Kein aktiver interner Drag — könnte trotzdem ein externer Datei-Drag
        // sein (z. B. .md-Datei aus dem Dateimanager). Ohne preventDefault()
        // hier würde das spätere "drop"-Ereignis laut HTML5-Spec NIE feuern,
        // selbst wenn der drop-Handler selbst externe Dateien behandeln könnte.
        if ([...(e.dataTransfer?.types || [])].includes('Files') && group.dataset.type === 'subCategory') {
          e.preventDefault();
          e.stopPropagation();
          headerRow?.classList.add('drag-over');
        }
        return;
      }
      e.stopPropagation(); // sonst würde beim Überfahren einer Unterkategorie zusätzlich die umschließende Hauptkategorie reagieren
      const valid = isValidDropTarget(group.dataset.relpath, group.dataset.type);
      if (valid) e.preventDefault(); // signalisiert dem Browser: hier darf gedroppt werden

      // Beim Umsortieren (Hauptkategorie auf Hauptkategorie) obere/untere
      // Hälfte des Ziels erkennen, damit "davor" oder "danach" einfügen
      // präzise der tatsächlichen Mausposition entspricht — nicht immer
      // nur "davor" wie zuvor.
      const isReorder = valid && state.dragType === 'mainCategory' && group.dataset.type === 'mainCategory';
      let wantTop = null;
      if (isReorder) {
        const rect = group.getBoundingClientRect();
        wantTop = (e.clientY - rect.top) < rect.height / 2;
      }
      group.dataset.dropPosition = wantTop === null ? '' : (wantTop ? 'before' : 'after');

      // Flacker-Fix: nur schreiben, wenn sich der gewünschte Klassen-Zustand
      // wirklich ändert — dragover feuert bei jeder Mausbewegung neu.
      const ALL = ['drag-over', 'drag-over-top', 'drag-over-bottom', 'invalid'];
      const want = new Set();
      if (isReorder) want.add(wantTop ? 'drag-over-top' : 'drag-over-bottom');
      else { want.add('drag-over'); if (!valid) want.add('invalid'); }
      const current = new Set(ALL.filter(c => headerRow?.classList.contains(c)));
      const same = current.size === want.size && [...current].every(c => want.has(c));
      if (!same) {
        ALL.forEach(c => headerRow?.classList.remove(c));
        want.forEach(c => headerRow?.classList.add(c));
      }
    });
    group.addEventListener('dragleave', (e) => {
      e.stopPropagation();
      // Flacker-Fix Teil 2: dragleave feuert schon, wenn die Maus nur zu
      // einem KIND-Element innerhalb derselben Gruppe wechselt (z. B. vom
      // Rand zum Label). Nur wirklich entfernen, wenn die Maus die Gruppe
      // tatsächlich verlassen hat, nicht nur innerhalb davon gewechselt ist.
      if (e.relatedTarget && group.contains(e.relatedTarget)) return;
      headerRow?.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom', 'invalid');
    });
    group.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Fremde .md-Dateien aus dem Dateimanager importieren — unabhängig vom
      // bestehenden INTERNEN Umsortier-Drag (state.dragType bleibt hier immer
      // leer, das ist eine echte externe Datei-Drop, kein Sidebar-Element).
      const externalFiles = [...(e.dataTransfer?.files || [])].filter(f => /\.(md|markdown)$/i.test(f.name));
      if (externalFiles.length > 0 && group.dataset.type === 'subCategory') {
        headerRow?.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom', 'invalid');
        for (const file of externalFiles) {
          try {
            const text = await file.text();
            const titleGuess = file.name.replace(/\.(md|markdown)$/i, '');
            const created = await fs.createNote(group.dataset.relpath, titleGuess);
            await fs.saveNote(created.relPath, text, undefined);
          } catch (err) {
            await showMessageDialog({
              title: 'Import fehlgeschlagen',
              message: `"${file.name}" konnte nicht importiert werden:\n${err.message}`
            });
          }
        }
        await refreshAll();
        return;
      }

      const dropPosition = group.dataset.dropPosition;
      headerRow?.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom', 'invalid');
      if (!isValidDropTarget(group.dataset.relpath, group.dataset.type)) return;
      const targetRelPath = group.dataset.relpath;
      const draggedRelPath = state.dragRelPath;
      const draggedType = state.dragType;
      state.dragRelPath = null;
      state.dragType = null;

      // Hauptkategorie auf Hauptkategorie = Umsortieren (Aufgabe 1), kein
      // fs.moveEntry — es wird keine einzige Datei angerührt, nur die
      // Anzeige-Reihenfolge ändert sich, alles "drin" bleibt exakt an Ort
      // und Stelle.
      if (draggedType === 'mainCategory') {
        const mainNames = [...els.navTree.querySelectorAll('.nav-group.level-1')].map(li => li.dataset.relpath);
        const withoutDragged = mainNames.filter(n => n !== draggedRelPath);
        const targetIdx = withoutDragged.indexOf(targetRelPath);
        const insertAt = dropPosition === 'after' ? targetIdx + 1 : targetIdx;
        withoutDragged.splice(insertAt, 0, draggedRelPath);
        await fs.reorderChildren('', withoutDragged);
        await refreshAll();
        const movedRow = els.navTree.querySelector(`[data-relpath="${CSS.escape(draggedRelPath)}"]`);
        if (movedRow) { movedRow.classList.add('drop-success'); setTimeout(() => movedRow.classList.remove('drop-success'), 500); }
        return;
      }

      const moved = await mutateEntryPath({
        sourceRelPath: draggedRelPath,
        actionLabel: 'Verschieben',
        mutate: () => fs.moveEntry(draggedRelPath, targetRelPath)
      });
      if (!moved) return;
      // Kurzer Erfolgs-Puls, damit ein erfolgreiches Einrasten sichtbar quittiert wird.
      const movedRow = els.navTree.querySelector(`[data-relpath="${CSS.escape(moved.relPath)}"]`);
      if (movedRow) {
        movedRow.classList.add('drop-success');
        setTimeout(() => movedRow.classList.remove('drop-success'), 500);
      }
      showMoveUndoToast(draggedRelPath, moved);
    });
  });

  // ---------------------------------------------------------------------
  // Notiz auf Notiz = präzise Positionierung. Erkennt obere/untere Hälfte
  // der Ziel-Notiz, damit "davor" oder "danach" einfügen der tatsächlichen
  // Mausposition entspricht (nicht mehr immer nur "davor").
  // ---------------------------------------------------------------------
  els.navTree.querySelectorAll('.nav-item-row').forEach(noteRow => {
    noteRow.addEventListener('dragover', (e) => {
      if (!state.dragRelPath || state.dragType !== 'note') return; // nur Notiz-auf-Notiz
      if (noteRow.dataset.relpath === state.dragRelPath) return; // nicht auf sich selbst
      e.stopPropagation();
      e.preventDefault();
      const rect = noteRow.getBoundingClientRect();
      const wantTop = (e.clientY - rect.top) < rect.height / 2;
      noteRow.dataset.dropPosition = wantTop ? 'before' : 'after';
      const wantClass = wantTop ? 'drag-over-top' : 'drag-over-bottom';
      const otherClass = wantTop ? 'drag-over-bottom' : 'drag-over-top';
      if (!noteRow.classList.contains(wantClass)) {
        noteRow.classList.remove(otherClass);
        noteRow.classList.add(wantClass);
      }
    });
    noteRow.addEventListener('dragleave', (e) => {
      if (e.relatedTarget && noteRow.contains(e.relatedTarget)) return;
      noteRow.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    noteRow.addEventListener('drop', async (e) => {
      if (!state.dragRelPath || state.dragType !== 'note') return;
      e.preventDefault();
      e.stopPropagation();
      const dropPosition = noteRow.dataset.dropPosition;
      noteRow.classList.remove('drag-over-top', 'drag-over-bottom');
      const draggedRelPath = state.dragRelPath;
      const targetRelPath = noteRow.dataset.relpath;
      state.dragRelPath = null;
      state.dragType = null;
      if (draggedRelPath === targetRelPath) return;

      const draggedParent = draggedRelPath.split('/').slice(0, -1).join('/');
      const targetParent = targetRelPath.split('/').slice(0, -1).join('/');

      // Aktuelle Reihenfolge VOR einer möglichen Verschiebung lesen. Der
      // zentrale Mutationsvertrag rendert den Baum nach dem Pfadwechsel neu;
      // die gewünschte Einfügeposition muss deshalb vorher feststehen.
      const targetGroupEl = els.navTree.querySelector(`.nav-group[data-relpath="${CSS.escape(targetParent)}"]`);
      const siblingNames = targetGroupEl
        ? [...targetGroupEl.querySelectorAll(':scope > .group-list > li.nav-item-row')].map(li => li.dataset.relpath.split('/').pop())
        : [];

      let finalRelPath = draggedRelPath;
      let movedResult = null;
      if (draggedParent !== targetParent) {
        movedResult = await mutateEntryPath({
          sourceRelPath: draggedRelPath,
          actionLabel: 'Verschieben',
          mutate: () => fs.moveEntry(draggedRelPath, targetParent),
          afterMutation: (moved) => {
            const draggedName = moved.relPath.split('/').pop();
            const targetName = targetRelPath.split('/').pop();
            const withoutDragged = siblingNames.filter(n => n !== draggedName);
            const targetIdx = withoutDragged.indexOf(targetName);
            const baseIdx = targetIdx === -1 ? withoutDragged.length : targetIdx;
            const insertAt = dropPosition === 'after' ? baseIdx + 1 : baseIdx;
            withoutDragged.splice(insertAt, 0, draggedName);
            return fs.reorderChildren(targetParent, withoutDragged);
          }
        });
        if (!movedResult) return;
        finalRelPath = movedResult.relPath;
      }

      // Reihenfolge in der Ziel-Unterkategorie setzen: gezogene Notiz vor
      // ODER nach der Ziel-Notiz einfügen, je nachdem in welcher Hälfte
      // der Ziel-Notiz losgelassen wurde (aktuelle Anzeige-Reihenfolge aus
      // dem DOM lesen — die spiegelt bereits jede zuvor gesetzte eigene
      // Reihenfolge oder sonst die alphabetische Standard-Sortierung wider).
      if (!movedResult) {
        const draggedName = finalRelPath.split('/').pop();
        const targetName = targetRelPath.split('/').pop();
        const withoutDragged = siblingNames.filter(n => n !== draggedName);
        const targetIdx = withoutDragged.indexOf(targetName);
        const baseIdx = targetIdx === -1 ? withoutDragged.length : targetIdx;
        const insertAt = dropPosition === 'after' ? baseIdx + 1 : baseIdx;
        withoutDragged.splice(insertAt, 0, draggedName);
        await fs.reorderChildren(targetParent, withoutDragged);
        await refreshAll();
      }
      const movedRow = els.navTree.querySelector(`[data-relpath="${CSS.escape(finalRelPath)}"]`);
      if (movedRow) { movedRow.classList.add('drop-success'); setTimeout(() => movedRow.classList.remove('drop-success'), 500); }
      if (movedResult) showMoveUndoToast(draggedRelPath, movedResult);
    });
  });

  els.navTree.querySelectorAll('a.nav-link[data-relpath]').forEach(a => {
    a.addEventListener('click', () => { void navigateTo('#note/' + encodeURIComponent(a.dataset.relpath)); });
  });
}

// Setzt die 3-Ebenen-Regeln aus main/notes-fs.js auch schon in der Sidebar
// durch (Server validiert zusätzlich, das hier ist "nur" für sofortiges,
// korrektes visuelles Feedback beim Ziehen):
//  - Notiz  → Ziel muss eine Unterkategorie sein
//  - Unterkategorie → Ziel muss eine (andere) Hauptkategorie sein
//  - Hauptkategorie → nie verschiebbar (kein draggable-Handle, s.o.)
function isValidDropTarget(targetRelPath, targetType) {
  if (!state.dragRelPath || state.dragRelPath === targetRelPath) return false;
  if (state.dragType === 'note') return targetType === 'subCategory';
  if (state.dragType === 'subCategory') return targetType === 'mainCategory';
  if (state.dragType === 'mainCategory') return targetType === 'mainCategory'; // Umsortieren, kein Verschieben
  return false;
}

// ---------------------------------------------------------------------------
// Kontextmenü — bewusst nur noch "Umbenennen". Verschieben läuft jetzt per
// Drag&Drop (Handle ⠿ im Bearbeiten-Modus), Löschen per X-Button daneben.
// Für später offen für mehr Optionen (siehe Nutzerfeedback).
// ---------------------------------------------------------------------------
function showExportMenu(anchorEl) {
  return new Promise((resolve) => {
    const menu = createHtmlContextMenu({
      trigger: anchorEl,
      label: 'Exportieren',
      onDismiss: () => close(null),
      html: `
        ${renderSimpleContextMenuItems([
          { label: '⬇ Als Markdown-Datei (.md) exportieren', data: { choice: 'md' } },
          { label: '⬇ Als HTML exportieren', data: { choice: 'html' } },
          { label: '⬇ Als PDF exportieren', data: { choice: 'pdf' } },
          { label: '⬇ Ganzes Wiki als ZIP exportieren', data: { choice: 'zip' } }
        ])}
        <p class="export-security-hint">Exportierte Dateien enthalten Inhalte deines Wikis.<br>Schütze diese Dateien entsprechend.</p>
      `
    });

    let resolved = false;
    function close(value) {
      if (resolved) return;
      resolved = true;
      closeHtmlContextMenu(menu, { reason: value ? 'action' : 'dismiss' });
      resolve(value);
    }
    menu.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-choice]');
      if (btn) close(btn.dataset.choice);
    });
  });
}

// Liest das bereits im Dokument geladene KaTeX-Stylesheet aus (verlinkt in
// index.html) und gibt dessen CSS-Text zurück — kein zusätzlicher fetch()
// nötig, die Regeln liegen schon im DOM (document.styleSheets).
function getLoadedKatexCss() {
  for (const sheet of document.styleSheets) {
    if (sheet.href && sheet.href.includes('katex.min.css')) {
      try { return [...sheet.cssRules].map(r => r.cssText).join('\n'); }
      catch { return ''; } // CORS/Zugriffsfehler auf sheet.cssRules — dann halt ohne
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Gemeinsame Lösch-Logik — genutzt vom Sidebar-Kontextmenü (siehe showContextMenu).
// ---------------------------------------------------------------------------
async function performDelete(relPath, type) {
  const noun = type === 'mainCategory' ? 'Hauptkategorie' : type === 'subCategory' ? 'Unterkategorie' : 'Notiz';
  const msg = type === 'note' ? 'Notiz in den Papierkorb verschieben?' : `${noun} inkl. allem Inhalt in den Papierkorb verschieben?`;
  if (!await showConfirmDialog({
    title: `${noun} in den Papierkorb?`,
    message: msg,
    confirmLabel: 'In den Papierkorb',
    danger: true
  })) return;
  const openRelPath = getOpenRelPath();
  const affectsOpenNote = openRelPath && (type === 'note' ? openRelPath === relPath : (openRelPath === relPath || openRelPath.startsWith(relPath + '/')));
  if (affectsOpenNote) { closeEditor(); void navigateAfterEntryMutation('#home'); }
  await fs.deleteEntry(relPath);
  await refreshAll();
}

function showContextMenu(relPath, anchorEl, type = 'note', position = null) {
  const menu = createHtmlContextMenu({
    trigger: anchorEl,
    label: type === 'note' ? 'Notizaktionen' : 'Kategorieaktionen',
    position,
    html: renderSimpleContextMenuItems([
      { label: '<img class="lib-icon context-menu-icon" src="assets/icon-library/actions/pencil.svg" alt=""><span>Umbenennen</span>', data: { action: 'rename' } },
      { label: '<img class="lib-icon context-menu-icon" src="assets/icon-library/actions/palette.svg" alt=""><span>Icon ändern</span>', data: { action: 'icon' } },
      { separator: true },
      { label: '<img class="lib-icon context-menu-icon" src="assets/icon-library/actions/trash.svg" alt=""><span>In den Papierkorb</span>', danger: true, data: { action: 'delete' } }
    ])
  });

  menu.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.action === 'delete') {
      closeHtmlContextMenu(menu, { reason: 'action' });
      await performDelete(relPath, type);
      return;
    }
    if (btn.dataset.action === 'icon') {
      closeHtmlContextMenu(menu, { reason: 'action' });
      showIconPicker(anchorEl, async (icon) => {
        await fs.setCategoryIcon(relPath, icon);
        await refreshAll();
      });
      return;
    }
    if (btn.dataset.action !== 'rename') return;
    closeHtmlContextMenu(menu, { reason: 'action' });
    const currentName = relPath.split('/').pop().replace(/\.md$/, '');
    const newName = await showPromptModal({ title: 'Neuer Name', defaultValue: currentName });
    if (newName && newName !== currentName) {
      await mutateEntryPath({
        sourceRelPath: relPath,
        actionLabel: 'Umbenennen',
        mutate: () => fs.renameEntry(relPath, newName)
      });
    }
  });
}

// Hauptkategorien: nur Top-Level-Ordner.
function collectMainCategories(tree) {
  return tree.filter(n => n.type === 'folder').map(n => ({ relPath: n.relPath, label: n.name }));
}

// Unterkategorien: Ordner genau eine Ebene unter einer Hauptkategorie.
// Label zeigt "Hauptkategorie / Unterkategorie" zur Einordnung im Picker.
function collectSubCategories(tree) {
  const out = [];
  for (const main of tree) {
    if (main.type !== 'folder') continue;
    for (const child of main.children) {
      if (child.type === 'folder') out.push({ relPath: child.relPath, label: `${main.name} / ${child.name}` });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Neue Hauptkategorie (immer oberste Ebene)
// ---------------------------------------------------------------------------
async function createMainCategoryFlow() {
  const name = await showPromptModal({ title: 'Name der neuen Hauptkategorie', defaultValue: 'Neues Hauptthema' });
  if (!name) return;
  try {
    await fs.createMainCategory(name);
    await refreshAll();
  } catch (err) {
    await showMessageDialog({ title: 'Hauptkategorie konnte nicht angelegt werden', message: err.message });
  }
}

// ---------------------------------------------------------------------------
// Neue Unterkategorie — fragt nach der Hauptkategorie, wenn es mehr als eine gibt.
// ---------------------------------------------------------------------------
async function createSubCategoryFlow() {
  const mainCategories = collectMainCategories(state.tree);
  if (mainCategories.length === 0) {
    await showMessageDialog({
      title: 'Hauptkategorie erforderlich',
      message: 'Lege zuerst eine Hauptkategorie an. Danach kannst du darin eine Unterkategorie erstellen.'
    });
    return;
  }
  const mainCategoryRelPath = mainCategories.length === 1
    ? mainCategories[0].relPath
    : await showCategoryPickerModal(mainCategories, 'In welcher Hauptkategorie?');
  if (!mainCategoryRelPath) return;

  const name = await showPromptModal({ title: 'Name der neuen Unterkategorie', defaultValue: 'Neues Unterthema' });
  if (!name) return;
  try {
    await fs.createSubCategory(mainCategoryRelPath, name);
    await refreshAll();
  } catch (err) {
    await showMessageDialog({ title: 'Unterkategorie konnte nicht angelegt werden', message: err.message });
  }
}

// ---------------------------------------------------------------------------
// Segment-Control "Haupt/Unter" — ersetzt den vorherigen zusammengeführten
// Button samt Auswahl-Popup. Beide Segmente sind jetzt direkt sichtbar und
// lösen ihren jeweiligen (unveränderten) Anlegen-Ablauf sofort aus; die
// zuletzt genutzte Seite bleibt optisch als "aktiv" (Akzentfarbe) markiert.
// ---------------------------------------------------------------------------
function setActiveSegment(type) {
  els.segAddMain.classList.toggle('active', type === 'main');
  els.segAddSub.classList.toggle('active', type === 'sub');
}

els.segAddMain.addEventListener('click', async () => {
  setActiveSegment('main');
  await createMainCategoryFlow();
});

els.segAddSub.addEventListener('click', async () => {
  setActiveSegment('sub');
  await createSubCategoryFlow();
});

setActiveSegment('sub'); // Default: Unterkategorie ist die häufiger genutzte Aktion (Notizen brauchen sie)

// ---------------------------------------------------------------------------
// Neue Notiz (global, oben in der Sidebar) — strikte 3-Ebenen-Regel:
// Notizen dürfen NUR in einer Unterkategorie liegen, nie direkt in einer
// Hauptkategorie.
// ---------------------------------------------------------------------------
const NOTE_TEMPLATES = [
  { key: 'leer', label: 'Leer', body: '# {title}\n\n' },
  {
    key: 'setup', label: 'Setup-Anleitung',
    body: '# {title}\n\n> [!abstract] Zusammenfassung\n> Kurz worum es geht.\n\n## Voraussetzungen\n\n- \n\n## Schritte\n\n1. \n2. \n\n## Troubleshooting\n\n- **Problem:** \n  **Lösung:** \n'
  },
  {
    key: 'problem', label: 'Problemlösung',
    body: '# {title}\n\n> [!warning] Problem\n> Was genau geht nicht?\n\n## Ursache\n\n\n## Lösung\n\n\n## Quelle/Links\n\n- \n'
  },
  {
    key: 'checkliste', label: 'Checkliste',
    body: '# {title}\n\n- [ ] \n- [ ] \n- [ ] \n'
  }
];

function showTemplatePickerModal() {
  return new Promise((resolve) => {
    closeManagedDialogs('.prompt-overlay', { restoreFocus: false });
    let customTemplates = Array.isArray(state.project?.config?.customTemplates)
      ? state.project.config.customTemplates.map(template => ({ ...template }))
      : [];
    const overlay = document.createElement('div');
    overlay.className = 'prompt-overlay';
    overlay.innerHTML = `
      <div class="prompt-modal">
        <div class="prompt-title">Vorlage wählen</div>
        <div class="template-picker-list">
          ${NOTE_TEMPLATES.map(t => `<button type="button" class="template-picker-btn" data-key="${t.key}">${escapeHtml(t.label)}</button>`).join('')}
        </div>
        <div class="template-picker-custom-area"></div>
        <div class="prompt-actions">
          <button type="button" class="btn" data-action="cancel">Abbrechen</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const customArea = overlay.querySelector('.template-picker-custom-area');
    let done = false;
    function close(value) { if (done) return; done = true; dialogController.destroy(); resolve(value); }
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => close(null));
    overlay.querySelectorAll('.template-picker-btn[data-key]').forEach(btn => {
      btn.addEventListener('click', () => close(NOTE_TEMPLATES.find(t => t.key === btn.dataset.key)));
    });

    // Eigene Vorlagen in einem eigenen Bereich neu aufbauen — eigene Funktion,
    // damit Umbenennen/Löschen die Liste direkt im selben Fenster aktualisieren
    // können, ohne das Fenster verschachtelt schließen/neu öffnen zu müssen.
    function renderCustomArea() {
      if (!customTemplates.length) { customArea.innerHTML = ''; return; }
      customArea.innerHTML = `
        <div class="template-picker-divider">Eigene Vorlagen</div>
        <div class="template-picker-list">
          ${customTemplates.map(t => `
            <div class="template-picker-row">
              <button type="button" class="template-picker-btn" data-custom-key="${escapeHtml(t.key)}">${escapeHtml(t.label)}</button>
              <button type="button" class="icon-btn small" data-rename-key="${escapeHtml(t.key)}" title="Umbenennen">✎</button>
              <button type="button" class="icon-btn small" data-delete-key="${escapeHtml(t.key)}" title="Löschen" aria-label="Vorlage löschen">✕</button>
            </div>`).join('')}
        </div>`;
      customArea.querySelectorAll('.template-picker-btn[data-custom-key]').forEach(btn => {
        btn.addEventListener('click', () => close(customTemplates.find(t => t.key === btn.dataset.customKey)));
      });
      customArea.querySelectorAll('[data-rename-key]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const tmpl = customTemplates.find(t => t.key === btn.dataset.renameKey);
          const newLabel = await showPromptModal({ title: 'Vorlage umbenennen', defaultValue: tmpl.label });
          if (!newLabel || newLabel === tmpl.label) return;
          tmpl.label = newLabel;
          await fs.setProjectSetting('customTemplates', customTemplates);
          renderCustomArea();
        });
      });
      customArea.querySelectorAll('[data-delete-key]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!await showConfirmDialog({
            title: 'Vorlage löschen?',
            message: 'Diese eigene Vorlage wird dauerhaft entfernt.',
            confirmLabel: 'Löschen',
            danger: true
          })) return;
          customTemplates = customTemplates.filter(t => t.key !== btn.dataset.deleteKey);
          await fs.setProjectSetting('customTemplates', customTemplates);
          renderCustomArea();
        });
      });
    }
    renderCustomArea();
    const dialogController = manageModalDialog({
      overlay,
      dialog: overlay.querySelector('.prompt-modal'),
      initialFocus: overlay.querySelector('.template-picker-btn'),
      onRequestClose: () => close(null),
      closeOnBackdrop: false,
      enterActivatesPrimary: false
    });
  });
}

// Speichert den AKTUELLEN Inhalt der offenen Notiz als eigene, wiederverwend-
// bare Vorlage. Bewusst als reine Kopie zum Zeitpunkt des Speicherns — spätere
// Änderungen an dieser (oder jeder anderen) Notiz wirken sich NIE auf die
// einmal gespeicherte Vorlage aus, da hier nur der Text-Inhalt selbst
// (nicht etwa ein Verweis auf die Notiz-Datei) übernommen wird. Persistiert
// über denselben generischen fs.setProjectSetting-Mechanismus wie alle
// anderen nachträglich änderbaren Projekt-Einstellungen.
async function saveNoteAsTemplate() {
  const name = await showPromptModal({ title: 'Name der neuen Vorlage', defaultValue: '' });
  if (!name) return;
  const body = getEditorContent();
  const customTemplates = Array.isArray(state.project?.config?.customTemplates) ? [...state.project.config.customTemplates] : [];
  const key = 'custom-' + Date.now().toString(36);
  customTemplates.push({ key, label: name, body, custom: true });
  await fs.setProjectSetting('customTemplates', customTemplates);
}

els.btnAddNote.addEventListener('click', async () => {
  const subCategories = collectSubCategories(state.tree);
  if (subCategories.length === 0) {
    await showMessageDialog({
      title: 'Unterkategorie erforderlich',
      message: 'Lege zuerst eine Unterkategorie an. Danach kannst du darin eine Notiz erstellen.'
    });
    return;
  }
  const targetRelPath = subCategories.length === 1
    ? subCategories[0].relPath
    : await showCategoryPickerModal(subCategories, 'In welcher Unterkategorie?');
  if (!targetRelPath) return;

  const title = await showPromptModal({ title: 'Titel der neuen Notiz', defaultValue: 'Neue Notiz' });
  if (!title) return;

  const template = await showTemplatePickerModal();
  if (!template) return; // Abbrechen im Vorlagen-Dialog bricht das Anlegen komplett ab

  try {
    const created = await fs.createNote(targetRelPath, title, template.body);
    await refreshAll();
    void navigateTo('#note/' + encodeURIComponent(created.relPath));
  } catch (err) {
    await showMessageDialog({ title: 'Notiz konnte nicht angelegt werden', message: err.message });
    console.error('[Archiv Wiki] fs.createNote fehlgeschlagen für Ziel', targetRelPath, err);
  }
});

function showCategoryPickerModal(categories, title = 'In welcher Kategorie?') {
  return new Promise((resolve) => {
    closeManagedDialogs('.prompt-overlay', { restoreFocus: false });
    const overlay = document.createElement('div');
    overlay.className = 'prompt-overlay';
    overlay.innerHTML = `
      <div class="prompt-modal">
        <div class="prompt-title">${escapeHtml(title)}</div>
        <select class="prompt-input">
          ${categories.map(c => `<option value="${escapeHtml(c.relPath)}">${escapeHtml(c.label)}</option>`).join('')}
        </select>
        <div class="prompt-actions">
          <button type="button" class="btn" data-action="cancel">Abbrechen</button>
          <button type="button" class="btn primary" data-action="ok">Weiter</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const select = overlay.querySelector('select');
    let done = false;
    function close(value) { if (done) return; done = true; dialogController.destroy(); resolve(value); }
    const okButton = overlay.querySelector('[data-action="ok"]');
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => close(null));
    okButton.addEventListener('click', () => close(select.value));
    const dialogController = manageModalDialog({
      overlay,
      dialog: overlay.querySelector('.prompt-modal'),
      initialFocus: select,
      primaryAction: okButton,
      enterActivatesPrimary: true,
      onRequestClose: () => close(null),
      closeOnBackdrop: false
    });
  });
}

// ---------------------------------------------------------------------------
// Sidebar-Suche — echte Volltextsuche über Titel, Inhalt UND Tags via
// FlexSearch (siehe search.js), nicht mehr nur sichtbarer Zeilentext im Baum.
// (Der frühere, reine Baum-Filter-Mechanismus wurde entfernt — er rief zwei
// nicht mehr existierende Funktionen auf und warf dadurch bei jeder Eingabe
// einen stillen Fehler. Der untenstehende Dropdown-Mechanismus deckt die
// Aufgabe bereits vollständig ab, siehe auch dessen eigener Kommentar weiter
// unten.)
// ---------------------------------------------------------------------------
els.searchClear.addEventListener('click', () => {
  els.navSearch.value = '';
  els.navSearch.dispatchEvent(new Event('input', { bubbles: true }));
  els.navSearch.focus();
});

// Header-Suche: eigenständiges Ergebnis-Dropdown mit Titel/Kategorie/Tags/
// Ausschnitt — ersetzt den bisherigen reinen Baum-Filter (siehe Absprache:
// zwei parallele Mechanismen für dieselbe Aufgabe wären weniger übersichtlich,
// nicht mehr). Bewusst GETRENNT von der Editor-internen Suche (CodeMirror
// @codemirror/search, siehe build/editor-entry.js) — die Header-Suche
// durchsucht das GESAMTE Wiki, die Editor-Suche nur die gerade offene Notiz.
let searchDropdownIndex = -1;
let currentSearchResults = [];

function normalizeHighlightText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('de');
}

// Hebt sichtbare Treffer Unicode-tolerant hervor, ohne die Suchlogik oder
// Trefferreihenfolge zu verändern. Dadurch bleibt z. B. "uber" in "Über"
// nachvollziehbar. HTML wird abschnittsweise escaped, bevor <mark> ergänzt wird.
function highlightTerm(text, query) {
  const source = String(text ?? '');
  const normalizedQuery = normalizeHighlightText(query).trim();
  if (!source || !normalizedQuery) return escapeHtml(source);

  let normalizedText = '';
  const starts = [];
  const ends = [];
  let sourceOffset = 0;

  for (const char of source) {
    const charStart = sourceOffset;
    sourceOffset += char.length;
    const normalizedChar = normalizeHighlightText(char);

    // Bei bereits zerlegten Unicode-Zeichen (z. B. "u" + kombinierter
    // Umlaut) entfernt die Normalisierung das Kombinationszeichen. Es gehört
    // visuell dennoch zum vorherigen Buchstaben und muss in dessen Markierung
    // eingeschlossen bleiben. Andernfalls trennt <mark> den Graphem-Cluster
    // und Chromium zeichnet das lose Zeichen über einem zweiten Glyphen.
    if (!normalizedChar) {
      for (let i = ends.length - 1; i >= 0 && ends[i] === charStart; i -= 1) {
        ends[i] = sourceOffset;
      }
      continue;
    }

    for (const normalizedPart of normalizedChar) {
      normalizedText += normalizedPart;
      starts.push(charStart);
      ends.push(sourceOffset);
    }
  }

  const ranges = [];
  let searchFrom = 0;
  while (searchFrom < normalizedText.length) {
    const normalizedOffset = normalizedText.indexOf(normalizedQuery, searchFrom);
    if (normalizedOffset < 0) break;
    const normalizedEnd = normalizedOffset + normalizedQuery.length - 1;
    const start = starts[normalizedOffset];
    const end = ends[normalizedEnd];
    const previous = ranges.at(-1);
    if (!previous || start >= previous.end) ranges.push({ start, end });
    searchFrom = normalizedOffset + normalizedQuery.length;
  }

  if (ranges.length === 0) return escapeHtml(source);

  let html = '';
  let offset = 0;
  for (const range of ranges) {
    html += escapeHtml(source.slice(offset, range.start));
    html += `<mark>${escapeHtml(source.slice(range.start, range.end))}</mark>`;
    offset = range.end;
  }
  return html + escapeHtml(source.slice(offset));
}


let searchDropdownOpen = false;

function setSearchDropdownExpanded(expanded) {
  els.navSearch.setAttribute('aria-expanded', String(expanded));
  if (!expanded) els.navSearch.removeAttribute('aria-activedescendant');
}

function renderSearchDropdown(query) {
  const searchState = getSearchState();
  currentSearchResults = [];
  searchDropdownIndex = -1;
  els.navSearch.removeAttribute('aria-activedescendant');
  els.searchDropdown.removeAttribute('aria-busy');

  if (searchState === 'loading') {
    els.searchDropdown.setAttribute('aria-busy', 'true');
    els.searchDropdown.innerHTML = '<div class="search-dropdown-empty" role="status">Suchindex wird vorbereitet …</div>';
  } else if (searchState === 'error') {
    els.searchDropdown.innerHTML = '<div class="search-dropdown-empty" role="status">Die Suche konnte nicht vorbereitet werden.</div>';
  } else {
    const detailedResults = searchWithDetails(query);
    currentSearchResults = detailedResults.results;
    if (currentSearchResults.length === 0) {
      els.searchDropdown.innerHTML = `<div class="search-dropdown-empty" role="status">Keine Treffer für „${escapeHtml(query)}“</div>`;
    } else {
      const resultHtml = currentSearchResults.map((r, i) => `
        <button type="button" class="search-result" id="search-option-${i}" role="option" aria-selected="false" tabindex="-1" data-index="${i}">
          <div class="search-result-head">
            <span class="search-result-title"><span class="search-result-icon">${renderIconHtml(r.icon, 'docs/file-text')}</span><span>${highlightTerm(r.title, query)}</span></span>
            ${r.categoryPath ? `<span class="search-result-category" title="${escapeHtml(r.categoryPath)}">${highlightTerm(r.categoryPath, query)}</span>` : ''}
          </div>
          ${r.tags.length ? `<div class="search-result-tags">${r.tags.map(t => `<span class="search-result-tag">${highlightTerm(t, query)}</span>`).join('')}</div>` : ''}
          ${r.snippet ? `<div class="search-result-snippet">${highlightTerm(r.snippet, query)}</div>` : ''}
        </button>
      `).join('');
      const limitHtml = detailedResults.hasMore
        ? '<div class="search-results-limit" role="status">Weitere Treffer vorhanden – die ersten 30 werden angezeigt.</div>'
        : '';
      els.searchDropdown.innerHTML = resultHtml + limitHtml;
    }
  }
  els.searchDropdown.style.display = 'block';
  setSearchDropdownExpanded(true);
  if (!searchDropdownOpen) {
    searchDropdownOpen = true;
    animateIn(els.searchDropdown);
  } else {
    // War schon offen (z. B. beim Tippen des nächsten Zeichens) — sicherstellen,
    // dass eine evtl. noch laufende Ausblend-Animation (siehe closeSearchDropdown)
    // nicht in einem halbtransparenten Zwischenzustand hängen bleibt.
    els.searchDropdown.style.opacity = '1';
    els.searchDropdown.style.transform = 'translateY(0)';
  }
}

function refreshSearchDropdownForCurrentQuery() {
  const query = els.navSearch.value.trim();
  if (query) renderSearchDropdown(query);
}

function closeSearchDropdown() {
  if (!searchDropdownOpen) return;
  searchDropdownOpen = false;
  setSearchDropdownExpanded(false);
  animateOut(els.searchDropdown, () => {
    els.searchDropdown.style.display = 'none';
    els.searchDropdown.innerHTML = '';
  });
  searchDropdownIndex = -1;
}

function updateSearchDropdownActive({ keepVisible = false } = {}) {
  const options = [...els.searchDropdown.querySelectorAll('.search-result')];
  let activeOption = null;
  options.forEach((btn, i) => {
    const active = i === searchDropdownIndex;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
    if (active) activeOption = btn;
  });

  if (activeOption) {
    els.navSearch.setAttribute('aria-activedescendant', activeOption.id);
    if (keepVisible) activeOption.scrollIntoView({ block: 'nearest' });
  } else {
    els.navSearch.removeAttribute('aria-activedescendant');
  }
}

// Wartet kurz darauf, dass die Ziel-Notiz tatsächlich offen ist (Navigation
// über location.hash ist asynchron), bevor zur Fundstelle gesprungen wird.
async function waitForNoteOpen(relPath, timeoutMs = 2000) {
  const start = Date.now();
  while (getOpenRelPath() !== relPath && Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 30));
  }
}

async function openSearchResult(result, query) {
  closeSearchDropdown();
  els.navSearch.value = '';
  els.navSearch.parentElement.classList.remove('has-value');
  const navigated = await navigateTo('#note/' + encodeURIComponent(result.relPath));
  if (!navigated) return;
  await waitForNoteOpen(result.relPath);
  jumpToMatchInEditor(query);
}

els.navSearch.addEventListener('input', () => {
  const q = els.navSearch.value.trim();
  els.navSearch.parentElement.classList.toggle('has-value', els.navSearch.value.length > 0);
  if (!q) { closeSearchDropdown(); return; }
  renderSearchDropdown(q);
});

els.navSearch.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && searchDropdownOpen) {
    e.preventDefault();
    e.stopPropagation();
    closeSearchDropdown();
    return;
  }

  if (!searchDropdownOpen || currentSearchResults.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    searchDropdownIndex = Math.min(searchDropdownIndex + 1, currentSearchResults.length - 1);
    updateSearchDropdownActive({ keepVisible: true });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    searchDropdownIndex = searchDropdownIndex <= 0
      ? 0
      : searchDropdownIndex - 1;
    updateSearchDropdownActive({ keepVisible: true });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const target = currentSearchResults[searchDropdownIndex >= 0 ? searchDropdownIndex : 0];
    if (target) openSearchResult(target, els.navSearch.value.trim());
  }
});

// Der Fokus bleibt nach dem ARIA-Combobox-Muster im Suchfeld. Die Treffer
// selbst sind nicht Teil der Tab-Reihenfolge; Mausaktivierung läuft über den
// regulären Click-Pfad, während Pfeiltasten + Enter den internen Auswahlindex
// und aria-activedescendant gemeinsam steuern.
els.searchDropdown.addEventListener('mousedown', (e) => {
  if (e.target.closest('.search-result')) e.preventDefault();
});

els.searchDropdown.addEventListener('click', (e) => {
  const btn = e.target.closest('.search-result');
  if (!btn) return;
  const result = currentSearchResults[Number(btn.dataset.index)];
  if (result) openSearchResult(result, els.navSearch.value.trim());
});

document.addEventListener('click', (e) => {
  if (!els.navSearch.parentElement.contains(e.target) && !els.searchDropdown.contains(e.target)) closeSearchDropdown();
});

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); els.navSearch.focus(); els.navSearch.select(); }
  else if (mod && e.key.toLowerCase() === 'b' && getOpenRelPath()) { e.preventDefault(); cycleViewMode(); }
  else if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (currentSlug().startsWith('incoming-draft/')) saveIncomingNoteDraft();
    else saveNow(currentOnSaved, currentOnSaveError);
  }
  else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && getOpenRelPath()) {
    e.preventDefault(); jumpToAdjacentNote(e.key === 'ArrowRight' ? 1 : -1);
  }
  else if (e.key === '?' && !mod && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) && !document.activeElement?.closest('.cm-editor')) {
    e.preventDefault(); showShortcutsCheatsheet();
  }
  else if (mod && e.shiftKey && e.key.toLowerCase() === 'f' && getOpenRelPath()) {
    if (isFocusModeShortcutBlocked()) return;
    e.preventDefault();
    const fromToolbar = Boolean(document.activeElement?.closest?.('.note-toolbar'));
    toggleFocusMode({ focusWorkArea: fromToolbar });
  }
  else if (e.key === 'Escape' && document.body.classList.contains('focus-mode')) { e.preventDefault(); toggleFocusMode(); }
});

function isFocusModeShortcutBlocked() {
  const managedDialogOpen = Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
  return managedDialogOpen || searchDropdownOpen || Boolean(activeHtmlContextMenu);
}

function focusCurrentWritingArea() {
  if (!getOpenRelPath()) return;
  if (state.viewMode === 'preview') {
    document.getElementById('previewContainer')?.focus({ preventScroll: true });
    return;
  }
  focusEditor();
}

// Fokus-Modus (editorgebundene Konzentrationsansicht, siehe CSS
// body.focus-mode-Regeln in layout.css): Sidebar/Kopfzeile/Werkzeugleiste/
// Statuszeile bleiben vollständig sichtbar und bedienbar, damit die
// Orientierung in der App erhalten bleibt. Der Ein/Aus-Zustand wird bewusst
// nicht gespeichert; jeder Programmstart beginnt wieder normal.
function toggleFocusMode({ focusWorkArea = false } = {}) {
  const activating = !document.body.classList.contains('focus-mode');

  // Der Fokusmodus beginnt bewusst in der reinen Editoransicht. Dieser
  // temporäre Ansichtswechsel wird nicht in der Projektkonfiguration
  // gespeichert; danach bleiben Editor, Split und Vorschau frei umschaltbar.
  if (activating && state.viewMode !== 'editor') {
    state.viewMode = 'editor';
    applyViewMode();
  }

  setFocusMode(activating);
  if (focusWorkArea) focusCurrentWritingArea();
}

const SHORTCUT_SECTIONS = [
  {
    title: 'Allgemein',
    items: [
      { keys: 'Strg/Cmd + K', desc: 'Suche fokussieren' },
      { keys: '?', desc: 'Diesen Spickzettel anzeigen' },
      { keys: 'Esc', desc: 'Offenes Fenster/Menü/Dropdown schließen' },
    ]
  },
  {
    title: 'Notiz & Editor',
    items: [
      { keys: 'Strg/Cmd + S', desc: 'Notiz speichern' },
      { keys: 'Strg/Cmd + B', desc: 'Ansicht wechseln (Editor/Split/Vorschau)' },
      { keys: 'Alt + ← / →', desc: 'Zur vorherigen/nächsten Notiz springen' },
      { keys: 'F3', desc: 'Nächster Suchtreffer in der offenen Notiz' },
      { keys: 'Umschalt + F3', desc: 'Vorheriger Suchtreffer in der offenen Notiz' },
      { keys: 'Strg/Cmd + Umschalt + F', desc: 'Fokus-Modus umschalten' },
    ]
  },
  {
    title: 'In der Suche',
    items: [
      { keys: '↑ / ↓', desc: 'Durch die Suchergebnisse navigieren' },
      { keys: 'Enter', desc: 'Markiertes Suchergebnis öffnen' },
    ]
  }
];

let shortcutsDialogInstance = null;

function showShortcutsCheatsheet() {
  // Die Tastenkürzelübersicht ist ein Singleton: Alle Einstiegspunkte öffnen
  // dieselbe Instanz. Ist sie bereits sichtbar, wird sie nur nach vorn geholt
  // und fokussiert statt erneut erzeugt.
  if (shortcutsDialogInstance?.overlay?.isConnected) {
    const { overlay, closeButton } = shortcutsDialogInstance;
    overlay.classList.add('shortcuts-overlay');
    overlay.inert = false;
    overlay.removeAttribute('aria-hidden');
    requestAnimationFrame(() => closeButton?.focus({ preventScroll: true }));
    return;
  }

  closeManagedDialogs('.prompt-overlay', { restoreFocus: false });
  const overlay = document.createElement('div');
  overlay.className = 'prompt-overlay shortcuts-overlay';
  overlay.innerHTML = `
    <div class="prompt-modal">
      <div class="prompt-title"><img class="lib-icon dialog-title-icon" src="assets/icon-library/hardware/keyboard.svg" alt="">Tastenkürzel<button type="button" class="modal-close-x" data-action="close-x" title="Schließen" aria-label="Schließen">✕</button></div>
      <div class="shortcuts-list">
        ${SHORTCUT_SECTIONS.map(section => `
          <div class="shortcut-section-label">${escapeHtml(section.title)}</div>
          ${section.items.map(s => `<div class="shortcut-row"><kbd>${escapeHtml(s.keys)}</kbd><span>${escapeHtml(s.desc)}</span></div>`).join('')}
        `).join('')}
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const closeButton = overlay.querySelector('[data-action="close-x"]');
  let dialogController = null;
  function close() {
    dialogController?.destroy();
    shortcutsDialogInstance = null;
  }
  closeButton.addEventListener('click', close);
  dialogController = manageModalDialog({
    overlay,
    dialog: overlay.querySelector('.prompt-modal'),
    initialFocus: closeButton,
    onRequestClose: close,
    closeOnBackdrop: false
  });
  shortcutsDialogInstance = { overlay, closeButton, dialogController };
}

function cycleViewMode() {
  const order = ['split', 'editor', 'preview'];
  state.viewMode = order[(order.indexOf(state.viewMode) + 1) % order.length];
  applyViewMode();
  fs.setProjectSetting('viewMode', state.viewMode).catch(() => {});
}

function jumpToAdjacentNote(dir) {
  const notes = fs.flattenNotes(state.tree);
  const idx = notes.findIndex(n => n.relPath === getOpenRelPath());
  if (idx === -1) return;
  const next = notes[(idx + dir + notes.length) % notes.length];
  void navigateTo('#note/' + encodeURIComponent(next.relPath));
}

let currentOnSaved = () => {};
let currentOnSaveError = () => {};

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------
let renderedHash = normalizeRouteHash(location.hash);
let pendingNavigationRequest = null;
let navigationProcess = null;
let entryPathMutationPromise = null;

function entryMutationAffectsOpenNote(sourceRelPath, openRelPath) {
  return Boolean(openRelPath && (
    openRelPath === sourceRelPath
    || openRelPath.startsWith(sourceRelPath + '/')
  ));
}

function relocatedOpenNotePath(openRelPath, sourceRelPath, mutatedRelPath) {
  return mutatedRelPath + openRelPath.slice(sourceRelPath.length);
}

async function performEntryPathMutation({ sourceRelPath, actionLabel, mutate, afterMutation }) {
  const openRelPath = getOpenRelPath();
  const affectsOpenNote = entryMutationAffectsOpenNote(sourceRelPath, openRelPath);
  let editorLocked = false;

  if (affectsOpenNote) {
    const saved = await saveUntilClean(currentOnSaved, currentOnSaveError);
    if (!saved || getOpenRelPath() !== openRelPath) return null;
    // Erst NACH der vollständig sauberen M-02-Save-Kette sperren. Eingaben,
    // die während des vorbereitenden Saves erfolgen, werden damit weiterhin
    // von saveUntilClean() erfasst; während der eigentlichen kurzen Mutation
    // kann dagegen kein neuer Editorstand mehr auf dem alten Pfad entstehen.
    els.contentScroll.inert = true;
    editorLocked = true;
  }

  try {
    let result;
    try {
      result = await mutate();
    } catch (error) {
      await showMessageDialog({
        title: `${actionLabel} fehlgeschlagen`,
        message: error?.message || 'Die Dateioperation konnte nicht abgeschlossen werden.'
      });
      return null;
    }

    if (!result?.relPath) return null;

    if (affectsOpenNote) {
      const nextOpenRelPath = relocatedOpenNotePath(openRelPath, sourceRelPath, result.relPath);
      if (!retargetOpenNote(openRelPath, nextOpenRelPath)) {
        throw new Error('Die offene Notiz konnte nach der Dateioperation nicht auf ihren neuen Pfad umgestellt werden.');
      }
      // Dieselbe logische Notiz erhält nur eine neue Identität. replaceState
      // verhindert, dass der inzwischen ungültige alte Pfad im Zurück-Verlauf
      // verbleibt. Erst nach erfolgreicher Mutation wird die Route verändert.
      const targetHash = normalizeRouteHash('#note/' + encodeURIComponent(nextOpenRelPath));
      history.replaceState(history.state, '', targetHash);
      renderedHash = targetHash;
    }

    if (afterMutation) {
      try {
        await afterMutation(result);
      } catch (error) {
        await showMessageDialog({
          title: 'Reihenfolge konnte nicht gespeichert werden',
          message: error?.message || 'Der Eintrag wurde verschoben, seine neue Reihenfolge aber nicht gespeichert.'
        });
      }
    }

    await refreshAll();
    if (affectsOpenNote) await render();
    return result;
  } finally {
    if (editorLocked) els.contentScroll.inert = false;
  }
}

function mutateEntryPath(options) {
  if (entryPathMutationPromise) {
    showQuickFeedback('Eine Dateioperation läuft bereits.');
    return Promise.resolve(null);
  }

  const operation = performEntryPathMutation(options);
  entryPathMutationPromise = operation;
  return operation.finally(() => {
    if (entryPathMutationPromise === operation) entryPathMutationPromise = null;
  });
}

async function canLeaveCurrentRoute() {
  if (entryPathMutationPromise) await entryPathMutationPromise;
  const renderedSlug = slugFromHash(renderedHash);
  if (renderedSlug.startsWith('incoming-draft/')) {
    const incomingId = renderedSlug.slice('incoming-draft/'.length);
    const draft = state.incomingNoteDraft;
    if (draft?.incomingId === incomingId && draft.hasUnsavedChanges) {
      const discard = await showConfirmDialog({
        title: 'Bearbeiteten Eingangsentwurf verlassen?',
        message: 'Die Änderungen an diesem noch nicht gespeicherten Entwurf werden verworfen.',
        confirmLabel: 'Entwurf verwerfen',
        cancelLabel: 'Hier bleiben',
        danger: true
      });
      if (!discard) return false;
    }
    if (draft?.incomingId === incomingId) {
      closeEditor();
      state.incomingNoteDraft = null;
    }
    return true;
  }

  if (!getOpenRelPath() || !isDirty()) return true;
  return saveUntilClean(currentOnSaved, currentOnSaveError);
}

async function commitNavigation({ targetHash, replace }) {
  if (replace) history.replaceState(history.state, '', targetHash);
  else history.pushState(history.state, '', targetHash);
  await render();
}

// Dateioperationen, die den Pfad der offenen Notiz bereits verändert oder
// entfernt haben, gehören zum separaten M-04-Lifecycle. Ihre bestehende
// Folgeroute darf deshalb nicht nachträglich einen Save auf den alten Pfad
// anstoßen; sie nutzt nur denselben zentralen Route-Commit ohne Leave-Prüfung.
function navigateAfterEntryMutation(hash, { replace = false } = {}) {
  return commitNavigation({ targetHash: normalizeRouteHash(hash), replace });
}

async function processPendingNavigation() {
  while (pendingNavigationRequest) {
    let request = pendingNavigationRequest;
    pendingNavigationRequest = null;

    if (!await canLeaveCurrentRoute()) {
      pendingNavigationRequest = null;
      return;
    }

    // Während Save oder Entwurfsdialog gilt der zuletzt angeforderte Zielort.
    if (pendingNavigationRequest) {
      request = pendingNavigationRequest;
      pendingNavigationRequest = null;
    }
    if (request.targetHash !== renderedHash) await commitNavigation(request);
  }
}

function navigateTo(hash, { replace = false } = {}) {
  const targetHash = normalizeRouteHash(hash);
  if (targetHash === renderedHash && !navigationProcess) return Promise.resolve(true);

  pendingNavigationRequest = { targetHash, replace };
  if (!navigationProcess) {
    navigationProcess = processPendingNavigation().finally(() => {
      navigationProcess = null;
    });
  }
  return navigationProcess.then(() => renderedHash === targetHash);
}

// Zurück/Vor oder eine direkte Hash-Zuweisung ändern die URL bereits vor dem
// Ereignis. Die noch sichtbare Route wird deshalb ohne neues Ereignis sofort
// wieder eingesetzt; erst der zentrale Leave-Vertrag übernimmt das Ziel.
function handleExternalRouteChange() {
  const targetHash = normalizeRouteHash(location.hash);
  if (targetHash === renderedHash) return;
  history.replaceState(history.state, '', renderedHash);
  void navigateTo(targetHash, { replace: true });
}

window.addEventListener('popstate', handleExternalRouteChange);
window.addEventListener('hashchange', handleExternalRouteChange);

async function render() {
  renderedHash = normalizeRouteHash(location.hash);
  // Scrollposition der bisher offenen Notiz merken (Nutzer-Feature) —
  // GANZ AM ANFANG, bevor irgendein neuer Inhalt aufgebaut wird.
  // getOpenRelPath() zeigt hier noch den alten Wert, da er erst später
  // (in openNoteInEditor) auf das neue Ziel überschrieben wird. Dieselbe
  // Speicher-Mechanik wie bei Split-Breite/Ansichtsmodus (ein Schlüssel in
  // derselben Projekt-Config), hier als Objekt mit einem Eintrag pro Notiz
  // statt eines einzigen Werts.
  const outgoingRelPath = getOpenRelPath();
  if (outgoingRelPath) {
    const editorScrollEl = document.querySelector('.cm-scroller');
    const previewScrollEl = document.getElementById('previewContainer');
    if (editorScrollEl || previewScrollEl) {
      const positions = { ...(state.project?.config?.noteScrollPositions || {}) };
      positions[outgoingRelPath] = {
        editor: editorScrollEl ? editorScrollEl.scrollTop : 0,
        preview: previewScrollEl ? previewScrollEl.scrollTop : 0
      };
      fs.setProjectSetting('noteScrollPositions', positions).catch(() => {});
    }
  }

  closeSidebar();
  els.topbarNoteDates.textContent = ''; // wird von renderNote() neu befüllt, falls eine Notiz offen ist
  const slug = currentSlug();

  // Der Fokus-Modus ist bewusst editorgebunden. Sobald eine Route ohne offene
  // Notiz aufgerufen wird, beendet ausschließlich die zentrale Funktion den
  // Modus und stellt Body sowie sichtbare Schalter wieder auf den normalen
  // Zustand zurück.
  if (!slug.startsWith('note/')) {
    setFocusMode(false);
  }

  if (slug === 'home') return await renderHome();
  if (slug === 'incoming') return await renderIncoming();
  if (slug.startsWith('incoming-draft/')) return await renderIncomingNoteDraft(slug.slice('incoming-draft/'.length));
  if (slug.startsWith('incoming/')) return await renderIncomingEntry(slug.slice('incoming/'.length));
  if (slug === 'knowledge-care') return renderKnowledgeCare();
  if (slug === 'trash') return renderTrash();
  if (slug === 'tags') return await renderTagsOverview(null);
  if (slug.startsWith('tags/')) return await renderTagsOverview(decodeURIComponent(slug.slice('tags/'.length)));
  if (slug === 'stats') return await renderStatsPage();
  if (slug.startsWith('note/')) return renderNote(decodeURIComponent(slug.slice('note/'.length)));
  return await renderHome();
}

function setBreadcrumb(text) { els.breadcrumb.textContent = text; }
// Klappt alle übergeordneten Kategorien einer Notiz auf, falls sie gerade
// eingeklappt sind — unabhängig von der "Kategorien beim Start"-Einstellung,
// die nur den Zustand beim Programmstart bestimmt, nicht das Verhalten beim
// Navigieren zu einer Notiz währenddessen (Nutzer-Anforderung).
// Liefert alle Vorfahren-Kategorie-Pfade einer Notiz, von der obersten
// Hauptkategorie bis zur direkten Elternkategorie (kumulativ aufgebaut).
// Gemeinsam genutzt vom Aufklappen UND der Aktiv-Markierung weiter unten —
// keine doppelte Pfad-Aufbau-Logik an zwei Stellen.
function getAncestorPaths(relPath) {
  if (!relPath) return [];
  const parts = relPath.split('/');
  parts.pop(); // letztes Segment ist die Notiz-Datei selbst, keine Kategorie
  const paths = [];
  let cumulative = '';
  for (const part of parts) {
    cumulative = cumulative ? `${cumulative}/${part}` : part;
    paths.push(cumulative);
  }
  return paths;
}

function expandAncestorGroups(relPath) {
  let changed = false;
  for (const cumulative of getAncestorPaths(relPath)) {
    if (state.collapsedGroups.delete(cumulative)) changed = true;
  }
  return changed;
}

// Aktive Kategorie (Nutzer-Feature): dezente Hervorhebung aller
// Vorfahren-Kategorien der aktuell geöffneten Notiz — von der Hauptkategorie
// bis zur direkten Elternkategorie. Bewusst zurückhaltender als die
// bestehende Notiz-Markierung selbst (die bleibt der eigentliche visuelle
// Fokus), dient hier nur als "hier befindest du dich"-Kontext.
function setActiveNav(relPath) {
  if (expandAncestorGroups(relPath)) renderNavTree();
  els.homeLink.classList.toggle('active', !relPath && currentSlug() === 'home');
  els.incomingLink.classList.toggle('active', currentSlug() === 'incoming' || currentSlug().startsWith('incoming/') || currentSlug().startsWith('incoming-draft/'));
  els.knowledgeCareLink.classList.toggle('active', currentSlug() === 'knowledge-care');
  els.navTree.querySelectorAll('.nav-link[data-relpath]').forEach(a => a.classList.toggle('active', a.dataset.relpath === relPath));
  const ancestorPaths = new Set(getAncestorPaths(relPath));
  els.navTree.querySelectorAll('.nav-group[data-relpath]').forEach(g => {
    g.classList.toggle('active-ancestor', ancestorPaths.has(g.dataset.relpath));
  });
}

// Findet die n-te "- [ ]"/"- [x]"-Checkbox im Markdown-Quelltext (n = idx,
// dieselbe Zählweise wie der taskCheckboxCounter im Preview-Renderer, siehe
// editor-entry.js) und setzt sie auf den gewünschten Zustand.
function setNthCheckboxInMarkdown(text, targetIndex, checked) {
  let count = -1;
  return text.replace(/^(\s*[-*+]\s+)\[([ xX])\]/gm, (match, prefix) => {
    count++;
    if (count !== targetIndex) return match;
    return `${prefix}[${checked ? 'x' : ' '}]`;
  });
}

// Bild-Größenanpassung per Ziehen: setzt/aktualisiert die Breite am Nten Bild
// in der Markdown-Quelle (Zählung in Dokumentreihenfolge, muss exakt zum
// data-img-index aus der Vorschau passen, siehe renderPreview in
// build/editor-entry.js). Erkennt sowohl reine ![alt](src)-Syntax (wird beim
// ersten Ziehen zu einem <img>-Tag mit Breite) als auch bereits vorhandene
// <img>-Tags (Breite wird dort nur aktualisiert statt neu gewrappt).
// Bild-Größe per Prozent-Auswahl: setzt/aktualisiert die Breite am Nten Bild
// in der Markdown-Quelle (Zählung in Dokumentreihenfolge, muss exakt zum
// data-img-index aus der Vorschau passen, siehe renderPreview in
// build/editor-entry.js). Nutzt CSS style="width:X%" statt des HTML-width-
// Attributs — Letzteres unterstützt laut Spezifikation zuverlässig nur
// Pixelwerte, keine Prozentangaben. Erkennt sowohl reine ![alt](src)-Syntax
// (wird bei der ersten Auswahl zu einem <img>-Tag mit Breite) als auch
// bereits vorhandene <img>-Tags (Breite wird dort nur aktualisiert).
function setNthImageWidthInMarkdown(text, targetIndex, widthPercent) {
  let count = -1;
  return text.replace(/!\[([^\]]*)\]\(([^)"]+)(?:\s+"[^"]*")?\)|<img\b([^>]*)>/g, (match, mdAlt, mdSrc, imgAttrs) => {
    count++;
    if (count !== targetIndex) return match;
    if (imgAttrs !== undefined) {
      // Rohes <img>-Tag aus einer VOR diesem Bugfix gespeicherten Notiz —
      // src/alt extrahieren und in die neue, standardkonforme Markdown-
      // Bildsyntax überführen, damit auch ältere Notizen beim nächsten
      // Größenwechsel automatisch mitwandern statt weiter als HTML-Block
      // aus dem Textfluss zu fallen.
      const srcMatch = imgAttrs.match(/\bsrc\s*=\s*"([^"]*)"/);
      const altMatch = imgAttrs.match(/\balt\s*=\s*"([^"]*)"/);
      return `![${altMatch ? altMatch[1] : ''}](${srcMatch ? srcMatch[1] : ''} "width:${widthPercent}%")`;
    }
    return `![${mdAlt}](${mdSrc} "width:${widthPercent}%")`;
  });
}

// Entfernt gängige Markdown-Syntax grob (für den Karten-Ausschnitt auf der
// Startseite — muss nicht perfekt sein, nur lesbar als Klartext-Vorschau).
// --- Eigenes Tabellen-Bearbeitungsfenster (Nutzer-Feature) ---
// Zerlegt eine einzelne "| a | b |"-Zeile in ihre Zellen (führendes/
// abschließendes Pipe optional, wie im Markdown-Standard üblich).
function splitTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
}

// Findet JEDE Markdown-Tabelle im Text (Kopfzeile + Ausrichtungs-Zeile +
// Datenzeilen, direkt aufeinanderfolgend) und liefert sie mit ihrer genauen
// Zeilen-Position — die Reihenfolge in diesem Array MUSS exakt zum
// data-table-index in der Vorschau passen (siehe renderPreview in
// build/editor-entry.js), da darüber die Zuordnung beim Bearbeiten läuft.
function parseMarkdownTables(text) {
  const lines = text.split('\n');
  const tables = [];
  const sepPattern = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].includes('|') || !sepPattern.test(lines[i + 1].trim())) continue;
    const headers = splitTableRow(lines[i]);
    const alignCells = splitTableRow(lines[i + 1]);
    const alignments = alignCells.map(c => {
      const left = c.startsWith(':'), right = c.endsWith(':');
      return left && right ? 'center' : right ? 'right' : left ? 'left' : '';
    });
    let end = i + 1;
    const rows = [];
    while (end + 1 < lines.length && lines[end + 1].includes('|') && lines[end + 1].trim()) {
      rows.push(splitTableRow(lines[end + 1]));
      end++;
    }
    tables.push({ startLine: i, endLine: end, headers, alignments, rows });
    i = end; // Suche hinter dieser Tabelle fortsetzen, nicht mitten in ihr
  }
  return tables;
}

// Baut aus der Datenstruktur wieder ordentlich ausgerichteten Markdown-Text —
// jede Spalte auf die Breite ihres längsten Inhalts gepolstert, wie es
// von Hand geschriebene Markdown-Tabellen üblicherweise auch sind.
function serializeMarkdownTable({ headers, alignments, rows }) {
  const widths = headers.map((h, c) => Math.max(3, h.length, ...rows.map(r => (r[c] || '').length)));
  const padCell = (text, w, align) => {
    const t = text || '';
    if (align === 'right') return t.padStart(w);
    if (align === 'center') { const total = w - t.length; const l = Math.floor(total / 2); return ' '.repeat(Math.max(0, l)) + t + ' '.repeat(Math.max(0, total - l)); }
    return t.padEnd(w);
  };
  const sepCell = (w, align) => align === 'center' ? `:${'-'.repeat(Math.max(1, w - 2))}:` : align === 'right' ? `${'-'.repeat(Math.max(1, w - 1))}:` : align === 'left' ? `:${'-'.repeat(Math.max(1, w - 1))}` : '-'.repeat(w);
  const headerLine = `| ${headers.map((h, c) => padCell(h, widths[c], alignments[c])).join(' | ')} |`;
  const sepLine = `| ${widths.map((w, c) => sepCell(w, alignments[c])).join(' | ')} |`;
  const rowLines = rows.map(r => `| ${widths.map((w, c) => padCell(r[c], w, alignments[c])).join(' | ')} |`);
  return [headerLine, sepLine, ...rowLines].join('\n');
}

// Ersetzt genau die Zeilen der Nten Tabelle im Text durch neu erzeugten
// Markdown-Text — Zählung/Position kommt aus derselben parseMarkdownTables().
function replaceNthTableInMarkdown(text, targetIndex, newTableStruct) {
  const tables = parseMarkdownTables(text);
  const table = tables[targetIndex];
  if (!table) return text;
  const lines = text.split('\n');
  const before = lines.slice(0, table.startLine);
  const after = lines.slice(table.endLine + 1);
  return [...before, serializeMarkdownTable(newTableStruct), ...after].join('\n');
}

function stripMarkdownSyntax(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Home ---
// Relative Zeit für "Zuletzt bearbeitet" (Vor X Min./Std./Gestern/Tagen),
// fällt für Älteres auf das absolute Datum zurück (macht bei z.B. "vor 40
// Tagen" mehr Sinn als eine ungenaue Relativangabe).
function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const then = new Date(isoString);
  if (Number.isNaN(then.getTime())) return '';
  const diffMin = Math.floor((Date.now() - then.getTime()) / 60000);
  if (diffMin < 1) return 'Gerade eben';
  if (diffMin < 60) return `Vor ${diffMin} Min.`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Vor ${diffH} Std.`;
  const diffDays = Math.floor(diffH / 24);
  if (diffDays === 1) return 'Gestern';
  if (diffDays < 7) return `Vor ${diffDays} Tagen`;
  return formatAbsoluteDate(isoString);
}

// Absolutes Datum (DD.MM.YYYY) für "Alle Notizen".
function formatAbsoluteDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function buildDashboardRow(note, excerpt, dateLabel, isRecent) {
  const title = note.frontmatter?.title || note.name;
  const category = note.frontmatter?.category || note.relPath.split('/').slice(0, -1).pop() || '';
  const tags = note.frontmatter?.tags || [];
  // Kategorie + (bis zu 2) Tags kombiniert, z. B. "Linux · Hardware, Setup" —
  // Notiz-Vorlagen-Beispiel aus der Anforderung nachgebildet, ohne dafür eine
  // zweite Zeile/eigene Karten-Struktur einzuführen (bleibt konsistent mit
  // "Alle Notizen", das dieselbe Zeile nutzt).
  const tagLabel = [category, tags.slice(0, 2).join(', ')].filter(Boolean).join(' · ');
  const row = document.createElement('div');
  row.className = 'dashboard-row' + (isRecent ? ' recent-row' : '');
  row.innerHTML = `
    <span class="dr-icon">${renderIconHtml(note.icon, '📄')}</span>
    <span class="dr-title">${escapeHtml(title)}</span>
    <span class="dr-excerpt">${escapeHtml(excerpt)}</span>
    <span class="dr-tag">${escapeHtml(tagLabel)}</span>
    <span class="dr-date">${escapeHtml(dateLabel)}</span>
  `;
  row.addEventListener('click', () => { void navigateTo('#note/' + encodeURIComponent(note.relPath)); });
  return row;
}

// --- Home: zweigeteiltes Dashboard ("Zuletzt bearbeitet" + "Alle Notizen") ---
// Zeitabhängige Begrüßung — nutzt denselben Namen wie das Branding über der
// Suche (config.wikiName), fällt ohne Namen auf eine neutrale Anrede zurück.
function greetingFor(wikiName) {
  const hour = new Date().getHours();
  const salutation = hour < 5 ? 'Guten Abend' : hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';
  const name = wikiName?.trim();
  return name ? `${salutation}, ${escapeHtml(name)}` : salutation;
}

// Dashboard-Personalisierung (Nutzer-Feature): Standard-Reihenfolge +
// Aktiv-Zustand, falls der Nutzer noch nie etwas eingestellt hat. Jeder
// Eintrag behält seine Position auch im deaktivierten Zustand bei (statt
// beim Wiederaktivieren ganz woanders aufzutauchen).
const DASHBOARD_SECTION_LABELS = {
  stats: 'Statistik', pinned: 'Angepinnte Notizen', recent: 'Zuletzt bearbeitet', all: 'Alle Notizen'
};
const DEFAULT_DASHBOARD_SECTIONS = [
  { key: 'stats', enabled: true }, { key: 'pinned', enabled: true },
  { key: 'recent', enabled: true }, { key: 'all', enabled: true }
];
const DASHBOARD_SIZE_OPTIONS = [5, 10, 20];
// "Zuletzt bearbeitet" bekommt bewusst eigene Größen-Optionen samt eigenem
// Standardwert (4 statt 5) — siehe Nutzer-Anforderung zur dynamischen Höhe:
// bis zu 4 Einträge passt sich die Höhe an den tatsächlichen Inhalt an,
// darüber wird fest gescrollt.
const RECENT_SIZE_OPTIONS = [4, 10, 20];

// Tipps (Nutzer-Feature): feste lokale Inhalte, die über dieselbe kleine
// Sprechblase im Dashboard-Kopfbereich ausgespielt werden. Die Liste bleibt
// die einzige Inhaltsquelle; Metadaten steuern nur Reihenfolge, Einmaligkeit
// und eindeutig erkennbare Kontextbedingungen.
const DASHBOARD_TIPS = [
  {
    id: 'first-note',
    category: 'firstSteps',
    priority: 'high',
    text: 'Erstelle zuerst ein Thema und darin deine erste Notiz.',
    isRelevant: context => context.noteCount === 0
  },
  {
    id: 'context-menu',
    category: 'firstSteps',
    priority: 'high',
    text: 'Weitere Aktionen für Notizen und Kategorien findest du per Rechtsklick, Umschalt+F10 oder Kontextmenütaste.'
  },
  {
    id: 'search',
    category: 'firstSteps',
    priority: 'high',
    text: 'Mit Strg+K springst du im Hauptfenster direkt zur Suche.'
  },
  {
    id: 'shortcuts',
    category: 'firstSteps',
    priority: 'high',
    text: 'Mit ? öffnest du im Hauptfenster die Übersicht aller Tastenkürzel.'
  },
  {
    id: 'wikilinks',
    category: 'general',
    priority: 'high',
    text: 'Du kannst Notizen mit [[doppelten eckigen Klammern]] direkt miteinander verlinken.'
  },
  {
    id: 'images',
    category: 'general',
    priority: 'medium',
    text: 'Bilder lassen sich direkt per Ziehen-und-Ablegen in eine Notiz einfügen.'
  },
  {
    id: 'pinned',
    category: 'general',
    priority: 'medium',
    text: 'Angepinnte Notizen sind auf dem Dashboard schnell erreichbar — ideal für Notizen, die du oft brauchst.'
  },
  {
    id: 'backup',
    category: 'general',
    priority: 'medium',
    text: 'Backups richtest du in den Einstellungen ein und kannst sie dort jederzeit manuell starten.',
    isRelevant: context => !context.backupConfigured
  },
  {
    id: 'trash',
    category: 'general',
    priority: 'medium',
    text: 'Gelöschte Notizen landen zuerst im Papierkorb und können dort wiederhergestellt werden.'
  },
  {
    id: 'focus-mode',
    category: 'general',
    priority: 'medium',
    text: 'Der Fokus-Modus in der Editor-Werkzeugleiste blendet die Sidebar aus und schafft mehr Platz für konzentriertes Schreiben und Lesen.'
  },
  {
    id: 'templates',
    category: 'general',
    priority: 'medium',
    text: 'Eigene Notiz-Vorlagen lassen sich speichern und für neue Notizen wiederverwenden.',
    isRelevant: context => context.customTemplateCount === 0
  },
  {
    id: 'dashboard-customize',
    category: 'general',
    priority: 'low',
    text: 'Über das Zahnrad kannst du die Bereiche des Dashboards ein- oder ausblenden und neu anordnen.'
  },
  {
    id: 'tags',
    category: 'general',
    priority: 'low',
    text: 'Schlagworte helfen dir, Notizen unabhängig von Kategorien gemeinsam wiederzufinden.',
    isRelevant: context => context.tagCount === 0
  },
  {
    id: 'accent-color',
    category: 'general',
    priority: 'low',
    text: 'Über die Einstellungen lässt sich eine eigene Akzentfarbe wählen — auch als Zufallsfarbe per Klick.'
  }
];

// Releasebezogene Hinweise werden bewusst explizit pro Version registriert.
// Derzeit ist kein konkreter Hinweis freigegeben; die kleine Infrastruktur
// bleibt deshalb leer, statt eine angeblich "neue" Funktion zu erfinden.
const DASHBOARD_FEATURE_TIPS = [];
const DASHBOARD_TIP_PRIORITY = ['high', 'medium', 'low'];
let dashboardAppVersionPromise = null;

function shuffleDashboardTips(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function tipIsRelevant(tip, context) {
  return typeof tip.isRelevant !== 'function' || tip.isRelevant(context);
}

async function getDashboardAppVersion() {
  if (!dashboardAppVersionPromise) {
    dashboardAppVersionPromise = window.archivAPI.getVersion().catch(() => null);
  }
  return dashboardAppVersionPromise;
}

async function persistDashboardTipState(patch) {
  for (const [key, value] of Object.entries(patch)) {
    await fs.setProjectSetting(key, value);
  }
}

function buildGeneralTipCycle(tips, firstCycle) {
  if (!firstCycle) return shuffleDashboardTips(tips).map(tip => tip.id);
  return DASHBOARD_TIP_PRIORITY.flatMap(priority =>
    shuffleDashboardTips(tips.filter(tip => tip.priority === priority)).map(tip => tip.id)
  );
}

async function chooseDashboardTip(context) {
  const config = state.project?.config || {};
  const firstStepsSeen = new Set(Array.isArray(config.dashboardTipFirstStepsSeen)
    ? config.dashboardTipFirstStepsSeen
    : []);
  const nextFirstStep = DASHBOARD_TIPS.find(tip =>
    tip.category === 'firstSteps' && !firstStepsSeen.has(tip.id) && tipIsRelevant(tip, context)
  );

  if (nextFirstStep) {
    const nextSeen = [...firstStepsSeen, nextFirstStep.id];
    await persistDashboardTipState({ dashboardTipFirstStepsSeen: nextSeen });
    return nextFirstStep;
  }

  if (DASHBOARD_FEATURE_TIPS.length) {
    const appVersion = await getDashboardAppVersion();
    const seenVersions = new Set(Array.isArray(config.dashboardFeatureTipVersionsSeen)
      ? config.dashboardFeatureTipVersionsSeen
      : []);
    const featureTip = DASHBOARD_FEATURE_TIPS.find(tip =>
      tip.version === appVersion && !seenVersions.has(tip.version)
    );
    if (featureTip) {
      await persistDashboardTipState({
        dashboardFeatureTipVersionsSeen: [...seenVersions, featureTip.version]
      });
      return featureTip;
    }
  }

  const eligibleGeneral = DASHBOARD_TIPS.filter(tip =>
    tip.category === 'general' && tipIsRelevant(tip, context)
  );
  const eligibleIds = new Set(eligibleGeneral.map(tip => tip.id));
  let remaining = Array.isArray(config.dashboardTipCycleRemaining)
    ? config.dashboardTipCycleRemaining.filter(id => eligibleIds.has(id))
    : [];
  let completedCycles = Number.isInteger(config.dashboardTipCompletedCycles)
    ? config.dashboardTipCompletedCycles
    : 0;

  if (!remaining.length) {
    remaining = buildGeneralTipCycle(eligibleGeneral, completedCycles === 0);
    completedCycles += 1;
  }

  const nextId = remaining.shift();
  const nextTip = eligibleGeneral.find(tip => tip.id === nextId) || eligibleGeneral[0];
  await persistDashboardTipState({
    dashboardTipCycleRemaining: remaining,
    dashboardTipCompletedCycles: completedCycles
  });
  return nextTip;
}

function bindDashboardTipButton(context) {
  document.getElementById('dashboardTipBtn')?.addEventListener('click', async function (event) {
    event.stopPropagation();
    const existing = document.querySelector('.dashboard-tip-popover');
    if (existing) {
      existing.remove();
      return;
    }

    const tip = await chooseDashboardTip(context);
    if (!tip) return;

    const popover = document.createElement('div');
    popover.className = 'dashboard-tip-popover';
    popover.innerHTML = `<span>💡</span><span>${escapeHtml(tip.text)}</span>`;
    document.body.appendChild(popover);
    const buttonRect = this.getBoundingClientRect();
    popover.style.top = `${buttonRect.bottom + 8}px`;
    popover.style.right = `${window.innerWidth - buttonRect.right}px`;

    setTimeout(() => {
      document.addEventListener('click', function closeOnce(clickEvent) {
        if (!popover.contains(clickEvent.target)) {
          popover.remove();
          document.removeEventListener('click', closeOnce);
        }
      });
    }, 0);
  });
}

// Bugfix (per echtem Test gefunden): verhindert, dass ein ÄLTERER, noch
// laufender renderHome()-Aufruf nach seinem eigenen await (Notiz-Inhalte
// laden) in ein inzwischen vom NEUEREN Aufruf frisch erzeugtes
// recentList/allList hineinschreibt — sonst erscheint jede Notiz doppelt.
// Dasselbe Generation-Prinzip wie beim Rechtschreibprüfung-Kontextmenü.
let dashboardRenderGeneration = 0;

async function renderHome() {
  const myGeneration = ++dashboardRenderGeneration;
  setBreadcrumb('Start');
  setActiveNav(null);
  const notes = fs.flattenNotes(state.tree);
  const config = state.project?.config || {};
  const tipsIconEnabled = config.dashboardTipsIconEnabled !== false;

  if (notes.length === 0) {
    els.contentScroll.innerHTML = `
      <div class="dashboard-wrap">
        <div class="home-header-row">
          <div></div>
          <div class="dashboard-header-actions">
            ${tipsIconEnabled ? `<button type="button" class="dashboard-tip-icon-btn" id="dashboardTipBtn" title="Tipp zur Bedienung anzeigen" aria-label="Tipp zur Bedienung anzeigen">💡</button>` : ''}
          </div>
        </div>
        <div class="empty-state">
          <div class="empty-state-title">Dein Archiv ist noch leer.</div>
          <div class="empty-state-body">Erstelle deine erste Wissensseite, um dein persönliches Wiki aufzubauen — über „+ Thema" in der Sidebar eine Kategorie anlegen, dann „+ Notiz" darin.</div>
        </div>
      </div>`;
    bindDashboardTipButton({
      noteCount: 0,
      tagCount: 0,
      customTemplateCount: Array.isArray(config.customTemplates) ? config.customTemplates.length : 0,
      backupConfigured: Boolean(config.backupPath)
    });
    return;
  }

  // Dashboard-Personalisierung (Nutzer-Feature): gespeicherte Reihenfolge
  // mit den Standardwerten zusammenführen (statt sie direkt zu verwenden) —
  // damit ein SPÄTER neu hinzugekommener Bereich (z. B. wenn diese Funktion
  // künftig erweitert wird) bei bestehenden Nutzern automatisch mit auftaucht,
  // statt zu fehlen, nur weil er beim letzten Speichern noch nicht existierte.
  const savedSections = Array.isArray(config.dashboardSections) ? config.dashboardSections : null;
  // Bugfix (per Test gefunden): die gespeicherte Reihenfolge selbst ist die
  // Grundlage — vorher wurde immer über DEFAULT_DASHBOARD_SECTIONS iteriert,
  // wodurch eine gespeicherte Umsortierung nie sichtbar wurde, nur der
  // Ein/Aus-Zustand blieb erhalten. Ein evtl. später neu hinzugekommener
  // Bereich (noch nicht im gespeicherten Stand vorhanden) wird am Ende ergänzt.
  // Ein gespeicherter, aber jetzt nicht mehr existierender Bereich (z. B.
  // "tips" aus der früheren Zeilen-Version, jetzt ein Kopfbereich-Symbol
  // ohne eigene Position) wird herausgefiltert, statt als wirkungsloser
  // Geister-Eintrag stehen zu bleiben.
  const validKeys = new Set(DEFAULT_DASHBOARD_SECTIONS.map(d => d.key));
  const dashboardSections = savedSections
    ? [...savedSections.filter(s => validKeys.has(s.key)), ...DEFAULT_DASHBOARD_SECTIONS.filter(def => !savedSections.some(s => s.key === def.key))]
    : DEFAULT_DASHBOARD_SECTIONS.map(def => ({ ...def }));
  const recentCount = RECENT_SIZE_OPTIONS.includes(config.dashboardRecentCount) ? config.dashboardRecentCount : 4;
  const allCount = DASHBOARD_SIZE_OPTIONS.includes(config.dashboardAllCount) ? config.dashboardAllCount : 10;
  const pinnedCount = DASHBOARD_SIZE_OPTIONS.includes(config.dashboardPinnedCount) ? config.dashboardPinnedCount : 5;

  // "Zuletzt bearbeitet" und Favoriten bleiben nach Änderungsdatum sortiert.
  const sortedByModified = [...notes].sort((a, b) => {
    const ta = a.frontmatter?.modified || a.frontmatter?.created || '';
    const tb = b.frontmatter?.modified || b.frontmatter?.created || '';
    return tb.localeCompare(ta);
  });
  const recentNotes = sortedByModified.slice(0, recentCount);
  const pinnedNotesAll = sortedByModified.filter(n => n.frontmatter?.pinned);
  const pinnedNotes = pinnedNotesAll.slice(0, pinnedCount);

  // "Alle Notizen" erhält bewusst eine stabile alphabetische Übersicht nach
  // dem sichtbaren Notiztitel. Die zeitliche Sortierung der anderen Bereiche
  // und die gespeicherte Anzahl sichtbarer Einträge bleiben unverändert.
  const allNotes = [...notes].sort((a, b) => {
    const aTitle = String(a.frontmatter?.title || a.name || '').replace(/\.md$/i, '');
    const bTitle = String(b.frontmatter?.title || b.name || '').replace(/\.md$/i, '');
    return aTitle.localeCompare(bTitle, 'de', {
      sensitivity: 'base',
      numeric: true
    });
  });

  // Notiz-Statistik-Kacheln: simple, aus schon vorhandenen Frontmatter-Daten
  // berechnet — kein zusätzlicher Speicher-/Tracking-Aufwand nötig.
  const oneWeekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const editedThisWeek = notes.filter(n => {
    const t = n.frontmatter?.modified || n.frontmatter?.created;
    return t && new Date(t).getTime() >= oneWeekAgo;
  }).length;
  const categoryTally = new Map();
  notes.forEach(n => {
    const cat = n.frontmatter?.category || n.frontmatter?.mainCategory;
    if (cat) categoryTally.set(cat, (categoryTally.get(cat) || 0) + 1);
  });
  const categoryCount = categoryTally.size;
  const tagCount = new Set(notes.flatMap(n => n.frontmatter?.tags || [])).size;
  const mostUsedCategory = [...categoryTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  // Begrüßungs-Unterzeile erzählt kurz, was diese Woche passiert ist.
  const subLine = editedThisWeek > 0
    ? `Du hast diese Woche ${editedThisWeek} Seite${editedThisWeek === 1 ? '' : 'n'} bearbeitet.`
    : `${notes.length} Notiz${notes.length === 1 ? '' : 'en'} insgesamt.`;

  // Stabile Kontextzeile: immer die zuletzt bearbeitete Notiz anzeigen.
  // Die Aktivitätsinformation bleibt unverändert in der bestehenden Unterzeile.
  const contextLine = recentNotes[0]
    ? `Zuletzt bearbeitet: ${escapeHtml(recentNotes[0].frontmatter?.title || recentNotes[0].name)}`
    : '';


  // --- Die einzelnen Bereichs-Blöcke, jeweils als HTML-Fragment ---
  const statsBlockHtml = `
    <div class="stats-widget">
      <button type="button" class="stat-chip" id="statChipNotes">
        <span class="stat-num">${notes.length}</span>
        <span class="stat-label">📄 Notizen gesamt</span>
      </button>
      <button type="button" class="stat-chip" id="statChipWeek">
        <span class="stat-num">${editedThisWeek}</span>
        <span class="stat-label">✏️ diese Woche bearbeitet</span>
      </button>
      <button type="button" class="stat-chip${categoryCount === 0 ? ' is-empty' : ''}" id="statChipTopics">
        <span class="stat-num">${categoryCount}</span>
        <span class="stat-label">📚 Themen</span>
        ${categoryCount === 0 ? `
          <span class="stat-empty-hint">
            <strong>Noch keine Themen vorhanden.</strong>
            <span>Erstelle Themen,<br>um deine Notizen zu organisieren.</span>
          </span>` : ''}
      </button>
      <button type="button" class="stat-chip${tagCount === 0 ? ' is-empty' : ''}" id="statChipTags">
        <span class="stat-num">${tagCount}</span>
        <span class="stat-label">🏷 Tags</span>
        ${tagCount === 0 ? `
          <span class="stat-empty-hint">
            <strong>Noch keine Tags vorhanden.</strong>
            <span>Füge Tags zu Notizen hinzu,<br>um dein Wissen schneller zu finden.</span>
          </span>` : ''}
      </button>
    </div>`;
  const pinnedBlockHtml = pinnedNotesAll.length
    ? `<div class="pinned-strip" id="pinnedStrip"></div>`
    : `
      <div class="dashboard-section pinned-empty-section">
        <div class="dashboard-section-header">⭐ Angepinnt</div>
        <div class="dashboard-empty-compact">
          <div class="dashboard-empty-compact-title">Noch keine Favoriten.</div>
          <div class="dashboard-empty-compact-body">
            Markiere wichtige Notizen mit dem Stern,<br>
            damit sie hier schnell erreichbar sind.
          </div>
        </div>
      </div>`;

  // "Zuletzt bearbeitet"/"Alle Notizen": bleiben als zusammengehöriges Paar
  // bestehen (teilen sich die verbleibende Höhe), sofern beide aktiv UND
  // unmittelbar nebeneinander in der gewählten Reihenfolge stehen — sonst
  // bekommt jeder für sich eine eigene, feste Höhe mit eigenem Scrollbereich.
  // Nutzer-Anforderung: Höhe richtet sich nach dem TATSÄCHLICHEN Inhalt,
  // keine feste Prozent-Aufteilung mehr — das übernimmt fitNotesAreaHeight()
  // weiter unten, direkt nach dem Rendern, anhand echter Zeilenhöhen.
  const enabledKeys = dashboardSections.filter(s => s.enabled).map(s => s.key);
  const recentIdx = enabledKeys.indexOf('recent');
  const allIdx = enabledKeys.indexOf('all');
  const notesArePaired = recentIdx !== -1 && allIdx !== -1 && Math.abs(recentIdx - allIdx) === 1;

  function recentSectionHtml() {
    return `
      <div class="dashboard-section recent" id="recentSection">
        <div class="dashboard-section-header">Zuletzt bearbeitet</div>
        <div class="dashboard-list" id="recentList"></div>
      </div>`;
  }
  function allSectionHtml() {
    return `
      <div class="dashboard-section all" id="allSection">
        <div class="dashboard-section-header">Alle Notizen</div>
        <div class="dashboard-list" id="allList"></div>
        ${allCount < allNotes.length ? `<button type="button" class="dashboard-show-more" id="allShowMore">Alle ${allNotes.length} anzeigen →</button>` : ''}
      </div>`;
  }

  const blockRenderers = {
    stats: () => statsBlockHtml,
    pinned: () => pinnedBlockHtml
  };

  // Reihenfolge aufbauen: recent+all werden als EIN Fragment behandelt,
  // sobald sie direkt nebeneinander stehen (siehe notesArePaired oben) —
  // die tatsächliche Höhenaufteilung übernimmt fitNotesAreaHeight() weiter
  // unten, anhand des echten Inhalts.
  const bodyParts = [];
  const seen = new Set();
  for (const key of enabledKeys) {
    if (seen.has(key)) continue;
    if (key === 'recent' || key === 'all') {
      if (notesArePaired) {
        seen.add('recent'); seen.add('all');
        const first = recentIdx < allIdx ? 'recent' : 'all';
        bodyParts.push(`<div class="dashboard-sections">${first === 'recent' ? recentSectionHtml() + allSectionHtml() : allSectionHtml() + recentSectionHtml()}</div>`);
      } else {
        seen.add(key);
        bodyParts.push(key === 'recent' ? recentSectionHtml() : allSectionHtml());
      }
      continue;
    }
    seen.add(key);
    bodyParts.push(blockRenderers[key]());
  }

  // Sperrstatus (Nutzer-Feature): ein einziger, gemeinsamer Wert — sowohl das
  // Kopfbereich-Symbol als auch der Einstellungen-Dialog lesen/schreiben
  // GENAU diesen einen Wert, nie eine eigene Kopie. Dadurch können beide
  // Stellen nie auseinanderlaufen (siehe Nutzer-Anforderung "Synchronisation").
  const dashboardLocked = config.dashboardLocked === true;

  els.contentScroll.innerHTML = `
    <div class="dashboard-wrap">
      <div class="home-header-row">
        <div>
          <h1 class="home-heading">${greetingFor(state.project?.config?.wikiName)}</h1>
          ${contextLine ? `<p class="home-context-line">${contextLine}</p>` : ''}
          <p class="home-sub">${subLine}</p>
        </div>
        <div class="dashboard-header-actions">
          ${tipsIconEnabled ? `<button type="button" class="dashboard-tip-icon-btn" id="dashboardTipBtn" title="Tipp zur Bedienung anzeigen" aria-label="Tipp zur Bedienung anzeigen">💡</button>` : ''}
          <button type="button" class="dashboard-lock-btn${dashboardLocked ? ' locked' : ''}" id="dashboardLockBtn" title="${dashboardLocked ? 'Dashboard ist gesperrt.' : 'Dashboard kann angepasst werden.'}">${dashboardLocked ? '🔒' : '🔓'}</button>
          <button type="button" class="dashboard-gear-btn" id="dashboardGearBtn" title="Dashboard anpassen">⚙</button>
        </div>
      </div>
      <div class="dashboard-body">
        ${bodyParts.join('\n')}
      </div>
    </div>
  `;

  // Kacheln führen zum jeweils passenden Bereich — entweder eine eigene
  // Ansicht (Themen → Statistik-Seite, Tags → Tag-Übersicht) oder ein
  // Sprung zum entsprechenden Bereich weiter unten auf demselben Dashboard.
  document.getElementById('statChipNotes')?.addEventListener('click', () => {
    document.getElementById('allSection')?.scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('statChipWeek')?.addEventListener('click', () => {
    document.getElementById('recentSection')?.scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('statChipTopics')?.addEventListener('click', () => { void navigateTo('#stats'); });
  document.getElementById('statChipTags')?.addEventListener('click', () => { void navigateTo('#tags'); });

  bindDashboardTipButton({
    noteCount: notes.length,
    tagCount,
    customTemplateCount: Array.isArray(config.customTemplates) ? config.customTemplates.length : 0,
    backupConfigured: Boolean(config.backupPath)
  });

  // Sperr-Symbol (Nutzer-Feature): einfacher Klick togglet sofort. e.detail>1
  // erkennt, ob dieser Klick Teil eines Doppelklicks ist (2., 3. Klick einer
  // schnellen Folge) — wird dann bewusst ignoriert, damit ein Doppelklick
  // NICHT zweimal umschaltet (Nutzer-Anforderung: "keine zusätzliche Funktion").
  async function toggleDashboardLock() {
    const newLocked = !dashboardLocked;
    await fs.setProjectSetting('dashboardLocked', newLocked);
    await renderHome();
    showQuickFeedback(newLocked ? 'Dashboard gesperrt' : 'Dashboard entsperrt');
  }
  document.getElementById('dashboardLockBtn')?.addEventListener('click', (e) => {
    if (e.detail > 1) return;
    toggleDashboardLock();
  });
  const dashboardLockBtn = document.getElementById('dashboardLockBtn');
  function openDashboardLockContextMenu(clientX, clientY) {
    const menu = createHtmlContextMenu({
      trigger: dashboardLockBtn,
      label: 'Dashboard-Aktionen',
      position: { clientX, clientY: clientY + 4 },
      html: renderSimpleContextMenuItems([
        { label: dashboardLocked ? '🔓 Dashboard entsperren' : '🔒 Dashboard sperren', data: { choice: 'toggle' } },
        { label: '⚙ Dashboard anpassen…', data: { choice: 'settings' } },
        { separator: true },
        { label: '↺ Standard wiederherstellen', data: { choice: 'reset' } }
      ])
    });
    menu.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('button[data-choice]');
      if (!btn) return;
      closeHtmlContextMenu(menu, { reason: 'action' });
      if (btn.dataset.choice === 'toggle') await toggleDashboardLock();
      else if (btn.dataset.choice === 'settings') showDashboardSettings(dashboardSections, { recentCount, allCount, pinnedCount, tipsIconEnabled, locked: dashboardLocked });
      else if (btn.dataset.choice === 'reset') resetDashboardToDefaults();
    });
  }
  dashboardLockBtn?.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openDashboardLockContextMenu(e.clientX, e.clientY);
  });
  dashboardLockBtn?.addEventListener('keydown', (e) => {
    if (!isContextMenuKeyboardEvent(e)) return;
    e.preventDefault();
    const point = contextMenuPointForElement(dashboardLockBtn);
    openDashboardLockContextMenu(point.clientX, point.clientY);
  });

  document.getElementById('dashboardGearBtn')?.addEventListener('click', () => {
    showDashboardSettings(dashboardSections, { recentCount, allCount, pinnedCount, tipsIconEnabled, locked: dashboardLocked });
  });

  // Ein einziger Abruf für alle Notiz-Inhalte (statt pro Zeile einzeln
  // fs.readNote aufzurufen) — dieselben Daten, die auch die Volltextsuche nutzt.
  let bodyByRelPath = new Map();
  try {
    const docs = await fs.getSearchDocuments();
    bodyByRelPath = new Map(docs.map(d => [d.relPath, d.body]));
  } catch { /* Startseite funktioniert auch ohne Ausschnitte, falls das mal fehlschlägt */ }

  // Bugfix (Absturz per Konsole gemeldet): Während des obigen await kann der
  // Nutzer bereits zu einer anderen Ansicht gewechselt haben (z. B. Papierkorb,
  // während schnell hintereinander mehrere Notizen gelöscht werden — jede
  // löst ein refreshAll() → render() aus). Container existieren dann nicht
  // mehr, weiter unten würde .appendChild auf null krachen. Hier sauber
  // abbrechen statt gegen eine nicht mehr vorhandene Ansicht zu rendern.
  if (myGeneration !== dashboardRenderGeneration || !document.getElementById('dashboardGearBtn')) return;

  function excerptFor(note) {
    return stripMarkdownSyntax(bodyByRelPath.get(note.relPath)).slice(0, 60);
  }

  if (pinnedNotesAll.length) {
    const strip = document.getElementById('pinnedStrip');
    if (strip) {
    pinnedNotes.forEach(note => {
      const title = note.frontmatter?.title || note.name;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'pinned-chip';
      chip.innerHTML = `<span class="pinned-chip-icon">${renderIconHtml(note.icon, '★')}</span><span class="pinned-chip-title">${escapeHtml(title)}</span>`;
      chip.addEventListener('click', () => { void navigateTo('#note/' + encodeURIComponent(note.relPath)); });
      strip.appendChild(chip);
    });
    }
  }

  const recentList = document.getElementById('recentList');
  recentNotes.forEach(note => {
    const dateLabel = formatRelativeTime(note.frontmatter?.modified || note.frontmatter?.created);
    recentList.appendChild(buildDashboardRow(note, excerptFor(note), dateLabel, true));
  });

  const allList = document.getElementById('allList');
  allNotes.slice(0, allCount).forEach(note => {
    const dateLabel = formatAbsoluteDate(note.frontmatter?.modified || note.frontmatter?.created);
    allList.appendChild(buildDashboardRow(note, excerptFor(note), dateLabel, false));
  });

  // Nutzer-Anforderung: dynamische Höhe statt fester Prozent-Aufteilung —
  // bis zu 4 sichtbaren Zeilen passt sich die Höhe an den TATSÄCHLICHEN
  // Inhalt an (kein Leerraum darunter), erst darüber wird fest gescrollt.
  // Bewusst als eigene, wiederverwendbare Funktion für BEIDE Listen (statt
  // nur für "Zuletzt bearbeitet") — dieselbe Regel gilt jetzt einheitlich
  // auch für "Alle Notizen", wo genau dasselbe unnötige Leerraum-Problem
  // bestehen würde. Wirkt rein auf die innere, scrollende Liste — der
  // äußere Rahmen (.dashboard-section) hat bewusst KEINE eigene Höhe mehr
  // und wächst dadurch automatisch mit seinem Inhalt mit.
  const MAX_VISIBLE_ROWS = 4;
  function fitNoteListHeight(listEl, totalRows) {
    if (!listEl) return;
    const sampleRow = listEl.querySelector('.dashboard-row');
    if (!sampleRow || totalRows <= MAX_VISIBLE_ROWS) {
      listEl.style.maxHeight = 'none';
      return;
    }
    const rowHeight = sampleRow.getBoundingClientRect().height;
    listEl.style.maxHeight = (rowHeight * MAX_VISIBLE_ROWS) + 'px';
  }
  fitNoteListHeight(recentList, recentNotes.length);
  fitNoteListHeight(allList, Math.min(allCount, allNotes.length));
  document.getElementById('allShowMore')?.addEventListener('click', function () {
    allNotes.slice(allCount).forEach(note => {
      const dateLabel = formatAbsoluteDate(note.frontmatter?.modified || note.frontmatter?.created);
      allList.appendChild(buildDashboardRow(note, excerptFor(note), dateLabel, false));
    });
    fitNoteListHeight(allList, allNotes.length); // nach "Alle anzeigen" ggf. neu bewerten (jetzt sicher > 4)
    this.remove();
  });
}

// Dashboard-Personalisierung (Nutzer-Feature): kompaktes Overlay zum
// Ein-/Ausblenden und Umsortieren der Bereiche, sowie die Größen-Auswahl für
// "Zuletzt bearbeitet"/"Alle Notizen"/"Angepinnte Notizen" — alles über
// denselben generischen fs.setProjectSetting-Mechanismus gespeichert wie
// jede andere Einstellung in dieser App.
// Dashboard zurücksetzen (Nutzer-Feature): stellt Reihenfolge, Ein/Aus-
// Zustand, Größen und Tipp-Symbol auf die Standardwerte zurück. Der
// Sperrstatus selbst wird bewusst NICHT verändert — auch wenn das Dashboard
// gesperrt ist, funktioniert Zurücksetzen weiterhin, und bleibt danach genauso
// gesperrt wie vorher (siehe Nutzer-Anforderung "Dashboard gesperrt + Zurücksetzen").
async function resetDashboardToDefaults() {
  if (!await showConfirmDialog({
    title: 'Dashboard zurücksetzen?',
    message: 'Die Dashboard-Anordnung und Sichtbarkeit werden auf den Standard zurückgesetzt.',
    confirmLabel: 'Zurücksetzen',
    danger: true
  })) return;
  await fs.setProjectSetting('dashboardSections', DEFAULT_DASHBOARD_SECTIONS.map(def => ({ ...def })));
  await fs.setProjectSetting('dashboardRecentCount', 4);
  await fs.setProjectSetting('dashboardAllCount', 10);
  await fs.setProjectSetting('dashboardPinnedCount', 5);
  await fs.setProjectSetting('dashboardTipsIconEnabled', true);
  closeManagedDialogs('.dashboard-settings-overlay', { restoreFocus: false });
  await renderHome();
  showQuickFeedback('Dashboard zurückgesetzt');
}

function showDashboardSettings(sections, sizes) {
  closeManagedDialogs('.dashboard-settings-overlay', { restoreFocus: false });
  const list = sections.map(section => ({ ...section }));
  let locked = sizes.locked === true;
  const overlay = document.createElement('div');
  overlay.className = 'dashboard-settings-overlay';
  overlay.innerHTML = `
    <div class="dashboard-settings-panel">
      <h3>Dashboard anpassen</h3>
      <div class="dashboard-settings-row" style="padding-bottom:11px; border-bottom:1px solid var(--border-soft);">
        <label><input type="checkbox" id="dsLocked" ${locked ? 'checked' : ''}><img class="lib-icon dialog-inline-icon" src="assets/icon-library/security/lock.svg" alt="">Dashboard sperren</label>
      </div>
      <div id="dsRows"></div>
      <div class="dashboard-settings-size-block">
        <span>Zuletzt bearbeitet</span>
        <div class="density-option-row" id="dsRecentSize"></div>
      </div>
      <div class="dashboard-settings-size-block">
        <span>Alle Notizen (Vorschau)</span>
        <div class="density-option-row" id="dsAllSize"></div>
      </div>
      <div class="dashboard-settings-size-block">
        <span>Angepinnte Notizen</span>
        <div class="density-option-row" id="dsPinnedSize"></div>
      </div>
      <div class="dashboard-settings-row" style="border-top:1px solid var(--border-soft); margin-top:4px; padding-top:11px;">
        <label><input type="checkbox" id="dsTipsIcon" ${sizes.tipsIconEnabled ? 'checked' : ''}><img class="lib-icon dialog-inline-icon" src="assets/icon-library/projects/lightbulb.svg" alt="">Tipp-Symbol anzeigen</label>
      </div>
      <button type="button" class="dashboard-show-more" id="dsResetBtn" style="margin-top:8px; border-top:none; border:1px solid var(--border-soft); border-radius:var(--radius-md);">Standard wiederherstellen</button>
    </div>
  `;
  document.body.appendChild(overlay);
  function close() { dialogController.destroy(); }
  const dialogController = manageModalDialog({
    overlay,
    dialog: overlay.querySelector('.dashboard-settings-panel'),
    initialFocus: overlay.querySelector('#dsLocked'),
    onRequestClose: close,
    closeOnBackdrop: true,
    enterActivatesPrimary: false
  });
  overlay.querySelector('#dsLocked').addEventListener('change', async (e) => {
    locked = e.target.checked;
    await fs.setProjectSetting('dashboardLocked', locked);
    await renderHome();
    showQuickFeedback(locked ? 'Dashboard gesperrt' : 'Dashboard entsperrt');
    renderRows(); // Pfeile sofort sperren/entsperren, ohne den Dialog neu zu öffnen
  });
  overlay.querySelector('#dsResetBtn').addEventListener('click', () => resetDashboardToDefaults());

  function renderRows() {
    const rowsEl = overlay.querySelector('#dsRows');
    rowsEl.innerHTML = list.map((s, i) => `
      <div class="dashboard-settings-row${s.enabled ? '' : ' disabled'}">
        <label><input type="checkbox" data-toggle="${s.key}" ${s.enabled ? 'checked' : ''}> ${escapeHtml(DASHBOARD_SECTION_LABELS[s.key])}</label>
        <div class="dashboard-settings-reorder">
          <button type="button" data-up="${s.key}" ${(locked || i === 0) ? 'disabled' : ''} title="${locked ? 'Dashboard ist gesperrt. Zum Bearbeiten bitte zuerst entsperren.' : ''}">↑</button>
          <button type="button" data-down="${s.key}" ${(locked || i === list.length - 1) ? 'disabled' : ''} title="${locked ? 'Dashboard ist gesperrt. Zum Bearbeiten bitte zuerst entsperren.' : ''}">↓</button>
        </div>
      </div>`).join('');
    rowsEl.querySelectorAll('[data-toggle]').forEach(cb => cb.addEventListener('change', async (e) => {
      const item = list.find(s => s.key === e.target.dataset.toggle);
      item.enabled = e.target.checked;
      await persist();
      renderRows();
    }));
    rowsEl.querySelectorAll('[data-up]').forEach(btn => btn.addEventListener('click', async () => {
      if (locked) return;
      const i = list.findIndex(s => s.key === btn.dataset.up);
      if (i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; await persist(); renderRows(); }
    }));
    rowsEl.querySelectorAll('[data-down]').forEach(btn => btn.addEventListener('click', async () => {
      if (locked) return;
      const i = list.findIndex(s => s.key === btn.dataset.down);
      if (i < list.length - 1) { [list[i], list[i + 1]] = [list[i + 1], list[i]]; await persist(); renderRows(); }
    }));
  }
  async function persist() {
    await fs.setProjectSetting('dashboardSections', list);
    await renderHome();
  }
  function renderSizeRow(containerId, settingKey, current, options = DASHBOARD_SIZE_OPTIONS) {
    const el = overlay.querySelector(containerId);
    el.innerHTML = options.map(n =>
      `<button type="button" class="density-option ${n === current ? 'active' : ''}" data-size="${n}">${n}</button>`
    ).join('');
    el.querySelectorAll('button').forEach(btn => btn.addEventListener('click', async () => {
      const n = Number(btn.dataset.size);
      await fs.setProjectSetting(settingKey, n);
      el.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
      await renderHome();
    }));
  }
  renderRows();
  renderSizeRow('#dsRecentSize', 'dashboardRecentCount', sizes.recentCount, RECENT_SIZE_OPTIONS);
  renderSizeRow('#dsAllSize', 'dashboardAllCount', sizes.allCount);
  renderSizeRow('#dsPinnedSize', 'dashboardPinnedCount', sizes.pinnedCount);
  // Tipp-Symbol (Nutzer-Feature): bewusst eigenständig, nicht Teil der
  // Reihenfolge-Liste oben — es hat keine Position im Layout, für die eine
  // Reihenfolge überhaupt Sinn ergäbe, nur ein Ein/Aus.
  overlay.querySelector('#dsTipsIcon').addEventListener('change', async (e) => {
    await fs.setProjectSetting('dashboardTipsIconEnabled', e.target.checked);
    await renderHome();
  });
}


// --- Notiz-Ansicht ---
// Echte Backlinks (nicht zu verwechseln mit der manuellen "gehört zu →"-
// Verknüpfung oben, siehe Kommentar dort): durchsucht alle ANDEREN Notizen
// nach [[Ziel]]- bzw. [[Ziel|Anzeigetext]]-Links, die per Titel auf DIESE
// Notiz zeigen. Nutzt dieselbe Titel-Match-Logik wie renderWikiLinksToPlaceholders
// in build/editor-entry.js (case-insensitiver Titel-Vergleich).
async function renderIncomingLinks(relPath, currentTitle) {
  const container = document.getElementById('incomingLinks');
  if (!container) return;
  let docs;
  try { docs = await fs.getSearchDocuments(); }
  catch { container.innerHTML = ''; return; }

  const linkRe = /\[\[([^\]\n|]+?)(?:\|[^\]\n]+?)?\]\]/g;
  const linkingNotes = [];
  for (const doc of docs) {
    if (doc.relPath === relPath) continue;
    let m;
    linkRe.lastIndex = 0;
    while ((m = linkRe.exec(doc.body || ''))) {
      if (m[1].trim().toLowerCase() === currentTitle.toLowerCase()) {
        linkingNotes.push(doc);
        break;
      }
    }
  }

  if (linkingNotes.length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = `
    <div class="incoming-links-label">🔗 Verlinkt von ${linkingNotes.length} Notiz${linkingNotes.length === 1 ? '' : 'en'}:</div>
    <div class="incoming-links-list">
      ${linkingNotes.map(n => `<a href="#" class="incoming-link-item" data-relpath="${escapeHtml(n.relPath)}">${escapeHtml(n.title)}</a>`).join('')}
    </div>`;
  container.querySelectorAll('.incoming-link-item').forEach(a => {
    a.addEventListener('click', (e) => { e.preventDefault(); void navigateTo('#note/' + encodeURIComponent(a.dataset.relpath)); });
  });
}

// Split-Ansicht per Ziehen in der Breite verstellbar (Editor/Vorschau).
// Bugfix (Audit-Punkt 8, echtes Event-Listener-Leck): mousemove/mouseup auf
// document liefen vorher INNERHALB von renderNote() bei jedem Notiz-Wechsel
// erneut rein, ohne die vorherigen je zu entfernen — document besteht über
// die ganze Sitzung hinweg, im Gegensatz zum Notiz-Inhalt selbst (der bei
// jeder Navigation per innerHTML neu aufgebaut wird). Bei häufigem
// Notiz-Wechsel sammelten sich dadurch beliebig viele verwaiste Listener an.
// Jetzt: geteilter Zustand statt einer bei jedem Aufruf neu erzeugten
// Closure-Variable — wireSplitResizer() aktualisiert bei jedem Notiz-Wechsel
// nur die Elementverweise + hängt mousedown an den (ohnehin neu erzeugten)
// aktuellen Trenner — mousemove/mouseup laufen dagegen nur EIN EINZIGES MAL,
// gleich beim Laden dieses Moduls.
const splitResizerState = { resizer: null, split: null, editorPane: null, previewPane: null, dragging: false };

function wireSplitResizer() {
  const resizer = document.getElementById('splitResizer');
  const split = document.getElementById('noteSplit');
  const editorPane = document.getElementById('editorContainer');
  const previewPane = document.getElementById('previewContainer');
  if (!resizer || !split) return;
  splitResizerState.resizer = resizer;
  splitResizerState.split = split;
  splitResizerState.editorPane = editorPane;
  splitResizerState.previewPane = previewPane;
  splitResizerState.dragging = false;
  // Gespeicherte Split-Breite wiederherstellen (Nutzer-Feature) — bei jedem
  // Notiz-Rendern neu angewendet, da editorContainer/previewContainer jedes
  // Mal frisch erzeugt werden (anders als z. B. die Sidebar, die dauerhaft
  // dasselbe DOM-Element bleibt). Nur anwenden, wenn tatsächlich ein
  // abweichender Wert gespeichert wurde, sonst bleibt es bei der normalen
  // 50/50-Aufteilung.
  const savedWidth = state.project?.config?.splitEditorWidth;
  if (typeof savedWidth === 'number' && savedWidth > 0) {
    editorPane.style.flex = `0 0 ${savedWidth}px`;
    previewPane.style.flex = '1 1 0';
  }
  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    splitResizerState.dragging = true;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
  });
}

// Nur EINMALIG beim Laden des Moduls registriert (siehe Kommentar oben) —
// liest bei jedem Aufruf die AKTUELLE Elementreferenz aus splitResizerState,
// die wireSplitResizer() bei jedem Notiz-Wechsel frisch setzt.
document.addEventListener('mousemove', (e) => {
  const s = splitResizerState;
  if (!s.dragging) return;
  const rect = s.split.getBoundingClientRect();
  const minWidth = 120;
  let editorWidth = e.clientX - rect.left;
  editorWidth = Math.max(minWidth, Math.min(editorWidth, rect.width - s.resizer.offsetWidth - minWidth));
  s.editorPane.style.flex = `0 0 ${editorWidth}px`;
  s.previewPane.style.flex = '1 1 0';
});
document.addEventListener('mouseup', () => {
  const s = splitResizerState;
  if (!s.dragging) return;
  s.dragging = false;
  s.resizer.classList.remove('dragging');
  document.body.style.cursor = '';
  // Split-Breite dauerhaft speichern (Nutzer-Feature) — dasselbe Muster wie
  // bei Sidebar-Breite/Sync-Scroll: projektbezogen speichern. Die zentrale
  // Config-Antwort übernimmt den bestätigten Zustand anschließend im Renderer.
  const finalWidth = Math.round(s.editorPane.getBoundingClientRect().width);
  fs.setProjectSetting('splitEditorWidth', finalWidth).catch(() => {});
});

async function renderNote(relPath) {
  const node = fs.findNode(state.tree, relPath);
  if (!node) { void navigateAfterEntryMutation('#home', { replace: true }); return; }

  setActiveNav(relPath);
  const title = node.frontmatter?.title || node.name;
  setBreadcrumb(node.frontmatter?.category ? `${node.frontmatter.category} / ${title}` : title);

  els.contentScroll.innerHTML = `
    <div class="note-header">
      <div class="note-document-title">
        <button type="button" class="pin-btn${node.frontmatter?.pinned ? ' active' : ''}" id="btnPinNote" title="${node.frontmatter?.pinned ? 'Von Favoriten entfernen' : 'Als Favorit anpinnen'}" aria-label="Anpinnen">${node.frontmatter?.pinned ? '★' : '☆'}</button>
        <input type="text" class="note-title-input" id="noteTitleInput" value="${escapeHtml(title)}">
      </div>
      <div class="note-document-meta">
        <div class="backlink-row" id="backlinkRow"></div>
        <span class="note-meta-divider" aria-hidden="true"></span>
        <span class="note-meta-label">Tags</span>
        <button type="button" class="category-badge" id="noteCategoryBadge" title="In andere Kategorie verschieben">${escapeHtml(node.frontmatter?.category || node.frontmatter?.mainCategory || '')}</button>
        <input type="text" class="tags-input" id="noteTagsInput" placeholder="tag1, tag2, …">
      </div>
      <div class="note-document-actions">
        <span class="dirty-label" id="dirtyLabel">✓ gespeichert</span>
        <button type="button" class="btn primary" id="btnSave" title="Speichern (Ctrl+S)">Speichern</button>
        <button type="button" class="btn danger small" id="btnDeleteNote" title="Notiz in den Papierkorb verschieben" aria-label="Löschen">🗑</button>
      </div>
    </div>
    <div class="incoming-links" id="incomingLinks"></div>
    <div class="note-toolbar" aria-label="Editor-Werkzeugleiste">
      <div class="toolbar-group toolbar-view-group">
        <span class="toolbar-group-label">Ansicht</span>
        <div class="toolbar-group-controls">
          <div class="view-toggle" id="viewToggle">
            <button type="button" data-mode="editor" title="Nur Editor anzeigen" aria-label="Nur Editor anzeigen" aria-pressed="false">Editor</button>
            <button type="button" data-mode="split" title="Editor und Vorschau nebeneinander anzeigen" aria-label="Split-Ansicht anzeigen" aria-pressed="false">Split</button>
            <button type="button" data-mode="preview" title="Nur Vorschau anzeigen" aria-label="Nur Vorschau anzeigen" aria-pressed="false">Vorschau</button>
          </div>
          <button type="button" class="icon-btn sync-scroll-toggle" id="btnSyncScroll" title="Synchrones Scrollen im Split-Modus" aria-label="Synchrones Scrollen im Split-Modus umschalten" aria-pressed="false">⇅</button>
          <button type="button" class="icon-btn" id="btnFocusMode" title="Fokus-Modus ein-/ausschalten (Strg+Umschalt+F)" aria-label="Fokus-Modus ein-/ausschalten" aria-pressed="false">◎</button>
        </div>
      </div>
      <div class="format-toolbar" id="formatToolbar">
        <div class="toolbar-group">
          <span class="toolbar-group-label">Formatierung</span>
          <div class="toolbar-group-controls">
            <select class="font-size-select" id="editorFontSizeSelect" title="Editor-Schriftgröße" aria-label="Editor-Schriftgröße">
              <option value="12">12px</option>
              <option value="13">13px</option>
              <option value="14">14px</option>
              <option value="16">16px</option>
              <option value="18">18px</option>
            </select>
            <button type="button" class="icon-btn" id="btnEmoji" title="Icon/Emoji einfügen" aria-label="Icon/Emoji einfügen">😀</button>
            <button type="button" data-fmt="bold" title="Fett (**Text**)"><strong>F</strong></button>
            <button type="button" data-fmt="italic" title="Kursiv (*Text*)"><em>K</em></button>
            <button type="button" data-fmt="strike" title="Durchgestrichen (~~Text~~)"><s>D</s></button>
            <button type="button" data-fmt="underline" title="Unterstrichen (&lt;u&gt;Text&lt;/u&gt;)"><u>U</u></button>
            <button type="button" class="icon-btn" id="btnHeadingMenu" title="Überschrift auswählen" aria-label="Überschrift auswählen" aria-haspopup="menu" aria-expanded="false">H ▾</button>
          </div>
        </div>
        <div class="toolbar-group">
          <span class="toolbar-group-label">Listen</span>
          <div class="toolbar-group-controls">
            <button type="button" data-fmt="ul" title="Aufzählung (- Punkt)">•</button>
            <button type="button" data-fmt="ol" title="Nummerierte Liste (1. Punkt)">1.</button>
            <button type="button" data-fmt="checklist" title="Checkliste (- [ ] Aufgabe)">☑</button>
          </div>
        </div>
        <div class="toolbar-group">
          <span class="toolbar-group-label">Einfügen</span>
          <div class="toolbar-group-controls">
            <button type="button" data-fmt="link" title="Externen Link einfügen ([Text](URL))" aria-label="Externen Link einfügen">⛓</button>
            <button type="button" data-fmt="wikilink" title="Wikilink zu einer vorhandenen Notiz einfügen ([[Notizname]])" aria-label="Wikilink zu einer vorhandenen Notiz einfügen"><span aria-hidden="true" style="display:inline-block;white-space:nowrap;font-size:11px;line-height:1;">[[]]</span></button>
            <button type="button" id="btnTable" title="Neue Tabelle einfügen" aria-label="Neue Tabelle einfügen">▦</button>
          </div>
        </div>
        <div class="toolbar-group">
          <span class="toolbar-group-label">Markdown</span>
          <div class="toolbar-group-controls">
            <button type="button" data-fmt="code" title="Code-Block (dreifache Backticks)">{ }</button>
            <button type="button" data-fmt="quote" title="Markdown-Zitat einfügen" aria-label="Markdown-Zitat einfügen">&gt;</button>
            <button type="button" id="btnCallout" title="Callout einfügen">▤</button>
          </div>
        </div>
      </div>
      <div class="toolbar-group toolbar-document-group">
        <span class="toolbar-group-label">Dokument</span>
        <div class="toolbar-group-controls">
          <button type="button" class="icon-btn" id="btnExport" title="Notiz exportieren" aria-label="Notiz exportieren"><img class="lib-icon ui-action-icon" src="assets/icon-library/actions/download.svg" alt=""></button>
          <button type="button" class="icon-btn" id="btnSaveAsTemplate" title="Als eigene Vorlage speichern" aria-label="Als Vorlage speichern"><img class="lib-icon ui-action-icon" src="assets/icon-library/docs/clipboard.svg" alt=""></button>
        </div>
      </div>
    </div>
    <div class="note-split mode-split" id="noteSplit">
      <div id="editorContainer" class="editor-pane"></div>
      <div class="split-resizer" id="splitResizer" title="Ziehen zum Verändern der Breite"></div>
      <div id="previewContainer" class="preview-pane" tabindex="0"></div>
    </div>
    <div class="note-bottombar">
      <span id="statLines">0 Zeilen</span>
      <span id="statWords">0 Wörter</span>
      <span class="spacer"></span>
      <span id="statCursor">Zeile 1, Spalte 1</span>
      <span id="statSaved"></span>
    </div>
  `;

  // Die Werkzeugleiste wird bei jedem Notizwechsel neu aufgebaut. Der neue
  // Fokus-Button übernimmt deshalb unmittelbar den bestehenden Body-Zustand.
  // Beim Wechsel zwischen Notizen bleibt der Modus aktiv, ohne dafür eine
  // zweite Statusvariable einzuführen.
  setFocusMode(document.body.classList.contains('focus-mode'));

  applyViewMode();
  document.getElementById('viewToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    state.viewMode = btn.dataset.mode;
    applyViewMode();
    fs.setProjectSetting('viewMode', state.viewMode).catch(() => {});
  });

  // Sync-Scroll: Standard an, außer der Nutzer hat es zuvor bewusst
  // ausgeschaltet (fs.setProjectSetting, gleiches Muster wie iconFavorites).
  const btnSyncScroll = document.getElementById('btnSyncScroll');
  let syncScrollOn = state.project?.config?.syncScrollEnabled !== false;
  setSyncScrollEnabled(syncScrollOn);
  btnSyncScroll.classList.toggle('active', syncScrollOn);
  btnSyncScroll.addEventListener('click', () => {
    syncScrollOn = !syncScrollOn;
    setSyncScrollEnabled(syncScrollOn);
    btnSyncScroll.classList.toggle('active', syncScrollOn);
    fs.setProjectSetting('syncScrollEnabled', syncScrollOn).catch(() => {});
  });

  document.getElementById('btnFocusMode').addEventListener('click', () => toggleFocusMode({ focusWorkArea: true }));

  const fontSizeSelect = document.getElementById('editorFontSizeSelect');
  const storedFontSize = Number(state.project?.config?.editorFontSize) || EDITOR_FONT_SIZE_DEFAULT;
  fontSizeSelect.value = String(storedFontSize);
  fontSizeSelect.addEventListener('change', async () => {
    const px = applyEditorFontSize(Number(fontSizeSelect.value));
    try { await fs.setProjectSetting('editorFontSize', px); }
    catch (err) { console.error('[Archiv Wiki] Editor-Schriftgröße konnte nicht gespeichert werden:', err); }
  });

  wireEditorContextMenus();
  wireImageDrop();

  // Split-Ansicht per Ziehen in der Breite verstellbar. Reset auf 50/50 bei
  // jedem erneuten Öffnen einer Notiz (kein Persistieren über Notizen hinweg
  // nötig — der Container wird bei jeder Navigation ohnehin neu aufgebaut).
  // Bugfix (Audit-Punkt 8, echtes Event-Listener-Leck): mousemove/mouseup auf
  // document liefen vorher bei JEDEM Notiz-Wechsel erneut rein, ohne die
  // vorherigen je zu entfernen — bei häufigem Wechsel sammelten sich beliebig
  // viele verwaiste Listener an. Jetzt: nur noch das (leichtgewichtige)
  // mousedown auf den jeweils aktuellen Trenner selbst wird pro Notiz neu
  // gesetzt (der Trenner wird ohnehin komplett neu erzeugt, das ist
  // unproblematisch) — mousemove/mouseup laufen einmalig auf Modulebene
  // (siehe splitResizerState/wireSplitResizerGlobalListenersOnce weiter unten).
  wireSplitResizer();

  // Gespeicherte Scrollposition wiederherstellen (Nutzer-Feature) — nur
  // wenn tatsächlich ein Wert für GENAU diese Notiz vorliegt. Erst nach
  // einem requestAnimationFrame anwenden, damit der Browser das Layout
  // (reale Inhaltshöhe) vorher fertig berechnet hat — sonst würde der
  // Wert bei einem noch nicht vollständig gemessenen Bereich stillschweigend
  // auf die aktuell verfügbare, zu kleine Höhe gekappt.
  const savedScroll = state.project?.config?.noteScrollPositions?.[relPath];
  if (savedScroll) {
    setTimeout(() => {
      const editorScrollEl = document.querySelector('.cm-scroller');
      const previewScrollEl = document.getElementById('previewContainer');
      if (editorScrollEl && typeof savedScroll.editor === 'number') editorScrollEl.scrollTop = savedScroll.editor;
      if (previewScrollEl && typeof savedScroll.preview === 'number') previewScrollEl.scrollTop = savedScroll.preview;
    }, 120);
  }

  const tagsInput = document.getElementById('noteTagsInput');
  const titleInput = document.getElementById('noteTitleInput');
  const dirtyLabel = document.getElementById('dirtyLabel');
  const statLines = document.getElementById('statLines');
  const statWords = document.getElementById('statWords');
  const statCursor = document.getElementById('statCursor');
  const statSaved = document.getElementById('statSaved');
  const btnPinNote = document.getElementById('btnPinNote');
  btnPinNote.addEventListener('click', async () => {
    const nowPinned = !node.frontmatter?.pinned;
    await fs.saveNote(relPath, undefined, { pinned: nowPinned || null });
    btnPinNote.textContent = nowPinned ? '★' : '☆';
    btnPinNote.classList.toggle('active', nowPinned);
    btnPinNote.title = nowPinned ? 'Von Favoriten entfernen' : 'Als Favorit anpinnen';
    if (node.frontmatter) node.frontmatter.pinned = nowPinned || undefined;
  });

  const categoryBadge = document.getElementById('noteCategoryBadge');
  const dateEl = els.topbarNoteDates;

  // Bug-Fix: Der Speichern-Button hatte bislang KEINEN Klick-Handler — nur
  // das Ctrl+S-Tastenkürzel (im globalen keydown-Listener) hat je gespeichert.
  document.getElementById('btnSave').addEventListener('click', () => saveNow(currentOnSaved, currentOnSaveError));

  document.getElementById('btnDeleteNote').addEventListener('click', async () => {
    if (!await showConfirmDialog({
      title: 'Notiz in den Papierkorb?',
      message: 'Die Notiz kann später aus dem Papierkorb wiederhergestellt werden.',
      confirmLabel: 'In den Papierkorb',
      danger: true
    })) return;
    closeEditor();
    void navigateAfterEntryMutation('#home');
    await fs.deleteEntry(relPath);
    await refreshAll();
  });

  document.getElementById('btnEmoji').addEventListener('click', (e) => {
    e.stopPropagation();
    showIconPicker(document.getElementById('btnEmoji'));
  });

  // Formatierungs-Buttons: möglichst echte Markdown-Syntax (kein Schriftfarbe/
  // -größe/-art — das gibt es in Standard-Markdown nicht, siehe Absprache).
  // Ausnahme: Unterstreichen hat KEIN eigenes Markdown-Zeichen (anders als
  // Fett/Kursiv/Durchgestrichen) — <u>...</u> ist die im Markdown-Umfeld
  // übliche Lösung dafür (GitHub, Obsidian usw. rendern das genauso), wird
  // von unserem GFM-Renderer bereits unverändert durchgereicht.
  document.getElementById('formatToolbar').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-fmt]');
    if (!btn) return;
    const fmt = btn.dataset.fmt;
    if (fmt === 'bold') wrapSelection('**', '**', 'Fetter Text');
    else if (fmt === 'italic') wrapSelection('*', '*', 'Kursiver Text');
    else if (fmt === 'strike') wrapSelection('~~', '~~', 'Durchgestrichener Text');
    else if (fmt === 'underline') wrapSelection('<u>', '</u>', 'Unterstrichener Text');
    else if (fmt === 'link') {
      const url = await showPromptModal({ title: 'Link-URL', defaultValue: 'https://' });
      if (url) wrapSelection('[', `](${url})`, 'Linktext');
    }
    else if (fmt === 'wikilink') {
      const selectedText = getEditorSelectionText();
      const result = await showWikiLinkModal(selectedText);
      if (!result || !result.target) return;
      const syntax = result.display && result.display !== result.target
        ? `[[${result.target}|${result.display}]]`
        : `[[${result.target}]]`;
      insertAtCursor(syntax);
    }
    else if (fmt === 'quote') {
      const selectedText = getEditorSelectionText();
      if (selectedText) {
        const quoted = selectedText
          .split('\n')
          .map(line => `> ${line}`)
          .join('\n');
        deleteEditorSelection();
        insertAtCursor(quoted);
      } else {
        insertAtCursor('> Text');
      }
    }
    else if (fmt === 'code') insertAtCursor('\n```\nCode hier\n```\n');
    else if (fmt === 'ul') insertAtCursor('\n- Punkt\n');
    else if (fmt === 'ol') insertAtCursor('\n1. Punkt\n');
    else if (fmt === 'checklist') insertAtCursor('\n- [ ] Aufgabe\n');
  });

  document.getElementById('btnHeadingMenu').addEventListener('click', (e) => {
    e.stopPropagation();
    const trigger = e.currentTarget;
    trigger.setAttribute('aria-expanded', 'true');
    const menu = createHtmlContextMenu({
      className: 'context-menu',
      trigger,
      label: 'Überschrift auswählen',
      html: [1, 2, 3, 4, 5, 6]
        .map(level => `<button type="button" data-heading-level="${level}">H${level}</button>`)
        .join('') + '<hr><button type="button" data-heading-level="0">Keine Überschrift</button>',
      onDismiss: () => trigger.setAttribute('aria-expanded', 'false')
    });
    menu.addEventListener('click', (menuEvent) => {
      const item = menuEvent.target.closest('[data-heading-level]');
      if (!item) return;
      const level = Number(item.dataset.headingLevel);
      closeHtmlContextMenu(menu, { restoreFocus: false, reason: 'action' });
      trigger.setAttribute('aria-expanded', 'false');
      transformCurrentLine(headingTransform(level));
    });
  });

  document.getElementById('btnTable').addEventListener('click', (e) => {
    e.stopPropagation();
    showTablePicker(e.currentTarget);
  });

  document.getElementById('btnCallout').addEventListener('click', (e) => {
    e.stopPropagation();
    showCalloutPicker(e.currentTarget);
  });

  // -------------------------------------------------------------------------
  // Export: PDF/HTML exportieren die AKTUELLE Notiz, ZIP sichert das ganze
  // Projekt (Ordner-Scope, deshalb hier bewusst mit angeboten statt an einer
  // pro-Notiz-Stelle versteckt — man denkt in dem Moment ohnehin an "Export").
  // -------------------------------------------------------------------------
  document.getElementById('btnExport').addEventListener('click', async (e) => {
    e.stopPropagation();
    const choice = await showExportMenu(document.getElementById('btnExport'));
    if (!choice) return;
    const safeTitle = (titleInput.value.trim() || 'notiz').replace(/[\\/:*?"<>|]/g, '_') || 'notiz';

    try {
      if (choice === 'md') {
        const result = await window.archivAPI.exportApi.saveMarkdown(getEditorContent(), safeTitle + '.md');
        if (result?.saved) await showMessageDialog({ title: 'Export abgeschlossen', message: `Markdown-Datei exportiert nach:\n${result.filePath}` });
      } else if (choice === 'html') {
        const noteIndex = fs.flattenNotes(state.tree).map(note => ({
          title: note.frontmatter.title || note.name,
          relPath: note.relPath
        }));
        const sanitizedBodyHtml = renderMarkdownForExport(getEditorContent(), {
          noteIndex,
          projectPath: state.project?.path || null
        });
        const html = buildStandaloneNoteHtml({
          title: titleInput.value.trim() || 'Notiz',
          tags: tagsInput.value.split(',').map(t => t.trim()).filter(Boolean),
          category: categoryBadge.textContent,
          sanitizedBodyHtml,
          katexCss: getLoadedKatexCss()
        });
        const result = await window.archivAPI.exportApi.saveHtml(html, safeTitle + '.html');
        if (result?.saved) await showMessageDialog({ title: 'Export abgeschlossen', message: `HTML exportiert nach:\n${result.filePath}` });
      } else if (choice === 'pdf') {
        const result = await window.archivAPI.exportApi.notePdf(safeTitle + '.pdf');
        if (result?.saved) await showMessageDialog({ title: 'Export abgeschlossen', message: `PDF exportiert nach:\n${result.filePath}` });
      } else if (choice === 'zip') {
        const result = await window.archivAPI.exportApi.projectZip();
        if (result?.saved) await showMessageDialog({ title: 'Export abgeschlossen', message: `Wiki-Export erstellt: \n${result.filePath}` });
      }
    } catch (err) {
      await showMessageDialog({ title: 'Export fehlgeschlagen', message: err.message });
      console.error('[Archiv Wiki] Export fehlgeschlagen', err);
    }
  });

  document.getElementById('btnExport').addEventListener('keydown', (e) => {
    if (!isContextMenuKeyboardEvent(e)) return;
    e.preventDefault();
    showExportMenu(document.getElementById('btnExport'));
  });
  document.getElementById('btnExport').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showExportMenu(document.getElementById('btnExport'));
  });
  document.getElementById('btnSaveAsTemplate').addEventListener('click', saveNoteAsTemplate);

  categoryBadge.tabIndex = 0;
  categoryBadge.setAttribute('role', 'button');
  categoryBadge.setAttribute('aria-label', 'Kategorie der Notiz ändern');
  const openCategoryMoveMenu = (e) => {
    e.stopPropagation();
    const currentCategoryRelPath = relPath.includes('/') ? relPath.split('/').slice(0, -1).join('/') : '';
    const options = collectSubCategories(state.tree).filter(c => c.relPath !== currentCategoryRelPath);
    if (options.length === 0) return;
    showCategoryMoveMenu(categoryBadge, options, async (targetRelPath) => {
      const moved = await mutateEntryPath({
        sourceRelPath: relPath,
        actionLabel: 'Verschieben',
        mutate: () => fs.moveEntry(relPath, targetRelPath)
      });
      if (!moved) return;
      showMoveUndoToast(relPath, moved);
    });
  };
  categoryBadge.addEventListener('click', openCategoryMoveMenu);
  categoryBadge.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openCategoryMoveMenu(e);
  });
  categoryBadge.addEventListener('keydown', (e) => {
    if (isContextMenuKeyboardEvent(e) || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openCategoryMoveMenu(e);
    }
  });


  function updateCounts(text) {
    const lines = text.length ? text.split('\n').length : 0;
    const words = text.trim().length ? text.trim().split(/\s+/).length : 0;
    statLines.textContent = `${lines} Zeile${lines === 1 ? '' : 'n'}`;
    // Lesezeit grob nach 200 Wörtern/Minute (üblicher Richtwert), aufgerundet
    // auf volle Minuten — unter einer Minute wird "< 1 Min." gezeigt statt "0 Min.".
    const readMinutes = Math.ceil(words / 200);
    const readLabel = words === 0 ? '' : ` · ${readMinutes} Min. Lesezeit`;
    statWords.textContent = `${words} Wort${words === 1 ? '' : 'e'}${readLabel}`;
  }

  function onSaved(result) {
    dirtyLabel.textContent = '✓ gespeichert';
    dirtyLabel.classList.remove('is-dirty', 'has-error');
    // Sanfte Bestätigungs-Puls-Animation (Nutzer-Feature) — reine CSS-
    // Animation (siehe components.css), hier nur die auslösende Klasse.
    // animationend statt fixem setTimeout: läuft exakt so lange, wie die
    // CSS-Animation selbst dauert, unabhängig davon falls deren Dauer später
    // einmal angepasst wird. Vorher entfernen + reflow erzwingen, falls die
    // Klasse vom letzten Speichern (unwahrscheinlich, aber möglich bei sehr
    // schnell aufeinanderfolgenden Speicherungen) noch vorhanden wäre — sonst
    // würde die Animation beim erneuten Hinzufügen derselben Klasse nicht
    // neu starten.
    dirtyLabel.classList.remove('save-pulse');
    void dirtyLabel.offsetWidth; // Reflow erzwingen
    dirtyLabel.classList.add('save-pulse');
    dirtyLabel.addEventListener('animationend', () => dirtyLabel.classList.remove('save-pulse'), { once: true });
    statSaved.textContent = 'gespeichert ' + formatTime(new Date());
    if (result?.frontmatter) {
      categoryBadge.textContent = result.frontmatter.category || result.frontmatter.mainCategory || '';
      if (result.frontmatter.created) {
        dateEl.textContent = `erstellt ${formatDate(result.frontmatter.created)} · geändert ${formatDate(result.frontmatter.modified)}`;
      }
    }
    fs.getTree().then(t => { state.tree = t; renderNavTree(); });
  }
  currentOnSaved = onSaved;

  // Bugfix (Audit-Punkt 1, KRITISCH): sichtbare Fehlermeldung statt lautloser
  // unbehandelter Ausnahme, falls das Speichern fehlschlägt (z. B. voller
  // Datenträger). Bleibt stehen, bis der NÄCHSTE Speicherversuch (automatisch
  // oder Strg+S) erfolgreich ist — onSaved() setzt has-error dann korrekt zurück.
  function onSaveError(err) {
    dirtyLabel.textContent = err?.code === 'NOTE_CONFLICT'
      ? '⚠ Außerhalb geändert – nicht gespeichert'
      : '⚠ Speichern fehlgeschlagen';
    dirtyLabel.classList.add('has-error');
    dirtyLabel.title = err?.message || 'Der Fehler konnte nicht genauer bestimmt werden.';
  }
  currentOnSaveError = onSaveError;

  const { frontmatter, body } = await openNoteInEditor({
    relPath,
    editorContainer: document.getElementById('editorContainer'),
    previewContainer: document.getElementById('previewContainer'),
    tabSize: state.project?.config?.editor?.tabSize ?? 2,
    autoSaveSeconds: state.project?.config?.editor?.autoSave ?? 30,
    projectPath: state.project?.path,
    getNoteIndex: () => fs.flattenNotes(state.tree).map(n => ({
      title: n.frontmatter?.title || n.name.replace(/\.md$/, ''),
      relPath: n.relPath
    })),
    onChange: (dirty, text) => {
      if (!dirtyLabel.classList.contains('has-error')) {
        dirtyLabel.textContent = dirty ? '● ungespeichert' : '✓ gespeichert';
      }
      dirtyLabel.classList.toggle('is-dirty', dirty);
      if (typeof text === 'string') updateCounts(text);
    },
    onCursorActivity: (pos) => { statCursor.textContent = `Zeile ${pos.line}, Spalte ${pos.column}`; },
    onSaved,
    onSaveError,
    // Slash-Befehl "/table" (Nutzer-Feature) — öffnet denselben Tabellen-
    // Picker wie Werkzeugleiste/Rechtsklick-Menü, keine doppelte Logik.
    onSlashCommand: (command, pos) => { if (command === 'table') showTablePicker(pos); }
  });

  // Nach dem vollständigen Aufbau erhält der sichtbare Arbeitsbereich den
  // Fokus. Editor und Split sind sofort schreibbereit; in der reinen
  // Vorschau bleibt der wiederhergestellte Ansichtsmodus maßgeblich.
  requestAnimationFrame(() => {
    if (getOpenRelPath() !== relPath) return;
    focusCurrentWritingArea();
  });

  await renderIncomingLinks(relPath, title);

  // Wiki-Links [[Notizname]] in der Vorschau: Klick navigiert zur Notiz,
  // oder bietet bei fehlender Notiz an, sie in der aktuellen Unterkategorie anzulegen.
  // Schutz gegen Race Condition: Wenn währenddessen (durch schnelles Klicken)
  // schon zu einer anderen Seite navigiert wurde, existiert previewContainer
  // hier eventuell nicht mehr (Home/Papierkorb haben ein anderes Template) —
  // dann einfach abbrechen, statt auf null-Elementen abzustürzen.
  if (getOpenRelPath() !== relPath) return;
  const previewEl = document.getElementById('previewContainer');
  if (!previewEl) return;
  previewEl.addEventListener('click', async (e) => {
    const checkbox = e.target.closest('input[type="checkbox"][data-task-index]');
    if (checkbox) {
      // Der Browser hat den Haken-Zustand zu diesem Zeitpunkt bereits nativ
      // umgeschaltet (checkbox.checked ist schon der NEUE Wert) — wir müssen
      // nur noch die entsprechende Zeile in der Markdown-Quelle nachziehen.
      const idx = Number(checkbox.dataset.taskIndex);
      const updated = setNthCheckboxInMarkdown(getEditorContent(), idx, checkbox.checked);
      setEditorContent(updated); // löst automatisch Re-Render + Speichern-Pipeline aus (siehe editor.js onChange)
      return;
    }
    // Bild-Größe per Prozent-Knopf (ersetzt das vorherige Ziehen) — gleiches,
    // bewährtes Muster wie beim Checkbox-Umschalten: einfache, delegierte
    // Klick-Erkennung, keine laufenden Beobachter nötig.
    const pctBtn = e.target.closest('.img-size-buttons button[data-img-pct]');
    if (pctBtn) {
      const wrap = pctBtn.closest('.img-size-wrap');
      const idx = Number(wrap?.dataset.imgIndex);
      if (Number.isNaN(idx)) return;
      const updated = setNthImageWidthInMarkdown(getEditorContent(), idx, pctBtn.dataset.imgPct);
      setEditorContent(updated);
      return;
    }
    // Bild-Zoom (Nutzer-Feature): läuft NACH dem obigen Prozent-Knopf-
    // Handler, der bei Treffer bereits zurückkehrt — ein Klick auf einen
    // der Größen-Knöpfe erreicht diesen Code also gar nicht erst.
    const zoomImg = e.target.closest('.img-size-wrap img');
    if (zoomImg) {
      showImageLightbox(zoomImg.src, zoomImg.alt);
      return;
    }
    const copyBtn = e.target.closest('.copy-btn');
    if (copyBtn) {
      const code = copyBtn.closest('.code-block')?.querySelector('code');
      if (!code) return;
      try {
        await window.archivAPI.clipboard.writeText(code.textContent);
        copyBtn.textContent = 'Kopiert ✓';
        copyBtn.classList.add('copied');
        setTimeout(() => { copyBtn.textContent = 'Kopieren'; copyBtn.classList.remove('copied'); }, 1500);
      } catch {
        copyBtn.textContent = 'Fehler';
        setTimeout(() => { copyBtn.textContent = 'Kopieren'; }, 1500);
      }
      return;
    }
    const target = e.target.closest('.wiki-link');
    if (!target) return;
    e.preventDefault();
    if (target.dataset.wikilinkTarget) {
      void navigateTo('#note/' + encodeURIComponent(target.dataset.wikilinkTarget));
    } else if (target.dataset.wikilinkCreate) {
      const name = target.dataset.wikilinkCreate;
      const currentSubCategory = relPath.split('/').slice(0, -1).join('/');
      if (!currentSubCategory || !await showConfirmDialog({
        title: 'Notiz anlegen?',
        message: `Die Notiz "${name}" existiert noch nicht. Soll sie in dieser Unterkategorie angelegt werden?`,
        confirmLabel: 'Anlegen'
      })) return;
      const created = await fs.createNote(currentSubCategory, name);
      await refreshAll();
      void navigateTo('#note/' + encodeURIComponent(created.relPath));
    }
  });

  // Doppelklick auf eine Tabelle öffnet das eigene Bearbeitungsfenster
  // (Nutzer-Entscheidung: Option C statt echtem WYSIWYG oder reinen
  // Editor-Schreibhilfen).
  previewEl.addEventListener('dblclick', (e) => {
    const table = e.target.closest('table[data-table-index]');
    if (!table) return;
    showTableEditorModal(Number(table.dataset.tableIndex));
  });

  updateCounts(body || '');
  categoryBadge.textContent = frontmatter?.category || frontmatter?.mainCategory || '';
  tagsInput.value = (frontmatter?.tags || []).join(', ');
  dateEl.textContent = frontmatter?.created ? `erstellt ${formatDate(frontmatter.created)} · geändert ${formatDate(frontmatter.modified)}` : '';

  // -------------------------------------------------------------------------
  // Backlink-Note: optionale, manuelle Notiz-zu-Notiz-Verknüpfung ("gehört
  // zu → X"), UNABHÄNGIG vom Haupt-/Unterkategorie-Ordnersystem — für Fälle,
  // in denen eine eigene Unterkategorie übertrieben wäre (z. B. eine kleine
  // Konfigurationsnotiz, die inhaltlich zu einer anderen gehört).
  // -------------------------------------------------------------------------
  const backlinkRow = document.getElementById('backlinkRow');

  function renderBacklinkRow(fm) {
    const targetRelPath = fm?.backlinkTo;
    if (!targetRelPath) {
      backlinkRow.innerHTML = `<button type="button" class="backlink-add" id="btnAddBacklink">+ Verknüpfung zu einer Notiz</button>`;
      document.getElementById('btnAddBacklink').addEventListener('click', openBacklinkPicker);
      return;
    }
    const targetNode = fs.findNode(state.tree, targetRelPath);
    if (targetNode) {
      const targetTitle = targetNode.frontmatter?.title || targetNode.name;
      backlinkRow.innerHTML = `
        <span class="backlink-icon">🔗</span>
        <span class="backlink-label">gehört zu →</span>
        <a href="#" class="backlink-target" id="backlinkTarget">${escapeHtml(targetTitle)}</a>
        <button type="button" class="backlink-remove" id="btnRemoveBacklink" title="Verknüpfung entfernen" aria-label="Verknüpfung entfernen">✕</button>
      `;
      document.getElementById('backlinkTarget').addEventListener('click', (e) => {
        e.preventDefault();
        void navigateTo('#note/' + encodeURIComponent(targetRelPath));
      });
    } else {
      // Ziel wurde gelöscht/verschoben, ohne dass die Verknüpfung mitgepflegt wurde.
      backlinkRow.innerHTML = `
        <span class="backlink-icon backlink-missing">🔗</span>
        <span class="backlink-label backlink-missing">gehört zu → (Notiz nicht mehr vorhanden)</span>
        <button type="button" class="backlink-remove" id="btnRemoveBacklink" title="Verknüpfung entfernen" aria-label="Verknüpfung entfernen">✕</button>
      `;
    }
    document.getElementById('btnRemoveBacklink').addEventListener('click', async () => {
      await fs.saveNote(relPath, undefined, { backlinkTo: null });
      renderBacklinkRow({ ...fm, backlinkTo: null });
    });
  }

  async function openBacklinkPicker() {
    const options = fs.flattenNotes(state.tree)
      .filter(n => n.relPath !== relPath)
      .map(n => ({ relPath: n.relPath, label: n.frontmatter?.title || n.name }));
    if (options.length === 0) {
      await showMessageDialog({
        title: 'Keine andere Notiz vorhanden',
        message: 'Es gibt noch keine andere Notiz, mit der eine Verknüpfung erstellt werden kann.'
      });
      return;
    }
    const targetRelPath = await showCategoryPickerModal(options, 'Verknüpfen mit welcher Notiz?');
    if (!targetRelPath) return;
    await fs.saveNote(relPath, undefined, { backlinkTo: targetRelPath });
    renderBacklinkRow({ backlinkTo: targetRelPath });
  }

  renderBacklinkRow(frontmatter);

  titleInput.addEventListener('blur', async () => {
    const newTitle = titleInput.value.trim();
    if (!newTitle || newTitle === title) return;
    await mutateEntryPath({
      sourceRelPath: relPath,
      actionLabel: 'Umbenennen',
      mutate: () => fs.renameEntry(relPath, newTitle)
    });
  });

  let committedTagsValue = (frontmatter?.tags || []).join(', ');

  async function commitTags() {
    const tags = [...new Set(
      tagsInput.value
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean)
    )];
    const normalizedValue = tags.join(', ');

    // Enter und der direkt folgende Blur dürfen dieselbe Änderung nicht
    // doppelt schreiben. Gespeichert wird ausschließlich der Frontmatter-
    // Patch für Tags; der Notizinhalt bleibt unangetastet.
    if (normalizedValue === committedTagsValue) {
      tagsInput.value = normalizedValue;
      return;
    }

    const result = await fs.saveNote(relPath, undefined, { tags });
    committedTagsValue = normalizedValue;
    tagsInput.value = normalizedValue;

    // Den aktuell verwendeten Knoten sofort mitführen, damit alle lokalen
    // Auswertungen bereits vor einem vollständigen Neu-Rendern korrekt sind.
    if (!node.frontmatter) node.frontmatter = {};
    node.frontmatter.tags = result?.frontmatter?.tags || tags;

    // Dashboard, Tag-Übersicht, Navigation und Suche lesen aus state.tree.
    // Nur diesen gemeinsamen Datenstand neu laden; die offene Notiz und der
    // Editor werden dabei bewusst nicht neu gerendert.
    state.tree = await fs.getTree();
    renderNavTree();

    const indexRebuild = rebuildIndex();
    refreshSearchDropdownForCurrentQuery();
    indexRebuild
      .then(rebuildResult => {
        if (rebuildResult.applied) refreshSearchDropdownForCurrentQuery();
      })
      .catch(err => {
        console.error('[Archiv Wiki] Such-Index konnte nach Tag-Änderung nicht aktualisiert werden', err);
      });
  }

  tagsInput.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    await commitTags();
  });

  tagsInput.addEventListener('blur', () => {
    commitTags().catch(err => {
      console.error('[Archiv Wiki] Tags konnten nicht aktualisiert werden', err);
    });
  });
}

// ---------------------------------------------------------------------------
// Kleines Dropdown am Kategorie-Badge im Editor: Notiz in andere Kategorie
// verschieben, ohne extra über die Sidebar zu müssen.
// ---------------------------------------------------------------------------
function showCategoryMoveMenu(anchorEl, options, onSelect) {
  const menu = createHtmlContextMenu({
    trigger: anchorEl,
    label: 'Kategorie auswählen',
    html: `
      <div class="context-menu-label">Verschieben nach:</div>
      ${renderSimpleContextMenuItems(options.map(c => ({
        label: `→ ${escapeHtml(c.label)}`,
        data: { target: c.relPath }
      })))}
    `
  });

  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-target]');
    if (!btn) return;
    closeHtmlContextMenu(menu, { reason: 'action' });
    onSelect(btn.dataset.target);
  });
}

// ---------------------------------------------------------------------------
// Icon-/Emoji-Picker für den Editor. Kuratierte Auswahl gängiger Symbole,
// gruppiert nach Kategorie. Fügt per insertAtCursor() an der Cursorposition
// im CodeMirror-Editor ein.
// ---------------------------------------------------------------------------
const EMOJI_GROUPS = {
  'Smileys & Gesichter': [
    ['😀','lachen freude'], ['😄','lachen freude augen'], ['😁','grinsen zähne'], ['😊','lächeln zufrieden'],
    ['🙂','lächeln leicht'], ['🙃','umgedreht ironie'], ['😉','zwinkern'], ['😍','verliebt herzaugen'],
    ['🥰','verliebt herzen'], ['😘','kuss'], ['😋','lecker genuss'], ['😛','zunge frech'],
    ['🤔','nachdenken frage'], ['🤨','skeptisch zweifel'], ['😐','neutral'], ['😑','genervt neutral'],
    ['😶','sprachlos still'], ['🙄','augen rollen genervt'], ['😏','süffisant schmunzeln'], ['😴','schlafen müde'],
    ['🥱','gähnen müde'], ['😪','müde schläfrig'], ['😌','entspannt zufrieden'], ['😎','cool sonnenbrille'],
    ['🤩','begeistert sterne'], ['🥳','feiern party'], ['😅','schweiß nervös lachen'], ['😂','lachtränen'],
    ['🤣','totlachen'], ['😇','engel unschuldig'], ['🥲','lächeln träne'], ['😢','weinen traurig'],
    ['😭','laut weinen'], ['😤','wütend schnauben'], ['😠','wütend ärger'], ['😡','sehr wütend rot'],
    ['🤯','explodierender kopf überrascht'], ['😱','schock angst schreien'], ['😨','angst furcht'], ['😰','angstschweiß nervös'],
    ['😳','verlegen erröten'], ['🥵','heiß schwitzen'], ['🥶','kalt frieren'], ['🤒','krank fieber'],
    ['🤕','verletzt verband'], ['🤢','übel ekel'], ['🤮','erbrechen übel'], ['🤧','niesen erkältet'],
    ['😷','maske krank'], ['🥴','schwindelig verwirrt'], ['🤡','clown'], ['👻','geist gespenst'],
    ['💀','totenkopf tod'], ['👽','alien außerirdischer'], ['🤖','roboter']
  ],
  'Gesten & Körper': [
    ['👍','daumen hoch ok gut'], ['👎','daumen runter schlecht'], ['👏','klatschen applaus'], ['🙌','jubel hände hoch'],
    ['🤝','handschlag deal'], ['✌️','victory peace'], ['🤞','daumen drücken hoffnung'], ['👌','ok zeichen perfekt'],
    ['👊','faust'], ['✊','faust erhoben'], ['💪','muskel stark kraft'], ['🙏','bitte danke beten'],
    ['👋','winken hallo tschüss'], ['🤙','call me locker'], ['☝️','zeigefinger hoch'], ['👉','zeigen rechts'],
    ['👈','zeigen links'], ['👆','zeigen hoch'], ['👇','zeigen runter'], ['✋','stopp hand'],
    ['🤚','hand hoch'], ['🖐️','hand fünf finger'], ['🖖','vulkanier gruß'], ['🫶','herz hände'],
    ['❤️','herz liebe rot'], ['🧡','herz orange'], ['💛','herz gelb'], ['💚','herz grün'],
    ['💙','herz blau'], ['💜','herz lila'], ['🖤','herz schwarz'], ['🤍','herz weiß'],
    ['💔','herz gebrochen trennung'], ['💕','herzen liebe'], ['💯','hundert perfekt volltreffer'], ['👀','augen schauen'],
    ['👁️','auge'], ['🧠','gehirn denken'], ['🦴','knochen']
  ],
  'Status & Symbole': [
    ['✅','haken erledigt fertig grün'], ['❌','kreuz falsch nein'], ['⚠️','warnung achtung'], ['❗','ausrufezeichen wichtig'],
    ['❓','fragezeichen unklar'], ['✔️','haken check'], ['☑️','checkbox erledigt'], ['🔴','rot punkt'],
    ['🟠','orange punkt'], ['🟡','gelb punkt'], ['🟢','grün punkt'], ['🔵','blau punkt'],
    ['🟣','lila punkt'], ['⚫','schwarz punkt'], ['⚪','weiß punkt'], ['🟤','braun punkt'],
    ['⭐','stern favorit'], ['🌟','glänzender stern'], ['✨','glitzer funkeln neu'], ['🚩','flagge markieren wichtig'],
    ['🏁','ziel fertig'], ['🔥','feuer hot trend'], ['💡','idee glühbirne tipp'], ['🔒','gesperrt privat'],
    ['🔓','entsperrt offen'], ['🔑','schlüssel zugang'], ['🗝️','alter schlüssel'], ['⏰','wecker zeit erinnerung'],
    ['⏱️','stoppuhr'], ['⌛','sanduhr wartend'], ['📌','pin anheften wichtig'], ['📍','standort ort'],
    ['🔖','lesezeichen merken'], ['🏷️','tag label'], ['🔗','link verknüpfung'], ['➕','plus hinzufügen'],
    ['➖','minus entfernen'], ['♻️','recycling wiederverwenden'], ['🔃','aktualisieren neu laden'], ['🔀','shuffle zufällig'],
    ['🆕','neu label'], ['🆗','ok label'], ['🆘','notfall hilfe sos'], ['🚫','verboten nicht erlaubt'],
    ['⛔','stopp verboten'], ['🚧','baustelle in arbeit'], ['♾️','unendlich']
  ],
  'Objekte & Technik': [
    ['💻','laptop computer'], ['🖥️','desktop computer bildschirm'], ['📱','smartphone handy'], ['⌨️','tastatur'],
    ['🖱️','maus computer'], ['🖨️','drucker'], ['💾','diskette speichern'], ['💿','cd disc'],
    ['📀','dvd'], ['🔌','stecker strom'], ['🔋','akku batterie'], ['🪫','akku leer'],
    ['📷','kamera foto'], ['📸','kamera blitz'], ['🎥','videokamera film'], ['🎧','kopfhörer musik'],
    ['🎤','mikrofon'], ['📡','satellit netzwerk'], ['🛰️','satellit'], ['🛠️','werkzeug reparatur'],
    ['🔧','schraubenschlüssel'], ['🔨','hammer werkzeug'], ['⚙️','zahnrad einstellungen'], ['🧰','werkzeugkasten'],
    ['📦','paket box'], ['🗄️','aktenschrank archiv'], ['🗃️','karteikasten'], ['🗂️','ordner register'],
    ['💡','glühbirne idee'], ['🔦','taschenlampe'], ['🕯️','kerze'], ['🔬','mikroskop wissenschaft'],
    ['🔭','teleskop'], ['⚗️','laborglas chemie'], ['🧪','reagenzglas experiment'], ['🧬','dna genetik']
  ],
  'Dokumente & Organisation': [
    ['📁','ordner'], ['📂','geöffneter ordner'], ['📄','dokument datei'], ['📝','notiz stift schreiben'],
    ['📋','klemmbrett liste'], ['📊','balkendiagramm statistik'], ['📈','diagramm steigend wachstum'], ['📉','diagramm fallend'],
    ['🗒️','notizblock'], ['🗓️','kalender planung'], ['📅','kalender datum'], ['📆','kalender abreiß'],
    ['📚','bücher'], ['📖','buch aufgeschlagen lesen'], ['🔍','lupe suchen'], ['🔎','lupe zoomen'],
    ['✂️','schere schneiden'], ['📎','büroklammer'], ['🖇️','büroklammern'], ['📐','geodreieck'],
    ['📏','lineal'], ['🖊️','stift'], ['🖋️','füller'], ['✏️','bleistift'],
    ['🗑️','papierkorb löschen'], ['📇','karteikarte'], ['🗞️','zeitung'], ['🧾','beleg quittung']
  ],
  'Pfeile & Navigation': [
    ['➡️','pfeil rechts'], ['⬅️','pfeil links'], ['⬆️','pfeil hoch'], ['⬇️','pfeil runter'],
    ['↗️','pfeil diagonal rechts oben'], ['↘️','pfeil diagonal rechts unten'], ['↙️','pfeil diagonal links unten'], ['↖️','pfeil diagonal links oben'],
    ['🔄','kreispfeil aktualisieren'], ['↩️','zurück rückgängig'], ['↪️','weiter vorwärts'], ['⤴️','pfeil hoch rechts'],
    ['⤵️','pfeil runter rechts'], ['🔼','dreieck hoch'], ['🔽','dreieck runter'], ['▶️','play abspielen'],
    ['⏸️','pause'], ['⏹️','stopp'], ['⏭️','nächster'], ['⏮️','vorheriger']
  ],
  'Natur & Wetter': [
    ['🌱','pflanze setzling wachsen'], ['🌳','baum'], ['🌲','tannenbaum'], ['🌴','palme'],
    ['🌵','kaktus'], ['🌸','kirschblüte'], ['🌼','blume'], ['🌻','sonnenblume'],
    ['🌹','rose'], ['🍀','kleeblatt glück'], ['🍁','ahornblatt herbst'], ['🌞','sonne lachend'],
    ['☀️','sonne'], ['🌙','mond'], ['🌛','mond gesicht'], ['⭐','stern'],
    ['☁️','wolke'], ['⛅','sonne wolken'], ['🌧️','regen'], ['⛈️','gewitter'],
    ['⚡','blitz'], ['❄️','schneeflocke'], ['☃️','schneemann'], ['🌈','regenbogen'],
    ['🔥','feuer'], ['💧','wassertropfen'], ['🌊','welle wasser'], ['🌍','erde weltkugel europa'],
    ['🐧','pinguin linux'], ['🐱','katze'], ['🐶','hund'], ['🦊','fuchs'],
    ['🐢','schildkröte langsam'], ['🦉','eule'], ['🐝','biene'], ['🦋','schmetterling']
  ],
  'Essen & Trinken': [
    ['☕','kaffee'], ['🍵','tee'], ['🧉','mate'], ['🥤','erfrischungsgetränk'],
    ['🍺','bier'], ['🍷','wein'], ['🥂','anstoßen sekt'], ['🍾','sekt flasche feiern'],
    ['🍕','pizza'], ['🍔','burger'], ['🌭','hotdog'], ['🥪','sandwich'],
    ['🍎','apfel'], ['🍌','banane'], ['🥐','croissant'], ['🍫','schokolade'],
    ['🍰','kuchen torte'], ['🎂','geburtstagstorte'], ['🍪','keks'], ['🍿','popcorn']
  ],
  'Aktivitäten & Reise': [
    ['⚽','fußball'], ['🎮','gaming controller'], ['🎲','würfel'], ['🎯','ziel dartscheibe'],
    ['🧩','puzzle rätsel'], ['🎸','gitarre musik'], ['🎧','kopfhörer'], ['🎬','film clapper'],
    ['✈️','flugzeug reise'], ['🚗','auto'], ['🚀','rakete start'], ['🛸','ufo'],
    ['🏠','haus zuhause'], ['🏢','gebäude büro'], ['🗺️','landkarte'], ['🧭','kompass richtung']
  ]
};

// Flache Liste aller Einträge (für die Suche), erzeugt aus EMOJI_GROUPS.
const EMOJI_FLAT = Object.values(EMOJI_GROUPS).flat();

const CALLOUT_PICKER_TYPES = [
  { type: 'note', icon: '📘', label: 'Notiz' },
  { type: 'tip', icon: '💡', label: 'Tipp' },
  { type: 'warning', icon: '⚠️', label: 'Warnung' },
  { type: 'danger', icon: '🚫', label: 'Gefahr' },
  { type: 'abstract', icon: '📋', label: 'Zusammenfassung' },
  { type: 'example', icon: '🧩', label: 'Beispiel' },
  { type: 'info', icon: 'ℹ️', label: 'Info' }
];

// Nutzer-Feature: Spalten- UND Zeilenzahl frei wählbar (vorher war die
// Zeilenzahl fest auf 1 Datenzeile gesetzt). rows zählt NUR die Datenzeilen,
// die Kopfzeile kommt automatisch immer zusätzlich dazu.
function buildMarkdownTable(columns, rows = 1) {
  const headerCells = Array.from({ length: columns }, (_, i) => `Spalte ${i + 1}`);
  const sepCells = Array.from({ length: columns }, () => '---');
  const dataRow = Array.from({ length: columns }, () => 'Zelle').join(' | ');
  const dataRows = Array.from({ length: rows }, () => `| ${dataRow} |`).join('\n');
  // Bugfix: GFM verlangt zwingend eine LEERZEILE vor einer Tabelle, sonst wird
  // sie (besonders direkt nach einer Überschrift, ohne Leerzeile dazwischen)
  // vom Markdown-Renderer gar nicht erst als Tabelle erkannt — deshalb hier
  // zwei Zeilenumbrüche am Anfang, nicht nur einer.
  return `\n\n| ${headerCells.join(' | ')} |\n| ${sepCells.join(' | ')} |\n${dataRows}\n`;
}

function showTablePicker(anchorOrPos) {
  document.querySelectorAll('.table-picker').forEach(m => m.remove());
  const picker = document.createElement('div');
  picker.className = 'table-picker emoji-picker';
  picker.innerHTML = `
    <div class="emoji-group-label">Tabelle einfügen</div>
    <label class="table-picker-field">
      <span>Spalten</span>
      <select id="tablePickerCols">${[2, 3, 4, 5, 6].map(n => `<option value="${n}">${n}</option>`).join('')}</select>
    </label>
    <label class="table-picker-field">
      <span>Datenzeilen</span>
      <select id="tablePickerRows">${[1, 2, 3, 4, 5, 6, 8, 10].map(n => `<option value="${n}">${n}</option>`).join('')}</select>
    </label>
    <button type="button" class="btn primary table-picker-confirm">Einfügen</button>
  `;
  document.body.appendChild(picker);

  let left, top;
  if (anchorOrPos instanceof HTMLElement) {
    const rect = anchorOrPos.getBoundingClientRect();
    left = rect.left; top = rect.bottom + 6;
  } else {
    left = anchorOrPos?.left ?? 20; top = anchorOrPos?.top ?? 20;
  }
  const pickerRect = picker.getBoundingClientRect();
  left = Math.min(left, window.innerWidth - pickerRect.width - 8);
  top = Math.min(top, window.innerHeight - pickerRect.height - 8);
  picker.style.left = Math.max(4, left) + 'px';
  picker.style.top = Math.max(4, top) + 'px';

  picker.querySelector('.table-picker-confirm').addEventListener('click', () => {
    const cols = Number(picker.querySelector('#tablePickerCols').value);
    const rows = Number(picker.querySelector('#tablePickerRows').value);
    insertAtCursor(buildMarkdownTable(cols, rows));
    picker.remove();
  });
  setTimeout(() => document.addEventListener('click', function closeOnce(e) {
    if (picker.contains(e.target)) return;
    picker.remove(); document.removeEventListener('click', closeOnce);
  }, { once: false }), 0);
}

// Eigenes Tabellen-Bearbeitungsfenster (Option C, Nutzer-Entscheidung):
// echtes Raster zum Anklicken/Tippen, Zeilen/Spalten per Knopf hinzufügen/
// entfernen, Ausrichtung pro Spalte wählbar. Erst bei "Übernehmen" wird die
// komplette Tabelle auf einmal in die Markdown-Quelle zurückgeschrieben —
// keine laufende Zwei-Wege-Synchronisation während des Tippens nötig.
function showTableEditorModal(tableIndex) {
  const tables = parseMarkdownTables(getEditorContent());
  const original = tables[tableIndex];
  if (!original) return;
  // Arbeitskopie — erst bei "Übernehmen" fließt das zurück in den Text.
  const data = { headers: [...original.headers], alignments: [...original.alignments], rows: original.rows.map(r => [...r]) };

  closeManagedDialogs('.table-editor-overlay', { restoreFocus: false });
  const overlay = document.createElement('div');
  overlay.className = 'table-editor-overlay';
  overlay.innerHTML = `
    <div class="table-editor-modal">
      <div class="settings-modal-header">
        <span>Tabelle bearbeiten</span>
        <button type="button" class="modal-close-x" data-action="cancel">✕</button>
      </div>
      <div class="table-editor-grid-wrap"><table class="table-editor-grid"></table></div>
      <div class="table-editor-actions">
        <button type="button" class="btn ghost" data-action="add-row">+ Zeile</button>
        <button type="button" class="btn ghost" data-action="add-col">+ Spalte</button>
        <span class="spacer"></span>
        <button type="button" class="btn" data-action="cancel">Abbrechen</button>
        <button type="button" class="btn primary" data-action="apply">Übernehmen</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const grid = overlay.querySelector('.table-editor-grid');
  const ALIGN_LABELS = [{ v: '', l: 'Links' }, { v: 'center', l: 'Zentriert' }, { v: 'right', l: 'Rechts' }];

  function renderGrid() {
    const alignOptions = (current) => ALIGN_LABELS.map(a => `<option value="${a.v}" ${a.v === current ? 'selected' : ''}>${a.l}</option>`).join('');
    grid.innerHTML = `
      <thead><tr>
        ${data.headers.map((h, c) => `
          <th>
            <input type="text" class="te-header-input" data-col="${c}" value="${escapeHtml(h)}">
            <select class="te-align-select" data-col="${c}">${alignOptions(data.alignments[c])}</select>
            ${data.headers.length > 1 ? `<button type="button" class="te-del-col" data-col="${c}" title="Spalte löschen">✕</button>` : ''}
          </th>`).join('')}
      </tr></thead>
      <tbody>
        ${data.rows.map((row, r) => `
          <tr>
            ${row.map((cell, c) => `<td><input type="text" class="te-cell-input" data-row="${r}" data-col="${c}" value="${escapeHtml(cell)}"></td>`).join('')}
            <td class="te-row-actions">${data.rows.length > 0 ? `<button type="button" class="te-del-row" data-row="${r}" title="Zeile löschen">✕</button>` : ''}</td>
          </tr>`).join('')}
      </tbody>`;
  }
  renderGrid();

  // Zellen-/Kopfzeilen-Eingaben: nur die Arbeitskopie aktualisieren, KEIN
  // Neu-Rendern des Rasters (sonst würde der Cursor bei jedem Tastenanschlag
  // aus dem Eingabefeld springen) — nur Struktur-Änderungen (Zeile/Spalte
  // hinzufügen/entfernen) bauen das Raster neu auf.
  grid.addEventListener('input', (e) => {
    if (e.target.classList.contains('te-cell-input')) {
      data.rows[Number(e.target.dataset.row)][Number(e.target.dataset.col)] = e.target.value;
    } else if (e.target.classList.contains('te-header-input')) {
      data.headers[Number(e.target.dataset.col)] = e.target.value;
    }
  });
  grid.addEventListener('change', (e) => {
    if (e.target.classList.contains('te-align-select')) {
      data.alignments[Number(e.target.dataset.col)] = e.target.value;
    }
  });
  grid.addEventListener('click', (e) => {
    const delCol = e.target.closest('.te-del-col');
    if (delCol) {
      const c = Number(delCol.dataset.col);
      data.headers.splice(c, 1);
      data.alignments.splice(c, 1);
      data.rows.forEach(r => r.splice(c, 1));
      renderGrid();
      return;
    }
    const delRow = e.target.closest('.te-del-row');
    if (delRow) {
      data.rows.splice(Number(delRow.dataset.row), 1);
      renderGrid();
    }
  });

  overlay.querySelector('[data-action="add-row"]').addEventListener('click', () => {
    data.rows.push(data.headers.map(() => ''));
    renderGrid();
  });
  overlay.querySelector('[data-action="add-col"]').addEventListener('click', () => {
    data.headers.push(`Spalte ${data.headers.length + 1}`);
    data.alignments.push('');
    data.rows.forEach(r => r.push(''));
    renderGrid();
  });
  function close() { dialogController.destroy(); }
  overlay.querySelector('[data-action="apply"]').addEventListener('click', () => {
    const updated = replaceNthTableInMarkdown(getEditorContent(), tableIndex, data);
    setEditorContent(updated);
    close();
  });
  overlay.querySelectorAll('[data-action="cancel"]').forEach(btn => btn.addEventListener('click', close));
  const dialogController = manageModalDialog({
    overlay,
    dialog: overlay.querySelector('.table-editor-modal'),
    initialFocus: () => overlay.querySelector('.te-header-input, .te-cell-input, [data-action="cancel"]'),
    onRequestClose: close,
    closeOnBackdrop: false,
    enterActivatesPrimary: false
  });
}

function showCalloutPicker(anchorOrPos) {
  document.querySelectorAll('.callout-picker').forEach(m => m.remove());
  const picker = document.createElement('div');
  picker.className = 'callout-picker emoji-picker';
  picker.innerHTML = `
    <div class="emoji-group-label">Callout einfügen</div>
    <div class="callout-picker-list">
      ${CALLOUT_PICKER_TYPES.map(c => `<button type="button" class="callout-picker-btn" data-callout-type="${c.type}"><span>${c.icon}</span> ${escapeHtml(c.label)}</button>`).join('')}
    </div>
  `;
  document.body.appendChild(picker);

  // anchorOrPos ist entweder ein DOM-Element (Toolbar-Button — Picker
  // erscheint darunter) oder eine feste {left, top}-Position (Rechtsklick-
  // Menü — Picker erscheint an der tatsächlichen Klickstelle, NICHT an der
  // Ecke des ganzen Editor-Panels, das war der gemeldete Bug).
  let left, top;
  if (anchorOrPos instanceof HTMLElement) {
    const rect = anchorOrPos.getBoundingClientRect();
    left = rect.left;
    top = rect.bottom + 6;
  } else {
    left = anchorOrPos?.left ?? 20;
    top = anchorOrPos?.top ?? 20;
  }
  const pickerRect = picker.getBoundingClientRect();
  left = Math.min(left, window.innerWidth - pickerRect.width - 8);
  top = Math.min(top, window.innerHeight - pickerRect.height - 8);
  picker.style.left = Math.max(4, left) + 'px';
  picker.style.top = Math.max(4, top) + 'px';

  picker.addEventListener('click', (e) => {
    const btn = e.target.closest('.callout-picker-btn');
    if (!btn) return;
    const meta = CALLOUT_PICKER_TYPES.find(c => c.type === btn.dataset.calloutType);
    insertAtCursor(`\n> [!${meta.type}] ${meta.label}\n> Inhalt hier\n\n`);
    picker.remove();
  });
  setTimeout(() => document.addEventListener('click', function closeOnce(e) {
    if (picker.contains(e.target)) return;
    picker.remove(); document.removeEventListener('click', closeOnce);
  }, { once: false }), 0);
}

// ---------------------------------------------------------------------------
// Rechtsklick-Kontextmenü (Editor + Vorschau) — mit Untermenüs (Format/Absatz/
// Einfügen), angelehnt an Obsidians Rechtsklick-Menü, aber auf das reduziert,
// was unser Markdown-Editor tatsächlich abbilden kann. Bewusst NICHT dasselbe
// showContextMenu() wie für die Sidebar-Baumeinträge (andere Aktionen, andere
// Struktur mit Untermenüs) — nur CSS-Klassen-Namensraum wird sich ähneln.
// ---------------------------------------------------------------------------

function headingTransform(level) {
  return (lineText) => {
    const stripped = lineText.replace(/^#{1,6}\s+/, '');
    return level === 0 ? stripped : '#'.repeat(level) + ' ' + stripped;
  };
}

function buildEditorMenuItems() {
  return [
    { label: 'Link hinzufügen', action: async () => {
        const selectedText = getEditorSelectionText();
        const result = await showWikiLinkModal(selectedText);
        if (!result || !result.target) return;
        const syntax = result.display && result.display !== result.target
          ? `[[${result.target}|${result.display}]]`
          : `[[${result.target}]]`;
        insertAtCursor(syntax);
      } },
    { label: 'Externen Link hinzufügen', action: async () => {
        const url = await showPromptModal({ title: 'Link-URL', defaultValue: 'https://' });
        if (url) wrapSelection('[', `](${url})`, 'Linktext');
      } },
    { separator: true },
    { label: 'Format', submenu: [
        { label: 'Fett', action: () => wrapSelection('**', '**', 'Fetter Text') },
        { label: 'Kursiv', action: () => wrapSelection('*', '*', 'Kursiver Text') },
        { label: 'Durchgestrichen', action: () => wrapSelection('~~', '~~', 'Durchgestrichener Text') },
        { label: 'Unterstrichen', action: () => wrapSelection('<u>', '</u>', 'Unterstrichener Text') },
        { label: 'Quelltext', action: () => wrapSelection('`', '`', 'code') },
        { separator: true },
        { label: 'Formatierung entfernen', disabled: !editorHasSelection(), action: () => {
            const text = getEditorSelectionText();
            if (!text) return;
            insertAtCursor(stripMarkdownSyntax(text));
          } }
      ] },
    { label: 'Absatz', submenu: [
        { label: 'Aufzählung', action: () => insertAtCursor('\n- Punkt\n') },
        { label: 'Nummerierte Aufzählung', action: () => insertAtCursor('\n1. Punkt\n') },
        { label: 'Aufgabenliste', action: () => insertAtCursor('\n- [ ] Aufgabe\n') },
        { separator: true },
        { label: 'Überschrift 1', action: () => transformCurrentLine(headingTransform(1)) },
        { label: 'Überschrift 2', action: () => transformCurrentLine(headingTransform(2)) },
        { label: 'Überschrift 3', action: () => transformCurrentLine(headingTransform(3)) },
        { label: 'Überschrift 4', action: () => transformCurrentLine(headingTransform(4)) },
        { label: 'Überschrift 5', action: () => transformCurrentLine(headingTransform(5)) },
        { label: 'Überschrift 6', action: () => transformCurrentLine(headingTransform(6)) },
        { label: 'Keine Überschrift', action: () => transformCurrentLine(headingTransform(0)) },
        { separator: true },
        { label: 'Zitat', action: () => transformCurrentLine((t) => '> ' + t.replace(/^>\s?/, '')) }
      ] },
    { label: 'Elemente', submenu: [
        { label: 'Tabelle', action: (pos) => showTablePicker(pos) },
        { label: 'Hinweisblock', action: (anchorEl) => showCalloutPicker(anchorEl) },
        { label: 'Horizontale Linie', action: () => insertAtCursor('\n---\n') },
        { separator: true },
        { label: 'Quelltext-Block', action: () => insertAtCursor('\n```\nCode hier\n```\n') },
        { label: 'Mathe-Block', action: () => insertAtCursor('\n$$\n\n$$\n') }
      ] },
    { separator: true },
    { label: 'Ausschneiden', disabled: !editorHasSelection(), action: async () => {
        const text = getEditorSelectionText();
        if (!text) return;
        await window.archivAPI.clipboard.writeText(text);
        deleteEditorSelection();
      } },
    { label: 'Kopieren', disabled: !editorHasSelection(), action: async () => {
        const text = getEditorSelectionText();
        if (!text) return;
        await window.archivAPI.clipboard.writeText(text);
      } },
    { label: 'Einfügen', action: async () => {
        const text = await window.archivAPI.clipboard.readText();
        if (text) insertAtCursor(text);
      } },
    { label: 'Alles auswählen', action: () => selectAllInEditor() }
  ];
}

// Vorschau ist reiner Lesemodus (gerendertes HTML, keine Markdown-Quelle an
// dieser Stelle) — Format/Absatz/Einfügen ergeben dort keinen Sinn (worauf
// sollten sie wirken?), ebenso wenig Ausschneiden/Einfügen. Nur Kopieren und
// Alles auswählen sind hier tatsächlich sinnvoll.
function buildPreviewMenuItems(previewEl) {
  // Bugfix (per Nutzer-Meldung: "Kopieren" tat nichts, nur Strg+C ging):
  // Die Auswahl MUSS jetzt, beim Rechtsklick selbst, gesichert werden — nicht
  // erst im späteren Klick auf den Menüpunkt. Ein Klick auf irgendein Element
  // (auch auf den Menüpunkt selbst) löscht standardmäßig eine bestehende
  // Textauswahl im Browser, noch bevor die eigentliche Aktion läuft.
  const selectedText = window.getSelection().toString();
  return [
    { label: 'Kopieren', disabled: !selectedText, action: async () => {
        if (selectedText) await window.archivAPI.clipboard.writeText(selectedText);
      } },
    { label: 'Alles auswählen', action: () => {
        const range = document.createRange();
        range.selectNodeContents(previewEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } }
  ];
}

function normalizeMenuItemDefinitions(items) {
  const normalized = [];
  for (const sourceItem of items || []) {
    const item = Array.isArray(sourceItem?.submenu)
      ? { ...sourceItem, submenu: normalizeMenuItemDefinitions(sourceItem.submenu) }
      : sourceItem;
    if (item?.separator) {
      if (!normalized.length || normalized[normalized.length - 1]?.separator) continue;
      normalized.push(item);
      continue;
    }
    if (item) normalized.push(item);
  }
  if (normalized[normalized.length - 1]?.separator) normalized.pop();
  return normalized;
}

function renderMenuItemsHtml(items) {
  return normalizeMenuItemDefinitions(items).map((item, i) => {
    if (item.separator) return '<div class="ectx-sep"></div>';
    const hasSubmenu = Array.isArray(item.submenu);
    return `
      <div class="ectx-item${hasSubmenu ? ' has-submenu' : ''}${item.disabled ? ' disabled' : ''}" data-idx="${i}">
        <span class="ectx-label">${escapeHtml(item.label)}</span>
        ${hasSubmenu ? '<span class="ectx-arrow">▸</span>' : ''}
        ${hasSubmenu ? `<div class="ectx-submenu">${renderMenuItemsHtml(item.submenu)}</div>` : ''}
      </div>`;
  }).join('');
}

// Findet das item-Objekt zu einem angeklickten .ectx-item anhand des Pfads
// aus data-idx-Werten (jede Verschachtelungsebene hat ihren eigenen Index).
function findMenuItemByPath(items, path) {
  let list = items, item = null;
  for (const idx of path) {
    item = list[idx];
    if (!item) return null;
    list = item.submenu || [];
  }
  return item;
}

function showEditorRightClickMenu(e, items, clickPos, trigger = e.currentTarget || document.activeElement) {
  e.preventDefault();
  const menu = createHtmlContextMenu({
    className: 'ectx-menu',
    trigger,
    label: 'Editor-Kontextmenü',
    position: { clientX: e.clientX, clientY: e.clientY },
    html: renderMenuItemsHtml(items)
  });

  // Untermenüs: JS-gesteuert statt reinem CSS-:hover, weil wir die TATSÄCHLICHE
  // Höhe/Breite eines Untermenüs erst kennen, sobald es (auch nur kurz)
  // sichtbar ist — ein display:none-Element hat immer ein Null-Rechteck.
  // Bekannter Bug vorher: "Absatz" (das längste Untermenü) ragte am unteren
  // Bildschirmrand einfach ab, weil nur horizontaler Überlauf abgefangen wurde.
  menu.querySelectorAll('.ectx-item.has-submenu').forEach(el => {
    const sub = el.querySelector(':scope > .ectx-submenu');
    let hideTimer = null;
    el.addEventListener('mouseenter', () => {
      clearTimeout(hideTimer);
      setEditorSubmenuExpanded(el, true);
    });
    const scheduleHide = () => {
      hideTimer = setTimeout(() => {
        if (!el.contains(document.activeElement)) setEditorSubmenuExpanded(el, false);
      }, 150);
    };
    el.addEventListener('mouseleave', scheduleHide);
    sub.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    sub.addEventListener('mouseleave', scheduleHide);
    sub.addEventListener('focusin', () => clearTimeout(hideTimer));
  });

  menu.addEventListener('click', (ev) => {
    const el = ev.target.closest('.ectx-item');
    if (!el || el.classList.contains('disabled')) return;
    // Pfad aus data-idx über alle Verschachtelungsebenen bis zum geklickten Element aufsammeln.
    const path = [];
    let node = el;
    while (node && node.classList.contains('ectx-item')) {
      path.unshift(Number(node.dataset.idx));
      node = node.parentElement?.closest('.ectx-item');
    }
    const item = findMenuItemByPath(items, path);
    if (!item || item.submenu) return; // Klick auf einen Eintrag MIT Untermenü selbst tut nichts (nur Hover öffnet es)
    ev.stopPropagation();
    closeHtmlContextMenu(menu, { reason: 'action' });
    item.action?.(clickPos);
  });
}

function wireEditorContextMenus() {
  const editorEl = document.getElementById('editorContainer');
  const previewEl = document.getElementById('previewContainer');
  editorEl?.addEventListener('contextmenu', (e) => {
    // Cursor nur verschieben, wenn AKTUELL NICHTS ausgewählt ist. Vorher wurde
    // der Cursor auch bei bestehender Auswahl neu gesetzt, sobald die exakte
    // Rechtsklick-Position nur leicht außerhalb lag — das zerstörte die
    // Auswahl NOCH VOR dem Öffnen des Menüs. Ergebnis: "Quelltext"/"Fett"/etc.
    // haben dann nur einen Platzhalter statt der eigentlich markierten Stelle
    // umschlossen. Eine bestehende Auswahl bleibt jetzt IMMER erhalten.
    if (!editorHasSelection()) moveEditorCursorToCoords(e.clientX, e.clientY);
    // WICHTIG: die tatsächliche Klick-POSITION übergeben (nicht das ganze
    // Editor-Element!) — Picker wie "Hinweisblock" positionieren sich daran.
    // Vorheriger Bug: mit dem Editor-Element als Anker landete der Picker an
    // dessen unterer Kante statt an der Klickstelle, teils weit weg/unsichtbar.
    showEditorRightClickMenu(e, buildEditorMenuItems(), { left: e.clientX, top: e.clientY }, document.activeElement);
  });
  previewEl?.addEventListener('contextmenu', (e) => {
    showEditorRightClickMenu(e, buildPreviewMenuItems(previewEl), { left: e.clientX, top: e.clientY }, document.activeElement);
  });
  editorEl?.addEventListener('keydown', (e) => {
    if (!isContextMenuKeyboardEvent(e)) return;
    e.preventDefault();
    const point = contextMenuPointForElement(e.target.closest('#editorContainer') || editorEl);
    showEditorRightClickMenu({ ...point, preventDefault() {}, currentTarget: editorEl }, buildEditorMenuItems(), { left: point.clientX, top: point.clientY }, e.target);
  });
  previewEl?.addEventListener('keydown', (e) => {
    if (!isContextMenuKeyboardEvent(e)) return;
    e.preventDefault();
    const point = contextMenuPointForElement(e.target.closest('#previewContainer') || previewEl);
    showEditorRightClickMenu({ ...point, preventDefault() {}, currentTarget: previewEl }, buildPreviewMenuItems(previewEl), { left: point.clientX, top: point.clientY }, e.target);
  });
}

// Bilder per Drag&Drop aus dem Dateimanager in den Editor ziehen. Datei wird
// gelesen (FileReader, funktioniert unabhängig von contextIsolation/
// nodeIntegration-Einstellungen — robuster als sich auf File.path zu
// verlassen), als Bytes an den Main-Prozess geschickt und dort in
// .attachments/ gespeichert. Markdown nutzt bewusst ein eigenes
// "attachment:dateiname"-Präfix statt eines relativen Pfades — macht die
// Auflösung in der Vorschau unabhängig von der Verzeichnistiefe der Notiz
// (siehe renderPreview in build/editor-entry.js).
function wireImageDrop() {
  const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB — großzügig für normale Fotos/Screenshots, verhindert aber das Einlesen von Riesendateien in den Speicher
  const editorEl = document.getElementById('editorContainer');
  if (!editorEl) return;
  editorEl.addEventListener('dragover', (e) => {
    if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault();
  });
  editorEl.addEventListener('drop', async (e) => {
    const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return; // kein Bild dabei — normales Text-Drop (Umsortieren etc.) unangetastet lassen
    e.preventDefault();
    for (const file of files) {
      if (file.size > MAX_IMAGE_BYTES) {
        await showMessageDialog({
          title: 'Bild ist zu groß',
          message: `"${file.name}" ist ${(file.size / 1024 / 1024).toFixed(1)} MB groß. Maximal 20 MB pro Bild sind möglich.`
        });
        continue; // erst NACH der Prüfung wird überhaupt gelesen — vorher landete jede Dateigröße ungeprüft komplett im Speicher
      }
      try {
        const buffer = await file.arrayBuffer();
        const { fileName } = await fs.saveAttachment(file.name, buffer);
        insertAtCursor(`\n![${file.name.replace(/\.[^.]+$/, '')}](attachment:${fileName})\n`);
      } catch (err) {
        await showMessageDialog({ title: 'Bild konnte nicht eingefügt werden', message: err.message });
        console.error('[Archiv Wiki] Bild-Drop fehlgeschlagen:', err);
      }
    }
  });
}

// Neues, erweitertes Icon-Auswahlfenster für Kategorien/Notizen — ergänzt
// die bestehende Emoji-Auswahl um die kuratierte Icon-Bibliothek (Suche mit
// Synonymen, Kategorien, Favoriten, Zuletzt verwendet, Vorschau beim
// Überfahren). Bestehende Emoji-Zeichen bleiben über den "Emoji"-Reiter
// unverändert erreichbar — nichts wird ersetzt, nur ergänzt.
function showIconPicker(anchorEl, onSelect) {
  document.querySelectorAll('.icon-picker, .emoji-picker').forEach(m => m.remove());
  const projectConfig = state.project?.config || {};
  let favorites = Array.isArray(projectConfig.iconFavorites) ? projectConfig.iconFavorites : [];
  let recent = Array.isArray(projectConfig.iconRecent) ? projectConfig.iconRecent : [];
  let activeTab = 'library';

  const picker = document.createElement('div');
  picker.className = 'icon-picker';

  function iconBtnHtml(entry) {
    const isFav = favorites.includes(entry.id);
    return `<button type="button" class="icon-lib-btn" data-icon-id="${entry.id}" data-label="${escapeHtml(entry.label)}" title="${escapeHtml(entry.label)}">
      <img src="assets/icon-library/${entry.id}.svg" class="lib-icon" alt="">
      <span class="icon-fav-star ${isFav ? 'active' : ''}" data-fav-toggle="${entry.id}">${isFav ? '★' : '☆'}</span>
    </button>`;
  }

  function libraryDefaultHtml() {
    let html = '';
    if (favorites.length) {
      const favEntries = favorites.map(id => ICON_LIBRARY.find(i => i.id === id)).filter(Boolean);
      html += `<div class="icon-picker-section-label">★ Favoriten</div><div class="icon-picker-grid">${favEntries.map(iconBtnHtml).join('')}</div>`;
    }
    if (recent.length) {
      const recentEntries = recent.map(id => ICON_LIBRARY.find(i => i.id === id)).filter(Boolean);
      html += `<div class="icon-picker-section-label">🕐 Zuletzt verwendet</div><div class="icon-picker-grid">${recentEntries.map(iconBtnHtml).join('')}</div>`;
    }
    for (const [catKey, catLabel] of Object.entries(ICON_CATEGORIES)) {
      const entries = ICON_LIBRARY.filter(i => i.category === catKey);
      html += `<div class="icon-picker-section-label">${escapeHtml(catLabel)}</div><div class="icon-picker-grid">${entries.map(iconBtnHtml).join('')}</div>`;
    }
    return html;
  }

  function librarySearchHtml(query) {
    const matches = searchIconLibrary(query);
    if (matches.length === 0) return `<div class="emoji-empty">Keine Treffer für „${escapeHtml(query)}"</div>`;
    return `<div class="icon-picker-grid">${matches.map(iconBtnHtml).join('')}</div>`;
  }

  function emojiGroupedHtml() {
    return Object.entries(EMOJI_GROUPS).map(([group, items]) => `
      <div class="emoji-group-label">${escapeHtml(group)}</div>
      <div class="emoji-grid">
        ${items.map(([char, name]) => `<button type="button" class="emoji-btn" data-emoji="${char}" title="${escapeHtml(name)}">${char}</button>`).join('')}
      </div>
    `).join('');
  }

  function emojiFilteredHtml(query) {
    const q = query.toLowerCase().trim();
    const matches = EMOJI_FLAT.filter(([, name]) => name.includes(q));
    if (matches.length === 0) return `<div class="emoji-empty">Keine Treffer für „${escapeHtml(query)}"</div>`;
    return `<div class="emoji-grid">${matches.map(([char, name]) => `<button type="button" class="emoji-btn" data-emoji="${char}" title="${escapeHtml(name)}">${char}</button>`).join('')}</div>`;
  }

  function renderResults() {
    const query = picker.querySelector('.icon-picker-search').value.trim();
    const resultsEl = picker.querySelector('.icon-picker-results');
    if (activeTab === 'library') {
      resultsEl.innerHTML = query ? librarySearchHtml(query) : libraryDefaultHtml();
    } else {
      resultsEl.innerHTML = query ? emojiFilteredHtml(query) : emojiGroupedHtml();
    }
  }

  picker.innerHTML = `
    <div class="icon-picker-tabs">
      <button type="button" class="active" data-tab="library">Bibliothek</button>
      <button type="button" data-tab="emoji">Emoji</button>
    </div>
    <input type="text" class="icon-picker-search" placeholder="Suchen (z. B. 'linux', 'terminal', 'herz') …" autocomplete="off">
    <div class="icon-picker-results"></div>
  `;
  document.body.appendChild(picker);
  renderResults();

  const rect = anchorEl.getBoundingClientRect();
  const pickerRect = picker.getBoundingClientRect();
  const top = Math.min(rect.bottom + 6, window.innerHeight - pickerRect.height - 8);
  picker.style.top = Math.max(4, top) + 'px';
  picker.style.left = Math.min(rect.left, window.innerWidth - pickerRect.width - 8) + 'px';
  animateIn(picker);

  const searchInput = picker.querySelector('.icon-picker-search');
  searchInput.addEventListener('input', renderResults);
  searchInput.focus();

  picker.querySelector('.icon-picker-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    activeTab = btn.dataset.tab;
    picker.querySelectorAll('.icon-picker-tabs button').forEach(b => b.classList.toggle('active', b === btn));
    searchInput.value = '';
    searchInput.placeholder = activeTab === 'library' ? "Suchen (z. B. 'linux', 'terminal') …" : "Suchen (z. B. 'herz', 'pfeil') …";
    renderResults();
  });

  // Hover-Vorschau: eigenes, verzögertes Fenster (kein Standard-Tooltip),
  // zeigt das Icon größer + Namen — gleiches Muster wie der bestehende
  // Ellipsis-Tooltip an anderer Stelle im Programm.
  let hoverTimer = null;
  let previewEl = null;
  picker.addEventListener('mouseover', (e) => {
    const btn = e.target.closest('.icon-lib-btn');
    if (!btn || btn === hoverTimer?.btn) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      if (previewEl) previewEl.remove();
      previewEl = document.createElement('div');
      previewEl.className = 'icon-hover-preview';
      const img = btn.querySelector('img').cloneNode(true);
      img.classList.add('icon-hover-preview-img');
      previewEl.appendChild(img);
      const label = document.createElement('span');
      label.textContent = btn.dataset.label;
      previewEl.appendChild(label);
      document.body.appendChild(previewEl);
      const btnRect = btn.getBoundingClientRect();
      previewEl.style.left = Math.min(btnRect.left, window.innerWidth - previewEl.offsetWidth - 8) + 'px';
      previewEl.style.top = (btnRect.top - previewEl.offsetHeight - 6) + 'px';
    }, 350);
  });
  picker.addEventListener('mouseout', (e) => {
    if (!e.target.closest('.icon-lib-btn')) return;
    clearTimeout(hoverTimer);
    if (previewEl) { previewEl.remove(); previewEl = null; }
  });

  async function persistFavAndRecent() {
    try {
      await fs.setProjectSetting('iconFavorites', favorites);
      await fs.setProjectSetting('iconRecent', recent);
    } catch (err) { console.error('[Archiv Wiki] Icon-Favoriten/Verlauf konnten nicht gespeichert werden:', err); }
  }

  picker.addEventListener('click', (e) => {
    const favStar = e.target.closest('.icon-fav-star');
    if (favStar) {
      const id = favStar.dataset.favToggle;
      favorites = favorites.includes(id) ? favorites.filter(f => f !== id) : [...favorites, id];
      persistFavAndRecent();
      renderResults();
      return;
    }
    const libBtn = e.target.closest('.icon-lib-btn');
    if (libBtn) {
      const id = libBtn.dataset.iconId;
      recent = [id, ...recent.filter(r => r !== id)].slice(0, 12);
      persistFavAndRecent();
      if (onSelect) { onSelect(id); animateOut(picker, () => picker.remove()); if (previewEl) previewEl.remove(); }
      else insertAtCursor(`![${libBtn.dataset.label}](icon:${id})`); // Picker bleibt offen, wie bei Emoji auch
      return;
    }
    const emojiBtn = e.target.closest('.emoji-btn');
    if (emojiBtn) {
      if (onSelect) { onSelect(emojiBtn.dataset.emoji); animateOut(picker, () => picker.remove()); }
      else insertAtCursor(emojiBtn.dataset.emoji);
    }
  });

  setTimeout(() => document.addEventListener('click', function closeOnce(e) {
    if (picker.contains(e.target)) return;
    animateOut(picker, () => picker.remove());
    if (previewEl) previewEl.remove();
    document.removeEventListener('click', closeOnce);
  }), 0);
}

function applyViewMode() {
  const split = document.getElementById('noteSplit');
  if (!split) return;

  const editorPane = document.getElementById('editorContainer');
  const previewPane = document.getElementById('previewContainer');

  split.className = 'note-split mode-' + state.viewMode;

  // Die gespeicherte Trennerposition gehört ausschließlich zur Split-Ansicht.
  // Reine Editor-/Vorschauansichten übersteuern sie nur vorübergehend und
  // verändern weder den Projektwert noch die Splitter-Speicherung.
  if (editorPane && previewPane) {
    if (state.viewMode === 'editor') {
      editorPane.style.flex = '1 1 0';
      previewPane.style.flex = '1 1 0';
    } else if (state.viewMode === 'preview') {
      editorPane.style.flex = '1 1 0';
      previewPane.style.flex = '1 1 0';
    } else {
      const savedWidth = state.project?.config?.splitEditorWidth;
      editorPane.style.flex =
        typeof savedWidth === 'number' && savedWidth > 0
          ? `0 0 ${savedWidth}px`
          : '1 1 0';
      previewPane.style.flex = '1 1 0';
    }
  }

  document.querySelectorAll('#viewToggle button').forEach(b => {
    const active = b.dataset.mode === state.viewMode;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  // Synchrones Scrollen ist nur sinnvoll, wenn Editor und Vorschau
  // gleichzeitig sichtbar sind. Der gespeicherte Ein/Aus-Zustand bleibt
  // außerhalb der Split-Ansicht unverändert erhalten.
  const syncButton = document.getElementById('btnSyncScroll');
  if (syncButton) {
    const available = state.viewMode === 'split';
    syncButton.disabled = !available;
    syncButton.setAttribute('aria-disabled', available ? 'false' : 'true');
    syncButton.title = available
      ? 'Synchrones Scrollen im Split-Modus'
      : 'Synchrones Scrollen ist nur im Split-Modus verfügbar';
  }
}

// ---------------------------------------------------------------------------
// Eingang: Darstellung und Bedienung der vom Main-Prozess verwalteten
// Eingang-Daten. Der Renderer nutzt dafür ausschließlich die begrenzte
// Preload-/IPC-Schnittstelle und greift nie selbst auf Projektdateien zu.
// ---------------------------------------------------------------------------
function incomingTypeLabel(entry) {
  const type = String(entry?.type || '').trim().toLowerCase();
  const labels = {
    text: 'Text',
    web: 'Webseite',
    website: 'Webseite',
    webpage: 'Webseite',
    url: 'Webseite',
    file: 'Datei',
    image: 'Bild'
  };
  return labels[type] || 'Eingang';
}

function isIncomingWebpage(entry) {
  const type = String(entry?.type || '').trim().toLowerCase();
  return type === 'web' || type === 'website' || type === 'webpage' || type === 'url';
}

function incomingListIconSrc(entry) {
  const type = String(entry?.type || '').trim().toLowerCase();
  if (type === 'text') return 'assets/icon-library/actions/pencil.svg';
  if (type === 'image') return 'assets/icon-library/hardware/camera.svg';
  if (type === 'file') return 'assets/icon-library/docs/file.svg';
  if (isIncomingWebpage(entry)) return 'assets/icon-library/network/globe.svg';
  return 'assets/icon-library/navigation/inbox.svg';
}

function incomingFirstText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function incomingDisplayTitle(entry) {
  const explicit = incomingFirstText(entry?.title, entry?.name, entry?.fileName, entry?.filename);
  if (explicit) return explicit;

  const text = incomingFirstText(entry?.text, entry?.content);
  if (text) {
    const firstLine = text.split(/\r?\n/, 1)[0].trim();
    if (firstLine) return firstLine.length > 72 ? firstLine.slice(0, 69) + '…' : firstLine;
  }

  const source = incomingFirstText(entry?.url, entry?.sourceUrl, entry?.source?.url);
  return source || 'Eingang ohne Titel';
}

function incomingPreview(entry) {
  const type = String(entry?.type || '').trim().toLowerCase();
  const fileName = incomingFirstText(
    entry?.fileName,
    entry?.filename,
    entry?.attachment?.fileName,
    entry?.source?.fileName,
    entry?.source?.filename
  );

  if (type === 'image') {
    const sourceUrl = incomingFirstText(entry?.sourceUrl, entry?.url, entry?.source?.url);
    const imageLabel = fileName ? `Bild: ${fileName}` : 'Bild-Anhang';
    return sourceUrl ? `${imageLabel} · Quelle: ${sourceUrl}` : imageLabel;
  }
  if (type === 'file') return fileName ? `Datei: ${fileName}` : 'Datei-Anhang';

  if (isIncomingWebpage(entry)) {
    const sourceUrl = incomingFirstText(entry?.url, entry?.sourceUrl, entry?.source?.url);
    const contentPreview = incomingFirstText(entry?.excerpt, entry?.text, entry?.content).replace(/\s+/g, ' ');
    if (contentPreview) {
      const text = contentPreview.length > 120 ? contentPreview.slice(0, 117) + '…' : contentPreview;
      return sourceUrl ? `${text} · Quelle: ${sourceUrl}` : text;
    }
    if (sourceUrl) return `Quelle: ${sourceUrl}`;
  }

  const preview = incomingFirstText(
    entry?.excerpt,
    entry?.text,
    entry?.content,
    entry?.url,
    entry?.sourceUrl,
    entry?.source?.url,
    fileName
  ).replace(/\s+/g, ' ');

  if (!preview) return 'Noch keine Vorschau verfügbar.';
  return preview.length > 180 ? preview.slice(0, 177) + '…' : preview;
}

function incomingEditorContent(entry) {
  const type = String(entry?.type || '').trim().toLowerCase();
  if (type === 'image' && entry?.attachment?.kind === 'managed-file') {
    const fileName = incomingFirstText(entry?.fileName, entry?.attachment?.fileName, entry?.title);
    return fileName ? `Bild-Anhang: ${fileName}` : 'Bild-Anhang';
  }
  return incomingFirstText(
    entry?.text,
    entry?.content,
    entry?.excerpt,
    entry?.url,
    entry?.sourceUrl,
    entry?.source?.url
  );
}

function incomingSourceMetadata(entry) {
  const sourceUrl = incomingFirstText(entry?.sourceUrl, entry?.url, entry?.source?.url);
  const imageUrl = incomingFirstText(entry?.imageUrl, entry?.source?.imageUrl);
  const pageTitle = incomingFirstText(entry?.pageTitle, entry?.source?.title);
  const fileName = incomingFirstText(entry?.fileName, entry?.filename, entry?.source?.fileName, entry?.source?.filename);
  const sourceLabel = incomingFirstText(
    typeof entry?.source === 'string' ? entry.source : '',
    pageTitle,
    entry?.source?.label,
    fileName,
    sourceUrl
  );

  return {
    incomingId: entry?.id || null,
    type: String(entry?.type || 'text'),
    importType: entry?.type ? String(entry.type) : null,
    sourceUrl: sourceUrl || null,
    imageUrl: imageUrl || null,
    pageTitle: pageTitle || null,
    fileName: fileName || null,
    sourceLabel: sourceLabel || null,
    capturedAt: entry?.capturedAt || entry?.createdAt || null
  };
}

function incomingImageDraftMarker(incomingId) {
  return `incoming-image:${String(incomingId || '').trim()}`;
}

async function prepareIncomingNoteDraft(entry) {
  const type = String(entry?.type || '').trim().toLowerCase();
  let content = incomingEditorContent(entry);
  let image = null;

  if (type === 'image') {
    const preview = await window.archivAPI.incoming.getImagePreview(entry.id);
    if (!preview?.dataUrl || !preview?.fileName) {
      throw new Error('Der Bild-Anhang konnte nicht für den Notiz-Entwurf geladen werden.');
    }
    const marker = incomingImageDraftMarker(entry.id);
    image = {
      marker,
      fileName: preview.fileName,
      mimeType: preview.mimeType || '',
      dataUrl: preview.dataUrl
    };
    // Im Editor bleibt nur ein kurzer Markdown-Verweis sichtbar. Die Vorschau
    // ersetzt diesen temporären Verweis ausschließlich im noch ungespeicherten
    // Entwurf durch die Bilddaten aus dem Eingang. Erst beim Speichern wird
    // daraus ein normaler attachment:-Verweis.
    content = `![Bild](${marker})`;
  }

  state.incomingNoteDraft = {
    incomingId: entry.id,
    title: incomingDisplayTitle(entry),
    content,
    source: incomingSourceMetadata(entry),
    image,
    hasUnsavedChanges: false
  };
  return state.incomingNoteDraft;
}

function incomingAppendNoteOptions() {
  return fs.flattenNotes(state.tree).map((note) => ({
    relPath: note.relPath,
    label: note.frontmatter?.title || note.name.replace(/\.md$/i, '')
  }));
}

function incomingImageAppendBlock(entry, marker) {
  const title = incomingDisplayTitle(entry);
  const source = incomingSourceMetadata(entry);
  const lines = [
    `## ${title}`,
    '',
    `![Bild](${marker})`
  ];

  if (source.sourceUrl) {
    lines.push('', `Quelle: ${source.sourceUrl}`);
  }
  if (source.imageUrl && source.imageUrl !== source.sourceUrl) {
    lines.push(`Bildquelle: ${source.imageUrl}`);
  }

  return lines.join('\n');
}

async function prepareIncomingAppendDraft(entry, targetRelPath) {
  const type = String(entry?.type || '').trim().toLowerCase();
  if (type !== 'image') {
    throw new Error('Das Ergänzen einer bestehenden Notiz ist für diesen Eingangstyp noch nicht vorbereitet.');
  }

  const targetNote = await fs.readNote(targetRelPath);
  if (!targetNote?.relPath) {
    throw new Error('Die ausgewählte Notiz konnte nicht geladen werden.');
  }

  const preview = await window.archivAPI.incoming.getImagePreview(entry.id);
  if (!preview?.dataUrl || !preview?.fileName) {
    throw new Error('Der Bild-Anhang konnte nicht für den Notiz-Entwurf geladen werden.');
  }

  const marker = incomingImageDraftMarker(entry.id);
  const existingBody = String(targetNote.body || '').replace(/\s+$/, '');
  const appendBlock = incomingImageAppendBlock(entry, marker);
  const content = existingBody ? `${existingBody}\n\n${appendBlock}\n` : `${appendBlock}\n`;

  state.incomingNoteDraft = {
    incomingId: entry.id,
    mode: 'append-note',
    targetRelPath,
    title: targetNote.frontmatter?.title || targetRelPath.split(/[\\/]/).pop().replace(/\.md$/i, ''),
    content,
    source: incomingSourceMetadata(entry),
    hasUnsavedChanges: false,
    image: {
      marker,
      fileName: preview.fileName,
      mimeType: preview.mimeType || '',
      dataUrl: preview.dataUrl
    }
  };
  return state.incomingNoteDraft;
}

function incomingDraftSourceLabel(draft) {
  return incomingFirstText(
    draft?.source?.sourceLabel,
    draft?.source?.fileName,
    draft?.source?.sourceUrl,
    'Eingang'
  );
}

function showIncomingProcessDialog(entry) {
  return new Promise((resolve) => {
    closeManagedDialogs('.incoming-process-overlay', { restoreFocus: false });

    const previousMode = state.incomingProcessing?.incomingId === entry.id
      ? state.incomingProcessing.mode
      : 'new-note';

    const overlay = document.createElement('div');
    overlay.className = 'prompt-overlay incoming-process-overlay';
    overlay.innerHTML = `
      <div class="prompt-modal">
        <div class="prompt-title">Eingang verarbeiten</div>
        <div class="close-dialog-options">
          <label class="close-dialog-option"><input type="radio" name="incomingProcessMode" value="new-note"${previousMode === 'new-note' ? ' checked' : ''}> Neue Notiz erstellen</label>
          <label class="close-dialog-option"><input type="radio" name="incomingProcessMode" value="append-note"${previousMode === 'append-note' ? ' checked' : ''}> Bestehende Notiz ergänzen</label>
        </div>
        <div class="prompt-actions">
          <button type="button" class="btn" data-action="cancel">Abbrechen</button>
          <button type="button" class="btn primary" data-action="continue">Weiter</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    let closed = false;
    function close(result = null) {
      if (closed) return;
      closed = true;
      dialogController.destroy();
      resolve(result);
    }

    const cancelButton = overlay.querySelector('[data-action="cancel"]');
    const continueButton = overlay.querySelector('[data-action="continue"]');
    cancelButton.addEventListener('click', () => close(null));
    continueButton.addEventListener('click', () => {
      const mode = overlay.querySelector('input[name="incomingProcessMode"]:checked')?.value || 'new-note';
      state.incomingProcessing = { incomingId: entry.id, mode };
      close(mode);
    });

    const dialogController = manageModalDialog({
      overlay,
      dialog: overlay.querySelector('.prompt-modal'),
      initialFocus: overlay.querySelector('input[name="incomingProcessMode"]:checked'),
      primaryAction: continueButton,
      enterActivatesPrimary: true,
      onRequestClose: () => close(null),
      closeOnBackdrop: false
    });
  });
}

async function renderIncomingEntry(id) {
  setActiveNav(null);
  setBreadcrumb('Eingang');

  let entry;
  try {
    entry = await window.archivAPI.incoming.get(id);
  } catch (error) {
    if (!currentSlug().startsWith('incoming/')) return;
    els.contentScroll.innerHTML = `
      <div class="incoming-view">
        <h1 class="home-heading">Eingang</h1>
        <div class="empty-state">
          <div class="empty-state-title">Eingang konnte nicht geöffnet werden.</div>
          <div class="empty-state-body">${escapeHtml(error?.message || 'Information nicht verfügbar.')}</div>
        </div>
      </div>`;
    return;
  }

  if (currentSlug() !== `incoming/${id}`) return;

  let imagePreview = null;
  if (String(entry?.type || '').trim().toLowerCase() === 'image') {
    try {
      imagePreview = await window.archivAPI.incoming.getImagePreview(id);
    } catch (error) {
      console.error('[Archiv Wiki] Bild-Eingang konnte nicht dargestellt werden', error);
    }
    if (currentSlug() !== `incoming/${id}`) return;
  }

  const title = incomingDisplayTitle(entry);
  const body = incomingEditorContent(entry);
  const typeLabel = incomingTypeLabel(entry);
  const sourceUrl = incomingFirstText(entry?.sourceUrl, entry?.url, entry?.source?.url);
  const updated = formatAbsoluteDate(entry?.updatedAt || entry?.createdAt) || 'Zeitpunkt nicht verfügbar';

  setBreadcrumb(`Eingang / ${title}`);
  els.topbarNoteDates.textContent = `Eingang · ${updated}`;

  els.contentScroll.innerHTML = `
    <div class="note-header incoming-document-header">
      <div class="note-document-title">
        <input type="text" class="note-title-input" value="${escapeHtml(title)}" readonly aria-label="Titel des Eingangs">
      </div>
      <div class="note-document-meta">
        <span class="note-meta-label">Eingang</span>
        <span class="note-meta-divider" aria-hidden="true"></span>
        <span class="note-meta-label">${escapeHtml(typeLabel)}</span>
        ${sourceUrl ? `
          <span class="note-meta-divider" aria-hidden="true"></span>
          <span class="note-meta-label" title="${escapeHtml(sourceUrl)}">Quelle: ${escapeHtml(sourceUrl)}</span>` : ''}
      </div>
      <div class="note-document-actions">
        <button type="button" class="btn primary" id="btnProcessIncoming">Als Notiz verarbeiten</button>
      </div>
    </div>
    <div class="note-toolbar" aria-label="Eingang-Ansicht">
      <div class="toolbar-group toolbar-view-group">
        <span class="toolbar-group-label">Ansicht</span>
        <div class="toolbar-group-controls">
          <div class="view-toggle" id="viewToggle">
            <button type="button" data-mode="editor" title="Nur Editor anzeigen" aria-label="Nur Editor anzeigen" aria-pressed="false">Editor</button>
            <button type="button" data-mode="split" title="Editor und Vorschau nebeneinander anzeigen" aria-label="Split-Ansicht anzeigen" aria-pressed="false">Split</button>
            <button type="button" data-mode="preview" title="Nur Vorschau anzeigen" aria-label="Nur Vorschau anzeigen" aria-pressed="false">Vorschau</button>
          </div>
          <button type="button" class="icon-btn sync-scroll-toggle" id="btnSyncScroll" title="Synchrones Scrollen im Split-Modus" aria-label="Synchrones Scrollen im Split-Modus umschalten" aria-pressed="false">⇅</button>
        </div>
      </div>
    </div>
    <div class="note-split mode-split" id="noteSplit">
      <div id="editorContainer" class="editor-pane"></div>
      <div class="split-resizer" id="splitResizer" title="Ziehen zum Verändern der Breite"></div>
      <div id="previewContainer" class="preview-pane" tabindex="0"></div>
    </div>
    <div class="note-bottombar">
      <span id="statLines">0 Zeilen</span>
      <span id="statWords">0 Wörter</span>
      <span class="spacer"></span>
      <span id="statCursor">Zeile 1, Spalte 1</span>
    </div>`;

  applyViewMode();
  wireSplitResizer();

  document.getElementById('btnProcessIncoming')?.addEventListener('click', async () => {
    const mode = await showIncomingProcessDialog(entry);
    if (!mode) return;
    try {
      if (mode === 'append-note') {
        if (String(entry?.type || '').trim().toLowerCase() !== 'image') return;
        const options = incomingAppendNoteOptions();
        if (options.length === 0) {
          await showMessageDialog({
            title: 'Keine Notiz vorhanden',
            message: 'Es gibt noch keine bestehende Notiz, die ergänzt werden kann.'
          });
          return;
        }
        const targetRelPath = await showCategoryPickerModal(options, 'Welche Notiz soll ergänzt werden?');
        if (!targetRelPath || currentSlug() !== `incoming/${id}`) return;
        await prepareIncomingAppendDraft(entry, targetRelPath);
      } else if (mode === 'new-note') {
        await prepareIncomingNoteDraft(entry);
      } else {
        return;
      }
      void navigateTo('#incoming-draft/' + encodeURIComponent(entry.id));
    } catch (error) {
      await showMessageDialog({
        title: 'Notiz-Entwurf konnte nicht vorbereitet werden',
        message: error?.message || 'Der Eingang konnte nicht als Notiz-Entwurf vorbereitet werden.'
      });
      console.error('[Archiv Wiki] Eingang konnte nicht als Notiz-Entwurf vorbereitet werden', error);
    }
  });

  const viewToggle = document.getElementById('viewToggle');
  viewToggle?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-mode]');
    if (!button) return;
    state.viewMode = button.dataset.mode;
    applyViewMode();
  });

  const btnSyncScroll = document.getElementById('btnSyncScroll');
  let syncScrollOn = state.project?.config?.syncScrollEnabled !== false;
  setSyncScrollEnabled(syncScrollOn);
  btnSyncScroll?.classList.toggle('active', syncScrollOn);
  btnSyncScroll?.setAttribute('aria-pressed', syncScrollOn ? 'true' : 'false');
  btnSyncScroll?.addEventListener('click', () => {
    syncScrollOn = !syncScrollOn;
    setSyncScrollEnabled(syncScrollOn);
    btnSyncScroll.classList.toggle('active', syncScrollOn);
    btnSyncScroll.setAttribute('aria-pressed', syncScrollOn ? 'true' : 'false');
  });

  const statLines = document.getElementById('statLines');
  const statWords = document.getElementById('statWords');
  const statCursor = document.getElementById('statCursor');
  const lines = body.length ? body.split('\n').length : 0;
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  statLines.textContent = `${lines} Zeile${lines === 1 ? '' : 'n'}`;
  statWords.textContent = `${words} Wort${words === 1 ? '' : 'e'}`;

  openIncomingInEditor({
    content: body,
    editorContainer: document.getElementById('editorContainer'),
    previewContainer: document.getElementById('previewContainer'),
    tabSize: state.project?.config?.editor?.tabSize ?? 2,
    projectPath: state.project?.path,
    getNoteIndex: () => fs.flattenNotes(state.tree).map(note => ({
      title: note.frontmatter?.title || note.name.replace(/\.md$/, ''),
      relPath: note.relPath
    })),
    onCursorActivity: (pos) => {
      if (statCursor) statCursor.textContent = `Zeile ${pos.line}, Spalte ${pos.column}`;
    }
  });

  if (imagePreview?.dataUrl) {
    const previewContainer = document.getElementById('previewContainer');
    if (previewContainer) {
      previewContainer.innerHTML = `
        <div class="incoming-image-preview">
          <img src="${escapeHtml(imagePreview.dataUrl)}" alt="${escapeHtml(title)}">
          <div class="incoming-image-caption">${escapeHtml(imagePreview.fileName || title)}</div>
        </div>`;
    }
  }
}

function incomingDraftFrontmatter(draft) {
  const source = draft?.source || {};
  const origin = {
    type: 'incoming',
    incomingId: draft?.incomingId || null
  };
  if (source.sourceLabel) origin.source = source.sourceLabel;
  if (source.sourceUrl) origin.sourceUrl = source.sourceUrl;
  if (source.imageUrl) origin.imageUrl = source.imageUrl;
  if (source.pageTitle) origin.pageTitle = source.pageTitle;
  if (source.fileName) origin.fileName = source.fileName;
  if (source.importType) origin.importType = source.importType;
  if (source.capturedAt) origin.capturedAt = source.capturedAt;
  return { origin };
}

function incomingImageDataUrlToArrayBuffer(dataUrl) {
  const match = String(dataUrl || '').match(/^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match) throw new Error('Die Bilddaten des Eingangs sind ungültig.');
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function renderIncomingDraftImagePreview(previewContainer, draft) {
  const marker = draft?.image?.marker;
  const dataUrl = draft?.image?.dataUrl;
  if (!previewContainer || !marker || !dataUrl) return;
  previewContainer.querySelectorAll('img').forEach((image) => {
    if (image.dataset.incomingImageMarker === marker) {
      image.src = dataUrl;
      delete image.dataset.incomingImageMarker;
    }
  });
}

let incomingDraftSaveInProgress = false;

async function saveIncomingNoteDraft() {
  const slug = currentSlug();
  if (!slug.startsWith('incoming-draft/') || incomingDraftSaveInProgress) return null;

  const incomingId = slug.slice('incoming-draft/'.length);
  const draft = state.incomingNoteDraft;
  if (!draft || draft.incomingId !== incomingId) return null;

  const isAppendDraft = draft.mode === 'append-note';
  const titleInput = document.getElementById('incomingDraftTitle');
  const status = document.getElementById('incomingDraftStatus');
  const saveButton = document.getElementById('btnSaveIncomingDraft');
  const title = titleInput?.value.trim() || draft.title?.trim() || 'Neue Notiz';
  const content = getEditorContent();

  let targetRelPath = draft.targetRelPath || null;
  if (!isAppendDraft) {
    const subCategories = collectSubCategories(state.tree);
    if (subCategories.length === 0) {
      await showMessageDialog({
        title: 'Unterkategorie erforderlich',
        message: 'Lege zuerst eine Unterkategorie an. Danach kannst du den Eingang als Notiz speichern.'
      });
      return null;
    }

    targetRelPath = subCategories.length === 1
      ? subCategories[0].relPath
      : await showCategoryPickerModal(subCategories, 'Neue Notiz ablegen in');
    if (!targetRelPath || currentSlug() !== slug) return null;
  } else if (!targetRelPath) {
    await showMessageDialog({
      title: 'Zielnotiz fehlt',
      message: 'Die bestehende Notiz, die ergänzt werden sollte, ist nicht mehr verfügbar.'
    });
    return null;
  }

  incomingDraftSaveInProgress = true;
  if (saveButton) saveButton.disabled = true;
  if (status) {
    status.textContent = 'Speichern …';
    status.classList.remove('has-error');
  }

  let stagedAttachmentFileName = null;
  let noteWriteCompleted = false;

  try {
    let contentForNote = content;
    if (draft.image?.marker && contentForNote.includes(draft.image.marker)) {
      const imageBuffer = incomingImageDataUrlToArrayBuffer(draft.image.dataUrl);
      const savedAttachment = await fs.saveAttachment(draft.image.fileName || 'Bild.png', imageBuffer);
      if (!savedAttachment?.fileName) {
        throw new Error('Der Bild-Anhang konnte nicht in den Notizbereich übernommen werden.');
      }
      stagedAttachmentFileName = savedAttachment.fileName;
      contentForNote = contentForNote.split(draft.image.marker).join(`attachment:${stagedAttachmentFileName}`);
    }

    let savedNote;
    if (isAppendDraft) {
      const existingTarget = await fs.readNote(targetRelPath);
      if (!existingTarget?.relPath) {
        throw new Error('Die ausgewählte bestehende Notiz konnte nicht mehr geladen werden.');
      }
      savedNote = await fs.saveNote(targetRelPath, contentForNote, undefined);
    } else {
      draft.title = title;
      savedNote = await fs.createNote(targetRelPath, title, contentForNote, {
        literalBody: true,
        frontmatterPatch: incomingDraftFrontmatter(draft)
      });
    }
    noteWriteCompleted = true;

    // Erst nach erfolgreichem erneuten Lesen gilt die Verarbeitung als sicher
    // abgeschlossen. Bei einem Fehler bleibt der Eingang unangetastet.
    const persistedNote = await fs.readNote(savedNote?.relPath);
    if (!persistedNote || persistedNote.relPath !== savedNote?.relPath || (isAppendDraft && persistedNote.body !== contentForNote)) {
      throw new Error(isAppendDraft
        ? 'Die ergänzte Notiz konnte nach dem Speichern nicht bestätigt werden.'
        : 'Die neu angelegte Notiz konnte nicht bestätigt werden.');
    }

    let incomingCleanupError = null;
    try {
      const deletion = await window.archivAPI.incoming.delete(incomingId);
      if (!deletion?.deleted) {
        throw new Error('Der verarbeitete Eingang konnte nicht entfernt werden.');
      }
    } catch (error) {
      incomingCleanupError = error;
      console.error('[Archiv Wiki] Verarbeiteter Eingang konnte nach erfolgreichem Speichern nicht gelöscht werden', error);
    }

    state.incomingNoteDraft = null;
    state.incomingProcessing = null;

    try {
      await refreshAll();
    } catch (error) {
      console.error('[Archiv Wiki] Ansicht konnte nach der Eingang-Verarbeitung nicht vollständig aktualisiert werden', error);
    }

    void navigateTo('#note/' + encodeURIComponent(savedNote.relPath));

    if (incomingCleanupError) {
      setTimeout(() => {
        showMessageDialog({
          title: 'Eingang blieb erhalten',
          message: 'Die Notiz wurde gespeichert, der ursprüngliche Eingang konnte jedoch nicht entfernt werden und bleibt im Eingang erhalten.'
        });
      }, 0);
    }

    return savedNote;
  } catch (error) {
    // Wurde das Bild bereits in .attachments kopiert, aber die Zielnotiz noch
    // nicht erfolgreich geschrieben, wird nur diese neue Kopie entfernt.
    // Der Eingang selbst bleibt bei jedem Fehler unangetastet.
    if (stagedAttachmentFileName && !noteWriteCompleted) {
      try {
        await fs.deleteAttachment(stagedAttachmentFileName);
      } catch (cleanupError) {
        console.warn('[Archiv Wiki] Vorbereiteter Bild-Anhang konnte nach fehlgeschlagenem Speichern nicht entfernt werden', cleanupError);
      }
    }

    if (currentSlug() === slug && status) {
      status.textContent = 'Speichern fehlgeschlagen';
      status.classList.add('has-error');
    }
    await showMessageDialog({
      title: 'Notiz konnte nicht gespeichert werden',
      message: error?.message || (isAppendDraft
        ? 'Die bestehende Notiz konnte nicht ergänzt werden.'
        : 'Die neue Notiz konnte nicht gespeichert werden.')
    });
    console.error('[Archiv Wiki] Eingang-Entwurf konnte nicht gespeichert werden', error);
    return null;
  } finally {
    incomingDraftSaveInProgress = false;
    if (currentSlug() === slug && saveButton) saveButton.disabled = false;
  }
}

async function renderIncomingNoteDraft(id) {
  setActiveNav(null);
  setBreadcrumb('Eingang / Notiz-Entwurf');

  let draft = state.incomingNoteDraft;
  if (!draft || draft.incomingId !== id) {
    try {
      const entry = await window.archivAPI.incoming.get(id);
      if (currentSlug() !== `incoming-draft/${id}`) return;
      draft = await prepareIncomingNoteDraft(entry);
    } catch (error) {
      if (currentSlug() !== `incoming-draft/${id}`) return;
      els.contentScroll.innerHTML = `
        <div class="incoming-view">
          <h1 class="home-heading">Neue Notiz</h1>
          <div class="empty-state">
            <div class="empty-state-title">Entwurf konnte nicht vorbereitet werden.</div>
            <div class="empty-state-body">${escapeHtml(error?.message || 'Information nicht verfügbar.')}</div>
          </div>
        </div>`;
      return;
    }
  }

  if (currentSlug() !== `incoming-draft/${id}`) return;

  const isAppendDraft = draft.mode === 'append-note';
  const draftModeLabel = isAppendDraft ? 'Bestehende Notiz ergänzen' : 'Neue Notiz';
  const sourceLabel = incomingDraftSourceLabel(draft);
  setBreadcrumb(`Eingang / ${draftModeLabel}`);
  els.topbarNoteDates.textContent = `${draftModeLabel} · noch nicht gespeichert`;

  els.contentScroll.innerHTML = `
    <div class="note-header incoming-document-header">
      <div class="note-document-title">
        <input type="text" class="note-title-input" id="incomingDraftTitle" value="${escapeHtml(draft.title)}" aria-label="${isAppendDraft ? 'Titel der bestehenden Notiz' : 'Titel der neuen Notiz'}"${isAppendDraft ? ' readonly' : ''}>
      </div>
      <div class="note-document-meta">
        <span class="note-meta-label">${draftModeLabel}</span>
        <span class="note-meta-divider" aria-hidden="true"></span>
        <span class="note-meta-label" title="${escapeHtml(sourceLabel)}">Quelle: ${escapeHtml(sourceLabel)}</span>
      </div>
      <div class="note-document-actions">
        <span class="dirty-label is-dirty" id="incomingDraftStatus">● nicht gespeichert</span>
        <button type="button" class="btn" id="btnCancelIncomingDraft">Abbrechen</button>
        <button type="button" class="btn primary" id="btnSaveIncomingDraft" title="Als Notiz speichern (Ctrl+S)">Speichern</button>
      </div>
    </div>
    <div class="note-toolbar" aria-label="Notiz-Entwurf">
      <div class="toolbar-group toolbar-view-group">
        <span class="toolbar-group-label">Ansicht</span>
        <div class="toolbar-group-controls">
          <div class="view-toggle" id="viewToggle">
            <button type="button" data-mode="editor" title="Nur Editor anzeigen" aria-label="Nur Editor anzeigen" aria-pressed="false">Editor</button>
            <button type="button" data-mode="split" title="Editor und Vorschau nebeneinander anzeigen" aria-label="Split-Ansicht anzeigen" aria-pressed="false">Split</button>
            <button type="button" data-mode="preview" title="Nur Vorschau anzeigen" aria-label="Nur Vorschau anzeigen" aria-pressed="false">Vorschau</button>
          </div>
          <button type="button" class="icon-btn sync-scroll-toggle" id="btnSyncScroll" title="Synchrones Scrollen im Split-Modus" aria-label="Synchrones Scrollen im Split-Modus umschalten" aria-pressed="false">⇅</button>
        </div>
      </div>
    </div>
    <div class="note-split mode-split" id="noteSplit">
      <div id="editorContainer" class="editor-pane"></div>
      <div class="split-resizer" id="splitResizer" title="Ziehen zum Verändern der Breite"></div>
      <div id="previewContainer" class="preview-pane" tabindex="0"></div>
    </div>
    <div class="note-bottombar">
      <span id="statLines">0 Zeilen</span>
      <span id="statWords">0 Wörter</span>
      <span class="spacer"></span>
      <span id="statCursor">Zeile 1, Spalte 1</span>
      <span>Entwurf aus Eingang</span>
    </div>`;

  applyViewMode();
  wireSplitResizer();

  const titleInput = document.getElementById('incomingDraftTitle');
  const status = document.getElementById('incomingDraftStatus');
  const statLines = document.getElementById('statLines');
  const statWords = document.getElementById('statWords');
  const statCursor = document.getElementById('statCursor');

  function updateDraftCounts(text) {
    const lines = text.length ? text.split('\n').length : 0;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    statLines.textContent = `${lines} Zeile${lines === 1 ? '' : 'n'}`;
    statWords.textContent = `${words} Wort${words === 1 ? '' : 'e'}`;
  }

  if (!isAppendDraft) {
    titleInput?.addEventListener('input', () => {
      draft.title = titleInput.value;
      draft.hasUnsavedChanges = true;
      status.textContent = '● nicht gespeichert';
      setBreadcrumb(`Eingang / ${titleInput.value.trim() || 'Neue Notiz'}`);
    });
  }

  document.getElementById('btnSaveIncomingDraft')?.addEventListener('click', () => {
    saveIncomingNoteDraft();
  });

  document.getElementById('btnCancelIncomingDraft')?.addEventListener('click', () => {
    void navigateTo('#incoming/' + encodeURIComponent(id));
  });

  document.getElementById('viewToggle')?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-mode]');
    if (!button) return;
    state.viewMode = button.dataset.mode;
    applyViewMode();
  });

  const btnSyncScroll = document.getElementById('btnSyncScroll');
  let syncScrollOn = state.project?.config?.syncScrollEnabled !== false;
  setSyncScrollEnabled(syncScrollOn);
  btnSyncScroll?.classList.toggle('active', syncScrollOn);
  btnSyncScroll?.setAttribute('aria-pressed', syncScrollOn ? 'true' : 'false');
  btnSyncScroll?.addEventListener('click', () => {
    syncScrollOn = !syncScrollOn;
    setSyncScrollEnabled(syncScrollOn);
    btnSyncScroll.classList.toggle('active', syncScrollOn);
    btnSyncScroll.setAttribute('aria-pressed', syncScrollOn ? 'true' : 'false');
  });

  updateDraftCounts(draft.content || '');
  openNoteDraftInEditor({
    content: draft.content,
    editorContainer: document.getElementById('editorContainer'),
    previewContainer: document.getElementById('previewContainer'),
    tabSize: state.project?.config?.editor?.tabSize ?? 2,
    projectPath: state.project?.path,
    getNoteIndex: () => fs.flattenNotes(state.tree).map(note => ({
      title: note.frontmatter?.title || note.name.replace(/\.md$/, ''),
      relPath: note.relPath
    })),
    onChange: (_dirty, text) => {
      draft.content = text;
      draft.hasUnsavedChanges = true;
      status.textContent = '● nicht gespeichert';
      updateDraftCounts(text);
    },
    onCursorActivity: (pos) => {
      if (statCursor) statCursor.textContent = `Zeile ${pos.line}, Spalte ${pos.column}`;
    },
    onPreviewRendered: (previewContainer) => {
      renderIncomingDraftImagePreview(previewContainer, draft);
    }
  });

  requestAnimationFrame(() => {
    if (currentSlug() !== `incoming-draft/${id}`) return;
    focusEditor();
  });
}

async function renderIncoming() {
  setBreadcrumb('Eingang');
  setActiveNav(null);

  els.contentScroll.innerHTML = `
    <div class="incoming-view">
      <div class="home-header-row">
        <div>
          <h1 class="home-heading">Eingang</h1>
          <p class="home-sub">Gesammelte Inhalte, die noch nicht als Wissen verarbeitet wurden.</p>
        </div>
      </div>
      <div class="dashboard-section" aria-label="Eingänge">
        <div class="dashboard-section-header">Eingänge</div>
        <div class="empty-state">Eingänge werden geladen …</div>
      </div>
    </div>`;

  try {
    const entries = await window.archivAPI.incoming.load();
    if (currentSlug() !== 'incoming') return;

    const section = els.contentScroll.querySelector('.incoming-view .dashboard-section');
    if (!section) return;

    const safeEntries = Array.isArray(entries) ? entries : [];
    const selectableEntryIds = safeEntries
      .map(entry => typeof entry?.id === 'string' ? entry.id : '')
      .filter(Boolean);
    const selectedEntryIds = new Set();
    let deleteInProgress = false;
    section.innerHTML = `
      <div class="dashboard-section-header">
        <span>Eingänge · ${safeEntries.length}</span>
        <div class="incoming-bulk-actions" aria-label="Eingangsauswahl">
          <span class="incoming-selection-status" id="incomingSelectionStatus" role="status" aria-live="polite">0 ausgewählt</span>
          <button type="button" class="btn" id="btnSelectAllIncoming">Alle auswählen</button>
          <button type="button" class="btn" id="btnClearIncomingSelection">Auswahl aufheben</button>
          <button type="button" class="btn danger" id="btnDeleteSelectedIncoming">Löschen</button>
        </div>
      </div>
      <div class="dashboard-list" id="incomingList"></div>`;

    const list = section.querySelector('#incomingList');
    const selectionStatus = section.querySelector('#incomingSelectionStatus');
    const selectAllButton = section.querySelector('#btnSelectAllIncoming');
    const clearSelectionButton = section.querySelector('#btnClearIncomingSelection');
    const deleteSelectedButton = section.querySelector('#btnDeleteSelectedIncoming');

    function updateIncomingSelectionControls() {
      const selectedCount = selectedEntryIds.size;
      selectionStatus.textContent = `${selectedCount} ausgewählt`;
      selectAllButton.disabled = deleteInProgress
        || selectableEntryIds.length === 0
        || selectedCount === selectableEntryIds.length;
      clearSelectionButton.disabled = deleteInProgress || selectedCount === 0;
      deleteSelectedButton.disabled = deleteInProgress || selectedCount === 0;
      deleteSelectedButton.textContent = selectedCount > 0 ? `Löschen (${selectedCount})` : 'Löschen';

      list.querySelectorAll('.incoming-select-checkbox').forEach((checkbox) => {
        checkbox.disabled = deleteInProgress;
        checkbox.checked = selectedEntryIds.has(checkbox.dataset.incomingId);
        checkbox.closest('.incoming-row')?.classList.toggle('is-selected', checkbox.checked);
      });
    }

    function setAllIncomingSelected(selected) {
      selectedEntryIds.clear();
      if (selected) selectableEntryIds.forEach(id => selectedEntryIds.add(id));
      updateIncomingSelectionControls();
    }

    selectAllButton.addEventListener('click', () => setAllIncomingSelected(true));
    clearSelectionButton.addEventListener('click', () => setAllIncomingSelected(false));
    deleteSelectedButton.addEventListener('click', async () => {
      const idsToDelete = selectableEntryIds.filter(id => selectedEntryIds.has(id));
      if (idsToDelete.length === 0 || deleteInProgress) return;

      const singular = idsToDelete.length === 1;
      if (!await showConfirmDialog({
        title: singular ? 'Eingang löschen?' : 'Eingänge löschen?',
        message: singular
          ? 'Der ausgewählte Eingangseintrag wird gelöscht.'
          : 'Die ausgewählten Eingangseinträge werden gelöscht.',
        confirmLabel: 'Löschen',
        danger: true
      })) return;

      deleteInProgress = true;
      updateIncomingSelectionControls();

      const failures = [];
      for (const id of idsToDelete) {
        try {
          const result = await window.archivAPI.incoming.delete(id);
          if (!result?.deleted) throw new Error('Der Eingangseintrag wurde nicht gefunden.');
        } catch (error) {
          failures.push(error);
          console.error(`Eingang konnte nicht gelöscht werden (${id})`, error);
        }
      }

      if (currentSlug() === 'incoming') await renderIncoming();
      if (failures.length > 0) {
        await showMessageDialog({
          title: 'Nicht alle Eingänge gelöscht',
          message: failures.length === 1
            ? 'Ein ausgewählter Eingangseintrag konnte nicht gelöscht werden.'
            : `${failures.length} ausgewählte Eingangseinträge konnten nicht gelöscht werden.`
        });
      }
    });

    if (safeEntries.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-title">Noch keine Eingänge.</div>
          <div class="empty-state-body">Gesammelte Inhalte erscheinen hier, bevor sie später weiterverarbeitet werden.</div>
        </div>`;
      updateIncomingSelectionControls();
      return;
    }

    for (const entry of safeEntries) {
      const row = document.createElement('div');
      const title = incomingDisplayTitle(entry);
      const typeLabel = incomingTypeLabel(entry);
      const sourceInfo = incomingPreview(entry);
      const createdDate = formatAbsoluteDate(entry?.createdAt || entry?.updatedAt) || 'Zeitpunkt nicht verfügbar';

      row.className = 'dashboard-row incoming-row';
      row.innerHTML = `
        <label class="incoming-row-select">
          <input type="checkbox" class="incoming-select-checkbox" data-incoming-id="${escapeHtml(entry.id)}" aria-label="${escapeHtml(title)} auswählen">
        </label>
        <button type="button" class="incoming-row-open" aria-label="Eingang öffnen: ${escapeHtml(typeLabel)}, ${escapeHtml(title)}">
          <span class="dr-icon" aria-hidden="true"><img class="lib-icon" src="${escapeHtml(incomingListIconSrc(entry))}" alt=""></span>
          <span class="dr-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
          <span class="dr-excerpt" title="${escapeHtml(sourceInfo)}">${escapeHtml(sourceInfo)}</span>
          <span class="dr-tag">${escapeHtml(typeLabel)}</span>
          <span class="dr-date">${escapeHtml(createdDate)}</span>
        </button>`;
      const checkbox = row.querySelector('.incoming-select-checkbox');
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedEntryIds.add(entry.id);
        else selectedEntryIds.delete(entry.id);
        updateIncomingSelectionControls();
      });
      const openIncoming = () => {
        void navigateTo('#incoming/' + encodeURIComponent(entry.id));
      };
      row.querySelector('.incoming-row-open').addEventListener('click', openIncoming);
      list.appendChild(row);
    }
    updateIncomingSelectionControls();
  } catch (error) {
    if (currentSlug() !== 'incoming') return;
    const section = els.contentScroll.querySelector('.incoming-view .dashboard-section');
    if (section) {
      section.innerHTML = `
        <div class="dashboard-section-header">Eingänge</div>
        <div class="empty-state">
          <div class="empty-state-title">Eingänge konnten nicht geladen werden.</div>
          <div class="empty-state-body">Der Eingang-Speicher ist momentan nicht verfügbar.</div>
        </div>`;
    }
    console.error('[Archiv Wiki] Eingang konnte nicht geladen werden', error);
  }
}

// ---------------------------------------------------------------------------
// Wissenspflege: Grundgerüst für spätere, archivweite Qualitätsprüfungen.
// In diesem Schritt werden bewusst noch keine Analysen ausgeführt.
// ---------------------------------------------------------------------------
async function renderKnowledgeCare() {
  setBreadcrumb('Wissenspflege');
  els.homeLink.classList.remove('active');
  els.incomingLink.classList.remove('active');
  els.knowledgeCareLink.classList.add('active');
  els.navTree.querySelectorAll('.nav-link[data-relpath]').forEach(a => a.classList.remove('active'));

  els.contentScroll.innerHTML = `
    <h1 class="home-heading">Wissenspflege</h1>
    <p class="home-sub">Prüfe dein Archiv auf mögliche Verbesserungen.</p>
    <div class="dashboard-section" id="knowledgeLinksSection" aria-label="Verknüpfungen">
      <div class="dashboard-section-header">Verknüpfungen</div>
      <div class="empty-state">Wikilinks werden geprüft …</div>
    </div>
    <div class="dashboard-section" id="knowledgeOrganisationSection" aria-label="Organisation">
      <div class="dashboard-section-header">Organisation</div>
      <div class="empty-state">Organisation wird geprüft …</div>
    </div>
    <div class="dashboard-section" id="knowledgeContentSection" aria-label="Inhalte">
      <div class="dashboard-section-header">Inhalte</div>
      <div class="empty-state">Inhalte werden geprüft …</div>
    </div>`;

  try {
    const notes = fs.flattenNotes(state.tree);
    const documents = await fs.getSearchDocuments();

    // Die Route könnte während des Dateizugriffs bereits gewechselt worden
    // sein. In diesem Fall darf die alte Prüfung keine andere Ansicht ersetzen.
    if (currentSlug() !== 'knowledge-care') return;

    const brokenLinks = findBrokenWikiLinks(notes, documents);
    const notesWithoutTags = findNotesWithoutTags(notes);
    const emptyNotes = findEmptyNotes(notes, documents);

    const linksSection = document.getElementById('knowledgeLinksSection');
    const organisationSection = document.getElementById('knowledgeOrganisationSection');
    const contentSection = document.getElementById('knowledgeContentSection');
    if (!linksSection || !organisationSection || !contentSection) return;

    linksSection.innerHTML = `
      <div class="dashboard-section-header">
        Verknüpfungen · ${brokenLinks.length} ${brokenLinks.length === 1 ? 'defekter Wikilink' : 'defekte Wikilinks'}
      </div>
      <div class="dashboard-list" id="brokenWikiLinksList"></div>`;

    const list = linksSection.querySelector('#brokenWikiLinksList');
    if (brokenLinks.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          Keine defekten Wikilinks gefunden.
        </div>`;
      return;
    }

    brokenLinks.forEach(issue => {
      const row = document.createElement('div');
      row.className = 'dashboard-row';
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', `${issue.sourceTitle} öffnen. Defekter Wikilink ${issue.syntax}`);
      row.innerHTML = `
        <span class="dr-icon" aria-hidden="true">⛓</span>
        <span class="dr-title">${escapeHtml(issue.sourceTitle)}</span>
        <span class="dr-excerpt">Defekter Wikilink: ${escapeHtml(issue.syntax)}</span>
        <span class="dr-tag">Fehlendes Ziel: ${escapeHtml(issue.target)}</span>
        <span class="dr-date">Öffnen</span>`;

      const openSourceNote = () => {
        void navigateTo('#note/' + encodeURIComponent(issue.sourceRelPath));
      };
      row.addEventListener('click', openSourceNote);
      row.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openSourceNote();
      });
      list.appendChild(row);
    });

    organisationSection.innerHTML = `
      <div class="dashboard-section-header">
        Organisation · ${notesWithoutTags.length} ${notesWithoutTags.length === 1 ? 'Notiz ohne Tags' : 'Notizen ohne Tags'}
      </div>
      <div class="dashboard-list" id="notesWithoutTagsList"></div>`;

    const untaggedList = organisationSection.querySelector('#notesWithoutTagsList');
    if (notesWithoutTags.length === 0) {
      untaggedList.innerHTML = `
        <div class="empty-state">
          Alle Notizen besitzen mindestens einen Tag.
        </div>`;
    } else {
      notesWithoutTags.forEach(issue => {
        const row = document.createElement('div');
        row.className = 'dashboard-row';
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        row.setAttribute('aria-label', `${issue.title} öffnen. Notiz ohne Tags`);
        row.innerHTML = `
          <span class="dr-icon" aria-hidden="true">🏷</span>
          <span class="dr-title">${escapeHtml(issue.title)}</span>
          <span class="dr-excerpt">Notiz ohne Tags</span>
          <span class="dr-tag">${issue.category ? escapeHtml(issue.category) : ''}</span>
          <span class="dr-date">Öffnen</span>`;

        const openNote = () => {
          void navigateTo('#note/' + encodeURIComponent(issue.relPath));
        };
        row.addEventListener('click', openNote);
        row.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          openNote();
        });
        untaggedList.appendChild(row);
      });
    }

    contentSection.innerHTML = `
      <div class="dashboard-section-header">
        Inhalte · ${emptyNotes.length} ${emptyNotes.length === 1 ? 'leere Notiz' : 'leere Notizen'}
      </div>
      <div class="dashboard-list" id="emptyNotesList"></div>`;

    const emptyNotesList = contentSection.querySelector('#emptyNotesList');
    if (emptyNotes.length === 0) {
      emptyNotesList.innerHTML = `
        <div class="empty-state">
          Keine leeren Notizen gefunden.
        </div>`;
    } else {
      emptyNotes.forEach(issue => {
        const row = document.createElement('div');
        row.className = 'dashboard-row';
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        row.setAttribute('aria-label', `${issue.title} öffnen. Leere Notiz`);
        row.innerHTML = `
          <span class="dr-icon" aria-hidden="true">📄</span>
          <span class="dr-title">${escapeHtml(issue.title)}</span>
          <span class="dr-excerpt">Leere Notiz</span>
          <span class="dr-tag">${issue.category ? escapeHtml(issue.category) : ''}</span>
          <span class="dr-date">Öffnen</span>`;

        const openNote = () => {
          void navigateTo('#note/' + encodeURIComponent(issue.relPath));
        };
        row.addEventListener('click', openNote);
        row.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          openNote();
        });
        emptyNotesList.appendChild(row);
      });
    }
  } catch (error) {
    if (currentSlug() !== 'knowledge-care') return;
    const linksSection = document.getElementById('knowledgeLinksSection');
    const organisationSection = document.getElementById('knowledgeOrganisationSection');
    const contentSection = document.getElementById('knowledgeContentSection');

    if (linksSection) {
      linksSection.innerHTML = `
        <div class="dashboard-section-header">Verknüpfungen</div>
        <div class="empty-state">
          Wikilinks konnten nicht geprüft werden.
        </div>`;
    }

    if (organisationSection) {
      organisationSection.innerHTML = `
        <div class="dashboard-section-header">Organisation</div>
        <div class="empty-state">
          Notizen ohne Tags konnten nicht geprüft werden.
        </div>`;
    }

    if (contentSection) {
      contentSection.innerHTML = `
        <div class="dashboard-section-header">Inhalte</div>
        <div class="empty-state">
          Leere Notizen konnten nicht geprüft werden.
        </div>`;
    }
    console.error('[Archiv Wiki] Wissenspflege-Prüfung fehlgeschlagen', error);
  }
}

// ---------------------------------------------------------------------------
// Papierkorb
// ---------------------------------------------------------------------------
// --- Tags: Übersicht aller vergebenen Schlagwörter, anklickbar zum Filtern ---
async function renderTagsOverview(activeTag) {
  setBreadcrumb(activeTag ? `Tags / ${activeTag}` : 'Tags');
  els.homeLink.classList.remove('active');
  els.incomingLink.classList.remove('active');
  els.knowledgeCareLink.classList.remove('active');
  els.navTree.querySelectorAll('.nav-link[data-relpath]').forEach(a => a.classList.remove('active'));

  const notes = fs.flattenNotes(state.tree);
  const tagCounts = new Map();
  notes.forEach(n => (n.frontmatter?.tags || []).forEach(t => tagCounts.set(t, (tagCounts.get(t) || 0) + 1)));
  const sortedTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);

  if (sortedTags.length === 0) {
    els.contentScroll.innerHTML = `
      <h1 class="home-heading">Tags</h1>
      <div class="empty-state">Noch keine Tags vergeben — trag welche im Tag-Feld einer Notiz ein (z. B. "linux, setup").</div>`;
    return;
  }

  const tagCloudHtml = sortedTags.map(([tag, count]) => `
    <button type="button" class="tag-chip${tag === activeTag ? ' active' : ''}" data-tag="${escapeHtml(tag)}">
      ${escapeHtml(tag)} <span class="tag-count">${count}</span>
    </button>`).join('');

  const filteredNotes = activeTag ? notes.filter(n => (n.frontmatter?.tags || []).includes(activeTag)) : [];

  els.contentScroll.innerHTML = `
    <h1 class="home-heading">Tags</h1>
    <div class="tag-cloud">${tagCloudHtml}</div>
    ${activeTag ? `
      <h2 class="tag-section-heading">Notizen mit "${escapeHtml(activeTag)}"</h2>
      <div class="dashboard-section all" style="max-height:60vh;">
        <div class="dashboard-list" id="tagNotesList"></div>
      </div>` : '<p class="home-sub" style="margin-top:14px;">Klicke auf einen Tag, um die zugehörigen Notizen zu sehen.</p>'}
  `;

  els.contentScroll.querySelectorAll('.tag-chip').forEach(chip => {
    chip.addEventListener('click', () => { void navigateTo('#tags/' + encodeURIComponent(chip.dataset.tag)); });
  });

  if (activeTag) {
    const list = document.getElementById('tagNotesList');
    let bodyByRelPath = new Map();
    try {
      const docs = await fs.getSearchDocuments();
      bodyByRelPath = new Map(docs.map(d => [d.relPath, d.body]));
    } catch { /* Ausschnitte sind rein informativ, Liste funktioniert auch ohne */ }
    filteredNotes.forEach(note => {
      const dateLabel = formatAbsoluteDate(note.frontmatter?.modified || note.frontmatter?.created);
      const excerpt = stripMarkdownSyntax(bodyByRelPath.get(note.relPath)).slice(0, 60);
      list.appendChild(buildDashboardRow(note, excerpt, dateLabel, false));
    });
  }
}

// --- Statistik-Seite: ausführlicher als das kleine Dashboard-Widget ---
async function renderStatsPage() {
  setBreadcrumb('Statistik');
  els.homeLink.classList.remove('active');
  els.incomingLink.classList.remove('active');
  els.knowledgeCareLink.classList.remove('active');
  els.navTree.querySelectorAll('.nav-link[data-relpath]').forEach(a => a.classList.remove('active'));

  const notes = fs.flattenNotes(state.tree);
  const mainCategories = collectMainCategories(state.tree);
  const subCategories = collectSubCategories(state.tree);

  let bodyByRelPath = new Map();
  try {
    const docs = await fs.getSearchDocuments();
    bodyByRelPath = new Map(docs.map(d => [d.relPath, d.body]));
  } catch { /* Wortzahl ist rein informativ, Seite funktioniert auch ohne */ }
  const totalWords = notes.reduce((sum, n) => {
    const body = bodyByRelPath.get(n.relPath) || '';
    return sum + stripMarkdownSyntax(body).split(/\s+/).filter(Boolean).length;
  }, 0);

  const perMainCategory = new Map();
  notes.forEach(n => {
    const key = n.frontmatter?.mainCategory || '(ohne Thema)';
    perMainCategory.set(key, (perMainCategory.get(key) || 0) + 1);
  });
  const sortedCategories = [...perMainCategory.entries()].sort((a, b) => b[1] - a[1]);

  const tagCounts = new Map();
  notes.forEach(n => (n.frontmatter?.tags || []).forEach(t => tagCounts.set(t, (tagCounts.get(t) || 0) + 1)));
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  els.contentScroll.innerHTML = `
    <h1 class="home-heading">Statistik</h1>
    <div class="stats-widget">
      <div class="stat-chip"><span class="stat-num">${notes.length}</span><span class="stat-label">Notizen</span></div>
      <div class="stat-chip"><span class="stat-num">${mainCategories.length}</span><span class="stat-label">Hauptthemen</span></div>
      <div class="stat-chip"><span class="stat-num">${subCategories.length}</span><span class="stat-label">Unterthemen</span></div>
      <div class="stat-chip"><span class="stat-num">${totalWords.toLocaleString('de-DE')}</span><span class="stat-label">Wörter gesamt</span></div>
    </div>
    <div class="stats-columns">
      <div class="stats-block">
        <h2 class="tag-section-heading">Notizen pro Thema</h2>
        <div class="stats-bar-list">
          ${sortedCategories.map(([name, count]) => `
            <div class="stats-bar-row">
              <span class="stats-bar-label">${escapeHtml(name)}</span>
              <div class="stats-bar-track"><div class="stats-bar-fill" style="width:${Math.max(4, (count / notes.length) * 100)}%"></div></div>
              <span class="stats-bar-count">${count}</span>
            </div>`).join('')}
        </div>
      </div>
      <div class="stats-block">
        <h2 class="tag-section-heading">Meistgenutzte Tags</h2>
        ${topTags.length ? `<div class="tag-cloud">${topTags.map(([tag, count]) => `<span class="tag-chip">${escapeHtml(tag)} <span class="tag-count">${count}</span></span>`).join('')}</div>` : '<p class="home-sub">Noch keine Tags vergeben.</p>'}
      </div>
    </div>
  `;
}

async function renderTrash() {
  setBreadcrumb('Papierkorb');
  setActiveNav(null);
  const trash = await fs.getTrash();
  els.contentScroll.innerHTML = `
    <div class="trash-header">
      <div>
        <h1 class="home-heading">Papierkorb</h1>
        <p class="home-sub">${trash.length} Eintrag${trash.length === 1 ? '' : 'e'}</p>
      </div>
      ${trash.length ? '<button type="button" class="icon-btn danger" id="btnEmptyTrash" title="Papierkorb endgültig leeren" aria-label="Papierkorb endgültig leeren">🗑</button>' : ''}
    </div>
    ${trash.length ? '<div id="trashList"></div>' : '<div class="empty-state">Papierkorb ist leer.</div>'}
  `;
  const list = document.getElementById('trashList');
  if (list) {
    trash.forEach(item => {
      const row = document.createElement('div');
      row.className = 'note-card';
      row.innerHTML = `
        <div class="nc-top"><span class="nc-icon">${item.type === 'folder' ? '📁' : '📄'}</span><span class="nc-tag">war: ${escapeHtml(item.originalRelPath)}</span></div>
        <div class="nc-title">${escapeHtml(item.title)}</div>
        <button type="button" class="btn" data-restore="${escapeHtml(item.trashRelPath)}">↩ Wiederherstellen</button>
      `;
      list.appendChild(row);
    });
    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-restore]');
      if (!btn) return;
      await fs.restoreFromTrash(btn.dataset.restore);
      await refreshAll();
      renderTrash();
    });
  }
  document.getElementById('btnEmptyTrash')?.addEventListener('click', async () => {
    if (!await showConfirmDialog({
      title: 'Papierkorb endgültig leeren?',
      message: 'Alle Einträge im Papierkorb werden dauerhaft gelöscht. Das kann nicht rückgängig gemacht werden.',
      confirmLabel: 'Endgültig löschen',
      danger: true
    })) return;
    await fs.emptyTrash();
    renderTrash();
    updateTrashBadge();
  });
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('de-DE');
}
function formatTime(d) {
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
// Nutzer-Feature (Konflikt-Anzeige): kombiniert Datum+Uhrzeit in einem Zug,
// unter Wiederverwendung der beiden Funktionen oben statt eigener Logik.
function formatDateTime(iso) {
  if (!iso) return 'Zeitpunkt nicht verfügbar';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Zeitpunkt nicht verfügbar';
  return `${formatDate(iso)}, ${formatTime(d)} Uhr`;
}
// Nutzer-Feature (Konflikt-Anzeige): einzige Stelle im Projekt, die Bytes in
// eine lesbare Größe umwandelt — bisher gab es dafür noch keine Funktion.
function formatBytes(bytes) {
  if (bytes == null) return 'Information nicht verfügbar';
  if (bytes < 1000) return `${bytes} Byte`;
  if (bytes < 1000 * 1000) return `${(bytes / 1000).toFixed(1)} KB`;
  return `${(bytes / (1000 * 1000)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Unsaved-Changes-Warnung beim Schließen
// ---------------------------------------------------------------------------
window.addEventListener('beforeunload', (e) => {
  if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
});

// ---------------------------------------------------------------------------
// Tastatur- und Rechtsklick-Öffnung für Sidebar-Einträge zentral delegieren.
// Der Listener wird genau einmal registriert; renderNavTree() darf dadurch
// beliebig oft neu rendern, ohne weitere globale EventListener anzuhängen.
// ---------------------------------------------------------------------------
function wireSidebarContextMenuTriggers() {
  els.navTree.addEventListener('contextmenu', (event) => {
    const row = event.target.closest('[data-relpath]');
    if (!row || !els.navTree.contains(row)) return;
    event.preventDefault();
    event.stopPropagation();
    const trigger = event.target.closest('a, button, [tabindex]') || row;
    const type = row.dataset.type || row.closest('.nav-group')?.dataset.type || 'note';
    showContextMenu(row.dataset.relpath, trigger, type, { clientX: event.clientX, clientY: event.clientY });
  });

  els.navTree.addEventListener('keydown', (event) => {
    if (!isContextMenuKeyboardEvent(event)) return;

    const focusedTarget = event.target.closest(
      '.nav-link[data-relpath], .group-header'
    );
    if (!focusedTarget || !els.navTree.contains(focusedTarget)) return;

    const row = focusedTarget.closest('.nav-item-row[data-relpath], .nav-group[data-relpath]');
    if (!row) return;

    event.preventDefault();
    event.stopPropagation();
    const type = row.dataset.type || 'note';
    const point = contextMenuPointForElement(focusedTarget);
    showContextMenu(row.dataset.relpath, focusedTarget, type, point);
  }, true);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
// App-Passwortschutz: blockiert die restliche Initialisierung, bis das
// richtige Passwort eingegeben wurde (oder gar keins gesetzt ist). Prüfung
// läuft im Main-Prozess (main.js, app:verifyAppLock) — der Renderer bekommt
// nur ok/nicht-ok zurück, nie den gespeicherten Hash/Salt selbst zu sehen.
// Update-Hinweis im Sidebar-Footer (ersetzt die bisherige Archivpfad-Anzeige).
// "Einfacher Weg" wie besprochen: informiert nur, lädt/tauscht nichts selbst
// aus. Versionsnummern kommen beide zur Laufzeit (app.getVersion() bzw.
// GitHub-Releases-API), stehen nirgends fest im Code.
async function checkForUpdateAndRender() {
  applyCentralUpdateStatus(await fetchUpdateStatus());
}

function waitForUnlock({ force = false } = {}) {
  if (!force && !state.project?.config?.appLock?.enabled) return Promise.resolve();

  return new Promise((resolve) => {
    const screen = document.getElementById('lockScreen');
    const input = document.getElementById('lockScreenPassword');
    const errorEl = document.getElementById('lockScreenError');
    const unlockBtn = document.getElementById('lockScreenUnlock');

    input.value = '';
    errorEl.textContent = '';
    screen.style.display = 'flex';
    requestAnimationFrame(() => input.focus());

    async function tryUnlock() {
      const result = await window.archivAPI.verifyAppLock(input.value);
      if (result.ok) {
        unlockBtn.removeEventListener('click', tryUnlock);
        input.removeEventListener('keydown', handleKeydown);
        screen.style.display = 'none';
        resolve();
      } else {
        errorEl.textContent = 'Falsches Passwort.';
        input.value = '';
        input.focus();
      }
    }

    function handleKeydown(event) {
      if (event.key === 'Enter') tryUnlock();
    }

    unlockBtn.addEventListener('click', tryUnlock);
    input.addEventListener('keydown', handleKeydown);
  });
}

document.addEventListener('archiv-wiki:lock-now', () => {
  waitForUnlock({ force: true });
});

(async function init() {
  state.project = await window.archivAPI.getCurrentProject();
  applyIncomingSidebarVisibility(state.project?.config);

  const lockWikiButton = document.getElementById('btnLockWiki');
  if (lockWikiButton) {
    lockWikiButton.hidden = !state.project?.config?.appLock?.enabled;
    lockWikiButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      document.dispatchEvent(new CustomEvent('archiv-wiki:lock-now'));
    });
  }

  await waitForUnlock();

  checkForUpdateAndRender();

  applyAccentPalette(state.project?.config?.accentKey, state.project?.config?.customAccentColor);
  applySidebarDensity(state.project?.config?.sidebarDensity);
  applyReadingWidth(state.project?.config?.readingWidthEnabled, state.project?.config?.readingWidthKey);
  applyEditorFontSize(state.project?.config?.editorFontSize);
  initEllipsisTooltips();
  wireSidebarContextMenuTriggers();
  // Sidebar-Kollaps-Zustand wiederherstellen (Nutzer-Feature) — nur die
  // Klasse/den Titel setzen, nicht erneut speichern, der Wert kommt ja
  // bereits aus der gespeicherten Konfiguration.
  const startCollapsed = state.project?.config?.sidebarCollapsed === true;
  document.body.classList.toggle('sidebar-collapsed', startCollapsed);
  els.burgerBtn.title = startCollapsed ? 'Sidebar einblenden' : 'Sidebar ausblenden';
  // Gespeicherte Sidebar-Breite wiederherstellen (Nutzer-Feature) — nur
  // anwenden, wenn tatsächlich eine abweichende Breite gespeichert wurde,
  // sonst bleibt es beim CSS-Standardwert (292px).
  const savedWidth = state.project?.config?.sidebarWidth;
  if (typeof savedWidth === 'number' && savedWidth >= 220 && savedWidth <= 480) {
    document.documentElement.style.setProperty('--sidebar-w', savedWidth + 'px');
  }
  // Gespeicherten Ansichtsmodus wiederherstellen (Nutzer-Feature) — nur
  // anwenden, wenn ein gültiger Wert gespeichert wurde, sonst bleibt es beim
  // Standard ('split') aus der initialen State-Deklaration.
  const savedViewMode = state.project?.config?.viewMode;
  if (['split', 'editor', 'preview'].includes(savedViewMode)) {
    state.viewMode = savedViewMode;
  }

  // Backup-Warnung: Symbol bleibt standardmäßig versteckt, erscheint nur ab
  // 3 aufeinanderfolgenden fehlgeschlagenen Backups (main/backup.js zählt das
  // projektbezogen mit) — vorher liefen Fehlschläge unbemerkt im Hintergrund.
  function applyBackupStatus(backupStatus) {
    const btn = document.getElementById('btnBackupWarning');
    if (!btn) return;
    const visible = backupStatus.consecutiveFailures >= 3;
    btn.style.display = visible ? 'flex' : 'none';
    btn.onclick = null;
    if (!visible) {
      btn.removeAttribute('title');
      return;
    }
    const lastError = backupStatus.lastErrorAt ? formatRelativeTime(backupStatus.lastErrorAt) : 'Zeitpunkt nicht verfügbar';
    btn.title = `${backupStatus.consecutiveFailures}x Backup in Folge fehlgeschlagen (zuletzt: ${lastError})`;
    btn.onclick = () => showBackupErrorModal(backupStatus);
  }

  try {
    applyBackupStatus(await window.archivAPI.getBackupStatus());
    window.archivAPI.onBackupStatusUpdated?.(applyBackupStatus);
  } catch { /* Backup-Status ist rein informativ, App funktioniert auch ohne diese Prüfung */ }

  // Extern eingehende Web-Clips aktualisieren nur die bereits geöffnete
  // Eingang-Übersicht. Andere Ansichten werden bewusst nicht unterbrochen.
  window.archivAPI.incoming?.onCreated?.(() => {
    if (currentSlug() === 'incoming') renderIncoming();
  });

  // Branding-Zeile über der Suche: "Wiki von [Name]", Name kommt aus der
  // Ersteinrichtung (Wizard). Ohne hinterlegten Namen wird die Zeile
  // ausgeblendet statt eine Lücke/"Wiki von" ohne Namen zu zeigen.
  const wikiName = state.project?.config?.wikiName?.trim();
  if (wikiName) {
    document.getElementById('sidebarBrandText').textContent = `Wiki von ${wikiName}`;
  } else {
    document.getElementById('sidebarBrand').style.display = 'none';
  }

  await refreshAll(); // ruft render() bereits selbst auf (Zeile 781) — ein
  // zweiter, direkter render()-Aufruf hier war überflüssig und hat beim
  // ersten Start zu doppelt angezeigten angepinnten Notizen geführt: beide
  // renderHome()-Aufrufe liefen überlappend (beide hängen mitten in ihrer
  // Ausführung bei "await getSearchDocuments"), und beide schrieben ihre
  // Favoriten-Kacheln am Ende in denselben, zuletzt erzeugten DOM-Container.
})();
