// Checks the step layouts: for every recipe and building, the parts do not
// overlap, sit inside the drawing, and the counts match the step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseCfg } from './lib/load.mjs';
import { DATA, solve } from '../src/js/engine.js';
import { stepLayout, beltTiles, MAX_ROW } from '../src/js/step-layout.js';
import { BUILDINGS, SORTERS, sorterRate, TOWER_REACH } from '../src/js/geometry.js';

const SLACK = 1e-9;

// Solves a plan that makes `item` with `recipe` in `machine`, and returns the step.
function step(item, { recipe, machine, rate = 1, ...settings } = {}) {
  const cfg = { ...baseCfg(), ...settings };
  cfg.targets = [{ item, rate }];
  cfg.overrides = { [item]: { ...(recipe ? { recipe } : {}), ...(machine ? { machine } : {}) } };
  const plan = solve(cfg);
  return { plan, node: plan.nodes[item] };
}

const layout = (item, options = {}, sorter) => {
  const { plan, node } = step(item, options);
  return { plan, node, l: stepLayout(node, plan, { sorter }) };
};

function tilesOf(part) {
  if (part.type === 'belt') return beltTiles(part.points);
  const tiles = [];
  for (let x = part.x; x < part.x + part.w; x++) for (let y = part.y; y < part.y + part.d; y++) tiles.push(x + ',' + y);
  return tiles;
}

const inside = (l, [x, y]) => x >= -SLACK && y >= -SLACK && x <= l.w + SLACK && y <= l.h + SLACK;
const tileOf = ([x, y]) => Math.floor(x) + ',' + Math.floor(y);

function checkLayout(l, node, plan, label) {
  const msg = (text) => `${label}: ${text}`;
  const parts = l.parts;
  const buildings = parts.filter((p) => p.type === 'building');
  const belts = parts.filter((p) => p.type === 'belt');
  const spec = BUILDINGS[node.machine];

  // Inside the drawing.
  for (const p of parts) {
    const points = p.points || (p.from ? [p.from, p.to] : [[p.x, p.y], [p.x + p.w, p.y + p.d]]);
    for (const pt of points) assert.ok(inside(l, pt), msg(`${p.type} at ${pt} is outside ${l.w}x${l.h}`));
  }

  // Nothing overlaps, except coaters, which sit on a belt of their item.
  const owner = new Map();
  for (const p of parts.filter((p) => p.type !== 'coater' && (p.points || p.w))) {
    for (const t of tilesOf(p)) {
      assert.ok(!owner.has(t), msg(`${p.type} overlaps ${owner.get(t) && owner.get(t).type} at ${t}`));
      owner.set(t, p);
    }
  }
  for (const c of parts.filter((p) => p.type === 'coater')) {
    for (const t of tilesOf(c)) {
      const under = owner.get(t);
      assert.ok(under && under.type === 'belt' && under.role === 'in', msg(`coater at ${t} is not on an input belt`));
      assert.deepEqual(under.items, c.items, msg('coater is on the wrong belt'));
    }
  }

  // Sorters touch a slot side of their building and a belt with their items.
  const used = new Set();
  for (const s of parts.filter((p) => p.type === 'sorter')) {
    const b = buildings.find((p) => p.unit === s.unit);
    assert.ok(b, msg('sorter has no building'));
    const edge = s.role === 'in' ? s.to : s.from, end = s.role === 'in' ? s.from : s.to;
    const col = edge[0] - 0.5 - b.x;
    assert.equal(edge[1], s.side === 'top' ? b.y : b.y + b.d, msg('sorter does not touch the building'));
    assert.ok(spec[s.side].includes(col), msg(`sorter in column ${col} has no slot on the ${s.side} side`));
    const belt = belts.find((p) => beltTiles(p.points).includes(tileOf(end)));
    assert.ok(belt, msg('sorter does not reach a belt'));
    assert.deepEqual(belt.items, s.items, msg('sorter reaches the wrong belt'));
    const reach = s.side === 'top' ? b.y - Math.floor(end[1]) : Math.floor(end[1]) - (b.y + b.d) + 1;
    assert.equal(reach, s.reach, msg('sorter length'));
    assert.ok(reach >= 1 && reach <= 3, msg('sorter longer than 3 tiles'));
    const key = `${s.unit},${s.side},${col}`;
    assert.ok(!used.has(key), msg('two sorters in one slot'));
    used.add(key);
  }

  // Counts match the step.
  assert.equal(buildings.length, l.units, msg('building count'));
  assert.ok(l.last >= 1 && l.last <= l.perModule, msg('last row size'));
  assert.equal(l.perModule * (l.modules - 1) + l.last, node.built, msg('rows add up to the step'));
  assert.ok(l.units <= MAX_ROW, msg('row too long'));
  const levels = buildings.reduce((sum, b) => sum + (b.stack || 1), 0);
  if (l.modules === 1) assert.equal(levels, node.built, msg('one row holds every building'));
  for (const item of Object.keys(node.recipe.in)) {
    if (node.inRate[item] > SLACK) assert.ok(l.inputs.some((i) => i.item === item), msg(`input ${item} missing`));
  }
  for (const item of Object.keys(node.recipe.out)) {
    if (node.outRate[item] > SLACK) assert.ok(l.outputs.some((o) => o.item === item), msg(`output ${item} missing`));
  }
  for (const row of [...l.inputs, ...l.outputs]) {
    const each = row.rate * node.machineCount;
    const total = l.inputs.includes(row) ? node.inRate[row.item] : node.outRate[row.item];
    assert.ok(Math.abs(each - total) <= 1e-9 * Math.max(1, total), msg(`${row.item} rate per building`));
  }

  if (spec.ports) {
    const ports = parts.filter((p) => p.type === 'port');
    assert.equal(ports.length, l.units, msg('one deuterium port per fractionator'));
    for (const port of ports) {
      const b = buildings.find((p) => p.unit === port.unit);
      assert.equal(port.from[1], b.y, msg('port touches its building'));
      const belt = belts.find((p) => beltTiles(p.points).includes(tileOf(port.to)));
      assert.ok(belt && belt.item === 'deuterium', msg('port reaches the deuterium belt'));
    }
  } else {
    // Each belt gets enough sorters for what the building moves on it,
    // unless a side has too few slots and the notes say so.
    const short = l.notes.some((n) => n.key === 'slots');
    for (const row of [...l.inputs, ...l.outputs]) {
      const lane = [...l.inputs, ...l.outputs].filter((r) => r.side === row.side && r.reach === row.reach);
      const moved = lane.reduce((sum, r) => sum + r.unitRate, 0);
      assert.ok(row.sorters * sorterRate(l.sorter, row.reach) >= moved - SLACK, msg(`too few sorters for ${row.item}`));
      if (!short) {
        const drawn = parts.filter((p) => p.type === 'sorter' && p.unit === 0 && p.side === row.side && p.reach === row.reach);
        assert.equal(drawn.reduce((sum, s) => sum + s.count, 0), row.sorters, msg(`drawn sorters for ${row.item}`));
      }
    }
  }

  // One belt per item carries a whole row, unless one building needs more.
  if (l.units > 1) for (const row of [...l.inputs, ...l.outputs]) assert.equal(row.belts, 1, msg(`${row.item} needs one belt`));

  // Every building is in reach of a Tesla Tower.
  const towers = parts.filter((p) => p.type === 'tower');
  for (const b of buildings) {
    const cx = b.x + b.w / 2, cy = b.y + b.d / 2;
    assert.ok(towers.some((t) => Math.hypot(t.x + 0.5 - cx, t.y + 0.5 - cy) <= TOWER_REACH + SLACK), msg('building without power'));
  }

  if (node.spray) {
    const coaters = parts.filter((p) => p.type === 'coater');
    assert.equal(coaters.length, belts.filter((b) => b.role === 'in').length, msg('one coater per input belt'));
    assert.ok(l.spray.perModule > 0, msg('proliferator rate'));
  }
}

const SETTINGS = [
  {},
  { stack: 4 },
  { belt: 'conveyor-belt-1' },
  { prolif: { level: 3, mode: 'products' } },
  { prolif: { level: 2, mode: 'speed' }, stack: 2 },
];

test('every recipe in every building gives a valid layout', () => {
  let rows = 0;
  for (const recipe of DATA.recipes) {
    const item = Object.keys(recipe.out)[0];
    for (const machine of recipe.prod) {
      for (const [i, settings] of SETTINGS.entries()) {
        for (const sorter of i === 0 ? SORTERS : ['sorter-3']) {
          const { plan, node, l } = layout(item, { recipe: recipe.id, machine, rate: 2, ...settings }, sorter);
          const label = `${recipe.id} in ${machine} ${JSON.stringify(settings)} ${sorter}`;
          if (!node || node.recipe.id !== recipe.id) continue;
          if (l.kind === 'none') {
            assert.ok(l.reason, label);
            assert.ok(!BUILDINGS[machine] || !node.built, `${label}: no layout`);
            continue;
          }
          checkLayout(l, node, plan, label);
          rows++;
        }
      }
    }
  }
  assert.ok(rows > 2000, `checked ${rows} layouts`);
});

test('steps that are not built in rows say why', () => {
  assert.equal(layout('iron-ore').l.reason, 'Place these on the ore vein.');
  assert.equal(layout('water').l.reason, 'Place these along the shore of the water or acid.');
  assert.equal(layout('crude-oil').l.reason, 'Place one on each oil seep.');
  assert.match(layout('critical-photon').l.reason, /Ray Receivers/);
  assert.match(layout('hydrogen', { recipe: 'gas-giant-hydrogen' }).l.reason, /gas giant/);
  assert.equal(layout('accumulator-full').l.reason, 'There is no layout for this building yet.');
  const { plan } = step('iron-ingot');
  assert.equal(stepLayout({ kind: 'raw', item: 'iron-ore', rate: 1 }, plan).reason, 'Supplied from elsewhere.');
});

test('a Mk.III belt of ore feeds 30 Arc Smelters', () => {
  const { l } = layout('iron-ingot', { machine: 'arc-smelter', rate: 100 });
  assert.equal(l.built, 100);
  assert.equal(l.perModule, 30);
  assert.equal(l.modules, 4);
  assert.equal(l.last, 10);
  assert.deepEqual(l.inputs.map((i) => [i.item, i.rate, i.sorters, i.reach, i.side]), [['iron-ore', 1, 1, 1, 'top']]);
  assert.deepEqual(l.outputs.map((o) => [o.item, o.rate, o.sorters, o.reach, o.side]), [['iron-ingot', 1, 1, 1, 'bottom']]);
  // Smelters touch: 30 of them are 90 tiles long, plus a tile of belt before the first.
  assert.equal(l.w, 91);
  assert.equal(layout('iron-ingot', { machine: 'plane-smelter', rate: 100 }).l.perModule, 15);
  assert.equal(layout('iron-ingot', { machine: 'df-negentropy-smelter', rate: 100 }).l.perModule, 10);
  assert.equal(layout('iron-ingot', { machine: 'arc-smelter', rate: 100, belt: 'conveyor-belt-1' }).l.perModule, 6);
});

test('a stacked belt could feed more smelters than a row holds', () => {
  const { l } = layout('iron-ingot', { machine: 'arc-smelter', rate: 200, stack: 4 });
  assert.equal(l.perModule, MAX_ROW);
  assert.deepEqual(l.notes.find((n) => n.key === 'long'), { key: 'long', fullBelt: 120, max: 30 });
});

test('Circuit Board assemblers take two input belts', () => {
  const { l } = layout('circuit-board', { rate: 30 });
  // Mk.III at 1.5x: 3 iron and 1.5 copper in, 3 boards out each second.
  assert.equal(l.perModule, 10);
  assert.equal(l.modules, 1);
  assert.deepEqual(l.inputs.map((i) => [i.item, i.rate, i.reach, i.sorters]), [['iron-ingot', 3, 1, 1], ['copper-ingot', 1.5, 2, 1]]);
  assert.deepEqual(l.outputs.map((o) => [o.item, o.reach, o.side]), [['circuit-board', 1, 'bottom']]);
  assert.equal(l.parts.filter((p) => p.type === 'sorter').length, 30);
  // Assemblers sit 4 apart, so a tower fits in a gap in the row.
  const towers = l.parts.filter((p) => p.type === 'tower');
  const row = l.parts.find((p) => p.type === 'building');
  assert.ok(towers.some((t) => t.y === row.y + 1));
});

test('slow sorters need more slots than a side has', () => {
  const { l } = layout('circuit-board', { rate: 30 }, 'sorter-1');
  assert.deepEqual(l.inputs.map((i) => i.sorters), [2, 2]);
  const note = l.notes.find((n) => n.key === 'slots');
  assert.deepEqual(note, { key: 'slots', side: 'top', need: 4, slots: 3, unit: 'building', faster: 'sorter-2' });
  // One sorter is drawn per belt, with its count on it.
  const top = l.parts.filter((p) => p.type === 'sorter' && p.unit === 0 && p.side === 'top');
  assert.deepEqual(top.map((s) => s.count), [2, 2]);
});

test('assemblers with five inputs put two on the output side', () => {
  const { l } = layout('miniature-particle-collider', { recipe: 'miniature-particle-collider' });
  assert.deepEqual(l.inputs.map((i) => i.side), ['top', 'top', 'top', 'bottom', 'bottom']);
  assert.deepEqual(l.inputs.filter((i) => i.side === 'bottom').map((i) => i.reach), [2, 3]);
  assert.deepEqual(l.outputs.map((o) => [o.side, o.reach]), [['bottom', 1]]);
});

test('Plastic chemical plants', () => {
  const { l } = layout('plastic', { rate: 5 });
  // 2 refined oil and 1 graphite make 1 plastic every 3 s.
  assert.equal(l.built, 15);
  assert.equal(l.perModule, 15);
  assert.deepEqual(l.inputs.map((i) => [i.item, i.reach, i.side]), [['refined-oil', 1, 'top'], ['energetic-graphite', 2, 'top']]);
  const plant = l.parts.find((p) => p.type === 'building');
  assert.deepEqual([plant.w, plant.d], [7, 4]);
  const second = l.parts.filter((p) => p.type === 'building')[1];
  assert.equal(second.x - plant.x, 8);
  assert.ok(l.notes.some((n) => n.key === 'equator'));
  assert.equal(layout('plastic', { rate: 100 }).l.perModule, MAX_ROW);
});

test('Information Matrix labs stand in stacks', () => {
  const { l } = layout('information-matrix', { rate: 2 });
  assert.equal(l.built, 20);
  assert.equal(l.stack, 10);
  assert.equal(l.units, 2);
  assert.equal(l.perModule, 20);
  assert.deepEqual(l.parts.filter((p) => p.type === 'building').map((b) => b.stack), [10, 10]);
  // A stack of 10 labs moves 10 times what one lab does, all through the bottom lab.
  const processor = l.inputs.find((i) => i.item === 'processor');
  assert.equal(processor.rate, 0.2);
  assert.ok(Math.abs(processor.unitRate - 2) < 1e-12);
  assert.ok(l.notes.some((n) => n.key === 'stackResearch'));
  // With Mk.I sorters the 2 processors a second do not fit on one side, so stacks are lower.
  const slow = layout('information-matrix', { rate: 2 }, 'sorter-1').l;
  assert.ok(slow.stack < 10);
  assert.ok(!slow.notes.some((n) => n.key === 'slots'));
});

test('Universe Matrix labs share a belt for two inputs', () => {
  const { l } = layout('universe-matrix', { rate: 1 });
  assert.equal(l.notes.filter((n) => n.key === 'shared').length, 1);
  assert.equal(l.parts.filter((p) => p.type === 'belt').length, 6);
  const mixed = l.parts.find((p) => p.type === 'belt' && p.items.length === 2);
  assert.ok(mixed);
});

test('Deuterium fractionators sit on a hydrogen loop', () => {
  const { l } = layout('deuterium', { rate: 10 });
  // Each fractionator turns 1% of a full Mk.III belt into deuterium: 0.3 a second.
  assert.ok(Math.abs(l.outputs[0].rate - 0.3) < 1e-12);
  assert.ok(Math.abs(l.inputs[0].rate - 0.3) < 1e-12);
  assert.equal(l.built, 34);
  assert.equal(l.perModule, 30);
  assert.equal(l.last, 4);
  const roles = l.parts.filter((p) => p.type === 'belt').map((b) => b.role);
  assert.equal(roles.filter((r) => r === 'through').length, 29);
  assert.ok(roles.includes('loop'));
  assert.equal(l.parts.filter((p) => p.type === 'sorter').length, 0);
});

test('spray coaters sit on each input belt before the first building', () => {
  const { l } = layout('circuit-board', { rate: 30, prolif: { level: 3, mode: 'products' } });
  const coaters = l.parts.filter((p) => p.type === 'coater');
  const first = l.parts.find((p) => p.type === 'building');
  assert.equal(coaters.length, 2);
  for (const c of coaters) assert.ok(c.x + c.w <= first.x);
  // 3 ingots for every run, 60 sprays per Proliferator Mk.III.
  assert.equal(l.spray.item, 'proliferator-3');
  const runs = 1.5 / 1, perBuilding = runs * 3 / 60;
  assert.ok(Math.abs(l.spray.perModule - perBuilding * l.perModule) < 1e-9);
});

test('the Pile Sorter note shows only with Pile Sorters', () => {
  assert.ok(layout('circuit-board', {}, 'sorter-4').l.notes.some((n) => n.key === 'pile'));
  assert.ok(!layout('circuit-board', {}, 'sorter-3').l.notes.some((n) => n.key === 'pile'));
});

test('sorter rates fall with distance', () => {
  assert.deepEqual([1, 2, 3].map((d) => sorterRate('sorter-1', d)), [1.5, 0.75, 0.5]);
  assert.deepEqual([1, 2, 3].map((d) => sorterRate('sorter-3', d)), [6, 3, 2]);
  assert.deepEqual([1, 2, 3].map((d) => sorterRate('sorter-4', d)), [13.3, 8, 5.7]);
});
