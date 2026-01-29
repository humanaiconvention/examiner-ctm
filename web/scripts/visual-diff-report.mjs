#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import path from 'node:path';

// Default overall threshold (1%) unless overridden
const GLOBAL_THRESHOLD = parseFloat(process.env.VISUAL_DIFF_MAX || '0.01');
// Optional JSON mapping: { "home-full.png": 0.015, "hero.png": 0.008 }
let perFile = {};
try {
  if (process.env.VISUAL_DIFF_FILE_THRESHOLDS) {
    perFile = JSON.parse(process.env.VISUAL_DIFF_FILE_THRESHOLDS);
  }
} catch (e) {
  console.warn('Could not parse VISUAL_DIFF_FILE_THRESHOLDS JSON:', e.message);
}

const currentDir = 'tests/visual.spec.ts-snapshots';
const previousDir = 'previous-snapshots'; // Expect CI to place prior run here if available
if (!existsSync(currentDir)) {
  console.error('Snapshot directory not found:', currentDir);
  process.exit(0);
}

// Ensure diff output folder
mkdirSync('visual-diff', { recursive: true });

const currentFiles = readdirSync(currentDir).filter(f => f.endsWith('.png') && !f.endsWith('.diff.png'));
let worst = 0;
const results = [];

function readPng(p) {
  return PNG.sync.read(readFileSync(p));
}

for (const file of currentFiles) {
  const curPath = path.join(currentDir, file);
  let baseImg;
  let mode = 'self';
  if (existsSync(previousDir)) {
    const prevPath = path.join(previousDir, file);
    if (existsSync(prevPath)) {
      try { baseImg = readPng(prevPath); mode = 'historical'; } catch { /* fall back */ }
    }
  }
  if (!baseImg) {
    // Use current as baseline (first run scenario) -> diff ratio 0
    baseImg = readPng(curPath);
  }
  const curImg = readPng(curPath);
  if (baseImg.width !== curImg.width || baseImg.height !== curImg.height) {
    console.warn(`Dimension mismatch for ${file} (baseline ${baseImg.width}x${baseImg.height} vs current ${curImg.width}x${curImg.height})`);
  }
  const w = Math.min(baseImg.width, curImg.width);
  const h = Math.min(baseImg.height, curImg.height);
  const diffPng = new PNG({ width: w, height: h });
  const diffPixels = pixelmatch(baseImg.data, curImg.data, diffPng.data, w, h, { threshold: 0.1 });
  const diffRatio = diffPixels / (w * h);
  const threshold = perFile[file] != null ? perFile[file] : GLOBAL_THRESHOLD;
  if (diffRatio > worst) worst = diffRatio;
  results.push({ file, diffRatio, threshold, mode });
  writeFileSync(path.join('visual-diff', file.replace('.png', '.diff.png')), PNG.sync.write(diffPng));
}

const summary = { generatedAt: new Date().toISOString(), maxDiffRatio: worst, globalThreshold: GLOBAL_THRESHOLD, results };
writeFileSync('visual-diff-summary.json', JSON.stringify(summary, null, 2));
console.log('visual-diff-summary.json written (maxDiffRatio=' + worst.toFixed(4) + ')');

// Determine failure: any file exceeding its threshold
const failing = results.filter(r => r.diffRatio > r.threshold);
if (failing.length) {
  console.error('Visual diff threshold exceeded for files:', failing.map(f => `${f.file}(${(f.diffRatio*100).toFixed(2)}% > ${(f.threshold*100).toFixed(2)}%)`).join(', '));
  process.exit(1);
}