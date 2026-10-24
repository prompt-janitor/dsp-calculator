// Writes the solver and layout fixtures in tests/fixtures/ from the current code.
// Run it only when a change to the numbers is intended, and say why in the commit.
import { writeFileSync, mkdirSync } from 'node:fs';
import { loadApp, plainPlan, plainLayout } from '../tests/lib/load.mjs';
import { solverPlans, layoutPlans } from '../tests/lib/plans.mjs';

const dir = (p) => new URL('../tests/fixtures/' + p + '/', import.meta.url);
const write = (sub, name, data) => {
  mkdirSync(dir(sub), { recursive: true });
  writeFileSync(new URL(name + '.json', dir(sub)), JSON.stringify(data, null, 1) + '\n');
};

const ctx = loadApp();
const plans = solverPlans(ctx);
for (const [name, cfg] of Object.entries(plans)) write('solver', name, plainPlan(ctx.solve(cfg)));

const layouts = layoutPlans();
for (const [name, { spray, cfg }] of Object.entries(layouts)) {
  ctx.S = { opts: { spray } };
  write('layout', name, plainLayout(ctx.layoutGraph(ctx.solve(cfg))));
}

console.log(`Wrote ${Object.keys(plans).length} solver and ${Object.keys(layouts).length} layout fixtures.`);
