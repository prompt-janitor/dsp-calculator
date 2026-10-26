// The step layout: the preview in the step details and the layout sheet.
import { test, expect } from '@playwright/test';
import { openApp, sheetOpen, smallTargets } from './helpers.mjs';

// Opens the app on the map with a plan for Circuit Boards, then opens that step.
async function openStep(page, item = 'circuit-board', rate = 1800) {
  await page.goto('./');
  await page.evaluate(([item, rate]) => localStorage.setItem('dsp-calculator-v1',
    JSON.stringify({ targets: [{ item, rate }], unit: 'min', tab: 'map', main: 'map' })), [item, rate]);
  const errors = await openApp(page);
  const node = page.locator(`#stage .node[data-id="${item}"]`);
  await node.focus();
  await page.keyboard.press('Enter');
  await sheetOpen(page, 'inspector');
  return errors;
}

async function noSideScroll(page) {
  const sizes = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, width: document.documentElement.clientWidth }));
  expect(sizes.doc).toBeLessThanOrEqual(sizes.width);
}

test('the step details show a layout preview and summary', async ({ page }) => {
  const errors = await openStep(page);
  const card = page.locator('#inspBody .lv-card');
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('svg[role="img"]')).toBeVisible();
  await expect(card.locator('svg[role="img"]')).toHaveAttribute('aria-label', /Assembling Machines Mk\.III/);
  // 30 boards a second at 3 a second each: 10 Mk.III assemblers, one belt of iron ingots.
  await expect(card.locator('.lv-sum')).toHaveText('Build one row of 10 Assembling Machines Mk.III.');
  await expect(page.locator('#i_layout')).toHaveText('Open layout');
  await noSideScroll(page);
  expect(errors).toEqual([]);
});

test('the layout sheet opens, changes sorter tier and closes', async ({ page, hasTouch }) => {
  await openStep(page);
  await page.locator('#i_layout').scrollIntoViewIfNeeded();
  await page.locator('#i_layout').click();
  await sheetOpen(page, 'layoutSheet');
  const sheet = page.locator('#layoutSheet');
  await expect(sheet.locator('#lsCanvas > svg')).toBeVisible();
  await expect(sheet.locator('.lv-table')).toBeVisible();
  await expect(sheet).toContainText('A suggested layout. Check it in the game before you build.');
  await noSideScroll(page);
  // The dialog slides in, and a box measured during that can come out a fraction under 44 px.
  await expect(sheet).toHaveCSS('opacity', '1');
  await page.waitForTimeout(300);
  if (hasTouch) expect(await smallTargets(page)).toEqual([]);

  const ironSorters = sheet.locator('.lv-table tbody tr').first().locator('td').nth(2);
  await expect(ironSorters).toContainText('1');
  await sheet.locator('#lsSorter').selectOption('sorter-1');
  // Sorter Mk.I moves 1.5 a second at 1 tile, so 3 iron ingots a second need 2.
  await expect(ironSorters).toContainText('2');
  await expect(sheet.locator('.lv-notes')).toContainText('Sorter Mk.II or faster fits.');

  // Zoom buttons change the view.
  const box = () => sheet.locator('#lsCanvas > svg').getAttribute('viewBox');
  const before = await box();
  await sheet.locator('#lsZoomIn').click();
  expect(await box()).not.toBe(before);
  await sheet.locator('#lsFit').click();

  await sheet.locator('#lsClose').click();
  await expect(sheet).toBeHidden();
  await expect(page.locator('#inspector')).toBeVisible();
});

test('Esc closes the layout sheet and focus goes back to Open layout', async ({ page, hasTouch }) => {
  test.skip(hasTouch, 'keyboard only');
  await openStep(page);
  await page.locator('#i_layout').focus();
  await page.keyboard.press('Enter');
  await sheetOpen(page, 'layoutSheet');
  await expect(page.locator('#lsClose')).toBeFocused();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.querySelector('#layoutSheet').contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#layoutSheet')).toBeHidden();
  await expect(page.locator('#i_layout')).toBeFocused();
  await expect(page.locator('#inspector')).toBeVisible();
});

test('the sorter tier is kept after a reload', async ({ page }) => {
  await openStep(page);
  await page.locator('#i_layout').click();
  await sheetOpen(page, 'layoutSheet');
  await page.locator('#lsSorter').selectOption('sorter-4');
  await expect(page.locator('#layoutSheet .lv-notes')).toContainText('Pile Sorter speeds');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dsp-calculator-v1')).opts.sorter);
  expect(saved).toBe('sorter-4');
});

test('fractionators and labs get their own layouts', async ({ page }) => {
  await openStep(page, 'deuterium', 600);
  await expect(page.locator('#inspBody .lv-sum')).toContainText('Fractionators');
  await page.locator('#i_layout').click();
  await sheetOpen(page, 'layoutSheet');
  // Fractionators have belt ports and no sorters.
  await expect(page.locator('#lsSorter')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#layoutSheet')).toBeHidden();

  await openStep(page, 'information-matrix', 120);
  await expect(page.locator('#inspBody .lv-sum')).toHaveText('Build one row of 20 Matrix Labs in 2 stacks.');
});

test('a step with no row layout says why', async ({ page }) => {
  await openStep(page, 'iron-ingot', 60);
  await page.locator('#inspBody [data-jump="iron-ore"]').click();
  await expect(page.locator('#inspBody')).toContainText('Place these on the ore vein.');
  await expect(page.locator('#i_layout')).toHaveCount(0);
});
