#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import { join, extname, basename } from 'node:path';
import sharp from 'sharp';

// Run from project root or web directory; normalize path
const SRC_DIR = process.cwd().endsWith('web') ? 'public' : 'web/public';
const TARGETS = ['hero-night-map.jpg'];

async function optimizeImage(file) {
  const full = join(SRC_DIR, file);
  const base = basename(file, extname(file));
  const image = sharp(full);
  const meta = await image.metadata();

  const outDir = SRC_DIR; // write alongside
  const qualityJpeg = 68;
  const widthVariants = [480, 960, 1440];

  console.log(`Optimizing ${file} (${meta.width}x${meta.height})`);

  // Generate responsive variants (webp + avif)
  for (const w of widthVariants) {
    const resized = image.clone().resize({ width: w });
    await resized.webp({ quality: 70 }).toFile(join(outDir, `${base}-${w}.webp`));
    await resized.avif({ quality: 45 }).toFile(join(outDir, `${base}-${w}.avif`));
  }

  // Compressed base jpeg (fallback)
  await image
    .clone()
    .jpeg({ quality: qualityJpeg, progressive: true, mozjpeg: true })
    .toFile(join(outDir, `${base}-optimized.jpg`));

  console.log('Done. Generated variants:');
  console.log(widthVariants.map(w => `${base}-${w}.webp / .avif`).join('\n'));
}

(async () => {
  for (const t of TARGETS) {
    try {
      await optimizeImage(t);
    } catch (e) {
      console.error('Failed optimizing', t, e);
      process.exitCode = 1;
    }
  }
})();
