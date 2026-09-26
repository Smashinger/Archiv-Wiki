// build/publish-release.mjs
// Veröffentlicht Release-Artefakte auf Codeberg (und optional GitHub als Dual-Publish).
// Aufruf:
//   CODEBERG_TOKEN="xxx" [GH_TOKEN="yyy"] node build/publish-release.mjs

import fs from 'node:fs';
import path from 'node:path';

const PKG_PATH = path.resolve('package.json');
const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
const version = pkg.version;
const tagName = `v${version}`;
const releaseName = `Archiv-Wiki ${version}`;

console.log(`[Release] Starte Veröffentlichung für ${releaseName} (${tagName}) …`);

const distDir = path.resolve('dist');
const appImagePath = path.join(distDir, `Archiv-Wiki-${version}.AppImage`);
const latestYmlPath = path.join(distDir, 'latest-linux.yml');

if (!fs.existsSync(appImagePath)) {
  console.error(`[Fehler] AppImage nicht gefunden: ${appImagePath}`);
  console.error(`Bitte vorher 'npm run dist' ausführen.`);
  process.exit(1);
}

if (!fs.existsSync(latestYmlPath)) {
  console.error(`[Fehler] latest-linux.yml nicht gefunden: ${latestYmlPath}`);
  process.exit(1);
}

// 1. Release Notes auslesen falls vorhanden
let releaseBody = `Archiv-Wiki Version ${version}`;
const notesPath = path.resolve('renderer/js/release-notes.js');
if (fs.existsSync(notesPath)) {
  try {
    const raw = fs.readFileSync(notesPath, 'utf8');
    const match = raw.match(new RegExp(`'${version.replace(/\./g, '\\.')}':\\s*\\[([\\s\\S]*?)\\]`));
    if (match) {
      const items = [...match[1].matchAll(/title:\s*['"`](.*?)['"`]/g)].map(m => `- ${m[1]}`);
      if (items.length > 0) {
        releaseBody = `## Neuerungen und Änderungen in v${version}\n\n` + items.join('\n');
      }
    }
  } catch (err) {
    console.warn(`[Hinweis] Release Notes konnten nicht geparst werden: ${err.message}`);
  }
}

// 2. updates/latest-linux.yml mit absoluter Codeberg-URL aktualisieren
const updatesDir = path.resolve('updates');
fs.mkdirSync(updatesDir, { recursive: true });
const targetUpdatesYml = path.join(updatesDir, 'latest-linux.yml');

let ymlContent = fs.readFileSync(latestYmlPath, 'utf8');
const codebergAssetUrl = `https://codeberg.org/Smashii/Archiv-Wiki/releases/download/${tagName}/Archiv-Wiki-${version}.AppImage`;

// Ersetze relative Pfade durch die absolute Codeberg Download-URL
ymlContent = ymlContent
  .replace(/url:\s*Archiv-Wiki-[^\s]+/g, `url: ${codebergAssetUrl}`)
  .replace(/path:\s*Archiv-Wiki-[^\s]+/g, `path: ${codebergAssetUrl}`);

fs.writeFileSync(targetUpdatesYml, ymlContent, 'utf8');
console.log(`[Release] updates/latest-linux.yml aktualisiert ✓`);

// 3. Veröffentlichung auf Codeberg
const codebergToken = process.env.CODEBERG_TOKEN;
if (!codebergToken) {
  console.warn(`\n[Warnung] CODEBERG_TOKEN nicht gesetzt. Codeberg-Upload wird übersprungen.`);
  console.warn(`Setze CODEBERG_TOKEN="...", um Artefakte automatisch zu Codeberg hochzuladen.\n`);
} else {
  await publishToCodeberg({
    owner: 'Smashii',
    repo: 'Archiv-Wiki',
    tagName,
    releaseName,
    body: releaseBody,
    token: codebergToken,
    files: [
      { name: `Archiv-Wiki-${version}.AppImage`, path: appImagePath },
      { name: 'latest-linux.yml', path: latestYmlPath }
    ]
  });
}

// 4. Optional: Veröffentlichung auf GitHub (Dual-Publishing)
const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (ghToken) {
  console.log(`[Release] GH_TOKEN gefunden — erstelle parallelen Release auf GitHub …`);
  await publishToGitHub({
    owner: 'Smashinger',
    repo: 'Archiv-Wiki',
    tagName,
    releaseName,
    body: releaseBody,
    token: ghToken,
    files: [
      { name: `Archiv-Wiki-${version}.AppImage`, path: appImagePath },
      { name: 'latest-linux.yml', path: latestYmlPath }
    ]
  });
}

console.log(`\n[Fertig] Release-Vorbereitung für v${version} abgeschlossen.`);

// --- Hilfsfunktionen für Forgejo / Codeberg API ---

async function publishToCodeberg({ owner, repo, tagName, releaseName, body, token, files }) {
  console.log(`[Codeberg] Erstelle Release ${tagName} …`);
  const apiBase = `https://codeberg.org/api/v1/repos/${owner}/${repo}`;
  const headers = {
    'Authorization': `token ${token}`,
    'Accept': 'application/json'
  };

  // Prüfen, ob Release bereits existiert
  let releaseId = null;
  const listRes = await fetch(`${apiBase}/releases`, { headers });
  if (listRes.ok) {
    const list = await listRes.json();
    const existing = Array.isArray(list) && list.find(r => r.tag_name === tagName);
    if (existing) {
      releaseId = existing.id;
      console.log(`[Codeberg] Bestehender Release mit ID ${releaseId} gefunden.`);
    }
  }

  if (!releaseId) {
    const createRes = await fetch(`${apiBase}/releases`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: tagName,
        name: releaseName,
        body,
        draft: false,
        prerelease: false
      })
    });
    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Codeberg Release-Erstellung fehlgeschlagen (${createRes.status}): ${errText}`);
    }
    const created = await createRes.json();
    releaseId = created.id;
    console.log(`[Codeberg] Release ${tagName} erfolgreich erstellt (ID: ${releaseId}) ✓`);
  }

  // Assets hochladen
  for (const file of files) {
    console.log(`[Codeberg] Lade ${file.name} hoch …`);
    const fileBytes = fs.readFileSync(file.path);
    const formData = new FormData();
    formData.append('attachment', new Blob([fileBytes]), file.name);

    const uploadRes = await fetch(`${apiBase}/releases/${releaseId}/assets?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers,
      body: formData
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error(`[Codeberg] Upload von ${file.name} fehlgeschlagen (${uploadRes.status}): ${errText}`);
    } else {
      console.log(`[Codeberg] ${file.name} erfolgreich hochgeladen ✓`);
    }
  }
}

// --- Hilfsfunktionen für GitHub API ---

async function publishToGitHub({ owner, repo, tagName, releaseName, body, token, files }) {
  const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+v3+json',
    'User-Agent': 'Archiv-Wiki-Release-Script'
  };

  let release = null;
  const getRes = await fetch(`${apiBase}/releases/tags/${tagName}`, { headers });
  if (getRes.ok) {
    release = await getRes.json();
  } else {
    const createRes = await fetch(`${apiBase}/releases`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: tagName,
        name: releaseName,
        body,
        draft: false,
        prerelease: false
      })
    });
    if (!createRes.ok) {
      console.error(`[GitHub] Release-Erstellung fehlgeschlagen (${createRes.status})`);
      return;
    }
    release = await createRes.json();
  }

  const uploadUrlBase = release.upload_url.replace(/\{(\?name,label)?\}$/, '');
  for (const file of files) {
    console.log(`[GitHub] Lade ${file.name} hoch …`);
    const fileBytes = fs.readFileSync(file.path);
    const uploadRes = await fetch(`${uploadUrlBase}?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/octet-stream'
      },
      body: fileBytes
    });
    if (uploadRes.ok) {
      console.log(`[GitHub] ${file.name} erfolgreich hochgeladen ✓`);
    } else {
      console.warn(`[GitHub] Upload für ${file.name} übersprungen/fehlgeschlagen (${uploadRes.status})`);
    }
  }
}
