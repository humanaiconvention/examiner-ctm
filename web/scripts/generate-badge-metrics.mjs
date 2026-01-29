#!/usr/bin/env node
import { readFileSync, existsSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

// This script expects a built dist and optional lighthouse manifest.
const distDir = resolve(process.cwd(), 'dist');
if (!existsSync(distDir)) {
  console.error('dist not found. Run build first.');
  process.exit(1);
}

let totalJsCss = 0;
let mainBundle = 0;
let vendorReactBundle = 0;
let vendorOtherBundle = 0;
let entryScripts = [];
const jsSizes = new Map();

try {
  const html = readFileSync(resolve(distDir, 'index.html'), 'utf-8');
  const scriptRegex = /<script[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi;
  let m;
  while ((m = scriptRegex.exec(html)) !== null) entryScripts.push(m[1].replace(/^\//, ''));
} catch {}

function walk(p) {
  for (const f of readdirSync(p)) {
    const full = resolve(p, f);
    const s = statSync(full);
    if (s.isDirectory()) walk(full); else if (s.isFile()) {
      const lower = f.toLowerCase();
      if (/(\.js|\.css)$/.test(lower)) {
        totalJsCss += s.size;
        if (lower.endsWith('.js')) {
          const rel = full.substring(distDir.length + 1).replace(/\\/g, '/');
            jsSizes.set(rel, s.size);
            if (/vendor-react/.test(lower)) vendorReactBundle += s.size;
            else if (/vendor|vendors/.test(lower)) vendorOtherBundle += s.size;
        }
      }
    }
  }
}
walk(distDir);

if (entryScripts.length) {
  for (const ref of entryScripts) {
    for (const [rel, size] of jsSizes.entries()) {
      if (rel.endsWith(ref)) mainBundle += size;
    }
  }
} else {
  // fallback largest non-vendor
  let largestSize = 0;
  for (const [rel, size] of jsSizes.entries()) {
    if (/vendor|vendors/i.test(rel)) continue; if (size > largestSize) { largestSize = size; }
  }
  mainBundle = largestSize;
}

// Lighthouse performance
let perfScore = null;
try {
  const manifest = JSON.parse(readFileSync('.lighthouseci/manifest.json', 'utf-8'));
  if (Array.isArray(manifest) && manifest.length) {
    const lhr = JSON.parse(readFileSync(manifest[0].jsonPath, 'utf-8'));
    perfScore = Math.round(lhr.categories.performance.score * 100);
  }
} catch {}

// Perf marks (optional)
let worstSectionMs = null;
try {
  if (existsSync('perf-marks.json')) {
    const perfMarks = JSON.parse(readFileSync('perf-marks.json','utf-8'));
    const sections = perfMarks.sections || {};
    const values = Object.values(sections).filter(v => typeof v === 'number');
    if (values.length) worstSectionMs = Math.max(...values);
  }
} catch {}

const toKb = b => +(b/1024).toFixed(1);
const data = {
  generatedAt: new Date().toISOString(),
  totalKb: toKb(totalJsCss),
  mainKb: toKb(mainBundle),
  vendorReactKb: toKb(vendorReactBundle),
  vendorOtherKb: toKb(vendorOtherBundle),
  performance: perfScore,
  worstSectionMs
};

writeFileSync('badge-metrics.json', JSON.stringify(data, null, 2));
console.log('badge-metrics.json written:', data);
