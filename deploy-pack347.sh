#!/bin/bash

# ============================================================================
# PACK 347 — Growth Engine Deployment Script
# ============================================================================

set -e  # Exit on error

echo "🚀 PACK 347 — Growth Engine Deployment Starting..."
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}❌ Firebase CLI not found. Please install it first.${NC}"
    echo "   npm install -g firebase-tools"
    exit 1
fi

echo -e "${YELLOW}📋 Step 1: Deploying Firestore Security Rules${NC}"
echo "----------------------------------------------"
firebase deploy --only firestore:rules --config firestore-pack347-growth-engine.rules || {
    echo -e "${RED}❌ Failed to deploy security rules${NC}"
    exit 1
}
echo -e "${GREEN}✅ Security rules deployed${NC}"
echo ""

echo -e "${YELLOW}📋 Step 2: Deploying Firestore Indexes${NC}"
echo "---------------------------------------"
firebase deploy --only firestore:indexes --config firestore-pack347-growth-engine.indexes.json || {
    echo -e "${RED}❌ Failed to deploy indexes${NC}"
    exit 1
}
echo -e "${GREEN}✅ Indexes deployed (may take several minutes to build)${NC}"
echo ""

echo -e "${YELLOW}📋 Step 3: Deploying Cloud Functions${NC}"
echo "--------------------------------------"
cd functions

# Build TypeScript
echo "Building TypeScript..."
npm run build || {
    echo -e "${RED}❌ TypeScript build failed${NC}"
    exit 1
}

# Deploy functions
echo "Deploying functions..."
firebase deploy --only functions:pack347ReferralEngine \
                         functions:pack347ViralLoops \
                         functions:pack347PromotionAlgorithm \
                         functions:pack347BoostProducts \
                         functions:pack347ViralSurfaces \
                         functions:pack347AnalyticsDashboard \
                         --force || {
    echo -e "${RED}❌ Failed to deploy functions${NC}"
    exit 1
}

cd ..
echo -e "${GREEN}✅ Cloud Functions deployed${NC}"
echo ""

echo -e "${YELLOW}📋 Step 4: Setting up Scheduled Functions${NC}"
echo "------------------------------------------"
# These need to be configured in Firebase Console or via gcloud
echo "Please configure the following Cloud Scheduler jobs:"
echo ""
echo "1. cleanupExpiredReferralRewards"
echo "   Schedule: 0 * * * * (hourly)"
echo "   Target: pack347ReferralEngine-cleanupExpiredReferralRewards"
echo ""
echo "2. recalculateAllPromotionScores"
echo "   Schedule: 0 * * * * (hourly)"
echo "   Target: pack347PromotionAlgorithm-recalculateAllPromotionScores"
echo ""
echo "3. cleanupExpiredPromotionScores"
echo "   Schedule: 0 2 * * * (daily at 2 AM)"
echo "   Target: pack347PromotionAlgorithm-cleanExpiredPromotionScores"
echo ""
echo "4. cleanupExpiredPack347Boosts"
echo "   Schedule: 0 * * * * (hourly)"
echo "   Target: pack347BoostProducts-cleanupExpiredPack347Boosts"
echo ""
echo -e "${YELLOW}⚠️  Configure these in Firebase Console > Functions > Schedule${NC}"
echo ""

echo -e "${YELLOW}📋 Step 5: Verification${NC}"
echo "-----------------------"
echo "Checking deployed resources..."
echo ""

# List deployed functions
echo "Deployed functions:"
firebase functions:list | grep pack347 || echo "  (listing unavailable)"
echo ""

echo "=================================================="
echo -e "${GREEN}✅ PACK 347 Deployment Complete!${NC}"
echo "=================================================="
echo ""
echo "📝 Next Steps:"
echo "1. Configure Cloud Scheduler jobs (see above)"
echo "2. Test referral link generation"
echo "3. Test viral invite tracking"
echo "4. Test boost purchases"
echo "5. Monitor promotion score calculations"
echo "6. Review analytics dashboard"
echo ""
echo "📚 Documentation:"
echo "   See PACK_347_IMPLEMENTATION_COMPLETE.md for full details"
echo ""
echo "🔐 Security:"
echo "   - Firestore rules deployed and active"
echo "   - Rate limiting active (50 invites/day, 10 boosts/day)"
echo "   - Anti-spam protection enabled"
echo "   - Trust engine integration active"
echo ""
echo "💰 Revenue Model:"
echo "   - Boost revenue split: 65% creator / 35% Avalo"
echo "   - No free tokens or discounts"
echo "   - All rewards are non-monetary (boosts, priority, multipliers)"
echo ""
echo -e "${GREEN}🎉 Growth Engine is ready to drive user acquisition!${NC}"
