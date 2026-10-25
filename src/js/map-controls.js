// Map buttons, map options, and pan, pinch, tap and box moves on the map.
import { $, $$, hasMouse } from './core.js';
import { state, ui, update, MOVE_LIMIT } from './store.js';
import { applyView, fitView, zoomAt, nearestNode, panIntoView, isHidden, moveBoxes } from './map-view.js';
import { selectNode, centerNode, closeInspector } from './inspector.js';
import { hideMapHint } from './nav.js';
import { toast } from './toast.js';
import { renderSaveBar } from './saved-list.js';

const TAP_MOVE = 8;          // px a pointer can move and still count as a tap
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 30;
const LINE_PX = 16;
// A finger held this long on a box picks it up. A finger that moves sooner pans.
const HOLD_MS = 350;
// Shift and an arrow key move a box this far, one grid step.
const KEY_MOVE = 24;

// Animates the next change of view, such as a fit or a double-tap zoom.
function animate(change) {
  const stage = $('#stage');
  stage.classList.add('anim');
  change();
  setTimeout(() => stage.classList.remove('anim'), 340);
}

// Zooms around the middle of the map, for the buttons and the keyboard.
export function zoomBy(factor) {
  const viewport = $('#viewport');
  zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, factor);
}

export const fitAll = () => animate(() => fitView(true));
export const ZOOM_STEP = 1.3;

export function syncMapOptions() {
  $('#optSpray').checked = !!state.opts.spray;
  $('#optLabels').checked = !!state.opts.labels;
  const nodes = ui.plan ? ui.plan.nodes : {};
  $('#resetBoxes').disabled = !Object.keys(state.moved).some((id) => nodes[id]);
  $('#moveHint').textContent = hasMouse() ? 'Drag a box to move it.' : 'Hold a box, then drag it to move it.';
}

// Box moves
const offsetOf = (id) => state.moved[id] || [0, 0];

function withOffset(id, offset) {
  const moved = { ...state.moved };
  if (offset[0] || offset[1]) moved[id] = offset; else delete moved[id];
  return moved;
}

function setMoved(moved) {
  update((draft) => { draft.moved = moved; });
  moveBoxes(moved);
  renderSaveBar();
  syncMapOptions();
}

function resetBoxes() {
  const before = state.moved;
  const hadFocus = document.activeElement === $('#resetBoxes');
  setMoved({});
  if (hadFocus) $('#btnLayers').focus();
  toast('Box positions reset.', 'Undo', () => setMoved(before), { brief: true });
}

function showLayers(show) {
  $('#layers').hidden = !show;
  $('#btnLayers').setAttribute('aria-expanded', show);
}

// Closes the map options. Returns true if they were open.
export function closeLayers() {
  const layers = $('#layers');
  if (layers.hidden) return false;
  const hadFocus = layers.contains(document.activeElement);
  showLayers(false);
  if (hadFocus) $('#btnLayers').focus();
  return true;
}

function wireButtons() {
  $('#btnLayers').addEventListener('click', () => showLayers($('#layers').hidden));
  $('#resetBoxes').addEventListener('click', resetBoxes);
  $('#optSpray').addEventListener('change', (e) => update((draft) => { draft.opts.spray = e.target.checked; }, 'refit', 'solve'));
  $('#optLabels').addEventListener('change', (e) => {
    update((draft) => { draft.opts.labels = e.target.checked; });
    $('#stage').classList.toggle('nolabels', !state.opts.labels);
  });
  $('#zin').addEventListener('click', () => zoomBy(ZOOM_STEP));
  $('#zout').addEventListener('click', () => zoomBy(1 / ZOOM_STEP));
  $('#zfit').addEventListener('click', fitAll);
  $('#fitLeft').addEventListener('click', fitAll);
}

const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

function onTap(node) {
  hideMapHint();
  selectNode(node.dataset.id);
  // Move the map when the step details or a control cover the node.
  if (ui.sel && isHidden(node)) centerNode(ui.sel, false);
}

const clampMove = (value) => Math.round(Math.min(MOVE_LIMIT, Math.max(-MOVE_LIMIT, value))) || 0;

// Wheel and trackpad zoom, one-finger pan, two-finger pinch, tap to select,
// double-tap to zoom, and box moves: drag a box with a mouse or pen, or hold
// it with a finger first.
function wireGestures() {
  const viewport = $('#viewport');
  const pointers = {};
  let travel = 0, pinchGap = 0, downTarget = null, lastTap = 0, lastTapAt = null;
  // The box under the first pointer: { id, el, pointer, touch, x, y, from, at, lifted }.
  let box = null, holdTimer = 0, frame = 0;

  function lift() {
    box.lifted = true;
    box.el.classList.add('lifted');
    viewport.classList.add('moving');
  }

  // Ends a box move. keep: save where it is, else put it back.
  function drop(keep) {
    clearTimeout(holdTimer);
    if (!box) return;
    const { id, el, lifted, at } = box;
    box = null;
    if (!lifted) return;
    el.classList.remove('lifted');
    viewport.classList.remove('moving');
    cancelAnimationFrame(frame);
    frame = 0;
    if (keep && at) setMoved(withOffset(id, at));
    else moveBoxes(state.moved);
  }

  // Drawn at most once a frame, because a pointer can move more often.
  function dragBox(e) {
    const k = ui.view.k;
    box.at = [clampMove(box.from[0] + (e.clientX - box.x) / k), clampMove(box.from[1] + (e.clientY - box.y) / k)];
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (box && box.at) moveBoxes(withOffset(box.id, box.at));
    });
  }

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    hideMapHint();
    const rect = viewport.getBoundingClientRect();
    // Firefox can count a mouse wheel in lines or pages instead of pixels.
    const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? viewport.clientHeight : 1;
    const dx = e.deltaX * unit, dy = e.deltaY * unit;
    if (!e.ctrlKey && Math.abs(dx) > Math.abs(dy)) { ui.view.x -= dx; applyView(); return; }
    // ctrlKey is set for a trackpad pinch, which sends smaller steps.
    const factor = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015));
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
  }, { passive: false });
  // Safari sends its own pinch events. Block them so the page does not zoom.
  for (const type of ['gesturestart', 'gesturechange']) viewport.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  // A long press on a box picks it up, so it must not open a menu (Android).
  viewport.addEventListener('contextmenu', (e) => { if (box || e.target.closest('.node')) e.preventDefault(); });

  viewport.addEventListener('pointerdown', (e) => {
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    travel = 0;
    downTarget = e.target;
    viewport.setPointerCapture(e.pointerId);
    viewport.classList.add('drag');
    showLayers(false);
    hideMapHint();
    const ids = Object.keys(pointers);
    if (ids.length === 2) {
      // A second finger means a pinch. A box already picked up stays where it is.
      drop(true);
      const [a, b] = [pointers[ids[0]], pointers[ids[1]]];
      pinchGap = Math.hypot(a.x - b.x, a.y - b.y);
      return;
    }
    const node = ids.length === 1 && e.button === 0 && e.target.closest('.node');
    if (!node) return;
    const id = node.dataset.id;
    box = { id, el: node, pointer: e.pointerId, touch: e.pointerType === 'touch', x: e.clientX, y: e.clientY, from: offsetOf(id), at: null, lifted: false };
    if (box.touch) holdTimer = setTimeout(() => { if (box && travel < TAP_MOVE) lift(); }, HOLD_MS);
  });

  viewport.addEventListener('pointermove', (e) => {
    const last = pointers[e.pointerId];
    if (!last) return;
    const ids = Object.keys(pointers);
    if (ids.length >= 2) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      const [a, b] = [pointers[ids[0]], pointers[ids[1]]];
      const gap = Math.hypot(a.x - b.x, a.y - b.y), rect = viewport.getBoundingClientRect();
      if (pinchGap) zoomAt((a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top, gap / pinchGap);
      ui.view.x += (e.clientX - last.x) / 2;
      ui.view.y += (e.clientY - last.y) / 2;
      applyView();
      pinchGap = gap;
      travel += 20;
      return;
    }
    const dx = e.clientX - last.x, dy = e.clientY - last.y;
    travel += Math.abs(dx) + Math.abs(dy);
    last.x = e.clientX; last.y = e.clientY;
    if (box && box.pointer === e.pointerId) {
      // A mouse or pen moves the box once it passes the tap distance.
      // A finger that moves before the hold ends pans instead.
      if (!box.lifted && !box.touch && travel >= TAP_MOVE) lift();
      if (box.lifted) { dragBox(e); return; }
      if (!box.touch) return;
      if (travel >= TAP_MOVE) drop(false);
    }
    ui.view.x += dx; ui.view.y += dy;
    applyView();
  });

  const release = (e) => {
    delete pointers[e.pointerId];
    const left = Object.keys(pointers).length;
    if (left < 2) pinchGap = 0;
    if (!left) viewport.classList.remove('drag');
  };

  viewport.addEventListener('pointerup', (e) => {
    // A box that was picked up is never a tap, even when it did not move.
    if (box && box.pointer === e.pointerId && box.lifted) {
      drop(true);
      release(e);
      lastTap = 0;
      return;
    }
    if (box && box.pointer === e.pointerId) drop(false);
    const wasTap = travel < TAP_MOVE && Object.keys(pointers).length === 1;
    release(e);
    if (!wasTap) return;
    const node = downTarget && downTarget.closest ? downTarget.closest('.node') : null;
    const now = Date.now(), rect = viewport.getBoundingClientRect();
    const nearLast = lastTapAt && Math.hypot(e.clientX - lastTapAt[0], e.clientY - lastTapAt[1]) < DOUBLE_TAP_PX;
    const doubleTap = !node && now - lastTap < DOUBLE_TAP_MS && nearLast;
    if (doubleTap) {
      animate(() => zoomAt(e.clientX - rect.left, e.clientY - rect.top, 1.8));
      lastTap = 0;
      return;
    }
    lastTap = now;
    lastTapAt = [e.clientX, e.clientY];
    if (node) onTap(node);
    else closeInspector();
  });
  viewport.addEventListener('pointercancel', (e) => {
    if (box && box.pointer === e.pointerId) drop(false);
    release(e);
  });
}

// Shift and an arrow key move a focused box one grid step. Focus stays on it.
function nudgeBox(node, [dx, dy]) {
  const id = node.dataset.id;
  const [x, y] = offsetOf(id);
  setMoved(withOffset(id, [clampMove(x + dx * KEY_MOVE), clampMove(y + dy * KEY_MOVE)]));
  panIntoView(node);
}

// Enter or Space opens a focused node, as a tap does. Arrow keys move focus
// to the next node, and with Shift they move the node.
function wireKeys() {
  const viewport = $('#viewport');
  viewport.addEventListener('keydown', (e) => {
    const node = e.target.closest('.node');
    if (!node) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onTap(node);
      return;
    }
    const dir = ARROWS[e.key];
    if (!dir) return;
    e.preventDefault();
    if (e.shiftKey) { nudgeBox(node, dir); return; }
    const next = nearestNode(node.dataset.id, dir[0], dir[1]);
    const el = next && $$('#stage .node').find((n) => n.dataset.id === next);
    if (el) el.focus();
  });
  viewport.addEventListener('focusin', (e) => {
    const node = e.target.closest('.node');
    // A tap also focuses the node. Only keyboard focus should move the map.
    if (node && node.matches(':focus-visible')) panIntoView(node);
  });
}

export function wireMapControls() {
  wireButtons();
  wireGestures();
  wireKeys();
}
