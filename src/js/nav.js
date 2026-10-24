/* ---------- Navigation: tabs, panes and theme ---------- */
import { $, $$, isWide, hasMouse } from './core.js';
import { state, ui, update } from './store.js';
import { fitView } from './map-view.js';
import { closeInspector } from './inspector.js';
import { toast, hideToast } from './toast.js';

const HINT_KEY = 'dsp-map-hint';

const hintText = () => (hasMouse()
  ? 'Drag to pan, scroll to zoom. Click a box for details.'
  : 'Drag to pan, pinch to zoom. Tap a box for details.');
let hintTimer = 0;

function showMap() {
  // Fit now, before the next frame, so the map does not jump after it shows.
  if (ui.needFit) fitView();
  let seen = false;
  // localStorage throws in some private modes. The hint then shows each time.
  try { seen = localStorage.getItem(HINT_KEY) === '1'; localStorage.setItem(HINT_KEY, '1'); } catch (e) { }
  if (!seen) hintTimer = setTimeout(() => toast(hintText()), 400);
}

// The hint is about the map, so it goes when the map does.
function leaveMap() {
  clearTimeout(hintTimer);
  hideToast(hintText());
}

// The compact tab bar also sets the sidebar and main pane of the wide layout.
function setTab(tab) {
  if (tab !== 'map') closeInspector(true);
  update((draft) => {
    draft.tab = tab;
    if (tab === 'plan' || tab === 'settings') draft.side = tab;
    if (tab === 'map' || tab === 'build') draft.main = tab;
  }, 'nav');
  if (tab === 'map') showMap(); else leaveMap();
}

function setSide(side) {
  update((draft) => { draft.side = side; if (!isWide()) draft.tab = side; }, 'nav');
}

function setMain(main) {
  update((draft) => { draft.main = main; if (!isWide()) draft.tab = main; }, 'nav');
  if (main === 'map') showMap(); else leaveMap();
}

function setBuildSection(section) {
  update((draft) => { draft.bsec = section; }, 'nav');
  $('#buildBody').scrollTop = 0;
}

// Shows the map or the build list in whichever layout is on screen.
export function goTo(view) {
  if (isWide()) setMain(view); else setTab(view);
}

// Each tab list, the state key it shows and how to switch it.
const TAB_LISTS = [
  { list: '#tabBar', key: 'tab', select: setTab },
  { list: '#sideTabs', key: 'side', select: setSide },
  { list: '#mainTabs', key: 'main', select: setMain },
  { list: '#buildTabs', key: 'bsec', select: setBuildSection }
];

export function syncNav() {
  const app = $('#app');
  for (const { list, key } of TAB_LISTS) {
    app.dataset[key] = state[key];
    for (const tab of $$('[role="tab"]', $(list))) {
      const selected = tab.dataset[key] === state[key];
      tab.setAttribute('aria-selected', selected);
      tab.tabIndex = selected ? 0 : -1;
    }
  }
}

// Arrow keys move between tabs and open the one they land on.
function onTabKey(e, list, key, select) {
  const tabs = $$('[role="tab"]', list);
  const at = tabs.indexOf(document.activeElement);
  if (at < 0) return;
  const next = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[e.key];
  if (next === undefined) return;
  e.preventDefault();
  const tab = tabs[(next + tabs.length) % tabs.length];
  tab.focus();
  select(tab.dataset[key]);
}

export function wireNav() {
  for (const { list, key, select } of TAB_LISTS) {
    const el = $(list);
    el.addEventListener('click', (e) => {
      const tab = e.target.closest('[role="tab"]');
      if (tab) select(tab.dataset[key]);
    });
    el.addEventListener('keydown', (e) => onTabKey(e, el, key, select));
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
  // index.html has one theme-color per system scheme. A theme picked in
  // Settings sets both, and Auto puts the original colours back.
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  for (const meta of $$('meta[name="theme-color"]')) {
    meta.dataset.auto ??= meta.getAttribute('content');
    meta.setAttribute('content', root.dataset.theme && bg ? bg : meta.dataset.auto);
  }
}
