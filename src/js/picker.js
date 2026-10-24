/* ---------- Item picker ---------- */
import { DATA, CANDS } from './engine.js';
import { $, esc, icon, isWide } from './core.js';
import { ui } from './store.js';
import { openSheet, closeSheet } from './sheets.js';

const GROUPS = [['science', 'Matrices'], ['components', 'Components'], ['buildings', 'Buildings'], ['df', 'Dark Fog']];
const CATEGORIES = [['all', 'All'], ...GROUPS];

function groupOf(item) {
  if (item.id.startsWith('df-')) return 'df';
  if (item.id.endsWith('-matrix')) return 'science';
  return item.cat === 'buildings' ? 'buildings' : 'components';
}

// onPick gets the id of the item the user chose.
export function openPicker(onPick) {
  ui.picker.onPick = onPick;
  ui.picker.cat = 'all';
  const search = $('#pickSearch');
  search.value = '';
  renderCategories();
  renderGrid();
  // Only on wide screens, so the phone keyboard does not cover the list.
  openSheet('picker', { modal: true, focus: isWide() ? search : null });
}

function renderCategories() {
  const box = $('#pickCats');
  if (!box.children.length) {
    box.innerHTML = CATEGORIES.map(([id, label]) => `<button type="button" class="chip" data-cat="${id}">${label}</button>`).join('');
  }
  for (const chip of box.children) chip.setAttribute('aria-pressed', chip.dataset.cat === ui.picker.cat);
}

const itemButton = (item) => `
  <button type="button" class="ibtn" data-item="${esc(item.id)}">
    <span class="ibox">${icon(item.ic, 40)}</span><span class="t">${esc(item.name)}</span>
  </button>`;

function renderGrid() {
  const query = $('#pickSearch').value.trim().toLowerCase();
  const found = DATA.items.filter((item) => CANDS[item.id] && (!query || item.name.toLowerCase().includes(query)));
  const html = GROUPS.map(([id, label]) => {
    if (ui.picker.cat !== 'all' && ui.picker.cat !== id) return '';
    const list = found.filter((item) => groupOf(item) === id);
    return list.length ? `<div class="grp">${label}</div><div class="igrid">${list.map(itemButton).join('')}</div>` : '';
  }).join('');
  $('#pickGrid').innerHTML = html || `<p class="hintp no-match">No item matches “${esc(query)}”.</p>`;
}

export function wirePicker() {
  $('#pickSearch').addEventListener('input', renderGrid);
  $('#pickCats').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cat]');
    if (!chip) return;
    ui.picker.cat = chip.dataset.cat;
    renderCategories();
    renderGrid();
  });
  $('#pickGrid').addEventListener('click', (e) => {
    const button = e.target.closest('[data-item]');
    if (!button) return;
    closeSheet('picker');
    $('#pickSearch').blur();
    if (ui.picker.onPick) ui.picker.onPick(button.dataset.item);
  });
}
