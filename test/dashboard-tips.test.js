const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appPath = path.join(__dirname, '..', 'renderer', 'js', 'app.js');
const appCode = fs.readFileSync(appPath, 'utf8');

function createTipsHarness(initialConfig = {}) {
  const start = appCode.indexOf('const DASHBOARD_TIPS = [');
  const end = appCode.indexOf('function bindDashboardTipButton', start);
  assert.notEqual(start, -1, 'Tipp-Liste muss vorhanden sein');
  assert.notEqual(end, -1, 'Auswahl-Logik muss vorhanden sein');

  const config = { ...initialConfig };
  const writes = [];
  const context = vm.createContext({
    state: { project: { config } },
    fs: {
      async setProjectSetting(key, value) {
        writes.push([key, value]);
        config[key] = value;
      }
    },
    window: { archivAPI: { getVersion: async () => '2.3.2' } }
  });

  const source = `${appCode.slice(start, end)}\n` +
    'globalThis.__tipsApi = { DASHBOARD_TIPS, chooseDashboardTip, tipIsRelevant, buildGeneralTipCycle };';
  vm.runInContext(source, context);
  return { ...context.__tipsApi, config, writes };
}

const allRelevant = {
  noteCount: 5,
  backupConfigured: false,
  customTemplateCount: 0,
  tagCount: 0
};

test('Dashboard-Tipps: Inhalte sind aktuell, eindeutig und decken neue Kernfunktionen ab', () => {
  const { DASHBOARD_TIPS } = createTipsHarness();
  const ids = DASHBOARD_TIPS.map(tip => tip.id);
  const allText = DASHBOARD_TIPS.map(tip => tip.text).join('\n');

  assert.equal(new Set(ids).size, ids.length, 'jede Tipp-ID muss eindeutig sein');
  assert.equal(ids.includes('first-note'), false, 'der im leeren Dashboard doppelte Tipp bleibt entfernt');
  assert.doesNotMatch(allText, /Zufallsfarbe per Klick|Über das Zahnrad/);
  assert.match(allText, /Bild-Schaltfläche/);
  assert.match(allText, /Strg\+V/);
  for (const id of ['incoming', 'multi-select', 'wiki-switcher']) {
    assert.ok(ids.includes(id), `wichtiger Tipp fehlt: ${id}`);
  }
});

test('Dashboard-Tipps: erste Schritte kommen vor allgemeinen Tipps und hohe Priorität zuerst', async () => {
  const { DASHBOARD_TIPS, chooseDashboardTip, config } = createTipsHarness();
  const firstSteps = DASHBOARD_TIPS.filter(tip => tip.category === 'firstSteps');

  for (const expected of firstSteps) {
    assert.equal((await chooseDashboardTip(allRelevant)).id, expected.id);
  }

  const firstGeneral = await chooseDashboardTip(allRelevant);
  assert.equal(firstGeneral.category, 'general');
  assert.equal(firstGeneral.priority, 'high');
  assert.deepEqual(config.dashboardTipFirstStepsSeen, firstSteps.map(tip => tip.id));
});

test('Dashboard-Tipps: ein vollständiger Durchlauf wiederholt keinen Tipp', async () => {
  const base = createTipsHarness();
  const firstStepIds = base.DASHBOARD_TIPS
    .filter(tip => tip.category === 'firstSteps')
    .map(tip => tip.id);
  const { DASHBOARD_TIPS, chooseDashboardTip } = createTipsHarness({
    dashboardTipFirstStepsSeen: firstStepIds
  });
  const eligibleCount = DASHBOARD_TIPS
    .filter(tip => tip.category === 'general' && (!tip.isRelevant || tip.isRelevant(allRelevant)))
    .length;
  const seen = [];

  for (let i = 0; i < eligibleCount; i += 1) {
    seen.push((await chooseDashboardTip(allRelevant)).id);
  }

  assert.equal(new Set(seen).size, eligibleCount);
});

test('Dashboard-Tipps: veralteter gespeicherter Zustand wird bereinigt, andere Einstellungen bleiben erhalten', async () => {
  const { DASHBOARD_TIPS, chooseDashboardTip, config, writes } = createTipsHarness({
    dashboardTipFirstStepsSeen: ['context-menu', 'search', 'shortcuts'],
    dashboardTipCycleRemaining: ['entfernter-tipp', 'wikilinks'],
    dashboardTipCompletedCycles: 1,
    unrelatedSetting: 'bleibt'
  });

  assert.ok(DASHBOARD_TIPS.some(tip => tip.id === 'wikilinks'));
  assert.equal((await chooseDashboardTip(allRelevant)).id, 'wikilinks');
  assert.deepEqual(config.dashboardTipCycleRemaining, []);
  assert.equal(config.dashboardTipCompletedCycles, 1);
  assert.equal(config.unrelatedSetting, 'bleibt');
  assert.deepEqual(writes.map(([key]) => key), [
    'dashboardTipCycleRemaining',
    'dashboardTipCompletedCycles'
  ]);
});
