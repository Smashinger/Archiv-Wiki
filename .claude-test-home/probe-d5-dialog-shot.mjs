import { _electron as electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_DIR = '/home/smashii/Dokumente/Archiv Wiki/archiv-wiki';
const TEST_HOME = path.join(APP_DIR, '.claude-test-home');
const SHOT_DIR = path.join(TEST_HOME, 'shots-d5');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const cleanEnv = { ...process.env };
delete cleanEnv.ELECTRON_RUN_AS_NODE;
cleanEnv.HOME = TEST_HOME;
cleanEnv.XDG_CONFIG_HOME = path.join(TEST_HOME, '.config');
cleanEnv.XDG_CACHE_HOME = path.join(TEST_HOME, '.cache');
cleanEnv.XDG_DATA_HOME = path.join(TEST_HOME, '.local/share');

async function main() {
  const app = await electron.launch({
    executablePath: path.join(APP_DIR, 'node_modules/electron/dist/electron'),
    args: ['--disable-gpu', '--disable-gpu-compositing', APP_DIR],
    env: cleanEnv,
    timeout: 30_000,
  });
  await new Promise(r => setTimeout(r, 6000));
  const page = app.windows().find(w => !w.url().startsWith('devtools://')) ?? await app.firstWindow();

  await page.evaluate(() => { location.hash = '#incoming'; });
  await new Promise(r => setTimeout(r, 800));
  const id = await page.evaluate(() => document.querySelector('.incoming-select-checkbox')?.dataset.incomingId);
  await page.evaluate((entryId) => { location.hash = '#incoming/' + encodeURIComponent(entryId); }, id);
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => document.getElementById('btnProcessIncoming')?.click());
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => document.querySelector('.incoming-process-overlay [data-action="continue"]')?.click());
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(SHOT_DIR, '00-template-picker.png') });

  await app.close();
  console.log('done');
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
