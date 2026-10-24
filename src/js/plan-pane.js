// The Plan pane: targets, presets and totals.
import { formatNumber, formatPower } from './engine.js';
import { $, esc, svg, itemIcon, machineIcon, itemName, machineName, rateStr, unitLabel, count, PRESETS } from './core.js';
import { state, ui, update } from './store.js';
import { openPicker } from './picker.js';
import { toast } from './toast.js';

// How much one tap on + or - changes a rate. Bigger rates get bigger steps.
function stepFor(rate, dir) {
  if (state.unit === 's') return rate < 1 ? 0.1 : rate < 10 ? 0.5 : 5;
  if (dir < 0 && rate <= 30 && rate > 5) return 5;
  return rate < 30 ? 5 : rate < 300 ? 10 : 60;
}

// The next multiple of the step up or down. The small margin keeps a rate
// that is already on a step from being treated as just below it.
function nextRate(rate, dir) {
  const step = stepFor(rate, dir);
  const next = dir > 0 ? Math.floor(rate / step + 1e-9) * step + step : Math.ceil(rate / step - 1e-9) * step - step;
  return Math.max(0, +next.toPrecision(6));
}

const unitSwitch = () => `
  <span class="seg" role="group" aria-label="Rate unit">
    <button type="button" data-unit="min" aria-pressed="${state.unit === 'min'}">per min</button>
    <button type="button" data-unit="s" aria-pressed="${state.unit === 's'}">per sec</button>
  </span>`;

function targetHTML(target, i) {
  const name = esc(itemName(target.item));
  return `
    <div class="target">
      <button class="pick" type="button" data-pick="${i}" aria-label="Change item, now ${name}">${itemIcon(target.item, 40)}</button>
      <div class="nm"><span>${name}</span>
        <button class="del" type="button" data-del="${i}" aria-label="Remove ${name}">${svg('i-x', 18)}</button></div>
      <div class="stepper">
        <button type="button" data-tstep="${i}" data-dir="-1" aria-label="Less">−</button>
        <input type="text" inputmode="decimal" enterkeyhint="done" value="${target.rate}"
          data-rate="${i}" id="rate${i}" aria-label="Rate for ${name}">
        <button type="button" data-tstep="${i}" data-dir="1" aria-label="More">+</button>
        <span class="u">${unitLabel()}</span>
      </div>
    </div>`;
}

const NO_TARGETS = `
  <div class="row noic"><span class="main-t"><span class="t">No targets yet</span>
    <span class="s">Add the item you want a factory for.</span></span></div>`;

const presetChip = (preset) => `
  <button class="chip" type="button" data-preset="${preset.id}">
    <span class="stack">${preset.items.slice(0, 3).map(([item]) => itemIcon(item, 26)).join('')}</span>
    <span>${esc(preset.name)}</span>
  </button>`;

export function renderPlan() {
  $('#planBody').innerHTML = `
    <div class="stats" id="planStats"></div>
    <div class="gtitle">Targets<span class="push"></span>${unitSwitch()}</div>
    <div class="group">${state.targets.length ? state.targets.map(targetHTML).join('') : NO_TARGETS}</div>
    <div class="pad-row"><button class="btn primary block" type="button" id="addTarget">${svg('i-plus', 20)}Add item</button></div>
    <div class="gtitle">Quick start</div>
    <div class="chips">${PRESETS.map(presetChip).join('')}</div>
    <div class="glance" id="glance"></div>`;
}

const stat = (value, label, cls = '') => `<div class="stat${cls}"><b>${value}</b><span>${label}</span></div>`;
const sum = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);

function statsHTML(totals) {
  const sprayed = sum(totals.proliferator);
  return stat(count(sum(totals.built)), 'Buildings') +
    stat(formatPower(totals.power), 'Power') +
    stat(count(totals.belts), 'Belt lines') +
    (sprayed > 0 ? stat(rateStr(sprayed), 'Proliferator ' + unitLabel()) : stat(Object.keys(totals.raw).length, 'Raw resources')) +
    (ui.plan.ok ? '' : stat('Loop', 'Recipes feed each other without surplus', ' warn wide'));
}

// The biggest builds. CSS shows this list on phones only.
function glanceHTML(totals) {
  const top = Object.keys(totals.built).sort((a, b) => totals.built[b] - totals.built[a]).slice(0, 5);
  if (!top.length) return '';
  const rows = top.map((m) => `
    <button class="row" type="button" data-goto="build">
      <span class="ibox">${machineIcon(m, 30)}</span>
      <span class="main-t"><span class="t">${esc(machineName(m))}</span><span class="s">${formatNumber(totals.machineCount[m])} exact</span></span>
      <span class="end"><b>${totals.built[m]}</b></span>
    </button>`).join('');
  return `
    <div class="gtitle">Biggest builds<button class="act" type="button" data-goto="build">See all</button></div>
    <div class="group">${rows}</div>
    <div class="pad-row"><button class="btn block" type="button" data-goto="map">${svg('i-map', 20)}Open flow map</button></div>`;
}

// Parts of the plan pane that change with every solve.
export function renderPlanTotals() {
  const totals = ui.plan.totals;
  const brief = `${count(sum(totals.built))} buildings · ${formatPower(totals.power)}`;
  $('#planStats').innerHTML = statsHTML(totals);
  $('#glance').innerHTML = glanceHTML(totals);
  $('#miniStats').textContent = `${brief} · ${totals.belts} belt lines`;
  $('#mapSub').textContent = brief;
  $('#buildSub').textContent = brief;
}

function switchUnit(unit) {
  if (unit === state.unit) return;
  const factor = unit === 'min' ? 60 : 1 / 60;
  update((draft) => {
    for (const t of draft.targets) t.rate = +(t.rate * factor).toPrecision(6);
    draft.unit = unit;
  }, 'plan', 'solve');
}

function stepRate(i, dir) {
  const rate = nextRate(state.targets[i].rate, dir);
  update((draft) => { draft.targets[i].rate = rate; }, 'solveSoon');
  $('#rate' + i).value = rate;
}

function loadPreset(id) {
  const preset = PRESETS.find((p) => p.id === id);
  ui.sel = null;
  update((draft) => {
    draft.targets = preset.items.map(([item, perMin]) => ({ item, rate: draft.unit === 'min' ? perMin : +(perMin / 60).toPrecision(6) }));
  }, 'plan', 'refit', 'solve');
  toast('Loaded ' + preset.name.toLowerCase());
}

// Opens the item picker and adds the chosen item as a new target.
export function addTarget(focusSearch = false) {
  const add = (item) => update((draft) => { draft.targets.push({ item, rate: draft.unit === 'min' ? 60 : 1 }); }, 'plan', 'solve');
  openPicker(add, focusSearch);
}

function onClick(e) {
  const button = e.target.closest('button');
  if (!button) return;
  const { unit, del, pick, tstep, dir, preset } = button.dataset;
  if (unit) switchUnit(unit);
  else if (del) update((draft) => { draft.targets.splice(+del, 1); }, 'plan', 'solve');
  else if (pick) openPicker((item) => update((draft) => { draft.targets[+pick].item = item; }, 'plan', 'solve'));
  else if (tstep) stepRate(+tstep, +dir);
  else if (preset) loadPreset(preset);
  else if (button.id === 'addTarget') addTarget();
}

// Typing a rate solves after a short pause and leaves the field as typed.
function onInput(e) {
  const input = e.target;
  if (!input.dataset.rate) return;
  const rate = parseFloat(input.value.replace(',', '.'));
  update((draft) => { draft.targets[+input.dataset.rate].rate = isFinite(rate) && rate > 0 ? rate : 0; }, 'solveSoon');
}

export function wirePlan() {
  const body = $('#planBody');
  body.addEventListener('click', onClick);
  body.addEventListener('input', onInput);
  body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });
}
