// Device tests. Run with `npm run test:e2e`, which builds dist/ first.
import { defineConfig, devices } from '@playwright/test';

// E2E_PORT lets two copies of the repo run the tests at the same time.
const PORT = Number(process.env.E2E_PORT) || 4173;

const touch = (device, extra = {}) => ({ ...devices[device], isMobile: true, hasTouch: true, ...extra });

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/dsp-calculator/`,
    // The service worker test turns this back on for itself.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node scripts/serve.mjs ${PORT}`,
    url: `http://localhost:${PORT}/dsp-calculator/`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'iphone-15', use: touch('iPhone 15') },
    { name: 'iphone-15-landscape', use: touch('iPhone 15 landscape') },
    { name: 'ipad-pro-11', use: touch('iPad Pro 11') },
    { name: 'ipad-pro-11-landscape', use: touch('iPad Pro 11 landscape') },
    { name: 'ipad-mini', use: touch('iPad Mini') },
    { name: 'phone-320', use: touch('iPhone SE', { viewport: { width: 320, height: 640 }, screen: { width: 320, height: 640 } }) },
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } } },
    { name: 'desktop-safari', use: { ...devices['Desktop Safari'], viewport: { width: 1920, height: 1080 } } },
  ],
});
