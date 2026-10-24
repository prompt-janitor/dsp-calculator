// Sheets: open, close, focus and drag to close.
import { $, $$ } from './core.js';

const FOCUSABLE = 'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])';
const openers = {};

const isShown = (el) => !!el && el.isConnected && el.getClientRects().length > 0;
const focusables = (root) => $$(FOCUSABLE, root).filter((el) => !el.disabled && isShown(el));

// A way to find the same control again after its pane is drawn again.
export function focusKey(el) {
  if (!el || el === document.body) return null;
  if (el.id) return '#' + CSS.escape(el.id);
  for (const attr of ['data-pick', 'data-act', 'data-sel', 'data-jump', 'data-item']) {
    if (el.hasAttribute(attr)) return `[${attr}="${CSS.escape(el.getAttribute(attr))}"]`;
  }
  return null;
}

export function refocus(el, key) {
  const target = isShown(el) ? el : key && $$(key).find(isShown);
  if (target) target.focus({ preventScroll: true });
}

// data-open is set at once. The "on" class follows a frame later, for the slide-in.
export const openModal = () => $$('.sheet[aria-modal="true"][data-open]')[0] || null;

// modal: dim the page behind and keep focus in the sheet until it closes.
// focus: the control to focus first. Without it, the sheet itself gets focus.
export function openSheet(id, { modal = false, focus = null } = {}) {
  const sheet = $('#' + id);
  if ('open' in sheet.dataset) return;
  sheet.dataset.open = '';
  const active = document.activeElement;
  if (!sheet.contains(active)) openers[id] = { el: active, key: focusKey(active) };
  sheet.hidden = false;
  if (modal) {
    const scrim = $('#scrim');
    scrim.hidden = false;
    scrim.dataset.for = id;
    requestAnimationFrame(() => scrim.classList.add('on'));
    $('#app').inert = true;
    for (const other of $$('.sheet')) if (other !== sheet) other.inert = true;
  }
  // Two frames, so the browser draws the sheet off screen before it slides in.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!('open' in sheet.dataset)) return;
    sheet.classList.add('on');
    if (!sheet.contains(document.activeElement)) (focus || sheet).focus({ preventScroll: true });
  }));
}

export function closeSheet(id, instant) {
  const sheet = $('#' + id);
  if (!sheet || !('open' in sheet.dataset)) return;
  const hadFocus = sheet.contains(document.activeElement);
  delete sheet.dataset.open;
  sheet.classList.remove('on');
  sheet.style.transform = '';
  const scrim = $('#scrim');
  if (scrim.dataset.for === id) {
    scrim.classList.remove('on');
    $('#app').inert = false;
    for (const other of $$('.sheet')) other.inert = false;
    setTimeout(() => { if (scrim.dataset.for === id && !openModal()) scrim.hidden = true; }, instant ? 0 : 260);
  }
  setTimeout(() => { if (!('open' in sheet.dataset)) sheet.hidden = true; }, instant ? 0 : 330);
  const opener = openers[id];
  delete openers[id];
  // Wait a frame, because closing often draws the opener's pane again.
  if (!hadFocus || !opener) return;
  requestAnimationFrame(() => {
    // Leave focus alone if something else took it in the meantime.
    const active = document.activeElement;
    if (!active || active === document.body || sheet.contains(active)) refocus(opener.el, opener.key);
  });
}

// Keeps Tab and Shift+Tab inside an open modal sheet.
function trapFocus(e) {
  const sheet = openModal();
  if (e.key !== 'Tab' || !sheet) return;
  const list = focusables(sheet);
  if (!list.length) { e.preventDefault(); return; }
  const first = list[0], last = list[list.length - 1];
  const inside = sheet.contains(document.activeElement);
  if (e.shiftKey && (!inside || document.activeElement === first || document.activeElement === sheet)) {
    e.preventDefault(); last.focus();
  } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
    e.preventDefault(); first.focus();
  }
}

// CSS sets --drag to 0 on sheets that are cards or dialogs and not bottom sheets.
const canDrag = (sheet) => getComputedStyle(sheet).getPropertyValue('--drag').trim() !== '0';

// A bottom sheet can be dragged down to close it.
function attachDrag(handle, sheet, onClose) {
  let startY = null, dragY = 0, startTime = 0, pointer = null;
  handle.addEventListener('pointerdown', (e) => {
    if (!canDrag(sheet) || e.target.closest('button, input, select, textarea, .chips')) return;
    startY = e.clientY; dragY = 0; startTime = Date.now(); pointer = e.pointerId;
    sheet.classList.add('dragging');
    handle.setPointerCapture(pointer);
  });
  handle.addEventListener('pointermove', (e) => {
    if (startY === null || e.pointerId !== pointer) return;
    dragY = Math.max(0, e.clientY - startY);
    sheet.style.transform = `translateY(${dragY}px)`;
  });
  const end = () => {
    if (startY === null) return;
    sheet.classList.remove('dragging');
    const speed = dragY / Math.max(1, Date.now() - startTime);
    startY = null;
    if (dragY > 110 || speed > 0.6) onClose(); else sheet.style.transform = '';
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

// onClose: how each sheet closes, so a sheet can tidy up first.
export function wireSheets(onClose) {
  for (const sheet of $$('.sheet')) attachDrag($('.grab', sheet), sheet, () => onClose(sheet.id));
  document.addEventListener('click', (e) => {
    const button = e.target.closest('[data-close]');
    if (button) onClose(button.dataset.close);
  });
  $('#scrim').addEventListener('click', (e) => { if (e.currentTarget.dataset.for) onClose(e.currentTarget.dataset.for); });
  document.addEventListener('keydown', trapFocus);
}
