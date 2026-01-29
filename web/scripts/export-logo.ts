#!/usr/bin/env tsx
/**
 * Export HumanAI logo as SVG + multi-size PNGs using resvg-js.
 * - Server-renders the React component with embedded wordmark.
 * - Injects metadata comment (golden ratio, spans, taper ratios, metrics).
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import LogoHumanAI, { type LogoMetrics } from '../src/components/LogoHumanAI';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OUT_DIR = path.resolve(__dirname, '../dist/brand');
const PNG_SIZES = [512, 1024, 2048];

async function ensureDir(p: string) { await mkdir(p, { recursive: true }); }

function normalizeSvg(svg: string): string {
  // React may output attributes we want to standardize minimally.
  return svg
    .replace(/<svg /, '<svg role="img" ')
    .replace(/\s+data-reactroot=""/, '');
}

/** Collect metrics by rendering once with callback */
function renderAndExtract(): { svg: string; metrics?: LogoMetrics } {
  let captured: LogoMetrics | undefined;
  const element = (
    <LogoHumanAI
      variant="mono-light"
      stacked
      withWordmark
      showConvention
      embedWordmark
      lockWordmarkSpacing
      logMetrics={false}
      onMetrics={(m) => { captured = m; }}
    />
  );
  const svg = ReactDOMServer.renderToStaticMarkup(element);
  return { svg: normalizeSvg(svg), metrics: captured };
}

function buildMetadata(metrics?: LogoMetrics) {
  const PHI = (1 + Math.sqrt(5)) / 2;
  const lines = [
    'HumanAI Logo Export',
    'Variant: analytic-locked',
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
  await ensureDir(OUT_DIR);
  const { svg, metrics } = renderAndExtract();
  const metadata = buildMetadata(metrics);
  // Inject metadata comment after opening svg tag
  const svgWithMeta = svg.replace(/<svg[^>]*>/, (m) => m + '\n' + metadata + '\n');
  const svgPath = path.join(OUT_DIR, 'humanai-logo.svg');
  await writeFile(svgPath, svgWithMeta, 'utf8');
  console.log('Wrote', svgPath);

  // Rasterize sizes
  for (const size of PNG_SIZES) {
    const r = new Resvg(svgWithMeta, {
      fitTo: { mode: 'width', value: size }
    });
    const pngData = r.render();
    const png = pngData.asPng();
    const out = path.join(OUT_DIR, `humanai-logo-${size}.png`);
    await writeFile(out, png);
    console.log('Wrote', out);
  }
  console.log('Done.');
}

exportAssets().catch(err => {
  console.error('Export failed:', err);
  process.exitCode = 1;
});
