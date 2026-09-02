// Prüft das neu gebaute Einstellungsfenster: alle sieben Bereiche, beide
// Themes, Maße gegen archiv-wiki-einstellungen.md.
import { _electron as electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_DIR = '/home/smashii/Dokumente/Archiv Wiki/archiv-wiki';
const TEST_HOME = path.join(APP_DIR, '.claude-test-home');
const SHOT_DIR = path.join(TEST_HOME, 'shots-settings');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const cleanEnv = { ...process.env };
delete cleanEnv.ELECTRON_RUN_AS_NODE;
cleanEnv.HOME = TEST_HOME;
cleanEnv.XDG_CONFIG_HOME = path.join(TEST_HOME, '.config');
cleanEnv.XDG_CACHE_HOME = path.join(TEST_HOME, '.cache');
cleanEnv.XDG_DATA_HOME = path.join(TEST_HOME, '.local/share');

const SECTIONS = ['general', 'appearance', 'editor', 'backup', 'updates', 'webclipper', 'security'];
const errors = [];

async function main() {
  const app = await electron.launch({
    executablePath: path.join(APP_DIR, 'node_modules/electron/dist/electron'),
    args: ['--disable-gpu', '--disable-gpu-compositing', APP_DIR],
    env: cleanEnv,
    timeout: 30_000
  });
  await new Promise(r => setTimeout(r, 6000));
  const page = app.windows().find(w => !w.url().startsWith('devtools://')) ?? await app.firstWindow();
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  console.log('launched:', page.url());

  await page.setViewportSize({ width: 1400, height: 900 });

  for (const theme of ['dark', 'light']) {
    await page.evaluate((mode) => {
      document.body.classList.toggle('theme-light', mode === 'light');
      document.querySelector('.aws-scrim')?.remove();
    }, theme);
    await page.evaluate(() => document.getElementById('btnSettings')?.click());
    await new Promise(r => setTimeout(r, 1200));

    const exists = await page.evaluate(() => Boolean(document.querySelector('.aws-window')));
    if (!exists) { errors.push(`[${theme}] Einstellungsfenster wurde nicht geöffnet`); break; }

    for (const id of SECTIONS) {
      await page.evaluate((sectionId) => {
        document.querySelector(`.aws-tab[data-section="${sectionId}"]`)?.click();
      }, id);
      await new Promise(r => setTimeout(r, 700));

      const info = await page.evaluate((sectionId) => {
        const win = document.querySelector('.aws-window');
        const pane = document.querySelector('.aws-pane');
        const rows = [...document.querySelectorAll('.aws-row')];
        const labels = rows.map(r => Math.round(r.querySelector('.aws-label').getBoundingClientRect().width));
        const rightEdges = rows.map(r => Math.round(r.getBoundingClientRect().right));
        const win_ = win.getBoundingClientRect();
        return {
          section: sectionId,
          window: [Math.round(win_.width), Math.round(win_.height)],
          title: document.getElementById('awsTitle').textContent,
          searchVisible: !document.getElementById('awsSearch').hidden,
          titlebarH: Math.round(document.querySelector('.aws-titlebar').getBoundingClientRect().height),
          tabsH: Math.round(document.querySelector('.aws-tabs').getBoundingClientRect().height),
          single: pane?.classList.contains('is-single') || false,
          colWidth: pane?.classList.contains('is-single')
            ? Math.round(document.querySelector('.aws-pane.is-single > .aws-col').getBoundingClientRect().width) : null,
          rows: rows.length,
          labelWidths: [...new Set(labels)],
          rightEdges: [...new Set(rightEdges)],
          cards: document.querySelectorAll('.aws-state').length,
          primary: [...document.querySelectorAll('.aws-btn1')].map(b => b.textContent),
          headings: [...document.querySelectorAll('.aws-body h1, .aws-body h2, .aws-body h3, .aws-body h4')].map(h => h.textContent),
          swatch: (() => {
            const s = document.querySelector('.aws-swatch');
            if (!s) return null;
            const r = s.getBoundingClientRect();
            return [Math.round(r.width), Math.round(r.height), getComputedStyle(s).borderRadius];
          })(),
          bodyOverflowX: document.querySelector('.aws-body').scrollWidth > document.querySelector('.aws-body').clientWidth,
          computed: (() => {
            const pick = (sel, prop) => {
              const node = document.querySelector(sel);
              return node ? getComputedStyle(node)[prop] : null;
            };
            return {
              input: pick('.aws-input', 'backgroundColor'),
              btn2: pick('.aws-btn2', 'backgroundColor'),
              tabActive: pick('.aws-tab.is-active', 'backgroundColor'),
              tabRadius: pick('.aws-tab', 'borderRadius'),
              switchTrack: pick('.aws-switch', 'backgroundColor'),
              link: pick('.aws-link', 'color'),
              mark: pick('.aws-group-head span', 'color')
            };
          })()
        };
      }, id);
      console.log(`[${theme}]`, JSON.stringify(info));
      await page.screenshot({ path: path.join(SHOT_DIR, `${theme}-${id}.png`) });
    }
    await page.evaluate(() => document.getElementById('awsClose').click());
    await new Promise(r => setTimeout(r, 600));
  }

  console.log('\n--- Fehler ---');
  console.log(errors.length ? errors.join('\n') : 'keine');
  await app.close();
}

main().catch(e => { console.error('FEHLER:', e); process.exit(1); });
