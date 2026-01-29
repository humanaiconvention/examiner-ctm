import { describe, it, expect } from 'vitest';
import { computeDeltas } from '../scripts/analytics-size-util.mjs';

describe('analytics-size computeDeltas', () => {
  it('computes gzip and brotli deltas when previous snapshot exists', () => {
    const report = [
      { chunk: 'core', gzipKB: 10.5, brotliKB: 9.0 },
      { chunk: 'engagement', gzipKB: 5.0, brotliKB: 4.2 },
      { chunk: 'perf', gzipKB: 3.33, brotliKB: null }
    ];
    const previous = {
      ts: '2024-01-01T00:00:00.000Z',
      sizes: {
        core: { gzipKB: 11.0, brotliKB: 9.1 },
        engagement: { gzipKB: 4.5, brotliKB: 4.0 },
        perf: { gzipKB: 3.00, brotliKB: null }
      }
    };
    computeDeltas(report, previous);
  type R = { [k: string]: unknown };
  const core = report[0] as R;
  const eng = report[1] as R;
  const perf = report[2] as R;
  expect(core.gzipDeltaKB).toBeCloseTo(-0.5, 2);
  expect(core.brotliDeltaKB).toBeCloseTo(-0.1, 2);
  expect(eng.gzipDeltaKB).toBeCloseTo(0.5, 2);
  expect(eng.brotliDeltaKB).toBeCloseTo(0.2, 2);
  expect(perf.gzipDeltaKB).toBeCloseTo(0.33, 2);
  expect(perf).not.toHaveProperty('brotliDeltaKB');
  });

  it('defaults deltas to 0 when no previous snapshot', () => {
    const report = [ { chunk: 'core', gzipKB: 1.23, brotliKB: 1.0 } ];
    computeDeltas(report, null);
  const entry = report[0] as { [k: string]: unknown };
    expect(entry.gzipDeltaKB).toBe(0);
    expect(entry.brotliDeltaKB).toBe(0);
  });
});
