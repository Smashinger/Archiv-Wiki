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
await page.setViewportSize({ width: 1400, height: 860 });
async function oeffneEinstellungen(s){
  await page.evaluate(()=>{ document.querySelector('.aws-scrim')?.remove(); document.getElementById('btnSettings')?.click(); });
  await new Promise(r=>setTimeout(r,900));
  await page.evaluate((x)=>document.querySelector(`.aws-tab[data-section="${x}"]`)?.click(), s);
  await new Promise(r=>setTimeout(r,700));
}
async function set(design, theme){
  await oeffneEinstellungen('appearance');
  await page.evaluate((x)=>document.querySelector(`#stUiDesign .aws-seg-btn[data-value="${x}"]`)?.click(), design);
  await new Promise(r=>setTimeout(r,1200));
  await oeffneEinstellungen('appearance');
  await page.evaluate((x)=>document.querySelector(`#stThemeMode .aws-seg-btn[data-value="${x}"]`)?.click(), theme);
  await new Promise(r=>setTimeout(r,1100));
  await page.evaluate(()=>document.getElementById('awsClose')?.click());
  await new Promise(r=>setTimeout(r,500));
  await page.evaluate(()=>{ location.hash='#home'; });
  await new Promise(r=>setTimeout(r,1000));
  await page.evaluate(()=>document.querySelector('#navTree .nav-item-row > .nav-link[data-relpath], .nav-item-row > .nav-link[data-relpath]')?.click());
  await new Promise(r=>setTimeout(r,1700));
}
const farbe = () => page.evaluate(()=>{
  const cm=document.querySelector('.cm-editor');
  return cm ? `${getComputedStyle(cm).backgroundColor} / Text ${getComputedStyle(document.querySelector('.cm-content')).color}` : 'KEIN EDITOR';
});
const gesehen = {};
for (const d of ['classic','design2']) for (const t of ['dark','light']) {
  await set(d,t); gesehen[`${d}/${t}`] = await farbe();
  console.log(`${d}/${t}`.padEnd(16), gesehen[`${d}/${t}`]);
}
console.log('vier verschiedene Paletten:', new Set(Object.values(gesehen)).size === 4 ? 'ja' : 'NEIN – Test wäre wertlos');

// Speichert der Titelleisten-Knopf den Modus jetzt?
const vorher = await page.evaluate(async ()=>(await window.archivAPI.settings.get()).themeMode);
await page.click('#titlebarThemeBtn');
await new Promise(r=>setTimeout(r,1200));
const nachher = await page.evaluate(async ()=>(await window.archivAPI.settings.get()).themeMode);
const icon = await page.evaluate(()=>document.documentElement.getAttribute('data-theme'));
console.log(`Titelleisten-Knopf: gespeichert ${vorher} -> ${nachher}`, vorher !== nachher ? '(wird gespeichert)' : '(NICHT gespeichert)');
console.log('data-theme am Wurzelelement:', icon);
await app.close();
