/* ---------- App: mobile-first UI ---------- */
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function svg(id, s) { return '<svg class="svgi"' + (s ? ' style="width:' + s + 'px;height:' + s + 'px"' : '') + ' aria-hidden="true"><use href="#' + id + '"/></svg>'; }

var STORE_KEY = 'dsp-calculator-v1';
var CLASS_ORDER = { smelter: ['arc-smelter', 'plane-smelter', 'df-negentropy-smelter'],
  assembler: ['assembling-machine-1', 'assembling-machine-2', 'assembling-machine-3', 'df-recomposing-assembler'],
  chem: ['chemical-plant', 'quantum-chemical-plant'], lab: ['matrix-lab', 'df-self-evolution-lab'],
  miner: ['mining-machine', 'advanced-mining-machine'] };
var CLASS_LABEL = { smelter: 'Smelter', assembler: 'Assembler', chem: 'Chemical plant', lab: 'Research lab', miner: 'Mining machine' };
var CLASS_COLOR = { smelter: 'var(--c-smelter)', assembler: 'var(--c-assembler)', chem: 'var(--c-chem)', lab: 'var(--c-lab)', miner: 'var(--c-source)' };
var TIER_LABEL = { 'arc-smelter': 'Arc', 'plane-smelter': 'Plane', 'df-negentropy-smelter': 'Negentropy',
  'assembling-machine-1': 'Mk.I', 'assembling-machine-2': 'Mk.II', 'assembling-machine-3': 'Mk.III', 'df-recomposing-assembler': 'Re-composing',
  'chemical-plant': 'Chemical', 'quantum-chemical-plant': 'Quantum', 'matrix-lab': 'Matrix', 'df-self-evolution-lab': 'Self-evolution',
  'mining-machine': 'Standard', 'advanced-mining-machine': 'Advanced' };
var ROMAN = ['', 'I', 'II', 'III'];
var PRESETS = [
  { id: 'matrices', name: 'All six matrices', items: [['electromagnetic-matrix', 60], ['energy-matrix', 60], ['structure-matrix', 60], ['information-matrix', 60], ['gravity-matrix', 60], ['universe-matrix', 60]] },
  { id: 'dyson', name: 'Dyson sphere parts', items: [['solar-sail', 120], ['frame-material', 30], ['dyson-sphere-component', 12], ['small-carrier-rocket', 6]] },
  { id: 'mall', name: 'Logistics mall', items: [['conveyor-belt-3', 30], ['sorter-3', 30], ['assembling-machine-3', 6], ['logistics-bot', 30]] },
  { id: 'warp', name: 'Space warpers', items: [['space-warper', 30]] },
  { id: 'white', name: 'Universe matrix', items: [['universe-matrix', 60]] }
];

function defaultState() {
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
var S, PLAN = null, SEL = null, LAYOUT = null, VIEW = { x: 20, y: 20, k: 1 }, LAST_SIG = '';

function loadState() {
  var d = defaultState();
  try { var raw = localStorage.getItem(STORE_KEY); if (raw) return mergeState(d, JSON.parse(raw)); } catch (e) { }
  return d;
}
function mergeState(d, s) {
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
function saveState() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { } }

/* ---------- helpers ---------- */
function ic(key, s) {
  var p = DATA.icons[key];
  if (!p) return '<span class="ic0" style="width:' + s + 'px;height:' + s + 'px"></span>';
  var k = s / 64;
  return '<span class="ic" style="width:' + s + 'px;height:' + s + 'px;background-size:' + (1472 * k) + 'px ' + (1472 * k) + 'px;background-position:-' + (p[0] * k) + 'px -' + (p[1] * k) + 'px"></span>';
}
function itemIc(id, s) { var it = ITEMS[id]; return ic(it ? it.ic : id, s); }
function machIc(id, s) { return ic(ITEMS[id] ? ITEMS[id].ic : id, s); }
function itemName(id) { return ITEMS[id] ? ITEMS[id].name : id; }
function itemColor(id) { var it = ITEMS[id]; var p = it && DATA.icons[it.ic]; return p ? p[2] : '#7e93a6'; }
function machName(id) { return DATA.machines[id] ? DATA.machines[id].name : id; }
function machShort(id) { return machName(id).replace('Assembling Machine', 'Assembler').replace('Miniature Particle Collider', 'Particle Collider').replace('Quantum Chemical Plant', 'Quantum Chem. Plant').replace('Advanced Mining Machine', 'Adv. Mining Machine'); }
function uf() { return S.unit === 'min' ? 60 : 1; }
function ul() { return S.unit === 'min' ? '/min' : '/s'; }
function rateStr(perSec) { return fmt(perSec * uf()); }
function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>'; }
function isWide() { return window.matchMedia('(min-width: 900px)').matches; }
function inFrame() { try { return window.self !== window.top; } catch (e) { return true; } }
function isStandalone() { return !!(navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)); }
function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }

function buildCfg() {
  return { targets: S.targets.map(function (t) { return { item: t.item, rate: t.rate / uf() }; }),
    machines: S.machines, belt: S.belt, stack: S.stack, prolif: S.prolif, mining: S.mining, overrides: S.overrides };
}
