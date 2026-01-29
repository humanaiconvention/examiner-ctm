#!/usr/bin/env node
import http from 'node:http';
import { readFile, stat, createReadStream } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(process.cwd(), 'web', 'dist');
const PORT = Number(process.env.PORT || 5500);
const FALLBACK = 'index.html';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

function send(res, code, body, headers={}) {
  res.writeHead(code, { 'content-length': Buffer.byteLength(body), ...headers });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  let filePath = resolve(ROOT, `.${urlPath}`);
  if (filePath.endsWith('/')) filePath += 'index.html';
  stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      // SPA fallback for navigation requests
      const fallbackPath = join(ROOT, FALLBACK);
      readFile(fallbackPath, (e, data) => {
        if (e) return send(res, 404, 'Not Found');
        send(res, 200, data.toString(), { 'content-type': MIME['.html'] });
      });
      return;
    }
    const type = MIME[extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`[preview-dist] Serving ${ROOT} on http://localhost:${PORT}`);
});
