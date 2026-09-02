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
await page.setViewportSize({ width: 1440, height: 860 });
const info = () => page.evaluate(()=>{
  const cm = document.querySelector('.cm-editor');
  return {
    attribut: document.body.dataset.uiDesign,
    gespeichert: undefined,
    editorDa: !!cm,
    cmBg: cm ? getComputedStyle(cm).backgroundColor : null,
    cmText: cm ? getComputedStyle(document.querySelector('.cm-content')).color : null,
    route: location.hash
  };
});
console.log('start        ', JSON.stringify(await info()));
await page.evaluate(async ()=>{ await window.archivAPI.fs.setProjectSetting('uiDesign','classic'); });
await new Promise(r=>setTimeout(r,1500));
console.log('nach classic ', JSON.stringify(await info()));
await page.evaluate(()=>{ document.querySelector('#navTree .nav-item-row > .nav-link[data-relpath]')?.click(); });
await new Promise(r=>setTimeout(r,2000));
console.log('Notiz offen  ', JSON.stringify(await info()));
await page.evaluate(async ()=>{ await window.archivAPI.fs.setProjectSetting('uiDesign','design2'); });
await new Promise(r=>setTimeout(r,1500));
console.log('nach design2 ', JSON.stringify(await info()));
await page.evaluate(async ()=>{ await window.archivAPI.fs.setProjectSetting('uiDesign','classic'); });
await new Promise(r=>setTimeout(r,1500));
console.log('zurück classic', JSON.stringify(await info()));
await app.close();
