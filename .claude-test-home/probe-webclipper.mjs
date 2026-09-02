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
const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await page.setViewportSize({ width: 1400, height: 900 });
const cfg = () => page.evaluate(()=>window.archivAPI.settings.get());

await page.evaluate(()=>document.getElementById('btnSettings')?.click());
await new Promise(r=>setTimeout(r,1200));
// Umweg über mehrere Reiter, damit ein evtl. Listener-Aufbau sichtbar würde.
for (const s of ['appearance','editor','backup','updates','webclipper']) {
  await page.evaluate((x)=>document.querySelector(`.aws-tab[data-section="${x}"]`)?.click(), s);
  await new Promise(r=>setTimeout(r,600));
}
console.log('vorher :', JSON.stringify({ mode: (await cfg()).webClipper?.defaultCaptureMode, eingang: (await cfg()).incoming?.showInSidebar }));

// Auswahlliste: öffnen, "Ganze Seite" wählen
await page.click('#stWebClipperDefaultMode .aws-select-value');
await new Promise(r=>setTimeout(r,300));
await page.click('#stWebClipperDefaultMode .aws-select-option[data-value="page"]');
await new Promise(r=>setTimeout(r,700));
const label = await page.evaluate(()=>document.querySelector('#stWebClipperDefaultMode .aws-select-value span').textContent);

// Schalter "Eingang in der Sidebar"
const before = await page.evaluate(()=>document.getElementById('stIncomingShowInSidebar').getAttribute('aria-checked'));
await page.click('#stIncomingShowInSidebar');
await new Promise(r=>setTimeout(r,700));
const after = await page.evaluate(()=>document.getElementById('stIncomingShowInSidebar').getAttribute('aria-checked'));

const c = await cfg();
console.log('nachher:', JSON.stringify({ anzeige: label, gespeichert: c.webClipper?.defaultCaptureMode, schalter: `${before}->${after}`, eingangGespeichert: c.incoming?.showInSidebar }));

// wieder zurücksetzen
await page.click('#stWebClipperDefaultMode .aws-select-value');
await new Promise(r=>setTimeout(r,300));
await page.click('#stWebClipperDefaultMode .aws-select-option[data-value="selection"]');
await new Promise(r=>setTimeout(r,500));
await page.click('#stIncomingShowInSidebar');
await new Promise(r=>setTimeout(r,700));
const back = await cfg();
console.log('zurück :', JSON.stringify({ mode: back.webClipper?.defaultCaptureMode, eingang: back.incoming?.showInSidebar }));
console.log('Fehler :', errs.length ? errs.join(' | ') : 'keine');
await app.close();
