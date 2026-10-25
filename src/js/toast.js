// A short message at the bottom of the screen.
import { $, esc, svg } from './core.js';
import { ui } from './store.js';

const SHOW_MS = 3400;
// Long enough to read the message and reach the button.
const BRIEF_MS = 8000;
// A toast with an action, such as the update prompt. A short message can
// cover it for a moment, and then it comes back.
let kept = null;

function show(text, actionLabel, action, keep) {
  const box = $('#toast');
  const buttons = actionLabel ? `<button class="btn" type="button" id="toastAct">${esc(actionLabel)}</button>
    <button class="toast-x" type="button" id="toastClose" aria-label="Close">${svg('i-x', 16)}</button>` : '';
  box.innerHTML = `<span>${esc(text)}</span>${buttons}`;
  box.dataset.text = text;
  box.hidden = false;
  if (!actionLabel) return;
  const done = () => {
    clearTimeout(ui.toastTimer);
    if (keep) { kept = null; box.hidden = true; } else restoreKept();
  };
  $('#toastAct').addEventListener('click', () => { done(); action(); });
  $('#toastClose').addEventListener('click', done);
}

function restoreKept() {
  if (kept) show(kept.text, kept.actionLabel, kept.action, true);
  else $('#toast').hidden = true;
}

// With an action, the toast stays until the user taps it or closes it.
// brief: the action goes away after a few seconds, as Undo does.
export function toast(text, actionLabel, action, { brief = false } = {}) {
  clearTimeout(ui.toastTimer);
  const keep = !!actionLabel && !brief;
  if (keep) kept = { text, actionLabel, action };
  show(text, actionLabel, action, keep);
  if (!keep) ui.toastTimer = setTimeout(restoreKept, actionLabel ? BRIEF_MS : SHOW_MS);
}

// Hides the toast if it still shows this text.
export function hideToast(text) {
  const box = $('#toast');
  if (box.hidden || box.dataset.text !== text) return;
  clearTimeout(ui.toastTimer);
  restoreKept();
}
