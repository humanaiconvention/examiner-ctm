// Modular analytics loader
// Splits previously monolithic implementation into on-demand chunks.
// core (events/consent), engagement, perf, errors, navigation.
// NOTE: Intentionally NOT re-exporting analytics types here to keep this
// entrypoint lean and avoid accidental deep dependency chains. Import types
// directly from 'src/analytics' (legacy root) or from './core' instead.
export { configureAnalyticsTransport, flushBackendQueue } from './transport';
import { trackEvent } from './core';

// Core re-exports (synchronous lightweight API)
export {
  trackEvent,
  hasAnalyticsConsent,
  setAnalyticsConsent,
  setUserContext,
  initAnalyticsSession,
  flushPreConsentQueue,
  getAnalyticsDebugInfo,
  trackHashNavigation,
} from './core';

// Lazy module handles -----------------------------------------------------
let _engagementLoaded = false;
let _perfLoaded = false;
let _errorsLoaded = false;

function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

async function loadEngagement() {
  if (_engagementLoaded) return; _engagementLoaded = true;
  const start = now();
  const mod = await import('./engagement');
  mod.initVisibilityListeners();
  mod.initSectionObserver(['mission','vision','voices']);
  mod.startHeartbeat();
  try { trackEvent({ category: 'perf', action: 'perf_metric', value: Math.round(now()-start), metadata: { chunk: 'engagement', metric: 'analytics_chunk_loaded' } }); } catch { /* ignore */ }
}

function shouldSkipPerfChunk(): boolean {
  try {
    const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
    if (nav.connection?.saveData) return true;
    if (typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 && nav.deviceMemory < 2) return true;
  } catch { /* ignore */ }
  return false;
}

async function loadPerf() {
  if (_perfLoaded) return; _perfLoaded = true;
  if (shouldSkipPerfChunk()) {
    try { trackEvent({ category: 'perf', action: 'perf_metric', value: 0, metadata: { chunk: 'perf', metric: 'analytics_chunk_skipped' } }); } catch { /* ignore */ }
    return;
  }
  const start = now();
  const mod = await import('./perf');
  mod.initFirstInputDelayCapture();
  mod.initLayoutShiftObserver();
  try { trackEvent({ category: 'perf', action: 'perf_metric', value: Math.round(now()-start), metadata: { chunk: 'perf', metric: 'analytics_chunk_loaded' } }); } catch { /* ignore */ }
}

async function loadErrors() {
  if (_errorsLoaded) return; _errorsLoaded = true;
  const start = now();
  const mod = await import('./errors');
  mod.installErrorHooks();
  try { trackEvent({ category: 'perf', action: 'perf_metric', value: Math.round(now()-start), metadata: { chunk: 'errors', metric: 'analytics_chunk_loaded' } }); } catch { /* ignore */ }
}

// Public opt-in loaders (host can decide sequencing)
export const analyticsLoaders = {
  loadEngagement,
  loadPerf,
  loadErrors,
};

// On-demand single metric helpers (proxy to perf module once loaded)
export async function trackHeroPaintLazy() {
  await loadPerf();
  const { trackHeroPaint } = await import('./perf');
  trackHeroPaint();
}
export async function trackPerfMetricLazy(metric: string, value: number, meta?: Record<string, unknown>, phase?: string) {
  await loadPerf();
  const { trackPerfMetric } = await import('./perf');
  trackPerfMetric(metric, value, meta, phase);
}

// Test helpers
import { __transportTest } from './transport';
export const __test = {
  _resetBreaker: () => { try { __transportTest._resetBreaker(); } catch { /* ignore */ } },
  _forceHalfOpen: () => { try { __transportTest._forceHalfOpen(); } catch { /* ignore */ } },
  _forceFlush: () => { try { __transportTest._forceFlush(); } catch { /* ignore */ } },
};
