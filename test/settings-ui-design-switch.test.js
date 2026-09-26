// test/settings-ui-design-switch.test.js
// Regression: Wechsel Design 3 -> Classic im Einstellungsfenster.
//
// Fehlerbild: Nach einer beliebigen anderen Einstellung (updateSetting ersetzt
// die Fenster-config), Auswahl "Design 3" und einem Reiterwechsel zeigte der
// Umschalter wieder "Classic" als aktiv, obwohl Design 3 angewandt war. Der
// Klick auf Classic wurde gegen das veraltete config.uiDesign ("classic") als
// "unverändert" verworfen — das Fenster (und die App) behielt Design 3.
// Design 2/Design 3 waren nicht betroffen, weil sie vom veralteten Wert
// abweichen. Dasselbe trat bei schnellem Klick Design 3 -> Classic auf.
//
// Wie in webclip-browser-ipc.test.js wird der echte Quelltext aus
// settings-window.js herausgelöst und isoliert (vm) mit Stubs ausgeführt.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');
const settingsSource = fs.readFileSync(path.join(root, 'renderer', 'js', 'settings-window.js'), 'utf8');

// Schneidet einen Aufruf ab `startToken` bis zur passenden schließenden
// Klammer samt ");" heraus.
function extractCall(source, startToken) {
  const start = source.indexOf(startToken);
  if (start === -1) throw new Error(`"${startToken}" nicht in settings-window.js gefunden`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, source.indexOf(';', i) + 1);
    }
  }
  throw new Error(`Aufruf "${startToken}" nicht abgeschlossen`);
}

function extractAppliedUiDesignExpression() {
  const match = settingsSource.match(/const appliedUiDesign = ([^;]+);/);
  if (!match) throw new Error('appliedUiDesign nicht in renderAppearanceSection gefunden');
  return match[1];
}

async function createHarness({ applied, configUiDesign }) {
  const { resolveUiDesign } = await import(pathToFileURL(path.join(root, 'renderer', 'js', 'ui-design.js')).href);
  const handlers = {};
  const saves = [];
  const feedback = [];
  const context = {
    console: { error() {} },
    document: { body: { dataset: { uiDesign: applied } } },
    config: { uiDesign: configUiDesign },
    el: { querySelectorAll: () => [] },
    uiDesignRequestSeq: 0,
    resolveUiDesign,
    applyUiDesign: (value) => { context.document.body.dataset.uiDesign = resolveUiDesign(value); },
    fs: {
      setProjectSetting: (key, value) => new Promise((resolve, reject) => {
        saves.push({ key, value, resolve, reject });
      })
    },
    setFeedback: (_el, id, text, isError) => feedback.push({ id, text, isError: Boolean(isError) }),
    onSegmentChange: (_scope, id, handler) => { handlers[id] = handler; }
  };
  vm.createContext(context);
  vm.runInContext(extractCall(settingsSource, "onSegmentChange(el, 'stUiDesign'"), context);
  assert.equal(typeof handlers.stUiDesign, 'function', 'Design-Umschalter-Handler muss registriert werden');
  return {
    context,
    saves,
    feedback,
    click: (value) => handlers.stUiDesign(value),
    applied: () => context.document.body.dataset.uiDesign,
    segmentValue: () => vm.runInContext(extractAppliedUiDesignExpression(), context)
  };
}

test('Einstellungsfenster: Umschalter zeigt das angewandte Design, nicht ein veraltetes config.uiDesign', async () => {
  const h = await createHarness({ applied: 'design3', configUiDesign: 'classic' });
  assert.equal(h.segmentValue(), 'design3');
});

test('Einstellungsfenster: Design 3 -> Classic greift trotz veraltetem config.uiDesign', async () => {
  const h = await createHarness({ applied: 'design3', configUiDesign: 'classic' });
  const done = h.click('classic');
  assert.equal(h.applied(), 'classic', 'Classic muss sofort angewandt werden');
  assert.deepEqual(h.saves.map(s => s.value), ['classic'], 'Classic muss gespeichert werden');
  h.saves[0].resolve({ config: { uiDesign: 'classic' } });
  await done;
  assert.equal(h.applied(), 'classic');
  assert.equal(h.context.config.uiDesign, 'classic');
});

test('Einstellungsfenster: schneller Klick Design 3 -> Classic endet in Classic', async () => {
  const h = await createHarness({ applied: 'classic', configUiDesign: 'classic' });
  const first = h.click('design3');
  const second = h.click('classic');
  assert.equal(h.applied(), 'classic');
  assert.deepEqual(h.saves.map(s => s.value), ['design3', 'classic'], 'letzte Auswahl muss zuletzt gespeichert werden');
  h.saves[0].resolve({});
  h.saves[1].resolve({});
  await Promise.all([first, second]);
  assert.equal(h.applied(), 'classic');
});

test('Einstellungsfenster: Fehler einer älteren Auswahl setzt die neuere nicht zurück', async () => {
  const h = await createHarness({ applied: 'classic', configUiDesign: 'classic' });
  const first = h.click('design3');
  const second = h.click('classic');
  h.saves[0].reject(new Error('Schreibfehler'));
  h.saves[1].resolve({});
  await Promise.all([first, second]);
  assert.equal(h.applied(), 'classic');
  assert.deepEqual(h.feedback.filter(f => f.isError), []);
});

test('Einstellungsfenster: Speicherfehler setzt auf das zuvor angewandte Design zurück', async () => {
  const h = await createHarness({ applied: 'design3', configUiDesign: 'classic' });
  const done = h.click('classic');
  h.saves[0].reject(new Error('Schreibfehler'));
  await done;
  assert.equal(h.applied(), 'design3');
  assert.equal(h.feedback.at(-1).isError, true);
});

test('Einstellungsfenster: Design 2 und Design 3 schalten weiterhin um, gleiche Auswahl ist ein No-op', async () => {
  const h = await createHarness({ applied: 'classic', configUiDesign: 'classic' });
  h.click('design2');
  assert.equal(h.applied(), 'design2');
  h.click('design3');
  assert.equal(h.applied(), 'design3');
  h.click('design3');
  assert.deepEqual(h.saves.map(s => s.value), ['design2', 'design3']);
});
