import { test, expect } from '@playwright/test';

// Lightweight visual / state test to ensure success animation class toggles.
// Assumes dev server or preview is running; if not, you can adapt to start programmatically.

test.describe('Preview Questions success animation', () => {
  test('submitting shows success element with active class then hides', async ({ page }) => {
    // Navigate to root then go to /preview (adjust if route differs)
    await page.goto('/preview');
    const textarea = page.getByLabel('Your question', { exact: false });
    await textarea.fill('What principles guide transparency?');
    await page.getByRole('button', { name: /submit question/i }).click();

    const success = page.getByRole('status');
    await expect(success).toHaveClass(/preview-questions__success--active/);

    // Wait for auto-hide (config SUCCESS_AUTO_HIDE_MS = 2400) + buffer
    await page.waitForTimeout(2600);
    await expect(success).toBeHidden({ timeout: 500 });
  });
});
