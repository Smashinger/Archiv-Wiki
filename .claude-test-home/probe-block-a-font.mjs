/* Block A — Korrekturauftrag Punkt 1: --d2-font-body von Inter auf Barlow.
   Prüft dreierlei:
   1. Löst das Token auf Barlow auf und ist die Schrift wirklich geladen?
   2. Läuft irgendein Text über seinen Kasten hinaus? Gemessen wird zweimal
      in derselben Sitzung — einmal mit Barlow, einmal mit auf Inter
      zurückgesetztem Token — damit "neu übergelaufen" von "war schon vorher
      zu eng" unterscheidbar ist.
   3. Bilder der drei laut Auftrag knappen Stellen. */
import { _electron as electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_DIR = '/home/smashii/Dokumente/Archiv Wiki/archiv-wiki';
const TEST_HOME = path.join(APP_DIR, '.claude-test-home');
const SHOT = path.join(TEST_HOME, 'shots-block-a');
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
await new Promise(r => setTimeout(r, 800));

// --- 1. Token und Schriftverfügbarkeit -----------------------------------
const font = await page.evaluate(() => {
  const cs = getComputedStyle(document.body);
  return {
    token: cs.getPropertyValue('--d2-font-body').trim(),
    bodyFont: cs.fontFamily,
    barlow400: document.fonts.check('400 13px Barlow'),
    barlow600: document.fonts.check('600 13px Barlow'),
    condensed: document.fonts.check('600 10px "Barlow Condensed"'),
    mono: document.fonts.check('400 11px "IBM Plex Mono"'),
    // Breitenbeweis: derselbe Text in beiden Familien gemessen.
    breite: (() => {
      const c = document.createElement('canvas').getContext('2d');
      const t = 'Zuletzt bearbeitet · 62 Notizen · Wissenspflege';
      c.font = '13px Barlow'; const b = c.measureText(t).width;
      c.font = '13px Inter'; const i = c.measureText(t).width;
      return { barlow: +b.toFixed(1), inter: +i.toFixed(1) };
    })(),
  };
});
console.log('SCHRIFT', JSON.stringify(font));

// --- 2. Überlauf-Vergleich Barlow vs. Inter -------------------------------
const scan = async () => page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!el.offsetParent && el.tagName !== 'BODY') continue;
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!hasText) continue;
    const over = el.scrollWidth - el.clientWidth;
    if (over > 1) {
      out.push({
        sel: el.className ? '.' + String(el.className).split(' ')[0] : el.tagName,
        over,
        text: el.textContent.trim().slice(0, 40),
      });
    }
  }
  return out;
});

const mitBarlow = await scan();
await page.evaluate(() => document.body.style.setProperty('--d2-font-body', 'Inter, system-ui, sans-serif'));
await new Promise(r => setTimeout(r, 400));
const mitInter = await scan();
await page.evaluate(() => document.body.style.removeProperty('--d2-font-body'));
await new Promise(r => setTimeout(r, 400));

const key = o => o.sel + '|' + o.text;
const vorher = new Set(mitInter.map(key));
const neu = mitBarlow.filter(o => !vorher.has(key(o)));
console.log('UEBERLAUF barlow=%d inter=%d neu=%d', mitBarlow.length, mitInter.length, neu.length);
if (neu.length) console.log('NEU', JSON.stringify(neu, null, 1));

// --- 3. Die drei laut Auftrag knappen Stellen -----------------------------
const stats = await page.evaluate(() => {
  const el = document.querySelector('.d2-dash-stats');
  if (!el) return 'FEHLT';
  const cs = getComputedStyle(el);
  return { font: cs.fontFamily.split(',')[0], scroll: el.scrollWidth, client: el.clientWidth };
});
console.log('DASHBOARD-KENNZAHLEN', JSON.stringify(stats));
await page.screenshot({ path: path.join(SHOT, '01-dashboard.png'), clip: { x: 0, y: 0, width: 1400, height: 420 } });
await page.screenshot({ path: path.join(SHOT, '02-sidebar.png'), clip: { x: 0, y: 0, width: 300, height: 620 } });

// Einstellungen öffnen
await page.evaluate(() => {
  const b = document.getElementById('btnSettings')
    || [...document.querySelectorAll('button')].find(x => /Einstellungen/i.test(x.title || x.getAttribute('aria-label') || ''));
  b?.click();
});
await new Promise(r => setTimeout(r, 1200));
const settings = await page.evaluate(() => {
  const tabs = document.querySelector('.aws-tabs');
  if (!tabs) return 'FEHLT';
  const cs = getComputedStyle(tabs);
  const hints = [...document.querySelectorAll('.aws-hint, .aws-sub, .aws-desc')].map(el => ({
    over: el.scrollWidth - el.clientWidth, text: el.textContent.trim().slice(0, 34),
  })).filter(h => h.over > 1);
  return { tabFont: cs.fontFamily.split(',')[0], tabScroll: tabs.scrollWidth, tabClient: tabs.clientWidth, hints };
});
console.log('EINSTELLUNGEN', JSON.stringify(settings));
if (settings !== 'FEHLT') await page.screenshot({ path: path.join(SHOT, '03-einstellungen.png') });

console.log('FEHLER:', errs.length ? errs.join(' | ') : 'keine');
await app.close();
