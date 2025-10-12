import { test, expect } from '@playwright/test';

const base = 'https://humanaiconvention.github.io/humanaiconvention';

test('preview smoke - loads and has no console errors', async ({ page }) => {
  const url = `${base}/`;
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
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
      const res = await page.goto(base + route, { waitUntil: 'networkidle' });
      expect(res && res.status() < 400).toBeTruthy();
      await expect(page.locator('#root')).toBeVisible();
      const errors: string[] = [];
      page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
      await page.waitForTimeout(50);
      expect(errors.filter(e => !/favicon|manifest/i.test(e))).toEqual([]);
    });
  }
});
