import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Assumes preview route at /preview and intro gate logic should not block content when navigated directly.

test.describe('Preview page accessibility', () => {
  test('no serious or critical violations and intro gate not obscuring content', async ({ page }) => {
    await page.goto('/preview');

    // Ensure body not stuck in intro state
    const bodyClasses = await page.locator('body').getAttribute('class');
    expect(bodyClasses || '').not.toContain('intro-pending');

    // The preview questions container should be visible
    const previewHeading = page.getByRole('heading', { level: 1 });
    await expect(previewHeading).toBeVisible();

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const disallowed = accessibilityScanResults.violations.filter(v => ['serious','critical'].includes(v.impact || ''));
    if (disallowed.length) {
      console.error('Accessibility violations:', disallowed.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })));
    }
    expect(disallowed.length).toBe(0);
  });
});
