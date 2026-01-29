// Minimal ambient module for jest-axe to satisfy TypeScript when package exports prevent resolution.
declare module 'jest-axe' {
  import type { RunOptions, AxeResults } from 'axe-core'
  export function axe(node: HTMLElement, options?: RunOptions): Promise<AxeResults>
  export const configureAxe: (config?: Record<string, unknown>) => typeof axe
  // Matcher is added via runtime setup; no direct export required here.
}
