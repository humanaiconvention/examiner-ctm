#!/usr/bin/env node
/**
 * eslint-env-scan.mjs
 * Scans ancestor directories (up to drive root) for potential ESLint config files.
 * Also runs a debug lint of a target file capturing which config is loaded.
 * Output: web/eslint-env-scan.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

let webDir = process.cwd();
if (path.basename(webDir) !== 'web') {
  const candidate = path.join(webDir, 'web');
  if (fs.existsSync(path.join(candidate, 'package.json'))) webDir = candidate;
}
const repoRoot = path.dirname(webDir);
const outPath = path.join(webDir, 'eslint-env-scan.json');
const target = process.env.ESLINT_SCAN_FILE || path.join(webDir, 'src', 'App.tsx');
const configNames = [
  '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.mjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml',
  'eslint.config.js','eslint.config.mjs','eslint.config.cjs'
];

function findAncestorConfigs(start) {
  const found = [];
  let cur = path.resolve(start);
  while (true) {
    for (const name of configNames) {
      const full = path.join(cur, name);
      if (fs.existsSync(full)) {
        found.push(full);
      }
    }
    const parent = path.dirname(cur);
    if (parent === cur) break; // reached root
    cur = parent;
  }
  return found;
}

function runDebug() {
  try {
    const cmd = `npx eslint --debug "${target}"`;
    return execSync(cmd, { cwd: webDir, stdio: 'pipe', encoding: 'utf8' });
  } catch (e) {
    return (e.stdout || '') + '\n' + (e.stderr || '');
  }
}

const ancestorConfigs = findAncestorConfigs(webDir);
const debugOut = runDebug();
const snippet = debugOut.split(/\r?\n/).slice(0,400); // limit size

const result = {
  generatedAt: new Date().toISOString(),
  targetFile: target,
  ancestorConfigs,
  debugFirst400: snippet,
  debugLineCount: debugOut.split(/\r?\n/).length
};

fs.writeFileSync(outPath, JSON.stringify(result,null,2));
console.log('ESLint environment scan written to', outPath);