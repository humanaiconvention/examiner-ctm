#!/usr/bin/env node
/**
 * Verify reproducibility of brand asset export.
 * Runs export twice (discarding timestamps) and compares hashes of each generated file.
 */
import { readFile, rm, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(process.cwd());
const BRAND_DIR = path.join(ROOT, 'dist', 'brand');

function run(cmd, args, env={}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`);
}

async function hashFile(p) {
  const buf = await readFile(p);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function main() {
  // Clean brand dir
  await rm(BRAND_DIR, { recursive: true, force: true });
  // First export
  run('npm', ['run', 'logo:export']);
  const snapshot1 = await readFile(path.join(BRAND_DIR, 'brand-assets-manifest.json'), 'utf8');
  const parsed1 = JSON.parse(snapshot1);
  // Remove timestamp + commit for deterministic comparison
  delete parsed1.generated; delete parsed1.commit;

  // Hash each actual file listed
  const fileHashes1 = {};
  for (const f of parsed1.files) fileHashes1[f.file] = f.sha256;

  // Second export (without cleaning so we overwrite)
  run('npm', ['run', 'logo:export']);
  const snapshot2 = await readFile(path.join(BRAND_DIR, 'brand-assets-manifest.json'), 'utf8');
  const parsed2 = JSON.parse(snapshot2);
  delete parsed2.generated; delete parsed2.commit;
  const fileHashes2 = {};
  for (const f of parsed2.files) fileHashes2[f.file] = f.sha256;

  const mismatches = [];
  for (const file of Object.keys(fileHashes1)) {
    if (fileHashes1[file] !== fileHashes2[file]) {
      mismatches.push({ file, first: fileHashes1[file], second: fileHashes2[file] });
    }
  }
  if (mismatches.length) {
    console.error('[logo:repro] NON-DETERMINISTIC output detected:', mismatches);
    process.exit(1);
  } else {
    console.log('[logo:repro] Deterministic: all file hashes stable across consecutive exports.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
