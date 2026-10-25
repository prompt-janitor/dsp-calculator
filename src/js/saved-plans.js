// Saved plans: the list kept on this device, the backup file and plan links.
// No DOM here, so the tests can run it in Node.
import { ITEMS } from './engine.js';
import { defaultState, mergeState } from './store.js';

export const PLANS_KEY = 'dsp-calculator-plans-v1';
const VERSION = 1;
const NAME_MAX = 80;
// Far more than anyone adds by hand. A plan this big did not come from this app.
const TARGETS_MAX = 1000;
// A backup or a link this big did not come from this app.
const FILE_MAX = 5 * 1024 * 1024;
export const LINK_MAX = 60000;
// The most plans the list takes from imports.
export const PLANS_MAX = 2000;
const LINK_PREFIX = '#plan=';

// The parts of the state a saved plan keeps. Tabs, panes, theme and map
// options are not part of a plan.
const PLAN_KEYS = ['targets', 'unit', 'machines', 'belt', 'stack', 'prolif', 'mining', 'overrides'];

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const clone = (value) => JSON.parse(JSON.stringify(value));

export function planData(choices) {
  const data = {};
  for (const key of PLAN_KEYS) data[key] = clone(choices[key]);
  return data;
}

// Checks a plan from storage, a file or a link the same way as a plan code.
// Returns null when it does not look like a plan at all. strict: also null
// when it had targets and none of them were valid, for files and links. A
// stored plan is kept even then, so it is not deleted without a word.
export function readPlanData(raw, strict = false) {
  if (!isObject(raw) || !Array.isArray(raw.targets)) return null;
  const data = planData(mergeState(defaultState(), raw));
  if (strict && raw.targets.length && !data.targets.length) return null;
  data.targets = data.targets.slice(0, TARGETS_MAX);
  return data;
}

// The current state with a plan's choices in it. Tabs and theme stay as they are.
export function withPlan(current, data) {
  return mergeState(defaultState(), { ...clone(current), ...clone(data) });
}

// JSON with sorted keys, so two plans with the same choices compare equal.
function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (isObject(value)) return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export const samePlan = (a, b) => stable(planData(a)) === stable(planData(b));

const rateText = (rate) => String(+(+rate).toPrecision(6));

// "60/min Information Matrix", and "+2 more" when there are more targets.
export function defaultName(data) {
  const targets = data.targets || [];
  if (!targets.length) return 'Empty plan';
  const first = targets[0];
  const name = ITEMS[first.item] ? ITEMS[first.item].name : first.item;
  const more = targets.length > 1 ? ` +${targets.length - 1} more` : '';
  return `${rateText(first.rate)}${data.unit === 's' ? '/s' : '/min'} ${name}${more}`;
}

// Control characters and extra spaces are removed, and long names are cut.
export function cleanName(name) {
  if (typeof name !== 'string') return '';
  return name.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
}

// Adds " (2)", " (3)" and so on when the name is taken.
export function uniqueName(plans, name, exceptId = null) {
  const taken = new Set(plans.filter((p) => p.id !== exceptId).map((p) => p.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  const base = name.replace(/ \(\d+\)$/, '');
  for (let n = 2; ; n++) {
    const next = `${base.slice(0, NAME_MAX - 6)} (${n})`;
    if (!taken.has(next.toLowerCase())) return next;
  }
}

let idCount = 0;
export const newId = () => 'p' + Date.now().toString(36) + (idCount++).toString(36) + Math.random().toString(36).slice(2, 6);

const isTime = (value) => Number.isFinite(value) && value > 0 && value < 8.64e15;
// Last opened or saved, for the sort.
export const lastUsed = (plan) => Math.max(plan.updatedAt, plan.openedAt || 0);
export const sortPlans = (plans) => plans.sort((a, b) => lastUsed(b) - lastUsed(a));

// The list is changed in place by these functions. Each one returns the plan
// it made or changed.
export function addPlan(plans, choices, name, now = Date.now()) {
  const data = planData(choices);
  const plan = { id: newId(), name: uniqueName(plans, cleanName(name) || defaultName(data)), createdAt: now, updatedAt: now, openedAt: now, data };
  plans.unshift(plan);
  return plan;
}

export function overwritePlan(plans, id, choices, now = Date.now()) {
  const plan = plans.find((p) => p.id === id);
  if (!plan) return null;
  plan.data = planData(choices);
  plan.updatedAt = now;
  plan.openedAt = now;
  return plan;
}

// An empty name keeps the old one. The times stay as they are, so the row
// keeps its place in the list.
export function renamePlan(plans, id, name) {
  const plan = plans.find((p) => p.id === id);
  const clean = cleanName(name);
  if (!plan || !clean) return plan || null;
  plan.name = clean;
  return plan;
}

export function duplicatePlan(plans, id, now = Date.now()) {
  const plan = plans.find((p) => p.id === id);
  if (!plan) return null;
  const copy = { id: newId(), name: uniqueName(plans, plan.name), createdAt: now, updatedAt: now, openedAt: 0, data: clone(plan.data) };
  plans.splice(plans.indexOf(plan), 0, copy);
  return copy;
}

export function markOpened(plans, id, now = Date.now()) {
  const plan = plans.find((p) => p.id === id);
  if (plan) plan.openedAt = now;
  return plan || null;
}

// Returns the removed plan and where it was, for Undo.
export function deletePlan(plans, id) {
  const at = plans.findIndex((p) => p.id === id);
  if (at < 0) return null;
  return { plan: plans.splice(at, 1)[0], at };
}

export function restorePlan(plans, removed) {
  plans.splice(Math.min(removed.at, plans.length), 0, removed.plan);
  return removed.plan;
}

// One plan from storage or a backup file, checked. keepId: storage keeps its
// ids, a file gets new ones so it cannot clash with plans already here.
function readPlan(raw, keepId, now) {
  if (!isObject(raw)) return null;
  const data = readPlanData(raw.data, !keepId);
  if (!data) return null;
  const id = keepId && typeof raw.id === 'string' && /^[\w-]{1,40}$/.test(raw.id) ? raw.id : newId();
  const createdAt = isTime(raw.createdAt) ? raw.createdAt : now;
  const updatedAt = isTime(raw.updatedAt) ? raw.updatedAt : createdAt;
  const openedAt = isTime(raw.openedAt) ? raw.openedAt : 0;
  return { id, name: cleanName(raw.name) || defaultName(data), createdAt, updatedAt, openedAt, data };
}

// Storage. Both functions take the storage object, so the tests can pass a
// fake one. ok is false when storage is blocked, full or missing.
// locked is true when the list was written by a newer version of the app,
// for example in another tab after an update. Then this tab must not write
// over it.
export const UNREAD_KEY = PLANS_KEY + '-unread';
export function loadPlans(storage, now = Date.now()) {
  const empty = { plans: [], open: null, ok: true, locked: false };
  let raw;
  // localStorage throws in some private modes and when storage is blocked.
  try { raw = storage.getItem(PLANS_KEY); } catch (e) { return { ...empty, ok: false }; }
  if (!raw) return empty;
  let saved = null;
  try { saved = JSON.parse(raw); } catch (e) { saved = null; }
  if (isObject(saved) && Number.isFinite(saved.version) && saved.version > VERSION) return { ...empty, locked: true };
  if (!isObject(saved) || saved.version !== VERSION || !Array.isArray(saved.plans)) {
    // Keep a copy of what could not be read, because the next save writes over it.
    try { storage.setItem(UNREAD_KEY, raw); } catch (e) { }
    return empty;
  }
  const plans = [];
  const ids = new Set();
  for (const entry of saved.plans) {
    const plan = readPlan(entry, true, now);
    if (!plan) continue;
    if (ids.has(plan.id)) plan.id = newId();
    ids.add(plan.id);
    plans.push(plan);
  }
  const open = typeof saved.open === 'string' && ids.has(saved.open) ? saved.open : null;
  return { plans: sortPlans(plans), open, ok: true, locked: false };
}

export function savePlans(storage, plans, open) {
  // localStorage throws in some private modes and when storage is full.
  try {
    storage.setItem(PLANS_KEY, JSON.stringify({ version: VERSION, open, plans }));
    return true;
  } catch (e) {
    return false;
  }
}

// The backup file, and the file for one plan. Both use the same format, so
// one import reads either.
const pad = (n) => String(n).padStart(2, '0');
const day = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const exportName = (date = new Date()) => `dsp-calculator-plans-${day(date)}.json`;

// dsp-calculator-plan-<name>.json, with the name in lower case letters,
// digits and dashes. A name with none of those gives the date.
export function planFileName(name, date = new Date()) {
  const safe = cleanName(name).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/^-+|-+$/g, '');
  return `dsp-calculator-plan-${safe || day(date)}.json`;
}

// A plan as the file keeps it, for the current plan when it is not saved.
export function planEntry(choices, name, now = Date.now()) {
  return { name: cleanName(name) || defaultName(choices), createdAt: now, updatedAt: now, openedAt: 0, data: planData(choices) };
}

export function exportText(plans, date = new Date()) {
  const list = plans.map(({ name, createdAt, updatedAt, openedAt, data }) => ({ name, createdAt, updatedAt, openedAt, data }));
  return JSON.stringify({ app: 'dsp-calculator', version: VERSION, exported: date.toISOString(), plans: list }, null, 2) + '\n';
}

// Adds the plans in a backup file to the list. A single plan code (the Share
// sheet format) counts as one plan. Returns null when the file cannot be read.
// skipped: plans that could not be read. full: plans past PLANS_MAX.
// ids: the plans that were added.
export function importText(plans, text, now = Date.now()) {
  if (typeof text !== 'string' || text.length > FILE_MAX) return null;
  let file;
  try { file = JSON.parse(text); } catch (e) { return null; }
  let entries;
  if (isObject(file) && Array.isArray(file.plans)) entries = file.plans;
  else if (isObject(file) && Array.isArray(file.targets)) entries = [{ data: file }];
  else return null;
  let skipped = 0, full = 0;
  const kept = [];
  for (const entry of entries) {
    const plan = readPlan(entry, false, now);
    if (!plan) { skipped++; continue; }
    if (plans.length + kept.length >= PLANS_MAX) { full++; continue; }
    plan.name = uniqueName([...plans, ...kept], plan.name);
    kept.push(plan);
  }
  plans.push(...kept);
  sortPlans(plans);
  return { added: kept.length, skipped, full, ids: kept.map((p) => p.id) };
}

// Plan links: #plan=<base64url of the plan as JSON>.
function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code) {
  const binary = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export const encodePlan = (choices) => toBase64Url(JSON.stringify(planData(choices)));

// href: the page address. Any old hash is replaced. null when the plan is
// too big for a link that decodePlanHash takes.
export function planLink(href, choices) {
  const code = encodePlan(choices);
  return code.length > LINK_MAX ? null : href.split('#')[0] + LINK_PREFIX + code;
}

export const isPlanHash = (hash) => typeof hash === 'string' && hash.startsWith(LINK_PREFIX);

// The checked plan in a #plan= hash, or null when it cannot be read.
export function decodePlanHash(hash) {
  if (!isPlanHash(hash)) return null;
  const code = hash.slice(LINK_PREFIX.length);
  if (!code || code.length > LINK_MAX || !/^[\w-]+$/.test(code)) return null;
  try { return readPlanData(JSON.parse(fromBase64Url(code)), true); } catch (e) { return null; }
}
