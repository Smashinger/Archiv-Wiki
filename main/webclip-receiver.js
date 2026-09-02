// main/webclip-receiver.js
// Lokaler Empfangspunkt für Browser-Webclips. Die Browser-Erweiterung spricht
// über Native Messaging mit einem kleinen Host-Prozess; dieser reicht die Daten
// über einen lokalen IPC-Socket an den laufenden Archiv-Wiki-Main-Prozess weiter.
// Es wird kein HTTP-Server und kein Netzwerkzugriff verwendet.

'use strict';

const fs = require('fs');
const net = require('net');
const incomingStore = require('./incoming-store');
const {
  MESSAGE_VERSION,
  MESSAGE_TYPE,
  MAX_MESSAGE_BYTES,
  getWebClipSocketPath
} = require('./webclip-transport');

function serializeResponse(response) {
  return `${JSON.stringify(response)}\n`;
}

function startWebClipReceiver({ getCurrentProject, onCreated, onStatusChanged } = {}) {
  if (typeof getCurrentProject !== 'function') {
    throw new Error('Webclip-Empfang benötigt eine Projektquelle.');
  }

  const socketPath = getWebClipSocketPath();
  const runtimeStatus = {
    receiverReady: false,
    activeConnections: 0,
    lastBrowserConnectionAt: null,
    lastClipAt: null,
    lastError: null
  };

  function getStatus() {
    return {
      receiverReady: runtimeStatus.receiverReady,
      browserConnected: runtimeStatus.activeConnections > 0,
      lastBrowserConnectionAt: runtimeStatus.lastBrowserConnectionAt,
      lastClipAt: runtimeStatus.lastClipAt,
      lastError: runtimeStatus.lastError
    };
  }

  function notifyStatusChanged() {
    if (typeof onStatusChanged !== 'function') return;
    try { onStatusChanged(getStatus()); }
    catch (error) { console.warn('[Archiv Wiki] Webclip-Status konnte nicht gemeldet werden:', error?.message || error); }
  }

  if (process.platform !== 'win32' && fs.existsSync(socketPath)) {
    // Dank Single-Instance-Lock kann hier nur ein veralteter Socket einer
    // früheren Sitzung liegen. Er wird entfernt, bevor der neue Listener bindet.
    try { fs.unlinkSync(socketPath); }
    catch (error) { throw new Error(`Webclip-Socket konnte nicht vorbereitet werden: ${error.message}`); }
  }

  const server = net.createServer((socket) => {
    runtimeStatus.activeConnections += 1;
    runtimeStatus.lastBrowserConnectionAt = new Date().toISOString();
    runtimeStatus.lastError = null;
    notifyStatusChanged();

    let connectionReleased = false;
    function releaseConnection() {
      if (connectionReleased) return;
      connectionReleased = true;
      runtimeStatus.activeConnections = Math.max(0, runtimeStatus.activeConnections - 1);
      notifyStatusChanged();
    }

    socket.on('close', releaseConnection);
    socket.setEncoding('utf8');
    socket.setTimeout(10000);
    let buffer = '';
    let bufferBytes = 0;
    let finished = false;

    function finish(response) {
      if (finished) return;
      finished = true;
      try { socket.end(serializeResponse(response)); }
      catch { socket.destroy(); }
    }

    socket.on('data', (chunk) => {
      if (finished) return;
      buffer += chunk;
      bufferBytes += Buffer.byteLength(chunk, 'utf8');
      if (bufferBytes > MAX_MESSAGE_BYTES) {
        finish({ ok: false, error: 'Web-Clip ist zu groß.' });
        return;
      }

      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) return;

      const line = buffer.slice(0, newlineIndex).trim();
      if (!line) {
        finish({ ok: false, error: 'Leere Web-Clip-Anfrage.' });
        return;
      }

      let request;
      try { request = JSON.parse(line); }
      catch {
        finish({ ok: false, error: 'Web-Clip-Anfrage ist kein gültiges JSON.' });
        return;
      }

      try {
        if (request?.version !== MESSAGE_VERSION || request?.type !== MESSAGE_TYPE) {
          throw new Error('Web-Clip-Anfrage verwendet ein nicht unterstütztes Format.');
        }

        const projectPath = getCurrentProject()?.path;
        if (!projectPath) throw new Error('Kein Archiv-Wiki-Projekt geöffnet.');

        // Validierung und eigentliche Speicherung bleiben vollständig im
        // bestehenden Eingang-Modul. Der externe Transport besitzt keinen
        // eigenen Webseiten-Speicherpfad.
        const entry = incomingStore.receiveWebClip(projectPath, request.payload);
        runtimeStatus.lastClipAt = new Date().toISOString();
        runtimeStatus.lastError = null;
        if (typeof onCreated === 'function') onCreated(entry);
        notifyStatusChanged();

        finish({
          ok: true,
          entry: {
            id: entry.id,
            title: entry.title,
            url: entry.url,
            type: entry.type,
            createdAt: entry.createdAt
          }
        });
      } catch (error) {
        finish({ ok: false, error: error?.message || String(error) });
      }
    });

    socket.on('timeout', () => {
      finish({ ok: false, error: 'Web-Clip-Verbindung hat zu lange auf Daten gewartet.' });
    });

    socket.on('error', (error) => {
      if (!finished) console.error('[Archiv Wiki] Webclip-Socket-Verbindung fehlgeschlagen:', error.message);
    });
  });

  server.on('error', (error) => {
    runtimeStatus.receiverReady = false;
    runtimeStatus.lastError = error?.message || String(error);
    notifyStatusChanged();
    console.error('[Archiv Wiki] Webclip-Empfang konnte nicht gestartet werden:', error.message);
  });

  server.listen(socketPath, () => {
    runtimeStatus.receiverReady = true;
    runtimeStatus.lastError = null;
    notifyStatusChanged();
    if (process.platform !== 'win32') {
      try { fs.chmodSync(socketPath, 0o600); }
      catch (error) { console.warn('[Archiv Wiki] Webclip-Socket-Rechte konnten nicht gesetzt werden:', error.message); }
    }
    console.log(`[Archiv Wiki] Webclip-Empfang bereit: ${socketPath}`);
  });

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    runtimeStatus.receiverReady = false;
    runtimeStatus.activeConnections = 0;
    notifyStatusChanged();
    try { server.close(); } catch { /* best effort */ }
    if (process.platform !== 'win32') {
      try { if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath); } catch { /* best effort */ }
    }
  }

  return { socketPath, close, getStatus };
}

module.exports = { startWebClipReceiver };
