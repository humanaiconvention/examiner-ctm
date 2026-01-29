import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // Apply limited retries only in CI to mitigate flakiness (visual diffs etc.)
  retries: process.env.CI ? 2 : 0,
  fullyParallel: true,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    { name: 'Chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'Firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'WebKit', use: { ...devices['Desktop Safari'] } }
  ],
  webServer: {
    command: 'npm run dev',
    cwd: process.cwd(),
    reuseExistingServer: !process.env.CI,
    port: 5173,
    env: {
      VITE_ENABLE_PREVIEW_GATE: 'false',
      VITE_ENABLE_DRIFT_HARNESS: 'true',
      VITE_ANALYTICS_ENDPOINT: '/__mock'
    }
  }
});
