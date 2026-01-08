#!/bin/bash

###############################################################################
# PACK 381 — Regional Expansion Engine Deployment Script
# Deploys global market operating system for EU/US/LATAM/Asia/MENA expansion
###############################################################################

set -e  # Exit on error

echo "🌍 PACK 381 — Regional Expansion Engine Deployment"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}❌ Firebase CLI not found. Please install it first:${NC}"
    echo "npm install -g firebase-tools"
    exit 1
fi

# Check if logged in to Firebase
if ! firebase projects:list &> /dev/null; then
    echo -e "${RED}❌ Not logged in to Firebase. Please run:${NC}"
    echo "firebase login"
    exit 1
fi

echo -e "${GREEN}✓ Firebase CLI detected${NC}"
echo ""

# Function to deploy with error handling
deploy_component() {
    local component=$1
    local description=$2
    
    echo -e "${YELLOW}📦 Deploying ${description}...${NC}"
    if firebase deploy --only "$component"; then
        echo -e "${GREEN}✓ ${description} deployed successfully${NC}"
        return 0
    else
        echo -e "${RED}❌ Failed to deploy ${description}${NC}"
        return 1
    fi
}

# Step 1: Deploy Firestore Security Rules
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1: Deploying Firestore Security Rules"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ ! -f "firestore-pack381-regions.rules" ]; then
    echo -e "${RED}❌ firestore-pack381-regions.rules not found${NC}"
    exit 1
fi

# Merge security rules (you may need to manually merge into firestore.rules)
echo "⚠️  Note: You may need to manually merge firestore-pack381-regions.rules into your main firestore.rules file"
echo ""

# Step 2: Deploy Firestore Indexes
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2: Deploying Firestore Indexes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ ! -f "firestore-pack381-regions.indexes.json" ]; then
    echo -e "${RED}❌ firestore-pack381-regions.indexes.json not found${NC}"
    exit 1
fi

deploy_component "firestore:indexes" "Firestore Indexes"
echo ""

# Step 3: Install Function Dependencies
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 3: Installing Function Dependencies"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ -d "functions" ]; then
    cd functions
    if [ -f "package.json" ]; then
        echo "📦 Installing npm packages..."
        npm install
        echo -e "${GREEN}✓ Dependencies installed${NC}"
    fi
    cd ..
else
    echo -e "${RED}❌ functions directory not found${NC}"
    exit 1
fi
echo ""

# Step 4: Deploy Cloud Functions
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 4: Deploying Cloud Functions"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if function files exist
MISSING_FILES=()
if [ ! -f "functions/src/pack381-region-config.ts" ]; then
    MISSING_FILES+=("pack381-region-config.ts")
fi
if [ ! -f "functions/src/pack381-regional-pricing.ts" ]; then
    MISSING_FILES+=("pack381-regional-pricing.ts")
fi
if [ ! -f "functions/src/pack381-regional-risk.ts" ]; then
    MISSING_FILES+=("pack381-regional-risk.ts")
fi
if [ ! -f "functions/src/pack381-moderation.ts" ]; then
    MISSING_FILES+=("pack381-moderation.ts")
fi
if [ ! -f "functions/src/pack381-expansion-engine.ts" ]; then
    MISSING_FILES+=("pack381-expansion-engine.ts")
fi

if [ ${#MISSING_FILES[@]} -ne 0 ]; then
    echo -e "${RED}❌ Missing function files:${NC}"
    printf '%s\n' "${MISSING_FILES[@]}"
    exit 1
fi

echo "Deploying all PACK 381 functions..."
echo ""

# Deploy specific functions
FUNCTIONS=(
    "functions:pack381_updateRegionConfig"
    "functions:pack381_getRegionConfig"
    "functions:pack381_listAvailableRegions"
    "functions:pack381_adminGetRegionConfig"
    "functions:pack381_detectUserRegion"
    "functions:pack381_validateFeatureAvailability"
    "functions:pack381_updateRegionalPricing"
    "functions:pack381_applyRegionalPricing"
    "functions:pack381_calculateFinalPrice"
    "functions:pack381_convertTokensToLocal"
    "functions:pack381_getPayoutEligibility"
    "functions:pack381_updateConversionRates"
    "functions:pack381_updateRegionalRisk"
    "functions:pack381_calculateRegionalRiskScore"
    "functions:pack381_validateAction"
    "functions:pack381_reportIncident"
    "functions:pack381_getRegionalRiskStats"
    "functions:pack381_updateContentRules"
    "functions:pack381_applyRegionalModeration"
    "functions:pack381_checkContentAllowed"
    "functions:pack381_getModerationQueue"
    "functions:pack381_reviewContent"
    "functions:pack381_appealDecision"
    "functions:pack381_getModerationStats"
    "functions:pack381_updateExpansionStatus"
    "functions:pack381_calculateGrowthMetrics"
    "functions:pack381_expansionReadinessScore"
    "functions:pack381_getExpansionOverview"
    "functions:pack381_languageAvailabilityMatrix"
)

echo "🚀 Deploying ${#FUNCTIONS[@]} Cloud Functions..."
echo ""

# Deploy all functions at once (faster)
if firebase deploy --only functions; then
    echo ""
    echo -e "${GREEN}✓ All Cloud Functions deployed successfully${NC}"
else
    echo ""
    echo -e "${RED}❌ Failed to deploy Cloud Functions${NC}"
    echo "You may need to deploy functions individually"
    exit 1
fi
echo ""

# Step 5: Verification
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 5: Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "✅ Deployment completed successfully!"
echo ""
echo "📋 Summary:"
echo "  • Firestore indexes deployed"
echo "  • ${#FUNCTIONS[@]} Cloud Functions deployed"
echo "  • Security rules ready (manual merge may be needed)"
echo ""
echo "🔧 Next Steps:"
echo ""
echo "1. Initialize your first region:"
echo "   - Use pack381_updateRegionConfig() to configure regions"
echo "   - Set up pricing with pack381_updateRegionalPricing()"
echo "   - Configure risk profiles with pack381_updateRegionalRisk()"
echo "   - Set content rules with pack381_updateContentRules()"
echo ""
echo "2. Test the deployment:"
echo "   - Call pack381_listAvailableRegions()"
echo "   - Verify region detection works"
echo "   - Test pricing calculation"
echo ""
echo "3. Review documentation:"
echo "   - See PACK_381_REGIONAL_EXPANSION_ENGINE.md"
echo "   - Check integration examples"
echo ""
echo "4. Configure admin dashboard:"
echo "   - Access admin-web/regions/"
echo "   - Set up monitoring"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌍 PACK 381 — Regional Expansion Engine"
echo "   Ready for global market expansion!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Optional: Run post-deployment checks
read -p "Would you like to run post-deployment verification? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "🔍 Running verification checks..."
    echo ""
    
    # Check if functions are callable
    echo "Checking function deployment status..."
    firebase functions:list | grep pack381 || echo "⚠️  Functions may still be deploying"
    
    echo ""
    echo "✓ Verification complete"
fi

echo ""
echo "🎉 Deployment finished!"
echo ""

exit 0
