'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ollama = require('../main/ai-ollama');
const { createAiHistory, MAX_HISTORY_MESSAGES } = require('../main/ai-history');
const { registerAiIpc } = require('../main/ai-ipc');

const root = path.join(__dirname, '..');
const testHome = path.join(root, '.Codex-test-home');

function makeIsolatedState(t) {
  fs.mkdirSync(testHome, { recursive: true });
  const directory = fs.mkdtempSync(path.join(testHome, 'ai-test-'));
  const file = path.join(directory, 'state.json');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return {
    read() {
      try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
      catch { return {}; }
    },
    write(patch) {
      const next = { ...this.read(), ...patch };
      fs.writeFileSync(file, JSON.stringify(next), 'utf8');
      return next;
    }
  };
}

async function startMockServer(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const address = server.address();
  return { server, host: `http://127.0.0.1:${address.port}` };
}

function waitFor(predicate, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      const result = predicate();
      if (result) { resolve(result); return; }
      if (Date.now() - started >= timeoutMs) { reject(new Error('Test-Timeout')); return; }
      setTimeout(poll, 10);
    };
    poll();
  });
}

test('KI 1: GET /api/tags liefert eine normalisierte Modell-Liste', async t => {
  const { host } = await startMockServer(t, (req, res) => {
    assert.equal(req.method, 'GET');
    assert.equal(req.url, '/api/tags');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ models: [{
      name: 'phi:2.7b',
      size: 1234,
      modified_at: '2026-09-20T12:00:00Z',
      details: { parameter_size: '2.7B' }
    }] }));
  });

  assert.deepEqual(await ollama.getModels({ host }), [{
    name: 'phi:2.7b',
    size: 1234,
    modified_at: '2026-09-20T12:00:00Z',
    parameter_size: '2.7B'
  }]);
});

test('KI 2: POST /api/chat verarbeitet NDJSON-Chunks bis done=true', async t => {
  const { host } = await startMockServer(t, (req, res) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/api/chat');
    let requestBody = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { requestBody += chunk; });
    req.on('end', () => {
      const payload = JSON.parse(requestBody);
      assert.equal(payload.model, 'phi:2.7b');
      assert.equal(payload.stream, true);
      assert.equal(payload.messages.at(-1).content, 'Hallo');
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.write(`${JSON.stringify({ message: { content: 'Guten ' }, done: false })}\n`);
      res.write(`${JSON.stringify({ message: { content: 'Tag' }, done: false })}\n`);
      res.end(`${JSON.stringify({ message: { content: '!' }, done: true, eval_count: 3, total_duration: 4_000_000 })}\n`);
    });
  });
  const chunks = [];
  const result = await ollama.streamChat({ host, model: 'phi:2.7b', text: 'Hallo', onChunk: chunk => chunks.push(chunk) });

  assert.deepEqual(chunks, ['Guten ', 'Tag', '!']);
  assert.deepEqual(result, { done: true, fullText: 'Guten Tag!', stats: { evalCount: 3, totalDurationMs: 4 } });
});

test('KI 3: ECONNREFUSED wird als verständlicher Verbindungsfehler klassifiziert', async () => {
  await assert.rejects(
    ollama.getModels({ host: 'http://127.0.0.1:1', timeoutMs: 250 }),
    error => error?.category === 'connection' && /Ollama ist nicht erreichbar/.test(error.message)
  );
});

test('KI 4: Historie rotiert strikt nach FIFO und behält maximal 50 Nachrichten', t => {
  const state = makeIsolatedState(t);
  const history = createAiHistory({ readState: () => state.read(), writeState: patch => state.write(patch) });
  for (let index = 0; index < MAX_HISTORY_MESSAGES + 7; index += 1) {
    history.addMessage({
      id: `msg-${index}`,
      role: index % 2 ? 'assistant' : 'user',
      content: `Inhalt ${index}`,
      timestamp: new Date(1_700_000_000_000 + index).toISOString()
    });
  }

  const stored = history.getHistory();
  assert.equal(stored.length, 50);
  assert.equal(stored[0].id, 'msg-7');
  assert.equal(stored.at(-1).id, 'msg-56');
  assert.deepEqual(history.clearHistory(), { success: true });
  assert.deepEqual(history.getHistory(), []);
});

test('KI 5: ai:abort beendet einen laufenden Ollama-HTTP-Stream', async t => {
  let requestClosed = false;
  const { host } = await startMockServer(t, (req, res) => {
    req.on('close', () => { requestClosed = true; });
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    res.write(`${JSON.stringify({ message: { content: 'Beginn' }, done: false })}\n`);
  });
  const handlers = new Map();
  const events = [];
  const state = { aiSettings: { host, enabled: true } };
  registerAiIpc({
    getMainWindow: () => ({
      isDestroyed: () => false,
      webContents: { send: (channel, payload) => events.push({ channel, payload }) }
    }),
    ipcMainApi: { handle: (channel, handler) => handlers.set(channel, handler) },
    isTrustedSender: event => event?.trusted === true,
    readState: () => state,
    writeState: patch => Object.assign(state, patch)
  });
  const event = { trusted: true };

  assert.deepEqual(await handlers.get('ai:sendMessage')(event, {
    messageId: 'abort-test',
    model: 'phi:2.7b',
    text: 'Bitte lange antworten'
  }), { started: true, messageId: 'abort-test' });
  await waitFor(() => events.find(entry => entry.channel === 'ai:stream-chunk'));
  assert.deepEqual(await handlers.get('ai:abort')(event, { messageId: 'abort-test' }), { aborted: true });
  const streamError = await waitFor(() => events.find(entry => entry.channel === 'ai:stream-error'));

  assert.equal(streamError.payload.messageId, 'abort-test');
  assert.equal(streamError.payload.category, 'aborted');
  assert.match(streamError.payload.error, /gestoppt/);
  await waitFor(() => requestClosed);
});

test('KI-IPC weist fremde Sender und zusätzliche Argumentfelder fail-closed ab', () => {
  const handlers = new Map();
  registerAiIpc({
    getMainWindow: () => null,
    ipcMainApi: { handle: (channel, handler) => handlers.set(channel, handler) },
    isTrustedSender: event => event?.trusted === true,
    readState: () => ({}),
    writeState: () => ({})
  });

  assert.throws(
    () => handlers.get('ai:getHistory')({ trusted: false }),
    error => error?.code === 'IPC_SENDER_INVALID'
  );
  assert.throws(
    () => handlers.get('ai:sendMessage')({ trusted: true }, { messageId: 'x', text: 'Hallo', shell: true }),
    error => error?.code === 'IPC_ARGUMENT_INVALID'
  );
  assert.throws(
    () => handlers.get('ai:updateSettings')({ trusted: true }, { host: 'file:///etc/passwd' }),
    error => error?.code === 'IPC_ARGUMENT_INVALID'
  );
});

test('KI 6: streamChat führt tool_calls rekursiv aus und reicht Tool-Ergebnisse an Ollama weiter', async t => {
  let turnCount = 0;
  const toolCallsReported = [];

  const { host } = await startMockServer(t, (req, res) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/api/chat');
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      turnCount += 1;
      const body = JSON.parse(raw);
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });

      if (turnCount === 1) {
        assert.equal(body.messages.length, 2);
        assert.equal(body.tools.length, 1);
        res.write(`${JSON.stringify({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [{
              function: {
                name: 'search_notes',
                arguments: { query: 'Kuchen' }
              }
            }]
          },
          done: true
        })}\n`);
        res.end();
      } else if (turnCount === 2) {
        assert.equal(body.messages.length, 4);
        assert.equal(body.messages[2].role, 'assistant');
        assert.equal(body.messages[2].tool_calls[0].function.name, 'search_notes');
        assert.equal(body.messages[3].role, 'tool');
        assert.match(body.messages[3].content, /Käsekuchen/);

        res.write(`${JSON.stringify({
          message: { content: 'Ich habe das Rezept für Käsekuchen gefunden.' },
          done: false
        })}\n`);
        res.end(`${JSON.stringify({
          done: true,
          eval_count: 8,
          total_duration: 10_000_000
        })}\n`);
      }
    });
  });

  const executedTools = [];
  const result = await ollama.streamChat({
    host,
    model: 'phi:2.7b',
    text: 'Such nach Kuchen',
    tools: [{ type: 'function', function: { name: 'search_notes' } }],
    executeTool: async (name, args) => {
      executedTools.push({ name, args });
      return { matches: ['Käsekuchen.md'] };
    },
    onToolCall: (call) => toolCallsReported.push(call)
  });

  assert.equal(turnCount, 2);
  assert.deepEqual(executedTools, [{ name: 'search_notes', args: { query: 'Kuchen' } }]);
  assert.deepEqual(toolCallsReported, [{ name: 'search_notes', args: { query: 'Kuchen' } }]);
  assert.equal(result.fullText, 'Ich habe das Rezept für Käsekuchen gefunden.');
  assert.equal(result.stats.evalCount, 8);
  assert.equal(result.stats.totalDurationMs, 10);
});

test('KI 7: registerAiIpc sendet ai:stream-tool-call Event an das Hauptfenster', async () => {
  const handlers = new Map();
  const events = [];
  const state = { aiSettings: { host: 'http://127.0.0.1:11434', enabled: true } };

  const mockOllama = {
    DEFAULT_HOST: 'http://127.0.0.1:11434',
    normalizeHost: ollama.normalizeHost,
    friendlyError: ollama.friendlyError,
    streamChat: async ({ onToolCall, onChunk, tools, executeTool }) => {
      assert.ok(Array.isArray(tools) && tools.length > 0);
      assert.equal(typeof executeTool, 'function');
      onToolCall({ name: 'search_notes', args: { query: 'Schoko' } });
      onChunk('Gefunden: ');
      return { done: true, fullText: 'Gefunden: Schoko', stats: {} };
    }
  };

  registerAiIpc({
    getCurrentProject: () => ({ path: '/tmp/test-project' }),
    getMainWindow: () => ({
      isDestroyed: () => false,
      webContents: { send: (channel, payload) => events.push({ channel, payload }) }
    }),
    ipcMainApi: { handle: (channel, handler) => handlers.set(channel, handler) },
    isTrustedSender: event => event?.trusted === true,
    ollamaClient: mockOllama,
    readState: () => state,
    writeState: patch => Object.assign(state, patch)
  });

  const event = { trusted: true };
  const sendRes = await handlers.get('ai:sendMessage')(event, {
    messageId: 'tool-call-test',
    model: 'phi:2.7b',
    text: 'Finde Schoko'
  });
  assert.deepEqual(sendRes, { started: true, messageId: 'tool-call-test' });

  await waitFor(() => events.find(e => e.channel === 'ai:stream-end'));

  const toolCallEvent = events.find(e => e.channel === 'ai:stream-tool-call');
  assert.ok(toolCallEvent, 'ai:stream-tool-call muss gesendet werden');
  assert.equal(toolCallEvent.payload.messageId, 'tool-call-test');
  assert.equal(toolCallEvent.payload.tool, 'search_notes');
  assert.deepEqual(toolCallEvent.payload.args, { query: 'Schoko' });
});

test('KI 8: getSystemPrompt liefert modusspezifische Instruktionen für safe, auto und plan', () => {
  const safePrompt = ollama.getSystemPrompt('safe');
  assert.match(safePrompt, /Safe-Modus aktiv/);

  const autoPrompt = ollama.getSystemPrompt('auto');
  assert.match(autoPrompt, /Auto-Modus aktiv/);
  assert.match(autoPrompt, /mehrere Werkzeuge nacheinander/);

  const planPrompt = ollama.getSystemPrompt('plan');
  assert.match(planPrompt, /Plan-Modus aktiv/);
  assert.match(planPrompt, /Schritt-für-Schritt-Plan/);
});

test('KI 9: streamChat AgentLoopGuard fängt wiederholte identische Tool-Aufrufe ab', async t => {
  let turnCount = 0;
  const { host } = await startMockServer(t, (req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      turnCount += 1;
      const body = JSON.parse(raw);
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });

      if (turnCount === 1) {
        // Erste Runde: Modell ruft search_notes auf
        res.write(`${JSON.stringify({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [{ function: { name: 'search_notes', arguments: { query: 'Endlos' } } }]
          },
          done: true
        })}\n`);
        res.end();
      } else if (turnCount === 2) {
        // Zweite Runde: Modell ruft versehentlich EXAKT dasselbe Tool mit denselben Args erneut auf
        assert.equal(body.messages.at(-1).role, 'tool');
        res.write(`${JSON.stringify({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [{ function: { name: 'search_notes', arguments: { query: 'Endlos' } } }]
          },
          done: true
        })}\n`);
        res.end();
      } else if (turnCount === 3) {
        // Dritte Runde: Modell erhält die Warnung des Loop-Guards und beendet
        const lastToolMsg = body.messages.at(-1);
        assert.equal(lastToolMsg.role, 'tool');
        assert.match(lastToolMsg.content, /bereits mit identischen Argumenten ausgeführt/);

        res.write(`${JSON.stringify({
          message: { content: 'Zusammenfassung ohne weiteren Aufruf.' },
          done: false
        })}\n`);
        res.end(`${JSON.stringify({ done: true })}\n`);
      }
    });
  });

  let toolExecutionCount = 0;
  const result = await ollama.streamChat({
    host,
    model: 'phi:2.7b',
    text: 'Finde Notizen',
    tools: [{ type: 'function', function: { name: 'search_notes' } }],
    executeTool: async () => {
      toolExecutionCount += 1;
      return { found: true };
    }
  });

  assert.equal(toolExecutionCount, 1, 'Tool darf bei Duplikataufruf vom LoopGuard nicht erneut ausgeführt werden');
  assert.equal(turnCount, 3);
  assert.match(result.fullText, /Zusammenfassung ohne weiteren Aufruf/);
});

test('KI 10: KI-IPC validiert Betriebsmodus und weist ungültige Modi fail-closed ab', async () => {
  const handlers = new Map();
  let receivedMode = null;
  const state = { aiSettings: { host: 'http://127.0.0.1:11434', enabled: true, mode: 'safe' } };

  const mockOllama = {
    DEFAULT_HOST: 'http://127.0.0.1:11434',
    normalizeHost: ollama.normalizeHost,
    friendlyError: ollama.friendlyError,
    streamChat: async ({ mode, onChunk }) => {
      receivedMode = mode;
      onChunk('Antwort');
      return { done: true, fullText: 'Antwort', stats: {} };
    }
  };

  registerAiIpc({
    getCurrentProject: () => null,
    getMainWindow: () => ({
      isDestroyed: () => false,
      webContents: { send: () => {} }
    }),
    ipcMainApi: { handle: (channel, handler) => handlers.set(channel, handler) },
    isTrustedSender: event => event?.trusted === true,
    ollamaClient: mockOllama,
    readState: () => state,
    writeState: patch => Object.assign(state, patch)
  });

  const event = { trusted: true };

  // Gültige Modi
  assert.deepEqual(await handlers.get('ai:updateSettings')(event, { mode: 'auto' }), {
    ...state.aiSettings,
    mode: 'auto'
  });

  assert.deepEqual(await handlers.get('ai:updateSettings')(event, { mode: 'plan' }), {
    ...state.aiSettings,
    mode: 'plan'
  });

  // Ungültiger Modus wird abgewiesen
  assert.throws(
    () => handlers.get('ai:updateSettings')(event, { mode: 'dangerous' }),
    error => error?.code === 'IPC_ARGUMENT_INVALID'
  );

  assert.throws(
    () => handlers.get('ai:sendMessage')(event, { messageId: 'm1', text: 'Hi', mode: 'invalid' }),
    error => error?.code === 'IPC_ARGUMENT_INVALID'
  );

  // Per-Request-Modus wird an streamChat übergeben
  await handlers.get('ai:sendMessage')(event, { messageId: 'm2', text: 'Hi', mode: 'auto' });
  await waitFor(() => receivedMode === 'auto');
  assert.equal(receivedMode, 'auto');
});

test('KI 11: registerAiIpc registriert Proposal-Kanäle und leitet Vorschläge an den Renderer weiter', async () => {
  const handlers = new Map();
  const events = [];
  const state = { aiSettings: { host: 'http://127.0.0.1:11434', enabled: true } };

  const mockOllama = {
    DEFAULT_HOST: 'http://127.0.0.1:11434',
    normalizeHost: ollama.normalizeHost,
    friendlyError: ollama.friendlyError,
    streamChat: async ({ onToolResult, onChunk }) => {
      onToolResult({
        name: 'propose_create_note',
        args: { title: 'Test' },
        result: {
          success: true,
          data: {
            proposalId: 'prop_test_123',
            type: 'create',
            title: 'Test',
            relPath: 'Kategorie/Unterkategorie/Test.md',
            requiresConfirmation: true
          }
        }
      });
      onChunk('Ich habe einen Vorschlag erstellt.');
      return { done: true, fullText: 'Ich habe einen Vorschlag erstellt.', stats: {} };
    }
  };

  registerAiIpc({
    getCurrentProject: () => ({ path: '/tmp/test-wiki' }),
    getMainWindow: () => ({
      isDestroyed: () => false,
      webContents: { send: (channel, payload) => events.push({ channel, payload }) }
    }),
    ipcMainApi: { handle: (channel, handler) => handlers.set(channel, handler) },
    isTrustedSender: event => event?.trusted === true,
    ollamaClient: mockOllama,
    readState: () => state,
    writeState: patch => Object.assign(state, patch)
  });

  const event = { trusted: true };

  // Kanäle sind registriert
  assert.ok(handlers.has('ai:getProposal'), 'ai:getProposal ist registriert');
  assert.ok(handlers.has('ai:applyProposal'), 'ai:applyProposal ist registriert');
  assert.ok(handlers.has('ai:rejectProposal'), 'ai:rejectProposal ist registriert');

  // Ungültige Argumente abweisen
  assert.throws(
    () => handlers.get('ai:applyProposal')(event, { wrongKey: 'val' }),
    err => err?.code === 'IPC_ARGUMENT_INVALID'
  );

  // Untrusted Sender abweisen
  assert.throws(
    () => handlers.get('ai:applyProposal')({ trusted: false }, { proposalId: 'prop_test_123' }),
    err => err?.code === 'IPC_SENDER_INVALID'
  );

  // Vorschlags-Übermittlung via Stream-Event
  await handlers.get('ai:sendMessage')(event, {
    messageId: 'prop-msg-1',
    text: 'Erstelle Notiz'
  });

  await waitFor(() => events.find(e => e.channel === 'ai:stream-end'));

  const propEvent = events.find(e => e.channel === 'ai:stream-proposal');
  assert.ok(propEvent, 'ai:stream-proposal Event muss an MainWindow gesendet werden');
  assert.equal(propEvent.payload.messageId, 'prop-msg-1');
  assert.equal(propEvent.payload.proposal.proposalId, 'prop_test_123');
  assert.equal(propEvent.payload.proposal.type, 'create');
});


