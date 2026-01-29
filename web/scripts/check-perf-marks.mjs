#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';

const MAX_WORST = parseFloat(process.env.MAX_WORST_SECTION_MS || '1600'); // default 1.6s
const MAX_HERO = parseFloat(process.env.MAX_HERO_MS || '900'); // default 0.9s
if (!existsSync('perf-marks.json')) {
  console.warn('perf-marks.json not found; skipping perf mark governance');
  process.exit(0);
}

let data;
try { data = JSON.parse(readFileSync('perf-marks.json','utf-8')); } catch (e) {
  console.error('Could not parse perf-marks.json:', e.message);
  process.exit(1);
}

const sections = data.sections || {};
const values = Object.values(sections).filter(v => typeof v === 'number');
const hero = typeof data.heroMounted === 'number' ? data.heroMounted : null;

if (!values.length && hero == null) {
  console.warn('No performance marks present; skipping');
  process.exit(0);
}

let failed = false;
if (hero != null) {
  console.log(`Hero mount: ${hero.toFixed(0)}ms (limit ${MAX_HERO}ms)`);
  if (hero > MAX_HERO) {
    console.error(`FAIL: hero mount ${hero.toFixed(0)}ms exceeds limit ${MAX_HERO}ms`);
    failed = true;
  }
}

if (values.length) {
  const worst = Math.max(...values);
  console.log(`Worst section mount: ${worst.toFixed(0)}ms (limit ${MAX_WORST}ms)`);
  if (worst > MAX_WORST) {
    console.error(`FAIL: worst section mount ${worst.toFixed(0)}ms exceeds limit ${MAX_WORST}ms`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('PASS: Performance marks within limits');
