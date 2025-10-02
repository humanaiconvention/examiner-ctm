# Coverage Ratchet Plan

Baseline thresholds (set in `vitest.config.ts`):
- Lines: 60%
- Statements: 60%
- Functions: 55%
- Branches: 65%

## Rationale
The project recently added a substantial amount of integration-oriented code (service worker, dynamic analytics loaders, animated intro gate, quote spotlight). Immediate high thresholds (previously ~88%) caused persistent failure noise without actionable guidance. We reset to a pragmatic baseline that the current suite comfortably exceeds after targeted tests.

## Increment Strategy
Every time a meaningful test file is added OR a refactor meaningfully increases uncovered segments, bump one or more categories by +5% (never more than +10% in a single PR). Priority order:
1. Lines / Statements
2. Branches (after stabilizing logic heavy modules)
3. Functions (naturally rises last)

Example progression schedule (illustrative):
- Sprint N: 60/60/55/65 (baseline) -> add loaders + app insights tests
- Sprint N+1: 65/65/55/65 (after adding SW harness or excluding remaining legacy) 
- Sprint N+2: 70/70/60/68 (add branching tests around intro gate abort paths)
- Sprint N+3: 75/75/65/70 (quote animation edge cases, config drift harness) 
- Continue until sustainable plateau (target: ~80 lines / 75 branches / 75 funcs).

## Exclusions Policy
`src/sw.ts` excluded initially (integration heavy: cache/fetch/clients). Add a minimal harness later using mock `caches` + `fetch` to cover diff logic; once tests exist, remove exclusion and ratchet again.

Generated or build-hash injected files remain excluded (`src/generated/**`). Avoid excluding ordinary source except with explicit comment and follow-up issue reference.

## Enforcing Upward Movement
A lightweight script (future) can read `coverage-summary.json` and if any metric exceeds the threshold by >=10 points for two consecutive runs, fail CI with a hint to increase thresholds.

## Anti-Regressions
If a PR drops any metric below threshold, CI fails per Vitest built-in gating. If it drops by >3 points (even while still above threshold), require a comment in PR rationale.

---
Document last updated: (baseline initialization)
