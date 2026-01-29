// Sanitization utilities for analytics metadata.
// Extracted from analytics.ts to allow isolated testing and reuse.

const PII_WHITELIST = new Set(['userEmail','userId']);

export function sanitizeMetadata(meta: Record<string, unknown> | undefined, depth = 0, seen = new WeakSet<object>(), root?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return meta;
  const origin = root || meta;
  if (depth > 4) return { tooDeep: true } as Record<string, unknown>;
  const cleaned: Record<string, unknown> = {};
  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig;
  for (const [k, v] of Object.entries(meta)) {
    if (v == null) { cleaned[k] = v as unknown; continue; }
    if (typeof v === 'string' && !PII_WHITELIST.has(k)) {
      cleaned[k] = v.replace(emailRegex, '[redacted-email]');
      continue;
    }
    if (typeof v === 'object') {
      if (v === origin) { cleaned[k] = '[circular]'; continue; }
      if (seen.has(v as object)) { cleaned[k] = '[circular]'; continue; }
      seen.add(v as object);
      if (Array.isArray(v)) {
        cleaned[k] = v.map(item => {
          if (typeof item === 'string') return item.replace(emailRegex, '[redacted-email]');
          if (item && typeof item === 'object') {
            return sanitizeMetadata(item as Record<string, unknown>, depth + 1, seen, origin) || null;
          }
          return item;
        });
      } else {
        cleaned[k] = sanitizeMetadata(v as Record<string, unknown>, depth + 1, seen, origin) || v;
      }
      continue;
    }
    cleaned[k] = v;
  }
  return cleaned;
}

export { PII_WHITELIST };
