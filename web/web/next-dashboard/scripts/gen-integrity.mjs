#!/usr/bin/env node
import { createHash } from 'crypto';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const OUT_DIR = process.env.OUT_DIR || 'out';
const root = process.cwd();
const outPath = join(root, OUT_DIR);

function walk(dir) {
  const entries = readdirSync(dir);
  let files = [];
  for (const e of entries) {
    const full = join(dir, e);
    const st = statSync(full);
    if (st.isDirectory()) files = files.concat(walk(full));
    else files.push(full);
  }
  return files;
}

const files = walk(outPath).filter(f => !f.endsWith('integrity-manifest.json') && !f.endsWith('version.json'));

const manifest = {};
for (const file of files) {
  const rel = relative(outPath, file).replace(/\\/g, '/');
  const buf = readFileSync(file);
  const hash = createHash('sha256').update(buf).digest('hex');
  manifest[rel] = {
    sha256: hash,
    bytes: buf.length,
  };
}

// Derive overall hash (deterministic order)
const aggregate = createHash('sha256');
Object.keys(manifest).sort().forEach(k => {
  aggregate.update(k + ':' + manifest[k].sha256 + '\n');
});
const overall = aggregate.digest('hex');

const version = {
  generatedAt: new Date().toISOString(),
  fileCount: Object.keys(manifest).length,
  sha256: overall,
};

writeFileSync(join(outPath, 'integrity-manifest.json'), JSON.stringify(manifest, null, 2));
writeFileSync(join(outPath, 'version.json'), JSON.stringify(version, null, 2));
console.log('Integrity manifest written with', version.fileCount, 'files. Overall hash:', overall);