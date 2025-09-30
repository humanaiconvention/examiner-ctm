#!/usr/bin/env node
// Lightweight static file server for dashboard-core preview (no build step)
// Serves files from dashboard-core/src and supports basic content-type mapping.
import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const projectRoot = resolve(__dirname, '..');
const srcRoot = resolve(projectRoot, 'src');

const PORT = parseInt(process.env.PORT || process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || '5080', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function sanitizePath(p) {
  // Basic directory traversal mitigation
  if (p.includes('..')) return '/';
  return p;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = sanitizePath(url.pathname);
  if (pathname === '/' || pathname === '') {
    // default to research preview for convenience
    pathname = '/demo/research-preview.html';
  }
  const fsPath = resolve(srcRoot, '.' + pathname);
  try {
    const st = await stat(fsPath);
    if (st.isDirectory()) {
      res.writeHead(301, { Location: pathname.replace(/\/$/, '') + '/research-preview.html' });
      res.end();
      return;
    }
    const data = await readFile(fsPath);
    const ext = extname(fsPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Server error');
    }
  }
});

server.listen(PORT, () => {
  const msg = `[dashboard-core:static-preview] listening on http://localhost:${PORT} (root: ${srcRoot})`;
  if (!process.env.QUIET) console.log(msg);
});

process.on('SIGINT', () => { server.close(() => process.exit(0)); });