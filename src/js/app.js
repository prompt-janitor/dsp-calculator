// Entry point. index.html calls boot().
import recipes from './recipes.js';
import { initEngine, solve } from './engine.js';
import { isWide, buildCfg } from './core.js';
import { state, ui, loadState, update, renderAll, onRender } from './store.js';
import { renderMap, fitView } from './map-view.js';
import { syncNav, applyTheme, wireNav } from './nav.js';
import { renderPlan, renderPlanTotals, wirePlan } from './plan-pane.js';
import { renderSettings, wireSettings } from './settings-pane.js';
import { renderBuildList, wireBuildList } from './build-list.js';
import { renderInspector, closeInspector, wireInspector } from './inspector.js';
import { wirePicker } from './picker.js';
import { wireShare } from './share.js';
import { loadSaved, renderSaved, renderSaveBar, openPlanLink, announceLink, wireSaved } from './saved-list.js';
import { renderFiles, renderFileStatus, wireFiles } from './files-pane.js';
import { closeSheet, wireSheets } from './sheets.js';
import { syncMapOptions, wireMapControls } from './map-controls.js';
import { wireKeys } from './keys.js';
import { catchInstallPrompt, registerServiceWorker } from './pwa.js';

function solveAndRender() {
  ui.plan = solve(buildCfg(state));
  if (ui.sel && !ui.plan.nodes[ui.sel]) ui.sel = null;
  if (ui.prune) dropHiddenMoves();
  syncMapOptions();
  renderPlanTotals();
  renderSaveBar();
  renderFileStatus();
  renderMap();
  renderBuildList();
  if (ui.sel) renderInspector(); else closeSheet('inspector');
}

// After a change that takes boxes off the map, their moves go too, so they
// do not come back in the wrong place in another plan. A rate typed as 0
// also takes boxes off for a moment, so it does not prune.
function dropHiddenMoves() {
  ui.prune = false;
  const kept = {};
  for (const id of Object.keys(state.moved)) if (ui.plan.nodes[id]) kept[id] = state.moved[id];
  if (Object.keys(kept).length !== Object.keys(state.moved).length) update((draft) => { draft.moved = kept; });
}

function closeAnySheet(id) {
  if (id === 'inspector') closeInspector(); else closeSheet(id);
}

// A phone keyboard opening or closing changes only the height. That is not a real resize.
function watchResize() {
  let lastWidth = window.innerWidth, lastHeight = window.innerHeight;
  window.addEventListener('resize', () => {
    if (Math.abs(window.innerWidth - lastWidth) < 2 && Math.abs(window.innerHeight - lastHeight) < 120) return;
    lastWidth = window.innerWidth;
    lastHeight = window.innerHeight;
    update((draft) => {
      if (isWide() && draft.tab !== draft.main && (draft.tab === 'map' || draft.tab === 'build')) draft.main = draft.tab;
    }, 'nav', 'settings');
    fitView();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
}

export function boot() {
  initEngine(recipes);
  loadState();
  loadSaved();
  const linked = openPlanLink();
  onRender('theme', applyTheme);
  onRender('nav', syncNav);
  onRender('plan', renderPlan);
  onRender('saved', () => { renderSaved(); renderFiles(); });
  onRender('settings', renderSettings);
  onRender('solve', solveAndRender);
  catchInstallPrompt();
  if (isWide()) update((draft) => { draft.tab = draft.main === 'build' ? 'build' : 'map'; });
  wireNav();
  wirePlan();
  wireSettings();
  wireBuildList();
  wireInspector();
  wirePicker();
  wireShare();
  wireSaved(closeAnySheet);
  wireFiles();
  wireSheets(closeAnySheet);
  wireMapControls();
  wireKeys();
  watchResize();
  renderAll();
  if (linked) announceLink();
  requestAnimationFrame(() => fitView());
  registerServiceWorker();
}
