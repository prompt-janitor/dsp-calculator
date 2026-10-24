/* ---------- Toast: a short message at the bottom of the screen ---------- */
import { $, esc } from './core.js';
import { ui } from './store.js';

// With an action, the toast stays until the user taps it.
export function toast(text, actionLabel, action) {
  const box = $('#toast');
  const button = actionLabel ? `<button class="btn" type="button" id="toastAct">${esc(actionLabel)}</button>` : '';
  box.innerHTML = `<span>${esc(text)}</span>${button}`;
  box.hidden = false;
  clearTimeout(ui.toastTimer);
  if (actionLabel) {
    $('#toastAct').addEventListener('click', () => { box.hidden = true; action(); });
  } else {
    ui.toastTimer = setTimeout(() => { box.hidden = true; }, 3400);
  }
}
