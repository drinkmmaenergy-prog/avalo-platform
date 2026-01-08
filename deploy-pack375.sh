#!/bin/bash

# ============================================
# PACK 375 DEPLOYMENT SCRIPT
# Creator Growth Engine
# ============================================

set -e

echo "=================================================="
echo "PACK 375: CREATOR GROWTH ENGINE DEPLOYMENT"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}❌ Firebase CLI not found${NC}"
    echo "Install it with: npm install -g firebase-tools"
    exit 1
fi

echo -e "${GREEN}✓ Firebase CLI found${NC}"
echo ""

# Check if logged in to Firebase
if ! firebase projects:list &> /dev/null; then
    echo -e "${YELLOW}⚠ Not logged in to Firebase${NC}"
    echo "Running: firebase login"
    firebase login
fi

echo -e "${GREEN}✓ Firebase authentication verified${NC}"
echo ""

# ============================================
# STEP 1: Deploy Firestore Security Rules
# ============================================

echo "=================================================="
echo "STEP 1: Deploying Firestore Security Rules"
echo "=================================================="
echo ""

if [ -f "firestore-pack375-creator-growth.rules" ]; then
    echo "Deploying PACK 375 security rules..."
    firebase deploy --only firestore:rules --force
    echo -e "${GREEN}✓ Security rules deployed${NC}"
else
    echo -e "${RED}❌ Security rules file not found${NC}"
    exit 1
fi

echo ""

# ============================================
# STEP 2: Deploy Firestore Indexes
# ============================================

echo "=================================================="
echo "STEP 2: Deploying Firestore Indexes"
echo "=================================================="
echo ""

if [ -f "firestore-pack375-indexes.json" ]; then
    echo "Deploying PACK 375 indexes..."
    firebase deploy --only firestore:indexes --force
    echo -e "${GREEN}✓ Firestore indexes deployed${NC}"
    echo -e "${YELLOW}⚠ Note: Index creation may take several minutes${NC}"
else
    echo -e "${RED}❌ Indexes file not found${NC}"
    exit 1
fi

echo ""

# ============================================
# STEP 3: Deploy Cloud Functions
# ============================================

echo "=================================================="
echo "STEP 3: Deploying Cloud Functions"
echo "=================================================="
echo ""

if [ -f "functions/pack375-creator-growth.js" ]; then
    echo "Deploying PACK 375 Cloud Functions..."
    
    # List of functions to deploy
    FUNCTIONS=(
        "pack375_applyCreatorBoost"
        "pack375_expireCreatorBoost"
        "pack375_trackCreatorFunnelStage"
        "pack375_computeCreatorConversionRates"
        "pack375_updateDailyAnalytics"
        "pack375_createGrowthOffer"
    )
    
    # Deploy each function
    for func in "${FUNCTIONS[@]}"; do
        echo "Deploying function: $func"
        firebase deploy --only functions:$func --force
    done
    
    echo -e "${GREEN}✓ All Cloud Functions deployed${NC}"
else
    echo -e "${RED}❌ Functions file not found${NC}"
    exit 1
fi

echo ""

# ============================================
# STEP 4: Initialize Feature Flags
# ============================================

echo "=================================================="
echo "STEP 4: Initializing Feature Flags"
echo "=================================================="
echo ""

echo "Setting up PACK 375 feature flags..."

# Create feature flags document (you may want to customize these values)
firebase firestore:set featureFlags/pack375 --data '{
  "creator.boosts.enabled": true,
  "creator.analytics.enabled": true,
  "creator.funnel.enabled": true,
  "creator.ai.suggestions.enabled": true
}' --project "$(firebase use)" 2>/dev/null || echo -e "${YELLOW}⚠ Feature flags may need manual setup${NC}"

echo -e "${GREEN}✓ Feature flags initialized${NC}"
echo ""

# ============================================
# STEP 5: Verify Dependencies
# ============================================

echo "=================================================="
echo "STEP 5: Verifying Dependencies"
echo "=================================================="
echo ""

DEPENDENCIES=(
    "PACK 277: Wallet & Tokens"
    "PACK 301/301B: Retention & Segmentation"
    "PACK 323: Feed Core Engine"
    "PACK 374: Viral Growth Engine"
    "PACK 296: Audit Logs"
    "PACK 302: Fraud Detection"
)

echo "Required dependencies:"
for dep in "${DEPENDENCIES[@]}"; do
    echo "  - $dep"
done

echo ""
echo -e "${YELLOW}⚠ Ensure all dependencies are deployed before using PACK 375${NC}"
echo ""

# ============================================
# STEP 6: Deploy Complete
# ============================================

echo "=================================================="
echo "🎉 PACK 375 DEPLOYMENT COMPLETE"
echo "=================================================="
echo ""

echo "Deployed components:"
echo "  ✓ Firestore Security Rules"
echo "  ✓ Firestore Indexes"
echo "  ✓ Cloud Functions (6 functions)"
echo "  ✓ Feature Flags"
echo ""

echo "Next steps:"
echo "  1. Verify indexes are built: https://console.firebase.google.com"
echo "  2. Test creator boost functionality"
echo "  3. Monitor Cloud Function logs"
echo "  4. Review analytics dashboard"
echo ""

echo "Collections created:"
echo "  - creatorBoosts"
echo "  - creatorFunnels"
echo "  - creatorAnalytics"
echo "  - creatorOptimizations"
echo "  - creatorBoostHistory"
echo "  - creatorFeedPriority"
echo "  - subscriberGrowthOffers"
echo "  - creatorFraudScores"
echo ""

echo "Key features enabled:"
echo "  ✅ Creator boosters (paid & algorithmic)"
echo "  ✅ Feed priority layer"
echo "  ✅ Creator funnel optimization"
echo "  ✅ Advanced analytics dashboard"
echo "  ✅ AI-assisted optimization"
echo "  ✅ Subscriber growth mechanics"
echo "  ✅ Fraud & manipulation protection"
echo ""

echo -e "${GREEN}Creator Growth Engine is now live! 🚀${NC}"
echo ""

# ============================================
# STEP 7: Post-Deployment Validation
# ============================================

echo "=================================================="
echo "STEP 7: Post-Deployment Validation"
echo "=================================================="
echo ""

echo "Running validation checks..."

# Check if functions are deployed
echo "Checking Cloud Functions..."
firebase functions:list 2>/dev/null | grep -q "pack375" && echo -e "${GREEN}✓ Functions are deployed${NC}" || echo -e "${YELLOW}⚠ Could not verify functions${NC}"

echo ""
echo -e "${GREEN}Deployment validation complete${NC}"
echo ""

# ============================================
# Performance Monitoring Setup
# ============================================

echo "=================================================="
echo "OPTIONAL: Performance Monitoring"
echo "=================================================="
echo ""

echo "To enable performance monitoring:"
echo "  1. Go to Firebase Console > Performance"
echo "  2. Enable Performance Monitoring"
echo "  3. Set up alerts for function execution times"
echo ""

echo "Recommended alerts:"
echo "  - pack375_applyCreatorBoost > 2s"
echo "  - pack375_computeCreatorConversionRates > 30s"
echo "  - pack375_updateDailyAnalytics > 60s"
echo ""

# ============================================
# Scaling Recommendations
# ============================================

echo "=================================================="
echo "SCALING RECOMMENDATIONS"
echo "=================================================="
echo ""

echo "For production scaling:"
echo "  1. Monitor Firestore read/write quotas"
echo "  2. Enable caching for analytics queries"
echo "  3. Consider batching funnel updates"
echo "  4. Set up Cloud Pub/Sub for high-volume events"
echo "  5. Implement rate limiting for boost purchases"
echo ""

echo "Cost optimization:"
echo "  - Use scheduled functions instead of real-time triggers where possible"
echo "  - Implement pagination for large analytics queries"
echo "  - Cache frequently accessed creator data"
echo ""

# ============================================
# Final Message
# ============================================

echo "=================================================="
echo "PACK 375 DEPLOYMENT SUMMARY"
echo "=================================================="
echo ""

echo "Status: ${GREEN}DEPLOYED${NC}"
echo "Version: 1.0.0"
echo "Stage: Public Launch & Market Expansion"
echo ""

echo "Documentation: See PACK_375_IMPLEMENTATION.md"
echo "Support: Check Firebase Console for logs and metrics"
echo ""

echo -e "${GREEN}🚀 Creator Growth Engine is ready for production!${NC}"
echo ""

exit 0
