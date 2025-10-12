Summary of changes

- Exported authoritative logo assets (SVG + dark variant + PNGs) from programmatic renderer and added them to `web/public/`.
- Switched the hero logo rendering from the programmatic React SVG component to a static `logo.svg` served from `web/public` (accessibility fallback preserved).
- Built and published a branch-only preview `preview/site-test` containing the built `web/dist` artifacts. The preview branch intentionally does not include the production `CNAME`.
- Fixed project-pages asset path mismatch by rebuilding `web` with Vite base `/humanaiconvention/` and republishing the preview branch so the preview URL loads correctly.

Verification performed

- Confirmed `preview/site-test` contains `index.html`, `assets/*`, `logo.svg` and health/readiness artifacts.
- Ran single-run smoke tests: HTTP index (200), project-path logo and main asset (200). Ran a headless Playwright smoke test to verify no console errors.

Notes & follow-ups

- Keep `LogoHumanAI.tsx` as the canonical programmatic source of truth for future exports. The static `logo.svg` in `web/public/` is the exported artifact used by the site.
- To publish to production, run the production build with base `/` (or configure CI appropriately) and promote changes to `main` per deployment policy.
- Infra automation was not changed in this PR; if you'd like I can add a follow-up to disable automated infra runs.
