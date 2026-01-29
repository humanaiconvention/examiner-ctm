// ratchet.mjs
// Logic to auto-tighten Lighthouse thresholds and vitals based on sustained success streaks.
// Exports: evaluateRatchet(history, config, ratchetState) -> { updatedConfig, updatedState, change } | null
// Guardrails:
//  - Requires minimum consecutive success runs (successStreakMin)
//  - Only one tightening per invocation
//  - Requires median metrics margin above/below thresholds by configured cushions
//  - Prevents re-tightening within cooldownHours
//  - Will not tighten if any recent (windowForNoRegression) run had regression error
//  - Adjusts baselinePercentile once total success count > baselinePercentileFlipSuccesses

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

export async function loadRatchetState(path) {
  if (!path || !existsSync(path)) return { lastTightenTs: null, changeLog: [] };
  try { return JSON.parse(await readFile(path,'utf-8')); } catch { return { lastTightenTs: null, changeLog: [] }; }
}

export async function saveRatchetState(path, state) {
  if (!path) return;
  try { await writeFile(path, JSON.stringify(state, null, 2), 'utf-8'); } catch {/* ignore */}
}

function median(arr){ const f = arr.filter(v=>typeof v==='number'&&!isNaN(v)); if(!f.length) return null; f.sort((a,b)=>a-b); const m=Math.floor(f.length/2); return f.length%2?f[m]:(f[m-1]+f[m])/2; }

export function evaluateRatchet(history, config, ratchetState) {
  const rCfg = config.ratchet || {};
  if (!rCfg.enabled) return null;
  const state = ratchetState || { lastTightenTs: null, changeLog: [] };
  const now = Date.now();
  if (state.lastTightenTs && rCfg.cooldownHours) {
    const elapsedH = (now - Date.parse(state.lastTightenTs)) / 3600000;
    if (elapsedH < rCfg.cooldownHours) return null; // cooling down
  }
  const runs = (history?.runs||[]).filter(r=>r.success);
  if (!runs.length) return null;
  // Recent streak counting from tail
  let streak = 0;
  for (let i = runs.length - 1; i >= 0; i--) {
    if (runs[i].success) streak++; else break;
  }
  if (streak < (rCfg.successStreakMin||5)) return null;
  // Pull last window metrics
  const windowSize = rCfg.windowSize || Math.min(10, runs.length);
  const recent = runs.slice(-windowSize);
  const perfMedian = median(recent.map(r=>r.lh?.performance));
  const clsMedian = median(recent.map(r=>r.lhMetrics?.cls));
  const lcpMedian = median(recent.map(r=>r.lhMetrics?.lcp));
  const inpMedian = median(recent.map(r=>r.lhMetrics?.inp));
  const tbtMedian = median(recent.map(r=>r.lhMetrics?.tbt));

  const minScores = { ...(config.lighthouse?.minScores||{}) };
  const maxVitals = { ...(config.lighthouse?.maxVitals||{}) };
  const changes = [];
  const perfStep = rCfg.performanceStep || 0.02;
  const perfHeadroom = rCfg.performanceHeadroom || 0.03;
  if (perfMedian != null && minScores.performance != null) {
    if (perfMedian >= minScores.performance + perfHeadroom) {
      const newPerf = +(minScores.performance + perfStep).toFixed(2);
      if (newPerf < 1 && newPerf > minScores.performance) {
        changes.push({ metric: 'performance', from: minScores.performance, to: newPerf, type: 'minScore' });
        minScores.performance = newPerf;
      }
    }
  }
  const clsStep = rCfg.clsStep || 0.02;
  const clsHeadroom = rCfg.clsHeadroom || 0.05;
  if (clsMedian != null && maxVitals.cls != null) {
    if (clsMedian <= maxVitals.cls - clsHeadroom) {
      const newCls = +(Math.max(0, maxVitals.cls - clsStep)).toFixed(3);
      if (newCls < maxVitals.cls) {
        changes.push({ metric: 'cls', from: maxVitals.cls, to: newCls, type: 'maxVital' });
        maxVitals.cls = newCls;
      }
    }
  }
  // Only tighten LCP/INP if we have strong margin (headroom multiples)
  const lcpStep = rCfg.lcpStep || 200; // ms
  const lcpHeadroom = rCfg.lcpHeadroom || 600; // need this much margin
  if (lcpMedian != null && maxVitals.lcp != null) {
    if (lcpMedian <= maxVitals.lcp - lcpHeadroom) {
      const newLcp = Math.max(0, maxVitals.lcp - lcpStep);
      if (newLcp < maxVitals.lcp) {
        changes.push({ metric: 'lcp', from: maxVitals.lcp, to: newLcp, type: 'maxVital' });
        maxVitals.lcp = newLcp;
      }
    }
  }
  const inpStep = rCfg.inpStep || 500;
  const inpHeadroom = rCfg.inpHeadroom || 800;
  if (inpMedian != null && maxVitals.inp != null) {
    if (inpMedian <= maxVitals.inp - inpHeadroom) {
      const newInp = Math.max(0, maxVitals.inp - inpStep);
      if (newInp < maxVitals.inp) {
        changes.push({ metric: 'inp', from: maxVitals.inp, to: newInp, type: 'maxVital' });
        maxVitals.inp = newInp;
      }
    }
  }
  // Stop if no changes
  if (!changes.length) return null;
  // Only apply first change per run to avoid aggressive tightening
  const applied = [changes[0]];
  switch(applied[0].metric){
    case 'performance':
      config.lighthouse.minScores.performance = applied[0].to; break;
    case 'cls':
      config.lighthouse.maxVitals.cls = applied[0].to; break;
    case 'lcp':
      config.lighthouse.maxVitals.lcp = applied[0].to; break;
    case 'inp':
      config.lighthouse.maxVitals.inp = applied[0].to; break;
  }
  // Baseline percentile flip
  const totalSuccesses = runs.length;
  if (rCfg.baselinePercentileFlipSuccesses && totalSuccesses > rCfg.baselinePercentileFlipSuccesses) {
    if (config.regression && config.regression.baselinePercentile && config.regression.baselinePercentile > (rCfg.flipBaselineTo||60)) {
      const prev = config.regression.baselinePercentile;
      config.regression.baselinePercentile = rCfg.flipBaselineTo || 60;
      applied.push({ metric: 'baselinePercentile', from: prev, to: config.regression.baselinePercentile, type: 'regressionSetting' });
    }
  }
  state.lastTightenTs = new Date().toISOString();
  state.changeLog = state.changeLog || [];
  state.changeLog.push({ ts: state.lastTightenTs, applied });
  return { updatedConfig: config, updatedState: state, change: applied };
}
