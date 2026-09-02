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

const state = () => page.evaluate(()=>{
  const g = document.querySelector('#navTree .nav-group.level-1');
  const list = g.querySelector(':scope > .group-list');
  return { name: g.querySelector('.g-label').textContent, collapsed: g.classList.contains('collapsed'),
           listHoehe: Math.round(list.getBoundingClientRect().height),
           griffZiehbar: g.querySelector('.row-handle')?.draggable };
});
console.log('vorher :', JSON.stringify(await state()));
await page.click('#navTree .nav-group.level-1 > .group-header-row .group-header');
await new Promise(r=>setTimeout(r,700));
console.log('geklickt:', JSON.stringify(await state()));
await page.click('#navTree .nav-group.level-1 > .group-header-row .group-header');
await new Promise(r=>setTimeout(r,700));
console.log('zurück :', JSON.stringify(await state()));

// Sidebar-Größe: nur Zeilenhöhen dürfen sich ändern
for (const size of ['kompakt','standard','gross']) {
  await page.evaluate((s)=>{
    const m = { kompakt:['26px','24px','23px'], standard:['28px','26px','25px'], gross:['32px','29px','28px'] }[s];
    document.documentElement.style.setProperty('--tree-row-main', m[0]);
    document.documentElement.style.setProperty('--tree-row-sub', m[1]);
    document.documentElement.style.setProperty('--tree-row-note', m[2]);
  }, size);
  await new Promise(r=>setTimeout(r,250));
  const m = await page.evaluate(()=>{
    const h = document.querySelector('#navTree .nav-group.level-1 > .group-header-row .group-header');
    const cs = getComputedStyle(h);
    return { hoehe: cs.height, schrift: cs.fontSize, einzug: cs.paddingLeft };
  });
  console.log(size.padEnd(9), JSON.stringify(m));
}
console.log('Fehler:', errs.length ? errs.join(' | ') : 'keine');
await app.close();
