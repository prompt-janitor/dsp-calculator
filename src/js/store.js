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

export function mergeState(d, s) {
  if (!s || typeof s !== 'object') return d;
  if (Array.isArray(s.targets)) d.targets = s.targets.filter(function (t) { return t && ITEMS[t.item] && isFinite(+t.rate); }).map(function (t) { return { item: t.item, rate: +t.rate }; });
  if (s.unit === 's' || s.unit === 'min') d.unit = s.unit;
  ['machines', 'prolif', 'mining', 'opts'].forEach(function (k) { if (s[k] && typeof s[k] === 'object') for (var x in s[k]) d[k][x] = s[k][x]; });
  if (BELTS[s.belt]) d.belt = s.belt;
  if (s.stack >= 1 && s.stack <= 4) d.stack = +s.stack;
  if (s.overrides && typeof s.overrides === 'object') d.overrides = s.overrides;
  ['tab', 'side', 'main', 'bsec'].forEach(function (k) { if (typeof s[k] === 'string') d[k] = s[k]; });
  if (['plan', 'map', 'build', 'settings'].indexOf(d.tab) < 0) d.tab = 'plan';
  return d;
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
  var d = defaultState();
  // localStorage throws in some private modes and when storage is blocked.
  try { var raw = localStorage.getItem(STORE_KEY); if (raw) d = mergeState(d, JSON.parse(raw)); } catch (e) { }
  state = d;
}

export function saveState() {
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
