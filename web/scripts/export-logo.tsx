#!/usr/bin/env tsx
/**
 * Export HumanAI logo as SVG + multi-size PNGs using resvg-js.
 */
import { writeFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import LogoHumanAI, { type LogoMetrics } from '../src/components/LogoHumanAI';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../dist/brand');
const PNG_SIZES = [256, 512, 1024, 2048, 4096];
const BASE_VARIANTS: Array<{ id: string; variant: 'mono-light' | 'mono-dark'; suffix: string; }> = [
  { id: 'light', variant: 'mono-light', suffix: '' },
  { id: 'dark', variant: 'mono-dark', suffix: '-dark' }
];
const FAVICON_SIZES = [16, 32, 48, 64, 128, 256];
const WANT_OUTLINE = process.argv.includes('--outline') || process.env.LOGO_OUTLINE === '1';
const FONT_PATH = process.env.LOGO_OUTLINE_FONT || 'assets/fonts/Inter-Regular.ttf';

type OutlineContext = {
  enabled: boolean;
  textToSVG?: any;
};

async function maybeLoadOutlineContext(): Promise<OutlineContext> {
  if (!WANT_OUTLINE) return { enabled: false };
  try {
    const statFont = await readFile(path.resolve(__dirname, '..', FONT_PATH));
    // dynamic import
    const textToSVGMod = await import('text-to-svg');
    const TextToSVG = (textToSVGMod as any).default || (textToSVGMod as any);
    const tts = TextToSVG.loadSync(path.resolve(__dirname, '..', FONT_PATH));
    return { enabled: true, textToSVG: tts };
  } catch (e) {
    console.warn('[outline] Font load failed or file missing, skipping outline variant:', (e as Error).message);
    return { enabled: false };
  }
}

function outlineWordmark(svg: string, ctx: OutlineContext, variant: 'mono-light' | 'mono-dark'): string {
  if (!ctx.enabled || !ctx.textToSVG) return svg;
  // Extract wordmark group
  const groupRegex = /<g class="logo-wordmark-embedded"[^>]*>([\s\S]*?)<\/g>/;
  const match = svg.match(groupRegex);
  if (!match) return svg; // nothing to replace
  const group = match[0];
  // Extract first line font-size and y
  const lineRegex = /<text[^>]*y="([\d.]+)"[^>]*font-size="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
  const lines: Array<{ y: number; size: number; raw: string; content: string; }> = [];
  let lmatch: RegExpExecArray | null;
  while ((lmatch = lineRegex.exec(group))) {
    const [, yStr, sizeStr, contentRaw] = lmatch;
    const txt = contentRaw.replace(/<[^>]+>/g, ''); // strip tspan
    lines.push({ y: parseFloat(yStr), size: parseFloat(sizeStr), raw: lmatch[0], content: txt });
  }
  if (lines.length === 0) return svg;
  const fill = variant === 'mono-dark' ? '#000000' : '#ffffff';
  // center x assumed 100 from component
  const centerX = 100;
  const tts = ctx.textToSVG;
  const pathParts: string[] = [];
  for (const line of lines) {
    try {
      const pathData = tts.getPath(line.content, {
        x: centerX,
        y: line.y,
        fontSize: line.size,
        anchor: 'center baseline',
        attributes: { fill }
      });
      pathParts.push(pathData);
    } catch (e) {
      console.warn('[outline] Failed to outline line', line.content, e);
    }
  }
  if (pathParts.length === 0) return svg;
  const outlinedGroup = `<g class="logo-wordmark-embedded outlined" fill="${fill}">${pathParts.join('')}</g>`;
  return svg.replace(groupRegex, outlinedGroup);
}

async function writeFaviconIco(pngBuffers: Buffer[], outPath: string) {
  // Lazy import to avoid optional dep impacting startup if tree-shaken
  const pngToIco = (await import('png-to-ico')).default as (imgs: Buffer[]) => Promise<Buffer>;
  const ico = await pngToIco(pngBuffers);
  await writeFile(outPath, ico);
  console.log('Wrote', outPath);
}

async function ensureDir(p: string) { await mkdir(p, { recursive: true }); }

function normalizeSvg(svg: string): string {
  if (/role=/.test(svg.slice(0, 300))) return svg; // already has role
  return svg.replace(/<svg(\s+)/, '<svg role="img" $1');
}

function renderAndExtract(variant: 'mono-light' | 'mono-dark'): { svg: string; metrics?: LogoMetrics } {
  let captured: LogoMetrics | undefined;
  const element = (
    <LogoHumanAI
      variant={variant}
      stacked
      withWordmark
      showConvention
      embedWordmark
      lockWordmarkSpacing
      logMetrics={false}
      onMetrics={(m) => { captured = m; }}
    />
  );
  const markup = ReactDOMServer.renderToStaticMarkup(element);
  const match = markup.match(/<svg[\s\S]*?<\/svg>/);
  if (!match) {
    throw new Error('Failed to locate root <svg> in rendered markup.');
  }
  let svgOnly = match[0];
  // Ensure xmlns present for resvg parser
  if (!/xmlns=/.test(svgOnly.slice(0, 200))) {
    svgOnly = svgOnly.replace(/<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return { svg: normalizeSvg(svgOnly), metrics: captured };
}

function buildMetadata(variant: string, metrics?: LogoMetrics) {
  const PHI = (1 + Math.sqrt(5)) / 2;
  const lines = [
    'HumanAI Logo Export',
    `UIVariant: ${variant}`,
    'Geometry: analytic-locked',
    `φ: ${PHI}`,
    'InnerSpanDeg: 132',
    'Taper: inward-only (end:mid ≈ φ)',
    metrics ? `HeadGap: ${metrics.headGap.toFixed(2)}` : undefined,
    metrics ? `PillarWidthEnd: ${metrics.pillarWidth.toFixed(2)}` : undefined,
    metrics?.pillarMinWidth ? `PillarWidthMid: ${metrics.pillarMinWidth.toFixed(2)}` : undefined,
    metrics?.arcMinThickness ? `ArcMinThickness: ${metrics.arcMinThickness.toFixed(2)}` : undefined,
    metrics ? `OverallWidthEstimate: ${metrics.width.toFixed(2)}` : undefined,
    metrics ? `OverallHeightEstimate: ${metrics.height.toFixed(2)}` : undefined,
    `Generated: ${new Date().toISOString()}`,
    process.env.GIT_COMMIT ? `Commit: ${process.env.GIT_COMMIT}` : undefined
  ].filter(Boolean);
  return '<!--\n' + lines.join('\n') + '\n-->';
}

async function exportAssets() {
  const outlineCtx = await maybeLoadOutlineContext();
  const VARIANTS = [...BASE_VARIANTS];
  if (outlineCtx.enabled) {
    // add outlined variants
    VARIANTS.push({ id: 'light-outline', variant: 'mono-light', suffix: '-outline' });
    VARIANTS.push({ id: 'dark-outline', variant: 'mono-dark', suffix: '-dark-outline' });
  }
  await ensureDir(OUT_DIR);
  for (const v of VARIANTS) {
    const { svg, metrics } = renderAndExtract(v.variant);
    const metadata = buildMetadata(v.variant, metrics);
    let svgWork = svg;
    if (v.id.includes('outline')) {
      svgWork = outlineWordmark(svgWork, outlineCtx, v.variant);
    }
    const svgWithMeta = svgWork.replace(/<svg[^>]*>/, (m) => m + '\n' + metadata + '\n');
    const svgPath = path.join(OUT_DIR, `humanai-logo${v.suffix}.svg`);
    await writeFile(svgPath, svgWithMeta, 'utf8');
    console.log('Wrote', svgPath);
    const faviconPngs: Buffer[] = [];
    for (const size of PNG_SIZES) {
      const r = new Resvg(svgWithMeta, { fitTo: { mode: 'width', value: size } });
      const pngData = r.render();
      const png = pngData.asPng();
      const out = path.join(OUT_DIR, `humanai-logo${v.suffix}-${size}.png`);
      await writeFile(out, png);
      console.log('Wrote', out);
      if (v.id === 'light' && FAVICON_SIZES.includes(size)) {
        faviconPngs.push(png);
      }
    }
    // Build favicon.ico from light variant only (common practice)
    if (v.id === 'light') {
      await writeFaviconIco(faviconPngs, path.join(OUT_DIR, 'favicon.ico'));
    }
  }
  // After all assets written, build checksum manifest
  const files = await readdir(OUT_DIR);
  const brandFiles = files.filter(f => /humanai-logo|favicon\.ico/.test(f));
  const entries = [] as Array<{ file: string; sha256: string; bytes: number }>;
  for (const f of brandFiles) {
    const full = path.join(OUT_DIR, f);
    const buf = await readFile(full);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    entries.push({ file: f, sha256: hash, bytes: buf.length });
  }
  const manifest = {
    spec: 'humanai/brand-assets@1',
    generated: new Date().toISOString(),
    commit: process.env.GIT_COMMIT || undefined,
    outlineIncluded: outlineCtx.enabled,
    files: entries
  };
  await writeFile(path.join(OUT_DIR, 'brand-assets-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('Wrote brand-assets-manifest.json with', entries.length, 'entries');
  console.log('Done.');
}

exportAssets().catch(err => { console.error(err); process.exitCode = 1; });
