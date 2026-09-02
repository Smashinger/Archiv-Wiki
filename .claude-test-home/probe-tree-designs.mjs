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

for (const design of ['classic','design2']) {
  await page.evaluate((d)=>{ document.body.dataset.uiDesign = d; }, design);
  await new Promise(r=>setTimeout(r,600));
  const m = await page.evaluate(()=>{
    const sicht = s => { const n=document.querySelector(s); return n ? getComputedStyle(n).display : 'FEHLT'; };
    const h1 = document.querySelector('#navTree .nav-group.level-1 > .group-header-row .group-header');
    const list = document.querySelector('#navTree .group-list');
    const chev = document.querySelector('#navTree .g-chevron');
    const label = document.getElementById('sidebarThemenLabel');
    const cs = e => getComputedStyle(e);
    return {
      ordnerIcon: sicht('#navTree .g-icon'),
      ruecken:    sicht('#navTree .g-spine'),
      griffAlt:   sicht('#navTree .rh-classic'),
      griffNeu:   sicht('#navTree .rh-tree'),
      notizIconAlt: sicht('#navTree .nl-icon'),
      notizIconNeu: sicht('#navTree .nl-icon-tree'),
      themenLabel: cs(label).display,
      zeilenhoehe: cs(h1).height,
      einzug: cs(h1).paddingLeft,
      schrift: cs(h1).fontSize,
      listeRand: cs(list).borderLeftWidth,
      listeMargin: cs(list).margin,
      listePadding: cs(list).padding,
      chevronStrich: cs(chev).strokeWidth
    };
  });
  console.log(design.padEnd(9), JSON.stringify(m, null, 0));
  await page.screenshot({ path: path.join(SHOT, `${design}-neu.png`), clip:{x:0,y:0,width:300,height:560} });
}
console.log('Fehler:', errs.length ? errs.join(' | ') : 'keine');
await app.close();
