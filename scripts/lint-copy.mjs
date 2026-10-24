// Flags AI-style writing tics ("Claudisms") in docs, UI copy and code comments.
// Usage: npm run lint:copy            (report)
//        npm run lint:copy -- --strict (exit 1 on any hit, for CI)
// Put `copy-ok` on a line to silence it when the wording is deliberate.
// The rules are described in docs/STYLE.md.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'assets', 'reference']);
const SKIP_FILES = new Set(['docs/STYLE.md', 'scripts/lint-copy.mjs', 'src/data/recipes.json']);
const EXTS = new Set(['.md', '.html', '.js', '.mjs', '.cjs', '.css', '.yml', '.webmanifest']);

const RULES = [
  ['em dash', /—|(?<=\w) -- (?=\w)/],
  ['"not X, it\'s Y" pivot', /\b(?:is|are|was|it'?s|this is|that'?s)\s+not\s+(?:just\s+|only\s+|about\s+)?[^.;:!?]{1,60}?[,;—]\s*(?:it'?s|but|they'?re|this is)\b/i],
  ['"not just" escalation', /\b(?:isn'?t|aren'?t|not)\s+just\b/i],
  ['"No X. No Y." fragment run', /\bNo \w+(?: \w+)?\. No \w+/],
  ['"Not a X. A Y." fragment', /(?:^|[.!?]\s+)Not (?:a|an|the|because|just)\b[^.]{0,40}\.\s+(?:A|An|It|Just)\b/],
  ['stacked one-word sentences', /(?:^|\s)(?:[A-Z][a-z]+\.(?:\s+|$)){3,}/],
  ['metaphor jargon', /\b(?:load[- ]bearing|carr(?:y|ies) the (?:argument|weight)|does the heavy lifting|earns? its (?:place|keep)|lives? (?:in|inside) (?:the|a)\b)/i],
  ['emphasis filler', /\b(?:full stop|period\.|worth (?:noting|stating|calling out|mentioning)|it'?s important to (?:note|remember)|needless to say|make no mistake|let'?s be (?:clear|honest)|to be clear|the (?:real|key) (?:question|insight|point|issue) is)\b/i],
  ['signposting', /\b(?:here'?s (?:the thing|what|why|how)|in (?:short|summary|essence|a nutshell)|at (?:its|the) (?:core|heart)|simply put|the bottom line|that said|with that in mind|let'?s (?:dive|break|walk|take a look))\b/i],
  ['hype words', /\b(?:seamless(?:ly)?|robust|leverag(?:e|es|ing)|elevate[sd]?|unlock(?:s|ed|ing)?|empower(?:s|ed|ing)?|supercharg\w*|game[- ]chang\w*|cutting[- ]edge|state[- ]of[- ]the[- ]art|revolutioni[sz]\w*|effortless(?:ly)?|delv(?:e|es|ing)|tapestry|testament to|realm|landscape of|navigat(?:e|ing) the|foster(?:s|ing)?|showcas\w*|streamlin\w*|harness(?:es|ing)?|unparalleled|world[- ]class|best[- ]in[- ]class|blazing(?:ly)? fast|crucial|pivotal|paramount|vital)\b/i],
  ['sincerity markers', /\b(?:honest(?:ly)?|genuine(?:ly)?|truly|frankly|quietly|deeply|incredibly|absolutely)\b/i],
  ['chatbot voice', /\b(?:great question|you'?re absolutely right|i hope this helps|happy to help|feel free to|don'?t hesitate|rest assured|i'?ve gone ahead|as an ai)\b/i],
  ['flourish closers', /\b(?:and that'?s (?:the|what) (?:point|difference)|that'?s the whole (?:point|trick)|which is exactly the point|and the trap is)\b/i],
  ['semicolon pivot "in theory; in practice"', /\bin theory[;,][^.]*in practice\b/i],
];

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (!SKIP_DIRS.has(name)) walk(p, out); continue; }
    const rel = relative(root, p).split('\\').join('/');
    if (EXTS.has(extname(name)) && !SKIP_FILES.has(rel)) out.push(rel);
  }
  return out;
}

// In code, only check comments and string literals that read as prose.
function proseOf(line, ext) {
  if (ext === '.md' || ext === '.yml' || ext === '.webmanifest') return line;
  if (ext === '.html') return line.replace(/<[^>]+>/g, ' ');
  const parts = [];
  const comment = line.match(/(?:\/\/|\/\*|^\s*\*)(.*)$/);
  if (comment) parts.push(comment[1]);
  for (const m of line.matchAll(/'((?:[^'\\]|\\.){12,})'|"((?:[^"\\]|\\.){12,})"|`([^`]{12,})`/g)) {
    const s = m[1] || m[2] || m[3];
    if (/\s/.test(s) && /[a-z]{3,}/i.test(s)) parts.push(s.replace(/<[^>]+>/g, ' '));
  }
  return parts.join(' | ');
}

const strict = process.argv.includes('--strict');
let hits = 0;
for (const file of walk(root, [])) {
  const ext = extname(file);
  readFileSync(join(root, file), 'utf8').split('\n').forEach((line, i) => {
    if (line.includes('copy-ok')) return;
    const text = proseOf(line, ext);
    if (!text) return;
    for (const [name, re] of RULES) {
      const m = text.match(re);
      if (m) { hits++; console.log(`${file}:${i + 1}  ${name}  "${m[0].trim().slice(0, 60)}"`); }
    }
  });
}
console.log(hits ? `\n${hits} possible tics found.` : 'No tics found.');
if (strict && hits) process.exit(1);
