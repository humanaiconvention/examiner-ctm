import { test, expect } from '@playwright/test';

// This test relies on the dev-only harness functions injected in main.tsx (non-PROD builds only)

test.describe('Preview Questions config drift harness', () => {
  test('meta hash changes after harness mutation', async ({ page }) => {
    await page.goto('/');
    // Ensure meta present (dev exposes by default due to !PROD logic)
    const initialHash = await page.locator('meta[name="x-preview-questions-config-hash"]').getAttribute('content');
    expect(initialHash).toBeTruthy();
    // Mutate config via harness (increase maxPerHour arbitrarily)
    const newHash = await page.evaluate(() => {
      // @ts-expect-error harness global
      return window.__testMutatePreviewQuestionsConfig?.({ maxPerHour: 999 }) || null;
    });
    expect(newHash).toBeTruthy();
    expect(newHash).not.toBe(initialHash);
    const updatedHash = await page.locator('meta[name="x-preview-questions-config-hash"]').getAttribute('content');
    expect(updatedHash).toBe(newHash);
  });
});
