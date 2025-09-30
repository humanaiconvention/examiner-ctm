// Centralized Service Worker + Client Update Configuration
// Consolidates thresholds and tunables to reduce scattered magic numbers.

export interface SWConfig {
  manifestHardBustRatio: number; // ratio above which we treat update as hard bust
  autoRefresh: {
    enabledByDefault: boolean;
    maxRatio: number;
    maxAdded: number;
    snackbarDurationMs: number;
  };
}

// Helper to safely parse numbers from env (Vite injects import.meta.env.* at build time)
function numEnv(key: string, fallback: number): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (import.meta as any).env?.[key];
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
function boolEnv(key: string, fallback: boolean): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (import.meta as any).env?.[key];
  if (raw == null) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

const manifestHardBustRatio = numEnv('VITE_SW_MANIFEST_HARD_BUST_RATIO', 0.4);
const autoRefreshEnabled = boolEnv('VITE_SW_AUTO_REFRESH_DEFAULT', true);
const autoRefreshMaxRatio = numEnv('VITE_SW_AUTO_REFRESH_MAX_RATIO', 0.25);
const autoRefreshMaxAdded = numEnv('VITE_SW_AUTO_REFRESH_MAX_ADDED', 4);
const autoRefreshSnackMs = numEnv('VITE_SW_AUTO_REFRESH_SNACK_MS', 4000);

export const SW_CONFIG: SWConfig = {
  manifestHardBustRatio,
  autoRefresh: {
    enabledByDefault: autoRefreshEnabled,
    maxRatio: autoRefreshMaxRatio,
    maxAdded: autoRefreshMaxAdded,
    snackbarDurationMs: autoRefreshSnackMs,
  },
};

export default SW_CONFIG;
