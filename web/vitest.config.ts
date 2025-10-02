import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Use jsdom so React Testing Library has a DOM environment
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
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
      exclude: [
        'src/**/*.d.ts',
        'src/generated/**',
        // Exclude service worker from baseline coverage: complex runtime + integration heavy.
        // We'll consider adding a focused harness later rather than unit patching fetch/cache APIs.
        'src/sw.ts'
      ],
      thresholds: {
        // Realistic starting baseline; intent is to ratchet +5% per category once stable.
        lines: 60,
        statements: 60,
        functions: 55,
        branches: 65,
      },
    },
  },
})
