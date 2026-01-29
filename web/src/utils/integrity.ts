export interface IntegrityResult {
  version?: string;
  commit?: string;
  attestedAt?: string;
  hashMatch?: boolean;
  sbomDrift?: number;
  assetBytes?: number;
  assetCount?: number;
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return bytes + ' B';
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(kb < 10 ? 1 : 0) + ' KB';
  const mb = kb / 1024;
  return mb.toFixed(mb < 10 ? 2 : 1) + ' MB';
}

export function parseMetrics(text: string): Pick<IntegrityResult,'assetBytes'|'assetCount'> {
  const result: Pick<IntegrityResult,'assetBytes'|'assetCount'> = {};
  if (!text) return result;
  const lines = text.split(/\n+/);
  let count = 0;
  for (const line of lines) {
    if (line.startsWith('web_total_asset_bytes')) {
      const num = Number(line.split(/\s+/)[1]);
      if (Number.isFinite(num)) result.assetBytes = num;
    } else if (line.startsWith('web_asset_size_bytes{')) {
      count++;
    }
  }
  if (count > 0) result.assetCount = count;
  return result;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

export async function fetchIntegrityData(maxRetries = 3, signal?: AbortSignal): Promise<IntegrityResult> {
  let attempt = 0;
  const baseDelay = 300;
  while (attempt < maxRetries) {
    try {
      const result: IntegrityResult = {};
      const versionRes = await fetch('/version.json', { cache: 'no-store', signal: signal ?? null }).catch(()=>null);
      if (versionRes?.ok) {
        const v = await versionRes.json().catch(()=>null) || {};
        result.version = v.version || v.appVersion;
        result.commit = v.commit || v.gitCommit || v?.git?.commit;
        result.attestedAt = v.builtAt || v.timestamp;
      }
      const metricsRes = await fetch('/metrics.txt', { cache: 'no-store', signal: signal ?? null }).catch(()=>null);
      if (metricsRes?.ok) {
        const text = await metricsRes.text();
        Object.assign(result, parseMetrics(text));
      }
      const integrityRes = await fetch('/version-integrity.json', { cache: 'no-store', signal: signal ?? null }).catch(()=>null);
      const indexRes = await fetch('/', { cache: 'no-store', signal: signal ?? null }).catch(()=>null);
      if (integrityRes?.ok && indexRes?.ok && 'crypto' in window && window.crypto?.subtle) {
        const json = await integrityRes.json().catch(()=>null) || {};
        const html = await indexRes.text();
        try {
          const hex = await sha256Hex(html);
          const expected = json.sha256 || json.hash;
            if (expected && typeof expected === 'string') result.hashMatch = expected === hex;
        } catch {/* ignore hash calc errors */}
      }
      return result;
    } catch {
      attempt++;
      if (attempt >= maxRetries) break;
      const delay = baseDelay * (attempt * attempt); // quadratic backoff (300, 1200, ...)
      await new Promise(r => setTimeout(r, delay));
    }
  }
  // On total failure return empty object for graceful degradation
  return {};
}
