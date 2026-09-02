/* Block B — Baummaße. Prüft §7 (Normalgewicht), die Notizzeile 25px und den
   Zählerabstand; misst außerdem, warum die Hoverfläche der Unterkategorie
   niedriger ist als ihre Zeile. */
import { _electron as electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_DIR = '/home/smashii/Dokumente/Archiv Wiki/archiv-wiki';
const TEST_HOME = path.join(APP_DIR, '.claude-test-home');
const SHOT = path.join(TEST_HOME, 'shots-block-b');
fs.mkdirSync(SHOT, { recursive: true });

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
env.HOME = TEST_HOME;
env.XDG_CONFIG_HOME = path.join(TEST_HOME, '.config');
env.XDG_CACHE_HOME = path.join(TEST_HOME, '.cache');
env.XDG_DATA_HOME = path.join(TEST_HOME, '.local/share');

const app = await electron.launch({
  executablePath: path.join(APP_DIR, 'node_modules/electron/dist/electron'),
  args: ['--disable-gpu', APP_DIR],
  env, timeout: 30000,
});
await new Promise(r => setTimeout(r, 6000));
const page = app.windows().find(w => !w.url().startsWith('devtools://')) ?? await app.firstWindow();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.setViewportSize({ width: 1400, height: 900 });
await page.evaluate(() => { document.body.dataset.uiDesign = 'design2'; });
await new Promise(r => setTimeout(r, 600));

// Alle Kategorien aufklappen, damit Ebene 2 und 3 gerendert sind.
await page.evaluate(() => {
  document.querySelectorAll('#navTree .nav-group.collapsed > .group-header-row [data-toggle]')
    .forEach(b => b.click());
});
await new Promise(r => setTimeout(r, 500));
await page.evaluate(() => {
  document.querySelectorAll('#navTree .nav-group.collapsed > .group-header-row [data-toggle]')
    .forEach(b => b.click());
});
await new Promise(r => setTimeout(r, 700));

const mess = await page.evaluate(() => {
  const r = el => { const b = el.getBoundingClientRect(); return { h: +b.height.toFixed(2), t: +b.top.toFixed(2), l: +b.left.toFixed(2), r: +b.right.toFixed(2) }; };
  const cs = el => getComputedStyle(el);
  const g1 = document.querySelector('#navTree .nav-group.level-1:not(.collapsed) > .group-header-row');
  const g2 = document.querySelector('#navTree .nav-group.level-2 > .group-header-row');
  const n = document.querySelector('#navTree .nav-item-row');
  if (!g1 || !g2 || !n) return { fehlt: { g1: !!g1, g2: !!g2, n: !!n } };
  const h1 = g1.querySelector('.group-header'), h2 = g2.querySelector('.group-header');
  const link = n.querySelector('.nav-link'), count = g2.querySelector('.g-count');
  return {
    ebene1: { zeile: r(g1), flaeche: r(h1), gewicht: cs(h1).fontWeight, groesse: cs(h1).fontSize, farbe: cs(h1).color },
    ebene2: {
      zeile: r(g2), flaeche: r(h2),
      zeileHoehe: cs(g2).height, zeilePad: cs(g2).padding, zeileAlign: cs(g2).alignItems,
      flaecheHoehe: cs(h2).height, flaechePad: cs(h2).padding, flaecheMargin: cs(h2).margin,
      flaecheBox: cs(h2).boxSizing, flaecheBorder: cs(h2).borderWidth, flaecheSelf: cs(h2).alignSelf,
    },
    notiz: { zeile: r(n), link: r(link), zeileHoehe: cs(n).height, linkHoehe: cs(link).height },
    zaehler: count ? {
      rect: r(count), pad: cs(count).padding, border: cs(count).borderWidth,
      abstandRechts: +(r(g2).r - r(count).r).toFixed(2),
    } : 'FEHLT',
  };
});
console.log(JSON.stringify(mess, null, 1));

await page.hover('#navTree .nav-group.level-2 > .group-header-row .group-header');
await new Promise(r => setTimeout(r, 300));
const box = await page.locator('#navTree').boundingBox();
await page.screenshot({ path: path.join(SHOT, '01-baum-hover.png'), clip: { x: box.x, y: box.y, width: 300, height: Math.min(box.height, 300) } });
console.log('FEHLER:', errs.length ? errs.join(' | ') : 'keine');
await app.close();
