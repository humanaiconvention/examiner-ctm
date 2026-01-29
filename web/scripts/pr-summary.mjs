#!/usr/bin/env node
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import path from 'node:path';

function safeRead(p, parser = JSON.parse) {
  if (!existsSync(p)) return null;
  try { return parser(readFileSync(p, 'utf-8')); } catch { return null; }
}

const coverageSummary = safeRead(join('coverage', 'coverage-summary.json'));
let coverageLine = 'Coverage: n/a';
if (coverageSummary && coverageSummary.total) {
  const t = coverageSummary.total;
  coverageLine = `Coverage: lines ${t.lines.pct}% | funcs ${t.functions.pct}% | branches ${t.branches.pct}% | stmts ${t.statements.pct}%`;
}

// Lighthouse (optional) with delta vs baseline (main)
let lighthouseLine = 'Lighthouse: n/a';
function readLighthouseScores(dir) {
  const man = safeRead(join(dir, 'manifest.json'));
  if (!man || !Array.isArray(man) || !man.length) return null;
  for (const entry of man) {
    const lhr = safeRead(entry.jsonPath || '');
    if (lhr?.categories) {
      const c = lhr.categories;
      return {
        performance: c.performance?.score != null ? Math.round(c.performance.score * 100) : null,
        accessibility: c.accessibility?.score != null ? Math.round(c.accessibility.score * 100) : null,
        seo: c.seo?.score != null ? Math.round(c.seo.score * 100) : null,
        bestPractices: c['best-practices']?.score != null ? Math.round(c['best-practices'].score * 100) : null,
        pwa: c.pwa?.score != null ? Math.round(c.pwa.score * 100) : null
      };
    }
  }
  return null;
}
const currentLH = readLighthouseScores('.lighthouseci');
// Baseline (main) artifact may have been downloaded to same path or alternate name; if we decide later to separate, adjust here.
// If both lighthouse-results (main) and lighthouse-pr (current) were downloaded into same folder path, we only have current.
// Try secondary directory if exists (e.g., stored from workflow) named '.lighthouseci-baseline'.
const baselineLH = readLighthouseScores('.lighthouseci-baseline') || null;

function diffScore(cur, base) {
  if (cur == null || base == null) return '';
  const d = cur - base; if (d === 0) return '(±0)';
  const s = d > 0 ? `(+${d})` : `(${d})`; return s;
}

// Optional Lighthouse threshold indicators (env): MIN_LH_PERF, MIN_LH_A11Y, MIN_LH_SEO, MIN_LH_BEST, MIN_LH_PWA
function passIcon(passed){ return passed ? '✅' : '❌'; }
const lhThresholds = {
  performance: process.env.MIN_LH_PERF ? parseInt(process.env.MIN_LH_PERF,10) : null,
  accessibility: process.env.MIN_LH_A11Y ? parseInt(process.env.MIN_LH_A11Y,10) : null,
  seo: process.env.MIN_LH_SEO ? parseInt(process.env.MIN_LH_SEO,10) : null,
  bestPractices: process.env.MIN_LH_BEST ? parseInt(process.env.MIN_LH_BEST,10) : null,
  pwa: process.env.MIN_LH_PWA ? parseInt(process.env.MIN_LH_PWA,10) : null
};
if (currentLH) {
  lighthouseLine = 'Lighthouse:';
  const parts = [];
  for (const key of ['performance','accessibility','seo','bestPractices','pwa']) {
    if (currentLH[key] != null) {
      const deltaStr = baselineLH && baselineLH[key] != null ? ` ${diffScore(currentLH[key], baselineLH[key])}` : '';
      const label = key === 'bestPractices' ? 'Best' : key === 'performance' ? 'Perf' : key.toUpperCase().replace('PWA','PWA');
      const thresh = lhThresholds[key];
      const indicator = thresh != null ? ` ${passIcon(currentLH[key] >= thresh)}` : '';
      const threshInfo = thresh != null ? `/${thresh}` : '';
      parts.push(`${label} ${currentLH[key]}${threshInfo}${indicator}${deltaStr}`);
    }
  }
  lighthouseLine += ' ' + parts.join(' | ');
}

// Bundle size
let sizeLine = 'Bundle size: n/a';
try {
  if (existsSync('size-status.txt')) {
    const raw = readFileSync('size-status.txt', 'utf8');
    const sizeLines = raw.split(/\r?\n/).filter(l => /^(OK|FAIL|WARN|Info):/.test(l));
    if (sizeLines.length) {
      const primary = sizeLines.filter(l => /^(OK|FAIL|WARN):/.test(l));
      const info = sizeLines.filter(l => /^Info:/.test(l));
      let block = primary.join(' | ');
      if (info.length) block += `\n${info.join('\n')}`;
      sizeLine = block;
    }
  }
} catch {}

// Badge metrics
let perfLine = '';
const lhManifest = '.lighthouseci/manifest.json';
const badgeMetricsPath = path.join(process.cwd(), 'badge-metrics.json');
let badgesLine = '';
if (existsSync(lhManifest)) {
  try {
    const m = JSON.parse(readFileSync(lhManifest, 'utf-8'));
    if (Array.isArray(m) && m.length) {
      const lhr = JSON.parse(readFileSync(m[0].jsonPath, 'utf-8'));
      const perf = Math.round((lhr.categories.performance.score || 0) * 100);
      perfLine = `\n- Performance: ${perf}`;
    }
  } catch (e) {
    perfLine = '\n- Performance: (error reading lighthouse results)';
  }
  if (existsSync(badgeMetricsPath)) {
    try {
      const metrics = JSON.parse(readFileSync(badgeMetricsPath, 'utf8'));
      const { totalKb, mainKb, vendorReactKb, vendorOtherKb, performance } = metrics;
      const perf = performance != null ? performance : '—';
      badgesLine = `Badges: Total ${totalKb ?? '—'} kB | Main ${mainKb ?? '—'} kB | React ${vendorReactKb ?? '—'} kB | Other ${vendorOtherKb ?? '—'} kB | Perf ${perf}`;
    } catch (e) {
      badgesLine = `Badges: (error parsing badge-metrics.json: ${e.message})`;
    }
  }
}

// Accessibility report
let a11yLine = 'Accessibility: n/a';
const a11y = safeRead('a11y-report.json');
if (a11y && Array.isArray(a11y.violations)) {
  const total = a11y.violations.length;
  const serious = a11y.violations.filter(v => ['serious','critical'].includes(v.impact)).length;
  a11yLine = `Accessibility: ${total} violations (${serious} serious/critical)`;
}

// Performance marks
let perfMarksLine = '';
const perfMarks = safeRead('perf-marks.json');
const prevPerfMarks = safeRead('prev-perf-marks.json');
function delta(cur, prev) {
  if (cur == null || prev == null) return '';
  const d = cur - prev;
  const sign = d > 0 ? '+' : '';
  return `(${sign}${d.toFixed(0)}ms)`;
}
if (perfMarks) {
  const hero = perfMarks.heroMounted != null ? perfMarks.heroMounted : null;
  const s = perfMarks.sections || {};
  const secStr = ['vision','voices','participate','comingSoon']
    .map(k => `${k}:${s[k] != null ? s[k].toFixed(0) : '—'}ms`).join(' ');
  let worst = null;
  const values = Object.values(s).filter(v => typeof v === 'number');
  if (values.length) worst = Math.max(...values);
  let prevWorst = null;
  if (prevPerfMarks && prevPerfMarks.sections) {
    const pv = Object.values(prevPerfMarks.sections).filter(v => typeof v === 'number');
    if (pv.length) prevWorst = Math.max(...pv);
  }
  const heroDelta = delta(hero, prevPerfMarks?.heroMounted);
  const worstDelta = delta(worst, prevWorst);
  const heroBudget = process.env.MAX_HERO_MS ? parseInt(process.env.MAX_HERO_MS,10) : null;
  const worstBudget = process.env.MAX_WORST_SECTION_MS ? parseInt(process.env.MAX_WORST_SECTION_MS,10) : null;
  const heroIndicator = heroBudget != null && hero != null ? ` ${passIcon(hero <= heroBudget)}` : '';
  const worstIndicator = worstBudget != null && worst != null ? ` ${passIcon(worst <= worstBudget)}` : '';
  const heroBudgetInfo = heroBudget != null ? `/${heroBudget}` : '';
  const worstBudgetInfo = worstBudget != null ? `/${worstBudget}` : '';
  perfMarksLine = `Perf Marks: hero ${hero != null ? hero.toFixed(0) : '—'}ms${heroBudgetInfo}${heroIndicator} ${heroDelta} ${secStr} | worstSection ${worst != null ? worst.toFixed(0) : '—'}ms${worstBudgetInfo}${worstIndicator} ${worstDelta}`;
}

// Visual diff
let visualLine = 'Visual Diff: n/a';
const visual = safeRead('visual-diff-summary.json');
if (visual) {
  // Adjusted for new structure (globalThreshold + results)
  const worstEntry = visual.results ? Math.max(...visual.results.map(r => r.diffRatio)) : visual.maxDiffRatio;
  const thresh = visual.globalThreshold != null ? visual.globalThreshold : visual.threshold;
  const pct = (worstEntry * 100).toFixed(2);
  const threshPct = (thresh * 100).toFixed(2);
  const passed = worstEntry <= thresh;
  visualLine = `Visual Diff: max ${pct}% / ${threshPct}% ${passIcon(passed)}`;
}

// Aggregate metrics (if present)
const aggregate = safeRead('aggregate-metrics.json');
let aggregateLine = '';
if (aggregate) {
  const parts = [];
  if (aggregate.performanceScore != null) parts.push(`PerfScore ${aggregate.performanceScore}`);
  if (aggregate.sizes) parts.push(`Total ${aggregate.sizes.totalKb}kB`);
  if (aggregate.visual) parts.push(`VisDiff ${(aggregate.visual.maxDiffRatio*100).toFixed(2)}%`);
  if (aggregate.accessibility) parts.push(`A11y ${aggregate.accessibility.violations}`);
  if (aggregate.perfMarks?.heroMounted != null) parts.push(`Hero ${aggregate.perfMarks.heroMounted.toFixed(0)}ms`);
  aggregateLine = 'Aggregate: ' + parts.join(' | ');
}

const body = [
  '### QA Summary',
  '',
  coverageLine,
  lighthouseLine,
  sizeLine,
  badgesLine,
  a11yLine,
  perfMarksLine,
  visualLine,
  aggregateLine,
  '',
  '_Automated report (coverage, performance, size, a11y, visual)._'
].filter(Boolean).join('\n');

console.log(body);

let summary = `# Pull Request Summary`;
summary += `\n\n## Coverage\n${coverageLine}`;
summary += `\n\n## Lighthouse\n${lighthouseLine}`;
summary += `\n\n## Bundle Size\n${sizeLine}`;
if (badgesLine) summary += `\n\n## Badges\n${badgesLine}`;
summary += `\n\n## Accessibility\n${a11yLine}`;
if (perfMarksLine) summary += `\n\n## Performance Marks\n${perfMarksLine}`;
summary += `\n\n## Visual Regression\n${visualLine}`;
if (aggregateLine) summary += `\n\n## Aggregate\n${aggregateLine}`;
if (perfLine) summary += `\n## Performance\n${perfLine}\n`;
writeFileSync('pr-summary.md', summary);
