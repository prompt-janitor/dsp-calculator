// Checks the web app manifest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../src/manifest.webmanifest', import.meta.url), 'utf8'));

// Browsers read the id from the site root. An id like "./" is then the same
// for every app on prompt-janitor.github.io, and the phone mixes them up.
test('the manifest id names this app, not the site root', () => {
  const site = 'https://prompt-janitor.github.io/dsp-calculator/';
  const id = new URL(manifest.id, new URL(site).origin).href;
  assert.equal(id, site);
});
