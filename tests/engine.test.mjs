// Solver checks. Expected values are worked out by hand from the recipe data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseCfg } from './lib/load.mjs';
import { solve, DATA, CANDS } from '../src/js/engine.js';

const plan = (targets, patch = {}) => solve(Object.assign(baseCfg(), patch, { targets }));
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} != ${b}`);

test('electromagnetic matrix at 1/s', () => {
  const p = plan([{ item: 'electromagnetic-matrix', rate: 1 }]);
  assert.equal(p.ok, true);
  close(p.nodes['electromagnetic-matrix'].count, 3, 'matrix labs (3 s recipe, speed 1)');
  close(p.nodes['magnetic-coil'].count, 1 / 3, 'Mk.III assemblers for coils');
  close(p.totals.raw['iron-ore'], 2, 'iron ore per second');
  close(p.totals.raw['copper-ore'], 1, 'copper ore per second');
});

test('deuterium fractionation uses 1% of a full belt per fractionator', () => {
  const p = plan([{ item: 'deuterium', rate: 1 }]);
  close(p.nodes['deuterium'].count, 1 / 0.3, 'fractionators on a Mk.III belt');
  close(p.D['hydrogen'], 100, 'hydrogen in');
});

test('proliferator Mk.III extra products cuts raw ore and adds spray demand', () => {
  const off = plan([{ item: 'universe-matrix', rate: 1 }]);
  const on = plan([{ item: 'universe-matrix', rate: 1 }], { prolif: { level: 3, mode: 'products' } });
  assert.ok(on.totals.raw['iron-ore'] < off.totals.raw['iron-ore']);
  assert.ok(on.totals.prolif['proliferator-3'] > 0);
});

test('every craftable item solves', () => {
  const bad = DATA.items.filter((i) => (CANDS[i.id] || []).length)
    .filter((i) => { const p = plan([{ item: i.id, rate: 1 }]); return !p.ok || !Number.isFinite(p.totals.power); })
    .map((i) => i.id);
  assert.deepEqual(bad, []);
});

test('belt lines count against belt capacity', () => {
  const p = plan([{ item: 'iron-ingot', rate: 61 }], { belt: 'conveyor-belt-3', stack: 1 });
  const e = p.edges.find((x) => x.to === '__target_iron-ingot');
  assert.equal(e.belts, 3);
});
