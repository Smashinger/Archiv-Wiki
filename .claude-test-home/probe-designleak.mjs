import { _electron as electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
const APP_DIR = '/home/smashii/Dokumente/Archiv Wiki/archiv-wiki';
const TEST_HOME = path.join(APP_DIR, '.claude-test-home');
const SHOT = path.join(TEST_HOME, 'shots-leak'); fs.mkdirSync(SHOT, { recursive: true });
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
env.HOME = TEST_HOME; env.XDG_CONFIG_HOME = path.join(TEST_HOME, '.config');
env.XDG_CACHE_HOME = path.join(TEST_HOME, '.cache'); env.XDG_DATA_HOME = path.join(TEST_HOME, '.local/share');
const app = await electron.launch({ executablePath: path.join(APP_DIR,'node_modules/electron/dist/electron'), args:['--disable-gpu', APP_DIR], env, timeout:30000 });
await new Promise(r=>setTimeout(r,6000));
const page = app.windows().find(w=>!w.url().startsWith('devtools://')) ?? await app.firstWindow();
const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await page.setViewportSize({ width: 1440, height: 860 });

// Designwechsel über den echten Bedienweg: Einstellungen → Darstellung → Segment.
async function setDesign(d) {
  await page.evaluate(()=>{ document.querySelector('.aws-scrim')?.remove(); document.getElementById('btnSettings')?.click(); });
  await new Promise(r=>setTimeout(r,900));
  await page.evaluate(()=>document.querySelector('.aws-tab[data-section="appearance"]')?.click());
  await new Promise(r=>setTimeout(r,700));
  await page.evaluate((x)=>document.querySelector(`#stUiDesign .aws-seg-btn[data-value="${x}"]`)?.click(), d);
  await new Promise(r=>setTimeout(r,1400));
  await page.evaluate(()=>document.getElementById('awsClose')?.click());
  await new Promise(r=>setTimeout(r,700));
  const ist = await page.evaluate(()=>document.body.dataset.uiDesign);
  if (ist !== d) throw new Error(`Designwechsel nach ${d} misslungen, ist: ${ist}`);
}
async function openNote() {
  await page.evaluate(()=>document.querySelector('#navTree .nav-item-row > .nav-link[data-relpath], .nav-item-row > .nav-link[data-relpath]')?.click());
  await new Promise(r=>setTimeout(r,1800));
}
const snapshot = () => page.evaluate(()=>{
  const props = ['color','backgroundColor','borderTopColor','borderLeftColor','caretColor','outlineColor'];
  const sel = ['body','.sidebar','#navTree','.app-titlebar','.cm-editor','.cm-content','.cm-gutters',
               '.cm-scroller','.preview-pane','.editor-toolbar','.note-header','.nav-top .nav-link',
               '.action-row .action-btn','.sidebar-foot-row'];
  const out = {};
  for (const s of sel) {
    const n = document.querySelector(s);
    out[s] = n ? props.map(p=>`${p}:${getComputedStyle(n)[p]}`).join('|') : 'FEHLT';
  }
  out['__accent'] = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim();
  return out;
});
function diff(a,b,label){
  const bad=[...new Set([...Object.keys(a),...Object.keys(b)])].filter(k=>a[k]!==b[k]);
  console.log(label, bad.length?'ABWEICHUNG':'identisch');
  for(const k of bad) console.log('   ',k,'\n       frisch:',a[k],'\n       nach  :',b[k]);
  return bad.length;
}
let fehler = 0;
await setDesign('classic'); await openNote();
console.log('Editor da:', await page.evaluate(()=>!!document.querySelector('.cm-editor')),
            '· Fläche classic:', await page.evaluate(()=>{const n=document.querySelector('.cm-editor');return n?getComputedStyle(n).backgroundColor:null;}));
const classicFrisch = await snapshot();
await page.screenshot({ path: path.join(SHOT,'classic-frisch.png'), clip:{x:220,y:180,width:700,height:420} });
await setDesign('design2');
console.log('Fläche design2 :', await page.evaluate(()=>{const n=document.querySelector('.cm-editor');return n?getComputedStyle(n).backgroundColor:null;}));
await setDesign('classic');
fehler += diff(classicFrisch, await snapshot(), 'Classic nach D2→Classic :');
await page.screenshot({ path: path.join(SHOT,'classic-zurueck.png'), clip:{x:220,y:180,width:700,height:420} });

await setDesign('design2');
const d2Frisch = await snapshot();
await setDesign('classic');
await setDesign('design2');
fehler += diff(d2Frisch, await snapshot(), 'Design2 nach Classic→D2 :');
console.log('Fehler:', errs.length ? errs.join(' | ') : 'keine');
console.log('Abweichungen gesamt:', fehler);
await app.close();
