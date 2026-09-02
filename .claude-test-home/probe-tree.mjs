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
const errs=[]; page.on('pageerror',e=>errs.push('pageerror: '+e.message)); page.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
await page.setViewportSize({ width: 1400, height: 900 });

// Genau eine Kategorie zugeklappt lassen, damit beide Chevron-Zustaende messbar sind.
await page.evaluate(()=>{ document.querySelectorAll('#navTree .nav-group.collapsed > .group-header-row .group-header').forEach(b=>b.click()); });
await new Promise(r=>setTimeout(r,900));
await page.evaluate(()=>{ document.querySelectorAll('#navTree .nav-group.collapsed > .group-header-row .group-header').forEach(b=>b.click()); });
await new Promise(r=>setTimeout(r,900));

const mess = await page.evaluate(()=>{
  const px = v => parseFloat(v);
  const g = (sel, prop) => { const n = document.querySelector(sel); return n ? getComputedStyle(n)[prop] : null; };
  const h1 = document.querySelector('#navTree .nav-group.level-1 > .group-header-row .group-header');
  const h2 = document.querySelector('#navTree .nav-group.level-2 > .group-header-row .group-header');
  const n1 = document.querySelector('#navTree .nav-item-row > .nav-link');
  const cs = e => e ? getComputedStyle(e) : null;
  const rowWidths = [...document.querySelectorAll('#navTree .group-header, #navTree .nav-item-row > .nav-link')]
    .map(e=>Math.round(e.getBoundingClientRect().width));
  return {
    hoehen: [h1&&px(cs(h1).height), h2&&px(cs(h2).height), n1&&px(cs(n1).height)],
    einzuege: [h1&&px(cs(h1).paddingLeft), h2&&px(cs(h2).paddingLeft), n1&&px(cs(n1).paddingLeft)],
    paddingRight: [h1&&px(cs(h1).paddingRight), h2&&px(cs(h2).paddingRight), n1&&px(cs(n1).paddingRight)],
    abstand: [h1&&px(cs(h1).columnGap), h2&&px(cs(h2).columnGap), n1&&px(cs(n1).columnGap)],
    schrift: [h1&&px(cs(h1).fontSize), h2&&px(cs(h2).fontSize), n1&&px(cs(n1).fontSize)],
    ordnerIcons: document.querySelectorAll('#navTree .g-icon').length,
    spines: [...document.querySelectorAll('#navTree .g-spine')].map(s=>{
      const c=getComputedStyle(s); return `${px(c.width)}x${px(c.height)} r${px(c.borderRadius)} ${c.backgroundColor}`; }),
    spinesInSub: document.querySelectorAll('#navTree .nav-group.level-2 .g-spine').length,
    notizIcons: [...document.querySelectorAll('#navTree .nl-icon svg')].length,
    zaehlerNurKategorien: {
      kategorien: document.querySelectorAll('#navTree .group-header .g-count').length,
      notizen: document.querySelectorAll('#navTree .nav-link .g-count, #navTree .nav-item-row .nl-count').length
    },
    freieMarker: [...document.querySelectorAll('#navTree .group-header-row')].filter(r=>getComputedStyle(r,'::before').content !== 'none').length,
    chevronOffen: g('#navTree .nav-group:not(.collapsed) > .group-header-row .g-chevron', 'stroke'),
    chevronZu: g('#navTree .nav-group.collapsed > .group-header-row .g-chevron', 'stroke'),
    griffOpacity: g('#navTree .row-handle', 'opacity'),
    breitenGleich: new Set(rowWidths).size === 1,
    zeilenbreite: rowWidths[0],
    themenLabel: (()=>{ const l=document.getElementById('sidebarThemenLabel'); const c=getComputedStyle(l);
      return { display:c.display, padding:c.padding, size:px(c.fontSize), spacing:c.letterSpacing, color:c.color }; })()
  };
});
console.log(JSON.stringify(mess, null, 1));

// Auswahl: eine Notiz öffnen, dann Marker zählen
await page.evaluate(()=>document.querySelector('#navTree .nav-item-row > .nav-link')?.click());
await new Promise(r=>setTimeout(r,900));
const auswahl = await page.evaluate(()=>{
  const mitKante = [...document.querySelectorAll('#navTree .group-header, #navTree .nav-link')]
    .filter(e=>getComputedStyle(e).boxShadow.includes('inset') && getComputedStyle(e).boxShadow !== 'none');
  const aktiv = document.querySelector('#navTree .nav-link.active');
  return { zeilenMitKante: mitKante.length, kante: aktiv && getComputedStyle(aktiv).boxShadow,
           farbe: aktiv && getComputedStyle(aktiv).color,
           verlauf: aktiv && getComputedStyle(aktiv).backgroundImage.slice(0,70) };
});
console.log('auswahl:', JSON.stringify(auswahl));
await page.screenshot({ path: path.join(SHOT,'dunkel.png'), clip: { x:0, y:0, width:340, height:900 } });
await page.evaluate(()=>document.body.classList.add('theme-light'));
await new Promise(r=>setTimeout(r,500));
await page.screenshot({ path: path.join(SHOT,'hell.png'), clip: { x:0, y:0, width:340, height:900 } });
console.log('Fehler:', errs.length ? errs.join(' | ') : 'keine');
await app.close();
