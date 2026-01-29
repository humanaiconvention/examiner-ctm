#!/usr/bin/env node
import { readdirSync, statSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import path from 'node:path';

// Generate a manifest of current dist assets (filename -> size) and diff against previous snapshot.
// Usage: node scripts/asset-manifest-diff.mjs [--snapshot]

// Determine web directory (script assumed at web/scripts/*). Decode URI for Windows paths.
const scriptFileUrl = new URL(import.meta.url);
const scriptDir = path.dirname(decodeURIComponent(scriptFileUrl.pathname.replace(/^\//, '')));
const webDir = path.resolve(scriptDir, '..');
const distDir = path.join(webDir, 'dist');
const snapshotPath = path.join(webDir, '.asset-manifest.json');

function walk(dir, base=dir){
  const entries = readdirSync(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries){
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full, base)); else out.push(full);
  }
  return out;
}

function rel(p){ return p.split(/\\|\//).slice(p.split(/\\|\//).indexOf('dist')+1).join('/'); }

if (!existsSync(distDir)) {
  console.error('[asset-manifest-diff] dist directory missing at', distDir);
}
const files = existsSync(distDir) ? walk(distDir) : [];
const manifest = {};
for (const f of files){
  const st = statSync(f);
  // Compute compressed sizes for JS/CSS/HTML only (others typically not pre-compressed by CDN rules here)
  let gz, br;
  try {
    if (/\.(js|css|html)$/.test(f)) {
      const buf = readFileSync(f);
      gz = gzipSync(buf, { level: 9 }).length;
      br = brotliCompressSync(buf).length; // default brotli params (balanced)
    }
  } catch {}
  manifest[rel(f)] = { raw: st.size, gzip: gz ?? null, brotli: br ?? null };
}

let previous = {};
if (existsSync(snapshotPath)) {
  try { previous = JSON.parse(readFileSync(snapshotPath,'utf8')); } catch {}
}

function formatSize(bytes){
  if (bytes > 1024*1024) return (bytes/1024/1024).toFixed(2)+' MB';
  if (bytes > 1024) return (bytes/1024).toFixed(2)+' kB';
  return bytes + ' B';
}

const added = [];
const removed = [];
const changed = [];
for (const k of Object.keys(manifest)){
  if (!(k in previous)) added.push(k);
  else {
    const prevVal = previous[k];
    const curVal = manifest[k];
    // previous may have been plain number in older snapshot; normalize
    const prevRaw = typeof prevVal === 'number' ? prevVal : prevVal.raw;
    if (prevRaw !== curVal.raw) changed.push(k);
  }
}
for (const k of Object.keys(previous)){
  if (!(k in manifest)) removed.push(k);
}

function extractRaw(v){ return typeof v === 'number' ? v : v?.raw; }

const report = { summary: { totalFiles: Object.keys(manifest).length, added: added.length, removed: removed.length, changed: changed.length }, added, removed, changed: changed.map(k=>({ file: k, previous: extractRaw(previous[k]), current: extractRaw(manifest[k]), delta: extractRaw(manifest[k]) - extractRaw(previous[k]) })), manifest };

console.log(JSON.stringify(report,null,2));

if (process.argv.includes('--snapshot')) {
  writeFileSync(snapshotPath, JSON.stringify(manifest,null,2));
  console.log('[asset-manifest-diff] Snapshot updated at', snapshotPath);
}
