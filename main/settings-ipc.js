// main/settings-ipc.js
// Der "Settings-Service": EINE zentrale Stelle, an der alle dauerhaften
// Projekt-Einstellungen gelesen und geschrieben werden. Ersetzt die vorher
// auf mehrere Dateien verteilten, je einzeln benannten Handler
// (fs:setProjectSetting, sync:saveSettings, sync:saveAutoSyncSettings) durch
// ZWEI generische Kanäle. Jede künftige Einstellung (Synchronisation,
// Plugins, Sprache, Tastenkürzel, ...) nutzt denselben Mechanismus — es muss
// dafür kein neuer, eigener IPC-Kanal mehr angelegt werden.

'use strict';

const { ipcMain, dialog } = require('electron');
const crypto = require('crypto');
const { cloneProjectConfig, requireProjectConfig, updateProjectConfig } = require('./project');
const { validateBackupDestinationAccess } = require('./backup');

// Verschachtelt zusammenführen (z. B. { editor: { tabSize: 4 } } lässt
// editor.autoSave unangetastet) — flache Object.assign würde stattdessen den
// ganzen "editor"-Unterbereich überschreiben.
//
// Ein per IPC ankommender Patch ist strukturell fremdes Renderer-Datenmaterial:
// JSON.parse erzeugt "__proto__" als GEWÖHNLICHE eigene Property, wodurch
// target[key] = ... hier sonst den Prototyp von target selbst verändern würde
// (Prototype Pollution). "constructor"/"prototype" werden aus demselben Grund
// vorsorglich mitgesperrt, da kein bestehendes Konfigurationsfeld diese Namen
// je legitim verwendet.
const UNSAFE_MERGE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Der App-Passwortschutz ist die einzige Projekteinstellung, deren Änderung
// eine Authentifizierung voraussetzt. Sie darf deshalb NIE über einen der
// generischen Einstellungs-Kanäle laufen (settings:update hier,
// fs:setProjectSetting in main/filesystem-ipc.js): beide schreiben, was der
// Renderer schickt, ohne das bestehende Passwort zu kennen — darüber ließe
// sich der Schutz sonst ohne Passwort abschalten und anschließend mit einem
// leeren Passwort entsperren.
const APP_LOCK_KEY = 'appLock';

// Authentifizierungsfehler des App-Passwortschutzes. Bewusst eine eigene
// Fehlerklasse: sie wird INNERHALB der Konfigurations-Mutation geworfen (und
// verhindert dadurch jeden Schreibvorgang), im Handler aber in eine reguläre,
// vom Einstellungsfenster darstellbare Antwort umgewandelt — im Gegensatz zu
// echten Speicher-/Konfigurationsfehlern, die Fehler bleiben.
class AppLockAuthError extends Error {
  constructor(reason) {
    super(`APP_LOCK_AUTH_FAILED:${reason}`);
    this.name = 'AppLockAuthError';
    this.reason = reason;
  }
}

function createAppLockRequestError(message) {
  const error = new Error(message);
  error.code = 'APP_LOCK_REQUEST_INVALID';
  return error;
}

// EINE gemeinsame Prüfung eines eingegebenen Passworts gegen den gespeicherten
// Salt+Hash — verwendet vom Sperrbildschirm (main.js, 'app:verifyAppLock') und
// von der authentifizierten Passwortänderung unten. Kein zweiter, abweichender
// Vergleich an anderer Stelle.
//
// timingSafeEqual statt === , damit die Vergleichszeit nicht verrät, wie viele
// Zeichen schon stimmten (Schutz gegen Timing-Angriffe, auch wenn das Risiko
// hier gering ist, da rein lokal — trotzdem der korrekte, saubere Weg).
function matchesStoredAppLockPassword(appLock, enteredPassword) {
  try {
    const candidateHash = crypto.scryptSync(enteredPassword || '', appLock.salt, 64);
    const storedHash = Buffer.from(appLock.hash, 'hex');
    return candidateHash.length === storedHash.length && crypto.timingSafeEqual(candidateHash, storedHash);
  } catch {
    return false;
  }
}

function deepMerge(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (UNSAFE_MERGE_KEYS.has(key)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] = (target[key] && typeof target[key] === 'object') ? target[key] : {};
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function registerSettingsIpc({ getCurrentProject, getMainWindow, onProjectConfigLoaded }) {
  function requireProjectPath() {
    const projectPath = getCurrentProject()?.path;
    if (!projectPath) throw new Error('Kein Projekt geöffnet.');
    return projectPath;
  }

  function adoptConfig(projectPath, config) {
    onProjectConfigLoaded?.(projectPath, config);
    return cloneProjectConfig(config);
  }

  // Backup-Ordner-Auswahl fürs neue Einstellungsfenster — gleiches
  // Vordergrund-Vorgehen wie beim Wizard-Pendant (show+moveTop+focus, bewusst
  // OHNE setAlwaysOnTop, siehe dortiger Kommentar), nur mit dem Hauptfenster
  // statt dem Wizard-Fenster als Elternfenster.
  ipcMain.handle('settings:chooseBackupFolder', async () => {
    const win = getMainWindow?.();
    if (win) { win.show(); win.moveTop(); win.focus(); }
    const result = await dialog.showOpenDialog(win, {
      title: 'Backup-Ordner wählen',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('settings:validateBackupFolder', (_event, backupPath) => {
    const projectPath = requireProjectPath();
    return validateBackupDestinationAccess(projectPath, backupPath);
  });

  // Liefert die komplette aktuelle Konfiguration — einzige Stelle, die das
  // Einstellungsfenster beim Öffnen sowie bei jedem erneuten Anzeigen abfragt.
  ipcMain.handle('settings:get', () => {
    const projectPath = requireProjectPath();
    return adoptConfig(projectPath, requireProjectConfig(projectPath));
  });

  // Nimmt ein TEILWEISES Objekt entgegen (nur die geänderten Felder, beliebig
  // verschachtelt, z. B. { editor: { tabSize: 4 } } oder { accentKey: 'blue' })
  // und führt es mit der bestehenden Konfiguration zusammen. Gibt die neue,
  // komplette Konfiguration zurück, damit der Aufrufer sie sofort live
  // anwenden kann, ohne ein zweites Mal nachzufragen.
  ipcMain.handle('settings:update', (_e, patch) => {
    const projectPath = requireProjectPath();
    // Eigene Property prüfen (nicht `patch.appLock`): ein geerbter Wert wäre
    // kein Änderungswunsch, und ein ausdrücklich mitgeschicktes
    // `appLock: undefined` soll trotzdem abgewiesen werden. Bewusst ein harter
    // Fehler statt stillem Herausfiltern — ein Aufrufer darf für etwas, das
    // nicht gespeichert wurde, nie "gespeichert" zurückbekommen.
    if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, APP_LOCK_KEY)) {
      throw createAppLockRequestError(
        'Der App-Passwortschutz kann nur über die Sicherheitseinstellungen mit dem aktuellen Passwort geändert werden.'
      );
    }
    const config = updateProjectConfig(projectPath, draft => deepMerge(draft, patch));
    return adoptConfig(projectPath, config);
  });

  // App-Passwortschutz setzen, ändern oder entfernen — EINE atomare,
  // authentifizierte Operation im Hauptprozess. Eigener Handler statt des
  // generischen settings:update, weil hier gehasht werden muss (nie das
  // Klartext-Passwort speichern) und weil das bestehende Passwort geprüft
  // werden muss.
  //
  // Erwartet ausdrücklich { currentPassword, newPassword }; ein nackter
  // Passwort-String wird nicht mehr angenommen. Vorher genügte der neue Wert
  // allein als Autorität, und die Prüfung des aktuellen Passworts lag im
  // Renderer (renderer/js/settings-window.js) — reine Oberflächenvalidierung,
  // keine Sicherheitsgrenze.
  //
  // Leeres neues Passwort bei korrektem aktuellem Passwort → Schutz entfernen.
  ipcMain.handle('settings:setAppLockPassword', (_e, request) => {
    const projectPath = requireProjectPath();
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      throw createAppLockRequestError(
        'Der App-Passwortschutz erwartet aktuelles und neues Passwort als Anfrage.'
      );
    }
    const currentPassword = typeof request.currentPassword === 'string' ? request.currentPassword : '';
    const newPassword = typeof request.newPassword === 'string' ? request.newPassword : '';

    let removed = false;
    try {
      // Prüfung und Änderung arbeiten auf DEMSELBEN, frisch von der Platte
      // gelesenen Stand: updateProjectConfig() liest, mutiert und schreibt in
      // einem synchronen Durchgang. Zwischen der Prüfung des aktuellen
      // Passworts und dem Schreiben liegt damit kein weiterer IPC-Aufruf, über
      // den sich der geprüfte Stand austauschen ließe. Ein Wurf hier bricht
      // vor writeProjectConfig() ab — bei fehlgeschlagener Authentifizierung
      // wird also nichts geschrieben.
      const config = updateProjectConfig(projectPath, draft => {
        const existing = draft[APP_LOCK_KEY];
        if (existing?.enabled) {
          if (!currentPassword) throw new AppLockAuthError('CURRENT_PASSWORD_REQUIRED');
          if (!matchesStoredAppLockPassword(existing, currentPassword)) {
            throw new AppLockAuthError('CURRENT_PASSWORD_WRONG');
          }
        }
        if (newPassword.trim()) {
          const salt = crypto.randomBytes(16).toString('hex');
          const hash = crypto.scryptSync(newPassword, salt, 64).toString('hex');
          draft[APP_LOCK_KEY] = { enabled: true, salt, hash };
          return;
        }
        // Ohne bestehenden Schutz gibt es nichts zu entfernen — dann wäre ein
        // leeres neues Passwort kein sinnvoller Auftrag, sondern ein
        // unvollständiges Formular.
        if (!existing?.enabled) throw new AppLockAuthError('NEW_PASSWORD_REQUIRED');
        draft[APP_LOCK_KEY] = { enabled: false };
        removed = true;
      });
      return { ok: true, removed, config: adoptConfig(projectPath, config) };
    } catch (error) {
      if (error instanceof AppLockAuthError) return { ok: false, reason: error.reason };
      throw error;
    }
  });
}

module.exports = { registerSettingsIpc, deepMerge, matchesStoredAppLockPassword };
