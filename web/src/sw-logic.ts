export interface ManifestDiffResult {
  added: string[];
  removed: string[];
  ratio: number; // (added+removed)/previousSize (previousSize>=1)
  previousSize: number;
  total: number; // latest size
}

/** Compute diff between previous and latest asset lists */
export function diffManifests(previous: string[] | null | undefined, latest: string[]): ManifestDiffResult {
  const prevSet = new Set(previous || []);
  const newSet = new Set(latest);
  const added: string[] = [];
  const removed: string[] = [];
  for (const a of latest) if (!prevSet.has(a)) added.push(a);
  for (const a of prevSet) if (!newSet.has(a)) removed.push(a);
  const previousSize = prevSet.size;
  const base = previousSize || 1;
  const ratio = (added.length + removed.length) / base;
  return { added, removed, ratio, previousSize, total: latest.length };
}

export interface BustDecision {
  strategy: 'hard' | 'incremental' | 'none';
  reason: string;
}

export function decideBust(ratio: number, threshold: number): BustDecision {
  if (ratio === 0) return { strategy: 'none', reason: 'no-change' };
  if (ratio > threshold) return { strategy: 'hard', reason: `ratio>${threshold}` };
  return { strategy: 'incremental', reason: 'below-threshold' };
}

// Auto-refresh decision (UI side) so we can test deterministically.
export interface AutoRefreshConfig {
  enabled: boolean;          // user preference to allow auto-refresh
  maxRatio: number;          // maximum change ratio still considered safe for silent refresh
  maxAdded: number;          // absolute added files threshold
}

export function shouldAutoRefresh(diff: ManifestDiffResult, config: AutoRefreshConfig): boolean {
  if (!config.enabled) return false;
  if (diff.ratio === 0) return false; // nothing changed (shouldn't happen because no toast) but be safe
  if (diff.ratio > config.maxRatio) return false;
  if (diff.added.length > config.maxAdded) return false;
  // Also avoid auto refresh if any html page changed (heuristic) — we only have index.html usually.
  if (diff.added.concat(diff.removed).some(a => a.endsWith('.html'))) return false;
  return true;
}
