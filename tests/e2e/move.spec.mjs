// Moving map boxes: mouse drag, touch hold and drag, Shift and arrow keys,
// reset with Undo, and saving.
import { test, expect } from '@playwright/test';
import { openApp, showView } from './helpers.mjs';

// The middle of a map node that is on screen and not covered by a control.
// Steps come before targets, because a target sits at the map edge on phones.
function nodePoint(page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll('#stage .node:not(.target)'), ...document.querySelectorAll('#stage .node.target')];
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      const left = Math.max(r.left, 0), right = Math.min(r.right, innerWidth);
      const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight);
      if (right - left < 24 || bottom - top < 24) continue;
      const x = (left + right) / 2, y = (top + bottom) / 2;
      const hit = document.elementFromPoint(x, y);
      if (hit && el.contains(hit)) return { x, y, id: el.dataset.id };
    }
    return null;
  });
}

// A box's place relative to another box, so a shift of the whole map does not count.
function placeOf(page, id) {
  return page.evaluate((id) => {
    const nodes = [...document.querySelectorAll('#stage .node')];
    const el = nodes.find((n) => n.dataset.id === id), other = nodes.find((n) => n.dataset.id !== id);
    return { x: parseFloat(el.style.left) - parseFloat(other.style.left), y: parseFloat(el.style.top) - parseFloat(other.style.top) };
  }, id);
}

const pathsOf = (page, id) => page.evaluate((id) => [...document.querySelectorAll('#stage path.edge')]
  .filter((p) => p.dataset.f === id || p.dataset.t === id).map((p) => p.getAttribute('d')), id);

const savedMoves = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('dsp-calculator-v1')).moved);

const zoom = (page) => page.locator('#stage').evaluate((el) => +el.style.transform.match(/scale\(([-\d.]+)\)/)[1]);

const inspectorOpen = (page) => page.locator('#inspector').evaluate((el) => 'open' in el.dataset);

async function openMap(page) {
  const errors = await openApp(page);
  await showView(page, 'map');
  // The fit at the start can animate.
  await page.waitForTimeout(400);
  return errors;
}

test.describe('with a mouse', () => {
  test.skip(({ hasTouch }) => hasTouch, 'mouse only');

  test('dragging a box moves it and its links, and a click still opens it', async ({ page }) => {
    const errors = await openMap(page);
    const start = await nodePoint(page);
    expect(start).not.toBeNull();
    const before = await placeOf(page, start.id), paths = await pathsOf(page, start.id);
    const k = await zoom(page);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 30, start.y + 20, { steps: 4 });
    await expect(page.locator(`#stage .node[data-id="${start.id}"]`)).toHaveClass(/lifted/);
    await page.mouse.move(start.x + 60, start.y + 40, { steps: 4 });
    await page.mouse.up();
    await expect(page.locator('#stage .node.lifted')).toHaveCount(0);
    const after = await placeOf(page, start.id);
    expect(Math.abs(after.x - before.x - 60 / k)).toBeLessThan(2);
    expect(Math.abs(after.y - before.y - 40 / k)).toBeLessThan(2);
    const moved = await pathsOf(page, start.id);
    expect(moved.length).toBe(paths.length);
    expect(moved.some((d, i) => d !== paths[i])).toBe(true);
    // A drag is not a click.
    expect(await inspectorOpen(page)).toBe(false);
    const saved = await savedMoves(page);
    expect(Object.keys(saved)).toEqual([start.id]);

    await page.mouse.click(start.x + 60, start.y + 40);
    await expect(page.locator('#stage .node.sel')).toHaveCount(1);
    expect(await placeOf(page, start.id)).toEqual(after);
    expect(errors).toEqual([]);
  });

  test('a moved box stays moved after a reload', async ({ page }) => {
    await openMap(page);
    const start = await nodePoint(page);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 40, start.y + 50, { steps: 6 });
    await page.mouse.up();
    const after = await placeOf(page, start.id);
    await page.reload();
    await expect(page.locator('#stage .node').first()).toBeAttached();
    expect(await placeOf(page, start.id)).toEqual(after);
  });

  test('Reset box positions puts the boxes back, and Undo moves them again', async ({ page }) => {
    await openMap(page);
    const start = await nodePoint(page);
    const before = await placeOf(page, start.id);
    await page.locator('#btnLayers').click();
    await expect(page.locator('#resetBoxes')).toBeDisabled();
    await expect(page.locator('#moveHint')).toHaveText('Drag a box to move it.');
    await page.locator('#btnLayers').click();
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x - 50, start.y + 70, { steps: 6 });
    await page.mouse.up();
    const after = await placeOf(page, start.id);
    expect(after).not.toEqual(before);

    await page.locator('#btnLayers').click();
    await page.locator('#resetBoxes').click();
    expect(await placeOf(page, start.id)).toEqual(before);
    await expect(page.locator('#resetBoxes')).toBeDisabled();
    expect(await savedMoves(page)).toEqual({});
    await expect(page.locator('#toast')).toContainText('Box positions reset.');
    await page.locator('#toastAct').click();
    expect(await placeOf(page, start.id)).toEqual(after);
    await expect(page.locator('#resetBoxes')).toBeEnabled();
  });

  test('Shift and an arrow key move the focused box and keep focus', async ({ page }) => {
    await openMap(page);
    const target = page.locator('#stage .node.target').first();
    await target.focus();
    await page.keyboard.press('ArrowLeft');
    const focused = page.locator('#stage .node:focus');
    const id = await focused.getAttribute('data-id');
    const before = await placeOf(page, id);
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowLeft');
    expect(await placeOf(page, id)).toEqual({ x: before.x - 24, y: before.y + 48 });
    await expect(focused).toHaveAttribute('data-id', id);
    expect((await savedMoves(page))[id]).toEqual([-24, 48]);
    // An arrow key without Shift still moves focus.
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#stage .node:focus')).not.toHaveAttribute('data-id', id);
  });
});

// Playwright can only tap in WebKit, so these tests send real touches with
// Chromium's DevTools protocol, in a Chromium page with the device's screen.
// One phone and one iPad are enough for the gestures.
test.describe('with touch', () => {
  test.skip(({ hasTouch }) => !hasTouch, 'touch only');

  let context, page, cdp;
  test.beforeEach(async ({ playwright, baseURL }, info) => {
    test.skip(!['iphone-15', 'ipad-pro-11'].includes(info.project.name), 'runs on one phone and one iPad');
    const { viewport, screen, deviceScaleFactor, userAgent } = info.project.use;
    const browser = await playwright.chromium.launch();
    context = await browser.newContext({ viewport, screen, deviceScaleFactor, userAgent, isMobile: true, hasTouch: true, baseURL, serviceWorkers: 'block' });
    page = await context.newPage();
    cdp = await context.newCDPSession(page);
    await openMap(page);
  });
  test.afterEach(async () => { if (context) await context.browser().close(); });

  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  async function slide(from, by, steps = 6) {
    for (let i = 1; i <= steps; i++) {
      await touch('touchMove', [[from.x + by[0] * i / steps, from.y + by[1] * i / steps]]);
      await page.waitForTimeout(16);
    }
  }

  test('hold a box, then drag it to move it', async () => {
    const start = await nodePoint(page);
    expect(start).not.toBeNull();
    const before = await placeOf(page, start.id), paths = await pathsOf(page, start.id);
    const k = await zoom(page);
    await touch('touchStart', [[start.x, start.y]]);
    await page.waitForTimeout(500);
    await expect(page.locator(`#stage .node[data-id="${start.id}"]`)).toHaveClass(/lifted/);
    await slide(start, [0, 80]);
    await touch('touchEnd', []);
    const after = await placeOf(page, start.id);
    expect(after.x).toBe(before.x);
    expect(Math.abs(after.y - before.y - 80 / k)).toBeLessThan(2);
    expect((await pathsOf(page, start.id)).some((d, i) => d !== paths[i])).toBe(true);
    expect(await inspectorOpen(page)).toBe(false);
    expect(Object.keys(await savedMoves(page))).toEqual([start.id]);
    // The page itself did not scroll.
    expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0]);
  });

  test('a drag on a box without a hold pans the map', async () => {
    const start = await nodePoint(page);
    const before = await placeOf(page, start.id);
    const screen = await page.locator(`#stage .node[data-id="${start.id}"]`).boundingBox();
    await touch('touchStart', [[start.x, start.y]]);
    await slide(start, [0, 60]);
    await touch('touchEnd', []);
    expect(await placeOf(page, start.id)).toEqual(before);
    const now = await page.locator(`#stage .node[data-id="${start.id}"]`).boundingBox();
    expect(Math.abs(now.y - screen.y - 60)).toBeLessThan(2);
    expect(await savedMoves(page)).toEqual({});
  });

  test('a second finger stops a hold', async () => {
    const start = await nodePoint(page);
    await touch('touchStart', [[start.x, start.y]]);
    await page.waitForTimeout(100);
    await touch('touchStart', [[start.x, start.y], [start.x + 80, start.y + 80]]);
    await page.waitForTimeout(500);
    await expect(page.locator('#stage .node.lifted')).toHaveCount(0);
    await touch('touchEnd', []);
    expect(await savedMoves(page)).toEqual({});
  });
});
