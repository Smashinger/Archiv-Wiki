// main/webclip-transport.js
// Gemeinsame Transportkonstanten für den lokalen Browser→Desktop-Webclip-Weg.
// Enthält bewusst keine Electron-Abhängigkeit, damit derselbe Vertrag auch
// vom Native-Messaging-Host der Browser-Erweiterung verwendet werden kann.

'use strict';

const os = require('os');
const path = require('path');

const NATIVE_HOST_NAME = 'de.smashii.archivwiki.webclip';
const MESSAGE_VERSION = 1;
const MESSAGE_TYPE = 'webclip';
const MAX_MESSAGE_BYTES = 10 * 1024 * 1024;

function getWebClipSocketPath() {
  if (process.platform === 'win32') {
    const user = String(process.env.USERNAME || process.env.USER || 'user').replace(/[^a-z0-9_-]/gi, '_');
    return `\\\\.\\pipe\\archiv-wiki-webclip-${user}`;
  }

  // XDG_RUNTIME_DIR ist benutzerbezogen und kurz genug für Unix-Domain-Sockets.
  // Der Temp-Ordner bleibt ein Fallback für Umgebungen ohne vollständige XDG-Sitzung.
  const runtimeDir = process.env.XDG_RUNTIME_DIR && path.isAbsolute(process.env.XDG_RUNTIME_DIR)
    ? process.env.XDG_RUNTIME_DIR
    : os.tmpdir();
  const uid = typeof process.getuid === 'function' ? process.getuid() : String(process.env.USER || 'user');
  return path.join(runtimeDir, `archiv-wiki-webclip-${uid}.sock`);
}

module.exports = {
  NATIVE_HOST_NAME,
  MESSAGE_VERSION,
  MESSAGE_TYPE,
  MAX_MESSAGE_BYTES,
  getWebClipSocketPath
};
