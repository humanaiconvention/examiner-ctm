import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { criticalHeroCss } from './critical/hero.css'
import App from './App.tsx'
// Early performance harness (captures paint & LCP before lazy loads)
import './perf/startupHarness'
import './perf/lcp'
import React from 'react'
import ChunkLoadBoundary from './components/ChunkLoadBoundary'
// Convert secondary pages to lazy-loaded chunks for future dashboard panel expansion
const LearnMore = React.lazy(() => import('./pages/LearnMore'))
const Explore = React.lazy(() => import('./pages/Explore'))
const PreviewQuestions = React.lazy(() => import('./pages/PreviewQuestions'))
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AnalyticsLoadDiagnostics from './components/AnalyticsLoadDiagnostics'
// Deferred analytics: lightweight stubs replaced after dynamic import.
// SSR / Prerender guard: skip analytics wiring when rendering on server
const IS_SSR = typeof window === 'undefined' || Boolean((import.meta as unknown as { env?: Record<string, unknown> }).env?.SSR);
// Mark body with intro-pending before React renders if localStorage indicates intro not complete
try {
  if (typeof document !== 'undefined') {
    const introDone = localStorage.getItem('hq:introComplete') === 'true';
    const isRootPath = location.pathname === '/' || location.pathname === '';
    if (!introDone && isRootPath && !document.body.classList.contains('intro-pending')) {
      document.body.classList.add('intro-pending');
    }
    if (introDone || !isRootPath) {
      document.body.classList.remove('intro-pending');
      document.body.classList.add('reveal-ready');
      // For non-root direct navigations, allow slower reveal just once if intro not yet done
      if (!introDone && !isRootPath) {
        document.body.classList.add('reveal-slow');
      }
    } else {
      // Observe localStorage changes indirectly via storage event (other tabs) and a lightweight poll fallback
      const markReveal = () => {
        if (localStorage.getItem('hq:introComplete') === 'true') {
          document.body.classList.remove('intro-pending');
          document.body.classList.add('reveal-ready');
          try { document.dispatchEvent(new Event('reveal:ready')); } catch { /* ignore */ }
          window.removeEventListener('storage', onStorage);
        }
      };
      const onStorage = (e: StorageEvent) => { if (e.key === 'hq:introComplete') markReveal(); };
      window.addEventListener('storage', onStorage);
      // Poll fallback (very short-lived; cleared after success or 6s)
      let pollCount = 0;
      const poll = () => {
        if (pollCount++ > 60) return; // ~6s max at 100ms
        if (localStorage.getItem('hq:introComplete') === 'true') {
          markReveal();
        } else {
          setTimeout(poll, 100);
        }
      };
      setTimeout(poll, 300); // allow React mount first
      // Safety timeout: if gate fails to mount quickly, unhide to avoid blank screen
      let safetyTimeoutFired = false;
      const safetyTimeoutMs = 1200;
      const safetyTimeout = window.setTimeout(() => {
        safetyTimeoutFired = true;
        if (document.body.classList.contains('intro-pending')) {
          document.body.classList.remove('intro-pending');
          document.body.classList.add('reveal-ready');
        }
        // Lazy load analytics only when actually needed (rare path)
        import('./analytics/index').then(m => {
          try {
            m.trackEvent({
              category: 'intro',
              action: 'intro_safety_fallback',
              metadata: { route: location.pathname, elapsedMs: safetyTimeoutMs }
            });
          } catch { /* ignore */ }
        }).catch(()=>{});
      }, safetyTimeoutMs);
      // Cancel safety timeout early if gate mounts
      document.addEventListener('intro:gate-mounted', () => {
        if (!safetyTimeoutFired) clearTimeout(safetyTimeout);
      }, { once: true });
    }
    // Feature detect attr() in calc for transition-delay (Chrome/Firefox support; Safari pending experimentally)
    try {
      const supportsAttrDelay = CSS && 'supports' in CSS && CSS.supports('transition-delay: calc(1ms + (attr(data-reveal-order integer) * 1ms))');
      if (!supportsAttrDelay) {
        document.body.classList.add('no-attr-delay');
        // When reveal fires, set inline delays manually for each element with data-reveal-order
        const applyInlineDelays = () => {
          if (!document.body.classList.contains('reveal-ready')) return;
            const slow = document.body.classList.contains('reveal-slow');
            const base = slow ? 300 : 60; // 5x slower on first reveal
            document.querySelectorAll('[data-reveal][data-reveal-order]').forEach(el => {
              const order = parseInt(el.getAttribute('data-reveal-order') || '0', 10);
              if (!isNaN(order)) (el as HTMLElement).style.transitionDelay = `${Math.max(0, order) * base}ms`;
            });
          document.removeEventListener('reveal:ready', applyInlineDelays);
        };
        document.addEventListener('reveal:ready', applyInlineDelays);
        // If already ready (intro skipped), apply immediately
        if (document.body.classList.contains('reveal-ready')) applyInlineDelays();
      }
    } catch { /* ignore feature detection errors */ }
  }
} catch { /* ignore */ }
interface StubTrackEventOpts { category?: string; action: string; label?: string; value?: number; metadata?: Record<string, unknown>; priority?: string }
let trackEvent: (opts: StubTrackEventOpts) => void = () => {};
let hasAnalyticsConsent: () => boolean = () => false;
let trackHashNavigation: (hash: string) => void = () => {};
let flushPreConsentQueue: () => void = () => {};
let initAnalyticsSession: () => void = () => {};
const registerUnloadFlush: () => void = () => {};
let configureAnalyticsTransport: (cfg: Record<string, unknown>) => void = () => {};
// trackHeroPaint placeholder (assigned post lazy-load)

const analyticsLoadState: { loading?: boolean; loaded?: boolean } = {};
let fcpValue: number | null = null;
// Observe First Contentful Paint for breaker decisions
try {
  if ('PerformanceObserver' in window) {
    const po = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint' && fcpValue == null) {
          fcpValue = entry.startTime;
        }
      }
    });
    po.observe({ type: 'paint', buffered: true } as PerformanceObserverInit);
  }
} catch { /* ignore */ }
function ensureAnalytics() {
  if (IS_SSR) return; // never load on server/prerender stage
  if (analyticsLoadState.loading || analyticsLoadState.loaded) return;
  analyticsLoadState.loading = true;
    const start = performance.now();
    import('./analytics/index').then(async mod => {
      trackEvent = mod.trackEvent as unknown as typeof trackEvent;
      hasAnalyticsConsent = mod.hasAnalyticsConsent;
      trackHashNavigation = mod.trackHashNavigation;
      flushPreConsentQueue = mod.flushPreConsentQueue;
      initAnalyticsSession = mod.initAnalyticsSession;
      configureAnalyticsTransport = mod.configureAnalyticsTransport as unknown as typeof configureAnalyticsTransport;
    // registerUnloadFlush not exposed in modular API yet; keep no-op until integrated
      // staged loaders
      const { analyticsLoaders } = mod;
      initAnalyticsSession();
      registerUnloadFlush();
      if (import.meta.env.VITE_ANALYTICS_ENDPOINT) {
        configureAnalyticsTransport({ enabled: true, endpoint: import.meta.env.VITE_ANALYTICS_ENDPOINT as string, useBeacon: true });
      }
      // Breaker: if FCP very slow (>4000ms) delay optional modules until idle to reduce contention
      const verySlowFcp = (fcpValue ?? performance.now()) > 4000;
      if (verySlowFcp) {
        if ('requestIdleCallback' in window) {
          (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback?.(()=> { analyticsLoaders.loadEngagement(); analyticsLoaders.loadPerf(); analyticsLoaders.loadErrors(); }, { timeout: 6000 });
        } else {
          setTimeout(()=> { analyticsLoaders.loadEngagement(); analyticsLoaders.loadPerf(); analyticsLoaders.loadErrors(); }, 3500);
        }
      } else {
        analyticsLoaders.loadEngagement();
        analyticsLoaders.loadPerf();
        analyticsLoaders.loadErrors();
      }
    analyticsLoaders.loadErrors();
      if (location.hash) trackHashNavigation(location.hash);
      if (hasAnalyticsConsent()) flushPreConsentQueue();
    const loadMs = Math.round(performance.now() - start);
      // Persist timing history (cap length to 30 entries)
      try {
        const key = 'haic:analyticsLoadTimes';
        const raw = localStorage.getItem(key);
        const arr = Array.isArray(JSON.parse(raw || '[]')) ? JSON.parse(raw || '[]') as number[] : [];
        arr.push(loadMs);
        while (arr.length > 30) arr.shift();
        localStorage.setItem(key, JSON.stringify(arr));
        // Compute simple median & p90 for historical comparison (excluding current for baseline, then include)
        const hist = arr.slice(0, -1);
        function percentile(list: number[], p: number) {
          if (!list.length) return null;
          const sorted = [...list].sort((a,b)=>a-b);
          const idx = Math.min(sorted.length-1, Math.floor((p/100)*sorted.length));
          return sorted[idx];
        }
  const medianPrev = percentile(hist, 50);
  const p75Prev = percentile(hist, 75);
  const p90Prev = percentile(hist, 90);
  const p95Prev = hist.length >= 20 ? percentile(hist, 95) : null;
  trackEvent({ category: 'perf', action: 'perf_metric', value: loadMs, metadata: { metric: 'analytics_initial_load', medianPrev, p75Prev, p90Prev, p95Prev, slowFcp: fcpValue != null ? Math.round(fcpValue) : null } });
      } catch { /* ignore */ }
      trackEvent({ category: 'navigation', action: 'page_view', label: location.pathname + location.hash, metadata: { ttfbAnalyticsMs: loadMs } });
      analyticsLoadState.loaded = true;
    }).catch(()=>{});
}

// Trigger analytics load after first interaction or idle fallback (client only)
if (!IS_SSR && typeof window !== 'undefined') {
  const trigger = () => { ensureAnalytics(); cleanup(); };
  const cleanup = () => {
    window.removeEventListener('pointerdown', trigger);
    window.removeEventListener('keydown', trigger);
    window.removeEventListener('scroll', trigger);
  };
  window.addEventListener('pointerdown', trigger, { once: true });
  window.addEventListener('keydown', trigger, { once: true });
  window.addEventListener('scroll', trigger, { once: true });
  if ('requestIdleCallback' in window) {
    (window as typeof window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback?.(()=>ensureAnalytics(), { timeout: 3500 });
  } else {
    setTimeout(()=>ensureAnalytics(), 2500);
  }
}
// Application Insights is now lazy-loaded to reduce initial bundle size
type InitAppInsightsFn = (opts?: { instrumentationKey?: string; connectionString?: string; samplingPercentage?: number }) => void;
type RegisterVitalsStarterFn = (cb: () => void) => void;
let _initAppInsights: InitAppInsightsFn | null = null;
let _registerVitalsStarter: RegisterVitalsStarterFn | null = null;
async function ensureAppInsights() {
  if (_initAppInsights && _registerVitalsStarter) return;
  const mod = await import('./appInsights');
  _initAppInsights = mod.initAppInsights;
  _registerVitalsStarter = mod.registerVitalsStarter;
}
import { startVitals } from './vitals'
import SW_CONFIG from './sw-config'
import { APP_VERSION } from './generated/appVersion'
import { PREVIEW_QUESTIONS_CONFIG, hashPreviewConfig } from './config/previewQuestions'
import { fnv1a32 } from './lib/hash'

declare global {
  interface Window { __BUILD_REV?: string; __LOGO_HASH?: string }
}

// Expose build revision + logo hash early and optionally render overlay when ?rev=1
try {
  const buildRev = (APP_VERSION as Record<string, unknown>).buildRev as string | undefined;
  const logoHash = (APP_VERSION as Record<string, unknown>).logoHash as string | undefined;
  if (buildRev) window.__BUILD_REV = buildRev;
  if (logoHash) window.__LOGO_HASH = logoHash;
  const printed = sessionStorage.getItem('rev:printed');
  if (!printed) {
    // Single concise console banner
    // eslint-disable-next-line no-console
    console.log(`%cBuild ${buildRev || 'n/a'} (logo ${logoHash || 'n/a'})`, 'background:#0a2736;color:#8cf;padding:2px 6px;border-radius:4px');
    sessionStorage.setItem('rev:printed','1');
  }
  if (new URLSearchParams(location.search).get('rev') === '1') {
    const tag = document.createElement('div');
    tag.textContent = `${buildRev || 'n/a'} • logo ${logoHash || 'n/a'}`;
    tag.style.cssText = 'position:fixed;bottom:8px;right:8px;font:11px system-ui;padding:4px 8px;background:rgba(0,0,0,0.55);color:#9fe6ff;border:1px solid rgba(255,255,255,0.2);border-radius:6px;z-index:9999;pointer-events:none';
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(tag));
  }
} catch { /* ignore */ }

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
// Lazy initialization strategy: idle or first interaction
function scheduleAppInsightsInit() {
  if (!aiKey) return;
  let initialized = false;
  const initNow = async () => {
    if (initialized) return; initialized = true;
    try {
      await ensureAppInsights();
      _initAppInsights?.({ instrumentationKey: aiKey, samplingPercentage: 50 });
      // Wrap fetch for dependency telemetry
      try {
        const originalFetch = window.fetch.bind(window);
        window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
          const start = performance.now();
          const urlStr = typeof input === 'string' ? input : (input as Request).url;
          const method = init?.method || (typeof input !== 'string' && (input as Request).method) || 'GET';
          const traceId = Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2,'0')).join('');
          const mergedInit: RequestInit = { ...(init || {}) };
          mergedInit.headers = new Headers((init && init.headers) || (typeof input !== 'string' && (input as Request).headers) || undefined);
          (mergedInit.headers as Headers).set('x-trace-id', traceId);
          try {
            const res = await originalFetch(input as RequestInfo, mergedInit);
            const duration = performance.now() - start;
            import('./appInsights').then(m => m.trackAiEvent('fetch_dependency', { url: urlStr, method, status: res.status, duration: Math.round(duration), traceId })).catch(()=>{});
            return res;
          } catch (err) {
            const duration = performance.now() - start;
            import('./appInsights').then(m => m.trackAiEvent('fetch_dependency', { url: urlStr, method, error: (err as Error).message, duration: Math.round(duration), traceId })).catch(()=>{});
            throw err;
          }
        };
      } catch { /* ignore */ }
      // Start vitals only after AI ready (if not disabled)
      if (import.meta.env.VITE_DISABLE_VITALS !== 'true') {
        _registerVitalsStarter?.(() => startVitals());
      }
    } catch { /* ignore */ }
  };
  if ('requestIdleCallback' in window) {
    (window as typeof window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback?.(initNow, { timeout: 3000 });
  } else {
    setTimeout(initNow, 1500);
  }
  // First user interaction triggers immediate init
  const early = () => { initNow(); removeListeners(); };
  function removeListeners() {
    window.removeEventListener('pointerdown', early);
    window.removeEventListener('keydown', early);
    window.removeEventListener('scroll', early);
  }
  window.addEventListener('pointerdown', early, { once: true });
  window.addEventListener('keydown', early, { once: true });
  window.addEventListener('scroll', early, { once: true });
}
if (!IS_SSR) {
  scheduleAppInsightsInit();
}

// Legacy eager analytics bootstrap removed (now handled inside ensureAnalytics after dynamic import)
// Provide no-op scheduleHeroPaint for early calls; real one invoked post-load
// hero paint scheduling deferred with analytics; removed placeholder to keep bundle lean

if (!IS_SSR) {
  // Minimal hashchange listener to keep navigation semantics even before full analytics loads
  if (typeof window !== 'undefined') {
    window.addEventListener('hashchange', () => {
      trackHashNavigation(location.hash);
    });
  }
}

// Development diagnostics overlay
if (import.meta.env.DEV && typeof document !== 'undefined') {
  queueMicrotask(() => {
    const existing = document.getElementById('analytics-load-diagnostics');
    if (existing) return;
    const mount = document.createElement('div');
    mount.id = 'analytics-load-diagnostics';
    mount.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:99999;pointer-events:none;';
    document.body.appendChild(mount);
    try {
      const r = createRoot(mount);
      r.render(<AnalyticsLoadDiagnostics />);
    } catch { /* ignore */ }
  });
}

// Inline critical hero CSS early (idempotent)
try {
  const CRIT_ATTR = 'data-critical';
  if (!document.querySelector(`style[${CRIT_ATTR}="hero"]`)) {
    const styleEl = document.createElement('style');
    styleEl.setAttribute(CRIT_ATTR, 'hero');
    styleEl.textContent = criticalHeroCss;
    document.head.appendChild(styleEl);
  }
} catch { /* ignore */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ChunkLoadBoundary label="Loading page">
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/learn-more" element={<LearnMore />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/convene" element={<Explore />} />
          <Route path="/preview" element={<PreviewQuestions />} />
          <Route path="/preview-questions" element={<PreviewQuestions />} />
        </Routes>
      </ChunkLoadBoundary>
    </BrowserRouter>
  </StrictMode>,
)

// Mark hydration after next paint to approximate interactive readiness
try {
  requestAnimationFrame(() => {
    if (typeof window.__markHydration === 'function') {
      window.__markHydration();
    }
  });
} catch { /* ignore */ }

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
  const hashHex = fnv1a32(payload);
  // Persist last hash & detect drift (between reloads) - even if meta not exposed
  const LS_KEY = 'sw:configHash';
  try {
    const last = localStorage.getItem(LS_KEY);
    if (last && last !== hashHex) {
      // Fire drift event (includes previous & current) – only if analytics available
  try { trackEvent({ category: 'config', action: 'drift', label: 'sw_config', metadata: { previous: last, current: hashHex } }); } catch {/* ignore */}
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
    // Safety: if intro gate fails to mount within 1200ms, unhide content to avoid white screen
    if (document.body.classList.contains('intro-pending')) {
      setTimeout(() => {
        try {
          const gatePresent = document.querySelector('.intro-gate, .preview-intro-gate');
          if (!gatePresent) {
            document.body.classList.remove('intro-pending');
            document.body.classList.add('reveal-ready');
          }
        } catch { /* ignore */ }
      }, 1200);
    }
  }
} catch { /* ignore */ }

// Preview Questions config exposure & drift detection (non-sensitive numeric thresholds only)
try {
  interface ViteEnv { VITE_PREVIEW_EXPOSE_META?: string; PROD?: boolean }
  const env = (import.meta as unknown as { env: ViteEnv }).env;
  const expose = !env.PROD || env.VITE_PREVIEW_EXPOSE_META === 'true';
  const cfgHash = hashPreviewConfig(PREVIEW_QUESTIONS_CONFIG);
  const LS_KEY = 'preview:questions:configHash';
  try {
    const prev = localStorage.getItem(LS_KEY);
    if (prev && prev !== cfgHash) {
  trackEvent({ category: 'config', action: 'drift', label: 'preview_questions', metadata: { previous: prev, current: cfgHash } });
    }
    localStorage.setItem(LS_KEY, cfgHash);
  } catch { /* ignore */ }
  if (expose) {
    const metaId = 'x-preview-questions-config-json';
    if (!document.querySelector(`meta[name="${metaId}"]`)) {
      const m = document.createElement('meta');
      m.name = metaId;
      m.content = JSON.stringify({ ...PREVIEW_QUESTIONS_CONFIG, configHash: cfgHash });
      document.head.appendChild(m);
      const mh = document.createElement('meta');
      mh.name = 'x-preview-questions-config-hash';
      mh.content = cfgHash;
      document.head.appendChild(mh);
    }
  }
  interface DebugWindow extends Window { __dumpPreviewQuestionsConfig?: () => void }
  (window as DebugWindow).__dumpPreviewQuestionsConfig = () => {
    // eslint-disable-next-line no-console
    console.log('[PREVIEW_QUESTIONS_CONFIG]', PREVIEW_QUESTIONS_CONFIG);
    return PREVIEW_QUESTIONS_CONFIG;
  };
} catch { /* ignore */ }

// Test harness (non-production): allow runtime mutation of exposed config objects to simulate drift in E2E.
// Mutations are shallowly merged and drift detection logic re-run.
interface DriftHarnessEnv { VITE_ENABLE_DRIFT_HARNESS?: string; PROD?: boolean }
const __driftEnv = (import.meta as unknown as { env: DriftHarnessEnv }).env;
if (!__driftEnv.PROD && __driftEnv.VITE_ENABLE_DRIFT_HARNESS === 'true') {
  interface HarnessWindow extends Window { __testMutatePreviewQuestionsConfig?: (patch: Record<string, unknown>) => string; __testMutateSwConfig?: (patch: Record<string, unknown>) => string }
  const hw = window as HarnessWindow;
  hw.__testMutatePreviewQuestionsConfig = (patch) => {
    try {
  Object.assign(PREVIEW_QUESTIONS_CONFIG as unknown as Record<string, unknown>, patch);
      const cfgHash = hashPreviewConfig(PREVIEW_QUESTIONS_CONFIG);
      const LS_KEY = 'preview:questions:configHash';
      const prev = localStorage.getItem(LS_KEY);
      if (prev && prev !== cfgHash) {
        trackEvent({ category: 'config', action: 'drift', label: 'preview_questions', metadata: { previous: prev, current: cfgHash, harness: true } });
      }
      localStorage.setItem(LS_KEY, cfgHash);
      // Update meta tags if present
      const metaId = 'x-preview-questions-config-json';
      const jsonMeta = document.querySelector(`meta[name="${metaId}"]`);
      if (jsonMeta) jsonMeta.setAttribute('content', JSON.stringify({ ...PREVIEW_QUESTIONS_CONFIG, configHash: cfgHash }));
      const hashMeta = document.querySelector('meta[name="x-preview-questions-config-hash"]');
      if (hashMeta) hashMeta.setAttribute('content', cfgHash);
      return cfgHash;
    } catch { return 'error'; }
  };
  hw.__testMutateSwConfig = (patch) => {
    try {
  Object.assign(SW_CONFIG as unknown as Record<string, unknown>, patch);
      const payloadObj = { manifestHardBustRatio: SW_CONFIG.manifestHardBustRatio, autoRefresh: SW_CONFIG.autoRefresh };
      const payload = JSON.stringify(payloadObj);
      const hashHex = fnv1a32(payload);
      const LS_KEY = 'sw:configHash';
      const prev = localStorage.getItem(LS_KEY);
      if (prev && prev !== hashHex) {
        trackEvent({ category: 'config', action: 'drift', label: 'sw_config', metadata: { previous: prev, current: hashHex, harness: true } });
      }
      localStorage.setItem(LS_KEY, hashHex);
      const metaId = 'x-sw-config-json';
      const jsonMeta = document.querySelector(`meta[name="${metaId}"]`);
      if (jsonMeta) jsonMeta.setAttribute('content', JSON.stringify({ ...payloadObj, configHash: hashHex }));
      const hashMeta = document.querySelector('meta[name="x-sw-config-hash"]');
      if (hashMeta) hashMeta.setAttribute('content', hashHex);
      return hashHex;
    } catch { return 'error'; }
  };
}

// Register service worker (production builds only, and if supported)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(async reg => {
      // If an updated worker is already waiting, prompt reload (silent auto-refresh for now)
      if (reg.waiting) {
        // eslint-disable-next-line no-console
        console.info('[sw] update waiting – auto refreshing');
        reg.waiting.postMessage('force-reload');
        setTimeout(() => location.reload(), 400);
      } else {
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              // New content available, reload to apply
              // eslint-disable-next-line no-console
              console.info('[sw] new version installed – refreshing to apply');
              setTimeout(() => location.reload(), 300);
            }
          });
        });
      }
      // Helper for manual debug in console: window.__forceSWUpdate()
      interface DebugWindow extends Window { __forceSWUpdate?: () => void }
      (window as DebugWindow).__forceSWUpdate = () => reg.active?.postMessage('refresh-precache');
      // Design drift detection: compare stored logo hash with current and show toast if changed (first load after update)
      try {
        const LOGO_HASH_KEY = 'logo:hash';
        const prev = localStorage.getItem(LOGO_HASH_KEY);
        const currentLogoHash = window.__LOGO_HASH;
        if (currentLogoHash && prev && prev !== currentLogoHash) {
          // Inject toast
          const toast = document.createElement('div');
          toast.innerHTML = '<strong style="font-weight:600">New design available</strong><div style="margin-top:4px;font-weight:400">Logo updated – <button type="button" style="all:unset;cursor:pointer;color:#7bdcff;text-decoration:underline">reload</button></div>';
          toast.style.cssText = 'position:fixed;top:12px;right:12px;z-index:10000;background:#0b2230;color:#c8f3ff;font:12px system-ui;padding:10px 14px;border:1px solid #134d63;border-radius:8px;box-shadow:0 6px 22px -6px rgba(0,0,0,0.45);max-width:220px;line-height:1.35';
          document.body.appendChild(toast);
          const btn = toast.querySelector('button');
          const reload = () => location.reload();
          btn?.addEventListener('click', reload);
          // Auto-dismiss after 15s if user ignores
          setTimeout(() => toast.remove(), 15000);
        }
        if (currentLogoHash) localStorage.setItem(LOGO_HASH_KEY, currentLogoHash);
      } catch { /* ignore */ }
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
