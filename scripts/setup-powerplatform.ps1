# Power Platform Setup Script
# Run this to configure Power Platform deployment for HumanAI-Pages-Dev
# Usage: . ./scripts/setup-powerplatform.sh

Write-Host "╔════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Power Platform Setup                              ║" -ForegroundColor Cyan
Write-Host "║  HumanAI Convention - HumanAI-Pages-Dev            ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check if Power Platform CLI is installed
Write-Host "🔍 Checking for Power Platform CLI..." -ForegroundColor Yellow
$pacInstalled = Get-Command pac -ErrorAction SilentlyContinue

if (-not $pacInstalled) {
    Write-Host "❌ Power Platform CLI not found" -ForegroundColor Red
    Write-Host "📦 Installing Power Platform CLI..." -ForegroundColor Yellow
    
    # Try to install via npm
    try {
        npm install -g @microsoft/powerplatform-cli-wrapper
        Write-Host "✅ Power Platform CLI installed successfully" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to install Power Platform CLI" -ForegroundColor Red
        Write-Host "   Please install manually from: https://aka.ms/PowerPlatformCLI" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "✅ Power Platform CLI is installed" -ForegroundColor Green
    $version = pac --version
    Write-Host "   Version: $version" -ForegroundColor Gray
}

Write-Host ""

# Check for required environment variables
Write-Host "🔐 Checking environment configuration..." -ForegroundColor Yellow

$requiredVars = @(
    "POWERPLATFORM_TENANT_ID",
    "POWERPLATFORM_CLIENT_ID",
    "POWERPLATFORM_CLIENT_SECRET",
    "POWERPLATFORM_ENVIRONMENT_URL"
)

$missingVars = @()
foreach ($var in $requiredVars) {
    if (-not (Test-Path env:$var)) {
        $missingVars += $var
    }
}

if ($missingVars.Count -gt 0) {
    Write-Host "⚠️  Missing environment variables:" -ForegroundColor Yellow
    foreach ($var in $missingVars) {
        Write-Host "   - $var" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "📝 To configure, set these environment variables:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   # Option 1: Set in current session" -ForegroundColor Gray
    Write-Host "   `$Env:POWERPLATFORM_TENANT_ID = 'your-tenant-id'" -ForegroundColor Gray
    Write-Host "   `$Env:POWERPLATFORM_CLIENT_ID = 'your-client-id'" -ForegroundColor Gray
    Write-Host "   `$Env:POWERPLATFORM_CLIENT_SECRET = 'your-client-secret'" -ForegroundColor Gray
    Write-Host "   `$Env:POWERPLATFORM_ENVIRONMENT_URL = 'https://humanai-pages-dev.crm.dynamics.com/'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "   # Option 2: Add to your PowerShell profile" -ForegroundColor Gray
    Write-Host "   notepad `$PROFILE" -ForegroundColor Gray
    Write-Host ""
    Write-Host "📚 See DEPLOY_POWERPLATFORM.md for detailed setup instructions" -ForegroundColor Cyan
} else {
    Write-Host "✅ All required environment variables are set" -ForegroundColor Green
    
    # Test authentication
    Write-Host ""
    Write-Host "🔌 Testing authentication to Power Platform..." -ForegroundColor Yellow
    
    try {
        pac auth create `
            --tenant $Env:POWERPLATFORM_TENANT_ID `
            --applicationId $Env:POWERPLATFORM_CLIENT_ID `
            --clientSecret $Env:POWERPLATFORM_CLIENT_SECRET `
            --environment $Env:POWERPLATFORM_ENVIRONMENT_URL `
            --name "setup-test-$(Get-Date -Format 'yyyyMMddHHmmss')" `
            2>$null
        
        Write-Host "✅ Successfully authenticated to Power Platform" -ForegroundColor Green
        
        # List environments
        Write-Host ""
        Write-Host "📋 Available environments:" -ForegroundColor Yellow
        pac env list 2>$null | Select-Object -First 10
        
    } catch {
        Write-Host "❌ Authentication failed" -ForegroundColor Red
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "   Check your credentials and try again" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Setup Summary                                     ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Target Environment: HumanAI-Pages-Dev" -ForegroundColor White
Write-Host ""
Write-Host "📚 Next steps:" -ForegroundColor Yellow
Write-Host "   1. Review configuration: cat power-pages.config.json" -ForegroundColor Gray
Write-Host "   2. Build the application: npm run build:powerplatform" -ForegroundColor Gray
Write-Host "   3. Deploy to Power Pages: npm run deploy:powerplatform" -ForegroundColor Gray
Write-Host "   4. Or use dry-run mode: npm run deploy:powerplatform:dry-run" -ForegroundColor Gray
Write-Host ""
Write-Host "📖 Full documentation: DEPLOY_POWERPLATFORM.md" -ForegroundColor Cyan
Write-Host ""
