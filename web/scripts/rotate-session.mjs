#!/usr/bin/env node
/**
 * Rotate session epoch to invalidate all existing owner sessions.
 * Writes an incremented numeric epoch to web/.auth/session-epoch.json
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const epochPath = join(process.cwd(), 'web', '.auth', 'session-epoch.json');
let current = 0;
if (existsSync(epochPath)) {
  try {
    const data = JSON.parse(await readFile(epochPath, 'utf8'));
    if (typeof data.epoch === 'number') current = data.epoch;
  } catch { /* ignore */ }
}
const next = current + 1;
await writeFile(epochPath, JSON.stringify({ epoch: next, rotatedAt: new Date().toISOString() }, null, 2), 'utf8');
console.log('Session epoch rotated:', next);
