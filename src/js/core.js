/* ---------- Shared constants and helpers ---------- */
import { DATA, ITEMS, fmt } from './engine.js';
import { state } from './store.js';

export function $(s, r) { return (r || document).querySelector(s); }
export function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
export function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
export function svg(id, s) { return '<svg class="svgi"' + (s ? ' style="width:' + s + 'px;height:' + s + 'px"' : '') + ' aria-hidden="true"><use href="#' + id + '"/></svg>'; }

export const CLASS_ORDER = { smelter: ['arc-smelter', 'plane-smelter', 'df-negentropy-smelter'],
  assembler: ['assembling-machine-1', 'assembling-machine-2', 'assembling-machine-3', 'df-recomposing-assembler'],
  chem: ['chemical-plant', 'quantum-chemical-plant'], lab: ['matrix-lab', 'df-self-evolution-lab'],
  miner: ['mining-machine', 'advanced-mining-machine'] };
export const CLASS_LABEL = { smelter: 'Smelter', assembler: 'Assembler', chem: 'Chemical plant', lab: 'Research lab', miner: 'Mining machine' };
export const CLASS_COLOR = { smelter: 'var(--c-smelter)', assembler: 'var(--c-assembler)', chem: 'var(--c-chem)', lab: 'var(--c-lab)', miner: 'var(--c-source)' };
export const TIER_LABEL = { 'arc-smelter': 'Arc', 'plane-smelter': 'Plane', 'df-negentropy-smelter': 'Negentropy',
  'assembling-machine-1': 'Mk.I', 'assembling-machine-2': 'Mk.II', 'assembling-machine-3': 'Mk.III', 'df-recomposing-assembler': 'Re-composing',
  'chemical-plant': 'Chemical', 'quantum-chemical-plant': 'Quantum', 'matrix-lab': 'Matrix', 'df-self-evolution-lab': 'Self-evolution',
  'mining-machine': 'Standard', 'advanced-mining-machine': 'Advanced' };
export const ROMAN = ['', 'I', 'II', 'III'];
export const PRESETS = [
  { id: 'matrices', name: 'All six matrices', items: [['electromagnetic-matrix', 60], ['energy-matrix', 60], ['structure-matrix', 60], ['information-matrix', 60], ['gravity-matrix', 60], ['universe-matrix', 60]] },
  { id: 'dyson', name: 'Dyson sphere parts', items: [['solar-sail', 120], ['frame-material', 30], ['dyson-sphere-component', 12], ['small-carrier-rocket', 6]] },
  { id: 'mall', name: 'Logistics mall', items: [['conveyor-belt-3', 30], ['sorter-3', 30], ['assembling-machine-3', 6], ['logistics-bot', 30]] },
  { id: 'warp', name: 'Space warpers', items: [['space-warper', 30]] },
  { id: 'white', name: 'Universe matrix', items: [['universe-matrix', 60]] }
];

/* ---------- helpers ---------- */
export function ic(key, s) {
  var p = DATA.icons[key];
  if (!p) return '<span class="ic0" style="width:' + s + 'px;height:' + s + 'px"></span>';
  var k = s / 64;
  return '<span class="ic" style="width:' + s + 'px;height:' + s + 'px;background-size:' + (1472 * k) + 'px ' + (1472 * k) + 'px;background-position:-' + (p[0] * k) + 'px -' + (p[1] * k) + 'px"></span>';
}
export function itemIc(id, s) { var it = ITEMS[id]; return ic(it ? it.ic : id, s); }
export function machIc(id, s) { return ic(ITEMS[id] ? ITEMS[id].ic : id, s); }
export function itemName(id) { return ITEMS[id] ? ITEMS[id].name : id; }
export function itemColor(id) { var it = ITEMS[id]; var p = it && DATA.icons[it.ic]; return p ? p[2] : '#7e93a6'; }
export function machName(id) { return DATA.machines[id] ? DATA.machines[id].name : id; }
export function machShort(id) { return machName(id).replace('Assembling Machine', 'Assembler').replace('Miniature Particle Collider', 'Particle Collider').replace('Quantum Chemical Plant', 'Quantum Chem. Plant').replace('Advanced Mining Machine', 'Adv. Mining Machine'); }
export function uf() { return state.unit === 'min' ? 60 : 1; }
export function ul() { return state.unit === 'min' ? '/min' : '/s'; }
export function rateStr(perSec) { return fmt(perSec * uf()); }
export function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>'; }
export function isWide() { return window.matchMedia('(min-width: 900px)').matches; }
export function inFrame() {
  // Reading window.top throws in a cross-origin frame.
  try { return window.self !== window.top; } catch (e) { return true; }
}
export function isStandalone() { return !!(navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)); }
export function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }

export function buildCfg(s) {
  var f = s.unit === 'min' ? 60 : 1;
  return { targets: s.targets.map(function (t) { return { item: t.item, rate: t.rate / f }; }),
    machines: s.machines, belt: s.belt, stack: s.stack, prolif: s.prolif, mining: s.mining, overrides: s.overrides };
}
