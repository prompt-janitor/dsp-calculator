// Works out a belt row for one step: where its buildings, belts, sorters,
// spray coaters and Tesla Towers go. No DOM here, so the tests can run it in Node.
// Units are grid tiles. x runs along the row, y across it. A part's x and y
// are its top-left tile. Belt and sorter points are tile coordinates, so
// (2.5, -0.5) is the middle of tile (2, -1). The result is moved so that
// every part sits inside 0..w and 0..h.
import {
  BUILDINGS, PLACED_ALONE, MAX_REACH, SORTERS, DEFAULT_SORTER, sorterRate,
  LAB_STACK_BASE, LAB_STACK_MAX, COATER_LENGTH, TOWER_REACH, TOWER_LINK,
} from './geometry.js';

// A drawn row stops at this many buildings (or lab stacks). Longer rows are
// hard to build and too long to read on a phone.
export const MAX_ROW = 30;
const SLACK = 1e-9;

const none = (reason) => ({ kind: 'none', reason, parts: [], notes: [] });
const ceil = (value) => Math.max(0, Math.ceil(value - SLACK));
const floor = (value) => Math.floor(value + SLACK);
const byRate = (a, b) => b.rate - a.rate || (a.items[0] < b.items[0] ? -1 : 1);

// Items per second for one building at full speed. The step's totals divided
// by its exact machine count, so they match the step details.
function perBuilding(rates, machineCount) {
  return Object.keys(rates)
    .map((item) => ({ items: [item], rate: rates[item] / machineCount }))
    .filter((lane) => lane.rate > SLACK);
}

// Puts each item on its own belt. Inputs go on the top side, fastest nearest,
// and outputs on the bottom side. Inputs that do not fit on top go below the
// outputs. A building with slots on one side only takes every belt there.
// When there are more items than belts in reach, the two slowest inputs share
// a belt, and so on.
function assignLanes(spec, inputs, outputs) {
  const room = (spec.top.length ? MAX_REACH : 0) + (spec.bottom.length ? MAX_REACH : 0);
  const ins = inputs.map((lane) => ({ ...lane, role: 'in' })).sort(byRate);
  const outs = outputs.map((lane) => ({ ...lane, role: 'out' })).sort(byRate);
  const shared = [];
  while (ins.length + outs.length > room && ins.length > 1) {
    const b = ins.pop(), a = ins.pop();
    const both = { items: [...a.items, ...b.items], rate: a.rate + b.rate, role: 'in' };
    shared.push(both.items);
    ins.push(both);
    ins.sort(byRate);
  }
  const place = (list, side) => list.map((lane, i) => ({ ...lane, side, reach: i + 1 }));
  if (!spec.bottom.length) return { lanes: place([...ins, ...outs].sort(byRate), 'top'), shared };
  const top = ins.slice(0, MAX_REACH);
  return { lanes: [...place(top, 'top'), ...place([...outs, ...ins.slice(MAX_REACH)], 'bottom')], shared };
}

const sortersFor = (rate, tier, reach) => ceil(rate / sorterRate(tier, reach));

// True when every side has a slot for each sorter it needs.
function sortersFit(spec, lanes, tier, scale) {
  for (const side of ['top', 'bottom']) {
    const need = lanes.filter((l) => l.side === side).reduce((sum, l) => sum + sortersFor(l.rate * scale, tier, l.reach), 0);
    if (need > spec[side].length) return false;
  }
  return true;
}

// The tallest lab stack, up to LAB_STACK_MAX, whose sorters still fit, with
// the labs spread evenly over the stacks.
function stackHeight(spec, lanes, tier, built) {
  let tallest = 1;
  for (let h = Math.min(LAB_STACK_MAX, built); h >= 1; h--) {
    if (sortersFit(spec, lanes, tier, h)) { tallest = h; break; }
  }
  return Math.ceil(built / Math.ceil(built / tallest));
}

const laneY = (spec, lane) => (lane.side === 'top' ? -lane.reach : spec.d - 1 + lane.reach);
const edgeY = (spec, side) => (side === 'top' ? 0 : spec.d);

// One sorter per slot while the slots last. When a side needs more sorters
// than it has slots, each belt gets one sorter drawn with its count on it.
function placeSorters(spec, lanes, units, parts) {
  const overflow = [];
  for (const side of ['top', 'bottom']) {
    const list = lanes.filter((l) => l.side === side);
    const cols = spec[side];
    const need = list.reduce((sum, l) => sum + l.sorters, 0);
    if (!list.length) continue;
    if (need > cols.length) overflow.push({ side, need, slots: cols.length });
    for (let u = 0; u < units; u++) {
      const left = u * spec.pitch;
      let col = 0;
      for (const lane of list) {
        const each = need > cols.length ? [lane.sorters] : Array(lane.sorters).fill(1);
        for (const count of each) {
          const x = left + cols[col++] + 0.5;
          const belt = [x, laneY(spec, lane) + 0.5], edge = [x, edgeY(spec, side)];
          parts.push({ type: 'sorter', unit: u, side, reach: lane.reach, items: lane.items, count, role: lane.role,
            from: lane.role === 'in' ? belt : edge, to: lane.role === 'in' ? edge : belt });
        }
      }
    }
  }
  return overflow;
}

// Tesla Towers on free tiles near the row, so every building center is within
// reach of a tower and each tower links to the one before it. Picks, for the
// first building without power, the free tile that powers the most buildings
// after it. Tiles in line with the buildings come first.
function placeTowers(spec, units, parts, bounds) {
  const taken = takenTiles(parts);
  const cy = spec.d / 2;
  const centers = Array.from({ length: units }, (_, u) => [u * spec.pitch + spec.w / 2, cy]);
  const free = [];
  for (let y = bounds.minY - 1; y <= bounds.maxY; y++) {
    for (let x = -1; x <= bounds.rowEnd; x++) if (!taken.has(x + ',' + y)) free.push([x, y]);
  }
  const reaches = (t, c) => Math.hypot(t[0] + 0.5 - c[0], t[1] + 0.5 - c[1]) <= TOWER_REACH + SLACK;
  const towers = [];
  let next = 0;
  while (next < units) {
    const last = towers[towers.length - 1];
    const linked = free.filter((t) => reaches(t, centers[next]) && (!last || Math.hypot(t[0] - last[0], t[1] - last[1]) <= TOWER_LINK));
    const pool = linked.length ? linked : free.filter((t) => reaches(t, centers[next]));
    if (!pool.length) { next++; continue; }
    const score = (t) => {
      let u = next;
      while (u < units && reaches(t, centers[u])) u++;
      return u;
    };
    let best = null, bestScore = -1;
    for (const t of pool) {
      const s = score(t);
      const better = s > bestScore || (s === bestScore && Math.abs(t[1] + 0.5 - cy) < Math.abs(best[1] + 0.5 - cy));
      if (better) { best = t; bestScore = s; }
    }
    towers.push(best);
    free.splice(free.indexOf(best), 1);
    next = bestScore;
  }
  for (const [x, y] of towers) parts.push({ type: 'tower', x, y, w: 1, d: 1 });
  return towers.length;
}

// Every tile a belt, building, coater or tower covers, as "x,y" keys.
// Sorters and ports reach over belts, so they take no tiles.
export function takenTiles(parts) {
  const tiles = new Set();
  for (const part of parts) {
    if (part.type === 'belt') for (const t of beltTiles(part.points)) tiles.add(t);
    else if (part.w) {
      for (let x = part.x; x < part.x + part.w; x++) for (let y = part.y; y < part.y + part.d; y++) tiles.add(x + ',' + y);
    }
  }
  return tiles;
}

// The tiles a belt passes over. Its points are tile centers, or tile edges
// where it ends at a building.
export function beltTiles(points) {
  const tiles = [];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i];
    const length = Math.abs(bx - ax) + Math.abs(by - ay);
    for (let t = 0.25; t < length; t += 0.5) {
      const x = ax + (bx - ax) * t / length, y = ay + (by - ay) * t / length;
      const key = Math.floor(x) + ',' + Math.floor(y);
      if (tiles[tiles.length - 1] !== key) tiles.push(key);
    }
  }
  return [...new Set(tiles)];
}

// Moves every part so the top-left corner is (0, 0), and returns the size.
function settle(parts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const see = (x, y) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
  for (const p of parts) {
    if (p.points) for (const [x, y] of p.points) { see(Math.floor(x), Math.floor(y)); see(Math.ceil(x), Math.ceil(y)); }
    else if (p.from) { see(...p.from); see(...p.to); }
    else { see(p.x, p.y); see(p.x + p.w, p.y + p.d); }
  }
  const move = ([x, y]) => [x - minX, y - minY];
  for (const p of parts) {
    if (p.points) p.points = p.points.map(move);
    else if (p.from) { p.from = move(p.from); p.to = move(p.to); }
    else { p.x -= minX; p.y -= minY; }
  }
  return { w: maxX - minX, h: maxY - minY };
}

// The usual row: buildings side by side, belts along both sides.
// Smelters touch (pitch 3) with ore on one side and ingots on the other.
// Assemblers sit 4 apart with belts at 1, 2 and 3 tiles, the measured
// "assembler rows with 3 belts" pattern. Chemical plants, refineries,
// colliders and lab stacks use the same row with their own slot sides.
function rowLayout(ctx) {
  const { node, spec, tier, cap } = ctx;
  const inputs = perBuilding(node.inRate, node.machineCount);
  const outputs = perBuilding(node.outRate, node.machineCount);
  const { lanes, shared } = assignLanes(spec, inputs, outputs);
  const built = node.built;
  const height = spec.stack ? stackHeight(spec, lanes, tier, built) : 1;
  const unitsNeeded = Math.ceil(built / height);
  for (const lane of lanes) {
    lane.unitRate = lane.rate * height;
    lane.sorters = Math.max(1, sortersFor(lane.unitRate, tier, lane.reach));
  }
  const fullBelt = Math.min(...lanes.map((l) => floor(cap / l.unitRate)));
  const perRow = Math.max(1, Math.min(fullBelt, MAX_ROW));
  const units = Math.min(perRow, unitsNeeded);
  const perModule = Math.min(units * height, built);
  const modules = Math.ceil(built / perModule);
  const last = built - (modules - 1) * perModule;

  const parts = [];
  const rowEnd = (units - 1) * spec.pitch + spec.w;
  const sprayed = !!node.spray;
  const lead = sprayed ? COATER_LENGTH + 2 : 1;
  for (let u = 0; u < units; u++) {
    const levels = modules === 1 && u === units - 1 ? built - u * height : height;
    parts.push({ type: 'building', unit: u, x: u * spec.pitch, y: 0, w: spec.w, d: spec.d, machine: node.machine, item: node.item,
      ...(spec.stack ? { stack: levels } : {}) });
  }
  for (const lane of lanes) {
    const y = laneY(spec, lane) + 0.5;
    const points = lane.role === 'in' ? [[-lead, y], [rowEnd, y]] : [[rowEnd, y], [-lead, y]];
    parts.push({ type: 'belt', item: lane.items[0], items: lane.items, role: lane.role, side: lane.side, reach: lane.reach, points });
    if (sprayed && lane.role === 'in') {
      parts.push({ type: 'coater', x: -lead + 1, y: laneY(spec, lane), w: COATER_LENGTH, d: 1, items: lane.items });
    }
  }
  const overflow = placeSorters(spec, lanes, units, parts);
  const ys = lanes.map((l) => laneY(spec, l));
  const towers = placeTowers(spec, units, parts, { minY: Math.min(0, ...ys), maxY: Math.max(spec.d, ...ys.map((y) => y + 1)), rowEnd });

  const notes = [];
  const unitName = spec.stack ? 'stack' : 'building';
  for (const items of shared) notes.push({ key: 'shared', items });
  for (const o of overflow) notes.push({ key: 'slots', ...o, unit: unitName, faster: fasterSorter(spec, lanes, tier, height) });
  for (const lane of lanes) {
    if (lane.unitRate > cap + SLACK) notes.push({ key: 'belts', items: lane.items, belts: ceil(lane.unitRate / cap) });
  }
  if (units === MAX_ROW && fullBelt > MAX_ROW) notes.push({ key: 'long', fullBelt: fullBelt * height, max: MAX_ROW * height });
  if (spec.stack) {
    notes.push({ key: 'stack', height });
    if (height > LAB_STACK_BASE) notes.push({ key: 'stackResearch', height });
  }
  if (spec === BUILDINGS['chemical-plant'] || spec === BUILDINGS['quantum-chemical-plant']) notes.push({ key: 'equator' });

  const row = { lanes, units, perModule, modules, last, height, parts, notes, towers };
  return finish(ctx, row);
}

// Fractionators: hydrogen runs through each one (in one side, out the
// other) on a belt that goes back to the start of the line, where new
// hydrogen joins it. Deuterium leaves from the third side onto its own belt.
// The measured "fractionator line" pattern, at pitch 4 with a belt tile between.
function fractionatorLayout(ctx) {
  const { node, spec, cap } = ctx;
  const used = node.inRate.hydrogen / node.machineCount;
  const made = node.outRate.deuterium / node.machineCount;
  const built = node.built;
  const fullBelt = Math.min(floor(cap / used), floor(cap / made));
  const units = Math.min(Math.max(1, Math.min(fullBelt, MAX_ROW)), built);
  const modules = Math.ceil(built / units);
  const last = built - (modules - 1) * units;
  const sprayed = !!node.spray;
  const lead = sprayed ? COATER_LENGTH + 4 : 3;
  const rowEnd = (units - 1) * spec.pitch + spec.w;
  const mid = 1.5, below = spec.d + 0.5;

  const parts = [];
  for (let u = 0; u < units; u++) {
    parts.push({ type: 'building', unit: u, x: u * spec.pitch, y: 0, w: spec.w, d: spec.d, machine: node.machine, item: node.item });
    parts.push({ type: 'port', unit: u, items: ['deuterium'], role: 'out', from: [u * spec.pitch + 1.5, 0], to: [u * spec.pitch + 1.5, -0.5] });
  }
  parts.push({ type: 'belt', item: 'hydrogen', items: ['hydrogen'], role: 'in', points: [[-lead, mid], [0, mid]] });
  for (let u = 0; u < units - 1; u++) {
    const x = u * spec.pitch + spec.w;
    parts.push({ type: 'belt', item: 'hydrogen', items: ['hydrogen'], role: 'through', points: [[x, mid], [x + 1, mid]] });
  }
  parts.push({ type: 'belt', item: 'hydrogen', items: ['hydrogen'], role: 'loop',
    points: [[rowEnd, mid], [rowEnd + 0.5, mid], [rowEnd + 0.5, below], [-1.5, below], [-1.5, mid + 0.5]] });
  parts.push({ type: 'belt', item: 'deuterium', items: ['deuterium'], role: 'out', points: [[rowEnd, -0.5], [-lead, -0.5]] });
  if (sprayed) parts.push({ type: 'coater', x: -lead + 1, y: 1, w: COATER_LENGTH, d: 1, items: ['hydrogen'] });
  const towers = placeTowers(spec, units, parts, { minY: -1, maxY: spec.d + 1, rowEnd });

  const lanes = [
    { items: ['hydrogen'], rate: used, unitRate: used, role: 'in', reach: 0, sorters: 0 },
    { items: ['deuterium'], rate: made, unitRate: made, role: 'out', reach: 0, sorters: 0 },
  ];
  const notes = [{ key: 'fractionator' }, { key: 'fractionatorEnd' }];
  if (units === MAX_ROW && fullBelt > MAX_ROW) notes.push({ key: 'long', fullBelt, max: MAX_ROW });
  return finish(ctx, { lanes, units, perModule: units, modules, last, height: 1, parts, notes, towers });
}

// The slowest sorter tier whose sorters fit in the slots, or null.
function fasterSorter(spec, lanes, tier, height) {
  for (const t of SORTERS.slice(SORTERS.indexOf(tier) + 1)) {
    const fits = ['top', 'bottom'].every((side) => lanes.filter((l) => l.side === side)
      .reduce((sum, l) => sum + Math.max(1, sortersFor(l.rate * height, t, l.reach)), 0) <= spec[side].length);
    if (fits) return t;
  }
  return null;
}

// Adds what both layouts report: the item table, spray, power and the size.
function finish(ctx, row) {
  const { node, cap, tier } = ctx;
  const { lanes, units, perModule, modules, last, height, parts, notes, towers } = row;
  const table = (role) => lanes.filter((l) => l.role === role).flatMap((lane) => lane.items.map((item) => {
    const each = (role === 'in' ? node.inRate[item] : node.outRate[item]) / node.machineCount;
    return {
      item, rate: each, unitRate: each * height, perModule: each * perModule,
      belts: Math.max(1, ceil(lane.unitRate * units / cap)), sorters: lane.sorters, reach: lane.reach,
      side: lane.side || null, shared: lane.items.length > 1 ? lane.items.filter((i) => i !== item) : null,
    };
  }));
  let spray = null;
  if (node.spray) {
    const perRow = node.runs * Object.values(node.recipe.in).reduce((a, b) => a + b, 0) / node.spray.sprays / node.machineCount * perModule;
    spray = { item: node.spray.item, perModule: perRow, coaters: parts.filter((p) => p.type === 'coater').length };
    notes.push({ key: 'spray', item: spray.item, rate: perRow });
  }
  if (tier === 'sorter-4' && lanes.some((l) => l.sorters)) notes.push({ key: 'pile' });
  if (towers) notes.push({ key: 'towers' });
  const { w, h } = settle(parts);
  return {
    kind: 'module', machine: node.machine, item: node.item, sorter: tier,
    built: node.built, perModule, modules, last, units, stack: height > 1 ? height : null,
    w, h, parts, inputs: table('in'), outputs: table('out'), output: table('out')[0] || null, spray, notes,
  };
}

/* node: a step from solve(). plan: the solve() result. opts.sorter: the
   sorter tier ('sorter-1' to 'sorter-4'). Returns { kind: 'none', reason }
   when the step is not built in belt rows, or { kind: 'module', ... } with
   the parts of one row and how many rows to build. */
export function stepLayout(node, plan, opts = {}) {
  const tier = SORTERS.includes(opts.sorter) ? opts.sorter : DEFAULT_SORTER;
  if (!node || (node.kind !== 'craft' && node.kind !== 'source')) return none('Supplied from elsewhere.');
  if (PLACED_ALONE[node.machine]) return none(PLACED_ALONE[node.machine]);
  const spec = BUILDINGS[node.machine];
  if (!spec) return none('There is no layout for this building yet.');
  if (!node.built || !(node.machineCount > SLACK)) return none('Nothing to build at this rate.');
  const ctx = { node, spec, tier, cap: plan.beltCapacity };
  return spec.ports ? fractionatorLayout(ctx) : rowLayout(ctx);
}
