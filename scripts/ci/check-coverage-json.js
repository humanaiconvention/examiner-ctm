#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const candidates = [
  path.join('coverage', 'coverage-summary.json'),
  path.join('coverage', 'coverage-final.json')
];

const found = candidates.find(p => fs.existsSync(p));

if (!found) {
  console.error('ERROR: coverage JSON summary not found.');
  console.error('Searched for:');
  for (const c of candidates) console.error('  - ' + c);
  console.error('This is a deliberate failure for the dry-run to validate failure mode handling.');
  process.exit(2);
}

console.log(`Found coverage JSON summary: ${found}`);
process.exit(0);
