// Saved plans on the Plan pane: save, open, rename, duplicate, delete,
// the backup file and opening a plan link.
import { $, $$, esc, svg, itemIcon, isWide, isIOS, inFrame } from './core.js';
import { state, replaceState, renderAll } from './store.js';
import { toast } from './toast.js';
import {
  loadPlans, savePlans, sortPlans, samePlan, withPlan, addPlan, overwritePlan, renamePlan, duplicatePlan, deletePlan, restorePlan,
  markOpened, exportName, exportText, importText, isPlanHash, decodePlanHash, PLANS_KEY
} from './saved-plans.js';

// The list shows this many plans until the user asks for all of them.
const SHORT_LIST = 6;
// A search field shows from this many plans.
const FIND_FROM = 9;
const FILE_MAX = 5 * 1024 * 1024;

const saved = {
  plans: [],
  open: null,       // id of the plan the current state came from
  stored: true,     // false once storage failed
  actions: null,    // id of the row with its actions open
  renaming: null,   // id of the row being renamed
  showAll: false,
  find: ''
};
let barHTML = '';

function storage() {
  // Reading window.localStorage throws when the browser blocks storage.
  try { return window.localStorage; } catch (e) { return null; }
}

export function loadSaved() {
  const loaded = loadPlans(storage());
  saved.plans = loaded.plans;
  saved.open = loaded.open;
  saved.stored = loaded.ok;
}

// Writes the list. The list stays in memory when that fails.
function persist() {
  const ok = savePlans(storage(), saved.plans, saved.open);
  if (!ok && saved.stored) toast('Plans could not be stored on this device. Use Export to keep them in a file.');
  saved.stored = ok;
  return ok;
}

const findPlan = (id) => saved.plans.find((p) => p.id === id) || null;
const openPlan = () => findPlan(saved.open);
const quoted = (name) => `“${name}”`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const TIME = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
function ago(time, now = Date.now()) {
  const minutes = Math.round((now - time) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return TIME.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return TIME.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 30) return TIME.format(-days, 'day');
  return new Date(time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function whenText(plan) {
  return plan.openedAt > plan.updatedAt ? 'Opened ' + ago(plan.openedAt) : 'Saved ' + ago(plan.updatedAt);
}

// The card under the targets: what the current plan is saved as.
function barContent() {
  const plan = openPlan();
  if (!plan) {
    return `
      <span class="main-t"><span class="t">Not saved</span><span class="s">Save this plan to open it again later.</span></span>
      <span class="acts"><button class="btn primary" type="button" id="planSave" data-save="new">Save</button></span>`;
  }
  const name = esc(plan.name);
  if (samePlan(state, plan.data)) {
    return `
      <span class="main-t"><span class="t">${name}</span><span class="s">Saved</span></span>
      <span class="acts"><button class="btn" type="button" id="planSaveNew" data-save="new">Save as new</button></span>`;
  }
  return `
    <span class="main-t"><span class="t">${name}</span><span class="s changed">Unsaved changes</span></span>
    <span class="acts"><button class="btn primary" type="button" id="planSave" data-save="over" aria-label="Save changes to ${name}">Save</button>
      <button class="btn" type="button" id="planSaveNew" data-save="new">Save as new</button></span>`;
}

// Runs after every solve, so the mark follows each change. The card is drawn
// again only when it changes, so focus stays on its buttons.
export function renderSaveBar(force = false) {
  const box = $('#saveBar');
  if (!box) return;
  const html = barContent();
  if (!force && html === barHTML && box.childElementCount) return;
  barHTML = html;
  box.innerHTML = html;
}

function rowHTML(plan) {
  const name = esc(plan.name);
  const isOpen = plan.id === saved.open;
  if (plan.id === saved.renaming) {
    return `
      <form class="prow renaming" data-rename-form="${esc(plan.id)}">
        <input type="text" class="pname" value="${name}" maxlength="80" enterkeyhint="done" autocomplete="off" autocapitalize="sentences"
          aria-label="New name for ${name}" id="rename-${esc(plan.id)}">
        <span class="acts"><button class="btn primary" type="submit">Rename</button>
          <button class="btn" type="button" data-rename-cancel="${esc(plan.id)}">Cancel</button></span>
      </form>`;
  }
  const first = plan.data.targets[0];
  const pic = first ? itemIcon(first.item, 30) : '';
  const targets = plural(plan.data.targets.length, 'target');
  const expanded = plan.id === saved.actions;
  const actions = expanded ? `
    <div class="pacts" id="pacts-${esc(plan.id)}" role="group" aria-label="Actions for ${name}">
      <button class="btn" type="button" data-prename="${esc(plan.id)}" aria-label="Rename ${name}">Rename</button>
      <button class="btn" type="button" data-pdup="${esc(plan.id)}" aria-label="Duplicate ${name}">Duplicate</button>
      <button class="btn danger" type="button" data-pdel="${esc(plan.id)}" aria-label="Delete ${name}">Delete</button>
    </div>` : '';
  return `
    <div class="prow${isOpen ? ' open' : ''}">
      <button class="row popen" type="button" data-popen="${esc(plan.id)}"${isOpen ? ' aria-current="true"' : ''}>
        <span class="ibox">${pic}</span>
        <span class="main-t"><span class="t">${name}</span><span class="s">${isOpen ? 'Open · ' : ''}${targets} · ${esc(whenText(plan))}</span></span>
      </button>
      <button class="pmore" type="button" data-pmore="${esc(plan.id)}" aria-expanded="${expanded}"${expanded ? ` aria-controls="pacts-${esc(plan.id)}"` : ''}
        aria-label="Actions for ${name}">${svg('i-more', 22)}</button>
      ${actions}
    </div>`;
}

// The plans the list shows, newest first, filtered by the search field.
function shownPlans() {
  const find = saved.find.trim().toLowerCase();
  const all = sortPlans(saved.plans.slice());
  if (find) return { list: all.filter((p) => p.name.toLowerCase().includes(find)), more: 0 };
  if (saved.showAll || all.length <= SHORT_LIST) return { list: all, more: 0 };
  return { list: all.slice(0, SHORT_LIST), more: all.length - SHORT_LIST };
}

function listHTML() {
  const total = saved.plans.length;
  if (!total) return '<div class="row noic"><span class="main-t"><span class="s wrap">No saved plans yet.</span></span></div>';
  const { list, more } = shownPlans();
  if (!list.length) return `<div class="row noic"><span class="main-t"><span class="s wrap">No plan matches ${esc(quoted(saved.find.trim()))}.</span></span></div>`;
  let toggle = '';
  if (more) toggle = `<button class="row noic pall" type="button" data-pall="1"><span class="main-t"><span class="t acc">Show all ${total} plans</span></span></button>`;
  else if (saved.showAll && !saved.find && total > SHORT_LIST) toggle = '<button class="row noic pall" type="button" data-pall="0"><span class="main-t"><span class="t acc">Show fewer</span></span></button>';
  return list.map(rowHTML).join('') + toggle;
}

function renderList() {
  const box = $('#savedList');
  if (box) box.innerHTML = listHTML();
}

const STORAGE_NOTE = '<p class="gnote warn">Plans could not be stored in this browser, so they last only until you close the page. Use Export to keep them in a file.</p>';

// Called by the Plan pane each time it is drawn.
export function renderSaved() {
  const box = $('#saved');
  if (!box) return;
  const count = saved.plans.length;
  const find = count >= FIND_FROM ? `
    <div class="search pfind">${svg('i-search', 18, 'mut')}<input type="search" id="planFind" placeholder="Find a plan" aria-label="Find a saved plan"
      autocomplete="off" enterkeyhint="search" value="${esc(saved.find)}"></div>` : '';
  box.innerHTML = `
    <div class="gtitle">Saved plans${count ? `<span class="push num">${count}</span>` : ''}</div>
    ${saved.stored ? '' : STORAGE_NOTE}
    ${find}
    <div class="group" id="savedList"></div>
    <div class="pad-row two">
      <button class="btn" type="button" id="planImport">Import</button>
      <button class="btn" type="button" id="planExport"${count ? '' : ' disabled'}>Export</button>
    </div>
    <p class="gnote">Export saves every plan to one file, as a backup or for another device. Import adds the plans in such a file.</p>`;
  renderList();
  renderSaveBar(true);
}

// Focus after the list is drawn again, at once, because iOS shows the
// keyboard only for a focus inside the tap.
function focusOn(selector) {
  const el = $(selector);
  if (el) el.focus();
}

const rowSelector = (id) => `[data-popen="${CSS.escape(id)}"]`;

// Saves the current plan as a new one and marks it as open.
export function saveNew() {
  const plan = addPlan(saved.plans, state, '');
  saved.open = plan.id;
  saved.find = '';
  persist();
  renderSaved();
  toast(`Saved as ${quoted(plan.name)}.`, 'Rename', () => startRename(plan.id), { brief: true });
  return plan;
}

function saveOver() {
  const plan = overwritePlan(saved.plans, saved.open, state);
  if (!plan) return saveNew();
  persist();
  renderSaved();
  toast(`Saved ${quoted(plan.name)}.`);
}

// Swaps in a whole state and draws everything again, with the map fitted to it.
function showState(next, openId) {
  replaceState(next);
  saved.open = openId;
  saved.actions = null;
  saved.renaming = null;
  renderAll();
}

function openSaved(id) {
  const plan = findPlan(id);
  if (!plan) return;
  const before = JSON.parse(JSON.stringify(state));
  const beforeOpen = saved.open;
  markOpened(saved.plans, id);
  saved.find = '';
  showState(withPlan(state, plan.data), id);
  persist();
  focusOn(rowSelector(id));
  toast(`Opened ${quoted(plan.name)}.`, 'Undo', () => {
    showState(before, findPlan(beforeOpen) ? beforeOpen : null);
    persist();
  }, { brief: true });
}

function toggleActions(id) {
  saved.actions = saved.actions === id ? null : id;
  saved.renaming = null;
  renderList();
  focusOn(`[data-pmore="${CSS.escape(id)}"]`);
}

function startRename(id) {
  if (!findPlan(id)) return;
  saved.renaming = id;
  saved.actions = null;
  // The row must be on the list to be renamed.
  if (!shownPlans().list.some((p) => p.id === id)) { saved.find = ''; saved.showAll = true; renderSaved(); } else renderList();
  const input = $('#rename-' + CSS.escape(id));
  if (!input) return;
  input.focus();
  input.select();
}

function finishRename(id, name) {
  const plan = renamePlan(saved.plans, id, name);
  saved.renaming = null;
  if (plan) persist();
  renderSaved();
  focusOn(rowSelector(id));
}

function cancelRename(id) {
  saved.renaming = null;
  renderList();
  focusOn(rowSelector(id));
}

function duplicate(id) {
  const copy = duplicatePlan(saved.plans, id);
  if (!copy) return;
  saved.actions = null;
  saved.find = '';
  persist();
  renderSaved();
  focusOn(rowSelector(copy.id));
  toast(`Made a copy: ${quoted(copy.name)}.`);
}

// Focus goes to the next row, or the one before when the last row went.
function remove(id) {
  const order = shownPlans().list.map((p) => p.id);
  const at = order.indexOf(id);
  const next = order[at + 1] || order[at - 1] || null;
  const removed = deletePlan(saved.plans, id);
  if (!removed) return;
  const wasOpen = saved.open === id;
  if (wasOpen) saved.open = null;
  saved.actions = null;
  persist();
  renderSaved();
  focusOn(next ? rowSelector(next) : '#planImport');
  toast(`Deleted ${quoted(removed.plan.name)}.`, 'Undo', () => {
    restorePlan(saved.plans, removed);
    if (wasOpen) saved.open = id;
    persist();
    renderSaved();
    focusOn(rowSelector(id));
  }, { brief: true });
}

// Backup file. On iOS a download goes to a preview page, so the file goes
// to the share sheet, where Save to Files is.
function download(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast(`Exported ${plural(saved.plans.length, 'plan')} to ${name}.`);
}

function exportPlans() {
  if (!saved.plans.length) return;
  const text = exportText(sortPlans(saved.plans.slice()));
  const name = exportName();
  const file = typeof File === 'function' ? new File([text], name, { type: 'application/json' }) : null;
  let canShare = false;
  // canShare throws in some browsers for types they do not know.
  try { canShare = !!(file && isIOS() && !inFrame() && navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) { canShare = false; }
  if (!canShare) { download(text, name); return; }
  navigator.share({ files: [file], title: name }).catch((err) => {
    if (err.name !== 'AbortError') download(text, name);
  });
}

function importSummary({ added, skipped }) {
  const bad = skipped ? ` ${plural(skipped, 'plan')} could not be read and ${skipped === 1 ? 'was' : 'were'} skipped.` : '';
  if (!added) return 'No plans were added.' + bad;
  return `Added ${plural(added, 'plan')}.` + bad;
}

const BAD_FILE = 'That file could not be read. Pick a backup file exported from this app.';

function importFile(file) {
  if (!file) return;
  if (file.size > FILE_MAX) { toast(BAD_FILE); return; }
  file.text().then((text) => {
    const result = importText(saved.plans, text);
    if (!result) { toast(BAD_FILE); return; }
    if (result.added) { saved.find = ''; persist(); }
    renderSaved();
    toast(importSummary(result));
  }, () => toast(BAD_FILE));
}

// A #plan= link: load the plan, then take the hash off the address so a
// reload does not load it again over later changes.
export function openPlanLink() {
  if (!isPlanHash(location.hash)) return false;
  const data = decodePlanHash(location.hash);
  history.replaceState(null, '', location.pathname + location.search);
  if (!data) {
    toast('That plan link could not be read. Ask for a new link.');
    return false;
  }
  const next = withPlan(state, data);
  next.side = 'plan';
  if (!isWide()) next.tab = 'plan';
  replaceState(next);
  saved.open = null;
  persist();
  return true;
}

export function announceLink() {
  toast('Opened a shared plan.', 'Save', saveNew);
}

function onClick(e) {
  const button = e.target.closest('button');
  if (!button) return;
  const { save, popen, pmore, prename, pdup, pdel, pall, renameCancel } = button.dataset;
  if (save === 'new') saveNew();
  else if (save === 'over') saveOver();
  else if (popen) openSaved(popen);
  else if (pmore) toggleActions(pmore);
  else if (prename) startRename(prename);
  else if (pdup) duplicate(pdup);
  else if (pdel) remove(pdel);
  else if (renameCancel) cancelRename(renameCancel);
  else if (pall) { saved.showAll = pall === '1'; renderList(); if (!saved.showAll) focusOn('[data-pall]'); }
  else if (button.id === 'planImport') $('#planFile').click();
  else if (button.id === 'planExport') exportPlans();
}

function onKey(e) {
  const form = e.target.closest('[data-rename-form]');
  if (form && e.key === 'Escape') {
    // Esc here cancels the rename, and does not close sheets too.
    e.stopPropagation();
    cancelRename(form.dataset.renameForm);
  }
}

export function wireSaved() {
  const body = $('#planBody');
  body.addEventListener('click', onClick);
  body.addEventListener('keydown', onKey);
  body.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-rename-form]');
    if (!form) return;
    e.preventDefault();
    finishRename(form.dataset.renameForm, $('input', form).value);
  });
  body.addEventListener('input', (e) => {
    if (e.target.id !== 'planFind') return;
    saved.find = e.target.value;
    renderList();
  });
  const fileInput = $('#planFile');
  fileInput.addEventListener('change', () => {
    importFile(fileInput.files[0]);
    fileInput.value = '';
  });
  // Another tab changed the list.
  window.addEventListener('storage', (e) => {
    if (e.key !== PLANS_KEY) return;
    const open = saved.open;
    loadSaved();
    saved.open = findPlan(open) ? open : null;
    if (!$$('[data-rename-form]').length) renderSaved();
  });
  window.addEventListener('hashchange', () => {
    if (openPlanLink()) { renderAll(); announceLink(); }
  });
}
