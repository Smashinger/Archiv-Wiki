import { _electron as electron } from 'playwright-core';
import * as path from 'node:path';
const APP_DIR = '/home/smashii/Dokumente/Archiv Wiki/archiv-wiki';
const TEST_HOME = path.join(APP_DIR, '.claude-test-home');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
env.HOME = TEST_HOME; env.XDG_CONFIG_HOME = path.join(TEST_HOME, '.config');
env.XDG_CACHE_HOME = path.join(TEST_HOME, '.cache'); env.XDG_DATA_HOME = path.join(TEST_HOME, '.local/share');
const app = await electron.launch({ executablePath: path.join(APP_DIR,'node_modules/electron/dist/electron'), args:['--disable-gpu', APP_DIR], env, timeout:30000 });
await new Promise(r=>setTimeout(r,6000));
const page = app.windows().find(w=>!w.url().startsWith('devtools://')) ?? await app.firstWindow();
await page.setViewportSize({ width: 1400, height: 900 });
await page.evaluate(()=>document.getElementById('btnSettings')?.click());
await new Promise(r=>setTimeout(r,1200));

// Genau der Weg des Nutzers: Fenster auf (Allgemein), dann auf Web Clipper.
for (const [step, section, selectId] of [
  ['1. direkt Editor', 'editor', 'stFontSize'],
  ['2. dann Backup', 'backup', 'stBackupInterval'],
  ['3. dann Web Clipper', 'webclipper', 'stWebClipperDefaultMode']
]) {
  await page.evaluate((s)=>document.querySelector(`.aws-tab[data-section="${s}"]`)?.click(), section);
  await new Promise(r=>setTimeout(r,800));
  await page.click(`#${selectId} .aws-select-value`);
  await new Promise(r=>setTimeout(r,350));
  const open = await page.evaluate((id)=>{
    const menu = document.querySelector(`#${id} .aws-select-menu`);
    return { menuOpen: menu ? !menu.hidden : null, options: menu ? menu.children.length : 0 };
  }, selectId);
  console.log(step, JSON.stringify(open));
}
await app.close();
