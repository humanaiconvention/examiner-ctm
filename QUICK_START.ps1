# Examiner-CTM v5.2 Quick Start PowerShell Script
# Usage: .\QUICK_START.ps1

Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         Examiner-CTM v5.2 Quick Start Setup                  ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check current directory
$currentDir = Get-Location
Write-Host "Current directory: $currentDir" -ForegroundColor Yellow
Write-Host ""

# Get to examiner-ctm root
Write-Host "Navigating to examiner-ctm root directory..." -ForegroundColor Green

# If we're in a subdirectory, go to parent
if ((Split-Path -Leaf $currentDir) -ne "examiner-ctm" -and (Split-Path -Leaf $currentDir) -ne "humanaiconvention") {
    Write-Host "Moving to parent directories to find examiner-ctm..." -ForegroundColor Yellow

    # Keep going up until we find the root
    $found = $false
    $maxLevels = 10
    $level = 0

    while ($level -lt $maxLevels -and -not $found) {
        $testPath = Join-Path (Get-Location) "examiner-ctm"
        if (Test-Path $testPath) {
            Set-Location $testPath
            $found = $true
            break
        }

        $testPath2 = Join-Path (Get-Location) ".."
        $parentName = Split-Path -Leaf (Resolve-Path $testPath2)

        if ($parentName -eq "humanaiconvention") {
            Set-Location $testPath2
            Set-Location "examiner-ctm"
            $found = $true
            break
        }

        Set-Location ..
        $level++
    }

    if (-not $found) {
        Write-Host "Could not find examiner-ctm directory. Please ensure you're in the correct location." -ForegroundColor Red
        exit 1
    }
} elseif ((Split-Path -Leaf $currentDir) -eq "humanaiconvention") {
    Set-Location "examiner-ctm"
}

$newDir = Get-Location
Write-Host "✅ Now in: $newDir" -ForegroundColor Green
Write-Host ""

# Show what's here
Write-Host "═════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Available Commands:" -ForegroundColor Cyan
Write-Host "═════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

Write-Host "📌 Setup:" -ForegroundColor Yellow
Write-Host "   1. Copy .env template:"
Write-Host "      cp .env.example .env" -ForegroundColor Gray
Write-Host "   2. Edit .env with your API keys:"
Write-Host "      notepad .env" -ForegroundColor Gray
Write-Host ""

Write-Host "🚀 Train v5.2 with Auto-Grounding:" -ForegroundColor Yellow
Write-Host "   python run_training.py --steps 5000 --auto-pause --git-sync" -ForegroundColor Gray
Write-Host ""

Write-Host "📊 Monitor Training:" -ForegroundColor Yellow
Write-Host "   https://humanaiconvention.com/ctm-monitor/" -ForegroundColor Gray
Write-Host ""

Write-Host "📚 Documentation:" -ForegroundColor Yellow
Write-Host "   - README.md (v5.2 architecture)" -ForegroundColor Gray
Write-Host "   - REPOSITORY_STRUCTURE.md (this setup)" -ForegroundColor Gray
Write-Host ""

Write-Host "═════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Files in this directory:" -ForegroundColor Cyan
Write-Host "═════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$files = @(
    "*.py (training modules)",
    "README.md (documentation)",
    ".env.example (config template)",
    "run_training.py (entry point)",
    "docs/ (architecture guides)"
)

foreach ($file in $files) {
    Write-Host "  ✓ $file" -ForegroundColor Green
}

Write-Host ""
Write-Host "═════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Ready to start? Run:" -ForegroundColor Cyan
Write-Host "═════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "  python run_training.py --steps 5000 --auto-pause --git-sync" -ForegroundColor Cyan
Write-Host ""
