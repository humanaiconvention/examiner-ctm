#!/usr/bin/env node
/**
 * check-lighthouse-thresholds.mjs
 * Enforces Lighthouse category minimum scores and (optionally) warns on budget violations.
 * Priority: Fail fast if any category score drops below its configured minimum.
 *
 * Default minimums (can be overridden via env):
 *  MIN_LH_PERF=90 MIN_LH_A11Y=95 MIN_LH_SEO=90 MIN_LH_BEST=95 (scores are 0-100 integer form)
 *
 * Exit codes:
 *  0 success
 *  1 no report / unexpected error
 *  2 threshold failure
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadLatestLhr() {
  if (!existsSync('.lighthouseci')) return null;
  const files = readdirSync('.lighthouseci')
    .filter(f => f.endsWith('.report.json') || f.endsWith('.lhr.json') || f.endsWith('.json'))
    .sort((a, b) => b.localeCompare(a)); // reverse lexicographic (timestamps usually in name)
  for (const f of files) {
    try {
      const data = JSON.parse(readFileSync(join('.lighthouseci', f), 'utf8'));
      // Support possible lhci-wrapper structure
      if (data?.lhr?.categories) return data.lhr;
      if (data?.categories?.performance) return data;
    } catch {
      // ignore parse errors
    }
  }
  return null;
}

const lhr = loadLatestLhr();
if (!lhr) {
  console.error('[lh-thresholds] No Lighthouse report found in .lighthouseci');
  process.exit(1);
}

// Extract scores (0-1 floats) then convert to integer percentage for comparison
const scores = {
  performance: lhr.categories?.performance?.score ?? null,
  accessibility: lhr.categories?.accessibility?.score ?? null,
  seo: lhr.categories?.seo?.score ?? null,
  best: lhr.categories?.['best-practices']?.score ?? null,
  pwa: lhr.categories?.pwa?.score ?? null,
};

// Resolve thresholds (integer 0-100). If env missing, use defaults; pwa optional
function envInt(name, fallback) {
  if (process.env[name] && /^\d+$/.test(process.env[name])) return parseInt(process.env[name], 10);
  return fallback;
}
const thresholds = {
  performance: envInt('MIN_LH_PERF', 90),
  accessibility: envInt('MIN_LH_A11Y', 95),
  seo: envInt('MIN_LH_SEO', 90),
  best: envInt('MIN_LH_BEST', 95),
  // PWA often volatile; only enforce if user specified env
  pwa: process.env.MIN_LH_PWA ? envInt('MIN_LH_PWA', 50) : null,
};

let allPass = true;
console.log('[lh-thresholds] Evaluating category scores:');
for (const key of Object.keys(scores)) {
  const raw = scores[key];
  const pct = raw == null ? null : Math.round(raw * 100);
  const min = thresholds[key];
  if (min == null) {
    console.log(`  ${key.padEnd(14)}: ${pct ?? 'n/a'} (no min)`);
    continue;
  }
  const pass = pct != null && pct >= min;
  if (!pass) allPass = false;
  console.log(`  ${key.padEnd(14)}: ${pct ?? 'n/a'} / ${min} -> ${pass ? 'PASS' : 'FAIL'}`);
}

if (!allPass) {
  console.error('[lh-thresholds] One or more category thresholds FAILED');
  process.exit(2);
}

// Optional: basic budgets presence notice (actual enforcement handled by Lighthouse run with --budgetsPath)
if (existsSync('lighthouse-budgets.json')) {
  console.log('[lh-thresholds] Budgets file detected (enforced during Lighthouse run).');
}

console.log('[lh-thresholds] All thresholds satisfied.');
process.exit(0);
