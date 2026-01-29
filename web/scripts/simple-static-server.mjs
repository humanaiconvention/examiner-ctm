#!/usr/bin/env node
/**
 * Simple static server with SPA fallback.
 * - Serves files from ./dist
 * - Directory index disabled (must request existing file) except root -> index.html
 * - Always falls back to index.html for 404 on HTML navigations (no extension or .html)
 * - Adds basic request logging with duration and status
 * - Handles SIGINT/SIGTERM for graceful shutdown
 * - PORT env var (default 5060)
 */
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { stat, readFile, writeFile, readdir } from 'node:fs/promises';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createGzip, createBrotliCompress } from 'node:zlib';
import { watch } from 'node:fs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = normalize(join(__filename, '..'));
const ROOT = normalize(join(__dirname, '..', 'dist'));
// Determine starting port (precedence: --port CLI arg > env PORT > default 5060)
const ARG_PORT = process.argv.find(a => a.startsWith('--port='))?.split('=')[1];
const START_PORT = parseInt(ARG_PORT || process.env.PORT || '5060', 10);
let CURRENT_PORT = START_PORT;

const INDEX = 'index.html';

if (!existsSync(ROOT)) {
  console.error('[simple-static] dist directory not found:', ROOT);
  process.exit(1);
}

function isHtmlNavigation(reqPath) {
  // Heuristic: no extension OR ends with .html
  const ext = extname(reqPath).toLowerCase();
  return !ext || ext === '.html';
}

function safePath(urlPath) {
  try {
    // Remove querystring & hash
    const clean = urlPath.split('?')[0].split('#')[0];
    // Prevent directory traversal
    const decoded = decodeURIComponent(clean);
    const full = normalize(join(ROOT, decoded));
    if (!full.startsWith(ROOT)) return null;
    return full;
  } catch {
    return null;
  }
}

// Live reload (SSE) state
const clients = new Set(); // SSE clients
const wsClients = new Set(); // WebSocket clients
const LR_PATH = '/__live_reload';
const LR_WS_PATH = '/__live_reload_ws';

let traversalAttempts = 0;
const changedFilesRecent = new Set();
const CHANGE_LOG_WINDOW_MS = 250; // debounce grouping
let changeFlushTimer = null;

// Per-file hash state
let fileHashMap = Object.create(null); // { relPath: { size, mtimeMs, sha256 } }
let fileHashAggregate = null; // sha256 of concatenated path+hash lines
let fileHashEtag = null; // W/"..." style
let fileHashTotalBytes = 0;
let fileHashCount = 0;
let fileHashGeneratedAt = null;

async function computeAllFileHashes() {
  const start = Date.now();
  const entries = [];
  async function walk(dir, relBase='') {
    let items = [];
    try { items = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      const rel = relBase ? relBase + '/' + it.name : it.name;
      const full = join(dir, it.name);
      if (it.isDirectory()) {
        if (rel.startsWith('.cert')) continue; // ignore cert artifacts
        await walk(full, rel);
      } else if (it.isFile()) {
        // Skip ephemeral injected index copy; we want original index.html hashed
        if (rel === '__index.live.html') continue;
        try {
          const st = await stat(full);
          const buf = readFileSync(full); // sync ok for startup performance (small number of files)
          const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
          entries.push({ rel, size: st.size, mtimeMs: st.mtimeMs, sha256 });
        } catch {/* ignore individual file errors */}
      }
    }
  }
  await walk(ROOT);
  const map = Object.create(null);
  let totalBytes = 0;
  const agg = crypto.createHash('sha256');
  for (const e of entries.sort((a,b)=> a.rel.localeCompare(b.rel))) {
    map[e.rel] = { size: e.size, mtimeMs: e.mtimeMs, sha256: e.sha256 };
    totalBytes += e.size;
    agg.update(e.rel + ':' + e.sha256 + '\n');
  }
  fileHashMap = map;
  fileHashTotalBytes = totalBytes;
  fileHashCount = entries.length;
  fileHashAggregate = agg.digest('hex');
  fileHashEtag = 'W/"fh-' + fileHashAggregate.slice(0, 20) + '"';
  fileHashGeneratedAt = new Date().toISOString();
  logRecord('info', 'File hashes computed', { files: fileHashCount, totalBytes: totalBytes, ms: Date.now()-start });
}

function updateSingleFileHash(relPath) {
  if (relPath === '__index.live.html') return; // skip ephemeral
  const full = join(ROOT, relPath);
  if (!existsSync(full)) {
    if (fileHashMap[relPath]) delete fileHashMap[relPath];
    recomputeAggregate();
    return;
  }
  try {
    const st = statSync(full);
    if (!st.isFile()) return; // ignore non-regular
    const buf = readFileSync(full);
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    fileHashMap[relPath] = { size: st.size, mtimeMs: st.mtimeMs, sha256 };
  } catch {/* ignore errors */}
  recomputeAggregate();
}

function recomputeAggregate() {
  const agg = crypto.createHash('sha256');
  let totalBytes = 0;
  const entries = Object.entries(fileHashMap).sort((a,b)=> a[0].localeCompare(b[0]));
  for (const [rel, meta] of entries) {
    totalBytes += meta.size || 0;
    if (meta.sha256) agg.update(rel + ':' + meta.sha256 + '\n');
  }
  fileHashTotalBytes = totalBytes;
  fileHashCount = entries.length;
  fileHashAggregate = agg.digest('hex');
  fileHashEtag = 'W/"fh-' + fileHashAggregate.slice(0,20) + '"';
  fileHashGeneratedAt = new Date().toISOString();
}

const QUIET = process.env.QUIET === '1' || process.argv.includes('--silent');
const LOG_FORMAT = (process.env.LOG_FORMAT || (process.argv.find(a=>a.startsWith('--log-format='))?.split('=')[1]) || 'plain').toLowerCase();
const USE_COLOR = process.stdout.isTTY && !process.env.NO_COLOR && (process.env.FORCE_COLOR || LOG_FORMAT === 'color' || LOG_FORMAT === 'plain');

function color(code, str){ return USE_COLOR ? `\u001b[${code}m${str}\u001b[0m` : str; }
const colors = {
  gray: s=>color('90', s),
  green: s=>color('32', s),
  yellow: s=>color('33', s),
  red: s=>color('31', s),
  cyan: s=>color('36', s),
  magenta: s=>color('35', s)
};

function logRecord(level, msg, meta={}) {
  if (QUIET) return;
  if (LOG_FORMAT === 'json') {
    const rec = { ts: new Date().toISOString(), level, msg, ...meta };
    // Avoid huge objects
    try { process.stdout.write(JSON.stringify(rec) + '\n'); } catch { /* ignore */ }
    return;
  }
  // color/plain
  let levelTag = level.toUpperCase();
  if (USE_COLOR) {
    if (level === 'info') levelTag = colors.green(levelTag);
    else if (level === 'warn') levelTag = colors.yellow(levelTag);
    else if (level === 'error') levelTag = colors.red(levelTag);
    else if (level === 'debug') levelTag = colors.cyan(levelTag);
  }
  const parts = [colors.gray(new Date().toISOString()), levelTag, msg];
  if (meta.status) parts.push(colors.magenta(String(meta.status)));
  if (meta.durMs) parts.push(colors.cyan(meta.durMs + 'ms'));
  if (meta.detail) parts.push(meta.detail);
  process.stdout.write(parts.join(' ') + '\n');
}

function logRequest(method, url, status, dur, detail){
  logRecord(status >=500? 'error': status>=400? 'warn':'info', `${method} ${url}`, { status, durMs: dur, detail });
}

const HTTPS_ENABLED = process.argv.includes('--https') || process.env.HTTPS === '1';
let server; // will assign after handler defined

async function ensureSelfSigned() {
  const certDir = join(__dirname, '..', '.cert');
  const keyPath = join(certDir, 'key.pem');
  const certPath = join(certDir, 'cert.pem');
  if (existsSync(keyPath) && existsSync(certPath)) {
    return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
  }
  try {
    await import('node:fs/promises').then(m=>m.mkdir(certDir, { recursive: true }));
  } catch {/* ignore */}
  // Lazy load selfsigned if available, otherwise minimal fallback using openssl if present
  let generated = null;
  try {
    const selfsigned = await import('selfsigned').catch(()=>null);
    if (selfsigned) {
      const attrs = [{ name: 'commonName', value: 'localhost' }];
      const pems = selfsigned.generate(attrs, { days: 365, keySize: 2048, algorithm: 'sha256' });
      writeFile(keyPath, pems.private, 'utf8').catch(()=>{});
      writeFile(certPath, pems.cert, 'utf8').catch(()=>{});
      generated = { key: Buffer.from(pems.private), cert: Buffer.from(pems.cert) };
    }
  } catch (e) {
    logRecord('warn','selfsigned generation failed', { error: e.message });
  }
  if (!generated) {
    throw new Error('Failed to generate self-signed certificate. Install dev dependency "selfsigned".');
  }
  return generated;
}

const requestHandler = async (req, res) => {
  const start = performance.now();
  const { method, url = '/' } = req;
  // --- Owner session auth (Option 1) ---
  // Lazy-load token utilities only if one of the auth endpoints is hit to avoid overhead for static file hits.
  const SECRET = process.env.SESSION_SIGNING_SECRET;
  const OWNER_EMAIL = process.env.OWNER_EMAIL;
  const SESSION_MAX_AGE = parseInt(process.env.SESSION_MAX_AGE_SECONDS || '86400', 10);
  function parseCookies(header) {
    const out = {}; if (!header) return out; header.split(/; */).forEach(p=>{ const i=p.indexOf('='); if(i>0) out[p.slice(0,i)] = decodeURIComponent(p.slice(i+1)); }); return out;
  }
  async function ensureSessionUtil() { return import('./session-util.mjs'); }
  async function verifySessionCookie() {
    if (!SECRET) return null;
    const cookies = parseCookies(req.headers['cookie']);
    const raw = cookies['owner_session'];
    if (!raw) return null;
    const { validateSession } = await ensureSessionUtil();
    return validateSession(raw, SECRET, req);
  }
  // Auth endpoints
  if (url.startsWith('/session')) {
    const session = await verifySessionCookie();
    const body = JSON.stringify(session ? { authenticated: true, email: session.sub, exp: session.exp } : { authenticated: false });
    const buf = Buffer.from(body);
    res.writeHead(200, { ...baseHeaders(), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Length': buf.length });
    res.end(buf); return;
  }
  if (url.startsWith('/logout')) {
    // Clear cookie
    res.writeHead(302, { ...baseHeaders(), 'Set-Cookie': 'owner_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict', Location: '/' });
    res.end(); return;
  }
  if (url.startsWith('/login')) {
    try {
      if (!SECRET || !OWNER_EMAIL) { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('Auth not configured'); return; }
      const q = new URL(url, 'http://localhost');
      const token = q.searchParams.get('token');
      if (!token) { res.writeHead(400, { 'Content-Type': 'text/plain' }); res.end('Missing token'); return; }
  const { verifyToken } = await import('./auth-token.mjs');
  const payload = verifyToken(token, SECRET);
      if (payload.purpose !== 'owner-login' || payload.sub !== OWNER_EMAIL) { res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('Invalid token'); return; }
  // Issue session token (with epoch + fingerprint binding)
  const { issueSession } = await ensureSessionUtil();
  const sessionToken = await issueSession(OWNER_EMAIL, SECRET, SESSION_MAX_AGE, req);
      const secure = (HTTPS_ENABLED ? 'Secure; ' : '');
      const cookie = `owner_session=${sessionToken}; Path=/; ${secure}HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE}`;
      res.writeHead(302, { ...baseHeaders(), 'Set-Cookie': cookie, Location: '/' });
      res.end(); return;
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'text/plain' }); res.end('Login failed'); return;
    }
  }
  if (url === '/favicon.ico') {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#0d152b" stroke="#49e3d4" stroke-width="4"/><path d="M20 40c4.5-9 10-14 12-22 2 8 7.5 13 12 22" stroke="#49e3d4" stroke-width="4" fill="none" stroke-linecap="round"/></svg>';
    const buf = Buffer.from(svg);
    res.writeHead(200, { ...baseHeaders(), 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600', 'Content-Length': buf.length });
    res.end(buf);
    return;
  }
  if (url === '/__metrics') {
    const payload = JSON.stringify({
      clients: clients.size,
      wsClients: wsClients.size,
      traversalAttempts,
      uptimeSec: process.uptime(),
      port: CURRENT_PORT,
      timestamp: new Date().toISOString()
    });
    const buf = Buffer.from(payload);
    res.writeHead(200, { ...baseHeaders(), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Length': buf.length });
    res.end(buf);
    return;
  }
  if (url === '/__file-hashes') {
    if (fileHashEtag && req.headers['if-none-match'] === fileHashEtag) {
      res.writeHead(304, baseHeaders());
      res.end();
      return;
    }
    const body = {
      generatedAt: fileHashGeneratedAt,
      fileCount: fileHashCount,
      totalBytes: fileHashTotalBytes,
      aggregateSha256: fileHashAggregate,
      files: fileHashMap
    };
    const json = Buffer.from(JSON.stringify(body));
    res.writeHead(200, { ...baseHeaders(), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Length': json.length, 'ETag': fileHashEtag || genEtag(json.length, Date.now()) });
    res.end(json);
    return;
  }
  if (url.startsWith(LR_WS_PATH)) {
    // Minimal WebSocket handshake (RFC6455)
    if (req.headers.upgrade !== 'websocket') {
      res.writeHead(400); res.end(); return;
    }
    const key = req.headers['sec-websocket-key'];
    const accept = generateWsAccept(key);
    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`
    ];
    res.socket.write(headers.join('\r\n') + '\r\n\r\n');
    wsClients.add(res.socket);
    res.socket.on('close', () => wsClients.delete(res.socket));
    return;
  }
  if (url.startsWith(LR_PATH)) {
    // SSE endpoint
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(': connected\n\n');
    const client = { res };
    clients.add(client);
    req.on('close', () => { clients.delete(client); });
    return;
  }
  let status = 200;
  let servedPath = '';
  try {
    let reqPath = url; // includes leading '/'
    if (reqPath === '/' || reqPath === '') reqPath = '/' + INDEX;

    let full = safePath(reqPath);
    if (!full) {
      traversalAttempts++;
      status = 400;
      res.writeHead(status, { 'Content-Type': 'text/plain' });
      res.end('Bad request');
      log(method, url, status, start, 'bad-path');
      return;
    }

    // If file missing and looks like an SPA navigation, fallback to index.html
    let exists = existsSync(full);
    if (!exists && isHtmlNavigation(reqPath)) {
      full = join(ROOT, INDEX);
      exists = existsSync(full);
    }

    if (!exists) {
      status = 404;
      res.writeHead(status, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      log(method, url, status, start, 'not-found');
      return;
    }

    // Infer content-type minimally
    const ext = extname(full).toLowerCase();
    const type = contentType(ext);
    const st = await stat(full);
    const etag = genEtag(st.size, st.mtimeMs);
    // Conditional GET handling
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, baseHeaders());
      res.end();
      log(method, url, 304, start, 'not-modified');
      return;
    }
    // Decide gzip
  const acceptEncoding = (req.headers['accept-encoding'] || '');
  const supportsBrotli = /br/.test(acceptEncoding);
  const supportsGzip = /gzip/.test(acceptEncoding);
  const useTextCompression = canGzip(ext) && st.size > 512;
  const useBrotli = useTextCompression && supportsBrotli;
  const useGzip = !useBrotli && useTextCompression && supportsGzip;
    const headers = {
      ...baseHeaders(),
      'Content-Type': type,
      'Cache-Control': cacheHeader(ext),
      'ETag': etag,
      'X-Static-Server': 'simple'
    };
    if (useBrotli) {
      headers['Content-Encoding'] = 'br';
    } else if (useGzip) {
      headers['Content-Encoding'] = 'gzip';
    } else {
      headers['Content-Length'] = st.size;
    }
    res.writeHead(status, headers);
    // Serve modified persisted index if live reload injection exists
    if (full.endsWith('/' + INDEX) && injectedIndexPersist && existsSync(injectedIndexPersist)) {
      full = injectedIndexPersist; // swap to persisted version
    }
    let stream = createReadStream(full);
    if (useBrotli) {
      stream = stream.pipe(createBrotliCompress({ params: { } }));
    } else if (useGzip) {
      stream = stream.pipe(createGzip({ level: 6 }));
    }
    stream.pipe(res);
    servedPath = full;
    res.on('close', () => log(method, url, status, start, servedPath));
  } catch (err) {
    status = 500;
    res.writeHead(status, { 'Content-Type': 'text/plain' });
    res.end('Internal server error');
    log(method, url, status, start, 'error', err);
  }
};

if (HTTPS_ENABLED) {
  ensureSelfSigned().then(creds => {
    server = createHttpsServer({ ...creds }, requestHandler);
    startServer();
  }).catch(err => {
    logRecord('error', 'HTTPS init failed', { error: err.message });
    process.exit(1);
  });
} else {
  server = createServer(requestHandler);
}

function log(method, url, status, start, detail, err) {
  const dur = (performance.now() - start).toFixed(1);
  if (LOG_FORMAT === 'json') {
    logRecord(status>=500? 'error': status>=400? 'warn':'info', 'request', { method, url, status, durMs: parseFloat(dur), detail, error: err && (err.stack || String(err)) });
  } else {
    if (err && status>=500) {
      logRequest(method, url, status, dur, detail + (err? (' '+ err.message):''));
    } else {
      logRequest(method, url, status, dur, detail);
    }
  }
}

function contentType(ext) {
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js': return 'application/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.avif': return 'image/avif';
    case '.txt': return 'text/plain; charset=utf-8';
    default: return 'application/octet-stream';
  }
}

function cacheHeader(ext) {
  // Basic heuristic: hash-based asset filenames likely -> long cache
  if (/(\.)([a-f0-9]{8,})(\.)/.test(ext)) return 'public, max-age=31536000, immutable';
  if (['.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif'].includes(ext)) return 'public, max-age=3600';
  return 'no-cache';
}

function canGzip(ext) {
  return ['.html', '.js', '.css', '.json', '.svg', '.txt'].includes(ext);
}

function genEtag(size, mtimeMs) {
  const base = size + '-' + mtimeMs;
  return 'W/"' + crypto.createHash('sha1').update(base).digest('hex').slice(0, 16) + '"';
}

function baseHeaders() {
  return {
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '0',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp'
  };
}

function startServer() {
  server.listen(CURRENT_PORT, () => {
    logRecord('info', `Serving ${ROOT}`, { port: CURRENT_PORT, url: `${HTTPS_ENABLED? 'https':'http'}://localhost:${CURRENT_PORT}`, format: LOG_FORMAT, https: HTTPS_ENABLED });
    prepareInjectedIndex();
    // Kick off file hash computation (don't block serve)
    computeAllFileHashes().catch(e=> logRecord('warn','computeAllFileHashes failed', { error: e.message }));
    if (!process.env.NO_OPEN && !QUIET) {
      openBrowser(`${HTTPS_ENABLED? 'https':'http'}://localhost:${CURRENT_PORT}`);
    }
    startWatcher();
  logRecord('info', 'Features enabled', { features: ['brotli','gzip','etag','SSE','WS','live-reload','security-headers','file-hashes'] });
  });
}

let portAttempts = 0;

function attachServerErrorHandler() {
  if (!server || server.__attachedErrorHandler) return;
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE' && portAttempts < 10) {
      const next = CURRENT_PORT + 1;
      logRecord('warn', 'Port in use - retrying', { previousPort: CURRENT_PORT, nextPort: next });
      CURRENT_PORT = next;
      portAttempts++;
      setTimeout(startServer, 60);
      return;
    }
    logRecord('error', 'Failed to bind port', { port: CURRENT_PORT, error: err.message });
    process.exit(1);
  });
  server.__attachedErrorHandler = true; // marker
}

if (!HTTPS_ENABLED) {
  attachServerErrorHandler();
  startServer();
}

function openBrowser(url) {
  try {
    const platform = process.platform;
    let cmd, args;
    if (platform === 'win32') { cmd = 'cmd'; args = ['/c', 'start', '""', url]; }
    else if (platform === 'darwin') { cmd = 'open'; args = [url]; }
    else { cmd = 'xdg-open'; args = [url]; }
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.unref();
  } catch (e) {
  logRecord('warn', 'Auto-open browser failed', { error: e.message });
  }
}

let injectedIndexPersist = null;
function prepareInjectedIndex() {
  const indexPath = join(ROOT, INDEX);
  if (!existsSync(indexPath)) return;
  try {
    let html = readFileSync(indexPath, 'utf8');
    if (!html.includes('__LIVE_RELOAD__')) {
      const snippet = `\n<script>/*__LIVE_RELOAD__*/\n(() => {\n const useWS = ('WebSocket' in window);\n const connect = () => {\n  if(useWS){\n    const ws = new WebSocket((location.protocol==='https:'?'wss':'ws') + '://' + location.host + '${LR_WS_PATH}');\n    ws.onmessage = (e)=>{ if(e.data==='reload'){ console.log('[live-reload][ws] reload'); location.reload(); }};\n    ws.onclose = ()=> setTimeout(connect, 1500);\n  } else {\n    const es = new EventSource('${LR_PATH}');\n    es.onmessage = (e)=>{ if(e.data==='reload'){ console.log('[live-reload][sse] reload'); location.reload(); }};\n  }\n }; connect();\n})();</script>`;
      if (html.includes('</body>')) html = html.replace('</body>', snippet + '\n</body>');
      else if (html.includes('</head>')) html = html.replace('</head>', snippet + '\n</head>');
    }
    const outPath = join(ROOT, '__index.live.html');
    writeFile(outPath, html, 'utf8').catch(()=>{});
    injectedIndexPersist = outPath;
  logRecord('debug', 'Injected live reload index persisted');
  } catch (e) {
  logRecord('warn', 'prepareInjectedIndex failed', { error: e.message });
  }
}

function startWatcher() {
  try {
    watch(ROOT, { recursive: true }, (ev, filename) => {
      if (!filename) return;
      // Invalidate injected cache if index changed
      changedFilesRecent.add(filename);
      if (filename.endsWith(INDEX)) {
        prepareInjectedIndex();
      }
      scheduleChangeLog();
      broadcastReload();
    });
  logRecord('info', 'Live reload watcher active');
  } catch (e) {
  logRecord('warn', 'Watcher not available', { error: e.message });
  }
}

function broadcastReload() {
  for (const c of clients) { try { c.res.write('data: reload\n\n'); } catch { /* ignore */ } }
  // WebSocket broadcast (text frame opcode 0x1). Simple framing, no fragmentation.
  const payload = Buffer.from('reload');
  const frame = createWsFrame(payload);
  for (const ws of wsClients) { try { ws.write(frame); } catch { /* ignore */ } }
}

function scheduleChangeLog() {
  if (changeFlushTimer) return;
  changeFlushTimer = setTimeout(() => {
    const files = Array.from(changedFilesRecent).slice(0, 12);
    changedFilesRecent.clear();
    changeFlushTimer = null;
    if (!QUIET && files.length) {
  logRecord('info', 'Change detected', { files });
    }
    // Recompute hashes for touched files (incremental)
    for (const f of files) updateSingleFileHash(f.replace(/\\/g,'/'));
  }, CHANGE_LOG_WINDOW_MS).unref();
}

// WebSocket utility
function generateWsAccept(key) {
  return crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
}
function createWsFrame(dataBuf) {
  const len = dataBuf.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.from([0x81, 126, (len >> 8) & 0xff, len & 0xff]);
  } else {
    const lenBuf = Buffer.alloc(8);
    lenBuf.writeBigUInt64BE(BigInt(len));
    header = Buffer.concat([Buffer.from([0x81, 127]), lenBuf]);
  }
  return Buffer.concat([header, dataBuf]);
}

// Metrics endpoint
const METRICS_PATH = '/__metrics';
// Extend server request handling by wrapping original listener if needed (kept in single handler above). For simplicity,
// we add a lightweight intercept using server.on('request') AFTER definition is acceptable (already inline), but here we
// just patch via prototype (skip - server has single handler). Instead incorporate inside main handler:

// Quick patch: add a wrapper to existing http server emit (minimal invasive) -- but simpler: we inserted early return
// paths; integrate metrics by checking path at top of handler. (Modify earlier if needed.)


['SIGINT','SIGTERM'].forEach(sig => {
  process.on(sig, () => {
  logRecord('info', `Caught ${sig}, shutting down`);
    server.close(() => {
  logRecord('info', 'Closed');
      process.exit(0);
    });
    // Force exit if not closed in 2s
    setTimeout(() => process.exit(1), 2000).unref();
  });
});
