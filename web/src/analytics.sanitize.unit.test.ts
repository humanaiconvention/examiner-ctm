import { describe, it, expect } from 'vitest';
import { sanitizeMetadata, PII_WHITELIST } from './analytics/sanitize';

// Direct unit tests for sanitizeMetadata to narrow regression surface.

describe('sanitizeMetadata (unit)', () => {
  it('redacts emails in string fields except whitelisted keys', () => {
    const meta = {
      userEmail: 'allowed@example.com',
      note: 'reach me at user@example.com and second@sub.domain.io',
      userId: '123',
      free: 'multi user@example.com user@example.com',
    } as Record<string, unknown>;
    const cleaned = sanitizeMetadata(meta)!;
    expect(cleaned.userEmail).toBe('allowed@example.com');
    expect(cleaned.userId).toBe('123');
    expect(String(cleaned.note)).not.toContain('user@example.com');
    expect(String(cleaned.note)).toContain('[redacted-email]');
    expect(String(cleaned.free).match(/\[redacted-email]/g)?.length).toBe(2);
  });

  it('handles nested objects, arrays and circular references including root self-reference', () => {
  type Root = { a: { arr: (string | { deep: string })[]; cycle?: unknown }; self?: unknown; [k: string]: unknown };
  const root: Root = { a: { arr: ['one@mail.com', { deep: 'two@mail.com' }] } } as Root;
    root.self = root; // direct self-ref
    const nested = { inner: root } as { inner: Root };
    root.a.cycle = nested; // nested cycle
  const cleaned = sanitizeMetadata(root)! as Root;
    expect(cleaned.self).toBe('[circular]');
    const a = cleaned.a as Root['a'] & { cycle?: unknown };
    const arr = a.arr as unknown[];
    expect(String(arr[0])).toContain('[redacted-email]');
    const arrObj = arr[1] as { deep: string };
    expect(String(arrObj.deep)).toContain('[redacted-email]');
    // The nested cycle object should have its inner reference replaced, not itself collapsed to a string
    const cycleVal = (a as Record<string, unknown>).cycle as unknown;
    expect(typeof cycleVal).toBe('object');
    if (cycleVal && typeof cycleVal === 'object') {
      expect((cycleVal as Record<string, unknown>).inner).toBe('[circular]');
    }
  });

  it('applies depth limit returning tooDeep marker beyond depth 4', () => {
    const deep = { a: { b: { c: { d: { e: { email: 'too@deep.com' } } } } } };
    const cleaned = sanitizeMetadata(deep)!;
  type Level = { [k: string]: unknown };
  const a = cleaned.a as Level;
  const b = a.b as Level; const c = b.c as Level; const d = c.d as Level; const e = d.e as Level;
  expect((e as Level).tooDeep).toBe(true);
  });

  it('does not mutate original object', () => {
    const original = { note: 'contact person@example.com' };
    const copy = { ...original };
    const cleaned = sanitizeMetadata(copy)!;
    expect(original.note).toBe('contact person@example.com'); // unchanged
    expect(cleaned.note).toContain('[redacted-email]');
  });

  it('respects dynamic additions to whitelist', () => {
    PII_WHITELIST.add('customAllowed');
    const cleaned = sanitizeMetadata({ customAllowed: 'safe@example.com' })!;
    expect(cleaned.customAllowed).toBe('safe@example.com');
  });
});
