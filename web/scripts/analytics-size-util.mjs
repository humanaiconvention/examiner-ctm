// Utility helpers for analytics-size-check to keep main script slimmer and enable unit testing.

export function makeSparkline(values) {
  const bars = '▁▂▃▄▅▆▇█';
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return bars[0].repeat(values.length);
  return values.map(v => {
    const idx = Math.round(((v - min) / (max - min)) * (bars.length - 1));
    return bars[idx];
  }).join('');
}

// Mutates report array adding gzipDeltaKB / brotliDeltaKB fields relative to previous snapshot
export function computeDeltas(report, previousSnapshot) {
  for (const r of report) {
    const prev = previousSnapshot?.sizes?.[r.chunk];
    if (prev) {
      r.gzipDeltaKB = Number((r.gzipKB - prev.gzipKB).toFixed(2));
      if (r.brotliKB != null && prev.brotliKB != null) {
        r.brotliDeltaKB = Number((r.brotliKB - prev.brotliKB).toFixed(2));
      }
    } else {
      r.gzipDeltaKB = 0;
      if (r.brotliKB != null) r.brotliDeltaKB = 0;
    }
  }
  return report;
}
