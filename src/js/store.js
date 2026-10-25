// The user's choices and the session state.
import { DATA, ITEMS, RECIPES, BELTS, MACHINE_CLASS } from './engine.js';

const STORE_KEY = 'dsp-calculator-v1';

export function defaultState() {
  return {
    targets: [{ item: 'information-matrix', rate: 60 }],
    unit: 'min',
    machines: {
      smelter: 'plane-smelter', assembler: 'assembling-machine-3', chem: 'chemical-plant', lab: 'matrix-lab', miner: 'mining-machine'
    },
    belt: 'conveyor-belt-3', stack: 1,
    prolif: { level: 0, mode: 'products' },
    mining: { speed: 100, veins: 8, oil: 1, orbital: 55 },
    overrides: {},
    moved: {},
    opts: { spray: true, labels: true, theme: 'auto' },
    tab: 'plan', side: 'plan', psec: 'plan', main: 'map', bsec: 'buildings'
  };
}

// Limits for the mining numbers. The Settings fields use them too.
export const MINING_LIMITS = {
  speed: { min: 10, max: 1000 },
  veins: { min: 1, max: 12 },
  oil: { min: 0.1, max: 20 },
  orbital: { min: 10, max: 100 }
};
export const clampMining = (key, value) => Math.min(MINING_LIMITS[key].max, Math.max(MINING_LIMITS[key].min, value));

// Moved map boxes are offsets in px from the automatic layout, up to
// MOVE_LIMIT each way. A map has one box per item and one per target, so a
// list longer than MOVED_MAX did not come from this app.
export const MOVE_LIMIT = 20000;
const MOVED_MAX = 1000;
// engine.js names a target node '__target_' + item.
const TARGET_PREFIX = '__target_';

const PANES = {
  tab: ['plan', 'map', 'build', 'settings'],
  side: ['plan', 'saved', 'files', 'settings'],
  // The pane the Plan tab shows on phones, the last of these three opened.
  psec: ['plan', 'saved', 'files'],
  main: ['map', 'build'],
  bsec: ['buildings', 'steps', 'resources']
};
const MODES = ['products', 'speed'];
const THEMES = ['auto', 'dark', 'light'];

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const isNumber = (value) => typeof value === 'number' && isFinite(value);
const isLevel = (value) => Number.isInteger(value) && value >= 0 && value <= 3;
// An own key only, so names such as "constructor" or "__proto__" do not count as known ids.
const known = (table, id) => typeof id === 'string' && Object.hasOwn(table, id);

// A proliferator choice, or null when it is not valid.
function readProlif(saved) {
  if (!isObject(saved) || !isLevel(saved.level) || !MODES.includes(saved.mode)) return null;
  return { level: saved.level, mode: saved.mode };
}

// Keeps only the per-step changes that name a known item, recipe and building.
function readOverrides(saved) {
  const overrides = {};
  for (const item of Object.keys(saved)) {
    const entry = saved[item];
    if (!known(ITEMS, item) || !isObject(entry)) continue;
    const kept = {};
    if (known(RECIPES, entry.recipe) && known(RECIPES[entry.recipe].out, item)) kept.recipe = entry.recipe;
    if (known(DATA.machines, entry.machine)) kept.machine = entry.machine;
    const prolif = readProlif(entry.prolif);
    if (prolif) kept.prolif = prolif;
    if (entry.external === true) kept.external = true;
    if (Object.keys(kept).length) overrides[item] = kept;
  }
  return overrides;
}

const isNodeId = (id) => known(ITEMS, id) ||
  (typeof id === 'string' && id.startsWith(TARGET_PREFIX) && known(ITEMS, id.slice(TARGET_PREFIX.length)));
const readOffset = (value) => Math.round(Math.min(MOVE_LIMIT, Math.max(-MOVE_LIMIT, value))) || 0;

// Keeps the moved boxes that name a step or a target, rounded to whole px.
function readMoved(saved) {
  const moved = {};
  let count = 0;
  for (const id of Object.keys(saved)) {
    const offset = saved[id];
    if (!isNodeId(id) || !Array.isArray(offset) || offset.length !== 2 || !offset.every(isNumber)) continue;
    const [dx, dy] = offset.map(readOffset);
    if (!dx && !dy) continue;
    moved[id] = [dx, dy];
    if (++count >= MOVED_MAX) break;
  }
  return moved;
}

// Copies the valid parts of a saved or pasted state onto a fresh default one.
// A plan code can come from anyone, so every value is checked.
export function mergeState(base, saved) {
  if (!isObject(saved)) return base;
  if (Array.isArray(saved.targets)) {
    base.targets = saved.targets
      .filter((t) => isObject(t) && known(ITEMS, t.item) && isFinite(+t.rate) && +t.rate >= 0)
      .map((t) => ({ item: t.item, rate: +t.rate }));
  }
  if (saved.unit === 's' || saved.unit === 'min') base.unit = saved.unit;
  if (isObject(saved.machines)) {
    for (const cls of Object.keys(base.machines)) {
      const id = saved.machines[cls];
      if (known(MACHINE_CLASS, id) && MACHINE_CLASS[id] === cls && known(DATA.machines, id)) base.machines[cls] = id;
    }
  }
  if (known(BELTS, saved.belt)) base.belt = saved.belt;
  if (Number.isInteger(saved.stack) && saved.stack >= 1 && saved.stack <= 4) base.stack = saved.stack;
  base.prolif = readProlif(saved.prolif) || base.prolif;
  if (isObject(saved.mining)) {
    for (const key of Object.keys(MINING_LIMITS)) {
      if (isNumber(saved.mining[key])) base.mining[key] = clampMining(key, saved.mining[key]);
    }
  }
  if (isObject(saved.overrides)) base.overrides = readOverrides(saved.overrides);
  if (isObject(saved.moved)) base.moved = readMoved(saved.moved);
  if (isObject(saved.opts)) {
    for (const key of ['spray', 'labels']) if (typeof saved.opts[key] === 'boolean') base.opts[key] = saved.opts[key];
    if (THEMES.includes(saved.opts.theme)) base.opts.theme = saved.opts.theme;
  }
  for (const key of Object.keys(PANES)) {
    if (PANES[key].includes(saved[key])) base[key] = saved[key];
  }
  return base;
}

// What the user chose. It is saved to localStorage, and a plan code is this
// object as JSON. Other modules read it; only this module replaces it.
export let state = defaultState();

// Session state that is not saved.
export const ui = {
  plan: null,                  // last solve() result
  sel: null,                   // id of the selected map node
  layoutBase: null,            // last prepareLayout() result, kept for box moves
  layout: null,                // last moveLayout() result
  view: { x: 20, y: 20, k: 1 }, // map pan and zoom
  needFit: true,               // the map was hidden when it last tried to fit
  mapSig: '',                  // node list of the map that was last fitted
  picker: { onPick: null, cat: 'all' },
  installPrompt: null,         // saved beforeinstallprompt event
  toastTimer: 0,
  solveTimer: 0
};

export function loadState() {
  let loaded = defaultState();
  // localStorage throws in some private modes and when storage is blocked.
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) loaded = mergeState(loaded, JSON.parse(raw));
  } catch (e) { }
  state = loaded;
}

function saveState() {
  // localStorage throws in some private modes and when storage is full.
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { }
}

// Swaps in a whole new state, for a reset or a loaded plan code.
export function replaceState(next) {
  state = next;
  ui.sel = null;
  ui.mapSig = '';
  saveState();
}

// Parts of the page that a change can draw again, in the order they run.
// app.js gives each one a function with onRender().
const PARTS = ['theme', 'nav', 'plan', 'saved', 'settings', 'solve'];
const renderers = {};

export function onRender(part, fn) {
  renderers[part] = fn;
}

// Draws the given parts again. Two more names are allowed: 'refit' makes the
// map fit the new graph, and 'solveSoon' runs 'solve' after a short pause so
// typing in a number does not solve on every key.
export function render(...parts) {
  if (parts.includes('refit')) ui.mapSig = '';
  if (parts.includes('solveSoon')) {
    clearTimeout(ui.solveTimer);
    ui.solveTimer = setTimeout(() => render('solve'), 160);
  }
  if (parts.includes('solve')) clearTimeout(ui.solveTimer);
  for (const part of PARTS) if (parts.includes(part)) renderers[part]();
}

export function renderAll() {
  render(...PARTS);
}

// Changes the saved choices, saves them and draws the given parts again.
export function update(change, ...parts) {
  change(state);
  saveState();
  render(...parts);
}
