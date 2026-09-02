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
await page.setViewportSize({ width: 1700, height: 860 });
await page.evaluate(()=>{ location.hash = '#home'; });
await new Promise(r=>setTimeout(r,1600));
console.log(JSON.stringify(await page.evaluate(()=>{
  const design = document.body.dataset.uiDesign;
  const rowSel = design === 'design2' ? '.d2-dash-row' : '.dashboard-row';
  const rows = [...document.querySelectorAll(rowSel)];
  const info = r => {
    const cs = getComputedStyle(r);
    const box = r.getBoundingClientRect();
    const kid = k => { const n = r.querySelector(k); return n ? Math.round(n.getBoundingClientRect().left) : null; };
    return {
      klasse: r.className,
      links: Math.round(box.left), breite: Math.round(box.width),
      padding: cs.padding, raster: cs.gridTemplateColumns,
      icon: kid('.d2-dash-icon, .dr-icon'),
      titel: kid('.d2-dash-title, .dr-title'),
      text: kid('.d2-dash-excerpt, .dr-excerpt'),
      elternPad: getComputedStyle(r.parentElement).padding,
      eltern: r.parentElement.className,
      elternBreite: Math.round(r.parentElement.getBoundingClientRect().width),
      elternLinks: Math.round(r.parentElement.getBoundingClientRect().left)
    };
  };
  return { design, anzahl: rows.length, zeilen: rows.map(info) };
}), null, 1));
await app.close();
