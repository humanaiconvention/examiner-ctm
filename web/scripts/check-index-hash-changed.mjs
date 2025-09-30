#!/usr/bin/env node
// CI helper: Ensures that indexHash in readyz.json changes when source content changes.
// Strategy: keep a cached previous readyz.json (env-provided path) or compare two provided files.
// Usage examples:
//   node scripts/check-index-hash-changed.mjs old-readyz.json dist/readyz.json
//   node scripts/check-index-hash-changed.mjs --expect-change old readyz new readyz
// Exit codes:
//   0 = OK
//   3 = Hash unchanged when a change was expected
//   4 = Hash changed when a change was NOT expected (optional scenario)
import { readFileSync } from 'node:fs';

function readReady(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { throw new Error('Cannot read readyz: ' + path); }
}

function usage() {
  console.error('Usage: node scripts/check-index-hash-changed.mjs <oldReadyz.json> <newReadyz.json> [--require-change]');
  process.exit(2);
}

const args = process.argv.slice(2);
if (args.length < 2) usage();
let requireChange = false;
if (args.includes('--require-change')) {
  requireChange = true;
}
const filtered = args.filter(a => a !== '--require-change');
const [oldPath, newPath] = filtered;
if (!oldPath || !newPath) usage();
const oldR = readReady(oldPath);
const newR = readReady(newPath);

const oldHash = oldR.indexHash;
const newHash = newR.indexHash;
if (!oldHash || !newHash) {
  console.error('Missing indexHash in one of the files');
  process.exit(2);
}
if (oldHash === newHash) {
  if (requireChange) {
    console.error('ERROR: indexHash did not change but a change was required.');
    process.exit(3);
  } else {
    console.log('No change in indexHash (OK).');
    process.exit(0);
  }
} else {
  if (requireChange) {
    console.log('indexHash changed as required.');
    process.exit(0);
  } else {
    console.log('indexHash changed (informational).');
    process.exit(0);
  }
}
