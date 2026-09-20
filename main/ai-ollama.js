'use strict';

const http = require('node:http');
const https = require('node:https');

const DEFAULT_HOST = 'http://127.0.0.1:11434';
const TAGS_TIMEOUT_MS = 5_000;
const CHAT_IDLE_TIMEOUT_MS = 30_000;
const SYSTEM_PROMPT = 'Du bist der integrierte KI-Assistent von Archiv-Wiki. Antworte stets präzise, sachlich, auf Deutsch und formatiere deine Antworten in sauberem Markdown. Du hast über Werkzeuge Zugriff auf die Notizen des Nutzers im aktuellen Wiki. Wenn der Nutzer nach Notizen, Inhalten, Rezepten oder Projekten fragt, nutze die bereitgestellten Werkzeuge (search_notes, read_note, list_notes), um verlässliche Antworten zu geben. Erfinde keine Notizen.';

class OllamaError extends Error {
  constructor(message, category = 'unknown', cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'OllamaError';
    this.category = category;
    if (cause?.code) this.code = cause.code;
  }
}

function normalizeHost(host = DEFAULT_HOST) {
  if (typeof host !== 'string' || host.length > 2048 || host.trim() !== host || host === '') {
    throw new OllamaError('Die Ollama-Server-URL ist ungültig.', 'connection');
  }
  let url;
  try { url = new URL(host); }
  catch { throw new OllamaError('Die Ollama-Server-URL ist ungültig.', 'connection'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new OllamaError('Die Ollama-Server-URL ist ungültig.', 'connection');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

function endpointUrl(host, pathname) {
  const base = new URL(`${normalizeHost(host)}/`);
  return new URL(pathname.replace(/^\//, ''), base);
}

function friendlyError(error) {
  if (error instanceof OllamaError) return error;
  if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
    return new OllamaError('Antwort wurde gestoppt.', 'aborted', error);
  }
  if (error?.code === 'ETIMEDOUT') {
    return new OllamaError('Zeitüberschreitung: Ollama hat nicht rechtzeitig geantwortet.', 'timeout', error);
  }
  if (['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH'].includes(error?.code)) {
    return new OllamaError('Ollama ist nicht erreichbar. Bitte stelle sicher, dass Ollama lokal gestartet ist (`ollama serve`).', 'connection', error);
  }
  return new OllamaError(error?.message || 'Unbekannter Ollama-Fehler.', 'unknown', error);
}

function httpError(statusCode, body) {
  const detail = String(body || '').slice(0, 4096);
  if (statusCode === 404 && /model|not found/i.test(detail)) {
    return new OllamaError('Das Modell ist nicht installiert. Führe im Terminal `ollama run <modell>` aus.', 'model_not_found');
  }
  if (/context|num_ctx|token/i.test(detail) && /(exceed|overflow|too large|maximum)/i.test(detail)) {
    return new OllamaError('Der Kontext ist für das gewählte Modell zu groß.', 'context_overflow');
  }
  return new OllamaError(`Ollama antwortete mit HTTP ${statusCode}.`, 'unknown');
}

function requestJson({ host, pathname, timeoutMs = TAGS_TIMEOUT_MS, signal }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(friendlyError(error));
    };
    let url;
    try { url = endpointUrl(host, pathname); }
    catch (error) { fail(error); return; }
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(url, { method: 'GET', signal, headers: { accept: 'application/json' } }, (res) => {
      const parts = [];
      let size = 0;
      res.setTimeout(timeoutMs, () => {
        const error = new Error('timeout');
        error.code = 'ETIMEDOUT';
        res.destroy(error);
      });
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) {
          res.destroy(new OllamaError('Ollama-Antwort ist unerwartet groß.', 'unknown'));
          return;
        }
        parts.push(chunk);
      });
      res.on('error', fail);
      res.on('end', () => {
        if (settled) return;
        const body = Buffer.concat(parts).toString('utf8');
        if (res.statusCode < 200 || res.statusCode >= 300) { fail(httpError(res.statusCode, body)); return; }
        try {
          const parsed = JSON.parse(body);
          settled = true;
          resolve(parsed);
        } catch (error) {
          fail(new OllamaError('Ollama hat ungültiges JSON geliefert.', 'unknown', error));
        }
      });
    });
    req.setTimeout(timeoutMs, () => {
      const error = new Error('timeout');
      error.code = 'ETIMEDOUT';
      req.destroy(error);
    });
    req.on('error', fail);
    req.end();
  });
}

async function getModels({ host = DEFAULT_HOST, signal, timeoutMs = TAGS_TIMEOUT_MS } = {}) {
  const payload = await requestJson({ host, pathname: '/api/tags', signal, timeoutMs });
  if (!payload || !Array.isArray(payload.models)) {
    throw new OllamaError('Ollama hat keine gültige Modell-Liste geliefert.', 'unknown');
  }
  return payload.models.map((model) => ({
    name: typeof model?.name === 'string' ? model.name : '',
    size: Number.isFinite(model?.size) && model.size >= 0 ? model.size : 0,
    modified_at: typeof model?.modified_at === 'string' ? model.modified_at : '',
    ...(typeof model?.details?.parameter_size === 'string' ? { parameter_size: model.details.parameter_size } : {})
  })).filter(model => model.name);
}

async function checkConnection({ host = DEFAULT_HOST, signal, timeoutMs = TAGS_TIMEOUT_MS } = {}) {
  const startedAt = Date.now();
  const payload = await requestJson({ host, pathname: '/api/version', signal, timeoutMs });
  return {
    online: true,
    ...(typeof payload?.version === 'string' ? { version: payload.version } : {}),
    latencyMs: Date.now() - startedAt
  };
}

function executeChatTurn({
  host = DEFAULT_HOST,
  model,
  messages,
  tools = [],
  temperature = 0.7,
  contextSize = 4096,
  signal,
  onChunk = () => {},
  idleTimeoutMs = CHAT_IDLE_TIMEOUT_MS
}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let response = null;
    let turnText = '';
    let buffer = '';
    let finalRecord = null;
    const toolCalls = [];

    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(friendlyError(error));
    };

    let url;
    try { url = endpointUrl(host, '/api/chat'); }
    catch (error) { fail(error); return; }

    const bodyObj = {
      model,
      messages,
      stream: true,
      options: { temperature, num_ctx: contextSize }
    };
    if (Array.isArray(tools) && tools.length > 0) {
      bodyObj.tools = tools;
    }
    const body = JSON.stringify(bodyObj);
    const transport = url.protocol === 'https:' ? https : http;

    const consumeLine = (line) => {
      if (!line.trim()) return;
      let record;
      try { record = JSON.parse(line); }
      catch (error) { throw new OllamaError('Ollama hat einen ungültigen Stream geliefert.', 'unknown', error); }
      if (record.error) throw httpError(response?.statusCode || 500, record.error);

      const delta = record?.message?.content;
      if (typeof delta === 'string' && delta) {
        turnText += delta;
        onChunk(delta);
      }

      const rawToolCalls = record?.message?.tool_calls;
      if (Array.isArray(rawToolCalls) && rawToolCalls.length > 0) {
        for (const tc of rawToolCalls) {
          const serialized = JSON.stringify(tc);
          if (!toolCalls.some(existing => JSON.stringify(existing) === serialized)) {
            toolCalls.push(tc);
          }
        }
      }

      if (record.done === true) finalRecord = record;
    };

    const req = transport.request(url, {
      method: 'POST',
      signal,
      headers: {
        accept: 'application/x-ndjson',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body)
      }
    }, (res) => {
      response = res;
      if (res.statusCode < 200 || res.statusCode >= 300) {
        const parts = [];
        res.on('data', chunk => parts.push(chunk));
        res.on('error', fail);
        res.on('end', () => fail(httpError(res.statusCode, Buffer.concat(parts).toString('utf8'))));
        return;
      }
      res.setEncoding('utf8');
      res.setTimeout(idleTimeoutMs, () => {
        const error = new Error('timeout');
        error.code = 'ETIMEDOUT';
        res.destroy(error);
      });
      res.on('data', (chunk) => {
        if (settled) return;
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop();
        try { for (const line of lines) consumeLine(line); }
        catch (error) { res.destroy(); fail(error); }
      });
      res.on('error', fail);
      res.on('end', () => {
        if (settled) return;
        try { consumeLine(buffer); }
        catch (error) { fail(error); return; }
        if (!finalRecord) { fail(new OllamaError('Ollama hat den Stream vorzeitig beendet.', 'unknown')); return; }
        settled = true;
        resolve({
          turnText,
          toolCalls,
          finalRecord
        });
      });
    });
    req.setTimeout(idleTimeoutMs, () => {
      const error = new Error('timeout');
      error.code = 'ETIMEDOUT';
      req.destroy(error);
    });
    req.on('error', fail);
    req.end(body);
  });
}

async function streamChat({
  host = DEFAULT_HOST,
  model,
  text,
  temperature = 0.7,
  contextSize = 4096,
  signal,
  tools = [],
  executeTool = null,
  onToolCall = () => {},
  onChunk = () => {},
  idleTimeoutMs = CHAT_IDLE_TIMEOUT_MS
}) {
  if (typeof model !== 'string' || !model.trim() || typeof text !== 'string' || !text.trim()) {
    throw new OllamaError('Modell und Nachricht müssen angegeben werden.', 'unknown');
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: text }
  ];

  let fullText = '';
  let finalStats = {};
  const maxTurns = 4;

  for (let turn = 0; turn < maxTurns; turn++) {
    if (signal?.aborted) {
      throw friendlyError(new Error('AbortError'));
    }

    const { turnText, toolCalls, finalRecord } = await executeChatTurn({
      host,
      model,
      messages,
      tools,
      temperature,
      contextSize,
      signal,
      onChunk,
      idleTimeoutMs
    });

    if (turnText) {
      fullText = (fullText ? fullText + '\n\n' : '') + turnText;
    }

    if (finalRecord) {
      finalStats = {
        ...(Number.isFinite(finalRecord.eval_count) ? { evalCount: finalRecord.eval_count } : {}),
        ...(Number.isFinite(finalRecord.total_duration) ? { totalDurationMs: finalRecord.total_duration / 1_000_000 } : {})
      };
    }

    if (!toolCalls || toolCalls.length === 0 || typeof executeTool !== 'function') {
      break;
    }

    messages.push({
      role: 'assistant',
      content: turnText || '',
      tool_calls: toolCalls
    });

    for (const call of toolCalls) {
      const fnName = call?.function?.name;
      let fnArgs = call?.function?.arguments;
      if (typeof fnArgs === 'string') {
        try { fnArgs = JSON.parse(fnArgs); } catch { fnArgs = {}; }
      }
      if (!fnArgs || typeof fnArgs !== 'object') {
        fnArgs = {};
      }
      onToolCall({ name: fnName, args: fnArgs });

      let toolResult;
      try {
        toolResult = await executeTool(fnName, fnArgs);
      } catch (err) {
        toolResult = { error: err?.message || 'Fehler bei der Werkzeugausführung.' };
      }

      messages.push({
        role: 'tool',
        content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
      });
    }
  }

  return {
    done: true,
    fullText,
    stats: finalStats
  };
}

module.exports = {
  DEFAULT_HOST,
  TAGS_TIMEOUT_MS,
  CHAT_IDLE_TIMEOUT_MS,
  SYSTEM_PROMPT,
  OllamaError,
  normalizeHost,
  friendlyError,
  getModels,
  checkConnection,
  executeChatTurn,
  streamChat
};
