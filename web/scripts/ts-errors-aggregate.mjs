#!/usr/bin/env node
/**
 * ts-errors-aggregate.mjs
 * Runs `tsc -p <config> --noEmit` for each tsconfig.*.json in web/ and aggregates diagnostics by code.
 * Output: web/ts-errors-aggregate.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

let webDir = process.cwd();
if (path.basename(webDir) !== 'web') {
  const candidate = path.join(webDir, 'web');
  if (fs.existsSync(path.join(candidate, 'package.json'))) webDir = candidate;
}
const configs = fs.readdirSync(webDir).filter(f=>/^tsconfig.*\.json$/i.test(f));
const outPath = path.join(webDir, 'ts-errors-aggregate.json');

function run(cmd, cwd) {
  try { return execSync(cmd, { cwd, stdio:'pipe', encoding:'utf8' }); } catch (e) { return e.stdout || e.stderr || e.message; }
}

const agg = { generatedAt: new Date().toISOString(), configs: [], totalsByCode: {}, totalErrors:0 };
const codeRegex = /error TS(\d+):/g;

for (const cfg of configs) {
  const out = run(`npx tsc -p "${cfg}" --noEmit`, webDir);
  let match; const seen = {}; let errors=0;
  while ((match = codeRegex.exec(out)) !== null) {
    const code = match[1];
    errors++;
    agg.totalsByCode[code] = (agg.totalsByCode[code]||0)+1;
    seen[code] = (seen[code]||0)+1;
  }
  agg.totalErrors += errors;
  agg.configs.push({ config: cfg, errors, codes: seen });
}

agg.topCodes = Object.entries(agg.totalsByCode).map(([code,count])=>({code,count})).sort((a,b)=>b.count-a.count).slice(0,50);
fs.writeFileSync(outPath, JSON.stringify(agg,null,2));
console.log('TypeScript error aggregation written to', outPath);