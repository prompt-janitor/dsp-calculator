// The app as it runs from the iOS Home Screen. The page then fills the whole
// screen under the status bar and the home indicator, and the CSS keeps
// controls inside env(safe-area-inset-*). Playwright cannot set those insets,
// so this sets the CSS variables the app reads them into (--sat and so on)
// to the values of an iPhone 17 Pro and an iPad Pro.
import { test, expect } from '@playwright/test';
import { openApp, showView, isWide } from './helpers.mjs';

const VIEWS = ['plan', 'saved', 'files', 'map', 'build', 'settings'];

function insetsFor({ width, height }, wide) {
  if (wide) return { top: 24, right: 0, bottom: 20, left: 0 };
  if (width > height) return { top: 0, right: 62, bottom: 21, left: 62 };
  return { top: 62, right: 0, bottom: 34, left: 0 };
}

// Lists visible controls that reach into an inset. Controls in a scrolling
// list can scroll past the bottom or the sides, so those edges are only
// checked for controls that stay in place.
function controlsInInsets(page, inset) {
  return page.evaluate((inset) => {
    const scrolls = (el, axis) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const style = getComputedStyle(p)[axis === 'y' ? 'overflowY' : 'overflowX'];
        const more = axis === 'y' ? p.scrollHeight > p.clientHeight : p.scrollWidth > p.clientWidth;
        if (more && (style === 'auto' || style === 'scroll')) return true;
      }
      return false;
    };
    const out = [];
    for (const el of document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="tab"]')) {
      if (el.closest('#stage')) continue;
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom <= 0 || r.top >= innerHeight) continue;
      const bad = [];
      if (r.top < inset.top) bad.push('top');
      if (!scrolls(el, 'x') && r.left < inset.left) bad.push('left');
      if (!scrolls(el, 'x') && r.right > innerWidth - inset.right) bad.push('right');
      if (!scrolls(el, 'y') && r.bottom > innerHeight - inset.bottom) bad.push('bottom');
      if (bad.length) {
        const name = el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30) || el.id;
        out.push(`${el.tagName.toLowerCase()} "${name}" in ${bad.join(', ')} inset`);
      }
    }
    return [...new Set(out)];
  }, inset);
}

test.describe('Home Screen app', () => {
  test.skip(({ isMobile }) => !isMobile, 'iPhone and iPad only');

  for (const name of VIEWS) {
    test(`controls stay clear of the status bar and home indicator: ${name}`, async ({ page }) => {
      await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
      await openApp(page);
      const inset = insetsFor(page.viewportSize(), await isWide(page));
      await page.addStyleTag({
        content: `:root:root { --sat: ${inset.top}px; --sar: ${inset.right}px; --sab: ${inset.bottom}px; --sal: ${inset.left}px; }`,
      });
      await showView(page, name);
      // The install card is not shown inside the installed app.
      if (name === 'settings') await expect(page.locator('.install')).toHaveCount(0);
      expect(await controlsInInsets(page, inset)).toEqual([]);
    });
  }
});
