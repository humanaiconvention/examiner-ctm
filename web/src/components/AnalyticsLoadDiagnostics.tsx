import React, { useMemo, useState, useEffect } from 'react';

interface StatSummary {
  count: number; latest: number | null; median: number | null; p75: number | null; p90: number | null; p95: number | null; trend: string;
}

function percentile(arr: number[], p: number): number | null {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a,b)=>a-b);
  const idx = Math.min(sorted.length - 1, Math.floor((p/100) * sorted.length));
  return sorted[idx];
}

export const AnalyticsLoadDiagnostics: React.FC = () => {
  const [samples, setSamples] = useState<number[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('haic:analyticsLoadTimes');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setSamples(arr.filter(n => typeof n === 'number'));
      }
    } catch { /* ignore */ }
  }, []);

  const stats: StatSummary = useMemo(() => {
    if (!samples.length) return { count: 0, latest: null, median: null, p75: null, p90: null, p95: null, trend: 'n/a' };
    const latest = samples[samples.length - 1];
    const med = percentile(samples, 50);
    const p75 = percentile(samples, 75);
    const p90 = percentile(samples, 90);
    const p95 = samples.length >= 20 ? percentile(samples, 95) : null;
    let trend = 'flat';
    if (samples.length >= 5) {
      const recent = samples.slice(-5);
      const first = recent[0];
      const last = recent[recent.length - 1];
      const delta = last - first;
      if (Math.abs(delta) < 15) trend = 'flat'; else trend = delta < 0 ? 'improving' : 'regressing';
    }
    return { count: samples.length, latest, median: med, p75, p90, p95, trend };
  }, [samples]);

  return (
    <div style={{ font: '12px system-ui', background: '#082129', color: '#bdefff', padding: '8px 10px', border: '1px solid #114455', borderRadius: 6, maxWidth: 360 }}>
      <strong>Analytics Load Diagnostics</strong>
      <div style={{ marginTop: 4 }}>
        <div>Samples: {stats.count}</div>
        <div>Latest: {stats.latest ?? '—'} ms</div>
        <div>Median: {stats.median ?? '—'} ms</div>
        <div>P75: {stats.p75 ?? '—'} ms</div>
        <div>P90: {stats.p90 ?? '—'} ms</div>
        <div>P95: {stats.p95 ?? '—'} ms</div>
        <div>Trend (last 5): {stats.trend}</div>
      </div>
      <details style={{ marginTop: 6 }}>
        <summary>Raw Data</summary>
        <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(samples)}</code>
      </details>
    </div>
  );
};

export default AnalyticsLoadDiagnostics;
