'use strict';

const appState = require('./app-state');

const MAX_HISTORY_MESSAGES = 50;
const MAX_HISTORY_MESSAGE_BYTES = 32 * 1024; // 32 KB pro Nachricht
const MAX_HISTORY_MESSAGE_CHARS = MAX_HISTORY_MESSAGE_BYTES; // Rückwärtskompatibilität
const TRUNCATION_SUFFIX = '\n… [Historie gekürzt]';
const ROLES = new Set(['user', 'assistant']);

function truncateMessageContent(str, maxBytes = MAX_HISTORY_MESSAGE_BYTES) {
  if (typeof str !== 'string') return '';
  if (Buffer.byteLength(str, 'utf8') <= maxBytes) return str;
  const suffixBytes = Buffer.byteLength(TRUNCATION_SUFFIX, 'utf8');
  const budget = Math.max(0, maxBytes - suffixBytes);
  let currentBytes = 0;
  let result = '';
  for (const char of str) {
    const charBytes = Buffer.byteLength(char, 'utf8');
    if (currentBytes + charBytes > budget) break;
    result += char;
    currentBytes += charBytes;
  }
  return result + TRUNCATION_SUFFIX;
}

function sanitizeMessage(message, { truncate = false } = {}) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
  if (typeof message.id !== 'string' || !message.id || message.id.length > 200) return null;
  if (!ROLES.has(message.role) || typeof message.content !== 'string') return null;
  if (typeof message.timestamp !== 'string' || !Number.isFinite(Date.parse(message.timestamp))) return null;
  if (message.model !== undefined && (typeof message.model !== 'string' || !message.model || message.model.length > 200)) return null;

  let content = message.content;
  if (Buffer.byteLength(content, 'utf8') > MAX_HISTORY_MESSAGE_BYTES) {
    if (truncate) {
      content = truncateMessageContent(content, MAX_HISTORY_MESSAGE_BYTES);
    } else {
      return null;
    }
  }

  return {
    id: message.id,
    role: message.role,
    content,
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

  function addMessage(message, options = {}) {
    const clean = sanitizeMessage(message, options);
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
  MAX_HISTORY_MESSAGE_BYTES,
  MAX_HISTORY_MESSAGE_CHARS,
  truncateMessageContent,
  sanitizeMessage,
  createAiHistory,
  getHistory: defaultHistory.getHistory,
  addMessage: defaultHistory.addMessage,
  clearHistory: defaultHistory.clearHistory
};
