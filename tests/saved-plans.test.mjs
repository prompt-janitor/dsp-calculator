// Saved plans: the list, storage, the backup file and plan links.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './lib/load.mjs';
import { defaultState } from '../src/js/store.js';
import {
  PLANS_KEY, planData, readPlanData, withPlan, samePlan, defaultName, cleanName, uniqueName, addPlan, overwritePlan, renamePlan,
  duplicatePlan, deletePlan, restorePlan, markOpened, sortPlans, loadPlans, savePlans, exportName, exportText, importText,
  encodePlan, planLink, decodePlanHash
} from '../src/js/saved-plans.js';

const HOSTILE = '"><img src=x onerror="window.pwned=1">';

// A stand-in for localStorage. full: setItem throws, as when storage is full.
function fakeStorage({ full = false, blocked = false } = {}) {
  const map = new Map();
  return {
    getItem(key) { if (blocked) throw new Error('blocked'); return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { if (blocked || full) throw new Error('QuotaExceededError'); map.set(key, String(value)); },
    map
  };
}

function choices(change = () => {}) {
  const state = defaultState();
  change(state);
  return state;
}

test('a plan keeps targets, overrides and settings but not tabs or theme', () => {
  const state = choices((s) => {
    s.targets = [{ item: 'gear', rate: 30 }];
    s.unit = 's'; s.belt = 'conveyor-belt-2'; s.stack = 4; s.prolif = { level: 3, mode: 'speed' };
    s.mining.veins = 4; s.machines.smelter = 'arc-smelter';
    s.overrides = { 'iron-ingot': { external: true } };
    s.tab = 'settings'; s.opts.theme = 'light';
  });
  const data = planData(state);
  assert.deepEqual(Object.keys(data).sort(), ['belt', 'machines', 'mining', 'overrides', 'prolif', 'stack', 'targets', 'unit']);
  assert.equal(data.mining.veins, 4);
  assert.deepEqual(data.overrides, { 'iron-ingot': { external: true } });
  // A copy, so later changes to the state do not change the saved plan.
  state.targets[0].rate = 99;
  assert.equal(data.targets[0].rate, 30);
});

test('opening a plan keeps the tab and theme', () => {
  const current = choices((s) => { s.tab = 'map'; s.opts.theme = 'dark'; s.overrides = { gear: { external: true } }; });
  const data = planData(choices((s) => { s.targets = [{ item: 'processor', rate: 6 }]; }));
  const next = withPlan(current, data);
  assert.equal(next.tab, 'map');
  assert.equal(next.opts.theme, 'dark');
  assert.deepEqual(next.targets, [{ item: 'processor', rate: 6 }]);
  assert.deepEqual(next.overrides, {});
  assert.ok(samePlan(next, data));
});

test('a changed setting makes the plan differ', () => {
  const a = choices();
  assert.ok(samePlan(a, choices((s) => { s.tab = 'build'; })));
  assert.ok(!samePlan(a, choices((s) => { s.stack = 2; })));
  assert.ok(!samePlan(a, choices((s) => { s.targets[0].rate = 61; })));
  // The order of override keys does not matter.
  const x = choices((s) => { s.overrides = { gear: { external: true }, 'iron-ingot': { machine: 'arc-smelter' } }; });
  const y = choices((s) => { s.overrides = { 'iron-ingot': { machine: 'arc-smelter' }, gear: { external: true } }; });
  assert.ok(samePlan(x, y));
});

test('default names come from the targets', () => {
  assert.equal(defaultName(planData(choices())), '60/min Information Matrix');
  const many = planData(choices((s) => {
    s.unit = 's';
    s.targets = [{ item: 'space-warper', rate: 0.5 }, { item: 'gear', rate: 1 }, { item: 'processor', rate: 2 }];
  }));
  assert.equal(defaultName(many), '0.5/s Space Warper +2 more');
  assert.equal(defaultName(planData(choices((s) => { s.targets = []; }))), 'Empty plan');
  assert.equal(defaultName(planData(choices((s) => { s.targets = [{ item: 'gear', rate: 1 / 3 }]; }))), '0.333333/min Gear');
});

test('names are cleaned and a taken name gets a number', () => {
  assert.equal(cleanName('  Mall\n\tline  '), 'Mall line');
  assert.equal(cleanName('x'.repeat(200)).length, 80);
  assert.equal(cleanName(42), '');
  const plans = [{ id: 'a', name: 'Mall' }, { id: 'b', name: 'Mall (2)' }];
  assert.equal(uniqueName(plans, 'Mall'), 'Mall (3)');
  assert.equal(uniqueName(plans, 'mall'), 'mall (3)');
  assert.equal(uniqueName(plans, 'Mall (2)'), 'Mall (3)');
  assert.equal(uniqueName(plans, 'Warpers'), 'Warpers');
  assert.equal(uniqueName(plans, 'Mall', 'a'), 'Mall');
});

test('save, overwrite, rename, duplicate and delete with undo', () => {
  const plans = [];
  const first = addPlan(plans, choices(), '', 1000);
  assert.equal(first.name, '60/min Information Matrix');
  assert.equal(first.createdAt, 1000);
  const second = addPlan(plans, choices(), '', 2000);
  assert.equal(second.name, '60/min Information Matrix (2)');
  assert.equal(plans[0], second);

  overwritePlan(plans, first.id, choices((s) => { s.targets = [{ item: 'gear', rate: 5 }]; }), 3000);
  assert.deepEqual(first.data.targets, [{ item: 'gear', rate: 5 }]);
  assert.equal(first.updatedAt, 3000);
  assert.equal(first.createdAt, 1000);

  renamePlan(plans, first.id, '  Gears  ', 4000);
  assert.equal(first.name, 'Gears');
  renamePlan(plans, first.id, '   ', 5000);
  assert.equal(first.name, 'Gears');

  const copy = duplicatePlan(plans, first.id, 6000);
  assert.equal(copy.name, 'Gears (2)');
  assert.notEqual(copy.id, first.id);
  assert.deepEqual(copy.data, first.data);
  copy.data.targets[0].rate = 7;
  assert.equal(first.data.targets[0].rate, 5);

  const removed = deletePlan(plans, first.id);
  assert.equal(plans.length, 2);
  assert.ok(!plans.includes(first));
  restorePlan(plans, removed);
  assert.equal(plans[removed.at], first);
  assert.equal(deletePlan(plans, 'nope'), null);
});

test('the list sorts by last opened or saved, newest first', () => {
  const plans = [
    { id: 'a', updatedAt: 10, openedAt: 50 },
    { id: 'b', updatedAt: 40, openedAt: 0 },
    { id: 'c', updatedAt: 60, openedAt: 20 }
  ];
  assert.deepEqual(sortPlans(plans).map((p) => p.id), ['c', 'a', 'b']);
  markOpened(plans, 'b', 100);
  assert.deepEqual(sortPlans(plans).map((p) => p.id), ['b', 'c', 'a']);
});

test('plans survive a save and load', () => {
  const storage = fakeStorage();
  const plans = [];
  const a = addPlan(plans, choices(), 'One', 1000);
  addPlan(plans, choices((s) => { s.stack = 3; }), 'Two', 2000);
  assert.ok(savePlans(storage, plans, a.id));
  const stored = JSON.parse(storage.map.get(PLANS_KEY));
  assert.equal(stored.version, 1);
  assert.deepEqual(Object.keys(stored.plans[0]).sort(), ['createdAt', 'data', 'id', 'name', 'openedAt', 'updatedAt']);
  const loaded = loadPlans(storage);
  assert.ok(loaded.ok);
  assert.equal(loaded.open, a.id);
  assert.deepEqual(loaded.plans, plans);
});

test('blocked or full storage is reported and the list stays in memory', () => {
  const plans = [];
  addPlan(plans, choices(), 'One');
  assert.equal(savePlans(fakeStorage({ full: true }), plans, null), false);
  assert.equal(plans.length, 1);
  assert.deepEqual(loadPlans(fakeStorage({ blocked: true })), { plans: [], open: null, ok: false });
});

test('bad stored data is dropped plan by plan', () => {
  const storage = fakeStorage();
  storage.setItem(PLANS_KEY, JSON.stringify({
    version: 1, open: 'gone',
    plans: [
      null, 'x', { name: 'No data' },
      { id: HOSTILE, name: HOSTILE, createdAt: 'x', data: { targets: [{ item: HOSTILE, rate: 1 }], belt: HOSTILE } },
      { id: 'ok-1', name: 'Fine', createdAt: 5, updatedAt: 6, openedAt: 7, data: planData(choices()) },
      { id: 'ok-1', name: 'Same id', createdAt: 5, updatedAt: 6, data: planData(choices()) }
    ]
  }));
  const { plans, open } = loadPlans(storage, 1234);
  assert.equal(open, null);
  assert.equal(plans.length, 3);
  const hostile = plans.find((p) => p.name === HOSTILE);
  assert.match(hostile.id, /^[\w-]+$/);
  assert.equal(hostile.createdAt, 1234);
  assert.deepEqual(hostile.data.targets, []);
  assert.equal(hostile.data.belt, defaultState().belt);
  assert.equal(new Set(plans.map((p) => p.id)).size, 3);
  storage.setItem(PLANS_KEY, '{not json');
  assert.deepEqual(loadPlans(storage).plans, []);
  storage.setItem(PLANS_KEY, JSON.stringify({ version: 2, plans: [] }));
  assert.deepEqual(loadPlans(storage).plans, []);
});

test('the backup file has every plan and loads back', () => {
  const plans = [];
  addPlan(plans, choices(), 'One', 1000);
  addPlan(plans, choices((s) => { s.overrides = { gear: { external: true } }; }), 'Two', 2000);
  const date = new Date(2026, 9, 25, 9, 30);
  assert.equal(exportName(date), 'dsp-calculator-plans-2026-10-25.json');
  const text = exportText(plans, date);
  const file = JSON.parse(text);
  assert.equal(file.version, 1);
  assert.equal(file.plans.length, 2);
  assert.equal(file.plans[0].id, undefined);

  const other = [];
  assert.deepEqual(importText(other, text), { added: 2, skipped: 0 });
  assert.deepEqual(other.map((p) => p.name), ['Two', 'One']);
  assert.deepEqual(other[0].data, plans[0].data);
  assert.notEqual(other[0].id, plans[0].id);
});

test('an import adds plans and numbers a clashing name', () => {
  const plans = [];
  addPlan(plans, choices(), 'One', 1000);
  const text = exportText(plans);
  assert.deepEqual(importText(plans, text), { added: 1, skipped: 0 });
  assert.deepEqual(importText(plans, text), { added: 1, skipped: 0 });
  assert.deepEqual(plans.map((p) => p.name).sort(), ['One', 'One (2)', 'One (3)']);
});

test('an import checks every plan like a plan code', () => {
  const plans = [];
  const text = JSON.stringify({
    version: 1,
    plans: [
      null, 7, { name: 'No data' }, { name: 'Bad data', data: 'x' }, { name: 'No targets', data: { belt: 'conveyor-belt-1' } },
      {
        name: HOSTILE + '\u0000', id: 'keep-me', createdAt: -5,
        data: {
          targets: [{ item: 'gear', rate: 5 }, { item: '__proto__', rate: 1 }, { item: HOSTILE, rate: 1 }],
          machines: { smelter: HOSTILE }, belt: 'toString', stack: 99, prolif: { level: 9, mode: 'x' },
          mining: { speed: 1e9, veins: -1, oil: 'x' }, overrides: { gear: { recipe: HOSTILE, external: true }, [HOSTILE]: { external: true } },
          tab: 'settings', opts: { theme: 'light' }
        }
      }
    ]
  });
  assert.deepEqual(importText(plans, text, 500), { added: 1, skipped: 5 });
  const [plan] = plans;
  assert.equal(plan.name, HOSTILE.trim());
  assert.notEqual(plan.id, 'keep-me');
  assert.equal(plan.createdAt, 500);
  const base = defaultState();
  assert.deepEqual(plan.data, {
    targets: [{ item: 'gear', rate: 5 }], unit: 'min', machines: base.machines, belt: base.belt, stack: 1, prolif: base.prolif,
    mining: { speed: 1000, veins: 1, oil: 1, orbital: 55 }, overrides: { gear: { external: true } }
  });
  assert.equal(plan.data.tab, undefined);
});

test('an import of something else is refused', () => {
  const plans = [];
  for (const text of ['', 'nope', '[]', '42', '{"plans":"x"}', '{"hello":1}', 'x'.repeat(6 * 1024 * 1024), null]) {
    assert.equal(importText(plans, text), null, String(text).slice(0, 20));
  }
  assert.equal(plans.length, 0);
});

test('an old plan code imports as one plan', () => {
  const plans = [];
  const code = JSON.stringify(choices((s) => { s.targets = [{ item: 'space-warper', rate: 30 }]; s.tab = 'map'; }));
  assert.deepEqual(importText(plans, code), { added: 1, skipped: 0 });
  assert.equal(plans[0].name, '30/min Space Warper');
  assert.deepEqual(plans[0].data.targets, [{ item: 'space-warper', rate: 30 }]);
});

test('a plan link comes back the same', () => {
  const state = choices((s) => {
    s.targets = [{ item: 'space-warper', rate: 0.75 }, { item: 'gear', rate: 1234.5 }];
    s.unit = 's'; s.stack = 4; s.prolif = { level: 2, mode: 'speed' }; s.mining = { speed: 220, veins: 3, oil: 2.5, orbital: 70 };
    s.overrides = { graphene: { recipe: 'graphene-advanced' }, processor: { external: true } };
  });
  const link = planLink('https://example.com/dsp-calculator/#old', state);
  assert.match(link, /^https:\/\/example\.com\/dsp-calculator\/#plan=[\w-]+$/);
  assert.deepEqual(decodePlanHash(new URL(link).hash), planData(state));
  assert.ok(!/[+/=]/.test(encodePlan(state)));
});

test('a bad plan link is refused or cleaned', () => {
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  for (const hash of ['', '#plan=', '#other', '#plan=***', '#plan=' + 'A'.repeat(30000), '#plan=bm90IGpzb24', '#plan=' + b64([1]), '#plan=' + b64({ belt: 'x' })]) {
    assert.equal(decodePlanHash(hash), null, hash.slice(0, 20));
  }
  const data = decodePlanHash('#plan=' + b64({ targets: [{ item: HOSTILE, rate: 1 }, { item: 'gear', rate: 2 }], belt: HOSTILE, tab: 'settings' }));
  assert.deepEqual(data.targets, [{ item: 'gear', rate: 2 }]);
  assert.equal(data.belt, defaultState().belt);
  assert.equal(data.tab, undefined);
  assert.ok(readPlanData({ targets: Array.from({ length: 80 }, () => ({ item: 'gear', rate: 1 })) }).targets.length <= 50);
});
