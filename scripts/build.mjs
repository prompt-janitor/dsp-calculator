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

// Scripts ship as separate ES modules. The recipe data becomes one more
// module, so the app can import it without a fetch.
mkdirSync(join(dist, 'js'), { recursive: true });
const modules = readdirSync(src('js')).filter((f) => f.endsWith('.js')).sort();
for (const f of modules) cpSync(src('js/' + f), join(dist, 'js', f));
writeFileSync(join(dist, 'js', 'recipes.js'), 'export default ' + read('data/recipes.json').trim() + ';\n');
const scripts = [...modules, 'recipes.js'].sort().map((f) => 'js/' + f);
// Preload every module so the browser does not find them one import at a time.
const preload = scripts.map((f) => `<link rel="modulepreload" href="${f}">`).join('\n');

const font = readFileSync(src('assets/fonts/chakra-petch-600.woff2')).toString('base64');
const css = read('css/app.css')
  .replace('__FONT_URL__', () => 'data:font/woff2;base64,' + font)
  .replace('__SPRITE_URL__', 'sprite.webp');

const splash = JSON.parse(read('assets/splash/splash.json'))
  .map((s) => `<link rel="apple-touch-startup-image" href="splash/${s.file}" media="${s.media}">`)
  .join('\n');

// Function replacers, so "$" sequences in the code are inserted literally.
const html = read('index.html')
  .replace('<!-- MODULES -->', () => preload)
  .replace('<!-- SPLASH -->', () => splash)
  .replace('/* CSS */', () => css)
  .replace('<!-- BODY -->', () => read('body.html'));
writeFileSync(join(dist, 'index.html'), html);

for (const dir of ['icons', 'splash']) cpSync(src('assets/' + dir), join(dist, dir), { recursive: true, filter: (f) => !f.endsWith('.json') });
cpSync(src('assets/sprite.webp'), join(dist, 'sprite.webp'));
cpSync(src('manifest.webmanifest'), join(dist, 'manifest.webmanifest'));
mkdirSync(join(dist, 'licenses'), { recursive: true });
cpSync(src('assets/fonts/OFL-ChakraPetch.txt'), join(dist, 'licenses', 'OFL-ChakraPetch.txt'));
writeFileSync(join(dist, '.nojekyll'), '');

// Service worker: the precache list holds every file the app needs offline.
const assets = ['./', 'index.html', 'manifest.webmanifest', 'sprite.webp', ...scripts];
for (const dir of ['icons', 'splash']) for (const f of readdirSync(join(dist, dir)).sort()) assets.push(dir + '/' + f);

// The cache version is a hash of every file in dist/, so any change to any
// shipped file gives a new cache.
const hash = createHash('sha1');
for (const f of listFiles(dist)) hash.update(f + '\0').update(readFileSync(join(dist, f)));
const version = hash.digest('hex').slice(0, 10);
const sw = readFileSync(join(root, 'scripts', 'sw.template.js'), 'utf8')
  .replace('__VERSION__', version)
  .replace('__ASSETS__', () => JSON.stringify(assets, null, 2));
writeFileSync(join(dist, 'sw.js'), sw);

console.log(`dist/ built: version ${version}, index.html ${Math.round(html.length / 1024)} KB, ${assets.length} precached files`);

function listFiles(dir, prefix = '') {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix + e.name;
    if (e.isDirectory()) out.push(...listFiles(join(dir, e.name), rel + '/'));
    else out.push(rel);
  }
  return out.sort();
}
