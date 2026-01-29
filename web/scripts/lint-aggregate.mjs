#!/usr/bin/env node
/**
 * lint-aggregate.mjs
 * Reads ESLint JSON report (default web/eslint-report-all.json) and produces summary:
 *  - total errors, warnings
 *  - per-rule counts with fixable breakdown
 *  - top N files by issue count
 *  - fixable vs non-fixable percentages
 * Output: web/eslint-aggregate.json
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportPath = process.env.ESLINT_REPORT || path.join(root, 'web', 'eslint-report-all.json');
const outPath = path.join(root, 'web', 'eslint-aggregate.json');

function readJSON(p) { try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch { return null; } }

const data = readJSON(reportPath);
if (!data) {
  console.error('No ESLint report found at', reportPath);
  process.exit(1);
}

let totalErrors=0, totalWarnings=0, fixErr=0, fixWarn=0;
const ruleMap = new Map(); // ruleId -> {errors,warnings,fixableErrors,fixableWarnings}
const fileStats = [];

for (const file of data) {
  const { filePath, errorCount, warningCount, fixableErrorCount, fixableWarningCount, messages } = file;
  totalErrors += errorCount; totalWarnings += warningCount;
  fixErr += fixableErrorCount; fixWarn += fixableWarningCount;
  fileStats.push({ file: filePath, errors: errorCount, warnings: warningCount, total: errorCount + warningCount });
  for (const m of messages) {
    const id = m.ruleId || '<<fatal>>';
    let r = ruleMap.get(id);
    if (!r) { r = { errors:0, warnings:0, fixableErrors:0, fixableWarnings:0 }; ruleMap.set(id,r); }
    if (m.severity === 2) r.errors++; else if (m.severity === 1) r.warnings++;
    if (m.fix) {
      if (m.severity === 2) r.fixableErrors++; else if (m.severity === 1) r.fixableWarnings++;
    }
  }
}

const perRule = [...ruleMap.entries()].map(([rule, stats]) => ({ rule, ...stats, total: stats.errors + stats.warnings })).sort((a,b)=>b.total-a.total);
fileStats.sort((a,b)=>b.total-a.total);

const summary = {
  schema:1,
  generatedAt: new Date().toISOString(),
  totals: { errors: totalErrors, warnings: totalWarnings, fixableErrors: fixErr, fixableWarnings: fixWarn },
  fixablePercent: (totalErrors+totalWarnings) ? ((fixErr+fixWarn)/(totalErrors+totalWarnings))*100 : 0,
  topRules: perRule.slice(0,20),
  topFiles: fileStats.slice(0,20)
};

fs.writeFileSync(outPath, JSON.stringify(summary,null,2));
console.log('ESLint aggregate written to', outPath);
if ((totalErrors+totalWarnings) === 0) console.log('No issues detected in aggregate input.');
