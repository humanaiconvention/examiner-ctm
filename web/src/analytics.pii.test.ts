import { describe, it, expect, beforeEach } from 'vitest';
import { configureAnalyticsTransport, setAnalyticsConsent, trackEvent } from './analytics';

// We'll inspect dataLayer pushes to confirm emails are sanitized

// Extend global Window only if not already declared differently; align with analytics.ts where dataLayer?: unknown[]
declare global {
  interface Window { dataLayer?: unknown[] }
}

describe('analytics PII sanitization', () => {
  beforeEach(() => {
    // reset dataLayer
  window.dataLayer = [];
    setAnalyticsConsent(true);
    configureAnalyticsTransport({ enabled: false }); // disable backend
  });

  it('redacts emails in arbitrary metadata values while preserving whitelisted keys', () => {
    trackEvent({
      category: 'interaction',
      action: 'click',
      label: 'pii-test',
      metadata: {
        freeText: 'contact me at user@example.com or admin@sub.domain.io',
        nested: { note: 'another email test.person+promo@company.co.uk' },
        userEmail: 'explicit@allowed.com',
        userId: '1234',
      }
    });
  const dl = window.dataLayer as unknown[] | undefined;
  expect(dl && dl.length).toBe(1);
  const payload = dl?.[0] as Record<string, unknown>;
    // Redacted strings
  expect(String(payload.freeText)).not.toContain('user@example.com');
  expect(String(payload.freeText)).toContain('[redacted-email]');
  const nested = payload.nested as Record<string, unknown> | undefined;
  expect(String(nested?.note)).not.toContain('test.person+promo@company.co.uk');
    // Whitelisted keys preserved
    expect(payload.userEmail).toBe('explicit@allowed.com');
    expect(payload.userId).toBe('1234');
  });
});
