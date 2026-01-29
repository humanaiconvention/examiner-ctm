// Shared analytics test helpers to avoid duplicating __test plumbing.
// These wrappers are non-production utilities; do not import them in app code.
import { __test, setAnalyticsQuietMode } from '../analytics';
import type { BreakerState } from '../analytics/transport';

interface InternalBreakerHelpers { _forceHalfOpen?: () => void; }

// Quiet mode by default for tests importing this module
try { setAnalyticsQuietMode(true); } catch { /* ignore */ }

let lastLifecycleEvent: { action: string; metadata?: Record<string, unknown> } | null = null;
// Attempt to patch lifecycle delegate indirectly by observing dataLayer pushes (best-effort)
// If events push with eventCategory lifecycle, update lastLifecycleEvent.
if (typeof window !== 'undefined') {
  // Wrap existing push if not already wrapped
  try {
    interface DataLayerLifecycleEvent { eventCategory?: string; eventAction?: string; metadata?: Record<string, unknown>; }
    const flagKey = '__ANALYTICS_DL_WRAPPED__' as const;
    const win = window as unknown as Record<string, unknown>;
    if (Array.isArray(window.dataLayer) && !win[flagKey]) {
      const dl = window.dataLayer as unknown[] & { push?: (item: unknown) => void };
      const originalPush = dl.push?.bind(dl) || function(item: unknown) { return Array.prototype.push.call(dl, item); };
      dl.push = (item: unknown) => {
        const ev = item as DataLayerLifecycleEvent;
        if (ev && ev.eventCategory === 'lifecycle' && typeof ev.eventAction === 'string') {
          lastLifecycleEvent = { action: ev.eventAction, ...(ev.metadata ? { metadata: ev.metadata } : {}) };
        }
        return originalPush(item);
      };
      win[flagKey] = true;
    }
  } catch { /* ignore */ }
}

export async function flushAnalytics(timeoutMs = 300) {
  try { __test._forceFlush(); } catch { /* ignore */ }
  await drainAnalytics(timeoutMs);
  return diagnostics();
}

export async function drainAnalytics(timeoutMs = 300) {
  try { await __test._drain(timeoutMs); } catch { /* ignore */ }
  return diagnostics();
}

export function resetBreaker() { try { __test._resetBreaker(); lastLifecycleEvent = null; } catch { /* ignore */ } }

export function forceHalfOpen() { try { ( __test as unknown as InternalBreakerHelpers )._forceHalfOpen?.(); } catch { /* ignore */ } }

export function getBreakerState(): Partial<BreakerState> { try { return __test._getBreaker() as BreakerState; } catch { return {}; } }

export function getLastLifecycleEvent() { return lastLifecycleEvent; }

export function diagnostics() {
  return {
    breaker: getBreakerState(),
    lastLifecycleEvent,
  };
}
