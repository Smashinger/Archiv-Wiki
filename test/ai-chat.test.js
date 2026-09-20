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
    'onStreamToolCall'
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
  assert.ok(appJsSource.includes('initAiChat();'), 'initAiChat() wird beim Anwendungsstart aufgerufen');
});

test('KI-Chat UI 6: formatToolLabel formatiert Werkzeug-Aufrufe mit passendem Icon und Parametern', async () => {
  const { formatToolLabel } = await import('../renderer/js/ai-chat.js');

  assert.equal(formatToolLabel('search_notes', { query: 'Rezept' }), '🔍 Suche Notizen „Rezept“ …');
  assert.equal(formatToolLabel('search_notes', {}), '🔍 Suche Notizen …');

  assert.equal(formatToolLabel('read_note', { relPath: 'Kochen/Kuchen.md' }), '📖 Lese Notiz „Kochen/Kuchen.md“ …');
  assert.equal(formatToolLabel('read_note', { title: 'Mein Kuchen' }), '📖 Lese Notiz „Mein Kuchen“ …');

  assert.equal(formatToolLabel('list_notes', { category: 'Rezepte' }), '📋 Liste Notizen auf (Rezepte) …');
  assert.equal(formatToolLabel('list_notes', {}), '📋 Liste Notizen auf …');

  assert.equal(formatToolLabel('unknown_tool', {}), '⚙️ unknown_tool …');
});
