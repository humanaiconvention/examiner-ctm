#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeSparkline, computeDeltas } from './analytics-size-util.mjs';

// Lazy Ajv load (devDependency) only if schema validation requested
let Ajv = null;

// Node 18+ has brotli built-in via zlib
const hasBrotli = typeof zlib.brotliCompressSync === 'function';

// Analytics chunk size budget enforcement.
// Features:
//  - Reads budgets from analytics-budgets.json (supports gzipKB + optional brotliKB, floorKB, locked)
//  - Computes gzip and (optionally) brotli sizes; dual enforcement if brotli limit present
//  - CLI overrides --max-<chunk>=KB (gzip only override)
//  - --write-baseline updates gzip (and brotli if measured) budgets file to current sizes (requires --force or no failures)
//  - Optional stability requirement: --stable-runs=N (paired with a simple counter file)
//  - Slack/webhook alert: env SLACK_WEBHOOK_URL or --slack-webhook=<url>
//  - JSON & Markdown artifacts (for PR consumption)
//  - Trend ratchet (future in this patch series) will reduce budgets after sustained headroom

const args = process.argv.slice(2);
const argSet = new Set(args);
const overrides = {};
let writeBaseline = false;
let stableRunsRequired = 0;
let slackWebhook = process.env.SLACK_WEBHOOK_URL || '';
let forceBaseline = false;
let disableBrotli = false;
// Ratchet parameters (configured later by CLI). Defaults inert.
let ratchetAfter = 0; // number of improving runs required
let ratchetPercent = 0; // percent reduction applied (e.g. 5 => 5%)
let ratchetHeadroomThreshold = 0; // require at least this headroom before counting as improving
let globalMinFloor = 0; // don't reduce below this (KB)
let ratchetCooldown = 0; // new: number of successful improving cycles required between reductions
let schemaMode = 'off'; // 'warn' | 'fail' | 'off'
let updateMissingBrotli = false; // auto write brotli baseline if missing
let prComment = false; // attempt to post PR comment
let prNumber = null; // explicit PR number override
let schemaStrict = false; // enforce no unknown chunk keys
let historyWindowOverride = null; // custom sparkline window size
let jsonOutPath = null; // custom JSON artifact path
let dynamicChunks = null; // user supplied chunk list
for (const a of args) {
  let m = a.match(/^--max-(core|engagement|perf|errors)=(\d+(?:\.\d+)?)$/);
  if (m) { overrides[m[1]] = Number(m[2]); continue; }
  if (a === '--write-baseline') { writeBaseline = true; continue; }
  if (a === '--no-brotli') { disableBrotli = true; continue; }
  m = a.match(/^--stable-runs=(\d+)$/); if (m) { stableRunsRequired = Number(m[1]); continue; }
  m = a.match(/^--slack-webhook=(https?:.+)$/); if (m) { slackWebhook = m[1]; continue; }
  if (a === '--force') forceBaseline = true;
  m = a.match(/^--ratchet-after=(\d+)$/); if (m) { ratchetAfter = Number(m[1]); continue; }
  m = a.match(/^--ratchet-percent=(\d+(?:\.\d+)?)$/); if (m) { ratchetPercent = Number(m[1]); continue; }
  m = a.match(/^--headroom-threshold=(\d+(?:\.\d+)?)$/); if (m) { ratchetHeadroomThreshold = Number(m[1]); continue; }
  m = a.match(/^--min-floor=(\d+(?:\.\d+)?)$/); if (m) { globalMinFloor = Number(m[1]); continue; }
  m = a.match(/^--ratchet-cooldown=(\d+)$/); if (m) { ratchetCooldown = Number(m[1]); continue; }
  m = a.match(/^--schema-mode=(off|warn|fail)$/); if (m) { schemaMode = m[1]; continue; }
  if (a === '--schema-strict') { schemaStrict = true; continue; }
  m = a.match(/^--history-window=(\d+)$/); if (m) { historyWindowOverride = Number(m[1]); continue; }
  if (a === '--update-missing-brotli') { updateMissingBrotli = true; continue; }
  if (a === '--pr-comment') { prComment = true; continue; }
  m = a.match(/^--pr-number=(\d+)$/); if (m) { prNumber = Number(m[1]); continue; }
  m = a.match(/^--json-out=(.+)$/); if (m) { jsonOutPath = m[1]; continue; }
  m = a.match(/^--chunks=([a-z0-9_,\-]+)$/i); if (m) { dynamicChunks = m[1].split(',').map(s=>s.trim()).filter(Boolean); continue; }
}

// Load budgets file
const projRoot = process.cwd();
const budgetsPath = path.resolve(projRoot, 'analytics-budgets.json');
let budgets = { chunks: { core: { gzipKB: 8 }, engagement: { gzipKB: 10 }, perf: { gzipKB: 12 }, errors: { gzipKB: 6 } }, notes: 'auto-generated if missing' };
let schemaValidationErrors = [];
try {
  if (fs.existsSync(budgetsPath)) {
    const raw = JSON.parse(fs.readFileSync(budgetsPath, 'utf8'));
    if (raw && raw.chunks) budgets = raw;
    // Schema validation (if enabled)
  if (schemaMode !== 'off') {
      try {
        if (!Ajv) {
          // dynamic import to avoid cost if unused
          const mod = await import('ajv');
          Ajv = mod.default || mod; // ESM/CJS interop
        }
        const ajv = new Ajv({ allErrors: true, strict: false });
        const schemaPath = path.resolve(projRoot, 'analytics-budgets.schema.json');
        if (fs.existsSync(schemaPath)) {
          const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
          const validate = ajv.compile(schema);
          const valid = validate(budgets);
          if (!valid) {
            schemaValidationErrors = validate.errors || [];
            const msg = '[analytics-size-check] Budget schema validation errors:\n' + schemaValidationErrors.map(e => ' - ' + e.instancePath + ' ' + e.message).join('\n');
            if (schemaMode === 'warn') console.warn(msg);
            else if (schemaMode === 'fail') {
              console.error(msg);
            }
          }
          // schema-strict: ensure only known chunk keys appear if requested
          if (schemaStrict) {
            const allowed = new Set(Object.keys(budgets.chunks));
            // Allowed canonical keys from schema (core, engagement, perf, errors)
            const canonical = dynamicChunks && dynamicChunks.length ? dynamicChunks : ['core','engagement','perf','errors'];
            const rawKeys = Object.keys(budgets.chunks);
            const unknown = rawKeys.filter(k => !canonical.includes(k));
            if (unknown.length) {
              const msg = '[analytics-size-check] Unknown chunk keys (schema-strict): ' + unknown.join(', ');
              if (schemaMode === 'warn') console.warn(msg);
              else if (schemaMode === 'fail') {
                console.error(msg);
                schemaValidationErrors.push({ instancePath: '/chunks', message: 'unknown chunk keys: '+unknown.join(', ') });
              }
            }
          }
        } else if (schemaMode !== 'off') {
          console.warn('[analytics-size-check] Schema validation requested but analytics-budgets.schema.json not found.');
        }
      } catch (e) {
        console.warn('[analytics-size-check] Schema validation failed to execute:', e.message);
      }
    }
  }
} catch (e) {
  console.warn('[analytics-size-check] Failed to load budgets file:', e.message);
}

// Apply CLI overrides
for (const k of Object.keys(overrides)) {
  if (!budgets.chunks[k]) budgets.chunks[k] = { gzipKB: overrides[k] }; else budgets.chunks[k].gzipKB = overrides[k];
}

const distDir = path.resolve(projRoot, 'dist');
if (!fs.existsSync(distDir)) {
  console.error('[analytics-size-check] dist directory not found. Run build first.');
  process.exit(1);
}

function gzipSize(buf) {
  return zlib.gzipSync(buf, { level: 9 }).length;
}
function brotliSize(buf) {
  if (!hasBrotli) return null;
  return zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
}

// Determine chunk list & regex
const chunkList = (dynamicChunks && dynamicChunks.length) ? dynamicChunks : ['core','engagement','perf','errors'];
// Provide default budgets stub for any dynamic chunks not in budgets
for (const ch of chunkList) {
  if (!budgets.chunks[ch]) budgets.chunks[ch] = { gzipKB: 9999 };
}
const chunkRegex = new RegExp(`analytics-(${chunkList.join('|')})-.+\\.js$`);
let files = fs.readdirSync(distDir).filter(f => chunkRegex.test(f));
// If not found at root of dist, look under dist/assets (Vite default)
if (!files.length) {
  const assetsDir = path.join(distDir, 'assets');
  if (fs.existsSync(assetsDir)) {
  files = fs.readdirSync(assetsDir).filter(f => chunkRegex.test(f)).map(f => path.join('assets', f));
  }
}
if (!files.length) {
  console.warn('[analytics-size-check] No analytics chunk files found. Skipping.');
  process.exit(0);
}

let failed = false;
const report = [];
for (const file of files) {
  const match = file.match(chunkRegex);
  if (!match) continue;
  const kind = match[1];
  const raw = fs.readFileSync(path.join(distDir, file));
  const gz = gzipSize(raw);
  const brot = (!disableBrotli && hasBrotli) ? brotliSize(raw) : null;
  const gzipKB = gz / 1024;
  const brotliKB = brot != null ? brot / 1024 : null;
  const chunkBudget = budgets.chunks[kind] || { gzipKB: 9999 };
  const gzipLimit = chunkBudget.gzipKB ?? 9999;
  const brotliLimit = chunkBudget.brotliKB ?? null;
  const gzipHeadroom = gzipLimit - gzipKB;
  const brotliHeadroom = brotliLimit != null ? brotliLimit - brotliKB : null;
  let ok = gzipKB <= gzipLimit;
  if (ok && brotliLimit != null && brotliKB != null) ok = brotliKB <= brotliLimit;
  if (!ok) failed = true;
  report.push({
    chunk: kind,
    file,
    gzipKB: Number(gzipKB.toFixed(2)),
    gzipLimitKB: gzipLimit,
    gzipHeadroomKB: Number(gzipHeadroom.toFixed(2)),
    brotliKB: brotliKB != null ? Number(brotliKB.toFixed(2)) : null,
    brotliLimitKB: brotliLimit,
    brotliHeadroomKB: brotliHeadroom != null ? Number(brotliHeadroom.toFixed(2)) : null,
    status: ok ? 'OK' : 'FAIL'
  });
}

// History tracking for sparklines
const historyPath = path.resolve(projRoot, '.analytics-size-history.json');
let history = { version: 1, entries: [] };
try { if (fs.existsSync(historyPath)) history = JSON.parse(fs.readFileSync(historyPath,'utf8')); } catch { /* ignore */ }
// Append current snapshot
const snapshot = {
  ts: new Date().toISOString(),
  sizes: Object.fromEntries(report.map(r => [r.chunk, { gzipKB: r.gzipKB, brotliKB: r.brotliKB }]))
};
history.entries.push(snapshot);
// Limit history length
if (history.entries.length > 200) history.entries = history.entries.slice(-200);
try { fs.writeFileSync(historyPath, JSON.stringify(history, null, 2)); } catch { /* ignore */ }

// Precompute sparklines with optional override
const sparklineWindow = historyWindowOverride && historyWindowOverride > 1 ? historyWindowOverride : 12;
const sparkData = {};
for (const r of report) {
  const series = history.entries.slice(-sparklineWindow).map(e => e.sizes?.[r.chunk]?.gzipKB).filter(v => typeof v === 'number');
  sparkData[r.chunk] = makeSparkline(series);
}
// Deltas vs previous snapshot
let previous = history.entries.length > 1 ? history.entries[history.entries.length - 2] : null;
computeDeltas(report, previous);
// Auto add brotli baseline limit if missing and requested
if (updateMissingBrotli) {
  for (const r of report) {
    const b = budgets.chunks[r.chunk];
    if (r.brotliKB != null && (b.brotliKB == null || Number.isNaN(b.brotliKB))) {
      b.brotliKB = r.brotliKB; // set exact current size
      if (!b.floorKB || b.floorKB > b.brotliKB) {
        b.floorKB = b.brotliKB; // ensure floor not higher than baseline
      }
    }
  }
  try { fs.writeFileSync(budgetsPath, JSON.stringify(budgets, null, 2)); console.log('[analytics-size-check] Added missing brotli baselines.'); } catch { /* ignore */ }
}

// Stability counter logic
const statePath = path.resolve(projRoot, '.analytics-size-state.json');
let state = { stableRuns: 0 };
try { if (fs.existsSync(statePath)) state = JSON.parse(fs.readFileSync(statePath,'utf8')); } catch { /* ignore */ }
if (!failed) {
  state.stableRuns += 1;
} else {
  state.stableRuns = 0; // reset on failure
}
try { fs.writeFileSync(statePath, JSON.stringify(state, null, 2)); } catch { /* ignore */ }

console.log('[analytics-size-check] Report (stableRuns=' + state.stableRuns + '):');
for (const r of report) {
  const parts = [r.status.padEnd(4), r.chunk.padEnd(11), `${r.gzipKB}KB (limit ${r.gzipLimitKB}KB)`];
  if (r.brotliKB != null && r.brotliLimitKB != null) parts.push(`br:${r.brotliKB}KB (limit ${r.brotliLimitKB}KB)`);
  parts.push(r.file);
  console.log(parts.join('  '));
}

if (failed || (schemaMode === 'fail' && schemaValidationErrors.length)) {
  console.error('\nOne or more analytics chunks exceed size budget.');
  if (schemaValidationErrors.length) console.error('[analytics-size-check] Failing due to schema validation errors.');
  // Slack alert if configured
  if (slackWebhook) {
    try {
      const payload = { text: `:warning: Analytics size regression detected\n${report.map(r=>`${r.chunk}: ${r.gzipKB}KB (limit ${r.limitKB}KB) ${r.status}`).join('\n')}` };
      fetch(slackWebhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(()=>{});
    } catch { /* ignore */ }
  }
  process.exit(2);
}

// Auto baseline update when requested and stable
if (writeBaseline) {
  if (stableRunsRequired && state.stableRuns < stableRunsRequired && !forceBaseline) {
    console.log(`[analytics-size-check] Skipping baseline write (stableRuns ${state.stableRuns} < required ${stableRunsRequired})`);
  } else {
    for (const r of report) {
      if (!budgets.chunks[r.chunk]) budgets.chunks[r.chunk] = { gzipKB: r.gzipKB };
      else budgets.chunks[r.chunk].gzipKB = r.gzipKB;
      if (r.brotliKB != null) budgets.chunks[r.chunk].brotliKB = r.brotliKB;
    }
    budgets.notes = `Updated baseline ${new Date().toISOString()} (stableRuns=${state.stableRuns})`;
    try {
      fs.writeFileSync(budgetsPath, JSON.stringify(budgets, null, 2));
      console.log('[analytics-size-check] Baseline budgets updated.');
    } catch (e) { console.error('[analytics-size-check] Failed to update budgets file:', e.message); }
  }
}

// Trend-based ratchet (phase 1 data collection; actual reduction logic will execute if parameters present)
// We track improving run counts (all chunks above headroom threshold) and reduce budgets by ratchetPercent when threshold reached.
const ratchetStatePath = path.resolve(projRoot, '.analytics-size-ratchet.json');
let ratchetState = { improvingRuns: 0, lastReduction: null, cooldownCounter: 0 };
try { if (fs.existsSync(ratchetStatePath)) ratchetState = JSON.parse(fs.readFileSync(ratchetStatePath, 'utf8')); } catch { /* ignore */ }

let ratchetAction = null;
if (!failed && ratchetAfter > 0 && ratchetPercent > 0) {
  const allImproving = report.every(r => r.gzipHeadroomKB >= ratchetHeadroomThreshold && (r.brotliHeadroomKB == null || r.brotliHeadroomKB >= ratchetHeadroomThreshold));
  if (allImproving) ratchetState.improvingRuns += 1; else ratchetState.improvingRuns = 0;
  if (ratchetState.improvingRuns >= ratchetAfter) {
    // cooldown check applies only if we've already reduced once before (lastReduction != null)
    if (ratchetState.lastReduction && ratchetCooldown && ratchetState.cooldownCounter < ratchetCooldown) {
      ratchetState.cooldownCounter += 1; // progress cooldown
    } else {
    // Apply reduction
    const pct = ratchetPercent / 100;
    for (const [chunk, b] of Object.entries(budgets.chunks)) {
      if (b.locked) continue;
      const floor = Math.max(b.floorKB || 0, globalMinFloor || 0);
      const newGzip = Math.max(Number((b.gzipKB * (1 - pct)).toFixed(2)), floor || 0.01);
      if (newGzip < b.gzipKB) b.gzipKB = newGzip;
      if (b.brotliKB) {
        const newBr = Math.max(Number((b.brotliKB * (1 - pct)).toFixed(2)), floor || 0.01);
        if (newBr < b.brotliKB) b.brotliKB = newBr;
      }
    }
    budgets.notes = `Ratchet ${ratchetPercent}% applied ${new Date().toISOString()} (improvingRuns=${ratchetState.improvingRuns})`;
    ratchetState.lastReduction = new Date().toISOString();
    ratchetState.improvingRuns = 0; // reset streak
      ratchetState.cooldownCounter = 0; // reset cooldown after reduction
    try { fs.writeFileSync(budgetsPath, JSON.stringify(budgets, null, 2)); ratchetAction = 'reduced'; } catch { /* ignore */ }
    }
  }
  try { fs.writeFileSync(ratchetStatePath, JSON.stringify(ratchetState, null, 2)); } catch { /* ignore */ }
}

// Markdown summary artifact
try {
  const lines = [];
  lines.push('# Analytics Chunk Size Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`| Chunk | Gzip (KB) | Δ Gzip | Gzip Limit | Used % | Headroom | Brotli (KB) | Δ Br | Brotli Limit | Br Used % | Br Headroom | Sparkline (last ${sparklineWindow}) | Status |`);
  lines.push('|-------|-----------|--------|------------|--------|----------|-------------|------|--------------|----------|-------------|-----------------------------|--------|');
  for (const r of report) {
    const gzipUsedPct = ((r.gzipKB / r.gzipLimitKB) * 100).toFixed(1) + '%';
    const brUsedPct = (r.brotliKB != null && r.brotliLimitKB ? ((r.brotliKB / r.brotliLimitKB) * 100).toFixed(1)+'%' : '');
    const fmtDelta = v => (v>0?`+${v}`:`${v}`);
    const statusEmoji = r.status === 'OK' ? '✅' : '❌';
    lines.push(`| ${r.chunk} | ${r.gzipKB} | ${fmtDelta(r.gzipDeltaKB)} | ${r.gzipLimitKB} | ${gzipUsedPct} | ${r.gzipHeadroomKB} | ${r.brotliKB ?? ''} | ${(r.brotliDeltaKB!=null)?fmtDelta(r.brotliDeltaKB):''} | ${r.brotliLimitKB ?? ''} | ${brUsedPct} | ${r.brotliHeadroomKB ?? ''} | ${sparkData[r.chunk]} | ${statusEmoji} |`);
  }
  lines.push('');
  lines.push(`Stable Runs: ${state.stableRuns}`);
  if (ratchetAfter > 0) {
    lines.push(`Ratchet improving runs: ${ratchetState.improvingRuns}/${ratchetAfter} (threshold headroom >= ${ratchetHeadroomThreshold}KB)`);
    if (ratchetCooldown) lines.push(`Ratchet cooldown progress: ${ratchetState.cooldownCounter}/${ratchetCooldown}`);
    if (ratchetAction) lines.push(`Ratchet Action: Budgets reduced by ${ratchetPercent}%`);
  }
  if (schemaValidationErrors.length) lines.push(`Schema validation errors: ${schemaValidationErrors.length}`);
  fs.mkdirSync(path.join(distDir, 'analysis'), { recursive: true });
  fs.writeFileSync(path.join(distDir, 'analysis', 'analytics-size-report.md'), lines.join('\n'));
} catch { /* ignore */ }

// Optionally write JSON artifact
try {
  const jsonPayload = {
    generated: new Date().toISOString(),
    previousSnapshotTs: previous?.ts || null,
    sparklineWindow,
    schema: { mode: schemaMode, strict: schemaStrict, validationErrors: schemaValidationErrors },
    report,
    deltas: Object.fromEntries(report.map(r => [r.chunk, { gzipDeltaKB: r.gzipDeltaKB, brotliDeltaKB: r.brotliDeltaKB ?? null }])),
    stableRuns: state.stableRuns,
    budgets,
    ratchet: { improvingRuns: ratchetState.improvingRuns, applied: ratchetAction, params: { ratchetAfter, ratchetPercent, ratchetHeadroomThreshold, ratchetCooldown } },
    history: { entries: history.entries.length }
  };
  const defaultDir = path.join(distDir, 'analysis');
  fs.mkdirSync(defaultDir, { recursive: true });
  let target = path.join(defaultDir, 'analytics-size-report.json');
  if (jsonOutPath) {
    // Allow relative paths
    const resolved = path.resolve(projRoot, jsonOutPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    target = resolved;
  }
  fs.writeFileSync(target, JSON.stringify(jsonPayload, null, 2));
} catch { /* ignore */ }

// Optional PR comment posting
if (prComment) {
  (async () => {
    try {
      const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
      const repo = process.env.GITHUB_REPOSITORY; // owner/name
      // Determine PR number: explicit flag, env PR number, or attempt from ref
      let prNum = prNumber || Number(process.env.PR_NUMBER) || null;
      if (!prNum) {
        const ref = process.env.GITHUB_REF || '';
        const m = ref.match(/refs\/pull\/(\d+)\/merge/);
        if (m) prNum = Number(m[1]);
      }
      if (!token || !repo || !prNum) {
        console.warn('[analytics-size-check] PR comment skipped (missing token, repo, or pr number).');
        return;
      }
      const reportPath = path.join(distDir, 'analysis', 'analytics-size-report.md');
      if (!fs.existsSync(reportPath)) return;
      const body = fs.readFileSync(reportPath, 'utf8');
      const [owner, repoName] = repo.split('/');
      const resp = await fetch(`https://api.github.com/repos/${owner}/${repoName}/issues/${prNum}/comments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json'
        },
        body: JSON.stringify({ body: body.slice(0, 60000) }) // safeguard size
      });
      if (!resp.ok) {
        console.warn('[analytics-size-check] Failed to post PR comment:', resp.status, await resp.text());
      } else {
        console.log('[analytics-size-check] Posted PR comment for analytics size report.');
      }
    } catch (e) {
      console.warn('[analytics-size-check] PR comment error:', e.message);
    }
  })();
}

process.exit(0);
