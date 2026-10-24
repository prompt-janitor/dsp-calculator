/* ---------- Engine: pure calculation, no DOM ---------- */
// Filled by initEngine().
export let DATA = null;
export const RECIPES = {}, ITEMS = {}, CANDS = {}, EXCL = {};
export const MACH_CLASS = {
  'arc-smelter': 'smelter', 'plane-smelter': 'smelter', 'df-negentropy-smelter': 'smelter',
  'assembling-machine-1': 'assembler', 'assembling-machine-2': 'assembler', 'assembling-machine-3': 'assembler', 'df-recomposing-assembler': 'assembler',
  'chemical-plant': 'chem', 'quantum-chemical-plant': 'chem',
  'matrix-lab': 'lab', 'df-self-evolution-lab': 'lab',
  'mining-machine': 'miner', 'advanced-mining-machine': 'miner'
};
const FLUIDS = { 'water': 1, 'crude-oil': 1, 'refined-oil': 1, 'sulfuric-acid': 1 };
export const BELTS = { 'conveyor-belt-1': 6, 'conveyor-belt-2': 12, 'conveyor-belt-3': 30 };
const DEFAULT_PICK = {
  'deuterium': 'deuterium-fractionation',
  'critical-photon': 'critical-photon',
  'hydrogen': 'gas-giant-hydrogen',
  'refined-oil': 'plasma-refining'
};

export function initEngine(D) {
  DATA = D;
  // The source data lists deuterium fractionation as 0.01 : 0.01, which hides the 1% chance.
  // In game, each hydrogen has a 1% chance to become deuterium and a fractionator handles one belt of hydrogen.
  D.recipes.forEach(function (r) {
    if (r.id === 'deuterium-fractionation') { r.in = { 'hydrogen': 1 }; r.out = { 'deuterium': 0.01 }; r.time = 1; }
  });
  D.excluded.forEach(function (id) { EXCL[id] = 1; });
  delete EXCL['fire-ice-vein'];
  D.recipes.forEach(function (r) {
    RECIPES[r.id] = r;
    Object.keys(r.out).forEach(function (o) { (CANDS[o] = CANDS[o] || []).push(r.id); });
  });
  D.items.forEach(function (i) { ITEMS[i.id] = i; });
}

export function defaultRecipeFor(item) {
  var c = CANDS[item];
  if (!c || !c.length) return null;
  if (DEFAULT_PICK[item] && RECIPES[DEFAULT_PICK[item]]) return DEFAULT_PICK[item];
  var ok = c.filter(function (id) { return !EXCL[id]; });
  if (!ok.length) ok = c;
  var single = ok.filter(function (id) { var r = RECIPES[id]; return r.mining && Object.keys(r.out).length === 1; });
  if (single.length) return single[0];
  var prim = ok.filter(function (id) { return Object.keys(RECIPES[id].out)[0] === item; });
  return (prim[0] || ok[0]);
}

function beltCap(cfg) { return (BELTS[cfg.belt] || 30) * (cfg.stack || 1); }

function pickMachine(rec, cfg, ovMachine) {
  if (ovMachine && rec.prod.indexOf(ovMachine) >= 0) return ovMachine;
  for (var i = 0; i < rec.prod.length; i++) {
    var p = rec.prod[i];
    if (cfg.machines[MACH_CLASS[p]] === p) return p;
  }
  return rec.prod[0];
}

function sumVals(o) { var s = 0; for (var k in o) s += o[k]; return s; }

/* cfg: {targets:[{item,rate(/s)}], machines:{}, belt, stack, prolif:{level,mode}, mining:{speed,veins,oil}, overrides:{item:{recipe,machine,prolif,external}}} */
export function solve(cfg) {
  var MODS = DATA.mods, MACH = DATA.machines;
  var ov = cfg.overrides || {};
  var cap = beltCap(cfg);
  var recipeOf = {}, raw = {};
  var work = [];
  cfg.targets.forEach(function (t) { if (t.item && t.rate > 0) work.push(t.item); });

  function profFor(item, rec) {
    var o = ov[item] && ov[item].prolif;
    var p = o ? o : cfg.prolif;
    if (!p || !p.level) return null;
    if (rec.mining || rec.id.indexOf('proliferator-') === 0 || rec.id.indexOf('critical-photon') === 0) return null;
    if (Object.keys(rec.in).length === 0) return null;
    var key = 'proliferator-' + p.level + (p.mode === 'speed' ? '-speed' : '-products');
    var m = MODS[key];
    if (!m) return null;
    if (p.mode !== 'speed' && !rec.prolif) return null;
    return { level: p.level, mode: p.mode === 'speed' ? 'speed' : 'products', item: m.proliferator, sprays: m.sprays,
      prod: m.productivity || 0, speed: m.speed || 0, cons: m.consumption };
  }

  var profItems = {};
  function expand() {
    while (work.length) {
      var it = work.pop();
      if (recipeOf[it] || raw[it]) continue;
      var o = ov[it];
      if (o && o.external) { raw[it] = 1; continue; }
      var rid = (o && o.recipe && RECIPES[o.recipe]) ? o.recipe : defaultRecipeFor(it);
      if (!rid) { raw[it] = 1; continue; }
      recipeOf[it] = rid;
      var r = RECIPES[rid];
      Object.keys(r.in).forEach(function (i) { work.push(i); });
      var pf = profFor(it, r);
      if (pf && !profItems[pf.item]) { profItems[pf.item] = 1; work.push(pf.item); }
      var mid = pickMachine(r, cfg, o && o.machine);
      var mc = MACH[mid] && MACH[mid].cons;
      if (mc) Object.keys(mc).forEach(function (i) { work.push(i); });
    }
  }
  expand();

  var items = Object.keys(recipeOf);
  var nodes = {};
  items.forEach(function (it) {
    var r = RECIPES[recipeOf[it]];
    var o = ov[it] || {};
    var mid = pickMachine(r, cfg, o.machine);
    nodes[it] = { item: it, rec: r, machine: mid, mach: MACH[mid], prof: profFor(it, r), runs: 0, kind: r.mining ? 'source' : 'craft' };
  });

  // effective speed of a machine for a node (items processed per second multiplier)
  function nodeSpeed(n) {
    var m = n.mach, r = n.rec, s = m.speed || 1;
    if (n.machine === 'fractionator') s = cap;
    else if (r.mining && (n.machine === 'mining-machine' || n.machine === 'advanced-mining-machine'))
      s = s * (cfg.mining.veins || 1) * ((cfg.mining.speed || 100) / 100);
    else if (n.machine === 'orbital-collector') s = s * ((cfg.mining.orbital || 55) / 100);
    else if (n.machine === 'oil-extractor') s = (cfg.mining.oil || 1) * ((cfg.mining.speed || 100) / 100);
    if (n.prof && n.prof.mode === 'speed') s *= (1 + n.prof.speed);
    return s;
  }

  var D = {}, S = {}, ok = true, iter;
  for (iter = 0; iter < 600; iter++) {
    D = {}; S = {};
    cfg.targets.forEach(function (t) { if (t.item && t.rate > 0) D[t.item] = (D[t.item] || 0) + t.rate; });
    items.forEach(function (it) {
      var n = nodes[it], r = n.rec, runs = n.runs;
      for (var i in r.in) D[i] = (D[i] || 0) + runs * r.in[i];
      if (n.prof) D[n.prof.item] = (D[n.prof.item] || 0) + runs * sumVals(r.in) / n.prof.sprays;
      var cons = n.mach && n.mach.cons;
      if (cons) {
        var cnt = runs * r.time / nodeSpeed(n);
        for (var c in cons) D[c] = (D[c] || 0) + cnt * cons[c];
      }
      var pm = n.prof && n.prof.mode === 'products' ? 1 + n.prof.prod : 1;
      for (var o in r.out) if (o !== it) S[o] = (S[o] || 0) + runs * r.out[o] * pm;
    });
    var delta = 0, blow = false;
    items.forEach(function (it) {
      var n = nodes[it];
      var need = Math.max(0, (D[it] || 0) - (S[it] || 0));
      var pm = n.prof && n.prof.mode === 'products' ? 1 + n.prof.prod : 1;
      var nr = need / (n.rec.out[it] * pm);
      delta = Math.max(delta, Math.abs(nr - n.runs) / (1 + Math.abs(nr)));
      n.runs = nr;
      if (nr > 1e9) blow = true;
    });
    if (blow) { ok = false; break; }
    if (delta < 1e-10) break;
  }
  if (iter >= 600) ok = false;

  // finalize quantities
  var totals = { power: 0, built: {}, exact: {}, belts: 0, beltsByItem: {}, raw: {}, surplus: {}, prolif: {} };
  items.forEach(function (it) {
    var n = nodes[it], r = n.rec;
    var sp = nodeSpeed(n);
    n.count = n.runs * r.time / sp;
    n.built = n.count > 1e-9 ? Math.ceil(n.count - 1e-9) : 0;
    var pm = n.prof && n.prof.mode === 'products' ? 1 + n.prof.prod : 1;
    n.outRate = {};
    for (var o in r.out) n.outRate[o] = n.runs * r.out[o] * pm;
    n.inRate = {};
    for (var i in r.in) n.inRate[i] = n.runs * r.in[i];
    var pw = (n.mach.usage || 0) * (n.prof ? 1 + n.prof.cons : 1);
    if (n.machine === 'mining-machine') pw = 0;
    n.power = n.built * pw;           // kW if all built machines run
    n.powerAvg = n.count * pw;
    totals.power += n.power;
    totals.built[n.machine] = (totals.built[n.machine] || 0) + n.built;
    totals.exact[n.machine] = (totals.exact[n.machine] || 0) + n.count;
    if (n.kind === 'source') totals.raw[it] = D[it] || 0;
    if (n.prof) totals.prolif[n.prof.item] = (D[n.prof.item] || 0);
  });
  // raw (externally supplied) items
  var rawNodes = {};
  Object.keys(raw).forEach(function (it) {
    var net = Math.max(0, (D[it] || 0) - (S[it] || 0));
    rawNodes[it] = { item: it, kind: 'raw', runs: 0, rate: net };
    totals.raw[it] = net;
  });
  // surplus byproducts
  Object.keys(S).forEach(function (it) {
    var extra = S[it] - (D[it] || 0);
    if (extra > 1e-9) totals.surplus[it] = extra;
  });

  // ---------- Build graph edges ----------
  var gNodes = {}, edges = [];
  items.forEach(function (it) { gNodes[it] = nodes[it]; });
  Object.keys(rawNodes).forEach(function (it) { gNodes[it] = rawNodes[it]; });

  // consumers per item
  var cons = {};
  function addCons(item, id, amt, kind) { (cons[item] = cons[item] || []).push({ id: id, amt: amt, kind: kind || 'item' }); }
  items.forEach(function (it) {
    var n = nodes[it], r = n.rec;
    for (var i in r.in) addCons(i, it, n.runs * r.in[i]);
    if (n.prof) addCons(n.prof.item, it, n.runs * sumVals(r.in) / n.prof.sprays, 'spray');
    var mc = n.mach && n.mach.cons;
    if (mc) { var cnt = n.runs * r.time / nodeSpeed(n); for (var c in mc) addCons(c, it, cnt * mc[c], 'lens'); }
  });
  cfg.targets.forEach(function (t, idx) {
    if (!t.item || !(t.rate > 0)) return;
    var sid = '__target_' + t.item;
    if (!gNodes[sid]) gNodes[sid] = { item: t.item, kind: 'target', rate: 0, id: sid };
    gNodes[sid].rate += t.rate;
  });
  Object.keys(gNodes).forEach(function (k) { if (gNodes[k].kind === 'target') addCons(gNodes[k].item, k, gNodes[k].rate); });

  Object.keys(cons).forEach(function (item) {
    var list = cons[item];
    var total = list.reduce(function (a, c) { return a + c.amt; }, 0);
    if (total <= 1e-12) return;
    var credit = Math.min(S[item] || 0, total);
    var primary = total - credit;
    var prov = [];
    if (credit > 1e-12) {
      var tot = 0;
      items.forEach(function (it) {
        if (it !== item && nodes[it].rec.out[item]) {
          var pm = nodes[it].prof && nodes[it].prof.mode === 'products' ? 1 + nodes[it].prof.prod : 1;
          var s = nodes[it].runs * nodes[it].rec.out[item] * pm;
          if (s > 1e-12) { prov.push({ id: it, s: s }); tot += s; }
        }
      });
      prov.forEach(function (p) { p.s = p.s / tot * credit; });
    }
    list.forEach(function (c) {
      var share = c.amt / total;
      if (primary > 1e-12 && gNodes[item]) edges.push({ from: item, to: c.id, item: item, flow: primary * share, kind: c.kind, by: false });
      prov.forEach(function (p) { edges.push({ from: p.id, to: c.id, item: item, flow: p.s * share, kind: c.kind, by: true }); });
    });
  });

  // belts per edge
  edges.forEach(function (e) {
    e.fluid = !!FLUIDS[e.item];
    if (e.fluid) { e.belts = 0; }
    else { e.belts = Math.max(1, Math.ceil(e.flow / cap - 1e-9)); }
    e.util = e.fluid ? 0 : e.flow / (e.belts * cap);
    if (!e.fluid) {
      totals.belts += e.belts;
      totals.beltsByItem[e.item] = (totals.beltsByItem[e.item] || 0) + e.belts;
    }
  });

  return { ok: ok, iterations: iter, nodes: gNodes, edges: edges, totals: totals, D: D, S: S, cap: cap, order: items };
}

/* ---------- Formatting ---------- */
export function fmt(n, d) {
  if (!isFinite(n)) return '–';
  var a = Math.abs(n);
  if (a === 0) return '0';
  if (a >= 1000) return Math.round(n).toLocaleString('en-US');
  if (a >= 100) return n.toFixed(d === undefined ? 0 : d);
  if (a >= 10) return n.toFixed(d === undefined ? 1 : d);
  if (a >= 1) return n.toFixed(d === undefined ? 2 : d);
  if (a >= 0.01) return n.toFixed(3);
  return n.toPrecision(2);
}
export function fmtPower(kw) {
  if (kw >= 1e6) return (kw / 1e6).toFixed(2) + ' GW';
  if (kw >= 1000) return (kw / 1000).toFixed(kw >= 100000 ? 0 : 1) + ' MW';
  return Math.round(kw) + ' kW';
}
