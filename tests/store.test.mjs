// Checks that a saved state or a pasted plan code cannot put bad values into the app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './lib/load.mjs';
import { solve } from '../src/js/engine.js';
import { buildCfg, rateInUnit } from '../src/js/core.js';
import { defaultState, mergeState, MINING_LIMITS } from '../src/js/store.js';

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
  plan.overrides = { 'graphene': { recipe: 'graphene-advanced' }, 'processor': { external: true },
    'iron-ingot': { machine: 'arc-smelter', prolif: { level: 1, mode: 'products' } } };
  plan.opts = { spray: false, labels: false, theme: 'light' };
  plan.tab = 'settings'; plan.side = 'settings'; plan.main = 'build'; plan.bsec = 'steps';
  assert.deepEqual(merge(JSON.parse(JSON.stringify(plan))), plan);
});

test('markup in a plan code is dropped', () => {
  const hostile = '"><img src=x onerror="window.pwned=1">';
  const merged = merge({
    mining: { speed: hostile, veins: hostile }, machines: { smelter: hostile }, belt: hostile,
    prolif: { level: hostile, mode: hostile }, opts: { theme: hostile, spray: hostile },
    overrides: { [hostile]: { external: true }, 'iron-ingot': { recipe: hostile, machine: hostile, prolif: hostile } },
    tab: hostile, side: hostile, main: hostile, bsec: hostile
  });
  assert.deepEqual(merged, defaultState());
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
