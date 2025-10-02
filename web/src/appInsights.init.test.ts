import { describe, test, expect, beforeEach, vi } from 'vitest';

// Mock analytics consent helpers
vi.mock('./analytics', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('./analytics');
  return {
    ...actual,
    hasAnalyticsConsent: () => false,
  };
});

import { initAppInsights, getAppInsightsInstance, enableAppInsightsTelemetry } from './appInsights';

declare global {
  // Augment import.meta for test env injection
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ImportMeta { interface Env { VITE_APPINSIGHTS_CONNECTION_STRING?: string; VITE_APPINSIGHTS_KEY?: string; VITE_APPINSIGHTS_SAMPLE?: string } }
}

beforeEach(() => {
  // Reset singleton (appInsights) by clearing module cache
  vi.resetModules();
});

describe('AppInsights initialization', () => {
  test('does not initialize without key or connection string', async () => {
    await import('./appInsights').then(mod => mod.initAppInsights({}));
    const { getAppInsightsInstance } = await import('./appInsights');
    expect(getAppInsightsInstance()).toBeNull();
  });

  test('initializes with connection string env', async () => {
    // Simulate env via import.meta.env
    (import.meta as unknown as { env: Record<string, string> }).env = { VITE_APPINSIGHTS_CONNECTION_STRING: 'InstrumentationKey=00000000-0000-0000-0000-000000000000' };
    const { initAppInsights, getAppInsightsInstance } = await import('./appInsights');
    initAppInsights();
    const instance = getAppInsightsInstance();
    expect(instance).not.toBeNull();
  });

  test('enableAppInsightsTelemetry flips disableTelemetry flag', async () => {
    (import.meta as unknown as { env: Record<string, string> }).env = { VITE_APPINSIGHTS_CONNECTION_STRING: 'InstrumentationKey=11111111-1111-1111-1111-111111111111' };
    const { initAppInsights, getAppInsightsInstance, enableAppInsightsTelemetry } = await import('./appInsights');
    initAppInsights({ samplingPercentage: 10 });
    const instance = getAppInsightsInstance() as unknown as { config?: { disableTelemetry?: boolean } };
    expect(instance?.config?.disableTelemetry).toBe(true); // consent mocked false
    enableAppInsightsTelemetry();
    expect(instance?.config?.disableTelemetry).toBe(false);
  });
});
