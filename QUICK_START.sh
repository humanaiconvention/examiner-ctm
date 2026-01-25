#!/bin/bash
# Examiner-CTM v5.2 Quick Start Bash Script
# Usage: bash QUICK_START.sh or chmod +x QUICK_START.sh && ./QUICK_START.sh

set -e

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         Examiner-CTM v5.2 Quick Start Setup                  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Get current directory
CURRENT_DIR=$(pwd)
echo "Current directory: $CURRENT_DIR"
echo ""

# Navigate to examiner-ctm directory
echo "Navigating to examiner-ctm root directory..."
echo ""

# Check if we're already in examiner-ctm
if [ -f "run_training.py" ]; then
    echo "✅ Already in examiner-ctm directory: $(pwd)"
    FOUND=1
fi

# Try to find examiner-ctm in subdirectories
if [ -z "$FOUND" ] && [ -d "examiner-ctm" ] && [ -f "examiner-ctm/run_training.py" ]; then
    cd examiner-ctm
    echo "✅ Found examiner-ctm subdirectory"
    FOUND=1
fi

# Try parent directory
if [ -z "$FOUND" ] && [ -d "../examiner-ctm" ] && [ -f "../examiner-ctm/run_training.py" ]; then
    cd ../examiner-ctm
    echo "✅ Found examiner-ctm in parent directory"
    FOUND=1
fi

# Try one more level up
if [ -z "$FOUND" ] && [ -d "../../examiner-ctm" ] && [ -f "../../examiner-ctm/run_training.py" ]; then
    cd ../../examiner-ctm
    echo "✅ Found examiner-ctm two levels up"
    FOUND=1
fi

if [ -z "$FOUND" ]; then
    echo "❌ ERROR: Could not find examiner-ctm directory"
    echo "Please ensure you're running this script from the correct location"
    exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "Available Commands"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

echo "📌 Setup:"
echo "   1. Copy .env template:"
echo "      cp .env.example .env"
echo "   2. Edit .env with your API keys:"
echo "      nano .env"
echo ""

echo "🚀 Train v5.2 with Auto-Grounding:"
echo "   python run_training.py --steps 5000 --auto-pause --git-sync"
echo ""

echo "📊 Monitor Training:"
echo "   https://humanaiconvention.com/ctm-monitor/"
echo ""

echo "📚 Documentation:"
echo "   - README.md (v5.2 architecture)"
echo "   - REPOSITORY_STRUCTURE.md (repository setup)"
echo "   - L4_DEPLOYMENT_GUIDE.md (cloud deployment)"
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "Files in this directory:"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

echo "  ✓ *.py (training modules - 29 files)"
echo "  ✓ README.md (complete documentation)"
echo "  ✓ .env.example (configuration template)"
echo "  ✓ run_training.py (training entry point)"
echo "  ✓ docs/ (architecture guides)"
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "Ready to start? Run:"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "  python run_training.py --steps 5000 --auto-pause --git-sync"
echo ""
