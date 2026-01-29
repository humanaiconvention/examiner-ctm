import { describe, it, expect } from 'vitest';

import { runContextAnchoringFlow } from '../../consciousness-explorer/modules/flows/contextAnchoringFlow.js';
import { runCausalReasoningFlow } from '../../consciousness-explorer/modules/flows/causalReasoningFlow.js';
import { runEthicalDeliberationFlow } from '../../consciousness-explorer/modules/flows/ethicalDeliberationFlow.js';
import { runLongHorizonPlanningFlow } from '../../consciousness-explorer/modules/flows/longHorizonPlanningFlow.js';
import { runInterpretabilityProvenanceFlow } from '../../consciousness-explorer/modules/flows/interpretabilityProvenanceFlow.js';
import { runPlayfulCreativityFlow } from '../../consciousness-explorer/modules/flows/playfulCreativityFlow.js';

const runners = [
  runContextAnchoringFlow,
  runCausalReasoningFlow,
  runEthicalDeliberationFlow,
  runLongHorizonPlanningFlow,
  runInterpretabilityProvenanceFlow,
  runPlayfulCreativityFlow,
];

describe('flows smoke', () => {
  it('each flow returns expected envelope shape', async () => {
    for (const run of runners) {
      const fnName = run.name || '<anonymous runner>';
      const res = await run({ intent: 'test intent', perspective: 'human' });
      expect(res, `${fnName} returned non-object`).toBeTypeOf('object');
      expect('question' in res, `${fnName} missing question key`).toBe(true);
  const rcast = res as unknown as Record<string, unknown>;
  if (rcast['question']) expect(typeof rcast['question'] === 'string').toBe(true);
      const r = res as unknown as Record<string, unknown>;
      const hasOne = !!(r['mapResult'] || r['researchFragment'] || r['epistemicTrace']);
      if (!hasOne) console.warn(`${fnName} result:`, JSON.stringify(res, null, 2));
      expect(hasOne, `${fnName} missing mapResult|researchFragment|epistemicTrace`).toBe(true);
    }
  });
});
