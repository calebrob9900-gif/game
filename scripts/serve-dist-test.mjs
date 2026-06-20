#!/usr/bin/env node
/**
 * Dead-simple static file server for the Playwright webServer. Serves the
 * prebuilt `dist-test/` (the `--mode test` bundle with instrumentation) on
 * 127.0.0.1. Replaces `vite dev`/`vite preview`, both of which were flaky/never
 * bound in the CI Playwright container. Binds EXPLICITLY to 127.0.0.1 (IPv4) to
 * match Playwright's webServer url, and starts instantly (no dep optimization).
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, resolve } from 'node:path';

const PORT = Number(process.argv[2] ?? 4173);
const ROOT = resolve(process.cwd(), 'dist-test');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.ktx2': 'image/ktx2',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    let filePath = normalize(join(ROOT, urlPath));
    // Prevent path traversal outside ROOT.
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    try {
      const s = await stat(filePath);
      if (s.isDirectory()) filePath = join(filePath, 'index.html');
    } catch {
      // SPA fallback to index.html for unknown routes.
      filePath = join(ROOT, 'index.html');
    }
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  // eslint-disable-next-line no-console
  console.log(`serve-dist-test: http://127.0.0.1:${PORT} (root: ${ROOT})`);
});
