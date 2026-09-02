#!/usr/bin/env node
// Native-Messaging-Host: übersetzt das Browser-stdio-Protokoll in den lokalen
// Archiv-Wiki-IPC-Socket. Er speichert selbst keine Eingänge und greift nicht
// auf Wiki-Projekte zu.

'use strict';

const net = require('net');
const {
  MAX_MESSAGE_BYTES,
  getWebClipSocketPath
} = require('../../main/webclip-transport');

const SOCKET_TIMEOUT_MS = 10000;
const MAX_RESPONSE_BYTES = 64 * 1024;

function sendNativeMessage(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(header);
  process.stdout.write(body);
}

function readNativeMessage() {
  return new Promise((resolve, reject) => {
    let header = Buffer.alloc(0);
    let expectedLength = null;
    let bodyBytes = 0;
    const bodyChunks = [];
    let settled = false;

    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      handler(value);
    };

    process.stdin.on('data', (incomingChunk) => {
      if (settled) return;
      let chunk = incomingChunk;

      if (expectedLength === null) {
        const missingHeaderBytes = 4 - header.length;
        const headerPart = chunk.subarray(0, Math.min(missingHeaderBytes, chunk.length));
        header = header.length ? Buffer.concat([header, headerPart], 4) : Buffer.from(headerPart);
        chunk = chunk.subarray(headerPart.length);
        if (header.length < 4) return;

        expectedLength = header.readUInt32LE(0);
        if (expectedLength <= 0 || expectedLength > MAX_MESSAGE_BYTES) {
          finish(reject, new Error('Der Clip ist zu groß oder die Native-Messaging-Nachricht ist ungültig.'));
          return;
        }
      }

      if (chunk.length && bodyBytes < expectedLength) {
        const remaining = expectedLength - bodyBytes;
        const bodyPart = chunk.subarray(0, Math.min(remaining, chunk.length));
        bodyChunks.push(bodyPart);
        bodyBytes += bodyPart.length;
      }

      if (bodyBytes < expectedLength) return;

      try {
        const body = Buffer.concat(bodyChunks, expectedLength);
        finish(resolve, JSON.parse(body.toString('utf8')));
      } catch {
        finish(reject, new Error('Native-Messaging-Nachricht ist kein gültiges JSON.'));
      }
    });
    process.stdin.on('error', (error) => finish(reject, error));
    process.stdin.on('end', () => {
      if (!settled) finish(reject, new Error('Keine vollständige Native-Messaging-Nachricht empfangen.'));
    });
  });
}

function forwardToArchivWiki(message) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(getWebClipSocketPath());
    socket.setEncoding('utf8');
    socket.setTimeout(SOCKET_TIMEOUT_MS);
    let responseBuffer = '';
    let settled = false;

    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      handler(value);
    };

    socket.on('connect', () => {
      try {
        socket.write(`${JSON.stringify(message)}\n`);
      } catch (error) {
        finish(reject, new Error(`Clip konnte nicht an Archiv-Wiki gesendet werden: ${error.message}`));
      }
    });

    socket.on('data', (chunk) => {
      if (settled) return;
      responseBuffer += chunk;
      if (Buffer.byteLength(responseBuffer, 'utf8') > MAX_RESPONSE_BYTES) {
        finish(reject, new Error('Archiv-Wiki hat eine unerwartet große Antwort gesendet.'));
        return;
      }

      const newlineIndex = responseBuffer.indexOf('\n');
      if (newlineIndex === -1) return;
      const line = responseBuffer.slice(0, newlineIndex).trim();
      if (!line) {
        finish(reject, new Error('Archiv-Wiki hat eine leere Antwort gesendet.'));
        return;
      }
      try {
        finish(resolve, JSON.parse(line));
      } catch {
        finish(reject, new Error('Archiv-Wiki hat eine ungültige Antwort gesendet.'));
      }
    });

    socket.on('timeout', () => {
      finish(reject, new Error('Archiv-Wiki antwortet nicht. Prüfe, ob Archiv-Wiki geöffnet ist, und versuche den Clip erneut.'));
    });
    socket.on('error', () => {
      finish(reject, new Error('Archiv-Wiki ist nicht erreichbar. Starte Archiv-Wiki und versuche den Clip erneut.'));
    });
    socket.on('end', () => {
      if (!settled) finish(reject, new Error('Archiv-Wiki hat die Verbindung ohne Antwort beendet. Versuche den Clip erneut.'));
    });
  });
}

(async () => {
  try {
    const message = await readNativeMessage();
    const response = await forwardToArchivWiki(message);
    sendNativeMessage(response);
  } catch (error) {
    sendNativeMessage({ ok: false, error: error?.message || String(error) });
  }
})();
