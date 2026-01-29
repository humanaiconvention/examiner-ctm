#!/usr/bin/env node
// Simple helper: node scripts/generate-password-hash.mjs "my password"
import crypto from 'node:crypto';

const input = process.argv.slice(2).join(' ');
if (!input) {
  console.error('Usage: node scripts/generate-password-hash.mjs "your password"');
  process.exit(1);
}
const hash = crypto.createHash('sha256').update(input, 'utf8').digest('hex');
console.log(hash);