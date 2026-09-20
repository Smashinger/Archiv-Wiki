'use strict';

const appState = require('./app-state');

const MAX_HISTORY_MESSAGES = 50;
const ROLES = new Set(['user', 'assistant']);

function sanitizeMessage(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
  if (typeof message.id !== 'string' || !message.id || message.id.length > 200) return null;
  if (!ROLES.has(message.role) || typeof message.content !== 'string') return null;
  if (typeof message.timestamp !== 'string' || !Number.isFinite(Date.parse(message.timestamp))) return null;
  if (message.model !== undefined && (typeof message.model !== 'string' || !message.model || message.model.length > 200)) return null;
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    ...(message.model ? { model: message.model } : {})
  };
}

function createAiHistory({
  readState = appState.readAppState,
  writeState = appState.writeAppState
} = {}) {
  function getHistory() {
    const stored = readState()?.aiHistory;
    if (!Array.isArray(stored)) return [];
    return stored.map(sanitizeMessage).filter(Boolean).slice(-MAX_HISTORY_MESSAGES);
  }

  function addMessage(message) {
    const clean = sanitizeMessage(message);
    if (!clean) {
      const error = new TypeError('Ungültige KI-Historiennachricht.');
      error.code = 'AI_HISTORY_INVALID';
      throw error;
    }
    const next = [...getHistory(), clean].slice(-MAX_HISTORY_MESSAGES);
    writeState({ aiHistory: next });
    return clean;
  }

  function clearHistory() {
    writeState({ aiHistory: [] });
    return { success: true };
  }

  return { getHistory, addMessage, clearHistory };
}

const defaultHistory = createAiHistory();

module.exports = {
  MAX_HISTORY_MESSAGES,
  sanitizeMessage,
  createAiHistory,
  getHistory: defaultHistory.getHistory,
  addMessage: defaultHistory.addMessage,
  clearHistory: defaultHistory.clearHistory
};
