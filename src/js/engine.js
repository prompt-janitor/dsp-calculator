// The solver. It has no DOM access, so the tests can run it in Node.
// Filled by initEngine().
export let DATA = null;
export const RECIPES = {}, ITEMS = {}, RECIPES_FOR = {}, EXCLUDED = {};
export const MACHINE_CLASS = {
  'arc-smelter': 'smelter', 'plane-smelter': 'smelter', 'df-negentropy-smelter': 'smelter',
  'assembling-machine-1': 'assembler', 'assembling-machine-2': 'assembler', 'assembling-machine-3': 'assembler',
  'df-recomposing-assembler': 'assembler',
  'chemical-plant': 'chem', 'quantum-chemical-plant': 'chem',
  'matrix-lab': 'lab', 'df-self-evolution-lab': 'lab',
  'mining-machine': 'miner', 'advanced-mining-machine': 'miner'
};
const FLUIDS = { 'water': 1, 'crude-oil': 1, 'refined-oil': 1, 'sulfuric-acid': 1 };
// Items per second for one stack, from the in-game belt tooltips.
export const BELTS = { 'conveyor-belt-1': 6, 'conveyor-belt-2': 12, 'conveyor-belt-3': 30 };
const DEFAULT_BELT_SPEED = BELTS['conveyor-belt-3'];
// Orbital collectors burn part of what they gather for power. 55% net matches
// a standard gas giant. Source: dsp-wiki.com/Orbital_Collector
const DEFAULT_ORBITAL_NET = 55;
const DEFAULT_MINING_SPEED = 100;
const MAX_PASSES = 600;
// The solve stops when no step's run rate changes by more than this, relative to its size.
const CONVERGED = 1e-10;
// A run rate above this means a loop in the recipes feeds itself without end.
const RUNAWAY_RATE = 1e9;
// Slack for float error, so 2.0000000001 machines or belts does not round up to 3.
const ROUND_SLACK = 1e-9;
// Flows smaller than this are float noise and get no edge.
const MIN_FLOW = 1e-12;
const DEFAULT_PICK = {
  'deuterium': 'deuterium-fractionation',
  'critical-photon': 'critical-photon',
  'hydrogen': 'gas-giant-hydrogen',
  'refined-oil': 'plasma-refining'
};

export function initEngine(data) {
  DATA = data;
  // The source data lists deuterium fractionation as 0.01 : 0.01, which hides the 1% chance.
  // In game, each hydrogen has a 1% chance to become deuterium and a fractionator handles one belt of hydrogen.
  // Source: dsp-wiki.com/Fractionator
  for (const recipe of data.recipes) {
    if (recipe.id === 'deuterium-fractionation') { recipe.in = { 'hydrogen': 1 }; recipe.out = { 'deuterium': 0.01 }; recipe.time = 1; }
  }
  for (const id of data.excluded) EXCLUDED[id] = 1;
  // FactorioLab's defaults exclude fire ice veins. Allow them, so fire ice comes from its vein by default.
  delete EXCLUDED['fire-ice-vein'];

  for (const recipe of data.recipes) {
    RECIPES[recipe.id] = recipe;
    for (const out of Object.keys(recipe.out)) (RECIPES_FOR[out] = RECIPES_FOR[out] || []).push(recipe.id);
  }
  for (const item of data.items) ITEMS[item.id] = item;
}

export function defaultRecipeFor(item) {
  const candidates = RECIPES_FOR[item];
  if (!candidates || !candidates.length) return null;
  if (DEFAULT_PICK[item] && RECIPES[DEFAULT_PICK[item]]) return DEFAULT_PICK[item];
  let allowed = candidates.filter((id) => !EXCLUDED[id]);
  if (!allowed.length) allowed = candidates;
  const plainVein = allowed.filter((id) => RECIPES[id].mining && Object.keys(RECIPES[id].out).length === 1);
  if (plainVein.length) return plainVein[0];
  const mainOutput = allowed.filter((id) => Object.keys(RECIPES[id].out)[0] === item);
  return mainOutput[0] || allowed[0];
}

function beltCapacity(cfg) { return (BELTS[cfg.belt] || DEFAULT_BELT_SPEED) * (cfg.stack || 1); }

// A machine set on the step wins, then the one chosen in Settings for its class.
function pickMachine(recipe, cfg, chosen) {
  if (chosen && recipe.prod.includes(chosen)) return chosen;
  for (const machine of recipe.prod) {
    if (cfg.machines[MACHINE_CLASS[machine]] === machine) return machine;
  }
  return recipe.prod[0];
}

function sumValues(obj) { let total = 0; for (const key in obj) total += obj[key]; return total; }

function addTo(totals, key, amount) { totals[key] = (totals[key] || 0) + amount; }

function activeTargets(cfg) { return cfg.targets.filter((t) => t.item && t.rate > 0); }

// A proliferator set on the step wins over the one in Settings.
function sprayChoice(item, cfg, overrides) {
  return (overrides[item] && overrides[item].prolif) || cfg.prolif;
}

// The proliferator effect on a recipe, or null when it gets none.
function sprayFor(recipe, choice) {
  if (!choice || !choice.level) return null;
  if (recipe.mining || recipe.id.startsWith('proliferator-') || recipe.id.startsWith('critical-photon')) return null;
  if (Object.keys(recipe.in).length === 0) return null;
  const mode = choice.mode === 'speed' ? 'speed' : 'products';
  const mod = DATA.mods['proliferator-' + choice.level + '-' + mode];
  if (!mod) return null;
  if (mode === 'products' && !recipe.prolif) return null;
  return { level: choice.level, mode: mode, item: mod.proliferator, sprays: mod.sprays,
    productivity: mod.productivity || 0, speed: mod.speed || 0, consumption: mod.consumption };
}

function outputBoost(node) { return node.spray && node.spray.mode === 'products' ? 1 + node.spray.productivity : 1; }

function sprayUse(node) { return node.runs * sumValues(node.recipe.in) / node.spray.sprays; }

function machinesNeeded(node, speed) { return node.runs * node.recipe.time / speed; }

// Walks from the targets through every input, and picks a recipe for each item.
// Items with no recipe, or set as external, are supplied from outside.
function chooseRecipes(cfg, overrides) {
  const recipeOf = {}, external = {}, sprayItems = {};
  const queue = activeTargets(cfg).map((t) => t.item);
  while (queue.length) {
    const item = queue.pop();
    if (recipeOf[item] || external[item]) continue;
    const override = overrides[item];
    if (override && override.external) { external[item] = 1; continue; }
    const recipeId = (override && override.recipe && RECIPES[override.recipe]) ? override.recipe : defaultRecipeFor(item);
    if (!recipeId) { external[item] = 1; continue; }
    recipeOf[item] = recipeId;
    const recipe = RECIPES[recipeId];
    queue.push(...Object.keys(recipe.in));
    const spray = sprayFor(recipe, sprayChoice(item, cfg, overrides));
    if (spray && !sprayItems[spray.item]) { sprayItems[spray.item] = 1; queue.push(spray.item); }
    const machine = DATA.machines[pickMachine(recipe, cfg, override && override.machine)];
    if (machine && machine.cons) queue.push(...Object.keys(machine.cons));
  }
  return { recipeOf, external };
}

function makeSteps(order, recipeOf, cfg, overrides) {
  const nodes = {};
  for (const item of order) {
    const recipe = RECIPES[recipeOf[item]];
    const machine = pickMachine(recipe, cfg, (overrides[item] || {}).machine);
    nodes[item] = { item: item, recipe: recipe, machine: machine, machineData: DATA.machines[machine],
      spray: sprayFor(recipe, sprayChoice(item, cfg, overrides)), runs: 0, kind: recipe.mining ? 'source' : 'craft' };
  }
  return nodes;
}

// How fast one machine works through the recipe time. 1 means the recipe's own time.
function machineSpeed(node, cfg, capacity) {
  const mining = cfg.mining;
  let speed = node.machineData.speed || 1;
  // One fractionator handles a full belt of hydrogen. Source: dsp-wiki.com/Fractionator
  if (node.machine === 'fractionator') speed = capacity;
  else if (node.recipe.mining && (node.machine === 'mining-machine' || node.machine === 'advanced-mining-machine'))
    speed = speed * (mining.veins || 1) * ((mining.speed || DEFAULT_MINING_SPEED) / 100);
  else if (node.machine === 'orbital-collector') speed = speed * ((mining.orbital || DEFAULT_ORBITAL_NET) / 100);
  else if (node.machine === 'oil-extractor') speed = (mining.oil || 1) * ((mining.speed || DEFAULT_MINING_SPEED) / 100);
  if (node.spray && node.spray.mode === 'speed') speed *= (1 + node.spray.speed);
  return speed;
}

// Demand and byproduct supply per item when each step runs at its current rate.
function tallyFlows(targets, order, nodes, speedOf) {
  const demand = {}, supply = {};
  for (const t of targets) addTo(demand, t.item, t.rate);
  for (const item of order) {
    const node = nodes[item], recipe = node.recipe;
    for (const input in recipe.in) addTo(demand, input, node.runs * recipe.in[input]);
    if (node.spray) addTo(demand, node.spray.item, sprayUse(node));
    const machineUse = node.machineData && node.machineData.cons;
    if (machineUse) {
      const machines = machinesNeeded(node, speedOf(node));
      for (const used in machineUse) addTo(demand, used, machines * machineUse[used]);
    }
    const boost = outputBoost(node);
    for (const out in recipe.out) if (out !== item) addTo(supply, out, node.runs * recipe.out[out] * boost);
  }
  return { demand, supply };
}

// Each pass sets every step's run rate from the demand of the last pass,
// until the rates stop changing. Byproduct loops need more than one pass.
function balance(targets, order, nodes, speedOf) {
  let flows = { demand: {}, supply: {} }, ok = true, pass;
  for (pass = 0; pass < MAX_PASSES; pass++) {
    flows = tallyFlows(targets, order, nodes, speedOf);
    let change = 0, runaway = false;
    for (const item of order) {
      const node = nodes[item];
      const need = Math.max(0, (flows.demand[item] || 0) - (flows.supply[item] || 0));
      const runs = need / (node.recipe.out[item] * outputBoost(node));
      change = Math.max(change, Math.abs(runs - node.runs) / (1 + Math.abs(runs)));
      node.runs = runs;
      if (runs > RUNAWAY_RATE) runaway = true;
    }
    if (runaway) { ok = false; break; }
    if (change < CONVERGED) break;
  }
  if (pass >= MAX_PASSES) ok = false;
  return { ok, passes: pass, demand: flows.demand, supply: flows.supply };
}

// Sets machine counts, rates and power on each step, and adds up the totals.
function finishSteps(order, nodes, demand, speedOf, totals) {
  for (const item of order) {
    const node = nodes[item], recipe = node.recipe;
    node.machineCount = machinesNeeded(node, speedOf(node));
    node.built = node.machineCount > ROUND_SLACK ? Math.ceil(node.machineCount - ROUND_SLACK) : 0;
    const boost = outputBoost(node);
    node.outRate = {};
    for (const out in recipe.out) node.outRate[out] = node.runs * recipe.out[out] * boost;
    node.inRate = {};
    for (const input in recipe.in) node.inRate[input] = node.runs * recipe.in[input];
    let power = (node.machineData.usage || 0) * (node.spray ? 1 + node.spray.consumption : 1);
    // The data has no reliable power figure for miners.
    if (node.machine === 'mining-machine') power = 0;
    node.power = node.built * power;           // kW if all built machines run
    node.powerAvg = node.machineCount * power;
    totals.power += node.power;
    addTo(totals.built, node.machine, node.built);
    addTo(totals.machineCount, node.machine, node.machineCount);
    if (node.kind === 'source') totals.raw[item] = demand[item] || 0;
    if (node.spray) totals.proliferator[node.spray.item] = (demand[node.spray.item] || 0);
  }
}

function externalSteps(external, demand, supply, totals) {
  const nodes = {};
  for (const item of Object.keys(external)) {
    const net = Math.max(0, (demand[item] || 0) - (supply[item] || 0));
    nodes[item] = { item: item, kind: 'raw', runs: 0, rate: net };
    totals.raw[item] = net;
  }
  return nodes;
}

function addSurplus(demand, supply, totals) {
  for (const item of Object.keys(supply)) {
    const extra = supply[item] - (demand[item] || 0);
    if (extra > ROUND_SLACK) totals.surplus[item] = extra;
  }
}

// Who uses each item and how much: steps, spray, machine fuel such as lenses, and targets.
function listUsers(cfg, order, nodes, graphNodes, speedOf) {
  const users = {};
  function addUse(item, id, amount, kind) { (users[item] = users[item] || []).push({ id: id, amount: amount, kind: kind || 'item' }); }
  for (const item of order) {
    const node = nodes[item], recipe = node.recipe;
    for (const input in recipe.in) addUse(input, item, node.runs * recipe.in[input]);
    if (node.spray) addUse(node.spray.item, item, sprayUse(node), 'spray');
    const machineUse = node.machineData && node.machineData.cons;
    if (machineUse) {
      const machines = machinesNeeded(node, speedOf(node));
      for (const used in machineUse) addUse(used, item, machines * machineUse[used], 'lens');
    }
  }
  for (const t of activeTargets(cfg)) {
    const id = '__target_' + t.item;
    if (!graphNodes[id]) graphNodes[id] = { item: t.item, kind: 'target', rate: 0, id: id };
    graphNodes[id].rate += t.rate;
  }
  for (const id of Object.keys(graphNodes)) {
    if (graphNodes[id].kind === 'target') addUse(graphNodes[id].item, id, graphNodes[id].rate);
  }
  return users;
}

// Splits the byproduct supply of an item among the steps that make it, by their output.
function byproductMakers(item, fromByproducts, order, nodes) {
  if (fromByproducts <= MIN_FLOW) return [];
  const makers = [];
  let made = 0;
  for (const id of order) {
    const node = nodes[id];
    if (id === item || !node.recipe.out[item]) continue;
    const rate = node.runs * node.recipe.out[item] * outputBoost(node);
    if (rate > MIN_FLOW) { makers.push({ id: id, rate: rate }); made += rate; }
  }
  for (const maker of makers) maker.rate = maker.rate / made * fromByproducts;
  return makers;
}

// Byproducts cover an item's demand first, and the item's own step makes the rest.
// Each user gets its share of both.
function buildEdges(users, supply, order, nodes, graphNodes) {
  const edges = [];
  for (const item of Object.keys(users)) {
    const list = users[item];
    const total = list.reduce((sum, use) => sum + use.amount, 0);
    if (total <= MIN_FLOW) continue;
    const fromByproducts = Math.min(supply[item] || 0, total);
    const fromMain = total - fromByproducts;
    const makers = byproductMakers(item, fromByproducts, order, nodes);
    for (const use of list) {
      const share = use.amount / total;
      if (fromMain > MIN_FLOW && graphNodes[item]) {
        edges.push({ from: item, to: use.id, item: item, flow: fromMain * share, kind: use.kind, byproduct: false });
      }
      for (const maker of makers) {
        edges.push({ from: maker.id, to: use.id, item: item, flow: maker.rate * share, kind: use.kind, byproduct: true });
      }
    }
  }
  return edges;
}

function countBelts(edges, capacity, totals) {
  for (const edge of edges) {
    edge.fluid = !!FLUIDS[edge.item];
    edge.belts = edge.fluid ? 0 : Math.max(1, Math.ceil(edge.flow / capacity - ROUND_SLACK));
    edge.beltFill = edge.fluid ? 0 : edge.flow / (edge.belts * capacity);
    if (!edge.fluid) {
      totals.belts += edge.belts;
      addTo(totals.beltsByItem, edge.item, edge.belts);
    }
  }
}

/* cfg: {targets:[{item,rate(/s)}], machines:{class:machine}, belt, stack, prolif:{level,mode},
   mining:{speed,veins,oil,orbital}, overrides:{item:{recipe,machine,prolif,external}}}
   Rates are per second. Each step makes one item, and node.runs is recipe runs per second. */
export function solve(cfg) {
  const overrides = cfg.overrides || {};
  const capacity = beltCapacity(cfg);
  const speedOf = (node) => machineSpeed(node, cfg, capacity);
  const { recipeOf, external } = chooseRecipes(cfg, overrides);
  const order = Object.keys(recipeOf);
  const nodes = makeSteps(order, recipeOf, cfg, overrides);
  const { ok, passes, demand, supply } = balance(activeTargets(cfg), order, nodes, speedOf);

  const totals = { power: 0, built: {}, machineCount: {}, belts: 0, beltsByItem: {}, raw: {}, surplus: {}, proliferator: {} };
  finishSteps(order, nodes, demand, speedOf, totals);
  const outside = externalSteps(external, demand, supply, totals);
  addSurplus(demand, supply, totals);

  const graphNodes = Object.assign({}, nodes, outside);
  const users = listUsers(cfg, order, nodes, graphNodes, speedOf);
  const edges = buildEdges(users, supply, order, nodes, graphNodes);
  countBelts(edges, capacity, totals);

  return { ok: ok, iterations: passes, nodes: graphNodes, edges: edges, totals: totals,
    demand: demand, supply: supply, beltCapacity: capacity, order: order };
}

// Formatting
export function formatNumber(value, digits) {
  if (!isFinite(value)) return '–';
  const size = Math.abs(value);
  if (size === 0) return '0';
  if (size >= 1000) return Math.round(value).toLocaleString('en-US');
  if (size >= 100) return value.toFixed(digits === undefined ? 0 : digits);
  if (size >= 10) return value.toFixed(digits === undefined ? 1 : digits);
  if (size >= 1) return value.toFixed(digits === undefined ? 2 : digits);
  if (size >= 0.01) return value.toFixed(3);
  return value.toPrecision(2);
}
export function formatPower(kw) {
  if (kw >= 1e6) return (kw / 1e6).toFixed(2) + ' GW';
  if (kw >= 1000) return (kw / 1000).toFixed(kw >= 100000 ? 0 : 1) + ' MW';
  return Math.round(kw) + ' kW';
}
