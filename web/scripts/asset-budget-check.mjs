#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// Enforce size budgets for primary JS bundle.
// Usage: node scripts/asset-budget-check.mjs --maxRawKB 250 --maxGzipKB 80 --maxIncreaseKB 10
// Looks at latest dist main index-*.js and compares to snapshot (.asset-manifest.json) if available.

const args = process.argv.slice(2);
function arg(name, fallback){
  const i = args.indexOf(`--${name}`);
  if (i !== -1 && args[i+1]) return args[i+1];
  return fallback;
}
const maxRawKB = Number(arg('maxRawKB', 250));
const maxGzipKB = Number(arg('maxGzipKB', 80));
const maxIncreaseKB = Number(arg('maxIncreaseKB', 12));

const webDir = path.resolve(process.cwd(), 'web');
const manifestPath = path.join(webDir, '.asset-manifest.json');
if (!existsSync(manifestPath)) {
  console.warn('[asset-budget] No snapshot manifest present at', manifestPath, '-> skipping (pass).');
  process.exit(0);
}
const manifest = JSON.parse(readFileSync(manifestPath,'utf8'));

// Find main index js (pick largest index-*.js)
const jsEntries = Object.entries(manifest).filter(([k]) => k.startsWith('assets/index-') && k.endsWith('.js'));
if (!jsEntries.length) {
  console.warn('[asset-budget] No main index js entries found in manifest');
  process.exit(0);
}
// Each value may be number (legacy) or object
function rawSize(v){ return typeof v === 'number' ? v : v.raw; }
function gzipSize(v){ return typeof v === 'object' ? v.gzip : null; }
const sorted = jsEntries.sort((a,b)=> rawSize(b[1]) - rawSize(a[1]));
const [mainFile, meta] = sorted[0];

const rawKB = rawSize(meta)/1024;
const gzipKB = gzipSize(meta) ? gzipSize(meta)/1024 : null;

let previousRawKB = null;
let previousGzipKB = null;
// populate from a previousSnapshot if we store history later; for now, treat snapshot as previous base.
previousRawKB = rawKB; // placeholder (no diff tracking yet)
previousGzipKB = gzipKB;

const failures = [];
if (rawKB > maxRawKB) failures.push(`Raw size ${rawKB.toFixed(2)}kB exceeds maxRawKB ${maxRawKB}kB`);
if (gzipKB && gzipKB > maxGzipKB) failures.push(`Gzip size ${gzipKB.toFixed(2)}kB exceeds maxGzipKB ${maxGzipKB}kB`);
// Without a historical baseline distinct from snapshot we cannot compute increase; future extension would load a prior artifact.

if (failures.length){
  console.error('[asset-budget] FAIL for', mainFile); failures.forEach(f=>console.error(' -', f));
  process.exit(1);
}
console.log(`[asset-budget] PASS main=${mainFile} raw=${rawKB.toFixed(2)}kB gzip=${gzipKB? gzipKB.toFixed(2)+'kB':'n/a'}`);
