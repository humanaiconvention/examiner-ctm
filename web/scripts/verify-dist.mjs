#!/usr/bin/env node
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import http from 'node:http';

const args = process.argv.slice(2);
let url = 'file';
let wait = 0;
for (let i=0;i<args.length;i++) {
  if (args[i] === '--url') url = args[++i];
  else if (args[i] === '--wait') wait = parseInt(args[++i],10) || 0;
}

function delay(ms){return new Promise(r=>setTimeout(r,ms));}

const dist = join(process.cwd(), 'dist');
const required = ['index.html','healthz.json','readyz.json'];

(async () => {
  for (const f of required) {
    try { await access(join(dist, f), constants.R_OK); }
    catch { console.error(`[verify-dist] Missing required file: ${f}`); process.exitCode = 1; }
  }
  try {
    const html = await readFile(join(dist,'index.html'),'utf-8');
    if (!html.includes('<div id="root">')) {
      console.error('[verify-dist] index.html missing root div');
      process.exitCode = 1;
    }
  } catch (e) {
    console.error('[verify-dist] Failed reading index.html', e);
    process.exitCode = 1;
  }

  if (url !== 'file') {
    if (wait) await delay(wait);
    await new Promise(resolve => {
      const req = http.get(url, res => {
        const { statusCode } = res;
        if (statusCode !== 200) {
          console.error(`[verify-dist] URL ${url} returned status ${statusCode}`);
          process.exitCode = 1;
        } else {
          console.log(`[verify-dist] URL ${url} OK (200)`);
        }
        res.resume();
        resolve();
      });
      req.on('error', err => {
        console.error('[verify-dist] Request error', err.message);
        process.exitCode = 1;
        resolve();
      });
    });
  }

  if (process.exitCode) {
    console.error('[verify-dist] FAIL');
    process.exit(process.exitCode);
  } else {
    console.log('[verify-dist] PASS');
  }
})();
