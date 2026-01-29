import type { AxeResults, RunOptions } from 'axe-core'

declare module 'jest-axe' {
  export function axe(node: HTMLElement, options?: RunOptions): Promise<AxeResults>
  export function toHaveNoViolations(results: AxeResults): void
  export const configureAxe: (config?: Record<string, unknown>) => typeof axe
}

declare module 'vitest' {
  interface Assertion<T = unknown> {
    toHaveNoViolations(): T
  }
  interface ExpectStatic {
    toHaveNoViolations(): unknown
  }
}

export {}