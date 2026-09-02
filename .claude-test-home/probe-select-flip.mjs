import { _electron as electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
const APP_DIR = '/home/smashii/Dokumente/Archiv Wiki/archiv-wiki';
const TEST_HOME = path.join(APP_DIR, '.claude-test-home');
const SHOT = path.join(TEST_HOME, 'shots-settings'); fs.mkdirSync(SHOT, { recursive: true });
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
env.HOME = TEST_HOME; env.XDG_CONFIG_HOME = path.join(TEST_HOME, '.config');
env.XDG_CACHE_HOME = path.join(TEST_HOME, '.cache'); env.XDG_DATA_HOME = path.join(TEST_HOME, '.local/share');
const app = await electron.launch({ executablePath: path.join(APP_DIR,'node_modules/electron/dist/electron'), args:['--disable-gpu', APP_DIR], env, timeout:30000 });
await new Promise(r=>setTimeout(r,6000));
const page = app.windows().find(w=>!w.url().startsWith('devtools://')) ?? await app.firstWindow();
const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});

async function check(label, size, section, selectId, shot) {
  await page.setViewportSize(size);
  await page.evaluate(()=>{ document.querySelector('.aws-scrim')?.remove(); document.getElementById('btnSettings')?.click(); });
  await new Promise(r=>setTimeout(r,1000));
  await page.evaluate((s)=>document.querySelector(`.aws-tab[data-section="${s}"]`)?.click(), section);
  await new Promise(r=>setTimeout(r,700));
  await page.click(`#${selectId} .aws-select-value`);
  await new Promise(r=>setTimeout(r,350));
  const r = await page.evaluate((id)=>{
    const menu = document.querySelector(`#${id} .aws-select-menu`);
    const body = document.querySelector('.aws-body').getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    const t = document.querySelector(`#${id} .aws-select-value`).getBoundingClientRect();
    return { offen: !menu.hidden, nachOben: menu.classList.contains('is-up'),
             menuOben: Math.round(m.top), menuUnten: Math.round(m.bottom),
             feldOben: Math.round(t.top), feldUnten: Math.round(t.bottom),
             bereichOben: Math.round(body.top), bereichUnten: Math.round(body.bottom),
             passtRein: m.top >= body.top - 1 && m.bottom <= body.bottom + 1 };
  }, selectId);
  console.log(label.padEnd(28), JSON.stringify(r));
  if (shot) await page.screenshot({ path: path.join(SHOT, shot) });
}

await check('normal (viel Platz unten)', { width:1400, height:900 }, 'webclipper', 'stWebClipperDefaultMode', null);
await check('enges Fenster',             { width:1400, height:430 }, 'webclipper', 'stWebClipperDefaultMode', null);
await check('enges Fenster / Backup',    { width:1400, height:430 }, 'backup',     'stBackupInterval',        'select-nach-oben.png');
console.log('Fehler:', errs.length ? errs.join(' | ') : 'keine');
await app.close();
