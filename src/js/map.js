/* ---------- Flow map: layout, render, pan and zoom ---------- */
import { ITEMS, MACH_CLASS, fmtPower } from './engine.js';
import { $, $$, esc, ic, itemIc, itemName, itemColor, machShort, rateStr, ul, isWide, CLASS_COLOR } from './core.js';
import { state, ui } from './store.js';

export const NW = 228;
const NH = 86, TH = 64, GX = 92, GY = 22, DH = 6, GD = 5;
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

// opts.spray: draw the proliferator spray links.
export function layoutGraph(plan, opts) {
  var showSpray = opts.spray;
  var ids = Object.keys(plan.nodes);
  var E = plan.edges.filter(function (e) { return e.kind !== 'spray' && plan.nodes[e.from] && plan.nodes[e.to]; });
  var SE = showSpray ? plan.edges.filter(function (e) { return e.kind === 'spray' && plan.nodes[e.from] && plan.nodes[e.to]; }) : [];
  var preds = {}, succs = {};
  ids.forEach(function (id) { preds[id] = []; succs[id] = []; });
  var seen = {};
  E.forEach(function (e) { var k = e.from + '>' + e.to; if (seen[k]) return; seen[k] = 1; preds[e.to].push(e.from); succs[e.from].push(e.to); });

  var layer = {}, st = {};
  function L(id) {
    if (layer[id] !== undefined) return layer[id];
    if (st[id] === 1) return 0;
    st[id] = 1; var m = 0;
    preds[id].forEach(function (p) { if (st[p] !== 1) m = Math.max(m, L(p) + 1); });
    st[id] = 2; layer[id] = m; return m;
  }
  ids.forEach(L);
  // pull pure sources toward their consumers
  ids.forEach(function (id) {
    if (!preds[id].length && succs[id].length) {
      var mn = Infinity; succs[id].forEach(function (s) { mn = Math.min(mn, layer[s]); });
      if (isFinite(mn) && mn - 1 > layer[id]) layer[id] = mn - 1;
    }
  });
  SE.forEach(function (e) { });
  ids.forEach(function (id) {
    if (!succs[id].length) {
      var mn = Infinity; SE.forEach(function (e) { if (e.from === id) mn = Math.min(mn, layer[e.to]); });
      if (isFinite(mn) && mn - 1 > layer[id]) layer[id] = mn - 1;
    }
  });
  var maxL = 0; ids.forEach(function (id) { if (plan.nodes[id].kind !== 'target') maxL = Math.max(maxL, layer[id]); });
  ids.forEach(function (id) { if (plan.nodes[id].kind === 'target') layer[id] = Math.max(layer[id], maxL + 1); });
  var top = 0; ids.forEach(function (id) { top = Math.max(top, layer[id]); });

  // build vertex list with dummy nodes
  var V = {};
  ids.forEach(function (id) { V[id] = { id: id, layer: layer[id], h: plan.nodes[id].kind === 'target' ? TH : NH, dummy: false, ins: [], outs: [] }; });
  var dc = 0;
  var routes = E.map(function (e) {
    var a = layer[e.from], b = layer[e.to];
    var chain = [e.from];
    if (b - a > 1) {
      for (var l = a + 1; l < b; l++) {
        var did = '_d' + (dc++);
        V[did] = { id: did, layer: l, h: DH, dummy: true, ins: [], outs: [] };
        chain.push(did);
      }
    }
    chain.push(e.to);
    for (var i = 0; i < chain.length - 1; i++) { V[chain[i]].outs.push(chain[i + 1]); V[chain[i + 1]].ins.push(chain[i]); }
    return { e: e, chain: chain, back: b <= a };
  });

  var layers = [];
  for (var l = 0; l <= top; l++) layers.push([]);
  Object.keys(V).forEach(function (id) { layers[V[id].layer].push(id); });
  // initial order: DFS from targets
  var pos = {};
  var order = 0, vis = {};
  function dfs(id) { if (vis[id]) return; vis[id] = 1; V[id].ins.forEach(dfs); pos[id] = order++; }
  Object.keys(V).filter(function (id) { return !V[id].outs.length; }).sort().forEach(dfs);
  Object.keys(V).forEach(function (id) { if (pos[id] === undefined) pos[id] = order++; });
  layers.forEach(function (arr) { arr.sort(function (a, b) { return pos[a] - pos[b]; }); });
  function reindex() { layers.forEach(function (arr) { arr.forEach(function (id, i) { V[id].idx = i; }); }); }
  reindex();
  function sweep(down) {
    var from = down ? 1 : top - 1, to = down ? top + 1 : -1, step = down ? 1 : -1;
    for (var l = from; l !== to; l += step) {
      var arr = layers[l];
      var bc = {};
      arr.forEach(function (id) {
        var nb = down ? V[id].ins : V[id].outs;
        if (!nb.length) { bc[id] = V[id].idx; return; }
        var s = 0; nb.forEach(function (n) { s += V[n].idx; }); bc[id] = s / nb.length;
      });
      arr.sort(function (a, b) { return (bc[a] - bc[b]) || (V[a].idx - V[b].idx); });
      arr.forEach(function (id, i) { V[id].idx = i; });
    }
  }
  for (var it = 0; it < 6; it++) { sweep(true); sweep(false); }

  // vertical placement
  function gap(a, b) { return (V[a].dummy || V[b].dummy) ? GD : GY; }
  layers.forEach(function (arr) { var y = 0; arr.forEach(function (id, i) { V[id].y = y; y += V[id].h + (arr[i + 1] ? gap(id, arr[i + 1]) : 0); }); });
  function cy(id) { return V[id].y + V[id].h / 2; }
  function relax(down) {
    var from = down ? 1 : top - 1, to = down ? top + 1 : -1, step = down ? 1 : -1;
    for (var l = from; l !== to; l += step) {
      var arr = layers[l]; if (!arr.length) continue;
      var want = arr.map(function (id) {
        var nb = down ? V[id].ins : V[id].outs;
        if (!nb.length) return V[id].y;
        var s = 0; nb.forEach(function (n) { s += cy(n); }); return s / nb.length - V[id].h / 2;
      });
      var ys = want.slice();
      for (var i = 1; i < arr.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + V[arr[i - 1]].h + gap(arr[i - 1], arr[i]));
      // shift to minimise deviation
      var dev = 0; for (var j = 0; j < arr.length; j++) dev += want[j] - ys[j];
      dev /= arr.length;
      arr.forEach(function (id, k) { V[id].y = ys[k] + dev; });
    }
  }
  for (var r = 0; r < 4; r++) { relax(true); relax(false); relax(true); }
  var minY = Infinity, maxY = -Infinity;
  Object.keys(V).forEach(function (id) { minY = Math.min(minY, V[id].y); maxY = Math.max(maxY, V[id].y + V[id].h); });
  Object.keys(V).forEach(function (id) { V[id].y -= minY; V[id].x = V[id].layer * (NW + GX); });
  var width = (top + 1) * (NW + GX) - GX, height = maxY - minY;

  // port assignment
  var outPorts = {}, inPorts = {};
  routes.forEach(function (rt, i) {
    var a = rt.chain[0], b = rt.chain[rt.chain.length - 1];
    var nextOfA = rt.chain[1], prevOfB = rt.chain[rt.chain.length - 2];
    (outPorts[a] = outPorts[a] || []).push({ i: i, ref: nextOfA });
    (inPorts[b] = inPorts[b] || []).push({ i: i, ref: prevOfB });
  });
  var portY = {};
  function assign(map, kind) {
    Object.keys(map).forEach(function (id) {
      var list = map[id];
      list.sort(function (p, q) { return cy(p.ref) - cy(q.ref) || p.i - q.i; });
      var h = V[id].h, pad = 16, n = list.length;
      list.forEach(function (p, k) { portY[kind + p.i] = V[id].y + (n === 1 ? h / 2 : pad + (h - 2 * pad) * k / (n - 1)); });
    });
  }
  assign(outPorts, 'o'); assign(inPorts, 'i');

  var paths = routes.map(function (rt, i) {
    var pts = [];
    var a = rt.chain[0], b = rt.chain[rt.chain.length - 1];
    pts.push([V[a].x + NW, portY['o' + i]]);
    for (var k = 1; k < rt.chain.length - 1; k++) { var d = V[rt.chain[k]]; pts.push([d.x + NW / 2, d.y + d.h / 2]); }
    pts.push([V[b].x, portY['i' + i]]);
    var dstr = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
    for (var j = 1; j < pts.length; j++) {
      var p = pts[j - 1], q = pts[j], mx = (q[0] - p[0]) / 2;
      if (mx < 20) mx = 20;
      dstr += 'C' + (p[0] + mx).toFixed(1) + ',' + p[1].toFixed(1) + ' ' + (q[0] - mx).toFixed(1) + ',' + q[1].toFixed(1) + ' ' + q[0].toFixed(1) + ',' + q[1].toFixed(1);
    }
    var p0 = pts[pts.length - 2], p1 = pts[pts.length - 1];
    return { e: rt.e, d: dstr, lx: (p0[0] + p1[0]) / 2, ly: (p0[1] + p1[1]) / 2 };
  });
  SE.forEach(function (e) {
    var a = V[e.from], b = V[e.to];
    var x1 = a.x + NW, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2;
    var m = Math.max(40, Math.abs(x2 - x1) / 2);
    if (x2 < x1) { x1 = a.x; x2 = b.x + NW; m = -Math.max(40, Math.abs(x2 - x1) / 2); }
    paths.push({ e: e, d: 'M' + x1 + ',' + y1 + 'C' + (x1 + m) + ',' + y1 + ' ' + (x2 - m) + ',' + y2 + ' ' + x2 + ',' + y2, lx: (x1 + x2) / 2, ly: (y1 + y2) / 2, spray: true });
  });
  var nodes = ids.map(function (id) { return { id: id, x: V[id].x, y: V[id].y, h: V[id].h }; });
  return { nodes: nodes, paths: paths, width: width, height: height };
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

