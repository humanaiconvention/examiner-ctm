import { describe, it, expect } from 'vitest';
import { pickFragment } from '../../consciousness-explorer/modules/research/pipeline/core.js';
import { simulateFragment } from '../../consciousness-explorer/modules/research/simulatorBridge.js';

describe('research simulator bridge', () => {
  it('can score a picked fragment (or return fallback) via JS bridge', async () => {
    const frag = pickFragment({ tags: [] }) || { summary: 'Fallback summary for tests.' };
    const out = await simulateFragment(frag, { prefer_recency: true });
    expect(out).toBeTypeOf('object');
    expect(typeof out.score === 'number').toBe(true);
  });
});
