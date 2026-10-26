// Building sizes, sorter slots and speeds for the step layouts, in grid tiles
// at the equator. Keys are the machine ids in recipes.json.
// Sources: the game data dump on dsp-wiki (https://dsp-wiki.com/Module:GameData/prefabs.json),
// the dsp-wiki building pages, and public blueprints from dysonsphereblueprints.com
// that were decoded and measured. The grid squeezes toward the poles, so rows
// built far from the equator may need more room.

// w: tiles along the row. d: tiles across it. pitch: distance between the
// left edges of two buildings in a row. top and bottom: the tile columns,
// counted from the left edge, that have a sorter slot facing the belts.
// A side without slots facing the belts has an empty list.
export const BUILDINGS = {
  // 3x3, touching (pitch 3), 3 slots per side.
  // https://dsp-wiki.com/Arc_Smelter, factory-small-plane-smelter-array
  'arc-smelter': { w: 3, d: 3, pitch: 3, top: [0, 1, 2], bottom: [0, 1, 2] },
  'plane-smelter': { w: 3, d: 3, pitch: 3, top: [0, 1, 2], bottom: [0, 1, 2] },
  // Same model and slots as the other smelters. Not measured in a blueprint.
  'df-negentropy-smelter': { w: 3, d: 3, pitch: 3, top: [0, 1, 2], bottom: [0, 1, 2] },
  // 3x3, but two assemblers need centers 4 apart, so a row has 1-tile gaps.
  // https://dsp-wiki.com/Assembling_Machine_Mk.I, factory-64-x-gear-proliferated
  'assembling-machine-1': { w: 3, d: 3, pitch: 4, top: [0, 1, 2], bottom: [0, 1, 2] },
  'assembling-machine-2': { w: 3, d: 3, pitch: 4, top: [0, 1, 2], bottom: [0, 1, 2] },
  'assembling-machine-3': { w: 3, d: 3, pitch: 4, top: [0, 1, 2], bottom: [0, 1, 2] },
  'df-recomposing-assembler': { w: 3, d: 3, pitch: 4, top: [0, 1, 2], bottom: [0, 1, 2] },
  // 7x4 with 4 slots on each long side, set off by one tile on the two sides.
  // Pitch 7 works at the equator, 8 away from it, so 8 is used.
  // https://dsp-wiki.com/Chemical_Plant, factory-44-plastic
  'chemical-plant': { w: 7, d: 4, pitch: 8, top: [2, 3, 4, 5], bottom: [1, 2, 3, 4] },
  'quantum-chemical-plant': { w: 7, d: 4, pitch: 8, top: [2, 3, 4, 5], bottom: [1, 2, 3, 4] },
  // 3x7 side by side (pitch 4), with the 3 slots of one short end facing the belts.
  // The long sides face the next refinery. factory-compact-build-oil-refinery
  'oil-refinery': { w: 3, d: 7, pitch: 4, top: [0, 1, 2], bottom: [] },
  // 5x9 side by side (pitch 5), fed from the 3 slots on the front end.
  // factory-antimatter-particle-collider-120-with-proliferation-for-speed
  'miniature-particle-collider': { w: 5, d: 9, pitch: 5, top: [1, 2, 3], bottom: [] },
  // 5x5, stacks touching (pitch 5). Only the bottom lab of a stack takes sorters.
  // https://dsp-wiki.com/Matrix_Lab, factory-7200-min-structure-matrix-lab-only
  'matrix-lab': { w: 5, d: 5, pitch: 5, top: [1, 2, 3], bottom: [1, 2, 3], stack: true },
  'df-self-evolution-lab': { w: 5, d: 5, pitch: 5, top: [1, 2, 3], bottom: [1, 2, 3], stack: true },
  // 3x3 with belt ports and no sorter slots: hydrogen goes in one side and
  // out the opposite side, deuterium leaves from a third side.
  // https://dsp-wiki.com/Fractionator, factory-0-spaced-fractionator-setup-36k-m-deuterium
  'fractionator': { w: 3, d: 3, pitch: 4, top: [], bottom: [], ports: true },
};

// Buildings that are not built in belt rows, and what to say instead.
export const PLACED_ALONE = {
  'mining-machine': 'Place these on the ore vein.',
  'advanced-mining-machine': 'Place these on the ore vein.',
  'water-pump': 'Place these along the shore of the water or acid.',
  'oil-extractor': 'Place one on each oil seep.',
  'orbital-collector': 'Build these around the equator of a gas giant.',
  'ray-receiver': 'Ray Receivers stand on their own, in sight of the Dyson swarm or sphere.',
  'ray-receiver-pro': 'Ray Receivers stand on their own, in sight of the Dyson swarm or sphere.',
  'ray-receiver-dark-fog': 'Ray Receivers stand on their own, in sight of the Dyson swarm or sphere.',
};

// Sorters reach belts 1 to 3 tiles from the building (1 means the belt
// touches it). Mk.I to Mk.III move base / distance items per second.
// https://dsp-wiki.com/Sorters
export const MAX_REACH = 3;
const SORTER_BASE = { 'sorter-1': 1.5, 'sorter-2': 3, 'sorter-3': 6 };
// The Pile Sorter does not follow base / distance. These are the measured
// rates with no stacking research. https://dsp-wiki.com/Pile_Sorter
const PILE_RATES = [13.3, 8, 5.7];
export const SORTERS = ['sorter-1', 'sorter-2', 'sorter-3', 'sorter-4'];
export const DEFAULT_SORTER = 'sorter-3';

export function sorterRate(tier, reach) {
  if (tier === 'sorter-4') return PILE_RATES[reach - 1];
  return SORTER_BASE[tier] / reach;
}

// Lab stacks: 3 high with no research, up to 15 with Vertical Construction.
// https://dsp-wiki.com/Vertical_Construction_(Upgrade)
export const LAB_STACK_BASE = 3;
export const LAB_STACK_MAX = 15;

// A Spray Coater sits on a straight belt and is about 3 tiles long. Coaters
// on side-by-side belts can sit next to each other. https://dsp-wiki.com/Spray_Coater
export const COATER_LENGTH = 3;

// A Tesla Tower powers buildings within 10 m (about 8 tiles) and links to
// other towers within 22 m (about 17 tiles). https://dsp-wiki.com/Tesla_Tower
// The game seems to measure to the building's edge, so 8 tiles from the
// building's center leaves room to spare.
export const TOWER_REACH = 8;
export const TOWER_LINK = 17;
