## Features
 - License-aware SBOM component diff with add/remove/version/license change tracking.
 - Lightweight Sigstore policy (audit mode) & verification step.
- Optional PR Preview Password Lock (client-side) for ephemeral deployments.
 - Strict quality gating: lint (zero warnings), typecheck, unit tests must pass before any build/deploy job executes.
 - Secret preflight gating: production / preview deploys only run when required secrets are present (explicit skip vs silent failure).

## Live Site & Verification

![Deployed Integrity Status](https://img.shields.io/github/actions/workflow/status/humanaiconvention/humanaiconvention/deployed-integrity-check.yml?label=deployed%20integrity&logo=github)
![Attestation Freshness](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/humanaiconvention/humanaiconvention/badges/attestation-badge.json&logo=trust&label=attestation)
![Out-of-Band Verification](https://img.shields.io/github/actions/workflow/status/humanaiconvention/humanaiconvention/verify-latest-attestations.yml?label=verification%20oob&logo=github)
![Verification Health](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/humanaiconvention/humanaiconvention/badges/verification-badge.json&label=attestations&logo=trust)

Live URL (pending DNS propagation): https://www.humanaiconvention.com/

Integrity & Provenance:
- Version JSON: https://www.humanaiconvention.com/version.json
- HTML Integrity (hash embedded in `version-integrity.json` once published)
- Hourly Integrity Report + Predicate Attestation: ephemeral OCI image `ghcr.io/<owner>/<repo>-integrity-report:<run_id>` receives a real in-toto style attestation via `cosign attest` (custom type `https://humanaiconvention.com/attestation/integrity-report@v1`).
- Transparency Log (attestation digests): Issue labeled `integrity-attestation` (auto-created, one comment per run)
- (Historical) Prior to 2025-09-28 predicate was "simulated" by signing the JSON blob directly; this has been replaced with true `cosign attest` bound to an OCI subject.

Attestation Freshness Badge:
- The badge above consumes `badges/attestation-badge.json` (pushed each run by the integrity workflow)
- Schema: Shields endpoint (`{schemaVersion:1,label,message,color}`)
- Message states `ok @ <UTC>` for match; `drift @ <UTC>` if mismatch detected.
- Color: brightgreen (match) / red (drift).

Quick Local Verification (after a release commit `COMMIT_SHA`):
```bash
curl -s https://www.humanaiconvention.com/version.json | jq
curl -s https://www.humanaiconvention.com/version-integrity.json | jq -r .sha256
curl -s https://www.humanaiconvention.com/index.html | sha256sum
```
Compare the two SHA-256 values; they should match. (If post-build injection differs, consult the signed report artifacts in the release.)

If DNS is not yet active, GitHub Pages fallback URL: `https://<github-username>.github.io/<repo-name>/`.

## Usage
 ### Development
Ensure you are using Node.js 20+ (see `engines` in `web/package.json`). A recommended workflow:

Common scripts (run from `web/`):

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start Vite dev server. |
| `npm run build` | Generate version file, typecheck via project references, build production bundle. |
| `npm run lint` | ESLint over all source (React + TS). |
| `npm run typecheck` | Strict TypeScript check with additional invariants (`noImplicitOverride`, `exactOptionalPropertyTypes`). |
| `npm run format` | Apply Prettier formatting to repo files. |
| `npm run format:check` | Verify formatting (CI friendly). |
| `npm run verify` | Aggregate: lint + typecheck + build + security audit. Fails fast on any error. |
| `npm run security:audit` | Production dependency vulnerability scan, JSON output to `audit.json`. |
| `npm run verify:deployed` | Compare deployed site hash vs baseline (see integrity section). |

Formatting: Prettier config lives at `.prettierrc.json`; keep stylistic overrides minimal to reduce churn. CI should use `npm run format:check` to enforce consistency without auto-committing.

TypeScript Strictness: We've enabled `noImplicitOverride`, `exactOptionalPropertyTypes`, and `forceConsistentCasingInFileNames` to catch subtle correctness issues early. `skipLibCheck` remains enabled to keep build latency low; revisit if third‑party type drift becomes a concern.

Node Tooling Parity: GitHub Actions currently pins Node 20.x for build & attestation steps. Local development on Node 22 is acceptable but may show an engines warning until workflows migrate. Prefer testing critical predicate generation paths under Node 20 prior to release tagging.

 ### Deployment Pipeline Overview
 6. Policy Enforcement: A lightweight step evaluates the Sigstore policy (currently in audit mode) for required artifacts.
 7. SBOM Diff: Compares prior baseline to detect added/removed/version-changed components (and license changes) before proceeding.
8. Preview Protection (PR builds only): If configured, injects a minimal client-side password prompt into the built `index.html` for PR preview environments.
9. Secret Preflight (other workflows): A lightweight job determines if required secrets exist and exposes boolean outputs; deploy jobs fail fast or skip gracefully based on presence.
10. Quality Reports: ESLint JSON and test runner JSON (Vitest / Jest) are uploaded as artifacts (`quality-reports`) for post‑run inspection.

### Quality & Secret Gating Pattern

All primary workflows now use a layered gate sequence:

1. `quality` job: Installs dependencies, enforces ESLint with `--max-warnings=0`, runs typecheck and tests. Uploads:
	 - `web/eslint-report.json` (placeholder if no reporter script).
	 - `web/test-report/results.json` (Vitest/Jest JSON or a note object).
2. `secrets-preflight` job (where relevant): Emits an output `has_token` (or future additional flags) so downstream jobs use conditions instead of re-evaluating secrets inline.
3. Build / Deploy jobs declare `needs: [quality, secrets-preflight]` and gate each deploy step with `if: needs.secrets-preflight.outputs.has_token == 'true'` (or fail early in production if absent).

Benefits:
- Deterministic order: no wasted build minutes if lint/test fail.
- Reduced false-positive secret linter noise: secret references centralized.
- Transparent skip semantics for forked PRs lacking repository secrets.

Adding Another Secret Gate Example:
```yaml
jobs:
	secrets-preflight:
		runs-on: ubuntu-latest
		outputs:
			has_third_party: ${{ steps.detect.outputs.has_third_party }}
		steps:
			- id: detect
				run: |
					if [ -n "${{ secrets.THIRD_PARTY_API_KEY }}" ]; then
						echo "has_third_party=true" >> "$GITHUB_OUTPUT"
					else
						echo "has_third_party=false" >> "$GITHUB_OUTPUT"
					fi
	deploy:
		needs: [quality, secrets-preflight]
		steps:
			- name: Use API
				if: needs.secrets-preflight.outputs.has_third_party == 'true'
				run: node scripts/call-api.mjs
```

Quality Report Consumption:
```bash
gh run download <run-id> -n quality-reports
jq . web/eslint-report.json
jq . web/test-report/results.json
```

If you add a dedicated ESLint JSON reporter script, place it under `"lint:report": "eslint -f json -o web/eslint-report.json ."` in `web/package.json`.
## Security & Supply Chain Hardening
 - SBOM license drift reporting.
 - Policy enforcement (audit mode) with Sigstore policy file.
- Optional preview password injection (non-cryptographic guard) to deter casual discovery of PR previews.
 - Bundle size governance (baseline manifest + delta & budget enforcement).
 - Performance (Lighthouse) gradual enforcement with future hard gate date.
 - Unified problem budget (lint/test/size) aggregation & Slack notification.

## Bundle Size Governance
The deploy pipeline generates `web/dist-size-manifest.json` (committed to `main` on successful deploy) and enforces:
- Total budget (default `SIZE_TOTAL_BUDGET=550000` bytes ~ 550 KB)  
- Max growth delta vs baseline (`SIZE_MAX_DELTA=30000` bytes)  
- Per-file soft cap (>150 KB for a single non-map asset triggers failure)  

Script: `web/scripts/bundle-size.mjs`

Modes:
```
node scripts/bundle-size.mjs manifest   # produce manifest json
node scripts/bundle-size.mjs check      # enforce budgets vs baseline
```

Baseline logic: The workflow attempts to read the previously committed `web/dist-size-manifest.json` from `HEAD` as the baseline. After a successful deploy, the new manifest is auto-committed (fast‑forward) if it changed.

Adjusting Budgets (per-run overrides):
```
SIZE_TOTAL_BUDGET=600000 SIZE_MAX_DELTA=25000 node scripts/bundle-size.mjs check
```

## Problem Budget Aggregation
`web/scripts/problem-budget.mjs` consumes ESLint JSON, test summary, and bundle size result to produce `web/problem-budget-summary.json` with fields:
```
{
	"lintErrors": <number>,
	"lintWarnings": <number>,
	"testFailures": <number>,
	"testsTotal": <number>,
	"bundle": { "totalBytes": <number> },
	"exceeded": ["lintErrors", ...],
	"ok": true|false
}
```
CI fails the quality job if *any* budget is exceeded. Budgets are intentionally strict (zero lint warnings allowed) to bias toward authentic reduction over suppression.

### Coverage Floor
Added in schema `2` of the summary: if a `coverage/coverage-summary.json` (Istanbul style) exists, the script extracts `statements.pct` (fallback `lines.pct`). Set `MIN_COVERAGE` (or legacy `PB_MIN_COVERAGE`) env to enforce a minimum percentage. Example:

```
MIN_COVERAGE=75 node web/scripts/problem-budget.mjs
```

Status key `coverage` will be `false` if coverage `< MIN_COVERAGE`. The overall gate fails when any status is false.

### Nightly Trend History & Slack
A scheduled workflow (`nightly-trend.yml`) runs a lightweight lint/test/coverage pass, aggregates the problem budget, appends an entry to `metrics/trend-history.json`, commits it, and posts a Slack `trend` event. This allows tracking reduction or regression over time without waiting for ad‑hoc pushes.

Early structure (each array entry):
```
[
	{
		"date": "2025-09-29T02:15:09Z",
		"summary": { ... problem-budget-summary.json contents ... }
	}
]
```

Future enhancements may compress history (rolling window) or derive derived metrics (e.g., moving averages, burn-down to zero-warn state).

## Performance (Lighthouse) Gradual Enforcement
The `lighthouse` job runs on `main` builds and records category scores (Performance, Accessibility, Best Practices, SEO). Current soft thresholds:
- Performance ≥ 90
- Accessibility ≥ 95

Before enforcement date (`LIGHTHOUSE_ENFORCE_DATE`, default `2025-11-01`): sub-threshold scores emit warnings and (optionally) Slack notifications but do not fail the pipeline. On or after the enforcement date, failing scores cause the job to exit non‑zero.

Environment Overrides:
```
MIN_PERF_SCORE=92 MIN_ACC_SCORE=96 LIGHTHOUSE_ENFORCE_DATE=2025-10-20
```

Artifacts: Raw Lighthouse reports are stored under `web/.lighthouseci` and uploaded as `lighthouse-gradual` artifact.

## Slack Notifications
Slack integration uses an **Incoming Webhook** (`SLACK_WEBHOOK_URL` secret). Script: `.github/scripts/slack-notify.mjs`.

Events sent:
- Quality Gate (pass/fail; includes lint/test/bundle/coverage metrics)
- Deploy (includes bundle size, commit, URL)
- Deterministic Verify (pass/fail)
- Lighthouse Warning (only when below thresholds pre‑enforcement or failure post‑enforcement)
- Trend (nightly scheduled summary snapshot)

Message Format: Block Kit header + field grid; color codes (green, red, orange) derived from status.

To enable:
1. Create a Slack App or use Incoming Webhooks feature → add webhook to target channel.
2. Add repo secret: `SLACK_WEBHOOK_URL=<https://hooks.slack.com/services/...>`
3. (Optional) Adjust emojis or fields in `.github/scripts/slack-notify.mjs`.

Security Notes:
- Secret never echoed; curl fallback removed in favor of node script.
- Notifications skipped automatically if secret absent.
- Forked PR events do not run deploy path → no leakage.

Extensibility:
- Add bot token (chat:write) for threads or message updates (planned; script includes placeholder comment).
- Extend trend workflow to compute deltas vs previous N days.
- Add signed nightly trend attestation referencing problem budget + size metrics.

## Future Hardening Roadmap (Quality & Observability)
- Introduce size per‑entrypoint budgets (initial vs lazy chunk segmentation).
- Enforce Lighthouse Perf/Acc after date with remediation suggestions (largest contentful paint / time to interactive deltas).
- Expand problem budget to include coverage floor and bundle composition entropy (e.g., number of JS chunks, third‑party bytes, license risk score).
- Add signed aggregate QA attestation referencing problem budget + size + perf results.

## Service Worker Updates & Asset Integrity

The frontend includes an advanced service worker (`web/src/sw.ts`) with the following capabilities:

- Versioned precache using an injected `BUILD_REV` (git short hash + build timestamp).
- Precise asset diffing: the previous manifest asset list is persisted (`haic-meta` cache keys `manifest-hash` & `manifest-list`). On refresh, the SW computes added/removed assets and a change ratio; if the ratio exceeds 40% it performs a hard rebuild else an incremental update.
- Background refresh: periodic background sync tag `refresh-precache` (daily) plus a 6‑hour fallback interval message to trim runtime caches.
- Pattern-based API TTL caching (`API_TTL_PATTERNS`) supporting `prefix`, `regex`, and `exact` patterns; cached responses embed `x-sw-cached-at` for TTL enforcement and return `504` when stale and offline.
- Runtime cache bounding (`MAX_RUNTIME_ENTRIES`) and lazy cleanup via `trim-runtime` message.
- Lightweight Workbox‑style `registerRoute` abstraction (initial image cache-first example) enabling incremental strategy growth without importing Workbox.
- Forced update path: UI sends `postMessage('force-reload')`; SW runs `skipWaiting` + `clients.claim` then broadcasts `{type:'force-reload'}` prompting a window reload.
- Update notifications: when a manifest update is applied the SW posts `{type:'update-available', added, removed, ratio}`; the React `UpdateToast` component displays a refresh button and expandable details.
- Subresource Integrity injection: build pipeline generates `dist/sri-manifest.json` (via `npm run generate:sri`). A custom Vite plugin (`sri-inject`) adds `integrity` + `crossorigin="anonymous"` to `<script>` and stylesheet `<link>` tags during production build.

Manual debug helper (production console):
```js
window.__forceSWUpdate(); // triggers manifest refresh check
```

Planned enhancements:
- CSP header generation referencing SRI manifest.
- User preference to auto-refresh on minor updates.
- Additional TTL patterns loaded from a served JSON config.
- Offline analytics queue persistence (currently in-memory only pre‑consent/backlog).

### Content Security Policy (CSP) & SRI Guidance

The current HTML sets a baseline CSP meta tag primarily for local/reference usage. For robust production enforcement you should deliver a strict CSP header from your CDN / hosting platform. Because we inject Subresource Integrity attributes (`integrity` + `crossorigin="anonymous"`) for JS and CSS, you can safely use hash or nonce based script policies while mitigating risk of asset tampering.

Recommended starting header (adjust domains as needed):
```
Content-Security-Policy:
	default-src 'self';
	base-uri 'self';
	script-src 'self' 'strict-dynamic' 'nonce-{NONCE}' 'unsafe-inline';
	style-src 'self' 'unsafe-inline';
	img-src 'self' data:; 
	font-src 'self' data:; 
	connect-src 'self' https://api.yourdomain.example; 
	object-src 'none';
	frame-ancestors 'none';
	upgrade-insecure-requests;
```

Then tighten once you confirm no inline scripts are needed:
```
script-src 'self' 'strict-dynamic' 'nonce-{NONCE}';
style-src 'self';
```

Where to integrate SRI:
1. Build generates `dist/sri-manifest.json`.
2. Vite plugin injects integrity attributes into `index.html` for all `<script type="module">` and stylesheet links.
3. CDN header can include `require-sri-for script style` (deprecated in some browsers; test before adopting) or rely on enforcement-by-failure if an integrity mismatch occurs.

If you adopt a nonce-based CSP (recommended for defense-in-depth) remove `unsafe-inline` and dynamically nonce any critical inline bootstrap (e.g., analytics consent priming) or move it into external JS so SRI covers it.

Reporting:
Add a `report-to` / `report-uri` directive and configure a reporting endpoint for CSP violation collection to detect unexpected script/style evaluations.

Example hardened CSP (simplified):
```
default-src 'self';
script-src 'self' 'strict-dynamic' 'nonce-{NONCE}';
style-src 'self';
img-src 'self' data:; 
font-src 'self' data:; 
connect-src 'self' https://api.humanaiconvention.com; 
object-src 'none';
frame-ancestors 'none';
base-uri 'self';
upgrade-insecure-requests;
```

Operational Tips:
- Rotate nonces per response; never reuse across requests.
- Monitor violation reports for a probation period before blocking third-party additions.
- If integrating analytics tags or third-party scripts, prefer self-hosted trusted copies with SRI instead of broad wildcard origins.


## PR Preview Password Lock

This feature adds a very lightweight password gate to pull request preview deployments. It is intended only to discourage casual access or indexing—not to provide real security. The protection is entirely client-side JavaScript injected into `dist/index.html` by `web/scripts/preview-protect.mjs`.

### How It Works
1. During the PR preview build job, if a password value is available (via the `PREVIEW_PASSWORD` environment variable), the script injects a `<script id="__PREVIEW_LOCK__">` block.
2. On first visit, the script prompts the user for the password (blocking render until correct).
3. A successful entry is stored in `localStorage` (namespace key: `__preview_lock__`). Subsequent loads skip the prompt.

### Limitations
- Client-side only: Users can view source, retrieve the password prompt logic, or bypass with dev tools.
- No rate limiting, no server involvement.
- Not a substitute for authentication, secrets management, or authorization.
- Should not be used for anything sensitive (PII, proprietary data, pre-release confidential features, etc.).

### Enabling the Password Lock
1. Create a GitHub Actions secret named `PREVIEW_PASSWORD` (recommended) or an environment-level secret.
2. Open or update a pull request; the pipeline will inject the gate only if the secret is non-empty.
3. If the secret is absent or empty, NO password is applied (there is no automatic fallback or pseudo-random generation to avoid a false sense of protection).

#### Creating the Secret (GitHub UI)
1. Navigate: Repository Settings → Security → Secrets and variables → Actions.
2. Click "New repository secret".
3. Name: `PREVIEW_PASSWORD`
4. Value: (choose a non-trivial phrase; avoid quotes or leading/trailing spaces).
5. Save.

#### Creating the Secret (CLI via `gh`)
```bash
gh secret set PREVIEW_PASSWORD --body "your-secret-password"
```

### Verifying Injection
- The workflow now generates a signed JSON report (`preview-lock-report.json`) containing: schemaVersion, script hash, index HTML hash, password presence flags, and status.
- The composite action also produces a GitHub Actions summary table for quick review.
- Manual spot check:
```bash
grep '__PREVIEW_LOCK__' web/dist/index.html
jq . web/dist/preview-lock-report.json
sha256sum web/dist/index.html
```

### Direct Secret Reference
The workflow calls a composite action `./.github/actions/preview-protect` with `password: ${{ secrets.PREVIEW_PASSWORD }}`. If your linter flags direct secret mapping, options:
1. Remove/empty the secret (unprotected preview) or set `__DISABLED__`.
2. Move password into an environment-level secret scoped to a protected environment.
3. Introduce an allowlist entry in the workflow linter config.

### Disabling
Remove/unset the secret, set it empty, or set `PREVIEW_PASSWORD=__DISABLED__`; the composite action terminates early (unlocked) and still emits a JSON report with reason `no_password_unprotected`.

### Threat Model Note
This is strictly a deterrent for casual browsing or automated indexing. For authentic access control, integrate an authenticated preview proxy, short-lived signed URLs, or environment-level basic auth (e.g., via reverse proxy) outside the scope of this script.

### Entropy & Policy
Passwords must satisfy:
- Minimum length (default 10; configurable `min-length` input to composite action)
- Required character classes (default: upper, lower, digit; optional addition: symbol)
Missing any required class or length threshold fails the preview job before artifact publication.

### Signed Report
`preview-lock-report.json` is signed keylessly with Cosign (Fulcio + Rekor). Artifacts:
- `preview-lock-report.json`
- `preview-lock-report.json.sig`
- `preview-lock-report.json.cert`
These can be verified offline:
```bash
cosign verify-blob \
	--certificate-oidc-issuer https://token.actions.githubusercontent.com \
	--certificate-identity-regexp ".*/deploy-unified.yml@refs/heads/main" \
	--signature web/dist/preview-lock-report.json.sig \
	web/dist/preview-lock-report.json
```

### Index HTML Hash Pairing
The report includes `indexHtmlSha256` which may differ from the earlier build-time integrity hash if post-build injection mutates the file. This allows you to:
1. Detect tampering between build and injection phases.
2. Correlate script hash + index hash for reproducible diffing.

If you need to assert that injection did not modify unrelated regions, you can store and diff a pre-injection integrity hash (future enhancement: dual-hash baseline).

## # HumanAI Convention

**A reproducible, trauma-informed framework for ethical AI governance, grounded in human data and public-benefit infrastructure.**


## 🌍 Vision
HumanAI Convention is building a universal, participatory framework for AI governance—anchored in transparency, reproducibility, and human-centered design. Our goal is to ensure that AI systems evolve in ways that respect human dignity, cultural diversity, and long-term resilience.


## 🚀 What’s Inside


## 📖 Roadmap


## 🤝 Contributing
We welcome collaborators across disciplines—law, ethics, technical design, and community governance.  
See [`CONTRIBUTING.md`](CONTRIBUTING.md) for guidelines.


## 📜 License


## 📬 Contact


*HumanAI Convention is a public-benefit initiative. Together, we can build AI governance that belongs to everyone.*
---

## Observability & Telemetry (Summary)

Frontend telemetry blends a privacy-conscious custom analytics layer with optional Azure Application Insights forwarding. Core principles: explicit consent gating, minimal PII, consistent correlation, infrastructure-as-code for dashboards/alerts, and tunable sampling.

Key Components:
- Custom analytics queue (consent gated, sampling, batching, circuit breaker, LRU dedupe).
- Web Vitals collection (LCP, INP, CLS, TTFB, FCP) → normalized `perf_metric` events (can disable).
- Service Worker config drift + update strategy events (`sw_config_drift`, `sw_hard_bust_complete`, etc.).
- Fetch dependency instrumentation (`fetch_dependency`) with duration + status + correlation trace id.
- Azure Application Insights integration (connection string or key) with telemetry initializer adding `sessionId` and `buildCommit`.
- Correlation header injection: `x-trace-id` per page load across all fetches.
- Infrastructure as Code: `alerts.bicep` (LCP p75, Fetch failure %, INP p75) and `workbook.bicep` + `azure-workbook.json` for dashboards.

Environment Variables (build-time):
| Variable | Purpose |
|----------|---------|
| `VITE_APPINSIGHTS_CONNECTION_STRING` | Preferred AI configuration (wins over key). |
| `VITE_APPINSIGHTS_KEY` | Legacy instrumentation key fallback. |
| `VITE_APPINSIGHTS_SAMPLE` | Override AI sampling percentage (default 50). |
| `VITE_DISABLE_VITALS` | `true` disables Web Vitals capture. |
| `VITE_ANALYTICS_ENDPOINT` | Optional backend batching endpoint for custom analytics. |
| `VITE_SW_EXPOSE_META` | Force SW config meta exposure in prod for diagnostics. |

Correlation Strategy:
- Client generates a single UUID trace id per session (lifetime = page lifecycle / soft navigation cluster).
- Added to every fetch as `x-trace-id` and included in AI event dimensions enabling KQL joins with backend logs.
- Recommended backend: echo header, log it, and set AI `operation_Id` or custom dimension to enable distributed trace grouping.

Sample KQL (Tuning & Diagnosis):

1. Web Vitals Percentiles (adjust alert thresholds):
```kusto
customEvents
| where name == 'perf_metric'
| extend metric=tostring(customDimensions.metric), value=toreal(customMeasurements.value)
| where metric in ('LCP','INP','CLS')
| summarize p50=percentile(value,50), p75=percentile(value,75), p90=percentile(value,90), p95=percentile(value,95) by metric
| order by metric asc
```
2. Fetch Dependency Failure Rate (exclude client aborts):
```kusto
let deps = customEvents | where name == 'fetch_dependency';
deps
| extend status=toint(customMeasurements.status)
| summarize total=count(), failures=countif(status >= 500 or status == 0) by bin(timestamp, 5m)
| extend failureRate = failures * 100.0 / max(total,1)
| order by timestamp desc
```
3. INP Distribution Bucketization:
```kusto
customEvents
| where name == 'perf_metric' and tostring(customDimensions.metric) == 'INP'
| extend v=toint(customMeasurements.value)
| summarize count() by bucket = case(v <= 200,'good', v <= 500,'ni','poor')
```
4. Correlate Client Fetch Failures with Server Exceptions (needs backend propagation):
```kusto
let client = customEvents
	| where name == 'fetch_dependency'
	| project traceId=tostring(customDimensions.traceId), clientTs=timestamp, url=tostring(customDimensions.url), status=toint(customMeasurements.status);
exceptions
	| extend traceId=tostring(customDimensions['x-trace-id'])
	| join kind=inner client on traceId
	| project clientTs, traceId, url, status, type, message
	| order by clientTs desc
```

Alert Threshold Tuning Workflow:
1. Run percentile query over last 7 days.
2. Target p75 thresholds to sit 10–15% above rolling median to avoid noisy flips.
3. Re-deploy alerts by updating `alerts.bicep` if sustained improvements permit tightening.
4. Observe SLO error budget consumption (future addition) before lowering aggressively.

Deploying Alerts & Workbook (Azure CLI examples):
```bash
# Acquire IDs
AI_ID=$(az monitor app-insights component show -g <rg> -a <aiName> --query id -o tsv)
AG_ID="/subscriptions/<sub>/resourceGroups/<rg>/providers/microsoft.insights/actionGroups/<actionGroupName>"

# Alerts
az deployment group create -g <rg> -f alerts.bicep -p appInsightsId="$AI_ID" actionGroupId="$AG_ID"

# Workbook (inline JSON compact)
az deployment group create -g <rg> -f workbook.bicep \
	-p workbookName="HAIC Observability" location="eastus" appInsightsId="$AI_ID" \
		 workbookContent="$(cat azure-workbook.json | jq -c .)"
```

Consent & Privacy:
- No telemetry leaves the browser until consent is granted (banner component).
- Pre-consent events are queued in-memory only (not persisted) and flushed retroactively on acceptance.
- Minimal metadata; opportunistic redaction of email-like strings in arbitrary fields.

Disabling / Hardening:
- Set `VITE_DISABLE_VITALS=true` to avoid capturing user-centric performance metrics.
- Omit AI env vars to run purely local analytics (useful for testing privacy posture).
- Adjust sampling via `VITE_APPINSIGHTS_SAMPLE`; for high-volume production consider 20–30% then raise during incident investigation.

Future Enhancements (Telemetry):
- Distributed trace propagation to backend OpenTelemetry spans.
- User timing mark aggregation for custom interaction instrumentation.
- Synthetic monitor ingestion panel in workbook.

---

## 🔢 Build Version & Reproducibility
Every build embeds a verifiable version object:

Sources of truth (all consistent):
1. `public/version.json` (served statically)  
2. `window.__APP_VERSION__` (attached early in runtime)  
3. `<meta name="x-app-version" content="<semver>+<shortSha>">`  
4. Generated module: `src/generated/appVersion.ts` for direct imports

Structure:
```jsonc
{
	"name": "web",
	"version": "0.1.0",        // from package.json (first public preview)
	"commit": "e598d45",       // short 12-char hash (build context)
	"fullCommit": "<40-char>",  // full git SHA
	"buildTime": "2025-09-28T22:27:51.995Z" // ISO 8601 UTC
}
```

Regeneration happens automatically inside `npm run build` via `scripts/generate-version.mjs`.
If you need to refresh locally (without full build):
```bash
npm run version:gen
```

### Integrity Hash (Tamper-Evident)
Each deploy and daily security audit generates a SHA-256 hash over the final `dist/index.html` and stores it in `version-integrity.json`:

```jsonc
{
	"file": "dist/index.html",
	"sha256": "<hex256>",
	"version": "<semver>",
	"commit": "<shortCommit>",
	"generatedAt": "<ISO-UTC>"
}
```

Surfacing & Logging:
1. Deploy Workflows append an entry to a long‑lived GitHub Issue titled `Deployment Transparency Log` (auto‑created if missing).
2. The hash appears in the GitHub Actions job summary for quick verification.
3. Daily security audit rebuilds and recomputes the hash, comparing it with the last committed version to flag unexpected drift.

Drift Meaning:
- Expected: hash changes when code / dependencies / build config change.
- Suspicious: hash changes without a corresponding commit explanation (investigate diff in built artifact, dependency tree, or build toolchain changes).

Manual Verification:
```bash
cd web
sha256sum dist/index.html  # or certutil -hashfile dist/index.html SHA256 (Windows)
cat dist/version-integrity.json | jq -r .sha256
```

Roadmap Enhancements (future):
- Optional signed transparency log (Sigstore / Rekor integration).
- Attestations referencing SBOM + integrity hash (in-toto style chain).
- Public CDN hash disclosure for independent monitors.

### Continuous Deployed Integrity Monitoring
An automated workflow (`deployed-integrity-check.yml`) runs hourly (and can be triggered manually) to fetch the deployed `index.html`, compute its SHA-256, and compare it to the committed baseline (`web/version-integrity.json`).

Script: `web/scripts/verify-deployed-integrity.mjs`

Direct usage examples:
```bash
# Baseline compare (uses committed web/version-integrity.json)
node web/scripts/verify-deployed-integrity.mjs --url https://www.humanaiconvention.com/ --json

# Force a local rebuild before comparison
node web/scripts/verify-deployed-integrity.mjs --url https://www.humanaiconvention.com/ --rebuild --json

# Save report to file with index preview
node web/scripts/verify-deployed-integrity.mjs --url https://www.humanaiconvention.com/ --json --out integrity-report.json --show-index
```

Exit codes:
- 0: success (match)
- 1: network / file error
- 2: mismatch

JSON report fields:
`schemaVersion, url, baselineSha256, remoteSha256, match, timestamp, mode, httpStatus, error, elapsedMs`

The GH Actions job uploads `integrity-report.json` artifact and fails the run if a mismatch is detected. This provides early warning of unexpected production drift (e.g., CDN mutation, untracked manual changes, or compromised artifact).

### Dual Integrity Predicate Versions (Transition: v1 ➜ v2)
The hourly workflow emits BOTH `@v1` and `@v2` integrity predicates (matrix build) during a managed migration window.

| Version | Predicate Type URL | Shape (core fields) | Notes |
|---------|--------------------|---------------------|-------|
| v1 | `https://humanaiconvention.com/attestation/integrity-report@v1` | `{ _type, subject[], timestamp, description, reportFields:{ match, baselineSha256, remoteSha256, url, elapsedMs, error } }` | Legacy structure. Flat `reportFields` bag. |
| v2 | `https://humanaiconvention.com/attestation/integrity-report@v2` | `{ _type, predicateVersion:"2.0", subject[], timestamp, description, report:{ status, hashes:{baseline,remote}, metrics:{elapsedMs}, url, error } }` | Normalized grouping + explicit semantic version. |

Reasons for v2 redesign:
1. Clarify semantics: distinct `status`, `hashes`, `metrics` domains.
2. Provide future-proof grouping for additional metrics (latency breakdown, transport integrity) without field collisions.
3. Add explicit `predicateVersion` field to support automated selection while keeping `_type` constant lineage.

Versioning Policy:
* Introduce new major predicate versions ONLY for structural / semantic breaking changes.
* Prefer additive optional fields inside an existing version.
* Maintain historical versions for audit; later policy may forbid new emissions of deprecated versions.

### Meta Predicate Aggregation
An additional meta-predicate (`https://humanaiconvention.com/attestation/meta-predicate@v1`) is emitted for the v1 lane that aggregates the SHA-256 digests of key predicates (integrity, sbom, fulcio-chain, provenance-lite). This allows consumers to retrieve a single attestation and verify referenced predicate digests without enumerating each individually.

Structure (simplified):
```jsonc
{
	"_type": "https://humanaiconvention.com/attestation/meta-predicate@v1",
	"timestamp": "<ISO-UTC>",
	"predicates": [
		{ "name": "integrity", "sha256": "..." },
		{ "name": "sbom", "sha256": "..." },
		{ "name": "fulcio-chain", "sha256": "..." },
		{ "name": "provenance-lite", "sha256": "..." }
	]
}
```
The out-of-band verification workflow cross-checks each referenced digest with freshly computed digests and exposes a `metaConsistent` flag in `verification-summary.json` plus the verification badge. A future v2 meta predicate may adopt a richer shape once integrity v2 fully replaces v1.

### SBOM Schema Enforcement
SBOMs are validated (both in the primary integrity workflow and in the out-of-band verification workflow) against a minimal CycloneDX subset schema (`.github/schemas/sbom-min.schema.json`). Rationale:
1. Early structural sanity (bomFormat/specVersion/components) without requiring full upstream schema hydration.
2. Fail-fast detection of truncated or malformed artifact uploads.
3. Keeps validation lightweight for hourly cadence.

If the SBOM fails schema validation, the integrity workflow fails and the verification badge will report failure (`schemaValid=false`). Trend CSV now tracks `sbomPresent` and `sbomSchemaValid` columns for longitudinal monitoring.

### Provenance Enrichment
`provenance-lite@v1` now records build tool context and parameters:
```jsonc
{
	"toolVersions": { "node": "<x.y.z>", "npm": "<a.b.c>", "cyclonedx": "<ver>" },
	"parameters": { "targetUrl": "https://www.humanaiconvention.com/", "predicateVersion": "v1,v2" },
	// existing minimal provenance fields ...
}
```
Purpose: reproducibility & traceability (ensuring identical toolchain versions can be reconstructed) and transparent mapping to target deployment URL plus active predicate version matrix.

#### SLSA-Style Additions
The provenance predicate has been extended with lightweight SLSA-aligned fields to improve downstream auditability without adopting the full SLSA v1 provenance envelope:

| Field | Purpose | SLSA Analogue |
|-------|---------|---------------|
| `invocation.parameters` | Inputs influencing the run (target URL, predicate version) | `invocation.parameters` |
| `invocation.environment` | Runtime context (runner OS, arch, git ref/SHA) | `invocation.environment` |
| `buildConfig` | Build orchestration identifiers (workflow, job) | `buildConfig` (custom mapping) |
| `completeness` | Declares which sections are fully captured (`parameters/materials/environment`) | `completeness` |
| `buildInvocationId` | Stable per-run build ID for correlation | `buildInvocationID` |
| `environment` | Flattened runner environment snapshot (dup convenience) | (subset of `invocation.environment`) |

Example excerpt:
```jsonc
{
	"buildInvocationId": "<runId>-v2",
	"invocation": {
		"parameters": { "targetUrl": "https://www.humanaiconvention.com/", "predicateVersion": "v2" },
		"environment": { "os": "Linux", "arch": "X64", "gitRef": "refs/heads/main", "gitSha": "<40-sha>" }
	},
	"buildConfig": { "workflow": "Deployed Integrity Check", "job": "integrity" },
	"completeness": { "parameters": true, "materials": true, "environment": true }
}
```
These fields enhance traceability (uniquely identifying a build invocation), reproducibility (documenting parameters and tool versions), and attest to completeness of captured context. Future work could emit a full SLSA provenance predicate while maintaining backward compatibility with the current `provenance-lite` structure.

### Verification Badge Semantics
`badges/verification-badge.json` drives the "Verification Health" shield. It turns bright green (`ok`) only when all predicate schemas (including SBOM) validate AND the meta predicate digest set matches the recomputed digests (`metaConsistent=true`). Any schema failure or digest mismatch flips the badge to red (`fail`).

### Trend CSV
Historical verification results are appended to `verification-trend.csv` on the `badges` branch with columns:
`timestamp,runId,image,schemaValid,metaConsistent,integV1Present,integV2Present,sbomPresent,sbomSchemaValid`

Consumers can ingest this for external monitoring, alerting, or graphing (e.g., percent success over time, SBOM availability rate). Future enhancements may add per-predicate latency / size metrics.

### JSON Schema Locations & Validation
Schemas live under `.github/schemas/`:
* `integrity-report-predicate.schema.json` — v1 integrity predicate.
* `integrity-report-predicate.v2.schema.json` — v2 integrity predicate.
* `fulcio-chain-predicate.schema.json` — Fulcio root+intermediate chain predicate.
* `provenance-lite-predicate.schema.json` — Lightweight provenance (with optional `sbomSha256`).

Validation is performed in‑pipeline with `ajv-cli@5.0.0`:
```bash
npx --yes ajv-cli@5.0.0 validate -s .github/schemas/integrity-report-predicate.v2.schema.json -d integrity-report.predicate.json
```
Logic: choose v2 schema when `PREDICATE_VERSION=v2`, else v1 schema. Chain & provenance schemas validate opportunistically (warn-only if missing) while integrity predicate validation is fail-fast.

### Predicate Policy Gate (Lifecycle Enforcement)
Policy job `policy-gate` inspects emitted artifacts every run and applies date‑based rules:

| Phase | Date (UTC) | Behavior |
|-------|------------|----------|
| Dual emission (current) | < 2025-11-01 | v2 optional (warning if absent), v1 allowed |
| Cutover | ≥ 2025-11-01 | v2 REQUIRED (error if missing) |
| Deprecation | ≥ 2026-02-01 | v1 FORBIDDEN (error if present) |

Config (edit via PR in workflow):
```yaml
env:
	CUTOFF_ENFORCE_V2: '2025-11-01'
	DEPRECATE_V1_AFTER: '2026-02-01'
```
Exit codes: `12` (missing required v2), `13` (lingering forbidden v1) to enable external monitors.

### Fulcio Chain Predicate Purpose
Type: `https://humanaiconvention.com/attestation/fulcio-chain@v1`

Captures the exact Fulcio root + intermediate certificate chain (concatenated PEM) hashed into the predicate `subject[0].digest.sha256`. Benefits:
1. Reproducible verification context if Fulcio rotates intermediates/root later.
2. Forensic ability to map historical attestations to the trust anchor state at signing time.
3. Defense against silent root replacement (paired with enforced root hash file `.github/fulcio-root.expected.json`).

### Provenance `sbomSha256` Cross-Link
Lightweight provenance predicate adds (when SBOM present):
* Field: `sbomSha256`
* Matching `materials[]` entry: `{uri: "sbom:cyclonedx", digest:{sha256:<same>}}`

Verification Checklist:
1. Integrity report predicate subject digest matches OCI image digest.
2. Provenance `materials` includes repository commit (sha1) and SBOM digest (sha256).
3. `sbomSha256` equals digest attested in SBOM predicate.
4. Fulcio chain predicate digest matches local concatenated chain used for verification.

### Updated Verification Examples (v1 + v2)
```bash
IMAGE_REF="ghcr.io/<org>/<repo>-integrity-report:<run_id>"
# v2 (preferred)
cosign verify-attestation \
	--type https://humanaiconvention.com/attestation/integrity-report@v2 \
	--certificate-oidc-issuer https://token.actions.githubusercontent.com \
	--certificate-identity-regexp '^https://github.com/<org>/<repo>/.github/workflows/deployed-integrity-check.yml@refs/heads/main$' \
	"$IMAGE_REF" | jq '.payload|@base64d|fromjson|.predicate.report.status'

# v1 (legacy)
cosign verify-attestation \
	--type https://humanaiconvention.com/attestation/integrity-report@v1 \
	--certificate-oidc-issuer https://token.actions.githubusercontent.com \
	--certificate-identity-regexp '^https://github.com/<org>/<repo>/.github/workflows/deployed-integrity-check.yml@refs/heads/main$' \
	"$IMAGE_REF" | jq '.payload|@base64d|fromjson|.predicate.reportFields.match'
```

Migration Guidance: switch consumers to v2 before the cutover date; after deprecation v1 emissions halt (historic artifacts remain valid for audit).

---

### Baseline & Reproducibility Gate
`web/version-integrity.json` (committed on successful deploy) forms the current baseline. Daily security audits:
- Rebuild the app, recompute the hash, and compare against the committed baseline.
- If the Git commit is unchanged but the hash differs, the job fails (non‑reproducible / drift signal).

### SBOM Attestation
Deploy pipeline emits `web/attestation.json` containing:
```jsonc
{ "commit": "<sha>", "time": "<UTC>", "integritySha256": "<index.html sha>", "sbomSha256": "<sbom.json sha>", "format": "cyclonedx-1.5" }
```
This links runtime artifact hash to the exact SBOM hash for provenance.

### Provenance (SLSA-lite in-toto Statement & Optional SLSA v1.0 Predicate)
`web/provenance.json` is generated post-build linking:
* Subject: `dist/index.html` (sha256 equals integrity hash)
* Dependencies: `sbom.json` + `attestation.json` digests
* Builder: workflow reference (URI with commit)
* Predicate Type: `https://slsa.dev/provenance/v1`

This minimal statement traces the build artifact to the exact SBOM + attestation without needing a full build graph expansion.

Provenance & Attestation References:
- Integrity Report Blob Signature: artifacts in workflow `deployed-integrity-check` (hourly)
- Attestation (predicate) tied to OCI image: `ghcr.io/<org>/<repo>-integrity-report:<run_id>`
- Transparency Log (digests): Issue labeled `integrity-attestation`

Suggested verification command (report blob):
```bash
cosign verify-blob \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp '^https://github.com/<org>/<repo>/.github/workflows/deployed-integrity-check.yml@refs/heads/main$' \
  --signature integrity-report.json.sig \
  integrity-report.json
```

Suggested verification command (attestation):
```bash
IMAGE_REF="ghcr.io/<org>/<repo>-integrity-report:<run_id>" # or digest form
cosign verify-attestation \
  --type https://humanaiconvention.com/attestation/integrity-report@v1 \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp '^https://github.com/<org>/<repo>/.github/workflows/deployed-integrity-check.yml@refs/heads/main$' \
  "$IMAGE_REF" | jq '.payloadType, (.payload|@base64d|fromjson|.predicate.reportFields.match)'
```

Freshness (prototype): artifact `attestation-freshness.json` contains
```jsonc
{ "lastAttestationUTC": "<ISO-UTC>", "match": true, "image": "ghcr.io/<org>/<repo>-integrity-report@sha256:...", "reportDigest": "<sha256>", "predicateDigest": "<sha256>" }
```
You can publish this JSON (e.g. via a gist or pages endpoint) and create a badge:
```
https://img.shields.io/endpoint?url=<raw-url-to-attestation-freshness.json>&label=integrity%20attestation
```

Optional (scaffolded): An official SLSA v1.0 predicate can be enabled via a future dedicated job when `GENERATE_SLSA_PREDICATE=true` (the workflow currently logs the subject hash as preparation).

### Fulcio Root Trust & Rotation Playbook
The workflow fetches the Fulcio root & intermediate chain each run and enforces the stored root hash in `.github/fulcio-root.expected.json`.

If the fetched root hash differs from the expected value the job:
1. Creates / updates an issue labeled `fulcio-root-rotation` (and `supply-chain`, `audit`).
2. Fails immediately (exit code 42) to prevent accepting an unreviewed trust anchor.

To approve a legitimate Fulcio rotation:
1. Obtain the new root via two independent channels (primary: `https://fulcio.sigstore.dev/api/v2/rootCert`; secondary: Sigstore release / security advisory).
2. Compute its SHA-256 locally: `sha256sum root.pem` (or `shasum -a 256 root.pem`).
3. Open a PR updating `sha256` in `.github/fulcio-root.expected.json` only (no unrelated changes) and reference the rotation issue.
4. Have at least one reviewer validate hash & source.
5. Merge; the next run will pass if the value matches.

Emergency Response (unexpected rotation / compromise suspected):
* Suspend downstream deployments referencing new certificates.
* Capture failing run artifacts (the chain) for forensics.
* Escalate according to internal incident playbook before updating expected hash.

### Predicate Version Negotiation
`PREDICATE_VERSION` environment variable drives the custom predicate type: `https://humanaiconvention.com/attestation/integrity-report@<version>`.
Schema currently supports `@v1`; a forward-looking `$defs.predicateV2` placeholder is included to allow additive evolution.

Upgrade Path (`v2` example):
1. Add concrete `predicateV2` structure & validation logic in schema.
2. Run workflow with matrix `[v1, v2]` producing dual attestations for a deprecation window.
3. Update verification consumers to accept both (regex or array of types).
4. After adoption, drop `v1` from production verification while preserving historical artifacts.

Decision Guidelines:
* Bump version only for breaking semantic changes (field renames / removals) or security-critical canonicalization changes.
* Prefer additive fields or nested extension objects to avoid churn.

### SBOM Attestation Verification
SBOM is attested separately with type `https://humanaiconvention.com/attestation/sbom@v1` bound to the same OCI image subject as the integrity predicate.

Manual verification:
```bash
IMAGE_REF="ghcr.io/<org>/<repo>-integrity-report:<run_id>"
cosign verify-attestation \
	--type https://humanaiconvention.com/attestation/sbom@v1 \
	--certificate-oidc-issuer https://token.actions.githubusercontent.com \
	--certificate-identity-regexp '^https://github.com/<org>/<repo>/.github/workflows/deployed-integrity-check.yml@refs/heads/main$' \
	"$IMAGE_REF" | jq '.payload|@base64d|fromjson|.predicate | {bomFormat,specVersion,componentsCount:(.components|length)}'
```

### Lightweight Provenance Attestation
Type: `https://humanaiconvention.com/attestation/provenance-lite@v1` linking builder metadata and repository commit to the same OCI subject.

Manual verification:
```bash
cosign verify-attestation \
	--type https://humanaiconvention.com/attestation/provenance-lite@v1 \
	--certificate-oidc-issuer https://token.actions.githubusercontent.com \
	--certificate-identity-regexp '^https://github.com/<org>/<repo>/.github/workflows/deployed-integrity-check.yml@refs/heads/main$' \
	"$IMAGE_REF" | jq '.payload|@base64d|fromjson|.predicate | {builder,materials,metadata}'
```

Cross-check:
* Ensure integrity report predicate subject digest == image digest.
* Ensure provenance materials digest matches HEAD commit & SBOM digest (if referenced in future expansion).

### Attestation Chain Integrity
All verification steps pass `--certificate-chain fulcio-chain/fulcio-chain.pem` ensuring the Fulcio root currently pinned remains the anchor.

If chain changes but root remains the same (intermediate rotation) the run will continue; if root changes, the enforced fail halts until manual approval.


### SLSA Predicate (Integrated & Signed)
The deploy job now generates `slsa-provenance.json` in‑line (after the lightweight provenance) and signs it together with all other artifacts. This predicate:
* Subject: `dist/index.html` (sha256 = integrity hash)
* Resolved dependencies: `sbom.json`, `attestation.json`, and internal `provenance.json` digest
* Is signed (signature, certificate, Rekor bundle) and pushed to GHCR as `slsa-provenance:<commit>` for remote verification.

Policy enforcement currently checks presence of signature triplets for: integrity, attestation, provenance, slsa-provenance, and optional sbom.

### SBOM Component & License Diff
`web/scripts/compare-sbom.mjs` now supports a `--license` flag and reports:
* Added / removed components
* Version changes (heuristic if purl missing)
* License changes (first license entry delta)
* Aggregate counts summarized including Δlic indicator when enabled

It runs in both deploy and daily security audit workflows, producing `sbom-diff.json` (non-blocking). This helps distinguish benign transitive bumps from larger dependency shifts before enforcement turns drift into a failure.

Example manual usage:
```bash
node web/scripts/compare-sbom.mjs \
	--current web/sbom/sbom.json \
	--baseline path/to/previous-sbom.json \
	--out sbom-diff.json
jq . sbom-diff.json
```

### Sigstore Policy & Lightweight Enforcement
Policy file: `.github/policies/sigstore-policy.yaml` (mode: audit) enumerates required signed artifacts.
Enforcement step in the deploy workflow performs a lightweight check ensuring each required artifact has `.sig`, `.cert`, and `.bundle`. This is a precursor to a future upgrade using a formal engine (`cosign policy verify` or admission controller) once external runtime contexts are introduced. Mode will move to `enforce` post‑stabilization (> 2025‑11).

### Signing, Rekor Inclusion Proofs, & OCI Publication
Deploy workflow steps:
1. Keyless Cosign signs `attestation.json`, `version-integrity.json`, `sbom.json` (if present), and `provenance.json`.
2. For each artifact we persist:
	- Detached signature: `*.sig`
	- Fulcio certificate: `*.cert`
	- Rekor bundle (inclusion proof + signed entry): `*.bundle`
3. Push JSON assets to GHCR as OCI refs:
	- `attestation:<commit>`
	- `integrity:<commit>`
	- `sbom:<commit>`
	- `provenance:<commit>`
4. CI verifies blobs (`cosign verify-blob`), validates bundle structure (LogID + InclusionProof), and then verifies OCI references (`cosign verify ghcr.io/...`).
5. Artifacts + signatures uploaded for offline validation.

Manual verification examples:
```bash
export COSIGN_EXPERIMENTAL=1

# 1. Verify blob signature
distHash=$(jq -r '.sha256' version-integrity.json)
cosign verify-blob --signature version-integrity.sig version-integrity.json

# 2. Inspect certificate (OIDC identity)
openssl x509 -in version-integrity.cert -noout -subject -issuer -dates

# 3. Check Rekor bundle inclusion fields
jq '.LogID, .Verification.InclusionProof.LogIndex, .IntegratedTime' version-integrity.bundle

# 4. Verify OCI reference (registry copy)
cosign verify ghcr.io/<org>/<repo>/integrity:<commit>

# 5. Retrieve provenance from registry
oras pull ghcr.io/<org>/<repo>/provenance:<commit>
jq . provenance.json | head
```

Identity-Constrained Verification:
The pipeline now enforces a narrowed identity anchored to the exact workflow path & branch:
```
--certificate-identity-regexp '^https://github.com/<org>/<repo>/.github/workflows/deployed-integrity-check.yml@refs/heads/main$'
--certificate-oidc-issuer https://token.actions.githubusercontent.com
```
This reduces blast radius vs a broad 'https://github.com/.+' pattern and prevents unrelated workflows from producing valid-looking signatures.

Hardening extensions (future):
* Rotate to tag-based invocation pattern (immutable workflow reference) via environment pinning.
* Add policy layer (e.g., `cosign policy` / Sigstore policy-controller if moving to Kubernetes).

### Deterministic Rebuild & SBOM Enforcement (Deploy + Daily Audit)
`verify` job rebuilds after deploy ensuring integrity hash matches the committed baseline.

SBOM Hash Policy (shared by deploy verify + daily security audit):
* Before enforcement date (`2025-10-15`): mismatch produces a warning (investigate transitive drift).
* On/After enforcement date: mismatch fails (strict reproducibility of dependency graph).

Daily security audit recomputes SBOM and compares against the committed baseline (`web/sbom/sbom.json` now included in deploy baseline commit); drift before enforcement is advisory, after enforcement is blocking.

Rationale: Gradual rollout minimizes false positives while dependency locking stabilizes.

Consumer example (React component):
```ts
import { APP_VERSION } from '@/generated/appVersion'
console.log(APP_VERSION.commit)
```

---

## 🔐 GitHub Actions Pinning Strategy
All workflows pin third‑party actions to immutable commit SHAs to eliminate supply‑chain drift.

Pattern:
```yaml
# Action Pin Table
# | Action | Version | Commit SHA |
# |-------|---------|------------|
# | actions/checkout | v5.0.0 | 08c6903c... |

steps:
	- uses: actions/checkout@08c6903c... # v5.0.0
```

Why:
- Reproducibility & audit trail
- Faster incident response (single table to diff)
- Prevents silent major updates

Refresh procedure:
1. List current pins (top of each workflow file).  
2. For each action, check upstream repo Releases / tags.  
3. Resolve the commit for the newest accepted major (we intentionally jump to latest stable major).  
4. Replace the SHA in `uses:` and update the table row (keep the old in git history—no separate changelog needed).  
5. Run a dry CI (push to a branch) and confirm no behavioral regressions.  
6. Merge with a commit message: `ci: refresh action pins`.

Never pin to moving tags (e.g. `@main`). Avoid unmaintained forks.

---

## 🛡️ Security Governance & Dependency Health

Automation Layers:
1. Daily Security Audit (`security-audit.yml`)
	- Runs `npm audit --omit=dev` and produces `audit.json`, `audit-summary.json`.
	- High / Critical vulnerabilities fail immediately (exit code 2).
	- Moderate vulnerabilities become failing after staged date `STAGE_MODERATE_FAIL_DATE` (currently 2025‑11‑01) to give remediation runway.
	- SARIF conversion scaffolded (local generation) to enable future upload integration.
2. Weekly Action Pin Refresh (`weekly-pin-refresh.yml`)
	- Opens / updates an Issue prompting review of upstream action releases.
3. SBOM Generation (`sbom.yml`)
	- Produces CycloneDX JSON & XML artifacts for provenance and downstream scanning.
4. Version Integrity
	- `vite` plugin inlines `<meta name="x-app-version" ...>` and assigns `window.__APP_VERSION__` at build time.
	- Verification script: `npm run verify:inline-version` ensures HTML meta matches `version.json` + commit, guard‑ing against tampering.

Remediation Flow:
1. Failing daily audit triggers an Issue comment or creation.
2. Triage severity & assess exploitability (public exploit? transient transitive?).
3. Prefer patch/minor bumps via Dependabot or manual `npm update --depth=0 <pkg>`.
4. For unavoidable major bumps, open a PR labeled `security-major` with a clear diff summary.

Escalation SLA Targets (guideline):
| Severity | Target Fix Window |
|----------|-------------------|
| Critical | < 24h |
| High     | < 72h |
| Moderate | < 14d (becomes enforced after stage date) |
| Low      | Opportunistic |

---

## 📏 Performance Budgets & Lighthouse Thresholds

Budgets file: `web/lighthouse-budgets.json`

Enforced in CI (`ci-full-backup.yml`):
1. Budgets: resource size & request count caps (HTML, JS, CSS, images, third‑party).
2. Category Thresholds (via `scripts/check-lighthouse-thresholds.mjs`):
	- Performance ≥ 90
	- Accessibility ≥ 95
	- Best Practices ≥ 95
	- SEO ≥ 90
	- (PWA optional – only if `MIN_LH_PWA` env set)

Failure Behavior:
* Any category below its floor → job fails.
* Budgets exceeded during Lighthouse run → Lighthouse step fails prior to threshold script.

Regressing Locally:
```bash
cd web
npm run lhci -- --budgetsPath=./lighthouse-budgets.json
node scripts/check-lighthouse-thresholds.mjs
```

Iteration Guidance:
1. Address largest JS bundles first (code splitting / tree shaking).
2. Optimize images (AVIF / WebP already leveraged; verify dimensions & compression).
3. Eliminate unused React code paths before raising thresholds further.

---

## 🧪 Local Development Quick Start
```bash
cd web
npm install
npm run dev
```

Optional validation before opening a PR:
```bash
npm run lint && npm run typecheck && npm test
npm run build
```


<!--
