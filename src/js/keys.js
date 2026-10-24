/* ---------- Keyboard shortcuts for the whole page ---------- */
import { $ } from './core.js';
import { openModal, closeSheet } from './sheets.js';
import { closeInspector } from './inspector.js';
import { zoomBy, fitAll, ZOOM_STEP } from './map-controls.js';
import { addTarget } from './plan-pane.js';

// Letters typed into these fields are text, not shortcuts.
const TEXT_FIELDS = 'textarea, select, [contenteditable], input:not([type="checkbox"]):not([type="radio"]):not([type="button"])';

// The = key is + without Shift on most keyboards.
const MAP_KEYS = {
  f: fitAll, F: fitAll,
  '+': () => zoomBy(ZOOM_STEP), '=': () => zoomBy(ZOOM_STEP),
  '-': () => zoomBy(1 / ZOOM_STEP),
};

const mapShown = () => $('#viewport').getClientRects().length > 0;

// / opens the item picker with the cursor in its search field.
function focusSearch() {
  const modal = openModal();
  if (!modal) addTarget(true);
  else if (modal.id === 'picker') $('#pickSearch').focus();
}

// Esc closes the top sheet: a modal sheet first, then the inspector.
function closeTop() {
  const modal = openModal();
  if (modal) closeSheet(modal.id);
  else closeInspector();
}

export function wireKeys() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeTop(); return; }
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest(TEXT_FIELDS)) return;
    if (e.key === '/') {
      e.preventDefault();
      focusSearch();
      return;
    }
    const action = MAP_KEYS[e.key];
    if (!action || openModal() || !mapShown()) return;
    e.preventDefault();
    action();
  });
}
