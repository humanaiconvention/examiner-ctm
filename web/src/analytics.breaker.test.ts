import { describe, it, expect, beforeEach, vi } from 'vitest';
import { configureAnalyticsTransport, setAnalyticsConsent, trackEvent, __test } from './analytics';

// JSDOM lacks some APIs; stub minimal ones used in analytics
// Provide a minimal now() polyfill if performance is missing (older JSDOM)
if (typeof performance === 'undefined' || typeof performance.now !== 'function') {
  // @ts-expect-error minimal stub for test
  globalThis.performance = { now: () => Date.now() };
}

// Helper to simulate failed fetch responses
function mockFetchSequence(statuses: number[]) {
  let calls = 0;
  global.fetch = vi.fn().mockImplementation(async () => {
    const status = statuses[Math.min(calls, statuses.length - 1)];
    calls++;
    if (typeof status === 'number') {
      return { ok: status >= 200 && status < 300, status } as Response;
    }
    return { ok: false, status: 500 } as Response;
  }) as unknown as typeof fetch;
  return () => calls;
}

describe('analytics transport circuit breaker', () => {
  beforeEach(() => {
    __test._resetBreaker();
    setAnalyticsConsent(true); // allow dispatch
    configureAnalyticsTransport({ enabled: true, endpoint: '/analytics-test', maxRetries: 0, circuitBreakerThreshold: 3, retryBaseDelayMs: 1 });
  });

  it('opens breaker after consecutive failures and recovers after cooldown', async () => {
    mockFetchSequence([500, 503, 502, 200]);

    // Trigger events and force flushes; wait for async network attempts each loop
    for (let i = 0; i < 3; i++) {
      trackEvent({ category: 'navigation', action: 'page_view', label: `fail_${i}` });
      __test._forceFlush();
      await __test._drain();
    }

    // After 3 failures breaker should open
    let breaker1 = __test._getBreaker();
    expect(breaker1.consecutiveFailures).toBeGreaterThanOrEqual(3);
    expect(breaker1.breakerOpen).toBe(true);

  // Force half-open attempt without waiting real cooldown (helper only exists in test build)
  interface TestHelpers { _forceHalfOpen?: () => void }
  ( __test as unknown as TestHelpers )._forceHalfOpen?.();

  // Add one more event to trigger half-open attempt which should succeed (200) and reset breaker
    trackEvent({ category: 'navigation', action: 'page_view', label: 'recover' });
    __test._forceFlush();
    await __test._drain();

    breaker1 = __test._getBreaker();
    expect(breaker1.breakerOpen).toBe(false);
    expect(breaker1.consecutiveFailures).toBe(0);
  });
});
