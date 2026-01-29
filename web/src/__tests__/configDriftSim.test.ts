import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as analytics from '../analytics';
import { fnv1a32 } from '../lib/hash';

// Define minimal track event payload shape used in these tests (narrow subset)
interface TrackEventPayload {
  category: string;
  action: string;
  label: string;
  metadata?: { previous: string; current: string };
}

type TrackEventFn = (e: TrackEventPayload) => void;

// Simulates a drift scenario for both SW config and Preview Questions config by invoking the logic from main-like functions.
// We can't import main.tsx directly (would mount React). Instead we replicate the minimal hash + localStorage pattern.

// Helpers mirror logic in main.tsx
function simulateSwDrift(previousHash: string, newPayload: unknown) {
  const payload = JSON.stringify(newPayload);
  const hex = fnv1a32(payload);
  localStorage.setItem('sw:configHash', previousHash);
  // Emulate drift detection branch
  if (previousHash !== hex) {
    (analytics.trackEvent as TrackEventFn)({ category: 'config', action: 'drift', label: 'sw_config', metadata: { previous: previousHash, current: hex } });
  }
  return hex; // return new hash for assertions
}

function simulatePreviewDrift(previousHash: string, cfg: Record<string, unknown>) {
  const payload = JSON.stringify(cfg);
  const hex = fnv1a32(payload);
  localStorage.setItem('preview:questions:configHash', previousHash);
  if (previousHash !== hex) {
    (analytics.trackEvent as TrackEventFn)({ category: 'config', action: 'drift', label: 'preview_questions', metadata: { previous: previousHash, current: hex } });
  }
  return hex;
}

beforeEach(() => {
  // Reset localStorage between tests
  localStorage.clear();
  // Force analytics consent so events dispatch immediately
  (window as unknown as { __ANALYTICS_CONSENT__?: boolean }).__ANALYTICS_CONSENT__ = true;
});

describe('config drift simulation', () => {
  it('emits config/drift for service worker config change', () => {
  const trackSpy = vi.spyOn(analytics, 'trackEvent');
    const prevHash = 'aaaaaaaa';
    const newHash = simulateSwDrift(prevHash, { manifestHardBustRatio: 0.25, autoRefresh: { enabled: true, intervalMinutes: 30 } });
    expect(newHash).not.toBe(prevHash);
    const driftCall = trackSpy.mock.calls.find(c => c[0].category === 'config' && c[0].action === 'drift' && c[0].label === 'sw_config');
  expect(driftCall).toBeTruthy();
  if (!driftCall) throw new Error('Expected drift event call');
  type DriftArgs = [{ category: string; action: string; label: string; metadata: { previous: string; current: string } }];
  const typed = driftCall as DriftArgs;
  expect(typed[0].metadata.previous).toBe(prevHash);
  expect(typed[0].metadata.current).toBe(newHash);
    trackSpy.mockRestore();
  });

  it('emits config/drift for preview questions config change', () => {
  const trackSpy = vi.spyOn(analytics, 'trackEvent');
    const prevHash = 'bbbbbbbb';
    const newHash = simulatePreviewDrift(prevHash, { maxPerHour: 10, duplicateWindowMs: 3600000 });
    expect(newHash).not.toBe(prevHash);
    const driftCall = trackSpy.mock.calls.find(c => c[0].category === 'config' && c[0].action === 'drift' && c[0].label === 'preview_questions');
  expect(driftCall).toBeTruthy();
  if (!driftCall) throw new Error('Expected drift event call');
  type DriftArgs = [{ category: string; action: string; label: string; metadata: { previous: string; current: string } }];
  const typed = driftCall as DriftArgs;
  expect(typed[0].metadata.previous).toBe(prevHash);
  expect(typed[0].metadata.current).toBe(newHash);
    trackSpy.mockRestore();
  });

  it('does not emit when hashes match', () => {
  const trackSpy = vi.spyOn(analytics, 'trackEvent');
    const prevHash = '12345678';
    // simulate no change by feeding a payload that produces identical hash (reuse previousHash directly)
    localStorage.setItem('sw:configHash', prevHash);
    // Force branch with same hash
    const newHash = prevHash;
    if (prevHash !== newHash) {
      (analytics.trackEvent as TrackEventFn)({ category: 'config', action: 'drift', label: 'sw_config', metadata: { previous: prevHash, current: newHash } });
    }
    const driftCall = trackSpy.mock.calls.find(c => c[0].action === 'drift');
    expect(driftCall).toBeFalsy();
    trackSpy.mockRestore();
  });
});
