/* ---------- Build list: buildings, steps and resources ---------- */
import { BELTS, fmt, fmtPower } from './engine.js';
import { $, esc, svg, itemIcon, machineIcon, itemName, machineName, machineShortName, rateStr, unitLabel, count, ROMAN } from './core.js';
import { state, ui } from './store.js';
import { nodeColor } from './map-view.js';
import { goTo } from './nav.js';
import { selectNode, centerNode } from './inspector.js';

const byValue = (counts) => Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

// One section, shown on its own on phones and side by side on wide screens.
const section = (id, html) => `<div class="bsec" data-sec="${id}">${html}</div>`;
const title = (text, number) => `<div class="gtitle">${text}${number === undefined ? '' : `<span class="num push">${number}</span>`}</div>`;
const end = (value, unit) => `<span class="end"><b>${value}</b>${unit ? `<small>${unit}</small>` : ''}</span>`;

function itemRow(item, note, value, unit, tag = 'div') {
  const button = tag === 'button' ? ` type="button" data-sel="${esc(item)}"` : '';
  return `
    <${tag} class="row"${button}>
      <span class="ibox">${itemIcon(item, 30)}</span>
      <span class="main-t"><span class="t">${esc(itemName(item))}</span>${note ? `<span class="s">${note}</span>` : ''}</span>
      ${end(value, unit)}
    </${tag}>`;
}

function buildingsHTML(totals, steps) {
  const machines = byValue(totals.built);
  const rows = machines.map((m) => {
    const power = steps.filter((n) => n.machine === m).reduce((sum, n) => sum + n.power, 0);
    return `
      <div class="row">
        <span class="ibox">${machineIcon(m, 30)}</span>
        <span class="main-t"><span class="t">${esc(machineName(m))}</span>
          <span class="s">${fmt(totals.exact[m])} exact${power ? ' · ' + fmtPower(power) : ''}</span></span>
        ${end(count(totals.built[m]))}
      </div>`;
  }).join('');
  const total = machines.reduce((sum, m) => sum + totals.built[m], 0);
  return section('buildings', `
    ${title('Buildings to place', count(total))}
    <div class="group">${rows || '<div class="row noic"><span class="s">Nothing to build.</span></div>'}</div>
    <p class="gnote">${fmtPower(totals.power)} with every building running. Miners, collectors and pumps are not counted.</p>`);
}

function stepRow(node, beltsOut) {
  const id = node.item;
  const busy = Math.round((node.built ? node.count / node.built : 0) * 100);
  const notes = [rateStr(node.outRate[id]) + unitLabel(), esc(machineShortName(node.machine))];
  if (node.prof) notes.push('Mk.' + ROMAN[node.prof.level]);
  if (beltsOut[id]) notes.push(plural(beltsOut[id], 'belt'));
  return `
    <button class="row" type="button" data-sel="${esc(id)}">
      <span class="ibox">${itemIcon(id, 30)}</span>
      <span class="main-t"><span class="t">${esc(itemName(id))}</span><span class="s">${notes.join(' · ')}</span>
        <span class="bar"><i style="width:${busy}%;background:${nodeColor(node)}"></i></span></span>
      ${end(node.built + '×', busy + '%')}${svg('i-chev', 16, 'chev')}
    </button>`;
}

function stepsHTML(steps) {
  const beltsOut = {};
  for (const e of ui.plan.edges) if (!e.fluid) beltsOut[e.from] = (beltsOut[e.from] || 0) + e.belts;
  const sorted = [...steps].sort((a, b) => (b.power - a.power) || (b.count - a.count));
  return section('steps', `
    ${title('Production steps', sorted.length)}
    <div class="group">${sorted.map((n) => stepRow(n, beltsOut)).join('')}</div>
    <p class="gnote">The bar shows how busy the built machines are. Tap a step to find it on the map.</p>`);
}

function resourcesHTML(totals) {
  const nodes = ui.plan.nodes;
  const raw = byValue(totals.raw).map((k) => {
    const source = nodes[k] && nodes[k].kind === 'source' ? nodes[k] : null;
    const note = source ? `${source.built} × ${esc(machineName(source.machine))}` : 'Supplied from elsewhere';
    return itemRow(k, note, rateStr(totals.raw[k]), unitLabel(), 'button');
  }).join('');
  const belts = byValue(totals.beltsByItem).map((k) => itemRow(k, '', totals.beltsByItem[k])).join('');
  const pipes = {};
  for (const e of ui.plan.edges) if (e.fluid) pipes[e.item] = (pipes[e.item] || 0) + e.flow;
  const extra = (counts, note) => Object.keys(counts).map((k) => itemRow(k, note, rateStr(counts[k]), unitLabel())).join('');
  const more = extra(pipes, 'Pipe flow') + extra(totals.surplus, 'Surplus by-product') + extra(totals.prolif, 'Needed for spraying');
  return section('resources', `
    ${title('Raw input')}<div class="group">${raw}</div>
    ${title('Belt lines', totals.belts)}<div class="group">${belts}</div>
    <p class="gnote">Each link on the map is its own line at ${BELTS[state.belt] * state.stack} items/s. Merge lines of the same item where you can.</p>
    ${more ? `${title('Pipes, surplus, proliferator')}<div class="group">${more}</div>` : ''}`);
}

const LOOP_WARNING = `<div class="warnbox">These recipe choices feed each other without producing a surplus, so the plan cannot settle.
  Change one of the recipes on the map.</div>`;

export function renderBuildList() {
  const totals = ui.plan.totals;
  const steps = ui.plan.order.map((id) => ui.plan.nodes[id]);
  $('#buildBody').innerHTML = (ui.plan.ok ? '' : LOOP_WARNING) + buildingsHTML(totals, steps) + stepsHTML(steps) + resourcesHTML(totals);
}

// Opens the map and selects the step.
function showOnMap(id) {
  if (!ui.plan.nodes[id]) return;
  goTo('map');
  requestAnimationFrame(() => { selectNode(id); centerNode(ui.sel); });
}

export function wireBuildList() {
  $('#buildBody').addEventListener('click', (e) => {
    const row = e.target.closest('[data-sel]');
    if (row) showOnMap(row.dataset.sel);
  });
}
