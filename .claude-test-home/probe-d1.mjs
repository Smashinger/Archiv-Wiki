// D1-Fix-Test: prüft, ob "Bestehende Notiz ergänzen" nur bei image angeboten
// wird, und dass "Als neue Notiz verarbeiten" für alle Typen unverändert
// funktioniert. Läuft mit isoliertem HOME/XDG-Profil gegen das Test-Wiki.
import { _electron as electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_DIR = '/home/smashii/Dokumente/Archiv Wiki/archiv-wiki';
const TEST_HOME = path.join(APP_DIR, '.claude-test-home');
const SHOT_DIR = path.join(TEST_HOME, 'shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const cleanEnv = { ...process.env };
delete cleanEnv.ELECTRON_RUN_AS_NODE;
cleanEnv.HOME = TEST_HOME;
cleanEnv.XDG_CONFIG_HOME = path.join(TEST_HOME, '.config');
cleanEnv.XDG_CACHE_HOME = path.join(TEST_HOME, '.cache');
cleanEnv.XDG_DATA_HOME = path.join(TEST_HOME, '.local/share');

async function launch() {
  const app = await electron.launch({
    executablePath: path.join(APP_DIR, 'node_modules/electron/dist/electron'),
    args: ['--disable-gpu', '--disable-gpu-compositing', APP_DIR],
    env: cleanEnv,
    timeout: 30_000,
  });
  await new Promise(r => setTimeout(r, 6000));
  const page = app.windows().find(w => !w.url().startsWith('devtools://')) ?? await app.firstWindow();
  return { app, page };
}

async function main() {
  let { app, page } = await launch();
  console.log('launched (1st):', page.url());

  // Erststart: kein Projekt bekannt -> Wizard. Test-Wiki direkt per IPC
  // öffnen (umgeht nur den nativen Ordnerauswahl-Dialog, keine App-Logik).
  const onWizard = page.url().includes('wizard.html');
  console.log('on wizard:', onWizard);
  if (onWizard) {
    await page.evaluate(async () => {
      await window.archivAPI.finishWizard({
        projectPath: '/home/smashii/Dokumente/Archiv Wiki/archiv-wiki/.claude-test-wiki',
        wikiName: 'D1 Test Wiki',
        accentKey: 'orange'
      });
    }).catch((e) => console.log('wizard finish evaluate (expected to possibly race the window close):', e.message));
    await app.close().catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
    ({ app, page } = await launch());
    console.log('launched (2nd, after wizard):', page.url());
  }

  await page.evaluate(() => { location.hash = '#incoming'; });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(SHOT_DIR, '01-incoming-list.png') });

  const rows = await page.evaluate(() => {
    return [...document.querySelectorAll('.incoming-row')].map(row => ({
      title: row.querySelector('.dr-title')?.textContent?.trim(),
      typeTag: row.querySelector('.dr-tag')?.textContent?.trim(),
      relPath: row.querySelector('.incoming-row-open')?.getAttribute('aria-label')
    }));
  });
  console.log('incoming rows:', JSON.stringify(rows, null, 2));

  // Für jeden Eintrag: öffnen, Dialog öffnen, prüfen ob append-note-Option da ist.
  const ids = await page.evaluate(() => {
    return [...document.querySelectorAll('.incoming-select-checkbox')].map(cb => cb.dataset.incomingId);
  });
  console.log('ids:', ids);

  const results = [];
  for (const id of ids) {
    await page.evaluate((entryId) => { location.hash = '#incoming/' + encodeURIComponent(entryId); }, id);
    await new Promise(r => setTimeout(r, 500));
    const typeLabel = await page.evaluate(() => document.querySelector('.note-document-meta')?.innerText || '');
    await page.evaluate(() => document.getElementById('btnProcessIncoming')?.click());
    await new Promise(r => setTimeout(r, 300));
    const dialogState = await page.evaluate(() => {
      const overlay = document.querySelector('.incoming-process-overlay');
      if (!overlay) return null;
      const options = [...overlay.querySelectorAll('input[name="incomingProcessMode"]')].map(i => i.value);
      return { options };
    });
    await page.screenshot({ path: path.join(SHOT_DIR, `dialog-${id.slice(0, 8)}.png`) });
    results.push({ id, typeLabel, dialogOptions: dialogState?.options });
    // Dialog schließen (Abbrechen), zurück zur Liste
    await page.evaluate(() => document.querySelector('.incoming-process-overlay [data-action="cancel"]')?.click());
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('RESULTS:', JSON.stringify(results, null, 2));

  // Regressionstest: "Als neue Notiz verarbeiten" funktioniert weiterhin
  // (am Beispiel des Text-Eintrags), landet im Entwurf, speichert erfolgreich.
  const textId = results.find(r => r.dialogOptions && r.dialogOptions.length === 1)?.id;
  if (textId) {
    await page.evaluate((entryId) => { location.hash = '#incoming/' + encodeURIComponent(entryId); }, textId);
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate(() => document.getElementById('btnProcessIncoming')?.click());
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate(() => document.querySelector('.incoming-process-overlay [data-action="continue"]')?.click());
    await new Promise(r => setTimeout(r, 800));
    const draftUrl = page.url();
    console.log('new-note draft url:', draftUrl);
    await page.screenshot({ path: path.join(SHOT_DIR, '02-new-note-draft.png') });

    await page.evaluate(() => document.getElementById('btnSaveIncomingDraft')?.click());
    await new Promise(r => setTimeout(r, 1000));
    const afterSaveUrl = page.url();
    console.log('after save url:', afterSaveUrl);
    await page.screenshot({ path: path.join(SHOT_DIR, '03-after-save.png') });
  }

  // Regressionstest: Bild-Eintrag -> "Bestehende Notiz ergänzen" funktioniert weiterhin.
  const imageId = results.find(r => r.dialogOptions && r.dialogOptions.includes('append-note'))?.id;
  if (imageId) {
    await page.evaluate((entryId) => { location.hash = '#incoming/' + encodeURIComponent(entryId); }, imageId);
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate(() => document.getElementById('btnProcessIncoming')?.click());
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate(() => {
      const radio = document.querySelector('.incoming-process-overlay input[value="append-note"]');
      if (radio) radio.checked = true;
    });
    await page.evaluate(() => document.querySelector('.incoming-process-overlay [data-action="continue"]')?.click());
    await new Promise(r => setTimeout(r, 500));
    const pickerVisible = await page.evaluate(() => Boolean(document.querySelector('.category-picker-modal, .prompt-overlay')));
    console.log('append-note flow reached target picker/next step:', pickerVisible, 'url:', page.url());
    await page.screenshot({ path: path.join(SHOT_DIR, '04-image-append-flow.png') });
  }

  await app.close();
  console.log('done');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
