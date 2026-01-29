#!/usr/bin/env node
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createReadStream, statSync } from 'node:fs';

const dist = join(process.cwd(), 'dist');
const port = process.env.PORT || 5080;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
  try {
  const urlPath = (req.url || '/').split('?')[0];
  // Normalize the incoming URL path: remove leading slashes so path.join
  // treats it as a relative path on Windows (joining with an absolute
  // segment will otherwise discard the dist prefix).
  const cleanPath = urlPath.replace(/^\/+/, '');
  let filePath = join(dist, cleanPath === '' ? 'index.html' : cleanPath);
    let status = 200;
    let stream;
    try {
      const st = statSync(filePath);
      if (st.isDirectory()) filePath = join(filePath, 'index.html');
      stream = createReadStream(filePath);
    } catch {
      // Fallback to index.html for SPA route
      status = 200;
      filePath = join(dist, 'index.html');
      stream = createReadStream(filePath);
    }
    const type = mime[extname(filePath)] || 'application/octet-stream';
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    stream.pipe(res);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
});

server.listen(port, () => {
  console.log(`[serve-dist-fallback] listening on http://localhost:${port}`);
});
