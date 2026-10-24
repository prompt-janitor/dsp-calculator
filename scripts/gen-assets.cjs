// Renders app icons and iOS launch screens with headless Chromium.
// Usage: npx playwright install chromium && node scripts/gen-assets.cjs
// Writes to src/assets/icons and src/assets/splash (both are committed).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'src', 'assets');
const font = fs.readFileSync(path.join(__dirname, '..', 'src', 'assets', 'fonts', 'chakra-petch-600.woff2')).toString('base64');

const ART = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">
  <defs>
    <radialGradient id="star" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff6dc"/><stop offset=".35" stop-color="#ffc35a"/><stop offset="1" stop-color="#f3ad45" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="50" cy="50" r="15" fill="url(#star)"/>
  <circle cx="50" cy="50" r="6" fill="#fff3d0"/>
  <g fill="none" stroke="#3fcce7" stroke-width="2.4">
    <circle cx="50" cy="50" r="22"/>
    <ellipse cx="50" cy="50" rx="9" ry="22" opacity=".7"/>
    <ellipse cx="50" cy="50" rx="22" ry="8" opacity=".7"/>
  </g>
  <ellipse cx="50" cy="50" rx="40" ry="14" transform="rotate(-24 50 50)" fill="none" stroke="#f3ad45" stroke-width="2.6"/>
  <circle cx="83.5" cy="35" r="4.2" fill="#f3ad45"/>
</svg>`;

const ICON_HTML = (px, scale) => `<!doctype html><html><body style="margin:0">
<div style="width:${px}px;height:${px}px;display:grid;place-items:center;background:radial-gradient(circle at 50% 45%, #16283a 0%, #0a1117 70%)">
${ART(Math.round(px * scale))}</div></body></html>`;

const SPLASH_HTML = (w, h) => {
  const s = Math.min(w, h);
  return `<!doctype html><html><head><style>
@font-face{font-family:CP;src:url(data:font/woff2;base64,${font}) format("woff2");font-weight:600}
body{margin:0;width:${w}px;height:${h}px;background:#0a1117;display:grid;place-items:center;font-family:CP,sans-serif;color:#e6eef4}
.c{display:flex;flex-direction:column;align-items:center;gap:${Math.round(s * 0.03)}px}
b{font-weight:600;font-size:${Math.max(15, Math.round(s * 0.05))}px;letter-spacing:.14em;text-transform:uppercase}
small{font:${Math.max(11, Math.round(s * 0.032))}px -apple-system,system-ui,sans-serif;color:#8ea2b2;letter-spacing:0}
</style></head><body><div class="c">${ART(Math.round(s * 0.36))}<b>DSP Calculator</b></div></body></html>`;
};

// CSS points and pixel ratio for current iPhones and iPads. Sizes that
// several models share are listed once: 402x874 is also the iPhone 17 and
// 17 Pro, 440x956 the 17 Pro Max, 390x844 the 17e, 1032x1376 the iPad Pro
// 13 (M4, M5), 1024x1366 the iPad Air 13, 820x1180 the iPad Air 11 and iPad (A16).
// The iPhone Duo is the size the iOS Simulator gives it when open.
const DEVICES = [
  ['iphone-16-pro-max', 440, 956, 3], ['iphone-16-pro', 402, 874, 3], ['iphone-15-16', 393, 852, 3], ['iphone-plus-pro-max', 430, 932, 3],
  ['iphone-air', 420, 912, 3], ['iphone-duo', 466, 678, 3, ['portrait', 'landscape']],
  ['iphone-12-14', 390, 844, 3], ['iphone-13-pro-max', 428, 926, 3], ['iphone-mini-x', 375, 812, 3], ['iphone-se', 375, 667, 2],
  ['ipad-pro-13-m4', 1032, 1376, 2], ['ipad-pro-12-9', 1024, 1366, 2], ['ipad-pro-11-m4', 834, 1210, 2], ['ipad-pro-11', 834, 1194, 2],
  ['ipad-air-11', 820, 1180, 2], ['ipad-mini', 744, 1133, 2], ['ipad-10-2', 810, 1080, 2]
];

(async () => {
  fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'splash'), { recursive: true });
  const b = await chromium.launch();
  const icons = [['apple-touch-icon.png', 180, 0.82], ['icon-192.png', 192, 0.82], ['icon-512.png', 512, 0.82], ['maskable-512.png', 512, 0.62], ['favicon-32.png', 32, 0.98]];
  for (const [name, px, sc] of icons) {
    const p = await b.newPage({ viewport: { width: px, height: px } });
    await p.setContent(ICON_HTML(px, sc));
    await p.screenshot({ path: path.join(OUT, 'icons', name), omitBackground: false });
    await p.close();
  }
  const links = [];
  for (const [name, w, h, dpr, both] of DEVICES) {
    const orients = both || (name.startsWith('ipad') ? ['portrait', 'landscape'] : ['portrait']);
    for (const o of orients) {
      const vw = o === 'portrait' ? w : h, vh = o === 'portrait' ? h : w;
      const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
      const p = await ctx.newPage();
      await p.setContent(SPLASH_HTML(vw, vh));
      await p.waitForTimeout(80);
      const file = `${name}-${o}.png`;
      await p.screenshot({ path: path.join(OUT, 'splash', file) });
      await ctx.close();
      links.push({ file, media: `screen and (device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: ${o})` });
    }
  }
  fs.writeFileSync(path.join(OUT, 'splash', 'splash.json'), JSON.stringify(links, null, 2));
  await b.close();
  console.log('icons', icons.length, 'splash', links.length);
})();
