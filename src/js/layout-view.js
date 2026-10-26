// Step layouts: the preview in the step details, and the layout sheet with
// pan, zoom, the sorter tier, the item table and notes.
import { DATA, ITEMS, MACHINE_CLASS } from './engine.js';
import { $, esc, svg, itemIcon, itemName, itemColor, machineName, machineShortName, rateStr, unitLabel, optionTag, TIER_LABEL } from './core.js';
import { state, ui, update } from './store.js';
import { nodeColor } from './map-view.js';
import { openSheet } from './sheets.js';
import { stepLayout } from './step-layout.js';
import { SORTERS } from './geometry.js';

// The data spells these "Sorter MK.I". The game says Mk.I.
const SORTER_NAME = { 'sorter-1': 'Sorter Mk.I', 'sorter-2': 'Sorter Mk.II', 'sorter-3': 'Sorter Mk.III', 'sorter-4': 'Pile Sorter' };
// The preview shows the start of a long row at a size that can be read.
const PREVIEW_TILES = 34;
// Below this many px per tile the names on buildings are too small to read.
const LABEL_SCALE = 13;
const MIN_SCALE = 1.5, MAX_SCALE = 64, ZOOM_STEP = 1.4;
// A long row would be too small to read when it fits, so the sheet opens at
// this many px per tile on the station end of the row. Fit shows all of it.
const START_SCALE = 16;
const TILE = 64;

const layoutFor = (node) => stepLayout(node, ui.plan, { sorter: state.opts.sorter });
const rateText = (perSec) => `${rateStr(perSec)}${unitLabel()}`;
const fmt = (n) => +n.toFixed(2);

function plural(name) {
  const tier = name.match(/^(.*)( Mk\.[IVX]+)$/);
  if (tier) return plural(tier[1]) + tier[2];
  return /y$/.test(name) ? name.slice(0, -1) + 'ies' : name + 's';
}
const many = (count, name) => `${count} ${count === 1 ? name : plural(name)}`;

// "Build 3 rows like this, each with 10 Arc Smelters. The last one has 4."
export function summaryText(l) {
  const name = machineName(l.machine);
  const row = (count) => many(count, name) + (l.stack ? ` in ${many(Math.ceil(count / l.stack), 'stack')}` : '');
  if (l.modules === 1) return `Build one row of ${row(l.perModule)}.`;
  const last = l.last < l.perModule ? ` The last one has ${l.last}.` : '';
  return `Build ${l.modules} rows like this, each with ${row(l.perModule)}.${last}`;
}

const names = (items) => items.map(itemName).join(' and ');

function noteText(n, l) {
  const name = machineName(l.machine);
  switch (n.key) {
    case 'shared': return `${names(n.items)} share one belt. Sorters take what the building needs, but load the belt in the right ratio, or one item can fill it.`;
    case 'slots': {
      const where = n.side === 'top' ? 'upper' : 'lower';
      const fix = n.faster ? ` ${SORTER_NAME[n.faster]} or faster fits.` : ' Even Pile Sorters do not fit, so the drawing shows the count on each sorter.';
      return `Each ${n.unit} needs ${n.need} sorters on its ${where} side, which has ${n.slots} slots.${fix}`;
    }
    case 'belts': return `One ${name} needs ${n.belts} belts of ${names(n.items)}. Use a faster or stacked belt.`;
    case 'long': return `One belt could feed ${n.fullBelt} of these. Rows here stop at ${n.max}, so each row gets its own belts.`;
    case 'stack': return `Each stack is ${n.height} labs high. Only the bottom lab has sorters, and items move up the stack by themselves.`;
    case 'stackResearch': return 'Stacks over 3 labs high need Vertical Construction research.';
    case 'equator': return 'Chemical plants are drawn 8 tiles apart. Near the equator 7 is enough.';
    case 'spray': return `Each row needs ${rateText(n.rate)} of ${itemName(n.item)} for its Spray Coaters.`;
    case 'pile': return 'Pile Sorter speeds are for no stacking research. Research makes them faster.';
    case 'towers': return 'Tesla Towers are spaced with room to spare. You may need fewer.';
    case 'fractionator': return 'Hydrogen runs through each Fractionator and loops back to the start, where new hydrogen joins it.';
    case 'fractionatorEnd': return 'Each Fractionator turns 1% of the hydrogen that passes into deuterium, so keep the loop belt full.';
    default: return '';
  }
}

// Drawing. Coordinates are in tiles, so the viewBox does the scaling.

// An icon from the sprite sheet, as an SVG image cut to one tile.
function iconSVG(key, cx, cy, size) {
  const spot = DATA.icons[key];
  if (!spot) return '';
  const [w, h] = DATA.sprite;
  const x = fmt(cx - size / 2), y = fmt(cy - size / 2);
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${spot[0]} ${spot[1]} ${TILE} ${TILE}">` +
    `<image href="sprite.webp" width="${w}" height="${h}"/></svg>`;
}
const itemIconSVG = (id, cx, cy, size) => iconSVG(ITEMS[id] ? ITEMS[id].ic : id, cx, cy, size);

const pathOf = (points) => 'M' + points.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L');

// Chevrons along a belt, pointing the way the items move.
function chevrons(points) {
  let d = '';
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i];
    const length = Math.abs(bx - ax) + Math.abs(by - ay);
    const ux = (bx - ax) / length, uy = (by - ay) / length;
    // On tile edges, so they do not sit under the sorters in the middle of a tile.
    for (let t = 1; t < length; t += 2) {
      const x = ax + ux * t, y = ay + uy * t;
      // A small V: two arms behind the tip, at right angles to the belt.
      const back = 0.14, wide = 0.17;
      d += `M${fmt(x - ux * back - uy * wide)} ${fmt(y - uy * back + ux * wide)}L${fmt(x + ux * back)} ${fmt(y + uy * back)}` +
        `L${fmt(x - ux * back + uy * wide)} ${fmt(y - uy * back - ux * wide)}`;
    }
  }
  return d;
}

function beltSVG(b) {
  const d = pathOf(b.points);
  const color = itemColor(b.items[0]);
  let out = `<path class="lv-belt-edge" d="${d}"/><path class="lv-belt" d="${d}" style="stroke:${color}"/>`;
  if (b.items.length > 1) out += `<path class="lv-belt mix" d="${d}" style="stroke:${itemColor(b.items[1])}"/>`;
  out += `<path class="lv-chev" d="${chevrons(b.points)}"/>`;
  return out;
}

// An icon for each belt where it meets the station end of the row (the left).
function beltLabel(b) {
  if (b.role === 'through' || b.role === 'loop') return '';
  const [x, y] = b.points.reduce((left, p) => (p[0] < left[0] ? p : left));
  const cx = x + 0.5;
  let out = `<circle class="lv-bead" cx="${fmt(cx)}" cy="${fmt(y)}" r="0.48"/>` + itemIconSVG(b.items[0], cx, y, 0.78);
  if (b.items.length > 1) out += `<circle class="lv-bead" cx="${fmt(cx + 1)}" cy="${fmt(y)}" r="0.48"/>` + itemIconSVG(b.items[1], cx + 1, y, 0.78);
  return out;
}

function arrowSVG(from, to, cls) {
  const [ax, ay] = from, [bx, by] = to;
  const length = Math.hypot(bx - ax, by - ay) || 1;
  const ux = (bx - ax) / length, uy = (by - ay) / length;
  const head = Math.min(0.34, length * 0.7), wide = 0.22;
  const sx = bx - ux * head, sy = by - uy * head;
  return `<path class="${cls}" d="M${fmt(ax)} ${fmt(ay)}L${fmt(sx)} ${fmt(sy)}"/>` +
    `<path class="${cls}-head" d="M${fmt(bx)} ${fmt(by)}L${fmt(sx - uy * wide)} ${fmt(sy + ux * wide)}L${fmt(sx + uy * wide)} ${fmt(sy - ux * wide)}Z"/>`;
}

function badge(x, y, text) {
  const w = 0.32 + text.length * 0.3;
  return `<rect class="lv-badge" x="${fmt(x)}" y="${fmt(y - 0.3)}" width="${fmt(w)}" height="0.6" rx="0.3"/>` +
    `<text class="lv-badge-t" x="${fmt(x + w / 2)}" y="${fmt(y + 0.02)}">${esc(text)}</text>`;
}

function sorterSVG(s) {
  let out = arrowSVG(s.from, s.to, 'lv-sorter');
  if (s.count > 1) out += badge(s.from[0] + 0.3, (s.from[1] + s.to[1]) / 2, '×' + s.count);
  return out;
}

// Smelters and assemblers are told apart by tier. Other buildings use their name.
const buildingLabel = (machine) =>
  (['smelter', 'assembler'].includes(MACHINE_CLASS[machine]) && TIER_LABEL[machine]) || machineShortName(machine);

function buildingSVG(b, color) {
  const size = Math.min(2.2, Math.min(b.w, b.d) * 0.6);
  const cx = b.x + b.w / 2, cy = b.y + b.d / 2;
  const label = buildingLabel(b.machine);
  const font = Math.min(0.55, (b.w - 0.5) / (label.length * 0.62));
  let out = `<rect class="lv-bld" x="${b.x + 0.08}" y="${b.y + 0.08}" width="${b.w - 0.16}" height="${b.d - 0.16}" rx="0.45" style="stroke:${color}"/>` +
    itemIconSVG(b.item, cx, cy - (b.d >= 3 ? 0.25 : 0), size) +
    `<text class="lv-name" x="${fmt(cx)}" y="${fmt(b.y + b.d - 0.35)}" style="font-size:${fmt(font)}px">${esc(label)}</text>`;
  if (b.stack) out += badge(b.x + b.w - 1.5, b.y + 0.6, '×' + b.stack);
  return out;
}

function coaterSVG(c, sprayItem) {
  const cx = c.x + c.w / 2, cy = c.y + 0.5;
  return `<rect class="lv-coater" x="${c.x + 0.06}" y="${c.y + 0.12}" width="${c.w - 0.12}" height="${c.d - 0.24}" rx="0.2"/>` +
    (sprayItem ? itemIconSVG(sprayItem, cx, cy, 0.62) : '');
}

const towerSVG = (t) => `<g class="lv-tower"><circle cx="${t.x + 0.5}" cy="${t.y + 0.5}" r="0.42"/>` +
  `<path d="M${t.x + 0.56} ${t.y + 0.2}L${t.x + 0.36} ${t.y + 0.55}H${t.x + 0.6}L${t.x + 0.44} ${t.y + 0.82}"/></g>`;

// A plain-words description for screen readers. The table has the numbers.
function ariaText(l) {
  const belts = (role) => l.parts.filter((p) => p.type === 'belt' && p.role === role).map((b) => names(b.items));
  const ins = belts('in'), outs = belts('out');
  return `${summaryText(l)} Belts in: ${ins.join(', ')}. Belts out: ${outs.join(', ')}.`;
}

// id: a prefix for the grid pattern, so two drawings on one page do not clash.
// width: how many tiles to show from the left, for the preview.
export function layoutSVG(l, { id, width = l.w, cls = '' }) {
  const node = ui.plan.nodes[l.item];
  const color = nodeColor(node);
  const sprayItem = l.spray && l.spray.item;
  const by = (type) => l.parts.filter((p) => p.type === type);
  const pad = 0.5;
  const view = `${-pad} ${-pad} ${fmt(width + pad * 2)} ${fmt(l.h + pad * 2)}`;
  const body = [
    `<defs><pattern id="${id}-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path class="lv-grid" d="M1 0H0V1"/></pattern></defs>`,
    `<rect x="${-pad}" y="${-pad}" width="${l.w + pad * 2}" height="${l.h + pad * 2}" fill="url(#${id}-grid)"/>`,
    ...by('belt').map(beltSVG),
    ...by('coater').map((c) => coaterSVG(c, sprayItem)),
    ...by('building').map((b) => buildingSVG(b, color)),
    ...by('port').map((p) => arrowSVG(p.from, p.to, 'lv-port')),
    ...by('sorter').map(sorterSVG),
    ...by('tower').map(towerSVG),
    ...by('belt').map(beltLabel),
  ].join('');
  // The preview keeps the drawing's shape. A cut preview starts at the left end.
  const shape = cls === 'full' ? '' : ` style="aspect-ratio:${fmt(width + pad * 2)}/${fmt(l.h + pad * 2)}"`;
  const align = width < l.w ? 'xMinYMid' : 'xMidYMid';
  return `<svg class="lv-svg ${cls}" viewBox="${view}" preserveAspectRatio="${align} meet" role="img" aria-label="${esc(ariaText(l))}"${shape}>${body}</svg>`;
}

// The Layout section of the step details.
export function layoutSectionHTML(node) {
  const l = layoutFor(node);
  if (l.kind === 'none') return `<div class="gtitle">Layout</div><div class="group"><p class="lv-sum">${esc(l.reason)}</p></div>`;
  const cut = l.w > PREVIEW_TILES;
  return `
    <div class="gtitle">Layout</div>
    <div class="group lv-card">
      <div class="lv-prev${cut ? ' cut' : ''}" data-layout>${layoutSVG(l, { id: 'lvp', width: Math.min(l.w, PREVIEW_TILES) })}</div>
      <p class="lv-sum">${esc(summaryText(l))}</p>
      <div class="lv-act"><button class="btn" type="button" id="i_layout">Open layout</button></div>
    </div>`;
}

// The layout sheet

let shown = null;                    // item of the step in the sheet
const view = { s: 10, x: 0, y: 0 };  // px per tile, and the offset of tile (0, 0) in px
let current = null;                  // the layout in the sheet

function legendHTML(l) {
  const swatch = (inner) => `<svg viewBox="0 0 3 1.6" aria-hidden="true">${inner}</svg>`;
  const rows = [
    ['Building', swatch('<rect class="lv-bld" x="0.3" y="0.1" width="2.4" height="1.4" rx="0.4" style="stroke:var(--accent)"/>')],
    ['Belt, with the way it moves', swatch(`<path class="lv-belt-edge" d="M0 0.8H3"/><path class="lv-belt" d="M0 0.8H3" style="stroke:var(--muted)"/><path class="lv-chev" d="${chevrons([[0, 0.8], [3, 0.8]])}"/>`)],
  ];
  if (l.parts.some((p) => p.type === 'sorter')) rows.push(['Sorter, with how many when more than one', swatch(arrowSVG([0.7, 0.1], [0.7, 1.5], 'lv-sorter') + badge(1.1, 0.8, '×2'))]);
  if (l.parts.some((p) => p.type === 'port')) rows.push(['Belt port', swatch(arrowSVG([1.5, 1.4], [1.5, 0.2], 'lv-port'))]);
  if (l.spray) rows.push(['Spray Coater', swatch('<rect class="lv-coater" x="0.1" y="0.35" width="2.8" height="0.9" rx="0.2"/>')]);
  rows.push(['Tesla Tower', swatch(towerSVG({ x: 1, y: 0.3 }))]);
  return `<ul class="lv-legend">${rows.map(([label, pic]) => `<li>${pic}<span>${label}</span></li>`).join('')}</ul>`;
}

function tableHTML(l) {
  const each = l.stack ? 'Each stack' : 'Each building';
  const row = (r, role) => {
    const shared = r.shared ? `<small>Shares a belt with ${esc(names(r.shared))}</small>` : '';
    const sorters = r.reach ? `${r.sorters}<small>at ${r.reach} ${r.reach === 1 ? 'tile' : 'tiles'}</small>` : '<small>Belt port</small>';
    return `<tr><th scope="row"><span class="lv-item">${itemIcon(r.item, 22)}<span>${esc(itemName(r.item))}<small>${role}</small>${shared}</span></span></th>` +
      `<td>${rateStr(r.unitRate)}<small>${unitLabel()}</small></td><td>${r.belts}</td><td>${sorters}</td></tr>`;
  };
  return `<div class="gtitle" id="lsItems">Items</div><table class="lv-table" aria-labelledby="lsItems">
    <thead><tr><th scope="col">Item</th><th scope="col">${each}</th><th scope="col">Belts</th><th scope="col">Sorters</th></tr></thead>
    <tbody>${l.inputs.map((r) => row(r, 'In')).join('')}${l.outputs.map((r) => row(r, 'Out')).join('')}</tbody></table>`;
}

function infoHTML(l) {
  const options = SORTERS.map((t) => optionTag(t, SORTER_NAME[t], state.opts.sorter)).join('');
  const notes = l.notes.map((n) => noteText(n, l)).filter(Boolean);
  return `
    <p class="lv-sum">${esc(summaryText(l))}</p>
    ${l.parts.some((p) => p.type === 'sorter') ? `<div class="group"><label class="selrow"><span>Sorters</span><select id="lsSorter">${options}</select></label></div>` : ''}
    ${tableHTML(l)}
    <div class="gtitle">Key</div>
    ${legendHTML(l)}
    ${notes.length ? `<div class="gtitle">Notes</div><ul class="lv-notes">${notes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    <p class="hintp lv-foot">A suggested layout. Check it in the game before you build.</p>`;
}

function canvasSize() {
  const box = $('#lsCanvas').getBoundingClientRect();
  return { w: box.width || 1, h: box.height || 1 };
}

function applyLayoutView() {
  const svgEl = $('#lsCanvas svg');
  if (!svgEl) return;
  const { w, h } = canvasSize();
  svgEl.setAttribute('viewBox', `${fmt(-view.x / view.s)} ${fmt(-view.y / view.s)} ${fmt(w / view.s)} ${fmt(h / view.s)}`);
  svgEl.classList.toggle('far', view.s < LABEL_SCALE);
}

export function fitLayout() {
  if (!current) return;
  const { w, h } = canvasSize();
  const margin = 1;
  view.s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, w / (current.w + margin * 2), h / (current.h + margin * 2)));
  view.x = (w - current.w * view.s) / 2;
  view.y = (h - current.h * view.s) / 2;
  applyLayoutView();
}

function startLayout() {
  if (!current) return;
  fitLayout();
  const { h } = canvasSize();
  if (view.s >= START_SCALE) return;
  view.s = Math.max(view.s, Math.min(START_SCALE, h / (current.h + 2)));
  view.x = view.s;
  view.y = (h - current.h * view.s) / 2;
  applyLayoutView();
}

function zoomLayout(px, py, factor) {
  const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.s * factor));
  view.x = px - (px - view.x) * s / view.s;
  view.y = py - (py - view.y) * s / view.s;
  view.s = s;
  applyLayoutView();
}

function zoomCenter(factor) {
  const { w, h } = canvasSize();
  zoomLayout(w / 2, h / 2, factor);
}

function renderLayoutSheet(refit) {
  const node = shown && ui.plan && ui.plan.nodes[shown];
  if (!node) return;
  current = layoutFor(node);
  $('#lsHead').innerHTML = `<span class="ibox">${itemIcon(shown, 30)}</span>` +
    `<h3 id="lsTitle">Layout: ${esc(itemName(shown))}<small>${esc(machineName(node.machine))}</small></h3>` +
    `<button class="btn round small" type="button" id="lsClose" data-close="layoutSheet" aria-label="Close">${svg('i-x', 18)}</button>`;
  $('#lsCanvas').innerHTML = layoutSVG(current, { id: 'lvs', cls: 'full' });
  $('#lsInfo').innerHTML = infoHTML(current);
  if (refit) startLayout(); else applyLayoutView();
}

export function openLayout(item) {
  shown = item;
  renderLayoutSheet(false);
  openSheet('layoutSheet', { modal: true, focus: $('#lsClose') });
  requestAnimationFrame(startLayout);
}

// Pan with one finger or the mouse, pinch or wheel to zoom.
function wireGestures(canvas) {
  const pointers = {};
  let gap = 0;
  const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', (e) => {
    pointers[e.pointerId] = local(e);
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('drag');
    const ids = Object.keys(pointers);
    if (ids.length === 2) { const [a, b] = ids.map((i) => pointers[i]); gap = Math.hypot(a[0] - b[0], a[1] - b[1]); }
  });
  canvas.addEventListener('pointermove', (e) => {
    const last = pointers[e.pointerId];
    if (!last) return;
    const now = local(e);
    pointers[e.pointerId] = now;
    const ids = Object.keys(pointers);
    if (ids.length === 2) {
      const [a, b] = ids.map((i) => pointers[i]);
      const next = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (gap) zoomLayout((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, next / gap);
      gap = next;
      return;
    }
    view.x += now[0] - last[0];
    view.y += now[1] - last[1];
    applyLayoutView();
  });
  const end = (e) => {
    delete pointers[e.pointerId];
    if (Object.keys(pointers).length < 2) gap = 0;
    if (!Object.keys(pointers).length) canvas.classList.remove('drag');
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    // Firefox can count a wheel in lines or pages instead of pixels.
    const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const [x, y] = local(e);
    zoomLayout(x, y, Math.exp(-e.deltaY * px * (e.ctrlKey ? 0.01 : 0.002)));
  }, { passive: false });
  // Safari sends its own pinch events. Block them so the page does not zoom.
  canvas.addEventListener('gesturestart', (e) => e.preventDefault());
}

// onChange: draws the step details again after the sorter tier changes.
export function wireLayout(onChange) {
  const sheet = $('#layoutSheet');
  wireGestures($('#lsCanvas'));
  $('#lsZoomIn').addEventListener('click', () => zoomCenter(ZOOM_STEP));
  $('#lsZoomOut').addEventListener('click', () => zoomCenter(1 / ZOOM_STEP));
  $('#lsFit').addEventListener('click', fitLayout);
  sheet.addEventListener('change', (e) => {
    if (e.target.id !== 'lsSorter') return;
    update((draft) => { draft.opts.sorter = e.target.value; });
    renderLayoutSheet(true);
    $('#lsSorter').focus();
    onChange();
  });
  sheet.addEventListener('keydown', (e) => {
    if (e.target.closest('select')) return;
    if (e.key === '+' || e.key === '=') zoomCenter(ZOOM_STEP);
    else if (e.key === '-') zoomCenter(1 / ZOOM_STEP);
    else if (e.key === 'f' || e.key === 'F') fitLayout();
  });
  window.addEventListener('resize', () => { if ('open' in sheet.dataset) fitLayout(); });
}
