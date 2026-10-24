// Compares solve() and layoutGraph() with the fixtures in tests/fixtures/.
// A failure here means the numbers changed. If that was intended, run
// `npm run snapshot` and explain the change in the commit message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { plainPlan, plainLayout } from './lib/load.mjs';
import { solve } from '../src/js/engine.js';
import { layoutGraph } from '../src/js/map.js';
import { solverPlans, layoutPlans } from './lib/plans.mjs';

const TOL = 1e-9;
const fixture = (sub, name) => JSON.parse(readFileSync(new URL(`./fixtures/${sub}/${name}.json`, import.meta.url), 'utf8'));
const fixtureNames = (sub) => readdirSync(new URL(`./fixtures/${sub}/`, import.meta.url)).map((f) => f.replace(/\.json$/, '')).sort();

// Collects every difference, so one failure shows all the values that moved.
function diff(got, want, path = '$', out = []) {
  if (typeof want === 'number' && typeof got === 'number') {
    const scale = Math.max(Math.abs(want), Math.abs(got));
    if (Math.abs(got - want) > TOL * scale) out.push(`${path}: ${got} != ${want}`);
  } else if (Array.isArray(want)) {
    if (!Array.isArray(got) || got.length !== want.length) out.push(`${path}: length ${got && got.length} != ${want.length}`);
    else want.forEach((w, i) => diff(got[i], w, `${path}[${i}]`, out));
  } else if (want && typeof want === 'object') {
    if (!got || typeof got !== 'object') { out.push(`${path}: ${JSON.stringify(got)} != object`); return out; }
    const keys = new Set([...Object.keys(want), ...Object.keys(got)]);
    for (const k of keys) {
      if (!(k in got)) out.push(`${path}.${k}: missing`);
      else if (!(k in want)) out.push(`${path}.${k}: not in fixture`);
      else diff(got[k], want[k], `${path}.${k}`, out);
    }
  } else if (got !== want) out.push(`${path}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
  return out;
}

function check(got, want) {
  const d = diff(got, want);
  assert.deepEqual(d.slice(0, 20), [], `${d.length} differences`);
}

const plans = solverPlans();
const layouts = layoutPlans();

test('every fixture has a plan and every plan has a fixture', () => {
  assert.deepEqual(fixtureNames('solver'), Object.keys(plans).sort());
  assert.deepEqual(fixtureNames('layout'), Object.keys(layouts).sort());
});

for (const [name, cfg] of Object.entries(plans)) {
  test(`solver snapshot: ${name}`, () => {
    const p = solve(cfg);
    assert.equal(p.ok, true);
    check(plainPlan(p), fixture('solver', name));
  });
}

for (const [name, { spray, cfg }] of Object.entries(layouts)) {
  test(`layout snapshot: ${name}`, () => {
    check(plainLayout(layoutGraph(solve(cfg), { spray })), fixture('layout', name));
  });
}
