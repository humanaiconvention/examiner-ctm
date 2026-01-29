import { describe, it, expect, beforeEach, vi } from 'vitest';
import { configureAnalyticsTransport, setAnalyticsConsent, trackEvent } from './analytics';
import { flushAnalytics, forceHalfOpen } from './test-utils/analytics';

// Capture lifecycle events in dataLayer for assertions
interface WindowWithDL extends Window { dataLayer?: unknown[] }

type EventPayload = Record<string, unknown>;
function getLifecycleEvents(): EventPayload[] {
  const dl = (window as WindowWithDL).dataLayer || [];
  return dl.filter(e => (e as EventPayload).eventCategory === 'lifecycle') as EventPayload[];
}

function mockFetchAlways(status: number) {
  global.fetch = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status }) as unknown as typeof fetch;
}

// We induce failures to trip breaker_open; then simulate success to emit breaker_closed.

describe('circuit breaker lifecycle events', () => {
  beforeEach(() => {
    (window as WindowWithDL).dataLayer = [];
    setAnalyticsConsent(true);
  });

  it('emits breaker_open and breaker_closed events', async () => {
    configureAnalyticsTransport({ enabled: true, endpoint: '/analytics-test', maxRetries: 0, circuitBreakerThreshold: 2, retryBaseDelayMs: 1 });
    // Fail all requests initially
    mockFetchAlways(500);

  trackEvent({ category: 'navigation', action: 'page_view', label: 'fail_1' });
  await flushAnalytics();
  trackEvent({ category: 'navigation', action: 'page_view', label: 'fail_2' });
  await flushAnalytics();

  // Force half-open without real cooldown to allow a trial request.
  forceHalfOpen();
  // Switch to success fetch now; the next flush should perform a half-open trial then close on success.
  mockFetchAlways(200);
  trackEvent({ category: 'navigation', action: 'page_view', label: 'recover' });
  await flushAnalytics();

    // Poll a few times for lifecycle events to accumulate (delegate dispatch + trackEvent scheduling)
    let actions: string[] = [];
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 5));
      actions = getLifecycleEvents().map(e => e.eventAction as string);
      if (actions.includes('breaker_closed')) break;
    }
    expect(actions).toContain('breaker_open');
    // Accept that some environments may emit 'breaker_half_open' before 'breaker_closed'; just assert closed appears eventually.
    expect(actions).toContain('breaker_closed');
  });
});
