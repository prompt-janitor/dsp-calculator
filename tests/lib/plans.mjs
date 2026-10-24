// Plans used by the snapshot tests. Each one returns a solve() config.
// Changing a plan here means the fixtures must be made again with
// `npm run snapshot`, so add new plans instead of editing old ones.
import { baseCfg } from './load.mjs';
import { PRESETS } from '../../src/js/core.js';

const cfg = (targets, patch = {}) => ({ ...baseCfg(), ...patch, targets });

export function solverPlans() {
  const plans = {};
  // Preset rates are per minute, as in the app.
  for (const p of PRESETS) {
    plans['preset-' + p.id] = cfg(p.items.map(([item, rate]) => ({ item, rate: rate / 60 })));
  }
  Object.assign(plans, {
    'deuterium': cfg([{ item: 'deuterium', rate: 1 }]),
    'orbital-hydrogen': cfg([{ item: 'hydrogen', rate: 10 }]),
    'prolif-3-products': cfg([{ item: 'information-matrix', rate: 1 }], { prolif: { level: 3, mode: 'products' } }),
    'prolif-3-speed': cfg([{ item: 'information-matrix', rate: 1 }], { prolif: { level: 3, mode: 'speed' } }),
    'belt-1-stack-4': cfg([{ item: 'iron-ingot', rate: 50 }, { item: 'magnetic-coil', rate: 10 }], { belt: 'conveyor-belt-1', stack: 4 }),
    'recipe-override': cfg([{ item: 'carbon-nanotube', rate: 2 }], { overrides: { 'graphene': { recipe: 'graphene-advanced' } } }),
    'building-override': cfg([{ item: 'circuit-board', rate: 4 }], { overrides: { 'iron-ingot': { machine: 'arc-smelter' } } }),
    'supplied-elsewhere': cfg([{ item: 'information-matrix', rate: 1 }], { overrides: { 'processor': { external: true } } }),
    'mining-200-veins-4-oil-2': cfg([{ item: 'plastic', rate: 2 }, { item: 'iron-ingot', rate: 5 }], { mining: { speed: 200, veins: 4, oil: 2, orbital: 55 } }),
  });
  return plans;
}

// Plans for layoutGraph(). `spray` is the map option for proliferator links.
export function layoutPlans() {
  return {
    'information-matrix': { spray: true, cfg: cfg([{ item: 'information-matrix', rate: 1 }]) },
    'universe-matrix-prolif-spray': { spray: true, cfg: cfg([{ item: 'universe-matrix', rate: 1 }], { prolif: { level: 3, mode: 'products' } }) },
    'dyson-parts-no-spray': {
      spray: false,
      cfg: cfg([{ item: 'solar-sail', rate: 2 }, { item: 'frame-material', rate: 0.5 }, { item: 'small-carrier-rocket', rate: 0.1 }], { prolif: { level: 2, mode: 'products' } }),
    },
  };
}
