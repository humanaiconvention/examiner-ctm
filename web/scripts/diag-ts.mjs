#!/usr/bin/env node
/**
 * diag-ts.mjs
 * Performs deeper TypeScript diagnostics:
 *  1. Runs `tsc --noEmit` to capture errors.
 *  2. Runs `tsc --noEmit --listFiles` to enumerate included files.
 *  3. Extracts error codes & counts (TSxxxx) and outputs structured JSON.
 *  4. Optionally filters out glob patterns via env IGNORE_GLOBS (comma separated) before stats.
 *
 * Outputs:
 *  - web/ts-diagnostics.json { errorSummary: { total, byCode: {...} }, files: [...], filteredOut: [...], generatedAt }
 *  - Non-zero exit code if errors present unless ALLOW_TS_ERRORS=true.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
// Ensure we always write to web/ts-diagnostics.json even if run from web/ already.
let outPath = path.join(root, 'web', 'ts-diagnostics.json');
if (root.replace(/\\/g,'/').endsWith('/web')) {
  outPath = path.join(root, 'ts-diagnostics.json');
}

function run(cmd) {
  try {
    return execSync(cmd, { stdio: 'pipe', encoding: 'utf-8' });
  } catch (e) {
    return e.stdout?.toString() + e.stderr?.toString();
  }
}

const ignoreGlobs = (process.env.IGNORE_GLOBS || '').split(',').map(s => s.trim()).filter(Boolean);

const baseCmd = 'npx tsc --noEmit';
const listCmd = baseCmd + ' --listFiles';

const errorOutput = run(baseCmd + ' 2>&1');
const listOutput = run(listCmd + ' 2>&1');

// Parse files: lines that look like absolute paths and end with .ts/.tsx/.d.ts
const fileLines = listOutput.split(/\r?\n/).filter(l => /\.(ts|tsx|d\.ts)$/.test(l));

let filteredOut = [];
let files = fileLines.filter(f => {
  const drop = ignoreGlobs.some(g => {
    if (!g) return false;
    // Very naive glob: treat ** as substring and * as wildcard for a single segment
    const pattern = g.replace(/[-/\\^$+?.()|{}]/g,'\\$&').replace(/\\\*\*/g,'.*').replace(/\\\*/g,'[^/]*');
    return new RegExp('^' + pattern + '$').test(f.replace(/\\/g,'/'));
  });
  if (drop) filteredOut.push(f); else return true;
});

// Extract TS error codes
const codeRegex = /error\s+(TS\d{3,5})/g;
let match; const byCode = {}; let total=0;
while ((match = codeRegex.exec(errorOutput)) !== null) {
  total++;
  const code = match[1];
  byCode[code] = (byCode[code]||0)+1;
}

const summary = { total, byCode };
const payload = { schema:1, generatedAt: new Date().toISOString(), errorSummary: summary, files, filteredOut, ignoreGlobs };
fs.writeFileSync(outPath, JSON.stringify(payload,null,2));
console.log('TypeScript diagnostics written to', outPath, 'Total errors:', total);
if (total > 0 && process.env.ALLOW_TS_ERRORS !== 'true') {
  process.exit(2);
}
