/* ---------- navigation ---------- */
function setTab(t) {
  // compact tab bar; keeps regular-width sidebar/main state in step
  S.tab = t;
  if (t === 'plan' || t === 'settings') S.side = t;
  if (t === 'map' || t === 'build') S.main = t;
  if (t !== 'map') closeInspector(true);
  syncNav(); saveState();
  if (t === 'map') { requestAnimationFrame(function () { if (NEED_FIT) fitView(); }); mapHint(); }
}
function mapHint() {
  var seen = false; try { seen = localStorage.getItem('dsp-map-hint') === '1'; localStorage.setItem('dsp-map-hint', '1'); } catch (e) { }
  if (!seen) setTimeout(function () { toast('Drag to pan, pinch to zoom. Tap a box for details.'); }, 400);
}
function setSide(v) { S.side = v; if (!isWide()) S.tab = v; syncNav(); saveState(); }
function setMain(v) { S.main = v; if (!isWide()) S.tab = v; syncNav(); saveState(); if (v === 'map') { requestAnimationFrame(function () { if (NEED_FIT) fitView(); }); mapHint(); } }
function syncNav() {
  var app = $('#app');
  app.setAttribute('data-tab', S.tab); app.setAttribute('data-side', S.side); app.setAttribute('data-main', S.main); app.setAttribute('data-bsec', S.bsec);
  $$('.tabbar [data-tab]').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-tab') === S.tab); });
  $$('.wide-head [data-side]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-side') === S.side); });
  $$('.wide-head [data-main]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-main') === S.main); });
  $$('.segbar [data-bsec]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-bsec') === S.bsec); });
}
function applyTheme() {
  var t = S.opts.theme;
  if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
  var meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0a1117');
}

/* ---------- plan pane ---------- */
function stepFor(v, dir) {
  if (S.unit === 'min') { var s = v < 30 ? 5 : v < 300 ? 10 : 60; if (dir < 0 && v <= 30 && v > 5) s = 5; return s; }
  return v < 1 ? 0.1 : v < 10 ? 0.5 : 5;
}
function renderPlan() {
  var h = '<div class="stats" id="planStats"></div>';
  h += '<div class="gtitle">Targets<span class="act" style="margin-left:auto"></span><span class="seg" role="group" aria-label="Rate unit">' +
    '<button type="button" data-unit="min" aria-pressed="' + (S.unit === 'min') + '">per min</button><button type="button" data-unit="s" aria-pressed="' + (S.unit === 's') + '">per sec</button></span></div>';
  h += '<div class="group">';
  if (!S.targets.length) h += '<div class="row noic"><span class="main-t"><span class="t">No targets yet</span><span class="s">Add the item you want a factory for.</span></span></div>';
  S.targets.forEach(function (t, i) {
    h += '<div class="target"><button class="pick" type="button" data-pick="' + i + '" aria-label="Change item, now ' + esc(itemName(t.item)) + '">' + itemIc(t.item, 40) + '</button>' +
      '<div class="nm"><span>' + esc(itemName(t.item)) + '</span><button class="del" type="button" data-del="' + i + '" aria-label="Remove ' + esc(itemName(t.item)) + '">' + svg('i-x', 18) + '</button></div>' +
      '<div class="stepper"><button type="button" data-tstep="' + i + '" data-dir="-1" aria-label="Less">−</button>' +
      '<input type="text" inputmode="decimal" enterkeyhint="done" value="' + t.rate + '" data-rate="' + i + '" id="rate' + i + '" aria-label="Rate for ' + esc(itemName(t.item)) + '">' +
      '<button type="button" data-tstep="' + i + '" data-dir="1" aria-label="More">+</button><span class="u">' + ul() + '</span></div></div>';
  });
  h += '</div>';
  h += '<div style="padding:12px max(16px, var(--sar)) 0 max(16px, var(--sal))"><button class="btn primary block" type="button" id="addTarget">' + svg('i-plus', 20) + 'Add item</button></div>';
  h += '<div class="gtitle">Quick start</div><div class="chips">';
  PRESETS.forEach(function (p) {
    h += '<button class="chip" type="button" data-preset="' + p.id + '"><span class="stack">' + p.items.slice(0, 3).map(function (x) { return itemIc(x[0], 26); }).join('') + '</span><span style="margin-left:6px">' + esc(p.name) + '</span></button>';
  });
  h += '</div>';
  h += '<div class="glance" id="glance"></div>';
  $('#planBody').innerHTML = h;
}
function renderPlanLive() {
  var T = PLAN.totals, machines = 0; for (var k in T.built) machines += T.built[k];
  var pr = 0; for (var p in T.prolif) pr += T.prolif[p];
  var h = '<div class="stat"><b>' + machines.toLocaleString('en-US') + '</b><span>Buildings</span></div>' +
    '<div class="stat"><b>' + fmtPower(T.power) + '</b><span>Power</span></div>' +
    '<div class="stat"><b>' + T.belts.toLocaleString('en-US') + '</b><span>Belt lines</span></div>' +
    (pr > 0 ? '<div class="stat"><b>' + rateStr(pr) + '</b><span>Proliferator ' + ul() + '</span></div>'
      : '<div class="stat"><b>' + Object.keys(T.raw).length + '</b><span>Raw resources</span></div>');
  if (!PLAN.ok) h += '<div class="stat warn" style="grid-column:1/-1"><b>Loop</b><span>Recipes feed each other without surplus</span></div>';
  var el = $('#planStats'); if (el) el.innerHTML = h;
  // glance (compact only, via CSS)
  var g = '';
  var rows = Object.keys(T.built).sort(function (a, b) { return T.built[b] - T.built[a]; }).slice(0, 5);
  if (rows.length) {
    g += '<div class="gtitle">Biggest builds<button class="act" type="button" data-goto="build">See all</button></div><div class="group">';
    rows.forEach(function (m) {
      g += '<button class="row" type="button" data-goto="build"><span class="ibox">' + machIc(m, 30) + '</span><span class="main-t"><span class="t">' + esc(machName(m)) + '</span>' +
        '<span class="s">' + fmt(T.exact[m]) + ' exact</span></span><span class="end"><b>' + T.built[m] + '</b></span></button>';
    });
    g += '</div><div style="padding:12px max(16px, var(--sar)) 0 max(16px, var(--sal))"><button class="btn block" type="button" data-goto="map">' + svg('i-map', 20) + 'Open flow map</button></div>';
  }
  var gl = $('#glance'); if (gl) gl.innerHTML = g;
  var mini = $('#miniStats'); if (mini) mini.textContent = machines.toLocaleString('en-US') + ' buildings · ' + fmtPower(T.power) + ' · ' + T.belts + ' belt lines';
  var ms = $('#mapSub'); if (ms) ms.textContent = machines.toLocaleString('en-US') + ' buildings · ' + fmtPower(T.power);
  var bs = $('#buildSub'); if (bs) bs.textContent = machines.toLocaleString('en-US') + ' buildings · ' + fmtPower(T.power);
}

/* ---------- settings pane ---------- */
function tierBtn(attr, val, cur, icon, label, sub) {
  return '<button type="button" class="topt" ' + attr + '="' + val + '" aria-pressed="' + (String(val) === String(cur)) + '">' + icon + '<span>' + esc(label) + '</span>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</button>';
}
function numRow(id, label, sub, val) {
  return '<div class="numrow"><label for="' + id + '">' + esc(label) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</label>' +
    '<div class="stepper"><button type="button" data-nstep="' + id + '" data-dir="-1" aria-label="Decrease">−</button>' +
    '<input type="text" inputmode="decimal" id="' + id + '" value="' + val + '"><button type="button" data-nstep="' + id + '" data-dir="1" aria-label="Increase">+</button></div></div>';
}
var NUMS = { mspeed: ['speed', 10, 10, 1000], mveins: ['veins', 1, 1, 12], moil: ['oil', 0.1, 0.1, 20], morb: ['orbital', 5, 10, 100] };
function renderSettings() {
  var h = '';
  if (!isStandalone() && !inFrame()) {
    if (isIOS()) h += '<div class="install">' + svg('i-home') + '<div><b>Install on your Home Screen</b>Tap ' + svg('i-share', 16) + ' Share in Safari, then <b style="display:inline">Add to Home Screen</b>. It then opens full screen and works offline.</div></div>';
    else if (window.__installPrompt) h += '<div class="install">' + svg('i-home') + '<div style="flex:1"><b>Install this app</b>Opens in its own window and works offline.</div><button class="btn primary" type="button" id="btnInstall">Install</button></div>';
  }
  h += '<div class="gtitle">Production buildings</div><div class="group">';
  Object.keys(CLASS_ORDER).forEach(function (c) {
    h += '<div class="tier"><div class="lab">' + CLASS_LABEL[c] + '</div><div class="tiers" style="--n:' + CLASS_ORDER[c].length + '">';
    CLASS_ORDER[c].forEach(function (id) {
      if (!DATA.machines[id]) return;
      var sp = DATA.machines[id].speed;
      h += tierBtn('data-mtier="' + c + '" data-val', id, S.machines[c], machIc(id, 30), TIER_LABEL[id] || machName(id), c === 'miner' ? (sp + '×') : (sp + '× speed'));
    });
    h += '</div></div>';
  });
  h += '</div><p class="gnote">Refineries, colliders and fractionators are fixed. Tap any box on the map to change one step.</p>';

  h += '<div class="gtitle">Belts</div><div class="group"><div class="tier"><div class="lab">Belt tier</div><div class="tiers" style="--n:3">';
  Object.keys(BELTS).forEach(function (b) { h += tierBtn('data-belt', b, S.belt, itemIc(b, 30), 'Mk.' + ROMAN[+b.slice(-1)], BELTS[b] + '/s'); });
  h += '</div></div><div class="numrow"><label>Stack size<small>Needs cargo stacking research</small></label><div class="seg">';
  [1, 2, 3, 4].forEach(function (n) { h += '<button type="button" data-stack="' + n + '" aria-pressed="' + (S.stack === n) + '">' + n + '×</button>'; });
  h += '</div></div></div><p class="gnote">One belt carries ' + (BELTS[S.belt] * S.stack) + ' items/s (' + (BELTS[S.belt] * S.stack * 60).toLocaleString('en-US') + '/min).</p>';

  h += '<div class="gtitle">Proliferator</div><div class="group"><div class="tier"><div class="lab">Spray on every machine that accepts it</div><div class="tiers" style="--n:4">';
  h += tierBtn('data-plevel', 0, S.prolif.level, '<span class="ic0" style="width:30px;height:30px;display:grid;place-items:center">' + svg('i-x', 18) + '</span>', 'Off');
  [1, 2, 3].forEach(function (l) { h += tierBtn('data-plevel', l, S.prolif.level, itemIc('proliferator-' + l, 30), 'Mk.' + ROMAN[l]); });
  h += '</div></div><div class="numrow"><label>Effect</label><div class="seg">' +
    '<button type="button" data-pmode="products" aria-pressed="' + (S.prolif.mode === 'products') + '">Extra products</button>' +
    '<button type="button" data-pmode="speed" aria-pressed="' + (S.prolif.mode === 'speed') + '">Speed up</button></div></div></div>' +
    '<p class="gnote">The plan adds the proliferator you need to spray. Extra products only works on recipes that allow it.</p>';

  h += '<div class="gtitle">Resources</div><div class="group">' +
    numRow('mspeed', 'Mining speed', 'Research level, %', S.mining.speed) +
    numRow('mveins', 'Veins per miner', '0.5 ore/s per vein', S.mining.veins) +
    numRow('moil', 'Oil per extractor', 'Per second, from the seep', S.mining.oil) +
    numRow('morb', 'Collector net yield', '% left after self-power', S.mining.orbital) + '</div>' +
    '<p class="gnote">About 55% of the gross hydrogen is left on a standard gas giant.</p>';

  h += '<div class="gtitle">Display</div><div class="group"><div class="numrow"><label>Appearance</label><div class="seg">';
  [['auto', 'Auto'], ['dark', 'Dark'], ['light', 'Light']].forEach(function (x) { h += '<button type="button" data-theme-set="' + x[0] + '" aria-pressed="' + (S.opts.theme === x[0]) + '">' + x[1] + '</button>'; });
  h += '</div></div></div>';

  h += '<div class="gtitle">Share and backup</div><div class="group">' +
    '<button class="row noic" type="button" data-act="share"><span class="main-t"><span class="t">Copy summary</span><span class="s">Buildings, raw input and every step as text</span></span>' + svg('i-chev', 18).replace('svgi', 'svgi chev') + '</button>' +
    '<button class="row noic" type="button" data-act="code"><span class="main-t"><span class="t">Plan code</span><span class="s">Back up a plan or load one from a friend</span></span>' + svg('i-chev', 18).replace('svgi', 'svgi chev') + '</button>' +
    '<button class="row noic" type="button" id="btnReset" data-armed="0"><span class="main-t"><span class="t" style="color:var(--bad)">Reset everything</span><span class="s">Targets, settings and per-step changes</span></span></button></div>';

  h += '<div class="gtitle">About the data</div><p class="gnote" style="margin-top:0">Recipes, machine speeds and proliferator values come from the open-source FactorioLab dataset for Dyson Sphere Program (October 2026), which includes game update 0.10.34 content such as the Holo Beacon. Power leaves out miners, orbital collectors and pumps. Deuterium fractionation assumes a 1% chance per hydrogen and one machine per full belt.</p>';
  $('#setBody').innerHTML = h;
}

/* ---------- build pane ---------- */
function renderBuild() {
  var T = PLAN.totals, nodes = PLAN.nodes, h = '';
  if (!PLAN.ok) h += '<div class="warnbox">These recipe choices feed each other without producing a surplus, so the plan cannot settle. Change one of the recipes on the map.</div>';
  var steps = PLAN.order.map(function (id) { return nodes[id]; });
  var mrows = Object.keys(T.built).sort(function (a, b) { return T.built[b] - T.built[a]; });
  var total = 0; mrows.forEach(function (m) { total += T.built[m]; });
  h += '<div class="bsec" data-sec="buildings"><div class="gtitle">Buildings to place<span style="margin-left:auto" class="num">' + total.toLocaleString('en-US') + '</span></div><div class="group">';
  mrows.forEach(function (m) {
    var pw = 0; steps.forEach(function (n) { if (n.machine === m) pw += n.power; });
    h += '<div class="row"><span class="ibox">' + machIc(m, 30) + '</span><span class="main-t"><span class="t">' + esc(machName(m)) + '</span><span class="s">' + fmt(T.exact[m]) + ' exact' + (pw ? ' · ' + fmtPower(pw) : '') + '</span></span><span class="end"><b>' + T.built[m].toLocaleString('en-US') + '</b></span></div>';
  });
  if (!mrows.length) h += '<div class="row noic"><span class="s">Nothing to build.</span></div>';
  h += '</div><p class="gnote">' + fmtPower(T.power) + ' with every building running. Miners, collectors and pumps are not counted.</p></div>';

  var outBelts = {}; PLAN.edges.forEach(function (e) { if (!e.fluid) outBelts[e.from] = (outBelts[e.from] || 0) + e.belts; });
  steps.sort(function (a, b) { return (b.power - a.power) || (b.count - a.count); });
  h += '<div class="bsec" data-sec="steps"><div class="gtitle">Production steps<span style="margin-left:auto" class="num">' + steps.length + '</span></div><div class="group">';
  steps.forEach(function (n) {
    var id = n.item, util = n.built ? n.count / n.built : 0;
    h += '<button class="row" type="button" data-sel="' + id + '"><span class="ibox">' + itemIc(id, 30) + '</span><span class="main-t"><span class="t">' + esc(itemName(id)) + '</span>' +
      '<span class="s">' + rateStr(n.outRate[id]) + ul() + ' · ' + esc(machShort(n.machine)) + (n.prof ? ' · Mk.' + ROMAN[n.prof.level] : '') + (outBelts[id] ? ' · ' + outBelts[id] + ' belt' + (outBelts[id] > 1 ? 's' : '') : '') + '</span>' +
      '<span class="bar"><i style="width:' + Math.round(util * 100) + '%;background:' + nodeColor(n) + '"></i></span></span>' +
      '<span class="end"><b>' + n.built + '×</b><small>' + Math.round(util * 100) + '%</small></span>' + svg('i-chev', 16).replace('svgi', 'svgi chev') + '</button>';
  });
  h += '</div><p class="gnote">The bar shows how busy the built machines are. Tap a step to find it on the map.</p></div>';

  var rawKeys = Object.keys(T.raw).sort(function (a, b) { return T.raw[b] - T.raw[a]; });
  h += '<div class="bsec" data-sec="resources"><div class="gtitle">Raw input</div><div class="group">';
  rawKeys.forEach(function (k) {
    var n = nodes[k], src = n && n.kind === 'source' ? n : null;
    h += '<button class="row" type="button" data-sel="' + k + '"><span class="ibox">' + itemIc(k, 30) + '</span><span class="main-t"><span class="t">' + esc(itemName(k)) + '</span><span class="s">' + (src ? src.built + ' × ' + esc(machName(src.machine)) : 'Supplied from elsewhere') + '</span></span>' +
      '<span class="end"><b>' + rateStr(T.raw[k]) + '</b><small>' + ul() + '</small></span></button>';
  });
  h += '</div>';
  var bi = Object.keys(T.beltsByItem).sort(function (a, b) { return T.beltsByItem[b] - T.beltsByItem[a]; });
  h += '<div class="gtitle">Belt lines<span style="margin-left:auto" class="num">' + T.belts + '</span></div><div class="group">';
  bi.forEach(function (k) { h += '<div class="row"><span class="ibox">' + itemIc(k, 30) + '</span><span class="main-t"><span class="t">' + esc(itemName(k)) + '</span></span><span class="end"><b>' + T.beltsByItem[k] + '</b></span></div>'; });
  h += '</div><p class="gnote">Each link on the map is its own line at ' + (BELTS[S.belt] * S.stack) + ' items/s. Merge lines of the same item where you can.</p>';
  var fl = {}; PLAN.edges.forEach(function (e) { if (e.fluid) fl[e.item] = (fl[e.item] || 0) + e.flow; });
  var extra = '';
  Object.keys(fl).forEach(function (k) { extra += '<div class="row"><span class="ibox">' + itemIc(k, 30) + '</span><span class="main-t"><span class="t">' + esc(itemName(k)) + '</span><span class="s">Pipe flow</span></span><span class="end"><b>' + rateStr(fl[k]) + '</b><small>' + ul() + '</small></span></div>'; });
  Object.keys(T.surplus).forEach(function (k) { extra += '<div class="row"><span class="ibox">' + itemIc(k, 30) + '</span><span class="main-t"><span class="t">' + esc(itemName(k)) + '</span><span class="s">Surplus by-product</span></span><span class="end"><b>' + rateStr(T.surplus[k]) + '</b><small>' + ul() + '</small></span></div>'; });
  Object.keys(T.prolif).forEach(function (k) { extra += '<div class="row"><span class="ibox">' + itemIc(k, 30) + '</span><span class="main-t"><span class="t">' + esc(itemName(k)) + '</span><span class="s">Needed for spraying</span></span><span class="end"><b>' + rateStr(T.prolif[k]) + '</b><small>' + ul() + '</small></span></div>'; });
  if (extra) h += '<div class="gtitle">Pipes, surplus, proliferator</div><div class="group">' + extra + '</div>';
  h += '</div>';
  $('#buildBody').innerHTML = h;
}

/* ---------- sheets ---------- */
var openSheets = {};
function openSheet(id, scrim) {
  var el = $('#' + id); el.hidden = false; openSheets[id] = 1;
  if (scrim) { var sc = $('#scrim'); sc.hidden = false; sc.setAttribute('data-for', id); requestAnimationFrame(function () { sc.classList.add('on'); }); }
  requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('on'); }); });
}
function closeSheet(id, instant) {
  var el = $('#' + id); if (!el || el.hidden) return;
  delete openSheets[id];
  el.classList.remove('on'); el.style.transform = '';
  var sc = $('#scrim');
  if (sc.getAttribute('data-for') === id) { sc.classList.remove('on'); setTimeout(function () { if (!sc.classList.contains('on')) sc.hidden = true; }, instant ? 0 : 260); }
  setTimeout(function () { if (!el.classList.contains('on')) el.hidden = true; }, instant ? 0 : 330);
}
function closeInspector(instant) { if (SEL) { SEL = null; applySelection(); } closeSheet('inspector', instant); }

function attachDrag(handle, sheetId, onClose) {
  var y0 = null, dy = 0, t0 = 0, pid = null;
  handle.addEventListener('pointerdown', function (e) {
    if (isWide() || e.target.closest('button, input, select, textarea, .chips')) return;
    y0 = e.clientY; dy = 0; t0 = Date.now(); pid = e.pointerId;
    $('#' + sheetId).classList.add('dragging');
    try { handle.setPointerCapture(pid); } catch (x) { }
  });
  handle.addEventListener('pointermove', function (e) {
    if (y0 === null || e.pointerId !== pid) return;
    dy = Math.max(0, e.clientY - y0);
    $('#' + sheetId).style.transform = 'translateY(' + dy + 'px)';
  });
  function end() {
    if (y0 === null) return;
    var el = $('#' + sheetId); el.classList.remove('dragging');
    var v = dy / Math.max(1, Date.now() - t0);
    y0 = null;
    if (dy > 110 || v > 0.6) onClose(); else el.style.transform = '';
  }
  handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
}

/* ---------- inspector ---------- */
function protoOptions(item, cur) {
  var h = '';
  (CANDS[item] || []).forEach(function (rid) {
    var r = RECIPES[rid];
    var outs = Object.keys(r.out).length > 1 ? ' → ' + Object.keys(r.out).map(itemName).join(' + ') : '';
    h += opt(rid, r.name + outs + (EXCL[rid] ? ' (advanced)' : ''), cur);
  });
  return h;
}
function renderInspector() {
  if (!SEL || !PLAN || !PLAN.nodes[SEL] || PLAN.nodes[SEL].kind === 'target') { closeSheet('inspector'); return; }
  var n = PLAN.nodes[SEL], item = SEL, ov = S.overrides[item] || {};
  $('#inspHead').innerHTML = '<span class="ibox">' + itemIc(item, 34) + '</span><h3>' + esc(itemName(item)) + '<small>' + (n.kind === 'raw' ? 'Supplied from elsewhere' : esc(n.rec.name) + ' · ' + esc(machName(n.machine))) + '</small></h3>' +
    '<button class="btn round" type="button" id="inspClose" aria-label="Close" style="width:36px;height:36px;min-height:36px">' + svg('i-x', 18) + '</button>';
  var h = '';
  if (n.kind !== 'raw') {
    var util = n.built ? Math.round(n.count / n.built * 100) : 0;
    h += '<div class="kpis"><div class="kpi"><b>' + n.built + '</b><span>to build</span></div><div class="kpi"><b>' + rateStr(n.outRate[item]) + '</b><span>' + ul() + ' out</span></div><div class="kpi"><b>' + util + '%</b><span>busy</span></div></div>';
    h += '<p class="hintp">' + fmt(n.count) + ' machines exactly' + (n.power ? ' · ' + fmtPower(n.power) : '') + '</p>';
    var ins = Object.keys(n.inRate);
    if (ins.length) {
      h += '<div class="gtitle">Consumes</div><div class="group">';
      ins.forEach(function (i) { h += '<button class="row" type="button" data-jump="' + i + '"><span class="ibox">' + itemIc(i, 28) + '</span><span class="main-t"><span class="t">' + esc(itemName(i)) + '</span></span><span class="end"><b style="font-size:15px">' + rateStr(n.inRate[i]) + '</b><small>' + ul() + '</small></span></button>'; });
      h += '</div>';
    }
    var outs = Object.keys(n.outRate).filter(function (o) { return o !== item; });
    if (outs.length) {
      h += '<div class="gtitle">Also produces</div><div class="group">';
      outs.forEach(function (o) { h += '<div class="row"><span class="ibox">' + itemIc(o, 28) + '</span><span class="main-t"><span class="t">' + esc(itemName(o)) + '</span></span><span class="end"><b style="font-size:15px">' + rateStr(n.outRate[o]) + '</b><small>' + ul() + '</small></span></div>'; });
      h += '</div>';
    }
    h += '<div class="gtitle">Change this step</div><div class="group">';
    h += '<label class="selrow"><span>Recipe</span><select id="i_rec">' + protoOptions(item, n.rec.id) + '</select></label>';
    h += '<label class="selrow"><span>Building</span><select id="i_mach">';
    n.rec.prod.forEach(function (m) { h += opt(m, machName(m), n.machine); });
    h += '</select></label>';
    var pv = ov.prolif ? ov.prolif.level + ':' + ov.prolif.mode : 'global';
    h += '<label class="selrow"><span>Proliferator</span><select id="i_pro">' + opt('global', 'Same as settings', pv) + opt('0:products', 'Off', pv);
    [1, 2, 3].forEach(function (l) { h += opt(l + ':products', 'Mk.' + ROMAN[l] + ' extra products', pv) + opt(l + ':speed', 'Mk.' + ROMAN[l] + ' speed up', pv); });
    h += '</select></label>';
    h += '<label class="togrow"><span>Supplied from elsewhere<small class="mut" style="display:block;font-size:12.5px">Stop building its ingredients</small></span><input class="switch" type="checkbox" id="i_ext"' + (ov.external ? ' checked' : '') + '></label></div>';
    if (S.prolif.level && !n.prof && !n.rec.prolif && S.prolif.mode === 'products') h += '<p class="hintp">This recipe does not accept extra products.</p>';
  } else {
    h += '<div class="kpis"><div class="kpi"><b>' + rateStr(n.rate) + '</b><span>' + ul() + ' needed</span></div></div>';
    h += '<div class="gtitle">Change this step</div><div class="group"><label class="togrow"><span>Supplied from elsewhere</span><input class="switch" type="checkbox" id="i_ext" checked></label></div>';
  }
  if (S.overrides[item]) h += '<div class="sh-actions"><button class="btn" type="button" id="i_reset">Undo changes to this step</button></div>';
  $('#inspBody').innerHTML = h;
  if ($('#inspector').hidden) openSheet('inspector', false);
}

/* ---------- picker ---------- */
var pickCb = null, pickCat = 'all';
var CATS = [['all', 'All'], ['science', 'Matrices'], ['components', 'Components'], ['buildings', 'Buildings'], ['df', 'Dark Fog']];
function openPicker(cb) {
  pickCb = cb; pickCat = 'all';
  var s = $('#pickSearch'); s.value = '';
  renderPickCats(); renderPickGrid('');
  openSheet('picker', true);
  if (isWide()) setTimeout(function () { s.focus(); }, 250);
}
function renderPickCats() {
  $('#pickCats').innerHTML = CATS.map(function (c) { return '<button type="button" class="chip" data-cat="' + c[0] + '" aria-pressed="' + (pickCat === c[0]) + '">' + c[1] + '</button>'; }).join('');
}
function itemCat(it) {
  if (it.id.indexOf('df-') === 0) return 'df';
  if (/-matrix$/.test(it.id)) return 'science';
  return it.cat === 'buildings' ? 'buildings' : 'components';
}
function renderPickGrid(q) {
  q = q.trim().toLowerCase();
  var groups = { science: [], components: [], buildings: [], df: [] };
  DATA.items.forEach(function (it) {
    if (!CANDS[it.id]) return;
    if (q && it.name.toLowerCase().indexOf(q) < 0) return;
    var c = itemCat(it);
    if (pickCat !== 'all' && pickCat !== c) return;
    groups[c].push(it);
  });
  var h = '';
  [['science', 'Matrices'], ['components', 'Components'], ['buildings', 'Buildings'], ['df', 'Dark Fog']].forEach(function (g) {
    var list = groups[g[0]]; if (!list.length) return;
    h += '<div class="grp">' + g[1] + '</div><div class="igrid">';
    list.forEach(function (it) { h += '<button type="button" class="ibtn" data-item="' + it.id + '"><span class="ibox">' + ic(it.ic, 40) + '</span><span class="t">' + esc(it.name) + '</span></button>'; });
    h += '</div>';
  });
  $('#pickGrid').innerHTML = h || '<p class="hintp" style="padding:20px 0;text-align:center">No item matches “' + esc(q) + '”.</p>';
}

/* ---------- export ---------- */
function summaryText() {
  var T = PLAN.totals, lines = [];
  lines.push('Dyson Sphere plan');
  lines.push('Targets: ' + S.targets.map(function (t) { return t.rate + ul() + ' ' + itemName(t.item); }).join(', '));
  lines.push('Power: ' + fmtPower(T.power) + ' | Belt lines: ' + T.belts + ' (' + BELTS[S.belt] * S.stack + ' items/s each)');
  lines.push(''); lines.push('Buildings');
  Object.keys(T.built).sort(function (a, b) { return T.built[b] - T.built[a]; }).forEach(function (m) { lines.push('  ' + T.built[m] + ' x ' + machName(m)); });
  lines.push(''); lines.push('Raw input' + ul());
  Object.keys(T.raw).forEach(function (k) { lines.push('  ' + itemName(k) + ': ' + rateStr(T.raw[k])); });
  lines.push(''); lines.push('Steps');
  PLAN.order.forEach(function (id) { var n = PLAN.nodes[id]; lines.push('  ' + itemName(id) + ': ' + rateStr(n.outRate[id]) + ul() + ' in ' + n.built + ' x ' + machName(n.machine) + ' (' + fmt(n.count) + ' exact)'); });
  return lines.join('\n');
}
var expMode = 'summary';
function openExport(mode) {
  expMode = mode;
  $$('[data-exp]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-exp') === mode); });
  $('#expText').value = mode === 'summary' ? summaryText() : JSON.stringify(S);
  $('#expText').readOnly = mode === 'summary';
  $('#expHint').textContent = mode === 'summary' ? 'Paste this into a note, Discord or a message.' : 'Copy this code to back up the plan. To load one, paste a code here and tap Load.';
  $('#expLoad').hidden = mode !== 'code';
  $('#expShare').hidden = !(navigator.share && !inFrame());
  $('#expMsg').textContent = '';
  if ($('#export').hidden) openSheet('export', true);
}
function copyText(txt) {
  var msg = $('#expMsg');
  var fail = function () { msg.textContent = 'Copy was blocked. Press and hold the text, then choose Select All and Copy.'; var ta = $('#expText'); ta.focus(); ta.select(); };
  try { navigator.clipboard.writeText(txt).then(function () { msg.textContent = 'Copied.'; }, fail); } catch (e) { fail(); }
}

/* ---------- toast ---------- */
var toastTimer = null;
function toast(text, actionLabel, action) {
  var el = $('#toast');
  el.innerHTML = '<span>' + esc(text) + '</span>' + (actionLabel ? '<button class="btn" type="button" id="toastAct">' + esc(actionLabel) + '</button>' : '');
  el.hidden = false;
  if (actionLabel) $('#toastAct').onclick = function () { el.hidden = true; action(); };
  clearTimeout(toastTimer);
  if (!actionLabel) toastTimer = setTimeout(function () { el.hidden = true; }, 3400);
}

/* ---------- compute ---------- */
var recalcTimer = null;
function recalcSoon() { clearTimeout(recalcTimer); recalcTimer = setTimeout(recalc, 160); }
function recalc() {
  saveState();
  PLAN = solve(buildCfg());
  if (SEL && !PLAN.nodes[SEL]) SEL = null;
  renderPlanLive(); renderMap(); renderBuild();
  if (SEL) renderInspector(); else closeSheet('inspector');
}

/* ---------- map focus ---------- */
function centerNode(id) {
  if (!LAYOUT) return;
  var ln = null; LAYOUT.nodes.forEach(function (n) { if (n.id === id) ln = n; });
  if (!ln) return;
  var vp = $('#viewport'), vw = vp.clientWidth, vh = vp.clientHeight;
  var k = Math.max(VIEW.k, isWide() ? 0.75 : 0.9);
  var visH = vh, cx = vw / 2;
  if (!isWide()) visH = vh * 0.42; else cx = (vw - 380) / 2;
  VIEW.k = k; VIEW.x = cx - (ln.x + NW / 2) * k; VIEW.y = Math.max(60, visH / 2 + 20) - (ln.y + ln.h / 2) * k;
  var st = $('#stage'); st.classList.add('anim'); applyView(); setTimeout(function () { st.classList.remove('anim'); }, 340);
}
function focusNode(id) {
  if (!PLAN.nodes[id]) return;
  if (!isWide()) setTab('map'); else setMain('map');
  requestAnimationFrame(function () { selectNode(id); centerNode(SEL); });
}
function selectNode(id) {
  if (!PLAN || !PLAN.nodes[id]) return;
  if (PLAN.nodes[id].kind === 'target') { id = PLAN.nodes[id].item; if (!PLAN.nodes[id]) return; }
  SEL = id; applySelection(); renderInspector();
}
function setOverride(item, key, val) {
  var o = S.overrides[item] || (S.overrides[item] = {});
  if (val === undefined || val === null || val === false) delete o[key]; else o[key] = val;
  if (!Object.keys(o).length) delete S.overrides[item];
}

/* ---------- events ---------- */
function clampNum(id, v) { var c = NUMS[id]; return Math.min(c[3], Math.max(c[2], v)); }
function wire() {
  document.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var a;
    if ((a = b.getAttribute('data-tab')) && b.closest('.tabbar')) { setTab(a); return; }
    if ((a = b.getAttribute('data-side')) && b.closest('.wide-head')) { setSide(a); return; }
    if ((a = b.getAttribute('data-main')) && b.closest('.wide-head')) { setMain(a); return; }
    if ((a = b.getAttribute('data-bsec'))) { S.bsec = a; syncNav(); saveState(); $('#buildBody').scrollTop = 0; return; }
    if ((a = b.getAttribute('data-goto'))) { if (isWide()) setMain(a); else setTab(a); return; }
    if ((a = b.getAttribute('data-act'))) { if (a === 'share') openExport('summary'); if (a === 'code') openExport('code'); return; }
    if ((a = b.getAttribute('data-close'))) { closeSheet(a); return; }
  });

  // plan pane
  var plan = $('#planBody');
  plan.addEventListener('click', function (e) {
    var t = e.target.closest('button'); if (!t) return;
    if (t.hasAttribute('data-unit')) {
      var nu = t.getAttribute('data-unit'); if (nu === S.unit) return;
      var f = nu === 'min' ? 60 : 1 / 60;
      S.targets.forEach(function (x) { x.rate = +(x.rate * f).toPrecision(6); });
      S.unit = nu; renderPlan(); recalc(); return;
    }
    if (t.hasAttribute('data-del')) { S.targets.splice(+t.getAttribute('data-del'), 1); renderPlan(); recalc(); return; }
    if (t.hasAttribute('data-pick')) { var i = +t.getAttribute('data-pick'); openPicker(function (id) { S.targets[i].item = id; renderPlan(); recalc(); }); return; }
    if (t.hasAttribute('data-tstep')) {
      var j = +t.getAttribute('data-tstep'), dir = +t.getAttribute('data-dir'), v = S.targets[j].rate;
      var s = stepFor(v, dir), nv = dir > 0 ? Math.floor(v / s + 1e-9) * s + s : Math.ceil(v / s - 1e-9) * s - s;
      S.targets[j].rate = Math.max(0, +nv.toPrecision(6));
      var inp = $('#rate' + j); if (inp) inp.value = S.targets[j].rate;
      recalcSoon(); return;
    }
    if (t.id === 'addTarget') { openPicker(function (id) { S.targets.push({ item: id, rate: S.unit === 'min' ? 60 : 1 }); renderPlan(); recalc(); }); return; }
    if (t.hasAttribute('data-preset')) {
      var p = PRESETS.filter(function (x) { return x.id === t.getAttribute('data-preset'); })[0];
      S.targets = p.items.map(function (x) { return { item: x[0], rate: S.unit === 'min' ? x[1] : +(x[1] / 60).toPrecision(6) }; });
      SEL = null; LAST_SIG = ''; renderPlan(); recalc(); toast('Loaded ' + p.name.toLowerCase());
    }
  });
  plan.addEventListener('input', function (e) {
    var t = e.target; if (!t.hasAttribute('data-rate')) return;
    var v = parseFloat(String(t.value).replace(',', '.'));
    S.targets[+t.getAttribute('data-rate')].rate = isFinite(v) && v > 0 ? v : 0; recalcSoon();
  });
  plan.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });

  // settings pane
  var set = $('#setBody');
  set.addEventListener('click', function (e) {
    var t = e.target.closest('button'); if (!t) return;
    var a;
    if ((a = t.getAttribute('data-mtier'))) { S.machines[a] = t.getAttribute('data-val'); renderSettings(); recalc(); return; }
    if ((a = t.getAttribute('data-belt'))) { S.belt = a; renderSettings(); recalc(); return; }
    if ((a = t.getAttribute('data-stack'))) { S.stack = +a; renderSettings(); recalc(); return; }
    if ((a = t.getAttribute('data-plevel')) !== null) { S.prolif.level = +a; renderSettings(); recalc(); return; }
    if ((a = t.getAttribute('data-pmode'))) { S.prolif.mode = a; renderSettings(); recalc(); return; }
    if ((a = t.getAttribute('data-theme-set'))) { S.opts.theme = a; applyTheme(); renderSettings(); saveState(); return; }
    if ((a = t.getAttribute('data-nstep'))) {
      var c = NUMS[a], cur = S.mining[c[0]], nv = clampNum(a, +(cur + c[1] * +t.getAttribute('data-dir')).toPrecision(6));
      S.mining[c[0]] = nv; $('#' + a).value = nv; recalcSoon(); return;
    }
    if (t.id === 'btnInstall' && window.__installPrompt) { window.__installPrompt.prompt(); window.__installPrompt = null; renderSettings(); return; }
    if (t.id === 'btnReset') {
      if (t.getAttribute('data-armed') !== '1') { t.setAttribute('data-armed', '1'); t.querySelector('.t').textContent = 'Tap again to reset everything'; return; }
      var th = S.opts.theme; S = defaultState(); S.opts.theme = th; SEL = null; LAST_SIG = ''; renderAll(); toast('Plan reset');
    }
  });
  set.addEventListener('input', function (e) {
    var t = e.target; if (!NUMS[t.id]) return;
    var v = parseFloat(String(t.value).replace(',', '.'));
    if (isFinite(v)) { S.mining[NUMS[t.id][0]] = clampNum(t.id, v); recalcSoon(); }
  });
  set.addEventListener('change', function (e) { var t = e.target; if (NUMS[t.id]) t.value = S.mining[NUMS[t.id][0]]; });

  // build pane
  $('#buildBody').addEventListener('click', function (e) { var r = e.target.closest('[data-sel]'); if (r) focusNode(r.getAttribute('data-sel')); });
  $('#buildBody').addEventListener('scroll', function () { $('#pane-build').classList.toggle('scrolled', this.scrollTop > 4); }, { passive: true });
  $('#planBody').addEventListener('scroll', function () { $('#pane-plan').classList.toggle('scrolled', this.scrollTop > 4); }, { passive: true });
  $('#setBody').addEventListener('scroll', function () { $('#pane-settings').classList.toggle('scrolled', this.scrollTop > 4); }, { passive: true });

  // picker
  $('#pickSearch').addEventListener('input', function (e) { renderPickGrid(e.target.value); });
  $('#pickCats').addEventListener('click', function (e) { var c = e.target.closest('[data-cat]'); if (!c) return; pickCat = c.getAttribute('data-cat'); renderPickCats(); renderPickGrid($('#pickSearch').value); });
  $('#pickGrid').addEventListener('click', function (e) {
    var b = e.target.closest('[data-item]'); if (!b) return;
    closeSheet('picker'); $('#pickSearch').blur(); if (pickCb) pickCb(b.getAttribute('data-item'));
  });
  $('#scrim').addEventListener('click', function () { var f = this.getAttribute('data-for'); if (f) closeSheet(f); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeSheet('picker'); closeSheet('export'); closeInspector(); } });
  attachDrag($('[data-grab="picker"]'), 'picker', function () { closeSheet('picker'); });
  attachDrag($('[data-grab="export"]'), 'export', function () { closeSheet('export'); });
  attachDrag($('#inspGrab'), 'inspector', function () { closeInspector(); });

  // export
  $$('[data-exp]').forEach(function (b) { b.addEventListener('click', function () { openExport(b.getAttribute('data-exp')); }); });
  $('#expCopy').addEventListener('click', function () { copyText($('#expText').value); });
  $('#expShare').addEventListener('click', function () {
    try { navigator.share({ title: 'Dyson Sphere plan', text: $('#expText').value }).catch(function () { }); } catch (e) { }
  });
  $('#expLoad').addEventListener('click', function () {
    try { S = mergeState(defaultState(), JSON.parse($('#expText').value)); SEL = null; LAST_SIG = ''; renderAll(); closeSheet('export'); toast('Plan loaded'); }
    catch (err) { $('#expMsg').textContent = 'That code could not be read. Paste a code copied from this app.'; }
  });

  // map controls
  $('#btnLayers').addEventListener('click', function () { var l = $('#layers'); l.hidden = !l.hidden; this.setAttribute('aria-expanded', !l.hidden); });
  $('#optSpray').addEventListener('change', function (e) { S.opts.spray = e.target.checked; LAST_SIG = ''; recalc(); });
  $('#optLabels').addEventListener('change', function (e) { S.opts.labels = e.target.checked; $('#stage').classList.toggle('nolabels', !S.opts.labels); saveState(); });
  $('#zin').addEventListener('click', function () { var v = $('#viewport'); zoomAt(v.clientWidth / 2, v.clientHeight / 2, 1.3); });
  $('#zout').addEventListener('click', function () { var v = $('#viewport'); zoomAt(v.clientWidth / 2, v.clientHeight / 2, 0.77); });
  $('#zfit').addEventListener('click', function () { var st = $('#stage'); st.classList.add('anim'); FIT_ALL = true; fitView(); FIT_ALL = false; setTimeout(function () { st.classList.remove('anim'); }, 340); });

  // pan / pinch / tap / double-tap
  var vp = $('#viewport'), ptrs = {}, moved = 0, pinch = 0, downTarget = null, lastTap = 0, lastXY = null;
  vp.addEventListener('wheel', function (e) {
    e.preventDefault(); var r = vp.getBoundingClientRect();
    var f = e.ctrlKey ? Math.exp(-e.deltaY * 0.01) : Math.exp(-e.deltaY * 0.0015);
    if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) { VIEW.x -= e.deltaX; applyView(); return; }
    zoomAt(e.clientX - r.left, e.clientY - r.top, f);
  }, { passive: false });
  ['gesturestart', 'gesturechange'].forEach(function (ev) { vp.addEventListener(ev, function (e) { e.preventDefault(); }, { passive: false }); });
  vp.addEventListener('pointerdown', function (e) {
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; moved = 0; downTarget = e.target;
    try { vp.setPointerCapture(e.pointerId); } catch (x) { }
    vp.classList.add('drag'); $('#layers').hidden = true;
    var ks = Object.keys(ptrs);
    if (ks.length === 2) { var a = ptrs[ks[0]], b = ptrs[ks[1]]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  vp.addEventListener('pointermove', function (e) {
    var p = ptrs[e.pointerId]; if (!p) return;
    var ks = Object.keys(ptrs);
    if (ks.length >= 2) {
      var ox = p.x, oy = p.y;
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      var a = ptrs[ks[0]], b = ptrs[ks[1]], d = Math.hypot(a.x - b.x, a.y - b.y), r = vp.getBoundingClientRect();
      if (pinch) zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, d / pinch);
      VIEW.x += (e.clientX - ox) / 2; VIEW.y += (e.clientY - oy) / 2; applyView();
      pinch = d; moved += 20; return;
    }
    var dx = e.clientX - p.x, dy = e.clientY - p.y;
    moved += Math.abs(dx) + Math.abs(dy); p.x = e.clientX; p.y = e.clientY;
    VIEW.x += dx; VIEW.y += dy; applyView();
  });
  function up(e) { delete ptrs[e.pointerId]; if (Object.keys(ptrs).length < 2) pinch = 0; if (!Object.keys(ptrs).length) vp.classList.remove('drag'); }
  vp.addEventListener('pointerup', function (e) {
    var wasTap = moved < 8 && Object.keys(ptrs).length === 1;
    up(e); if (!wasTap) return;
    var n = downTarget && downTarget.closest ? downTarget.closest('.node') : null;
    var now = Date.now(), r = vp.getBoundingClientRect();
    if (!n && now - lastTap < 300 && lastXY && Math.hypot(e.clientX - lastXY[0], e.clientY - lastXY[1]) < 30) {
      var st = $('#stage'); st.classList.add('anim'); zoomAt(e.clientX - r.left, e.clientY - r.top, 1.8); setTimeout(function () { st.classList.remove('anim'); }, 340);
      lastTap = 0; return;
    }
    lastTap = now; lastXY = [e.clientX, e.clientY];
    if (n) {
      selectNode(n.getAttribute('data-id'));
      if (!isWide()) { var nb = n.getBoundingClientRect(); if (nb.bottom > r.top + r.height * 0.42) centerNode(SEL); }
    } else closeInspector();
  });
  vp.addEventListener('pointercancel', up);

  // inspector
  $('#inspector').addEventListener('change', function (e) {
    var t = e.target; if (!SEL) return;
    if (t.id === 'i_rec') { setOverride(SEL, 'recipe', t.value === defaultRecipeFor(SEL) ? null : t.value); setOverride(SEL, 'machine', null); }
    else if (t.id === 'i_mach') setOverride(SEL, 'machine', t.value);
    else if (t.id === 'i_pro') { if (t.value === 'global') setOverride(SEL, 'prolif', null); else { var q = t.value.split(':'); setOverride(SEL, 'prolif', { level: +q[0], mode: q[1] }); } }
    else if (t.id === 'i_ext') setOverride(SEL, 'external', t.checked);
    LAST_SIG = ''; recalc();
  });
  $('#inspector').addEventListener('click', function (e) {
    var t = e.target.closest('button'); if (!t) return;
    if (t.id === 'inspClose') closeInspector();
    else if (t.id === 'i_reset') { delete S.overrides[SEL]; LAST_SIG = ''; recalc(); }
    else if (t.hasAttribute('data-jump')) { var id = t.getAttribute('data-jump'); if (PLAN.nodes[id]) { selectNode(id); centerNode(id); } }
  });

  var lastW = window.innerWidth, lastH = window.innerHeight;
  window.addEventListener('resize', function () {
    if (Math.abs(window.innerWidth - lastW) < 2 && Math.abs(window.innerHeight - lastH) < 120) return; // ignore keyboard show/hide
    lastW = window.innerWidth; lastH = window.innerHeight;
    if (isWide() && S.tab !== S.main && (S.tab === 'map' || S.tab === 'build')) S.main = S.tab;
    renderSettings(); syncNav(); fitView();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener && window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
}

function renderAll() { applyTheme(); syncNav(); renderPlan(); renderSettings(); $('#optSpray').checked = !!S.opts.spray; $('#optLabels').checked = !!S.opts.labels; recalc(); }

/* ---------- PWA ---------- */
function registerSW() {
  if (!('serviceWorker' in navigator) || inFrame() || location.protocol === 'file:') return;
  try {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing; if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('A new version is ready', 'Reload', function () { nw.postMessage('skip'); });
        });
      });
    }).catch(function () { });
    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (!reloading) { reloading = true; location.reload(); } });
  } catch (e) { }
}
window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); window.__installPrompt = e; if (S) renderSettings(); });

/* ---------- boot ---------- */
function boot() {
  initEngine(DATA);
  S = loadState();
  if (isWide()) { S.tab = S.main === 'build' ? 'build' : 'map'; }
  wire(); renderAll();
  requestAnimationFrame(function () { fitView(); });
  registerSW();
}
boot();
