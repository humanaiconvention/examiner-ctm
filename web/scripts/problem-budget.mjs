#!/usr/bin/env node
/**
 * problem-budget.mjs
 * Aggregates issues across lint, tests, bundle size, (future) coverage, perf, etc.
 * Produces JSON summary with counts + status and optional budget thresholds.
 * Budgets (env configurable):
 *   PB_MAX_LINT_ERRORS (default 0)
 *   PB_MAX_LINT_WARNINGS (default 0)
 *   PB_MAX_TEST_FAILURES (default 0)
 *   PB_MAX_SIZE_TOTAL_BYTES (default from bundle script default)
 *   PB_MAX_SIZE_DELTA (optional informational)
 */
import fs from 'node:fs';
import path from 'node:path';

function readJSON(p, fallback=null) {
  try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch { return fallback; }
}

let root = process.cwd();
// If we are already in the web directory (contains package.json with name web), adjust root to its parent for consistent path join semantics.
try {
  const pkgMaybe = path.join(root, 'package.json');
  if (fs.existsSync(pkgMaybe)) {
    const pkg = JSON.parse(fs.readFileSync(pkgMaybe,'utf8'));
    if (pkg.name === 'web') {
      // parent directory
      root = path.dirname(root);
    }
  }
} catch {}

const lintPath = path.join(root, 'web','eslint-report.json');
const testResultsPath = path.join(root, 'web','test-report','results.json');
const sizeResultPath = path.join(root, 'web','bundle-size-result.json');
const coverageSummaryPath = path.join(root, 'web','coverage','coverage-summary.json');
const summaryOut = path.join(root, 'web','problem-budget-summary.json');
const tsErrorsAggregatePath = path.join(root, 'web','ts-errors-aggregate.json');
const tsSemanticDiffPath = path.join(root, 'web','ts-semantic-diff.json');

const lint = readJSON(lintPath, []);
let lintErrors=0, lintWarnings=0;
if (Array.isArray(lint)) {
  for (const file of lint) {
    for (const m of file.messages || []) {
      if (m.severity === 2) lintErrors++; else if (m.severity === 1) lintWarnings++;
    }
  }
}

const tests = readJSON(testResultsPath, {});
let testFailures=0, testTotal=0;
if (tests && tests.testResults) {
  for (const tr of tests.testResults) {
    for (const a of tr.assertionResults || []) {
      testTotal++;
      if (a.status && a.status !== 'passed') testFailures++;
    }
  }
}

const size = readJSON(sizeResultPath, null);
const sizeBytes = size && size.totalBytes ? size.totalBytes : null;

// Coverage: prefer statements pct, fallback to lines pct
let coveragePercent = null;
const coverageSummary = readJSON(coverageSummaryPath, null);
try {
  if (coverageSummary && coverageSummary.total) {
    const t = coverageSummary.total;
    // Common Istanbul shape: total: { lines: { pct }, statements: { pct } }
    if (t.statements && typeof t.statements.pct === 'number') coveragePercent = t.statements.pct;
    else if (t.lines && typeof t.lines.pct === 'number') coveragePercent = t.lines.pct;
  }
} catch {}

// TypeScript diagnostics (aggregate + semantic separation)
const tsErrorsAggregate = readJSON(tsErrorsAggregatePath, null);
let tsTotalErrors = 0;
if (tsErrorsAggregate && typeof tsErrorsAggregate.totalErrors === 'number') {
  tsTotalErrors = tsErrorsAggregate.totalErrors;
}

const tsSemanticDiff = readJSON(tsSemanticDiffPath, null);
let tsSyntactic = 0, tsSemantic = 0, tsGlobal = 0, tsOptions = 0;
if (tsSemanticDiff) {
  tsSyntactic = tsSemanticDiff.syntactic?.total || 0;
  tsSemantic = tsSemanticDiff.semantic?.total || 0;
  tsGlobal = tsSemanticDiff.global?.total || 0;
  tsOptions = tsSemanticDiff.options?.total || 0;
}

// Budgets
const budget = {
  lintErrors: parseInt(process.env.PB_MAX_LINT_ERRORS || '0',10),
  lintWarnings: parseInt(process.env.PB_MAX_LINT_WARNINGS || '0',10),
  testFailures: parseInt(process.env.PB_MAX_TEST_FAILURES || '0',10),
  sizeTotalBytes: parseInt(process.env.PB_MAX_SIZE_TOTAL_BYTES || '550000',10),
  coverageMin: parseInt(process.env.MIN_COVERAGE || process.env.PB_MIN_COVERAGE || '0', 10), // allow legacy var name
  tsErrors: parseInt(process.env.PB_MAX_TS_ERRORS || process.env.TS_MAX_ERRORS || '0', 10),
  tsSemantic: parseInt(process.env.PB_MAX_TS_SEMANTIC || '0', 10),
  tsSyntactic: parseInt(process.env.PB_MAX_TS_SYNTACTIC || '0', 10)
};

const status = {
  lintErrors: lintErrors <= budget.lintErrors,
  lintWarnings: lintWarnings <= budget.lintWarnings,
  testFailures: testFailures <= budget.testFailures,
  sizeTotalBytes: (sizeBytes==null) ? true : sizeBytes <= budget.sizeTotalBytes,
  coverage: (budget.coverageMin <= 0) ? true : (coveragePercent !== null && coveragePercent >= budget.coverageMin),
  tsErrors: tsTotalErrors <= budget.tsErrors,
  tsSemantic: tsSemantic <= budget.tsSemantic,
  tsSyntactic: tsSyntactic <= budget.tsSyntactic
};

const overall = Object.values(status).every(Boolean);

const summary = {
  schema: 2,
  generatedAt: new Date().toISOString(),
  counts: { lintErrors, lintWarnings, testFailures, testTotal, sizeTotalBytes: sizeBytes, coveragePercent, tsTotalErrors, tsSyntactic, tsSemantic, tsGlobal, tsOptions },
  budget,
  status,
  overall,
  // Top-level shorthands for Slack script (back-compat convenience)
  lintErrors,
  lintWarnings,
  testFailures,
  testsTotal: testTotal,
  bundle: sizeBytes != null ? { totalBytes: sizeBytes } : undefined,
  coveragePercent,
  tsTotalErrors,
  tsSyntactic,
  tsSemantic
};
fs.writeFileSync(summaryOut, JSON.stringify(summary,null,2));
console.log('Problem budget summary written:', summaryOut);
if (!overall) {
  console.error('Problem budget FAILED');
  process.exit(1);
}