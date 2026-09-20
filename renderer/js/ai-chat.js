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

function generateMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function initAiChat() {
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

  if (!panel || !openButton || !closeButton || !header || !input || !sendButton || !messagesContainer) {
    return () => {};
  }
  if (panel.dataset.initialized === 'true') return () => {};
  panel.dataset.initialized = 'true';

  let activeMessageId = null;
  let activeDeltaBuffer = '';
  let activeBubbleEl = null;
  let activeBubbleCursorEl = null;

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
    const contentSpan = document.createElement('div');
    contentSpan.className = 'ai-msg-content';
    const cursor = document.createElement('span');
    cursor.className = 'ai-typing-cursor';
    cursor.textContent = '▋';
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
        model: selectedModel
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

  const removeEndListener = window.archivAPI.ai.onStreamEnd((payload) => {
    if (!payload || payload.messageId !== activeMessageId) return;
    const fullText = payload.fullText || activeDeltaBuffer;
    if (activeBubbleEl) {
      activeBubbleCursorEl?.remove();
      activeBubbleEl.innerHTML = renderPreview(fullText);
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
    removeChunkListener?.();
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
