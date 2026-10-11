#!/usr/bin/env node
/**
 * Local static server for development only.
 *
 * Mirrors what GitHub Pages does — serve files, no rewrites, and hand back
 * 404.html for an unknown path — so anything that works here works when
 * deployed. Not for production use.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

async function resolveTarget(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  let target = path.join(root, path.normalize(decoded).replace(/^(\.\.[/\\])+/, ''));
  if (!target.startsWith(root)) return null; // refuse path traversal
  try {
    const info = await stat(target);
    if (info.isDirectory()) target = path.join(target, 'index.html');
  } catch {
    /* fall through; the readFile below handles the miss */
  }
  return target;
}

const server = createServer(async (req, res) => {
  const url = req.url || '/';
  let file = await resolveTarget(url);

  const send = async (target, status = 200) => {
    try {
      const body = await readFile(target);
      const type = TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream';
      res.writeHead(status, {
        'content-type': type,
        'cache-control': 'no-store', // never serve a stale price during development
        'x-content-type-options': 'nosniff',
      });
      res.end(body);
      return true;
    } catch {
      return false;
    }
  };

  if (file && (await send(file))) return;

  // Directory without index.html, or an unknown clean path: Pages-style 404
  // document, which the real deployment also serves.
  if (file) {
    const withIndex = path.join(file, 'index.html');
    if (await send(withIndex)) return;
  }
  if (await send(path.join(root, '404.html'), 404)) return;

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(port, host, () => {
  console.log(`Muna’s Haven dev server → http://localhost:${port}/`);
  console.log(`Owner dashboard        → http://localhost:${port}/owner/`);
});
