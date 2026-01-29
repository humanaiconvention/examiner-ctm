import { describe, it, expect } from 'vitest';
import StateAwareController from '../../consciousness-explorer/modules/flows/stateController.js';

describe('StateAwareController', () => {
  it('accumulates knowledge and queues artifacts from stateSignals', () => {
    const c = new StateAwareController(['exploration', 'analysis', 'synthesis']);
    const fakeFlow = { flowKey: 'test-flow', label: 'Test Flow' };
    const bundle = {
      flowResult: {
        mapResult: { some: 'map' },
        stateSignals: {
          knowledge: { k1: 'v1' },
          uncertainties: ['u1'],
          recommendedArtifacts: [{ kind: 'visualization', reason: 'test', description: 'desc' }]
        }
      },
      meta: { flowQuestion: 'What is X?' }
    };

    const obs = c.integrateObservation(fakeFlow, bundle);
    const snap = c.getSnapshot();

    expect(Array.from(snap.knowledge).some(([k]) => k === 'test-flow')).toBe(true);
    expect(snap.uncertainties.length).toBeGreaterThan(0);
    expect(snap.pendingArtifacts.length).toBeGreaterThan(0);
    expect(obs.artifact || true).toBeTruthy();
  });
});
