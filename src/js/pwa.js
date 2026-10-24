// Install prompt and service worker.
import { inFrame } from './core.js';
import { ui, render } from './store.js';
import { toast } from './toast.js';

// Chrome and Edge offer an install prompt. Keep it for the button in Settings.
export function catchInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    ui.installPrompt = e;
    render('settings');
  });
}

export function install() {
  if (!ui.installPrompt) return;
  ui.installPrompt.prompt();
  ui.installPrompt = null;
  render('settings');
}

function offerUpdate(next) {
  if (navigator.serviceWorker.controller) toast('A new version is ready.', 'Reload', () => next.postMessage('skip'));
}

function watchForUpdate(reg) {
  // A worker found on an earlier visit still waits until the user says so.
  if (reg.waiting) offerUpdate(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const next = reg.installing;
    if (!next) return;
    next.addEventListener('statechange', () => {
      if (next.state === 'installed') offerUpdate(next);
    });
  });
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || inFrame() || location.protocol === 'file:') return;
  // Service worker calls can throw or reject in private modes and when
  // storage is blocked. The app still works then, only without offline use.
  try {
    navigator.serviceWorker.register('sw.js').then(watchForUpdate).catch(() => { });
    // On the first visit the new worker takes control without an update,
    // so that first change needs no reload.
    let firstClaim = !navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (firstClaim) { firstClaim = false; return; }
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  } catch (e) { }
}
