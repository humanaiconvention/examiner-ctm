import { test, expect, Page } from '@playwright/test';

// This test intercepts backend analytics transport POSTs, triggers config drift via harness, and validates payload.
// We rely on enabling harness + analytics transport via env (VITE_ENABLE_DRIFT_HARNESS=true, VITE_ANALYTICS_ENDPOINT=/__mock)

const ANALYTICS_ENDPOINT = '/__mock';

interface DriftEventPayload {
  eventCategory: string;
  eventAction: string;
  eventLabel?: string;
  previous?: string;
  current?: string;
  [k: string]: unknown; // allow extra analytics fields without using any
}

interface CapturedBatch { events: DriftEventPayload[] }

async function enableConsent(page: Page) {
  await page.addInitScript(() => {
    // Mark consent granted before any events so that drift fires immediately.
    (window as unknown as { __ANALYTICS_CONSENT__?: boolean }).__ANALYTICS_CONSENT__ = true;
  });
}

test.describe('analytics drift backend capture', () => {
  test('captures preview & sw drift events via transport', async ({ page }) => {
    await enableConsent(page);

    const captured: CapturedBatch[] = [];
    // Match any origin + path ending with our mock endpoint
    await page.route('**/__mock', async (route) => {
      if (route.request().method() === 'POST') {
        try {
          const json = await route.request().postDataJSON();
          if (json && Array.isArray(json.events)) {
            captured.push(json as CapturedBatch);
          }
        } catch { /* ignore */ }
      }
      await route.fulfill({ status: 200, body: 'ok', contentType: 'text/plain' });
    });

    // Visit with explicit base URL param so code sets transport config (done in test:e2e script) or rely on existing build config
    await page.goto('/');

    // Dynamically configure analytics transport to our intercepted endpoint if API is exposed.
    await page.evaluate((endpoint) => {
      interface TransportConfig { endpoint: string; enabled?: boolean }
      const g = window as unknown as { configureAnalyticsTransport?: (o: TransportConfig) => void };
      if (typeof g.configureAnalyticsTransport === 'function') {
        g.configureAnalyticsTransport({ endpoint, enabled: true });
      }
    }, ANALYTICS_ENDPOINT);

    // Harness might not exist if flag missing – fail fast with clear message
    const hasHarness = await page.evaluate(() =>
      typeof (window as unknown as { __testMutatePreviewQuestionsConfig?: unknown }).__testMutatePreviewQuestionsConfig === 'function'
    );
    expect(hasHarness).toBeTruthy();

    // Trigger baseline stored hashes by mutating once (ensures previous value exists for drift emission on second change)
    await page.evaluate(() => {
      // @ts-expect-error harness global
      window.__testMutatePreviewQuestionsConfig?.({ maxPerHour: 111 });
      // @ts-expect-error harness global
      window.__testMutateSwConfig?.({ manifestHardBustRatio: 0.31 });
    });

    // Second mutation should produce drift events (previous != current)
    await page.evaluate(() => {
      // @ts-expect-error harness global
      window.__testMutatePreviewQuestionsConfig?.({ maxPerHour: 222 });
      // @ts-expect-error harness global
      window.__testMutateSwConfig?.({ manifestHardBustRatio: 0.42 });
    });

    // Allow transport flush timer (3s) + small buffer
    await page.waitForTimeout(4000);

    // Flatten events across batches
    const events = captured.flatMap(b => b.events);
    // We expect at least two drift events (one per label). Some extra events (page_view) may appear.
    const drift = events.filter(e => e.eventCategory === 'config' && e.eventAction === 'drift');
    const labels = drift.map(d => d.eventLabel).sort();
    expect(labels).toContain('preview_questions');
    expect(labels).toContain('sw_config');
    for (const d of drift) {
      expect(d.previous).toBeTruthy();
      expect(d.current).toBeTruthy();
    }
  });
});
