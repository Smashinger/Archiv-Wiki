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
await page.setViewportSize({ width: 1400, height: 860 });

async function oeffneEinstellungen(section){
  await page.evaluate(()=>{ document.querySelector('.aws-scrim')?.remove(); document.getElementById('btnSettings')?.click(); });
  await new Promise(r=>setTimeout(r,900));
  await page.evaluate((s)=>document.querySelector(`.aws-tab[data-section="${s}"]`)?.click(), section);
  await new Promise(r=>setTimeout(r,700));
}
async function setDesign(d){
  if (await page.evaluate(()=>document.body.dataset.uiDesign) === d) return;
  await oeffneEinstellungen('appearance');
  await page.evaluate((x)=>document.querySelector(`#stUiDesign .aws-seg-btn[data-value="${x}"]`)?.click(), d);
  await new Promise(r=>setTimeout(r,1300));
  await page.evaluate(()=>document.getElementById('awsClose')?.click());
  await new Promise(r=>setTimeout(r,600));
}
// Weg A: Segment im Einstellungsfenster
async function setThemeEinstellungen(t){
  await oeffneEinstellungen('appearance');
  await page.evaluate((x)=>document.querySelector(`#stThemeMode .aws-seg-btn[data-value="${x}"]`)?.click(), t);
  await new Promise(r=>setTimeout(r,1200));
  await page.evaluate(()=>document.getElementById('awsClose')?.click());
  await new Promise(r=>setTimeout(r,600));
}
// Weg B: Knopf in der Titelleiste
async function setThemeTitelleiste(t){
  const ist = await page.evaluate(()=>document.body.classList.contains('theme-light')?'light':'dark');
  if (ist === t) return;
  await page.click('#titlebarThemeBtn');
  await new Promise(r=>setTimeout(r,1200));
}
async function oeffneNotiz(){
  await page.evaluate(()=>{ location.hash = '#home'; });
  await new Promise(r=>setTimeout(r,1200));
  await page.evaluate(()=>document.querySelector('#navTree .nav-item-row > .nav-link[data-relpath], .nav-item-row > .nav-link[data-relpath]')?.click());
  await new Promise(r=>setTimeout(r,1800));
}
const editorFarben = () => page.evaluate(()=>{
  const cm = document.querySelector('.cm-editor');
  if (!cm) return 'KEIN EDITOR';
  const g = (s,p) => { const n = document.querySelector(s); return n ? getComputedStyle(n)[p] : '—'; };
  return [
    `editorBg:${getComputedStyle(cm).backgroundColor}`,
    `editorText:${getComputedStyle(cm).color}`,
    `content:${g('.cm-content','color')}`,
    `gutter:${g('.cm-gutters','color')}`,
    `gutterBg:${g('.cm-gutters','backgroundColor')}`,
    `caret:${g('.cm-content','caretColor')}`,
    `scroller:${g('.cm-scroller','backgroundColor')}`
  ].join(' | ');
});

let fehler = 0;
for (const design of ['classic','design2']) {
  for (const theme of ['dark','light']) {
    for (const [wegName, weg] of [['Einstellungen', setThemeEinstellungen], ['Titelleiste', setThemeTitelleiste]]) {
      // Ausgangslage: jeweils die ANDERE Kombination, Notiz offen
      await setDesign(design === 'classic' ? 'design2' : 'classic');
      await setThemeEinstellungen(theme === 'dark' ? 'light' : 'dark');
      await oeffneNotiz();
      // Umschalten auf die Zielkombination, ohne die Notiz zu schließen
      await setDesign(design);
      await weg(theme);
      const nachWechsel = await editorFarben();
      // Referenz: identische Kombination, Editor frisch aufgebaut
      await oeffneNotiz();
      const frisch = await editorFarben();
      const ok = nachWechsel === frisch;
      if (!ok) fehler++;
      console.log(`${design.padEnd(8)} ${theme.padEnd(5)} via ${wegName.padEnd(14)} ${ok ? 'identisch' : 'ABWEICHUNG'}`);
      if (!ok) { console.log('   nach Wechsel:', nachWechsel); console.log('   frisch      :', frisch); }
    }
  }
}
console.log('Fehler:', errs.length ? errs.join(' | ') : 'keine');
console.log('Abweichungen gesamt:', fehler);
await app.close();
