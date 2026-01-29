import { describe, it, expect } from 'vitest';
import { signToken, verifyToken } from './auth-token-core.mjs';

describe('auth-token (scripts)', () => {
  const secret = 'test-secret-123';
  it('signs and verifies token', () => {
    const exp = Math.floor(Date.now()/1000) + 60;
    const t = signToken({ sub: 'ben@humanaiconvention.com', exp, purpose: 'owner-login' }, secret);
    const payload = verifyToken(t, secret);
    expect(payload.sub).toBe('ben@humanaiconvention.com');
    expect(payload.purpose).toBe('owner-login');
  });
  it('rejects tampered signature', () => {
    const exp = Math.floor(Date.now()/1000) + 60;
    const t = signToken({ sub: 'a', exp, purpose: 'owner-login' }, secret);
    const bad = t.replace(/.$/, c => (c === 'a' ? 'b' : 'a'));
    expect(() => verifyToken(bad, secret)).toThrow();
  });
});