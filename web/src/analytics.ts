// Lightweight analytics/telemetry helper (progressively enhanced).
import { PERF_THRESHOLDS } from './config/perf';
// Features:
//  - Consent gating (localStorage key: 'haic:analyticsConsent')
//  - Session UUID (lifecycle: per page load; stored on window.__SESSION_ID__)
//  - Event schema validation (category/action controlled unions)
//  - Pre-consent queue (retroactive flushing)
//  - Low-priority batching via requestIdleCallback / timeout
//  - Section visibility tracking (IntersectionObserver)
//  - Heartbeat interval (tab visibility aware)
//  - Error / unhandled rejection tracking
//  - GTM-style dataLayer push, Segment, PostHog
//  - Performance timing helper
//  - Dev console debug (non-production)

const CONSENT_KEY = 'haic:analyticsConsent';
const SESSION_KEY = '__SESSION_ID__';
const LAST_FLUSH_KEY = 'haic:lastFlushTs';
const USER_CONTEXT_KEY = '__ANALYTICS_USER__';

// Sampling: probability (0-1) per category (can be tuned)
const CATEGORY_SAMPLE_RATES: Partial<Record<AnalyticsCategory, number>> = {
  heartbeat: 0.5, // keep only 50% heartbeats
};

// Transport configuration (can be replaced by injection)
interface TransportConfig {
  endpoint?: string; // e.g. '/api/analytics'
  enabled: boolean;
  useBeacon?: boolean;
  maxRetries?: number; // retries for non-4xx failures
  retryBaseDelayMs?: number; // base for exponential backoff
  circuitBreakerThreshold?: number; // consecutive failures to open breaker
  circuitBreakerCooldownMs?: number; // time before attempting to half-open
  batchSizeLimit?: number; // max events per batch (cap)
  batchBytesLimit?: number; // approximate JSON size cap
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

function circuitBreakerAllows(): boolean {
  if (!breakerOpen) return true;
  if (breakerOpenedAt && (Date.now() - breakerOpenedAt) > (transportConfig.circuitBreakerCooldownMs || 60_000)) {
    // half-open attempt
    return true;
  }
  return false;
}

function recordSuccess() {
  consecutiveFailures = 0;
  breakerOpen = false;
  breakerOpenedAt = null;
}

function recordFailure() {
  consecutiveFailures += 1;
  if (consecutiveFailures >= (transportConfig.circuitBreakerThreshold || 6)) {
    breakerOpen = true;
    breakerOpenedAt = Date.now();
  }
}

// Minimal email sanitizer: strips emails from arbitrary metadata values except whitelisted keys
const PII_WHITELIST = new Set(['userEmail','userId']);
function sanitizeMetadata(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!meta) return meta;
  const cleaned: Record<string, unknown> = {};
  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig;
  for (const [k,v] of Object.entries(meta)) {
    if (v == null) { cleaned[k] = v as unknown; continue; }
    if (typeof v === 'string' && !PII_WHITELIST.has(k)) {
      cleaned[k] = v.replace(emailRegex, '[redacted-email]');
    } else if (typeof v === 'object' && !Array.isArray(v)) {
      // shallow recurse one level for nested objects
      cleaned[k] = sanitizeMetadata(v as Record<string, unknown>) || v;
    } else {
      cleaned[k] = v;
    }
  }
  return cleaned;
}

// Simple last-flush persistence
function setLastFlushTs(ts: number) {
  try { localStorage.setItem(LAST_FLUSH_KEY, String(ts)); } catch { /* ignore */ }
}
export function getLastFlushTs(): number | null {
  try {
    const raw = localStorage.getItem(LAST_FLUSH_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    analytics?: { track?: (...args: unknown[]) => void };
    posthog?: { capture?: (name: string, props?: Record<string, unknown>) => void };
    __ANALYTICS_CONSENT__?: boolean;
    __SESSION_ID__?: string;
  }
}
// Schema -------------------------------------------------------------------
export type AnalyticsCategory =
  | 'interaction'
  | 'navigation'
  | 'perf'
  | 'engagement'
  | 'error'
  | 'lifecycle'
  | 'heartbeat'
  | 'intro';

// Actions per category (rough initial taxonomy)
type InteractionActions = 'click' | 'cta' | 'toggle' | 'sw_auto_refresh' | 'sw_background_notice' | 'sw_update_decision' | 'sw_hard_bust_complete' | 'sw_config_drift';
type NavigationActions = 'page_view' | 'hash_change' | 'section_view';
type PerfActions = 'hero_paint' | 'fid' | 'cls_total' | 'quote_transition' | 'perf_metric';
type EngagementActions = 'focus' | 'visibility_change';
type ErrorActions = 'exception' | 'unhandled_rejection';
type LifecycleActions = 'session_start' | 'consent_granted' | 'consent_denied';
type HeartbeatActions = 'interval_ping';
type IntroActions = 'intro_impression' | 'intro_stage_view' | 'intro_completed';

export type AnalyticsAction =
  | InteractionActions
  | NavigationActions
  | PerfActions
  | EngagementActions
  | ErrorActions
  | LifecycleActions
  | HeartbeatActions
  | IntroActions;

export interface TrackEventOptions<M extends Record<string, unknown> = Record<string, unknown>> {
  category?: AnalyticsCategory;
  action: AnalyticsAction;
  label?: string;
  value?: number;
  metadata?: M;
  priority?: 'high' | 'low'; // low = batchable
}

function isBrowser(): boolean { return typeof window !== 'undefined'; }

function uuid(): string {
  // RFC4122 v4-ish simple implementation (not cryptographically strong but adequate here)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function hasAnalyticsConsent(): boolean {
  if (!isBrowser()) return false;
  return window.__ANALYTICS_CONSENT__ === true;
}

export function setAnalyticsConsent(granted: boolean): void {
  if (!isBrowser()) return;
  window.__ANALYTICS_CONSENT__ = granted;
  try { localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied'); } catch { /* ignore */ }
}

function ensureSessionId(): string | undefined {
  if (!isBrowser()) return undefined;
  if (!window[SESSION_KEY]) {
    window[SESSION_KEY] = uuid();
  }
  return window[SESSION_KEY];
}

// Queues & batching --------------------------------------------------------
type InternalEventPayload = Record<string, unknown>;
const RECENT_EVENT_LRU_SIZE = 200;
const recentEventIds: string[] = [];

interface UserContext { userId: string; traits?: Record<string, unknown> | undefined }
interface WindowWithUserContext extends Window { [USER_CONTEXT_KEY]?: UserContext }
export function setUserContext(userId: string, traits?: Record<string, unknown>) {
  if (!isBrowser()) return;
  const w = window as WindowWithUserContext;
  w[USER_CONTEXT_KEY] = { userId, traits };
}
function getUserContext(): UserContext | undefined {
  if (!isBrowser()) return undefined;
  const w = window as WindowWithUserContext;
  return w[USER_CONTEXT_KEY];
}

function sampleAllowed(category: AnalyticsCategory): boolean {
  const rate = CATEGORY_SAMPLE_RATES[category];
  if (rate == null) return true;
  return Math.random() < rate;
}

function dedup(eventId: string): boolean {
  if (recentEventIds.includes(eventId)) return false;
  recentEventIds.push(eventId);
  if (recentEventIds.length > RECENT_EVENT_LRU_SIZE) recentEventIds.splice(0, recentEventIds.length - RECENT_EVENT_LRU_SIZE);
  return true;
}

const preConsentQueue: TrackEventOptions[] = [];
const lowPriorityQueue: TrackEventOptions[] = [];
let lowPriorityFlushTimer: number | null = null;
let idleCallbackId: number | null = null;

function validateSchema(category: AnalyticsCategory, action: AnalyticsAction): boolean {
  // Minimal runtime guard (compile-time already constrains). Extend if mismatches appear.
  switch (category) {
  case 'interaction': return ['click','cta','toggle','sw_auto_refresh','sw_background_notice','sw_update_decision','sw_hard_bust_complete','sw_config_drift'].includes(action);
    case 'navigation': return ['page_view','hash_change','section_view'].includes(action);
  case 'perf': return ['hero_paint','fid','cls_total','quote_transition','perf_metric'].includes(action);
    case 'engagement': return ['focus','visibility_change'].includes(action);
    case 'error': return ['exception','unhandled_rejection'].includes(action);
    case 'lifecycle': return ['session_start','consent_granted','consent_denied'].includes(action);
    case 'heartbeat': return ['interval_ping'].includes(action);
  case 'intro': return ['intro_impression','intro_stage_view','intro_completed'].includes(action);
    default: return false;
  }
}

// Internal dispatch (single event) - may be grouped later if batching to backend
function dispatchNow(opts: TrackEventOptions) {
  const { category = 'interaction', action, label, value, metadata } = opts;
  if (!sampleAllowed(category)) return; // sampling gate
  if (!validateSchema(category, action)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[analytics] schema reject', category, action);
    }
    return;
  }
  const sessionId = ensureSessionId();
  const eventId = uuid();
  if (!dedup(eventId)) return;
  const userContext = getUserContext();
  const safeMeta = sanitizeMetadata(metadata);
  const payload: InternalEventPayload = {
    event: 'custom_event',
    eventCategory: category,
    eventAction: action,
    ...(label ? { eventLabel: label } : {}),
    ...(typeof value === 'number' ? { eventValue: value } : {}),
    sessionId,
    eventId,
    ...(userContext ? { userId: userContext.userId, userTraits: userContext.traits } : {}),
    timestamp: Date.now(),
    ...safeMeta,
  };
  try { if (Array.isArray(window.dataLayer)) window.dataLayer.push(payload); } catch { /* ignore */ }
  try { window.analytics?.track?.(action, { category, label, value, ...safeMeta, sessionId }); } catch { /* ignore */ }
  try { window.posthog?.capture?.(action, { category, label, value, ...safeMeta, sessionId }); } catch { /* ignore */ }
  // Transport backend dispatch (fire-and-forget)
  if (transportConfig.enabled && transportConfig.endpoint) {
    enqueueForBackend(payload);
  }
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[trackEvent]', payload);
  }
}

// Backend batching & retry ------------------------------------------------
type BackendEventPayload = InternalEventPayload;
const backendQueue: BackendEventPayload[] = [];
let backendFlushInFlight = false;
let backendFlushTimer: number | null = null;

function enqueueForBackend(ev: BackendEventPayload) {
  backendQueue.push(ev);
  scheduleBackendFlush();
}

function scheduleBackendFlush() {
  if (backendFlushTimer != null) return;
  backendFlushTimer = window.setTimeout(() => {
    backendFlushTimer = null;
    flushBackendQueue();
  }, 3000);
}

function flushBackendQueue(force = false) {
  if (!transportConfig.enabled || !transportConfig.endpoint) return;
  if (!hasAnalyticsConsent()) return;
  if (!force && backendQueue.length === 0) return;
  if (!circuitBreakerAllows()) {
    if (process.env.NODE_ENV !== 'production') console.warn('[analytics] circuit breaker open, skipping flush');
    return;
  }
  if (backendFlushInFlight) return; // avoid concurrent flushes
  backendFlushInFlight = true;
  try {
    // Apply batch caps
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
        recordFailure(); // treat 4xx as permanent failure for breaker counting
        if (process.env.NODE_ENV !== 'production') console.warn('[analytics] non-retryable status', res.status);
        return;
      }
      if (attempt < maxRetries) {
        const delay = (transportConfig.retryBaseDelayMs || 400) * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
        return sendBatchWithRetry(batch, attempt + 1);
      } else {
        recordFailure();
        if (process.env.NODE_ENV !== 'production') console.warn('[analytics] max retries exceeded');
        // Requeue unsent batch (optional) - here we push back if breaker not open
        if (!breakerOpen) backendQueue.unshift(...batch);
      }
    } else {
      recordSuccess();
      setLastFlushTs(Date.now());
    }
  } catch {
    if (attempt < maxRetries) {
      const delay = (transportConfig.retryBaseDelayMs || 400) * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
      return sendBatchWithRetry(batch, attempt + 1);
    } else {
      recordFailure();
      if (process.env.NODE_ENV !== 'production') console.warn('[analytics] network error, giving up');
      if (!breakerOpen) backendQueue.unshift(...batch);
    }
  }
}

function scheduleLowPriorityFlush() {
  if (!isBrowser()) return;
  if (lowPriorityFlushTimer) return;
  lowPriorityFlushTimer = window.setTimeout(() => {
    flushLowPriority();
  }, 4000); // time-based fallback
  if ('requestIdleCallback' in window && idleCallbackId == null) {
    const ric = (window as typeof window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (ric) idleCallbackId = ric(() => flushLowPriority());
  }
}

function flushLowPriority() {
  if (!hasAnalyticsConsent()) return; // still respect consent; leave queue intact
  if (idleCallbackId) { idleCallbackId = null; }
  if (lowPriorityFlushTimer) { window.clearTimeout(lowPriorityFlushTimer); lowPriorityFlushTimer = null; }
  while (lowPriorityQueue.length) {
    const ev = lowPriorityQueue.shift();
    if (ev) dispatchNow(ev);
  }
  setLastFlushTs(Date.now());
}

export function flushPreConsentQueue(): void {
  if (!hasAnalyticsConsent()) return;
  while (preConsentQueue.length) {
    const ev = preConsentQueue.shift();
    if (ev) {
      if (ev.priority === 'low') lowPriorityQueue.push(ev); else dispatchNow(ev);
    }
  }
  if (lowPriorityQueue.length) scheduleLowPriorityFlush();
  setLastFlushTs(Date.now());
  // attempt backend flush as well
  flushBackendQueue(true);
}

export function trackEvent<M extends Record<string, unknown> = Record<string, unknown>>(opts: TrackEventOptions<M>): void {
  if (!isBrowser()) return;
  if (!hasAnalyticsConsent()) {
    preConsentQueue.push(opts);
    return;
  }
  if (opts.priority === 'low') {
    lowPriorityQueue.push(opts);
    scheduleLowPriorityFlush();
    return;
  }
  dispatchNow(opts);
}

// Convenience API: track hash navigation
export function trackHashNavigation(newHash: string): void {
  trackEvent({ category: 'navigation', action: 'hash_change', label: newHash || 'empty' });
}

// Performance: mark hero paint after idle
export function trackHeroPaint(): void {
  if (!isBrowser()) return;
  if (!hasAnalyticsConsent()) {
    // queue retroactively; treat as high priority when flushed
    preConsentQueue.push({ category: 'perf', action: 'hero_paint', value: Math.round(performance.now()) });
    return;
  }
  const t = performance.now();
  trackEvent({ category: 'perf', action: 'hero_paint', value: Math.round(t) });
}

// Initialize analytics early if needed (e.g., ensure session id even before first event)
export function initAnalyticsSession(): void { ensureSessionId(); }

// Heartbeat ----------------------------------------------------------------
let heartbeatTimer: number | null = null;
export function startHeartbeat(intervalMs = 5 * 60 * 1000): void {
  if (!isBrowser()) return;
  if (heartbeatTimer) return;
  const tick = () => {
    if (document.visibilityState === 'visible') {
      trackEvent({ category: 'heartbeat', action: 'interval_ping', priority: 'low', metadata: { intervalMs } });
    }
  };
  heartbeatTimer = window.setInterval(tick, intervalMs);
  tick(); // initial
}

// Visibility / Focus (simple engagement examples)
export function initVisibilityListeners(): void {
  if (!isBrowser()) return;
  window.addEventListener('visibilitychange', () => {
    trackEvent({ category: 'engagement', action: 'visibility_change', priority: 'low', metadata: { state: document.visibilityState } });
  });
  window.addEventListener('focus', () => {
    trackEvent({ category: 'engagement', action: 'focus', priority: 'low' });
  });
}

// Section visibility -------------------------------------------------------
export function initSectionObserver(sectionIds: string[] = ['mission','vision','voices']): void {
  if (!isBrowser() || !('IntersectionObserver' in window)) return;
  const observed = new Set<string>();
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        if (id && !observed.has(id)) {
          observed.add(id);
          trackEvent({ category: 'navigation', action: 'section_view', label: id, priority: 'low' });
        }
      }
    });
  }, { threshold: 0.35 });
  sectionIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  });
}

// Error tracking -----------------------------------------------------------
let errorHooksInstalled = false;
export function installErrorHooks(): void {
  if (!isBrowser()) return;
  if (errorHooksInstalled) return;
  errorHooksInstalled = true;
  window.addEventListener('error', (e) => {
    trackEvent({ category: 'error', action: 'exception', priority: 'high', metadata: {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      stack: (e.error && (e.error as Error).stack) || undefined,
      name: (e.error && (e.error as Error).name) || undefined,
    }});
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reasonAny = (e as PromiseRejectionEvent).reason as unknown;
    let reasonMsg = 'unknown';
    let stack: string | undefined;
    if (reasonAny) {
      if (typeof reasonAny === 'string') reasonMsg = reasonAny;
      else if (reasonAny instanceof Error) { reasonMsg = reasonAny.message; stack = reasonAny.stack; }
      else if (typeof (reasonAny as { message?: unknown }).message === 'string') {
        reasonMsg = String((reasonAny as { message?: unknown }).message);
      }
    }
    trackEvent({ category: 'error', action: 'unhandled_rejection', priority: 'high', metadata: {
      reason: reasonMsg,
      stack,
      name: reasonAny instanceof Error ? reasonAny.name : undefined,
    }});
  });
}

// Consent change hook (developer can call setAnalyticsConsent, then manually flush)
export function onConsentGranted(): void {
  trackEvent({ category: 'lifecycle', action: 'consent_granted' });
  flushPreConsentQueue();
  // Enable third-party telemetry now that user consented
  try {
    import('./appInsights').then(m => m.enableAppInsightsTelemetry()).catch(() => {});
  } catch { /* ignore */ }
}
export function onConsentDenied(): void {
  trackEvent({ category: 'lifecycle', action: 'consent_denied' });
}

// Unload / pagehide flush using Beacon --------------------------------------------------
let unloadRegistered = false;
export function registerUnloadFlush(): void {
  if (!isBrowser() || unloadRegistered) return;
  unloadRegistered = true;
  const handler = () => {
    if (!hasAnalyticsConsent()) return;
    // Flush any remaining low-priority events synchronously
    while (lowPriorityQueue.length) {
      const ev = lowPriorityQueue.shift();
      if (ev) dispatchNow(ev);
    }
    setLastFlushTs(Date.now());
    // Force backend flush of remaining queue (best-effort)
    flushBackendQueue(true);
  };
  window.addEventListener('pagehide', handler);
  window.addEventListener('beforeunload', handler);
}

// Debug info exposure -----------------------------------------------------
export function getAnalyticsDebugInfo() {
  return {
    consent: hasAnalyticsConsent(),
    lowPriorityQueue: lowPriorityQueue.length,
    preConsentQueue: preConsentQueue.length,
    backendQueue: backendQueue.length,
    lastFlushTs: getLastFlushTs(),
    sampling: CATEGORY_SAMPLE_RATES,
    breaker: { open: breakerOpen, consecutiveFailures, openedAt: breakerOpenedAt },
    transportEnabled: transportConfig.enabled,
  };
}

// Additional metrics scaffolding ------------------------------------------
// First Input Delay surrogate
let firstInputCaptured = false;
export function initFirstInputDelayCapture() {
  if (!isBrowser() || firstInputCaptured) return;
  const onInput = () => {
    if (firstInputCaptured) return;
    firstInputCaptured = true;
    const delay = performance.now(); // approximate since we don't have event processing start
    trackEvent({ category: 'perf', action: 'fid', value: Math.round(delay) });
    window.removeEventListener('pointerdown', onInput, true);
    window.removeEventListener('keydown', onInput, true);
  };
  window.addEventListener('pointerdown', onInput, true);
  window.addEventListener('keydown', onInput, true);
}

// Layout shift observer (rough CLS surrogate) - sums shifts > 0.01
let clsValue = 0;
let clsObserved = false;
export function initLayoutShiftObserver() {
  if (!isBrowser() || clsObserved || !('PerformanceObserver' in window)) return;
  clsObserved = true;
  try {
    const po = new PerformanceObserver(list => {
      for (const entry of list.getEntries() as PerformanceEntry[]) {
        const ls = entry as unknown as { value?: number; hadRecentInput?: boolean };
        if (typeof ls.value === 'number' && !ls.hadRecentInput) {
          clsValue += ls.value;
        }
      }
    });
    po.observe({ type: 'layout-shift', buffered: true } as PerformanceObserverInit);
    // send metric on pagehide
    window.addEventListener('pagehide', () => {
      if (clsValue > 0) {
        trackEvent({ category: 'perf', action: 'cls_total', value: Math.round(clsValue * 1000), metadata: { raw: clsValue } });
      }
    });
  } catch { /* ignore */ }
}

// Quote transition performance helper (public API expects caller to supply durations)
export function trackQuoteTransition(durationMs: number, threshold = PERF_THRESHOLDS.quoteTransitionLongFrameMs) {
  if (durationMs > threshold) {
    trackEvent({ category: 'perf', action: 'quote_transition', value: Math.round(durationMs), metadata: { threshold } });
  }
}

// Internal test helpers (not for production usage) -----------------------
export const __test = {
  _getBreaker: () => ({ consecutiveFailures, breakerOpen, breakerOpenedAt }),
  _resetBreaker: () => { consecutiveFailures = 0; breakerOpen = false; breakerOpenedAt = null; },
  _forceFlush: () => { try { flushBackendQueue(true); } catch { /* ignore */ } },
  // Await until no flush in flight (polling) or timeout (2s) for deterministic unit tests
  _drain: async (timeoutMs = 2000) => {
    const start = Date.now();
    while (true) {
      if (!backendFlushInFlight) break;
      if (Date.now() - start > timeoutMs) break;
      await new Promise(r => setTimeout(r, 10));
    }
    // give microtasks a chance (fetch resolution)
    await new Promise(r => setTimeout(r, 5));
  },
  _forceHalfOpen: () => { if (breakerOpen) { breakerOpenedAt = Date.now() - (transportConfig.circuitBreakerCooldownMs || 60_000) - 10; } }
};
