import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseMetrics, formatBytes, fetchIntegrityData } from './utils/integrity';

// Helper to build a mock Response (avoid bringing in cross-fetch)
function jsonResponse<T extends Record<string, unknown>>(body: T, init: ResponseInit = { status: 200 }) {
  return new Response(JSON.stringify(body), init);
}

function textResponse(body: string, init: ResponseInit = { status: 200 }) {
  return new Response(body, init);
}

describe('parseMetrics', () => {
  it('extracts total bytes and asset count', () => {
    const metrics = [
      '# HELP web_total_asset_bytes Total raw bytes of all build assets',
      'web_total_asset_bytes 4096',
      'web_asset_size_bytes{file="main.js"} 1024',
      'web_asset_size_bytes{file="vendor.js"} 2048',
      'web_asset_size_bytes{file="style.css"} 1024',
    ].join('\n');
    const res = parseMetrics(metrics);
    expect(res.assetBytes).toBe(4096);
    expect(res.assetCount).toBe(3); // three per-asset lines
  });

  it('returns empty object for empty input', () => {
    const res = parseMetrics('');
    expect(res).toEqual({});
  });
});

describe('formatBytes', () => {
  it('formats bytes into human readable units', () => {
    expect(formatBytes(0)).toBe('—');
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1536)).toBe('1.5 KB'); // 1.5 KB threshold rounding
  // formatBytes chooses 2 decimals for <10MB when mb < 10 so adjust expectation
  expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
    expect(formatBytes(10 * 1024 * 1024 + 1234)).toMatch(/^10\.\d MB$/); // approx 10.x MB
  });
});

describe('fetchIntegrityData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function installMockCrypto(expectedHex: string) {
    // Provide a deterministic subtle.digest that returns bytes representing the hex string
    const bytes: number[] = [];
    for (let i = 0; i < expectedHex.length; i += 2) {
      bytes.push(parseInt(expectedHex.slice(i, i + 2), 16));
    }
    // Provide minimal subset of SubtleCrypto we actually use; cast to satisfy TS.
    // jsdom defines window.crypto as read-only; redefine via defineProperty
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        subtle: {
          digest: vi.fn(async () => new Uint8Array(bytes).buffer),
        },
      },
      configurable: true,
    });
  }

  it('collects version, commit, metrics and hashMatch=true when hashes align', async () => {
    const expectedHex = 'deadbeef';
    installMockCrypto(expectedHex);

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/version.json')) {
        return jsonResponse({ version: '1.2.3', commit: 'abc123', builtAt: '2025-01-01T00:00:00Z' });
      }
      if (url.endsWith('/metrics.txt')) {
        return textResponse('web_total_asset_bytes 2048\nweb_asset_size_bytes{file="a.js"} 1024');
      }
      if (url.endsWith('/version-integrity.json')) {
        return jsonResponse({ sha256: expectedHex });
      }
      // index HTML root fetch
      if (url === '/' || url.endsWith('//')) {
        return textResponse('<!doctype html><html><head></head><body>INDEX</body></html>');
      }
      return textResponse('', { status: 404 });
    }) as unknown as typeof fetch;

    const res = await fetchIntegrityData(1);
    expect(res.version).toBe('1.2.3');
    expect(res.commit).toBe('abc123');
    expect(res.assetBytes).toBe(2048);
    expect(res.assetCount).toBe(1);
    expect(res.hashMatch).toBe(true);
  });

  it('gracefully degrades when all requests fail', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network'); }) as unknown as typeof fetch;
    const res = await fetchIntegrityData(1);
    expect(res).toEqual({});
  });
});
