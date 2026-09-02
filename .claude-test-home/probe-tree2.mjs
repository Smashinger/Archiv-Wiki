import { _electron as electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
const APP_DIR = '/home/smashii/Dokumente/Archiv Wiki/archiv-wiki';
const TEST_HOME = path.join(APP_DIR, '.claude-test-home');
const SHOT = path.join(TEST_HOME, 'shots-tree'); fs.mkdirSync(SHOT, { recursive: true });
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
env.HOME = TEST_HOME; env.XDG_CONFIG_HOME = path.join(TEST_HOME, '.config');
env.XDG_CACHE_HOME = path.join(TEST_HOME, '.cache'); env.XDG_DATA_HOME = path.join(TEST_HOME, '.local/share');
const app = await electron.launch({ executablePath: path.join(APP_DIR,'node_modules/electron/dist/electron'), args:['--disable-gpu', APP_DIR], env, timeout:30000 });
await new Promise(r=>setTimeout(r,6000));
const page = app.windows().find(w=>!w.url().startsWith('devtools://')) ?? await app.firstWindow();
const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await page.setViewportSize({ width: 1400, height: 900 });

// Mehr Struktur anlegen, damit die Rückfallreihe der Themenfarbe sichtbar wird.
await page.evaluate(async () => {
  for (const n of ['Anleitungen', 'Entwicklung', 'Projekte']) {
    try { await window.archivAPI.fs.createMainCategory(n); } catch (e) { console.log('createMainCategory', e?.message); }
  }
});
await new Promise(r=>setTimeout(r,1500));
await page.evaluate(()=>location.reload());
await new Promise(r=>setTimeout(r,5000));

// Eine Kategorie zuklappen für den geschlossenen Chevron
await page.evaluate(()=>{
  const offen = document.querySelector('#navTree .nav-group.level-1:not(.collapsed) > .group-header-row .group-header');
  offen?.click();
});
await new Promise(r=>setTimeout(r,700));
const m = await page.evaluate(()=>{
  const st = (s,p) => { const n=document.querySelector(s); return n ? getComputedStyle(n)[p] : null; };
  return {
    chevronZu: st('#navTree .nav-group.collapsed > .group-header-row .g-chevron','stroke'),
    chevronZuDrehung: st('#navTree .nav-group.collapsed > .group-header-row .g-chevron','transform'),
    chevronOffen: st('#navTree .nav-group:not(.collapsed) > .group-header-row .g-chevron','stroke'),
    chevronOffenDrehung: st('#navTree .nav-group:not(.collapsed) > .group-header-row .g-chevron','transform'),
    ruecken: [...document.querySelectorAll('#navTree .g-spine')].map(s=>getComputedStyle(s).backgroundColor)
  };
});
console.log(JSON.stringify(m, null, 1));
// Hover auf einer Zeile: Griffpunkt und Fläche
await page.hover('#navTree .nav-group.level-1 > .group-header-row .group-header');
await new Promise(r=>setTimeout(r,400));
console.log('hover:', JSON.stringify(await page.evaluate(()=>{
  const r = document.querySelector('#navTree .nav-group.level-1 > .group-header-row');
  const h = r.querySelector('.row-handle'); const b = r.querySelector('.group-header');
  const cs = getComputedStyle(b);
  return { griff: getComputedStyle(h).opacity, flaeche: cs.backgroundColor, text: cs.color, radius: cs.borderRadius };
})));
await page.screenshot({ path: path.join(SHOT,'dunkel.png'), clip:{x:0,y:0,width:340,height:640} });
await page.evaluate(()=>document.body.classList.add('theme-light'));
await new Promise(r=>setTimeout(r,500));
await page.screenshot({ path: path.join(SHOT,'hell.png'), clip:{x:0,y:0,width:340,height:640} });
console.log('Fehler:', errs.length ? errs.join(' | ') : 'keine');
await app.close();
