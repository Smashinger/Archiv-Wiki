import { _electron as electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
const APP_DIR = '/home/smashii/Dokumente/Archiv Wiki/archiv-wiki';
const TEST_HOME = path.join(APP_DIR, '.claude-test-home');
const SHOT = path.join(TEST_HOME,'shots-menu'); fs.mkdirSync(SHOT,{recursive:true});
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
env.HOME = TEST_HOME; env.XDG_CONFIG_HOME = path.join(TEST_HOME, '.config');
env.XDG_CACHE_HOME = path.join(TEST_HOME, '.cache'); env.XDG_DATA_HOME = path.join(TEST_HOME, '.local/share');
const app = await electron.launch({ executablePath: path.join(APP_DIR,'node_modules/electron/dist/electron'), args:['--disable-gpu', APP_DIR], env, timeout:30000 });
await new Promise(r=>setTimeout(r,6000));
const page = app.windows().find(w=>!w.url().startsWith('devtools://')) ?? await app.firstWindow();
const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await page.setViewportSize({ width: 1200, height: 800 });

async function setDesign(d){
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

for (const design of ['classic','design2']) {
  await setDesign(design);
  await page.click('#titlebarBurgerBtn');
  await new Promise(r=>setTimeout(r,600));
  const reiter = await page.evaluate(()=>[...document.querySelectorAll('.context-menu [data-menu]')].map(b=>b.dataset.menu));
  console.log(`${design}: Reiter`, JSON.stringify(reiter));

  // Mouseover auf "Ansicht" — ohne Klick
  await page.hover('.context-menu [data-menu="Ansicht"]');
  await new Promise(r=>setTimeout(r,400));
  let sub = await page.evaluate(()=>{
    const s = document.querySelector('.titlebar-submenu');
    if (!s) return null;
    const cs = getComputedStyle(s);
    return { eintraege: [...s.querySelectorAll('button')].map(b=>b.querySelector('.cm-label')?.textContent),
             kuerzel: [...s.querySelectorAll('.cm-accel')].map(a=>a.textContent),
             flaeche: cs.backgroundColor, rand: cs.borderTopWidth + " " + cs.borderTopColor, textfarbe: getComputedStyle(s.querySelector('button')).color,
             nativ: false };
  });
  console.log(`${design}: Hover Ansicht ->`, JSON.stringify(sub));

  // Mouseover auf "Datei" — muss ohne Klick umschalten
  await page.hover('.context-menu [data-menu="Datei"]');
  await new Promise(r=>setTimeout(r,400));
  sub = await page.evaluate(()=>{
    const s = document.querySelector('.titlebar-submenu');
    return s ? { eintraege:[...s.querySelectorAll('button')].map(b=>b.querySelector('.cm-label')?.textContent),
                 kuerzel:[...s.querySelectorAll('.cm-accel')].map(a=>a.textContent),
                 anzahlUntermenues: document.querySelectorAll('.titlebar-submenu').length } : null;
  });
  console.log(`${design}: Hover Datei  ->`, JSON.stringify(sub));
  await page.screenshot({ path: path.join(SHOT, `${design}.png`), clip:{x:0,y:0,width:560,height:320} });

  // Burger bleibt anklickbar (schließt das Menü)
  await page.click('#titlebarBurgerBtn');
  await new Promise(r=>setTimeout(r,500));
  console.log(`${design}: nach Burger-Klick offen?`, await page.evaluate(()=>!!document.querySelector('.context-menu')));
  if (await page.evaluate(()=>!!document.querySelector('.context-menu'))) { await page.click('#titlebarBurgerBtn'); await new Promise(r=>setTimeout(r,400)); }
}
console.log('Fehler:', errs.length ? errs.join(' | ') : 'keine');
await app.close();
