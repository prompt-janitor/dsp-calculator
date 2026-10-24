/* ---------- Shared constants and helpers ---------- */
import { DATA, ITEMS, formatNumber } from './engine.js';
import { state } from './store.js';

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
// Every piece of text that goes into HTML passes through here.
export const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ESCAPES[c]);

export function svg(id, size, cls = '') {
  const style = size ? ` style="width:${size}px;height:${size}px"` : '';
  return `<svg class="svgi${cls ? ' ' + cls : ''}"${style} aria-hidden="true"><use href="#${id}"/></svg>`;
}

export const CLASS_ORDER = {
  smelter: ['arc-smelter', 'plane-smelter', 'df-negentropy-smelter'],
  assembler: ['assembling-machine-1', 'assembling-machine-2', 'assembling-machine-3', 'df-recomposing-assembler'],
  chem: ['chemical-plant', 'quantum-chemical-plant'],
  lab: ['matrix-lab', 'df-self-evolution-lab'],
  miner: ['mining-machine', 'advanced-mining-machine']
};
export const CLASS_LABEL = { smelter: 'Smelter', assembler: 'Assembler', chem: 'Chemical plant', lab: 'Research lab', miner: 'Mining machine' };
export const CLASS_COLOR = { smelter: 'var(--c-smelter)', assembler: 'var(--c-assembler)', chem: 'var(--c-chem)', lab: 'var(--c-lab)', miner: 'var(--c-source)' };
export const TIER_LABEL = {
  'arc-smelter': 'Arc', 'plane-smelter': 'Plane', 'df-negentropy-smelter': 'Negentropy',
  'assembling-machine-1': 'Mk.I', 'assembling-machine-2': 'Mk.II', 'assembling-machine-3': 'Mk.III', 'df-recomposing-assembler': 'Re-composing',
  'chemical-plant': 'Chemical', 'quantum-chemical-plant': 'Quantum', 'matrix-lab': 'Matrix', 'df-self-evolution-lab': 'Self-evolution',
  'mining-machine': 'Standard', 'advanced-mining-machine': 'Advanced'
};
export const ROMAN = ['', 'I', 'II', 'III'];
export const PRESETS = [
  { id: 'matrices', name: 'All six matrices', items: [['electromagnetic-matrix', 60], ['energy-matrix', 60], ['structure-matrix', 60], ['information-matrix', 60], ['gravity-matrix', 60], ['universe-matrix', 60]] },
  { id: 'dyson', name: 'Dyson sphere parts', items: [['solar-sail', 120], ['frame-material', 30], ['dyson-sphere-component', 12], ['small-carrier-rocket', 6]] },
  { id: 'mall', name: 'Logistics mall', items: [['conveyor-belt-3', 30], ['sorter-3', 30], ['assembling-machine-3', 6], ['logistics-bot', 30]] },
  { id: 'warp', name: 'Space warpers', items: [['space-warper', 30]] },
  { id: 'white', name: 'Universe matrix', items: [['universe-matrix', 60]] }
];

// The sprite sheet is 1472 px square, with 64 px tiles.
const SPRITE = 1472, TILE = 64;

export function icon(key, size) {
  const spot = DATA.icons[key];
  const box = `width:${size}px;height:${size}px`;
  if (!spot) return `<span class="ic0" style="${box}"></span>`;
  const k = size / TILE;
  return `<span class="ic" style="${box};background-size:${SPRITE * k}px ${SPRITE * k}px;background-position:-${spot[0] * k}px -${spot[1] * k}px"></span>`;
}
export const itemIcon = (id, size) => icon(ITEMS[id] ? ITEMS[id].ic : id, size);
export const machineIcon = itemIcon;
export const itemName = (id) => (ITEMS[id] ? ITEMS[id].name : id);
export function itemColor(id) {
  const item = ITEMS[id];
  const spot = item && DATA.icons[item.ic];
  return spot ? spot[2] : '#7e93a6';
}
export const machineName = (id) => (DATA.machines[id] ? DATA.machines[id].name : id);
export function machineShortName(id) {
  return machineName(id)
    .replace('Assembling Machine', 'Assembler')
    .replace('Miniature Particle Collider', 'Particle Collider')
    .replace('Quantum Chemical Plant', 'Quantum Chem. Plant')
    .replace('Advanced Mining Machine', 'Adv. Mining Machine');
}

// Rates are items per second inside the solver. These turn them into the unit the user picked.
export const unitFactor = () => (state.unit === 'min' ? 60 : 1);
export const unitLabel = () => (state.unit === 'min' ? '/min' : '/s');
export const rateStr = (perSec) => formatNumber(perSec * unitFactor());
export const count = (n) => n.toLocaleString('en-US');

export function optionTag(value, label, current) {
  return `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`;
}

export const isWide = () => window.matchMedia('(min-width: 900px)').matches;
export function inFrame() {
  // Reading window.top throws in a cross-origin frame.
  try { return window.self !== window.top; } catch (e) { return true; }
}
export const isStandalone = () => !!(navigator.standalone || window.matchMedia('(display-mode: standalone)').matches);
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function buildCfg(choices) {
  const factor = choices.unit === 'min' ? 60 : 1;
  return {
    targets: choices.targets.map((t) => ({ item: t.item, rate: t.rate / factor })),
    machines: choices.machines, belt: choices.belt, stack: choices.stack, prolif: choices.prolif, mining: choices.mining, overrides: choices.overrides
  };
}
