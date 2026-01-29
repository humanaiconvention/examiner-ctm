Preview smoke CI helper
=======================

This folder contains helper scripts used by the `.github/workflows/preview-smoke.yml` workflow and for local verification.

Scripts:
- `serve-dist-fallback.mjs` — lightweight Node server that serves `dist` and falls back to `index.html` for SPA deep routes. (Already present; fixed for Windows path joins.)
- `check-base-path.js` — simple check that fails CI if the built `dist/index.html` contains repo-base prefixes like `/humanaiconvention/assets` which break custom-domain Pages hosting.
- `test-serve-fallback.mjs` — small integration script that requests several routes against `http://localhost:5080` and verifies they return `index.html`.

Local run (Linux/macOS/WSL recommended):

```bash
npm --workspace web run build
node web/scripts/serve-dist-fallback.mjs &
node web/scripts/test-serve-fallback.mjs
npx playwright test web/tests/smoke.spec.ts --reporter=list
```

On Windows PowerShell use `Start-Job` to run the server in background, or run the server in a separate terminal.
