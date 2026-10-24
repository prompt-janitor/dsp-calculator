// Loads the browser scripts into a Node vm context, in the same order as
// scripts/build.mjs, so tests can call solve() and layoutGraph() directly.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL('../../src/' + p, import.meta.url), 'utf8');

export function loadApp() {
  const ctx = { DATA: JSON.parse(read('data/recipes.json')), console };
  vm.createContext(ctx);
  for (const f of ['js/engine.js', 'js/core.js', 'js/map.js']) vm.runInContext(read(f), ctx, { filename: f });
  ctx.initEngine(ctx.DATA);
  return ctx;
}

// Same machine choices as defaultState() in core.js. Rates are per second.
export function baseCfg() {
  return {
    targets: [],
    machines: { smelter: 'plane-smelter', assembler: 'assembling-machine-3', chem: 'chemical-plant', lab: 'matrix-lab', miner: 'mining-machine' },
    belt: 'conveyor-belt-3', stack: 1, prolif: { level: 0, mode: 'products' },
    mining: { speed: 100, veins: 8, oil: 1, orbital: 55 }, overrides: {},
  };
}

// Turns a solve() result into plain JSON. Recipe and machine objects are
// replaced by their ids, so the snapshot does not repeat the recipe data.
export function plainPlan(p) {
  const nodes = {};
  for (const [id, n] of Object.entries(p.nodes)) {
    const copy = { ...n };
    if (copy.rec) copy.rec = copy.rec.id;
    if (copy.mach) copy.mach = n.machine;
    nodes[id] = copy;
  }
  return JSON.parse(JSON.stringify({ ...p, nodes }));
}

function endPoints(d) {
  const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
  return { from: [nums[0], nums[1]], to: [nums[nums.length - 2], nums[nums.length - 1]] };
}

// Turns a layoutGraph() result into plain JSON. Each path keeps the edge it
// belongs to and its two port positions, read from the start and end of the path.
export function plainLayout(l) {
  return JSON.parse(JSON.stringify({
    width: l.width,
    height: l.height,
    nodes: l.nodes,
    paths: l.paths.map((p) => ({
      edge: { from: p.e.from, to: p.e.to, item: p.e.item, kind: p.e.kind },
      ports: endPoints(p.d),
      d: p.d, lx: p.lx, ly: p.ly, spray: !!p.spray,
    })),
  }));
}
