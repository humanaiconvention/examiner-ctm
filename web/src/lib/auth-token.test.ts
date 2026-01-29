import { describe, it, expect } from 'vitest';

// Dynamic import to ensure ESM .mjs executes under Vitest without static analysis issues.
async function loadAuth() {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - .mjs module types declared separately
  return import('../../scripts/auth-token-core.mjs');
}

describe('auth-token', () => {
  const secret = 'test-secret-123';
  it('signs and verifies token', async () => {
    const { signToken, verifyToken } = await loadAuth();
    const exp = Math.floor(Date.now()/1000) + 60;
    const t = signToken({ sub: 'ben@humanaiconvention.com', exp, purpose: 'owner-login' }, secret);
    const payload = verifyToken(t, secret);
    expect(payload.sub).toBe('ben@humanaiconvention.com');
    expect(payload.purpose).toBe('owner-login');
  });
  it('rejects tampered signature', async () => {
    const { signToken, verifyToken } = await loadAuth();
    const exp = Math.floor(Date.now()/1000) + 60;
    const t = signToken({ sub: 'a', exp, purpose: 'owner-login' }, secret);
    const bad = t.replace(/.$/, (c: string) => (c === 'a' ? 'b' : 'a'));
    expect(() => verifyToken(bad, secret)).toThrow();
  });
});
