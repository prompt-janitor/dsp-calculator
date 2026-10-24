/* ---------- Keyboard shortcuts for the whole page ---------- */
import { openModal, closeSheet } from './sheets.js';
import { closeInspector } from './inspector.js';

// Esc closes the top sheet: a modal sheet first, then the inspector.
export function wireKeys() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const modal = openModal();
    if (modal) closeSheet(modal.id);
    else closeInspector();
  });
}
