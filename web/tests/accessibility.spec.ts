import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility', () => {
  test('home page has no critical accessibility violations', async ({ page }) => {
    await page.goto('/');
    const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']);
    // Allow environment-driven inclusion of additional tags or rules in strict mode
    const strict = process.env.STRICT_A11Y === 'true';
    if (strict) {
      builder.include('body'); // explicit include root for clarity
    }
    const results = await builder.analyze();

    const critical = results.violations.filter(v => ['serious','critical'].includes(v.impact || ''));
    if (critical.length) {
      console.log('\nSerious/Critical Accessibility Violations Summary:\n');
      for (const v of critical) {
        console.log(`- ${v.id} (${v.impact}) nodes=${v.nodes.length}`);
      }
      console.log('\nFull details available in axe results object.');
    }
    type Violation = { id: string };
    if (strict) {
      // In strict mode fail on ANY violation (even minor), else just serious/critical
      const all = results.violations;
      expect(
        all.length,
        `STRICT_A11Y: Violations found: ${all.map((v: Violation) => v.id).join(', ')}`
      ).toBe(0);
    } else {
      expect(
        critical.length,
        `Critical/Serious a11y violations found: ${critical.map((v: Violation) => v.id).join(', ')}`
      ).toBe(0);
    }
  });
});
