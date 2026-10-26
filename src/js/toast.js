// A short message at the bottom of the screen.
import { $, esc, svg } from './core.js';
import { ui } from './store.js';

const SHOW_MS = 3400;
// Long enough to read the message and reach the button.
const BRIEF_MS = 8000;
// A toast with an action, such as the update prompt. A short message can
// cover it for a moment, and then it comes back.
let kept = null;

// second: [label, action] for a second button, shown before the first.
function show(text, actionLabel, action, keep, second = null) {
  const box = $('#toast');
  const other = second ? `<button class="btn" type="button" id="toastAct2">${esc(second[0])}</button>` : '';
  const buttons = actionLabel ? `<span class="toast-acts">${other}<button class="btn" type="button" id="toastAct">${esc(actionLabel)}</button>
    <button class="toast-x" type="button" id="toastClose" aria-label="Close">${svg('i-x', 16)}</button></span>` : '';
  box.innerHTML = `<span class="toast-t">${esc(text)}</span>${buttons}`;
  box.classList.toggle('two', !!second);
  box.dataset.text = text;
  box.hidden = false;
  if (!actionLabel) return;
  const done = () => {
    clearTimeout(ui.toastTimer);
    if (keep) { kept = null; box.hidden = true; } else restoreKept();
  };
  $('#toastAct').addEventListener('click', () => { done(); action(); });
  if (second) $('#toastAct2').addEventListener('click', () => { done(); second[1](); });
  $('#toastClose').addEventListener('click', done);
}

function restoreKept() {
  if (kept) show(kept.text, kept.actionLabel, kept.action, true);
  else $('#toast').hidden = true;
}

// With an action, the toast stays until the user taps it or closes it.
// brief: the action goes away after a few seconds, as Undo does.
// second: [label, action] for a second button, only with brief.
export function toast(text, actionLabel, action, { brief = false, second = null } = {}) {
  clearTimeout(ui.toastTimer);
  const keep = !!actionLabel && !brief;
  if (keep) kept = { text, actionLabel, action };
  show(text, actionLabel, action, keep, brief ? second : null);
  if (!keep) ui.toastTimer = setTimeout(restoreKept, actionLabel ? BRIEF_MS : SHOW_MS);
}

// Hides the toast if it still shows this text.
export function hideToast(text) {
  const box = $('#toast');
  if (box.hidden || box.dataset.text !== text) return;
  clearTimeout(ui.toastTimer);
  restoreKept();
}
