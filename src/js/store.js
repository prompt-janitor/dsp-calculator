/* ---------- Store: the user's choices and the session state ---------- */
import { ITEMS, BELTS } from './engine.js';

const STORE_KEY = 'dsp-calculator-v1';

export function defaultState() {
  return {
    targets: [{ item: 'information-matrix', rate: 60 }],
    unit: 'min',
    machines: { smelter: 'plane-smelter', assembler: 'assembling-machine-3', chem: 'chemical-plant', lab: 'matrix-lab', miner: 'mining-machine' },
    belt: 'conveyor-belt-3', stack: 1,
    prolif: { level: 0, mode: 'products' },
    mining: { speed: 100, veins: 8, oil: 1, orbital: 55 },
    overrides: {},
    opts: { spray: true, labels: true, theme: 'auto' },
    tab: 'plan', side: 'plan', main: 'map', bsec: 'buildings'
  };
}

const TABS = ['plan', 'map', 'build', 'settings'];

// Copies the valid parts of a saved or pasted state onto a fresh default one.
export function mergeState(base, saved) {
  if (!saved || typeof saved !== 'object') return base;
  if (Array.isArray(saved.targets)) {
    base.targets = saved.targets
      .filter((t) => t && ITEMS[t.item] && isFinite(+t.rate))
      .map((t) => ({ item: t.item, rate: +t.rate }));
  }
  if (saved.unit === 's' || saved.unit === 'min') base.unit = saved.unit;
  for (const key of ['machines', 'prolif', 'mining', 'opts']) {
    if (saved[key] && typeof saved[key] === 'object') Object.assign(base[key], saved[key]);
  }
  if (BELTS[saved.belt]) base.belt = saved.belt;
  if (saved.stack >= 1 && saved.stack <= 4) base.stack = +saved.stack;
  if (saved.overrides && typeof saved.overrides === 'object') base.overrides = saved.overrides;
  for (const key of ['tab', 'side', 'main', 'bsec']) {
    if (typeof saved[key] === 'string') base[key] = saved[key];
  }
  if (!TABS.includes(base.tab)) base.tab = 'plan';
  return base;
}

// What the user chose. It is saved to localStorage, and a plan code is this
// object as JSON. Other modules read it; only this module replaces it.
export let state = defaultState();

// Session state that is not saved.
export const ui = {
  plan: null,                  // last solve() result
  sel: null,                   // id of the selected map node
  layout: null,                // last layoutGraph() result
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
const PARTS = ['theme', 'nav', 'plan', 'settings', 'solve'];
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
