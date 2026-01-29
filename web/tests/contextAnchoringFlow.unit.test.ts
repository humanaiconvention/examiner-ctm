import { describe, it, expect } from 'vitest';
import { runContextAnchoringFlow } from '../../consciousness-explorer/modules/flows/contextAnchoringFlow.js';

describe('contextAnchoringFlow', () => {
  it('returns a stateSignals object with expected keys', async () => {
    const res = await runContextAnchoringFlow({ intent: 'test intent', perspective: 'human', phase: 'exploration' });
    expect(res).toBeTypeOf('object');
    expect(res.stateSignals).toBeTypeOf('object');
    expect(Array.isArray(res.stateSignals.recommendedArtifacts)).toBe(true);
    expect(Array.isArray(res.stateSignals.uncertainties)).toBe(true);
  });
});
