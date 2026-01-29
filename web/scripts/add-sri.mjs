#!/usr/bin/env node
/**
 * add-sri.mjs
 * Compute SHA-256 integrity hashes for all <script type="module" crossorigin src> tags in dist/index.html
 * and inject integrity attributes if missing or outdated. Idempotent.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readFile as rf } from 'node:fs/promises';

const distDir = join(process.cwd(), 'dist');
const indexPath = join(distDir, 'index.html');

function sha256Integrity(buf) {
  const h = createHash('sha256').update(buf).digest('base64');
  return `sha256-${h}`;
}

async function main() {
  let html;
  try { html = await readFile(indexPath, 'utf-8'); } catch (e) {
    console.error('[sri] Failed to read dist/index.html:', e.message); process.exit(1);
  }
  const scriptRegex = /<script type="module" crossorigin src="(.*?)"(.*?)><\/script>/g;
  let match; let modified = false; const replacements = [];
  while ((match = scriptRegex.exec(html)) !== null) {
    const full = match[0];
    const src = match[1];
    const tail = match[2];
    const hasIntegrity = /integrity=/.test(tail);
    // Load file
    let filePath = src.startsWith('/') ? src.slice(1) : src; // remove leading slash
    if (filePath.startsWith('http')) continue; // skip external
    const abs = join(distDir, filePath);
    let buf;
    try { buf = await rf(abs); } catch { continue; }
    const integrity = sha256Integrity(buf);
    if (hasIntegrity) {
      // Replace existing integrity value if different
      const newTag = full.replace(/integrity="sha256-[^"]+"/, `integrity="${integrity}"`);
      if (newTag !== full) {
        replacements.push({ from: full, to: newTag });
        modified = true;
      }
    } else {
      const insertionPoint = '<script type="module" crossorigin src="' + src + '"';
      const newTag = full.replace(insertionPoint, insertionPoint + ` integrity="${integrity}"`);
      if (newTag !== full) {
        replacements.push({ from: full, to: newTag });
        modified = true;
      }
    }
  }
  if (modified) {
    let out = html;
    for (const r of replacements) {
      out = out.replace(r.from, r.to);
    }
    await writeFile(indexPath, out, 'utf-8');
    console.log(`[sri] Updated integrity for ${replacements.length} script tag(s).`);
  } else {
    console.log('[sri] No changes needed.');
  }
}

main();
