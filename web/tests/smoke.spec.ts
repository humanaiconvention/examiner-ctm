import { test, expect } from '@playwright/test';

// Allow overriding the base URL for preview/test runs via SMOKE_BASE env var.
// Default is the repo Pages URL used for CI/preview artifacts.
const base: string = process.env.SMOKE_BASE ?? 'https://humanaiconvention.github.io/humanaiconvention';

test('preview smoke - loads and has no console errors', async ({ page }) => {
  const url = `${base}/`;
  const errors: string[] = [];
  page.on('console', (msg) => {
    // Filter out known, non-actionable CSP warnings and 404s for root-path assets.
    // Preview builds often block Google fonts or inline scripts via CSP which are
    // expected in preview-only environments; don't fail the smoke run on those.
    const text = msg.text();
    if (msg.type() === 'error') {
      // legacy: ignored frame-ancestors warnings
      if (/Content Security Policy directive 'frame-ancestors' is ignored/.test(text)) return;
      // fonts blocked by CSP (Google Fonts)
      if (/fonts.googleapis.com/.test(text)) return;
      // refused inline scripts with a suggested hash/nonce (common CSP message)
      if (/Refused to execute (an )?inline script|Consider using a hash \('sha256-/.test(text)) return;
      // Vite/HMR/fetch 404s for deep route assets (preview site may 404 on ungenerated files)
      if (/Failed to load resource: the server responded with a status of 404/.test(text)) return;
      // Generic network/CSP style/script errors that are expected in previews
      if (/Content-Security-Policy|Refused to load the stylesheet|Refused to execute a script/.test(text)) return;
      errors.push(text);
    }
  });

  const response = await page.goto(url, { waitUntil: 'networkidle' });
  expect(response && response.status() < 400).toBeTruthy();
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
});

// Basic additional routes to sanity-check a few pages
  const routes = ['/', '/learn-more', '/preview-questions', '/explore'];

test.describe('smoke routes', () => {
  for (const route of routes) {
    test(`route ${route} renders`, async ({ page }) => {
      // Try direct navigation; if it returns a non-2xx (project pages can return 404 for deep links),
      // fall back to client-side navigation from the root.
      let res = await page.goto(base + route, { waitUntil: 'networkidle' });
      if (!res || res.status() >= 400) {
        await page.goto(base + '/');
        // attempt client-side navigation via anchor or router push
        await page.evaluate((r) => {
          history.pushState({}, '', r);
        }, route);
        await page.waitForTimeout(150);
      }
      res = await page.reload({ waitUntil: 'networkidle' });
      expect(res && res.status() < 400).toBeTruthy();
      // Ensure main app container exists (may be hidden briefly while hydrating)
      await expect(page.locator('#root')).toBeVisible({ timeout: 5000 });
      const errors: string[] = [];
      page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
      await page.waitForTimeout(50);
      expect(errors.filter(e => !/favicon|manifest/i.test(e))).toEqual([]);
    });
  }
});
