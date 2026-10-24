// Serves dist/ under /dsp-calculator/, the same subpath GitHub Pages uses.
// Usage: node scripts/serve.mjs [port]   (default 8080)
// The update test imports serveDir() to serve two builds in turn.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const base = '/dsp-calculator/';
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};

// getRoot() is read on every request, so a caller can switch builds.
export function serveDir(getRoot, port) {
  const server = createServer(async (req, res) => {
    const root = getRoot();
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/' || url.pathname === base.slice(0, -1)) {
      res.writeHead(301, { Location: base });
      return res.end();
    }
    if (!url.pathname.startsWith(base)) {
      res.writeHead(404);
      return res.end('Not found');
    }
    let file = normalize(join(root, decodeURIComponent(url.pathname.slice(base.length))));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      return res.end();
    }
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      let body = await readFile(file);
      const type = types[extname(file)] || 'application/octet-stream';
      // no-cache matches how Pages revalidates, so the service worker sees new builds.
      const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache', Vary: 'Accept-Encoding' };
      // Pages gzips text files, so Lighthouse sees the same sizes here.
      if (/text|javascript|json/.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
        body = gzipSync(body);
        headers['Content-Encoding'] = 'gzip';
      }
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const port = Number(process.argv[2] || process.env.PORT || 8080);
  await serveDir(() => dist, port);
  console.log(`Serving dist/ at http://localhost:${port}${base}`);
}
