#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');
const dist = join(root, 'dist');
const publicDir = join(root, 'public');

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function hashFile(path) {
  try {
    const buf = readFileSync(path);
    return sha256(buf);
  } catch {
    return null;
  }
}

function nowIso() { return new Date().toISOString(); }

// Health (static)
(function updateHealth() {
  const healthPathDist = join(dist, 'healthz.json');
  const healthPathPublic = join(publicDir, 'healthz.json');
  let base = { status: 'ok', service: 'web' };
  try {
    if (existsSync(healthPathPublic)) {
      base = JSON.parse(readFileSync(healthPathPublic, 'utf8'));
    }
  } catch {}
  const enriched = { ...base, buildTime: nowIso() };
  writeFileSync(healthPathDist, JSON.stringify(enriched, null, 2) + '\n', 'utf8');
})();

// Readyz (includes hash of main index.html and version)
(function emitReadyAndMetrics() {
  const indexPath = join(dist, 'index.html');
  const hash = hashFile(indexPath);
  let versionData = {};
  try {
    versionData = JSON.parse(readFileSync(join(publicDir, 'version.json'), 'utf8'));
  } catch {}
  // Collect main asset file hashes (js/css) for integrity tracking
  let assetsIntegrity = [];
  try {
    const assetsDir = join(dist, 'assets');
    const files = readdirSync(assetsDir).filter(f => /\.(js|css)$/.test(f));
    assetsIntegrity = files.map(f => {
      const p = join(assetsDir, f);
      const buf = readFileSync(p);
      const hex = sha256(buf);
      return { file: f, sha256: hex, size: buf.length };
    });
  } catch {}
  const totalAssetBytes = assetsIntegrity.reduce((a,b) => a + (b.size||0), 0);
  const ready = {
    status: hash ? 'ready' : 'missing-index',
    indexHash: hash,
    commit: versionData.commit || 'unknown',
    version: versionData.version || 'unknown',
    generatedAt: nowIso(),
    assets: assetsIntegrity,
    totalAssetBytes,
  };
  writeFileSync(join(dist, 'readyz.json'), JSON.stringify(ready, null, 2) + '\n', 'utf8');

  // Prometheus-style metrics
  const lines = [];
  lines.push('# HELP web_build_info Static build metadata');
  lines.push('# TYPE web_build_info gauge');
  lines.push(`web_build_info{version="${ready.version}",commit="${ready.commit}"} 1`);
  if (typeof totalAssetBytes === 'number') {
    lines.push('# HELP web_total_asset_bytes Total bytes of hashed js/css assets');
    lines.push('# TYPE web_total_asset_bytes gauge');
    lines.push(`web_total_asset_bytes ${totalAssetBytes}`);
  }
  if (Array.isArray(assetsIntegrity)) {
    lines.push('# HELP web_asset_size_bytes Size of individual asset files');
    lines.push('# TYPE web_asset_size_bytes gauge');
    for (const a of assetsIntegrity) {
      lines.push(`web_asset_size_bytes{file="${a.file}",sha256="${a.sha256}"} ${a.size}`);
    }
  }
  writeFileSync(join(dist, 'metrics.txt'), lines.join('\n') + '\n', 'utf8');
})();

console.log('[health] Emitted dist/healthz.json, dist/readyz.json and dist/metrics.txt');

// Some CI environments using unsupported Node versions (e.g., 22.x when engines specify >=20) have been
// observing a spurious non-zero exit despite no thrown errors. To stabilize, explicitly exit 0.
// If a genuine error occurs above, process will have already thrown.
process.exit(0);
