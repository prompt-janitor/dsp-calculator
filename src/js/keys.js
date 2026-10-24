/* ---------- Keyboard shortcuts for the whole page ---------- */
import { closeSheet } from './sheets.js';
import { closeInspector } from './inspector.js';

export function wireKeys() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeSheet('picker');
    closeSheet('export');
    closeInspector();
  });
}
