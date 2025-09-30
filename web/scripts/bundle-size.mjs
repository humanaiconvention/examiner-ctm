#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

// Simple bundle size manifest & enforcement
// Modes:
//  - manifest: produce manifest json of dist file sizes
//  - check: compare current manifest against baseline (env SIZE_BASELINE or previously committed manifest)
// Threshold strategy: per-file max increase + total budget.

// IMPORTANT: This script is expected to run with CWD = web/ (see workflow). So dist is ./dist
const DIST_DIR = path.resolve('dist');
const MANIFEST_PATH = path.resolve('dist-size-manifest.json');

async function gatherFiles(dir) {
  const out = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        out.push(...await gatherFiles(full));
      } else {
        // Ignore source maps in size manifest (still enforce per-file limit later if desired?)
        const stat = await fs.stat(full);
        out.push({ file: path.relative(DIST_DIR, full).replace(/\\/g, '/'), bytes: stat.size });
      }
    }
  } catch (e) {
    console.error(`Failed to read dist directory '${dir}':`, e.message);
  }
  return out;
}

async function writeManifest(files) {
  const total = files.reduce((a, f) => a + f.bytes, 0);
  const manifest = { generatedAt: new Date().toISOString(), totalBytes: total, files: files.sort((a,b)=>b.bytes-a.bytes) };
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log('Wrote manifest', MANIFEST_PATH, 'Total bytes:', total);
}

async function check(files) {
  const baselinePath = process.env.SIZE_BASELINE || MANIFEST_PATH; // default compare to previous commit's manifest if present
  let baseline = null;
  try { baseline = JSON.parse(await fs.readFile(baselinePath, 'utf-8')); } catch {}
  const currentTotal = files.reduce((a, f) => a + f.bytes, 0);
  const totalBudget = parseInt(process.env.SIZE_TOTAL_BUDGET || '550000', 10); // ~550 KB default
  const maxDelta = parseInt(process.env.SIZE_MAX_DELTA || '30000', 10); // 30 KB total growth cap
  let errors = [];
  if (baseline) {
    const totalDelta = currentTotal - (baseline.totalBytes || 0);
    if (totalDelta > maxDelta) {
      errors.push(`Total bundle size grew by ${totalDelta} bytes (> ${maxDelta}).`);
    }
  }
  if (currentTotal > totalBudget) {
    errors.push(`Current total ${currentTotal} exceeds budget ${totalBudget}.`);
  }
  // Per-file heuristic: >150KB single asset unless map or license.
  for (const f of files) {
    if (!/\.(map|txt|json)$/i.test(f.file) && f.bytes > 150000) {
      errors.push(`File ${f.file} is ${f.bytes} bytes (> 150000).`);
    }
  }
  if (errors.length) {
    console.error('Bundle size check FAILED');
    for (const e of errors) console.error(' -', e);
    // Emit machine-readable summary
    await fs.writeFile('web/bundle-size-result.json', JSON.stringify({ ok: false, errors }, null, 2));
    process.exit(1);
  } else {
    console.log('Bundle size within limits. Total:', currentTotal);
    await fs.writeFile('web/bundle-size-result.json', JSON.stringify({ ok: true, totalBytes: currentTotal }, null, 2));
  }
}

async function main() {
  const mode = process.argv[2];
  const files = await gatherFiles(DIST_DIR);
  if (mode === 'manifest') {
    await writeManifest(files);
  } else if (mode === 'check') {
    await check(files);
  } else {
    console.error('Usage: node bundle-size.mjs <manifest|check>');
    process.exit(2);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
