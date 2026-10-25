// Saved plans, Load/Save, the plan files and plan links, on every device project.
import { test, expect } from '@playwright/test';
import { openApp, showView, sheetOpen, smallTargets } from './helpers.mjs';

const KEY = 'dsp-calculator-plans-v1';
const rows = (page) => page.locator('#savedList .prow');
const row = (page, name) => page.locator('#savedList .prow', { has: page.locator('.t', { hasText: name }) });
const bar = (page) => page.locator('#saveBar');

// A toast can sit over the list on a phone. Steps that do not test the
// toast move it out of the way, as a person would wait for it.
const hideToast = (page) => page.evaluate(() => { document.querySelector('#toast').hidden = true; });

async function openPlanPane(page) {
  const errors = await openApp(page);
  await showView(page, 'plan');
  return errors;
}

// Saves from the line on the Plan pane, then shows the Saved pane.
async function saveCurrent(page) {
  await page.locator('#saveBar [data-save="new"]').first().click();
  await hideToast(page);
  await showView(page, 'saved');
}

// Save as new is on the Load/Save pane.
async function saveAsNew(page) {
  await showView(page, 'files');
  await page.locator('#fileSaveNew').click();
  await hideToast(page);
}

// Reads the file from Export: a stubbed share sheet on iOS, a download elsewhere.
async function exported(page, button) {
  const ios = await page.evaluate(() => /iPad|iPhone|iPod/.test(navigator.userAgent));
  if (ios) {
    await page.evaluate(() => { window.sharedFile = null; });
    await page.locator(button).click();
    await page.waitForFunction(() => !!window.sharedFile);
    return page.evaluate(() => window.sharedFile);
  }
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator(button).click()]);
  let text = '';
  for await (const chunk of await download.createReadStream()) text += chunk;
  return { name: download.suggestedFilename(), text };
}

const stubShare = (page) => page.addInitScript(() => {
  // On iOS the file goes to the share sheet. This records it there.
  navigator.canShare = () => true;
  navigator.share = async ({ files }) => { window.sharedFile = { name: files[0].name, text: await files[0].text() }; };
});

const jsonFile = (name, value) => ({ name, mimeType: 'application/json', buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) });

test('save, open and the unsaved changes mark', async ({ page }) => {
  const errors = await openPlanPane(page);
  await expect(bar(page)).toContainText('Not saved');
  await saveCurrent(page);
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, '60/min Information Matrix').locator('[data-popen]')).toHaveAttribute('aria-current', 'true');
  await expect(bar(page)).toContainText('Saved');

  await showView(page, 'plan');
  await page.locator('[data-tstep="0"][data-dir="1"]').click();
  await expect(bar(page)).toContainText('Unsaved changes');
  await page.locator('#planSave').click();
  await hideToast(page);
  await expect(bar(page)).not.toContainText('Unsaved changes');

  await page.locator('[data-preset="warp"]').click();
  await expect(bar(page)).toContainText('Unsaved changes');
  await expect(page.locator('#fileStatus')).toHaveText('Unsaved changes');
  await saveAsNew(page);
  await expect(page.locator('#fileStatus')).toHaveText('Saved');
  await showView(page, 'saved');
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).first()).toContainText('30/min Space Warper');
  await expect(rows(page).first().locator('[data-popen]')).toHaveAttribute('aria-current', 'true');

  await row(page, 'Information Matrix').locator('[data-popen]').click();
  await expect(page.locator('#planBody .target')).toHaveCount(1);
  await expect(page.locator('#planBody .target')).toContainText('Information Matrix');
  await expect(page.locator('#rate0')).toHaveValue('70');
  await expect(row(page, 'Information Matrix').locator('[data-popen]')).toHaveAttribute('aria-current', 'true');
  await expect(row(page, 'Space Warper').locator('[data-popen]')).not.toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#toast')).toContainText('Opened');

  // A saved plan keeps settings too.
  await showView(page, 'settings');
  await page.locator('[data-stack="3"]').click();
  await showView(page, 'plan');
  await expect(bar(page)).toContainText('Unsaved changes');
  expect(errors).toEqual([]);
});

test('rename, duplicate and a reload keep the list', async ({ page }) => {
  await openPlanPane(page);
  await saveCurrent(page);
  const name = '60/min Information Matrix';
  const more = page.locator(`[data-pmore]`).first();
  await expect(more).toHaveAccessibleName(`Actions for ${name}`);
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: `Rename ${name}` }).click();
  const input = page.getByRole('textbox', { name: `New name for ${name}` });
  await expect(input).toBeFocused();
  await input.fill('Blue science');
  await input.press('Enter');
  await expect(rows(page).first()).toContainText('Blue science');
  await expect(rows(page).first().locator('[data-popen]')).toBeFocused();

  await page.locator('[data-pmore]').first().click();
  await page.getByRole('button', { name: 'Duplicate Blue science' }).click();
  await hideToast(page);
  await expect(rows(page)).toHaveCount(2);
  await expect(row(page, 'Blue science (2)')).toHaveCount(1);
  await expect(row(page, 'Blue science (2)').locator('[data-popen]')).toBeFocused();

  await page.reload();
  await showView(page, 'saved');
  await expect(rows(page)).toHaveCount(2);
  await expect(row(page, 'Blue science (2)')).toHaveCount(1);
  await expect(row(page, /^Blue science$/).locator('[data-popen]')).toHaveAttribute('aria-current', 'true');
});

test('Esc or Cancel ends a rename without a change', async ({ page }) => {
  await openPlanPane(page);
  await saveCurrent(page);
  await page.locator('[data-pmore]').first().click();
  await page.locator('[data-prename]').click();
  await page.locator('#savedList .pname').fill('Other');
  await page.locator('[data-rename-cancel]').click();
  await expect(rows(page).first()).toContainText('60/min Information Matrix');
  await page.locator('[data-pmore]').first().click();
  await page.locator('[data-prename]').click();
  await page.locator('#savedList .pname').fill('Other');
  await page.locator('#savedList .pname').press('Escape');
  await expect(rows(page).first()).toContainText('60/min Information Matrix');
});

test('delete shows Undo, and Undo puts the plan back', async ({ page }) => {
  await openPlanPane(page);
  await saveCurrent(page);
  await showView(page, 'plan');
  await page.locator('[data-preset="warp"]').click();
  await saveAsNew(page);
  await showView(page, 'saved');
  await expect(rows(page)).toHaveCount(2);
  const name = '30/min Space Warper';
  await page.getByRole('button', { name: `Actions for ${name}` }).click();
  await page.getByRole('button', { name: `Delete ${name}` }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(bar(page)).toContainText('Not saved');
  // Focus moves to the row that took its place.
  await expect(rows(page).first().locator('[data-popen]')).toBeFocused();
  await expect(page.locator('#toast')).toContainText(`Deleted “${name}”.`);
  await page.locator('#toastAct').click();
  await expect(rows(page)).toHaveCount(2);
  await expect(row(page, name).locator('[data-popen]')).toHaveAttribute('aria-current', 'true');
  await page.reload();
  await showView(page, 'saved');
  await expect(rows(page)).toHaveCount(2);
});

test('export writes every plan to one file', async ({ page }) => {
  await stubShare(page);
  await openPlanPane(page);
  await showView(page, 'files');
  await expect(page.locator('#exportAll')).toBeDisabled();
  await showView(page, 'plan');
  await saveCurrent(page);
  await showView(page, 'plan');
  await page.locator('[data-preset="warp"]').click();
  await saveAsNew(page);
  const file = await exported(page, '#exportAll');
  expect(file.name).toMatch(/^dsp-calculator-plans-\d{4}-\d{2}-\d{2}\.json$/);
  const json = JSON.parse(file.text);
  expect(json.version).toBe(1);
  expect(json.plans.map((p) => p.name)).toEqual(['30/min Space Warper', '60/min Information Matrix']);
  expect(json.plans[0].data.targets).toEqual([{ item: 'space-warper', rate: 30 }]);
  expect(json.plans[0].data.tab).toBeUndefined();
});

test('one plan exports to its own file, saved or not', async ({ page }) => {
  await stubShare(page);
  await openPlanPane(page);
  await page.locator('[data-preset="warp"]').click();
  await showView(page, 'files');
  // Not saved yet: the name typed here names the file.
  await page.locator('#planName').fill('Warp line');
  let file = await exported(page, '#exportOne');
  expect(file.name).toBe('dsp-calculator-plan-warp-line.json');
  let json = JSON.parse(file.text);
  expect(json.plans.map((p) => p.name)).toEqual(['Warp line']);
  expect(json.plans[0].data.targets).toEqual([{ item: 'space-warper', rate: 30 }]);

  // From the ••• menu of a saved plan.
  await page.locator('#fileSave').click();
  await hideToast(page);
  await showView(page, 'saved');
  await page.getByRole('button', { name: 'Actions for Warp line' }).click();
  file = await exported(page, '[data-pexp]');
  expect(file.name).toBe('dsp-calculator-plan-warp-line.json');
  json = JSON.parse(file.text);
  expect(json.plans).toHaveLength(1);

  // The file imports back as one plan, and the toast can open it.
  await showView(page, 'plan');
  await page.locator('[data-preset="matrices"]').click();
  await showView(page, 'files');
  await page.locator('#planFile').setInputFiles(jsonFile(file.name, file.text));
  await expect(page.locator('#toast')).toContainText('Added “Warp line (2)”.');
  await page.locator('#toastAct').click();
  await expect(page.locator('#toast')).toContainText('Opened “Warp line (2)”.');
  await expect(page.locator('#planName')).toHaveValue('Warp line (2)');
  await expect(page.locator('#planBody .target')).toHaveCount(1);
  await expect(page.locator('#planBody .target')).toContainText('Space Warper');
});

test('import adds plans, numbers a name clash and skips bad ones', async ({ page }) => {
  await openPlanPane(page);
  await saveCurrent(page);
  await showView(page, 'files');
  const file = {
    version: 1,
    plans: [
      { name: '60/min Information Matrix', data: { targets: [{ item: 'information-matrix', rate: 60 }] } },
      { name: '<img src=x onerror="window.pwned=1">', data: { targets: [{ item: 'gear', rate: 12 }], belt: 'nope' } },
      { name: 'Broken', data: 'x' },
      { name: 'All unknown', data: { targets: [{ item: 'nope', rate: 1 }] } }
    ]
  };
  await page.locator('#planFile').setInputFiles({ name: 'plans.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await expect(page.locator('#toast')).toContainText('Added 2 plans. 2 plans could not be read and were skipped.');
  await expect(row(page, 'All unknown')).toHaveCount(0);
  await expect(rows(page)).toHaveCount(3);
  await expect(row(page, '60/min Information Matrix (2)')).toHaveCount(1);
  await expect(row(page, '<img src=x')).toHaveCount(1);
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();

  // An old plan code also imports, as one plan.
  const code = JSON.stringify({ targets: [{ item: 'space-warper', rate: 30 }], tab: 'map' });
  await page.locator('#planFile').setInputFiles({ name: 'code.json', mimeType: 'application/json', buffer: Buffer.from(code) });
  await expect(page.locator('#toast')).toContainText('Added “30/min Space Warper”.');
  await expect(row(page, '30/min Space Warper')).toHaveCount(1);

  await page.locator('#planFile').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('hello') });
  await expect(page.locator('#toast')).toContainText('That file could not be read.');
  await expect(rows(page)).toHaveCount(4);
});

test('a plan link opens the plan and can be saved', async ({ page, context }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.copied = text; } } });
  });
  await openPlanPane(page);
  await page.locator('[data-preset="warp"]').click();
  await showView(page, 'settings');
  await page.locator('[data-stack="2"]').click();
  await page.locator('[data-act="share"]:visible').first().click();
  await sheetOpen(page, 'export');
  await page.locator('#expLink').click();
  await expect(page.locator('#expMsg')).toContainText('Link copied.');
  const link = await page.evaluate(() => window.copied);
  expect(link).toMatch(/\/dsp-calculator\/#plan=[\w-]+$/);

  const other = await context.newPage();
  await other.goto(link);
  await expect(other.locator('#toast')).toContainText('Opened a shared plan.');
  await expect(other.locator('#planBody .target')).toContainText('Space Warper');
  await expect.poll(() => other.evaluate(() => location.hash)).toBe('');
  expect(await other.evaluate(() => JSON.parse(localStorage.getItem('dsp-calculator-v1')).stack)).toBe(2);
  await other.locator('#toastAct').click();
  await expect(other.locator('#savedList .prow')).toHaveCount(1);
  await expect(other.locator('#savedList .prow').first()).toContainText('30/min Space Warper');

  // A broken link says so and leaves the plan alone.
  await other.goto(link.replace(/#plan=.*/, '#plan=broken'));
  await expect(other.locator('#toast')).toContainText('That plan link could not be read.');
  await expect(other.locator('#planBody .target')).toContainText('Space Warper');
});

test('the list stays usable with many plans', async ({ page }) => {
  await openPlanPane(page);
  await page.evaluate((key) => {
    const data = { targets: [{ item: 'gear', rate: 60 }] };
    const plans = Array.from({ length: 55 }, (_, i) => ({ id: 'p' + i, name: `Plan ${i}`, createdAt: 1e12 - i, updatedAt: 1e12 - i, openedAt: 0, data }));
    localStorage.setItem(key, JSON.stringify({ version: 1, open: null, plans }));
  }, KEY);
  await page.reload();
  await showView(page, 'saved');
  await expect(rows(page)).toHaveCount(6);
  await page.locator('[data-pall="1"]').click();
  await expect(rows(page)).toHaveCount(55);
  await page.locator('#planFind').fill('plan 4');
  await expect(rows(page)).toHaveCount(11);
  await page.locator('#planFind').fill('');
  // The pane scrolls as one, with no scroll box inside it.
  const inner = await page.evaluate(() => {
    const list = document.querySelector('#savedList');
    return list.scrollHeight - list.clientHeight;
  });
  expect(inner).toBeLessThanOrEqual(1);
  const sizes = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(sizes[0]).toBeLessThanOrEqual(sizes[1]);
});

test('saved plan controls are 44 px on touch screens', async ({ page, hasTouch }) => {
  test.skip(!hasTouch, 'touch devices only');
  await openPlanPane(page);
  await saveCurrent(page);
  await showView(page, 'plan');
  await page.locator('[data-tstep="0"][data-dir="1"]').click();
  expect(await smallTargets(page)).toEqual([]);
  await showView(page, 'saved');
  await page.locator('[data-pmore]').first().click();
  expect(await smallTargets(page)).toEqual([]);
  await page.locator('[data-prename]').click();
  expect(await smallTargets(page)).toEqual([]);
  await showView(page, 'files');
  expect(await smallTargets(page)).toEqual([]);
  for (const field of ['#savedList .pname', '#planName', '#loadPick']) {
    const font = await page.locator(field).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(font, field).toBeGreaterThanOrEqual(16);
  }
});

test('rows and actions work with the keyboard', async ({ page, hasTouch, browserName }) => {
  test.skip(hasTouch, 'keyboard only');
  // Safari moves to buttons with Option+Tab unless a setting is on.
  const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  await openPlanPane(page);
  await saveCurrent(page);
  await showView(page, 'plan');
  // The line is drawn again, and focus goes to the button in its place.
  await page.locator('#planSaveNew').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#planSaveNew')).toBeFocused();
  await hideToast(page);
  await page.locator('[data-preset="warp"]').click();
  await showView(page, 'files');
  await page.locator('#fileSaveNew').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#fileSave')).toBeFocused();
  await hideToast(page);
  await showView(page, 'saved');
  await page.locator('[data-pmore]').first().focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press(tab);
  await expect(page.locator('[data-prename]')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type(' line');
  await page.keyboard.press('Enter');
  await expect(rows(page).first()).toContainText('30/min Space Warper line');
  await page.keyboard.press(tab);
  await page.keyboard.press(tab);
  await page.keyboard.press('Enter');
  await expect(page.locator('#planBody .target')).toContainText('Information Matrix');
});

test('a plan link opens offline', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'checked in Chromium only');
  const context = await browser.newContext({ serviceWorkers: 'allow', baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await openApp(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.waitForLoadState('load');
  await saveCurrent(page);
  const code = Buffer.from(JSON.stringify({ targets: [{ item: 'space-warper', rate: 30 }] })).toString('base64url');
  await context.setOffline(true);
  await page.goto('about:blank');
  await page.goto('./#plan=' + code);
  await expect(page.locator('#stage .node').first()).toBeAttached();
  await showView(page, 'plan');
  await expect(page.locator('#planBody .target')).toContainText('Space Warper');
  await expect(page.locator('#savedList .prow')).toHaveCount(1);
  await context.close();
});

const linkTo = (data) => './#plan=' + Buffer.from(JSON.stringify(data)).toString('base64url');

test('a plan link can be undone, and its toast does not come back after a save', async ({ page }) => {
  await openPlanPane(page);
  await page.locator('#rate0').fill('999');
  await page.locator('#rate0').press('Tab');
  await page.goto(linkTo({ targets: [{ item: 'iron-ingot', rate: 5 }] }));
  await expect(page.locator('#toast')).toContainText('Opened a shared plan.');
  await expect(page.locator('#toastAct2')).toHaveText('Undo');
  await page.locator('#toastAct2').click();
  await showView(page, 'plan');
  await expect(page.locator('#rate0')).toHaveValue('999');

  await page.goto(linkTo({ targets: [{ item: 'iron-ingot', rate: 5 }] }));
  await expect(page.locator('#toast')).toContainText('Opened a shared plan.');
  await showView(page, 'plan');
  await page.locator('#saveBar [data-save="new"]').click();
  await expect(page.locator('#toast')).toContainText('Saved as “5/min Iron Ingot”.');
  await page.locator('#toastClose').click();
  await expect(page.locator('#toast')).toBeHidden();
  await expect(rows(page)).toHaveCount(1);
});

test('a plan link in an open tab closes open sheets', async ({ page }) => {
  await openPlanPane(page);
  await page.locator('[data-act="share"]:visible').first().click();
  await sheetOpen(page, 'export');
  await page.evaluate((hash) => { location.hash = hash; }, linkTo({ targets: [{ item: 'gear', rate: 5 }] }).slice(2));
  await expect(page.locator('#toast')).toContainText('Opened a shared plan.');
  await expect(page.locator('#export')).toBeHidden();
  await showView(page, 'plan');
  await expect(page.locator('#planBody .target')).toContainText('Gear');
});

test('the Saved toast goes away once the plan changes', async ({ page }) => {
  await openPlanPane(page);
  await page.locator('#saveBar [data-save="new"]').click();
  await expect(page.locator('#toast')).toContainText('Saved as');
  await page.locator('[data-tstep="0"][data-dir="1"]').click();
  await expect(bar(page)).toContainText('Unsaved changes');
  await expect(page.locator('#toast')).toBeHidden();
});

test('full storage is said in the same toast, and another tab does not wipe the list', async ({ context }) => {
  await context.addInitScript(() => {
    if (window.name !== 'full') return;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'dsp-calculator-plans-v1') throw new DOMException('full', 'QuotaExceededError');
      return setItem.call(this, key, value);
    };
  });
  const page = await context.newPage();
  await openApp(page);
  await page.evaluate(() => { window.name = 'full'; });
  await page.reload();
  await showView(page, 'plan');
  await page.locator('#saveBar [data-save="new"]').click();
  await expect(page.locator('#toast')).toContainText('Saved as “60/min Information Matrix”. This browser could not keep your plans.');
  await expect(bar(page)).toContainText('Saved until you close the page');
  await expect(page.locator('#savedBody .gnote.warn')).toHaveCount(1);
  await expect(page.locator('#fileWarn')).toContainText('This browser could not keep your plans');

  const other = await context.newPage();
  await openApp(other);
  await showView(other, 'plan');
  await other.locator('[data-preset="warp"]').click();
  await other.locator('#saveBar [data-save="new"]').click();
  await expect(rows(page)).toHaveCount(2);
  await expect(row(page, '60/min Information Matrix')).toHaveCount(1);
  await expect(page.locator('#savedBody .gnote.warn')).toHaveCount(1);
});

test('renaming a plan deleted in another tab says so', async ({ page }) => {
  await openPlanPane(page);
  await saveCurrent(page);
  await page.locator('[data-pmore]').first().click();
  await page.locator('[data-prename]').click();
  await page.locator('#savedList .pname').fill('Too late');
  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, open: null, plans: [] }));
    window.dispatchEvent(new StorageEvent('storage', { key }));
  }, KEY);
  await page.locator('#savedList .pname').press('Enter');
  await expect(page.locator('#toast')).toContainText('That plan was deleted in another tab, so it was not renamed.');
  await expect(rows(page)).toHaveCount(0);
});

test('Load opens the plan picked in the list, with Undo', async ({ page }) => {
  await openPlanPane(page);
  await showView(page, 'files');
  await expect(page.locator('#loadPick')).toBeDisabled();
  await expect(page.locator('#loadGo')).toBeDisabled();
  await expect(page.locator('#loadNote')).toContainText('No saved plans yet.');
  await showView(page, 'plan');
  await saveCurrent(page);
  await showView(page, 'plan');
  await page.locator('[data-preset="warp"]').click();
  await saveAsNew(page);
  // Newest first.
  await expect(page.locator('#loadPick option')).toHaveText(['30/min Space Warper (open now)', '60/min Information Matrix']);
  await page.locator('#loadPick').selectOption({ label: '60/min Information Matrix' });
  await page.locator('#loadGo').click();
  await expect(page.locator('#toast')).toContainText('Opened “60/min Information Matrix”.');
  await expect(page.locator('#loadGo')).toBeFocused();
  await expect(page.locator('#planName')).toHaveValue('60/min Information Matrix');
  await expect(page.locator('#planBody .target')).toContainText('Information Matrix');
  await page.locator('#toastAct').click();
  await expect(page.locator('#planBody .target')).toContainText('Space Warper');
  await expect(page.locator('#planName')).toHaveValue('30/min Space Warper');
});

test('the name field names a new plan and renames the open one', async ({ page }) => {
  await openPlanPane(page);
  await showView(page, 'files');
  const name = page.locator('#planName');
  await expect(name).toHaveValue('');
  await expect(name).toHaveAttribute('placeholder', '60/min Information Matrix');
  await expect(page.locator('#fileStatus')).toHaveText('Not saved');
  await expect(page.locator('#fileSaveNew')).toHaveCount(0);
  await name.fill('Blue science');
  await page.locator('#fileSave').click();
  await expect(page.locator('#toast')).toContainText('Saved as “Blue science”.');
  await expect(page.locator('#fileStatus')).toHaveText('Saved');
  await hideToast(page);

  await name.fill('Blue line');
  await name.press('Enter');
  await expect(page.locator('#toast')).toContainText('Renamed to “Blue line”.');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Blue line');
  await expect(bar(page)).toContainText('Blue line');
  // An empty name keeps the old one.
  await name.fill('');
  await name.press('Enter');
  await expect(name).toHaveValue('Blue line');
});

test('the Saved pane offers to save when it is empty', async ({ page }) => {
  await openPlanPane(page);
  await showView(page, 'saved');
  await expect(page.locator('#savedBody')).toContainText('No saved plans yet.');
  await page.locator('#savedFirst').click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first().locator('[data-popen]')).toBeFocused();
});

test('Rename in the Saved toast goes to the name field', async ({ page }) => {
  await openPlanPane(page);
  await page.locator('#saveBar [data-save="new"]').click();
  await page.locator('#toastAct').click();
  await expect(page.locator('#pane-files')).toBeVisible();
  await expect(page.locator('#planName')).toBeFocused();
});
