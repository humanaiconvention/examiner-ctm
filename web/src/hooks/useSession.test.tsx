import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSession } from './useSession';

// Simple fetch mock with typed augmentation
type GlobalWithFetch = typeof globalThis & { fetch: unknown };
const g = globalThis as GlobalWithFetch;

describe('useSession', () => {
  it('reports unauthenticated when /session returns false', async () => {
    g.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ authenticated: false }) });
    const { result } = renderHook(() => useSession());
    // allow microtasks
    await act(async () => {});
    expect(result.current.loading).toBe(false);
    expect(result.current.authenticated).toBe(false);
  });
  it('reports authenticated when /session returns true', async () => {
    g.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ authenticated: true, email: 'ben@humanaiconvention.com' }) });
    const { result } = renderHook(() => useSession());
    await act(async () => {});
    expect(result.current.authenticated).toBe(true);
    expect(result.current.email).toBe('ben@humanaiconvention.com');
  });
});
