import { _electron as electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
const APP_DIR = '/home/smashii/Dokumente/Archiv Wiki/archiv-wiki';
const TEST_HOME = path.join(APP_DIR, '.claude-test-home');
const SHOT = path.join(TEST_HOME, 'shots-layout'); fs.mkdirSync(SHOT, { recursive: true });
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
env.HOME = TEST_HOME; env.XDG_CONFIG_HOME = path.join(TEST_HOME, '.config');
env.XDG_CACHE_HOME = path.join(TEST_HOME, '.cache'); env.XDG_DATA_HOME = path.join(TEST_HOME, '.local/share');
const app = await electron.launch({ executablePath: path.join(APP_DIR,'node_modules/electron/dist/electron'), args:['--disable-gpu', APP_DIR], env, timeout:30000 });
await new Promise(r=>setTimeout(r,6000));
const page = app.windows().find(w=>!w.url().startsWith('devtools://')) ?? await app.firstWindow();
const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});

async function setDesign(d) {
  if (await page.evaluate(()=>document.body.dataset.uiDesign) === d) return;
  await page.evaluate(()=>{ document.querySelector('.aws-scrim')?.remove(); document.getElementById('btnSettings')?.click(); });
  await new Promise(r=>setTimeout(r,900));
  await page.evaluate(()=>document.querySelector('.aws-tab[data-section="appearance"]')?.click());
  await new Promise(r=>setTimeout(r,700));
  await page.evaluate((x)=>document.querySelector(`#stUiDesign .aws-seg-btn[data-value="${x}"]`)?.click(), d);
  await new Promise(r=>setTimeout(r,1300));
  await page.evaluate(()=>document.getElementById('awsClose')?.click());
  await new Promise(r=>setTimeout(r,600));
}

// Überlappung: Geschwister im selben Container duerfen sich nicht schneiden.
const check = () => page.evaluate(()=>{
  const probleme = [];
  const rect = e => e.getBoundingClientRect();
  const sichtbar = e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const gruppen = ['.note-header', '.note-document-meta', '.note-document-actions',
                   '.note-toolbar', '.dashboard-row', '.sidebar', '.app-titlebar'];
  for (const g of gruppen) {
    const c = document.querySelector(g);
    if (!c || !sichtbar(c)) continue;
    const kinder = [...c.children].filter(sichtbar);
    for (let i=0;i<kinder.length;i++) for (let j=i+1;j<kinder.length;j++) {
      const a = rect(kinder[i]), b = rect(kinder[j]);
      const ux = Math.min(a.right,b.right) - Math.max(a.left,b.left);
      const uy = Math.min(a.bottom,b.bottom) - Math.max(a.top,b.top);
      if (ux > 1 && uy > 1) probleme.push(`ÜBERLAPPUNG in ${g}: ${kinder[i].className||kinder[i].tagName} × ${kinder[j].className||kinder[j].tagName} (${Math.round(ux)}×${Math.round(uy)}px)`);
    }
    // Absichtliches Scrollen (overflow-x:auto/scroll) ist kein Fehler.
    const ox = getComputedStyle(c).overflowX;
    if (ox !== 'auto' && ox !== 'scroll' && c.scrollWidth - c.clientWidth > 3)
      probleme.push(`ÜBERLAUF ${g}: ${c.scrollWidth}>${c.clientWidth}`);
  }
  // Kein Element darf rechts aus dem Fenster ragen
  for (const s of ['.note-header','.note-toolbar','.dashboard-view','.dashboard-view-d2']) {
    const c = document.querySelector(s);
    if (c && sichtbar(c) && rect(c).right > window.innerWidth + 1) probleme.push(`RAGT HINAUS ${s}: ${Math.round(rect(c).right)} > ${window.innerWidth}`);
  }
  return probleme;
});

const breiten = [1600, 1436, 1300, 1200, 1100, 1000, 900, 820];
for (const design of ['classic','design2']) {
  await page.setViewportSize({ width: 1600, height: 860 });
  await setDesign(design);
  // Notiz öffnen
  await page.evaluate(()=>document.querySelector('#navTree .nav-item-row > .nav-link[data-relpath], .nav-item-row > .nav-link[data-relpath]')?.click());
  await new Promise(r=>setTimeout(r,1600));
  for (const w of breiten) {
    await page.setViewportSize({ width: w, height: 860 });
    await new Promise(r=>setTimeout(r,500));
    const p = await check();
    console.log(`${design.padEnd(8)} ${String(w).padStart(4)}px  ${p.length ? p.join(' · ') : 'ok'}`);
    if (p.length && w === 1436) await page.screenshot({ path: path.join(SHOT, `${design}-${w}.png`), clip:{x:0,y:0,width:w,height:220} });
  }
  await page.setViewportSize({ width: 1436, height: 860 });
  await new Promise(r=>setTimeout(r,500));
  await page.screenshot({ path: path.join(SHOT, `${design}-kopf-1436.png`), clip:{x:220,y:30,width:1216,height:150} });
}
console.log('Fehler:', errs.length ? errs.join(' | ') : 'keine');
await app.close();
