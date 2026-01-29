import { vi, expect, test, beforeEach } from 'vitest';

// Import the public loaders entry *after* mocking trackEvent.
// We mock only the trackEvent export from core via a manual mock module pattern.
vi.mock('./analytics/core', async () => {
  const actual: Record<string, unknown> = await vi.importActual('./analytics/core');
  return {
    ...actual,
    trackEvent: vi.fn(),
  };
});

// Import from modular index (was mistakenly importing root analytics.ts earlier)
import { analyticsLoaders } from './analytics/index';
import { trackEvent } from './analytics/core';

beforeEach(() => {
  vi.clearAllMocks();
});

function findPerfMetricEvents() {
  return (trackEvent as unknown as ReturnType<typeof vi.fn>).mock.calls
    .map(call => call[0])
    .filter(arg => arg && arg.category === 'perf' && arg.action === 'perf_metric');
}

// Provide a deterministic environment for shouldSkipPerfChunk: default no saveData, memory >=2.
Object.defineProperty(globalThis, 'navigator', {
  value: { deviceMemory: 4, connection: { saveData: false } },
  configurable: true,
});

test('loadPerf triggers perf_metric loaded event (not skipped)', async () => {
  await analyticsLoaders.loadPerf();
  const perfEvents = findPerfMetricEvents();
  expect(perfEvents.some(e => e.metadata?.chunk === 'perf' && e.metadata?.metric === 'analytics_chunk_loaded')).toBe(true);
});

test('loadPerf second invocation is idempotent (no additional load event)', async () => {
  await analyticsLoaders.loadPerf();
  const firstCount = findPerfMetricEvents().length;
  await analyticsLoaders.loadPerf();
  const secondCount = findPerfMetricEvents().length;
  expect(secondCount).toBe(firstCount);
});

test('loadEngagement produces engagement chunk loaded event', async () => {
  await analyticsLoaders.loadEngagement();
  const events = findPerfMetricEvents();
  expect(events.some(e => e.metadata?.chunk === 'engagement' && e.metadata?.metric === 'analytics_chunk_loaded')).toBe(true);
});

test('loadErrors produces errors chunk loaded event', async () => {
  await analyticsLoaders.loadErrors();
  const events = findPerfMetricEvents();
  expect(events.some(e => e.metadata?.chunk === 'errors' && e.metadata?.metric === 'analytics_chunk_loaded')).toBe(true);
});

test('loadPerf skipped when saveData is true', async () => {
  vi.resetModules();
  // Re-apply mock after reset
  vi.doMock('./analytics/core', async () => {
    const actual: Record<string, unknown> = await vi.importActual('./analytics/core');
    return { ...actual, trackEvent: vi.fn() };
  });
  Object.defineProperty(globalThis, 'navigator', { value: { deviceMemory: 4, connection: { saveData: true } } });
  const { analyticsLoaders } = await import('./analytics/index');
  await analyticsLoaders.loadPerf();
  const { trackEvent: newTrackEvent } = await import('./analytics/core');
  const calls = (newTrackEvent as unknown as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]);
  expect(calls.some(e => e?.metadata?.metric === 'analytics_chunk_skipped' && e?.metadata?.chunk === 'perf')).toBe(true);
});
