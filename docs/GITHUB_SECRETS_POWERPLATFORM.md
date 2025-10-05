# GitHub Secrets Configuration for Power Platform

This guide shows how to configure the GitHub repository secrets needed for automated Power Platform deployment.

## Required Secrets

The following secrets must be configured in your GitHub repository:

| Secret Name | Description | Where to Find |
|-------------|-------------|---------------|
| `POWERPLATFORM_TENANT_ID` | Azure AD Tenant ID | Azure Portal → Azure Active Directory → Overview |
| `POWERPLATFORM_CLIENT_ID` | Service Principal Application (Client) ID | Azure Portal → App registrations → Your app |
| `POWERPLATFORM_CLIENT_SECRET` | Service Principal Client Secret | Azure Portal → App registrations → Your app → Certificates & secrets |
| `POWERPLATFORM_ENVIRONMENT_URL` | Power Platform Environment URL | `https://humanai-pages-dev.crm.dynamics.com/` |

## Step-by-Step Setup

### 1. Create a Service Principal (Azure AD App Registration)

```bash
# Login to Azure
az login

# Create app registration
az ad app create \
  --display-name "HumanAI-PowerPages-GitHub-Deploy" \
  --sign-in-audience AzureADMyOrg

# Get the Application ID
APP_ID=$(az ad app list \
  --display-name "HumanAI-PowerPages-GitHub-Deploy" \
  --query "[0].appId" -o tsv)

echo "Application ID: $APP_ID"

# Create service principal
az ad sp create --id $APP_ID

# Create a client secret (valid for 1 year)
SECRET_OUTPUT=$(az ad app credential reset \
  --id $APP_ID \
  --append \
  --display-name "GitHub-Actions-Secret" \
  --years 1)

# Extract the secret value
CLIENT_SECRET=$(echo $SECRET_OUTPUT | jq -r '.password')
echo "Client Secret: $CLIENT_SECRET"
echo "IMPORTANT: Save this secret securely - it won't be shown again!"

# Get Tenant ID
TENANT_ID=$(az account show --query tenantId -o tsv)
echo "Tenant ID: $TENANT_ID"
```

### 2. Grant Power Platform Permissions

The service principal needs access to your Power Platform environment:

#### Option A: Via Power Platform Admin Center (Recommended)

1. Navigate to [Power Platform Admin Center](https://admin.powerplatform.microsoft.com/)
2. Go to **Environments**
3. Select **HumanAI-Pages-Dev** environment
4. Click **Settings** → **Users + permissions** → **Application users**
5. Click **+ New app user**
6. In the **Azure AD application** field, search for your app: `HumanAI-PowerPages-GitHub-Deploy`
7. Select the app from the dropdown
8. Under **Business unit**, select the default business unit
9. Under **Security roles**, assign:
   - **System Administrator** (for full deployment capabilities)
   - Or **System Customizer** (for content-only deployment)
10. Click **Create**

#### Option B: Via PowerShell

```powershell
# Install required module
Install-Module -Name Microsoft.PowerApps.Administration.PowerShell

# Connect to Power Platform
Add-PowerAppsAccount

# Get environment
$env = Get-AdminPowerAppEnvironment -EnvironmentName "HumanAI-Pages-Dev"

# Add app user (replace with your values)
New-PowerAppManagementApp `
  -EnvironmentName $env.EnvironmentName `
  -ApplicationId "<YOUR_APP_ID>"
```

### 3. Configure GitHub Secrets

#### Via GitHub Web UI

1. Go to your repository: https://github.com/humanaiconvention/humanaiconvention
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each of the four secrets:

   **Secret 1: POWERPLATFORM_TENANT_ID**
   - Name: `POWERPLATFORM_TENANT_ID`
   - Value: `<your-tenant-id>` (from step 1)
   - Click **Add secret**

   **Secret 2: POWERPLATFORM_CLIENT_ID**
   - Name: `POWERPLATFORM_CLIENT_ID`
   - Value: `<your-app-id>` (from step 1)
   - Click **Add secret**

   **Secret 3: POWERPLATFORM_CLIENT_SECRET**
   - Name: `POWERPLATFORM_CLIENT_SECRET`
   - Value: `<your-client-secret>` (from step 1)
   - Click **Add secret**

   **Secret 4: POWERPLATFORM_ENVIRONMENT_URL**
   - Name: `POWERPLATFORM_ENVIRONMENT_URL`
   - Value: `https://humanai-pages-dev.crm.dynamics.com/`
   - Click **Add secret**

#### Via GitHub CLI

```bash
# Set your secrets (replace with actual values)
gh secret set POWERPLATFORM_TENANT_ID --body "<your-tenant-id>"
gh secret set POWERPLATFORM_CLIENT_ID --body "<your-app-id>"
gh secret set POWERPLATFORM_CLIENT_SECRET --body "<your-client-secret>"
gh secret set POWERPLATFORM_ENVIRONMENT_URL --body "https://humanai-pages-dev.crm.dynamics.com/"

# Verify secrets were created
gh secret list
```

### 4. Verify Configuration

Test that the secrets are properly configured:

```bash
# Trigger the Power Platform deployment workflow manually
gh workflow run deploy-powerplatform.yml

# Check the workflow status
gh run list --workflow=deploy-powerplatform.yml --limit 1

# View logs (get run ID from previous command)
gh run view <run-id> --log
```

## Security Best Practices

### Secret Rotation

Client secrets should be rotated periodically:

```bash
# Rotate the secret (creates a new secret, keeps old one active)
az ad app credential reset \
  --id $APP_ID \
  --append \
  --display-name "GitHub-Actions-Secret-Rotated-$(date +%Y%m%d)" \
  --years 1

# Update GitHub secret with new value
gh secret set POWERPLATFORM_CLIENT_SECRET --body "<new-secret>"

# After verifying new secret works, remove old credential
az ad app credential delete \
  --id $APP_ID \
  --key-id <old-key-id>
```

### Least Privilege

For production environments, consider creating a more restricted role:

1. Create a custom security role with only necessary permissions:
   - Read/Write access to Portal/Power Pages entities
   - Read access to configuration entities
   - No access to sensitive user data

2. Assign this role instead of System Administrator

### Audit Logging

Monitor service principal usage:

```bash
# View sign-in activity
az ad sp show --id $APP_ID --query "signInAudience"

# Check app permissions
az ad app permission list --id $APP_ID
```

## Troubleshooting

### Common Issues

**Issue**: "Authentication failed" in workflow
- **Cause**: Incorrect secret values or expired secret
- **Solution**: Verify secrets in GitHub, regenerate if needed

**Issue**: "Permission denied" during deployment
- **Cause**: Service principal lacks required roles
- **Solution**: Grant System Administrator or System Customizer role

**Issue**: "Environment not found"
- **Cause**: Incorrect environment URL
- **Solution**: Verify URL in Power Platform Admin Center

### Validation Checklist

- [ ] Service principal created in Azure AD
- [ ] App user added to Power Platform environment
- [ ] Appropriate security role assigned
- [ ] All four GitHub secrets configured
- [ ] Secrets have correct values (no extra spaces/quotes)
- [ ] Test deployment workflow runs successfully

## Additional Resources

- [Power Platform CLI Documentation](https://learn.microsoft.com/power-platform/developer/cli/introduction)
- [Service Principal Authentication](https://learn.microsoft.com/power-platform/admin/powershell-create-service-principal)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Azure AD App Registration](https://learn.microsoft.com/azure/active-directory/develop/quickstart-register-app)

## Support

For issues with:
- Azure AD setup: Contact your Azure administrator
- Power Platform access: Contact your Power Platform administrator
- GitHub configuration: Open an issue in this repository

---

**Last Updated**: 2024-01-15  
**Maintained By**: HumanAI Convention Team
