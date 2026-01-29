// Transport & Circuit Breaker Module (extracted from analytics.ts)
// Provides configuration, batching, retry with exponential backoff, circuit breaker, and debug helpers.

// Avoid circular import: we keep a delegate for trackEvent set by analytics.ts after definition.
type TrackEventFn = (opts: { category: 'lifecycle'; action: 'breaker_open' | 'breaker_closed' | 'breaker_half_open'; priority?: 'high'; metadata?: Record<string, unknown> }) => void;
let trackEventDelegate: TrackEventFn | null = null;
export function setTrackEventDelegate(fn: TrackEventFn) { trackEventDelegate = fn; }

const isBrowser = () => typeof window !== 'undefined';

export interface TransportConfig {
  endpoint?: string;
  enabled: boolean;
  useBeacon?: boolean;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerCooldownMs?: number;
  batchSizeLimit?: number;
  batchBytesLimit?: number;
}

let transportConfig: TransportConfig = {
  enabled: false,
  maxRetries: 3,
  retryBaseDelayMs: 400,
  circuitBreakerThreshold: 6,
  circuitBreakerCooldownMs: 60_000,
  batchSizeLimit: 50,
  batchBytesLimit: 30_000,
};
export function configureAnalyticsTransport(cfg: Partial<TransportConfig>) {
  transportConfig = { ...transportConfig, ...cfg };
}

// Circuit breaker state
let consecutiveFailures = 0;
let breakerOpen = false;
let breakerOpenedAt: number | null = null;

// Public test-only shape (type export only; no runtime impact)
export interface BreakerState {
  consecutiveFailures: number;
  breakerOpen: boolean;
  breakerOpenedAt: number | null;
}

function emitBreakerEvent(action: 'breaker_open' | 'breaker_closed' | 'breaker_half_open', metadata?: Record<string, unknown>) {
  try {
    trackEventDelegate?.({ category: 'lifecycle', action, priority: 'high', ...(metadata ? { metadata } : {}) });
  } catch { /* ignore */ }
}
function recordSuccess() {
  const wasOpen = breakerOpen;
  consecutiveFailures = 0;
  breakerOpen = false;
  breakerOpenedAt = null;
  if (wasOpen) emitBreakerEvent('breaker_closed');
}
function recordFailure() {
  consecutiveFailures += 1;
  const threshold = transportConfig.circuitBreakerThreshold || 6;
  if (!breakerOpen && consecutiveFailures >= threshold) {
    breakerOpen = true;
    breakerOpenedAt = Date.now();
    emitBreakerEvent('breaker_open', { consecutiveFailures });
  }
}
function circuitBreakerAllows(): boolean {
  if (!breakerOpen) return true;
  if (breakerOpenedAt && (Date.now() - breakerOpenedAt) > (transportConfig.circuitBreakerCooldownMs || 60_000)) {
    emitBreakerEvent('breaker_half_open');
    return true; // allow trial request
  }
  return false;
}

// Backend queue & batch sending
type BackendEventPayload = Record<string, unknown>;
const backendQueue: BackendEventPayload[] = [];
let backendFlushInFlight = false;
let backendFlushTimer: number | null = null;

export function transportIsEnabled(): boolean { return !!(transportConfig.enabled && transportConfig.endpoint); }

export function enqueueForBackend(ev: BackendEventPayload) {
  backendQueue.push(ev);
  scheduleBackendFlush();
}
function scheduleBackendFlush() {
  if (!isBrowser()) return;
  if (backendFlushTimer != null) return;
  backendFlushTimer = window.setTimeout(() => {
    backendFlushTimer = null;
    flushBackendQueue();
  }, 3000) as unknown as number;
}
export function flushBackendQueue(force = false) {
  if (!transportIsEnabled()) return;
  if (!force && backendQueue.length === 0) return;
  if (!circuitBreakerAllows()) return;
  if (backendFlushInFlight) return;
  backendFlushInFlight = true;
  try {
    const batch: BackendEventPayload[] = [];
    let bytes = 0;
    const sizeLimit = transportConfig.batchBytesLimit || 30_000;
    const countLimit = transportConfig.batchSizeLimit || 50;
    while (backendQueue.length && batch.length < countLimit) {
      const next = backendQueue[0];
      const estimated = JSON.stringify(next).length + 1;
      if ((bytes + estimated) > sizeLimit && batch.length > 0) break;
      backendQueue.shift();
      batch.push(next);
      bytes += estimated;
    }
    if (batch.length === 0) { backendFlushInFlight = false; return; }
    sendBatchWithRetry(batch, 0).finally(() => {
      backendFlushInFlight = false;
      if (backendQueue.length) scheduleBackendFlush();
    });
  } catch {
    backendFlushInFlight = false;
  }
}

async function sendBatchWithRetry(batch: BackendEventPayload[], attempt: number): Promise<void> {
  const endpoint = transportConfig.endpoint!;
  const maxRetries = transportConfig.maxRetries ?? 3;
  const body = JSON.stringify({ events: batch });
  const headers = { 'Content-Type': 'application/json' };
  try {
    const res = await fetch(endpoint, { method: 'POST', headers, body, keepalive: transportConfig.useBeacon === true });
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        recordFailure();
        return;
      }
      if (attempt < maxRetries) {
        const delay = (transportConfig.retryBaseDelayMs || 400) * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
        return sendBatchWithRetry(batch, attempt + 1);
      } else {
        recordFailure();
        if (!breakerOpen) backendQueue.unshift(...batch);
      }
    } else {
      recordSuccess();
    }
  } catch {
    if (attempt < maxRetries) {
      const delay = (transportConfig.retryBaseDelayMs || 400) * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
      return sendBatchWithRetry(batch, attempt + 1);
    } else {
      recordFailure();
      if (!breakerOpen) backendQueue.unshift(...batch);
    }
  }
}

export function getTransportDebugInfo() {
  return {
    enabled: transportConfig.enabled,
    endpoint: transportConfig.endpoint,
    queueLength: backendQueue.length,
    breaker: { open: breakerOpen, consecutiveFailures, openedAt: breakerOpenedAt },
  };
}

export const __transportTest = {
  _getBreaker: (): BreakerState => ({ consecutiveFailures, breakerOpen, breakerOpenedAt }),
  _resetBreaker: () => { consecutiveFailures = 0; breakerOpen = false; breakerOpenedAt = null; },
  _forceHalfOpen: () => { if (breakerOpen) { breakerOpenedAt = Date.now() - (transportConfig.circuitBreakerCooldownMs || 60_000) - 10; } },
  _forceFlush: () => { try { flushBackendQueue(true); } catch { /* ignore */ } },
};

export type { BackendEventPayload };
