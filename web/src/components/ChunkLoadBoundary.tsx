import React, { Suspense } from 'react';
import type { ReactNode } from 'react';

/**
 * ChunkLoadBoundary
 * Centralizes lazy route (or panel) fallback UI.
 * - Provides consistent skeleton styling / a11y semantics.
 * - Announces loading state politely to assistive tech.
 * - Accepts an optional label for context-specific messaging.
 */
export interface ChunkLoadBoundaryProps {
  children: ReactNode;
  /** Optional context label (e.g. "Explore module") */
  label?: string;
  /** Optional custom fallback node; if provided overrides default skeleton */
  fallback?: ReactNode;
  /** If true, sets aria-busy on wrapper until resolved */
  busyWrapper?: boolean;
}

export const ChunkLoadBoundary: React.FC<ChunkLoadBoundaryProps> = ({
  children,
  label = 'Loading module',
  fallback,
  busyWrapper = true,
}) => {
  const defaultFallback = (
    <div
      className="chunk-boundary__fallback"
      role="status"
      aria-live="polite"
      aria-label={label}
      style={{ color: 'rgba(240,245,255,0.95)' }}
    >
      <div className="chunk-boundary__pulse" />
      <span className="chunk-boundary__text" style={{ color: 'rgba(240,245,255,0.95)' }}>{label}…</span>
    </div>
  );
  return (
    <div className="chunk-boundary" {...(busyWrapper ? { 'aria-busy': true } : {})}>
      <Suspense fallback={fallback || defaultFallback}>
        {children}
      </Suspense>
    </div>
  );
};

export default ChunkLoadBoundary;
