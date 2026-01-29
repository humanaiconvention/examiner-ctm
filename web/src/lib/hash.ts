// Lightweight FNV-1a 32-bit hash utility (hex padded)
// Centralizing to avoid duplicate small implementations across config surfaces.

export function fnv1a32(input: string): string {
  let hash = 0x811c9dc5; // offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0; // multiply by FNV prime, clamp to 32 bits
  }
  return hash.toString(16).padStart(8, '0');
}

export function hashJsonStable(obj: unknown): string {
  // For now rely on deterministic JSON.stringify of controlled shapes.
  // If ordering concerns arise, implement a stable key sort.
  return fnv1a32(JSON.stringify(obj));
}
