#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import http from 'node:http';

const PORT = process.env.PREVIEW_PORT ? Number(process.env.PREVIEW_PORT) : 5060;
const HEALTH_PATH = process.env.HEALTH_PATH || '/healthz.json';
const MAX_RETRIES = Number(process.env.HEALTH_RETRIES || 15); // ~15 * 400ms = 6s default
const RETRY_DELAY_MS = Number(process.env.HEALTH_RETRY_DELAY || 400);

function log(msg) { console.log(`[preview:auto] ${msg}`); }

async function waitForHealth() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const ok = await new Promise(resolve => {
      const req = http.get({ host: 'localhost', port: PORT, path: HEALTH_PATH, timeout: 1500 }, res => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(true);
        } else {
          resolve(false);
        }
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
    if (ok) { log(`Health endpoint ready at http://localhost:${PORT}${HEALTH_PATH}`); return true; }
    log(`Health not ready (attempt ${attempt}/${MAX_RETRIES})`);
    await sleep(RETRY_DELAY_MS);
  }
  return false;
}

async function main() {
  log('Building project...');
  await new Promise((resolve, reject) => {
    const b = spawn('npm', ['run', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' });
    b.on('exit', code => code === 0 ? resolve() : reject(new Error(`build failed (${code})`)));
  });

  log('Starting static server...');
  const server = spawn('npx', ['serve', '-l', String(PORT), 'dist'], { stdio: 'inherit', shell: process.platform === 'win32' });
  server.on('exit', code => {
    log(`Static server exited with code ${code}`);
    process.exit(code || 0);
  });

  const healthy = await waitForHealth();
  if (healthy) {
    log('Preview ready. (CTRL+C to stop)');
  } else {
    log('Health check failed to become ready within retries. (Preview may still be starting)');
  }
}

main().catch(err => { console.error('[preview:auto] fatal', err); process.exit(1); });
