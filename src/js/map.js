/* ---------- Flow map: render, pan and zoom ---------- */
import { ITEMS, MACH_CLASS, fmtPower } from './engine.js';
import { $, $$, esc, ic, itemIc, itemName, itemColor, machShort, rateStr, ul, isWide, CLASS_COLOR } from './core.js';
import { state, ui } from './store.js';
import { layoutGraph, NODE_WIDTH } from './layout.js';

export const NW = NODE_WIDTH;

function nodeKindClass(n) {
  if (n.kind === 'craft') { var c = MACH_CLASS[n.machine]; return c || 'other'; }
  if (n.kind === 'source') return 'miner';
  return 'other';
}
export function nodeColor(n) {
  if (n.kind === 'raw') return 'var(--c-source)';
  var c = nodeKindClass(n);
  return CLASS_COLOR[c] || 'var(--c-other)';
}

/* ---------- map render ---------- */
function nodeHTML(n, pos) {
  var sel = ui.sel === n.id ? ' sel' : '';
  var st = 'left:' + pos.x + 'px;top:' + pos.y + 'px';
  if (n.kind === 'target') {
    return '<div class="node target" data-id="' + n.id + '" style="' + st + '">' +
      '<div class="pic">' + itemIc(n.item, 34) + '</div><div style="min-width:0"><div class="tag">Target</div>' +
      '<div class="t1" style="padding:0">' + esc(itemName(n.item)) + '</div><div class="t2"><b>' + rateStr(n.rate) + '</b>' + ul() + '</div></div></div>';
  }
  if (n.kind === 'raw') {
    return '<div class="node raw' + sel + '" data-id="' + n.id + '" style="' + st + ';--nc:var(--c-source)">' +
      '<div class="pic">' + itemIc(n.item, 34) + '</div><div style="min-width:0"><div class="t1">' + esc(itemName(n.item)) + '</div>' +
      '<div class="t2"><b>' + rateStr(n.rate) + '</b>' + ul() + '</div></div>' +
      '<div class="mrow"><span class="mn">Supplied from elsewhere</span></div></div>';
  }
  var prod = ui.plan.nodes[n.id].outRate[n.id] || 0;
  var nn = ui.plan.nodes[n.id];
  var badge = '';
  if (nn.prof) badge = '<span class="badge">' + (nn.prof.mode === 'speed' ? '⚡' : '×') + ' Mk.' + ['', 'I', 'II', 'III'][nn.prof.level] + '</span>';
  var util = nn.built ? nn.count / nn.built : 0;
  return '<div class="node' + sel + '" data-id="' + n.id + '" style="' + st + ';--nc:' + nodeColor(nn) + '">' + badge +
    '<div class="pic">' + itemIc(n.id, 34) + '</div><div style="min-width:0"><div class="t1' + (badge ? ' hb' : '') + '" title="' + esc(nn.rec.name) + '">' + esc(itemName(n.id)) + '</div>' +
    '<div class="t2"><b>' + rateStr(prod) + '</b>' + ul() + '</div></div>' +
    '<div class="mrow">' + ic(ITEMS[nn.machine] ? ITEMS[nn.machine].ic : nn.machine, 20) + '<span class="cnt">' + (nn.built ? nn.built + '×' : '–') + '</span><span class="mn">' + esc(machShort(nn.machine)) + '</span>' +
    (nn.power > 0 ? '<span class="pw">' + fmtPower(nn.power) + '</span>' : '') + '</div>' +
    '<div class="util"><i style="width:' + Math.round(util * 100) + '%"></i></div></div>';
}

export function renderMap() {
  var vp = $('#viewport'), stage = $('#stage');
  var hasTargets = state.targets.some(function (t) { return t.rate > 0; });
  if (!hasTargets || !Object.keys(ui.plan.nodes).length) {
    stage.innerHTML = ''; $('#mapEmpty').hidden = false; return;
  }
  $('#mapEmpty').hidden = true;
  ui.layout = layoutGraph(ui.plan, { spray: state.opts.spray });
  var pos = {}; ui.layout.nodes.forEach(function (n) { pos[n.id] = n; });
  var h = '<svg width="' + ui.layout.width + '" height="' + (ui.layout.height + 10) + '">';
  var cap = ui.plan.cap;
  ui.layout.paths.forEach(function (p, i) {
    var e = p.e;
    var w = e.fluid ? 3 : Math.min(9, 1.6 + 3.2 * Math.min(1, e.flow / cap) + (e.belts - 1) * 0.9);
    var cls = 'edge' + (e.kind === 'spray' ? ' spray' : '') + (e.by ? ' by' : '') + (e.fluid ? ' fluid' : '');
    h += '<path class="' + cls + '" data-f="' + e.from + '" data-t="' + e.to + '" d="' + p.d + '" stroke="' + itemColor(e.item) + '" stroke-width="' + w.toFixed(1) + '"/>';
  });
  ui.layout.paths.forEach(function (p) {
    var e = p.e;
    if (p.spray) return;
    var txt = rateStr(e.flow) + (e.fluid ? ' pipe' : (e.belts > 1 ? ' · ' + e.belts + ' belts' : ''));
    h += '<text class="elabel" data-f="' + e.from + '" data-t="' + e.to + '" x="' + p.lx.toFixed(1) + '" y="' + (p.ly + 3.5).toFixed(1) + '" text-anchor="middle">' + txt + '</text>';
  });
  h += '</svg>';
  ui.layout.nodes.forEach(function (ln) {
    var n = ui.plan.nodes[ln.id];
    if (!n) return;
    n = Object.assign({}, n, { id: ln.id });
    h += nodeHTML(n, ln);
  });
  stage.innerHTML = h;
  stage.style.width = ui.layout.width + 'px'; stage.style.height = ui.layout.height + 'px';
  stage.classList.toggle('nolabels', !state.opts.labels);
  var sig = Object.keys(ui.plan.nodes).sort().join(',') + '|' + ui.layout.width;
  if (sig !== ui.mapSig) { ui.mapSig = sig; fitView(); } else applyView();
  applySelection();
}

export function applyView() { var st = $('#stage'); st.style.transform = 'translate(' + ui.view.x + 'px,' + ui.view.y + 'px) scale(' + ui.view.k + ')'; st.classList.toggle('far', ui.view.k < 0.42); }
// all: show the whole map, even when it would be very small on a phone.
export function fitView(all) {
  if (!ui.layout) return;
  var vp = $('#viewport'), vw = vp.clientWidth, vh = vp.clientHeight;
  if (!vw || !vh) { ui.needFit = true; return; }
  ui.needFit = false;
  var wide = isWide();
  var tb = $('.tabbar'), top = wide ? 68 : 74, bot = wide ? 20 : ((tb && tb.offsetHeight) || 0) + 14, side = 14;
  var aw = vw - side * 2 - (wide ? 56 : 54), ah = Math.max(80, vh - top - bot);
  var k = Math.min(aw / ui.layout.width, ah / (ui.layout.height + 10), 1);
  if (!wide && k < 0.34 && !all) {
    // phone: start readable, anchored on the target column; the fit button shows the whole map
    k = 0.75;
    var tgt = null; ui.layout.nodes.forEach(function (n) { if (ui.plan.nodes[n.id] && ui.plan.nodes[n.id].kind === 'target' && !tgt) tgt = n; });
    ui.view.k = k; ui.view.x = side + aw - ui.layout.width * k;
    ui.view.y = tgt ? top + ah / 2 - (tgt.y + tgt.h / 2) * k : top;
    applyView(); return;
  }
  k = Math.max(k, 0.08);
  ui.view.k = k; ui.view.x = side + (aw - ui.layout.width * k) / 2; ui.view.y = top + Math.max(0, (ah - ui.layout.height * k) / 2);
  applyView();
}
export function zoomAt(cx, cy, f) {
  var nk = Math.min(2.2, Math.max(0.1, ui.view.k * f)); f = nk / ui.view.k;
  ui.view.x = cx - (cx - ui.view.x) * f; ui.view.y = cy - (cy - ui.view.y) * f; ui.view.k = nk; applyView();
}

export function applySelection() {
  var stage = $('#stage');
  var any = !!ui.sel && ui.plan && ui.plan.nodes[ui.sel];
  stage.classList.toggle('has-sel', !!any);
  var rel = {};
  if (any) rel[ui.sel] = 1;
  $$('.edge, .elabel', stage).forEach(function (el) {
    var on = any && (el.getAttribute('data-f') === ui.sel || el.getAttribute('data-t') === ui.sel);
    el.classList.toggle('hl', !!on);
    if (on) { rel[el.getAttribute('data-f')] = 1; rel[el.getAttribute('data-t')] = 1; }
  });
  $$('.node', stage).forEach(function (el) {
    var id = el.getAttribute('data-id');
    el.classList.toggle('sel', id === ui.sel);
    el.classList.toggle('rel', !!rel[id]);
  });
}

