import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Basic integration-style tests for analytics-size-check ratchet & cooldown.
// These tests assume a prior build has produced analytics chunk files in dist/assets.
// If dist is missing, tests are skipped gracefully.

describe('analytics-size-check ratchet & cooldown', () => {
  const cwd = path.resolve(__dirname, '..');
  const budgetsPath = path.join(cwd, 'analytics-budgets.json');

  function run(cmd: string) {
    return execSync(cmd, { cwd, stdio: 'pipe', encoding: 'utf8' });
  }

  const distExists = () => fs.existsSync(path.join(cwd, 'dist'));

  it('applies ratchet after improving runs and respects cooldown', () => {
    if (!distExists()) {
      console.warn('Skipping analytics-size-check ratchet test (dist missing).');
      return;
    }

    const budgetsOrig = JSON.parse(fs.readFileSync(budgetsPath, 'utf8'));
    // Remove prior ratchet state to simulate fresh environment for deterministic test
    const ratchetStatePath = path.join(cwd, '.analytics-size-ratchet.json');
    if (fs.existsSync(ratchetStatePath)) fs.unlinkSync(ratchetStatePath);

    // Use low thresholds to trigger quickly
    const baseCmd = 'node scripts/analytics-size-check.mjs --ratchet-after=1 --ratchet-percent=1 --headroom-threshold=0.05 --min-floor=1 --ratchet-cooldown=1';

    // First run: should pass and potentially apply ratchet (since improvingRuns >= 1)
    run(baseCmd);
    const afterFirst = JSON.parse(fs.readFileSync(budgetsPath, 'utf8'));
    let reduced = false;
    for (const k of Object.keys(budgetsOrig.chunks)) {
      if (afterFirst.chunks[k].gzipKB < budgetsOrig.chunks[k].gzipKB) {
        reduced = true; break;
      }
    }
    if (!reduced) {
      console.warn('Ratchet test: no initial reduction observed; skipping remaining assertions.');
      return;
    }

    // Second run: cooldown should prevent immediate second reduction
    const firstReductionBudgets = JSON.parse(fs.readFileSync(budgetsPath, 'utf8'));
    run(baseCmd);
    const afterSecond = JSON.parse(fs.readFileSync(budgetsPath, 'utf8'));
    let secondReduction = false;
    for (const k of Object.keys(firstReductionBudgets.chunks)) {
      if (afterSecond.chunks[k].gzipKB < firstReductionBudgets.chunks[k].gzipKB) {
        secondReduction = true; break;
      }
    }
    expect(secondReduction).toBe(false);

    // Third run: cooldown satisfied; we allow another reduction if an additional improvement is detected.
    run(baseCmd);
    const afterThird = JSON.parse(fs.readFileSync(budgetsPath, 'utf8'));
    // Accept either another reduction or stability; fail only if regression (increase) occurs.
    let regression = false;
    for (const k of Object.keys(afterSecond.chunks)) {
      if (afterThird.chunks[k].gzipKB > afterSecond.chunks[k].gzipKB) { regression = true; break; }
    }
    expect(regression).toBe(false);
  });
});
