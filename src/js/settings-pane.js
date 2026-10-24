// The Settings pane.
import { BELTS, DATA } from './engine.js';
import {
  $, esc, svg, itemIcon, machineIcon, machineName, count, inFrame, isStandalone, isIOS, CLASS_ORDER, CLASS_LABEL, TIER_LABEL, ROMAN,
} from './core.js';
import { state, ui, update, defaultState, replaceState, renderAll, clampMining } from './store.js';
import { install } from './pwa.js';
import { toast } from './toast.js';

// Number fields: the mining setting each one changes and the step for + and -.
// The limits are in store.js, which also checks plan codes.
const NUMBERS = {
  mspeed: { key: 'speed', step: 10 },
  mveins: { key: 'veins', step: 1 },
  moil: { key: 'oil', step: 0.1 },
  morb: { key: 'orbital', step: 5 }
};
const clamp = (id, value) => clampMining(NUMBERS[id].key, value);
const sub = (text) => (text ? `<small>${esc(text)}</small>` : '');
const chevron = () => svg('i-chev', 18, 'chev');

// One choice in a row of tiers. attrs holds the data attributes that say what it sets.
function tierButton(attrs, pressed, iconHTML, label, note) {
  return `<button type="button" class="topt" ${attrs} aria-pressed="${pressed}">${iconHTML}<span>${esc(label)}</span>${sub(note)}</button>`;
}

const tierRow = (label, buttons, n) => `
  <div class="tier"><div class="lab">${label}</div>
    <div class="tiers" style="--n:${n}" role="group" aria-label="${esc(label)}">${buttons.join('')}</div></div>`;

const segment = (label, buttons) => `<div class="seg" role="group" aria-label="${esc(label)}">${buttons}</div>`;
const segButton = (attr, value, label, pressed) => `<button type="button" ${attr}="${value}" aria-pressed="${pressed}">${label}</button>`;

function numberRow(id, label, note) {
  return `
    <div class="numrow"><label for="${id}">${esc(label)}${sub(note)}</label>
      <div class="stepper">
        <button type="button" data-nstep="${id}" data-dir="-1" aria-label="Decrease ${esc(label.toLowerCase())}">−</button>
        <input type="text" inputmode="decimal" id="${id}" value="${esc(state.mining[NUMBERS[id].key])}">
        <button type="button" data-nstep="${id}" data-dir="1" aria-label="Increase ${esc(label.toLowerCase())}">+</button>
      </div></div>`;
}

function installHTML() {
  if (isStandalone() || inFrame()) return '';
  if (isIOS()) {
    return `<div class="install">${svg('i-home')}<div><b>Add to your Home Screen</b>In Safari, tap ${svg('i-share', 16)} Share,
      then <b class="inline">Add to Home Screen</b>. On iPhone, tap the ••• button first if you do not see Share.
      The app then opens full screen and works offline.</div></div>`;
  }
  if (!ui.installPrompt) return '';
  return `<div class="install">${svg('i-home')}<div class="grow"><b>Install this app</b>It opens in its own window and works offline.</div>
    <button class="btn primary" type="button" id="btnInstall">Install</button></div>`;
}

function buildingsHTML() {
  const rows = Object.keys(CLASS_ORDER).map((cls) => {
    const tiers = CLASS_ORDER[cls].filter((id) => DATA.machines[id]);
    const buttons = tiers.map((id) => {
      const speed = DATA.machines[id].speed;
      return tierButton(`data-mtier="${cls}" data-val="${id}"`, state.machines[cls] === id, machineIcon(id, 30),
        TIER_LABEL[id] || machineName(id), cls === 'miner' ? `${speed}×` : `${speed}× speed`);
    });
    return tierRow(CLASS_LABEL[cls], buttons, CLASS_ORDER[cls].length);
  }).join('');
  return `
    <div class="gtitle">Production buildings</div><div class="group">${rows}</div>
    <p class="gnote">Refineries, colliders and fractionators have only one tier. To change a single step, open it on the map.</p>`;
}

function beltsHTML() {
  const belts = Object.keys(BELTS).map((id) =>
    tierButton(`data-belt="${id}"`, state.belt === id, itemIcon(id, 30), 'Mk.' + ROMAN[+id.slice(-1)], BELTS[id] + '/s'));
  const stacks = [1, 2, 3, 4].map((n) => segButton('data-stack', n, n + '×', state.stack === n)).join('');
  const perBelt = BELTS[state.belt] * state.stack;
  return `
    <div class="gtitle">Belts</div><div class="group">
      ${tierRow('Belt tier', belts, 3)}
      <div class="numrow"><span class="label">Stack size<small>Needs cargo stacking research</small></span>${segment('Stack size', stacks)}</div>
    </div>
    <p class="gnote">One belt carries ${perBelt} items/s (${count(perBelt * 60)}/min).</p>`;
}

function proliferatorHTML() {
  const off = `<span class="ic0 icon-off">${svg('i-x', 18)}</span>`;
  const isLevel = (l) => String(state.prolif.level) === String(l);
  const levels = [tierButton('data-plevel="0"', isLevel(0), off, 'Off'),
    ...[1, 2, 3].map((l) => tierButton(`data-plevel="${l}"`, isLevel(l), itemIcon('proliferator-' + l, 30), 'Mk.' + ROMAN[l]))];
  const modes = segButton('data-pmode', 'products', 'Extra products', state.prolif.mode === 'products') +
    segButton('data-pmode', 'speed', 'Speed up', state.prolif.mode === 'speed');
  return `
    <div class="gtitle">Proliferator</div><div class="group">
      ${tierRow('Spray on every machine that accepts it', levels, 4)}
      <div class="numrow"><span class="label">Effect</span>${segment('Effect', modes)}</div>
    </div>
    <p class="gnote">The plan adds the proliferator you need to spray. Extra products only works on recipes that allow it.</p>`;
}

const resourcesHTML = () => `
  <div class="gtitle">Resources</div><div class="group">
    ${numberRow('mspeed', 'Mining speed', 'Research level, %')}
    ${numberRow('mveins', 'Veins per miner', '0.5 ore/s per vein')}
    ${numberRow('moil', 'Oil per extractor', 'Per second, from the seep')}
    ${numberRow('morb', 'Collector net yield', '% left after self-power')}
  </div>
  <p class="gnote">About 55% of the gross hydrogen is left on a standard gas giant.</p>`;

function displayHTML() {
  const themes = [['auto', 'Auto'], ['dark', 'Dark'], ['light', 'Light']]
    .map(([id, label]) => segButton('data-theme-set', id, label, state.opts.theme === id)).join('');
  return `
    <div class="gtitle">Display</div><div class="group">
      <div class="numrow"><span class="label">Appearance</span>${segment('Appearance', themes)}</div>
    </div>`;
}

const linkRow = (act, title, note) => `
  <button class="row noic" type="button" data-act="${act}">
    <span class="main-t"><span class="t">${title}</span><span class="s">${note}</span></span>${chevron()}
  </button>`;

const shareHTML = () => `
  <div class="gtitle">Share and backup</div><div class="group">
    ${linkRow('share', 'Copy summary', 'Buildings, raw input and every step as text')}
    ${linkRow('code', 'Plan code', 'Back up a plan or load one from a friend')}
    <button class="row noic" type="button" id="btnReset">
      <span class="main-t"><span class="t bad">Reset everything</span><span class="s">Targets, settings and per-step changes</span></span>
    </button>
  </div>`;

const licenseRow = (file, title, license) => `
  <a class="row noic" href="licenses/${file}" target="_blank" rel="noopener">
    <span class="main-t"><span class="t">${title}</span><span class="s">${license}</span></span>${chevron()}
  </a>`;

const ABOUT = `
  <div class="gtitle">About the data</div>
  <p class="gnote flush">Recipes, machine speeds and proliferator values come from the FactorioLab data
  for Dyson Sphere Program (October 2026). It includes game update 0.10.34, with the Holo Beacon.
  Power leaves out miners and orbital collectors. Deuterium fractionation assumes a 1% chance per hydrogen
  and one machine per full belt.</p>
  <div class="gtitle">About this app</div>
  <p class="gnote flush">This is an unofficial fan project. It is not affiliated with Youthcat Studio or Gamera Games.
  Item icons are game art from Dyson Sphere Program by Youthcat Studio, taken from FactorioLab.
  The app collects no data. Your plans stay on this device.</p>
  <p class="gnote">This app was made with AI and may contain errors. It is provided as is, without warranty or liability.</p>
  <div class="gtitle">Licenses</div><div class="group">
    ${licenseRow('LICENSE.txt', 'App code', 'MIT')}
    ${licenseRow('FactorioLab-LICENSE.txt', 'Recipe data from FactorioLab', 'MIT')}
    ${licenseRow('OFL-ChakraPetch.txt', 'Chakra Petch font', 'SIL Open Font License 1.1')}
  </div>`;

export function renderSettings() {
  $('#setBody').innerHTML = installHTML() + buildingsHTML() + beltsHTML() + proliferatorHTML() +
    resourcesHTML() + displayHTML() + shareHTML() + ABOUT;
}

function stepNumber(id, dir) {
  const { key, step } = NUMBERS[id];
  const value = clamp(id, +(state.mining[key] + step * dir).toPrecision(6));
  update((draft) => { draft.mining[key] = value; }, 'solveSoon');
  $('#' + id).value = value;
}

// The first tap asks to confirm. The button resets when the pane is drawn again.
function reset(button) {
  if (button.dataset.armed !== '1') {
    button.dataset.armed = '1';
    $('.t', button).textContent = 'Tap again to reset everything';
    return;
  }
  const next = defaultState();
  next.opts.theme = state.opts.theme;
  replaceState(next);
  renderAll();
  toast('Plan reset.');
}

function onClick(e) {
  const button = e.target.closest('button');
  if (!button) return;
  const { mtier, val, belt, stack, plevel, pmode, themeSet, nstep, dir } = button.dataset;
  const set = (change) => update(change, 'settings', 'solve');
  if (mtier) set((draft) => { draft.machines[mtier] = val; });
  else if (belt) set((draft) => { draft.belt = belt; });
  else if (stack) set((draft) => { draft.stack = +stack; });
  else if (plevel !== undefined) set((draft) => { draft.prolif.level = +plevel; });
  else if (pmode) set((draft) => { draft.prolif.mode = pmode; });
  else if (themeSet) update((draft) => { draft.opts.theme = themeSet; }, 'theme', 'settings');
  else if (nstep) stepNumber(nstep, +dir);
  else if (button.id === 'btnInstall') install();
  else if (button.id === 'btnReset') reset(button);
}

export function wireSettings() {
  const body = $('#setBody');
  body.addEventListener('click', onClick);
  body.addEventListener('input', (e) => {
    const field = NUMBERS[e.target.id];
    const value = parseFloat(e.target.value.replace(',', '.'));
    if (field && isFinite(value)) update((draft) => { draft.mining[field.key] = clamp(e.target.id, value); }, 'solveSoon');
  });
  // When the field loses focus, show the value that is in use.
  body.addEventListener('change', (e) => {
    const field = NUMBERS[e.target.id];
    if (field) e.target.value = state.mining[field.key];
  });
}
