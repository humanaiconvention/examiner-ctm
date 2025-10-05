# Power Platform (Power Pages) Deployment Guide

This guide walks through connecting and deploying the HumanAI Convention web application to Microsoft Power Platform's Power Pages environment.

> **🚀 Quick Start**: For a condensed setup guide, see [`docs/QUICKSTART_POWERPLATFORM.md`](docs/QUICKSTART_POWERPLATFORM.md)  
> **🔐 GitHub Secrets**: For automated deployment setup, see [`docs/GITHUB_SECRETS_POWERPLATFORM.md`](docs/GITHUB_SECRETS_POWERPLATFORM.md)

## Overview

Power Pages (formerly Power Apps Portals) is Microsoft's low-code platform for building external-facing websites. This deployment option is ideal when you need integration with Dynamics 365, Dataverse, or other Power Platform services.

**Target Environment**: `HumanAI-Pages-Dev`

---

## 1. Prerequisites

- **Power Platform Environment**: Access to `HumanAI-Pages-Dev` environment
- **Power Platform CLI**: Install the Microsoft Power Platform CLI
- **Authentication**: Power Platform admin or maker role in the target environment
- **Node.js**: LTS version (for local builds)
- **Azure CLI** (optional): For hybrid Azure + Power Platform scenarios

### Installing Power Platform CLI

#### Windows (via PowerShell)
```powershell
# Install via winget
winget install Microsoft.PowerPlatformCLI

# Or via npm
npm install -g @microsoft/power-platform-cli-wrapper
```

#### macOS/Linux
```bash
# Via npm
npm install -g @microsoft/power-platform-cli-wrapper

# Or download from https://aka.ms/PowerPlatformCLI
```

Verify installation:
```bash
pac
# Should display Power Platform CLI version
```

---

## 2. Environment Setup

### 2.1 Authenticate to Power Platform

```bash
# Interactive authentication
pac auth create --environment HumanAI-Pages-Dev

# Or using service principal (for CI/CD)
pac auth create \
  --environment HumanAI-Pages-Dev \
  --applicationId <CLIENT_ID> \
  --clientSecret <CLIENT_SECRET> \
  --tenant <TENANT_ID>
```

### 2.2 List Available Environments

```bash
# View all accessible environments
pac env list

# Select the target environment
pac env select --environment HumanAI-Pages-Dev
```

### 2.3 Verify Connection

```bash
# Check current authentication
pac auth list

# Get environment details
pac env who
```

---

## 3. Power Pages Site Configuration

### 3.1 Create or Connect to Power Pages Site

If the site doesn't exist yet:

```bash
# Create new Power Pages site
pac paportal create \
  --name "HumanAI-Convention" \
  --environment HumanAI-Pages-Dev \
  --deployment-type "Trial" \
  --website-type "Custom"
```

If the site already exists:

```bash
# List existing sites
pac paportal list

# Download site configuration
pac paportal download \
  --path ./power-pages-site \
  --websiteId <SITE_ID>
```

### 3.2 Configure Site Settings

Create a configuration file: `power-pages.config.json`

```json
{
  "environmentName": "HumanAI-Pages-Dev",
  "websiteName": "HumanAI-Convention",
  "siteUrl": "https://humanai-pages-dev.powerappsportals.com",
  "deployment": {
    "type": "static",
    "sourcePath": "web/dist",
    "excludePaths": [
      "*.map",
      "node_modules/**",
      ".env*"
    ]
  },
  "headers": {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
  }
}
```

---

## 4. Build for Power Pages

### 4.1 Local Build

```bash
# Navigate to web directory
cd web

# Install dependencies
npm ci

# Build for production
npm run build

# Output will be in web/dist/
```

### 4.2 Power Pages-Specific Adjustments

Power Pages may require some adjustments to the build:

```bash
# Copy staticwebapp.config.json as routes.json for Power Pages
cp web/staticwebapp.config.json web/dist/routes.json

# Ensure all assets use relative paths
# (Vite already does this with base: './')
```

---

## 5. Deployment Methods

### 5.1 Manual Upload via Power Pages Studio

1. Open [Power Pages](https://make.powerpages.microsoft.com/)
2. Select `HumanAI-Pages-Dev` environment
3. Open your site in the Studio
4. Navigate to **Upload** section
5. Upload contents of `web/dist/` directory
6. Publish the site

### 5.2 CLI Deployment (Recommended)

```bash
# Upload site content
pac paportal upload \
  --path web/dist \
  --deploymentProfile Production

# Sync changes
pac paportal sync
```

### 5.3 Automated CI/CD Deployment

See `.github/workflows/deploy-powerplatform.yml` for automated deployment via GitHub Actions.

---

## 6. GitHub Actions Integration

### 6.1 Required Secrets

Add the following secrets to your GitHub repository:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `POWERPLATFORM_TENANT_ID` | Azure AD Tenant ID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `POWERPLATFORM_CLIENT_ID` | Service Principal Application ID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `POWERPLATFORM_CLIENT_SECRET` | Service Principal Secret | `xxxxx~xxxxxxxxxxxxxxxxxxxx` |
| `POWERPLATFORM_ENVIRONMENT_URL` | Environment URL | `https://humanai-pages-dev.crm.dynamics.com/` |

### 6.2 Create Service Principal

```bash
# Create a new app registration for CI/CD
az ad app create \
  --display-name "HumanAI-PowerPages-Deploy" \
  --sign-in-audience AzureADMyOrg

# Get the Application ID
APP_ID=$(az ad app list --display-name "HumanAI-PowerPages-Deploy" --query "[0].appId" -o tsv)

# Create a service principal
az ad sp create --id $APP_ID

# Create a client secret
az ad app credential reset \
  --id $APP_ID \
  --append \
  --display-name "GitHub-Actions" \
  --years 1

# Grant required permissions in Power Platform
# (Must be done via Power Platform Admin Center)
```

### 6.3 Grant Power Platform Access

1. Go to [Power Platform Admin Center](https://admin.powerplatform.microsoft.com/)
2. Navigate to **Environments** → `HumanAI-Pages-Dev`
3. Click **Settings** → **Users + permissions** → **Application users**
4. Click **+ New app user**
5. Select your service principal
6. Assign **System Administrator** role (or appropriate role)
7. Click **Create**

---

## 7. Environment Variables

Power Pages supports environment-specific configuration. Update `.env.example`:

```bash
# Power Platform Configuration
VITE_POWERPLATFORM_ENVIRONMENT=HumanAI-Pages-Dev
VITE_DEPLOYMENT_TARGET=powerplatform

# Power Pages Site URL
VITE_SITE_URL=https://humanai-pages-dev.powerappsportals.com

# Optional: Dataverse Integration
VITE_DATAVERSE_URL=https://humanai-pages-dev.crm.dynamics.com/
```

Build with environment variables:

```bash
# Production build for Power Pages
VITE_DEPLOYMENT_TARGET=powerplatform npm run build
```

---

## 8. Verification & Testing

### 8.1 Verify Deployment

```bash
# Check site status
pac paportal status

# View deployment logs
pac paportal logs --last 10
```

### 8.2 Test Deployed Site

1. Navigate to your Power Pages site URL
2. Verify the application loads correctly
3. Test all routes and navigation
4. Check browser console for errors
5. Verify CSP headers are applied

### 8.3 Common Issues

**Issue**: Site returns 404 errors
- **Solution**: Ensure `navigationFallback` is configured in `routes.json`

**Issue**: Static assets not loading
- **Solution**: Verify asset paths are relative, not absolute

**Issue**: CSP violations
- **Solution**: Adjust CSP in Power Pages admin or configuration file

---

## 9. Custom Domain Configuration

### 9.1 Add Custom Domain

1. Go to Power Platform Admin Center
2. Select `HumanAI-Pages-Dev` environment
3. Navigate to **Resources** → **Power Pages sites**
4. Select your site → **Manage**
5. Go to **Setup** → **Custom domains**
6. Add your domain (e.g., `humanaiconvention.com`)
7. Configure DNS records as instructed
8. Wait for SSL certificate provisioning (15-30 minutes)

### 9.2 DNS Configuration Example

```
# CNAME record
www.humanaiconvention.com → humanai-pages-dev.powerappsportals.com

# TXT record (for verification)
_verification.humanaiconvention.com → microsoft-domain-verification=xxxxxxxxxx
```

---

## 10. Monitoring & Analytics

### 10.1 Application Insights Integration

Power Pages can integrate with Azure Application Insights:

```json
{
  "monitoring": {
    "applicationInsights": {
      "connectionString": "InstrumentationKey=xxxx;IngestionEndpoint=https://xxx.in.applicationinsights.azure.com/",
      "enableAutoCollection": true
    }
  }
}
```

### 10.2 Power Platform Analytics

Built-in analytics are available in Power Platform Admin Center:
- Page views
- User sessions
- Performance metrics
- Error rates

---

## 11. Maintenance & Updates

### 11.1 Update Workflow

```bash
# 1. Make code changes locally
# 2. Build the application
npm run build

# 3. Deploy to Power Pages
pac paportal upload --path web/dist

# 4. Restart site (if needed)
pac paportal restart
```

### 11.2 Rollback Procedure

Power Pages maintains version history:

```bash
# List previous versions
pac paportal versions

# Rollback to specific version
pac paportal rollback --version <VERSION_ID>
```

---

## 12. Hybrid Deployment Strategy

You can maintain both Azure Static Web Apps and Power Pages deployments:

```yaml
# .github/workflows/deploy-hybrid.yml
jobs:
  deploy-azure:
    # Deploy to Azure Static Web Apps (primary)
    
  deploy-powerplatform:
    # Deploy to Power Pages (secondary/integration)
    needs: deploy-azure
    if: github.ref == 'refs/heads/main'
```

---

## 13. Power Platform-Specific Features

### 13.1 Dataverse Integration

If you need to integrate with Dataverse:

```typescript
// web/src/services/dataverse.ts
export async function queryDataverse(entityName: string) {
  const baseUrl = import.meta.env.VITE_DATAVERSE_URL;
  const response = await fetch(`${baseUrl}/api/data/v9.2/${entityName}`);
  return response.json();
}
```

### 13.2 Power Automate Triggers

Configure webhooks to trigger Power Automate flows:

```json
{
  "webhooks": {
    "formSubmit": "https://prod-xx.eastus.logic.azure.com/workflows/..."
  }
}
```

---

## 14. Security Considerations

### 14.1 Authentication

Power Pages supports multiple authentication providers:
- Azure AD B2C
- Microsoft Entra ID (formerly Azure AD)
- OAuth providers (Google, Facebook, etc.)

### 14.2 Data Access

Control data access using Dataverse security roles and table permissions.

### 14.3 CSP Headers

Power Pages enforces security headers. Ensure your app complies:

```
Content-Security-Policy: default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://*.dynamics.com;
```

---

## 15. Cost Considerations

Power Pages pricing (as of 2024):
- **Trial**: Free for 30 days
- **Pay-as-you-go**: Based on authenticated users
- **Capacity-based**: Monthly subscription

Estimated costs for small-medium deployments: $200-1000/month

---

## 16. Support & Resources

- **Power Pages Documentation**: https://learn.microsoft.com/power-pages/
- **Power Platform CLI Reference**: https://learn.microsoft.com/power-platform/developer/cli/reference/
- **Community Forums**: https://powerusers.microsoft.com/
- **Support**: Contact through Power Platform Admin Center

---

## 17. Comparison: Azure Static Web Apps vs Power Pages

| Feature | Azure Static Web Apps | Power Pages |
|---------|----------------------|-------------|
| Hosting Cost | Free tier available | Capacity-based pricing |
| Setup Complexity | Low | Medium |
| Dataverse Integration | Via API | Native |
| Custom Domains | Free SSL | Included |
| Authentication | GitHub, Azure AD | Multiple providers + custom |
| Best For | Static sites, SPAs | Enterprise portals, forms |

**Recommendation**: Use Azure Static Web Apps as primary deployment, Power Pages for enterprise integration scenarios.

---

## 18. Next Steps

After successful deployment to Power Pages:

1. ✅ Verify site loads at `https://humanai-pages-dev.powerappsportals.com`
2. ✅ Test all functionality
3. ✅ Configure monitoring and alerts
4. ✅ Set up custom domain (if needed)
5. ✅ Document any environment-specific configurations
6. ✅ Train team on Power Pages management

---

**Maintainer Notes**: 
- This guide assumes Power Pages CLI v1.29+ 
- Update service principal credentials before expiry
- Review Power Platform licensing annually
- Keep deployment workflows in sync with Azure deployments
