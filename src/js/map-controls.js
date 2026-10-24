/* ---------- Map controls: buttons, options, pan, pinch and tap ---------- */
import { $, $$ } from './core.js';
import { state, ui, update } from './store.js';
import { applyView, fitView, zoomAt, nearestNode, panIntoView, isHidden } from './map-view.js';
import { selectNode, centerNode, closeInspector } from './inspector.js';

const TAP_MOVE = 8;          // px a pointer can move and still count as a tap
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 30;
const LINE_PX = 16;

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
}

function wireButtons() {
  $('#btnLayers').addEventListener('click', (e) => {
    const layers = $('#layers');
    layers.hidden = !layers.hidden;
    e.currentTarget.setAttribute('aria-expanded', !layers.hidden);
  });
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
  selectNode(node.dataset.id);
  // Move the map when the step details or a control cover the node.
  if (ui.sel && isHidden(node)) centerNode(ui.sel, false);
}

// Wheel and trackpad zoom, one-finger pan, two-finger pinch, tap to select and double-tap to zoom.
function wireGestures() {
  const viewport = $('#viewport');
  const pointers = {};
  let moved = 0, pinchGap = 0, downTarget = null, lastTap = 0, lastTapAt = null;

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
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

  viewport.addEventListener('pointerdown', (e) => {
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    moved = 0;
    downTarget = e.target;
    viewport.setPointerCapture(e.pointerId);
    viewport.classList.add('drag');
    $('#layers').hidden = true;
    const ids = Object.keys(pointers);
    if (ids.length === 2) {
      const [a, b] = [pointers[ids[0]], pointers[ids[1]]];
      pinchGap = Math.hypot(a.x - b.x, a.y - b.y);
    }
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
      moved += 20;
      return;
    }
    const dx = e.clientX - last.x, dy = e.clientY - last.y;
    moved += Math.abs(dx) + Math.abs(dy);
    last.x = e.clientX; last.y = e.clientY;
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
    const wasTap = moved < TAP_MOVE && Object.keys(pointers).length === 1;
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
  viewport.addEventListener('pointercancel', release);
}

// Enter or Space opens a focused node, as a tap does. Arrow keys move focus to the next node.
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
