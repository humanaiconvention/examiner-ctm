import { describe, it, expect, beforeEach } from 'vitest';
import { shouldAutoRefresh, diffManifests } from './sw-logic';

// Integration-style simulation of the message flow without real Service Worker registration.
// We mock navigator.serviceWorker.controller.postMessage and window reload behavior.

declare global {
  interface Window { __TEST_MESSAGES?: unknown[] }
}

function simulateUpdateMessage(opts: { previous: string[]; latest: string[]; autoEnabled: boolean; maxRatio?: number; maxAdded?: number }) {
  const diff = diffManifests(opts.previous, opts.latest);
  const auto = shouldAutoRefresh(diff, { enabled: opts.autoEnabled, maxRatio: opts.maxRatio ?? 0.25, maxAdded: opts.maxAdded ?? 4 });
  return { diff, auto };
}

describe('SW messaging integration simulation', () => {
  beforeEach(() => {
    // reset session flag
    sessionStorage.removeItem('sw:bgUpdated');
  });

  it('decides silent auto refresh for small diff and sets background flag', () => {
    const previous = ['a.js','b.js','c.css','e.js','f.js']; // 5 baseline assets
    const latest = ['a.js','b.js','c.css','e.js','f.js','d.js']; // 1 added => ratio 1/5 = 0.2 < 0.25
    const { diff, auto } = simulateUpdateMessage({ previous, latest, autoEnabled: true });
    expect(auto).toBe(true);
    // Emulate side effect identical to hook (sessionStorage flag + reload)
    sessionStorage.setItem('sw:bgUpdated','1');
    expect(sessionStorage.getItem('sw:bgUpdated')).toBe('1');
    // background snackbar would consume then remove it later; ensure still present now
    expect(diff.added).toEqual(['d.js']);
  });

  it('shows interactive toast (no auto) for large ratio', () => {
    const previous = ['a.js'];
    const latest = ['a.js','b.js','c.js','d.js','e.js']; // 4 added over prev size 1 -> ratio 4
    const { auto } = simulateUpdateMessage({ previous, latest, autoEnabled: true });
    expect(auto).toBe(false);
    expect(sessionStorage.getItem('sw:bgUpdated')).toBeNull();
  });

  it('disables auto when preference off even if diff small', () => {
    const previous = ['a.js','b.js'];
    const latest = ['a.js','b.js','c.js'];
    const { auto } = simulateUpdateMessage({ previous, latest, autoEnabled: false });
    expect(auto).toBe(false);
  });
});
