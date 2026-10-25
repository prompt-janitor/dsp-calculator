// Flow map layout: a small layered (Sugiyama-style) layout. It takes a plan
// from solve() and returns node positions and SVG edge paths. It has no DOM
// or store access, so tests can run it in Node.

// Sizes in px. NODE_WIDTH and the two heights must match .node in app.css.
export const NODE_WIDTH = 228;
export const NODE_HEIGHT = 86;
export const TARGET_HEIGHT = 64;
// Space between two layer columns.
export const COLUMN_GAP = 92;
// Space between two nodes in a column.
const ROW_GAP = 22;
// A long edge passes each layer between its ends as a thin placeholder node,
// so edges can be ordered and spaced like nodes.
const PLACEHOLDER_HEIGHT = 6;
const PLACEHOLDER_GAP = 5;

// Edge ends keep this distance from the top and bottom of a node.
const PORT_PAD = 16;
// Smallest horizontal pull of a curve, so short edges still bend smoothly.
const MIN_CURVE = 20;
const MIN_SPRAY_CURVE = 40;
const ORDER_SWEEPS = 6;
const RELAX_ROUNDS = 4;

// options.spray: also lay out the proliferator spray links.
// options.moved: { [node id]: [dx, dy] }, the boxes the user moved, in px
// from where the layout puts them.
export function layoutGraph(plan, options) {
  return moveLayout(prepareLayout(plan, options), options.moved);
}

// The slow part: layers, order and positions. The map keeps the result while
// a box is dragged and runs only moveLayout() on each frame.
export function prepareLayout(plan, options) {
  const showSpray = options.spray;
  const ids = Object.keys(plan.nodes);
  const inPlan = (e) => plan.nodes[e.from] && plan.nodes[e.to];
  const edges = plan.edges.filter((e) => e.kind !== 'spray' && inPlan(e));
  const sprayEdges = showSpray ? plan.edges.filter((e) => e.kind === 'spray' && inPlan(e)) : [];

  const links = linkLists(ids, edges);
  const layer = assignLayers(plan, ids, links, sprayEdges);
  const { verts, routes } = addPlaceholders(plan, ids, edges, layer);
  const layers = orderLayers(verts);
  const { width, height } = placeVertices(verts, layers);
  return { ids, verts, routes, sprayEdges, width, height };
}

// Puts the moved boxes where the user left them, then spreads the edge ends
// and draws the paths. left and top: the map's top left corner, in layout
// coordinates before the moves. A box moved above or left of the rest shifts
// the whole map, and the view uses them to keep the other boxes in place.
export function moveLayout(base, moved) {
  const { ids, sprayEdges } = base;
  let { verts, routes, width, height } = base;
  let left = 0, top = 0;
  if (hasMoves(ids, moved)) ({ verts, routes, width, height, left, top } = applyMoves(base, moved));
  const portY = assignPorts(verts, routes);

  const paths = routes.map((route, i) => edgePath(verts, route, portY['o' + i], portY['i' + i]));
  for (const e of sprayEdges) paths.push(sprayPath(verts[e.from], verts[e.to], e));
  const nodes = ids.map((id) => ({ id, x: verts[id].x, y: verts[id].y, height: verts[id].height }));
  return { nodes, paths, width, height, left, top };
}

const offsetOf = (moved, id) => (moved && Object.hasOwn(moved, id) ? moved[id] : null);

function hasMoves(ids, moved) {
  return ids.some((id) => { const off = offsetOf(moved, id); return !!off && (off[0] !== 0 || off[1] !== 0); });
}

// Works on copies, so the prepared layout stays as it was for the next frame.
function applyMoves({ ids, verts, routes }, moved) {
  const placed = {};
  for (const id of Object.keys(verts)) {
    const v = verts[id], off = v.placeholder ? null : offsetOf(moved, id);
    placed[id] = off ? { ...v, x: v.x + off[0], y: v.y + off[1] } : { ...v };
  }
  // A long edge skips the placeholders that a moved end has passed, so it
  // does not run back to them.
  const kept = routes.map(({ edge, chain }) => {
    const a = placed[chain[0]], b = placed[chain[chain.length - 1]];
    const inside = (id) => placed[id].x + NODE_WIDTH / 2 > a.x + NODE_WIDTH && placed[id].x + NODE_WIDTH / 2 < b.x;
    return { edge, chain: chain.filter((id, k) => k === 0 || k === chain.length - 1 || inside(id)) };
  });

  const used = new Set(ids);
  for (const { chain } of kept) for (const id of chain) used.add(id);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of used) {
    const v = placed[id];
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x + NODE_WIDTH);
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y + v.height);
  }
  for (const id of Object.keys(placed)) { placed[id].x -= minX; placed[id].y -= minY; }
  return { verts: placed, routes: kept, width: maxX - minX, height: maxY - minY, left: minX, top: minY };
}

function linkLists(ids, edges) {
  const preds = {}, succs = {};
  for (const id of ids) { preds[id] = []; succs[id] = []; }
  const seen = {};
  for (const e of edges) {
    const key = e.from + '>' + e.to;
    if (seen[key]) continue;
    seen[key] = true;
    preds[e.to].push(e.from);
    succs[e.from].push(e.to);
  }
  return { preds, succs };
}

// Layer = longest path from a node with no inputs. Cycles are cut where the
// walk meets a node it is still inside.
function assignLayers(plan, ids, { preds, succs }, sprayEdges) {
  const layer = {}, visiting = {};
  function longestPath(id) {
    if (layer[id] !== undefined) return layer[id];
    if (visiting[id] === 1) return 0;
    visiting[id] = 1;
    let depth = 0;
    for (const p of preds[id]) if (visiting[p] !== 1) depth = Math.max(depth, longestPath(p) + 1);
    visiting[id] = 2;
    layer[id] = depth;
    return depth;
  }
  ids.forEach(longestPath);

  // Move pure sources right, next to their first consumer.
  for (const id of ids) {
    if (preds[id].length || !succs[id].length) continue;
    let first = Infinity;
    for (const s of succs[id]) first = Math.min(first, layer[s]);
    if (isFinite(first) && first - 1 > layer[id]) layer[id] = first - 1;
  }
  // Do the same for proliferator nodes that only feed spray links.
  for (const id of ids) {
    if (succs[id].length) continue;
    let first = Infinity;
    for (const e of sprayEdges) if (e.from === id) first = Math.min(first, layer[e.to]);
    if (isFinite(first) && first - 1 > layer[id]) layer[id] = first - 1;
  }

  // Targets get their own last column.
  let last = 0;
  for (const id of ids) if (plan.nodes[id].kind !== 'target') last = Math.max(last, layer[id]);
  for (const id of ids) if (plan.nodes[id].kind === 'target') layer[id] = Math.max(layer[id], last + 1);
  return layer;
}

function addPlaceholders(plan, ids, edges, layer) {
  const verts = {};
  for (const id of ids) {
    const height = plan.nodes[id].kind === 'target' ? TARGET_HEIGHT : NODE_HEIGHT;
    verts[id] = { id, layer: layer[id], height, placeholder: false, ins: [], outs: [] };
  }
  let count = 0;
  const routes = edges.map((e) => {
    const a = layer[e.from], b = layer[e.to];
    const chain = [e.from];
    for (let l = a + 1; l < b; l++) {
      const id = '_d' + (count++);
      verts[id] = { id, layer: l, height: PLACEHOLDER_HEIGHT, placeholder: true, ins: [], outs: [] };
      chain.push(id);
    }
    chain.push(e.to);
    for (let i = 0; i < chain.length - 1; i++) {
      verts[chain[i]].outs.push(chain[i + 1]);
      verts[chain[i + 1]].ins.push(chain[i]);
    }
    return { edge: e, chain };
  });
  return { verts, routes };
}

// Orders each layer to reduce edge crossings: a depth-first order from the
// targets first, then barycenter sweeps down and up.
function orderLayers(verts) {
  const all = Object.keys(verts);
  const top = all.reduce((m, id) => Math.max(m, verts[id].layer), 0);
  const layers = [];
  for (let l = 0; l <= top; l++) layers.push([]);
  for (const id of all) layers[verts[id].layer].push(id);

  const pos = {};
  let next = 0;
  const visited = {};
  function visit(id) {
    if (visited[id]) return;
    visited[id] = true;
    verts[id].ins.forEach(visit);
    pos[id] = next++;
  }
  all.filter((id) => !verts[id].outs.length).sort().forEach(visit);
  for (const id of all) if (pos[id] === undefined) pos[id] = next++;
  for (const ids of layers) ids.sort((a, b) => pos[a] - pos[b]);
  for (const ids of layers) ids.forEach((id, i) => { verts[id].idx = i; });

  function sweep(down) {
    for (const l of layerRange(top, down)) {
      const ids = layers[l];
      const center = {};
      for (const id of ids) {
        const nb = down ? verts[id].ins : verts[id].outs;
        if (!nb.length) { center[id] = verts[id].idx; continue; }
        let sum = 0;
        for (const n of nb) sum += verts[n].idx;
        center[id] = sum / nb.length;
      }
      ids.sort((a, b) => (center[a] - center[b]) || (verts[a].idx - verts[b].idx));
      ids.forEach((id, i) => { verts[id].idx = i; });
    }
  }
  for (let i = 0; i < ORDER_SWEEPS; i++) { sweep(true); sweep(false); }
  return layers;
}

// Layers 1 to top going down, or top - 1 to 0 going up. The first layer of
// each sweep has no neighbors on the side it reads from.
function layerRange(top, down) {
  const out = [];
  if (down) for (let l = 1; l <= top; l++) out.push(l);
  else for (let l = top - 1; l >= 0; l--) out.push(l);
  return out;
}

function centerY(v) { return v.y + v.height / 2; }

// Sets x and y on every vertex. Each node moves toward the middle of its
// neighbors, then the column is pushed apart so nothing overlaps.
function placeVertices(verts, layers) {
  const top = layers.length - 1;
  const gap = (a, b) => (verts[a].placeholder || verts[b].placeholder) ? PLACEHOLDER_GAP : ROW_GAP;
  for (const ids of layers) {
    let y = 0;
    ids.forEach((id, i) => {
      verts[id].y = y;
      y += verts[id].height + (ids[i + 1] ? gap(id, ids[i + 1]) : 0);
    });
  }

  function relax(down) {
    for (const l of layerRange(top, down)) {
      const ids = layers[l];
      if (!ids.length) continue;
      const want = ids.map((id) => {
        const nb = down ? verts[id].ins : verts[id].outs;
        if (!nb.length) return verts[id].y;
        let sum = 0;
        for (const n of nb) sum += centerY(verts[n]);
        return sum / nb.length - verts[id].height / 2;
      });
      const ys = want.slice();
      for (let i = 1; i < ids.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + verts[ids[i - 1]].height + gap(ids[i - 1], ids[i]));
      // Shift the column back by the average push, so it stays centered on what it wanted.
      let shift = 0;
      for (let j = 0; j < ids.length; j++) shift += want[j] - ys[j];
      shift /= ids.length;
      ids.forEach((id, k) => { verts[id].y = ys[k] + shift; });
    }
  }
  for (let r = 0; r < RELAX_ROUNDS; r++) { relax(true); relax(false); relax(true); }

  let minY = Infinity, maxY = -Infinity;
  for (const id in verts) { minY = Math.min(minY, verts[id].y); maxY = Math.max(maxY, verts[id].y + verts[id].height); }
  for (const id in verts) { verts[id].y -= minY; verts[id].x = verts[id].layer * (NODE_WIDTH + COLUMN_GAP); }
  return { width: (top + 1) * (NODE_WIDTH + COLUMN_GAP) - COLUMN_GAP, height: maxY - minY };
}

// Spreads the edge ends on each node side, sorted by the height of the
// vertex at the other end, so edges leave and enter without crossing.
// Keys are 'o' + route index for the out end and 'i' + route index for the in end.
function assignPorts(verts, routes) {
  const outPorts = {}, inPorts = {};
  routes.forEach(({ chain }, i) => {
    const a = chain[0], b = chain[chain.length - 1];
    (outPorts[a] = outPorts[a] || []).push({ i, ref: chain[1] });
    (inPorts[b] = inPorts[b] || []).push({ i, ref: chain[chain.length - 2] });
  });
  const portY = {};
  function spread(ports, prefix) {
    for (const id of Object.keys(ports)) {
      const list = ports[id];
      list.sort((p, q) => centerY(verts[p.ref]) - centerY(verts[q.ref]) || p.i - q.i);
      const v = verts[id], n = list.length;
      list.forEach((p, k) => {
        portY[prefix + p.i] = v.y + (n === 1 ? v.height / 2 : PORT_PAD + (v.height - 2 * PORT_PAD) * k / (n - 1));
      });
    }
  }
  spread(outPorts, 'o');
  spread(inPorts, 'i');
  return portY;
}

const xy = (p) => p[0].toFixed(1) + ',' + p[1].toFixed(1);

// A chain of cubic curves through the placeholder centers. The label point
// is the middle of the last segment.
function edgePath(verts, { edge, chain }, outY, inY) {
  const a = verts[chain[0]], b = verts[chain[chain.length - 1]];
  const pts = [[a.x + NODE_WIDTH, outY]];
  for (let k = 1; k < chain.length - 1; k++) {
    const d = verts[chain[k]];
    pts.push([d.x + NODE_WIDTH / 2, d.y + d.height / 2]);
  }
  pts.push([b.x, inY]);
  let d = 'M' + xy(pts[0]);
  for (let j = 1; j < pts.length; j++) {
    const p = pts[j - 1], q = pts[j];
    const pull = Math.max((q[0] - p[0]) / 2, MIN_CURVE);
    d += 'C' + xy([p[0] + pull, p[1]]) + ' ' + xy([q[0] - pull, q[1]]) + ' ' + xy(q);
  }
  const p0 = pts[pts.length - 2], p1 = pts[pts.length - 1];
  return { edge, d, labelX: (p0[0] + p1[0]) / 2, labelY: (p0[1] + p1[1]) / 2 };
}

// Spray links go straight from node center to node center. A link that runs
// right to left starts and ends on the other sides and bends the other way.
function sprayPath(a, b, e) {
  let x1 = a.x + NODE_WIDTH, x2 = b.x;
  const y1 = a.y + a.height / 2, y2 = b.y + b.height / 2;
  let pull = Math.max(MIN_SPRAY_CURVE, Math.abs(x2 - x1) / 2);
  if (x2 < x1) { x1 = a.x; x2 = b.x + NODE_WIDTH; pull = -Math.max(MIN_SPRAY_CURVE, Math.abs(x2 - x1) / 2); }
  const d = 'M' + x1 + ',' + y1 + 'C' + (x1 + pull) + ',' + y1 + ' ' + (x2 - pull) + ',' + y2 + ' ' + x2 + ',' + y2;
  return { edge: e, d, labelX: (x1 + x2) / 2, labelY: (y1 + y2) / 2, spray: true };
}
