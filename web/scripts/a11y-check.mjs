#!/usr/bin/env node
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// Basic axe-core injection (using bundled @axe-core/playwright via axe.min.js path)
// We rely on @axe-core/playwright API for convenience.

async function run() {
  const url = process.env.A11Y_URL || 'http://localhost:5173';
  const headless = process.env.CI ? true : true;
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // Wait a bit for lazy sections intersection to mount
  await page.waitForTimeout(1500);

  // Dynamically import axe playwright helper
  const { analyze } = await import('@axe-core/playwright');
  // Load optional axe config
  let axeConfig = {};
  if (existsSync('axe.config.json')) {
    try { axeConfig = JSON.parse(readFileSync('axe.config.json', 'utf-8')); } catch { axeConfig = {}; }
  }
  const disabled = Array.isArray(axeConfig.disable) ? axeConfig.disable : [];
  const rulesConfig = axeConfig.rules || {};
  // Translate disabled list into rule map with enabled:false
  for (const rule of disabled) {
    rulesConfig[rule] = { enabled: false };
  }
  const results = await analyze(page, {
    detailedReport: true,
    detailedReportOptions: { html: true },
    rules: rulesConfig
  });

  const outDir = process.cwd();
  const outPath = path.join(outDir, 'a11y-report.json');
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Accessibility report written to ${outPath}`);

  // Summarize
  const serious = results.violations.filter(v => v.impact === 'serious').length;
  const critical = results.violations.filter(v => v.impact === 'critical').length;
  const moderate = results.violations.filter(v => v.impact === 'moderate').length;
  console.log(`Violations: critical=${critical} serious=${serious} moderate=${moderate} total=${results.violations.length}`);

  if (critical + serious > 0) {
    console.error('Failing due to serious/critical accessibility violations.');
    await browser.close();
    process.exit(1);
  }

  await browser.close();
}

run().catch(err => { console.error(err); process.exit(1); });
