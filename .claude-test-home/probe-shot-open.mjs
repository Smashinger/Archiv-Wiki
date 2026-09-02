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
// Derselbe Weg wie im Screenshot: über die Reiter bis zum Web Clipper.
for (const s of ['appearance','editor','backup','updates','webclipper']) {
  await page.evaluate((x)=>document.querySelector(`.aws-tab[data-section="${x}"]`)?.click(), s);
  await new Promise(r=>setTimeout(r,500));
}
await page.click('#stWebClipperDefaultMode .aws-select-value');
await new Promise(r=>setTimeout(r,400));
const box = await page.evaluate(()=>{ const r=document.querySelector('.aws-window').getBoundingClientRect();
  return { x:Math.round(r.x), y:Math.round(r.y), width:Math.round(r.width), height:Math.round(r.height) }; });
await page.screenshot({ path: path.join(TEST_HOME,'shots-settings','webclipper-liste-offen.png'), clip: box });
console.log('ok');
await app.close();
