import { test, expect } from '@playwright/test';

// Validates presence and basic structure of SW + Preview Questions config meta tags
// Assumes dev/preview environment where exposure is enabled by default.

test.describe('Config meta exposure', () => {
  test('service worker config meta tags exist with hash', async ({ page }) => {
    await page.goto('/');
    const swMeta = page.locator('meta[name="x-sw-config-json"]');
    await expect(swMeta).toHaveCount(1);
    const content = await swMeta.getAttribute('content');
    expect(content).toBeTruthy();
    const parsed = JSON.parse(content!);
    expect(parsed).toHaveProperty('configHash');
    expect(String(parsed.configHash)).toMatch(/^[0-9a-f]{8}$/);
  });

  test('preview questions config meta tags exist with hash', async ({ page }) => {
    await page.goto('/');
    const pqMeta = page.locator('meta[name="x-preview-questions-config-json"]');
    await expect(pqMeta).toHaveCount(1);
    const content = await pqMeta.getAttribute('content');
    expect(content).toBeTruthy();
    const parsed = JSON.parse(content!);
    expect(parsed).toHaveProperty('configHash');
    expect(String(parsed.configHash)).toMatch(/^[0-9a-f]{8}$/);
  });
});
