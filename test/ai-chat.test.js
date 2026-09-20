'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('KI-Chat UI 1: sanitizePanelBounds bereinigt und begrenzt Panel-Abmessungen sicher', async () => {
  const { sanitizePanelBounds } = await import('../renderer/js/ai-chat.js');

  assert.equal(typeof sanitizePanelBounds, 'function', 'sanitizePanelBounds ist eine exportierte Funktion');

  // Standard-Fallback bei undefinierten oder leeren Werten
  const defaults = sanitizePanelBounds({}, { windowWidth: 1000, windowHeight: 800, minTop: 32 });
  assert.equal(defaults.width, 440);
  assert.equal(defaults.height, 580);
  assert.ok(defaults.left >= 0 && defaults.left + defaults.width <= 1000);
  assert.ok(defaults.top >= 32 && defaults.top + defaults.height <= 800);

  // Unterschreitung der Mindestmaße (min 360 x 440)
  const tooSmall = sanitizePanelBounds({ width: 100, height: 200 }, { windowWidth: 1000, windowHeight: 800, minTop: 32 });
  assert.equal(tooSmall.width, 360, 'Breite wird auf Mindestmaß 360 angehoben');
  assert.equal(tooSmall.height, 440, 'Höhe wird auf Mindestmaß 440 angehoben');

  // Überschreitung der Bildschirmmaße
  const tooLarge = sanitizePanelBounds({ width: 1500, height: 1200 }, { windowWidth: 1000, windowHeight: 800, minTop: 32 });
  assert.ok(tooLarge.width <= 1000, 'Breite überschreitet nicht den Bildschirm');
  assert.ok(tooLarge.height <= 800 - 32, 'Höhe überschreitet nicht den Bildschirm abzüglich Titelleiste');

  // Außerhalb des Sichtbereichs liegende Koordinaten werden eingehegt
  const negative = sanitizePanelBounds({ left: -500, top: -200, width: 400, height: 500 }, { windowWidth: 1000, windowHeight: 800, minTop: 32 });
  assert.equal(negative.left, 0, 'Negative X-Koordinate wird auf 0 gesetzt');
  assert.equal(negative.top, 32, 'Negative Y-Koordinate wird auf minTop gesetzt');

  const overflow = sanitizePanelBounds({ left: 900, top: 700, width: 400, height: 500 }, { windowWidth: 1000, windowHeight: 800, minTop: 32 });
  assert.equal(overflow.left, 600, 'Rechter Rand bleibt im Fenster (1000 - 400 = 600)');
  assert.equal(overflow.top, 300, 'Unterer Rand bleibt im Fenster (800 - 500 = 300)');
});

test('KI-Chat UI 2: index.html enthält alle erforderlichen UI-Elemente und Stylesheet-Links', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../renderer/index.html'), 'utf8');

  // Stylesheet eingebunden
  assert.ok(indexHtml.includes('<link rel="stylesheet" href="css/ai-chat.css">'), 'ai-chat.css ist eingebunden');

  // Topbar-Button
  assert.ok(indexHtml.includes('id="titlebarAiChatBtn"'), '#titlebarAiChatBtn existiert in index.html');
  assert.ok(indexHtml.includes('id="aiTopbarStatusDot"'), '#aiTopbarStatusDot existiert im Topbar-Button');

  // Schwebendes Chat-Panel
  assert.ok(indexHtml.includes('id="aiChatPanel"'), '#aiChatPanel existiert');
  assert.ok(indexHtml.includes('data-ai-drag-handle'), 'Header hat data-ai-drag-handle');
  assert.ok(indexHtml.includes('id="aiChatModelSelect"'), '#aiChatModelSelect existiert');
  assert.ok(indexHtml.includes('id="aiChatClearBtn"'), '#aiChatClearBtn existiert');
  assert.ok(indexHtml.includes('id="aiChatCloseBtn"'), '#aiChatCloseBtn existiert');
  assert.ok(indexHtml.includes('id="aiChatMessages"'), '#aiChatMessages existiert');
  assert.ok(indexHtml.includes('id="aiChatInput"'), '#aiChatInput existiert');
  assert.ok(indexHtml.includes('id="aiChatSendBtn"'), '#aiChatSendBtn existiert');
  assert.ok(indexHtml.includes('id="aiChatModeGroup"'), '#aiChatModeGroup existiert in index.html');
  assert.ok(indexHtml.includes('data-mode="safe"'), 'Safe-Button existiert');
  assert.ok(indexHtml.includes('data-mode="auto"'), 'Auto-Button existiert');
  assert.ok(indexHtml.includes('data-mode="plan"'), 'Plan-Button existiert');
});

test('KI-Chat UI 3: ai-chat.css definiert alle relevanten Zustände und Animationen', () => {
  const chatCss = fs.readFileSync(path.join(__dirname, '../renderer/css/ai-chat.css'), 'utf8');

  assert.ok(chatCss.includes('#aiChatPanel{'), 'Panel-Regel existiert');
  assert.ok(chatCss.includes('#aiChatPanel[hidden]{'), 'Versteckter Zustand existiert');
  assert.ok(chatCss.includes('.ai-msg-user{'), 'Nutzer-Sprechblase existiert');
  assert.ok(chatCss.includes('.ai-msg-assistant{'), 'Assistent-Sprechblase existiert');
  assert.ok(chatCss.includes('.ai-typing-cursor{'), 'Typing-Cursor existiert');
  assert.ok(chatCss.includes('@keyframes ai-blink'), 'Blink-Animation existiert');
  assert.ok(chatCss.includes('.ai-status-indicator.is-online'), 'Online-Statuspunkt existiert');
  assert.ok(chatCss.includes('[data-mode="stop"]'), 'Stop-Zustand für Button existiert');
  assert.ok(chatCss.includes('.ai-tool-pill{'), 'Werkzeug-Badge-Klasse existiert');
  assert.ok(chatCss.includes('.ai-chat-toolbar{'), 'Toolbar-Klasse existiert');
  assert.ok(chatCss.includes('.ai-mode-btn{'), 'Modus-Button-Klasse existiert');
  assert.ok(chatCss.includes('.ai-mode-btn.is-active{'), 'Aktiver Modus-Button existiert');
  assert.ok(chatCss.includes('.ai-proposal-card{'), 'Proposal-Karten-Klasse existiert');
  assert.ok(chatCss.includes('.ai-proposal-diff{'), 'Diff-Container-Klasse existiert');
  assert.ok(chatCss.includes('.ai-diff-line.is-add{'), 'Diff-Add-Klasse existiert');
  assert.ok(chatCss.includes('.ai-diff-line.is-remove{'), 'Diff-Remove-Klasse existiert');
  assert.ok(chatCss.includes('.ai-proposal-apply-btn{'), 'Apply-Button-Klasse existiert');
  assert.ok(chatCss.includes('.ai-proposal-reject-btn{'), 'Reject-Button-Klasse existiert');
});

test('KI-Chat UI 4: preload.js exponiert die vollständige KI-Schnittstelle ohne Leaks', () => {
  const preloadSource = fs.readFileSync(path.join(__dirname, '../preload.js'), 'utf8');

  const requiredMethods = [
    'checkConnection',
    'getModels',
    'sendMessage',
    'abort',
    'getHistory',
    'clearHistory',
    'getSettings',
    'updateSettings',
    'onStreamChunk',
    'onStreamEnd',
    'onStreamError',
    'onStreamToolCall',
    'getProposal',
    'applyProposal',
    'rejectProposal',
    'onStreamProposal'
  ];

  for (const method of requiredMethods) {
    assert.ok(preloadSource.includes(`${method}:`), `preload.js exponiert ${method}`);
  }

  // Kein generischer Zugriff
  assert.ok(!preloadSource.includes('ipcRenderer.invoke(channel'), 'Kein unvalidierter generischer IPC in preload.js');
});

test('KI-Chat UI 5: app.js initialisiert initAiChat beim Start', () => {
  const appJsSource = fs.readFileSync(path.join(__dirname, '../renderer/js/app.js'), 'utf8');

  assert.ok(appJsSource.includes("import { initAiChat } from './ai-chat.js';"), 'initAiChat wird importiert');
  assert.ok(appJsSource.includes('initAiChat('), 'initAiChat(...) wird beim Anwendungsstart aufgerufen');
  assert.ok(appJsSource.includes('onProposalApplied:'), 'onProposalApplied wird an initAiChat übergeben');
});

test('KI-Chat UI 6: formatToolLabel formatiert Werkzeug-Aufrufe mit passendem Icon und Parametern', async () => {
  const { formatToolLabel } = await import('../renderer/js/ai-chat.js');

  assert.equal(formatToolLabel('search_notes', { query: 'Rezept' }), '🔍 Suche Notizen „Rezept“ …');
  assert.equal(formatToolLabel('search_notes', {}), '🔍 Suche Notizen …');

  assert.equal(formatToolLabel('read_note', { relPath: 'Kochen/Kuchen.md' }), '📖 Lese Notiz „Kochen/Kuchen.md“ …');
  assert.equal(formatToolLabel('read_note', { title: 'Mein Kuchen' }), '📖 Lese Notiz „Mein Kuchen“ …');

  assert.equal(formatToolLabel('list_notes', { category: 'Rezepte' }), '📋 Liste Notizen auf (Rezepte) …');
  assert.equal(formatToolLabel('list_notes', {}), '📋 Liste Notizen auf …');

  assert.equal(formatToolLabel('propose_create_note', { title: 'Neue Seite' }), '📝 Neuer Notizvorschlag „Neue Seite“ …');
  assert.equal(formatToolLabel('propose_update_note', { relPath: 'A/B/C.md' }), '✏️ Änderungsvorschlag „A/B/C.md“ …');

  assert.equal(formatToolLabel('unknown_tool', {}), '⚙️ unknown_tool …');
});

test('KI-Chat UI 7: renderDiffLines und escapeHtml formatieren Diffs sicher', async () => {
  const { renderDiffLines, escapeHtml } = await import('../renderer/js/ai-chat.js');

  assert.equal(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');

  const diffEmpty = renderDiffLines([]);
  assert.ok(diffEmpty.includes('ai-diff-empty'));

  const diff = [
    { type: 'same', line: 'Unverändert' },
    { type: 'remove', line: 'Gelöscht' },
    { type: 'add', line: '<script>neu</script>' }
  ];
  const rendered = renderDiffLines(diff);
  assert.ok(rendered.includes('is-same'));
  assert.ok(rendered.includes('is-remove'));
  assert.ok(rendered.includes('is-add'));
  assert.ok(!rendered.includes('<script>neu</script>'), 'HTML in Diff muss escaped sein');
  assert.ok(rendered.includes('&lt;script&gt;neu&lt;/script&gt;'));
});

test('KI-Chat UI 8: renderProposalCard erzeugt Proposal-Karte und verdrahtet Apply- und Reject-Buttons', async () => {
  const { renderProposalCard } = await import('../renderer/js/ai-chat.js');

  function createMockElement(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      className: '',
      innerHTML: '',
      textContent: '',
      dataset: {},
      style: {},
      children: [],
      classList: {
        _classes: new Set(),
        add(c) { this._classes.add(c); },
        remove(c) { this._classes.delete(c); },
        contains(c) { return this._classes.has(c); }
      },
      appendChild(child) { el.children.push(child); return child; },
      insertBefore(child) { el.children.unshift(child); return child; },
      listeners: {},
      addEventListener(type, handler) { el.listeners[type] = handler; },
      click() { if (el.listeners.click) return el.listeners.click({ preventDefault: () => {} }); }
    };
    return el;
  }

  const prevDoc = global.document;
  global.document = { createElement: createMockElement };

  let applyCalled = false;
  let rejectCalled = false;
  const prevWindow = global.window;
  global.window = {
    archivAPI: {
      ai: {
        applyProposal: async (id) => {
          assert.equal(id, 'prop_abc');
          return { success: true };
        },
        rejectProposal: async (id) => {
          assert.equal(id, 'prop_abc');
          return { success: true };
        }
      }
    }
  };

  try {
    const proposal = {
      proposalId: 'prop_abc',
      type: 'create',
      title: 'Neue Notiz',
      relPath: 'Kategorie/Unterkategorie/Neue Notiz.md',
      reason: 'Wichtig',
      diff: [{ type: 'add', line: '# Neue Notiz' }]
    };

    const card = renderProposalCard(proposal, {
      onApply: () => { applyCalled = true; }
    });

    assert.equal(card.dataset.proposalId, 'prop_abc');
    const actions = card.children.find(c => c.className === 'ai-proposal-actions');
    const applyBtn = actions.children.find(c => c.className === 'ai-proposal-apply-btn');

    await applyBtn.click();
    assert.equal(applyCalled, true);
    assert.ok(card.classList.contains('is-applied'));

    const card2 = renderProposalCard(proposal, {
      onReject: () => { rejectCalled = true; }
    });
    const actions2 = card2.children.find(c => c.className === 'ai-proposal-actions');
    const rejectBtn2 = actions2.children.find(c => c.className === 'ai-proposal-reject-btn');

    await rejectBtn2.click();
    assert.equal(rejectCalled, true);
    assert.ok(card2.classList.contains('is-rejected'));
  } finally {
    global.document = prevDoc;
    global.window = prevWindow;
  }
});


