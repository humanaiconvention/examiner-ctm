import { test, expect, Page } from '@playwright/test';

interface SnapOptions {
  animations?: 'disabled' | 'allow';
  fullPage?: boolean;
  maxDiffPixelRatio?: number;
}

async function snap(page: Page, name: string, opts: SnapOptions = {}) {
  const maxAttempts = process.env.CI ? 2 : 1; // one retry in CI for transient AA/font jitter
  let attempt = 0;
  let lastError: unknown;
  while (attempt < maxAttempts) {
    try {
      await expect(page).toHaveScreenshot(name, {
        animations: 'disabled',
        fullPage: true,
        maxDiffPixelRatio: 0.005, // tolerate tiny differences
        ...opts,
      });
      return;
    } catch (e) {
      lastError = e;
      attempt++;
      if (attempt < maxAttempts) {
        // Small stabilization wait before retry
        await page.waitForTimeout(250);
      }
    }
  }
  // rethrow last error if all retries failed
  throw lastError;
}

// Utility: ensure lazy sections have mounted before snapshot
async function ensureSections(page: Page) {
  // Scroll to trigger intersection observers
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 3));
  await page.waitForTimeout(400); // allow mount
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(600); // final lazy content
  await page.evaluate(() => window.scrollTo(0, 0));
}

// NOTE: Run once with VISUAL_UPDATE=true to seed baselines: `VISUAL_UPDATE=true npx playwright test tests/visual.spec.ts`.

test.describe('Visual Regression', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('home – full page', async ({ page }: { page: Page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await ensureSections(page);
    await snap(page, 'home-full.png');
  });

  test('hero only', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('header.hero h1');
    // Allow web fonts & layout animations to settle
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);
    const hero = page.locator('header.hero');
    const maxAttempts = process.env.CI ? 3 : 2;
    for (let i=0;i<maxAttempts;i++) {
      try {
        await expect(hero).toHaveScreenshot('hero.png', { animations: 'disabled', maxDiffPixelRatio: 0.008, timeout: 8000 });
        break;
      } catch (e) {
        if (i === maxAttempts -1) throw e;
        await page.waitForTimeout(350);
      }
    }
  });

  test('voices section', async ({ page }) => {
    await page.goto('/');
    await ensureSections(page);
    // Extra stabilization for WebKit scroll/IO flakiness
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(400);
    const voices = page.locator('#voices');
    const maxAttempts = process.env.CI ? 3 : 2;
    for (let i=0;i<maxAttempts;i++) {
      try {
        await expect(voices).toHaveScreenshot('voices.png', { animations: 'disabled', maxDiffPixelRatio: 0.008, timeout: 9000 });
        break;
      } catch (e) {
        if (i === maxAttempts -1) throw e;
        await page.waitForTimeout(400);
      }
    }
  });

  test('learn-more hero', async ({ page }) => {
    await page.goto('/learn-more');
    await page.waitForSelector('header.hero h1');
    await page.waitForTimeout(250); // settle fonts
    const hero = page.locator('header.hero');
    const maxAttempts = process.env.CI ? 3 : 2;
    for (let i=0;i<maxAttempts;i++) {
      try {
        await expect(hero).toHaveScreenshot('learn-more-hero.png', { animations: 'disabled', maxDiffPixelRatio: 0.008, timeout: 9000 });
        break;
      } catch (e) {
        if (i === maxAttempts -1) throw e;
        await page.waitForTimeout(350);
      }
    }
  });
});
