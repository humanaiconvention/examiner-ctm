## Features
 - License-aware SBOM component diff with add/remove/version/license change tracking.
 - Lightweight Sigstore policy (audit mode) & verification step.
- Optional PR Preview Password Lock (client-side) for ephemeral deployments.

## Live Site & Verification

Live URL (pending DNS propagation): https://www.humanaiconvention.com/

Integrity & Provenance:
- Version JSON: https://www.humanaiconvention.com/version.json
- HTML Integrity (hash embedded in `version-integrity.json` once published)
- Attestation / Provenance OCI (retrieve via `oras pull ghcr.io/<owner>/<repo>/integrity:<commit>`)

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
 ### Deployment Pipeline Overview
 6. Policy Enforcement: A lightweight step evaluates the Sigstore policy (currently in audit mode) for required artifacts.
 7. SBOM Diff: Compares prior baseline to detect added/removed/version-changed components (and license changes) before proceeding.
8. Preview Protection (PR builds only): If configured, injects a minimal client-side password prompt into the built `index.html` for PR preview environments.
## Security & Supply Chain Hardening
 - SBOM license drift reporting.
 - Policy enforcement (audit mode) with Sigstore policy file.
- Optional preview password injection (non-cryptographic guard) to deter casual discovery of PR previews.
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

Optional (scaffolded): An official SLSA v1.0 predicate can be enabled via a future dedicated job when `GENERATE_SLSA_PREDICATE=true` (the workflow currently logs the subject hash as preparation).

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
The pipeline now enforces `cosign verify-blob` and `cosign verify` with:
```
--certificate-identity "https://github.com/<org>/<repo>/.github/workflows/deploy-unified.yml@refs/heads/main"
--certificate-oidc-issuer "https://token.actions.githubusercontent.com"
```
This binds trust to the specific GitHub Actions workflow on the main branch.

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
