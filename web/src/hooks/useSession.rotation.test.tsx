import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSession } from './useSession';

// We simulate epoch rotation + binding mismatch scenarios by controlling fetch() responses.
// The hook only ever calls /session, so we model state transitions with sequential mock resolves.

type GlobalWithFetch = typeof globalThis & { fetch: unknown };
const g = globalThis as GlobalWithFetch;

describe('useSession – rotation & binding', () => {
  it('becomes unauthenticated after epoch rotation (subsequent fetch)', async () => {
    const responses = [
      { authenticated: true, email: 'owner@example.com', exp: Date.now()/1000 + 3600 },
      // After rotation the server would reject; simulate unauthenticated
      { authenticated: false }
    ];
    g.fetch = vi.fn().mockImplementation(() => {
      const value = responses.shift() ?? { authenticated: false };
      return Promise.resolve({ ok: true, json: () => Promise.resolve(value) });
    });
    const { result } = renderHook(() => useSession());
    await act(async () => {}); // resolve first fetch
    expect(result.current.authenticated).toBe(true);
    // Simulate manual refresh (epoch rotation script would have run between calls)
    await act(async () => { result.current.refresh(); });
    await act(async () => {});
    expect(result.current.authenticated).toBe(false);
  });

  it('drops session when UA/IP binding mismatch occurs (simulated)', async () => {
    const responses = [
      { authenticated: true, email: 'owner@example.com', exp: Date.now()/1000 + 3600 },
      // mismatch -> server returns false
      { authenticated: false }
    ];
    g.fetch = vi.fn().mockImplementation(() => {
      const value = responses.shift() ?? { authenticated: false };
      return Promise.resolve({ ok: true, json: () => Promise.resolve(value) });
    });
    const { result } = renderHook(() => useSession());
    await act(async () => {});
    expect(result.current.authenticated).toBe(true);
    await act(async () => { result.current.refresh(); });
    await act(async () => {});
    expect(result.current.authenticated).toBe(false);
  });
});
