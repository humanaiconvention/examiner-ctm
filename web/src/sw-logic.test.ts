import { describe, it, expect } from 'vitest';
import { diffManifests, decideBust, shouldAutoRefresh, type AutoRefreshConfig } from './sw-logic';

describe('diffManifests', () => {
  it('handles first run (no previous)', () => {
    const latest = ['/a.js','/b.css'];
    const diff = diffManifests(null, latest);
    expect(diff.added.sort()).toEqual(latest.sort());
    expect(diff.removed).toEqual([]);
    expect(diff.previousSize).toBe(0);
    expect(diff.total).toBe(2);
    expect(diff.ratio).toBeCloseTo((2)/1); // base coerced to 1
  });
  it('computes added and removed', () => {
    const prev = ['/a.js','/b.css','/c.png'];
    const latest = ['/a.js','/d.svg'];
    const diff = diffManifests(prev, latest);
    expect(diff.added).toEqual(['/d.svg']);
    expect(diff.removed.sort()).toEqual(['/b.css','/c.png'].sort());
    // previous size = 3, changes = 3
    expect(diff.ratio).toBeCloseTo(3/3);
  });
});

describe('decideBust', () => {
  it('returns none for ratio 0', () => {
    expect(decideBust(0, 0.4).strategy).toBe('none');
  });
  it('returns hard when ratio > threshold', () => {
    expect(decideBust(0.5, 0.4).strategy).toBe('hard');
  });
  it('returns incremental when ratio within threshold', () => {
    expect(decideBust(0.2, 0.4).strategy).toBe('incremental');
  });
});

describe('shouldAutoRefresh', () => {
  const baseConfig: AutoRefreshConfig = { enabled: true, maxRatio: 0.25, maxAdded: 4 };
  function makeDiff(added: string[], removed: string[], prevSize = 8) {
    const ratio = (added.length + removed.length) / (prevSize || 1);
    return { added, removed, ratio, previousSize: prevSize, total: prevSize + added.length - removed.length };
  }
  it('false when disabled', () => {
    const diff = makeDiff(['a.js'], []);
    expect(shouldAutoRefresh(diff, { ...baseConfig, enabled: false })).toBe(false);
  });
  it('false when ratio exceeds maxRatio', () => {
    const diff = makeDiff(['a.js','b.js','c.js'], ['d.js'], 4); // ratio = 4/4 = 1
    expect(shouldAutoRefresh(diff, baseConfig)).toBe(false);
  });
  it('false when added exceeds maxAdded', () => {
    const diff = makeDiff(['1','2','3','4','5'], []);
    expect(shouldAutoRefresh(diff, baseConfig)).toBe(false);
  });
  it('false when html involved', () => {
    const diff = makeDiff(['index.html'], []);
    expect(shouldAutoRefresh(diff, baseConfig)).toBe(false);
  });
  it('true for small js/css changes under thresholds', () => {
    const diff = makeDiff(['chunk-a.js'], ['old.css']); // changes=2 prev=8 ratio=0.25 -> boundary OK
    expect(shouldAutoRefresh(diff, baseConfig)).toBe(true);
  });
});
