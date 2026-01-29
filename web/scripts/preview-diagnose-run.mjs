#!/usr/bin/env node
/**
 * preview-diagnose-run.mjs
 * Wrapper around preview-diagnose.mjs providing:
 *  - Config file loading (diagnose.config.json)
 *  - Post-build SRI injection (if configured)
 *  - Delta calculation against previous successful run (latency changes)
 *  - HTML summary report generation
 *  - --establish-baseline: forces success regardless of gating (to seed baseline)
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync as exists } from 'node:fs';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import Ajv from 'ajv';
import { readFile as rf } from 'node:fs/promises';
import { request as httpsRequest } from 'node:https';
import { loadRatchetState, saveRatchetState, evaluateRatchet } from './lib/ratchet.mjs';

const CONFIG_PATH = process.argv.find(a => a.startsWith('--config='))?.split('=')[1] || 'diagnose.config.json';
const RAW_OUT = 'diagnose-report.json';
const HTML_OUT = 'diagnose-report.html';
const ESTABLISH_BASELINE = process.argv.includes('--establish-baseline');

function run(cmd, args, opts={}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
    child.on('exit', code => resolve(code));
  });
}

async function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    const raw = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
    // Validate against schema if present
    const schemaPath = CONFIG_PATH.replace(/[^/\\]+$/, 'diagnostics.config.schema.json');
    if (existsSync(schemaPath)) {
      try {
        const schema = JSON.parse(await rf(schemaPath, 'utf-8'));
        const ajv = new Ajv({ allErrors: true });
        const validate = ajv.compile(schema);
        if (!validate(raw)) {
          console.warn('[diagnose-run] Config schema validation warnings:', validate.errors?.map(e=>`${e.instancePath} ${e.message}`).join('; '));
        }
      } catch (e) { console.warn('[diagnose-run] Config schema validation skipped:', e.message); }
    }
    return raw;
  } catch { return {}; }
}

function buildArgs(rawCfg) {
  const cfg = rawCfg || {};
  const args = ['scripts/preview-diagnose.mjs', '--json', `--out=${RAW_OUT}`];
  if (cfg.routes && cfg.routes.length) args.push('--routes=' + cfg.routes.join(','));
  const thresholds = cfg.thresholds || {};
  if (thresholds.maxHtmlMs) args.push(`--max-html-ms=${thresholds.maxHtmlMs}`);
  if (thresholds.maxBundleMs) args.push(`--max-bundle-ms=${thresholds.maxBundleMs}`);
  if (thresholds.universalMaxMs) args.push(`--max-ms=${thresholds.universalMaxMs}`);
  const history = cfg.history || {};
  if (history.file) args.push(`--history=${history.file}`);
  if (history.maxEntries) args.push(`--history-max=${history.maxEntries}`);
  if (cfg.enforceSri) args.push('--check-sri'); // legacy flat key optional
  if (cfg.failOnWarning) args.push('--fail-on-warning');
  const lh = cfg.lighthouse || {};
  if (lh.enabled) {
    args.push('--lighthouse');
    // Adaptive mode: if config supplies minScores/maxVitals we rely on temp LHCI config; skip CLI overrides
    const hasAdaptive = (lh.minScores && Object.keys(lh.minScores).length) || (lh.maxVitals && Object.keys(lh.maxVitals).length);
    if (!hasAdaptive) {
      const minScores = lh.minScores || {};
      if (typeof minScores.performance === 'number') args.push(`--min-performance=${minScores.performance}`);
      if (typeof minScores.accessibility === 'number') args.push(`--min-accessibility=${minScores.accessibility}`);
      if (typeof minScores['best-practices'] === 'number') args.push(`--min-best-practices=${minScores['best-practices']}`);
      if (typeof minScores.seo === 'number') args.push(`--min-seo=${minScores.seo}`);
      if (typeof minScores.pwa === 'number') args.push(`--min-pwa=${minScores.pwa}`);
      const maxVitals = lh.maxVitals || {};
      if (typeof maxVitals.cls === 'number') args.push(`--max-cls=${maxVitals.cls}`);
      if (typeof maxVitals.lcp === 'number') args.push(`--max-lcp-ms=${maxVitals.lcp}`);
      if (typeof maxVitals.tbt === 'number') args.push(`--max-tbt-ms=${maxVitals.tbt}`);
      if (typeof maxVitals.inp === 'number') args.push(`--max-inp-ms=${maxVitals.inp}`);
      if (typeof maxVitals.fcp === 'number') args.push(`--max-fcp-ms=${maxVitals.fcp}`);
    }
    if (lh.strict) args.push('--lighthouse-strict');
    if (lh.failOnAnyAssertion) args.push('--fail-lh-assertions');
  }
  if (cfg.playwrightSmoke?.enabled) {
    args.push('--playwright-smoke');
    if (cfg.playwrightSmoke.pattern) args.push(`--pw-pattern=${cfg.playwrightSmoke.pattern}`);
  }
  return args;
}

async function injectSriIfNeeded(cfg) {
  if (!cfg.enforceSri) return;
  // Running add-sri after build ensures integrity tags exist before diagnose; diagnose will verify them.
  await run('node', ['scripts/add-sri.mjs']);
}

function loadHistory(historyFile) {
  if (!historyFile || !exists(historyFile)) return null;
  try { return JSON.parse(require('node:fs').readFileSync(historyFile,'utf-8')); } catch { return null; }
}

function validateReportSchema(report) {
  // Lightweight JSON schema here; could externalize later
  const schema = {
    type: 'object',
    required: ['meta','results','success'],
    properties: {
      meta: { type: 'object', required: ['endTime'], properties: { endTime: { type: 'string' } } },
      results: { type: 'array', items: { type: 'object', properties: { target: { type: 'string' }, type: { type: 'string' } }, required: ['target','type'] } },
      lighthouse: { type: ['object','null'] },
      regression: { type: ['object','null'] },
      failures: { type: 'array' },
      success: { type: 'boolean' }
    }
  };
  try {
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(schema);
    if (!validate(report)) {
      return (validate.errors||[]).map(e=>`${e.instancePath} ${e.message}`);
    }
    return [];
  } catch (e) { return ['schema-exception '+e.message]; }
}

function computeDeltas(current, historyFile) {
  if (!historyFile || !existsSync(historyFile)) return null;
  try {
    const hist = JSON.parse(require('node:fs').readFileSync(historyFile,'utf-8'));
    const prev = [...hist.runs].reverse().find(r => r.success);
    if (!prev) return null;
    const curMap = new Map(current.results.filter(r=>r.type==='html').map(r => [r.target, r.ms]));
    const delta = {};
    for (const p of prev.perf || []) {
      const cur = curMap.get(p.target);
      if (typeof cur === 'number') delta[p.target] = { prev: p.ms, cur, diff: cur - p.ms };
    }
    return delta;
  } catch { return null; }
}

function computeBudgets(report, cfg) {
  const budgets = cfg.budgets || {};
  const gzipSizes = report.meta.gzipSizes || [];
  const main = gzipSizes.find(g => g.target === 'bundle:main');
  const totalJs = gzipSizes.reduce((a,c)=> a + (c.gzip||0), 0);
  const totalCss = (report.meta.cssAssets||[]).reduce((a,c)=> a + (c.gzip||0), 0);
  return {
    mainBundleGzip: { value: main?.gzip || 0, limit: budgets.maxMainBundleGzip || null },
    totalJsGzip: { value: totalJs, limit: budgets.maxTotalJsGzip || null },
    totalCssGzip: { value: totalCss, limit: budgets.maxTotalCssGzip || null }
  };
}

function computeRegression(raw, history, cfg) {
  const regCfg = cfg.regression || {};
  if (!regCfg.enabled) return null;
  if (!history || !history.runs || !history.runs.length) return null;
  const currentTs = raw.meta.endTime;
  const windowSize = regCfg.window || 10;
  const successes = history.runs.filter(r => r.success && r.ts !== currentTs);
  if (!successes.length) return null;
  const recent = successes.slice(-windowSize);
  const percentile = (vals, p) => {
    const arr = vals.filter(v=>typeof v==='number' && !isNaN(v)).sort((a,b)=>a-b);
    if (!arr.length) return null;
    if (p <= 0) return arr[0];
    if (p >= 100) return arr[arr.length-1];
    const rank = (p/100)*(arr.length-1);
    const lo = Math.floor(rank), hi = Math.ceil(rank);
    if (lo === hi) return arr[lo];
    const frac = rank - lo; return arr[lo] + (arr[hi]-arr[lo])*frac;
  };
  const basePct = regCfg.baselinePercentile || 50; // median default
  const pick = (vals)=> percentile(vals, basePct);
  // Baselines (medians)
  const baselinePerf = pick(recent.map(r => r.lh?.performance));
  const baselineMainBundle = pick(recent.map(r => r.mainBundleGzip));
  const baselineTotalJs = pick(recent.map(r => r.totalJsGzip));
  const baselineCls = pick(recent.map(r => r.lhMetrics?.cls));
  const baselineLcp = pick(recent.map(r => r.lhMetrics?.lcp));
  const baselineTbt = pick(recent.map(r => r.lhMetrics?.tbt));
  const baselineInp = pick(recent.map(r => r.lhMetrics?.inp));
  const assertions = [];
  // Helper to build growth assertion where higher worse
  function growth(id, prev, cur, warnPct, failPct, label) {
    if (typeof cur !== 'number' || typeof prev !== 'number' || prev <= 0) return;
    const growth = (cur - prev) / prev; // positive = worse
    if (growth >= failPct && failPct > 0) assertions.push({ id, level:'error', expected: `<=${failPct*100}% ${label||'growth'}`, actual: growth, previous: prev, current: cur });
    else if (growth >= warnPct && warnPct > 0) assertions.push({ id, level:'warning', expected: `<=${warnPct*100}% ${label||'growth'}`, actual: growth, previous: prev, current: cur });
    else if (growth > 0) assertions.push({ id, level:'info', expected: `<=${warnPct*100}% ${label||'growth'}`, actual: growth, previous: prev, current: cur });
  }
  // Helper where lower is worse (score drop)
  function drop(id, prev, cur, warn, fail, label) {
    if (typeof cur !== 'number' || typeof prev !== 'number' || prev <= 0) return;
    const diff = prev - cur; // positive diff = drop
    if (diff >= fail && fail > 0) assertions.push({ id, level:'error', expected:`<=${fail} ${label||'drop'}`, actual: diff, previous: prev, current: cur });
    else if (diff >= warn && warn > 0) assertions.push({ id, level:'warning', expected:`<=${warn} ${label||'drop'}`, actual: diff, previous: prev, current: cur });
    else if (diff > 0) assertions.push({ id, level:'info', expected:`<=${warn} ${label||'drop'}`, actual: diff, previous: prev, current: cur });
  }
  const curPerf = raw.lighthouse?.scores?.performance;
  drop('regression:performance', baselinePerf, curPerf, regCfg.performanceDropWarn || 0, regCfg.performanceDropFail || 0, 'drop');
  const curMain = (raw.meta.gzipSizes||[]).find(g=>g.target==='bundle:main')?.gzip;
  growth('regression:bundle:main-gzip', baselineMainBundle, curMain, regCfg.bundleGrowthWarnPct || 0, regCfg.bundleGrowthFailPct || 0, 'growth');
  const curTotalJs = (raw.meta.gzipSizes||[]).reduce((a,c)=> a + (c.gzip||0),0);
  growth('regression:bundle:total-js-gzip', baselineTotalJs, curTotalJs, regCfg.totalJsGrowthWarnPct || 0, regCfg.totalJsGrowthFailPct || 0, 'growth');
  // Vitals (higher is worse) - apply one set of pct thresholds to each
  const vitWarn = regCfg.vitalsIncreaseWarnPct || 0;
  const vitFail = regCfg.vitalsIncreaseFailPct || 0;
  const curMetrics = raw.lighthouse?.metrics || {};
  growth('regression:vitals:cls', baselineCls, curMetrics.cls, vitWarn, vitFail, 'increase');
  growth('regression:vitals:lcp', baselineLcp, curMetrics.lcp, vitWarn, vitFail, 'increase');
  growth('regression:vitals:tbt', baselineTbt, curMetrics.tbt, vitWarn, vitFail, 'increase');
  growth('regression:vitals:inp', baselineInp, curMetrics.inp, vitWarn, vitFail, 'increase');
  // Improvement detection (metric decreased for worse-is-higher metrics or increased for performance score)
  const improvements = [];
  function checkImprove(label, base, cur, betterIfLower=true) {
    if (typeof base !== 'number' || typeof cur !== 'number') return;
    const better = betterIfLower ? cur < base : cur > base;
    if (!better) return;
    const delta = cur - base; // will be negative for betterIfLower improvements
    const rel = base !== 0 ? Math.abs(delta) / Math.abs(base) : 0;
    const minRel = regCfg.improvementMinRelativePct || 0;
    const minAbs = regCfg.improvementMinAbsolute || 0;
    if (Math.abs(delta) < minAbs && rel < minRel) return; // noise filter
    improvements.push({ metric: label, baseline: base, current: cur, delta, relative: rel });
  }
  checkImprove('performance', baselinePerf, curPerf, false);
  checkImprove('mainBundleGzip', baselineMainBundle, curMain, true);
  checkImprove('totalJsGzip', baselineTotalJs, curTotalJs, true);
  checkImprove('cls', baselineCls, curMetrics.cls, true);
  checkImprove('lcp', baselineLcp, curMetrics.lcp, true);
  checkImprove('tbt', baselineTbt, curMetrics.tbt, true);
  checkImprove('inp', baselineInp, curMetrics.inp, true);
  const allComparable = ['performance','mainBundleGzip','totalJsGzip','cls','lcp','tbt','inp'].filter(m=>{
    const baseMap = { performance: baselinePerf, mainBundleGzip: baselineMainBundle, totalJsGzip: baselineTotalJs, cls: baselineCls, lcp: baselineLcp, tbt: baselineTbt, inp: baselineInp };
    const curMap = { performance: curPerf, mainBundleGzip: curMain, totalJsGzip: curTotalJs, cls: curMetrics.cls, lcp: curMetrics.lcp, tbt: curMetrics.tbt, inp: curMetrics.inp };
    return typeof baseMap[m]==='number' && typeof curMap[m]==='number';
  });
  const allImproved = allComparable.length>0 && improvements.length === allComparable.length;
  return { assertions, baseline: { perf: baselinePerf, mainBundleGzip: baselineMainBundle, totalJsGzip: baselineTotalJs, cls: baselineCls, lcp: baselineLcp, tbt: baselineTbt, inp: baselineInp }, improvements, allImproved };
}

function formatPct(p){
  if (p == null) return '-';
  return (p*100).toFixed(2)+'%';
}

function renderHtml(report, deltas, cfg, history) {
  const esc = (s)=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const rows = report.results.filter(r=>r.type==='html').map(r => {
    const d = deltas?.[r.target];
    const diff = d ? (d.diff>0?`+${d.diff}`:d.diff) : '';
    return `<tr><td>${r.target}</td><td>${r.ms}</td><td>${d?d.prev:''}</td><td>${diff}</td></tr>`;
  }).join('\n');
  const b = computeBudgets(report, cfg);
  const latestHist = history && history.runs ? [...history.runs].slice(-1)[0] : null;
  const perfSummary = latestHist ? `<p>Last p50: ${latestHist.p50??'-'} ms | p90: ${latestHist.p90??'-'} ms | p95: ${latestHist.p95??'-'} ms</p>` : '';
  const prevSuccess = history && history.runs ? [...history.runs].reverse().find(r => r.success && r.ts !== latestHist?.ts) : null;
  const mainBundle = (report.meta.gzipSizes||[]).find(g=>g.target==='bundle:main');
  let bundleDeltaHtml = '';
  if (mainBundle && prevSuccess && typeof prevSuccess.mainBundleGzip === 'number') {
    const diff = mainBundle.gzip - prevSuccess.mainBundleGzip;
    const sign = diff>0?'+':'';
    bundleDeltaHtml = `<p>Main bundle gzip: ${mainBundle.gzip} bytes (prev ${prevSuccess.mainBundleGzip}, diff ${sign}${diff})</p>`;
  }
  const breaches = latestHist?.budgetBreaches?.length ? `<ul>${latestHist.budgetBreaches.map(br=>`<li>${esc(br.metric)}: value ${br.value} > limit ${br.limit}</li>`).join('')}</ul>` : '<p>None</p>';
  function badge(item){
    if (!item.limit) return `<span>${item.value}</span>`;
    const ok = item.value <= item.limit;
    return `<span class='badge ${ok?'ok':'fail'}' title='limit ${item.limit}'>${item.value}</span>`;
  }
  const cssList = (report.meta.cssAssets||[]).map(c=>`<li>${esc(c.file)}: raw ${c.raw}B gzip ${c.gzip||'n/a'}B</li>`).join('');
  // Regression summary if present
  let regressionHtml = '';
  if (report.regression) {
    const base = report.regression.baseline || {};
    const curMetrics = report.lighthouse?.metrics || {};
    const curScores = report.lighthouse?.scores || {};
    function deltaRow(label, baselineVal, currentVal, betterIfLower=true){
      if (baselineVal == null || currentVal == null) return '';
      const diff = currentVal - baselineVal;
      const pct = baselineVal!==0? diff / baselineVal : 0;
      const improved = betterIfLower ? diff < 0 : diff > 0;
      const cls = improved ? 'improve' : (diff===0?'neutral':'worse');
      return `<tr class='${cls}'><td>${esc(label)}</td><td>${baselineVal.toFixed(2)}</td><td>${currentVal.toFixed(2)}</td><td>${diff>0?'+':''}${diff.toFixed(2)}</td><td>${formatPct(pct)}</td></tr>`;
    }
    const rowsReg = [];
    rowsReg.push(deltaRow('Performance score', base.perf, curScores.performance, false));
    rowsReg.push(deltaRow('CLS', base.cls, curMetrics.cls, true));
    rowsReg.push(deltaRow('LCP (ms)', base.lcp, curMetrics.lcp, true));
    rowsReg.push(deltaRow('TBT (ms)', base.tbt, curMetrics.tbt, true));
    rowsReg.push(deltaRow('INP (ms)', base.inp, curMetrics.inp, true));
    rowsReg.push(deltaRow('Main bundle gzip (bytes)', base.mainBundleGzip, (report.meta.gzipSizes||[]).find(g=>g.target==='bundle:main')?.gzip, true));
    rowsReg.push(deltaRow('Total JS gzip (bytes)', base.totalJsGzip, (report.meta.gzipSizes||[]).reduce((a,c)=>a+(c.gzip||0),0), true));
    const filteredRows = rowsReg.filter(Boolean).join('');
    regressionHtml = `<h2>Regression Summary</h2>${filteredRows?`<table><thead><tr><th>Metric</th><th>Baseline</th><th>Current</th><th>Diff</th><th>%</th></tr></thead><tbody>${filteredRows}</tbody></table>`:'<p>No comparable baseline metrics.</p>'}`;
  }
  const baselineNote = report.meta.baselineEstablished ? `<p class='baseline-note'>Baseline Establishment Run (forced success)</p>` : '';
  return `<!doctype html><meta charset='utf-8'><title>Preview Diagnose Report</title>
  <style>body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:24px;color:#123}table{border-collapse:collapse;margin-bottom:18px}th,td{padding:4px 8px;border:1px solid #ccc;font-size:13px}th{background:#f0f6fa;text-align:left} .fail{color:#b00;font-weight:600} .ok{color:#0a5;font-weight:600} .badge{display:inline-block;padding:2px 6px;border-radius:4px;background:#eef} .improve{background:#e6faef} .worse{background:#ffecec} .neutral{background:#f5f5f5} .baseline-note{font-style:italic;color:#555}</style>
  <h1>Preview Diagnose Report</h1>
  <p>Status: <span class='${report.success?'ok':'fail'}'>${report.success?'PASS':'FAIL'}</span></p>
  ${baselineNote}
  ${perfSummary}
  ${bundleDeltaHtml}
  ${regressionHtml}
  <h2>Latency (ms)</h2>
  <table><thead><tr><th>Route</th><th>Current</th><th>Prev</th><th>Diff</th></tr></thead><tbody>${rows}</tbody></table>
  <h2>Bundles</h2>
  <ul>${(report.meta.gzipSizes||[]).map(g=>`<li>${esc(g.target)}: gzip ${g.gzip} bytes</li>`).join('')}</ul>
  <h2>CSS Assets</h2>
  <ul>${cssList||'<li>None</li>'}</ul>
  <h2>Budgets</h2>
  <table><thead><tr><th>Metric</th><th>Value</th><th>Limit</th><th>Status</th></tr></thead><tbody>
  <h3>Budget Breaches (history annotation)</h3>
  ${breaches}
    <tr><td>Main bundle gzip</td><td>${b.mainBundleGzip.value}</td><td>${b.mainBundleGzip.limit??'-'}</td><td>${b.mainBundleGzip.limit? (b.mainBundleGzip.value<=b.mainBundleGzip.limit?'OK':'<span class="fail">BREACH</span>'):'-'}</td></tr>
    <tr><td>Total JS gzip</td><td>${b.totalJsGzip.value}</td><td>${b.totalJsGzip.limit??'-'}</td><td>${b.totalJsGzip.limit? (b.totalJsGzip.value<=b.totalJsGzip.limit?'OK':'<span class="fail">BREACH</span>'):'-'}</td></tr>
    <tr><td>Total CSS gzip</td><td>${b.totalCssGzip.value}</td><td>${b.totalCssGzip.limit??'-'}</td><td>${b.totalCssGzip.limit? (b.totalCssGzip.value<=b.totalCssGzip.limit?'OK':'<span class="fail">BREACH</span>'):'-'}</td></tr>
  </tbody></table>
  <h2>Failures</h2>
  ${report.failures.length?`<ul>${report.failures.map(f=>`<li>${esc(f.target)} – ${esc(f.reason||'')}${f.error?': '+esc(f.error):''}</li>`).join('')}</ul>`:'<p>None</p>'}
  <p><small>Generated at ${esc(report.meta.endTime)}</small></p>`;
}

async function main() {
  const cfg = await loadConfig();
  // Build first to guarantee dist present before SRI injection
  await run('npm', ['run', 'build']);
  await injectSriIfNeeded(cfg);
  const args = buildArgs(cfg);
  // Ensure underlying diagnose does not rebuild (build already done + SRI injected)
  args.push('--no-build');
  const diagnoseCode = await run('node', args);
  const raw = JSON.parse(await readFile(RAW_OUT, 'utf-8'));
  if (ESTABLISH_BASELINE) {
    raw.meta = raw.meta || {};
    raw.meta.baselineEstablished = true;
  }
  if (cfg.validateSchema) {
    const schemaErrors = validateReportSchema(raw);
    if (schemaErrors.length) {
      console.error('[diagnose-run] Schema validation failed:', schemaErrors.join('; '));
      process.exit(1);
    }
  }
  const historyFile = cfg.history?.file || cfg.historyFile; // support legacy flat key
  const history = loadHistory(historyFile);
  const deltas = computeDeltas(raw, historyFile);
  // Regression detection (needs history prior to mutation)
  const regression = computeRegression(raw, history, cfg);
  if (regression) {
    raw.regression = regression;
    if (regression.allImproved) raw.meta.allMetricsImproved = true;
    for (const a of regression.assertions) {
      if (a.level === 'error') {
        raw.failures.push({ target: a.id, reason: 'regression', actual: a.actual, expected: a.expected, previous: a.previous });
      }
    }
  }
  // Determine budget breaches and persist into history file after diagnose updated it.
  const budgets = cfg.budgets || {};
  const gzipSizes = raw.meta.gzipSizes || [];
  const main = gzipSizes.find(g=>g.target==='bundle:main');
  const totalJs = gzipSizes.reduce((a,c)=> a + (c.gzip||0), 0);
  const totalCss = (raw.meta.cssAssets||[]).reduce((a,c)=> a + (c.gzip||0), 0);
  const breaches = [];
  if (budgets.maxMainBundleGzip && main && main.gzip > budgets.maxMainBundleGzip) breaches.push({ metric:'mainBundleGzip', value: main.gzip, limit: budgets.maxMainBundleGzip });
  if (budgets.maxTotalJsGzip && totalJs > budgets.maxTotalJsGzip) breaches.push({ metric:'totalJsGzip', value: totalJs, limit: budgets.maxTotalJsGzip });
  if (budgets.maxTotalCssGzip && totalCss > budgets.maxTotalCssGzip) breaches.push({ metric:'totalCssGzip', value: totalCss, limit: budgets.maxTotalCssGzip });
  if (history && history.runs && history.runs.length) {
    // Append breaches to last run entry if exists and matches current endTime (last run appended by diagnose)
    const last = history.runs[history.runs.length-1];
    if (!last.budgetBreaches && last.ts === raw.meta.endTime) {
      last.budgetBreaches = breaches;
      try { await writeFile(historyFile, JSON.stringify(history, null, 2), 'utf-8'); } catch {/* ignore */}
    }
  }
  raw.deltas = deltas;
  await writeFile(RAW_OUT, JSON.stringify(raw, null, 2), 'utf-8');
  // History compaction: consolidate when exceeding compactAfter by summarizing older runs into one aggregated baseline marker
  try {
    const compactAfter = cfg.history?.compactAfter;
    if (compactAfter && history && history.runs && history.runs.length > compactAfter && historyFile) {
      console.log('[diagnose-run] Compaction triggered: runs=', history.runs.length, 'threshold=', compactAfter);
      // Keep the most recent compactAfter runs; aggregate the older ones
      const recent = history.runs.slice(-compactAfter);
      const old = history.runs.slice(0, history.runs.length - compactAfter);
      if (old.length) {
        const median = (vals)=>{ const arr = vals.filter(v=>typeof v==='number'&&!isNaN(v)); if(!arr.length) return null; arr.sort((a,b)=>a-b); const m=Math.floor(arr.length/2); return arr.length%2?arr[m]:(arr[m-1]+arr[m])/2; };
        const agg = {
          ts: new Date().toISOString(),
          compacted: true,
          sourceRuns: old.length,
          success: true,
          lh: { performance: median(old.map(r=>r.lh?.performance)) },
          lhMetrics: {
            cls: median(old.map(r=>r.lhMetrics?.cls)),
            lcp: median(old.map(r=>r.lhMetrics?.lcp)),
            tbt: median(old.map(r=>r.lhMetrics?.tbt)),
            inp: median(old.map(r=>r.lhMetrics?.inp))
          },
          mainBundleGzip: median(old.map(r=>r.mainBundleGzip)),
          totalJsGzip: median(old.map(r=>r.totalJsGzip))
        };
        history.runs = [...recent, agg];
        await writeFile(historyFile, JSON.stringify(history, null, 2), 'utf-8');
        console.log('[diagnose-run] Compaction complete. New run count:', history.runs.length);
      }
    }
  } catch (e) { console.warn('[diagnose-run] Compaction failed (non-fatal):', e.message); }
  // Produce JUnit & SARIF for Lighthouse related failures (if any)
  try {
  const lhFailures = raw.failures.filter(f => String(f.target).startsWith('lighthouse'));
  const assertions = [...(raw.lighthouse?.assertions||[]), ...(raw.regression?.assertions||[])];
  // Add improvement SARIF note entries (not assertions) for visibility
  const improvementMetrics = raw.regression?.improvements || [];
  if (lhFailures.length || assertions.length) {
      // Build JUnit cases from assertions (errors & warnings as failures?)
      const junitCases = [];
      for (const a of assertions) {
        const name = a.id;
        const msgObj = { id: a.id, level: a.level, expected: a.expected, actual: a.actual };
        if (a.level === 'error') {
          junitCases.push(`<testcase classname="lighthouse" name="${name}"><failure message="${name}"><![CDATA[${JSON.stringify(msgObj)}]]></failure></testcase>`);
        } else if (a.level === 'warning') {
          // represent warning as a skipped test for visibility
          junitCases.push(`<testcase classname="lighthouse" name="${name}"><skipped message="warning" /></testcase>`);
        } else {
          junitCases.push(`<testcase classname="lighthouse" name="${name}" />`);
        }
      }
      // Also include any generic lighthouse failures not represented by assertions
      for (const f of lhFailures) {
        if (!assertions.length) {
          const name = f.target + (f.reason? ':'+f.reason:'');
          junitCases.push(`<testcase classname="lighthouse" name="${name}"><failure message="${name}"><![CDATA[${JSON.stringify(f)}]]></failure></testcase>`);
        }
      }
      const failureCount = junitCases.filter(c => c.includes('<failure')).length;
      const junit = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="lighthouse" tests="${junitCases.length}" failures="${failureCount}">${junitCases.join('')}</testsuite>`;
      await writeFile('lighthouse-junit.xml', junit, 'utf-8');
      // SARIF per assertion + generic failures
      const sarifResults = [];
      const sarifRulesMap = new Map();
      const ensureRule = (id, meta) => {
        if (!sarifRulesMap.has(id)) sarifRulesMap.set(id, {
          id,
          name: id,
          shortDescription: { text: meta.short || id },
          fullDescription: { text: meta.full || meta.short || id },
          help: { text: meta.help || 'Threshold or quality gate enforced by preview-diagnose.' },
          defaultConfiguration: { level: meta.level || 'warning' },
          properties: { category: meta.category || 'performance', kind: 'metric' }
        });
      };
      const ruleMeta = (id) => {
        if (id.startsWith('categories.')) {
          const cat = id.split('.')[1];
          return { short: `Lighthouse category score: ${cat}`, category: 'lighthouse', level: 'warning' };
        }
        switch(id) {
          case 'cumulative-layout-shift': return { short:'CLS (layout shift)', category:'web-vitals', level:'warning' };
          case 'largest-contentful-paint': return { short:'LCP (largest contentful paint)', category:'web-vitals', level:'warning' };
          case 'total-blocking-time': return { short:'TBT (total blocking time)', category:'web-vitals', level:'warning' };
          case 'interaction-to-next-paint': return { short:'INP (interaction to next paint)', category:'web-vitals', level:'warning' };
          case 'first-contentful-paint': return { short:'FCP (first contentful paint)', category:'web-vitals', level:'warning' };
          default: return { short: id, category:'lighthouse' };
        }
      };
      for (const a of assertions) {
        ensureRule(a.id, ruleMeta(a.id));
        sarifResults.push({
          ruleId: a.id,
          level: a.level === 'warning' ? 'warning' : (a.level === 'error' ? 'error' : 'note'),
          message: { text: `${a.id} ${a.level}` },
          properties: a
        });
      }
      for (const imp of improvementMetrics) {
        const ruleId = `improvement:${imp.metric}`;
        ensureRule(ruleId, { short: `Improved ${imp.metric}`, category: 'performance', level: 'note' });
        sarifResults.push({
          ruleId,
          level: 'note',
            message: { text: `${imp.metric} improved baseline ${imp.baseline} -> ${imp.current}` },
            properties: imp
        });
      }
      for (const f of lhFailures) {
        sarifResults.push({
          ruleId: f.reason || f.target,
          level: f.severity === 'warning' ? 'warning' : 'error',
          message: { text: `${f.target} ${f.reason || ''}`.trim() },
          properties: f
        });
      }
      const sarifRules = Array.from(sarifRulesMap.values());
      const sarif = { version: '2.1.0', $schema: 'https://json.schemastore.org/sarif-2.1.0.json', runs: [ { tool: { driver: { name: 'preview-diagnose-lighthouse', rules: sarifRules } }, results: sarifResults } ] };
      await writeFile('lighthouse.sarif.json', JSON.stringify(sarif, null, 2), 'utf-8');
    }
  } catch (e) {
    console.warn('[diagnose-run] WARN failed to emit lighthouse JUnit/SARIF:', e.message);
  }
  const html = renderHtml(raw, deltas, cfg, history);
  await writeFile(HTML_OUT, html, 'utf-8');
  console.log('[diagnose-run] Wrote HTML report to', HTML_OUT);
  // Artifact upload (optional) BEFORE notifications so reportUrlEnv or reportUrlFile can be consumed
  function parseCommand(cmdStr){
    const tokens = [];
    let cur = '';
    let inQuotes = false;
    for (let i=0;i<cmdStr.length;i++) {
      const ch = cmdStr[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (!inQuotes && /\s/.test(ch)) { if (cur) { tokens.push(cur); cur=''; } continue; }
      cur += ch;
    }
    if (cur) tokens.push(cur);
    return tokens;
  }
  try {
    if (cfg.artifactUpload?.enabled && cfg.artifactUpload.command) {
      const cmd = cfg.artifactUpload.command;
      const parts = parseCommand(cmd);
      console.log('[diagnose-run] Uploading artifacts with command:', cmd, 'parsed ->', parts);
      if (parts.length) await run(parts[0], parts.slice(1));
      if (cfg.artifactUpload.reportUrlFile && existsSync(cfg.artifactUpload.reportUrlFile)) {
        try {
          const urlTxt = (await readFile(cfg.artifactUpload.reportUrlFile,'utf-8')).trim();
          if (urlTxt) {
            // Map to any configured notifications.reportUrlEnv
            const rEnv = cfg.notifications?.reportUrlEnv || 'REPORT_PUBLIC_URL';
            process.env[rEnv] = urlTxt;
          }
          console.log('[diagnose-run] Loaded report URL from file:', urlTxt);
        } catch (e) { console.warn('[diagnose-run] Could not read reportUrlFile:', e.message); }
      }
    }
  } catch (e) { console.warn('[diagnose-run] Artifact upload failed (non-fatal):', e.message); }
  // Slack notifications (after artifacts & potential upload)
  try {
    const notif = cfg.notifications || {};
    const events = new Set((notif.on||[]).map(s=>String(s)));
    const hasRegressionError = !!(raw.regression?.assertions||[]).find(a=>a.level==='error');
    const failure = !raw.success;
    const allImproved = !!raw.meta.allMetricsImproved;
    // improvement streak: count consecutive runs (including this) where allMetricsImproved flag set
    let improvementStreak = 0;
    if (events.has('improvementStreak') && historyFile && existsSync(historyFile)) {
      try {
        const hist = JSON.parse(await readFile(historyFile,'utf-8'));
        for (let i = hist.runs.length - 1; i >= 0; i--) {
          const r = hist.runs[i];
            if (r.meta?.allMetricsImproved) improvementStreak++; else break;
        }
      } catch {}
    }
    const improvementStreakLen = notif.improvementStreakLength || 3;
    const triggeredEvents = [];
    if (failure && events.has('failure')) triggeredEvents.push('failure');
    if (hasRegressionError && events.has('regressionFail')) triggeredEvents.push('regressionFail');
    if (allImproved && events.has('improvement')) triggeredEvents.push('improvement');
    if (improvementStreak >= improvementStreakLen && events.has('improvementStreak')) triggeredEvents.push('improvementStreak');
    if (triggeredEvents.length) {
      // Determine webhooks to send to (dedupe)
      const webhooks = new Set();
      for (const ev of triggeredEvents) {
        const envName = (notif.webhooks||{})[ev];
        if (envName && process.env[envName]) webhooks.add(process.env[envName]);
      }
      if (!webhooks.size && notif.slackWebhookEnv && process.env[notif.slackWebhookEnv]) {
        webhooks.add(process.env[notif.slackWebhookEnv]);
      }
      if (webhooks.size) {
        const summaryLines = [];
        if (failure) summaryLines.push(`Status: FAIL (${raw.failures.length} failure(s))`);
        else summaryLines.push('Status: PASS');
        if (hasRegressionError) summaryLines.push('Regression: FAIL');
        if (allImproved) summaryLines.push('All metrics improved');
        if (improvementStreak >= improvementStreakLen) summaryLines.push(`Improvement streak: ${improvementStreak}`);
        if (raw.lighthouse?.scores) {
          const s = raw.lighthouse.scores;
          summaryLines.push(`LH perf ${s.performance} acc ${s.accessibility} bp ${s['best-practices']} seo ${s.seo}`);
        }
        if (raw.regression?.baseline) {
          const b = raw.regression.baseline;
          if (b.perf != null && raw.lighthouse?.scores?.performance != null) summaryLines.push(`Perf Δ ${(raw.lighthouse.scores.performance - b.perf).toFixed(3)}`);
        }
        // Top failing assertions (truncate)
        const maxFails = notif.maxFailuresInMessage || 5;
        if (raw.failures?.length) {
          const slice = raw.failures.slice(0, maxFails);
          summaryLines.push(`Failures: ${slice.map(f=>f.target).join(', ')}${raw.failures.length>slice.length?'…':''}`);
        }
        // Artifact report URL
        let reportLink = 'diagnose-report.html (local artifact)';
        if (notif.reportUrlEnv && process.env[notif.reportUrlEnv]) {
          reportLink = process.env[notif.reportUrlEnv];
        }
        const payloadBase = `[preview-diagnose] ${summaryLines.join(' | ')}\nReport: ${reportLink}`;
        for (const urlStr of webhooks) {
          try {
            const url = new URL(urlStr);
            const payload = { text: payloadBase };
            await new Promise((resolve,reject)=>{
              const req = httpsRequest({ method:'POST', hostname:url.hostname, path:url.pathname+url.search, protocol:url.protocol, headers:{'Content-Type':'application/json'}}, res=>{res.on('data',()=>{});res.on('end',resolve);});
              req.on('error',reject); req.write(JSON.stringify(payload)); req.end();
            });
          } catch (e) {
            console.warn('[diagnose-run] Slack send failed:', e.message);
          }
        }
        console.log('[diagnose-run] Slack notifications sent to', webhooks.size, 'endpoint(s).');
      }
    }
  } catch (e) { console.warn('[diagnose-run] Slack notification failed:', e.message); }
  if (ESTABLISH_BASELINE) {
    // Force success for this run (do not modify original failures for transparency)
    raw.meta.baselineForced = true;
    raw.success = true;
    await writeFile(RAW_OUT, JSON.stringify(raw, null, 2), 'utf-8');
    // Also patch history last run success flag so future regression baseline picks it up
    try {
      const historyFile = cfg.history?.file || cfg.historyFile;
      if (historyFile && existsSync(historyFile)) {
        const hist = JSON.parse(await readFile(historyFile,'utf-8'));
        if (hist.runs && hist.runs.length) {
          const last = hist.runs[hist.runs.length-1];
          if (last.ts === raw.meta.endTime) {
            last.success = true;
            last.meta = last.meta || {};
            last.meta.baselineForced = true;
            await writeFile(historyFile, JSON.stringify(hist, null, 2), 'utf-8');
          }
        }
      }
    } catch (e) { console.warn('[diagnose-run] Unable to patch history for forced baseline:', e.message); }
  }
  if (!ESTABLISH_BASELINE && (diagnoseCode !== 0 || !raw.success)) {
    console.warn(`[diagnose-run] Underlying diagnose exitCode=${diagnoseCode} success=${raw.success}. Exiting with code 1 after artifact generation.`);
    process.exit(1);
  }

  // Post-success ratchet logic (only when run truly succeeded without forced baseline)
  try {
    if (!ESTABLISH_BASELINE && raw.success) {
      const ratchetCfg = cfg.ratchet || {};
      if (ratchetCfg.enabled) {
        const historyFile = cfg.history?.file || cfg.historyFile;
        let history = null;
        if (historyFile && existsSync(historyFile)) {
          try { history = JSON.parse(await readFile(historyFile,'utf-8')); } catch { history = null; }
        }
        const statePath = ratchetCfg.stateFile || 'diagnostics.ratchet.json';
        const ratchetState = await loadRatchetState(statePath);
        const evalResult = evaluateRatchet(history, cfg, ratchetState);
        if (evalResult) {
          const { updatedConfig, updatedState, change } = evalResult;
          // Persist updated config thresholds
          try {
            await writeFile(CONFIG_PATH, JSON.stringify(updatedConfig, null, 2), 'utf-8');
            console.log('[diagnose-run] Ratchet applied:', change.map(c=>`${c.metric}:${c.from}->${c.to}`).join(', '));
          } catch (e) {
            console.warn('[diagnose-run] Unable to persist updated config:', e.message);
          }
          await saveRatchetState(statePath, updatedState);
        } else {
          if (ratchetCfg.verbose) console.log('[diagnose-run] Ratchet: no tightening this run.');
        }
      }
    }
  } catch (e) {
    console.warn('[diagnose-run] Ratchet evaluation failed (non-fatal):', e.message);
  }
}

main().catch(e => { console.error('[diagnose-run] Fatal:', e); process.exit(1); });
