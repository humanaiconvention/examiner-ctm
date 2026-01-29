#!/usr/bin/env node
/**
 * eslint-compare.mjs
 * Detect differences between ESLint config & lint results when run from repo root vs inside `web`.
 * Features:
 *  - --simulate-root : Temporarily hide web/eslint.config.* for root pass
 *  - Rule severity + option hashing diff
 *  - Markdown summary output
 *  - --lint : Run ESLint over a sampled file set in both contexts and diff messages
 *  - Strict exit with ESLINT_COMPARE_STRICT=1 if any differences
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

// --- Argument parsing & paths -------------------------------------------------
const args = process.argv.slice(2);
const flagSimulateRoot = args.includes('--simulate-root');
const flagLint = args.includes('--lint');

let cwd = process.cwd();
let repoRoot = cwd;
if (path.basename(cwd) === 'web' && fs.existsSync(path.join(cwd, 'package.json'))) {
  const parent = path.dirname(cwd);
  if (fs.existsSync(path.join(parent, 'LICENSE')) || fs.existsSync(path.join(parent, 'README.md'))) repoRoot = parent;
}
const webDir = path.join(repoRoot, 'web');
const outJSON = path.join(webDir, 'eslint-config-diff.json');
const outMD = path.join(webDir, 'eslint-config-diff.md');
const outLintJSON = path.join(webDir, 'eslint-lint-diff.json');

// --- Helpers ------------------------------------------------------------------
function findDefaultFile() {
  const primary = path.join(webDir, 'src', 'App.tsx');
  if (fs.existsSync(primary)) return primary;
  const srcDir = path.join(webDir, 'src');
  if (!fs.existsSync(srcDir)) throw new Error('Missing web/src for default file discovery');
  const stack = [srcDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (/\.(tsx?|jsx?)$/.test(e.name)) return p;
    }
  }
  throw new Error('No source file found to use for --print-config');
}
const targetFile = process.env.ESLINT_COMPARE_FILE ? path.resolve(process.env.ESLINT_COMPARE_FILE) : findDefaultFile();

const eslintBin = (() => {
  const base = path.join(webDir, 'node_modules', '.bin');
  const fn = process.platform === 'win32' ? 'eslint.cmd' : 'eslint';
  const full = path.join(base, fn);
  if (!fs.existsSync(full)) { console.error('Missing eslint binary at', full); process.exit(2); }
  return full;
})();

function normSeverity(v) {
  if (v == null) return 0;
  if (Array.isArray(v)) return normSeverity(v[0]);
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return ({off:0,warn:1,error:2})[v] ?? 0;
  return 0;
}
function extractRules(cfg) { return cfg?.rules || {}; }
function stableHash(obj) { return crypto.createHash('sha256').update(JSON.stringify(obj, Object.keys(obj||{}).sort())).digest('hex').slice(0,16); }

function runPrintConfig(cwd, label) {
  try {
    const cmd = `"${eslintBin}" --print-config "${targetFile}"`;
    const out = execSync(cmd, { cwd, stdio: 'pipe', encoding: 'utf8' });
    return JSON.parse(out);
  } catch (e) {
    const stderr = (e.stderr||'').toString();
    if (/couldn['’]t find an eslint\.config/i.test(stderr)) {
      console.warn(`[${label}] No eslint.config.* found; treating as empty rules.`);
      return { rules: {} };
    }
    throw e;
  }
}

// --- Optional simulate-root ---------------------------------------------------
let renamed = null;
function hideConfig() {
  for (const name of ['eslint.config.js','eslint.config.mjs','eslint.config.cjs']) {
    const full = path.join(webDir, name);
    if (fs.existsSync(full)) {
      const tmp = full + '.__hidden__';
      fs.renameSync(full, tmp);
      renamed = { original: full, tmp };
      console.log('[simulate-root] Hid', name);
      return true;
    }
  }
  console.warn('[simulate-root] No config file to hide.');
  return false;
}
function restoreConfig() {
  if (renamed && fs.existsSync(renamed.tmp)) {
    fs.renameSync(renamed.tmp, renamed.original);
    console.log('[simulate-root] Restored config');
  }
  renamed = null;
}

console.log('Target file:', path.relative(repoRoot, targetFile));
if (flagSimulateRoot) hideConfig();
const rootCfg = runPrintConfig(repoRoot, 'root');
if (flagSimulateRoot) restoreConfig();
const webCfg  = runPrintConfig(webDir, 'web');

// --- Rule diff ----------------------------------------------------------------
const rootRules = extractRules(rootCfg);
const webRules  = extractRules(webCfg);
const allNames = new Set([...Object.keys(rootRules), ...Object.keys(webRules)]);
const severityDiff = []; const onlyRoot = []; const onlyWeb = []; const optionDiff = [];
for (const rule of allNames) {
  const r = rootRules[rule]; const w = webRules[rule];
  if (r == null && w != null) { onlyWeb.push(rule); continue; }
  if (w == null && r != null) { onlyRoot.push(rule); continue; }
  const rs = normSeverity(r); const ws = normSeverity(w);
  if (rs !== ws) { severityDiff.push({ rule, root: r, web: w, rootSeverity: rs, webSeverity: ws }); continue; }
  // Option diff (ignore first severity element if array)
  const norm = val => Array.isArray(val) && (typeof val[0] === 'string' || typeof val[0] === 'number') ? val.slice(1) : val;
  const rn = norm(r); const wn = norm(w);
  if (rn && wn) {
    const rh = stableHash(rn); const wh = stableHash(wn);
    if (rh !== wh) optionDiff.push({ rule, rootHash: rh, webHash: wh, root: rn, web: wn });
  }
}
severityDiff.sort((a,b)=>a.rule.localeCompare(b.rule));
onlyRoot.sort(); onlyWeb.sort(); optionDiff.sort((a,b)=>a.rule.localeCompare(b.rule));

// --- Lint diff (optional) -----------------------------------------------------
let lintSummary = null; let lintDetail = null;
if (flagLint) {
  console.log('[lint] Collecting file sample...');
  const srcDir = path.join(webDir, 'src');
  const files = [];
  const stack = [srcDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p); else if (/\.(tsx?|jsx?)$/.test(e.name)) files.push(p);
    }
  }
  files.sort();
  const sample = files.slice(0, 200);
  function runLint(cwd,label) {
    try {
      const cmd = `"${eslintBin}" -f json ${sample.map(f=>`"${f}"`).join(' ')}`;
      return JSON.parse(execSync(cmd, { cwd, stdio:'pipe', encoding:'utf8' }));
    } catch (e) { console.warn(`[lint] Failed in ${label}:`, e.message); return []; }
  }
  // Re-simulate hidden config for root lint if requested
  if (flagSimulateRoot) hideConfig();
  const lintRoot = runLint(repoRoot,'root');
  if (flagSimulateRoot) restoreConfig();
  const lintWeb  = runLint(webDir,'web');

  function flatten(arr,label){ const out=[]; for (const file of arr) for (const m of file.messages) out.push({label,file:file.filePath,ruleId:m.ruleId||'',severity:m.severity,message:m.message,line:m.line,column:m.column}); return out; }
  const rootMsgs = flatten(lintRoot,'root');
  const webMsgs  = flatten(lintWeb,'web');
  const key = m=>`${m.file}:${m.line}:${m.column}:${m.ruleId}:${m.message}`;
  const rMap=new Map(rootMsgs.map(m=>[key(m),m])); const wMap=new Map(webMsgs.map(m=>[key(m),m]));
  const onlyRootMsgs=[]; const onlyWebMsgs=[];
  for (const [k,v] of rMap) if (!wMap.has(k)) onlyRootMsgs.push(v);
  for (const [k,v] of wMap) if (!rMap.has(k)) onlyWebMsgs.push(v);
  lintDetail = { sampleCount: sample.length, rootMessageCount: rootMsgs.length, webMessageCount: webMsgs.length, onlyRoot: onlyRootMsgs, onlyWeb: onlyWebMsgs };
  fs.writeFileSync(outLintJSON, JSON.stringify(lintDetail,null,2));
  lintSummary = { sampleCount: sample.length, rootMessageCount: rootMsgs.length, webMessageCount: webMsgs.length, onlyRoot: onlyRootMsgs.length, onlyWeb: onlyWebMsgs.length };
}

// --- Assemble report ----------------------------------------------------------
const report = {
  schema: 2,
  generatedAt: new Date().toISOString(),
  targetFile: path.relative(repoRoot, targetFile),
  flags: { simulateRoot: flagSimulateRoot, lint: flagLint },
  counts: {
    totalRulesRoot: Object.keys(rootRules).length,
    totalRulesWeb: Object.keys(webRules).length,
    severityDifferences: severityDiff.length,
    optionDifferences: optionDiff.length,
    onlyInRoot: onlyRoot.length,
    onlyInWeb: onlyWeb.length,
    lintOnlyRoot: lintSummary?.onlyRoot ?? 0,
    lintOnlyWeb: lintSummary?.onlyWeb ?? 0
  },
  severityDifferences: severityDiff,
  optionDifferences: optionDiff,
  onlyInRoot: onlyRoot,
  onlyInWeb: onlyWeb,
  lintDiff: lintSummary || null
};
fs.writeFileSync(outJSON, JSON.stringify(report,null,2));

// --- Markdown -----------------------------------------------------------------
const md = [];
md.push('# ESLint Config Diff');
md.push('');
md.push(`Generated: ${report.generatedAt}`);
md.push(`Target file: \`${report.targetFile}\``);
md.push('');
md.push('| Metric | Value |');
md.push('|--------|-------|');
for (const [k,v] of Object.entries(report.counts)) md.push(`| ${k} | ${v} |`);
md.push('');
if (severityDiff.length) { md.push('## Severity Differences'); md.push('| Rule | Root | Web |'); md.push('|------|------|-----|'); for (const d of severityDiff.slice(0,50)) md.push(`| ${d.rule} | ${JSON.stringify(d.root)} | ${JSON.stringify(d.web)} |`); if (severityDiff.length>50) md.push(`… ${severityDiff.length-50} more`); md.push(''); }
if (optionDiff.length) { md.push('## Option Differences'); md.push('| Rule | Root Hash | Web Hash |'); md.push('|------|-----------|----------|'); for (const d of optionDiff.slice(0,50)) md.push(`| ${d.rule} | ${d.rootHash} | ${d.webHash} |`); if (optionDiff.length>50) md.push(`… ${optionDiff.length-50} more`); md.push(''); }
if (onlyRoot.length) { md.push('## Rules Only In Root'); md.push(onlyRoot.slice(0,100).map(r=>`- ${r}`).join('\n')); if (onlyRoot.length>100) md.push(`… ${onlyRoot.length-100} more`); md.push(''); }
if (onlyWeb.length) { md.push('## Rules Only In Web'); md.push(onlyWeb.slice(0,100).map(r=>`- ${r}`).join('\n')); if (onlyWeb.length>100) md.push(`… ${onlyWeb.length-100} more`); md.push(''); }
if (lintSummary) { md.push('## Lint Message Diff'); md.push(`Sample files: ${lintSummary.sampleCount}`); md.push(`Root messages: ${lintSummary.rootMessageCount}`); md.push(`Web messages: ${lintSummary.webMessageCount}`); md.push(`Only root msgs: ${lintSummary.onlyRoot}`); md.push(`Only web msgs: ${lintSummary.onlyWeb}`); md.push(''); }
fs.writeFileSync(outMD, md.join('\n'));

console.log('Config diff JSON:', path.relative(repoRoot, outJSON));
console.log('Markdown summary:', path.relative(repoRoot, outMD));
if (lintDetail) console.log('Lint diff JSON:', path.relative(repoRoot, outLintJSON));

const hasDiff = report.counts.severityDifferences || report.counts.optionDifferences || report.counts.onlyInRoot || report.counts.onlyInWeb || report.counts.lintOnlyRoot || report.counts.lintOnlyWeb;
if (process.env.ESLINT_COMPARE_STRICT === '1' && hasDiff) { console.error('Differences detected (strict mode).'); process.exit(1); }

console.log('Done.');