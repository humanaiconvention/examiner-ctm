# Quick Start: Power Platform Deployment

This is a condensed guide to get you started with deploying to Power Platform (HumanAI-Pages-Dev) quickly.

## Prerequisites

- Access to Azure subscription with Power Platform
- Node.js 20+ installed
- Git repository cloned locally

## 5-Minute Setup

### Step 1: Install Power Platform CLI

```bash
# Via npm (recommended)
npm install -g @microsoft/powerplatform-cli-wrapper

# Verify installation
pac --version
```

### Step 2: Set Environment Variables

**Linux/macOS:**
```bash
export POWERPLATFORM_TENANT_ID="your-tenant-id"
export POWERPLATFORM_CLIENT_ID="your-client-id"
export POWERPLATFORM_CLIENT_SECRET="your-client-secret"
export POWERPLATFORM_ENVIRONMENT_URL="https://humanai-pages-dev.crm.dynamics.com/"
```

**Windows (PowerShell):**
```powershell
$Env:POWERPLATFORM_TENANT_ID = "your-tenant-id"
$Env:POWERPLATFORM_CLIENT_ID = "your-client-id"
$Env:POWERPLATFORM_CLIENT_SECRET = "your-client-secret"
$Env:POWERPLATFORM_ENVIRONMENT_URL = "https://humanai-pages-dev.crm.dynamics.com/"
```

> **Don't have credentials?** See [`docs/GITHUB_SECRETS_POWERPLATFORM.md`](./GITHUB_SECRETS_POWERPLATFORM.md) for setup instructions.

### Step 3: Run Setup Script

```bash
# Linux/macOS
./scripts/setup-powerplatform.sh

# Windows
.\scripts\setup-powerplatform.ps1
```

This will:
- ✅ Verify CLI installation
- ✅ Check environment variables
- ✅ Test authentication
- ✅ List available environments

### Step 4: Build and Deploy

```bash
# Build for Power Platform
npm run build:powerplatform

# Deploy to Power Pages
npm run deploy:powerplatform
```

Or build and deploy in one step:

```bash
npm run deploy:powerplatform:build
```

### Step 5: Verify Deployment

Visit your Power Pages site:
- URL: https://humanai-pages-dev.powerappsportals.com
- Check `/version.json` endpoint
- Test navigation and functionality

## Common Commands

```bash
# Dry run (preview without deploying)
npm run deploy:powerplatform:dry-run

# Build only
npm run build:powerplatform

# Manual deployment (with more options)
node scripts/deploy-powerplatform.mjs --environment HumanAI-Pages-Dev --verify
```

## Troubleshooting

### Authentication Failed
```bash
# Re-authenticate
pac auth create \
  --tenant "$POWERPLATFORM_TENANT_ID" \
  --applicationId "$POWERPLATFORM_CLIENT_ID" \
  --clientSecret "$POWERPLATFORM_CLIENT_SECRET" \
  --environment "$POWERPLATFORM_ENVIRONMENT_URL"
```

### Build Failed
```bash
# Clean and rebuild
rm -rf web/dist web/node_modules/.vite
npm install
npm run build
```

### Deployment Failed
```bash
# Check PAC CLI status
pac auth list

# View environment status
pac env who

# Check for errors in logs
pac paportal logs --last 10
```

## GitHub Actions Setup

To enable automated deployment:

1. Add secrets to GitHub repository (see [`docs/GITHUB_SECRETS_POWERPLATFORM.md`](./GITHUB_SECRETS_POWERPLATFORM.md))
2. Push to `main` branch or manually trigger workflow
3. Monitor workflow: https://github.com/humanaiconvention/humanaiconvention/actions

## What's Next?

- 📖 Read full documentation: [`DEPLOY_POWERPLATFORM.md`](../DEPLOY_POWERPLATFORM.md)
- 🔐 Configure GitHub secrets: [`docs/GITHUB_SECRETS_POWERPLATFORM.md`](./GITHUB_SECRETS_POWERPLATFORM.md)
- ⚙️ Customize configuration: Edit `power-pages.config.json`
- 🎨 Configure custom domain: Power Platform Admin Center

## Getting Help

- **Documentation**: See [`DEPLOY_POWERPLATFORM.md`](../DEPLOY_POWERPLATFORM.md)
- **Issues**: https://github.com/humanaiconvention/humanaiconvention/issues
- **Power Platform Docs**: https://learn.microsoft.com/power-pages/

---

**Environment**: HumanAI-Pages-Dev  
**Last Updated**: 2024-01-15
