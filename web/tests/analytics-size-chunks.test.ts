import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

describe('--chunks dynamic chunk list', () => {
  const cwd = path.resolve(__dirname, '..');
  const distAssets = path.join(cwd, 'dist', 'assets');
  const jsonOut = path.join(cwd, 'dist', 'analysis', 'analytics-size-report-extra.json');

  function run(cmd: string) {
    return execSync(cmd, { cwd, stdio: 'pipe', encoding: 'utf8' });
  }

  it('captures extra chunk with default stub budget', () => {
    if (!fs.existsSync(distAssets)) {
      console.warn('Skipping --chunks test (dist/assets missing).');
      return;
    }
    const extraFile = path.join(distAssets, 'analytics-extra-test.js');
    if (!fs.existsSync(extraFile)) fs.writeFileSync(extraFile, '/* extra test */');
    run('node scripts/analytics-size-check.mjs --chunks=core,engagement,perf,errors,extra --json-out=dist/analysis/analytics-size-report-extra.json');
    const json = JSON.parse(fs.readFileSync(jsonOut, 'utf8'));
  const extraEntry = json.report.find((r: unknown) => (r as {chunk?: string}).chunk === 'extra') as { gzipLimitKB: number } | undefined;
  expect(extraEntry).toBeTruthy();
  if (!extraEntry) return; // type narrowing
  expect(extraEntry.gzipLimitKB).toBe(9999); // default stub budget
    // Ensure deltas map includes it
    expect(json.deltas.extra).toBeDefined();
  });
});
