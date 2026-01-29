import { test, expect } from '@playwright/test';

test.describe('App basic rendering', () => {
  test('loads the home page and shows site title', async ({ page }) => {
    await page.goto('/');
    // Current document title verified from prior runs.
    await expect(page).toHaveTitle(/HumanAI Convention/i);
    // Check root content exists
    const root = page.locator('#root');
    await expect(root).toBeVisible();
  });
});
