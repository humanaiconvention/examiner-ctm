#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

function pctColor(p){
  if (p >= 90) return '#2e7d32'; // green
  if (p >= 80) return '#f9a825'; // amber
  return '#c62828'; // red
}

const root = process.cwd();
const summaryPath = path.join(root, 'web', 'coverage', 'coverage-summary.json');
let json;
try {
  json = JSON.parse(readFileSync(summaryPath,'utf8'));
} catch (e) {
  console.error('[coverage-badge] Unable to read coverage-summary.json at', summaryPath);
  process.exit(0); // non-fatal
}
const totals = json.total || {};
const metrics = ['lines','branches','functions','statements'];
const result = metrics.map(k=>({k,p: (totals[k]?.pct ?? 0)}));
const avg = result.reduce((a,b)=>a+b.p,0)/result.length || 0;
const color = pctColor(avg);
const label = 'coverage';
const value = avg.toFixed(1)+'%';

const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="20" role="img" aria-label="${label}: ${value}">
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <rect rx="3" width="120" height="20" fill="#555"/>
  <rect rx="3" x="60" width="60" height="20" fill="${color}"/>
  <path fill="${color}" d="M60 0h4v20h-4z"/>
  <rect rx="3" width="120" height="20" fill="url(#s)"/>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="30" y="14">${label}</text>
    <text x="89" y="14">${value}</text>
  </g>
</svg>`;

const outDir = path.join(root,'web','coverage');
mkdirSync(outDir,{recursive:true});
const outFile = path.join(outDir,'badge-coverage.svg');
writeFileSync(outFile, svg);
console.log('[coverage-badge] wrote', outFile);
