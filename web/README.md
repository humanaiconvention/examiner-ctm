# Web App (React + TypeScript + Vite)

This package (`web/`) is the front-end for HumanAI Convention. It is built with Vite + React + strict TypeScript settings and integrated into a supply‑chain hardened CI pipeline.

## Badges (Generated in CI)

The extended CI workflow produces a coverage badge artifact (not yet auto-published). To surface it publicly you can:
1. Configure GitHub Pages / artifact publication, or
2. Use a GitHub Action that commits the generated `web/coverage/badge-coverage.svg` to a branch (future enhancement).

Current workflow artifacts: coverage (JSON + HTML), badge SVG, Playwright report, Lighthouse report.

## Key Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start local dev server with HMR. |
| `npm run build` | Production build + version file generation + integrity preparation. |
| `npm run lint` | ESLint (type-aware) pass (can warn locally, CI enforces zero warnings with flag). |
| `npm run typecheck` | Full TypeScript project refs check. |
| `npm run format` | Apply Prettier formatting. |
| `npm run format:check` | Verify formatting only (CI friendly). |
| `npm test` | Execute unit tests (Vitest jsdom). |
| `npm run test:coverage` | Generate coverage (threshold enforced). |
| `npm run test:playwright` | Run Playwright E2E + visual + accessibility suites. |
| `npm run test:visual` | Visual regression snapshots only. |
| `npm run test:a11y` | Accessibility (axe) checks only. |
| `npm run security:audit` | Dependency audit (JSON output). |

## Quality Gating

The root workflow introduces a `quality` job that must pass before any build/deploy:
1. Installs deps (root + workspace) with reproducible lockfile.
2. Runs ESLint with `--max-warnings=0` (ensures new warnings fail fast).
3. Performs strict typechecking.
4. Executes tests and (optionally) coverage.
5. Uploads artifacts: `quality-reports` (eslint + test JSON) for traceability.

To add an ESLint JSON report script:
```jsonc
// in web/package.json
"scripts": {
  "lint:report": "eslint -f json -o web/eslint-report.json ."
}
```

## Preview Password Protection

PR preview deployments can be password-gated via a client-side injected script (deterrent only). Provide `PREVIEW_PASSWORD` secret at repository level. A signed `preview-lock-report.json` documents injection and hash pairing.

## Integrity & Attestations

Build produces:
* `version-integrity.json` (SHA-256 of final `dist/index.html`).
* Optional SBOM (`sbom/sbom.json`) via CycloneDX minimal.
* Attestations & provenance generated upstream in the unified workflow.

## Development Tips

| Task | Command |
|------|---------|
| Clean install | `npm ci && npm --workspace web ci` |
| Update deps | `npm update --workspace web` |
| Hash built index | `sha256sum dist/index.html` (Linux/macOS) or `certutil -hashfile dist/index.html SHA256` (Windows) |
| Dry-run typecheck only | `npm run typecheck` |

## Reproducibility Checks

`deploy-unified` workflow later rebuilds and compares integrity hash for deterministic guarantee. If the hash diverges, the verification job fails and marks non-determinism.

## Adding a New Dependency
1. Add with `npm --workspace web install <pkg>`.
2. Re-run `npm run lint && npm run typecheck` to ensure no new types/warnings.
3. Commit lockfile and updated `package.json`.

## Troubleshooting

| Symptom | Possible Cause | Remedy |
|---------|----------------|-------|
| Integrity hash mismatch | Non-deterministic plugin, timestamp injection, locale differences | Ensure build scripts only embed UTC normalized timestamps; avoid plugin versions with nondeterministic output. |
| Preview password not applied | Secret missing or set to `__DISABLED__` | Add repository secret `PREVIEW_PASSWORD`. |
| ESLint warnings break CI | New rule introduced or dependency update | Run `npm run lint` locally; fix or explicitly disable rule with justification. |

## Future Enhancements
* Pre-build freeze of dependency tree manifest.
* Optional browser performance budget gate (currently non-blocking if scripts added).
* Integrate provenance generator for full SLSA level metadata.
* Additional real-user metrics expansion.

## Analytics & Telemetry

The app ships with a lightweight, privacy-conscious analytics layer (`src/analytics.ts`) featuring:

| Capability | Notes |
|------------|-------|
| Consent gating | No events dispatched until explicit opt-in (queue flushes retroactively). Stored under `haic:analyticsConsent`. |
| Session tracking | Ephemeral UUID per page load (`window.__SESSION_ID__`). |
| Schema enforcement | Category + action unions (compile-time & minimal runtime guard). |
| Sampling | Category-specific (e.g. heartbeats 50%). |
| Deduplication | LRU of recent eventIds to prevent accidental double dispatch. |
| Low-priority batching | Idle / timeout flush of non-critical events. |
| Backend batching | Optional transport with batch size & byte caps + exponential backoff + circuit breaker. |
| Error tracking | `error` + `unhandledrejection` with stack/name capture. |
| Perf metrics | Hero paint, FID surrogate, CLS accumulation, quote transition alerts. |
| Visibility & heartbeats | Tab visibility, focus, periodic heartbeat (sampled). |
| Unload safety | Beacon-style best-effort flush on `pagehide` / `beforeunload`. |
| PII guard | Email patterns stripped from arbitrary metadata (except whitelisted keys). |
| Debug overlay | Dev-only toggle with queue/breaker/sampling snapshot. |

### Application Insights Integration (Optional)

If `VITE_APPINSIGHTS_KEY` is provided, the app initializes a minimal Application Insights instance (consent gated – it stays disabled until analytics consent is granted). Forwarded signals currently include:

| Signal | AI Event Name | Notes |
|--------|---------------|-------|
| Hard bust completion | `sw_hard_bust_complete` | Mirrors internal analytics action |
| Config drift | `sw_config_drift` | Fired only when hash changes |
| Web Vitals | `perf_metric` | Each metric sent as event + metric (name=value) |
| Fetch dependency | `fetch_dependency` | Lightweight wrapper around `window.fetch` capturing method, status/error & duration |

Sampling defaults to 50% but can be overridden using `VITE_APPINSIGHTS_SAMPLE` (0–100). Set `VITE_DISABLE_VITALS=true` to suppress Web Vitals collection entirely (privacy / perf isolation mode). When vitals are disabled no events with action `perf_metric` sourced from Web Vitals will be emitted, but you can still emit your own custom perf metrics if desired.

Connection options:
1. `VITE_APPINSIGHTS_CONNECTION_STRING` (preferred if present)
2. `VITE_APPINSIGHTS_KEY` (legacy instrumentation key fallback)

If both are set the connection string wins. This lets you switch ingestion endpoints or clouds without code changes.

#### Global Telemetry Enrichment
All AI events are enriched with:
* `sessionId` – ephemeral analytics session id.
* `buildCommit` – short or full commit hash from build metadata.

This is applied via an App Insights telemetry initializer so you can pivot KQL queries by deployment or session.

#### Workbook Template
The example Azure Workbook (`/azure-workbook.json`) now includes panels for:
* Recent config drift events (hash drift of SW exposed meta)
* Web Vitals percentiles (LCP, INP, CLS) with p50 / p75 / p95 focus
* Fetch dependency failure rate & latency (p95) plus top failing endpoints
* Hourly LCP p75 trend (time series)
* Error volume (hourly) & top error messages segmentation

Manual import: Portal > Workbooks > New > Advanced Editor > Paste JSON > Save.

Automated deployment: `workbook.bicep` parameterizes the workbook content for idempotent IaC rollout.

Example (deploy workbook + pass content file):
```bash
az deployment group create \
  -g <rg> \
  -f workbook.bicep \
  -p workbookName="HAIC Observability" \
     location="eastus" \
     appInsightsId="$(az monitor app-insights component show -g <rg> -a <aiName> --query id -o tsv)" \
     workbookContent="$(cat azure-workbook.json | jq -c .)"
```
If your shell does not preserve newlines correctly, base64 encode the JSON and update the Bicep / parameter handling (or provide as a separate parameter file).

#### Alert Templates (Bicep)
`/alerts.bicep` defines three scheduled query alerts:
* LCP p75 > 2500 ms (user-centric loading regression)
* Fetch dependency failure rate > 5% (network/backend health)
* INP p75 > 200 ms (interaction latency / responsiveness)

Deploy (example):
```bash
az deployment group create \
  -g <rg> \
  -f alerts.bicep \
  -p appInsightsId="$(az monitor app-insights component show -g <rg> -a <aiName> --query id -o tsv)" \
     actionGroupId="/subscriptions/<sub>/resourceGroups/<rg>/providers/microsoft.insights/actionGroups/<actionGroupName>"
```

Thresholds are deliberately conservative; tune them after a few days of real traffic (adjust predicate in the KQL inside the Bicep if you change performance budgets).

#### Correlation Header & Trace ID
Each page load generates a stable `traceId` (UUID v4 style) stored in-memory for that session. A lightweight `fetch` wrapper injects an `x-trace-id` header on every outgoing request and emits a corresponding AI custom event (`fetch_dependency`) with the same `traceId` property so you can join frontend + backend logs.

Backend correlation suggestions:
* Echo `x-trace-id` back in the response headers (harmless if absent).
* Log/trace the incoming header (map to your server-side tracing system or activity id). If using Azure App Service / Container Apps with OpenTelemetry, add it as a span attribute.
* When emitting server AI telemetry, set `operation_Id = x-trace-id` (or include as custom dimension) for direct KQL joins.

KQL example (join client fetch failures with server exceptions by trace):
```kusto
let clientDeps = customEvents
  | where name == 'fetch_dependency'
  | project timestamp, traceId=tostring(customDimensions.traceId), url=tostring(customDimensions.url), status=toint(customMeasurements.status), durationMs=toint(customMeasurements.durationMs);
exceptions
  | extend traceId=tostring(customDimensions["x-trace-id"]) // if you propagate it
  | join kind=inner clientDeps on traceId
  | project timestamp, traceId, url, status, exceptionType, outerMessage=message, durationMs
  | order by timestamp desc
```

Local validation (DevTools):
1. Open Network tab, perform an action.
2. Inspect request headers → confirm `x-trace-id`.
3. In AI (Live Metrics or Logs), query for `customEvents | where name == 'fetch_dependency' | take 5` and confirm `traceId` dimension.

#### Environment & Secrets Guidance
Preferred configuration is via `VITE_APPINSIGHTS_CONNECTION_STRING` (supports cloud/region changes). `VITE_APPINSIGHTS_KEY` remains for legacy instrumentation key usage. In builds where BOTH are set, the connection string wins.

Example `.env.local` (do NOT commit real values):
```
VITE_APPINSIGHTS_CONNECTION_STRING=InstrumentationKey=3136dab6-1928-4e00-a020-0931ca72568a;IngestionEndpoint=https://dc.services.visualstudio.com/
VITE_APPINSIGHTS_SAMPLE=50
VITE_DISABLE_VITALS=false
```

Container build (local):
```
docker build \
  --build-arg VITE_APPINSIGHTS_CONNECTION_STRING="InstrumentationKey=3136dab6-1928-4e00-a020-0931ca72568a;IngestionEndpoint=https://dc.services.visualstudio.com/" \
  -t humanaiconvention-web:trace .
```

GitHub Actions secrets (recommended names):
* `APPINSIGHTS_CONNECTION_STRING` (preferred)
* `APPINSIGHTS_KEY` (only if connection string not yet available)

Workflow build args already map these secrets if present. After adding the secret(s) rerun a build and verify initialization via a KQL query:
```kusto
customEvents | where name == 'sw_hard_bust_complete' | take 1
```

If no results after a hard bust action (update triggers), confirm consent was granted (events are gated until user opt-in).

### New Performance Action: `perf_metric`

Previously multiple perf signals were overloading `hero_paint`. A dedicated action `perf_metric` now models generic performance metrics (currently Web Vitals). Metadata shape:

| Field | Description |
|-------|-------------|
| `metric` | One of `CLS`, `FCP`, `INP`, `LCP`, `TTFB` |
| `value` | Raw numeric value from web-vitals library |
| `rating` | `good` / `needs-improvement` / `poor` |
| `id` | Web Vitals ID (for INP / CLS correlation) |
| `origin` | Always `web_vitals` (reserved for future metric sources) |

### Environment Variable

`VITE_ANALYTICS_ENDPOINT` – When set, backend transport is enabled (POST JSON batches to the endpoint). Example `.env`:

```
VITE_ANALYTICS_ENDPOINT=/analytics
```

Transport behavior:
* Batches capped at 50 events or ~30KB JSON (whichever first).
* Retries non-4xx responses up to 3 attempts with exponential backoff (base 400ms).
* Circuit breaker opens after 6 consecutive failures; cools down for 60s before half-open retry.
* Uses `keepalive` when configured for better unload delivery.

Additional optional env vars impacting telemetry:

| Variable | Purpose |
|----------|---------|
| `VITE_APPINSIGHTS_KEY` | Enables Application Insights forwarding layer (consent gated). |
| `VITE_APPINSIGHTS_CONNECTION_STRING` | Preferred way to configure App Insights (overrides key if both provided). |
| `VITE_APPINSIGHTS_SAMPLE` | Overrides default 50% AI sampling (0–100). |
| `VITE_DISABLE_VITALS` | If `true`, prevents Web Vitals registration entirely. |
| `VITE_SW_EXPOSE_META` | Forces SW config meta exposure even in production (diagnostics). |

### Consent Banner

`<AnalyticsConsentBanner />` renders automatically (added in `App.tsx`) only when no prior consent key exists. Features:
* Accept / Decline buttons (fires lifecycle events `consent_granted` / `consent_denied`).
* Optional email/handle field persisted as `haic:userEmail` and applied via `setUserContext()` when granted.
* On acceptance, pre-consent queue flushes (retroactive hero paint/perf events included).

### Debug Overlay

Dev-only (`import.meta.env.DEV`). Toggle button reveals live stats: queue lengths, last flush timestamp, breaker state, sampling map. Component: `AnalyticsDebugOverlay`.

### Extending Metrics

Add new perf actions by extending category union in `analytics.ts` and updating `validateSchema()`. For one-off diagnostics, prefer metadata labels under existing perf actions to avoid taxonomy churn.

### Sanitization

Before dispatch, metadata is shallow-sanitized: any detected email patterns replaced with `[redacted-email]` unless the key is whitelisted (`userEmail`, `userId`). Avoid placing raw PII in arbitrary metadata fields.

### Testing & Coverage

Unit tests (Vitest) focus on logic (analytics, components) and run in a jsdom environment. Playwright tests (visual & accessibility) are intentionally separated to keep the fast feedback loop for unit tests:

| Suite | Command | Notes |
|-------|---------|-------|
| Unit | `npm test` | Excludes `tests/*.spec.ts` (Playwright). |
| Coverage | `npm run test:coverage` | Enforces ≥88% lines/functions/statements, ≥85% branches. |
| E2E + visual + a11y | `npm run test:playwright` | Starts dev server automatically (reuses if running). |
| Visual only | `npm run test:visual` | Uses screenshot expectations; update with `VISUAL_UPDATE=true`. |
| Accessibility only | `npm run test:a11y` | Axe rules (wcag2a / wcag2aa). |

Snapshot / visual updates:
```
VISUAL_UPDATE=true npm run test:visual
```

PII sanitization is validated via a dedicated test ensuring email redaction while preserving whitelisted keys.

### CI / Quality Gates

`ci-extended.yml` introduces three key jobs:

| Job | Purpose | Gate |
|-----|---------|------|
| build-test | Lint, typecheck, unit tests + coverage badge generation | Blocks others |
| playwright | E2E / visual / a11y via Playwright | Requires build-test success |
| lighthouse | Performance & budgets via LHCI | Requires build-test success |

Performance budgets enforced (see `lighthouserc.json`):
* Perf category >= 0.90 (error if below)
* Accessibility >= 0.90
* FCP <= 1800ms (warn)
* LCP <= 2500ms (warn)
* TBT <= 250ms (error)
* CLS <= 0.1 (error)
* Unused JS budget (warn) and other advisory audits.

To adjust: edit `web/lighthouserc.json` and re-run `npm run build && npx lhci autorun` locally.

### Local Development Tips

| Task | Example |
|------|---------|
| Force consent grant | `localStorage.removeItem('haic:analyticsConsent')` then reload and use banner. |
| Inspect debug info | Enable dev, click overlay toggle (bottom-right). |
| Simulate transport failure | Point `VITE_ANALYTICS_ENDPOINT` to an invalid route and observe breaker state. |
| Adjust sampling | Edit `CATEGORY_SAMPLE_RATES` constant and rebuild. |

---

---
Maintained as part of the HumanAI Convention supply‑chain verified build.

## Environment-Specific CSP Generation

The Static Web Apps `routes.json` is now generated from `public/routes.template.json` by `scripts/generate-csp.ts` to produce differing CSP policies for dev vs prod:

| Env | Differences |
|-----|-------------|
| dev | Allows `unsafe-eval` and adds `ws://localhost:*` to `connect-src` for Vite HMR. |
| prod | Strips `unsafe-eval`, tightens `script-src`, and adds `upgrade-insecure-requests`. |

Scripts:

```
npm run csp:dev   # generate routes.json for local dev
npm run csp:prod  # generate routes.json for production
```

`npm run build:prod` invokes the prod CSP generation first (via explicit script) to ensure build artifacts carry the hardened policy. If you run plain `npm run build`, remember to run a CSP generation script beforehand if you modified the template.

Regeneration logic:
1. Read `routes.template.json`.
2. Replace `__CSP__` placeholder with computed directive string.
3. Emit `public/routes.json` (committed artifact for SWA deploy).

If you need to add new directives, modify the base array in `scripts/generate-csp.ts`.


## Asset Manifest Diff & Bundle Analysis

New tooling provides deterministic insight into build output drift and bundle composition.

| Tool | Command | Purpose |
|------|---------|---------|
| Manifest Snapshot | `npm run manifest:snapshot` | Saves current `dist` file -> size map to `.asset-manifest.json`. |
| Manifest Diff | `npm run manifest:diff` | Prints JSON diff vs last snapshot: added/removed/changed assets + size deltas. |
| Build (analysis mode) | `npm run build:analyze` | Emits standard build plus `dist/analysis/stats.html` (Rollup visualizer). |
| Open Analysis | (manual) | Open `dist/analysis/stats.html` in a browser to inspect module graph & size. |

Example manifest diff output:
```jsonc
{
  "summary": { "totalFiles": 3, "added": 1, "removed": 0, "changed": 1 },
  "added": ["assets/new-chunk.js"],
  "removed": [],
  "changed": [ { "file": "assets/index-ABC.js", "previous": 210345, "current": 217460, "delta": 7115 } ]
}
```

Integrate into CI (future): run diff on PR, fail if core bundle grows beyond threshold.

## Offline / Service Worker

Basic service worker (`src/sw.ts`) caches core shell assets (`/`, `index.html`, `vite.svg`, built `/assets/*`). Navigation requests fall back to cached `index.html` when offline. Registered only in production builds.

| Action | Result |
|--------|--------|
| First load online | Caches core assets. |
| Subsequent offline navigation | Falls back to app shell. |
| Removed old caches | On activate, old cache versions pruned. |

To update cache version modify `CACHE_NAME` in `sw.ts` and rebuild.

### Hard Bust Completion Backoff

When a manifest diff exceeds `manifestHardBustRatio`, a full precache rebuild ("hard bust") occurs. Immediately after activation there can be a window where no controlled clients are yet available, making postMessage broadcast of completion metrics unreliable. The service worker now retries delivery of the `hard-bust-complete` message up to 5 attempts with exponential backoff (250ms, 500ms, 1s, 2s, 4s). Each attempt re-enumerates clients (`includeUncontrolled`) to maximize the chance that at least one foreground page receives the event for telemetry/UX hooks.

Client-side, receipt of this message emits the analytics action `sw_hard_bust_complete` with `{ ratio, total }` in metadata.

## Pre-Logo Intro Sequence

An optional immersive pre-logo intro sequence precedes the main application on first visit. It stages several short prompts and ends with a "Ready to convene?" CTA.

### Behavior
* 5 stages (4 auto‑advanced prompts, then CTA) – default stage duration ~6.4s (slowed from original ~3.2s for more reading/reflective time).
* Fade/slide transition per stage; final CTA waits for interaction.
* Enter/Space activate CTA when focused.
* Once completed, sets `hq:introComplete = true` in `localStorage` (no replay unless cleared).

### Accessibility
* Container uses `role="dialog"` with `aria-live="polite"` and `aria-atomic`.
* Keyboard activation supported; focus initially placed on CTA when final stage reached.
* Respects `prefers-reduced-motion`: minimal motion retained.

### Configuration
| Env Var | Effect | Default |
|---------|--------|---------|
| `VITE_DISABLE_PREINTRO` | If set (truthy), bypasses intro entirely. Useful for tests / perf profiling. | unset |

Local skip example (create `.env.local`):
```
VITE_DISABLE_PREINTRO=true
```

### Reset / Re-run
```
localStorage.removeItem('hq:introComplete'); location.reload();
```

### Source
Component: `src/components/PreLogoSequence.tsx`, conditionally rendered in `App.tsx`.

### Testing
`PreLogoSequence.test.tsx` (Vitest) uses fake timers to validate timed progression and completion callback.

### Telemetry (Extensible)
Intro telemetry is now active under a distinct `intro` category (consent-gated like all other events):

| Action | When Fired | Metadata / Value |
|--------|------------|------------------|
| `intro_impression` | Component mount (once) | `totalStages` count |
| `intro_stage_view` | Each stage transition (including CTA) | `index`, `isCta` boolean; label = stage id |
| `intro_completed` | User activates CTA (or reaches final and clicks Enter/Space) | `value` and `durationMs` (rounded total ms), `stagesViewed` |

Sampling: currently inherits default (no down-sampling). If volume grows, set a rate in `CATEGORY_SAMPLE_RATES` for `'intro'`.

KQL example (if forwarding to App Insights via optional backend mapping):
```kusto
customEvents
| where customDimensions.eventCategory == 'intro'
| summarize count() by name=customDimensions.eventAction
```

### Centralized SW Configuration

Operational thresholds for cache update behavior and client UX (hard bust ratio, auto-refresh limits, snackbar duration) are now consolidated in `src/sw-config.ts`. This avoids magic numbers being duplicated across:

- `sw.ts` (server-side diff + bust strategy)
- `sw-updates.tsx` (client auto-refresh decision & background notice timing)
- Tests (integration simulation referencing shared ratios)

To adjust behavior:

```ts
// src/sw-config.ts
export const SW_CONFIG = {
  manifestHardBustRatio: 0.4,        // raise to reduce full cache resets
  autoRefresh: {
    enabledByDefault: true,          // default user preference
    maxRatio: 0.25,                  // limit for silent refresh
    maxAdded: 4,                     // max new assets for silent refresh
    snackbarDurationMs: 4000         // background update notice lifetime
  }
};
```

Any change here propagates consistently without searching for stray literals. If you expand to environment-driven overrides, import env vars in `sw-config.ts` only (keep the rest pure). For testing custom scenarios, you can temporarily mutate `SW_CONFIG` inside a test before importing the code under test.

#### Environment Overrides

You can tune behavior per build via Vite env variables (e.g. `.env.preview`):

| Variable | Purpose | Default |
|----------|---------|---------|
| `VITE_SW_MANIFEST_HARD_BUST_RATIO` | Hard bust ratio cutoff | `0.4` |
| `VITE_SW_AUTO_REFRESH_DEFAULT` | Default auto-refresh opt-in (`true/false`) | `true` |
| `VITE_SW_AUTO_REFRESH_MAX_RATIO` | Max diff ratio for silent refresh | `0.25` |
| `VITE_SW_AUTO_REFRESH_MAX_ADDED` | Max added files for silent refresh | `4` |
| `VITE_SW_AUTO_REFRESH_SNACK_MS` | Snackbar duration (ms) | `4000` |

Example `.env.preview`:

```
VITE_SW_MANIFEST_HARD_BUST_RATIO=0.25
VITE_SW_AUTO_REFRESH_MAX_RATIO=0.15
```

#### Observability Meta Tag & Dev Helper

At runtime (non-production by default, or when `VITE_SW_EXPOSE_META=true` in prod) a meta tag `name="x-sw-config-json"` is injected containing a compact JSON snapshot of the public SW config plus a short `configHash` (FNV-1a style 32‑bit hex) for drift detection. A secondary `x-sw-config-hash` meta makes synthetic checks simpler. A dev console helper is also exposed:

```
window.__dumpSWConfig()
```

Use this to verify that the deployed environment picked up intended overrides without digging through bundles.

### Config Hash Drift Detection

Each page load deterministically computes a hash of the exposed SW configuration subset (currently `manifestHardBustRatio` and `autoRefresh` block). The hash is persisted in `localStorage` under key `sw:configHash`. If a subsequent load produces a different hash (indicating a configuration change between navigations or deployments) an analytics event `sw_config_drift` is fired with metadata `{ previous, current }` before updating the stored value. This allows downstream dashboards to surface configuration churn without parsing build artifacts.

Hash characteristics:
- Algorithm: 32‑bit FNV-1a style accumulation, hex padded to 8 chars.
- Scope: Only stable, non-sensitive fields (add fields cautiously to avoid artificial drift).
- Resilience: Order-insensitive for object keys via JSON stringify of controlled shape.

If you introduce new config parameters, ensure they are serializable and update the payload object in `main.tsx`; consider whether they materially impact runtime behavior before including them (to avoid noisy drift events).

### Analytics Event Additions

Recent SW/observability related actions (category: `interaction`):
| Action | When Fired | Metadata |
|--------|------------|----------|
| `sw_update_decision` | SW posts update diff (includes strategy) | `{ reason, ratio, added, removed }` |
| `sw_auto_refresh` | Client elects silent auto-refresh | `{ ratio, added, removed }` |
| `sw_background_notice` | Background snackbar displayed after silent update | none / `{}` |
| `sw_hard_bust_complete` | Full precache rebuild finished and clients notified | `{ ratio, total }` |
| `sw_config_drift` | Config hash changed between navigations | `{ previous, current }` |

### Playwright Meta Tag Tests & Browser Install

E2E tests validate presence and structure of the `x-sw-config-json` meta tag in non-production contexts and assert absence heuristically under a built preview without the expose flag. If you encounter failures like "Executable doesn't exist" after installing dependencies, install Playwright browsers once:

```
npx playwright install
```

You can scope to a single spec while iterating:

```
npx playwright test tests/sw-config-meta.spec.ts
```

For a production preview validation:

```
npm run build
npm run preview -- --port 4173
npx playwright test tests/sw-config-meta.spec.ts
```

Adjust the heuristic (port check) in `tests/sw-config-meta.spec.ts` if your dev server uses a non-default port or you add explicit environment cues.
## Deterministic Static Preview

Instead of `vite preview` (which may auto-switch ports), use:

```
npm run build
npm run preview:dist
```

Serves `dist` at `http://localhost:5500` with SPA fallback. Customize port: `PORT=5600 npm run preview:dist`.

### Enhanced Local Preview & Health Endpoints

Additional convenience scripts were added for a deterministic static preview along with health/readiness signals:

| Script | Purpose |
|--------|---------|
| `npm run preview:static` | Serve existing `dist` on port 5060 (no rebuild) via `serve`. |
| `npm run build:preview` | Build then serve on port 5060. |
| `npm run preview:auto` | Build, start static server, poll health endpoint until ready (retry loop). |

The automated script (`preview:auto`) emits structured logs while waiting for the server to expose the health endpoint.

#### Environment Variables (Preview Automation)

| Variable | Default | Description |
|----------|---------|-------------|
| `PREVIEW_PORT` | `5060` | Port for static server & health polling. |
| `HEALTH_PATH` | `/healthz.json` | Path polled for readiness during `preview:auto`. |
| `HEALTH_RETRIES` | `15` | Max poll attempts before giving up. |
| `HEALTH_RETRY_DELAY` | `400` (ms) | Delay between poll attempts. |

Example (custom port & faster polling):
```
PREVIEW_PORT=5501 HEALTH_RETRIES=30 HEALTH_RETRY_DELAY=200 npm run preview:auto
```

#### Health & Readiness Artifacts

Two JSON endpoints are emitted into `dist/` during the standard `npm run build` (post-build step `postbuild:health`):

| Endpoint | File | Purpose |
|----------|------|---------|
| `/healthz.json` | `dist/healthz.json` | Liveness/basic build info (includes `buildTime`). |
| `/readyz.json` | `dist/readyz.json` | Readiness hash of `index.html` plus version/commit metadata. |

`/healthz.json` sample:
```json
{
  "status": "ok",
  "service": "web",
  "buildTime": "2025-09-29T21:01:08.123Z"
}
```

`/readyz.json` sample:
```json
{
  "status": "ready",
  "indexHash": "<sha256>",
  "commit": "<short|unknown>",
  "version": "0.1.0",
  "generatedAt": "2025-09-29T21:01:08.456Z"
}
```

These endpoints are static (regenerated on build) allowing deterministic container health / rollout checks (e.g., compare `indexHash` across instances before promoting traffic).

CI/CD or deployment platforms can probe `/readyz.json` to ensure the primary document hash is present, and `/healthz.json` for a simpler liveness signal.

### Integrity & Metrics

`/readyz.json` now includes per-asset integrity metadata for hashed JS/CSS bundles:

```jsonc
{
  // ...existing fields...
  "assets": [
    { "file": "index-ecngpkfN.js", "sha256": "<hex>", "size": 407123 },
    { "file": "index-BrW7Kpal.css", "sha256": "<hex>", "size": 19876 }
  ],
  "totalAssetBytes": 426999
}
```

A Prometheus-style metrics exposition file is emitted at `dist/metrics.txt` (you can optionally serve it at `/metrics.txt`):

```
# HELP web_build_info Static build metadata
# TYPE web_build_info gauge
web_build_info{version="0.1.0",commit="abcdef123456"} 1
# HELP web_total_asset_bytes Total bytes of hashed js/css assets
# TYPE web_total_asset_bytes gauge
web_total_asset_bytes 426999
# HELP web_asset_size_bytes Size of individual asset files
# TYPE web_asset_size_bytes gauge
web_asset_size_bytes{file="index-ecngpkfN.js",sha256="<hex>"} 407123
web_asset_size_bytes{file="index-BrW7Kpal.css",sha256="<hex>"} 19876
```

### Comparing Environments

Use the helper script to compare two readiness endpoints or files:

```
node scripts/compare-readyz.mjs https://staging.example.com/readyz.json https://prod.example.com/readyz.json
```

Outputs human-readable differences (non-zero exit only on fetch/error; warns if `indexHash` differs but version stayed constant).

### CI Check for index.html Hash Changes

To ensure deployment PRs that alter user-visible content actually change the SPA shell, capture a baseline `readyz.json` from the current production build and run:

```
node scripts/check-index-hash-changed.mjs old-readyz.json dist/readyz.json --require-change
```

If the `indexHash` is unchanged while source templates changed, this signals an issue (e.g., stale cache, build misconfiguration, or content confined to dynamic runtime only). Integrate this into CI after `npm run build`.

### New Scripts Summary

| Script | Purpose |
|--------|---------|
| `readyz:compare` | Convenience wrapper: run without args prints usage; call via node for diffing two endpoints/paths. |
| `verify:index-hash-change` | Programmatic hash change checker (manual args required). |

For pipeline usage, invoke the underlying node commands directly with explicit file paths.

## Workflow Enhancements (Planned)

* (Optional) CI job to run `manifest:diff` and annotate PR with size changes.
* Gate on max allowed delta for main bundle (e.g. > +10kB gzip fails).
* Extend Lighthouse PR comment to include mobile profile metrics.

## Containerization & Deployment

### Production Image

A multi-stage Dockerfile at repo root builds the app and serves it via Nginx:

1. `node:20-alpine` installs deps & runs `npm run build` (output: `web/dist`).
2. `nginx:alpine` serves static assets with caching & SPA fallback (see `nginx.conf`).

Key features:
* Long-term caching for `/assets/*` (fingerprinted) with immutable headers.
* SPA fallback (`try_files $uri /index.html`).
* Optional health endpoint at `/healthz`.

Build locally:
```
docker build -t humanaiconvention-web:latest .
docker run -p 8080:80 humanaiconvention-web:latest
```

Visit: http://localhost:8080

### Dev Container (Optional)

For iterative dev you normally use `npm run dev` (HMR). A dev container could mount the source and run Vite directly, but it's not provided by default to keep the image lean. If needed:
```
docker run --rm -it -p 5173:5173 -v ${PWD}/web:/app/web -w /app/web node:20-alpine sh -c "npm ci && npm run dev -- --host"
```

### Environment Variables in Container

Because the build is static, runtime-only changes require either:
* Rebuild with new `VITE_*` values, or
* Inject a small runtime config script (future enhancement) loaded before React bootstraps.

Current sensitive / optional telemetry flags (`VITE_APPINSIGHTS_KEY`, `VITE_APPINSIGHTS_SAMPLE`, `VITE_DISABLE_VITALS`, `VITE_ANALYTICS_ENDPOINT`) must be set at build time for the production image.

### Azure Deployment Options

| Option | When to Use | Notes |
|--------|-------------|-------|
| Azure Static Web Apps | Pure static front-end + optional serverless APIs | No container needed; use `npm run build` output. Fast global edge distribution. |
| Azure Container Apps | Need containerized runtime (future SSR, sidecars) | Deploy the built image from ACR. Scale-to-zero possible. |
| Azure App Service (Linux) | Simple container hosting or Node build | Can use container directly; supports health probes & logging. |
| Azure Storage + CDN/Front Door | Lowest cost static hosting | Upload `dist` to storage, enable static website hosting, front with CDN. |

If you only serve static assets, Azure Static Web Apps or Storage+CDN is usually cheaper & faster than a container.

### Push Image to Azure Container Registry (ACR)

```
az acr create -g <resource-group> -n <registryName> --sku Basic
az acr login -n <registryName>
docker tag humanaiconvention-web:latest <registryName>.azurecr.io/hai-web:latest
docker push <registryName>.azurecr.io/hai-web:latest
```

Then deploy to:
* Container Apps:
```
az containerapp create -g <rg> -n hai-web \
  --image <registryName>.azurecr.io/hai-web:latest \
  --environment <envName> \
  --target-port 80 --ingress external
```
* App Service (Web App for Containers):
```
az webapp create -g <rg> -p <appServicePlan> -n hai-web \
  -i <registryName>.azurecr.io/hai-web:latest
```

### Health Probes

Configure your Azure service to probe `/healthz` (200 OK). Nginx also serves `/` (index.html) if needed as a fallback probe.

### Hardening Ideas (Future)
* Add non-root user & drop capabilities.
* Embed CSP headers via Nginx config.
* Use `dist` integrity manifest for runtime hash verification.
* Add `security.txt` endpoint.

