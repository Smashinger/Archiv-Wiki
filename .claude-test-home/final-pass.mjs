import { _electron as electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_DIR = '/home/smashii/Dokumente/Archiv Wiki/archiv-wiki';
const SHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/shots';
const electronBin = APP_DIR + '/node_modules/electron/dist/electron';
const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;

const app = await electron.launch({ executablePath: electronBin, args: ['--no-sandbox', '.', '--dev'], cwd: APP_DIR, env: childEnv, timeout: 30000 });
let page = app.windows().find(w => w.url().includes('renderer/index.html'));
if (!page) { await new Promise(r=>setTimeout(r,2000)); page = app.windows().find(w => w.url().includes('renderer/index.html')) ?? await app.firstWindow(); }
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push('[console] ' + msg.text()); });
page.on('pageerror', (err) => errors.push('[pageerror] ' + err.message));

await page.waitForSelector('.sidebar', { timeout: 20000 }).catch(()=>{});
await page.waitForTimeout(600);

// Ensure design2 + dark for the responsive checks.
await page.evaluate(async () => {
  await window.archivAPI.fs.setProjectSetting('uiDesign', 'design2');
  await window.archivAPI.fs.setProjectSetting('themeMode', 'dark');
});
await page.reload();
await page.waitForSelector('.sidebar', { timeout: 20000 }).catch(()=>{});
await page.evaluate(() => { window.location.hash = '#home'; });
await page.waitForTimeout(600);

for (const w of [1100, 900]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  console.log(`width ${w}px overflow:`, overflow);
  await page.screenshot({ path: path.join(SHOT_DIR, `10-design2-${w}.png`) });
}
await page.setViewportSize({ width: 1440, height: 900 });

// Round trip: Design2 -> Classic -> Design2, checking dashboard still renders sanely.
await page.evaluate(async () => { await window.archivAPI.fs.setProjectSetting('uiDesign', 'classic'); });
await page.reload();
await page.waitForSelector('.sidebar', { timeout: 20000 }).catch(()=>{});
await page.evaluate(() => { window.location.hash = '#home'; });
await page.waitForTimeout(500);
await page.evaluate(async () => { await window.archivAPI.fs.setProjectSetting('uiDesign', 'design2'); });
await page.reload();
await page.waitForSelector('.sidebar', { timeout: 20000 }).catch(()=>{});
await page.evaluate(() => { window.location.hash = '#home'; });
await page.waitForTimeout(600);
const roundTrip = await page.evaluate(() => ({
  dashRows: document.querySelectorAll('.d2-dash-row').length,
  railTagChips: document.querySelectorAll('.d2-dash-tag-chip').length,
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
}));
console.log('round trip check:', JSON.stringify(roundTrip));
await page.screenshot({ path: path.join(SHOT_DIR, '11-roundtrip-design2.png') });

// Editor regression: open a note, check editor still renders normally.
const notePath = await page.evaluate(async () => {
  const tree = await window.archivAPI.fs.listTree();
  const findFirstNote = (node) => {
    if (node.type === 'note') return node.relPath;
    for (const c of node.children || []) { const r = findFirstNote(c); if (r) return r; }
    return null;
  };
  return findFirstNote(tree);
});
if (notePath) {
  await page.evaluate((rp) => { window.location.hash = '#note/' + encodeURIComponent(rp); }, notePath);
  await page.waitForTimeout(800);
  const editorInfo = await page.evaluate(() => ({
    hasEditor: !!document.getElementById('editorContainer'),
    hasCm: !!document.querySelector('.cm-editor'),
    hasToolbar: !!document.querySelector('.note-toolbar'),
    hasRail: !!document.getElementById('noteRail'),
  }));
  console.log('editor regression check:', JSON.stringify(editorInfo));
  await page.screenshot({ path: path.join(SHOT_DIR, '12-editor-regression.png') });
}

console.log('ERRORS:', errors.length ? JSON.stringify(errors) : 'none');
await app.close();
