# Power Platform (Power Pages) Integration Guide

This guide explains how to package and surface the **Next.js Dashboard** (`web/web/next-dashboard`) inside your Power Platform environment: **HumanAI-Pages-Dev**.

## Overview
We produce a static export of the Next.js dashboard and embed or upload it into Power Pages.

Supported deployment modes (choose one):
1. **EMBED_IFRAME** (default) – Host static build externally (e.g., GitHub Artifact / Azure Static Web Apps) and embed via `<iframe>` inside a Web Template or Content Snippet.
2. **STATIC_WEBFILES** – Upload static assets directly as Power Pages Web Files (Dataverse records); the workflow now automates per‑file upload.
3. **EXTERNAL_CDN** – Publish to an external CDN (Azure Storage Static Website / GitHub Pages) and embed (iframe or script) without copying into Dataverse.

## Prerequisites
- Azure AD App (Service Principal) with delegated access to the Dataverse environment.
- Power Platform CLI (`pac`) locally or via GitHub Actions.
- Environment URL (e.g., `https://org12345abcd.crm.dynamics.com`).
- (Optional) Website / Portal ID if targeting a specific existing Power Pages site.

## Environment Variables / Secrets
Create a copy of `.env.powerplatform.example` for local exploration or configure GitHub repository secrets:

| Secret | Description |
|--------|-------------|
| POWERPLATFORM_TENANT_ID | Azure AD tenant GUID |
| POWERPLATFORM_CLIENT_ID | Service principal (app registration) client ID |
| POWERPLATFORM_CLIENT_SECRET | Client secret (never commit) |
| POWERPLATFORM_ENV_URL | Dataverse environment (org) URL |
| POWERPLATFORM_WEBSITE_ID | (Optional) Power Pages website GUID |
| POWERPLATFORM_DEPLOY_MODE | EMBED_IFRAME | STATIC_WEBFILES | EXTERNAL_CDN |
| POWERPLATFORM_PUBLIC_BASE_URL | Public URL where exported dashboard is accessible (for EMBED_IFRAME / EXTERNAL_CDN) |

## Local Static Export
```bash
npm run export:dashboard
# Output: web/web/next-dashboard/out
```
Open `out/index.html` locally or host it with any static server.

## Workflow: `.github/workflows/powerpages-deploy.yml`
Triggers manually (`workflow_dispatch`). Steps:
1. Install Node + deps.
2. Lint + build + export static site.
3. Upload artifact `dashboard-static`.
4. (Conditional) Authenticate to Power Platform with `pac`.
5. Deploy step: conditional logic
  - `STATIC_WEBFILES`: Iterates all exported files and calls `pac paportal upload --webFile <name>` (slashes flattened to `-`).
  - `EMBED_IFRAME`: Skips upload (informational note only).
  - `EXTERNAL_CDN`: Separate job prints instructions (no Dataverse auth).

## STATIC_WEBFILES Deployment Details
The workflow flattens directory slashes into `-` for the Web File logical name (Power Pages constraint simplification). Example:
```
_next/static/chunks/app/page.js  ->  _next-static-chunks-app-page.js
index.html                       ->  index.html
integrity-manifest.json          ->  integrity-manifest.json
```
If you prefer preserving folder structure, replace the upload loop with a portal source sync (`pac paportal download` / modify / `pac paportal upload`).

## EMBED_IFRAME Approach
1. Host exported dashboard (e.g., GitHub Pages or Azure Static Web App). 
2. Create a Web Template in Power Pages with:
```liquid
<div class="humanai-dashboard-wrapper">
  <iframe src="{{ settings.humanai_dashboard_url }}" title="Human AI Dashboard" width="100%" height="900" style="border:0; background:#0a0f1a;"></iframe>
</div>
```
3. Add a Site Setting `humanai_dashboard_url` containing the public base URL + `/index.html`.

## Security Considerations
- Avoid embedding privileged tokens into the static build. All secrets stay in GitHub or Power Platform.
- For authenticated Dataverse data in future, prefer a minimal backend (Azure Function) returning JSON consumed client-side using token exchange flows.
- Enable CSP headers (if hosting externally) narrowing `frame-ancestors` to your Power Pages domain if clickjacking is a concern.

## Versioning, Integrity & Cache Busting
During `export:static` the script `scripts/gen-integrity.mjs` creates:
| File | Purpose |
|------|---------|
| `version.json` | Overall SHA-256 of exported payload + timestamp + file count |
| `integrity-manifest.json` | Per-file SHA-256 and byte size |

You can expose `version.json` via an iframe query param (e.g., `?v=<sha>`), or read it inside Power Pages for display / cache invalidation logic. For CDN hosting add immutable cache headers and rely on the manifest’s hash.

If hosting under a subpath, set `DASHBOARD_BASE_PATH` env var; build picks it up as `basePath` in `next.config.ts`.

## Extending the Build
- Add dynamic data fetch: create an API route externally (cannot run inside exported static bundle) and call via fetch.
- Add SSO (future): Use MSAL.js inside the iframe to acquire tokens for Graph/Dataverse via implicit or auth code flow.

## Next Steps (Suggested Enhancements)
- Implement actual STATIC_WEBFILES upload logic with portal source sync.
- Add a script to preprocess and flatten exported asset paths if Dataverse naming constraints arise.
- Add an `INTEGRITY.md` inside `next-dashboard/out` artifact with SHA256 sums for each file.

---
Questions or issues: open a GitHub Issue referencing this guide.
