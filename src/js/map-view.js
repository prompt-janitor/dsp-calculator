/* ---------- Flow map: render, pan, zoom and selection ---------- */
import { MACHINE_CLASS, formatPower } from './engine.js';
import {
  $, $$, esc, machineIcon, itemIcon, itemName, itemColor, machineShortName, rateStr, unitLabel, isFull, CLASS_COLOR, ROMAN,
} from './core.js';
import { state, ui } from './store.js';
import { layoutGraph, NODE_WIDTH } from './layout.js';

export { NODE_WIDTH };

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2.2;
const MIN_FIT_ZOOM = 0.08;
// Below this zoom the edge labels are too small to read, so CSS hides them.
const FAR_ZOOM = 0.42;
// On a phone or an iPad in portrait a whole large graph would be too small to
// read. Below this fit zoom the map starts at START_ZOOM on the target column
// instead, and the fit button still shows the whole map.
const MIN_START_FIT = 0.34;
const START_ZOOM = 0.75;
// Keyboard focus keeps a node this far from the map edges.
const FOCUS_MARGIN = 24;

export function nodeColor(n) {
  if (n.kind === 'raw') return 'var(--c-source)';
  const cls = n.kind === 'craft' ? MACHINE_CLASS[n.machine] : n.kind === 'source' ? 'miner' : null;
  return CLASS_COLOR[cls] || 'var(--c-other)';
}

/* ---------- nodes ---------- */
function rateHTML(perSec) { return `<div class="t2"><b>${rateStr(perSec)}</b>${unitLabel()}</div>`; }

// A node has no aria-label, so its name is the text people see on it.
function nodeShell({ id, cls, pos, color, body }) {
  const style = `left:${pos.x}px;top:${pos.y}px${color ? `;--nc:${color}` : ''}`;
  return `<div class="${cls}" data-id="${esc(id)}" style="${style}" tabindex="0" role="button">${body}</div>`;
}

function targetHTML(id, n, pos) {
  const name = itemName(n.item);
  const body = `<div class="pic">${itemIcon(n.item, 34)}</div>` +
    `<div class="txt"><div class="tag">Target</div><div class="t1">${esc(name)}</div>${rateHTML(n.rate)}</div>`;
  return nodeShell({ id, cls: 'node target', pos, body });
}

function rawHTML(id, n, pos, sel) {
  const name = itemName(n.item);
  const body = `<div class="pic">${itemIcon(n.item, 34)}</div>` +
    `<div class="txt"><div class="t1">${esc(name)}</div>${rateHTML(n.rate)}</div>` +
    '<div class="mrow"><span class="mn">Supplied from elsewhere</span></div>';
  return nodeShell({ id, cls: 'node raw' + sel, pos, color: 'var(--c-source)', body });
}

function sprayBadge(prof) {
  if (!prof) return '';
  return `<span class="badge">${prof.mode === 'speed' ? '⚡' : '×'} Mk.${ROMAN[prof.level]}</span>`;
}

function machineRow(n) {
  const icon = machineIcon(n.machine, 20);
  const power = n.power > 0 ? `<span class="pw">${formatPower(n.power)}</span>` : '';
  return `<div class="mrow">${icon}<span class="cnt">${n.built ? n.built + '×' : '–'}</span>` +
    `<span class="mn">${esc(machineShortName(n.machine))}</span>${power}</div>`;
}

function craftHTML(id, n, pos, sel) {
  const name = itemName(id);
  const made = n.outRate[id] || 0;
  const badge = sprayBadge(n.prof);
  const util = n.built ? n.count / n.built : 0;
  const body = badge + `<div class="pic">${itemIcon(id, 34)}</div>` +
    `<div class="txt"><div class="t1${badge ? ' hb' : ''}" title="${esc(n.rec.name)}">${esc(name)}</div>${rateHTML(made)}</div>` +
    machineRow(n) +
    `<div class="util"><i style="width:${Math.round(util * 100)}%"></i></div>`;
  return nodeShell({ id, cls: 'node' + sel, pos, color: nodeColor(n), body });
}

function nodeHTML(id, pos) {
  const n = ui.plan.nodes[id];
  const sel = ui.sel === id ? ' sel' : '';
  if (n.kind === 'target') return targetHTML(id, n, pos);
  if (n.kind === 'raw') return rawHTML(id, n, pos, sel);
  return craftHTML(id, n, pos, sel);
}

/* ---------- edges ---------- */
function edgeWidth(e, cap) {
  if (e.fluid) return 3;
  return Math.min(9, 1.6 + 3.2 * Math.min(1, e.flow / cap) + (e.belts - 1) * 0.9);
}

function edgeEnds(e) { return `data-f="${esc(e.from)}" data-t="${esc(e.to)}"`; }

function edgeHTML({ e, d }, cap) {
  const cls = 'edge' + (e.kind === 'spray' ? ' spray' : '') + (e.by ? ' by' : '') + (e.fluid ? ' fluid' : '');
  return `<path class="${cls}" ${edgeEnds(e)} d="${d}" stroke="${itemColor(e.item)}" stroke-width="${edgeWidth(e, cap).toFixed(1)}"/>`;
}

function edgeLabelHTML({ e, lx, ly }) {
  const extra = e.fluid ? ' pipe' : e.belts > 1 ? ` · ${e.belts} belts` : '';
  const at = `x="${lx.toFixed(1)}" y="${(ly + 3.5).toFixed(1)}"`;
  return `<text class="elabel" ${edgeEnds(e)} ${at} text-anchor="middle">${rateStr(e.flow)}${extra}</text>`;
}

function edgesSVG(layout, cap) {
  const paths = layout.paths.map((p) => edgeHTML(p, cap)).join('');
  // Labels go after every path, so no edge is drawn over a label.
  const labels = layout.paths.filter((p) => !p.spray).map(edgeLabelHTML).join('');
  return `<svg width="${layout.width}" height="${layout.height + 10}">${paths}${labels}</svg>`;
}

/* ---------- render ---------- */
export function renderMap() {
  const stage = $('#stage');
  const hasTargets = state.targets.some((t) => t.rate > 0);
  if (!hasTargets || !Object.keys(ui.plan.nodes).length) {
    stage.innerHTML = '';
    $('#mapEmpty').hidden = false;
    $('#edgeFade').hidden = true;
    return;
  }
  $('#mapEmpty').hidden = true;
  const layout = ui.layout = layoutGraph(ui.plan, { spray: state.opts.spray });
  const nodes = layout.nodes.filter((box) => ui.plan.nodes[box.id]).map((box) => nodeHTML(box.id, box)).join('');
  stage.innerHTML = edgesSVG(layout, ui.plan.cap) + nodes;
  stage.style.width = layout.width + 'px';
  stage.style.height = layout.height + 'px';
  stage.classList.toggle('nolabels', !state.opts.labels);
  // Fit again only when the graph itself changed, so a rate change keeps the view.
  const sig = Object.keys(ui.plan.nodes).sort().join(',') + '|' + layout.width;
  if (sig !== ui.mapSig) { ui.mapSig = sig; fitView(); } else applyView();
  applySelection();
}

/* ---------- view ---------- */
export function applyView() {
  const stage = $('#stage');
  stage.style.transform = `translate(${ui.view.x}px,${ui.view.y}px) scale(${ui.view.k})`;
  stage.classList.toggle('far', ui.view.k < FAR_ZOOM);
  $('#edgeFade').hidden = !mapCutOnLeft();
}

// On small screens the map often starts zoomed in on the target. The edge
// fade shows that more of the map is to the left.
function mapCutOnLeft() {
  if (isFull() || !ui.layout || !ui.layout.nodes.length) return false;
  const left = Math.min(...ui.layout.nodes.map((n) => n.x));
  return ui.view.x + left * ui.view.k < -4;
}

function shownRect(el) {
  if (!el || !el.getClientRects().length) return null;
  const r = el.getBoundingClientRect();
  return r.width && r.height ? r : null;
}

const GAP = 14;

// The part of the map that the toolbar, the zoom buttons and the tab bar do
// not cover, in viewport pixels. It reads where CSS put each control.
function freeArea(vp) {
  const outer = vp.getBoundingClientRect();
  let top = GAP, right = GAP, bottom = GAP, left = GAP;
  // The map bar sits 12 px in from each side, or inside the safe area when
  // that is wider (the notch side of a phone in landscape).
  const bar = shownRect($('.mapbar'));
  if (bar) {
    left = Math.max(left, bar.left - outer.left - 12 + GAP);
    right = Math.max(right, outer.right - bar.right - 12 + GAP);
  }
  for (const el of $$('.mapbar > *')) {
    const r = shownRect(el);
    if (r) top = Math.max(top, r.bottom - outer.top + 6);
  }
  const zoom = shownRect($('.zoombar'));
  if (zoom && zoom.height > zoom.width) {
    if (zoom.left - outer.left > outer.width / 2) right = Math.max(right, outer.right - zoom.left + 8);
    else left = Math.max(left, zoom.right - outer.left + 8);
  } else if (zoom) {
    bottom = Math.max(bottom, outer.bottom - zoom.top + 8);
  }
  const tabbar = shownRect($('.tabbar'));
  if (tabbar && tabbar.left < outer.right && tabbar.right > outer.left && tabbar.top > outer.top) {
    bottom = Math.max(bottom, outer.bottom - tabbar.top + GAP);
  }
  return { left, top, width: Math.max(80, outer.width - left - right), height: Math.max(80, outer.height - top - bottom) };
}

// The free area, less the part the step details cover when they are open.
export function visibleArea() {
  const vp = $('#viewport');
  const area = freeArea(vp);
  const sheet = $('#inspector');
  if (!('open' in sheet.dataset) || sheet.hidden) return area;
  const outer = vp.getBoundingClientRect();
  // offset* ignore the slide-in transform, so this is where the sheet ends up.
  const box = { left: sheet.offsetLeft, top: sheet.offsetTop, right: sheet.offsetLeft + sheet.offsetWidth, bottom: sheet.offsetTop + sheet.offsetHeight };
  if (box.left >= outer.right || box.right <= outer.left || box.top >= outer.bottom || box.bottom <= outer.top) return area;
  if (box.left - outer.left > outer.width * 0.3) {
    area.width = Math.max(80, Math.min(area.width, box.left - outer.left - GAP - area.left));
  } else {
    area.height = Math.max(80, Math.min(area.height, box.top - outer.top - GAP - area.top));
  }
  return area;
}

// True when part of el is outside the visible area of the map.
export function isHidden(el) {
  const area = visibleArea();
  const outer = $('#viewport').getBoundingClientRect(), r = el.getBoundingClientRect();
  return r.left < outer.left + area.left || r.top < outer.top + area.top ||
    r.right > outer.left + area.left + area.width || r.bottom > outer.top + area.top + area.height;
}

// all: show the whole map, even when it would be very small on a phone.
export function fitView(all) {
  const layout = ui.layout;
  if (!layout) return;
  const vp = $('#viewport');
  if (!vp.clientWidth || !vp.clientHeight) { ui.needFit = true; return; }
  ui.needFit = false;
  const area = freeArea(vp);
  let k = Math.min(area.width / layout.width, area.height / (layout.height + 10), 1);
  if (!isFull() && k < MIN_START_FIT && !all) {
    const target = layout.nodes.find((n) => ui.plan.nodes[n.id] && ui.plan.nodes[n.id].kind === 'target');
    k = START_ZOOM;
    ui.view.k = k;
    ui.view.x = area.left + area.width - layout.width * k;
    ui.view.y = target ? area.top + area.height / 2 - (target.y + target.h / 2) * k : area.top;
    applyView();
    return;
  }
  k = Math.max(k, MIN_FIT_ZOOM);
  ui.view.k = k;
  ui.view.x = area.left + (area.width - layout.width * k) / 2;
  ui.view.y = area.top + Math.max(0, (area.height - layout.height * k) / 2);
  applyView();
}

// Zooms by factor f and keeps the point (cx, cy) of the viewport in place.
export function zoomAt(cx, cy, f) {
  const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, ui.view.k * f));
  f = k / ui.view.k;
  ui.view.x = cx - (cx - ui.view.x) * f;
  ui.view.y = cy - (cy - ui.view.y) * f;
  ui.view.k = k;
  applyView();
}

/* ---------- selection ---------- */
export function applySelection() {
  const stage = $('#stage');
  const any = !!ui.sel && !!ui.plan && !!ui.plan.nodes[ui.sel];
  stage.classList.toggle('has-sel', any);
  const related = {};
  if (any) related[ui.sel] = true;
  for (const el of $$('.edge, .elabel', stage)) {
    const from = el.getAttribute('data-f'), to = el.getAttribute('data-t');
    const on = any && (from === ui.sel || to === ui.sel);
    el.classList.toggle('hl', on);
    if (on) { related[from] = true; related[to] = true; }
  }
  for (const el of $$('.node', stage)) {
    const id = el.getAttribute('data-id');
    el.classList.toggle('sel', id === ui.sel);
    el.classList.toggle('rel', !!related[id]);
  }
}

/* ---------- keyboard focus ---------- */
// The node nearest to node id in the direction (dx, dy). Distance across the
// direction counts double, so focus stays in the same row or column.
export function nearestNode(id, dx, dy) {
  const nodes = ui.layout ? ui.layout.nodes.filter((n) => ui.plan.nodes[n.id]) : [];
  const from = nodes.find((n) => n.id === id);
  if (!from) return null;
  const cx = (n) => n.x + NODE_WIDTH / 2, cy = (n) => n.y + n.h / 2;
  let best = null, bestScore = Infinity;
  for (const n of nodes) {
    const along = (cx(n) - cx(from)) * dx + (cy(n) - cy(from)) * dy;
    if (n === from || along <= 0) continue;
    const across = Math.abs((cx(n) - cx(from)) * dy) + Math.abs((cy(n) - cy(from)) * dx);
    const score = along + 2 * across;
    if (score < bestScore) { best = n; bestScore = score; }
  }
  return best && best.id;
}

// Pans just enough to show a node that got keyboard focus.
export function panIntoView(el) {
  const vp = $('#viewport');
  // Focus can scroll the viewport even with overflow hidden, and that would
  // move the map away from the view transform.
  vp.scrollLeft = 0;
  vp.scrollTop = 0;
  const area = visibleArea();
  const box = el.getBoundingClientRect(), outer = vp.getBoundingClientRect();
  const left = outer.left + Math.max(FOCUS_MARGIN, area.left), right = outer.left + area.left + area.width;
  const top = outer.top + area.top, bottom = top + area.height;
  let dx = 0, dy = 0;
  if (box.left < left) dx = left - box.left; else if (box.right > right) dx = right - box.right;
  if (box.top < top) dy = top - box.top; else if (box.bottom > bottom) dy = bottom - box.bottom;
  if (!dx && !dy) return;
  ui.view.x += dx;
  ui.view.y += dy;
  applyView();
}
