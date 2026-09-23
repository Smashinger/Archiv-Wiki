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
  assert.ok(indexHtml.includes('id="aiChatModelRefreshBtn"'), '#aiChatModelRefreshBtn existiert');
  assert.ok(indexHtml.includes('id="aiChatContextSelect"'), '#aiChatContextSelect existiert in index.html');
  assert.ok(indexHtml.includes('id="aiChatClearBtn"'), '#aiChatClearBtn existiert');
  assert.ok(indexHtml.includes('id="aiChatCloseBtn"'), '#aiChatCloseBtn existiert');
  assert.ok(indexHtml.includes('id="aiChatMessages"'), '#aiChatMessages existiert');
  assert.ok(indexHtml.includes('id="aiChatInput"'), '#aiChatInput existiert');
  assert.ok(indexHtml.includes('id="aiChatSendBtn"'), '#aiChatSendBtn existiert');
  assert.ok(indexHtml.includes('id="aiChatModeGroup"'), '#aiChatModeGroup existiert in index.html');
  assert.ok(indexHtml.includes('data-mode="safe"'), 'Safe-Button existiert');
  assert.ok(indexHtml.includes('data-mode="auto"'), 'Auto-Button existiert');
  assert.ok(indexHtml.includes('data-mode="plan"'), 'Plan-Button existiert');
  assert.ok(indexHtml.includes('ai-suggestion-chip'), 'Suggestion-Chips existieren im Empty-State');
  assert.ok(indexHtml.includes('id="aiChatOnboardingHint"'), 'aiChatOnboardingHint existiert in index.html');
  assert.ok(indexHtml.includes('id="aiHintCommand"'), 'aiHintCommand existiert in index.html');
  assert.ok(indexHtml.includes('id="aiHintCopyBtn"'), 'aiHintCopyBtn existiert in index.html');
});

test('KI-Chat UI 3: ai-chat.css definiert alle relevanten Zustände und Animationen', () => {
  const chatCss = fs.readFileSync(path.join(__dirname, '../renderer/css/ai-chat.css'), 'utf8');

  assert.ok(chatCss.includes('#aiChatPanel{'), 'Panel-Regel existiert');
  assert.ok(chatCss.includes('#aiChatPanel[hidden]{'), 'Versteckter Zustand existiert');
  assert.ok(chatCss.includes('.ai-chat-onboarding-hint{'), 'ai-chat-onboarding-hint Regel existiert');
  assert.ok(chatCss.includes('.ai-chat-onboarding-hint.is-offline{'), 'is-offline Regel existiert');
  assert.ok(chatCss.includes('.ai-msg-user{'), 'Nutzer-Sprechblase existiert');
  assert.ok(chatCss.includes('.ai-msg-assistant{'), 'Assistent-Sprechblase existiert');
  assert.ok(chatCss.includes('.ai-typing-cursor{'), 'Typing-Cursor existiert');
  assert.ok(chatCss.includes('@keyframes ai-blink'), 'Blink-Animation existiert');
  assert.ok(chatCss.includes('@keyframes ai-spin'), 'Spin-Animation existiert');
  assert.ok(chatCss.includes('.ai-chat-icon-btn.is-refreshing'), 'Spin-Klasse für Refresh existiert');
  assert.ok(chatCss.includes('.ai-status-indicator.is-online'), 'Online-Statuspunkt existiert');
  assert.ok(chatCss.includes('[data-mode="stop"]'), 'Stop-Zustand für Button existiert');
  assert.ok(chatCss.includes('.ai-tool-pill{'), 'Werkzeug-Badge-Klasse existiert');
  assert.ok(chatCss.includes('.ai-chat-toolbar{'), 'Toolbar-Klasse existiert');
  assert.ok(chatCss.includes('.ai-chat-context-select{'), 'Kontext-Select-Klasse existiert');
  assert.ok(chatCss.includes('.ai-mode-btn{'), 'Modus-Button-Klasse existiert');
  assert.ok(chatCss.includes('.ai-mode-btn.is-active{'), 'Aktiver Modus-Button existiert');
  assert.ok(chatCss.includes('.ai-proposal-card{'), 'Proposal-Karten-Klasse existiert');
  assert.ok(chatCss.includes('.ai-proposal-diff{'), 'Diff-Container-Klasse existiert');
  assert.ok(chatCss.includes('.ai-diff-line.is-add{'), 'Diff-Add-Klasse existiert');
  assert.ok(chatCss.includes('.ai-diff-line.is-remove{'), 'Diff-Remove-Klasse existiert');
  assert.ok(chatCss.includes('.ai-proposal-apply-btn{'), 'Apply-Button-Klasse existiert');
  assert.ok(chatCss.includes('.ai-proposal-reject-btn{'), 'Reject-Button-Klasse existiert');
  assert.ok(chatCss.includes('.ai-proposal-card.is-danger-proposal{'), 'Gefahrenkarten-Klasse existiert');
  assert.ok(chatCss.includes('.ai-proposal-apply-btn.is-danger{'), 'Gefahren-Button-Klasse existiert');
  assert.ok(chatCss.includes('.ai-proposal-badge-danger{'), 'Papierkorb-Erfolgsbadge existiert');
  assert.ok(chatCss.includes('.ai-suggestion-chip{'), 'Suggestion-Chip-Klasse existiert');
  assert.ok(chatCss.includes('.kc-ai-btn{'), 'Wissenspflege-AI-Button-Klasse existiert');
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
    'onStreamProposal',
    'onSettingsUpdated'
  ];

  for (const method of requiredMethods) {
    assert.ok(preloadSource.includes(`${method}:`), `preload.js exponiert ${method}`);
  }

  // Kein generischer Zugriff
  assert.ok(!preloadSource.includes('ipcRenderer.invoke(channel'), 'Kein unvalidierter generischer IPC in preload.js');
});

test('KI-Chat UI 5: app.js initialisiert initAiChat beim Start und bindet triggerAiPrompt ein', () => {
  const appJsSource = fs.readFileSync(path.join(__dirname, '../renderer/js/app.js'), 'utf8');

  assert.ok(appJsSource.includes('initAiChat'), 'initAiChat wird importiert');
  assert.ok(appJsSource.includes('triggerAiPrompt'), 'triggerAiPrompt wird importiert');
  assert.ok(appJsSource.includes('initAiChat('), 'initAiChat(...) wird beim Anwendungsstart aufgerufen');
  assert.ok(appJsSource.includes('onProposalApplied:'), 'onProposalApplied wird an initAiChat übergeben');
  assert.ok(appJsSource.includes('kcAiAnalyzeBtn'), 'Wissenspflege-Button kcAiAnalyzeBtn ist verdrahtet');
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

  assert.equal(formatToolLabel('propose_create_category', { name: 'DevOps' }), '📁 Kategorie-Vorschlag „DevOps“ …');
  assert.equal(formatToolLabel('propose_move_note', { relPath: 'A/B/C.md' }), '📦 Notiz verschieben „A/B/C.md“ …');
  assert.equal(formatToolLabel('propose_rename_note', { newTitle: 'Neuer Titel' }), '🏷️ Notiz umbenennen „Neuer Titel“ …');
  assert.equal(formatToolLabel('propose_delete_note', { relPath: 'A/B/C.md' }), '🗑️ Notiz löschen (Papierkorb) „A/B/C.md“ …');

  assert.equal(formatToolLabel('audit_knowledge_base', {}), '🩺 Wissenspflege-Prüfung …');
  assert.equal(formatToolLabel('find_duplicate_notes', { query: 'Docker' }), '👥 Duplikatsuche „Docker“ …');
  assert.equal(formatToolLabel('find_duplicate_notes', {}), '👥 Duplikatsuche …');

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
    { type: 'add', line: '<script>neu</script>' },
    { type: 'truncated', line: '… und 10 weitere Zeilen' }
  ];
  const rendered = renderDiffLines(diff);
  assert.ok(rendered.includes('is-same'));
  assert.ok(rendered.includes('is-remove'));
  assert.ok(rendered.includes('is-add'));
  assert.ok(rendered.includes('is-truncated'), 'Truncated marker vorhanden');
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

test('KI-Chat UI 9: renderProposalCard rendert Gefahrenkarte für delete und Erfolgsbadges passend zum Typ', async () => {
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

  const prevWindow = global.window;
  global.window = {
    archivAPI: {
      ai: {
        applyProposal: async () => ({ success: true, action: 'deleted' })
      }
    }
  };

  try {
    const delProposal = {
      proposalId: 'prop_del',
      type: 'delete',
      title: 'Veraltete Notiz',
      relPath: 'Kategorie/Unterkategorie/Veraltete Notiz.md',
      reason: 'Wird gelöscht',
      diff: [{ type: 'remove', line: '- Veraltete Notiz' }]
    };

    const card = renderProposalCard(delProposal);
    assert.ok(card.classList.contains('is-danger-proposal'), 'Gefahrenkarte hat is-danger-proposal');

    const actions = card.children.find(c => c.className === 'ai-proposal-actions');
    const applyBtn = actions.children.find(c => c.className.includes('ai-proposal-apply-btn'));
    assert.ok(applyBtn.className.includes('is-danger'), 'Lösch-Button hat is-danger');
    assert.ok(applyBtn.textContent.includes('Papierkorb'), 'Lösch-Button erwähnt Papierkorb');

    await applyBtn.click();
    assert.ok(card.classList.contains('is-applied'));
    assert.ok(actions.innerHTML.includes('ai-proposal-badge-danger'), 'Erfolgsbadge für Papierkorb ist gerendert');
  } finally {
    global.document = prevDoc;
    global.window = prevWindow;
  }
});

test('KI-Chat UI 10: triggerAiPrompt versendet archiv:ai-prompt CustomEvent', async () => {
  const { triggerAiPrompt } = await import('../renderer/js/ai-chat.js');

  assert.equal(typeof triggerAiPrompt, 'function');

  let dispatchedEvent = null;
  const prevWindow = global.window;
  global.window = {
    dispatchEvent: (evt) => {
      dispatchedEvent = evt;
    }
  };

  try {
    triggerAiPrompt('Wissenspflege starten', { autoSend: true });
    assert.ok(dispatchedEvent);
    assert.equal(dispatchedEvent.type, 'archiv:ai-prompt');
    assert.equal(dispatchedEvent.detail?.prompt, 'Wissenspflege starten');
    assert.equal(dispatchedEvent.detail?.autoSend, true);
  } finally {
    global.window = prevWindow;
  }
});

test('KI-Chat UI 11: resolveActiveModels bereinigt gelöschte Modelle und wählt gültige Fallbacks', async () => {
  const { resolveActiveModels } = await import('../renderer/js/ai-chat.js');
  assert.equal(typeof resolveActiveModels, 'function', 'resolveActiveModels ist exportiert');

  // Fall 1: Altes Modell wurde gelöscht, nur noch gemma4:12b existiert
  const res1 = resolveActiveModels(['gemma4:12b'], 'phi:2.7b', 'phi:2.7b');
  assert.deepEqual(res1.models, ['gemma4:12b'], 'Enthält ausschließlich noch installierte Modelle');
  assert.equal(res1.selectedModel, 'gemma4:12b', 'Fällt automatisch auf das verfügbare Modell zurück');
  assert.equal(res1.shouldUpdateDefault, true, 'Signalisiert, dass die Standard-Einstellung aktualisiert werden muss');

  // Fall 2: Aktuell gewähltes Modell ist vorhanden und bleibt aktiv
  const res2 = resolveActiveModels(['gemma4:12b', 'qwen2.5:7b'], 'qwen2.5:7b', 'gemma4:12b');
  assert.deepEqual(res2.models, ['gemma4:12b', 'qwen2.5:7b']);
  assert.equal(res2.selectedModel, 'qwen2.5:7b', 'Aktuelle Auswahl bleibt erhalten');
  assert.equal(res2.shouldUpdateDefault, false);

  // Fall 3: Aktuell gewähltes Modell ist veraltet, aber konfiguriertes Default existiert noch
  const res3 = resolveActiveModels(['gemma4:12b', 'mistral:latest'], 'deleted:1b', 'mistral:latest');
  assert.equal(res3.selectedModel, 'mistral:latest', 'Fällt auf das noch gültige konfigurierte Modell zurück');
  assert.equal(res3.shouldUpdateDefault, false);

  // Fall 4: Keine Modelle verfügbar (z. B. leere Liste)
  const res4 = resolveActiveModels([], 'phi:2.7b', 'phi:2.7b');
  assert.deepEqual(res4.models, []);
  assert.equal(res4.selectedModel, null);
  assert.equal(res4.shouldUpdateDefault, false);
});

test('KI-Chat UI 11: Editor- und Vorschau-Kontextmenü bieten KI-Aktionen an', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '../renderer/js/app.js'), 'utf8');

  assert.ok(appJs.includes("label: 'Mit KI bearbeiten …'"), 'Editor-Kontextmenü enthält "Mit KI bearbeiten …"');
  assert.ok(appJs.includes("label: 'An KI-Chat senden'"), 'Submenu enthält "An KI-Chat senden"');
  assert.ok(appJs.includes("label: 'Auswahl zusammenfassen'"), 'Submenu enthält "Auswahl zusammenfassen"');
  assert.ok(appJs.includes("label: 'Auswahl verbessern / korrigieren'"), 'Submenu enthält "Auswahl verbessern / korrigieren"');
  assert.ok(appJs.includes("label: 'Auswahl kürzen & prägnanter fassen'"), 'Submenu enthält "Auswahl kürzen & prägnanter fassen"');
  assert.ok(appJs.includes("label: 'Auswahl erklären'"), 'Submenu enthält "Auswahl erklären"');
  assert.ok(appJs.includes("label: 'Ganze Notiz zusammenfassen'"), 'Submenu enthält "Ganze Notiz zusammenfassen"');
  assert.ok(appJs.includes("label: 'Passende Tags für Notiz vorschlagen'"), 'Submenu enthält "Passende Tags für Notiz vorschlagen"');
  assert.ok(appJs.includes("label: 'Passende Wikilinks für Notiz finden'"), 'Submenu enthält "Passende Wikilinks für Notiz finden"');
  assert.ok(appJs.includes("label: 'Auswahl an KI-Chat senden'"), 'Vorschau-Kontextmenü enthält "Auswahl an KI-Chat senden"');
});

test('KI Wissenspflege: Prompt fordert direkte 1-Klick-Proposals statt reiner Aufzählung', () => {
  const ollama = require('../main/ai-ollama');
  assert.ok(ollama.BASE_SYSTEM_PROMPT.includes('Recherche & Wissenspflege (1-Klick-Lösungen)'));
  assert.ok(ollama.BASE_SYSTEM_PROMPT.includes('erstelle DIREKT konkrete Proposal-Werkzeugaufrufe'));
});

test('KI-Einstellungen: Modell-Refresh-Button und Einsteiger-Hilfe vorhanden', () => {
  const settingsJs = fs.readFileSync(path.join(__dirname, '../renderer/js/settings-window.js'), 'utf8');
  const settingsCss = fs.readFileSync(path.join(__dirname, '../renderer/css/settings.css'), 'utf8');

  // Refresh-Button & Modell-Erkennung
  assert.ok(settingsJs.includes('btnRefreshAiModels'), 'btnRefreshAiModels existiert');
  assert.ok(settingsJs.includes('refreshAiModels'), 'refreshAiModels-Funktion existiert');
  assert.ok(settingsJs.includes('stAiModelFeedback'), 'Feedbackzeile für Modelle existiert');

  // Einsteiger-Hilfe (Installation, Starten, Download)
  assert.ok(settingsJs.includes('Ollama einrichten'), 'Abschnitt "Ollama einrichten" existiert');
  assert.ok(settingsJs.includes('curl -fsSL https://ollama.com/install.sh | sh'), 'Ollama-Installationsbefehl vorhanden');
  assert.ok(settingsJs.includes('ollama serve'), 'Ollama-Startbefehl vorhanden');
  assert.ok(settingsJs.includes('ollama run qwen2.5:7b'), 'Empfohlener Modell-Download vorhanden');

  // Empfehlungen & Parametergrößen
  assert.ok(settingsJs.includes('Empfohlene Modelle & Größen'), 'Abschnitt "Empfohlene Modelle & Größen" existiert');
  assert.ok(settingsJs.includes('7B – 8B Parameter'), 'Sweetspot 7B-8B vorhanden');
  assert.ok(settingsJs.includes('~3B Parameter'), 'Mindestanforderung 3B vorhanden');
  assert.ok(settingsJs.includes('12B – 14B Parameter'), 'High-End 12B-14B vorhanden');
  assert.ok(settingsJs.includes('ollama.com/search'), 'Verlinkung zu ollama.com/search vorhanden');

  // CSS-Klassen
  assert.ok(settingsCss.includes('.aws-ai-guide{'), 'Guide-CSS-Klasse existiert');
  assert.ok(settingsCss.includes('.aws-code-box{'), 'Codebox-CSS-Klasse existiert');
  assert.ok(settingsCss.includes('.aws-code-copy{'), 'Kopier-Button-CSS-Klasse existiert');
  assert.ok(settingsCss.includes('.aws-ai-models-guide{'), 'Modell-Guide-CSS-Klasse existiert');
  assert.ok(settingsCss.includes('.aws-ai-tier{'), 'Modell-Tier-CSS-Klasse existiert');
});

test('KI-Assistent: Standardmäßig aus und dynamische Sichtbarkeit in Topbar & Menüs', () => {
  const aiIpc = fs.readFileSync(path.join(__dirname, '../main/ai-ipc.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../renderer/index.html'), 'utf8');
  const aiChatJs = fs.readFileSync(path.join(__dirname, '../renderer/js/ai-chat.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '../renderer/js/app.js'), 'utf8');
  const settingsJs = fs.readFileSync(path.join(__dirname, '../renderer/js/settings-window.js'), 'utf8');

  // 1. Backend-Default ist disabled (enabled: false)
  assert.ok(aiIpc.includes('enabled: false'), 'Backend DEFAULT_SETTINGS.enabled ist false');

  // 2. Settings-Window nutzt standardmäßig enabled: false
  assert.ok(settingsJs.includes('enabled: false,'), 'settings-window defaultAiSettings.enabled ist false');
  assert.ok(settingsJs.includes('aiSettings.enabled === true'), 'Schalter ist nur aktiv wenn explizit true');

  // 3. Topbar-Button startet unsichtbar
  assert.ok(indexHtml.includes('id="titlebarAiChatBtn"'), 'titlebarAiChatBtn existiert');
  assert.ok(indexHtml.includes('id="titlebarAiChatBtn" type="button" title="KI-Assistent (Alt+A)" aria-label="KI-Assistent öffnen" aria-pressed="false" style="display:none;"'), 'titlebarAiChatBtn hat initial style="display:none;"');

  // 4. ai-chat.js exponiert isAiChatEnabled und setAiChatEnabled und synchronisiert
  assert.ok(aiChatJs.includes('export function isAiChatEnabled('), 'isAiChatEnabled exportiert');
  assert.ok(aiChatJs.includes('export function setAiChatEnabled('), 'setAiChatEnabled exportiert');
  assert.ok(aiChatJs.includes('openButton.style.display = aiChatEnabled ? \'\' : \'none\';'), 'Button wird je nach Aktivierungsstatus ein- oder ausgeblendet');

  // 5. app.js bindet KI-Kontextmenü nur ein, wenn isAiChatEnabled() wahr ist
  assert.ok(appJs.includes('if (isAiChatEnabled()) {'), 'app.js prüft isAiChatEnabled() für Kontextmenüs');
});

test('KI-Chat Design: Anpassung an Design 2 und Classic', () => {
  const chatCss = fs.readFileSync(path.join(__dirname, '../renderer/css/ai-chat.css'), 'utf8');

  // 1. Design 2 Root & Oberflächen
  assert.ok(chatCss.includes('[data-ui-design="design2"] #aiChatPanel{'), 'Design 2 Panel-Regel existiert');
  assert.ok(chatCss.includes('var(--d2-surface-1)'), 'Design 2 nutzt --d2-surface-1');
  assert.ok(chatCss.includes('var(--d2-surface-2)'), 'Design 2 nutzt --d2-surface-2');
  assert.ok(chatCss.includes('var(--d2-shadow-dialog)'), 'Design 2 nutzt --d2-shadow-dialog');

  // 2. Design 2 Typografie
  assert.ok(chatCss.includes('var(--d2-font-heading-condensed)'), 'Design 2 nutzt Barlow Condensed für Headings');
  assert.ok(chatCss.includes('var(--d2-font-mono)'), 'Design 2 nutzt IBM Plex Mono für Metadaten & Code');

  // 3. Design 2 Chat-Komponenten (Messages, Tool-Pills, Proposals)
  assert.ok(chatCss.includes('[data-ui-design="design2"] .ai-msg-user{'), 'Design 2 User-Sprechblase existiert');
  assert.ok(chatCss.includes('[data-ui-design="design2"] .ai-msg-assistant{'), 'Design 2 Assistent-Sprechblase existiert');
  assert.ok(chatCss.includes('[data-ui-design="design2"] .ai-tool-pill{'), 'Design 2 Tool-Pill existiert');
  assert.ok(chatCss.includes('[data-ui-design="design2"] .ai-proposal-card{'), 'Design 2 Proposal-Karte existiert');
  assert.ok(chatCss.includes('[data-ui-design="design2"] .ai-proposal-diff{'), 'Design 2 Proposal-Diff existiert');

  // 4. Classic Light Mode Feinabstimmung
  assert.ok(chatCss.includes('body.theme-light:not([data-ui-design="design2"]) #aiChatPanel{'), 'Classic Light-Mode Schatten existiert');
});

test('KI-Chat Phase 1: Aktive Notiz als sichtbarer Composer-Kontext', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../renderer/index.html'), 'utf8');
  const chatCss = fs.readFileSync(path.join(__dirname, '../renderer/css/ai-chat.css'), 'utf8');
  const aiChatJs = fs.readFileSync(path.join(__dirname, '../renderer/js/ai-chat.js'), 'utf8');
  const editorJs = fs.readFileSync(path.join(__dirname, '../renderer/js/editor.js'), 'utf8');

  // 1. HTML Elemente
  assert.ok(indexHtml.includes('id="aiActiveNoteBar"'), '#aiActiveNoteBar existiert in index.html');
  assert.ok(indexHtml.includes('id="aiActiveNoteLabel"'), '#aiActiveNoteLabel existiert in index.html');
  assert.ok(indexHtml.includes('id="aiActiveNoteSelection"'), '#aiActiveNoteSelection existiert in index.html');
  assert.ok(indexHtml.includes('id="aiActiveNoteToggle"'), '#aiActiveNoteToggle existiert in index.html');

  // 2. CSS Regeln
  assert.ok(chatCss.includes('.ai-active-note-bar{'), '.ai-active-note-bar Styling existiert');
  assert.ok(chatCss.includes('.ai-active-note-label{'), '.ai-active-note-label Styling existiert');
  assert.ok(chatCss.includes('.ai-active-note-selection{'), '.ai-active-note-selection Styling existiert');
  assert.ok(chatCss.includes('.ai-active-note-toggle{'), '.ai-active-note-toggle Styling existiert');
  assert.ok(chatCss.includes('[data-ui-design="design2"] .ai-active-note-bar{'), 'Design 2 Override für active-note-bar existiert');

  // 3. JS Logik in ai-chat.js
  assert.ok(aiChatJs.includes('document.getElementById(\'aiActiveNoteBar\')'), 'ai-chat.js bindet activeNoteBar ein');
  assert.ok(aiChatJs.includes('document.getElementById(\'aiActiveNoteToggle\')'), 'ai-chat.js bindet activeNoteToggle ein');
  assert.ok(aiChatJs.includes('function updateActiveNoteUI('), 'updateActiveNoteUI Funktion existiert');
  assert.ok(aiChatJs.includes('includeActiveNote'), 'sendMessage prüft includeActiveNote Toggle');
  assert.ok(aiChatJs.includes('window.addEventListener(\'archiv:active-note-changed\''), 'ai-chat.js hört auf archiv:active-note-changed');

  // 4. Dispatch in editor.js
  assert.ok(editorJs.includes('archiv:active-note-changed'), 'editor.js sendet archiv:active-note-changed');
});

test('KI-Chat UI 15: renderProposalCard respektiert beforeApply Hook (Abbruch bei false, Ausführung bei true)', async () => {
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

  let applyCallCount = 0;
  const prevWindow = global.window;
  global.window = {
    archivAPI: {
      ai: {
        applyProposal: async () => {
          applyCallCount++;
          return { success: true, relPath: 'Notiz.md' };
        }
      }
    }
  };

  try {
    const proposal = {
      proposalId: 'prop_hook_test',
      type: 'update',
      title: 'Hook Test Notiz',
      relPath: 'Kategorie/Unterkategorie/Notiz.md',
      diff: []
    };

    // 1. Fall: beforeApply liefert false -> applyProposal darf NICHT aufgerufen werden
    let beforeApplyCalled = false;
    const cardBlocked = renderProposalCard(proposal, {
      beforeApply: async () => {
        beforeApplyCalled = true;
        return false;
      }
    });

    const actionsBlocked = cardBlocked.children.find(c => c.className === 'ai-proposal-actions');
    const applyBtnBlocked = actionsBlocked.children.find(c => c.className.includes('ai-proposal-apply-btn'));
    await applyBtnBlocked.click();

    assert.equal(beforeApplyCalled, true);
    assert.equal(applyCallCount, 0, 'applyProposal darf bei false nicht aufgerufen werden');
    assert.equal(cardBlocked.classList.contains('is-applied'), false);
    assert.equal(applyBtnBlocked.disabled, false, 'Button muss nach Abbruch wieder aktiviert sein');

    // 2. Fall: beforeApply liefert true -> applyProposal wird aufgerufen
    const cardAllowed = renderProposalCard(proposal, {
      beforeApply: async () => true
    });

    const actionsAllowed = cardAllowed.children.find(c => c.className === 'ai-proposal-actions');
    const applyBtnAllowed = actionsAllowed.children.find(c => c.className.includes('ai-proposal-apply-btn'));
    await applyBtnAllowed.click();

    assert.equal(applyCallCount, 1, 'applyProposal muss bei true aufgerufen werden');
    assert.equal(cardAllowed.classList.contains('is-applied'), true);
  } finally {
    global.document = prevDoc;
    global.window = prevWindow;
  }
});

test('KI-Chat UI 16: initAiChat Cleanup-Funktion deregistriert Stream-Listener und räumt Status auf', async () => {
  const { initAiChat } = await import('../renderer/js/ai-chat.js');

  const elements = new Map();
  function getOrCreateElement(id, tag = 'div') {
    if (!elements.has(id)) {
      const el = {
        id,
        tagName: tag.toUpperCase(),
        dataset: {},
        style: {},
        classList: {
          _classes: new Set(),
          add(c) { this._classes.add(c); },
          remove(c) { this._classes.delete(c); },
          toggle(c, force) { if (force !== undefined) { force ? this.add(c) : this.remove(c); } else { this._classes.has(c) ? this.remove(c) : this.add(c); } },
          contains(c) { return this._classes.has(c); }
        },
        options: [],
        appendChild(child) { this.options.push(child); return child; },
        listeners: new Map(),
        addEventListener(type, handler) {
          if (!this.listeners.has(type)) this.listeners.set(type, []);
          this.listeners.get(type).push(handler);
        },
        removeEventListener(type, handler) {
          const list = this.listeners.get(type) || [];
          this.listeners.set(type, list.filter(h => h !== handler));
        },
        querySelectorAll() { return []; },
        querySelector(selector) {
          if (selector === '[data-ai-drag-handle]') {
            return getOrCreateElement('aiChatHeader');
          }
          return null;
        },
        setAttribute() {},
        removeAttribute() {},
        getAttribute() { return null; },
        getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 500 }; }
      };
      elements.set(id, el);
    }
    return elements.get(id);
  }

  const windowListeners = new Map();
  const documentListeners = new Map();

  let unlistenCount = 0;
  const mockUnlisten = () => { unlistenCount++; };

  const prevDoc = global.document;
  const prevWindow = global.window;
  const prevLocalStorage = global.localStorage;

  global.localStorage = {
    getItem() { return null; },
    setItem() {}
  };

  global.document = {
    getElementById(id) { return getOrCreateElement(id); },
    createElement(tag) { return getOrCreateElement(`dyn_${Math.random()}`, tag); },
    addEventListener(type, handler) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const list = documentListeners.get(type) || [];
      documentListeners.set(type, list.filter(h => h !== handler));
    }
  };

  global.window = {
    addEventListener(type, handler) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const list = windowListeners.get(type) || [];
      windowListeners.set(type, list.filter(h => h !== handler));
    },
    innerWidth: 1000,
    innerHeight: 800,
    requestAnimationFrame: (cb) => { cb(); },
    archivAPI: {
      ai: {
        getSettings: async () => ({ enabled: true, mode: 'safe' }),
        checkConnection: async () => ({ online: true }),
        getModels: async () => ({ success: true, models: [{ name: 'llama3.2' }] }),
        getHistory: async () => [],
        updateSettings: async () => ({ success: true }),
        abort: async () => ({ success: true }),
        onStreamChunk: () => mockUnlisten,
        onStreamToolCall: () => mockUnlisten,
        onStreamProposal: () => mockUnlisten,
        onStreamEnd: () => mockUnlisten,
        onStreamError: () => mockUnlisten,
        onSettingsUpdated: () => mockUnlisten
      }
    }
  };

  try {
    const cleanup = initAiChat();
    assert.equal(typeof cleanup, 'function', 'initAiChat liefert Cleanup-Funktion');

    const panel = getOrCreateElement('aiChatPanel');
    assert.equal(panel.dataset.initialized, 'true', 'Panel als initialized markiert');

    // Warten bis initiale asynchrone Statusaufrufe durch sind
    await new Promise(resolve => setTimeout(resolve, 20));

    // Cleanup ausführen
    cleanup();

    assert.equal(panel.dataset.initialized, undefined, 'dataset.initialized nach Cleanup gelöscht');
    assert.equal(unlistenCount, 6, 'Alle 6 Stream- und Settings-Listener abgemeldet');
  } finally {
    global.document = prevDoc;
    global.window = prevWindow;
    global.localStorage = prevLocalStorage;
  }
});

test('KI-Chat UI 17: H2 - shouldAllowProposalApplication Lebenszyklus (echte Produktionsfunktion)', async () => {
  const { shouldAllowProposalApplication } = await import('../renderer/js/ai-chat.js');

  let dirty = true;
  let confirmDialogResult = false;
  let confirmDialogCalls = [];
  let editorClosed = false;
  let canLeaveResult = false;
  let canLeaveCalls = 0;
  const openRelPath = 'Kategorie/Unterkategorie/Notiz.md';

  const bindings = {
    getOpenRelPath: () => openRelPath,
    isDirty: () => dirty,
    showConfirmDialog: async (opts) => {
      confirmDialogCalls.push(opts);
      return confirmDialogResult;
    },
    canLeaveCurrentRoute: async () => {
      canLeaveCalls++;
      return canLeaveResult;
    },
    closeEditor: () => {
      editorClosed = true;
    },
    getNoteTitle: () => 'Notiz'
  };

  const proposal = {
    type: 'update',
    relPath: 'Kategorie/Unterkategorie/Notiz.md',
    title: 'Notiz'
  };

  // Fall 1: Offene Notiz dirty, Nutzer bricht Bestätigungsdialog ab
  dirty = true;
  confirmDialogResult = false;
  editorClosed = false;
  const res1 = await shouldAllowProposalApplication(proposal, bindings);
  assert.equal(res1, false, 'Abbrechen im Dialog muss Proposal blockieren');
  assert.equal(editorClosed, false, 'Editor darf nicht geschlossen werden');
  assert.equal(confirmDialogCalls.length, 1, 'Bestätigungsdialog muss aufgerufen worden sein');

  // Fall 2: Offene Notiz dirty, Nutzer bestätigt Verwerfen
  confirmDialogResult = true;
  editorClosed = false;
  const res2 = await shouldAllowProposalApplication(proposal, bindings);
  assert.equal(res2, true, 'Bestätigung muss Proposal freigeben');
  assert.equal(editorClosed, true, 'Editor muss vor dem Anwenden geschlossen werden');

  // Fall 3: Offene Notiz nicht dirty -> kein Dialog nötig
  dirty = false;
  confirmDialogCalls = [];
  editorClosed = false;
  const res3 = await shouldAllowProposalApplication(proposal, bindings);
  assert.equal(res3, true, 'Nicht dirty Notiz muss direkt freigegeben werden');
  assert.equal(confirmDialogCalls.length, 0, 'Kein Bestätigungsdialog bei sauberer Notiz');
  assert.equal(editorClosed, true, 'Editor muss dennoch geschlossen werden');

  // Fall 4: Fremde Notiz betroffen, Editor ist dirty
  const otherProposal = {
    type: 'update',
    relPath: 'Andere/Kategorie/Notiz2.md',
    title: 'Notiz2'
  };
  dirty = true;
  canLeaveResult = false;
  const res4 = await shouldAllowProposalApplication(otherProposal, bindings);
  assert.equal(res4, false, 'canLeaveCurrentRoute = false blockiert Proposal');
  assert.equal(canLeaveCalls, 1);

  canLeaveResult = true;
  const res5 = await shouldAllowProposalApplication(otherProposal, bindings);
  assert.equal(res5, true, 'canLeaveCurrentRoute = true erlaubt Proposal');
});
