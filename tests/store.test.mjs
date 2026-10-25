// Checks that a saved state or a pasted plan code cannot put bad values into the app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './lib/load.mjs';
import { solve, ITEMS } from '../src/js/engine.js';
import { buildCfg, rateInUnit } from '../src/js/core.js';
import { defaultState, mergeState, MINING_LIMITS, MOVE_LIMIT } from '../src/js/store.js';

const merge = (saved) => mergeState(defaultState(), saved);

test('a valid plan code comes back the same', () => {
  const plan = defaultState();
  plan.targets = [{ item: 'space-warper', rate: 30 }];
  plan.unit = 's';
  plan.machines.smelter = 'arc-smelter';
  plan.belt = 'conveyor-belt-2';
  plan.stack = 4;
  plan.prolif = { level: 3, mode: 'speed' };
  plan.mining = { speed: 200, veins: 4, oil: 2.5, orbital: 60 };
  plan.moved = { 'iron-ingot': [24, -48], '__target_space-warper': [-300, 12] };
  plan.overrides = { 'graphene': { recipe: 'graphene-advanced' }, 'processor': { external: true },
    'iron-ingot': { machine: 'arc-smelter', prolif: { level: 1, mode: 'products' } } };
  plan.opts = { spray: false, labels: false, theme: 'light' };
  plan.tab = 'settings'; plan.side = 'settings'; plan.psec = 'files'; plan.main = 'build'; plan.bsec = 'steps';
  assert.deepEqual(merge(JSON.parse(JSON.stringify(plan))), plan);
});

test('markup in a plan code is dropped', () => {
  const hostile = '"><img src=x onerror="window.pwned=1">';
  const merged = merge({
    mining: { speed: hostile, veins: hostile }, machines: { smelter: hostile }, belt: hostile,
    prolif: { level: hostile, mode: hostile }, opts: { theme: hostile, spray: hostile },
    overrides: { [hostile]: { external: true }, 'iron-ingot': { recipe: hostile, machine: hostile, prolif: hostile } },
    tab: hostile, side: hostile, psec: hostile, main: hostile, bsec: hostile
  });
  assert.deepEqual(merged, defaultState());
});

test('names that are not own keys do not count as known ids', () => {
  const merged = merge({
    targets: [{ item: '__proto__', rate: 1 }, { item: 'constructor', rate: 1 }, { item: 'gear', rate: 1 }],
    machines: { smelter: 'constructor' }, belt: 'toString',
    overrides: { constructor: { external: true }, gear: { recipe: 'hasOwnProperty', machine: '__proto__' } }
  });
  assert.deepEqual(merged.targets, [{ item: 'gear', rate: 1 }]);
  assert.equal(merged.machines.smelter, defaultState().machines.smelter);
  assert.equal(merged.belt, defaultState().belt);
  assert.deepEqual(merged.overrides, {});
});

test('the sidebar has four panes, and older states still load', () => {
  for (const side of ['plan', 'saved', 'files', 'settings']) assert.equal(merge({ side }).side, side);
  // States saved before the Saved and Load/Save panes had only these two.
  assert.deepEqual([merge({ tab: 'plan', side: 'plan' }).side, merge({ tab: 'settings', side: 'settings' }).side], ['plan', 'settings']);
  assert.equal(merge({ side: 'settings' }).psec, 'plan');
  assert.equal(merge({ side: 'export' }).side, 'plan');
  assert.equal(merge({ psec: 'settings' }).psec, 'plan');
  assert.equal(merge({ psec: 'saved' }).psec, 'saved');
  assert.equal(merge({ tab: 'saved' }).tab, 'plan');
});

test('moved boxes keep only step and target ids with two numbers', () => {
  const merged = merge({
    moved: {
      'iron-ingot': [24, -48], '__target_gear': [10.4, 0.6], 'gear': [0, 0], 'copper-ingot': [-0.2, 0.3],
      '__proto__': [1, 1], 'constructor': [1, 1], '__target_constructor': [1, 1], '__target_': [1, 1], '_d0': [1, 1],
      'nope': [1, 1], 'magnet': [1], 'coal': [1, 2, 3], 'stone': ['1', 2], 'silicon-ore': [NaN, 1], 'titanium-ore': [Infinity, 1],
      'water': { 0: 1, 1: 2 }, 'gear-x': null
    }
  });
  assert.deepEqual(merged.moved, { 'iron-ingot': [24, -48], '__target_gear': [10, 1] });
  assert.ok(!Object.is(merge({ moved: { gear: [-0.4, 5] } }).moved.gear[0], -0));
  assert.deepEqual(merge({ moved: [['gear', [1, 2]]] }).moved, {});
  assert.deepEqual(merge({ moved: 'gear' }).moved, {});
});

test('moved boxes are clamped and the list is capped', () => {
  assert.deepEqual(merge({ moved: { gear: [1e9, -1e9] } }).moved, { gear: [MOVE_LIMIT, -MOVE_LIMIT] });
  const many = {};
  for (const id of Object.keys(ITEMS)) { many[id] = [1, 1]; many['__target_' + id] = [1, 1]; }
  assert.ok(Object.keys(many).length > 0);
  assert.ok(Object.keys(merge({ moved: many }).moved).length <= 1000);
});

test('mining numbers are kept inside the Settings limits', () => {
  const merged = merge({ mining: { speed: 1e6, veins: -4, oil: 0, orbital: 0 } });
  assert.deepEqual(merged.mining, {
    speed: MINING_LIMITS.speed.max, veins: MINING_LIMITS.veins.min, oil: MINING_LIMITS.oil.min, orbital: MINING_LIMITS.orbital.min
  });
  const p = solve(buildCfg(merge({ mining: { speed: 'x', veins: NaN } })));
  assert.ok(Number.isFinite(p.nodes['iron-ore'].machineCount));
});

test('stack must be a whole number from 1 to 4', () => {
  assert.equal(merge({ stack: 2.5 }).stack, 1);
  assert.equal(merge({ stack: 5 }).stack, 1);
  assert.equal(merge({ stack: 3 }).stack, 3);
});

test('targets with an unknown item or a bad rate are dropped', () => {
  const merged = merge({ targets: [{ item: 'nope', rate: 1 }, { item: 'gear', rate: 'x' }, { item: 'gear', rate: -1 }, { item: 'gear', rate: '5' }] });
  assert.deepEqual(merged.targets, [{ item: 'gear', rate: 5 }]);
});

test('switching the unit to /s and back keeps every rate from 1 to 240/min', () => {
  for (let perMin = 1; perMin <= 240; perMin++) {
    assert.equal(rateInUnit(rateInUnit(perMin, 's'), 'min'), perMin);
  }
  for (const perMin of [0.5, 7.5, 33.3, 0.333333, 1234.5]) assert.equal(rateInUnit(rateInUnit(perMin, 's'), 'min'), perMin);
  for (const perSec of [0.1, 0.5, 1, 2.5, 7, 30]) assert.equal(rateInUnit(rateInUnit(perSec, 'min'), 's'), perSec);
});
