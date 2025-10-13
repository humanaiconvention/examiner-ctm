Title: Protect `live` branch (recommendations)

Summary
-------

This PR proposes recommended branch protection rules for the `live` branch which maps to the production GitHub Pages output. The goal is to prevent accidental direct pushes and require validation before content reaches production.

Recommended rules (to apply in GitHub repo Settings -> Branches -> Add rule for `live`):

- Require pull request reviews before merging (1-2 reviewers).
- Require status checks to pass before merging. Suggested checks:
  - `preview-smoke` (the workflow added in PR #44)
  - any other build/test checks used for `web` (unit tests, lint)
- Require branches to be up to date before merging (enforce linear history optional).
- Require signed commits (optional, if your org enforces it).
- Restrict who can push to the `live` branch (only maintainers or a specific team).

Process suggestion
------------------

1. All changes to production artifacts should go through `main` and be merged via PRs that trigger the `preview-smoke` workflow.
2. After smoke tests pass and reviewers approve, merge into `main` and run the manual deploy workflow (deploy-unified.yml) or use the existing release process to update `gh-pages`/`live`.

Notes
-----

- Applying these rules requires repo admin permissions and is done in the GitHub UI. If you'd like, I can provide an API script to apply these settings automatically if you prefer automation.
