Title: Add Preview Smoke CI workflow and base-path guard

Summary
-------

This PR adds a GitHub Actions workflow to run smoke tests against the built `web/dist` artifacts in a preview context. It also adds helper scripts:

- `web/scripts/check-base-path.js` — fails if `dist/index.html` contains `/humanaiconvention/assets` prefixes which break custom-domain Pages.
- `web/scripts/test-serve-fallback.mjs` — local helper to verify SPA fallback returns `index.html` for common routes.
- `web/PREVIEW_SMOKE_README.md` — short instructions for maintainers.

Why
---

We had a production incident where `index.html` referenced repo-base-prefixed assets that caused a blank/white site when using the custom domain. This workflow enforces a guard and runs Playwright smoke tests in PRs and on-demand so we catch regressions earlier.

Notes
-----

- Workflow runs on `pull_request` to `main` and manual dispatch.
- The workflow installs Playwright browsers and runs the smoke test file already present at `web/tests/smoke.spec.ts`.
- If you want this to run for PRs from forks, additional configuration for secrets and GitHub token permissions may be needed.

Suggested reviewers: @maintainers
