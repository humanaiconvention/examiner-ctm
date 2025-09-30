#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Usage: node scripts/coverage-delta.mjs --base <pathToBaselineCoverageSummary.json>
// Outputs JSON with per-metric { previous, current, delta } and overall averageDelta.

const args = process.argv.slice(2);
let basePath;
for (let i=0;i<args.length;i++){
  if (args[i] === '--base') basePath = args[i+1];
}

const root = process.cwd();
const currentPath = path.join(root,'web','coverage','coverage-summary.json');
function safeRead(p){
  try { return JSON.parse(readFileSync(p,'utf8')); } catch { return null; }
}
const base = basePath ? safeRead(basePath) : null;
const cur = safeRead(currentPath);
if(!cur){
  console.error('[coverage-delta] current coverage summary missing at', currentPath);
  process.exit(0);
}
const metrics = ['lines','branches','functions','statements'];
const out = {};
let sumDelta = 0; let count=0;
for (const m of metrics){
  const prev = base?.total?.[m]?.pct ?? null;
  const curr = cur.total?.[m]?.pct ?? 0;
  const delta = prev == null ? null : +(curr - prev).toFixed(2);
  if (delta != null){ sumDelta += delta; count++; }
  out[m] = { previous: prev, current: curr, delta };
}
const avgDelta = count ? +(sumDelta / count).toFixed(2) : null;
const result = { metrics: out, averageDelta: avgDelta };
console.log(JSON.stringify(result,null,2));
