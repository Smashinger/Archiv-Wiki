'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const { atomicWriteFileSync, atomicCopyFileSync } = require('./atomic-write');

const BRAVE_FLATPAK_ID = 'com.brave.Browser';
const CHROMIUM_EXTENSION_ID = 'dengpgfllpkndkgkbikigaejieogndbp';
const CHROMIUM_EXTENSION_VERSION = '0.2.1';
const CRX_FILENAME = 'archiv-wiki-web-clipper.crx';
const INSTALL_SWITCH = '--install-brave-web-clipper';
// Sicherheitsfund WC-SP-002/M15: dieser talk-name ist die einzige Berechtigung,
// die der Brave-Flatpak-Native-Messaging-Weg tatsächlich benötigt
// (flatpak-spawn --host). Sie wird ausschließlich hier, nach ausdrücklicher
// Nutzerzustimmung, gesetzt — nie automatisch beim App-Start.
const FLATPAK_HOST_TALK_NAME = 'org.freedesktop.Flatpak';
// CRX3-Feldnummern gemäß offiziellem components/crx_file/crx3.proto
// (CrxFileHeader.sha256_with_rsa = 2, .sha256_with_ecdsa = 3,
// .signed_header_data = 10000; SignedData.crx_id = 1;
// AsymmetricKeyProof.public_key = 1, .signature = 2).
const CRX3_FIELD_SHA256_WITH_RSA = 2;
const CRX3_FIELD_SHA256_WITH_ECDSA = 3;
const CRX3_FIELD_SIGNED_HEADER_DATA = 10000;
const CRX3_FIELD_CRX_ID = 1;
const CRX3_FIELD_PROOF_PUBLIC_KEY = 1;
const CRX3_FIELD_PROOF_SIGNATURE = 2;
// Exakte Signaturbasis laut components/crx_file/crx_file.h (kSignatureContext):
// die ASCII-Zeichenfolge "CRX3 SignedData" gefolgt von einem Null-Oktett.
const CRX3_SIGNATURE_CONTEXT = Buffer.concat([Buffer.from('CRX3 SignedData', 'ascii'), Buffer.alloc(1)]);

function requireAbsoluteDirectory(directoryPath, label) {
  if (!path.isAbsolute(directoryPath)) {
    throw new Error(`${label} muss ein absoluter Pfad sein.`);
  }
  return directoryPath;
}

function getBundledCrxPath(resourcesPath) {
  return path.join(
    requireAbsoluteDirectory(resourcesPath, 'Der Ressourcenpfad'),
    'web-clipper',
    'chromium',
    CRX_FILENAME
  );
}

function resolveCrxSourcePath({ resourcesPath, isPackaged = true } = {}) {
  if (isPackaged) return getBundledCrxPath(resourcesPath);

  // Im ungepackten Start liegt dieses Modul unter <Projekt>/main. Der
  // Projektpfad wird deshalb aus dem Modulkontext abgeleitet; im gepackten
  // Endnutzerweg wird dieser Entwicklungszweig niemals verwendet.
  return path.resolve(
    __dirname,
    '..',
    'extension',
    'distribution',
    'chromium',
    CRX_FILENAME
  );
}

function getBraveFlatpakRoot(homePath) {
  return path.join(
    requireAbsoluteDirectory(homePath, 'Das Benutzerverzeichnis'),
    '.var',
    'app',
    BRAVE_FLATPAK_ID
  );
}

function isBraveFlatpakInstalled(homePath) {
  const braveRoot = getBraveFlatpakRoot(homePath);
  return fs.existsSync(braveRoot) && fs.statSync(braveRoot).isDirectory();
}

// Flatpak-eigener Ablageort für Benutzer-Overrides (siehe `flatpak override
// --user`); read-only ausgewertet, kein `flatpak`-Aufruf nötig, um den
// aktuellen Berechtigungsstand zu ermitteln.
function getFlatpakDataHome(homePath) {
  const xdgDataHome = process.env.XDG_DATA_HOME;
  if (xdgDataHome && path.isAbsolute(xdgDataHome)) return xdgDataHome;
  return path.join(requireAbsoluteDirectory(homePath, 'Das Benutzerverzeichnis'), '.local', 'share');
}

function getBraveFlatpakOverridesPath(homePath) {
  return path.join(getFlatpakDataHome(homePath), 'flatpak', 'overrides', BRAVE_FLATPAK_ID);
}

function braveFlatpakHasHostTalkName(homePath) {
  let content;
  try {
    content = fs.readFileSync(getBraveFlatpakOverridesPath(homePath), 'utf8');
  } catch {
    return false;
  }

  let inContextSection = false;
  const talkNames = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^\[.*\]$/.test(line)) {
      inContextSection = line === '[Context]';
      continue;
    }
    if (inContextSection && line.startsWith('talk-name=')) {
      talkNames.push(...line.slice('talk-name='.length).split(';').map(name => name.trim()).filter(Boolean));
    }
  }
  return talkNames.includes(FLATPAK_HOST_TALK_NAME);
}

// Read-only: keine Sandbox-relevante Ansicht wird durch diesen Aufruf
// verändert. Auf allen anderen Plattformen als Linux gibt es diesen
// Berechtigungspfad nicht.
function getBraveFlatpakPermissionStatus({ homePath, platform = process.platform } = {}) {
  if (platform !== 'linux') return { supported: false, installed: false, granted: false };
  const installed = isBraveFlatpakInstalled(homePath);
  return {
    supported: true,
    installed,
    granted: installed && braveFlatpakHasHostTalkName(homePath)
  };
}

// Einzige Stelle, die die persistente, app-weite Brave-Flatpak-Host-
// Berechtigung tatsächlich SETZT — wird ausschließlich nach ausdrücklicher
// Nutzerzustimmung im Web-Clipper-Einstellungsbereich aufgerufen, nie
// automatisch beim App-Start (Sicherheitsfund WC-SP-002/M15).
function grantBraveFlatpakHostPermission({ homePath, platform = process.platform } = {}) {
  if (platform !== 'linux') {
    throw new Error('Diese Berechtigung wird nur unter Linux benötigt.');
  }
  if (!isBraveFlatpakInstalled(homePath)) {
    throw new Error(`Brave-Flatpak wurde im erwarteten Benutzerbereich nicht gefunden: ${getBraveFlatpakRoot(homePath)}`);
  }
  try {
    execFileSync('flatpak', ['override', '--user', `--talk-name=${FLATPAK_HOST_TALK_NAME}`, BRAVE_FLATPAK_ID], { stdio: 'pipe' });
  } catch (error) {
    const details = (error.stderr || error.message || '').toString().trim();
    throw new Error(`Die Flatpak-Berechtigung konnte nicht gesetzt werden${details ? ': ' + details : '.'}`);
  }
  return { granted: true };
}

// Entfernt gezielt NUR den von Archiv-Wiki benötigten talk-name — `--no-
// talk-name` (dokumentiertes Flatpak-Verhalten) statt `--reset`, damit
// andere, vom Nutzer unabhängig gesetzte Brave-Overrides erhalten bleiben.
function revokeBraveFlatpakHostPermission({ homePath, platform = process.platform } = {}) {
  if (platform !== 'linux') {
    throw new Error('Diese Berechtigung wird nur unter Linux benötigt.');
  }
  try {
    execFileSync('flatpak', ['override', '--user', `--no-talk-name=${FLATPAK_HOST_TALK_NAME}`, BRAVE_FLATPAK_ID], { stdio: 'pipe' });
  } catch (error) {
    const details = (error.stderr || error.message || '').toString().trim();
    throw new Error(`Die Flatpak-Berechtigung konnte nicht entfernt werden${details ? ': ' + details : '.'}`);
  }
  return { granted: false };
}

function getStableCrxPath(homePath) {
  // Brave-Flatpak kann ohne zusätzliche Berechtigung nur sein eigenes
  // persistentes XDG-Datenverzeichnis lesen. Der allgemeine Host-Pfad
  // ~/.local/share/archiv-wiki wäre aus der Sandbox nicht erreichbar.
  return path.join(
    getBraveFlatpakRoot(homePath),
    'data',
    'archiv-wiki',
    'web-clipper',
    'chromium',
    CRX_FILENAME
  );
}

function getBraveRegistrationPath(homePath) {
  // Exakt der in Q-012.8.5.6.2 real bestätigte rootfreie Brave-Flatpak-Pfad.
  return path.join(
    getBraveFlatpakRoot(homePath),
    'config',
    'BraveSoftware',
    'Brave-Browser',
    'External Extensions',
    `${CHROMIUM_EXTENSION_ID}.json`
  );
}

function readVarint(buffer, startOffset) {
  let value = 0;
  let multiplier = 1;
  let offset = startOffset;

  while (offset < buffer.length && multiplier <= 2 ** 49) {
    const byte = buffer[offset];
    value += (byte & 0x7f) * multiplier;
    offset += 1;
    if ((byte & 0x80) === 0) return { value, offset };
    multiplier *= 128;
  }

  throw new Error('Die CRX3-Kopfdaten sind beschädigt.');
}

// Gemeinsamer Feld-Scanner für die flachen CRX3-Kopfdaten-Protobufs
// (CrxFileHeader/SignedData/AsymmetricKeyProof): liefert jedes Length-
// delimited-Feld (wire type 2) mit seiner Feldnummer. Einzelfeld- und
// Wiederholungsfeld-Zugriffe teilen sich dieselbe Scan-Logik.
function* iterateLengthDelimitedFields(buffer) {
  let offset = 0;

  while (offset < buffer.length) {
    const key = readVarint(buffer, offset);
    offset = key.offset;
    const fieldNumber = Math.floor(key.value / 8);
    const wireType = key.value & 7;

    if (wireType === 0) {
      offset = readVarint(buffer, offset).offset;
      continue;
    }
    if (wireType === 1) {
      offset += 8;
      continue;
    }
    if (wireType === 5) {
      offset += 4;
      continue;
    }
    if (wireType !== 2) {
      throw new Error('Die CRX3-Kopfdaten verwenden ein unbekanntes Format.');
    }

    const lengthInfo = readVarint(buffer, offset);
    offset = lengthInfo.offset;
    const endOffset = offset + lengthInfo.value;
    if (endOffset > buffer.length) {
      throw new Error('Die CRX3-Kopfdaten sind unvollständig.');
    }
    yield { fieldNumber, value: buffer.subarray(offset, endOffset) };
    offset = endOffset;
  }
}

function readLengthDelimitedField(buffer, wantedField) {
  for (const field of iterateLengthDelimitedFields(buffer)) {
    if (field.fieldNumber === wantedField) return field.value;
  }
  return null;
}

function readAllLengthDelimitedFields(buffer, wantedField) {
  const values = [];
  for (const field of iterateLengthDelimitedFields(buffer)) {
    if (field.fieldNumber === wantedField) values.push(field.value);
  }
  return values;
}

function chromiumIdFromBytes(bytes) {
  const alphabet = 'abcdefghijklmnop';
  return Array.from(bytes, (value) => (
    alphabet[value >> 4] + alphabet[value & 15]
  )).join('');
}

function chromiumIdFromManifestKey(manifestKey) {
  let publicKey;
  try {
    publicKey = Buffer.from(String(manifestKey || ''), 'base64');
  } catch {
    throw new Error('Der öffentliche Chromium-Schlüssel in der CRX ist ungültig.');
  }
  if (publicKey.length === 0) {
    throw new Error('Der öffentliche Chromium-Schlüssel fehlt in der CRX.');
  }
  return chromiumIdFromBytes(crypto.createHash('sha256').update(publicKey).digest().subarray(0, 16));
}

// Liest alle Signaturnachweise (AsymmetricKeyProof) eines CRX3-Kopfes für ein
// gegebenes Wiederholungsfeld (sha256_with_rsa/sha256_with_ecdsa) aus.
function readCrxKeyProofs(crxHeader, fieldNumber, algorithm) {
  return readAllLengthDelimitedFields(crxHeader, fieldNumber).map((proofBuffer) => {
    const publicKey = readLengthDelimitedField(proofBuffer, CRX3_FIELD_PROOF_PUBLIC_KEY);
    const signature = readLengthDelimitedField(proofBuffer, CRX3_FIELD_PROOF_SIGNATURE);
    if (!publicKey || !signature) {
      throw new Error('Ein Signaturnachweis im CRX3-Kopf ist unvollständig.');
    }
    return { algorithm, publicKey, signature };
  });
}

// Verifiziert einen einzelnen CRX3-Signaturnachweis exakt nach dem offiziellen
// Chromium-Vertrag (components/crx_file/crx_verifier.cc, VerifyCrx3): die
// Signatur deckt "CRX3 SignedData\0" + LE32(len(signed_header_data)) +
// signed_header_data + Archiv (ZIP) ab, mit dem im Nachweis mitgelieferten
// öffentlichen Schlüssel (X.509 SubjectPublicKeyInfo).
function verifyCrxKeyProof(proof, signedMessage) {
  let publicKey;
  try {
    publicKey = crypto.createPublicKey({ key: Buffer.from(proof.publicKey), format: 'der', type: 'spki' });
  } catch (error) {
    throw new Error('Ein öffentlicher Schlüssel im CRX3-Kopf ist ungültig.', { cause: error });
  }

  if (proof.algorithm === 'rsa') {
    if (publicKey.asymmetricKeyType !== 'rsa') {
      throw new Error('Ein RSA-Signaturnachweis im CRX3-Kopf verwendet keinen RSA-Schlüssel.');
    }
    return crypto.verify('RSA-SHA256', signedMessage, { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(proof.signature));
  }
  if (proof.algorithm === 'ecdsa') {
    if (publicKey.asymmetricKeyType !== 'ec') {
      throw new Error('Ein ECDSA-Signaturnachweis im CRX3-Kopf verwendet keinen EC-Schlüssel.');
    }
    return crypto.verify('SHA256', signedMessage, publicKey, Buffer.from(proof.signature));
  }
  throw new Error('Unbekannter Signaturtyp im CRX3-Kopf.');
}

// Kryptografische CRX3-Kernprüfung (Sicherheitsfund WC-SP-004/M17): bisher
// wurden nur Format, Chromium-ID und Version geprüft, nie die tatsächliche
// Signatur. Ohne diese Prüfung könnte ein beliebig manipuliertes Archiv mit
// bloß passenden Metadaten die bisherige Kontrolle bestehen. Jetzt: JEDER im
// Kopf vorhandene Signaturnachweis muss kryptografisch gültig sein, UND
// mindestens einer der dabei gültig verifizierten öffentlichen Schlüssel muss
// per SHA-256 exakt zur signierten crx_id gehören — nur dann ist die
// Extension-ID tatsächlich durch eine echte Signatur belegt, nicht nur durch
// unbeglaubigte Metadaten.
function verifyCrxSignedContents({ crxHeader, signedHeaderData, archive, expectedCrxId }) {
  const proofs = [
    ...readCrxKeyProofs(crxHeader, CRX3_FIELD_SHA256_WITH_RSA, 'rsa'),
    ...readCrxKeyProofs(crxHeader, CRX3_FIELD_SHA256_WITH_ECDSA, 'ecdsa')
  ];
  if (proofs.length === 0) {
    throw new Error('Die CRX enthält keinen Signaturnachweis.');
  }

  const headerSizeOctets = Buffer.alloc(4);
  headerSizeOctets.writeInt32LE(signedHeaderData.length, 0);
  const signedMessage = Buffer.concat([
    CRX3_SIGNATURE_CONTEXT,
    headerSizeOctets,
    Buffer.from(signedHeaderData),
    Buffer.from(archive)
  ]);

  let matchingKeyVerified = false;
  for (const proof of proofs) {
    if (!verifyCrxKeyProof(proof, signedMessage)) {
      throw new Error('Eine Signatur im CRX3-Kopf konnte nicht verifiziert werden.');
    }
    if (chromiumIdFromBytes(crypto.createHash('sha256').update(Buffer.from(proof.publicKey)).digest().subarray(0, 16)) === expectedCrxId) {
      matchingKeyVerified = true;
    }
  }
  if (!matchingKeyVerified) {
    throw new Error('Kein kryptografisch verifizierter Schlüssel im CRX3-Kopf gehört zur signierten Extension-ID.');
  }
}

function findEndOfCentralDirectory(zipBuffer) {
  const signature = 0x06054b50;
  const minimumOffset = Math.max(0, zipBuffer.length - 22 - 0xffff);
  for (let offset = zipBuffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (zipBuffer.readUInt32LE(offset) === signature) return offset;
  }
  throw new Error('Das ZIP-Paket innerhalb der CRX ist ungültig.');
}

function readManifestFromZip(zipBuffer) {
  const endOffset = findEndOfCentralDirectory(zipBuffer);
  const entryCount = zipBuffer.readUInt16LE(endOffset + 10);
  let offset = zipBuffer.readUInt32LE(endOffset + 16);

  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    if (offset + 46 > zipBuffer.length || zipBuffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('Das ZIP-Verzeichnis innerhalb der CRX ist beschädigt.');
    }

    const flags = zipBuffer.readUInt16LE(offset + 8);
    const compressionMethod = zipBuffer.readUInt16LE(offset + 10);
    const compressedSize = zipBuffer.readUInt32LE(offset + 20);
    const fileNameLength = zipBuffer.readUInt16LE(offset + 28);
    const extraLength = zipBuffer.readUInt16LE(offset + 30);
    const commentLength = zipBuffer.readUInt16LE(offset + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    const fileName = zipBuffer.subarray(nameStart, nameEnd).toString('utf8');

    if (fileName === 'manifest.json') {
      if ((flags & 1) !== 0) throw new Error('Das Manifest innerhalb der CRX ist unerwartet verschlüsselt.');
      if (localHeaderOffset + 30 > zipBuffer.length || zipBuffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error('Der Manifest-Eintrag innerhalb der CRX ist beschädigt.');
      }
      const localNameLength = zipBuffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = zipBuffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const dataEnd = dataStart + compressedSize;
      if (dataEnd > zipBuffer.length) throw new Error('Das Manifest innerhalb der CRX ist unvollständig.');
      const compressedData = zipBuffer.subarray(dataStart, dataEnd);
      let manifestData;
      if (compressionMethod === 0) manifestData = compressedData;
      else if (compressionMethod === 8) manifestData = zlib.inflateRawSync(compressedData);
      else throw new Error('Das Manifest innerhalb der CRX verwendet eine unbekannte Komprimierung.');
      if (manifestData.length > 1024 * 1024) throw new Error('Das Manifest innerhalb der CRX ist unerwartet groß.');
      try {
        return JSON.parse(manifestData.toString('utf8'));
      } catch {
        throw new Error('Das Manifest innerhalb der CRX ist kein gültiges JSON.');
      }
    }

    offset = nameEnd + extraLength + commentLength;
  }

  throw new Error('Die CRX enthält kein manifest.json.');
}

function inspectCrxFile(crxPath) {
  let crxData;
  try {
    crxData = fs.readFileSync(crxPath);
  } catch (error) {
    throw new Error(`Die signierte Web-Clipper-CRX fehlt oder ist nicht lesbar: ${crxPath}`, { cause: error });
  }

  if (crxData.length < 12 || crxData.subarray(0, 4).toString('ascii') !== 'Cr24') {
    throw new Error('Das Web-Clipper-Artefakt besitzt keinen gültigen CRX-Kopf.');
  }

  const formatVersion = crxData.readUInt32LE(4);
  if (formatVersion !== 3) {
    throw new Error(`Das Web-Clipper-Artefakt verwendet CRX${formatVersion} statt CRX3.`);
  }

  const headerSize = crxData.readUInt32LE(8);
  const zipOffset = 12 + headerSize;
  if (headerSize === 0 || zipOffset >= crxData.length) {
    throw new Error('Der CRX3-Kopf ist unvollständig.');
  }

  const crxHeader = crxData.subarray(12, zipOffset);
  const signedHeaderData = readLengthDelimitedField(crxHeader, CRX3_FIELD_SIGNED_HEADER_DATA);
  const crxIdBytes = signedHeaderData && readLengthDelimitedField(signedHeaderData, CRX3_FIELD_CRX_ID);
  if (!crxIdBytes || crxIdBytes.length !== 16) {
    throw new Error('Die signierte Chromium-ID fehlt im CRX3-Kopf.');
  }

  const signedExtensionId = chromiumIdFromBytes(crxIdBytes);
  // Kryptografische Kernprüfung (WC-SP-004/M17): erst danach gilt signedExtensionId
  // als tatsächlich durch eine gültige Signatur belegt, nicht nur als unbeglaubigter
  // Header-Wert.
  verifyCrxSignedContents({
    crxHeader,
    signedHeaderData,
    archive: crxData.subarray(zipOffset),
    expectedCrxId: signedExtensionId
  });

  const manifest = readManifestFromZip(crxData.subarray(zipOffset));
  const manifestExtensionId = chromiumIdFromManifestKey(manifest.key);
  const manifestVersion = String(manifest.version || '');

  if (signedExtensionId !== CHROMIUM_EXTENSION_ID || manifestExtensionId !== CHROMIUM_EXTENSION_ID) {
    throw new Error(`Die CRX gehört nicht zur erwarteten Chromium-ID ${CHROMIUM_EXTENSION_ID}.`);
  }
  if (manifestVersion !== CHROMIUM_EXTENSION_VERSION) {
    throw new Error(`Die CRX-Version ${manifestVersion || '(fehlt)'} entspricht nicht ${CHROMIUM_EXTENSION_VERSION}.`);
  }

  return {
    formatVersion,
    extensionId: signedExtensionId,
    extensionVersion: manifestVersion,
    signatureVerified: true,
    sha256: crypto.createHash('sha256').update(crxData).digest('hex'),
    size: crxData.length
  };
}

function filesHaveSameContent(leftPath, rightPath) {
  try {
    const leftStat = fs.statSync(leftPath);
    const rightStat = fs.statSync(rightPath);
    if (!leftStat.isFile() || !rightStat.isFile() || leftStat.size !== rightStat.size) return false;
    const leftHash = crypto.createHash('sha256').update(fs.readFileSync(leftPath)).digest();
    const rightHash = crypto.createHash('sha256').update(fs.readFileSync(rightPath)).digest();
    return crypto.timingSafeEqual(leftHash, rightHash);
  } catch {
    return false;
  }
}

function installBraveWebClipper({
  resourcesPath,
  homePath,
  platform = process.platform,
  isPackaged = true
} = {}) {
  if (platform !== 'linux') {
    throw new Error('Die vorbereitete Web-Clipper-Installation unterstützt derzeit ausschließlich Linux.');
  }

  if (!isBraveFlatpakInstalled(homePath)) {
    throw new Error(`Brave-Flatpak wurde im erwarteten Benutzerbereich nicht gefunden: ${getBraveFlatpakRoot(homePath)}`);
  }

  const sourceCrxPath = resolveCrxSourcePath({ resourcesPath, isPackaged });
  const crxMetadata = inspectCrxFile(sourceCrxPath);
  const stableCrxPath = getStableCrxPath(homePath);
  const registrationPath = getBraveRegistrationPath(homePath);

  fs.mkdirSync(path.dirname(stableCrxPath), { recursive: true });
  const crxUpdated = !filesHaveSameContent(sourceCrxPath, stableCrxPath);
  if (crxUpdated) atomicCopyFileSync(sourceCrxPath, stableCrxPath);
  fs.chmodSync(stableCrxPath, 0o644);

  // Die bewusste Aktion erneuert die Registrierung auch dann atomar, wenn ihr
  // Inhalt gleich ist. Sie bereitet damit eine Erstinstallation oder ein
  // Update vor. Nach einer bewussten Entfernung blockiert Brave externe
  // Neuinstallationen derselben ID dauerhaft; dieser Browserzustand wird hier
  // ausdrücklich weder umgangen noch manipuliert.
  fs.mkdirSync(path.dirname(registrationPath), { recursive: true });
  const registration = `${JSON.stringify({
    external_crx: stableCrxPath,
    external_version: CHROMIUM_EXTENSION_VERSION
  }, null, 2)}\n`;
  atomicWriteFileSync(registrationPath, registration, 'utf8');
  fs.chmodSync(registrationPath, 0o644);

  return {
    prepared: true,
    browser: 'brave-flatpak',
    extensionId: CHROMIUM_EXTENSION_ID,
    extensionVersion: CHROMIUM_EXTENSION_VERSION,
    crxPath: stableCrxPath,
    registrationPath,
    crxUpdated,
    browserRestartRequired: true,
    crxSha256: crxMetadata.sha256
  };
}

function registerWebClipperDistributionIpc({
  ipcMain,
  resourcesPath,
  homePath,
  platform = process.platform,
  isPackaged = true
}) {
  ipcMain.handle('webclip:installBrave', () => installBraveWebClipper({
    resourcesPath,
    homePath,
    platform,
    isPackaged
  }));
  ipcMain.handle('webclip:getBraveFlatpakPermissionStatus', () => getBraveFlatpakPermissionStatus({ homePath, platform }));
  ipcMain.handle('webclip:grantBraveFlatpakPermission', () => grantBraveFlatpakHostPermission({ homePath, platform }));
  ipcMain.handle('webclip:revokeBraveFlatpakPermission', () => revokeBraveFlatpakHostPermission({ homePath, platform }));
}

module.exports = {
  BRAVE_FLATPAK_ID,
  CHROMIUM_EXTENSION_ID,
  CHROMIUM_EXTENSION_VERSION,
  CRX_FILENAME,
  INSTALL_SWITCH,
  FLATPAK_HOST_TALK_NAME,
  getBundledCrxPath,
  resolveCrxSourcePath,
  getStableCrxPath,
  getBraveRegistrationPath,
  getBraveFlatpakOverridesPath,
  inspectCrxFile,
  installBraveWebClipper,
  getBraveFlatpakPermissionStatus,
  grantBraveFlatpakHostPermission,
  revokeBraveFlatpakHostPermission,
  registerWebClipperDistributionIpc
};
