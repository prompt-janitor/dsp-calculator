// Builds the static site into dist/. No dependencies; run with `npm run build`.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => join(root, 'src', p);
const dist = join(root, 'dist');
const read = (p) => readFileSync(src(p), 'utf8');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// Scripts are plain globals, concatenated in dependency order.
const js = [
  'var DATA = ' + read('data/recipes.json') + ';',
  read('js/engine.js'),
  read('js/core.js'),
  read('js/map.js'),
  read('js/app.js'),
].join('\n');

const font = readFileSync(src('assets/fonts/chakra-petch-600.woff2')).toString('base64');
const css = read('css/app.css')
  .replace('__FONT_URL__', () => 'data:font/woff2;base64,' + font)
  .replace('__SPRITE_URL__', 'sprite.webp');

const splash = JSON.parse(read('assets/splash/splash.json'))
  .map((s) => `<link rel="apple-touch-startup-image" href="splash/${s.file}" media="${s.media}">`)
  .join('\n');

// Function replacers, so "$" sequences in the code are inserted literally.
const html = read('index.html')
  .replace('<!-- SPLASH -->', () => splash)
  .replace('/* CSS */', () => css)
  .replace('<!-- BODY -->', () => read('body.html'))
  .replace('/* JS */', () => js);
writeFileSync(join(dist, 'index.html'), html);

for (const dir of ['icons', 'splash']) cpSync(src('assets/' + dir), join(dist, dir), { recursive: true, filter: (f) => !f.endsWith('.json') });
cpSync(src('assets/sprite.webp'), join(dist, 'sprite.webp'));
cpSync(src('manifest.webmanifest'), join(dist, 'manifest.webmanifest'));
mkdirSync(join(dist, 'licenses'), { recursive: true });
cpSync(src('assets/fonts/OFL-ChakraPetch.txt'), join(dist, 'licenses', 'OFL-ChakraPetch.txt'));
writeFileSync(join(dist, '.nojekyll'), '');

// Service worker: precache list and a content hash so each deploy gets a fresh cache.
const assets = ['./', 'index.html', 'manifest.webmanifest', 'sprite.webp'];
for (const dir of ['icons', 'splash']) for (const f of readdirSync(join(dist, dir)).sort()) assets.push(dir + '/' + f);
const version = createHash('sha1').update(html).digest('hex').slice(0, 10);
const sw = readFileSync(join(root, 'scripts', 'sw.template.js'), 'utf8')
  .replace('__VERSION__', version)
  .replace('__ASSETS__', () => JSON.stringify(assets, null, 2));
writeFileSync(join(dist, 'sw.js'), sw);

console.log(`dist/ built: version ${version}, index.html ${Math.round(html.length / 1024)} KB, ${assets.length} precached files`);
