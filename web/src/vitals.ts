import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';
// Defer loading of Application Insights until first vital fires
let _trackAiMetric: ((name: string, value: number, props?: Record<string, unknown>) => void) | null = null;
const vitalsBuffer: { name: string; value: number; props?: Record<string, unknown> }[] = [];
let flushing = false;
async function ensureAiMetricLoaded() {
  if (_trackAiMetric) return;
  const mod = await import('./appInsights');
  _trackAiMetric = mod.trackAiMetric;
}
async function flushVitalsBuffer() {
  if (flushing) return; flushing = true;
  try {
    await ensureAiMetricLoaded();
    while (vitalsBuffer.length) {
      const m = vitalsBuffer.shift();
      if (m) _trackAiMetric?.(m.name, m.value, m.props);
    }
  } catch { /* ignore */ } finally { flushing = false; }
}
function queueOrSend(name: string, value: number, props?: Record<string, unknown>) {
  if (!_trackAiMetric) {
  if (props === undefined) vitalsBuffer.push({ name, value }); else vitalsBuffer.push({ name, value, props });
    // Opportunistically kick flush (idle or microtask)
    if (typeof queueMicrotask === 'function') queueMicrotask(() => flushVitalsBuffer());
    else setTimeout(() => flushVitalsBuffer(), 0);
  } else {
    try { _trackAiMetric(name, value, props); } catch { /* ignore */ }
  }
}
import { trackEvent } from './analytics';

// Map web-vitals rating to a compact label (optional for analytics dashboarding)
type MetricWithRating = Metric & { rating?: string };
function ratingProps(metric: MetricWithRating) { return { rating: metric.rating }; }

function forward(metric: Metric) {
  // Forward to custom analytics (reuse existing perf taxonomy where possible)
  // We deliberately map only CLS and custom hero paint previously handled; others become metrics in App Insights.
  const meta = { name: metric.name, value: metric.value, delta: metric.delta, id: metric.id, ...ratingProps(metric) };
  // Use generic perf action mapping (extend taxonomy only if strongly needed)
  trackEvent({ category: 'perf', action: 'perf_metric', label: metric.name, value: Math.round(metric.value), metadata: meta });
  queueOrSend(metric.name, metric.value, meta);
}

export function startVitals() {
  onCLS(forward);
  onFCP(forward);
  onINP(forward);
  onLCP(forward);
  onTTFB(forward);
}
