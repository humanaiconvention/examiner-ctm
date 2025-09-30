#!/usr/bin/env node
/**
 * ts-show-config.mjs
 * Collects diagnostic information for each tsconfig.*.json in the web directory:
 *  - tsc --showConfig (parsed) summary (compilerOptions, include/exclude, references) truncated
 *  - tsc --project <config> --listFiles (captured file list)
 *  - Hash of file list for quick diffing
 * Output: web/ts-show-config.json
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

// Resolve web directory whether running from repo root or already inside web
let webDir = process.cwd();
if (path.basename(webDir) !== 'web') {
  const candidate = path.join(webDir, 'web');
  if (fs.existsSync(path.join(candidate, 'package.json'))) {
    webDir = candidate;
  }
}
const configs = fs.readdirSync(webDir).filter(f=>/^tsconfig.*\.json$/i.test(f));
const outPath = path.join(webDir, 'ts-show-config.json');

function run(cmd, cwd) {
  try { return execSync(cmd, { cwd, stdio:'pipe', encoding:'utf8' }); } catch (e) { return e.stdout || e.stderr || e.message; }
}
function hash(arr){ return crypto.createHash('sha256').update(arr.join('\n')).digest('hex').slice(0,16); }

const result = { generatedAt: new Date().toISOString(), configs: [] };
for (const cfg of configs) {
  const full = path.join(webDir, cfg);
  const showRaw = run(`npx tsc --showConfig -p "${full}"`, webDir);
  let showParsed = null;
  try { showParsed = JSON.parse(showRaw); } catch { /* keep raw */ }
  const listRaw = run(`npx tsc -p "${full}" --listFiles --noEmit`, webDir);
  const files = listRaw.split(/\r?\n/).filter(l=>/\.(tsx?|jsx?)$/i.test(l.trim()));
  result.configs.push({
    config: cfg,
    compilerOptions: showParsed?.compilerOptions || null,
    references: showParsed?.references || null,
    include: showParsed?.include || null,
    exclude: showParsed?.exclude || null,
    fileCount: files.length,
    fileHash: hash(files),
    files: files.slice(0,200),
    filesTruncated: files.length>200
  });
}

fs.writeFileSync(outPath, JSON.stringify(result,null,2));
console.log('TypeScript showConfig diagnostics written to', outPath);