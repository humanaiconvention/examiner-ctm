#!/bin/bash

# Power Platform Setup Script (Bash)
# Run this to configure Power Platform deployment for HumanAI-Pages-Dev
# Usage: ./scripts/setup-powerplatform.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;37m'
NC='\033[0m' # No Color

echo -e "${CYAN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  Power Platform Setup                              ║${NC}"
echo -e "${CYAN}║  HumanAI Convention - HumanAI-Pages-Dev            ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if Power Platform CLI is installed
echo -e "${YELLOW}🔍 Checking for Power Platform CLI...${NC}"
if command -v pac &> /dev/null; then
    echo -e "${GREEN}✅ Power Platform CLI is installed${NC}"
    version=$(pac --version 2>/dev/null || echo "unknown")
    echo -e "${GRAY}   Version: $version${NC}"
else
    echo -e "${RED}❌ Power Platform CLI not found${NC}"
    echo -e "${YELLOW}📦 Installing Power Platform CLI...${NC}"
    
    # Try to install via npm
    if npm install -g @microsoft/powerplatform-cli-wrapper; then
        echo -e "${GREEN}✅ Power Platform CLI installed successfully${NC}"
    else
        echo -e "${RED}❌ Failed to install Power Platform CLI${NC}"
        echo -e "${YELLOW}   Please install manually from: https://aka.ms/PowerPlatformCLI${NC}"
        exit 1
    fi
fi

echo ""

# Check for required environment variables
echo -e "${YELLOW}🔐 Checking environment configuration...${NC}"

REQUIRED_VARS=(
    "POWERPLATFORM_TENANT_ID"
    "POWERPLATFORM_CLIENT_ID"
    "POWERPLATFORM_CLIENT_SECRET"
    "POWERPLATFORM_ENVIRONMENT_URL"
)

MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Missing environment variables:${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo -e "${RED}   - $var${NC}"
    done
    echo ""
    echo -e "${YELLOW}📝 To configure, set these environment variables:${NC}"
    echo ""
    echo -e "${GRAY}   # Option 1: Set in current session${NC}"
    echo -e "${GRAY}   export POWERPLATFORM_TENANT_ID='your-tenant-id'${NC}"
    echo -e "${GRAY}   export POWERPLATFORM_CLIENT_ID='your-client-id'${NC}"
    echo -e "${GRAY}   export POWERPLATFORM_CLIENT_SECRET='your-client-secret'${NC}"
    echo -e "${GRAY}   export POWERPLATFORM_ENVIRONMENT_URL='https://humanai-pages-dev.crm.dynamics.com/'${NC}"
    echo ""
    echo -e "${GRAY}   # Option 2: Add to your ~/.bashrc or ~/.zshrc${NC}"
    echo -e "${GRAY}   echo 'export POWERPLATFORM_TENANT_ID=...' >> ~/.bashrc${NC}"
    echo ""
    echo -e "${CYAN}📚 See DEPLOY_POWERPLATFORM.md for detailed setup instructions${NC}"
else
    echo -e "${GREEN}✅ All required environment variables are set${NC}"
    
    # Test authentication
    echo ""
    echo -e "${YELLOW}🔌 Testing authentication to Power Platform...${NC}"
    
    if pac auth create \
        --tenant "$POWERPLATFORM_TENANT_ID" \
        --applicationId "$POWERPLATFORM_CLIENT_ID" \
        --clientSecret "$POWERPLATFORM_CLIENT_SECRET" \
        --environment "$POWERPLATFORM_ENVIRONMENT_URL" \
        --name "setup-test-$(date +%Y%m%d%H%M%S)" \
        2>/dev/null; then
        
        echo -e "${GREEN}✅ Successfully authenticated to Power Platform${NC}"
        
        # List environments
        echo ""
        echo -e "${YELLOW}📋 Available environments:${NC}"
        pac env list 2>/dev/null | head -10 || echo -e "${GRAY}   (Unable to list environments)${NC}"
        
    else
        echo -e "${RED}❌ Authentication failed${NC}"
        echo -e "${YELLOW}   Check your credentials and try again${NC}"
    fi
fi

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  Setup Summary                                     ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Target Environment: ${GREEN}HumanAI-Pages-Dev${NC}"
echo ""
echo -e "${YELLOW}📚 Next steps:${NC}"
echo -e "${GRAY}   1. Review configuration: cat power-pages.config.json${NC}"
echo -e "${GRAY}   2. Build the application: npm run build:powerplatform${NC}"
echo -e "${GRAY}   3. Deploy to Power Pages: npm run deploy:powerplatform${NC}"
echo -e "${GRAY}   4. Or use dry-run mode: npm run deploy:powerplatform:dry-run${NC}"
echo ""
echo -e "${CYAN}📖 Full documentation: DEPLOY_POWERPLATFORM.md${NC}"
echo ""
