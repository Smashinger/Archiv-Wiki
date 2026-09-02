import { _electron as electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
const APP_DIR = '/home/smashii/Dokumente/Archiv Wiki/archiv-wiki';
const TEST_HOME = path.join(APP_DIR, '.claude-test-home');
const SHOT = path.join(TEST_HOME, 'shots-smoke'); fs.mkdirSync(SHOT, { recursive: true });
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
env.HOME = TEST_HOME; env.XDG_CONFIG_HOME = path.join(TEST_HOME, '.config');
env.XDG_CACHE_HOME = path.join(TEST_HOME, '.cache'); env.XDG_DATA_HOME = path.join(TEST_HOME, '.local/share');
const app = await electron.launch({ executablePath: path.join(APP_DIR,'node_modules/electron/dist/electron'), args:['--disable-gpu', APP_DIR], env, timeout:30000 });
await new Promise(r=>setTimeout(r,6000));
const page = app.windows().find(w=>!w.url().startsWith('devtools://')) ?? await app.firstWindow();
const errs=[]; page.on('pageerror',e=>errs.push('pageerror: '+e.message)); page.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
await page.setViewportSize({ width: 1400, height: 900 });

async function shot(name, sel) {
  await new Promise(r=>setTimeout(r,900));
  const found = await page.evaluate((s)=>Boolean(document.querySelector(s)), sel);
  await page.screenshot({ path: path.join(SHOT, name + '.png') });
  console.log(name.padEnd(26), found ? 'sichtbar' : 'NICHT GEFUNDEN: ' + sel);
  return found;
}

// 1) Dashboard-Einstellungen (nutzt .density-option-row / .dashboard-settings-*)
await page.evaluate(()=>{ location.hash = '#home'; });
await new Promise(r=>setTimeout(r,900));
await page.evaluate(()=>document.querySelector('[id*="ashboardSettings"], #btnDashboardSettings, .dashboard-tip-icon-btn')?.click());
await shot('dashboard-einstellungen', '.dashboard-settings-panel');
await page.keyboard.press('Escape');

// 2) Tabelleneditor (nutzt .settings-modal-header)
await page.evaluate(()=>{ document.querySelector('.dashboard-settings-overlay')?.remove(); });
const tabelle = await page.evaluate(async () => {
  if (typeof window.__awTest === 'undefined') {
    const ov = document.createElement('div');
    ov.className = 'table-editor-overlay';
    ov.innerHTML = `<div class="table-editor-modal">
      <div class="settings-modal-header"><span>Tabelle bearbeiten</span>
      <button type="button" class="modal-close-x" data-action="cancel">✕</button></div>
      <div class="table-editor-grid-wrap"><table class="table-editor-grid"><tr><td>A</td><td>B</td></tr></table></div>
      <div class="table-editor-actions"><button class="btn ghost">+ Zeile</button><span class="spacer"></span>
      <button class="btn primary">Übernehmen</button></div></div>`;
    document.body.appendChild(ov);
  }
  const h = document.querySelector('.table-editor-overlay .settings-modal-header');
  const cs = getComputedStyle(h);
  return { padding: cs.padding, borderBottom: cs.borderBottomWidth, font: cs.fontFamily.split(',')[0], color: cs.color };
});
console.log('tabelleneditor-kopfzeile'.padEnd(26), JSON.stringify(tabelle));
await shot('tabelleneditor', '.table-editor-overlay');
await page.evaluate(()=>document.querySelector('.table-editor-overlay')?.remove());

// 3) Einstellungsfenster über alle Reiter
await page.evaluate(()=>document.getElementById('btnSettings')?.click());
for (const s of ['general','appearance','editor','backup','updates','webclipper','security']) {
  await page.evaluate((x)=>document.querySelector(`.aws-tab[data-section="${x}"]`)?.click(), s);
  await new Promise(r=>setTimeout(r,450));
}
await shot('einstellungen-sicherheit', '.aws-window');
console.log('Fehler:', errs.length ? errs.join(' | ') : 'keine');
await app.close();
