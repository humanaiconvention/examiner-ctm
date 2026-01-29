import { test, expect } from '@playwright/test'

// Simple navigation/content test for Learn More page
// Ensures hero CTA routes correctly and key headings render.

test.describe('Learn More page', () => {
  test('navigates from hero CTA and shows mission & vision', async ({ page }) => {
    await page.goto('/')
    // Bypass intro overlay which intercepts pointer events
  await page.evaluate(() => { try { localStorage.setItem('hq:introComplete','true') } catch { /* ignore */ } })
    await page.reload()
    const learnCta = page.getByRole('link', { name: /learn more/i })
    await expect(learnCta).toBeVisible()

    await learnCta.click()
    await page.waitForSelector('h2:has-text("Our mission")', { timeout: 15000 })

    // Headings
    await expect(page.getByRole('heading', { name: /our mission/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /our vision/i })).toBeVisible()

    // Anchor skip links present
    await expect(page.locator('a.skip-link').first()).toBeVisible()

    // Analytics event (optional lightweight check: we rely on emitted data-event attributes or network intercept in other tests)
  })
})
