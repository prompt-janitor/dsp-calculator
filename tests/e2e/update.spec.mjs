// Builds two versions of the app, serves the first, then switches to the
// second, as a new deploy to Pages would.
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveDir } from '../../scripts/serve.mjs';

const PORT = 4174;
const URL = `http://localhost:${PORT}/dsp-calculator/`;
let work, server, live;

// Both tests use one server and port.
test.describe.configure({ mode: 'serial' });

// Copies what the build reads to dir, adds a marker to the page and builds.
function build(dir, label) {
  for (const p of ['src', 'scripts', 'LICENSE']) cpSync(p, join(dir, p), { recursive: true });
  const page = join(dir, 'src', 'index.html');
  writeFileSync(page, readFileSync(page, 'utf8').replace('<head>', `<head>\n<meta name="build" content="${label}">`));
  execFileSync(process.execPath, [join(dir, 'scripts', 'build.mjs')]);
  return join(dir, 'dist');
}

test.beforeAll(async ({ browserName }) => {
  if (browserName !== 'chromium') return;
  work = mkdtempSync(join(tmpdir(), 'dsp-update-'));
  const a = build(join(work, 'a'), 'A');
  const b = build(join(work, 'b'), 'B');
  live = a;
  server = await serveDir(() => live, PORT);
  server.builds = { a, b };
});

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (work) rmSync(work, { recursive: true, force: true });
});

const buildLabel = (page) => page.locator('meta[name="build"]').getAttribute('content');

test('a new deploy shows the update toast and Reload switches to it', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'checked in Chromium only');
  live = server.builds.a;
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  let loads = 0;
  page.on('load', () => { loads++; });

  await page.goto(URL);
  await expect(page.locator('#stage .node').first()).toBeAttached();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  // The first worker takes control without a reload.
  await page.waitForTimeout(1000);
  expect(loads).toBe(1);
  await expect(page.locator('#toast')).toBeHidden();
  expect(await buildLabel(page)).toBe('A');

  live = server.builds.b;
  await page.reload();
  // The page still comes from the old cache until the user says so.
  expect(await buildLabel(page)).toBe('A');
  const toast = page.locator('#toast');
  await expect(toast).toContainText('A new version is ready', { timeout: 15000 });

  await toast.getByRole('button', { name: 'Reload' }).click();
  await expect.poll(() => buildLabel(page), { timeout: 15000 }).toBe('B');
  await expect(page.locator('#stage .node').first()).toBeAttached();
  await context.close();
});

test('an update found earlier shows the toast on the next visit', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'checked in Chromium only');
  live = server.builds.a;
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  await page.goto(URL);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);

  // The new worker installs, but the user leaves before tapping Reload.
  live = server.builds.b;
  await page.reload();
  await expect(page.locator('#toast')).toContainText('A new version is ready', { timeout: 15000 });
  await page.reload();
  await expect(page.locator('#toast')).toContainText('A new version is ready', { timeout: 15000 });
  await page.locator('#toast').getByRole('button', { name: 'Reload' }).click();
  await expect.poll(() => buildLabel(page), { timeout: 15000 }).toBe('B');
  await context.close();
});
