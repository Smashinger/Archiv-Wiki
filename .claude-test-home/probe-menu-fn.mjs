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
await page.setViewportSize({ width: 1200, height: 800 });

async function menuKlick(reiter, eintrag) {
  await page.click('#titlebarBurgerBtn');
  await new Promise(r=>setTimeout(r,600));
  await page.hover(`.context-menu [data-menu="${reiter}"]`);
  await new Promise(r=>setTimeout(r,400));
  const ok = await page.evaluate((t)=>{
    const b = [...document.querySelectorAll('.titlebar-submenu button')].find(x=>x.querySelector('.cm-label')?.textContent.startsWith(t));
    if (!b || b.disabled) return false;
    b.click(); return true;
  }, eintrag);
  await new Promise(r=>setTimeout(r,1200));
  return ok;
}

// 1) click-Handler-Zweig: Hilfe -> Tastenkürzel
console.log('Hilfe → Tastenkürzel geklickt:', await menuKlick('Hilfe','Tastenkürzel'));
console.log('  Übersicht offen:', await page.evaluate(()=>!!document.querySelector('.shortcuts-overlay, .prompt-overlay')));
await page.keyboard.press('Escape');
await new Promise(r=>setTimeout(r,600));

// 2) role-Zweig: Ansicht -> Vollbild (zweimal, damit der Zustand danach wieder stimmt)
const vorher = await app.evaluate(async ({BrowserWindow}) => BrowserWindow.getAllWindows()[0].isFullScreen());
console.log('Ansicht → Vollbild geklickt:', await menuKlick('Ansicht','Vollbild'));
const nachher = await app.evaluate(async ({BrowserWindow}) => BrowserWindow.getAllWindows()[0].isFullScreen());
console.log('  Vollbild', vorher, '->', nachher, nachher !== vorher ? '(gewechselt)' : '(UNVERÄNDERT)');
await menuKlick('Ansicht','Vollbild');
console.log('  zurück:', await app.evaluate(async ({BrowserWindow}) => BrowserWindow.getAllWindows()[0].isFullScreen()));

// 3) Menü schließt nach der Auswahl
console.log('Menü nach Auswahl offen:', await page.evaluate(()=>!!document.querySelector('.context-menu')));
console.log('Fehler:', errs.length ? errs.join(' | ') : 'keine');
await app.close();
