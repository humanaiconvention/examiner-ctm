#!/usr/bin/env node
import { createHash } from 'crypto';
import { readFileSync, readdirSync, writeFileSync, statSync } from 'fs';
import path from 'path';

// Generate SRI (sha384) integrity metadata for built JS/CSS files.
// Usage: node scripts/generate-sri.mjs [--dir dist] [--out sri-manifest.json]

const args = process.argv.slice(2);
function arg(name, def){ const i = args.indexOf('--'+name); return i>-1 ? args[i+1] : def; }
const distDir = path.resolve(process.cwd(), arg('dir','web/dist'));
const outFile = path.resolve(process.cwd(), arg('out','web/dist/sri-manifest.json'));

function walk(dir){
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return [full];
  });
}

const targets = walk(distDir).filter(f => /\.(js|css)$/.test(f));
const sri = {};
for (const file of targets) {
  try {
    const data = readFileSync(file);
    const h = createHash('sha384').update(data).digest('base64');
    sri[path.relative(distDir, file).replace(/\\/g,'/')] = 'sha384-' + h;
  } catch (e) {
    console.error('Failed SRI for', file, e.message);
  }
}
writeFileSync(outFile, JSON.stringify({ generated: new Date().toISOString(), files: sri }, null, 2));
console.log('[sri] wrote', outFile, 'entries=', Object.keys(sri).length);
