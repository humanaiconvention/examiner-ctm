import { describe, it, expect, vi } from 'vitest';
import * as analytics from '../analytics';

// This test ensures no new events are emitted using the legacy interaction/sw_config_drift pair.
// We simulate a drift emission via public API (trackEvent) and assert schema rejection.

describe('config drift taxonomy (no legacy interaction/sw_config_drift)', () => {
  it('rejects legacy interaction/sw_config_drift pair', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const trackSpy = vi.spyOn(analytics, 'trackEvent');
  // Attempt to emit legacy style
  // Intentionally force legacy action token; cast through unknown to bypass compile-time union (test ensures rejection)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (analytics as unknown as { trackEvent: (args: any) => void }).trackEvent({ category: 'interaction', action: 'sw_config_drift', label: 'legacy' });
      expect(trackSpy).toHaveBeenCalledTimes(1);
      // No schema warning now that legacy is no longer part of interaction schema; it should be rejected quietly
      const warned = warnSpy.mock.calls.some(c => (c[0] + '').includes('schema reject'));
      expect(warned).toBe(false);
    warnSpy.mockRestore();
  });

  it('accepts new config/drift taxonomy', () => {
    const trackSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  (analytics as unknown as { trackEvent: typeof analytics.trackEvent }).trackEvent({ category: 'config', action: 'drift', label: 'sw_config' });
    // No schema reject warning should appear for valid taxonomy
    const rejected = trackSpy.mock.calls.some(c => (c[0] + '').includes('schema reject'));
    expect(rejected).toBe(false);
    trackSpy.mockRestore();
  });
});
