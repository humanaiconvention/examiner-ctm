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

// Transport & circuit breaker moved to analytics/transport
import { enqueueForBackend, flushBackendQueue, getTransportDebugInfo, setTrackEventDelegate, transportIsEnabled } from './analytics/transport';
// Back-compat re-exports for tests (will be removed after full modularization)
export { configureAnalyticsTransport } from './analytics/transport';
export { installErrorHooks } from './analytics/errors';
import { __transportTest } from './analytics/transport';
export const __test = {
  _resetBreaker: () => { try { __transportTest._resetBreaker(); } catch { /* ignore */ } },
  _forceHalfOpen: () => { try { __transportTest._forceHalfOpen(); } catch { /* ignore */ } },
  _forceFlush: () => { try { flushBackendQueue(true); } catch { /* ignore */ } },
  _getBreaker: () => { try { return __transportTest._getBreaker(); } catch { return {}; } },
  _drain: async (timeoutMs = 500) => { // simplified: wait a short time for async fetch attempts
    await new Promise(r => setTimeout(r, 5));
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      // No explicit in-flight flag exposed now; just break quickly
      await new Promise(r => setTimeout(r, 10));
      break;
    }
  }
};

// Sanitization moved to separate module for clarity.
import { sanitizeMetadata } from './analytics/sanitize';

// Debug / quiet mode -------------------------------------------------------
const __isTestEnv = typeof process !== 'undefined' && (process.env.VITEST || process.env.NODE_ENV === 'test');
let analyticsQuietMode = !!__isTestEnv;
export function setAnalyticsQuietMode(quiet: boolean): void { analyticsQuietMode = quiet; }

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
  | 'intro'
  | 'config';

// Actions per category (rough initial taxonomy)
type InteractionActions = 'click' | 'cta' | 'toggle' | 'sw_auto_refresh' | 'sw_background_notice' | 'sw_update_decision' | 'sw_hard_bust_complete' | 'question_submit';
// Legacy 'sw_config_drift' action removed after migration window; unified taxonomy uses category 'config' + action 'drift'.
type ConfigActions = 'drift';
type NavigationActions = 'page_view' | 'hash_change' | 'section_view';
type PerfActions = 'hero_paint' | 'fid' | 'cls_total' | 'quote_transition' | 'perf_metric';
type EngagementActions = 'focus' | 'visibility_change';
type ErrorActions = 'exception' | 'unhandled_rejection';
type LifecycleActions = 'session_start' | 'consent_granted' | 'consent_denied' | 'breaker_open' | 'breaker_half_open' | 'breaker_closed';
type HeartbeatActions = 'interval_ping';
type IntroActions = 'intro_impression' | 'intro_stage_view' | 'intro_completed' | 'intro_safety_fallback';

export type AnalyticsAction =
  | InteractionActions
  | NavigationActions
  | PerfActions
  | EngagementActions
  | ErrorActions
  | LifecycleActions
  | HeartbeatActions
  | IntroActions
  | ConfigActions;

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
  case 'interaction': return ['click','cta','toggle','sw_auto_refresh','sw_background_notice','sw_update_decision','sw_hard_bust_complete','question_submit'].includes(action);
  case 'config': return ['drift'].includes(action);
    case 'navigation': return ['page_view','hash_change','section_view'].includes(action);
  case 'perf': return ['hero_paint','fid','cls_total','quote_transition','perf_metric'].includes(action);
    case 'engagement': return ['focus','visibility_change'].includes(action);
    case 'error': return ['exception','unhandled_rejection'].includes(action);
  case 'lifecycle': return ['session_start','consent_granted','consent_denied','breaker_open','breaker_half_open','breaker_closed'].includes(action);
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
  if (transportIsEnabled()) {
    enqueueForBackend(payload);
  }
  if (process.env.NODE_ENV !== 'production' && !analyticsQuietMode) {
    console.warn('[trackEvent]', payload);
  }
}

// Backend batching & retry moved to transport module

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

// Generic perf metric helper for unified taxonomy.
// Example: trackPerfMetric('LCP', 2450, { phase: 'final', size: 12345 })
export function trackPerfMetric(metric: string, value: number, meta?: Record<string, unknown>, phase?: string): void {
  if (!isBrowser()) return;
  const metadata: Record<string, unknown> = { metric, ...(phase ? { phase } : {}), ...(meta || {}) };
  if (!hasAnalyticsConsent()) {
    preConsentQueue.push({ category: 'perf', action: 'perf_metric', value: Math.round(value), metadata, priority: 'high' });
    return;
  }
  trackEvent({ category: 'perf', action: 'perf_metric', value: Math.round(value), metadata });
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

// Error tracking moved to analytics/errors.ts

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
  const transport = getTransportDebugInfo();
  return {
    consent: hasAnalyticsConsent(),
    lowPriorityQueue: lowPriorityQueue.length,
    preConsentQueue: preConsentQueue.length,
    backendTransport: transport,
    lastFlushTs: getLastFlushTs(),
    sampling: CATEGORY_SAMPLE_RATES,
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
// (legacy bottom __test removed; unified at top for breaker utilities)

// Register trackEvent delegate with transport (after definition of trackEvent above).
setTrackEventDelegate(({ category, action, metadata }) => {
  if (metadata) {
    trackEvent({ category, action, priority: 'high', metadata });
  } else {
    trackEvent({ category, action, priority: 'high' });
  }
});
