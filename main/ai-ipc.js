'use strict';

const { ipcMain } = require('electron');
const appState = require('./app-state');
const ollama = require('./ai-ollama');
const { createAiHistory } = require('./ai-history');
const { AI_TOOLS_DEFINITIONS, executeAiTool } = require('./ai-tools');

const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  host: ollama.DEFAULT_HOST,
  defaultModel: 'phi:2.7b',
  temperature: 0.7,
  contextSize: 4096,
  persistHistory: true,
  mode: 'safe'
});

const SETTING_KEYS = new Set(Object.keys(DEFAULT_SETTINGS));
const HOST_ARGUMENT_KEYS = new Set(['host']);
const SEND_ARGUMENT_KEYS = new Set(['messageId', 'model', 'text', 'options', 'mode']);
const OPTION_KEYS = new Set(['temperature', 'contextSize', 'mode']);

function invalidArgument(message = 'Ungültige Argumente für KI-IPC.') {
  const error = new TypeError(message);
  error.code = 'IPC_ARGUMENT_INVALID';
  return error;
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
  catch { throw invalidArgument('Ungültige Ollama-Server-URL.'); }
}

function validateSettingsPatch(patch) {
  requireAllowedKeys(patch, SETTING_KEYS);
  const clean = {};
  if ('enabled' in patch) {
    if (typeof patch.enabled !== 'boolean') throw invalidArgument();
    clean.enabled = patch.enabled;
  }
  if ('host' in patch) clean.host = validateHost(patch.host);
  if ('defaultModel' in patch) {
    if (typeof patch.defaultModel !== 'string' || !patch.defaultModel.trim() || patch.defaultModel.length > 200) throw invalidArgument();
    clean.defaultModel = patch.defaultModel;
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
  if (request.model !== undefined && (typeof request.model !== 'string' || !request.model.trim() || request.model.length > 200)) throw invalidArgument();
  if (request.mode !== undefined && (typeof request.mode !== 'string' || !['safe', 'auto', 'plan'].includes(request.mode))) throw invalidArgument('Ungültiger KI-Modus.');
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
    options
  };
}

function validateMessageIdArgument(args) {
  if (args.length !== 1) throw invalidArgument();
  requireAllowedKeys(args[0], new Set(['messageId']));
  if (typeof args[0].messageId !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/.test(args[0].messageId)) throw invalidArgument();
  return args[0].messageId;
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

  const noArguments = args => {
    if (args.length !== 0) throw invalidArgument();
  };

  handle('ai:checkConnection', validateOptionalHostArgument, async (_event, input) => {
    const settings = resolveSettings(readState);
    try { return await ollamaClient.checkConnection({ host: input.host || settings.host }); }
    catch (error) { return { online: false, error: ollamaClient.friendlyError(error).message }; }
  });

  handle('ai:getModels', validateOptionalHostArgument, async (_event, input) => {
    const settings = resolveSettings(readState);
    try { return { success: true, models: await ollamaClient.getModels({ host: input.host || settings.host }) }; }
    catch (error) { return { success: false, models: [], error: ollamaClient.friendlyError(error).message }; }
  });

  handle('ai:getHistory', noArguments, () => history.getHistory());
  handle('ai:clearHistory', noArguments, () => history.clearHistory());
  handle('ai:getSettings', noArguments, () => resolveSettings(readState));
  handle('ai:updateSettings', args => {
    if (args.length !== 1) throw invalidArgument();
    return validateSettingsPatch(args[0]);
  }, (_event, patch) => {
    const next = { ...resolveSettings(readState), ...patch };
    writeState({ aiSettings: next });
    return next;
  });

  handle('ai:abort', validateMessageIdArgument, (_event, messageId) => {
    const controller = activeRequests.get(messageId);
    if (!controller) return { aborted: false };
    controller.abort();
    return { aborted: true };
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
          history.addMessage({ id: request.messageId, role: 'user', content: request.text, timestamp: now(), model });
        }
        const currentProject = typeof getCurrentProject === 'function' ? getCurrentProject() : null;
        const projectPath = currentProject?.path || null;

        const tools = projectPath ? AI_TOOLS_DEFINITIONS : [];
        const executeTool = projectPath
          ? (name, args) => executeAiTool(projectPath, name, args)
          : null;

        const result = await ollamaClient.streamChat({
          host: settings.host,
          model,
          mode,
          text: request.text,
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
          onChunk: queueChunk
        });
        flush();
        if (settings.persistHistory) {
          history.addMessage({ id: `${request.messageId}:assistant`, role: 'assistant', content: result.fullText, timestamp: now(), model });
        }
        sendToMainWindow('ai:stream-end', { messageId: request.messageId, fullText: result.fullText, stats: result.stats });
      } catch (error) {
        flush();
        const clean = ollamaClient.friendlyError(error);
        sendToMainWindow('ai:stream-error', {
          messageId: request.messageId,
          error: clean.message,
          category: clean.category || 'unknown'
        });
      } finally {
        if (flushTimer) clearTimeout(flushTimer);
        activeRequests.delete(request.messageId);
      }
    })();

    return { started: true, messageId: request.messageId };
  });

  return { activeRequests };
}

module.exports = {
  DEFAULT_SETTINGS,
  invalidArgument,
  validateSettingsPatch,
  validateSendRequest,
  resolveSettings,
  registerAiIpc
};
