import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Use jsdom so React Testing Library has a DOM environment
    environment: 'jsdom',
    globals: true,
    // Exclude Playwright end-to-end / visual / accessibility specs from unit test run
    // They rely on @playwright/test which is not part of the vitest environment.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'tests/*.spec.ts' // playwright specs (example.spec.ts, accessibility.spec.ts, visual.spec.ts)
    ],
    coverage: {
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts','src/generated/**'],
      thresholds: {
        lines: 88,
        functions: 88,
        branches: 85,
        statements: 88,
      },
    },
  },
})
