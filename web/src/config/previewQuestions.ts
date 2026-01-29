import { fnv1a32 } from '../lib/hash';
// Centralized configuration for Preview Questions submission surface.
// Adjust thresholds here; consider surfacing via meta tag in future if runtime drift detection desired.

export interface PreviewQuestionsConfig {
  MAX_PER_HOUR: number;              // Max submissions allowed inside rolling window
  RATE_LIMIT_WINDOW_MS: number;      // Rolling window duration for rate limiting
  DUPLICATE_WINDOW_MS: number;       // Time window for duplicate question hash detection
  DRAFT_DEBOUNCE_MS: number;         // Debounce for persisting draft text/email/name
  SUCCESS_AUTO_HIDE_MS: number;      // Time after which success message hides & form resets
}

// Environment overrides (build-time). Only apply if valid positive integers.
interface Env { [k: string]: string | undefined }
const env = (import.meta as unknown as { env: Env }).env;

function parsePositiveInt(val: string | undefined, fallback: number): number {
  if (!val) return fallback;
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const base: PreviewQuestionsConfig = {
  MAX_PER_HOUR: parsePositiveInt(env.VITE_PREVIEW_MAX_PER_HOUR, 5),
  RATE_LIMIT_WINDOW_MS: parsePositiveInt(env.VITE_PREVIEW_RATE_LIMIT_WINDOW_MS, 60 * 60 * 1000),
  DUPLICATE_WINDOW_MS: parsePositiveInt(env.VITE_PREVIEW_DUPLICATE_WINDOW_MS, 6 * 60 * 60 * 1000),
  DRAFT_DEBOUNCE_MS: parsePositiveInt(env.VITE_PREVIEW_DRAFT_DEBOUNCE_MS, 250),
  SUCCESS_AUTO_HIDE_MS: parsePositiveInt(env.VITE_PREVIEW_SUCCESS_AUTO_HIDE_MS, 2400)
};

export const PREVIEW_QUESTIONS_CONFIG: PreviewQuestionsConfig = base;

// Deterministic lightweight hash (FNV-1a 32-bit) for drift detection when exposing via meta.
export const hashPreviewConfig = (cfg: PreviewQuestionsConfig): string => fnv1a32(JSON.stringify(cfg));

export type PreviewQuestionHistoryEntry = { t: string; h: string };
