// Checks rules the map layout must keep for any plan, beyond the snapshots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './lib/load.mjs';
import { solve } from '../src/js/engine.js';
import { layoutGraph, prepareLayout, moveLayout, NODE_WIDTH, NODE_HEIGHT, TARGET_HEIGHT, COLUMN_GAP } from '../src/js/layout.js';
import { layoutPlans } from './lib/plans.mjs';

test('layout.js imports nothing, so it runs without a page', () => {
  const source = readFileSync(new URL('../src/js/layout.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^\s*import\s/m);
  assert.doesNotMatch(source, /\b(document|window|localStorage)\b/);
});

for (const [name, { spray, cfg }] of Object.entries(layoutPlans())) {
  const plan = solve(cfg);
  const layout = layoutGraph(plan, { spray });

  test(`layout rules: ${name}`, () => {
    const column = NODE_WIDTH + COLUMN_GAP;
    const byColumn = {};
    for (const n of layout.nodes) {
      const target = plan.nodes[n.id].kind === 'target';
      assert.equal(n.height, target ? TARGET_HEIGHT : NODE_HEIGHT, n.id);
      assert.equal(n.x % column, 0, `${n.id} is on a column`);
      assert.ok(n.y >= 0 && n.y + n.height <= layout.height + 1e-9, `${n.id} is inside the map`);
      (byColumn[n.x] = byColumn[n.x] || []).push(n);
    }
    // Nodes in one column do not overlap.
    for (const nodes of Object.values(byColumn)) {
      nodes.sort((a, b) => a.y - b.y);
      for (let i = 1; i < nodes.length; i++) assert.ok(nodes[i].y >= nodes[i - 1].y + nodes[i - 1].height - 1e-6, `${nodes[i].id} overlaps`);
    }
    // Targets are in the last column.
    const last = Math.max(...layout.nodes.map((n) => n.x));
    for (const n of layout.nodes) if (plan.nodes[n.id].kind === 'target') assert.equal(n.x, last, n.id);
    assert.equal(layout.width, last + NODE_WIDTH);
    assert.equal(layout.paths.some((p) => p.spray), spray && plan.edges.some((e) => e.kind === 'spray'));
  });
}

// Moved boxes. This plan has long edges, so placeholders are in play.
const movePlan = solve(layoutPlans()['universe-matrix-prolif-spray'].cfg);
const auto = layoutGraph(movePlan, { spray: true });
const boxOf = (layout, id) => layout.nodes.find((n) => n.id === id);
const pathsAt = (layout, id) => layout.paths.filter((p) => p.edge.from === id || p.edge.to === id);
const numbers = (d) => d.match(/-?\d+(\.\d+)?/g).map(Number);
// A step in a middle column with edges in and out.
const middle = auto.nodes.find((n) => n.x > 0 && n.x < auto.width - NODE_WIDTH &&
  movePlan.edges.some((e) => e.from === n.id) && movePlan.edges.some((e) => e.to === n.id)).id;

test('no moves give the same layout as before', () => {
  for (const moved of [undefined, {}, { [middle]: [0, 0] }, { 'not-a-node': [500, 500] }, { _d0: [300, 300] }]) {
    assert.deepStrictEqual(layoutGraph(movePlan, { spray: true, moved }), auto);
  }
  assert.equal(auto.left, 0);
  assert.equal(auto.top, 0);
});

test('a moved box keeps its offset and its paths follow it', () => {
  const moved = layoutGraph(movePlan, { spray: true, moved: { [middle]: [30, 40] } });
  const before = boxOf(auto, middle), after = boxOf(moved, middle);
  assert.equal(after.x, before.x + 30);
  assert.equal(after.y, before.y + 40);
  for (const n of auto.nodes) if (n.id !== middle) assert.deepEqual(boxOf(moved, n.id), n, `${n.id} stays`);
  assert.equal(moved.paths.length, auto.paths.length);
  const autoPaths = pathsAt(auto, middle), movedPaths = pathsAt(moved, middle);
  autoPaths.forEach((p, i) => assert.notEqual(movedPaths[i].d, p.d, 'the path changed'));
  for (const p of movedPaths.filter((q) => !q.spray)) {
    const nums = numbers(p.d);
    if (p.edge.from === middle) assert.equal(nums[0], after.x + NODE_WIDTH, 'starts on the right side');
    if (p.edge.to === middle) assert.equal(nums[nums.length - 2], after.x, 'ends on the left side');
  }
});

test('a box moved past the top left shifts the map so nothing is negative', () => {
  const first = auto.nodes.find((n) => n.x === 0);
  const moved = layoutGraph(movePlan, { spray: true, moved: { [first.id]: [-500, -300 - first.y] } });
  assert.equal(moved.left, -500);
  assert.equal(moved.top, -300);
  for (const n of moved.nodes) {
    assert.ok(n.x >= 0 && n.y >= 0, `${n.id} is not negative`);
    assert.ok(n.x + NODE_WIDTH <= moved.width && n.y + n.height <= moved.height + 1e-9, `${n.id} is inside the map`);
  }
  // The other boxes keep their places relative to each other.
  for (const n of auto.nodes) {
    if (n.id === first.id) continue;
    const m = boxOf(moved, n.id);
    assert.equal(m.x + moved.left, n.x);
    assert.ok(Math.abs(m.y + moved.top - n.y) < 1e-9);
  }
  assert.equal(moved.width, auto.width + 500);
  for (const p of moved.paths) for (const v of numbers(p.d)) assert.ok(Number.isFinite(v));
});

test('a box moved far right grows the map and keeps x at 0', () => {
  const target = auto.nodes.find((n) => movePlan.nodes[n.id].kind === 'target');
  const moved = layoutGraph(movePlan, { spray: true, moved: { [target.id]: [400, 0] } });
  assert.equal(moved.left, 0);
  assert.equal(moved.width, auto.width + 400);
});

test('a long edge skips the placeholders its moved end has passed', () => {
  const long = auto.paths.find((p) => !p.spray && (p.d.match(/C/g) || []).length > 2);
  assert.ok(long, 'the plan has a long edge');
  const from = boxOf(auto, long.edge.from), to = boxOf(auto, long.edge.to);
  const shift = to.x - from.x - NODE_WIDTH - 40;
  const moved = layoutGraph(movePlan, { spray: true, moved: { [long.edge.from]: [shift, 0] } });
  const path = moved.paths.find((p) => p.edge === long.edge);
  assert.equal((path.d.match(/C/g) || []).length, 1);
});

test('moveLayout leaves the prepared layout as it was', () => {
  const base = prepareLayout(movePlan, { spray: true });
  const first = moveLayout(base, {});
  moveLayout(base, { [middle]: [-900, 700] });
  assert.deepStrictEqual(moveLayout(base, {}), first);
  assert.deepStrictEqual(first, auto);
});
