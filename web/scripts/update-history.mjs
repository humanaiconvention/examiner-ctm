#!/usr/bin/env node
/**
 * update-history.mjs
 * Appends the latest aggregate metrics entry into badges/aggregate-history.json.
 * Maintains a rolling window (default 90 entries) and deduplicates by commit sha.
 *
 * Environment variables:
 *   HISTORY_MAX_ENTRIES (optional) - max entries to retain (default 90)
 *   HISTORY_RETENTION_DAYS (optional) - if set, prune entries older than this many days (applies after dedupe, before max trimming)
 *
 * Input files (expected):
 *   web/aggregate-metrics.json (produced earlier in workflow)
 *
 * Output files:
 *   badges/aggregate-history.json (updated / created)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

const aggregatePath = resolve(__dirname, '..', 'aggregate-metrics.json');
const badgesDir = resolve(ROOT, 'badges');
const historyPath = resolve(badgesDir, 'aggregate-history.json');

function getGitMeta() {
  const safe = (cmd) => {
    try { return execSync(cmd, { encoding: 'utf8' }).trim(); } catch { return undefined; }
  };
  return {
    sha: process.env.GITHUB_SHA || safe('git rev-parse HEAD'),
    ref: process.env.GITHUB_REF || safe('git rev-parse --abbrev-ref HEAD'),
    repo: process.env.GITHUB_REPOSITORY,
  };
}

function readJSON(p, fallback) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; }
}

if (!existsSync(aggregatePath)) {
  console.error('[update-history] aggregate-metrics.json not found, skipping.');
  process.exit(0);
}

const aggregate = readJSON(aggregatePath, null);
if (!aggregate) {
  console.error('[update-history] aggregate metrics unreadable, skipping.');
  process.exit(0);
}

mkdirSync(badgesDir, { recursive: true });

const history = readJSON(historyPath, []);
const meta = getGitMeta();

const entry = {
  ts: new Date().toISOString(),
  sha: meta.sha,
  ref: meta.ref,
  ...aggregate,
};

// Deduplicate by sha (replace existing)
const filtered = history.filter(e => e.sha !== entry.sha);
filtered.push(entry);

// Sort by timestamp ascending
filtered.sort((a, b) => new Date(a.ts) - new Date(b.ts));

// Optional retention by age
const retentionDays = process.env.HISTORY_RETENTION_DAYS ? parseInt(process.env.HISTORY_RETENTION_DAYS, 10) : null;
let pruned = filtered;
if (retentionDays && !Number.isNaN(retentionDays) && retentionDays > 0) {
  const cutoff = Date.now() - (retentionDays * 86400000);
  pruned = pruned.filter(e => new Date(e.ts).getTime() >= cutoff);
}

const maxEntries = parseInt(process.env.HISTORY_MAX_ENTRIES || '90', 10);
while (pruned.length > maxEntries) pruned.shift();

writeFileSync(historyPath, JSON.stringify(pruned, null, 2) + '\n');
console.log(`[update-history] History updated: ${pruned.length} entries (max ${maxEntries}${retentionDays?`, retentionDays=${retentionDays}`:''}).`);
