#!/usr/bin/env node
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

async function run() {
  const url = process.env.PERF_URL || 'http://localhost:5173';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // Trigger lazy sections
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);
  const marks = await page.evaluate(() => performance.getEntriesByType('mark').map(m => ({ name: m.name, startTime: m.startTime })));
  const hero = marks.find(m => m.name === 'hero:mounted')?.startTime ?? null;
  const lookup = (id) => marks.find(m => m.name === id)?.startTime ?? null;
  const data = {
    collectedAt: new Date().toISOString(),
    heroMounted: hero,
    sections: {
      vision: lookup('section:vision:mounted'),
      voices: lookup('section:voices:mounted'),
      participate: lookup('section:participate:mounted'),
      comingSoon: lookup('section:coming-soon:mounted')
    },
    raw: marks
  };
  writeFileSync('perf-marks.json', JSON.stringify(data, null, 2));
  console.log('perf-marks.json written');
  await browser.close();
}

run().catch(e => { console.error(e); process.exit(1); });