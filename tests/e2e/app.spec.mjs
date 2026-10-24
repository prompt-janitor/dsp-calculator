import { test, expect } from '@playwright/test';
import { openApp, showView, tapMapNode, sheetOpen, smallTargets, isWide } from './helpers.mjs';

const VIEWS = ['plan', 'map', 'build', 'settings'];

test('loads with no console errors', async ({ page }) => {
  const errors = await openApp(page);
  for (const v of VIEWS) await showView(page, v);
  expect(errors).toEqual([]);
});

test('adds a target with the item picker', async ({ page }) => {
  await openApp(page);
  await showView(page, 'plan');
  const targets = page.locator('#planBody .target');
  await expect(targets).toHaveCount(1);
  await page.locator('#addTarget').click();
  await expect(page.locator('#picker')).toBeVisible();
  await page.locator('#pickSearch').fill('gear');
  await page.locator('#pickGrid [data-item="gear"]').click();
  await expect(page.locator('#picker')).toBeHidden();
  await expect(targets).toHaveCount(2);
  await expect(targets.nth(1)).toContainText('Gear');
});

test('map shows nodes', async ({ page }) => {
  await openApp(page);
  await showView(page, 'map');
  await expect(page.locator('#mapEmpty')).toBeHidden();
  expect(await page.locator('#stage .node').count()).toBeGreaterThan(5);
  await expect(page.locator('#stage .node.target')).toBeVisible();
});

test('build list shows buildings', async ({ page }) => {
  await openApp(page);
  await showView(page, 'build');
  const rows = page.locator('#buildBody [data-sec="buildings"] .row');
  expect(await rows.count()).toBeGreaterThan(2);
  await expect(rows.first()).toBeVisible();
  await expect(rows.first()).toContainText(/\d/);
});

test('changing a setting changes the result', async ({ page }) => {
  await openApp(page);
  const buildings = page.locator('#planStats .stat b').first();
  const before = await buildings.textContent();
  await showView(page, 'settings');
  await page.locator('[data-mtier="assembler"][data-val="assembling-machine-1"]').click();
  await expect(page.locator('[data-mtier="assembler"][data-val="assembling-machine-1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(buildings).not.toHaveText(before);
});

test.describe('sheets open and close', () => {
  test('item picker', async ({ page }) => {
    await openApp(page);
    await showView(page, 'plan');
    await page.locator('#addTarget').click();
    await sheetOpen(page, 'picker');
    await page.locator('[data-close="picker"]').click();
    await expect(page.locator('#picker')).toBeHidden();
  });

  test('share sheet', async ({ page }) => {
    await openApp(page);
    await showView(page, 'plan');
    await page.locator('[data-act="share"]:visible').first().click();
    await sheetOpen(page, 'export');
    await expect(page.locator('#expText')).toHaveValue(/Dyson Sphere plan/);
    await page.locator('[data-close="export"]').click();
    await expect(page.locator('#export')).toBeHidden();
  });

  test('step inspector', async ({ page, hasTouch }) => {
    await openApp(page);
    await showView(page, 'map');
    await tapMapNode(page, hasTouch);
    await sheetOpen(page, 'inspector');
    await expect(page.locator('#inspBody .kpis')).toBeVisible();
    await page.locator('#inspClose').click();
    await expect(page.locator('#inspector')).toBeHidden();
  });

  test('Esc closes sheets', async ({ page, hasTouch }) => {
    test.skip(hasTouch, 'keyboard only');
    await openApp(page);
    await page.locator('#addTarget').click();
    await sheetOpen(page, 'picker');
    await page.keyboard.press('Escape');
    await expect(page.locator('#picker')).toBeHidden();

    await page.locator('[data-act="share"]:visible').first().click();
    await sheetOpen(page, 'export');
    await page.keyboard.press('Escape');
    await expect(page.locator('#export')).toBeHidden();

    await showView(page, 'map');
    await tapMapNode(page, false);
    await sheetOpen(page, 'inspector');
    await page.keyboard.press('Escape');
    await expect(page.locator('#inspector')).toBeHidden();
  });
});

for (const view of VIEWS) {
  test(`no horizontal page scroll: ${view}`, async ({ page }) => {
    await openApp(page);
    await showView(page, view);
    const sizes = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, width: document.documentElement.clientWidth,
    }));
    expect(sizes.doc).toBeLessThanOrEqual(sizes.width);
    expect(sizes.body).toBeLessThanOrEqual(sizes.width);
  });
}

// Controls that are under 44 px today. The layout work in phase 3 should
// fix these, and then the matching test.fixme line can go.
const SMALL_TODAY = {
  plan: 'Unit switch and remove button are 32 px, steppers 36 px, preset chips 40 px and "See all" 25 px high.',
  build: 'The Buildings, Steps and Resources switch is 32 px high.',
  settings: 'Stack, effect and appearance switches are 32 px high and the number steppers 36 px.',
};
const WIDE_HEADER = 'The Plan, Settings, Flow map and Build list switches in the wide header are 32 px high.';

for (const view of VIEWS) {
  test(`tap targets are 44 px or larger: ${view}`, async ({ page, hasTouch }) => {
    test.skip(!hasTouch, 'touch devices only');
    test.fixme(!!SMALL_TODAY[view], SMALL_TODAY[view]);
    await openApp(page);
    test.fixme(isWide(page), WIDE_HEADER);
    await showView(page, view);
    expect(await smallTargets(page)).toEqual([]);
  });
}

test('service worker installs and the app reloads offline', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'checked in Chromium only');
  const context = await browser.newContext({ serviceWorkers: 'allow', baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await openApp(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  // The first install claims the page, so wait until it is controlled.
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.waitForLoadState('load');
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#stage .node').first()).toBeAttached();
  await expect(page.locator('#planStats .stat').first()).toBeVisible();
  const sprite = await page.evaluate(() => fetch('sprite.webp').then((r) => r.ok));
  expect(sprite).toBe(true);
  await context.close();
});

test('baseline screenshots', async ({ page }, info) => {
  const dir = process.env.BASELINE_DIR;
  test.skip(!dir, 'set BASELINE_DIR to save screenshots');
  await openApp(page);
  for (const view of VIEWS) {
    await showView(page, view);
    // Sheets and the map fit use short animations.
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/${info.project.name}-${view}.png` });
  }
});

test('wide layout matches the viewport', async ({ page }) => {
  await openApp(page);
  const tabbar = page.locator('.tabbar');
  if (isWide(page)) await expect(tabbar).toBeHidden();
  else await expect(tabbar).toBeVisible();
});
