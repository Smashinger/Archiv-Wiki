'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPORT_SCHEMA_VERSION = 1;
const MAX_REPORTS = 5;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_STACK_LENGTH = 12000;
const MAX_DETAIL_STRING_LENGTH = 4000;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function truncate(value, maxLength) {
  const text = String(value ?? '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 18))}\n<gekürzt>`;
}

function replaceKnownPath(text, rawPath, placeholder, { redactTail = false } = {}) {
  if (!rawPath || typeof rawPath !== 'string') return text;
  const candidates = new Set([
    rawPath,
    rawPath.replace(/\\/g, '/'),
    rawPath.replace(/\//g, '\\')
  ]);
  let output = text;
  for (const candidate of candidates) {
    if (!candidate) continue;
    output = output.replace(new RegExp(escapeRegExp(candidate), 'g'), placeholder);
  }
  if (redactTail) {
    const placeholderPattern = escapeRegExp(placeholder);
    output = output.replace(new RegExp(String.raw`${placeholderPattern}(?:[\\/][^\s)\]}>"',;]+)+`, 'g'), `${placeholder}/<redacted>`);
  }
  return output;
}

function sanitizeText(value, context = {}, maxLength = MAX_DETAIL_STRING_LENGTH) {
  let text = truncate(value, maxLength);
  if (!text) return text;

  // file://-URLs zunächst in normale lokale Pfade überführen, damit interne
  // App-Pfade als <APP>/... erhalten bleiben können, während persönliche
  // Pfade danach konsequent anonymisiert werden.
  text = text.replace(/file:\/\/{2,3}/gi, '/');

  text = replaceKnownPath(text, context.appPath, '<APP>');
  text = replaceKnownPath(text, context.resourcesPath, '<APP>');
  text = replaceKnownPath(text, context.projectPath, '<PROJECT>', { redactTail: true });
  text = replaceKnownPath(text, context.userDataPath, '<APP_DATA>', { redactTail: true });
  text = replaceKnownPath(text, context.tempPath, '<TEMP>', { redactTail: true });
  text = replaceKnownPath(text, context.homePath, '<HOME>', { redactTail: true });

  // Web-/Netzwerkziele werden vollständig entfernt. Dadurch gelangen weder
  // private WebDAV-Adressen noch Seiten-URLs oder darin enthaltene Tokens in
  // einen gespeicherten Diagnosebericht.
  text = text.replace(/\b(?:https?|ftp|wss?):\/\/[^\s)\]}>"']+/gi, '<URL>');

  // Zugangsdaten und typische Geheimnisse auch dann entfernen, wenn sie nicht
  // Bestandteil einer URL waren.
  text = text.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer <REDACTED>');
  text = text.replace(/\b(password|passwort|token|secret|authorization|api[-_ ]?key|username|benutzername)\b\s*[:=]\s*([^\s,;]+)/gi, '$1=<REDACTED>');
  // Explizit als Inhalt/Text/Payload bezeichnete Werte werden grundsätzlich
  // entfernt. Damit kann ein Fehlerobjekt nicht versehentlich einen Notiztext
  // oder einen Web-Clip-Inhalt als Diagnosewert konservieren.
  text = text.replace(/\b(content|body|text|note|notiz|markdown|payload|document)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|`[^`]*`|[^\n]+)/gi, '$1=<REDACTED>');
  text = text.replace(/"[^"\n]{48,}"|'[^'\n]{48,}'|`[^`\n]{48,}`/g, '<TEXT>');
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<EMAIL>');
  text = text.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '<IP>');

  // Übrig gebliebene absolute Pfade werden komplett anonymisiert. Interne
  // relative Quellpfade wie renderer/js/app.js bleiben diagnostisch nutzbar.
  text = text.replace(/(^|[\s([{"'=])\/(?![<>])[^\s)\]}>"']+/gm, (_match, prefix) => `${prefix}<PATH>`);
  text = text.replace(/\b[A-Za-z]:[\\/][^\s)\]}>"']+/g, '<PATH>');

  return truncate(text, maxLength);
}

function sanitizeValue(value, context, depth = 0) {
  if (depth > 4) return '<gekürzt>';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return sanitizeText(value, context);
  if (Array.isArray(value)) return value.slice(0, 20).map(item => sanitizeValue(item, context, depth + 1));
  if (typeof value !== 'object') return sanitizeText(String(value), context);

  const result = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, 50)) {
    const key = String(rawKey).slice(0, 120);
    if (/password|passwort|token|secret|authorization|api[-_ ]?key|credential|content|body|text|note|notiz|markdown|payload|document/i.test(key)) {
      result[key] = '<REDACTED>';
      continue;
    }
    result[key] = sanitizeValue(rawValue, context, depth + 1);
  }
  return result;
}

function secureWriteJson(targetPath, value) {
  const directory = path.dirname(targetPath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(directory, 0o700); } catch { /* best effort */ }

  const tempPath = path.join(directory, `.${path.basename(targetPath)}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
  let fd;
  try {
    fd = fs.openSync(tempPath, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify(value, null, 2), 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.chmodSync(tempPath, 0o600);
    fs.renameSync(tempPath, targetPath);
    try { fs.chmodSync(targetPath, 0o600); } catch { /* best effort */ }
  } catch (error) {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* best effort */ }
    }
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch { /* best effort */ }
    throw error;
  }
}

function createDiagnosticsService({
  getUserDataPath,
  getEnvironment,
  getSanitizationContext = () => ({})
}) {
  if (typeof getUserDataPath !== 'function' || typeof getEnvironment !== 'function') {
    throw new TypeError('Diagnose-Service benötigt getUserDataPath und getEnvironment.');
  }

  function reportsDirectory() {
    return path.join(getUserDataPath(), 'diagnostics');
  }

  function sanitizationContext() {
    try { return getSanitizationContext() || {}; } catch { return {}; }
  }

  function readReportFile(filePath) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!parsed || parsed.schemaVersion !== REPORT_SCHEMA_VERSION || typeof parsed.id !== 'string') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function readAllReports() {
    let names = [];
    try { names = fs.readdirSync(reportsDirectory()); } catch { return []; }
    return names
      .filter(name => name.endsWith('.json'))
      .map(name => readReportFile(path.join(reportsDirectory(), name)))
      .filter(Boolean)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function metadata(report) {
    return {
      id: report.id,
      createdAt: report.createdAt,
      origin: report.origin,
      source: report.source,
      kind: report.kind,
      title: report.title,
      notifiedAt: report.notifiedAt || null
    };
  }

  function enforceRetention() {
    const reports = readAllReports();
    for (const report of reports.slice(MAX_REPORTS)) {
      try { fs.unlinkSync(path.join(reportsDirectory(), `${report.id}.json`)); } catch { /* best effort */ }
    }
  }

  function saveReport(report) {
    secureWriteJson(path.join(reportsDirectory(), `${report.id}.json`), report);
    enforceRetention();
    return report;
  }

  function createBaseReport({ origin, source, kind, title }) {
    const now = new Date().toISOString();
    return {
      schemaVersion: REPORT_SCHEMA_VERSION,
      id: `${Date.now()}-${crypto.randomUUID()}`,
      createdAt: now,
      origin,
      source,
      kind,
      title,
      notifiedAt: origin === 'manual' ? now : null,
      environment: sanitizeValue(getEnvironment(), sanitizationContext())
    };
  }

  function recordAutomatic({ source = 'main', kind = 'technical-error', title = 'Technischer Fehler', message = '', stack = '', details = null } = {}) {
    const context = sanitizationContext();
    const report = createBaseReport({ origin: 'automatic', source, kind, title });
    report.error = {
      message: sanitizeText(message || 'Keine Fehlermeldung verfügbar.', context, MAX_MESSAGE_LENGTH),
      stack: stack ? sanitizeText(stack, context, MAX_STACK_LENGTH) : null,
      details: details == null ? null : sanitizeValue(details, context)
    };

    // Derselbe unbehandelte Fehler kann kurz nacheinander über mehrere
    // technische Signale sichtbar werden. Identische Berichte innerhalb von
    // fünf Sekunden werden deshalb nicht mehrfach gespeichert und verdrängen
    // so keine anderen der maximal fünf Diagnoseberichte.
    const latest = readAllReports()[0];
    if (latest?.origin === 'automatic'
        && latest.source === report.source
        && latest.kind === report.kind
        && latest.error?.message === report.error.message
        && Math.abs(new Date(report.createdAt).getTime() - new Date(latest.createdAt).getTime()) <= 5000) {
      return metadata(latest);
    }

    return metadata(saveReport(report));
  }

  function createManual({ runtime = null } = {}) {
    const context = sanitizationContext();
    const report = createBaseReport({
      origin: 'manual',
      source: 'manual',
      kind: 'manual-diagnostics',
      title: 'Manuell erstellter Diagnosebericht'
    });
    report.runtime = runtime == null ? null : sanitizeValue(runtime, context);
    return metadata(saveReport(report));
  }

  function listReports() {
    return readAllReports().slice(0, MAX_REPORTS).map(metadata);
  }

  function getReport(id) {
    if (typeof id !== 'string' || !/^[0-9]+-[0-9a-f-]+$/i.test(id)) return null;
    const report = readReportFile(path.join(reportsDirectory(), `${id}.json`));
    if (!report) return null;
    return { report, text: formatReport(report) };
  }

  function markNotified(id) {
    const full = getReport(id);
    if (!full) return false;
    const report = full.report;
    if (report.notifiedAt) return true;
    report.notifiedAt = new Date().toISOString();
    saveReport(report);
    return true;
  }

  function getSummary() {
    const reports = readAllReports().slice(0, MAX_REPORTS);
    return {
      count: reports.length,
      latest: reports[0] ? metadata(reports[0]) : null,
      unnotifiedAutomatic: reports.find(report => report.origin === 'automatic' && !report.notifiedAt)
        ? metadata(reports.find(report => report.origin === 'automatic' && !report.notifiedAt))
        : null
    };
  }

  function formatKeyValue(key, value) {
    if (value == null || value === '') return `${key}: nicht verfügbar`;
    if (typeof value === 'boolean') return `${key}: ${value ? 'ja' : 'nein'}`;
    return `${key}: ${value}`;
  }

  function formatReport(report) {
    const env = report.environment || {};
    const lines = [
      'Archiv-Wiki Diagnosebericht',
      '===========================',
      formatKeyValue('Zeitpunkt', report.createdAt),
      formatKeyValue('Erstellung', report.origin === 'manual' ? 'manuell' : 'automatisch'),
      formatKeyValue('Fehlerart', report.title || report.kind),
      '',
      'SYSTEM',
      '------',
      formatKeyValue('Archiv-Wiki-Version', env.appVersion),
      formatKeyValue('Betriebssystem', env.operatingSystem),
      formatKeyValue('Architektur', env.arch),
      formatKeyValue('Installationsart', env.installType),
      formatKeyValue('Electron', env.electron)
    ];

    if (report.error) {
      lines.push(
        '',
        'FEHLER',
        '------',
        formatKeyValue('Quelle', report.source),
        formatKeyValue('Typ', report.kind),
        formatKeyValue('Meldung', report.error.message)
      );
      if (report.error.details && Object.keys(report.error.details).length) {
        lines.push('', 'Technische Angaben:', JSON.stringify(report.error.details, null, 2));
      }
      lines.push('', 'Stacktrace:', report.error.stack || 'Kein Stacktrace verfügbar.');
    }

    if (report.runtime) {
      lines.push('', 'LAUFZEITSTATUS', '-------------');
      const runtime = report.runtime;
      lines.push(formatKeyValue('Projekt geöffnet', runtime.projectOpen));

      if (runtime.update) {
        lines.push('', '[Updates]');
        lines.push(formatKeyValue('Status', runtime.update.phase));
        lines.push(formatKeyValue('Fehlertyp', runtime.update.errorType));
        lines.push(formatKeyValue('Fehlermeldung', runtime.update.errorMessage));
        lines.push(formatKeyValue('Technische Details', runtime.update.errorDetails));
      }
      if (runtime.backup) {
        lines.push('', '[Backup]');
        lines.push(formatKeyValue('Läuft', runtime.backup.inProgress));
        lines.push(formatKeyValue('Fehler in Folge', runtime.backup.consecutiveFailures));
        lines.push(formatKeyValue('Letzter Fehlercode', runtime.backup.lastErrorCode));
        lines.push(formatKeyValue('Letzte Fehlermeldung', runtime.backup.lastErrorMessage));
      }
      if (runtime.sync) {
        lines.push('', '[Synchronisierung]');
        lines.push(formatKeyValue('Status', runtime.sync.state));
        lines.push(formatKeyValue('Läuft', runtime.sync.inProgress));
        lines.push(formatKeyValue('Konflikte', runtime.sync.conflictCount));
        lines.push(formatKeyValue('Letzter Fehler', runtime.sync.lastError));
      }
      if (runtime.webClipper) {
        lines.push('', '[Web Clipper]');
        lines.push(formatKeyValue('Empfänger bereit', runtime.webClipper.receiverReady));
        lines.push(formatKeyValue('Browser verbunden', runtime.webClipper.browserConnected));
        lines.push(formatKeyValue('Letzter Fehler', runtime.webClipper.lastError));
      }
    }

    lines.push(
      '',
      'DATENSCHUTZ',
      '-----------',
      'Der Bericht wurde lokal erstellt. Er wird nicht automatisch übertragen.',
      'Persönliche Pfade, URLs und typische Zugangsdaten werden vor dem Speichern anonymisiert.',
      'Notizinhalte werden nicht gezielt erfasst.'
    );

    return lines.join('\n');
  }

  return {
    recordAutomatic,
    createManual,
    listReports,
    getReport,
    getSummary,
    markNotified,
    sanitizeText,
    formatReport,
    reportsDirectory
  };
}

module.exports = {
  REPORT_SCHEMA_VERSION,
  MAX_REPORTS,
  sanitizeText,
  sanitizeValue,
  createDiagnosticsService
};
