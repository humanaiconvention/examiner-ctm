import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initAnalyticsSession, trackHeroPaint, trackHashNavigation, trackEvent, hasAnalyticsConsent, initSectionObserver, startHeartbeat, initVisibilityListeners, installErrorHooks, flushPreConsentQueue, registerUnloadFlush, configureAnalyticsTransport, initFirstInputDelayCapture, initLayoutShiftObserver } from './analytics'
import { initAppInsights, registerVitalsStarter } from './appInsights'
import { startVitals } from './vitals'
import SW_CONFIG from './sw-config'

// Attempt to eagerly load generated version info (in dev it exists after version:gen; in prod built into dist)
async function attachGeneratedVersion() {
  if (window.__APP_VERSION__) return
  try {
    // Use Vite glob to avoid TS complaint when file absent before generation
  interface GenMod { APP_VERSION?: { version: string; commit: string; [k: string]: unknown } }
  const modules = import.meta.glob('./generated/appVersion.ts', { eager: true }) as Record<string, GenMod>
    const first = Object.values(modules)[0]
    if (first && first.APP_VERSION) {
      const fallback = { name: 'web', buildTime: new Date().toISOString(), fullCommit: first.APP_VERSION.commit }
      const composed = { ...fallback, ...first.APP_VERSION }
      const v = composed
      window.__APP_VERSION__ = composed as {
        name: string; version: string; commit: string; fullCommit?: string; buildTime: string
      }
      const meta = document.querySelector('meta[name="x-app-version"]')
      if (meta) meta.setAttribute('content', `${v.version}+${v.commit}`)
    }
  } catch {
    // ignore
  }
}
attachGeneratedVersion()

// Application Insights (if key provided) - initialize before custom analytics to allow route tracking
interface EnvMeta { VITE_APPINSIGHTS_KEY?: string }
const aiKey = (import.meta as unknown as { env: EnvMeta }).env.VITE_APPINSIGHTS_KEY;
if (aiKey) {
  initAppInsights({ instrumentationKey: aiKey, samplingPercentage: 50 });
  // Lightweight dependency correlation: wrap global fetch when AI enabled
  try {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const start = performance.now();
      const urlStr = typeof input === 'string' ? input : (input as Request).url;
      const method = init?.method || (typeof input !== 'string' && (input as Request).method) || 'GET';
      // Simple 16 byte hex trace id
      const traceId = Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      const mergedInit: RequestInit = { ...(init || {}) };
      mergedInit.headers = new Headers((init && init.headers) || (typeof input !== 'string' && (input as Request).headers) || undefined);
      (mergedInit.headers as Headers).set('x-trace-id', traceId);
      try {
        const res = await originalFetch(input as RequestInfo, mergedInit);
        const duration = performance.now() - start;
        // Defer import to avoid cyclic load
        import('./appInsights').then(m => m.trackAiEvent('fetch_dependency', { url: urlStr, method, status: res.status, duration: Math.round(duration), traceId })).catch(()=>{});
        return res;
      } catch (err) {
        const duration = performance.now() - start;
        import('./appInsights').then(m => m.trackAiEvent('fetch_dependency', { url: urlStr, method, error: (err as Error).message, duration: Math.round(duration), traceId })).catch(()=>{});
        throw err;
      }
    };
  } catch { /* ignore */ }
}

// Analytics initialization
initAnalyticsSession()
installErrorHooks()
initVisibilityListeners()
initSectionObserver(['mission','vision','voices'])
startHeartbeat()
registerUnloadFlush()
// Optional transport activation via env variable
if (import.meta.env.VITE_ANALYTICS_ENDPOINT) {
  configureAnalyticsTransport({ enabled: true, endpoint: import.meta.env.VITE_ANALYTICS_ENDPOINT as string, useBeacon: true });
}
// Initialize additional metrics capture
initFirstInputDelayCapture();
initLayoutShiftObserver();
// optional feature flag to disable vitals collection entirely (privacy mode / perf testing isolation)
if (import.meta.env.VITE_DISABLE_VITALS !== 'true') {
  registerVitalsStarter(() => startVitals());
}

// Track initial hash (if present)
if (location.hash) {
  trackHashNavigation(location.hash)
}

// Listen for hash changes (simple internal anchor nav)
window.addEventListener('hashchange', () => {
  trackHashNavigation(location.hash)
})

// Performance: hero paint marker after idle (if consent granted later, we can optionally fire when toggled)
const scheduleHeroPaint = () => {
  if (!hasAnalyticsConsent()) return
  if ('requestIdleCallback' in window) {
    // Narrow the type with an inline declaration
    const ric = (window as typeof window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback
    if (ric) ric(() => trackHeroPaint(), { timeout: 3000 })
  } else {
    setTimeout(() => trackHeroPaint(), 500)
  }
}
scheduleHeroPaint()

// Fire a page_view style event
trackEvent({ category: 'navigation', action: 'page_view', label: location.pathname + location.hash })

// If consent already granted before load (e.g. persisted), flush queued events
if (hasAnalyticsConsent()) {
  flushPreConsentQueue()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Dev helper & observability meta tag (non-sensitive config only)
try {
  interface DebugWindow extends Window { __dumpSWConfig?: () => void }
  (window as DebugWindow).__dumpSWConfig = () => {
    // eslint-disable-next-line no-console
    console.log('[SW_CONFIG]', SW_CONFIG);
    return SW_CONFIG;
  };
  interface ViteEnv { VITE_SW_EXPOSE_META?: string; PROD?: boolean }
  const env = (import.meta as unknown as { env: ViteEnv }).env;
  const expose = !env.PROD || env.VITE_SW_EXPOSE_META === 'true';
  // Compute hash deterministically each load (for drift detection even if not exposed)
  const payloadObj = {
    manifestHardBustRatio: SW_CONFIG.manifestHardBustRatio,
    autoRefresh: SW_CONFIG.autoRefresh,
  };
  const payload = JSON.stringify(payloadObj);
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  const hashHex = hash.toString(16).padStart(8, '0');
  // Persist last hash & detect drift (between reloads) - even if meta not exposed
  const LS_KEY = 'sw:configHash';
  try {
    const last = localStorage.getItem(LS_KEY);
    if (last && last !== hashHex) {
      // Fire drift event (includes previous & current) – only if analytics available
      try { trackEvent({ category: 'interaction', action: 'sw_config_drift', label: 'hash_changed', metadata: { previous: last, current: hashHex } }); } catch {/* ignore */}
    }
    localStorage.setItem(LS_KEY, hashHex);
  } catch { /* ignore */ }
  if (expose) {
    const metaId = 'x-sw-config-json';
    if (!document.querySelector(`meta[name="${metaId}"]`)) {
      const m = document.createElement('meta');
      m.name = metaId;
      m.content = JSON.stringify({ ...payloadObj, configHash: hashHex });
      document.head.appendChild(m);
      const mh = document.createElement('meta');
      mh.name = 'x-sw-config-hash';
      mh.content = hashHex;
      document.head.appendChild(mh);
    }
  }
} catch { /* ignore */ }

// Register service worker (production builds only, and if supported)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(async reg => {
      // Helper for manual debug in console: window.__forceSWUpdate()
      interface DebugWindow extends Window { __forceSWUpdate?: () => void }
      (window as DebugWindow).__forceSWUpdate = () => reg.active?.postMessage('refresh-precache');
      // Periodic background sync registration (if supported & permission granted)
      try {
        type PeriodicPermissionState = 'granted' | 'denied' | 'prompt';
        interface PeriodicPermissionResult { state: PeriodicPermissionState }
        const permQuery = (navigator as unknown as { permissions?: { query: (opts: { name: string }) => Promise<PeriodicPermissionResult> } }).permissions;
        let allowed = true;
        if (permQuery?.query) {
          const status = await permQuery.query({ name: 'periodic-background-sync' });
            allowed = status.state === 'granted';
        }
        const periodicSync = (reg as unknown as { periodicSync?: { getTags(): Promise<string[]>; register(tag: string, opts: { minInterval: number }): Promise<void> } }).periodicSync;
        if (allowed && periodicSync) {
          const tags = await periodicSync.getTags();
          if (!tags.includes('refresh-precache')) {
            await periodicSync.register('refresh-precache', { minInterval: 24 * 60 * 60 * 1000 }); // daily
          }
        }
      } catch { /* ignore */ }
      // Fallback lightweight interval ping to request a trim/runtime refresh
      setInterval(() => {
        if (reg.active) reg.active.postMessage('trim-runtime');
      }, 6 * 60 * 60 * 1000); // every 6h
    }).catch(err => {
      console.warn('[sw] registration failed', err);
    });
  });
}
