// Downloads FactorioLab's MIT license into dist/licenses/, after the build.
// Its terms ask for the notice to ship with the data. The Pages workflow
// runs this, so the file is not kept in the repo.
// Usage: npm run build && node scripts/add-licenses.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// A fixed commit, so the text cannot change without a change here.
const URL = 'https://raw.githubusercontent.com/factoriolab/factoriolab/11e7be16d84595b683da5de981b8fa54ba4a1697/LICENSE';
const SHA256 = '1b17e7ef58a7fe1f0278c5423fa5da9fb2a1829a23f180c1315e359eceec146d';

const res = await fetch(URL);
if (!res.ok) throw new Error(`Could not download the FactorioLab license: HTTP ${res.status}`);
const text = await res.text();
const sum = createHash('sha256').update(text).digest('hex');
if (sum !== SHA256) throw new Error(`The FactorioLab license changed (sha256 ${sum}). Check it and update this script.`);

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'licenses');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'FactorioLab-LICENSE.txt'), text);
console.log('Wrote dist/licenses/FactorioLab-LICENSE.txt');
