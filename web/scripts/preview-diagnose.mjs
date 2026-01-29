#!/usr/bin/env node
/**
 * preview-diagnose.mjs
 * Enhanced diagnostic harness for static production preview:
 *  - Optionally builds (skip with --no-build)
 *  - Starts fallback static server (serve-dist-fallback.mjs) on configurable port
 *  - Discovers main bundle from dist/index.html
 *  - Probes an extended route list: /, /learn-more, /preview-questions, /preview, /explore, /convene
 *  - Measures response status, byte length, latency (ms)
 *  - Supports performance thresholds (--max-html-ms, --max-bundle-ms, --max-ms universal)
 *  - JSON output mode (--json) with optional file output (--out=path)
 *  - Exits non-zero on any failed fetch, non-200, empty content, or threshold breach
 *  - Route override: --routes="/ /foo /bar" (space- or comma-separated)
 *  - SRI/hash validation for main bundle vs inline script tag (--check-sri)
 *  - Rolling history aggregation (--history=diagnose-history.json [--history-max=50])
 *  - Optional Lighthouse gating (--lighthouse --lhci-config=path --min-performance=0.9 etc.)
 *  - --fail-on-warning escalates non-fatal warnings (like missing SRI) to failures
 *  - Multi-bundle support: collects additional lazy chunk JS files referenced by index.html
 *  - Gzip size capture for bundles (reads dist file & gzips in-memory)
 *  - CSS asset discovery (dist/*.css) with raw+gzip size reporting
 *  - Histogram stats (p50/p90/p95) appended to history for html route timings
 *  - Playwright smoke integration: --playwright-smoke executes a minimal test selection and captures pass/fail
 */
import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'module';
import { setTimeout as delay } from 'node:timers/promises';
import { writeFile } from 'node:fs/promises';
import { loadDiagnosticsConfig } from './lib/config.mjs';
import { discoverBundles, probe } from './lib/probes.mjs';
import { enumerateCssAssets, computeSha256Base64, gzipSize } from './lib/assets.mjs';
import { loadHistory as loadHistLib, saveHistory as saveHistLib, appendRun } from './lib/history.mjs';
import { runLighthouseCollect, buildLighthouseAssertions } from './lib/lighthouse.mjs';
import { writeFile as writeTempFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);

// Simple arg parsing
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const getVal = (prefix, fallback) => {
  const arg = argv.find(a => a.startsWith(prefix + '='));
  if (!arg) return fallback;
  return arg.substring(prefix.length + 1);
};

const PORT = parseInt(process.env.DIAG_PORT || getVal('--port', '5085'), 10);
const HOST = `http://localhost:${PORT}`;
const BUILD_IF_NEEDED = !has('--no-build');
const MAX_WAIT_MS = parseInt(getVal('--wait', '8000'), 10);
const POLL_INTERVAL_MS = 400;
const JSON_MODE = has('--json');
const OUT_FILE = getVal('--out', '');
const MAX_HTML_MS = parseInt(getVal('--max-html-ms', '0'), 10); // 0 = disabled
const MAX_BUNDLE_MS = parseInt(getVal('--max-bundle-ms', '0'), 10);
const MAX_MS = parseInt(getVal('--max-ms', '0'), 10); // universal fallback threshold
const ROUTES_OVERRIDE = getVal('--routes', '').trim();
const CHECK_SRI = has('--check-sri');
const HISTORY_FILE = getVal('--history', '');
const HISTORY_MAX = parseInt(getVal('--history-max', '25'), 10);
const USE_LH = has('--lighthouse');
const LH_MIN_PERF = parseFloat(getVal('--min-performance', '0')) || 0; // 0 disables gating
const LH_MIN_ACCESS = parseFloat(getVal('--min-accessibility', '0')) || 0;
const LH_MIN_BEST = parseFloat(getVal('--min-best-practices', '0')) || 0;
const LH_MIN_SEO = parseFloat(getVal('--min-seo', '0')) || 0;
const LH_MIN_PWA = parseFloat(getVal('--min-pwa', '0')) || 0; // seldom used
const LHCI_CONFIG = getVal('--lhci-config', '');
const FAIL_ON_WARNING = has('--fail-on-warning');
const PLAYWRIGHT_SMOKE = has('--playwright-smoke');
const PLAYWRIGHT_PATTERN = getVal('--pw-pattern', '');
const LIGHTHOUSE_STRICT = has('--lighthouse-strict');
const LH_MAX_CLS = parseFloat(getVal('--max-cls','0')) || 0; // 0 disables
const LH_MAX_LCP_MS = parseFloat(getVal('--max-lcp-ms','0')) || 0;
const LH_MAX_TBT_MS = parseFloat(getVal('--max-tbt-ms','0')) || 0;
const LH_MAX_INP_MS = parseFloat(getVal('--max-inp-ms','0')) || 0;
const LH_MAX_FCP_MS = parseFloat(getVal('--max-fcp-ms','0')) || 0;
const LH_FAIL_ASSERTIONS = has('--fail-lh-assertions');

function log(msg) { if (!JSON_MODE) console.log(`[diagnose] ${msg}`); }
function warn(msg) { if (!JSON_MODE) console.warn(`[diagnose] WARN: ${msg}`); }
function fail(msg) { if (!JSON_MODE) console.error(`[diagnose] ERROR: ${msg}`); }

async function run(cmd, args, opts={}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
    child.on('exit', code => code === 0 ? resolve(code) : reject(new Error(`${cmd} exited ${code}`)));
  });
}

async function ensureBuild() {
  if (!BUILD_IF_NEEDED) { log('Skipping build (--no-build set)'); return; }
  log('Running production build...');
  await run('npm', ['run', 'build']);
  log('Build complete.');
}

let serverProc = null;

async function startServer() {
  log(`Starting fallback server on ${PORT}...`);
  serverProc = spawn('node', ['scripts/serve-dist-fallback.mjs'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProc.stdout.on('data', d => {
    const txt = d.toString();
    if (txt.includes('[serve-dist-fallback]')) process.stdout.write(txt);
  });
  serverProc.stderr.on('data', d => process.stderr.write(d));
  // Wait until server responds
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    try {
      const r = await fetch(HOST + '/');
      if (r.ok) { log('Server is responding.'); return; }
    } catch { /* retry */ }
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error('Server did not become ready in time');
}

// Removed legacy inline implementations (migrated to lib/* modules)

async function main() {
  const failures = [];
  const results = [];
  let bundle = '';
  let bundleIntegrity = null;
  let bundleHashComputed = null;
  let extraBundles = [];
  let bundleGzipBytes = null;
  const gzipSizes = [];
  let lighthouse = null;
  let playwright = null;
  const cssAssets = [];
  const meta = { startTime: new Date().toISOString(), host: HOST, port: PORT };
  try {
    await ensureBuild();
    await startServer();
    const disc = await discoverBundles();
    bundle = disc.bundles[0].src;
    bundleIntegrity = disc.bundles[0].integrity;
    extraBundles = disc.bundles.slice(1).map(b => b.src);

    let routes = ['/', '/learn-more', '/preview-questions', '/preview', '/explore', '/convene'];
    if (ROUTES_OVERRIDE) {
      const delim = ROUTES_OVERRIDE.includes(',') ? /[,]+/ : /\s+/;
      routes = ROUTES_OVERRIDE.split(delim).map(r => r.trim()).filter(Boolean);
      log(`Using overridden routes (${routes.length}): ${routes.join(', ')}`);
    }
    const targets = [
      ...routes.map(r => ({ label: r, type: 'html', url: HOST + r })),
      { label: 'bundle:main', type: 'bundle', url: HOST + bundle },
      ...extraBundles.map((b, i) => ({ label: `bundle:extra:${i+1}`, type: 'bundle', url: HOST + b }))
    ];

    log('Probing routes/assets...');
    for (const t of targets) {
      const result = await probe(t.url);
      const record = { target: t.label, type: t.type, ...result };
      results.push(record);
      if (!result.ok) {
        failures.push({ target: t.label, reason: 'fetch-failed', detail: result });
        fail(`${t.label} -> FAILED (${result.status || result.error || 'no-status'})`);
        continue;
      }
      // Threshold checks
      const ms = (result).ms;
      if (ms != null) {
        const htmlThreshold = t.type === 'html' && MAX_HTML_MS > 0 && ms > MAX_HTML_MS;
        const bundleThreshold = t.type === 'bundle' && MAX_BUNDLE_MS > 0 && ms > MAX_BUNDLE_MS;
        const universal = MAX_MS > 0 && ms > MAX_MS;
        if (htmlThreshold || bundleThreshold || universal) {
          failures.push({ target: t.label, reason: 'perf-threshold', ms, thresholds: { MAX_HTML_MS, MAX_BUNDLE_MS, MAX_MS } });
          fail(`${t.label} -> PERF BREACH ${ms}ms`);
        } else {
          log(`${t.label} -> ${result.status} ${result.length}B ${ms}ms`);
        }
      }
      if (result.length === 0) {
        failures.push({ target: t.label, reason: 'empty-content' });
        fail(`${t.label} -> EMPTY CONTENT`);
      }
    }

    // Enumerate CSS assets (independent of SRI) for size reporting
    try {
      const scanDirs = ['dist', 'dist/assets'];
      for (const dir of scanDirs) {
        try {
          const entries = await readdir(dir);
          const cssFiles = entries.filter(f => f.endsWith('.css'));
          for (const file of cssFiles) {
            try {
              const fullPath = dir + '/' + file;
              const buf = await readFile(fullPath);
              const raw = buf.byteLength;
              let gz = null;
              try { const zlib = await import('node:zlib'); gz = zlib.gzipSync(buf).byteLength; } catch { /* ignore */ }
              cssAssets.push({ file: (dir==='dist'?'': 'assets/') + file, raw, gzip: gz });
            } catch {/* ignore individual css errors */}
          }
        } catch {/* ignore subdir errors */}
      }
    } catch {/* ignore directory errors */}

    // Always capture gzip sizes & optional SRI validation
    try {
      const mainRes = await fetch(HOST + bundle);
      const mainBuf = await mainRes.arrayBuffer();
      // gzip size capture for main bundle
      try {
        const zlib = await import('node:zlib');
        bundleGzipBytes = zlib.gzipSync(Buffer.from(mainBuf)).byteLength;
        gzipSizes.push({ target: 'bundle:main', gzip: bundleGzipBytes });
      } catch { /* ignore gzip errors */ }
      if (CHECK_SRI) {
        bundleHashComputed = await computeSha256Base64(mainBuf);
        if (bundleIntegrity && bundleIntegrity !== bundleHashComputed) {
          failures.push({ target: 'bundle:main', reason: 'sri-mismatch', expected: bundleIntegrity, actual: bundleHashComputed });
          fail(`SRI mismatch: expected ${bundleIntegrity} got ${bundleHashComputed}`);
        } else if (!bundleIntegrity) {
          const msg = 'No integrity attribute for main bundle.';
          if (FAIL_ON_WARNING) {
            failures.push({ target: 'bundle:main', reason: 'sri-missing' });
            fail(msg);
          } else {
            warn(msg + ' (use --fail-on-warning to escalate)');
          }
        }
      }
      // Extra bundles gzip sizes
      for (const bSrc of extraBundles) {
        try {
          const r = await fetch(HOST + bSrc);
          const buf = Buffer.from(await r.arrayBuffer());
          const zlib = await import('node:zlib');
          const gz = zlib.gzipSync(buf).byteLength;
          gzipSizes.push({ target: bSrc, gzip: gz });
        } catch { /* ignore */ }
      }
    } catch (e) {
      if (CHECK_SRI) {
        failures.push({ target: 'bundle:main', reason: 'sri-error', error: e.message });
        fail(`SRI/Sizing step failed: ${e.message}`);
      } else {
        warn(`Bundle sizing skipped due to error: ${e.message}`);
      }
    }

    // Lighthouse (modular) – root route only
    if (USE_LH) {
      log('Running Lighthouse collection (modular)...');
      // Load global diagnostics config to allow dynamic threshold override (ratchet / relaxed gates)
      let diagCfg = null;
      try { diagCfg = await loadDiagnosticsConfig(); } catch { diagCfg = null; }
      // Generate temporary LHCI config so printed expectations match relaxed thresholds.
      let tempConfigPath = LHCI_CONFIG; // allow explicit override to win
      if (!tempConfigPath && diagCfg?.lighthouse) {
        try {
          const ms = diagCfg.lighthouse.minScores || {};
          const mv = diagCfg.lighthouse.maxVitals || {};
          const extra = diagCfg.lighthouse.extraAssertions || {};
          const assertions = {};
          if (ms.performance) assertions['categories:performance'] = ['error', { minScore: ms.performance }];
          if (ms.accessibility) assertions['categories:accessibility'] = ['error', { minScore: ms.accessibility }];
          if (ms['best-practices']) assertions['categories:best-practices'] = ['error', { minScore: ms['best-practices'] }];
          if (ms.seo) assertions['categories:seo'] = ['error', { minScore: ms.seo }];
          if (mv.cls) assertions['cumulative-layout-shift'] = ['error', { maxNumericValue: mv.cls }];
          if (mv.lcp) assertions['largest-contentful-paint'] = ['warn', { maxNumericValue: mv.lcp }];
            if (mv.tbt) assertions['total-blocking-time'] = ['warn', { maxNumericValue: mv.tbt }];
            if (mv.inp) assertions['interaction-to-next-paint'] = ['warn', { maxNumericValue: mv.inp }];
            if (mv.fcp) assertions['first-contentful-paint'] = ['warn', { maxNumericValue: mv.fcp }];
          for (const [auditId, val] of Object.entries(extra)) {
            if (typeof val === 'number' && val > 0) assertions[auditId] = ['warn', { maxNumericValue: val }];
          }
          const temp = { ci: { assert: { assertions }, upload: { target: 'filesystem' } } };
          await writeTempFile('lhci-temp.config.json', JSON.stringify(temp, null, 2), 'utf-8');
          tempConfigPath = 'lhci-temp.config.json';
        } catch (e) { warn('Failed to write temp LHCI config: ' + e.message); }
      }
      lighthouse = await runLighthouseCollect(HOST + '/', tempConfigPath);
      if (lighthouse && lighthouse.scores) {
        // Derive effective thresholds (CLI flags still act as overrides if provided explicitly)
        const cfgMin = diagCfg?.lighthouse?.minScores || {};
        const cfgMax = diagCfg?.lighthouse?.maxVitals || {};
        const extraAssertions = diagCfg?.lighthouse?.extraAssertions || {};
        const effectiveMin = {
          performance: LH_MIN_PERF || cfgMin.performance || 0,
          accessibility: LH_MIN_ACCESS || cfgMin.accessibility || 0,
          'best-practices': LH_MIN_BEST || cfgMin['best-practices'] || 0,
          seo: LH_MIN_SEO || cfgMin.seo || 0,
          pwa: LH_MIN_PWA || cfgMin.pwa || 0
        };
        const effectiveMax = {
          cls: LH_MAX_CLS || cfgMax.cls || 0,
          lcp: LH_MAX_LCP_MS || cfgMax.lcp || 0,
          tbt: LH_MAX_TBT_MS || cfgMax.tbt || 0,
          inp: LH_MAX_INP_MS || cfgMax.inp || 0,
          fcp: LH_MAX_FCP_MS || cfgMax.fcp || 0
        };
        const lhCfg = { lighthouse: { minScores: effectiveMin, maxVitals: effectiveMax, warnMargins: diagCfg?.lighthouse?.warnMargins } };
        const assertions = buildLighthouseAssertions(lighthouse, lhCfg);
        // Inject extra assertions (currently unused-javascript threshold) if metrics present
        for (const [auditId, maxVal] of Object.entries(extraAssertions)) {
          if (typeof maxVal === 'number' && maxVal > 0 && lighthouse?.metrics) {
            // We need audit numeric value: salvage from last report. For now parse from .lighthouseci last report.
            // (Simpler approach: find already collected numeric value in lhr salvage again.)
            // We'll attempt to parse latest LH JSON here quickly to inspect audit actual value.
            try {
              const { readdir, readFile } = await import('node:fs/promises');
              const files = await readdir('.lighthouseci').catch(()=>[]);
              const latest = files.filter(f=>f.endsWith('.report.json')).sort().slice(-1)[0];
              if (latest) {
                const lhrRaw = JSON.parse(await readFile('.lighthouseci/'+latest,'utf-8'));
                const audit = lhrRaw?.audits?.[auditId];
                const numeric = audit?.numericValue;
                if (typeof numeric === 'number') {
                  const level = numeric > maxVal ? 'error' : 'info';
                  assertions.push({ id: auditId, level, expected: `<=${maxVal}`, actual: numeric });
                }
              }
            } catch {/* ignore extra assertion parse errors */}
          }
        }
        lighthouse.assertions = assertions;
        const failureMap = {
          'categories.performance':'lh-threshold',
          'categories.accessibility':'lh-threshold',
          'categories.best-practices':'lh-threshold',
          'categories.seo':'lh-threshold',
          'categories.pwa':'lh-threshold',
          'cumulative-layout-shift':'cls-threshold',
          'largest-contentful-paint':'lcp-threshold',
          'total-blocking-time':'tbt-threshold',
          'interaction-to-next-paint':'inp-threshold',
          'first-contentful-paint':'fcp-threshold'
        };
        for (const a of assertions) {
          if (a.level === 'error') {
            const reason = failureMap[a.id] || 'lh-threshold';
            const payload = { target: 'lighthouse:' + a.id.replace(/^categories\./,''), reason, actual: a.actual };
            if (a.expected?.startsWith('>=')) payload.min = parseFloat(a.expected.substring(2));
            if (a.expected?.startsWith('<=')) payload.max = parseFloat(a.expected.substring(2));
            failures.push(payload);
            fail(`Lighthouse assertion ${a.id} ${a.actual} vs ${a.expected}`);
          }
        }
        if (LH_FAIL_ASSERTIONS && lighthouse.error) {
          failures.push({ target: 'lighthouse:assertions', reason: 'assert-failure', error: lighthouse.error });
          fail(`Lighthouse assertions failed: ${lighthouse.error}`);
        }
      } else if (lighthouse && lighthouse.error) {
        const msg = `Lighthouse run error (mode=${lighthouse.mode} retries=${lighthouse.retries}): ${lighthouse.error}`;
        if (LIGHTHOUSE_STRICT) {
          failures.push({ target: 'lighthouse', reason: 'lh-error', error: lighthouse.error, mode: lighthouse.mode, retries: lighthouse.retries });
          fail(msg);
        } else {
          failures.push({ target: 'lighthouse', reason: 'lh-error', error: lighthouse.error, mode: lighthouse.mode, retries: lighthouse.retries, severity: 'warning' });
          warn(msg);
        }
      }
    }

    // Playwright smoke tests (optional)
    if (PLAYWRIGHT_SMOKE) {
      try {
        const args = ['playwright', 'test', '--reporter=list'];
        if (PLAYWRIGHT_PATTERN) args.push(PLAYWRIGHT_PATTERN);
        // Light env tweaks can be added here (e.g., limiting workers)
        await run('npx', args);
        playwright = { passed: true };
      } catch (e) {
        playwright = { passed: false, error: e.message };
        failures.push({ target: 'playwright:smoke', reason: 'smoke-failed', error: e.message });
      }
    }
  } catch (e) {
    fail(e.message);
    failures.push({ target: 'setup', reason: 'exception', error: e.message });
  } finally {
    if (serverProc) serverProc.kill();
  }

  const summary = {
    meta: { ...meta, endTime: new Date().toISOString(), build: BUILD_IF_NEEDED, bundle, extraBundles, integrity: bundleIntegrity, sriHash: bundleHashComputed, gzipSizes, cssAssets },
    results,
    lighthouse,
    playwright,
    failures,
    success: failures.length === 0
  };

  // History aggregation
  if (HISTORY_FILE) {
  const history = (await loadHistLib(HISTORY_FILE)) || { runs: [] };
    const htmlPerf = summary.results.filter(r => r.type==='html').map(r => r.ms).filter(v => typeof v === 'number');
    htmlPerf.sort((a,b)=>a-b);
    const pct = (arr,p) => arr.length ? arr[Math.min(arr.length-1, Math.floor(p/100 * (arr.length-1)))] : null;
  const p50 = pct(htmlPerf,50); const p90 = pct(htmlPerf,90); const p95 = pct(htmlPerf,95);
  const totalCssGzip = (summary.meta.cssAssets||[]).reduce((a,c)=> a + (c.gzip||0), 0);
  const mainBundleGzip = (summary.meta.gzipSizes||[]).find(g=>g.target==='bundle:main')?.gzip || 0;
  const totalJsGzip = (summary.meta.gzipSizes||[]).reduce((a,c)=> a + (c.gzip||0), 0);
    appendRun(history, { ts: summary.meta.endTime, success: summary.success, perf: summary.results.filter(r => r.type==='html').map(r => ({ target: r.target, ms: r.ms })), p50, p90, p95, bundleMs: summary.results.find(r => r.type==='bundle')?.ms, lh: lighthouse?.scores, lhMetrics: lighthouse?.metrics ? { cls: lighthouse.metrics.cls, lcp: lighthouse.metrics.lcp, tbt: lighthouse.metrics.tbt, inp: lighthouse.metrics.inp, fcp: lighthouse.metrics.fcp } : undefined, smoke: playwright?.passed, totalCssGzip, mainBundleGzip, totalJsGzip });
    await saveHistLib(HISTORY_FILE, history, HISTORY_MAX);
  }

  if (JSON_MODE) {
    const json = JSON.stringify(summary, null, 2);
    if (OUT_FILE) {
      await writeFile(OUT_FILE, json, 'utf-8');
    } else {
      process.stdout.write(json + '\n');
    }
  } else {
    if (summary.success) {
      console.log('\n[diagnose] Summary: PASS');
    } else {
      console.log('\n[diagnose] Summary: FAIL');
      for (const f of failures) console.log(' -', f.target, '=>', JSON.stringify(f));
    }
  }

  if (!summary.success) process.exit(1);
}

main();
