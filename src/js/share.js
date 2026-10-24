/* ---------- Share sheet: text summary and plan code ---------- */
import { BELTS, formatNumber, formatPower } from './engine.js';
import { $, $$, itemName, machineName, rateStr, unitLabel, inFrame } from './core.js';
import { state, ui, defaultState, mergeState, replaceState, renderAll } from './store.js';
import { openSheet, closeSheet } from './sheets.js';
import { toast } from './toast.js';

const HINTS = {
  summary: 'Paste this into a note, Discord or a message.',
  code: 'Copy this code to back up the plan. To load one, paste a code here and tap Load.'
};

const byCount = (counts) => Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

function summaryText() {
  const totals = ui.plan.totals, unit = unitLabel();
  const lines = [
    'Dyson Sphere plan',
    'Targets: ' + state.targets.map((t) => `${t.rate}${unit} ${itemName(t.item)}`).join(', '),
    `Power: ${formatPower(totals.power)} | Belt lines: ${totals.belts} (${BELTS[state.belt] * state.stack} items/s each)`,
    '', 'Buildings',
    ...byCount(totals.built).map((m) => `  ${totals.built[m]} x ${machineName(m)}`),
    '', 'Raw input' + unit,
    ...Object.keys(totals.raw).map((k) => `  ${itemName(k)}: ${rateStr(totals.raw[k])}`),
    '', 'Steps',
    ...ui.plan.order.map((id) => {
      const node = ui.plan.nodes[id];
      const made = `${itemName(id)}: ${rateStr(node.outRate[id])}${unit}`;
      return `  ${made} in ${node.built} x ${machineName(node.machine)} (${formatNumber(node.count)} exact)`;
    })
  ];
  return lines.join('\n');
}

// mode: 'summary' or 'code'.
function openShare(mode) {
  for (const button of $$('[data-exp]')) button.setAttribute('aria-pressed', button.dataset.exp === mode);
  const text = $('#expText');
  text.value = mode === 'summary' ? summaryText() : JSON.stringify(state);
  text.readOnly = mode === 'summary';
  $('#expHint').textContent = HINTS[mode];
  $('#expLoad').hidden = mode !== 'code';
  $('#expShare').hidden = !(navigator.share && !inFrame());
  $('#expMsg').textContent = '';
  openSheet('export', { modal: true });
}

function say(message) { $('#expMsg').textContent = message; }

function copyText(text) {
  const fail = () => {
    say('Copy was blocked. Press and hold the text, then choose Select All and Copy.');
    $('#expText').focus();
    $('#expText').select();
  };
  // navigator.clipboard is missing on plain http and in some webviews.
  try { navigator.clipboard.writeText(text).then(() => say('Copied.'), fail); } catch (e) { fail(); }
}

function shareText() {
  navigator.share({ title: 'Dyson Sphere plan', text: $('#expText').value }).catch((err) => {
    if (err.name !== 'AbortError') say('Sharing did not work. Use Copy instead.');
  });
}

function loadCode() {
  let saved;
  try { saved = JSON.parse($('#expText').value); } catch (err) {
    say('That code could not be read. Paste a code copied from this app.');
    return;
  }
  replaceState(mergeState(defaultState(), saved));
  renderAll();
  closeSheet('export');
  toast('Plan loaded');
}

export function wireShare() {
  document.addEventListener('click', (e) => {
    const button = e.target.closest('[data-act]');
    if (button) openShare(button.dataset.act === 'code' ? 'code' : 'summary');
  });
  for (const button of $$('[data-exp]')) button.addEventListener('click', () => openShare(button.dataset.exp));
  $('#expCopy').addEventListener('click', () => copyText($('#expText').value));
  $('#expShare').addEventListener('click', shareText);
  $('#expLoad').addEventListener('click', loadCode);
}
