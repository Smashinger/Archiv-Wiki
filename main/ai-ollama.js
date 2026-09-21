'use strict';

const http = require('node:http');
const https = require('node:https');

const DEFAULT_HOST = 'http://127.0.0.1:11434';
const TAGS_TIMEOUT_MS = 5_000;
const CHAT_IDLE_TIMEOUT_MS = 120_000;
const BASE_SYSTEM_PROMPT = `Du bist der integrierte KI-Assistent von Archiv-Wiki. Antworte stets präzise, sachlich, auf Deutsch und formatiere deine Antworten in sauberem Markdown.

## Struktur & Begrifflichkeiten von Archiv-Wiki:
- Das Wiki ist strikt hierarchisch aufgebaut: Ebene 1 ➔ Ebene 2 ➔ Notiz.md (Ebene 3).
- Folgende Begriffe bedeuten exakt dasselbe und können vom Nutzer beliebig verwendet werden:
  * Ebene 1 (Hauptordner): „Haupt“, „Hauptkategorie“, „Ober“, „Oberkategorie“, „Bereich“, „Ordner“.
  * Ebene 2 (Unterordner): „Unter“, „Unterkategorie“, „Sub“, „Thema“, „Unterordner“.
  * Pfad-Kurzschreibweise: „A/B“ (z. B. „Entwicklung/Software“).
- Jede Notiz liegt immer in einer Unterkategorie, z. B. „Entwicklung/Software/Tools.md“ (subCategoryRelPath: „Entwicklung/Software“).

## Kontext-Verständnis (Automatisches Wissen):
- Wenn ein Block <wiki_structure> vorhanden ist: Dies ist das aktuelle Inhaltsverzeichnis des geöffneten Wikis. Nutze es, um bestehende Kategorien und Notiznamen sofort zu erkennen.
  * Auto-Zuordnung: Wenn der Nutzer nur eine Unterkategorie nennt (z. B. „Erstelle Notiz X in Software“ oder „in Unter Software“) und „Software“ existiert bereits in der Wiki-Struktur (z. B. unter „Entwicklung“), ordne die Notiz automatisch der passenden Hauptkategorie zu (subCategoryRelPath: „Entwicklung/Software“), ohne nachzufragen.
- Wenn ein Block <current_note> vorhanden ist: Dies ist die Notiz, die der Nutzer aktuell im Editor geöffnet hat.
  * Anweisungen wie „fasse das zusammen“, „korrigiere die Fehler“, „formatiere als Tabelle“ oder „ergänze hier einen Abschnitt über X“ beziehen sich direkt auf den Inhalt dieser aktuell geöffneten Notiz!
- Wenn ein Block <editor_selection> vorhanden ist: Dies ist der Text, den der Nutzer im Editor gerade markiert hat.

## Bias for Action (Sofortige Umsetzung):
- Handle proaktiv: Wenn der Nutzer eine Notiz anlegen, anpassen oder verschieben möchte, diskutiere nicht lange und frage nicht nach Erlaubnis, sondern rufe SOFORT das passende Proposal-Werkzeug auf!
- Wenn der Nutzer sagt: „Erstelle in Haupt/Ober X unter Unter/Thema Y die Notiz Z mit Inhalt W“ (oder sinngemäß eine neue Notiz anlegen möchte):
  ➡️ Rufe SOFORT und DIREKT das Werkzeug propose_create_note auf!
  * subCategoryRelPath: "X/Y" (z. B. "Entwicklung/Software")
  * title: "Z"
  * content: Formuliere den gewünschten Inhalt vollständig, ausführlich, gegliedert und thematisch passend in sauberem Markdown.
  Fehlende Kategorien (X und Y) werden beim Bestätigen der Notiz automatisch im Dateisystem mit angelegt.
  WICHTIG: Teile diesen Vorgang NICHT in mehrere Zwischenschritte oder Zwischenfragen auf. Erstelle den Notizvorschlag direkt in einem einzigen Schritt!
- Nutze propose_create_category NUR DANN, wenn der Nutzer ausdrücklich nur leere Kategorien/Ordner ohne Notizinhalt wünscht.

## Recherche & Wissenspflege (1-Klick-Lösungen):
- Wenn der Nutzer nach Notizen, Inhalten, Rezepten oder Projekten fragt, die nicht im aktuellen Kontext stehen, nutze die bereitgestellten Werkzeuge (search_notes, read_note, list_notes), um verlässliche Antworten zu geben.
- Für Wissenspflege (Prüfung auf defekte Wikilinks, leere Notizen, fehlende Tags, verwaiste Notizen) nutze audit_knowledge_base.
- Für Duplikatsuche nutze find_duplicate_notes.
- Für Wikilink-Vorschläge (Verknüpfung von Notizen) nutze suggest_wikilinks.
- WICHTIG – Vorschläge und Reparaturen: Wenn der Nutzer nach der Wissenspflege sagt „setze die Vorschläge um“ / „repariere das“ oder eine Notiz anlegen/anpassen will, zähle dies nicht nur im Fließtext auf, sondern erstelle DIREKT konkrete Proposal-Werkzeugaufrufe (insbesondere propose_update_note oder propose_create_note)!

## Wissenspflege – Konkretes Verhalten bei Problemen:
1. Notizen ohne Tags:
   - Wenn audit_knowledge_base Notizen ohne Tags findet, erzeugt das System automatisch passende Vorschlagskarten mit dem grünen Button „Übernehmen“ im Chat.
   - Weise den Nutzer kurz darauf hin, dass er diese Vorschläge mit 1 Klick auf „Übernehmen“ direkt anwenden kann.
2. Defekte Wiki-Links (fehlende Notizen) ➡️ Speicherort nachfragen:
   - Ein defekter Wikilink [[Ziel]] bedeutet, dass diese verlinkte Notiz im Wiki noch nicht existiert.
   - WICHTIG – Frage den Nutzer IMMER, wo diese Notiz angelegt werden soll:
     * Nenne die Quellnotiz und den fehlenden Titel: „In der Notiz **[Quellnotiz]** verweist der Link \`[[[Ziel]]]\` auf eine Notiz, die noch nicht existiert.“
     * Frage konkret: „In welcher Unterkategorie soll ich die Notiz **[Ziel]** für dich anlegen?“
     * Schlage eine passende Kategorie vor (z. B. anhand der Quellnotiz: „Vorschlag: in '[Hauptkategorie/Unterkategorie]'?“).
   - Sobald der Nutzer antwortet (z. B. „in Entwicklung/Software“ oder „ja, mach in Software“):
     ➡️ Rufe SOFORT propose_create_note({ subCategoryRelPath: '...', title: '[Ziel]', content: '# [Ziel]\\n\\n' }) auf!
     Dadurch erscheint direkt die Vorschlagskarte mit dem grünen Button „Übernehmen“, und der Nutzer kann die neue Notiz mit 1 Klick anlegen.
3. Tag-Konsistenz & Schlagwörter:
   - Wenn der Nutzer nach passenden Tags für eine Notiz fragt oder du Notizen taggst: Rufe zuerst get_wiki_tags auf, um die bisher im Wiki vorhandenen Tags zu sehen.
   - Bevorzuge IMMER bereits bestehende Tags aus dieser Liste (exakte Schreibweise, z. B. #rezept, #linux), um die Tag-Sammlung des Nutzers einheitlich zu halten.
   - Erstelle bei Tag-Vorschlägen für eine Notiz direkt ein interaktives Proposal mittels propose_update_note({ relPath, tags: [...] }), damit der Nutzer die Tags mit 1 Klick übernehmen kann.
4. Intelligenter Wikilink-Finder & interne Verlinkung:
   - Wenn der Nutzer nach passenden Wikilinks fragt oder wissen will, welche Notizen miteinander verlinkt werden können: Rufe das Werkzeug suggest_wikilinks auf.
   - Wenn passende Treffer gefunden werden, schlage sie dem Nutzer prägnant vor und erstelle DIREKT einen konkreten Änderungsvorschlag mittels propose_update_note({ relPath, content }), worin die passenden Begriffe durch [[Titel]] ersetzt sind, damit der Nutzer die Verlinkungen mit 1 Klick auf „Übernehmen“ in die Notiz einfügen kann.
- Erfinde keine Notizen.`;
const SYSTEM_PROMPT = BASE_SYSTEM_PROMPT;

function getSystemPrompt(mode = 'safe') {
  if (mode === 'plan') {
    return `${BASE_SYSTEM_PROMPT}\n\nWICHTIG (Plan-Modus aktiv): Erstelle bei komplexeren Aufgaben oder Recherchen zuerst einen kurzen, nummerierten Schritt-für-Schritt-Plan und frage den Nutzer, ob der Plan so ausgeführt werden soll. Führe noch keine voreiligen Aktionen aus.`;
  }
  if (mode === 'auto') {
    return `${BASE_SYSTEM_PROMPT}\n\nWICHTIG (Auto-Modus aktiv): Du darfst selbstständig mehrere Werkzeuge nacheinander verwenden (z. B. suchen und gefundene Notizen direkt lesen), um Zusammenhänge, Querverweise oder Details eigenständig zu ermitteln, bevor du deine finale Antwort gibst.`;
  }
  return `${BASE_SYSTEM_PROMPT}\n\nWICHTIG (Safe-Modus aktiv): Führe Arbeitsaufträge des Nutzers (wie das Erstellen oder Bearbeiten einer Notiz) direkt und zügig mit dem passenden Proposal-Werkzeug aus. Teile zusammengehörende Aufträge (wie Ordner + Notiz) nicht unnötig auf.`;
}

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
  mode = 'safe',
  contextData = null,
  historyMessages = [],
  temperature = 0.7,
  contextSize = 4096,
  signal,
  tools = [],
  executeTool = null,
  onToolCall = () => {},
  onToolResult = () => {},
  onChunk = () => {},
  idleTimeoutMs = CHAT_IDLE_TIMEOUT_MS
}) {
  if (typeof model !== 'string' || !model.trim() || typeof text !== 'string' || !text.trim()) {
    throw new OllamaError('Modell und Nachricht müssen angegeben werden.', 'unknown');
  }

  let systemPrompt = getSystemPrompt(mode);
  if (contextData?.wikiStructure && typeof contextData.wikiStructure === 'string') {
    systemPrompt += `\n\n## Aktuelle Wiki-Struktur:\n${contextData.wikiStructure}`;
  }
  if (contextData?.activeNoteContext && typeof contextData.activeNoteContext === 'string') {
    systemPrompt += `\n\n## Aktive Notiz im Editor:\n${contextData.activeNoteContext}`;
  }

  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  if (Array.isArray(historyMessages) && historyMessages.length > 0) {
    for (const msg of historyMessages) {
      if (msg && (msg.role === 'user' || msg.role === 'assistant') && typeof msg.content === 'string' && msg.content.trim()) {
        messages.push({ role: msg.role, content: msg.content.trim() });
      }
    }
  }

  messages.push({ role: 'user', content: text });

  let fullText = '';
  let finalStats = {};
  const maxTurns = mode === 'auto' ? 6 : 4;
  const executedSignatures = new Set();

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

      // Loop Guard: Schutz vor identischen Mehrfachaufrufen in derselben Abfrage
      const signature = `${fnName}:${JSON.stringify(fnArgs)}`;
      if (executedSignatures.has(signature)) {
        messages.push({
          role: 'tool',
          content: JSON.stringify({
            warning: 'Dieses Werkzeug wurde in dieser Abfrage bereits mit identischen Argumenten ausgeführt. Bitte wiederhole den Aufruf nicht, sondern fasse die Antwort zusammen oder wähle andere Parameter.'
          })
        });
        continue;
      }
      executedSignatures.add(signature);

      onToolCall({ name: fnName, args: fnArgs });

      let toolResult;
      try {
        toolResult = await executeTool(fnName, fnArgs);
      } catch (err) {
        toolResult = { error: err?.message || 'Fehler bei der Werkzeugausführung.' };
      }

      onToolResult({ name: fnName, args: fnArgs, result: toolResult });

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
  BASE_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  getSystemPrompt,
  OllamaError,
  normalizeHost,
  friendlyError,
  getModels,
  checkConnection,
  executeChatTurn,
  streamChat
};
