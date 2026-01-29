#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function safe(path) { try { if (!existsSync(path)) return null; return JSON.parse(readFileSync(path,'utf8')); } catch { return null; } }

const badge = safe('badge-metrics.json');
const perfMarks = safe('perf-marks.json');
const a11y = safe('a11y-report.json');
const visual = safe('visual-diff-summary.json');

let coverage = null;
if (existsSync('coverage/coverage-summary.json')) {
  coverage = safe('coverage/coverage-summary.json');
}

// Attempt to locate Lighthouse JSON results (latest file)
function findLighthouseCategories() {
  try {
    if (!existsSync('.lighthouseci')) return null;
    const files = readdirSync('.lighthouseci').filter(f => f.endsWith('.json'));
    if (!files.length) return null;
    // pick the most recently modified JSON file
    const full = files.map(f => ({ f, m: ( () => { try { return readFileSync(join('.lighthouseci', f)); } catch { return null; } })() }));
    // We actually just need one parsed LH report; iterate until parse success
    for (const file of files.reverse()) { // reverse arbitrary order to bias later entries
      try {
        const data = JSON.parse(readFileSync(join('.lighthouseci', file), 'utf8'));
        if (data?.lhr?.categories) {
          const c = data.lhr.categories;
          return {
            performance: c.performance?.score ?? null,
            accessibility: c.accessibility?.score ?? null,
            bestPractices: c['best-practices']?.score ?? null,
            seo: c.seo?.score ?? null,
            pwa: c.pwa?.score ?? null
          };
        }
        // Some reports may already be the LHR root
        if (data?.categories) {
          const c = data.categories;
            return {
              performance: c.performance?.score ?? null,
              accessibility: c.accessibility?.score ?? null,
              bestPractices: c['best-practices']?.score ?? null,
              seo: c.seo?.score ?? null,
              pwa: c.pwa?.score ?? null
            };
        }
      } catch { /* ignore parse errors */ }
    }
  } catch { /* ignore */ }
  return null;
}

const lighthouse = findLighthouseCategories();

// Determine Lighthouse compliance based on env thresholds (all categories with a threshold must meet it)
function computeLighthouseCompliance(lh) {
  if (!lh) return null;
  const thresholds = {
    performance: process.env.MIN_LH_PERF ? parseInt(process.env.MIN_LH_PERF,10) : null,
    accessibility: process.env.MIN_LH_A11Y ? parseInt(process.env.MIN_LH_A11Y,10) : null,
    seo: process.env.MIN_LH_SEO ? parseInt(process.env.MIN_LH_SEO,10) : null,
    bestPractices: process.env.MIN_LH_BEST ? parseInt(process.env.MIN_LH_BEST,10) : null,
    pwa: process.env.MIN_LH_PWA ? parseInt(process.env.MIN_LH_PWA,10) : null,
  };
  let any = false; let allPass = true;
  for (const k of Object.keys(thresholds)) {
    const t = thresholds[k];
    if (t != null) {
      any = true;
      const val = lh[k] != null ? Math.round(lh[k]*100) : null; // lh values are 0-1 if direct? ensure format.
      // Prior discover: findLighthouseCategories already returns 0-1? Actually returns raw score (0-1). Convert to 0-100 for compare.
      if (val == null || val < t) { allPass = false; }
    }
  }
  if (!any) return null;
  return allPass ? 1 : 0;
}
const lighthouseCompliance = computeLighthouseCompliance(lighthouse);

const aggregate = {
  generatedAt: new Date().toISOString(),
  sizes: badge ? { totalKb: badge.totalKb, mainKb: badge.mainKb, vendorReactKb: badge.vendorReactKb, vendorOtherKb: badge.vendorOtherKb } : null,
  performanceScore: badge?.performance ?? null,
  lighthouse: lighthouse,
  lighthouseCompliance,
  perfMarks: perfMarks ? {
    heroMounted: perfMarks.heroMounted,
    sections: perfMarks.sections
  } : null,
  accessibility: a11y ? {
    violations: a11y.violations?.length ?? 0,
    seriousOrCritical: (a11y.violations || []).filter(v => ['serious','critical'].includes(v.impact)).length
  } : null,
  visual: visual ? {
    maxDiffRatio: visual.maxDiffRatio,
    threshold: visual.threshold
  } : null,
  coverage: coverage ? {
    lines: coverage.total?.lines?.pct,
    branches: coverage.total?.branches?.pct,
    functions: coverage.total?.functions?.pct
  } : null
};

writeFileSync('aggregate-metrics.json', JSON.stringify(aggregate, null, 2));
console.log('aggregate-metrics.json written');