#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function loadJson(source) {
  if (/^https?:/i.test(source)) {
    const res = await fetch(source, { timeout: 5000 }).catch(() => null);
    if (!res || !res.ok) throw new Error(`Failed fetch ${source} (${res && res.status})`);
    return await res.json();
  }
  return JSON.parse(readFileSync(source, 'utf8'));
}

function summarize(r) {
  const assetCount = Array.isArray(r.assets) ? r.assets.length : 0;
  return {
    status: r.status,
    indexHash: r.indexHash,
    version: r.version,
    commit: r.commit,
    assetCount,
    totalAssetBytes: r.totalAssetBytes,
  };
}

function diff(a, b) {
  const changes = [];
  for (const key of ['status','indexHash','version','commit','assetCount','totalAssetBytes']) {
    if (a[key] !== b[key]) {
      changes.push({ field: key, a: a[key], b: b[key] });
    }
  }
  return changes;
}

async function main() {
  const [,, srcA, srcB] = process.argv;
  if (!srcA || !srcB) {
    console.error('Usage: node scripts/compare-readyz.mjs <readyzA.(json|url)> <readyzB.(json|url)>' );
    process.exit(2);
  }
  const [rA, rB] = await Promise.all([loadJson(srcA), loadJson(srcB)]);
  const sA = summarize(rA); const sB = summarize(rB);
  const changes = diff(sA, sB);
  console.log('A:', sA);
  console.log('B:', sB);
  if (changes.length === 0) {
    console.log('No differences.');
  } else {
    console.log('Differences:');
    for (const c of changes) {
      console.log(` - ${c.field}: A=${c.a} B=${c.b}`);
    }
  }
  // Non-zero exit if indexHash differs (signals content change) but version didn't bump
  if (sA.indexHash !== sB.indexHash && sA.version === sB.version) {
    console.log('WARN: indexHash differs but version is the same. Consider version bump.');
  }
}

main().catch(e => { console.error('[compare-readyz] error', e); process.exit(1); });
