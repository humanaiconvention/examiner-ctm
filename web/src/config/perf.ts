// Centralized performance / telemetry thresholds & tuning knobs.
// Adjust values here rather than scattered literals.

export const PERF_THRESHOLDS = {
  quoteTransitionLongFrameMs: 120,
};

export type PerfThresholds = typeof PERF_THRESHOLDS;
