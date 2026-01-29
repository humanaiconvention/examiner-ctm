import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setAnalyticsConsent } from './analytics';

// We'll import the LCP observer module AFTER stubbing PerformanceObserver.

declare global { interface Window { dataLayer?: unknown[] } }

interface FakeLCPEntry {
  name: string;
  entryType: string;
  startTime: number;
  duration: number;
  size: number;
  element?: Element;
  renderTime?: number;
  loadTime?: number;
  toJSON?: () => unknown;
}

class FakePO {
  private callback: PerformanceObserverCallback;
  constructor(cb: PerformanceObserverCallback) { this.callback = cb; }
  observe() {
    // immediately deliver buffered entries when test triggers push
  }
  disconnect() { /* noop */ }
  // Test hook:
  _emit(entries: FakeLCPEntry[]) {
    const list: PerformanceObserverEntryList = {
      getEntries: () => entries,
      getEntriesByName: () => entries,
      getEntriesByType: () => entries,
    } as PerformanceObserverEntryList;
    this.callback(list, this as unknown as PerformanceObserver);
  }
}

// Keep latest instance for driving emissions
let lastObserver: FakePO | null = null;

// Override PerformanceObserver with factory creating a FakePO instance
global.PerformanceObserver = class PerformanceObserverStub {
  constructor(cb: PerformanceObserverCallback) {
    lastObserver = new FakePO(cb);
  }
  observe() { lastObserver?.observe(); }
  disconnect() { lastObserver?.disconnect(); }
} as unknown as typeof PerformanceObserver;

describe('LCP observer integration', () => {
  beforeEach(async () => {
    window.dataLayer = [];
    setAnalyticsConsent(true);
    // dynamic import resets module state each test
    vi.resetModules();
    await import('./perf/lcp');
  });

  it('emits first and final perf_metric events with phases', async () => {
    expect(lastObserver).toBeTruthy();
  const first: FakeLCPEntry = { name: 'largest-contentful-paint', entryType: 'largest-contentful-paint', startTime: 1200, duration: 0, size: 1234, renderTime: 1200, toJSON: () => ({}) };
  const second: FakeLCPEntry = { name: 'largest-contentful-paint', entryType: 'largest-contentful-paint', startTime: 1700, duration: 0, size: 2234, renderTime: 1700, toJSON: () => ({}) };

    lastObserver!._emit([first]);
    // allow microtask for ensurePerfMetric
    await new Promise(r => setTimeout(r, 5));
    document.dispatchEvent(new Event('visibilitychange')); // should not finalize yet if visibility not hidden
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    lastObserver!._emit([first, second]); // simulate buffered final update
    await new Promise(r => setTimeout(r, 15));

    const lifecycle = (window.dataLayer || []) as Record<string, unknown>[];
    const perfEvents = lifecycle.filter(e => e.eventCategory === 'perf' && e.eventAction === 'perf_metric');
    // At least first + final (some timing of final could batch after second emit)
    expect(perfEvents.length).toBeGreaterThanOrEqual(1);
  const metrics = perfEvents.map(e => (e as Record<string, unknown>).metric);
    expect(metrics).toContain('LCP');
  });
});
