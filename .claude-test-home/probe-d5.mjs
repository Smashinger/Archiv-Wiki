// D5-Test: Template-Auswahl bei Eingang -> neue Notiz.
import { _electron as electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_DIR = '/home/smashii/Dokumente/Archiv Wiki/archiv-wiki';
const TEST_HOME = path.join(APP_DIR, '.claude-test-home');
const TEST_WIKI = path.join(APP_DIR, '.claude-test-wiki');
const SHOT_DIR = path.join(TEST_HOME, 'shots-d5');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const cleanEnv = { ...process.env };
delete cleanEnv.ELECTRON_RUN_AS_NODE;
cleanEnv.HOME = TEST_HOME;
cleanEnv.XDG_CONFIG_HOME = path.join(TEST_HOME, '.config');
cleanEnv.XDG_CACHE_HOME = path.join(TEST_HOME, '.cache');
cleanEnv.XDG_DATA_HOME = path.join(TEST_HOME, '.local/share');

const CUSTOM_TEMPLATE_BODY =
  '# {title}\n\nErstellt am {date} um {time} ({year}).\n\nUnbekannt: {foo}\n\n## Notizen\n\n';

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

function readNoteFile(relPathUnderWiki) {
  return fs.readFileSync(path.join(TEST_WIKI, relPathUnderWiki), 'utf8');
}

async function main() {
  const { app, page } = await launch();
  console.log('launched:', page.url());

  // Eigene Vorlage anlegen -- exakt derselbe Mechanismus wie saveNoteAsTemplate().
  await page.evaluate(async (body) => {
    await window.archivAPI.fs.setProjectSetting('customTemplates', [
      { key: 'd5-test-custom', label: 'D5 Testvorlage', body, custom: true }
    ]);
  }, CUSTOM_TEMPLATE_BODY);
  await new Promise(r => setTimeout(r, 300));

  await page.evaluate(() => { location.hash = '#incoming'; });
  await new Promise(r => setTimeout(r, 800));

  const ids = await page.evaluate(() => {
    return [...document.querySelectorAll('.incoming-row')].map(row => ({
      id: row.querySelector('.incoming-select-checkbox')?.dataset.incomingId,
      title: row.querySelector('.dr-title')?.textContent?.trim(),
      typeTag: row.querySelector('.dr-tag')?.textContent?.trim()
    }));
  });
  console.log('entries:', JSON.stringify(ids, null, 2));

  async function openAndProcess(id, templateChoice) {
    // templateChoice: 'none' | 'builtin' | 'custom'
    await page.evaluate((entryId) => { location.hash = '#incoming/' + encodeURIComponent(entryId); }, id);
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate(() => document.getElementById('btnProcessIncoming')?.click());
    await new Promise(r => setTimeout(r, 300));
    // Im Verarbeitungs-Dialog immer "Neue Notiz erstellen" waehlen + Weiter.
    await page.evaluate(() => {
      const radio = document.querySelector('.incoming-process-overlay input[value="new-note"]');
      if (radio) radio.checked = true;
    });
    await page.evaluate(() => document.querySelector('.incoming-process-overlay [data-action="continue"]')?.click());
    await new Promise(r => setTimeout(r, 300));

    // Template-Dialog.
    const dialogInfo = await page.evaluate(() => {
      const overlay = document.querySelector('.prompt-overlay:not(.incoming-process-overlay)');
      if (!overlay) return null;
      return {
        hasNone: Boolean(overlay.querySelector('[data-none]')),
        builtinKeys: [...overlay.querySelectorAll('[data-key]')].map(b => b.dataset.key),
        customKeys: [...overlay.querySelectorAll('[data-custom-key]')].map(b => b.dataset.customKey)
      };
    });

    if (templateChoice === 'none') {
      await page.evaluate(() => document.querySelector('[data-none]')?.click());
    } else if (templateChoice === 'builtin') {
      await page.evaluate(() => {
        [...document.querySelectorAll('[data-key]')].find(b => b.dataset.key === 'setup')?.click();
      });
    } else if (templateChoice === 'custom') {
      await page.evaluate(() => {
        document.querySelector('[data-custom-key="d5-test-custom"]')?.click();
      });
    }
    await new Promise(r => setTimeout(r, 600));

    const url = page.url();
    const editorContent = await page.evaluate(() => {
      const cm = document.querySelector('#editorContainer .cm-content');
      return cm ? cm.innerText : null;
    });
    return { dialogInfo, url, editorContent };
  }

  async function saveDraft() {
    await page.evaluate(() => document.getElementById('btnSaveIncomingDraft')?.click());
    await new Promise(r => setTimeout(r, 1000));
    return page.url();
  }

  const results = {};

  // 1) keine Vorlage
  {
    const entry = ids.find(e => e.title === 'Test URL');
    const r = await openAndProcess(entry.id, 'none');
    console.log('1) keine Vorlage - dialogInfo:', JSON.stringify(r.dialogInfo));
    await page.screenshot({ path: path.join(SHOT_DIR, '01-none-draft.png') });
    const afterSaveUrl = await saveDraft();
    results.none = { entry, editorContentBeforeSave: r.editorContent, afterSaveUrl };
  }

  // 2) eingebautes Template
  {
    const entry = ids.find(e => e.title === 'Test Textauswahl');
    const r = await openAndProcess(entry.id, 'builtin');
    console.log('2) eingebautes Template - dialogInfo:', JSON.stringify(r.dialogInfo));
    await page.screenshot({ path: path.join(SHOT_DIR, '02-builtin-draft.png') });
    const afterSaveUrl = await saveDraft();
    results.builtin = { entry, editorContentBeforeSave: r.editorContent, afterSaveUrl };
  }

  // 3) benutzerdefiniertes Template (webpage/page) - Variablen + unbekannter Platzhalter
  {
    const entry = ids.find(e => e.title === 'Test ganze Seite');
    const r = await openAndProcess(entry.id, 'custom');
    console.log('3) custom Template (page) - dialogInfo:', JSON.stringify(r.dialogInfo));
    await page.screenshot({ path: path.join(SHOT_DIR, '03-custom-page-draft.png') });
    const afterSaveUrl = await saveDraft();
    results.customPage = { entry, editorContentBeforeSave: r.editorContent, afterSaveUrl };
  }

  // 4) benutzerdefiniertes Template (text)
  {
    const entry = ids.find(e => e.title === 'Testtext');
    const r = await openAndProcess(entry.id, 'custom');
    const afterSaveUrl = await saveDraft();
    results.customText = { entry, editorContentBeforeSave: r.editorContent, afterSaveUrl };
  }

  // 5) benutzerdefiniertes Template (Datei)
  {
    const entry = ids.find(e => e.title === 'seed-source.txt');
    const r = await openAndProcess(entry.id, 'custom');
    const afterSaveUrl = await saveDraft();
    results.customFile = { entry, editorContentBeforeSave: r.editorContent, afterSaveUrl };
  }

  // 6) benutzerdefiniertes Template (Bild -> neue Notiz)
  {
    const entry = ids.find(e => e.title === 'icon-48.png');
    const r = await openAndProcess(entry.id, 'custom');
    console.log('6) custom Template (image) - editorContent:', JSON.stringify(r.editorContent));
    await page.screenshot({ path: path.join(SHOT_DIR, '06-custom-image-draft.png') });
    const afterSaveUrl = await saveDraft();
    results.customImage = { entry, editorContentBeforeSave: r.editorContent, afterSaveUrl };
  }

  console.log('RESULTS:', JSON.stringify(results, null, 2));

  await app.close();
  console.log('done');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
