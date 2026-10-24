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
    await expect(page.locator('#expText')).toHaveValue(/DSP Calculator plan/);
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

  test('Tab stays inside the item picker and focus returns on close', async ({ page, hasTouch }) => {
    test.skip(hasTouch, 'keyboard only');
    await openApp(page);
    await showView(page, 'plan');
    await page.locator('#addTarget').focus();
    await page.keyboard.press('Enter');
    await sheetOpen(page, 'picker');
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press(i % 7 === 6 ? 'Shift+Tab' : 'Tab');
      expect(await page.evaluate(() => document.querySelector('#picker').contains(document.activeElement)), `Tab ${i + 1}`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('#picker')).toBeHidden();
    await expect(page.locator('#addTarget')).toBeFocused();
  });
});

test('map nodes work with the keyboard', async ({ page, hasTouch }) => {
  test.skip(hasTouch, 'keyboard only');
  await openApp(page);
  await showView(page, 'map');
  const target = page.locator('#stage .node.target').first();
  await expect(target).toHaveAccessibleName(/^Target .+\/(min|s)$/);
  await target.focus();
  await page.keyboard.press('ArrowLeft');
  const focused = page.locator('#stage .node:focus');
  await expect(focused).toHaveCount(1);
  await expect(focused).not.toHaveClass(/target/);
  const id = await focused.getAttribute('data-id');
  await page.keyboard.press('Enter');
  await sheetOpen(page, 'inspector');
  await expect(page.locator('#stage .node.sel')).toHaveAttribute('data-id', id);
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

for (const view of VIEWS) {
  test(`tap targets are 44 px or larger: ${view}`, async ({ page, hasTouch }) => {
    test.skip(!hasTouch, 'touch devices only');
    await openApp(page);
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

test('layout matches the viewport', async ({ page }) => {
  await openApp(page);
  const { width, height } = page.viewportSize();
  const tabbar = page.locator('.tabbar');
  if (await isWide(page)) {
    expect(width).toBeGreaterThanOrEqual(600);
    await expect(tabbar).toBeHidden();
    const side = await page.locator('.side').boundingBox();
    if (width < 1024) expect(side.width).toBeLessThanOrEqual(340 + 1);
    else expect(side.width).toBeGreaterThanOrEqual(360);
    return;
  }
  await expect(tabbar).toBeVisible();
  const bar = await tabbar.boundingBox();
  if (width > height) {
    // Phones in landscape get the tab bar down the left side.
    expect(bar.x).toBe(0);
    expect(bar.height).toBe(height);
  } else {
    expect(bar.y + bar.height).toBe(height);
  }
});

test('the theme picked in Settings sets the browser color', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openApp(page);
  await showView(page, 'settings');
  const colors = () => page.$$eval('meta[name="theme-color"]', (tags) => tags.map((t) => t.content));
  await page.locator('[data-theme-set="light"]').click();
  expect(await colors()).toEqual(['#eef2f5', '#eef2f5']);
  await page.locator('[data-theme-set="auto"]').click();
  expect(await colors()).toEqual(['#0a1117', '#eef2f5']);
});
