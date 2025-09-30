import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';
import { trackAiMetric } from './appInsights';
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
  trackAiMetric(metric.name, metric.value, meta);
}

export function startVitals() {
  onCLS(forward);
  onFCP(forward);
  onINP(forward);
  onLCP(forward);
  onTTFB(forward);
}
