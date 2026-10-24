// A short message at the bottom of the screen.
import { $, esc } from './core.js';
import { ui } from './store.js';

// With an action, the toast stays until the user taps it.
export function toast(text, actionLabel, action) {
  const box = $('#toast');
  const button = actionLabel ? `<button class="btn" type="button" id="toastAct">${esc(actionLabel)}</button>` : '';
  box.innerHTML = `<span>${esc(text)}</span>${button}`;
  box.dataset.text = text;
  box.hidden = false;
  clearTimeout(ui.toastTimer);
  if (actionLabel) {
    $('#toastAct').addEventListener('click', () => { box.hidden = true; action(); });
  } else {
    ui.toastTimer = setTimeout(() => { box.hidden = true; }, 3400);
  }
}

// Hides the toast if it still shows this text.
export function hideToast(text) {
  const box = $('#toast');
  if (box.hidden || box.dataset.text !== text) return;
  clearTimeout(ui.toastTimer);
  box.hidden = true;
}
