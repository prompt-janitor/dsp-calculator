import { test, expect } from '@playwright/test';
import { openApp, showView, tapMapNode, sheetOpen, isWide, isFull } from './helpers.mjs';

// The map view as the app last set it: { x, y, k }.
const view = (page) => page.locator('#stage').evaluate((el) => {
  const m = el.style.transform.match(/translate\(([-\d.]+)px, ?([-\d.]+)px\) scale\(([-\d.]+)\)/);
  return { x: +m[1], y: +m[2], k: +m[3] };
});

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.describe('keyboard shortcuts', () => {
  test.skip(({ hasTouch }) => hasTouch, 'keyboard only');

  test('/ opens the item picker with the cursor in search', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('/');
    await sheetOpen(page, 'picker');
    await expect(page.locator('#pickSearch')).toBeFocused();
    await expect(page.locator('#pickSearch')).toHaveValue('');
    await page.keyboard.type('gear');
    await expect(page.locator('#pickGrid [data-item="gear"]')).toBeVisible();
  });

  test('shortcuts are ignored while typing', async ({ page }) => {
    await openApp(page);
    await showView(page, 'plan');
    const before = await view(page);
    await page.locator('#rate0').focus();
    await page.keyboard.press('/');
    await page.keyboard.press('f');
    await page.keyboard.press('+');
    await expect(page.locator('#picker')).toBeHidden();
    expect((await view(page)).k).toBe(before.k);
  });

  test('+ and - zoom, F fits the map', async ({ page }) => {
    await openApp(page);
    await showView(page, 'map');
    await page.waitForTimeout(400);
    const fit = await view(page);
    await page.keyboard.press('+');
    const zoomed = await view(page);
    expect(zoomed.k).toBeGreaterThan(fit.k);
    await page.keyboard.press('-');
    expect((await view(page)).k).toBeCloseTo(fit.k, 5);
    await page.keyboard.press('=');
    await page.keyboard.press('=');
    await page.keyboard.press('f');
    await expect.poll(async () => (await view(page)).k).toBeCloseTo(fit.k, 5);
  });

  test('map keys do nothing when the map is hidden', async ({ page }) => {
    await openApp(page);
    await showView(page, 'build');
    const before = await view(page);
    await page.keyboard.press('+');
    expect((await view(page)).k).toBe(before.k);
  });
});

test('mouse wheel zooms and sideways scroll pans', async ({ page, hasTouch }) => {
  test.skip(hasTouch, 'mouse only');
  await openApp(page);
  await showView(page, 'map');
  await page.waitForTimeout(400);
  const box = await page.locator('#viewport').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const before = await view(page);
  await page.mouse.wheel(0, -200);
  await expect.poll(async () => (await view(page)).k).toBeGreaterThan(before.k);
  const zoomed = await view(page);
  await page.mouse.wheel(120, 0);
  await expect.poll(async () => (await view(page)).x).toBeLessThan(zoomed.x - 50);
  expect((await view(page)).k).toBe(zoomed.k);
});

test('map hint fits the device and goes when you leave the map', async ({ page, hasTouch }) => {
  await openApp(page);
  await showView(page, 'build');
  await showView(page, 'map');
  const toast = page.locator('#toast');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText(hasTouch ? 'pinch to zoom' : 'scroll to zoom');
  await showView(page, 'build');
  await expect(toast).toBeHidden();
});

test('quick start presets are not cut off in the sidebar', async ({ page }) => {
  await openApp(page);
  test.skip(!(await isWide(page)), 'split view only');
  const side = await page.locator('.side').boundingBox();
  for (const chip of await page.locator('#planBody .chip').all()) {
    const box = await chip.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(side.x);
    expect(box.x + box.width).toBeLessThanOrEqual(side.x + side.width);
  }
});

test('step details do not cover the chosen node', async ({ page, hasTouch }) => {
  await openApp(page);
  await showView(page, 'map');
  await page.waitForTimeout(400);
  await tapMapNode(page, hasTouch);
  await sheetOpen(page, 'inspector');
  await page.waitForTimeout(500);
  const node = await page.locator('#stage .node.sel').boundingBox();
  const sheet = await page.locator('#inspector').boundingBox();
  expect(overlaps(node, sheet)).toBe(false);
});

test('the map title does not cover a node', async ({ page }) => {
  await openApp(page);
  await showView(page, 'map');
  await page.waitForTimeout(400);
  const title = page.locator('.mapbar .title');
  test.skip(!(await title.isVisible()), 'no title in this layout');
  const box = await title.boundingBox();
  for (const node of await page.locator('#stage .node').all()) {
    expect(overlaps(box, await node.boundingBox())).toBe(false);
  }
});

test('small screens show when more of the map is to the left', async ({ page }) => {
  await openApp(page);
  test.skip(await isFull(page), 'under 1024 px only');
  await showView(page, 'plan');
  await page.locator('[data-preset="matrices"]').click();
  await showView(page, 'map');
  await page.waitForTimeout(400);
  const fade = page.locator('#edgeFade');
  await expect(fade).toBeVisible();
  await page.locator('#fitLeft').click();
  await expect(fade).toBeHidden();
  const vp = await page.locator('#viewport').boundingBox();
  const first = await page.locator('#stage .node').first().boundingBox();
  expect(first.x).toBeGreaterThanOrEqual(vp.x);
});
