// Saved plans: the list, storage, the backup file and plan links.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './lib/load.mjs';
import { defaultState } from '../src/js/store.js';
import {
  PLANS_KEY, planData, readPlanData, withPlan, samePlan, defaultName, cleanName, uniqueName, addPlan, overwritePlan, renamePlan,
  duplicatePlan, deletePlan, restorePlan, markOpened, sortPlans, loadPlans, savePlans, exportName, exportText, importText, planFileName, planEntry,
  encodePlan, planLink, decodePlanHash, UNREAD_KEY, PLANS_MAX, LINK_MAX
} from '../src/js/saved-plans.js';

// The counts from an import, without the new ids.
const counts = (result) => result && { added: result.added, skipped: result.skipped, full: result.full };
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

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
  assert.deepEqual(Object.keys(data).sort(), ['belt', 'machines', 'mining', 'moved', 'overrides', 'prolif', 'stack', 'targets', 'unit']);
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

test('a plan keeps its moved boxes', () => {
  const state = choices((s) => { s.moved = { 'iron-ingot': [24, -48], '__target_information-matrix': [0, 96] }; });
  const data = planData(state);
  assert.deepEqual(data.moved, state.moved);
  assert.deepEqual(readPlanData(JSON.parse(JSON.stringify(data))), data);
  // An old plan has no moved boxes, and opening it puts every box back.
  const old = { ...planData(choices()) };
  delete old.moved;
  const opened = withPlan(state, readPlanData(old));
  assert.deepEqual(opened.moved, {});
  assert.ok(!samePlan(state, opened));
  assert.ok(!samePlan(choices(), state));
  assert.deepEqual(readPlanData({ targets: [], moved: { gear: [1, 'x'], __proto__: [1, 1], coal: [2, 3] } }).moved, { coal: [2, 3] });
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

  renamePlan(plans, first.id, '  Gears  ');
  assert.equal(first.name, 'Gears');
  // A rename does not move the plan in the list.
  assert.equal(first.updatedAt, 3000);
  renamePlan(plans, first.id, '   ');
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
  assert.deepEqual(loadPlans(fakeStorage({ blocked: true })), { plans: [], open: null, ok: false, locked: false });
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
});

test('a stored list that cannot be read is kept, not written over', () => {
  const storage = fakeStorage();
  storage.setItem(PLANS_KEY, '{not json');
  const bad = loadPlans(storage);
  assert.deepEqual(bad.plans, []);
  assert.equal(bad.locked, false);
  assert.equal(storage.map.get(UNREAD_KEY), '{not json');
  // A list from a newer version of the app must not be written over.
  storage.setItem(PLANS_KEY, JSON.stringify({ version: 2, plans: [{}] }));
  assert.equal(loadPlans(storage).locked, true);
});

test('a long list and a big plan load back in full', () => {
  const storage = fakeStorage();
  const many = Array.from({ length: PLANS_MAX + 100 }, (_, i) => ({ id: 'p' + i, name: 'n' + i, createdAt: 1, updatedAt: 1, data: { targets: [] } }));
  storage.setItem(PLANS_KEY, JSON.stringify({ version: 1, plans: many }));
  assert.equal(loadPlans(storage).plans.length, PLANS_MAX + 100);

  const big = choices((s) => { s.targets = Array.from({ length: 60 }, (_, i) => ({ item: 'gear', rate: i + 1 })); });
  const plans = [];
  addPlan(plans, big, 'Big');
  savePlans(storage, plans, null);
  const [loaded] = loadPlans(storage).plans;
  assert.equal(loaded.data.targets.length, 60);
  assert.ok(samePlan(big, loaded.data));
});

test('the backup file has every plan and loads back', () => {
  const plans = [];
  addPlan(plans, choices(), 'One', 1000);
  addPlan(plans, choices((s) => { s.overrides = { gear: { external: true } }; s.moved = { gear: [-24, 72] }; }), 'Two', 2000);
  const date = new Date(2026, 9, 25, 9, 30);
  assert.equal(exportName(date), 'dsp-calculator-plans-2026-10-25.json');
  const text = exportText(plans, date);
  const file = JSON.parse(text);
  assert.equal(file.version, 1);
  assert.equal(file.plans.length, 2);
  assert.equal(file.plans[0].id, undefined);

  const other = [];
  assert.deepEqual(counts(importText(other, text)), { added: 2, skipped: 0, full: 0 });
  assert.deepEqual(other.map((p) => p.name), ['Two', 'One']);
  assert.deepEqual(other[0].data, plans[0].data);
  assert.deepEqual(other[0].data.moved, { gear: [-24, 72] });
  assert.notEqual(other[0].id, plans[0].id);
});

test('one plan exports to its own file in the same format', () => {
  const date = new Date(2026, 9, 25, 9, 30);
  assert.equal(planFileName('60/min Information Matrix', date), 'dsp-calculator-plan-60-min-information-matrix.json');
  assert.equal(planFileName('  Café   (blue) ', date), 'dsp-calculator-plan-cafe-blue.json');
  assert.equal(planFileName('蓝糖', date), 'dsp-calculator-plan-2026-10-25.json');
  assert.equal(planFileName(HOSTILE, date), 'dsp-calculator-plan-img-src-x-onerror-window-pwned-1.json');
  assert.ok(planFileName('x'.repeat(200), date).length < 70);

  const state = choices((s) => { s.targets = [{ item: 'space-warper', rate: 30 }]; s.stack = 2; s.tab = 'settings'; });
  const entry = planEntry(state, '', 1000);
  assert.equal(entry.name, '30/min Space Warper');
  assert.equal(entry.data.tab, undefined);
  assert.equal(planEntry(state, ' Warpers ', 1000).name, 'Warpers');

  const plans = [];
  addPlan(plans, choices(), 'Warpers', 500);
  const result = importText(plans, exportText([planEntry(state, 'Warpers', 1000)], date));
  assert.deepEqual(counts(result), { added: 1, skipped: 0, full: 0 });
  const added = plans.find((p) => p.id === result.ids[0]);
  assert.equal(added.name, 'Warpers (2)');
  assert.deepEqual(added.data, planData(state));
});

test('an import adds plans and numbers a clashing name', () => {
  const plans = [];
  addPlan(plans, choices(), 'One', 1000);
  const text = exportText(plans);
  assert.deepEqual(counts(importText(plans, text)), { added: 1, skipped: 0, full: 0 });
  assert.deepEqual(counts(importText(plans, text)), { added: 1, skipped: 0, full: 0 });
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
          moved: { gear: [12, 'x'], [HOSTILE]: [1, 1], __target_gear: [-36, 1e9] },
          tab: 'settings', opts: { theme: 'light' }
        }
      }
    ]
  });
  assert.deepEqual(counts(importText(plans, text, 500)), { added: 1, skipped: 5, full: 0 });
  const [plan] = plans;
  assert.equal(plan.name, HOSTILE.trim());
  assert.notEqual(plan.id, 'keep-me');
  assert.equal(plan.createdAt, 500);
  const base = defaultState();
  assert.deepEqual(plan.data, {
    targets: [{ item: 'gear', rate: 5 }], unit: 'min', machines: base.machines, belt: base.belt, stack: 1, prolif: base.prolif,
    mining: { speed: 1000, veins: 1, oil: 1, orbital: 55 }, overrides: { gear: { external: true } },
    moved: { __target_gear: [-36, 20000] }
  });
  assert.equal(plan.data.tab, undefined);
});

test('an import skips plans whose targets were all invalid', () => {
  const plans = [];
  const text = JSON.stringify({
    plans: [
      { name: HOSTILE, data: { targets: [{ item: 'nope', rate: 1 }, { item: '__proto__', rate: 1 }] } },
      { name: 'Empty on purpose', data: { targets: [] } }
    ]
  });
  assert.deepEqual(counts(importText(plans, text)), { added: 1, skipped: 1, full: 0 });
  assert.deepEqual(plans.map((p) => p.name), ['Empty on purpose']);
});

test('an import stops when the list is full', () => {
  const plans = Array.from({ length: PLANS_MAX - 1 }, (_, i) => ({ id: 'p' + i, name: 'n' + i, updatedAt: 1, openedAt: 0 }));
  const text = JSON.stringify({ plans: [1, 2, 3].map((n) => ({ name: 'New ' + n, data: { targets: [] } })) });
  const result = importText(plans, text);
  assert.deepEqual(counts(result), { added: 1, skipped: 0, full: 2 });
  assert.equal(plans.length, PLANS_MAX);
  assert.equal(result.ids.length, 1);
  assert.ok(plans.some((p) => p.id === result.ids[0]));
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
  assert.deepEqual(counts(importText(plans, code)), { added: 1, skipped: 0, full: 0 });
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
  // No moved boxes, so the link leaves out the empty list.
  assert.ok(!Buffer.from(encodePlan(state), 'base64url').toString().includes('moved'));
});

test('a plan link keeps the moved boxes', () => {
  const state = choices((s) => { s.moved = { 'iron-ingot': [24, -48], '__target_information-matrix': [-300, 0] }; });
  const data = decodePlanHash(new URL(planLink('https://example.com/', state)).hash);
  assert.deepEqual(data.moved, state.moved);
  assert.deepEqual(data, planData(state));
  assert.deepEqual(decodePlanHash('#plan=' + b64({ targets: [], moved: { gear: [1e9, 5], [HOSTILE]: [1, 1] } })).moved, { gear: [20000, 5] });
});

test('a bad plan link is refused or cleaned', () => {
  for (const hash of ['', '#plan=', '#other', '#plan=***', '#plan=' + 'A'.repeat(LINK_MAX + 1), '#plan=bm90IGpzb24', '#plan=' + b64([1]), '#plan=' + b64({ belt: 'x' })]) {
    assert.equal(decodePlanHash(hash), null, hash.slice(0, 20));
  }
  const data = decodePlanHash('#plan=' + b64({ targets: [{ item: HOSTILE, rate: 1 }, { item: 'gear', rate: 2 }], belt: HOSTILE, tab: 'settings' }));
  assert.deepEqual(data.targets, [{ item: 'gear', rate: 2 }]);
  assert.equal(data.belt, defaultState().belt);
  assert.equal(data.tab, undefined);
  assert.ok(readPlanData({ targets: Array.from({ length: 1100 }, () => ({ item: 'gear', rate: 1 })) }).targets.length <= 1000);
  // A link whose targets are all invalid would empty the plan, so it is refused.
  assert.equal(decodePlanHash('#plan=' + b64({ targets: [{ item: '__proto__' }, { item: 'iron-ingot', rate: 'NaN' }] })), null);
  assert.deepEqual(decodePlanHash('#plan=' + b64({ targets: [] })).targets, []);
});

test('a plan too big for a link gives no link', () => {
  const state = choices((s) => { s.targets = Array.from({ length: 1000 }, (_, i) => ({ item: 'information-matrix', rate: i + 0.123456789 })); });
  assert.ok(encodePlan(state).length > LINK_MAX);
  assert.equal(planLink('https://example.com/', state), null);
});
