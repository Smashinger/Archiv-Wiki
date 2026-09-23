'use strict';

const { ipcMain } = require('electron');
const appState = require('./app-state');
const ollama = require('./ai-ollama');
const { createAiHistory } = require('./ai-history');
const { AI_TOOLS_DEFINITIONS, executeAiTool } = require('./ai-tools');
const aiProposals = require('./ai-proposals');
const aiContext = require('./ai-context');

const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  host: ollama.DEFAULT_HOST,
  defaultModel: 'qwen2.5:7b',
  temperature: 0.7,
  contextSize: 4096,
  persistHistory: true,
  mode: 'safe'
});

const SETTING_KEYS = new Set(Object.keys(DEFAULT_SETTINGS));
const HOST_ARGUMENT_KEYS = new Set(['host']);
const SEND_ARGUMENT_KEYS = new Set(['messageId', 'model', 'text', 'options', 'mode', 'activeNote']);
const ACTIVE_NOTE_KEYS = new Set(['relPath', 'content', 'selection']);
const OPTION_KEYS = new Set(['temperature', 'contextSize', 'mode']);

function invalidArgument(message = 'Ungültige Argumente für KI-IPC.') {
  const error = new TypeError(message);
  error.code = 'IPC_ARGUMENT_INVALID';
  return error;
}

function sanitizeIpcError(err) {
  if (!err) return { success: false, error: 'Unbekannter Fehler.', code: 'UNKNOWN', category: 'unknown' };
  if (err.code === 'AI_PROPOSAL_STALE') {
    return { success: false, error: err.message, code: 'AI_PROPOSAL_STALE', category: 'stale' };
  }
  if (err.code === 'IPC_ARGUMENT_INVALID') {
    return { success: false, error: err.message, code: 'IPC_ARGUMENT_INVALID', category: 'validation' };
  }
  if (err.code === 'IPC_SENDER_INVALID') {
    return { success: false, error: 'Unautorisierter IPC-Aufruf.', code: 'IPC_SENDER_INVALID', category: 'security' };
  }
  if (err.code === 'ROLLBACK_FAILED') {
    console.error('[KI] Rollback fehlgeschlagen:', err);
    return {
      success: false,
      error: 'Die Notiz konnte nach einem Fehler nicht in den ursprünglichen Zustand zurückversetzt werden (Rollback fehlgeschlagen).',
      code: 'ROLLBACK_FAILED',
      category: 'filesystem'
    };
  }
  const clean = ollama.friendlyError(err);
  return {
    success: false,
    error: clean.message,
    code: clean.code || err.code || 'INTERNAL_ERROR',
    category: clean.category || 'unknown'
  };
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireAllowedKeys(value, allowed) {
  if (!isPlainObject(value) || Object.keys(value).some(key => !allowed.has(key))) throw invalidArgument();
}

function validateHost(host) {
  try { return ollama.normalizeHost(host); }
  catch (err) { throw invalidArgument(err?.message || 'Ungültige Ollama-Server-URL.'); }
}

const OLLAMA_MODEL_PATTERN = /^[a-zA-Z0-9_.:\/-]{1,128}$/;

function validateModelName(model) {
  if (typeof model !== 'string') throw invalidArgument('Ungültiger Modellname.');
  const trimmed = model.trim();
  if (!trimmed || trimmed.length > 128 || !OLLAMA_MODEL_PATTERN.test(trimmed)) {
    throw invalidArgument('Ungültiger Modellname (nur alphanumerische Zeichen, Bindestriche, Punkte, Doppelpunkte, Schrägstriche und Unterstriche erlaubt).');
  }
  return trimmed;
}

function validateSettingsPatch(patch) {
  if (!isPlainObject(patch)) throw invalidArgument();
  requireAllowedKeys(patch, SETTING_KEYS);
  const clean = {};
  if ('enabled' in patch) {
    if (typeof patch.enabled !== 'boolean') throw invalidArgument();
    clean.enabled = patch.enabled;
  }
  if ('host' in patch) clean.host = validateHost(patch.host);
  if ('defaultModel' in patch) {
    clean.defaultModel = validateModelName(patch.defaultModel);
  }
  if ('temperature' in patch) {
    if (!Number.isFinite(patch.temperature) || patch.temperature < 0 || patch.temperature > 1) throw invalidArgument();
    clean.temperature = patch.temperature;
  }
  if ('contextSize' in patch) {
    if (!Number.isInteger(patch.contextSize) || patch.contextSize < 128 || patch.contextSize > 131072) throw invalidArgument();
    clean.contextSize = patch.contextSize;
  }
  if ('persistHistory' in patch) {
    if (typeof patch.persistHistory !== 'boolean') throw invalidArgument();
    clean.persistHistory = patch.persistHistory;
  }
  if ('mode' in patch) {
    if (typeof patch.mode !== 'string' || !['safe', 'auto', 'plan'].includes(patch.mode)) throw invalidArgument('Ungültiger KI-Modus.');
    clean.mode = patch.mode;
  }
  return clean;
}

function resolveSettings(readState) {
  const stored = readState()?.aiSettings;
  if (!isPlainObject(stored)) return { ...DEFAULT_SETTINGS };
  try { return { ...DEFAULT_SETTINGS, ...validateSettingsPatch(stored) }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}

function validateOptionalHostArgument(args) {
  if (args.length === 0 || args[0] === undefined) return {};
  if (args.length !== 1) throw invalidArgument();
  requireAllowedKeys(args[0], HOST_ARGUMENT_KEYS);
  if (args[0].host === undefined) return {};
  return { host: validateHost(args[0].host) };
}

function validateSendRequest(args) {
  if (args.length !== 1) throw invalidArgument();
  const request = args[0];
  requireAllowedKeys(request, SEND_ARGUMENT_KEYS);
  if (typeof request.messageId !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/.test(request.messageId)) throw invalidArgument();
  if (typeof request.text !== 'string' || !request.text.trim() || request.text.length > 200_000) throw invalidArgument();
  if (request.model !== undefined) {
    request.model = validateModelName(request.model);
  }
  if (request.mode !== undefined && (typeof request.mode !== 'string' || !['safe', 'auto', 'plan'].includes(request.mode))) throw invalidArgument('Ungültiger KI-Modus.');
  let activeNote = null;
  if (request.activeNote !== undefined && request.activeNote !== null) {
    requireAllowedKeys(request.activeNote, ACTIVE_NOTE_KEYS);
    if (request.activeNote.relPath !== undefined && (typeof request.activeNote.relPath !== 'string' || request.activeNote.relPath.length > 2000)) {
      throw invalidArgument('Ungültiger relPath der aktiven Notiz.');
    }
    if (request.activeNote.content !== undefined && (typeof request.activeNote.content !== 'string' || request.activeNote.content.length > 500_000)) {
      throw invalidArgument('Ungültiger Inhalt der aktiven Notiz.');
    }
    if (request.activeNote.selection !== undefined && (typeof request.activeNote.selection !== 'string' || request.activeNote.selection.length > 100_000)) {
      throw invalidArgument('Ungültige Markierung der aktiven Notiz.');
    }
    activeNote = {
      relPath: request.activeNote.relPath || '',
      content: request.activeNote.content || '',
      selection: request.activeNote.selection || ''
    };
  }
  let options = {};
  if (request.options !== undefined) {
    requireAllowedKeys(request.options, OPTION_KEYS);
    options = validateSettingsPatch(request.options);
  }
  return {
    messageId: request.messageId,
    text: request.text,
    ...(request.model !== undefined ? { model: request.model } : {}),
    ...(request.mode !== undefined ? { mode: request.mode } : {}),
    ...(activeNote ? { activeNote } : {}),
    options
  };
}

function validateMessageIdArgument(args) {
  if (args.length !== 1) throw invalidArgument();
  requireAllowedKeys(args[0], new Set(['messageId']));
  if (typeof args[0].messageId !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/.test(args[0].messageId)) throw invalidArgument();
  return args[0].messageId;
}

function validateProposalIdArgument(args) {
  if (args.length !== 1) throw invalidArgument();
  requireAllowedKeys(args[0], new Set(['proposalId']));
  if (typeof args[0].proposalId !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/.test(args[0].proposalId)) throw invalidArgument('Ungültige Proposal-ID.');
  return args[0].proposalId;
}

function registerAiIpc({
  getMainWindow,
  getCurrentProject,
  ipcMainApi = ipcMain,
  isTrustedSender,
  readState = appState.readAppState,
  writeState = appState.writeAppState,
  ollamaClient = ollama,
  history = createAiHistory({ readState, writeState }),
  now = () => new Date().toISOString()
}) {
  const activeRequests = new Map();
  const senderIsTrusted = isTrustedSender || (event => {
    const window = getMainWindow?.();
    const contents = window && !window.isDestroyed?.() ? window.webContents : null;
    return Boolean(contents && event?.sender === contents && event?.senderFrame === contents.mainFrame);
  });

  function sendToMainWindow(channel, payload) {
    const window = getMainWindow?.();
    if (!window || window.isDestroyed?.()) return;
    window.webContents.send(channel, payload);
  }

  function handle(channel, validate, handler) {
    ipcMainApi.handle(channel, (event, ...args) => {
      if (!senderIsTrusted(event)) {
        const error = new Error('IPC-Aufruf stammt nicht aus dem Hauptfenster.');
        error.code = 'IPC_SENDER_INVALID';
        throw error;
      }
      const value = validate(args);
      return handler(event, value);
    });
  }

  function handleStructured(channel, validate, handler) {
    ipcMainApi.handle(channel, async (event, ...args) => {
      try {
        if (!senderIsTrusted(event)) {
          const error = new Error('IPC-Aufruf stammt nicht aus dem Hauptfenster.');
          error.code = 'IPC_SENDER_INVALID';
          throw error;
        }
        const value = validate(args);
        return await handler(event, value);
      } catch (error) {
        return sanitizeIpcError(error);
      }
    });
  }

  const noArguments = args => {
    if (args.length !== 0) throw invalidArgument();
  };

  function abortAllRequests() {
    for (const [msgId, controller] of activeRequests.entries()) {
      try { controller.abort(); } catch {}
    }
    activeRequests.clear();
  }

  handle('ai:checkConnection', validateOptionalHostArgument, async (_event, input) => {
    const settings = resolveSettings(readState);
    try {
      const conn = await ollamaClient.checkConnection({ host: input.host || settings.host });
      return { success: true, ...conn };
    } catch (error) {
      const friendly = ollamaClient.friendlyError(error);
      return { online: false, success: false, error: friendly.message, category: friendly.category, code: friendly.code || 'CONNECTION_FAILED' };
    }
  });

  handle('ai:getModels', validateOptionalHostArgument, async (_event, input) => {
    const settings = resolveSettings(readState);
    try {
      const models = await ollamaClient.getModels({ host: input.host || settings.host });
      return { success: true, models };
    } catch (error) {
      const friendly = ollamaClient.friendlyError(error);
      return { success: false, models: [], error: friendly.message, category: friendly.category, code: friendly.code || 'MODELS_FETCH_FAILED' };
    }
  });

  handle('ai:getHistory', noArguments, () => history.getHistory());
  handle('ai:clearHistory', noArguments, () => {
    aiProposals.clearAllProposals();
    return history.clearHistory();
  });
  handle('ai:getSettings', noArguments, () => resolveSettings(readState));
  handle('ai:updateSettings', args => {
    if (args.length !== 1) throw invalidArgument();
    return validateSettingsPatch(args[0]);
  }, (_event, patch) => {
    const next = { ...resolveSettings(readState), ...patch };
    writeState({ aiSettings: next });
    if (patch.enabled === false) {
      abortAllRequests();
    }
    sendToMainWindow('ai:settings-updated', next);
    return next;
  });

  handle('ai:abort', validateMessageIdArgument, (_event, messageId) => {
    const controller = activeRequests.get(messageId);
    if (!controller) return { aborted: false };
    controller.abort();
    return { aborted: true };
  });

  handle('ai:getProposal', validateProposalIdArgument, (_event, proposalId) => {
    const proposal = aiProposals.getProposal(proposalId);
    if (!proposal) return null;
    return {
      id: proposal.id,
      type: proposal.type,
      title: proposal.title,
      relPath: proposal.relPath,
      subCategoryRelPath: proposal.subCategoryRelPath,
      diff: proposal.diff,
      reason: proposal.reason,
      tags: proposal.tags,
      createdAt: proposal.createdAt
    };
  });

  handleStructured('ai:applyProposal', validateProposalIdArgument, async (_event, proposalId) => {
    const currentProject = typeof getCurrentProject === 'function' ? getCurrentProject() : null;
    const projectPath = currentProject?.path || null;
    if (!projectPath) {
      return { success: false, error: 'Kein geöffnetes Wiki-Projekt vorhanden.', code: 'NO_PROJECT', category: 'project' };
    }
    return aiProposals.applyProposal(proposalId, projectPath);
  });

  handleStructured('ai:rejectProposal', validateProposalIdArgument, (_event, proposalId) => {
    return aiProposals.rejectProposal(proposalId);
  });

  handle('ai:sendMessage', validateSendRequest, (_event, request) => {
    if (activeRequests.has(request.messageId)) throw invalidArgument('Diese messageId wird bereits verwendet.');
    const settings = resolveSettings(readState);
    if (!settings.enabled) throw invalidArgument('Der KI-Assistent ist deaktiviert.');
    const controller = new AbortController();
    activeRequests.set(request.messageId, controller);

    const model = request.model || settings.defaultModel;
    const temperature = request.options.temperature ?? settings.temperature;
    const contextSize = request.options.contextSize ?? settings.contextSize;
    const mode = request.mode || request.options.mode || settings.mode || 'safe';
    let pendingDelta = '';
    let flushTimer = null;
    const flush = () => {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = null;
      if (!pendingDelta) return;
      sendToMainWindow('ai:stream-chunk', { messageId: request.messageId, delta: pendingDelta });
      pendingDelta = '';
    };
    const queueChunk = (delta) => {
      pendingDelta += delta;
      if (!flushTimer) flushTimer = setTimeout(flush, 30);
    };

    (async () => {
      try {
        if (settings.persistHistory) {
          try {
            history.addMessage({ id: request.messageId, role: 'user', content: request.text, timestamp: now(), model }, { truncate: true });
          } catch (histErr) {
            console.warn('[KI] Historie konnte Nutzer-Nachricht nicht speichern:', histErr?.message || histErr);
          }
        }
        const currentProject = typeof getCurrentProject === 'function' ? getCurrentProject() : null;
        const projectPath = currentProject?.path || null;

        let wikiStructure = '';
        if (projectPath) {
          try {
            wikiStructure = aiContext.buildWikiStructureSnapshot(projectPath);
          } catch (err) {
            console.warn('[KI] Wiki-Struktur konnte nicht geladen werden:', err);
          }
        }

        const activeNoteContext = aiContext.formatActiveNoteContext(request.activeNote);
        const contextData = {
          wikiStructure,
          activeNoteContext
        };

        const recentHistory = (history.getHistory() || [])
          .filter(msg => msg.id !== request.messageId)
          .slice(-6);

        const tools = projectPath ? AI_TOOLS_DEFINITIONS : [];
        const executeTool = projectPath
          ? (name, args) => executeAiTool(projectPath, name, args)
          : null;

        const result = await ollamaClient.streamChat({
          host: settings.host,
          model,
          mode,
          text: request.text,
          contextData,
          historyMessages: recentHistory,
          temperature,
          contextSize,
          signal: controller.signal,
          tools,
          executeTool,
          onToolCall: (toolCall) => {
            sendToMainWindow('ai:stream-tool-call', {
              messageId: request.messageId,
              tool: toolCall.name,
              args: toolCall.args
            });
          },
          onToolResult: ({ name, args, result }) => {
            if (result?.data?.proposalId) {
              sendToMainWindow('ai:stream-proposal', {
                messageId: request.messageId,
                proposal: result.data
              });
            } else if (Array.isArray(result?.data?.proposals)) {
              for (const proposal of result.data.proposals) {
                sendToMainWindow('ai:stream-proposal', {
                  messageId: request.messageId,
                  proposal
                });
              }
            } else if (name === 'open_note' && result?.data?.opened === true && result.data.relPath) {
              // Reine Navigation, kein Proposal (Funktionsvertrag Block 1,
              // Punkt 7): die eigentliche Navigation samt Dirty-Editor-Schutz
              // läuft ausschließlich im Renderer über den bestehenden
              // navigateTo()/canLeaveCurrentRoute()-Weg (siehe ai-chat.js/
              // app.js onOpenNote) — hier wird nur der bereits sicher
              // aufgelöste Zielpfad übergeben.
              sendToMainWindow('ai:stream-navigate', {
                messageId: request.messageId,
                relPath: result.data.relPath,
                title: result.data.title || '',
                category: result.data.category || ''
              });
            }
          },
          onChunk: queueChunk
        });
        flush();
        if (settings.persistHistory) {
          try {
            history.addMessage({ id: `${request.messageId}:assistant`, role: 'assistant', content: result.fullText, timestamp: now(), model }, { truncate: true });
          } catch (histErr) {
            console.warn('[KI] Historie konnte Assistent-Antwort nicht speichern:', histErr?.message || histErr);
          }
        }
        sendToMainWindow('ai:stream-end', { messageId: request.messageId, fullText: result.fullText, stats: result.stats });
      } catch (error) {
        flush();
        const clean = ollamaClient.friendlyError(error);
        sendToMainWindow('ai:stream-error', {
          messageId: request.messageId,
          success: false,
          error: clean.message,
          category: clean.category || 'unknown',
          code: clean.code || 'AI_STREAM_ERROR'
        });
      } finally {
        if (flushTimer) clearTimeout(flushTimer);
        activeRequests.delete(request.messageId);
      }
    })();

    return { started: true, messageId: request.messageId };
  });

  const instance = { activeRequests, abortAllRequests };
  activeAiIpcInstances.add(instance);
  return instance;
}

const activeAiIpcInstances = new Set();

function abortAllAiRequests() {
  for (const instance of activeAiIpcInstances) {
    try { instance.abortAllRequests(); } catch {}
  }
}

module.exports = {
  DEFAULT_SETTINGS,
  invalidArgument,
  sanitizeIpcError,
  validateSettingsPatch,
  validateSendRequest,
  resolveSettings,
  registerAiIpc,
  abortAllAiRequests
};
