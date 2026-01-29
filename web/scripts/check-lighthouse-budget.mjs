#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';

const MIN_PERF = parseInt(process.env.LH_MIN_PERF || '85', 10);

const manifestPath = 'web/.lighthouseci/manifest.json';
if (!existsSync(manifestPath)) {
  console.log('No Lighthouse manifest found (skipping budget check).');
  process.exit(0);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
if (!Array.isArray(manifest) || !manifest.length) {
  console.error('Invalid Lighthouse manifest.');
  process.exit(1);
}
const first = manifest[0];
const lhr = JSON.parse(readFileSync(first.jsonPath, 'utf-8'));
const perfScore = Math.round((lhr.categories.performance.score || 0) * 100);
console.log(`Lighthouse Performance Score: ${perfScore}`);
if (perfScore < MIN_PERF) {
  console.error(`Performance score ${perfScore} < minimum ${MIN_PERF}`);
  process.exit(1);
}
console.log('Performance budget met.');
