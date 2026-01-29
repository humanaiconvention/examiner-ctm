import http from 'node:http';
import { join } from 'node:path';
import { statSync, readFileSync } from 'node:fs';
import fetch from 'node-fetch';

async function run() {
  const base = 'http://localhost:5080';
  const routes = ['/', '/learn-more', '/preview-questions', '/explore'];
  for (const r of routes) {
    const res = await fetch(base + r);
    if (res.status >= 400) {
      console.error(`Route ${r} returned ${res.status}`);
      process.exit(2);
    }
    const text = await res.text();
    if (!text.includes('<div id="root">')) {
      console.error(`Route ${r} did not return expected SPA index.html`);
      process.exit(2);
    }
    console.log(`OK ${r} -> ${res.status}`);
  }
  console.log('All routes returned index.html');
}

run().catch(e => { console.error(e); process.exit(2); });
