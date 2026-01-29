import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('Accessibility – Learn More', () => {
  test('learn more page has no serious/critical accessibility violations', async ({ page }) => {
    await page.goto('/learn-more')
    // Debug: list spans with computed black color before axe run
    const blackSpans = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('span'))
        .filter(el => getComputedStyle(el).color === 'rgb(0, 0, 0)')
        .slice(0, 20)
        .map(el => ({ outer: (el as HTMLElement).outerHTML.slice(0, 300), parent: el.parentElement ? (el.parentElement as HTMLElement).outerHTML.slice(0, 120) : null }))
    })
    if (blackSpans.length) {
      console.log('[debug] Found spans with black color:', blackSpans)
    } else {
      console.log('[debug] No spans with pure black color detected pre-axe')
    }
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()

    const critical = results.violations.filter(v => ['serious','critical'].includes(v.impact || ''))
    if (critical.length) {
      console.log('\nSerious/Critical Accessibility Violations (Learn More):')
      for (const v of critical) {
        console.log(`- ${v.id} (${v.impact}) nodes=${v.nodes.length}`)
        if (v.id === 'color-contrast') {
          for (const [i, n] of v.nodes.entries()) {
            console.log(`  node[${i}] target=${n.target?.join(' ')} summary=${n.failureSummary}`)
            // Attempt to locate and log the offending element's outerHTML for deeper inspection
            if (n.target && n.target.length === 1) {
              const selector = String(n.target[0])
              try {
                const handle = await page.$(selector)
                if (handle) {
                  const html = await handle.evaluate(el => (el as HTMLElement).outerHTML)
                  const styles = await handle.evaluate(el => {
                    const cs = getComputedStyle(el as HTMLElement)
                    return { color: cs.color, background: cs.backgroundColor, parentColor: (el.parentElement ? getComputedStyle(el.parentElement).color : 'n/a') }
                  })
                  console.log(`    outerHTML: ${html}`)
                  console.log(`    computed styles:`, styles)
                }
              } catch (e) {
                console.log('    debug fetch failed', e)
              }
            }
          }
        }
      }
    }
    expect(critical.length, `A11y serious/critical issues: ${critical.map(v => v.id).join(', ')}`).toBe(0)
  })
})
