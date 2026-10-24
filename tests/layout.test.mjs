// Checks rules the map layout must keep for any plan, beyond the snapshots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './lib/load.mjs';
import { solve } from '../src/js/engine.js';
import { layoutGraph, NODE_WIDTH, NODE_HEIGHT, TARGET_HEIGHT, COLUMN_GAP } from '../src/js/layout.js';
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
      assert.equal(n.h, target ? TARGET_HEIGHT : NODE_HEIGHT, n.id);
      assert.equal(n.x % column, 0, `${n.id} is on a column`);
      assert.ok(n.y >= 0 && n.y + n.h <= layout.height + 1e-9, `${n.id} is inside the map`);
      (byColumn[n.x] = byColumn[n.x] || []).push(n);
    }
    // Nodes in one column do not overlap.
    for (const nodes of Object.values(byColumn)) {
      nodes.sort((a, b) => a.y - b.y);
      for (let i = 1; i < nodes.length; i++) assert.ok(nodes[i].y >= nodes[i - 1].y + nodes[i - 1].h - 1e-6, `${nodes[i].id} overlaps`);
    }
    // Targets are in the last column.
    const last = Math.max(...layout.nodes.map((n) => n.x));
    for (const n of layout.nodes) if (plan.nodes[n.id].kind === 'target') assert.equal(n.x, last, n.id);
    assert.equal(layout.width, last + NODE_WIDTH);
    assert.equal(layout.paths.some((p) => p.spray), spray && plan.edges.some((e) => e.kind === 'spray'));
  });
}
