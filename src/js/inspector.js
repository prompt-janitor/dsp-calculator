// Step details: the numbers for one step, and changes to it.
import { RECIPES, RECIPES_FOR, EXCLUDED, defaultRecipeFor, formatNumber, formatPower } from './engine.js';
import { $, esc, svg, itemIcon, itemName, machineName, rateStr, unitLabel, optionTag, isWide, ROMAN } from './core.js';
import { state, ui, update } from './store.js';
import { NODE_WIDTH, applyView, applySelection, visibleArea } from './map-view.js';
import { openSheet, closeSheet, focusKey, refocus } from './sheets.js';

export function closeInspector(instant) {
  if (ui.sel) { ui.sel = null; applySelection(); }
  closeSheet('inspector', instant);
}

export function selectNode(id) {
  const nodes = ui.plan && ui.plan.nodes;
  if (!nodes || !nodes[id]) return;
  // A target box opens the step that makes the target.
  if (nodes[id].kind === 'target') id = nodes[id].item;
  if (!nodes[id]) return;
  ui.sel = id;
  applySelection();
  renderInspector();
}

// Moves the map so the node is in the middle of the part the step details
// do not cover. zoomIn: also zoom in far enough to read the node.
export function centerNode(id, zoomIn = true) {
  const box = ui.layout && ui.layout.nodes.find((n) => n.id === id);
  if (!box) return;
  const area = visibleArea();
  const k = zoomIn ? Math.max(ui.view.k, isWide() ? 0.75 : 0.9) : ui.view.k;
  ui.view.k = k;
  ui.view.x = area.left + area.width / 2 - (box.x + NODE_WIDTH / 2) * k;
  ui.view.y = area.top + area.height / 2 - (box.y + box.height / 2) * k;
  const stage = $('#stage');
  stage.classList.add('anim');
  applyView();
  setTimeout(() => stage.classList.remove('anim'), 340);
}

const rateRow = (item, rate, tag = 'div', attrs = '') => `
  <${tag} class="row"${tag === 'button' ? ' type="button"' : ''}${attrs}>
    <span class="ibox">${itemIcon(item, 28)}</span>
    <span class="main-t"><span class="t">${esc(itemName(item))}</span></span>
    <span class="end"><b class="small">${rateStr(rate)}</b><small>${unitLabel()}</small></span>
  </${tag}>`;

const group = (title, rows) => (rows ? `<div class="gtitle">${title}</div><div class="group">${rows}</div>` : '');

function headHTML(node, item) {
  const sub = node.kind === 'raw' ? 'Supplied from elsewhere' : `${esc(node.recipe.name)} · ${esc(machineName(node.machine))}`;
  return `
    <span class="ibox">${itemIcon(item, 34)}</span>
    <h3>${esc(itemName(item))}<small>${sub}</small></h3>
    <button class="btn round small" type="button" id="inspClose" aria-label="Close">${svg('i-x', 18)}</button>`;
}

const machineOptions = (node) => node.recipe.prod.map((m) => optionTag(m, machineName(m), node.machine)).join('');

function recipeOptions(item, current) {
  return (RECIPES_FOR[item] || []).map((id) => {
    const recipe = RECIPES[id];
    const outputs = Object.keys(recipe.out);
    const makes = outputs.length > 1 ? ' → ' + outputs.map(itemName).join(' + ') : '';
    return optionTag(id, recipe.name + makes + (EXCLUDED[id] ? ' (advanced)' : ''), current);
  }).join('');
}

function proliferatorOptions(override) {
  const current = override.prolif ? `${override.prolif.level}:${override.prolif.mode}` : 'global';
  let html = optionTag('global', 'Same as settings', current) + optionTag('0:products', 'Off', current);
  for (const level of [1, 2, 3]) {
    html += optionTag(`${level}:products`, `Mk.${ROMAN[level]} extra products`, current);
    html += optionTag(`${level}:speed`, `Mk.${ROMAN[level]} speed up`, current);
  }
  return html;
}

function changeStepHTML(node, item, override) {
  return `
    <div class="gtitle">Change this step</div>
    <div class="group">
      <label class="selrow"><span>Recipe</span><select id="i_rec">${recipeOptions(item, node.recipe.id)}</select></label>
      <label class="selrow"><span>Building</span><select id="i_mach">${machineOptions(node)}</select></label>
      <label class="selrow"><span>Proliferator</span><select id="i_pro">${proliferatorOptions(override)}</select></label>
      <label class="togrow"><span>Supplied from elsewhere<small class="hint">Stop building its ingredients</small></span>
        <input class="switch" type="checkbox" id="i_ext"${override.external ? ' checked' : ''}></label>
    </div>`;
}

// The solver counts only the hydrogen used up. In game each fractionator also needs a full belt passing through it.
function fractionatorNote(node) {
  const used = `${rateStr(node.inRate.hydrogen || 0)}${unitLabel()}`;
  return `<p class="hintp">Each fractionator needs a full belt of hydrogen moving through it.
    Chain them on a loop belt and feed in ${used} of new hydrogen. The rest goes round again.</p>`;
}

function craftBodyHTML(node, item, override) {
  const busy = node.built ? Math.round(node.machineCount / node.built * 100) : 0;
  const inputs = Object.keys(node.inRate).map((i) => rateRow(i, node.inRate[i], 'button', ` data-jump="${esc(i)}"`)).join('');
  const extras = Object.keys(node.outRate).filter((o) => o !== item).map((o) => rateRow(o, node.outRate[o])).join('');
  const noExtra = state.prolif.level && !node.spray && !node.recipe.prolif && state.prolif.mode === 'products';
  return `
    <div class="kpis">
      <div class="kpi"><b>${node.built}</b><span>to build</span></div>
      <div class="kpi"><b>${rateStr(node.outRate[item])}</b><span>${unitLabel()} out</span></div>
      <div class="kpi"><b>${busy}%</b><span>busy</span></div>
    </div>
    <p class="hintp">${formatNumber(node.machineCount)} machines exactly${node.power ? ' · ' + formatPower(node.power) : ''}</p>
    ${node.machine === 'fractionator' ? fractionatorNote(node) : ''}
    ${group('Consumes', inputs)}
    ${group('Also produces', extras)}
    ${changeStepHTML(node, item, override)}
    ${noExtra ? '<p class="hintp">This recipe does not accept extra products.</p>' : ''}`;
}

function rawBodyHTML(node) {
  return `
    <div class="kpis"><div class="kpi"><b>${rateStr(node.rate)}</b><span>${unitLabel()} needed</span></div></div>
    <div class="gtitle">Change this step</div>
    <div class="group"><label class="togrow"><span>Supplied from elsewhere</span>
      <input class="switch" type="checkbox" id="i_ext" checked></label></div>`;
}

export function renderInspector() {
  const item = ui.sel;
  const node = item && ui.plan && ui.plan.nodes[item];
  if (!node || node.kind === 'target') { closeSheet('inspector'); return; }
  const override = state.overrides[item] || {};
  const sheet = $('#inspector');
  const active = sheet.contains(document.activeElement) ? document.activeElement : null;
  const key = focusKey(active);
  $('#inspHead').innerHTML = headHTML(node, item);
  const reset = state.overrides[item]
    ? '<div class="sh-actions"><button class="btn" type="button" id="i_reset">Undo changes to this step</button></div>'
    : '';
  $('#inspBody').innerHTML = (node.kind === 'raw' ? rawBodyHTML(node) : craftBodyHTML(node, item, override)) + reset;
  if (active) refocus(null, key);
  openSheet('inspector', { focus: $('#inspClose') });
}

function setOverride(draft, item, key, value) {
  const override = draft.overrides[item] || (draft.overrides[item] = {});
  if (value === undefined || value === null || value === false) delete override[key];
  else override[key] = value;
  if (!Object.keys(override).length) delete draft.overrides[item];
}

function changeStep(draft, item, input) {
  if (input.id === 'i_rec') {
    setOverride(draft, item, 'recipe', input.value === defaultRecipeFor(item) ? null : input.value);
    setOverride(draft, item, 'machine', null);
  } else if (input.id === 'i_mach') {
    setOverride(draft, item, 'machine', input.value);
  } else if (input.id === 'i_pro') {
    const [level, mode] = input.value.split(':');
    setOverride(draft, item, 'prolif', input.value === 'global' ? null : { level: +level, mode });
  } else if (input.id === 'i_ext') {
    setOverride(draft, item, 'external', input.checked);
  }
}

export function wireInspector() {
  const sheet = $('#inspector');
  sheet.addEventListener('change', (e) => {
    const item = ui.sel;
    if (item) update((draft) => changeStep(draft, item, e.target), 'refit', 'solve');
  });
  sheet.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    if (button.id === 'inspClose') closeInspector();
    else if (button.id === 'i_reset') {
      const item = ui.sel;
      update((draft) => { delete draft.overrides[item]; }, 'refit', 'solve');
    } else if (button.dataset.jump && ui.plan.nodes[button.dataset.jump]) {
      selectNode(button.dataset.jump);
      centerNode(button.dataset.jump);
    }
  });
}
