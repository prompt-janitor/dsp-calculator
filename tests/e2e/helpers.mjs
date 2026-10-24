import { expect } from '@playwright/test';
import { SPLIT, FULL } from '../../src/js/breakpoints.js';

// True when the page shows the split view, the same test the app uses.
export const isWide = (page) => page.evaluate((query) => matchMedia(query).matches, SPLIT);
// True when the page shows the full split view (1024 px and up).
export const isFull = (page) => page.evaluate((query) => matchMedia(query).matches, FULL);

// Opens the app with a clean state and waits for the first plan to render.
export async function openApp(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('./');
  await expect(page.locator('#stage .node').first()).toBeAttached();
  return errors;
}

// Shows one of the four views. Compact layouts use the tab bar, wide
// layouts use the sidebar switch (plan, settings) and the main switch (map, build).
export async function showView(page, view) {
  if (!(await isWide(page))) await page.locator(`.tabbar [data-tab="${view}"]`).click();
  else if (view === 'plan' || view === 'settings') await page.locator(`.wide-head [data-side="${view}"]`).click();
  else await page.locator(`.wide-head [data-main="${view}"]`).click();
  const pane = { plan: '#pane-plan', map: '#pane-map', build: '#pane-build', settings: '#pane-settings' }[view];
  await expect(page.locator(pane)).toBeVisible();
}

// Sheets slide in over a few frames. Wait for that before closing one,
// as a person would.
export async function sheetOpen(page, id) {
  await expect(page.locator('#' + id)).toHaveClass(/\bon\b/);
}

// Taps or clicks a map node that is on screen and not covered by a control.
// On phones the map starts zoomed in on the target, so only part of the
// next node may show. Any part at least 30 px wide is enough. At 320 px even
// that can be off screen, and then the target node is used, which opens
// the step that makes the target.
export async function tapMapNode(page, touch) {
  const point = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('#stage .node:not(.target)'), ...document.querySelectorAll('#stage .node.target')];
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      const left = Math.max(r.left, 0), right = Math.min(r.right, innerWidth);
      const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight);
      if (right - left < 30 || bottom - top < 30) continue;
      const x = (left + right) / 2, y = (top + bottom) / 2;
      const hit = document.elementFromPoint(x, y);
      if (hit && el.contains(hit)) return { x, y };
    }
    return null;
  });
  expect(point, 'a map node on screen').not.toBeNull();
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

// Lists visible controls smaller than 44 by 44 px. A switch or radio inside
// a label is measured by its label, because the whole label takes the tap.
export function smallTargets(page) {
  return page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])')) {
      // Map nodes scale with the zoom, so their size on screen is not fixed.
      if (el.closest('#stage')) continue;
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      const box = (el.tagName === 'INPUT' && el.closest('label')) || el;
      const r = box.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.width < 44 || r.height < 44) {
        const name = el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30) || el.id || el.className;
        out.push(`${el.tagName.toLowerCase()} "${name}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return [...new Set(out)];
  });
}
