/* ---------- Sheets: open, close and drag to close ---------- */
import { $, $$, isWide } from './core.js';

// data-open is set at once. The "on" class follows a frame later, for the slide-in.
export const openModal = () => $$('.sheet[aria-modal="true"][data-open]')[0] || null;

// modal: dim the page behind the sheet.
// focus: a control to focus once the sheet is in place.
export function openSheet(id, { modal = false, focus = null } = {}) {
  const sheet = $('#' + id);
  if ('open' in sheet.dataset) return;
  sheet.dataset.open = '';
  sheet.hidden = false;
  if (modal) {
    const scrim = $('#scrim');
    scrim.hidden = false;
    scrim.dataset.for = id;
    requestAnimationFrame(() => scrim.classList.add('on'));
  }
  // Two frames, so the browser draws the sheet off screen before it slides in.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!('open' in sheet.dataset)) return;
    sheet.classList.add('on');
    if (focus) focus.focus({ preventScroll: true });
  }));
}

export function closeSheet(id, instant) {
  const sheet = $('#' + id);
  if (!sheet || !('open' in sheet.dataset)) return;
  delete sheet.dataset.open;
  sheet.classList.remove('on');
  sheet.style.transform = '';
  const scrim = $('#scrim');
  if (scrim.dataset.for === id) {
    scrim.classList.remove('on');
    setTimeout(() => { if (scrim.dataset.for === id && !openModal()) scrim.hidden = true; }, instant ? 0 : 260);
  }
  setTimeout(() => { if (!('open' in sheet.dataset)) sheet.hidden = true; }, instant ? 0 : 330);
}

// On phones a sheet can be dragged down to close it.
function attachDrag(handle, sheet, onClose) {
  let startY = null, dragY = 0, startTime = 0, pointer = null;
  handle.addEventListener('pointerdown', (e) => {
    if (isWide() || e.target.closest('button, input, select, textarea, .chips')) return;
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
}
