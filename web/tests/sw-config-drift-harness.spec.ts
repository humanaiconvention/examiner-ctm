import { test, expect } from '@playwright/test';

test.describe('Service Worker config drift harness', () => {
  test('meta hash updates after SW harness mutation', async ({ page }) => {
    await page.goto('/');
    const swHashSelector = 'meta[name="x-sw-config-hash"]';
    const initial = await page.getAttribute(swHashSelector, 'content');
    expect(initial).toBeTruthy();
    const mutated = await page.evaluate(() => {
      // @ts-expect-error harness global
      return window.__testMutateSwConfig?.({ manifestHardBustRatio: Math.random() * 0.9 + 0.05 });
    });
    expect(mutated).toBeTruthy();
    expect(mutated).not.toBe(initial);
    const updated = await page.getAttribute(swHashSelector, 'content');
    expect(updated).toBe(mutated);
  });
});
