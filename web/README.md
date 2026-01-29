# Web App (React + TypeScript + Vite)

This package (`web/`) is the front-end for HumanAI Convention. It is built with Vite + React + strict TypeScript settings and integrated into a supply‑chain hardened CI pipeline.

## Quick Navigation
* [Taglines](#taglines)
* [Explore / Convene Scaffold](#explore--convene-scaffold)
* [Temporary Access Gate](#temporary-access-gate-preview-only)
* [Developer Testing (`testConfig`)](#developer-testing--testconfig-override)
* [Badges / CI Artifacts](#badges-generated-in-ci)
* [Key Scripts](#key-scripts)
* [Quality Gating](#quality-gating)
* [Preview Password Protection](#preview-password-protection)
* [Integrity & Attestations](#integrity--attestations)
* [Analytics & Telemetry](#analytics--telemetry)
* [Application Insights](#application-insights-integration-optional)
* [Performance Metrics](#new-performance-action-perf_metric)
* [Consent Banner](#consent-banner)
* [Debug Overlay](#debug-overlay)
* [Testing & Coverage](#testing--coverage)
* [CI / Quality Gates](#ci--quality-gates)
* [CSP Generation](#environment-specific-csp-generation)
* [Chunk Load Boundary](#chunk-load-boundary)
* [Owner Login (Single User Auth)](#owner-login-single-user-auth)
* [Session Rotation & Binding](#session-rotation--binding)
* [Accessibility & Automated A11y](#accessibility--automated-a11y)
* [Visual Regression & Storybook](#visual-regression--storybook)
* [Custom Type Augmentation (jest-axe + Vitest)](#custom-type-augmentation-jest-axe--vitest)
* [Main Page Enhancements (Hero, Integrity, Performance)](#main-page-enhancements-hero-integrity-performance)
* [Preview Questions Submission](#preview-questions-submission)
* [Dual-Question Intro Gate](#dual-question-intro-gate)
* [Intro Gate Analytics Stages](#intro-gate-analytics-stages)

## Taglines
Primary (hero): We will know — together.  
Secondary (lede): Trust isn’t a feeling. It’s evidence.

The dual-question intro now also includes a keyboard-accessible "Skip" button allowing users to bypass the staged prompts instantly. Skipping:

* Immediately records `intro_impression` (stage: `skip_click`).
* Fires `intro_completed` with `metadata.skip=true` (and includes full elapsed `durationMs` up to skip).
* Persists completion flag (`hq:introComplete`) so subsequent visits suppress the gate.
* Leaves the existing "Answer here" CTA behavior unchanged for users who engage.

Accessibility / UX notes:
* Skip button is always present (CTA appears after timing; reduced motion path shows both with minimal delay).
* Focus order respects DOM order (Answer, then Skip) once CTA visible; before CTA, Skip alone is focused.
* Visual style is intentionally low-emphasis (outlined) to encourage reading while honoring fast-path intent.

## Main Page Enhancements (Hero, Integrity, Performance)

Recent improvements focused on first‑paint performance, accessibility semantics, and transparency surface readiness.

### Summary
| Area | Change | Rationale |
|------|--------|-----------|
| Hero Landmark | Added `role="banner"` + `aria-labelledby` referencing the H1 | Clear page landmark for assistive tech |
| Logo | Added accessible title + refined container `aria-label` | Voice narration clarity |
| CTA Group | Wrapped primary actions in a `<nav aria-label="Primary calls to action">` | Landmark navigation / quick jump |
| Quotes (Voices) | IntersectionObserver + idle + scroll fallback; `<noscript>` fallback text | Deterministic early load trigger & graceful degradation |
| Integrity KPIs | Converted list to semantic `<dl>` with `<dt>/<dd>` pairs | Proper term/value semantics for screen readers |
| KPI Loading | Replaced placeholder dashes with animated shimmer skeleton (`.kpi-skel`) | Perceived performance & clarity of loading state |
| Critical CSS | Extracted minimal hero layout to inline `<style data-critical="hero">` | Faster FCP / reduced render‑blocking CSS |
| Reduced Motion | Ensured logo animation disables cleanly when user prefers reduced motion | Accessibility compliance |

### Critical Hero CSS Strategy
The inline block (`critical/hero.css.ts`) contains only the rules required for a stable hero first paint (layout, typography, essential backgrounds, CTA baseline). Heavy shadows and animation keyframes are intentionally deferred to the full stylesheet to keep bytes small.

Upgrade path:
1. Validate visual parity across target browsers.
2. (Optional) Remove duplicated hero rules from `App.css` once confident.
3. Consider `media="print"` swap pattern for non‑critical stylesheet in future if further FCP improvements needed.

### Testing Additions
`__tests__/mainPageAccessibility.test.tsx` asserts:
* Presence of banner role and H1.
* Integrity KPIs rendered as a definition list.
* Skeleton placeholders appear before data load.
* Quote spotlight placeholder present prior to lazy import resolution.

### Future Opportunities
* Inline small subset of typography vars in HTML to reduce dependency on base CSS for hero render.
* Preload hero background image with `as="image"` and appropriate `fetchpriority` once stable.
* Add CLS & LCP field metrics comparison pre/post critical extraction (analytics event already scaffolded via `trackHeroPaint`).

These changes advance initial transparency goals while tightening the perceptual performance envelope for first meaningful paint.

## Temporary Access Gate (Preview Only)

## Explore / Convene Scaffold
An initial placeholder route (`/explore`) establishes the future "Convene" dashboard surface. Current goals:

* Reuse preserved introductory question prompts for future contextual modules (research share, integrity evidence explorer, collaboration signals).
* Provide a stable navigation target for hero CTA ("Explore now").
* Serve as an integration point for upcoming modular panels (metrics, attestations, provenance diffs, session timeline, consent state, analytics debug shortcuts).

Implementation notes:
* `src/pages/Explore.tsx` renders a lightweight scaffold with headings and TODO markers—intentionally minimal to avoid premature architectural lock-in.
* Route is registered in `App.tsx`; the password gate (if enabled) still wraps the entire app so gated previews protect the Explore surface equally.
* No data fetching yet—keeps bundle delta negligible (<1 KB gz) until real panels land.

Planned evolution (non-breaking roadmap):
1. Introduce a left-edge modular nav (collapsible) once at least two functional panels exist.
2. Add provenance & integrity diff panel (consuming existing integrity hashing endpoint) with drill‑down semantics.
3. Integrate analytics debug overlay as an opt-in panel rather than floating button (maintain legacy toggle for dev ergonomics during transition).
4. Add collaboration primitives (ephemeral share link generation, optional presence beacons) gated behind explicit consent + feature flag.
5. Gradually extract shared layout primitives into `src/layout/` when duplication emerges (avoid speculative abstraction today).

Testing guidance:
* Until dynamic modules ship, unit tests only need to confirm route mounting and basic landmark presence.
* Future panel additions should include: accessibility landmark assertions, lazy chunk load assertions (dynamic `import()` boundaries), and integrity of analytics emissions when user interactions occur.

Security / privacy stance:
* Avoid prefetching any future panel data until user explicitly navigates to that panel (principle of least surprise & network minimization).
* All forthcoming collaborative features must route through existing consent gating system; no implicit telemetry expansion.

This section will be updated as panels graduate from prototype to stable.
\

## Chunk Load Boundary
`<ChunkLoadBoundary>` standardizes how lazy-loaded route or panel chunks present loading state:

Benefits:
* Accessible: uses `role="status"` + `aria-live="polite"` for non‑intrusive announcements.
* Consistent visual skeleton (pulse animation + gradient) across all future modular dashboard panels.
* Central label override (`label` prop) for context-specific messaging (e.g. "Loading insight panel").
* Optional `fallback` prop allows bespoke placeholder when a panel has richer skeleton needs.
* `aria-busy` applied to wrapper (toggle with `busyWrapper={false}`) enabling assistive tech to defer interactions until content hydration.

Usage (routing example):
```tsx
// main.tsx
<BrowserRouter>
  <ChunkLoadBoundary label="Loading page">
    <Routes>
      <Route path="/explore" element={<Explore />} />
    </Routes>
  </ChunkLoadBoundary>
</BrowserRouter>
```

Panel usage (future modular dashboard panel):
```tsx
<ChunkLoadBoundary label="Loading integrity diff">
  <IntegrityDiffPanel />
</ChunkLoadBoundary>
```

Testing guidance:
* Assert `getByRole('status', { name: /loading module/i })` (default) or custom label before resolution.
* Use a lazy component with a microtask / timeout to simulate boundary transition.

Performance note:
* Boundary itself is negligible; skeleton styles reuse existing gradient tokens. Avoid heavy logic inside fallback—keep it static to allow fast paint.

Customization roadmap:
* Potential addition of reduced‑motion preference adaptation (swap pulse for subtle opacity shift) when we expand panel variety.
* Optional metrics hook to emit `chunk_loaded` analytics event with timing metadata.

Source: `src/components/ChunkLoadBoundary.tsx`

## Owner Login (Single User Auth)
Lightweight cryptographically signed login for the sole owner (Option 1). Replaces (or bypasses) the preview password gate once authenticated.

### Flow
1. Generate a one-time login link: `node web/scripts/gen-owner-link.mjs --base=http://localhost:5060`.
2. Open the printed `/login?token=...` URL in the browser within the token TTL (default 600s).
3. Server validates HMAC signature & expiry, then issues an `owner_session` cookie (HttpOnly, SameSite=Strict, optional Secure when HTTPS).
4. Frontend `useSession` hook (`src/hooks/useSession.ts`) polls `/session` once (no interval by default) to determine authenticated state.
5. `PasswordGate` short-circuits when `session.authenticated === true`.

### Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/login?token=...` | GET | Exchanges time-bounded login token for session cookie |
| `/session` | GET | Returns `{ authenticated: boolean, email? }` |
| `/logout` | GET | Clears session cookie then redirects `/` |

### Environment Variables
| Var | Meaning | Example |
|-----|---------|---------|
| `OWNER_EMAIL` | Allowed owner principal | `ben@humanaiconvention.com` |
| `SESSION_SIGNING_SECRET` | HMAC-SHA256 secret (keep private) | `d3f5...` (64 hex) |
| `SESSION_MAX_AGE_SECONDS` | Session lifetime | `86400` |
| `LOGIN_TOKEN_TTL_SECONDS` | One-time login token lifetime | `600` |

### Security Notes
* HMAC signing (HS256) with constant-time signature comparison.
* Separate purposes: `owner-login` for one-time token, `owner-session` for cookie.
* Session cookie does not expose payload (signed token still, but do not rely on secrecy; treat as bearer capability).
* No refresh endpoint—regenerate link when session expires (intentional minimalism).
* Add HTTPS (`--https` or `HTTPS=1`) so cookie gains `Secure`.

### Future Hardening (Optional)
* Bind session to a UA hash + /24 IP (defense-in-depth; may disrupt roaming).
* Track token jti (ID) to revoke replay if you later store a blacklist.
* Rotate `SESSION_SIGNING_SECRET` via dual-secret grace period.

## Session Rotation & Binding

The session system supports fast, global invalidation (epoch rotation) and optional lightweight context binding (user‑agent hash + short IP prefix). These controls are intentionally minimal—no DB, no stateful token store—yet provide practical defense-in-depth against stale or replayed bearer tokens.

### Epoch Rotation
An integer epoch is stored at `web/.auth/session-epoch.json`:
```jsonc
{ "epoch": 3 }
```
Every issued session token includes `ep=<currentEpoch>`. Validation rejects tokens where `ep !== currentEpoch` (unless legacy tokens without the `ep` claim are encountered—those are treated as epoch 0).

Rotate (invalidate all active sessions) with:
```bash
node web/scripts/rotate-session.mjs
```
This increments the epoch file atomically. All existing session cookies immediately fail validation; you must generate a new login link to establish a fresh session.

Use cases:
* Lost/stolen device suspected.
* Accidentally exposed session cookie in logs or screenshots.
* Periodic hygiene (e.g. monthly rotation) without changing the HMAC secret.

### UA + IP Binding
When a session is issued the server records:
* `ua`: A non‑cryptographic hash of the `User-Agent` string (stabilizes across token length while changing on major agent shifts).
* `ip`: The remote IP (validation compares only the first 3 octets – /24 style network prefix for IPv4; IPv6 binding is currently a no‑op beyond raw string prefix splitting).

Validation steps (in order):
1. Token signature + expiry.
2. Purpose must be `owner-session`.
3. Epoch equality (if token had `ep`).
4. UA hash equality (if token had `ua`).
5. Network prefix equality (if token had `ip`).

If any bound attribute mismatches, the server responds unauthenticated and the frontend hook clears privileged UI. Older tokens created prior to adding these claims simply omit them; validation skips missing attributes for backward compatibility.

### Caveats
* IP prefix binding can cause logouts when moving between networks (home → mobile hotspot). If this becomes disruptive you can remove or relax the prefix logic in `scripts/session-util.mjs`.
* User-Agent spoofing remains trivial; the hash is a low-friction heuristic, not a fingerprinting attempt.
* Epoch file should be part of your backup ignores; it is ephemeral operational state. Do not commit rotations unless intentionally versioning state.
* Rotation does not change cryptographic strength—keep `SESSION_SIGNING_SECRET` long and random (≥32 bytes raw / 64 hex chars recommended).

### Frontend Surfacing
The `AuthBanner` component (fixed top-right) shows the authenticated email and a logout link when a valid session is active. Minimal footprint (<0.3 KB gz) and intentionally absent when unauthenticated or still loading to avoid layout shift.

### Testing Guidance
`useSession.rotation.test.tsx` simulates epoch rotation and UA/IP mismatch by sequencing mock `/session` responses. Integration/E2E tests can trigger `rotate-session.mjs` between authenticated actions to assert forced logout behavior.

### Operational Tips
* Automate scheduled rotation via a cron or CI job calling the script on a cadence appropriate for your threat model.
* After rotation, immediately attempt an authenticated action in an older tab to confirm invalidation.
* For secret rotation: first rotate epoch (flush active sessions), then deploy with new secret. Optionally support dual-secret verify during the switchover window if you later extend the utility.


### Frontend Usage
The existing `PasswordGate` requires no changes—once session cookie is valid it renders children directly. To detect auth state elsewhere:
```ts
import { useSession } from './hooks/useSession';
const { authenticated, email } = useSession();
```
Avoid rendering privileged tooling until `authenticated` is true.

An optional password gate can restrict access beyond the intro prompt:

1. Set `VITE_ACCESS_PASSWORD` for a plain-text comparison (dev/previews only) OR set `VITE_ACCESS_PASSWORD_HASH` to a SHA-256 hex of the password (preferred).
2. Build/start. Users must enter the password once per browser; success stored in `localStorage` under `haic:pw-unlock:<hash>`.
3. To generate a hash:
```bash
node scripts/generate-password-hash.mjs "your password"
```

Security note: This is a UX gate—NOT cryptographic protection. Do not rely on it for safeguarding sensitive data; all bundle assets remain publicly fetchable if deployed. Suitable only for light preview friction.

## Accessibility & Automated A11y

We combine manual semantics enforcement with automated checks:

| Layer | Tooling / Technique | Purpose |
|-------|---------------------|---------|
| Unit (jsdom) | `jest-axe` via Vitest | Fast feedback on common WCAG issues for isolated components |
| E2E | Playwright + `@axe-core/playwright` | Page-level / real rendering context issues not surfaced in jsdom |
| Manual patterns | Proper landmark roles, focus management, accessible names | Prevent whole categories of violations from emerging |

### Current Coverage
`PreLogoSequence` has: dialog semantics (`role="dialog"`, `aria-modal`, `aria-labelledby`), button labeling, live-region containment minimized.

### Adding A11y Tests (Unit)
1. Import the component and render with Testing Library.
2. Query the smallest relevant subtree (e.g. dialog element) instead of the entire `container` to reduce axe runtime.
3. Run `axe(subtree, { rules: { 'color-contrast': { enabled: false } } })` for speed / to avoid false positives in jsdom.

### Playwright A11y Sweep
Use `npm run test:a11y` to execute the axe sweep on full pages (contrast enabled there). Failures should prefer code fixes over rule disabling. If you must disable a rule, document the rationale in a comment referencing the WCAG criterion.

### Accessible Names & Dialogs
After integrating axe we added `aria-labelledby` to the intro dialog because `role="dialog"` without an accessible name triggers `aria-dialog-name`. Future dialogs should follow the same pattern (or provide `aria-label`).

### Performance Tips
* Scope axe to smallest subtree.
* Disable only rules that are noisy in jsdom (e.g. `color-contrast`). Keep the full rule set in Playwright.
* Keep fake timers away from axe runs (use real timers) to avoid MutationObserver sync issues.

## Visual Regression & Storybook

Storybook + Chromatic establish the visual baseline for component states.

| Command | Action |
|---------|--------|
| `npm run storybook` | Local Storybook dev (webpack5 builder) |
| `npm run build:storybook` | Static Storybook build (outputs `storybook-static/`) |
| `npm run chromatic` | Publish build to Chromatic (requires `CHROMATIC_PROJECT_TOKEN`) |
| `npm run test:visual` | Playwright visual snapshots (component/page level) |

### Workflow
1. Create or update a story (e.g. `src/components/PreLogoSequence.stories.tsx`).
2. Run `npm run storybook` and verify the component states.
3. Commit. In CI (or locally with token) run `npm run chromatic` to upload and diff.
4. For interactions not easily expressed in static stories, add a Playwright visual test. Use `npm run test:visual` to update snapshots (`PLAYWRIGHT_UPDATE_SNAPSHOTS=1` for intentional changes).

### Choosing Between Approaches
| Scenario | Prefer |
|----------|-------|
| Pure presentational component variants | Chromatic story |
| State transitions / animations requiring scripting | Playwright visual test |
| Layout regressions spanning composed components | Playwright page snapshot |

### Snapshot Hygiene
Small, focused snapshots minimize churn. Avoid snapshotting entire pages unless you specifically want a layout diff. Revisit and prune unused stories periodically to keep build times low.

## Custom Type Augmentation (jest-axe + Vitest)

We added custom matcher + module declarations to integrate `jest-axe` cleanly with Vitest.

### Why a Custom Declaration?
`jest-axe` exports Jest matchers; Vitest is Jest-compatible but its type surface differs. We provide ambient declarations so TypeScript recognizes `toHaveNoViolations()` on Vitest's `expect`.

### Structure
`src/types/global.d.ts` contains:
* Ambient module for `jest-axe` (axe function + config signature)
* Matcher augmentation for `vitest` namespace

An additional minimal ambient module file `src/types/ambient-jest-axe.d.ts` exists to bypass package `exports` resolution quirks; these can be merged later if the upstream package alters typings.

### tsconfig Strategy
`tsconfig.app.json` sets:
```jsonc
{
  "compilerOptions": {
    "typeRoots": ["./src/types", "./node_modules/@types"],
    "types": ["vite/client"]
  }
}
```
This ensures our ambient declarations are discovered without needing per-test reference directives.

### Matcher Registration
`vitest.setup.ts` imports `toHaveNoViolations` and calls `expect.extend(toHaveNoViolations as any)` (jest-axe already returns the shape expected by Jest’s extend system). The cast suppresses minor signature divergences.

### Adding More Custom Matchers
1. Create or update an ambient declaration file under `src/types`.
2. Extend `expect` in `vitest.setup.ts`.
3. Keep declarations narrowly scoped—avoid polluting the global namespace with unrelated helpers.

### Troubleshooting
| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `Property 'toHaveNoViolations' does not exist on type 'Assertion'` | Declaration file not picked up | Ensure file is inside `src/types` and `typeRoots` includes it. |
| `expectAssertion.call is not a function` | Incorrect matcher extension object | Pass matcher object directly (not wrapped) to `expect.extend`. |
| Axe test timeouts | Fake timers interfering or scanning too large a subtree | Use real timers; narrow the Node passed to `axe()`. |

### Future Simplification
If `jest-axe` publishes Vitest-aware types, we can delete the ambient declarations and the workaround file, retaining only matcher registration.


### Developer: Testing & `testConfig` Override

The `PasswordGate` component supports a `testConfig` prop (not intended for production) that lets tests deterministically exercise gating states without mutating `import.meta.env` between module loads.

```tsx
// Example in a Vitest/Jest test
import PasswordGate from '../components/PasswordGate';

// Plain password scenario
render(
  <PasswordGate testConfig={{ password: 'secret' }}>
    <AppContent />
  </PasswordGate>
);

// Hash scenario (sha-256 of 'open-sesame')
render(
  <PasswordGate testConfig={{ hash: 'a0d4…<256-bit-hex>…' }}>
    <AppContent />
  </PasswordGate>
);
```

Behavior precedence:
1. If `testConfig.password` provided it is used for direct comparison.
2. Else if `testConfig.hash` provided it compares the SHA-256 of entered text to that hash (case-insensitive hex).
3. Else it falls back to runtime `import.meta.env` values (`VITE_ACCESS_PASSWORD`, `VITE_ACCESS_PASSWORD_HASH`).

Why this exists: Changing `import.meta.env` after a module is imported is brittle (Vite inlines env vars at build time). The earlier approach attempted dynamic re-imports with query strings; the prop-based injection is simpler, explicit, and type-safe. Production bundles should never pass `testConfig`—leaving it undefined retains normal env-driven behavior.

The unlock flag remains `localStorage`-scoped to a composite key `haic:pw-unlock:<hash-or-plain>` so test runs start clean by clearing localStorage in `beforeEach`.

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
| `node scripts/analytics-size-check.mjs` | Enforce analytics chunk size budgets (gzip + brotli, ratchet, markdown/json artifacts). |

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
| Config drift | `config/drift` | Fired only when hash changes |
| Web Vitals | `perf_metric` | Each metric sent as event + metric (name=value) |
| Fetch dependency | `fetch_dependency` | Lightweight wrapper around `window.fetch` capturing method, status/error & duration |

Sampling defaults to 50% but can be overridden using `VITE_APPINSIGHTS_SAMPLE` (0–100). Set `VITE_DISABLE_VITALS=true` to suppress Web Vitals collection entirely (privacy / perf isolation mode). When vitals are disabled no events with action `perf_metric` sourced from Web Vitals will be emitted, but you can still emit your own custom perf metrics if desired.

### Dev Drift Mutation Harness (Testing Only)

In non-production builds a lightweight harness is exposed on `window` to deterministically simulate configuration drift for E2E tests without rebuilding:

| Global | Signature | Effect |
|--------|-----------|--------|
| `__testMutatePreviewQuestionsConfig` | `(patch: Record<string,unknown>) => string` | Shallow merges preview questions config with `patch`, recomputes hash, emits `config/drift` (`label=preview_questions`) if changed, updates meta tags, returns new hash. |
| `__testMutateSwConfig` | `(patch: Record<string,unknown>) => string` | Shallow merges exposed SW config subset, recomputes hash, emits `config/drift` (`label=sw_config`) if changed, updates meta tags, returns new hash. |

Both functions also tag drift metadata with `harness: true` so downstream dashboards can filter out synthetic events if desired. They are no-ops (undefined) in production bundles.

Example (Playwright page context):
```ts
const initial = await page.getAttribute('meta[name="x-preview-questions-config-hash"]','content');
const next = await page.evaluate(() => window.__testMutatePreviewQuestionsConfig?.({ maxPerHour: 999 }));
expect(next).not.toBe(initial);
```

Avoid using these harness functions in application runtime code; they are exclusively for automated drift verification.

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

### Analytics Chunk Size Budgets & Ratchet

We enforce per‑chunk budgets for the modular analytics layer. Budgets live in `web/analytics-budgets.json` (validated by a local JSON Schema `analytics-budgets.schema.json`). Each chunk entry supports:

| Field | Required | Meaning |
|-------|----------|---------|
| `gzipKB` | Yes | Max allowed gzipped size (KB). |
| `brotliKB` | No | Optional Brotli cap; enforced only when present and brotli support available. |
| `floorKB` | No | Minimum floor during automatic ratcheting (prevents over-tightening). |
| `locked` | No | If true, ratchet logic skips reductions for this chunk. |
| `meta` | No | Free-form note.

Schema reference is declared via `$schema` in the budgets file for editor validation (some linters may warn—safe to ignore).

Script: `node scripts/analytics-size-check.mjs` (normally invoked post-build). It outputs:
* Console table (gzip + optional brotli sizes / limits / headroom)
* JSON artifact: `dist/analysis/analytics-size-report.json` (or custom via `--json-out`)
  * Fields: `generated`, `previousSnapshotTs`, `sparklineWindow`, explicit `deltas` map, `schema` block (mode/strict/errors), lightweight `history.entries` count, plus `budgets` + `ratchet` state
  * Validated optionally by `analytics-size-report.schema.json` (drop `"$schema": "./analytics-size-report.schema.json"` at the top of the artifact if you want editor validation during local inspection)
* Markdown artifact: `dist/analysis/analytics-size-report.md` (PR-friendly table incl. ✅ / ❌ status emojis)
* Maintains stability counter: `.analytics-size-state.json`
* (Optional) Ratchet state: `.analytics-size-ratchet.json`

#### CLI Flags
| Flag | Purpose |
|------|---------|
| `--max-<chunk>=KB` | Override gzip budget for a specific chunk (temporary / CI experiment). |
| `--write-baseline` | Rewrite budgets file to current observed sizes (after stable runs). |
| `--stable-runs=N` | Require N consecutive passing runs before baseline write. |
| `--force` | Force baseline write even if stability requirement not met. |
| `--slack-webhook=<url>` | Override / supply Slack webhook URL (else env `SLACK_WEBHOOK_URL`). |
| `--no-brotli` | Skip brotli measurement even if available. |
| `--ratchet-after=N` | Apply automatic budget reduction after N improving runs. |
| `--ratchet-percent=P` | Percent reduction applied on ratchet (e.g. 5 = 5%). |
| `--headroom-threshold=K` | Minimum per-chunk headroom (KB) to count a run as improving. |
| `--min-floor=K` | Global minimum floor (KB) any budget can be reduced to. |
| `--ratchet-cooldown=N` | Require N improving cycles after a reduction before the next ratchet can apply (prevents rapid successive tightening). |
| `--schema-mode=off|warn|fail` | Validate budgets JSON against local schema; `warn` logs issues, `fail` exits non‑zero on violations. |
| `--schema-strict` | Additionally fail/warn when unknown chunk keys appear (enforces canonical chunk set). |
| `--update-missing-brotli` | Auto-populate missing `brotliKB` entries with current measured size (also sets/adjusts `floorKB` if needed). |
| `--pr-comment` | Attempt to post the Markdown report as a GitHub PR comment (requires `GITHUB_TOKEN` + repo/PR context). |
| `--pr-number=N` | Explicit PR number override (if detection from `GITHUB_REF` not possible). |
| `--history-window=N` | Override sparkline window length (default 12) for the trend column. |
| `--json-out=path` | Write JSON artifact to custom path (relative or absolute). Default remains `dist/analysis/analytics-size-report.json`. |
| `--chunks=core,engagement,perf,errors` | Comma‑separated dynamic chunk list (supports future expansion). Budgets entries auto‑stubbed if missing. Interacts with `--schema-strict` for canonical enforcement. |

Improving run: all chunks meet current budgets AND each has headroom ≥ threshold (for gzip and brotli if present). After `--ratchet-after` consecutive improving runs the script reduces budgets by `ratchet-percent` (multiplicative) while respecting:
* Per-chunk `floorKB`
* Global `--min-floor`
* `locked` flag
* Cooldown: When `--ratchet-cooldown` is supplied, after a reduction the script requires that many improving cycles before another reduction is considered. This steadies budget tightening and reduces noise in PR history.

The budgets file gains an updated `notes` field noting ratchet application. The ratchet streak then resets.

Example (CI step):
```
node web/scripts/analytics-size-check.mjs --ratchet-after=5 --ratchet-percent=5 --headroom-threshold=0.5 --min-floor=3
```

To establish a fresh baseline after a refactor:
```
node web/scripts/analytics-size-check.mjs --stable-runs=3 --write-baseline
```

#### Workflow Integration Tips
1. Run after production build (so chunk filenames are final hashed outputs).
2. Upload both JSON + Markdown artifacts; the Markdown table includes emoji status (✅ pass / ❌ fail) and can be posted as a PR comment (or let the script post automatically with `--pr-comment`).
3. Consider gating deploy on failures (non-zero exit when any chunk exceeds a limit).
4. Slack alert triggers automatically on regression when webhook configured.
5. History file `.analytics-size-history.json` stores up to 200 snapshots used to render sparklines (last 12 points) in the Markdown report for trend visibility.
6. Enable schema validation in CI with `--schema-mode=fail` to catch accidental field/structure drift early.

#### Future Enhancements (Roadmap)
* Adaptive ratchet percent scaling (smaller % as budgets shrink further).
* Extended asset class budgets (CSS critical vs non-critical separation).
* Optional HTML badge summarizing current utilization.
* Budget diff annotation lines (showing delta since last ratchet) in Markdown.

Rationale: Continuous slight pressure on non-critical analytics bytes preserves performance headroom for core product features without requiring manual recalibration.

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

## Preview Questions Submission
## Dual-Question Intro Gate

The legacy single-prompt intro (`PreLogoSequence`) has been replaced by a dual‑question animated gate to establish conceptual focus before first paint of the main hero.

Sequence (default timings):

| Stage | Copy | Duration |
|-------|------|----------|
| Q1 visible | “What is consciousness?” | 5000 ms |
| Crossfade (Q1 → Q2) | overlap fade | 1000 ms |
| Q2 dwell | “How is it defined?” | 2500 ms (before CTA appears) |
| CTA visible | “Answer here” button | persists until user proceeds |
| Exit fade | Overlay dismiss | 600 ms |

Implementation: `src/components/PreviewIntroGate.tsx` (CSS in `src/previewIntro.css`).

Accessibility & UX:
* Uses `role="dialog"` + `aria-modal="true"` and a single heading (`h1`).
* Crossfade keeps both questions in the DOM for assistive tech continuity (non-active question `aria-hidden`).
* Respects `prefers-reduced-motion`: skips animation, shows second question & CTA immediately.
* Keyboard: `Enter` / `Space` triggers proceed once CTA is present.
* Local persistence: sets `localStorage['hq:introComplete'] = 'true'` after completion; gate will not replay unless cleared.

Analytics Events (consolidated):
* `intro_impression` stages: `q1_show`, `transition_start`, `q2_show`, `skip_click`
* `intro_completed` metadata: `durationMs`, `questionsShown`, `skip`, `morphLatencyMs`

Customization:
* Adjust timings at top of `PreviewIntroGate.tsx` constants: `FIRST_QUESTION_VISIBLE_MS`, `INTER_QUESTION_FADE_MS`, `SECOND_QUESTION_BEFORE_CTA_MS`, `EXIT_FADE_MS`.
* Button label can be changed by editing the `Answer here` text inside the component (search for `preview-intro__cta`).
* To bypass during development, manually set the localStorage key to `true` or introduce a query flag (future enhancement suggestion: support `?noIntro=1`).

Removal of Legacy Component:
* `PreLogoSequence` and related Storybook/test artifacts have been removed to reduce bundle size; only the new gate remains.

Testing:
* `PreviewIntroGate.test.tsx` uses fake timers to advance through phases and assert CTA appearance & completion callback.
* Ensure wrapping `vi.advanceTimersByTime()` calls with `act()` to avoid React scheduling warnings (already implemented).

## Intro Gate Analytics Stages

The intro gate emits a minimized set of events to reduce telemetry noise while preserving key UX timing insights.

`intro_impression` stages:
| Stage | Description | Extra Metadata |
|-------|-------------|----------------|
| `q1_show` | First question displayed | `index:0`, `text` |
| `transition_start` | Crossfade begins (Q1→Q2) | `from:0`, `to:1`, `durationMs` (planned fade) |
| `q2_show` | Second question fully visible | `index:1`, `text` |
| `skip_click` | User invoked Skip fast-path | — |
| `abandon` | User hid page (visibility hidden) before completion | `reason` |
| `linger` | User still viewing intro after 10s without progressing | `atMs` |

`intro_completed` metadata:
| Field | Meaning |
|-------|---------|
| `durationMs` | Total elapsed from mount to completion action (CTA or skip) |
| `questionsShown` | 1 or 2 depending on skip timing |
| `skip` | Boolean indicating Skip path |
| `morphLatencyMs` | Time from CTA morph start until completion (undefined if skipped pre-CTA) |
| `mode` | Always `dual_prompt` (future-proofing) |

Removed events: `morph_start`, `skip_retire_start`, `skip_retire_end` were folded into `intro_completed.morphLatencyMs` and existing stages to keep payload lean.

Test Coverage: `PreviewIntroGate.test.tsx` asserts presence of `skip_click` stage and `intro_completed` emission.

Future metrics ideas:
* `cta_delayMs` (difference between `q2_show` and CTA visibility) for experimentation.
* `linger` stage after a long dwell without action (not yet implemented) to distinguish passive reading vs. abandon.

Rationale:
The paired questions establish scope (phenomenological target then definitional clarity) before engagement, emphasizing epistemic framing while keeping overhead minimal (a single lightweight overlay, no network requests). Timings favor comprehension over raw speed but remain under 10s to first interactive CTA (~8.5s including exit fade). Reduced-motion path keeps it instantaneous.


An ephemeral question submission surface is available at `/preview` (future path may evolve). It allows prospective participants to submit a single free‑form question for early exploration while preserving a lightweight, privacy‑sensitive posture.

### Feature Highlights
| Capability | Behavior | Implementation Notes |
|------------|----------|----------------------|
| Draft Persistence | In‑progress question text is autosaved (250ms debounce) to `localStorage` and restored on revisit (same browser) | Key: `preview:question:draft:v1` |
| Submission History | Minimal history stored (timestamp + content hash) to enforce rate limits & duplicate detection | Key: `preview:question:history:v1` |
| Rate Limiting | Max 5 submissions per rolling hour (client only; future server enforcement recommended) | Sliding window filter of history timestamps |
| Duplicate Guard | Same text (hash) ignored if re‑submitted within 6h window | Non‑cryptographic string hash (deterministic) |
| Analytics Action | Dedicated action `question_submit` with metadata (length, word count, prior submissions) | Category `interaction` |
| Sanitization | Email patterns in free text redacted before analytics dispatch | Reuses global analytics sanitizer |
| Success Feedback | Form fades out, success message animates in, then auto‑dismisses allowing fresh entry | CSS keyframes in `App.css` |
| Accessibility | Form & alerts use semantic roles (`alert`, labeled controls) | Tested via Vitest assertions |

### Stored Keys
All keys intentionally versioned for safe future schema changes:
* `preview:question:draft:v1` – `{ question: string, name?: string, email?: string }` object.
* `preview:question:history:v1` – Array of `{ t: ISO8601 string, h: hash }` records.

Clearing local state for a clean test / demo:
```js
localStorage.removeItem('preview:question:draft:v1');
localStorage.removeItem('preview:question:history:v1');
```

### Rate Limit Logic
1. Load history (fault‑tolerant JSON parse; corrupt entries ignored).
2. Prune entries older than 1 hour for active limit calculation.
3. If `pruned.length >= 5` → block submission and show rate limit alert (includes time to reset).
4. Duplicate detection: if any history entry with same hash is < 6h old → treat as duplicate (no new analytics event; shows duplicate alert).

Edge cases handled:
* Corrupt JSON → silently reset that key (prevents permanent lockout).
* Clock skew (future timestamps) → they are retained but still subject to standard pruning when real time surpasses them.
* Rapid submissions (<250ms) still individually counted (draft debounce does not affect submission path).

### Analytics Metadata (`question_submit`)
| Field | Meaning |
|-------|---------|
| `len` | Character length of submitted question |
| `words` | Word count (simple whitespace split) |
| `priorInWindow` | Number of prior submissions in current 1h window before this one |
| `duplicate` | Boolean flag when blocked as duplicate (event not emitted if duplicate prevented; reserved for potential future partial emission) |

Additional base context from analytics layer (session id, timestamps) is automatically attached.

### Styling & Animation
CSS additions in `App.css`:
* `.preview-questions__success` base + `--active` modifier triggers fade/scale animation.
* Form pulse animation briefly runs after a successful submission (visual reinforcement) with reduced motion safeguard inherited from global settings.

### Testing
Vitest tests (`src/pages/PreviewQuestions.test.tsx`) cover:
* Draft persistence restore.
* Rate limiting after seeding history (ensures deterministic behavior).
* Basic validation and analytics emission.

### Environment Overrides
The following optional build-time environment variables allow tuning thresholds without code changes (applied in `previewQuestions.ts` with validation):

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_PREVIEW_MAX_PER_HOUR` | `5` | Max submissions in rolling hour |
| `VITE_PREVIEW_RATE_LIMIT_WINDOW_MS` | `3600000` | Rolling rate limit window (ms) |
| `VITE_PREVIEW_DUPLICATE_WINDOW_MS` | `21600000` | Duplicate hash suppression window (ms) |
| `VITE_PREVIEW_DRAFT_DEBOUNCE_MS` | `250` | Draft persistence debounce (ms) |
| `VITE_PREVIEW_SUCCESS_AUTO_HIDE_MS` | `2400` | Success message auto-hide delay (ms) |
| `VITE_PREVIEW_EXPOSE_META` | unset (non-prod only) | Force meta exposure of config in production when set to `true` |

Set in `.env`, `.env.preview`, or deployment-specific build environment; invalid (non-positive) numbers fall back to defaults.

### Meta Tag Exposure & Drift Detection
When not in production (or when `VITE_PREVIEW_EXPOSE_META=true`) the current numeric configuration is exposed:

1. `<meta name="x-preview-questions-config-json" content='{ "MAX_PER_HOUR":5, ... , "configHash":"<hash>" }'>`
2. `<meta name="x-preview-questions-config-hash" content="<hash>">`

A lightweight FNV-1a hash of the full config object supports drift detection across navigations. If the stored previous hash differs from the new hash, an analytics event (`config` category, action `drift`, label `preview_questions`) is emitted with `{ previous, current }` metadata. This mirrors the service worker config drift pattern for consistent observability.

Console helper:
```js
window.__dumpPreviewQuestionsConfig()
```
Returns the current runtime config object and logs it for inspection.

### Future Hardening (Server-Side Suggestions)
* Server authoritative rate limiting (IP + UA hash / token) to prevent client bypass.
* Bot mitigation (honeypot field or challenge after threshold).
* Optional email verification workflow (only after explicit consent – avoid silent PII expansion).
* Spam/abuse heuristic scoring (length anomalies, repeated substrings) with privacy-aware hashing.

### Configuration
Current thresholds are inline constants in `PreviewQuestions.tsx`:
```ts
const MAX_PER_HOUR = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const DUPLICATE_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours
```
If future runtime configurability is desired, centralize them in a config module (mirroring `sw-config.ts`) and optionally surface via meta for drift detection.

### Privacy Posture
No question content leaves the browser until the user submits. Analytics metadata stores only derived metrics (length/word count) and a hash for duplicate detection—NOT the raw question text. Ensure any future backend ingestion preserves this minimization principle unless explicit user consent is expanded.


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

Each page load deterministically computes a hash of the exposed SW configuration subset (currently `manifestHardBustRatio` and `autoRefresh` block). The hash is persisted in `localStorage` under key `sw:configHash`. If a subsequent load produces a different hash (indicating a configuration change between navigations or deployments) an analytics event (`config` category, action `drift`, label `sw_config`) is fired with metadata `{ previous, current }` before updating the stored value. This allows downstream dashboards to surface configuration churn without parsing build artifacts.

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
| `config/drift` | Config hash changed between navigations | `{ previous, current }` |

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

