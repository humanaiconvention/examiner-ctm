import { describe, it, expect } from 'vitest';
import { safeEvaluate, evaluateProfile, validateProfileInput } from './ethics';
import type { ModuleEthicsProfileInput } from './ethics';

function baseProfile(overrides: Partial<ModuleEthicsProfileInput> = {}): ModuleEthicsProfileInput {
  return {
    id: 'example-module',
    version: '1.0.0',
    declaredPurposes: ['educational'],
    dataCategories: ['content'],
    retentionDays: 'session',
    consentRequired: true,
    sensitive: false,
    exportFormats: ['json'],
    ...overrides,
  };
}

describe('validateProfileInput', () => {
  it('flags invalid id', () => {
    const issues = validateProfileInput(baseProfile({ id: 'Bad Id' }));
    expect(issues.some(i => i.includes('id'))).toBe(true);
  });
});

describe('evaluateProfile', () => {
  it('computes auto for low-risk profile', () => {
    const res = evaluateProfile(baseProfile());
    expect(res.reviewLevel).toBe('auto');
    expect(res.totalScore).toBe(0);
  });

  it('elevates to light with network + behavioral factors', () => {
    const res = evaluateProfile(baseProfile({
      networkKBPerInteraction: 800,
      dataCategories: ['behavioral'],
    }));
    expect(res.reviewLevel).toBe('light');
    expect(res.totalScore).toBeGreaterThanOrEqual(2); // network + behavioral
  });

  it('elevates to full with multiple high-risk factors', () => {
    const res = evaluateProfile(baseProfile({
      sensitive: true,
      retentionDays: 120,
      networkKBPerInteraction: 900,
      approximateEnergyJoules: 200,
      dataCategories: ['behavioral'],
    }));
    expect(res.reviewLevel).toBe('full');
    expect(res.totalScore).toBeGreaterThanOrEqual(5);
  });
});

describe('safeEvaluate', () => {
  it('throws with aggregated issues for invalid profile', () => {
    expect(() => safeEvaluate(baseProfile({ id: '???' }))).toThrow(/Invalid ModuleEthicsProfileInput/);
  });
});
