'use strict';

import { renderPreview } from './vendor/editor-bundle.js';
import { showConfirmDialog } from './dialog.js';

const INPUT_MAX_HEIGHT = 140;
const STORAGE_KEY_BOUNDS = 'archiv-wiki:ai-chat-bounds';

export function sanitizePanelBounds(bounds, { windowWidth = 1024, windowHeight = 768, minTop = 32 } = {}) {
  const minWidth = 360;
  const minHeight = 440;
  const parsedWidth = Number(bounds?.width);
  const parsedHeight = Number(bounds?.height);
  const width = Math.min(Math.max(minWidth, windowWidth - 20), Number.isFinite(parsedWidth) ? Math.max(minWidth, parsedWidth) : 440);
  const height = Math.min(Math.max(minHeight, windowHeight - minTop - 20), Number.isFinite(parsedHeight) ? Math.max(minHeight, parsedHeight) : 580);
  const maxLeft = Math.max(0, windowWidth - width);
  const maxTop = Math.max(minTop, windowHeight - height);

  const parsedLeft = Number(bounds?.left);
  const parsedTop = Number(bounds?.top);
  const left = Math.min(maxLeft, Math.max(0, Number.isFinite(parsedLeft) ? parsedLeft : Math.max(0, maxLeft - 24)));
  const top = Math.min(maxTop, Math.max(minTop, Number.isFinite(parsedTop) ? parsedTop : Math.max(minTop, maxTop - 36)));
  return { left, top, width, height };
}

export function formatToolLabel(tool, args) {
  if (tool === 'search_notes') {
    const q = args?.query ? ` „${args.query}“` : '';
    return `🔍 Suche Notizen${q} …`;
  }
  if (tool === 'read_note') {
    const target = args?.relPath || args?.title || '';
    return `📖 Lese Notiz${target ? ` „${target}“` : ''} …`;
  }
  if (tool === 'list_notes') {
    const cat = args?.category ? ` (${args.category})` : '';
    return `📋 Liste Notizen auf${cat} …`;
  }
  if (tool === 'propose_create_note') {
    const title = args?.title ? ` „${args.title}“` : '';
    return `📝 Neuer Notizvorschlag${title} …`;
  }
  if (tool === 'propose_update_note') {
    const target = args?.relPath ? ` „${args.relPath}“` : '';
    return `✏️ Änderungsvorschlag${target} …`;
  }
  if (tool === 'propose_create_category') {
    const name = args?.name ? ` „${args.name}“` : '';
    return `📁 Kategorie-Vorschlag${name} …`;
  }
  if (tool === 'propose_move_note') {
    const target = args?.relPath ? ` „${args.relPath}“` : '';
    return `📦 Notiz verschieben${target} …`;
  }
  if (tool === 'propose_rename_note') {
    const title = args?.newTitle ? ` „${args.newTitle}“` : '';
    return `🏷️ Notiz umbenennen${title} …`;
  }
  if (tool === 'propose_delete_note') {
    const target = args?.relPath ? ` „${args.relPath}“` : '';
    return `🗑️ Notiz löschen (Papierkorb)${target} …`;
  }
  if (tool === 'audit_knowledge_base') {
    return '🩺 Wissenspflege-Prüfung …';
  }
  if (tool === 'find_duplicate_notes') {
    const q = args?.query ? ` „${args.query}“` : '';
    return `👥 Duplikatsuche${q} …`;
  }
  return `⚙️ ${tool || 'Werkzeug'} …`;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderDiffLines(diff = []) {
  if (!Array.isArray(diff) || diff.length === 0) {
    return '<div class="ai-diff-empty">Keine Änderungen</div>';
  }
  return diff.map(line => {
    const typeClass = line.type === 'add' ? 'is-add' : line.type === 'remove' ? 'is-remove' : 'is-same';
    const prefix = line.type === 'add' ? '+ ' : line.type === 'remove' ? '- ' : '  ';
    return `<div class="ai-diff-line ${typeClass}"><span class="ai-diff-prefix">${prefix}</span><span class="ai-diff-text">${escapeHtml(line.line)}</span></div>`;
  }).join('');
}

export function renderProposalCard(proposal, { onApply, onReject } = {}) {
  const card = document.createElement('div');
  card.className = 'ai-proposal-card';
  const proposalId = proposal.proposalId || proposal.id;
  card.dataset.proposalId = proposalId;

  const type = proposal.type || 'create';
  const isDelete = type === 'delete';
  if (isDelete) {
    card.classList.add('is-danger-proposal');
  }

  let badgeLabel = '📝 Neue Notiz';
  let applyBtnText = '✓ Notiz erstellen';

  if (type === 'update') {
    badgeLabel = '✏️ Notiz bearbeiten';
    applyBtnText = '✓ Änderung anwenden';
  } else if (type === 'create_category') {
    badgeLabel = '📁 Kategorie anlegen';
    applyBtnText = '✓ Kategorie anlegen';
  } else if (type === 'move') {
    badgeLabel = '📦 Notiz verschieben';
    applyBtnText = '✓ Notiz verschieben';
  } else if (type === 'rename') {
    badgeLabel = '🏷️ Notiz umbenennen';
    applyBtnText = '✓ Notiz umbenennen';
  } else if (type === 'delete') {
    badgeLabel = '🗑️ In den Papierkorb verschieben';
    applyBtnText = '🗑️ In den Papierkorb verschieben';
  }

  const titleText = proposal.title || 'Notiz';
  const targetPath = proposal.relPath || proposal.sourceRelPath || '';

  const headerEl = document.createElement('div');
  headerEl.className = 'ai-proposal-header';
  headerEl.innerHTML = `
    <div class="ai-proposal-badge">${badgeLabel}</div>
    <div class="ai-proposal-title" title="${escapeHtml(titleText)}">${escapeHtml(titleText)}</div>
    <div class="ai-proposal-target" title="${escapeHtml(targetPath)}">${escapeHtml(targetPath)}</div>
  `;
  card.appendChild(headerEl);

  if (proposal.reason) {
    const reasonEl = document.createElement('div');
    reasonEl.className = 'ai-proposal-reason';
    reasonEl.textContent = proposal.reason;
    card.appendChild(reasonEl);
  }

  const diffContainer = document.createElement('div');
  diffContainer.className = 'ai-proposal-diff';
  diffContainer.innerHTML = renderDiffLines(proposal.diff);
  card.appendChild(diffContainer);

  const actionsEl = document.createElement('div');
  actionsEl.className = 'ai-proposal-actions';

  const applyBtn = document.createElement('button');
  applyBtn.className = 'ai-proposal-apply-btn' + (isDelete ? ' is-danger' : '');
  applyBtn.type = 'button';
  applyBtn.textContent = applyBtnText;

  const rejectBtn = document.createElement('button');
  rejectBtn.className = 'ai-proposal-reject-btn';
  rejectBtn.type = 'button';
  rejectBtn.textContent = '✕ Verwerfen';

  actionsEl.appendChild(applyBtn);
  actionsEl.appendChild(rejectBtn);
  card.appendChild(actionsEl);

  const statusEl = document.createElement('div');
  statusEl.className = 'ai-proposal-status';
  statusEl.hidden = true;
  card.appendChild(statusEl);

  applyBtn.addEventListener('click', async () => {
    applyBtn.disabled = true;
    rejectBtn.disabled = true;
    try {
      const res = await window.archivAPI.ai.applyProposal(proposalId);
      if (res?.success) {
        card.classList.add('is-applied');
        if (type === 'delete') {
          actionsEl.innerHTML = `
            <span class="ai-proposal-badge-danger">🗑️ In Papierkorb verschoben</span>
          `;
        } else if (type === 'create_category') {
          actionsEl.innerHTML = `
            <span class="ai-proposal-badge-success">✓ Kategorie angelegt</span>
          `;
        } else {
          const finalRelPath = res.relPath || proposal.relPath || '';
          actionsEl.innerHTML = `
            <span class="ai-proposal-badge-success">✓ Übernommen</span>
            <a class="ai-proposal-open-btn" href="#note/${encodeURIComponent(finalRelPath)}">Notiz im Editor öffnen ↗</a>
          `;
        }
        onApply?.(res);
      } else {
        applyBtn.disabled = false;
        rejectBtn.disabled = false;
        statusEl.textContent = res?.error || 'Fehler beim Anwenden des Vorschlags.';
        statusEl.hidden = false;
      }
    } catch (err) {
      applyBtn.disabled = false;
      rejectBtn.disabled = false;
      statusEl.textContent = err?.message || 'Fehler beim Anwenden des Vorschlags.';
      statusEl.hidden = false;
    }
  });

  rejectBtn.addEventListener('click', async () => {
    applyBtn.disabled = true;
    rejectBtn.disabled = true;
    try {
      await window.archivAPI.ai.rejectProposal(proposalId);
    } catch {
      // Still ignorieren falls bereits abgewickelt
    }
    card.classList.add('is-rejected');
    actionsEl.innerHTML = `<span class="ai-proposal-badge-rejected">✕ Verworfen</span>`;
    onReject?.();
  });

  return card;
}

function generateMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function initAiChat({ onProposalApplied } = {}) {
  const panel = document.getElementById('aiChatPanel');
  const openButton = document.getElementById('titlebarAiChatBtn');
  const closeButton = document.getElementById('aiChatCloseBtn');
  const header = panel?.querySelector('[data-ai-drag-handle]');
  const input = document.getElementById('aiChatInput');
  const sendButton = document.getElementById('aiChatSendBtn');
  const clearButton = document.getElementById('aiChatClearBtn');
  const modelSelect = document.getElementById('aiChatModelSelect');
  const messagesContainer = document.getElementById('aiChatMessages');
  const emptyState = messagesContainer?.querySelector('.ai-chat-empty-state');
  const statusDot = document.getElementById('aiTopbarStatusDot');
  const modeGroup = document.getElementById('aiChatModeGroup');
  const modeButtons = modeGroup ? Array.from(modeGroup.querySelectorAll('.ai-mode-btn')) : [];

  if (!panel || !openButton || !closeButton || !header || !input || !sendButton || !messagesContainer) {
    return () => {};
  }
  if (panel.dataset.initialized === 'true') return () => {};
  panel.dataset.initialized = 'true';

  let activeMessageId = null;
  let activeDeltaBuffer = '';
  let activeBubbleEl = null;
  let activeBubbleCursorEl = null;
  let currentMode = 'safe';

  function setActiveMode(mode) {
    if (!['safe', 'auto', 'plan'].includes(mode)) mode = 'safe';
    currentMode = mode;
    for (const btn of modeButtons) {
      const isActive = (btn.dataset.mode === mode);
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
    }
  }

  function setGenerating(isGenerating) {
    sendButton.dataset.mode = isGenerating ? 'stop' : 'send';
    sendButton.setAttribute('aria-label', isGenerating ? 'Antwort stoppen' : 'Nachricht senden');
    sendButton.title = isGenerating ? 'Antwort stoppen' : 'Nachricht senden (Enter)';
  }

  function updateEmptyState() {
    if (!emptyState) return;
    const hasMessages = messagesContainer.querySelector('.ai-msg-user, .ai-msg-assistant');
    emptyState.style.display = hasMessages ? 'none' : '';
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
  }

  function appendUserBubble(text) {
    const bubble = document.createElement('div');
    bubble.className = 'ai-msg-user';
    bubble.textContent = text;
    messagesContainer.appendChild(bubble);
    updateEmptyState();
    scrollToBottom();
    return bubble;
  }

  function appendAssistantBubble(markdownText = '') {
    const bubble = document.createElement('div');
    bubble.className = 'ai-msg-assistant';
    bubble.innerHTML = renderPreview(markdownText);
    messagesContainer.appendChild(bubble);
    updateEmptyState();
    scrollToBottom();
    return bubble;
  }

  function appendAssistantBubbleWithCursor() {
    const bubble = document.createElement('div');
    bubble.className = 'ai-msg-assistant';
    const toolsContainer = document.createElement('div');
    toolsContainer.className = 'ai-msg-tools';
    const contentSpan = document.createElement('div');
    contentSpan.className = 'ai-msg-content';
    const cursor = document.createElement('span');
    cursor.className = 'ai-typing-cursor';
    cursor.textContent = '▋';
    bubble.appendChild(toolsContainer);
    bubble.appendChild(contentSpan);
    bubble.appendChild(cursor);
    messagesContainer.appendChild(bubble);
    updateEmptyState();
    scrollToBottom();
    return { bubble, content: contentSpan, cursor };
  }

  async function refreshModelsAndStatus() {
    try {
      const settings = await window.archivAPI.ai.getSettings().catch(() => ({}));
      if (settings?.mode) {
        setActiveMode(settings.mode);
      }
      const conn = await window.archivAPI.ai.checkConnection({ host: settings?.host }).catch(() => ({ online: false }));
      if (statusDot) {
        statusDot.classList.toggle('is-online', Boolean(conn?.online));
        statusDot.classList.toggle('is-offline', !conn?.online);
        statusDot.title = conn?.online
          ? `Ollama online (${conn.version ? `v${String(conn.version).replace(/^v/i, '')}` : ''})`
          : 'Ollama nicht erreichbar';
      }
      if (modelSelect) {
        const modelsRes = await window.archivAPI.ai.getModels({ host: settings?.host }).catch(() => ({ success: false, models: [] }));
        const availableNames = modelsRes?.success && Array.isArray(modelsRes.models)
          ? modelsRes.models.map(m => m?.name).filter(Boolean)
          : [];
        const currentSelected = modelSelect.value || settings?.defaultModel || 'phi:2.7b';
        const allModels = [...new Set([currentSelected, ...availableNames])];
        modelSelect.innerHTML = '';
        for (const name of allModels) {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          opt.selected = (name === currentSelected);
          modelSelect.appendChild(opt);
        }
      }
    } catch (err) {
      console.warn('KI-Chat: Modelle/Status konnten nicht aktualisiert werden:', err);
    }
  }

  async function loadHistory() {
    try {
      const history = await window.archivAPI.ai.getHistory();
      if (Array.isArray(history) && history.length > 0) {
        messagesContainer.innerHTML = '';
        for (const msg of history) {
          if (msg.role === 'user') {
            appendUserBubble(msg.content);
          } else if (msg.role === 'assistant') {
            appendAssistantBubble(msg.content);
          }
        }
        updateEmptyState();
        scrollToBottom();
      }
    } catch (err) {
      console.warn('KI-Chat: Verlauf konnte nicht geladen werden:', err);
    }
  }

  async function sendMessage() {
    if (activeMessageId) {
      try {
        await window.archivAPI.ai.abort(activeMessageId);
      } catch (err) {
        console.warn('KI-Chat: Stoppen fehlgeschlagen:', err);
      }
      return;
    }

    const text = input.value.trim();
    if (!text) return;

    const messageId = generateMessageId();
    activeMessageId = messageId;
    activeDeltaBuffer = '';

    input.value = '';
    resizeInput();

    appendUserBubble(text);
    const { bubble, cursor } = appendAssistantBubbleWithCursor();
    activeBubbleEl = bubble;
    activeBubbleCursorEl = cursor;
    setGenerating(true);

    const selectedModel = modelSelect?.value || undefined;
    try {
      await window.archivAPI.ai.sendMessage({
        messageId,
        text,
        model: selectedModel,
        mode: currentMode
      });
    } catch (err) {
      activeBubbleCursorEl?.remove();
      bubble.classList.add('ai-msg-error');
      bubble.textContent = `Fehler: ${err?.message || 'Nachricht konnte nicht gesendet werden.'}`;
      activeMessageId = null;
      activeDeltaBuffer = '';
      activeBubbleEl = null;
      activeBubbleCursorEl = null;
      setGenerating(false);
    }
  }

  async function handleClearHistory() {
    const confirmed = await showConfirmDialog({
      title: 'Chat-Verlauf leeren',
      message: 'Möchtest du alle bisherigen Nachrichten dieses Chats unwiderruflich löschen?',
      confirmLabel: 'Verlauf leeren',
      danger: true
    });
    if (!confirmed) return;

    try {
      await window.archivAPI.ai.clearHistory();
      messagesContainer.innerHTML = '';
      if (emptyState) messagesContainer.appendChild(emptyState);
      updateEmptyState();
    } catch (err) {
      console.error('KI-Chat: Verlauf konnte nicht gelöscht werden:', err);
    }
  }

  const removeChunkListener = window.archivAPI.ai.onStreamChunk((payload) => {
    if (!payload || payload.messageId !== activeMessageId) return;
    activeDeltaBuffer += (payload.delta || '');
    if (activeBubbleEl) {
      const contentEl = activeBubbleEl.querySelector('.ai-msg-content');
      if (contentEl) {
        contentEl.innerHTML = renderPreview(activeDeltaBuffer);
      }
      scrollToBottom();
    }
  });

  const removeToolCallListener = window.archivAPI.ai.onStreamToolCall?.((payload) => {
    if (!payload || payload.messageId !== activeMessageId) return;
    if (activeBubbleEl) {
      let toolsContainer = activeBubbleEl.querySelector('.ai-msg-tools');
      if (!toolsContainer) {
        toolsContainer = document.createElement('div');
        toolsContainer.className = 'ai-msg-tools';
        activeBubbleEl.insertBefore(toolsContainer, activeBubbleEl.firstChild);
      }
      const badge = document.createElement('div');
      badge.className = 'ai-tool-pill';
      badge.textContent = formatToolLabel(payload.tool, payload.args);
      toolsContainer.appendChild(badge);
      scrollToBottom();
    }
  });

  const removeProposalListener = window.archivAPI.ai.onStreamProposal?.((payload) => {
    if (!payload || !payload.proposal) return;
    const targetBubble = (payload.messageId === activeMessageId && activeBubbleEl)
      ? activeBubbleEl
      : messagesContainer.querySelector('.ai-msg-assistant:last-child');

    if (targetBubble) {
      const proposalId = payload.proposal.proposalId || payload.proposal.id;
      const existing = targetBubble.querySelector(`[data-proposal-id="${proposalId}"]`);
      if (!existing) {
        const card = renderProposalCard(payload.proposal, {
          onApply: (res) => {
            onProposalApplied?.(res);
            try {
              window.dispatchEvent(new CustomEvent('archiv:proposal-applied', { detail: res }));
            } catch {}
          }
        });
        const cursor = targetBubble.querySelector('.ai-typing-cursor');
        if (cursor) {
          targetBubble.insertBefore(card, cursor);
        } else {
          targetBubble.appendChild(card);
        }
        scrollToBottom();
      }
    }
  });

  const removeEndListener = window.archivAPI.ai.onStreamEnd((payload) => {
    if (!payload || payload.messageId !== activeMessageId) return;
    const fullText = payload.fullText || activeDeltaBuffer;
    if (activeBubbleEl) {
      activeBubbleCursorEl?.remove();
      const contentEl = activeBubbleEl.querySelector('.ai-msg-content');
      if (contentEl) {
        contentEl.innerHTML = renderPreview(fullText);
      } else {
        activeBubbleEl.innerHTML = renderPreview(fullText);
      }
      const pills = activeBubbleEl.querySelectorAll('.ai-tool-pill');
      for (const pill of pills) {
        pill.classList.add('is-done');
        if (pill.textContent.endsWith(' …')) {
          pill.textContent = pill.textContent.slice(0, -2);
        }
      }
      scrollToBottom();
    }
    activeMessageId = null;
    activeDeltaBuffer = '';
    activeBubbleEl = null;
    activeBubbleCursorEl = null;
    setGenerating(false);
  });

  const removeErrorListener = window.archivAPI.ai.onStreamError((payload) => {
    if (!payload || payload.messageId !== activeMessageId) return;
    activeBubbleCursorEl?.remove();
    if (payload.category === 'aborted') {
      if (activeBubbleEl) {
        const contentEl = activeBubbleEl.querySelector('.ai-msg-content');
        if (contentEl && activeDeltaBuffer) {
          contentEl.innerHTML = renderPreview(activeDeltaBuffer);
        }
        const notice = document.createElement('div');
        notice.className = 'ai-msg-system';
        notice.textContent = '(Antwort gestoppt)';
        activeBubbleEl.appendChild(notice);
      }
    } else {
      if (activeBubbleEl) {
        const errorBox = document.createElement('div');
        errorBox.className = 'ai-msg-error';
        errorBox.style.marginTop = activeDeltaBuffer ? '6px' : '0';
        errorBox.textContent = payload.error || 'Fehler bei der Kommunikation mit Ollama.';
        activeBubbleEl.appendChild(errorBox);
      }
    }
    const pills = activeBubbleEl?.querySelectorAll?.('.ai-tool-pill') || [];
    for (const pill of pills) {
      pill.classList.add('is-done');
    }
    scrollToBottom();
    activeMessageId = null;
    activeDeltaBuffer = '';
    activeBubbleEl = null;
    activeBubbleCursorEl = null;
    setGenerating(false);
  });

  function saveBounds() {
    try {
      const bounds = {
        left: panel.offsetLeft,
        top: panel.offsetTop,
        width: panel.offsetWidth,
        height: panel.offsetHeight
      };
      localStorage.setItem(STORAGE_KEY_BOUNDS, JSON.stringify(bounds));
    } catch {
      // Storage-Fehler still ignorieren
    }
  }

  function restoreBounds() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_BOUNDS);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const minTop = document.getElementById('appTitlebar')?.offsetHeight || 0;
      const sanitized = sanitizePanelBounds(parsed, {
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        minTop
      });
      panel.style.width = `${sanitized.width}px`;
      panel.style.height = `${sanitized.height}px`;
      panel.style.left = `${sanitized.left}px`;
      panel.style.top = `${sanitized.top}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    } catch {
      // Parsing-Fehler still ignorieren
    }
  }

  function setOpen(open) {
    panel.hidden = !open;
    openButton.classList.toggle('is-active', open);
    openButton.setAttribute('aria-pressed', String(open));
    openButton.setAttribute('aria-label', open ? 'KI-Assistent schließen' : 'KI-Assistent öffnen');
    if (open) {
      restoreBounds();
      refreshModelsAndStatus();
      requestAnimationFrame(() => input.focus({ preventScroll: true }));
    }
  }

  function togglePanel() {
    setOpen(panel.hidden);
  }

  function closePanel() {
    setOpen(false);
  }

  function handleShortcut(event) {
    if (event.defaultPrevented || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (String(event.key).toLowerCase() !== 'a') return;
    event.preventDefault();
    togglePanel();
  }

  function resizeInput() {
    input.style.height = 'auto';
    input.style.height = `${Math.max(36, Math.min(input.scrollHeight, INPUT_MAX_HEIGHT))}px`;
    input.style.overflowY = input.scrollHeight > INPUT_MAX_HEIGHT ? 'auto' : 'hidden';
  }

  let dragState = null;

  function handleDragMove(event) {
    if (!dragState) return;
    const minTop = document.getElementById('appTitlebar')?.offsetHeight || 0;
    const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
    const maxTop = Math.max(minTop, window.innerHeight - panel.offsetHeight);
    const left = Math.min(maxLeft, Math.max(0, event.clientX - dragState.offsetX));
    const top = Math.min(maxTop, Math.max(minTop, event.clientY - dragState.offsetY));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function stopDragging() {
    if (!dragState) return;
    dragState = null;
    header.classList.remove('is-dragging');
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', stopDragging);
    saveBounds();
  }

  function startDragging(event) {
    if (event.button !== 0 || event.target.closest('button, select, input, textarea, a')) return;
    const bounds = panel.getBoundingClientRect();
    dragState = {
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top
    };
    panel.style.left = `${bounds.left}px`;
    panel.style.top = `${bounds.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    header.classList.add('is-dragging');
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', stopDragging);
    event.preventDefault();
  }

  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (!panel.hidden && !dragState) {
      saveBounds();
    }
  }) : null;
  resizeObserver?.observe(panel);

  const handleWindowResize = () => {
    if (!panel.hidden) restoreBounds();
  };

  const handleWindowFocus = () => {
    refreshModelsAndStatus();
  };

  openButton.addEventListener('click', togglePanel);
  closeButton.addEventListener('click', closePanel);
  document.addEventListener('keydown', handleShortcut);
  header.addEventListener('mousedown', startDragging);
  input.addEventListener('input', resizeInput);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  sendButton.addEventListener('click', sendMessage);
  clearButton?.addEventListener('click', handleClearHistory);
  modelSelect?.addEventListener('change', () => {
    if (modelSelect.value) {
      window.archivAPI.ai.updateSettings({ defaultModel: modelSelect.value }).catch(() => {});
    }
  });

  for (const btn of modeButtons) {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode && mode !== currentMode) {
        setActiveMode(mode);
        window.archivAPI.ai.updateSettings({ mode }).catch(() => {});
      }
    });
  }

  const handleSuggestionClick = (event) => {
    const chip = event.target.closest('.ai-suggestion-chip');
    if (!chip) return;
    const promptText = chip.dataset.prompt;
    if (promptText) {
      input.value = promptText;
      resizeInput();
      sendMessage();
    }
  };

  const handleExternalPrompt = (event) => {
    const promptText = event?.detail?.prompt;
    if (!promptText) return;
    setOpen(true);
    input.value = promptText;
    resizeInput();
    if (event?.detail?.autoSend) {
      sendMessage();
    } else {
      input.focus();
    }
  };

  messagesContainer.addEventListener('click', handleSuggestionClick);
  window.addEventListener('archiv:ai-prompt', handleExternalPrompt);

  window.addEventListener('resize', handleWindowResize);
  window.addEventListener('focus', handleWindowFocus);

  restoreBounds();
  resizeInput();
  loadHistory();
  refreshModelsAndStatus();

  return () => {
    stopDragging();
    resizeObserver?.disconnect();
    window.removeEventListener('resize', handleWindowResize);
    window.removeEventListener('focus', handleWindowFocus);
    messagesContainer.removeEventListener('click', handleSuggestionClick);
    window.removeEventListener('archiv:ai-prompt', handleExternalPrompt);
    removeChunkListener?.();
    removeToolCallListener?.();
    removeProposalListener?.();
    removeEndListener?.();
    removeErrorListener?.();
    openButton.removeEventListener('click', togglePanel);
    closeButton.removeEventListener('click', closePanel);
    document.removeEventListener('keydown', handleShortcut);
    header.removeEventListener('mousedown', startDragging);
    input.removeEventListener('input', resizeInput);
    delete panel.dataset.initialized;
  };
}

export function triggerAiPrompt(prompt, { autoSend = true } = {}) {
  try {
    window.dispatchEvent(new CustomEvent('archiv:ai-prompt', { detail: { prompt, autoSend } }));
  } catch (err) {
    console.warn('triggerAiPrompt fehlgeschlagen:', err);
  }
}
