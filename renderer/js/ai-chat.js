'use strict';

import { renderPreview } from './vendor/editor-bundle.js';
import { showConfirmDialog } from './dialog.js';
import { createHtmlContextMenu, closeHtmlContextMenu, renderSimpleContextMenuItems } from './context-menu.js';

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
  if (tool === 'get_recent_notes') {
    return '🕘 Zuletzt bearbeitete Notizen …';
  }
  if (tool === 'open_note') {
    const target = args?.relPath || args?.title || '';
    return `📂 Öffne Notiz${target ? ` „${target}“` : ''} …`;
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
    if (line.type === 'truncated') {
      return `<div class="ai-diff-line is-truncated"><span class="ai-diff-prefix">…</span><span class="ai-diff-text">${escapeHtml(line.line)}</span></div>`;
    }
    const typeClass = line.type === 'add' ? 'is-add' : line.type === 'remove' ? 'is-remove' : 'is-same';
    const prefix = line.type === 'add' ? '+ ' : line.type === 'remove' ? '- ' : '  ';
    return `<div class="ai-diff-line ${typeClass}"><span class="ai-diff-prefix">${prefix}</span><span class="ai-diff-text">${escapeHtml(line.line)}</span></div>`;
  }).join('');
}

export async function shouldAllowProposalApplication(proposal, {
  getOpenRelPath = () => null,
  isDirty = () => false,
  showConfirmDialog: confirmDialog = showConfirmDialog,
  canLeaveCurrentRoute = async () => true,
  closeEditor = () => {},
  getNoteTitle = null
} = {}) {
  const openRelPath = typeof getOpenRelPath === 'function' ? getOpenRelPath() : null;
  if (!openRelPath) return true;

  const targetPath = proposal?.relPath || proposal?.targetRelPath || '';
  const sourcePath = proposal?.sourceRelPath || proposal?.relPath || '';
  const type = proposal?.type;

  const affectsOpenNote = Boolean(
    openRelPath === sourcePath ||
    openRelPath === targetPath ||
    (type === 'delete' && (openRelPath === sourcePath || openRelPath.startsWith(sourcePath + '/'))) ||
    (type === 'move' && (openRelPath === sourcePath || openRelPath.startsWith(sourcePath + '/')))
  );

  if (affectsOpenNote) {
    if (typeof isDirty === 'function' && isDirty()) {
      const noteTitle = typeof getNoteTitle === 'function'
        ? getNoteTitle(openRelPath)
        : openRelPath.split('/').pop().replace(/\.md$/, '');
      const discard = typeof confirmDialog === 'function' ? await confirmDialog({
        title: 'Ungespeicherte Änderungen verwerfen?',
        message: `Die Notiz „${noteTitle}“ enthält ungespeicherte Änderungen im Editor. Wenn du den KI-Vorschlag anwendest, werden diese ungespeicherten Änderungen verworfen.`,
        confirmLabel: 'Änderungen verwerfen & Vorschlag anwenden',
        cancelLabel: 'Abbrechen',
        danger: true
      }) : true;
      if (!discard) return false;
    }
    if (typeof closeEditor === 'function') closeEditor();
    return true;
  }

  // Proposal betrifft eine andere Notiz oder Kategorie
  if (typeof isDirty === 'function' && isDirty()) {
    const canLeave = typeof canLeaveCurrentRoute === 'function' ? await canLeaveCurrentRoute() : true;
    if (!canLeave) return false;
  }
  return true;
}

export function renderProposalCard(proposal, { onApply, onReject, beforeApply } = {}) {
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
    statusEl.hidden = true;
    try {
      if (typeof beforeApply === 'function') {
        const canProceed = await beforeApply(proposal);
        if (!canProceed) {
          applyBtn.disabled = false;
          rejectBtn.disabled = false;
          return;
        }
      }
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

export function resolveActiveModels(availableNames, currentSelected, configuredDefault) {
  const available = Array.isArray(availableNames)
    ? availableNames.map(n => (typeof n === 'string' ? n.trim() : '')).filter(Boolean)
    : [];

  if (available.length === 0) {
    return {
      models: [],
      selectedModel: null,
      shouldUpdateDefault: false
    };
  }

  let selected = null;
  if (currentSelected && available.includes(currentSelected)) {
    selected = currentSelected;
  } else if (configuredDefault && available.includes(configuredDefault)) {
    selected = configuredDefault;
  } else {
    selected = available[0];
  }

  const shouldUpdateDefault = Boolean(
    configuredDefault &&
    !available.includes(configuredDefault)
  );

  return {
    models: available,
    selectedModel: selected,
    shouldUpdateDefault
  };
}

let aiChatEnabled = false;

export function isAiChatEnabled() {
  return aiChatEnabled;
}

export function setAiChatEnabled(enabled) {
  aiChatEnabled = Boolean(enabled);
  const openButton = document.getElementById('titlebarAiChatBtn');
  if (openButton) {
    openButton.style.display = aiChatEnabled ? '' : 'none';
  }
  const panel = document.getElementById('aiChatPanel');
  if (!aiChatEnabled && panel && !panel.hidden) {
    panel.hidden = true;
    if (openButton) {
      openButton.classList.remove('is-active');
      openButton.setAttribute('aria-pressed', 'false');
    }
  }
  if (!aiChatEnabled) {
    try {
      window.dispatchEvent(new CustomEvent('archiv:ai-abort-active'));
    } catch {}
  }
  try {
    window.dispatchEvent(new CustomEvent('archiv:ai-state-changed', { detail: { enabled: aiChatEnabled } }));
  } catch {}
}

export function initAiChat({ onProposalApplied, onBeforeApplyProposal, getActiveNote, onOpenNote } = {}) {
  const panel = document.getElementById('aiChatPanel');
  const openButton = document.getElementById('titlebarAiChatBtn');
  const closeButton = document.getElementById('aiChatCloseBtn');
  const header = panel?.querySelector('[data-ai-drag-handle]');
  const input = document.getElementById('aiChatInput');
  const sendButton = document.getElementById('aiChatSendBtn');
  const clearButton = document.getElementById('aiChatClearBtn');
  const modelSelect = document.getElementById('aiChatModelSelect');
  const modelRefreshBtn = document.getElementById('aiChatModelRefreshBtn');
  const contextSelect = document.getElementById('aiChatContextSelect');
  const messagesContainer = document.getElementById('aiChatMessages');
  const emptyState = messagesContainer?.querySelector('.ai-chat-empty-state');
  const statusDot = document.getElementById('aiTopbarStatusDot');
  const headerStatusDot = document.getElementById('aiChatHeaderStatusDot');
  const headerStatusText = document.getElementById('aiChatHeaderStatusText');
  const modeGroup = document.getElementById('aiChatModeGroup');
  const modeButtons = modeGroup ? Array.from(modeGroup.querySelectorAll('.ai-mode-btn')) : [];
  const activeNoteBar = document.getElementById('aiActiveNoteBar');
  const activeNoteLabel = document.getElementById('aiActiveNoteLabel');
  const activeNoteSelection = document.getElementById('aiActiveNoteSelection');
  const activeNoteToggle = document.getElementById('aiActiveNoteToggle');

  if (!panel || !openButton || !closeButton || !header || !input || !sendButton || !messagesContainer) {
    return () => {};
  }
  if (panel.dataset.initialized === 'true') return () => {};
  panel.dataset.initialized = 'true';

  function updateActiveNoteUI() {
    if (!activeNoteBar || !activeNoteLabel) return;
    const note = typeof getActiveNote === 'function' ? getActiveNote() : null;
    if (!note || !note.relPath) {
      activeNoteBar.style.display = 'none';
      return;
    }
    activeNoteBar.style.display = 'flex';
    activeNoteLabel.textContent = note.relPath;
    activeNoteLabel.title = `Aktive Notiz: ${note.relPath}`;
    if (activeNoteSelection) {
      const sel = typeof note.selection === 'string' ? note.selection.trim() : '';
      if (sel.length > 0) {
        activeNoteSelection.textContent = `${sel.length} Z. markiert`;
        activeNoteSelection.style.display = 'inline';
      } else {
        activeNoteSelection.style.display = 'none';
      }
    }
  }

  // Initialen Aktiv-Zustand aus den Einstellungen laden:
  window.archivAPI.ai.getSettings().then((settings) => {
    setAiChatEnabled(settings?.enabled === true);
  }).catch(() => {
    setAiChatEnabled(false);
  });

  const removeSettingsListener = window.archivAPI.ai.onSettingsUpdated?.((settings) => {
    if (settings && typeof settings.enabled === 'boolean') {
      setAiChatEnabled(settings.enabled);
    }
  });

  const handleCustomSettingsChanged = (event) => {
    if (event?.detail && typeof event.detail.enabled === 'boolean') {
      setAiChatEnabled(event.detail.enabled);
    }
  };
  window.addEventListener('archiv:ai-settings-changed', handleCustomSettingsChanged);

  const handleAbortActive = () => {
    if (activeMessageId) {
      window.archivAPI.ai.abort(activeMessageId).catch(() => {});
    }
  };
  window.addEventListener('archiv:ai-abort-active', handleAbortActive);

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
    bubble.dataset.rawMarkdown = text;
    messagesContainer.appendChild(bubble);
    updateEmptyState();
    scrollToBottom();
    return bubble;
  }

  function appendAssistantBubble(markdownText = '') {
    const bubble = document.createElement('div');
    bubble.className = 'ai-msg-assistant';
    bubble.innerHTML = renderPreview(markdownText);
    bubble.dataset.rawMarkdown = markdownText;
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
      if (contextSelect && settings?.contextSize) {
        contextSelect.value = String(settings.contextSize);
      }
      const conn = await window.archivAPI.ai.checkConnection({ host: settings?.host }).catch(() => ({ online: false }));
      if (statusDot) {
        statusDot.classList.toggle('is-online', Boolean(conn?.online));
        statusDot.classList.toggle('is-offline', !conn?.online);
        statusDot.title = conn?.online
          ? `Ollama online (${conn.version ? `v${String(conn.version).replace(/^v/i, '')}` : ''})`
          : 'Ollama nicht erreichbar';
      }
      if (headerStatusDot) {
        headerStatusDot.classList.toggle('is-online', Boolean(conn?.online));
        headerStatusDot.classList.toggle('is-offline', !conn?.online);
      }
      if (headerStatusText) {
        headerStatusText.textContent = conn?.online ? 'Bereit' : 'Offline';
      }
      if (modelSelect) {
        const modelsRes = await window.archivAPI.ai.getModels({ host: settings?.host }).catch(() => ({ success: false, models: [] }));
        const availableNames = modelsRes?.success && Array.isArray(modelsRes.models)
          ? modelsRes.models.map(m => m?.name).filter(Boolean)
          : [];

        if (modelsRes?.success) {
          const { models, selectedModel, shouldUpdateDefault } = resolveActiveModels(
            availableNames,
            modelSelect.value,
            settings?.defaultModel
          );
          modelSelect.innerHTML = '';
          if (models.length > 0) {
            for (const name of models) {
              const opt = document.createElement('option');
              opt.value = name;
              opt.textContent = name;
              opt.selected = (name === selectedModel);
              modelSelect.appendChild(opt);
            }
            modelSelect.value = selectedModel;
            if (shouldUpdateDefault && selectedModel) {
              window.archivAPI.ai.updateSettings({ defaultModel: selectedModel }).catch(() => {});
            }
          } else {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'Keine Modelle installiert';
            opt.disabled = true;
            opt.selected = true;
            modelSelect.appendChild(opt);
          }
        } else {
          // Ollama war nicht erreichbar
          if (modelSelect.options.length === 0) {
            const opt = document.createElement('option');
            opt.value = settings?.defaultModel || 'phi:2.7b';
            opt.textContent = `${settings?.defaultModel || 'phi:2.7b'} (offline)`;
            opt.disabled = true;
            opt.selected = true;
            modelSelect.appendChild(opt);
          }
        }

        const onboardingHint = document.getElementById('aiChatOnboardingHint');
        const hintTitle = document.getElementById('aiHintTitle');
        const hintDesc = document.getElementById('aiHintDesc');
        const hintCodeRow = document.getElementById('aiHintCodeRow');
        const hintCommand = document.getElementById('aiHintCommand');
        const hintSub = document.getElementById('aiHintSub');
        const hintCopyBtn = document.getElementById('aiHintCopyBtn');

        if (hintCopyBtn && !hintCopyBtn.dataset.wired) {
          hintCopyBtn.dataset.wired = 'true';
          hintCopyBtn.addEventListener('click', async () => {
            const cmd = hintCommand?.textContent || 'ollama run qwen2.5:7b';
            await window.archivAPI.clipboard.writeText(cmd);
            hintCopyBtn.textContent = '✓';
            setTimeout(() => { hintCopyBtn.textContent = '📋'; }, 1500);
          });
        }

        if (onboardingHint) {
          if (conn?.online) {
            if (availableNames.length === 0) {
              onboardingHint.style.display = 'block';
              onboardingHint.classList.remove('is-offline');
              if (hintTitle) hintTitle.textContent = '💡 Keine KI-Modelle in Ollama gefunden';
              if (hintDesc) hintDesc.textContent = 'Ollama läuft, aber es ist noch kein Sprachmodell installiert. Führe im Terminal aus:';
              if (hintCodeRow) hintCodeRow.style.display = 'flex';
              if (hintCommand) hintCommand.textContent = 'ollama run qwen2.5:7b';
              if (hintSub) hintSub.innerHTML = 'Empfehlung: <strong>qwen2.5:7b</strong> für Wissensarbeit, oder <strong>llama3.2</strong> für schnelle Antworten.';
            } else {
              onboardingHint.style.display = 'none';
            }
          } else {
            onboardingHint.style.display = 'block';
            onboardingHint.classList.add('is-offline');
            if (hintTitle) hintTitle.textContent = '⚠️ Ollama ist nicht erreichbar';
            if (hintDesc) hintDesc.textContent = 'Bitte starte Ollama lokal im Terminal mit:';
            if (hintCodeRow) hintCodeRow.style.display = 'flex';
            if (hintCommand) hintCommand.textContent = 'ollama serve';
            if (hintSub) hintSub.textContent = 'Falls Ollama noch nicht installiert ist, lade es von ollama.com herunter.';
          }
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
    const contextSize = contextSelect?.value ? parseInt(contextSelect.value, 10) : undefined;
    const includeActiveNote = activeNoteToggle ? activeNoteToggle.checked : true;
    const rawActiveNote = typeof getActiveNote === 'function' ? getActiveNote() : null;
    const activeNote = (includeActiveNote && rawActiveNote?.relPath) ? rawActiveNote : null;
    try {
      await window.archivAPI.ai.sendMessage({
        messageId,
        text,
        model: selectedModel,
        mode: currentMode,
        ...(activeNote ? { activeNote } : {}),
        options: {
          contextSize: Number.isInteger(contextSize) ? contextSize : undefined
        }
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

  const MAX_DELTA_BUFFER_LENGTH = 2_000_000;
  const removeChunkListener = window.archivAPI.ai.onStreamChunk((payload) => {
    if (!payload || payload.messageId !== activeMessageId) return;
    const delta = payload.delta || '';
    if (activeDeltaBuffer.length + delta.length <= MAX_DELTA_BUFFER_LENGTH) {
      activeDeltaBuffer += delta;
    }
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
          beforeApply: onBeforeApplyProposal,
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

  // KI-Block 1: reine Navigationsabsicht aus open_note. Kein Proposal, keine
  // eigene Speicher-/Navigationslogik hier — onOpenNote (von app.js übergeben)
  // ruft ausschließlich den bereits bestehenden canLeaveCurrentRoute()/
  // navigateTo()-Weg auf. Scheitert das Öffnen (Dirty-Editor-Abbruch, Notiz
  // inzwischen verschoben/gelöscht), bleibt die aktuelle Ansicht unverändert;
  // ein kurzer Hinweis erscheint als Pill, im selben Muster wie Werkzeugaufrufe.
  const removeNavigateListener = window.archivAPI.ai.onStreamNavigate?.((payload) => {
    if (!payload || !payload.relPath || typeof onOpenNote !== 'function') return;
    Promise.resolve(onOpenNote(payload)).then((res) => {
      if (!res || res.opened !== false || !activeBubbleEl) return;
      let toolsContainer = activeBubbleEl.querySelector('.ai-msg-tools');
      if (!toolsContainer) {
        toolsContainer = document.createElement('div');
        toolsContainer.className = 'ai-msg-tools';
        activeBubbleEl.insertBefore(toolsContainer, activeBubbleEl.firstChild);
      }
      const badge = document.createElement('div');
      badge.className = 'ai-tool-pill';
      badge.textContent = `⚠️ „${payload.title || payload.relPath}“ konnte nicht geöffnet werden`;
      toolsContainer.appendChild(badge);
      scrollToBottom();
    }).catch(() => {});
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
      activeBubbleEl.dataset.rawMarkdown = fullText;
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
    if (open && !isAiChatEnabled()) return;
    panel.hidden = !open;
    openButton.classList.toggle('is-active', open);
    openButton.setAttribute('aria-pressed', String(open));
    openButton.setAttribute('aria-label', open ? 'KI-Assistent schließen' : 'KI-Assistent öffnen');
    if (open) {
      restoreBounds();
      refreshModelsAndStatus();
      updateActiveNoteUI();
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
    if (!isAiChatEnabled()) return;
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
  const handleInputKeydown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const handleSendClick = () => sendMessage();
  const handleClearClick = () => handleClearHistory();

  const handleModelChange = () => {
    if (modelSelect?.value) {
      window.archivAPI.ai.updateSettings({ defaultModel: modelSelect.value }).catch(() => {});
    }
  };

  const handleModelRefreshClick = async () => {
    if (!modelRefreshBtn) return;
    modelRefreshBtn.classList.add('is-refreshing');
    modelRefreshBtn.disabled = true;
    try {
      await refreshModelsAndStatus();
    } finally {
      setTimeout(() => {
        modelRefreshBtn.classList.remove('is-refreshing');
        modelRefreshBtn.disabled = false;
      }, 400);
    }
  };

  const handleContextChange = () => {
    if (!contextSelect) return;
    const contextSize = parseInt(contextSelect.value, 10);
    if (Number.isInteger(contextSize)) {
      window.archivAPI.ai.updateSettings({ contextSize }).catch(() => {});
    }
  };

  const modeButtonHandlers = new Map();
  for (const btn of modeButtons) {
    const handler = () => {
      const mode = btn.dataset.mode;
      if (mode && mode !== currentMode) {
        setActiveMode(mode);
        window.archivAPI.ai.updateSettings({ mode }).catch(() => {});
      }
    };
    modeButtonHandlers.set(btn, handler);
    btn.addEventListener('click', handler);
  }

  input.addEventListener('keydown', handleInputKeydown);
  sendButton.addEventListener('click', handleSendClick);
  clearButton?.addEventListener('click', handleClearClick);
  modelSelect?.addEventListener('change', handleModelChange);
  modelRefreshBtn?.addEventListener('click', handleModelRefreshClick);
  contextSelect?.addEventListener('change', handleContextChange);

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
    if (!isAiChatEnabled()) return;
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

  const handleInputContextMenu = (e) => {
    e.preventDefault();
    const hasSelection = input.selectionStart !== input.selectionEnd;
    const menu = createHtmlContextMenu({
      className: 'context-menu',
      position: { clientX: e.clientX, clientY: e.clientY },
      label: 'Chat-Eingabe-Menü',
      trigger: input,
      html: renderSimpleContextMenuItems([
        {
          label: 'Ausschneiden',
          disabled: !hasSelection,
          data: { action: 'cut' }
        },
        {
          label: 'Kopieren',
          disabled: !hasSelection,
          data: { action: 'copy' }
        },
        {
          label: 'Einfügen',
          data: { action: 'paste' }
        },
        { separator: true },
        {
          label: 'Alles auswählen',
          data: { action: 'select-all' }
        },
        {
          label: 'Textfeld leeren',
          disabled: !input.value.trim(),
          data: { action: 'clear' }
        }
      ])
    });

    menu.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('button');
      if (!btn || btn.disabled) return;
      const action = btn.dataset.action;
      closeHtmlContextMenu(menu, { reason: 'action' });

      if (action === 'cut') {
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value.slice(start, end);
        if (text) {
          await window.archivAPI.clipboard.writeText(text);
          input.value = input.value.slice(0, start) + input.value.slice(end);
          input.selectionStart = input.selectionEnd = start;
          resizeInput();
        }
      } else if (action === 'copy') {
        const text = input.value.slice(input.selectionStart, input.selectionEnd);
        if (text) await window.archivAPI.clipboard.writeText(text);
      } else if (action === 'paste') {
        const clipText = await window.archivAPI.clipboard.readText();
        if (clipText) {
          const start = input.selectionStart;
          const end = input.selectionEnd;
          input.value = input.value.slice(0, start) + clipText + input.value.slice(end);
          input.selectionStart = input.selectionEnd = start + clipText.length;
          resizeInput();
        }
      } else if (action === 'select-all') {
        input.select();
      } else if (action === 'clear') {
        input.value = '';
        resizeInput();
      }
    });
  };

  const handleMessagesContextMenu = (e) => {
    const bubble = e.target.closest('.ai-msg-user, .ai-msg-assistant');
    const selection = window.getSelection().toString();
    if (!bubble && !selection) return;
    e.preventDefault();

    const items = [];
    if (selection) {
      items.push({
        label: 'Auswahl kopieren',
        data: { action: 'copy-selection' }
      });
    }
    if (bubble) {
      items.push({
        label: 'Ganze Nachricht kopieren',
        data: { action: 'copy-message' }
      });
    }

    if (items.length === 0) return;

    const menu = createHtmlContextMenu({
      className: 'context-menu',
      position: { clientX: e.clientX, clientY: e.clientY },
      label: 'Nachrichten-Menü',
      trigger: bubble || messagesContainer,
      html: renderSimpleContextMenuItems(items)
    });

    menu.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('button');
      if (!btn || btn.disabled) return;
      const action = btn.dataset.action;
      closeHtmlContextMenu(menu, { reason: 'action' });

      if (action === 'copy-selection' && selection) {
        await window.archivAPI.clipboard.writeText(selection);
      } else if (action === 'copy-message' && bubble) {
        const textToCopy = bubble.dataset.rawMarkdown || bubble.innerText || '';
        if (textToCopy) await window.archivAPI.clipboard.writeText(textToCopy);
      }
    });
  };

  const handleSelectionChange = () => {
    if (!panel.hidden) updateActiveNoteUI();
  };

  messagesContainer.addEventListener('click', handleSuggestionClick);
  messagesContainer.addEventListener('contextmenu', handleMessagesContextMenu);
  input.addEventListener('contextmenu', handleInputContextMenu);
  window.addEventListener('archiv:ai-prompt', handleExternalPrompt);
  window.addEventListener('hashchange', updateActiveNoteUI);
  window.addEventListener('archiv:active-note-changed', updateActiveNoteUI);
  document.addEventListener('selectionchange', handleSelectionChange);

  window.addEventListener('resize', handleWindowResize);
  window.addEventListener('focus', handleWindowFocus);

  restoreBounds();
  resizeInput();
  loadHistory();
  refreshModelsAndStatus();
  updateActiveNoteUI();

  return () => {
    if (activeMessageId) {
      window.archivAPI.ai.abort(activeMessageId).catch(() => {});
      activeMessageId = null;
    }
    stopDragging();
    resizeObserver?.disconnect();
    window.removeEventListener('resize', handleWindowResize);
    window.removeEventListener('focus', handleWindowFocus);
    messagesContainer.removeEventListener('click', handleSuggestionClick);
    messagesContainer.removeEventListener('contextmenu', handleMessagesContextMenu);
    input.removeEventListener('contextmenu', handleInputContextMenu);
    window.removeEventListener('archiv:ai-prompt', handleExternalPrompt);
    window.removeEventListener('hashchange', updateActiveNoteUI);
    window.removeEventListener('archiv:active-note-changed', updateActiveNoteUI);
    document.removeEventListener('selectionchange', handleSelectionChange);
    window.removeEventListener('archiv:ai-abort-active', handleAbortActive);
    removeChunkListener?.();
    removeToolCallListener?.();
    removeProposalListener?.();
    removeNavigateListener?.();
    removeEndListener?.();
    removeErrorListener?.();
    removeSettingsListener?.();
    window.removeEventListener('archiv:ai-settings-changed', handleCustomSettingsChanged);
    openButton.removeEventListener('click', togglePanel);
    closeButton.removeEventListener('click', closePanel);
    document.removeEventListener('keydown', handleShortcut);
    header.removeEventListener('mousedown', startDragging);
    input.removeEventListener('input', resizeInput);
    input.removeEventListener('keydown', handleInputKeydown);
    sendButton.removeEventListener('click', handleSendClick);
    clearButton?.removeEventListener('click', handleClearClick);
    modelSelect?.removeEventListener('change', handleModelChange);
    modelRefreshBtn?.removeEventListener('click', handleModelRefreshClick);
    contextSelect?.removeEventListener('change', handleContextChange);
    for (const [btn, handler] of modeButtonHandlers.entries()) {
      btn.removeEventListener('click', handler);
    }
    modeButtonHandlers.clear();
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
