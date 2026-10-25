// The Load/Save pane: save and load plans in this browser, and export and
// import them as .json files.
import { $, esc } from './core.js';
import { state } from './store.js';
import { defaultName } from './saved-plans.js';
import {
  openPlan, savedPlans, draftName, setDraftName, storageNote, saveStatus, saveNew, saveOver, openSaved, renameOpen,
  exportAll, exportPlan, pickFile
} from './saved-list.js';

// The pane is drawn once. renderFiles() then changes the parts that change,
// so a field or button keeps focus while the list or the plan changes.
const PANE = `
  <p class="gnote warn gap-top" id="fileWarn" hidden></p>
  <div class="gtitle">Save</div>
  <div class="group fsave">
    <label class="fname"><span>Name</span>
      <input type="text" class="pname" id="planName" maxlength="80" enterkeyhint="done" autocomplete="off" autocapitalize="sentences"></label>
    <div class="fstat"><span class="s" id="fileStatus"></span><span class="acts" id="fileSaveActs"></span></div>
  </div>
  <p class="gnote">Save keeps the plan in this browser.</p>

  <div class="gtitle">Load</div>
  <div class="group fload">
    <select id="loadPick" aria-label="Saved plan to load" aria-describedby="loadNote"></select>
    <button class="btn primary" type="button" id="loadGo">Load</button>
  </div>
  <p class="gnote" id="loadNote"></p>

  <div class="gtitle">Export</div>
  <div class="pad-row two">
    <button class="btn" type="button" id="exportAll" aria-label="Export all plans">All plans</button>
    <button class="btn" type="button" id="exportOne" aria-label="Export this plan">This plan</button>
  </div>
  <p class="gnote">A .json file in Downloads or Files.</p>

  <div class="gtitle">Import</div>
  <div class="pad-row"><button class="btn block" type="button" id="fileImport">Import file</button></div>
  <p class="gnote">Adds the plans in a .json file from this app, with one plan or all of them.</p>`;

let actsHTML = '';
// True from a press on Save as new until its click, so the name typed for
// the open plan names the new plan instead of renaming the open one.
let keepTyped = false;

// Runs after every solve and every box move, because a change to the plan
// changes its status. The buttons are drawn again only when Save as new
// comes or goes, so a button keeps focus, and a press on it keeps its click.
export function renderFileStatus() {
  const { kind, text } = saveStatus();
  const status = $('#fileStatus');
  status.textContent = text;
  status.classList.toggle('changed', kind === 'changed');
  const acts = kind === 'new'
    ? '<button class="btn primary" type="button" id="fileSave">Save</button>'
    : `<button class="btn" type="button" id="fileSave">Save</button>
      <button class="btn" type="button" id="fileSaveNew">Save as new</button>`;
  if (acts !== actsHTML) { actsHTML = acts; $('#fileSaveActs').innerHTML = acts; }
  $('#fileSave').classList.toggle('primary', kind !== 'saved');
  const name = $('#planName');
  if (!openPlan()) name.placeholder = defaultName(state);
}

// Runs when the list of saved plans or the open plan changes.
export function renderFiles() {
  const note = storageNote();
  $('#fileWarn').hidden = !note;
  $('#fileWarn').textContent = note;

  const open = openPlan();
  const name = $('#planName');
  if (document.activeElement !== name) name.value = open ? open.name : draftName();
  if (open) name.placeholder = '';

  const plans = savedPlans();
  const pick = $('#loadPick');
  const chosen = pick.value;
  pick.innerHTML = plans.length
    ? plans.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${p.id === (open && open.id) ? ' (open now)' : ''}</option>`).join('')
    : '<option value="">No saved plans</option>';
  if (plans.some((p) => p.id === chosen)) pick.value = chosen;
  pick.disabled = !plans.length;
  $('#loadGo').disabled = !plans.length;
  $('#loadNote').textContent = plans.length ? 'Opens a plan saved in this browser.' : 'No saved plans yet. Save one above to load it later.';
  $('#exportAll').disabled = !plans.length;
  renderFileStatus();
}

// The name field: for the open plan it renames it, and for a plan that is
// not saved yet it is the name Save uses.
function commitName() {
  const name = $('#planName');
  if (!openPlan()) { setDraftName(name.value); return; }
  renameOpen(name.value);
  // An empty name keeps the old one.
  name.value = openPlan().name;
}

// A name typed for the open plan and not kept yet, or null.
function typedName() {
  const open = openPlan();
  if (!open) return null;
  const typed = $('#planName').value.trim();
  return typed && typed !== open.name ? typed : null;
}

export function wireFiles() {
  const body = $('#filesBody');
  body.innerHTML = PANE;
  const name = $('#planName');
  name.addEventListener('input', () => { if (!openPlan()) setDraftName(name.value); });
  // Leaving the field keeps the name, except for Save as new, which uses it
  // for the new plan. Safari does not focus a pressed button, so a press
  // there is caught by keepTyped instead of relatedTarget.
  name.addEventListener('blur', (e) => {
    if (keepTyped || (e.relatedTarget && e.relatedTarget.id === 'fileSaveNew')) return;
    commitName();
  });
  // Enter keeps the name. Only the Save buttons save the plan.
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
  document.addEventListener('pointerdown', (e) => {
    const onSaveNew = !!e.target.closest && !!e.target.closest('#fileSaveNew');
    // A press on Save as new that ends without a click renames the plan after all.
    if (keepTyped && !onSaveNew && document.activeElement !== name) commitName();
    keepTyped = onSaveNew;
  }, true);
  body.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    keepTyped = false;
    if (button.id === 'fileSave') { commitName(); if (saveStatus().kind === 'new') saveNew(); else saveOver(); }
    else if (button.id === 'fileSaveNew') saveNew(false, typedName());
    else if (button.id === 'loadGo') openSaved($('#loadPick').value, '#loadGo');
    else if (button.id === 'exportAll') exportAll();
    else if (button.id === 'exportOne') { commitName(); exportPlan(); }
    else if (button.id === 'fileImport') pickFile('#fileImport');
  });
}
