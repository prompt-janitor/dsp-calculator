/* ---------- Navigation: tabs, panes and theme ---------- */
import { $, $$, isWide } from './core.js';
import { state, ui, update } from './store.js';
import { fitView } from './map-view.js';
import { closeInspector } from './inspector.js';
import { toast } from './toast.js';

const HINT_KEY = 'dsp-map-hint';

function showMap() {
  requestAnimationFrame(() => { if (ui.needFit) fitView(); });
  let seen = false;
  // localStorage throws in some private modes. The hint then shows each time.
  try { seen = localStorage.getItem(HINT_KEY) === '1'; localStorage.setItem(HINT_KEY, '1'); } catch (e) { }
  if (!seen) setTimeout(() => toast('Drag to pan, pinch to zoom. Tap a box for details.'), 400);
}

// The compact tab bar also sets the sidebar and main pane of the wide layout.
export function setTab(tab) {
  if (tab !== 'map') closeInspector(true);
  update((draft) => {
    draft.tab = tab;
    if (tab === 'plan' || tab === 'settings') draft.side = tab;
    if (tab === 'map' || tab === 'build') draft.main = tab;
  }, 'nav');
  if (tab === 'map') showMap();
}

function setSide(side) {
  update((draft) => { draft.side = side; if (!isWide()) draft.tab = side; }, 'nav');
}

export function setMain(main) {
  update((draft) => { draft.main = main; if (!isWide()) draft.tab = main; }, 'nav');
  if (main === 'map') showMap();
}

function setBuildSection(section) {
  update((draft) => { draft.bsec = section; }, 'nav');
  $('#buildBody').scrollTop = 0;
}

// Shows the map or the build list in whichever layout is on screen.
export function goTo(view) {
  if (isWide()) setMain(view); else setTab(view);
}

// Each switch, the state key it shows and how to change it.
const SWITCHES = [
  { list: '.tabbar', key: 'tab', select: setTab, attr: 'aria-selected' },
  { list: '.side .wide-head .seg', key: 'side', select: setSide, attr: 'aria-pressed' },
  { list: '.main-head .seg', key: 'main', select: setMain, attr: 'aria-pressed' },
  { list: '.segbar .seg', key: 'bsec', select: setBuildSection, attr: 'aria-pressed' }
];

export function syncNav() {
  const app = $('#app');
  for (const { list, key, attr } of SWITCHES) {
    app.dataset[key] = state[key];
    for (const button of $$(`[data-${key}]`, $(list))) button.setAttribute(attr, button.dataset[key] === state[key]);
  }
}

export function wireNav() {
  for (const { list, key, select } of SWITCHES) {
    $(list).addEventListener('click', (e) => {
      const button = e.target.closest(`[data-${key}]`);
      if (button) select(button.dataset[key]);
    });
  }
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-goto]');
    if (link) goTo(link.dataset.goto);
  });
  for (const pane of ['plan', 'build', 'settings']) {
    const body = $(`#pane-${pane} .pane-body`);
    body.addEventListener('scroll', () => $('#pane-' + pane).classList.toggle('scrolled', body.scrollTop > 4), { passive: true });
  }
}

export function applyTheme() {
  const theme = state.opts.theme;
  const root = document.documentElement;
  if (theme === 'dark' || theme === 'light') root.dataset.theme = theme;
  else delete root.dataset.theme;
  const meta = $('meta[name="theme-color"]:not([media])');
  if (meta) meta.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim() || '#0a1117');
}
