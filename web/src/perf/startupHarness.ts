/*
 * Lightweight startup performance harness
 * Captures: first paint (FP), first contentful paint (FCP), largest contentful paint (LCP),
 * domContentLoaded, load event, and time-to-hydration marker (if manually triggered via window.__markHydration()).
 * Exposes window.__perfMarks for debugging.
 * Sends a consolidated analytics event (perf_startup_summary) and optional AI event (deferred).
 */

import { trackEvent } from '../analytics';

interface PerfSummary {
  fp?: number;
  fcp?: number;
  lcp?: number;
  cls?: number; // Cumulative Layout Shift total
  inp?: number; // Interaction to Next Paint (candidate)
  dcl?: number;
  load?: number;
  hydration?: number;
  navType?: string;
  transferSize?: number;
  encodedBodySize?: number;
  decodedBodySize?: number;
}

declare global {
  interface Window {
    __perfMarks?: PerfSummary;
    __markHydration?: () => void;
  }
}

const summary: PerfSummary = {};
window.__perfMarks = summary;

function rel(t: number) { return Math.round(t); }

// Paint timings
try {
  const paintEntries = performance.getEntriesByType('paint');
  for (const p of paintEntries) {
    if (p.name === 'first-paint') summary.fp = rel(p.startTime);
    if (p.name === 'first-contentful-paint') summary.fcp = rel(p.startTime);
  }
} catch { /* ignore */ }

// Observe LCP (disconnect after first reported candidate after load)
try {
  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const last = entries[entries.length - 1] as PerformanceEntry & { renderTime?: number; loadTime?: number };
    // Prefer renderTime/loadTime if present (they can be 0 so explicit undefined check)
    const candidateTimes: (number | undefined)[] = [last.renderTime, last.loadTime, last.startTime];
    const ts = candidateTimes.find(v => typeof v === 'number' && !Number.isNaN(v))!;
    summary.lcp = rel(ts);
  });
  observer.observe({ type: 'largest-contentful-paint', buffered: true } as PerformanceObserverInit);
  window.addEventListener('load', () => setTimeout(() => observer.disconnect(), 0));
} catch { /* ignore */ }

// Navigation timing (DOMContentLoaded & load)
function captureNavTiming() {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav) {
      summary.dcl = rel(nav.domContentLoadedEventEnd);
      summary.load = rel(nav.loadEventEnd);
      summary.navType = nav.type;
      summary.transferSize = nav.transferSize;
      summary.encodedBodySize = nav.encodedBodySize;
      summary.decodedBodySize = nav.decodedBodySize;
    } else {
      // Fallback for browsers without nav timing entry
      summary.dcl = summary.dcl || rel(performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart);
      summary.load = summary.load || rel(performance.timing.loadEventEnd - performance.timing.navigationStart);
    }
  } catch { /* ignore */ }
}
if (document.readyState === 'complete') captureNavTiming();
else window.addEventListener('load', () => captureNavTiming());

// Hydration marker (manual call once root React tree considered interactive)
window.__markHydration = () => {
  if (!summary.hydration) summary.hydration = rel(performance.now());
};

// Debug overlay (opt-in via ?perfdebug=1)
function initOverlay() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(location.search);
  if (params.get('perfdebug') !== '1') return;
  const el = document.createElement('div');
  el.id = 'perf-debug-overlay';
  el.setAttribute('role','status');
  el.style.cssText = [
    'position:fixed','z-index:9999','top:8px','right:8px','padding:10px 12px 14px 12px','font:12px/1.4 system-ui,Arial,sans-serif',
    'background:rgba(0,0,0,0.72)','backdrop-filter:blur(6px)','color:#e2e8f0','border:1px solid rgba(255,255,255,0.15)',
    'border-radius:8px','max-width:240px','pointer-events:none','white-space:nowrap'
  ].join(';');
  const title = 'Startup Perf';
  const toggleable = params.get('perftoggle') === '1';
  el.innerHTML = `<div style="display:flex;align-items:center;gap:6px;justify-content:space-between;">
    <strong style="color:#d4e55d">${title}</strong>
    ${toggleable ? '<button id="perf-hide-btn" style="all:unset;cursor:pointer;padding:2px 6px;font-size:11px;background:rgba(255,255,255,0.1);border-radius:4px;color:#fff;">Hide</button>' : ''}
  </div>
  <div id="perf-prev" style="margin-top:2px;font-size:10px;color:#94a3b8"></div>
  <div id="perf-debug-body" style="margin-top:4px;font-size:11px"></div>`;
  document.body.appendChild(el);
  const body = el.querySelector('#perf-debug-body') as HTMLDivElement;
  const prevDiv = el.querySelector('#perf-prev') as HTMLDivElement | null;

  // Previous session comparison
  try {
    const prevRaw = sessionStorage.getItem('perf:startup:last');
    if (prevRaw && prevDiv) {
      const prev = JSON.parse(prevRaw) as PerfSummary;
      const cmp: string[] = [];
      if (prev.lcp && summary.lcp) cmp.push(`ΔLCP ${summary.lcp - prev.lcp}`);
      if (prev.cls && summary.cls) cmp.push(`ΔCLS ${(summary.cls - prev.cls).toFixed(3)}`);
      if (prev.inp && summary.inp) cmp.push(`ΔINP ${summary.inp - prev.inp}`);
      if (cmp.length) prevDiv.textContent = cmp.join(' | ');
      else prevDiv.textContent = 'First session this tab';
    } else if (prevDiv) prevDiv.textContent = 'No prior';
  } catch { /* ignore */ }

  function render() {
    const parts: string[] = [];
    if (summary.fp) parts.push(`FP ${summary.fp}`);
    if (summary.fcp) parts.push(`FCP ${summary.fcp}`);
    if (summary.lcp) parts.push(`LCP ${summary.lcp}`);
    if (summary.cls !== undefined) parts.push(`CLS ${summary.cls.toFixed(3)}`);
    if (summary.inp !== undefined) parts.push(`INP ${summary.inp}`);
    if (summary.dcl) parts.push(`DCL ${summary.dcl}`);
    if (summary.load) parts.push(`Load ${summary.load}`);
    if (summary.hydration) parts.push(`Hyd ${summary.hydration}`);
    body.textContent = parts.join(' | ');
  }
  // Throttle refresh every 250ms instead of every frame
  window.setInterval(render, 250);

  if (toggleable) {
    const btn = el.querySelector('#perf-hide-btn') as HTMLButtonElement | null;
    if (btn) {
      let hidden = false;
      btn.addEventListener('click', () => {
        hidden = !hidden;
        if (hidden) {
          body.style.display = 'none';
          if (prevDiv) prevDiv.style.display = 'none';
          btn.textContent = 'Show';
        } else {
          body.style.display = '';
          if (prevDiv) prevDiv.style.display = '';
          btn.textContent = 'Hide';
        }
      });
    }
  }

  render();
}
// Initialize overlay after DOM ready (so body exists)
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initOverlay, { once: true }); } else { initOverlay(); }

// Flush consolidated event after load & small idle (to include LCP + hydration if marked quickly)
interface FlushFn { (): void; sent?: boolean }
const maybeFlush: FlushFn = () => {
  if (!summary.load || !summary.lcp) return; // wait until basics known
  if (maybeFlush.sent) return;
  maybeFlush.sent = true;
  trackEvent({ category: 'perf', action: 'perf_metric', label: 'startup_summary', metadata: { kind: 'startup_summary', ...summary } });
  // Defer AI import to avoid forcing the chunk if not yet loaded. Cast summary to Record<string, unknown>.
  import('../appInsights').then(m => m.trackAiEvent('perf_startup_summary', { ...summary } as Record<string, unknown>)).catch(()=>{});
};

// Attempt flush after load & again after short timeout if hydration late
window.addEventListener('load', () => {
  setTimeout(maybeFlush, 500);
  setTimeout(maybeFlush, 2500);
});

// Also attempt flush when hydration mark happens
const originalHydration = window.__markHydration;
window.__markHydration = () => { originalHydration(); setTimeout(maybeFlush, 200); };

// Capture CLS via PerformanceObserver (buffered) & persist into summary
try {
  let clsValue = 0;
  const clsObserver = new PerformanceObserver(list => {
    for (const entry of list.getEntries() as PerformanceEntryList) {
      const e = entry as unknown as { value?: number; hadRecentInput?: boolean };
      if (typeof e.value === 'number' && !e.hadRecentInput) {
        clsValue += e.value;
      }
    }
    summary.cls = parseFloat(clsValue.toFixed(3));
  });
  clsObserver.observe({ type: 'layout-shift', buffered: true } as PerformanceObserverInit);
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') clsObserver.disconnect(); });
} catch { /* ignore */ }

// If perfdebug enabled, dynamically load web-vitals INP observer after first interaction
try {
  const params = new URLSearchParams(location.search);
  if (params.get('perfdebug') === '1') {
    let inpLoaded = false;
    const loadINP = async () => {
      if (inpLoaded) return; inpLoaded = true;
      try {
        const { onINP } = await import('web-vitals');
        onINP((metric) => { summary.inp = Math.round(metric.value); });
      } catch { /* ignore */ }
    };
    ['pointerdown','keydown','click'].forEach(evt => window.addEventListener(evt, loadINP, { once: true }));
    // Also load after idle just in case user does nothing
    setTimeout(loadINP, 4000);
  }
} catch { /* ignore */ }

// Persist current summary snapshot when flushed so next reload can compare
// Persist snapshot polling until flush sent
window.addEventListener('load', () => {
  const storeInterval = setInterval(() => {
  if (maybeFlush.sent) {
      try { sessionStorage.setItem('perf:startup:last', JSON.stringify(summary)); } catch { /* ignore */ }
      clearInterval(storeInterval);
    }
  }, 500);
  setTimeout(() => clearInterval(storeInterval), 10000);
});

export {}; // module sentinel
