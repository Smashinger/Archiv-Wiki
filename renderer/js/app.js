// renderer/js/app.js — Schritt 5: Hauptlogik der echten Oberfläche.
// Ersetzt die provisorischen Test-Seiten aus Schritt 3/4 (fs-test.js,
// editor-test.js, boot.js) durch die vollständige Sidebar/Topbar/Notiz-UI.

import * as fs from './filesystem.js';
import { buildSyncIntervalOptionsHtml } from './sync-shared.js';
import { applyAccentPalette, buildAccentSwatchesHtml, SIDEBAR_DENSITY_PRESETS, applySidebarDensity, applyEditorFontSize, EDITOR_FONT_SIZE_DEFAULT, setFocusMode, applyReadingWidth } from './theme.js';
import { ICON_LIBRARY, ICON_CATEGORIES, searchIconLibrary } from './icon-library.js';
import { fetchUpdateStatus, renderUpdateStatus } from './update-check.js';
import { showSettingsWindow } from './settings-window.js';
import { animateIn, animateOut } from './motion.js';
import { initEllipsisTooltips } from './tooltip.js';
import { openNoteInEditor, saveNow, isDirty, getOpenRelPath, closeEditor, insertAtCursor, wrapSelection, editorHasSelection, getEditorSelectionText, deleteEditorSelection, selectAllInEditor, moveEditorCursorToCoords, transformCurrentLine, getEditorContent, setEditorContent, jumpToMatchInEditor, setSyncScrollEnabled } from './editor.js';
import { rebuildIndex, search as searchNotes, searchWithDetails } from './search.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  project: null,
  config: null,
  tree: [],
  collapsedGroups: new Set(),
  editMode: false,
  viewMode: 'split', // 'split' | 'editor' | 'preview'
};

const els = {
  updateStatusTop: document.getElementById('updateStatusTop'),
  updateDot: document.getElementById('updateDot'),
  updateStatusLabel: document.getElementById('updateStatusLabel'),
  updateStatusCurrent: document.getElementById('updateStatusCurrent'),
  btnEditMode: document.getElementById('btnEditMode'),
  navSearch: document.getElementById('navSearch'),
  searchDropdown: document.getElementById('searchDropdown'),
  searchClear: document.getElementById('searchClear'),
  navTree: document.getElementById('navTree'),
  homeLink: document.getElementById('homeLink'),
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

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Icon-Wert kann jetzt ZWEIERLEI sein: ein klassisches Emoji-Zeichen (wie
// bisher, z. B. "📄") ODER eine ID aus der neuen Icon-Bibliothek (Format
// "kategorie/name", z. B. "os/tux") — bestehende Emoji bleiben dadurch
// vollständig unverändert funktionsfähig, die Bibliothek ergänzt nur.
function renderIconHtml(iconValue, fallbackEmoji) {
  if (iconValue && iconValue.includes('/')) {
    return `<img class="lib-icon" src="assets/icon-library/${iconValue}.svg" alt="">`;
  }
  return escapeHtml(iconValue || fallbackEmoji);
}

// ---------------------------------------------------------------------------
// Eigenes Eingabe-Modal als Ersatz für window.prompt() — Electron unterstützt
// prompt() bewusst nicht (alert/confirm funktionieren, siehe Electron-Issue
// #472, "wontfix"). Gibt den getrimmten Text zurück, oder null bei Abbruch/
// leerer Eingabe — kompatibel zu den bestehenden `if (!x) return;`-Checks.
// ---------------------------------------------------------------------------
// Zwei Felder statt nur eines (siehe showPromptModal unten) — Ziel bestimmt
// die verlinkte Notiz, Anzeigetext ist optional (Obsidian-artige [[Ziel|Text]]-
// Syntax). Falls beim Öffnen schon Text markiert war, wird der als Anzeigetext
// vorausgefüllt ("diesen Text zu einem Link machen").
function showWikiLinkModal(prefillDisplay = '') {
  return new Promise((resolve) => {
    document.querySelectorAll('.prompt-overlay').forEach(el => el.remove());
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
    targetInput.focus();

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
      if (state.project?.config) state.project.config.recentWikilinkTargets = recentTargets;
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
      overlay.remove();
      document.removeEventListener('keydown', onKeydown);
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
        selectMatch(currentMatches[activeIndex >= 0 ? activeIndex : 0]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation(); // verhindert, dass das äußere Escape gleich das ganze Modal schließt
        suggestionsEl.style.display = 'none';
      }
    });
    function onKeydown(e) {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(null); }
    }
    document.addEventListener('keydown', onKeydown);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(null); });
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => close(null));
    overlay.querySelector('[data-action="ok"]').addEventListener('click', submit);
  });
}

function showPromptModal({ title, defaultValue = '', okLabel = 'OK' }) {
  return new Promise((resolve) => {
    document.querySelectorAll('.prompt-overlay').forEach(el => el.remove());
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
    input.focus();
    input.select();

    let done = false;
    function close(value) {
      if (done) return;
      done = true;
      overlay.remove();
      document.removeEventListener('keydown', onKeydown);
      resolve(value && value.trim() ? value.trim() : null);
    }
    function onKeydown(e) {
      if (e.key === 'Enter') { e.preventDefault(); close(input.value); }
      else if (e.key === 'Escape') { e.preventDefault(); close(null); }
    }
    document.addEventListener('keydown', onKeydown);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(null); });
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => close(null));
    overlay.querySelector('[data-action="ok"]').addEventListener('click', () => close(input.value));
  });
}

function currentSlug() {
  return decodeURIComponent((location.hash || '#home').replace('#', '')) || 'home';
}

// ---------------------------------------------------------------------------
// Sidebar: Mobile Toggle
// ---------------------------------------------------------------------------
function openSidebar() { els.sidebar.classList.add('open'); els.overlay.classList.add('show'); }
function closeSidebar() { els.sidebar.classList.remove('open'); els.overlay.classList.remove('show'); }
els.burgerBtn.addEventListener('click', () => els.sidebar.classList.contains('open') ? closeSidebar() : openSidebar());
els.overlay.addEventListener('click', closeSidebar);

// ---------------------------------------------------------------------------
// Bearbeiten-Modus (Sidebar): zeigt Ziehen-Griffe (⠿) an jeder Notiz/Kategorie
// zum Verschieben/Umsortieren. Standardmäßig ausgeblendet für eine ruhigere
// Sidebar — Löschen bleibt davon unberührt (das läuft weiterhin immer über
// das ⋮-Kontextmenü, unabhängig von diesem Modus).
// ---------------------------------------------------------------------------
els.btnEditMode.addEventListener('click', (e) => {
  e.stopPropagation();
  showSidebarFootMenu(els.btnEditMode);
});

// Sidebar-Fuß-Menü ("⋮"): vorher direkter Umschalter NUR für den
// Bearbeiten-Modus — jetzt ein echtes kleines Menü, das auch "Akzentfarben
// ändern" anbietet (bisher nur einmalig im Wizard änderbar, siehe Bug-Analyse).
function showSidebarFootMenu(anchorEl) {
  document.querySelectorAll('.context-menu, .prompt-overlay').forEach(m => m.remove());
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.innerHTML = `
    <button type="button" data-action="edit-mode">✎ Bearbeiten-Modus${state.editMode ? ' (verlassen)' : ''}</button>
  `;
  document.body.appendChild(menu);
  const rect = anchorEl.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  // Dieselbe Viewport-Begrenzung wie beim Icon-Picker-Fix — bleibt immer
  // sichtbar, weicht bei Bedarf nach oben statt unten aus.
  const top = Math.min(rect.top - menuRect.height - 4, window.innerHeight - menuRect.height - 8);
  menu.style.top = Math.max(4, top) + 'px';
  menu.style.left = Math.min(rect.left, window.innerWidth - 220) + 'px';

  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    menu.remove();
    if (btn.dataset.action === 'edit-mode') {
      state.editMode = !state.editMode;
      els.sidebar.classList.toggle('edit-mode', state.editMode);
      els.btnEditMode.classList.toggle('active', state.editMode);
    }
  });
  setTimeout(() => document.addEventListener('click', function closeOnce() {
    menu.remove();
    document.removeEventListener('click', closeOnce);
  }), 0);
}

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
  return map[code] || `Unbekannter Fehler${message ? `: ${message}` : '.'}`;
}

// Erscheint beim X-Klick, sofern noch keine feste Wahl gespeichert ist (siehe
// main.js handleCloseRequest). Ergebnis geht über resolveCloseDialog zurück
// an den Hauptprozess, der dann entsprechend minimiert/beendet/nichts tut.
function showCloseDialog() {
  document.querySelectorAll('.prompt-overlay').forEach(el => el.remove());
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
  function close() { overlay.remove(); }
  overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => {
    window.archivAPI.resolveCloseDialog({ choice: 'cancel', remember: false });
    close();
  });
  overlay.querySelector('[data-action="ok"]').addEventListener('click', () => {
    const choice = overlay.querySelector('input[name="closeChoice"]:checked').value;
    const remember = overlay.querySelector('#closeDialogRemember').checked;
    window.archivAPI.resolveCloseDialog({ choice, remember });
    close();
  });
}

function showBackupErrorModal(status) {
  const overlay = document.createElement('div');
  overlay.className = 'prompt-overlay';
  const lastError = status.lastErrorAt ? formatRelativeTime(status.lastErrorAt) : 'unbekannt';
  overlay.innerHTML = `
    <div class="prompt-modal">
      <div class="prompt-title">⚠️ Automatisches Backup fehlgeschlagen<button type="button" class="modal-close-x" data-action="close-x" title="Schließen" aria-label="Schließen">✕</button></div>
      <p class="sync-modal-note">${status.consecutiveFailures}x in Folge fehlgeschlagen · zuletzt ${escapeHtml(lastError)}</p>
      <p class="sync-modal-note">${escapeHtml(friendlyBackupErrorText(status.lastErrorCode, status.lastErrorMessage))}</p>
      <button type="button" class="backup-error-details-toggle" id="backupErrorDetailsToggle">Details anzeigen</button>
      <pre class="backup-error-details" id="backupErrorDetails" style="display:none;">${escapeHtml(status.lastErrorMessage || 'Keine weiteren Details verfügbar.')}</pre>
    </div>`;
  document.body.appendChild(overlay);
  function close() { overlay.remove(); }
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-action="close-x"]').addEventListener('click', close);
  overlay.querySelector('#backupErrorDetailsToggle').addEventListener('click', (e) => {
    const details = overlay.querySelector('#backupErrorDetails');
    const nowShown = details.style.display === 'none';
    details.style.display = nowShown ? 'block' : 'none';
    e.target.textContent = nowShown ? 'Details verbergen' : 'Details anzeigen';
  });
}

// ---------------------------------------------------------------------------
// Topbar: Papierkorb + Info direkt als Icon-Buttons (kein Dropdown mehr)
// ---------------------------------------------------------------------------
els.btnTrash.addEventListener('click', () => { location.hash = '#trash'; });
els.btnBugReport.addEventListener('click', async () => {
  await showBugReportModal();
});

// Diagnose-Infos (Version/Plattform/Electron) waren schon länger über
// window.archivAPI verfügbar, wurden bisher aber nirgends genutzt — genau
// das Richtige für einen hilfreichen, vorausgefüllten Bug-Report.
async function showBugReportModal() {
  document.querySelectorAll('.prompt-overlay').forEach(el => el.remove());
  const [version, platformInfo] = await Promise.all([
    window.archivAPI.getVersion(),
    window.archivAPI.getPlatformInfo()
  ]);
  const platformLabel = { linux: 'Linux', win32: 'Windows', darwin: 'macOS' }[platformInfo.platform] || platformInfo.platform;

  const overlay = document.createElement('div');
  overlay.className = 'prompt-overlay';
  overlay.innerHTML = `
    <div class="prompt-modal">
      <div class="prompt-title">🐛 Fehler melden<button type="button" class="modal-close-x" data-action="close-x" title="Schließen" aria-label="Schließen">✕</button></div>
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

  function close() { overlay.remove(); }
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-action="close-x"]').addEventListener('click', close);
  overlay.querySelector('[data-action="cancel"]').addEventListener('click', close);
  overlay.querySelector('[data-action="open-github"]').addEventListener('click', () => {
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
}
els.btnAbout.addEventListener('click', async () => {
  const version = await window.archivAPI.getVersion();
  alert(`Archiv Wiki v${version}\nAutor: Smashinger\nLizenz: MIT\n\nTipp: Taste "?" zeigt alle Tastenkürzel.`);
});

function openSettingsWindow() {
  showSettingsWindow({
    projectPath: state.project?.path,
    onConfigChange: (newConfig) => { if (state.project) state.project.config = newConfig; },
    onProjectPathChange: (newPath) => { if (state.project) state.project.path = newPath; }
  });
}
document.getElementById('btnSettings').addEventListener('click', openSettingsWindow);

// --- Tray-/Menü-Ereignisse aus dem Hauptprozess ---
window.archivAPI.onShowCloseDialog(() => showCloseDialog());
window.archivAPI.onGoHome(() => { location.hash = '#home'; });
window.archivAPI.onCheckForUpdatesRequested(() => checkForUpdateAndRender());
window.archivAPI.onOpenSettingsRequested(() => openSettingsWindow());

// Automatisches Update-System (Nutzer-Feature): dezente Ecken-Benachrichtigung
// statt eines blockierenden Dialogs — passend zum Wunsch "keine aufdringlichen
// Popups". Genau EIN Toast zur Zeit (verfügbar → lädt herunter → bereit sind
// aufeinanderfolgende Zustände derselben Sache, keine drei gleichzeitigen
// Meldungen), daher wird ein evtl. vorhandener Toast bei jedem neuen Aufruf
// zuerst entfernt.
function showUpdateToast({ message, primaryLabel, onPrimary, showProgress = false }) {
  document.querySelectorAll('.update-toast').forEach(el => el.remove());
  const toast = document.createElement('div');
  toast.className = 'update-toast';
  toast.innerHTML = `
    <div class="update-toast-message">${escapeHtml(message)}</div>
    ${showProgress ? '<div class="update-toast-progress"><div class="update-toast-progress-bar" id="updateToastProgressBar"></div></div>' : ''}
    <div class="update-toast-actions">
      <button type="button" class="btn ghost small" data-action="dismiss">Später</button>
      ${primaryLabel ? `<button type="button" class="btn small" data-action="primary">${escapeHtml(primaryLabel)}</button>` : ''}
    </div>
  `;
  document.body.appendChild(toast);
  toast.querySelector('[data-action="dismiss"]').addEventListener('click', () => toast.remove());
  if (primaryLabel) {
    toast.querySelector('[data-action="primary"]').addEventListener('click', () => { onPrimary?.(); toast.remove(); });
  }
  return toast;
}

// "Vor dem Herunterladen nachfragen" (Standard: aus) UND "Updates automatisch
// herunterladen" (Standard: an) entscheiden zusammen im Hauptprozess (siehe
// main.js), ob der Download beim Erscheinen dieser Meldung schon LÄUFT oder
// erst noch auf den Klick "Jetzt herunterladen" wartet — hier daher beide
// Fälle abgedeckt, statt das im Renderer ein zweites Mal zu entscheiden.
window.archivAPI.onUpdateAvailable(async (info) => {
  const settings = await window.archivAPI.getUpdateSettings();
  if (settings.autoDownload && !settings.confirmBeforeDownload) {
    // Download läuft (main.js) bereits von selbst los — nur informieren,
    // kein "Jetzt herunterladen"-Knopf nötig, da es nichts zu bestätigen gibt.
    showUpdateToast({ message: `Eine neue Version von Archiv-Wiki ist verfügbar (${info.version}). Sie wird im Hintergrund heruntergeladen.` });
  } else {
    showUpdateToast({
      message: `Eine neue Version von Archiv-Wiki ist verfügbar (${info.version}).`,
      primaryLabel: 'Jetzt herunterladen',
      onPrimary: async () => {
        showUpdateToast({ message: 'Update wird heruntergeladen …', showProgress: true });
        const result = await window.archivAPI.downloadUpdate();
        if (result?.error) {
          showUpdateToast({ message: `Herunterladen fehlgeschlagen: ${result.error}` });
        }
      }
    });
  }
});
window.archivAPI.onUpdateDownloadProgress(({ percent }) => {
  const bar = document.getElementById('updateToastProgressBar');
  if (bar) bar.style.width = `${percent}%`;
  // Fortschritts-Balken existiert noch nicht (z. B. automatischer Download
  // ohne vorherige "Verfügbar"-Meldung mit Fortschrittsanzeige) — dann jetzt
  // mit Fortschritt neu anzeigen, statt den ersten Fortschritts-Wert zu verlieren.
  else showUpdateToast({ message: 'Update wird heruntergeladen …', showProgress: true });
});
window.archivAPI.onUpdateDownloaded(() => {
  showUpdateToast({
    message: 'Das Update wurde erfolgreich heruntergeladen.',
    primaryLabel: 'Jetzt neu starten',
    onPrimary: () => window.archivAPI.installUpdateAndRestart()
  });
});
window.archivAPI.onUpdateError(({ message }) => {
  showUpdateToast({ message: `Update-Fehler: ${message}` });
});

// ---------------------------------------------------------------------------
// Sync-Einstellungen — jederzeit über den ☁-Button in der Topbar erreichbar
// (nicht nur einmalig im Wizard). Passwort wird bei aktivierter "Passwort
// merken"-Option sicher über safeStorage vorausgefüllt (siehe main/sync-ipc.js).
// ---------------------------------------------------------------------------
async function openSyncSettingsModal() {
  document.querySelectorAll('.prompt-overlay').forEach(el => el.remove());
  const settings = await window.archivAPI.syncApi.getSettings();

  const overlay = document.createElement('div');
  overlay.className = 'prompt-overlay';
  overlay.innerHTML = `
    <div class="prompt-modal sync-modal">
      <div class="prompt-title">☁ Cloud-Sync (Nextcloud/WebDAV)<button type="button" class="modal-close-x" data-action="close-x" title="Schließen" aria-label="Schließen">✕</button></div>
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
        <input type="checkbox" id="syncModalAuto"> Automatischer Abgleich, alle
        <select id="syncModalInterval">
          ${buildSyncIntervalOptionsHtml(15)}
        </select>
      </label>
      <div class="sync-modal-status" id="syncModalStatus"></div>
      <div class="sync-retry-row" id="syncRetryRow"></div>
      <div class="sync-conflict-list" id="syncConflictList"></div>
      <button type="button" class="sync-history-toggle" id="syncHistoryToggle">📋 Verlauf anzeigen</button>
      <div class="sync-history-list" id="syncHistoryList" style="display:none;"></div>
      <div class="prompt-actions sync-modal-actions">
        <button type="button" class="btn sync-action-btn" data-action="test"><span class="sab-icon">🔗</span><span class="sab-label">TESTEN</span></button>
        <button type="button" class="btn sync-action-btn" data-action="upload"><span class="sab-icon">⬆️</span><span class="sab-label">UPLOAD</span></button>
        <button type="button" class="btn primary sync-action-btn" data-action="syncall"><span class="sab-icon">🔄</span><span class="sab-label">JETZT SYNCHRONISIEREN</span></button>
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
        ? '<p class="sync-history-empty">Noch kein Abgleich durchgeführt.</p>'
        : history.map(h => {
            const when = formatRelativeTime(h.timestamp);
            const duration = h.durationMs != null ? `${(h.durationMs / 1000).toFixed(1)}s` : '–';
            if (!h.success) {
              return `<div class="sync-history-row sync-history-error"><span class="shr-icon">⚠️</span><span class="shr-main">Fehlgeschlagen · ${escapeHtml(when)}</span><span class="shr-detail">${escapeHtml(h.error || 'Unbekannter Fehler')}</span></div>`;
            }
            return `<div class="sync-history-row"><span class="shr-icon">✓</span><span class="shr-main">${h.filesCount} Datei${h.filesCount === 1 ? '' : 'en'} · ${escapeHtml(when)}</span><span class="shr-detail">${duration}${h.warnings ? ` · ${h.warnings} Warnung${h.warnings === 1 ? '' : 'en'}` : ''}</span></div>`;
          }).join('');
      listEl.style.display = 'block';
      e.target.textContent = '📋 Verlauf ausblenden';
    } else {
      listEl.style.display = 'none';
      e.target.textContent = '📋 Verlauf anzeigen';
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
    await window.archivAPI.syncApi.saveAutoSyncSettings({ enabled: autoCheckbox.checked, intervalMinutes: Number(intervalSelect.value) });
  }
  autoCheckbox.addEventListener('change', persistAutoSyncSettings);
  intervalSelect.addEventListener('change', persistAutoSyncSettings);

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = 'sync-modal-status' + (kind ? ' sync-status-' + kind : '');
  }

  async function persistUrlAndUser() {
    await window.archivAPI.syncApi.saveSettings({ url: urlInput.value.trim(), username: userInput.value.trim() });
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
            row.querySelector('.sync-conflict-reason').textContent = '✕ ' + err.message;
            row.querySelectorAll('button').forEach(b => b.disabled = false);
          }
        });
      });
    });
  }

  function close() { overlay.remove(); }
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-action="close-x"]').addEventListener('click', async () => { await persistUrlAndUser(); close(); });

  overlay.querySelector('[data-action="test"]').addEventListener('click', async () => {
    setStatus('Verbinde …', 'pending');
    try {
      await persistUrlAndUser();
      await window.archivAPI.syncApi.testConnection(currentCreds());
      await maybePersistPassword();
      setStatus('✓ Verbindung erfolgreich.', 'ok');
    } catch (err) {
      setStatus('✕ ' + err.message, 'error');
    }
  });

  overlay.querySelector('[data-action="upload"]').addEventListener('click', async () => {
    if (!confirm('Kompletten Wiki-Ordner jetzt zur Cloud hochladen? Vorhandene Remote-Dateien mit gleichem Namen werden überschrieben.')) return;
    setStatus('Lade hoch …', 'pending');
    try {
      await persistUrlAndUser();
      const result = await window.archivAPI.syncApi.uploadAll(currentCreds());
      await maybePersistPassword();
      setStatus(`✓ ${result.uploaded} Datei(en) hochgeladen.`, 'ok');
    } catch (err) {
      setStatus('✕ ' + err.message, 'error');
    }
  });

  overlay.querySelector('[data-action="syncall"]').addEventListener('click', async () => {
    if (!confirm('Jetzt in beide Richtungen abgleichen? Bei eindeutigen Änderungen wird automatisch übertragen bzw. eine Löschung übernommen. Bei echten Konflikten wird NICHTS verändert, du bekommst stattdessen eine Liste mit Auflösungs-Optionen.')) return;
    setStatus('Gleiche ab …', 'pending');
    conflictListEl.innerHTML = '';
    try {
      await persistUrlAndUser();
      const result = await window.archivAPI.syncApi.syncAll(currentCreds());
      await maybePersistPassword();
      const parts = [`${result.uploaded} hochgeladen`, `${result.downloaded} heruntergeladen`, `${result.skipped} bereits aktuell`];
      if (result.deletedLocal) parts.push(`${result.deletedLocal} lokal gelöscht (Remote-Löschung übernommen)`);
      if (result.deletedRemote) parts.push(`${result.deletedRemote} remote gelöscht (lokale Löschung übernommen)`);
      if (result.conflicts?.length) {
        setStatus(`✓ ${parts.join(', ')}.\n⚠ ${result.conflicts.length} Konflikt(e) unten — bitte auflösen:`, 'error');
        renderConflicts(result.conflicts);
      } else {
        setStatus(`✓ ${parts.join(', ')}.`, 'ok');
      }
      await refreshAll();
    } catch (err) {
      setStatus('✕ ' + err.message, 'error');
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
      setStatus('✕ Letzter Abgleich fehlgeschlagen: ' + (status.lastError || ''), 'error');
      retryRow.innerHTML = '<button type="button" class="btn" id="syncRetryBtn">🔄 Erneut versuchen</button>';
      document.getElementById('syncRetryBtn').addEventListener('click', () => {
        overlay.querySelector('[data-action="syncall"]').click();
      });
    } else if (status.state === 'conflicts' && status.conflicts?.length) {
      setStatus(`⚠ ${status.conflicts.length} ungelöste(r) Konflikt(e) — bitte auflösen:`, 'error');
      renderConflicts(status.conflicts);
    } else if (status.state === 'idle' && status.lastSyncAt) {
      setStatus('Zuletzt erfolgreich abgeglichen: ' + formatRelativeTime(status.lastSyncAt), 'ok');
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
  else if (status.state === 'error') { els.btnSync.classList.add('sync-status-error'); els.btnSync.title = 'Letzter Abgleich fehlgeschlagen: ' + (status.lastError || ''); }
  else if (status.state === 'conflicts') { els.btnSync.classList.add('sync-status-conflicts'); els.btnSync.title = `${status.conflictCount} ungelöste(r) Konflikt(e)`; }
  else if (status.state === 'idle' && status.lastSyncAt) {
    // Zuvor gab es hierfür GAR keine eigene Kennzeichnung — sah optisch genauso
    // aus wie "noch nie synchronisiert". Jetzt: grüner Punkt = zuletzt erfolgreich.
    els.btnSync.classList.add('sync-status-ok');
    els.btnSync.title = 'Zuletzt erfolgreich abgeglichen: ' + formatRelativeTime(status.lastSyncAt);
  }
  else { els.btnSync.title = 'Cloud-Sync-Einstellungen'; }
}
window.archivAPI.syncApi.getStatus().then(applySyncStatus).catch(() => {});
window.archivAPI.syncApi.onStatusUpdate(applySyncStatus);

// Bug-Fix: "Startseite"/homeLink lag außerhalb von #navTree und wurde daher
// nie von wireNavInteractions() erfasst — hatte bislang GAR keinen Klick-Handler.
els.homeLink.addEventListener('click', () => { location.hash = '#home'; });
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
  rebuildIndex().catch(err => console.error('[Archiv Wiki] Such-Index konnte nicht aktualisiert werden', err));
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
      <button type="button" class="nav-icon-btn" data-context-category="${escapeHtml(group.relPath)}" title="Optionen">⋮</button>
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
    <a class="nav-link" data-route="note" data-relpath="${escapeHtml(note.relPath)}">
      <span class="nl-icon">${renderIconHtml(note.icon, '📄')}</span><span class="nl-title">${escapeHtml(title)}</span>
    </a>
    <button type="button" class="nav-icon-btn" data-context="${escapeHtml(note.relPath)}" title="Optionen">⋮</button>
  `;
  return li;
}

function wireNavInteractions() {
  els.navTree.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const relPath = btn.dataset.toggle;
      const group = btn.closest('.nav-group');
      if (state.collapsedGroups.has(relPath)) state.collapsedGroups.delete(relPath);
      else state.collapsedGroups.add(relPath);
      group.classList.toggle('collapsed');
      // Nur speichern, wenn "Letzten Zustand wiederherstellen" gewählt ist —
      // bei den anderen drei Optionen bestimmt ohnehin die Einstellung selbst
      // den Start-Zustand, ein Mitschreiben wäre unnötiger Schreibaufwand.
      if (state.project?.config?.categoryStartupBehavior === 'restore') {
        const saved = [...state.collapsedGroups];
        fs.setProjectSetting('savedCollapsedGroups', saved).catch(() => {});
        if (state.project?.config) state.project.config.savedCollapsedGroups = saved;
      }
    });
  });

  els.navTree.querySelectorAll('[data-context-category]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); e.preventDefault();
      const roleType = btn.closest('.nav-group')?.dataset.type || 'subCategory';
      showContextMenu(btn.dataset.contextCategory, btn, roleType);
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
            alert(`"${file.name}" konnte nicht importiert werden:\n` + err.message);
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

      const moved = await fs.moveEntry(draggedRelPath, targetRelPath);
      await refreshAll();
      // Kurzer Erfolgs-Puls, damit ein erfolgreiches Einrasten sichtbar quittiert wird.
      const movedRow = els.navTree.querySelector(`[data-relpath="${CSS.escape(moved.relPath)}"]`);
      if (movedRow) {
        movedRow.classList.add('drop-success');
        setTimeout(() => movedRow.classList.remove('drop-success'), 500);
      }
      if (getOpenRelPath() && location.hash.includes(encodeURIComponent(getOpenRelPath())) && getOpenRelPath() === draggedRelPath) {
        location.hash = '#note/' + encodeURIComponent(moved.relPath);
      }
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

      let finalRelPath = draggedRelPath;
      if (draggedParent !== targetParent) {
        const moved = await fs.moveEntry(draggedRelPath, targetParent);
        finalRelPath = moved.relPath;
      }

      // Reihenfolge in der Ziel-Unterkategorie setzen: gezogene Notiz vor
      // ODER nach der Ziel-Notiz einfügen, je nachdem in welcher Hälfte
      // der Ziel-Notiz losgelassen wurde (aktuelle Anzeige-Reihenfolge aus
      // dem DOM lesen — die spiegelt bereits jede zuvor gesetzte eigene
      // Reihenfolge oder sonst die alphabetische Standard-Sortierung wider).
      const targetGroupEl = els.navTree.querySelector(`.nav-group[data-relpath="${CSS.escape(targetParent)}"]`);
      const siblingNames = targetGroupEl
        ? [...targetGroupEl.querySelectorAll(':scope > .group-list > li.nav-item-row')].map(li => li.dataset.relpath.split('/').pop())
        : [];
      const draggedName = finalRelPath.split('/').pop();
      const targetName = targetRelPath.split('/').pop();
      const withoutDragged = siblingNames.filter(n => n !== draggedName);
      const targetIdx = withoutDragged.indexOf(targetName);
      const baseIdx = targetIdx === -1 ? withoutDragged.length : targetIdx;
      const insertAt = dropPosition === 'after' ? baseIdx + 1 : baseIdx;
      withoutDragged.splice(insertAt, 0, draggedName);
      await fs.reorderChildren(targetParent, withoutDragged);

      await refreshAll();
      const movedRow = els.navTree.querySelector(`[data-relpath="${CSS.escape(finalRelPath)}"]`);
      if (movedRow) { movedRow.classList.add('drop-success'); setTimeout(() => movedRow.classList.remove('drop-success'), 500); }
      if (getOpenRelPath() === draggedRelPath) location.hash = '#note/' + encodeURIComponent(finalRelPath);
    });
  });

  els.navTree.querySelectorAll('[data-context]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); showContextMenu(btn.dataset.context, btn); });
  });

  els.navTree.querySelectorAll('a.nav-link[data-relpath]').forEach(a => {
    a.addEventListener('click', () => { location.hash = '#note/' + encodeURIComponent(a.dataset.relpath); });
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
    document.querySelectorAll('.context-menu').forEach(m => m.remove());
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.innerHTML = `
      <button type="button" data-choice="md">⬇ Als Markdown-Datei (.md) exportieren</button>
      <button type="button" data-choice="html">⬇ Als HTML exportieren</button>
      <button type="button" data-choice="pdf">⬇ Als PDF exportieren</button>
      <button type="button" data-choice="zip">⬇ Ganzes Wiki als ZIP sichern</button>
    `;
    document.body.appendChild(menu);
    const rect = anchorEl.getBoundingClientRect();
    menu.style.top = rect.bottom + 4 + 'px';
    menu.style.left = Math.min(rect.left, window.innerWidth - 240) + 'px';

    let resolved = false;
    function close(value) { if (resolved) return; resolved = true; menu.remove(); resolve(value); }
    menu.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-choice]');
      if (btn) close(btn.dataset.choice);
    });
    setTimeout(() => document.addEventListener('click', function closeOnce() {
      close(null); document.removeEventListener('click', closeOnce);
    }, { once: true }), 0);
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

// Kompaktes, handgeschriebenes Highlight.js-Theme (statt eines zusätzlichen
// fetch/Vendor-Assets) — deckt die gängigen Klassen ab, die marked+highlight.js
// beim Rendern von Codeblöcken erzeugt.
const HLJS_EXPORT_CSS = `
  .hljs{ color:#24292e; }
  .hljs-comment,.hljs-quote{ color:#6a737d; font-style:italic; }
  .hljs-keyword,.hljs-selector-tag,.hljs-literal{ color:#d73a49; }
  .hljs-string,.hljs-attr,.hljs-template-tag{ color:#032f62; }
  .hljs-number,.hljs-literal{ color:#005cc5; }
  .hljs-title,.hljs-name,.hljs-built_in{ color:#6f42c1; }
  .hljs-type,.hljs-class .hljs-title{ color:#22863a; }
  .hljs-variable,.hljs-attribute{ color:#e36209; }
`;

// Baut ein eigenständiges, teilbares HTML-Dokument aus dem bereits gerenderten
// Vorschau-HTML (previewContainer.innerHTML) — eigenes helles Stylesheet statt
// des App-Dark-Themes, damit die Datei auch außerhalb der App gut lesbar ist.
function buildStandaloneNoteHtml({ title, tags, category, bodyHtml }) {
  const metaParts = [];
  if (category) metaParts.push(escapeHtml(category));
  const tagsHtml = tags.map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join(' ');
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  ${getLoadedKatexCss()}
  ${HLJS_EXPORT_CSS}
  body{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; max-width: 760px; margin: 40px auto; padding: 0 24px; color:#1a1a1a; line-height:1.65; }
  h1{ font-size: 28px; margin: 0 0 6px; }
  .meta{ color:#666; font-size:13px; margin-bottom:26px; }
  .tag{ display:inline-block; background:#eee; border-radius:12px; padding:2px 10px; font-size:11px; margin-right:4px; }
  pre{ background:#f4f4f4; padding:12px; border-radius:6px; overflow-x:auto; }
  code{ background:#f4f4f4; padding:1px 5px; border-radius:4px; font-size:.9em; }
  pre code{ background:none; padding:0; }
  a{ color:#1a56db; }
  blockquote{ border-left:3px solid #ddd; margin-left:0; padding-left:16px; color:#555; }
  img{ max-width:100%; }
  table{ border-collapse:collapse; }
  th, td{ border:1px solid #ddd; padding:6px 10px; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<div class="meta">${metaParts.join(' · ')}${metaParts.length && tagsHtml ? ' · ' : ''}${tagsHtml}</div>
${bodyHtml}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Gemeinsame Lösch-Logik — genutzt vom X-Button (Standard-Modus) UND von der
// "Löschen"-Option im ⋮-Menü (Edit-Modus, siehe showContextMenu).
// ---------------------------------------------------------------------------
async function performDelete(relPath, type) {
  const noun = type === 'mainCategory' ? 'Hauptkategorie' : type === 'subCategory' ? 'Unterkategorie' : 'Notiz';
  const msg = type === 'note' ? 'Notiz in den Papierkorb verschieben?' : `${noun} inkl. allem Inhalt in den Papierkorb verschieben?`;
  if (!confirm(msg)) return;
  const openRelPath = getOpenRelPath();
  const affectsOpenNote = openRelPath && (type === 'note' ? openRelPath === relPath : (openRelPath === relPath || openRelPath.startsWith(relPath + '/')));
  if (affectsOpenNote) { closeEditor(); location.hash = '#home'; }
  await fs.deleteEntry(relPath);
  await refreshAll();
}

function showContextMenu(relPath, anchorEl, type = 'note') {
  document.querySelectorAll('.context-menu').forEach(m => m.remove());
  const isFolder = type !== 'note';
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.innerHTML = `
    <button type="button" data-action="rename">✎ Umbenennen</button>
    <button type="button" data-action="icon">🎨 Icon ändern</button>
    <button type="button" class="danger" data-action="delete">🗑 Löschen</button>
  `;
  document.body.appendChild(menu);
  const rect = anchorEl.getBoundingClientRect();
  menu.style.top = rect.bottom + 4 + 'px';
  menu.style.left = Math.min(rect.left, window.innerWidth - 220) + 'px';

  menu.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.action === 'delete') {
      menu.remove();
      await performDelete(relPath, type);
      return;
    }
    if (btn.dataset.action === 'icon') {
      menu.remove();
      showIconPicker(anchorEl, async (icon) => {
        await fs.setCategoryIcon(relPath, icon);
        await refreshAll();
      });
      return;
    }
    if (btn.dataset.action !== 'rename') return;
    const openRelPath = getOpenRelPath();
    const affectsOpenNote = openRelPath && (isFolder ? (openRelPath.startsWith(relPath + '/') || openRelPath === relPath) : openRelPath === relPath);
    const currentName = relPath.split('/').pop().replace(/\.md$/, '');
    const newName = await showPromptModal({ title: 'Neuer Name', defaultValue: currentName });
    if (newName && newName !== currentName) {
      const renamed = await fs.renameEntry(relPath, newName);
      await refreshAll();
      if (!isFolder && openRelPath === relPath) location.hash = '#note/' + encodeURIComponent(renamed.relPath);
      else if (isFolder && affectsOpenNote) location.hash = '#home'; // Pfad der offenen Notiz hat sich mitgeändert
    }
    menu.remove();
  });

  setTimeout(() => document.addEventListener('click', function closeOnce() {
    menu.remove(); document.removeEventListener('click', closeOnce);
  }, { once: true }), 0);
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
    alert('Hauptkategorie konnte nicht angelegt werden:\n' + err.message);
  }
}

// ---------------------------------------------------------------------------
// Neue Unterkategorie — fragt nach der Hauptkategorie, wenn es mehr als eine gibt.
// ---------------------------------------------------------------------------
async function createSubCategoryFlow() {
  const mainCategories = collectMainCategories(state.tree);
  if (mainCategories.length === 0) {
    alert('Erst eine Hauptkategorie anlegen, dann kann die Unterkategorie dort hinein.');
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
    alert('Unterkategorie konnte nicht angelegt werden:\n' + err.message);
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
    document.querySelectorAll('.prompt-overlay').forEach(el => el.remove());
    let customTemplates = Array.isArray(state.project?.config?.customTemplates) ? state.project.config.customTemplates : [];
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
    function close(value) { if (done) return; done = true; overlay.remove(); resolve(value); }
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(null); });
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
              <button type="button" class="icon-btn small" data-delete-key="${escapeHtml(t.key)}" title="Löschen">🗑</button>
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
          if (state.project?.config) state.project.config.customTemplates = customTemplates;
          renderCustomArea();
        });
      });
      customArea.querySelectorAll('[data-delete-key]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm('Diese eigene Vorlage wirklich löschen?')) return;
          customTemplates = customTemplates.filter(t => t.key !== btn.dataset.deleteKey);
          await fs.setProjectSetting('customTemplates', customTemplates);
          if (state.project?.config) state.project.config.customTemplates = customTemplates;
          renderCustomArea();
        });
      });
    }
    renderCustomArea();
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
  if (state.project?.config) state.project.config.customTemplates = customTemplates;
}

els.btnAddNote.addEventListener('click', async () => {
  const subCategories = collectSubCategories(state.tree);
  if (subCategories.length === 0) {
    alert('Erst eine Unterkategorie anlegen ("+ Unterthema"), dann kann die Notiz dort hinein.');
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
    location.hash = '#note/' + encodeURIComponent(created.relPath);
  } catch (err) {
    alert('Notiz konnte nicht angelegt werden:\n' + err.message);
    console.error('[Archiv Wiki] fs.createNote fehlgeschlagen für Ziel', targetRelPath, err);
  }
});

function showCategoryPickerModal(categories, title = 'In welcher Kategorie?') {
  return new Promise((resolve) => {
    document.querySelectorAll('.prompt-overlay').forEach(el => el.remove());
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
    select.focus();
    function close(value) { overlay.remove(); resolve(value); }
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(null); });
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => close(null));
    overlay.querySelector('[data-action="ok"]').addEventListener('click', () => close(select.value));
  });
}

// ---------------------------------------------------------------------------
// Sidebar-Suche — echte Volltextsuche über Titel, Inhalt UND Tags via
// FlexSearch (siehe search.js), nicht mehr nur sichtbarer Zeilentext im Baum.
// ---------------------------------------------------------------------------
els.navSearch.addEventListener('input', () => {
  const q = els.navSearch.value.trim();
  els.navSearch.parentElement.classList.toggle('has-value', els.navSearch.value.length > 0);
  const matched = q ? new Set(searchNotes(q)) : null; // null = kein Filter aktiv, alles zeigen
  els.navTree.querySelectorAll(':scope > ul.nav-top > li.nav-group').forEach(group => filterGroup(group, matched));
});

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

function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function highlightTerm(text, query) {
  const escapedText = escapeHtml(text);
  if (!query) return escapedText;
  const re = new RegExp(`(${escapeRegExp(escapeHtml(query))})`, 'ig');
  return escapedText.replace(re, '<mark>$1</mark>');
}

let searchDropdownOpen = false;

function renderSearchDropdown(query) {
  currentSearchResults = searchWithDetails(query);
  searchDropdownIndex = -1;
  if (currentSearchResults.length === 0) {
    els.searchDropdown.innerHTML = `<div class="search-dropdown-empty">Keine Treffer für „${escapeHtml(query)}"</div>`;
  } else {
    els.searchDropdown.innerHTML = currentSearchResults.map((r, i) => `
      <button type="button" class="search-result" data-index="${i}">
        <div class="search-result-head">
          <span class="search-result-title">📄 ${highlightTerm(r.title, query)}</span>
          ${r.category ? `<span class="search-result-category">${escapeHtml(r.category)}</span>` : ''}
        </div>
        ${r.tags.length ? `<div class="search-result-tags">${r.tags.map(t => `<span class="search-result-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        ${r.snippet ? `<div class="search-result-snippet">${highlightTerm(r.snippet, query)}</div>` : ''}
      </button>
    `).join('');
  }
  els.searchDropdown.style.display = 'block';
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

function closeSearchDropdown() {
  if (!searchDropdownOpen) return;
  searchDropdownOpen = false;
  animateOut(els.searchDropdown, () => {
    els.searchDropdown.style.display = 'none';
    els.searchDropdown.innerHTML = '';
  });
  searchDropdownIndex = -1;
}

function updateSearchDropdownActive() {
  els.searchDropdown.querySelectorAll('.search-result').forEach((btn, i) => btn.classList.toggle('active', i === searchDropdownIndex));
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
  location.hash = '#note/' + encodeURIComponent(result.relPath);
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
  if (els.searchDropdown.style.display === 'none' || currentSearchResults.length === 0) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    searchDropdownIndex = Math.min(searchDropdownIndex + 1, currentSearchResults.length - 1);
    updateSearchDropdownActive();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    searchDropdownIndex = Math.max(searchDropdownIndex - 1, 0);
    updateSearchDropdownActive();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const target = currentSearchResults[searchDropdownIndex >= 0 ? searchDropdownIndex : 0];
    if (target) openSearchResult(target, els.navSearch.value.trim());
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeSearchDropdown();
  }
});

els.searchDropdown.addEventListener('mousedown', (e) => {
  const btn = e.target.closest('.search-result');
  if (!btn) return;
  e.preventDefault(); // Fokus/Blur der Sucheingabe soll den Klick nicht durchkreuzen
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
  else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(currentOnSaved, currentOnSaveError); }
  else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && getOpenRelPath()) {
    e.preventDefault(); jumpToAdjacentNote(e.key === 'ArrowRight' ? 1 : -1);
  }
  else if (e.key === '?' && !mod && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) && !document.activeElement?.closest('.cm-editor')) {
    e.preventDefault(); showShortcutsCheatsheet();
  }
  else if (mod && e.shiftKey && e.key.toLowerCase() === 'f' && getOpenRelPath()) { e.preventDefault(); toggleFocusMode(); }
  else if (e.key === 'Escape' && document.body.classList.contains('focus-mode')) { e.preventDefault(); toggleFocusMode(); }
});

// Focus-/Cocoon-Modus (überarbeitet aus dem bisherigen Zen-Modus, siehe CSS
// body.focus-mode-Regeln in layout.css): Sidebar/Kopfzeile/Werkzeugleiste/
// Statuszeile bleiben jetzt vollständig sichtbar UND bedienbar, treten nur
// optisch zurück (Deckkraft reduziert) statt komplett zu verschwinden — man
// verliert dadurch nicht mehr die Orientierung in der App. Ein/Aus-Zustand
// bewusst NICHT gespeichert (jeder Programmstart beginnt wieder normal), die
// INTENSITÄT dagegen schon (Stil-Vorliebe, kein Sitzungs-Zustand, siehe
// Einstellungen → Darstellung → Focus-Modus).
function toggleFocusMode() {
  setFocusMode(!document.body.classList.contains('focus-mode'), state.project?.config?.focusModeIntensity);
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
      { keys: 'Strg/Cmd + Umschalt + F', desc: 'Focus-Modus umschalten' },
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

function showShortcutsCheatsheet() {
  document.querySelectorAll('.prompt-overlay').forEach(el => el.remove());
  const overlay = document.createElement('div');
  overlay.className = 'prompt-overlay';
  overlay.innerHTML = `
    <div class="prompt-modal">
      <div class="prompt-title">⌨️ Tastenkürzel<button type="button" class="modal-close-x" data-action="close-x" title="Schließen" aria-label="Schließen">✕</button></div>
      <div class="shortcuts-list">
        ${SHORTCUT_SECTIONS.map(section => `
          <div class="shortcut-section-label">${escapeHtml(section.title)}</div>
          ${section.items.map(s => `<div class="shortcut-row"><kbd>${escapeHtml(s.keys)}</kbd><span>${escapeHtml(s.desc)}</span></div>`).join('')}
        `).join('')}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  function close() { overlay.remove(); }
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-action="close-x"]').addEventListener('click', close);
  document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });
}

function cycleViewMode() {
  const order = ['split', 'editor', 'preview'];
  state.viewMode = order[(order.indexOf(state.viewMode) + 1) % order.length];
  applyViewMode();
}

function jumpToAdjacentNote(dir) {
  const notes = fs.flattenNotes(state.tree);
  const idx = notes.findIndex(n => n.relPath === getOpenRelPath());
  if (idx === -1) return;
  const next = notes[(idx + dir + notes.length) % notes.length];
  location.hash = '#note/' + encodeURIComponent(next.relPath);
}

let currentOnSaved = () => {};
let currentOnSaveError = () => {};

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------
window.addEventListener('hashchange', render);

async function render() {
  closeSidebar();
  els.topbarNoteDates.textContent = ''; // wird von renderNote() neu befüllt, falls eine Notiz offen ist
  const slug = currentSlug();
  if (slug === 'home') return await renderHome();
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
function expandAncestorGroups(relPath) {
  if (!relPath) return false;
  const parts = relPath.split('/');
  parts.pop(); // letztes Segment ist die Notiz-Datei selbst, keine Kategorie
  let changed = false;
  let cumulative = '';
  for (const part of parts) {
    cumulative = cumulative ? `${cumulative}/${part}` : part;
    if (state.collapsedGroups.delete(cumulative)) changed = true;
  }
  return changed;
}

function setActiveNav(relPath) {
  if (expandAncestorGroups(relPath)) renderNavTree();
  els.homeLink.classList.toggle('active', !relPath);
  els.navTree.querySelectorAll('.nav-link[data-relpath]').forEach(a => a.classList.toggle('active', a.dataset.relpath === relPath));
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
  return text.replace(/!\[([^\]]*)\]\(([^)]+)\)|<img\b([^>]*)>/g, (match, mdAlt, mdSrc, imgAttrs) => {
    count++;
    if (count !== targetIndex) return match;
    if (imgAttrs !== undefined) {
      const hasStyle = /\bstyle\s*=\s*"[^"]*"/.test(imgAttrs);
      const newAttrs = hasStyle
        ? imgAttrs.replace(/\bstyle\s*=\s*"([^"]*)"/, (m, existing) => {
            const withoutWidth = existing.replace(/width\s*:\s*[^;]+;?/, '').trim();
            return `style="width:${widthPercent}%;${withoutWidth ? ' ' + withoutWidth : ''}"`;
          })
        : `${imgAttrs} style="width:${widthPercent}%"`;
      return `<img${newAttrs}>`;
    }
    return `<img src="${mdSrc}" alt="${mdAlt}" style="width:${widthPercent}%">`;
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
  row.addEventListener('click', () => { location.hash = '#note/' + encodeURIComponent(note.relPath); });
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

async function renderHome() {
  setBreadcrumb('Start');
  setActiveNav(null);
  const notes = fs.flattenNotes(state.tree);
  if (notes.length === 0) {
    els.contentScroll.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">Dein Archiv ist noch leer.</div>
        <div class="empty-state-body">Erstelle deine erste Wissensseite, um dein persönliches Wiki aufzubauen — über „+ Thema" in der Sidebar eine Kategorie anlegen, dann „+ Notiz" darin.</div>
      </div>`;
    return;
  }

  // Nach Änderungsdatum sortieren (frontmatter.modified, bei jedem Speichern
  // aktualisiert) — sowohl für "Zuletzt bearbeitet" als auch für "Alle
  // Notizen" (letzteres zeigt dieselbe Reihenfolge, nur mit absolutem statt
  // relativem Datum und ohne Begrenzung auf 5 Einträge).
  const sorted = [...notes].sort((a, b) => {
    const ta = a.frontmatter?.modified || a.frontmatter?.created || '';
    const tb = b.frontmatter?.modified || b.frontmatter?.created || '';
    return tb.localeCompare(ta);
  });
  const recentNotes = sorted.slice(0, 5);
  const pinnedNotes = sorted.filter(n => n.frontmatter?.pinned);

  // Notiz-Statistik-Kacheln: simple, aus schon vorhandenen Frontmatter-Daten
  // berechnet — kein zusätzlicher Speicher-/Tracking-Aufwand nötig.
  const oneWeekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const editedThisWeek = notes.filter(n => {
    const t = n.frontmatter?.modified || n.frontmatter?.created;
    return t && new Date(t).getTime() >= oneWeekAgo;
  }).length;
  const categoryCount = new Set(notes.map(n => n.frontmatter?.category || n.frontmatter?.mainCategory).filter(Boolean)).size;
  const tagCount = new Set(notes.flatMap(n => n.frontmatter?.tags || [])).size;

  // Begrüßungs-Unterzeile erzählt jetzt kurz, was diese Woche passiert ist,
  // statt nur die reine Notiz-Anzahl zu wiederholen (die steht ja schon in
  // der Kachel darunter).
  const subLine = editedThisWeek > 0
    ? `Du hast diese Woche ${editedThisWeek} Seite${editedThisWeek === 1 ? '' : 'n'} bearbeitet.`
    : `${notes.length} Notiz${notes.length === 1 ? '' : 'en'} insgesamt.`;

  els.contentScroll.innerHTML = `
    <div class="dashboard-wrap">
      <h1 class="home-heading">${greetingFor(state.project?.config?.wikiName)}</h1>
      <p class="home-sub">${subLine}</p>
      <div class="stats-widget">
        <button type="button" class="stat-chip" id="statChipNotes"><span class="stat-num">${notes.length}</span><span class="stat-label">📄 Notizen gesamt</span></button>
        <button type="button" class="stat-chip" id="statChipWeek"><span class="stat-num">${editedThisWeek}</span><span class="stat-label">✏️ diese Woche bearbeitet</span></button>
        <button type="button" class="stat-chip" id="statChipTopics"><span class="stat-num">${categoryCount}</span><span class="stat-label">📚 Themen</span></button>
        <button type="button" class="stat-chip" id="statChipTags"><span class="stat-num">${tagCount}</span><span class="stat-label">🏷 Tags</span></button>
      </div>
      ${pinnedNotes.length ? `
      <div class="pinned-strip" id="pinnedStrip"></div>` : ''}
      <div class="dashboard-sections">
        <div class="dashboard-section recent" id="recentSection">
          <div class="dashboard-section-header">Zuletzt bearbeitet</div>
          <div class="dashboard-list" id="recentList"></div>
        </div>
        <div class="dashboard-section all" id="allSection">
          <div class="dashboard-section-header">Alle Notizen</div>
          <div class="dashboard-list" id="allList"></div>
        </div>
      </div>
    </div>
  `;

  // Kacheln führen zum jeweils passenden Bereich — entweder eine eigene
  // Ansicht (Themen → Statistik-Seite, Tags → Tag-Übersicht) oder ein
  // Sprung zum entsprechenden Bereich weiter unten auf demselben Dashboard.
  document.getElementById('statChipNotes').addEventListener('click', () => {
    document.getElementById('allSection').scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('statChipWeek').addEventListener('click', () => {
    document.getElementById('recentSection').scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('statChipTopics').addEventListener('click', () => { location.hash = '#stats'; });
  document.getElementById('statChipTags').addEventListener('click', () => { location.hash = '#tags'; });

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
  // löst ein refreshAll() → render() aus). #recentList existiert dann nicht
  // mehr, weiter unten würde .appendChild auf null krachen. Hier sauber
  // abbrechen statt gegen eine nicht mehr vorhandene Ansicht zu rendern.
  if (!document.getElementById('recentList')) return;

  function excerptFor(note) {
    return stripMarkdownSyntax(bodyByRelPath.get(note.relPath)).slice(0, 60);
  }

  if (pinnedNotes.length) {
    const strip = document.getElementById('pinnedStrip');
    pinnedNotes.forEach(note => {
      const title = note.frontmatter?.title || note.name;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'pinned-chip';
      chip.innerHTML = `<span class="pinned-chip-icon">${renderIconHtml(note.icon, '★')}</span><span class="pinned-chip-title">${escapeHtml(title)}</span>`;
      chip.title = title;
      chip.addEventListener('click', () => { location.hash = '#note/' + encodeURIComponent(note.relPath); });
      strip.appendChild(chip);
    });
  }

  const recentList = document.getElementById('recentList');
  recentNotes.forEach(note => {
    const dateLabel = formatRelativeTime(note.frontmatter?.modified || note.frontmatter?.created);
    recentList.appendChild(buildDashboardRow(note, excerptFor(note), dateLabel, true));
  });

  const allList = document.getElementById('allList');
  sorted.forEach(note => {
    const dateLabel = formatAbsoluteDate(note.frontmatter?.modified || note.frontmatter?.created);
    allList.appendChild(buildDashboardRow(note, excerptFor(note), dateLabel, false));
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
    a.addEventListener('click', (e) => { e.preventDefault(); location.hash = '#note/' + encodeURIComponent(a.dataset.relpath); });
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
});

async function renderNote(relPath) {
  const node = fs.findNode(state.tree, relPath);
  if (!node) { location.hash = '#home'; return; }

  setActiveNav(relPath);
  const title = node.frontmatter?.title || node.name;
  setBreadcrumb(node.frontmatter?.category ? `${node.frontmatter.category} / ${title}` : title);

  els.contentScroll.innerHTML = `
    <div class="note-header">
      <button type="button" class="pin-btn${node.frontmatter?.pinned ? ' active' : ''}" id="btnPinNote" title="${node.frontmatter?.pinned ? 'Von Favoriten entfernen' : 'Als Favorit anpinnen'}" aria-label="Anpinnen">${node.frontmatter?.pinned ? '★' : '☆'}</button>
      <input type="text" class="note-title-input" id="noteTitleInput" value="${escapeHtml(title)}">
      <button type="button" class="category-badge" id="noteCategoryBadge" title="In andere Kategorie verschieben">${escapeHtml(node.frontmatter?.category || node.frontmatter?.mainCategory || '')}</button>
      <input type="text" class="tags-input" id="noteTagsInput" placeholder="tag1, tag2, …">
    </div>
    <div class="backlink-row" id="backlinkRow"></div>
    <div class="incoming-links" id="incomingLinks"></div>
    <div class="note-toolbar">
      <div class="view-toggle" id="viewToggle">
        <button type="button" data-mode="editor">Editor</button>
        <button type="button" data-mode="split">Split</button>
        <button type="button" data-mode="preview">Vorschau</button>
      </div>
      <button type="button" class="icon-btn sync-scroll-toggle" id="btnSyncScroll" title="Sync-Scroll: Vorschau folgt beim Scrollen im Editor" aria-label="Sync-Scroll umschalten">🔗</button>
      <button type="button" class="icon-btn" id="btnFocusMode" title="Focus-Modus (Strg+Umschalt+F)" aria-label="Focus-Modus umschalten">◎</button>
      <select class="font-size-select" id="editorFontSizeSelect" title="Editor-Schriftgröße" aria-label="Editor-Schriftgröße">
        <option value="12">12px</option>
        <option value="13">13px</option>
        <option value="14">14px</option>
        <option value="16">16px</option>
        <option value="18">18px</option>
      </select>
      <button type="button" class="icon-btn" id="btnEmoji" title="Icon/Emoji einfügen" aria-label="Icon/Emoji einfügen">😀</button>
      <div class="format-toolbar" id="formatToolbar">
        <button type="button" data-fmt="bold" title="Fett (**Text**)"><strong>F</strong></button>
        <button type="button" data-fmt="italic" title="Kursiv (*Text*)"><em>K</em></button>
        <button type="button" data-fmt="strike" title="Durchgestrichen (~~Text~~)"><s>D</s></button>
        <button type="button" data-fmt="underline" title="Unterstrichen (&lt;u&gt;Text&lt;/u&gt;)"><u>U</u></button>
        <button type="button" data-fmt="link" title="Link ([Text](URL))">🔗</button>
        <button type="button" data-fmt="code" title="Code-Block (dreifache Backticks)">{ }</button>
        <button type="button" data-fmt="ul" title="Aufzählung (- Punkt)">•</button>
        <button type="button" data-fmt="ol" title="Nummerierte Liste (1. Punkt)">1.</button>
        <button type="button" data-fmt="checklist" title="Checkliste (- [ ] Aufgabe)">☑</button>
        <button type="button" id="btnCallout" title="Callout einfügen">💬</button>
      </div>
      <button type="button" class="icon-btn" id="btnExport" title="Notiz exportieren" aria-label="Notiz exportieren">⬇</button>
      <button type="button" class="icon-btn" id="btnSaveAsTemplate" title="Als eigene Vorlage speichern" aria-label="Als Vorlage speichern">📋</button>
      <span class="spacer"></span>
      <span class="dirty-label" id="dirtyLabel">✓ gespeichert</span>
      <button type="button" class="btn primary" id="btnSave">Speichern (Ctrl+S)</button>
      <button type="button" class="btn danger small" id="btnDeleteNote" title="Notiz in den Papierkorb verschieben" aria-label="Löschen">🗑</button>
    </div>
    <div class="note-split mode-split" id="noteSplit">
      <div id="editorContainer" class="editor-pane"></div>
      <div class="split-resizer" id="splitResizer" title="Ziehen zum Verändern der Breite"></div>
      <div id="previewContainer" class="preview-pane"></div>
    </div>
    <div class="note-bottombar">
      <span id="statLines">0 Zeilen</span>
      <span id="statWords">0 Wörter</span>
      <span class="spacer"></span>
      <span id="statCursor">Zeile 1, Spalte 1</span>
      <span id="statSaved"></span>
    </div>
  `;

  applyViewMode();
  document.getElementById('viewToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    state.viewMode = btn.dataset.mode;
    applyViewMode();
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
    if (state.project?.config) state.project.config.syncScrollEnabled = syncScrollOn;
  });

  document.getElementById('btnFocusMode').addEventListener('click', toggleFocusMode);

  const fontSizeSelect = document.getElementById('editorFontSizeSelect');
  const storedFontSize = Number(state.project?.config?.editorFontSize) || EDITOR_FONT_SIZE_DEFAULT;
  fontSizeSelect.value = String(storedFontSize);
  fontSizeSelect.addEventListener('change', async () => {
    const px = applyEditorFontSize(Number(fontSizeSelect.value));
    if (state.project?.config) state.project.config.editorFontSize = px;
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
    if (!confirm('Notiz in den Papierkorb verschieben?')) return;
    closeEditor();
    location.hash = '#home';
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
    else if (fmt === 'code') insertAtCursor('\n```\nCode hier\n```\n');
    else if (fmt === 'ul') insertAtCursor('\n- Punkt\n');
    else if (fmt === 'ol') insertAtCursor('\n1. Punkt\n');
    else if (fmt === 'checklist') insertAtCursor('\n- [ ] Aufgabe\n');
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
        if (result?.saved) alert('Markdown-Datei exportiert nach:\n' + result.filePath);
      } else if (choice === 'html') {
        const html = buildStandaloneNoteHtml({
          title: titleInput.value.trim() || 'Notiz',
          tags: tagsInput.value.split(',').map(t => t.trim()).filter(Boolean),
          category: categoryBadge.textContent,
          bodyHtml: document.getElementById('previewContainer').innerHTML
        });
        const result = await window.archivAPI.exportApi.saveHtml(html, safeTitle + '.html');
        if (result?.saved) alert('HTML exportiert nach:\n' + result.filePath);
      } else if (choice === 'pdf') {
        const result = await window.archivAPI.exportApi.notePdf(safeTitle + '.pdf');
        if (result?.saved) alert('PDF exportiert nach:\n' + result.filePath);
      } else if (choice === 'zip') {
        const result = await window.archivAPI.exportApi.projectZip();
        if (result?.saved) alert('Wiki-Backup exportiert nach:\n' + result.filePath);
      }
    } catch (err) {
      alert('Export fehlgeschlagen:\n' + err.message);
      console.error('[Archiv Wiki] Export fehlgeschlagen', err);
    }
  });

  document.getElementById('btnSaveAsTemplate').addEventListener('click', saveNoteAsTemplate);

  categoryBadge.addEventListener('click', (e) => {
    e.stopPropagation();
    const currentCategoryRelPath = relPath.includes('/') ? relPath.split('/').slice(0, -1).join('/') : '';
    const options = collectSubCategories(state.tree).filter(c => c.relPath !== currentCategoryRelPath);
    if (options.length === 0) return;
    showCategoryMoveMenu(categoryBadge, options, async (targetRelPath) => {
      const moved = await fs.moveEntry(relPath, targetRelPath);
      await refreshAll();
      location.hash = '#note/' + encodeURIComponent(moved.relPath);
    });
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
    dirtyLabel.textContent = '⚠ Speichern fehlgeschlagen';
    dirtyLabel.classList.add('has-error');
    dirtyLabel.title = err?.message || 'Unbekannter Fehler beim Speichern.';
  }
  currentOnSaveError = onSaveError;

  const { frontmatter, body } = await openNoteInEditor({
    relPath,
    editorContainer: document.getElementById('editorContainer'),
    previewContainer: document.getElementById('previewContainer'),
    tabSize: state.config?.tabSize || 2,
    autoSaveSeconds: state.config?.autoSave ?? 30,
    projectPath: state.project?.path,
    getNoteIndex: () => fs.flattenNotes(state.tree).map(n => ({
      title: n.frontmatter?.title || n.name.replace(/\.md$/, ''),
      relPath: n.relPath
    })),
    onChange: (dirty, text) => {
      dirtyLabel.textContent = dirty ? '● ungespeichert' : '✓ gespeichert';
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
      location.hash = '#note/' + encodeURIComponent(target.dataset.wikilinkTarget);
    } else if (target.dataset.wikilinkCreate) {
      const name = target.dataset.wikilinkCreate;
      const currentSubCategory = relPath.split('/').slice(0, -1).join('/');
      if (!currentSubCategory || !confirm(`Notiz "${name}" existiert noch nicht. In dieser Unterkategorie anlegen?`)) return;
      const created = await fs.createNote(currentSubCategory, name);
      await refreshAll();
      location.hash = '#note/' + encodeURIComponent(created.relPath);
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
        location.hash = '#note/' + encodeURIComponent(targetRelPath);
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
    if (options.length === 0) { alert('Es gibt noch keine andere Notiz, mit der verknüpft werden könnte.'); return; }
    const targetRelPath = await showCategoryPickerModal(options, 'Verknüpfen mit welcher Notiz?');
    if (!targetRelPath) return;
    await fs.saveNote(relPath, undefined, { backlinkTo: targetRelPath });
    renderBacklinkRow({ backlinkTo: targetRelPath });
  }

  renderBacklinkRow(frontmatter);

  titleInput.addEventListener('blur', async () => {
    const newTitle = titleInput.value.trim();
    if (!newTitle || newTitle === title) return;
    const renamed = await fs.renameEntry(relPath, newTitle);
    await refreshAll();
    location.hash = '#note/' + encodeURIComponent(renamed.relPath);
  });

  tagsInput.addEventListener('blur', async () => {
    const tags = tagsInput.value.split(',').map(t => t.trim()).filter(Boolean);
    await fs.saveNote(relPath, undefined, { tags });
  });
}

// ---------------------------------------------------------------------------
// Kleines Dropdown am Kategorie-Badge im Editor: Notiz in andere Kategorie
// verschieben, ohne extra über die Sidebar zu müssen.
// ---------------------------------------------------------------------------
function showCategoryMoveMenu(anchorEl, options, onSelect) {
  document.querySelectorAll('.context-menu').forEach(m => m.remove());
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.innerHTML = `
    <div class="context-menu-label">Verschieben nach:</div>
    ${options.map(c => `<button type="button" data-target="${escapeHtml(c.relPath)}">→ ${escapeHtml(c.label)}</button>`).join('')}
  `;
  document.body.appendChild(menu);
  const rect = anchorEl.getBoundingClientRect();
  menu.style.top = rect.bottom + 4 + 'px';
  menu.style.left = Math.min(rect.left, window.innerWidth - 220) + 'px';

  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-target]');
    if (!btn) return;
    menu.remove();
    onSelect(btn.dataset.target);
  });
  setTimeout(() => document.addEventListener('click', function closeOnce() {
    menu.remove(); document.removeEventListener('click', closeOnce);
  }, { once: true }), 0);
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

  document.querySelectorAll('.table-editor-overlay').forEach(el => el.remove());
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
  overlay.querySelector('[data-action="apply"]').addEventListener('click', () => {
    const updated = replaceNthTableInMarkdown(getEditorContent(), tableIndex, data);
    setEditorContent(updated);
    overlay.remove();
  });
  overlay.querySelectorAll('[data-action="cancel"]').forEach(btn => btn.addEventListener('click', () => overlay.remove()));
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) overlay.remove(); });
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onEsc); }
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
    insertAtCursor(`\n> [!${meta.type}] ${meta.label}\n> Inhalt hier\n`);
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

function renderMenuItemsHtml(items) {
  return items.map((item, i) => {
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

function showEditorRightClickMenu(e, items, clickPos) {
  e.preventDefault();
  document.querySelectorAll('.ectx-menu').forEach(m => m.remove());
  const menu = document.createElement('div');
  menu.className = 'ectx-menu';
  menu.innerHTML = renderMenuItemsHtml(items);
  document.body.appendChild(menu);

  // Position: an der Klickstelle, mit Rand-Überlauf-Schutz.
  const menuRect = menu.getBoundingClientRect();
  let left = e.clientX, top = e.clientY;
  if (left + menuRect.width > window.innerWidth) left = window.innerWidth - menuRect.width - 8;
  if (top + menuRect.height > window.innerHeight) top = window.innerHeight - menuRect.height - 8;
  menu.style.left = Math.max(4, left) + 'px';
  menu.style.top = Math.max(4, top) + 'px';

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
      sub.style.display = 'block';
      sub.style.left = '100%'; sub.style.right = 'auto';
      sub.style.top = '-6px'; sub.style.bottom = 'auto';
      const itemRect = el.getBoundingClientRect();
      const subRect = sub.getBoundingClientRect();
      if (itemRect.right + subRect.width > window.innerWidth) {
        sub.style.left = 'auto'; sub.style.right = '100%';
      }
      if (itemRect.top + subRect.height > window.innerHeight) {
        sub.style.top = 'auto'; sub.style.bottom = '-6px';
      }
    });
    el.addEventListener('mouseleave', () => {
      hideTimer = setTimeout(() => { sub.style.display = 'none'; }, 150);
    });
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
    menu.remove();
    item.action?.(clickPos);
  });

  setTimeout(() => document.addEventListener('click', function closeOnce() {
    menu.remove(); document.removeEventListener('click', closeOnce);
  }, { once: true }), 0);
  document.addEventListener('keydown', function closeOnEsc(ev) {
    if (ev.key === 'Escape') { menu.remove(); document.removeEventListener('keydown', closeOnEsc); }
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
    showEditorRightClickMenu(e, buildEditorMenuItems(), { left: e.clientX, top: e.clientY });
  });
  previewEl?.addEventListener('contextmenu', (e) => {
    showEditorRightClickMenu(e, buildPreviewMenuItems(previewEl), { left: e.clientX, top: e.clientY });
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
        alert(`"${file.name}" ist zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB) — maximal 20 MB pro Bild.`);
        continue; // erst NACH der Prüfung wird überhaupt gelesen — vorher landete jede Dateigröße ungeprüft komplett im Speicher
      }
      try {
        const buffer = await file.arrayBuffer();
        const { fileName } = await fs.saveAttachment(file.name, buffer);
        insertAtCursor(`\n![${file.name.replace(/\.[^.]+$/, '')}](attachment:${fileName})\n`);
      } catch (err) {
        alert('Bild konnte nicht eingefügt werden:\n' + err.message);
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
    if (state.project?.config) { state.project.config.iconFavorites = favorites; state.project.config.iconRecent = recent; }
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
  split.className = 'note-split mode-' + state.viewMode;
  document.querySelectorAll('#viewToggle button').forEach(b => b.classList.toggle('active', b.dataset.mode === state.viewMode));
}

// ---------------------------------------------------------------------------
// Papierkorb
// ---------------------------------------------------------------------------
// --- Tags: Übersicht aller vergebenen Schlagwörter, anklickbar zum Filtern ---
async function renderTagsOverview(activeTag) {
  setBreadcrumb(activeTag ? `Tags / ${activeTag}` : 'Tags');
  els.homeLink.classList.remove('active');
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
    chip.addEventListener('click', () => { location.hash = '#tags/' + encodeURIComponent(chip.dataset.tag); });
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
    if (!confirm('Papierkorb wirklich endgültig leeren? Das kann nicht rückgängig gemacht werden.')) return;
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
  if (!iso) return 'unbekannt';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'unbekannt';
  return `${formatDate(iso)}, ${formatTime(d)} Uhr`;
}
// Nutzer-Feature (Konflikt-Anzeige): einzige Stelle im Projekt, die Bytes in
// eine lesbare Größe umwandelt — bisher gab es dafür noch keine Funktion.
function formatBytes(bytes) {
  if (bytes == null) return 'unbekannt';
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
  els.updateStatusCurrent.textContent = '';
  const status = await fetchUpdateStatus();
  if (status.currentVersion) els.updateStatusCurrent.textContent = `v${status.currentVersion}`;
  renderUpdateStatus(els.updateDot, els.updateStatusLabel, status, 'update-status-label');
  if (status.updateAvailable && status.latestVersion) {
    els.updateStatusTop.classList.add('clickable');
    els.updateStatusTop.addEventListener('click', () => window.open(status.releaseUrl, '_blank'));
  }
}

function waitForUnlock() {
  if (!state.project?.config?.appLock?.enabled) return Promise.resolve();
  return new Promise((resolve) => {
    const screen = document.getElementById('lockScreen');
    const input = document.getElementById('lockScreenPassword');
    const errorEl = document.getElementById('lockScreenError');
    const unlockBtn = document.getElementById('lockScreenUnlock');
    screen.style.display = 'flex';
    input.focus();

    async function tryUnlock() {
      const result = await window.archivAPI.verifyAppLock(input.value);
      if (result.ok) {
        screen.style.display = 'none';
        resolve();
      } else {
        errorEl.textContent = 'Falsches Passwort.';
        input.value = '';
        input.focus();
      }
    }
    unlockBtn.addEventListener('click', tryUnlock);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
  });
}

(async function init() {
  state.project = await window.archivAPI.getCurrentProject();
  state.config = state.project?.config?.editor || {};

  await waitForUnlock();

  checkForUpdateAndRender();

  applyAccentPalette(state.project?.config?.accentKey, state.project?.config?.customAccentColor);
  applySidebarDensity(state.project?.config?.sidebarDensity);
  applyReadingWidth(state.project?.config?.readingWidthEnabled, state.project?.config?.readingWidthKey);
  applyEditorFontSize(state.project?.config?.editorFontSize);
  initEllipsisTooltips();

  // Backup-Warnung: Symbol bleibt standardmäßig versteckt, erscheint nur ab
  // 3 aufeinanderfolgenden fehlgeschlagenen automatischen Backups (main/backup.js
  // zählt das mit) — vorher liefen Fehlschläge komplett unbemerkt im Hintergrund.
  try {
    const backupStatus = await window.archivAPI.getBackupStatus();
    if (backupStatus.consecutiveFailures >= 3) {
      const btn = document.getElementById('btnBackupWarning');
      btn.style.display = 'flex';
      const lastError = backupStatus.lastErrorAt ? formatRelativeTime(backupStatus.lastErrorAt) : 'unbekannt';
      btn.title = `${backupStatus.consecutiveFailures}x automatisches Backup in Folge fehlgeschlagen (zuletzt: ${lastError})`;
      btn.addEventListener('click', () => showBackupErrorModal(backupStatus));
    }
  } catch { /* Backup-Status ist rein informativ, App funktioniert auch ohne diese Prüfung */ }

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
