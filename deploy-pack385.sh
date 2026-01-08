#!/bin/bash

# =================================================================
# PACK 385 — Public Launch Orchestration Deployment Script
# =================================================================

set -e  # Exit on error

echo "🚀 Starting PACK 385 Deployment..."
echo "==================================================================="

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Check prerequisites
echo -e "\n${BLUE}Step 1: Checking prerequisites...${NC}"

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}❌ Firebase CLI not found. Please install it first:${NC}"
    echo "npm install -g firebase-tools"
    exit 1
fi
echo -e "${GREEN}✅ Firebase CLI found${NC}"

# Check if logged in to Firebase
if ! firebase projects:list &> /dev/null; then
    echo -e "${RED}❌ Not logged in to Firebase. Please run:${NC}"
    echo "firebase login"
    exit 1
fi
echo -e "${GREEN}✅ Firebase authentication verified${NC}"

# Step 2: Deploy Firestore Security Rules
echo -e "\n${BLUE}Step 2: Deploying Firestore Security Rules...${NC}"
firebase deploy --only firestore:rules --project avalo || {
    echo -e "${RED}❌ Failed to deploy Firestore rules${NC}"
    exit 1
}
echo -e "${GREEN}✅ Firestore rules deployed${NC}"

# Step 3: Deploy Firestore Indexes
echo -e "\n${BLUE}Step 3: Deploying Firestore Indexes...${NC}"
firebase deploy --only firestore:indexes --project avalo || {
    echo -e "${RED}❌ Failed to deploy Firestore indexes${NC}"
    exit 1
}
echo -e "${GREEN}✅ Firestore indexes deployed${NC}"
echo -e "${YELLOW}⚠️  Note: Index creation may take several minutes to complete${NC}"

# Step 4: Deploy Cloud Functions
echo -e "\n${BLUE}Step 4: Deploying Cloud Functions...${NC}"

echo -e "  ${BLUE}4.1: Launch Phase Controller...${NC}"
firebase deploy --only functions:pack385_setLaunchPhase,functions:pack385_getLaunchPhase,functions:pack385_checkFeatureEnabled,functions:pack385_getUserLimits,functions:pack385_enforcePhaseLimits --project avalo || {
    echo -e "${RED}❌ Failed to deploy launch phase functions${NC}"
    exit 1
}

echo -e "  ${BLUE}4.2: Market Activation Engine...${NC}"
firebase deploy --only functions:pack385_activateMarket,functions:pack385_getMarketConfig,functions:pack385_checkMarketFeature,functions:pack385_suspendMarket,functions:pack385_getActiveMarkets,functions:pack385_monitorMarketHealth --project avalo || {
    echo -e "${RED}❌ Failed to deploy market activation functions${NC}"
    exit 1
}

echo -e "  ${BLUE}4.3: Viral Referral System...${NC}"
firebase deploy --only functions:pack385_generateReferralLink,functions:pack385_attributeReferral,functions:pack385_processReferralReward,functions:pack385_getReferralStats,functions:pack385_unlockReferralRewards --project avalo || {
    echo -e "${RED}❌ Failed to deploy referral functions${NC}"
    exit 1
}

echo -e "  ${BLUE}4.4: Ambassador Program...${NC}"
firebase deploy --only functions:pack385_assignLaunchAmbassador,functions:pack385_getAmbassadorData,functions:pack385_applyAmbassadorMultiplier,functions:pack385_activateAmbassadorBoost,functions:pack385_trackAmbassadorPerformance,functions:pack385_getAmbassadorLeaderboard,functions:pack385_removeAmbassador,functions:pack385_calculateAmbassadorScores --project avalo || {
    echo -e "${RED}❌ Failed to deploy ambassador functions${NC}"
    exit 1
}

echo -e "  ${BLUE}4.5: Traffic Guard...${NC}"
firebase deploy --only functions:pack385_setTrafficLevel,functions:pack385_getTrafficGuard,functions:pack385_checkTrafficLimit,functions:pack385_dynamicTrafficProtection,functions:pack385_throttleUser,functions:pack385_monitorTrafficLoad,functions:pack385_cleanupThrottles --project avalo || {
    echo -e "${RED}❌ Failed to deploy traffic guard functions${NC}"
    exit 1
}

echo -e "  ${BLUE}4.6: Payout Safety...${NC}"
firebase deploy --only functions:pack385_launchPayoutSafetyFilter,functions:pack385_approvePayoutRequest,functions:pack385_rejectPayoutRequest,functions:pack385_processDelayedPayouts,functions:pack385_releaseFraudBuffers --project avalo || {
    echo -e "${RED}❌ Failed to deploy payout safety functions${NC}"
    exit 1
}

echo -e "${GREEN}✅ All Cloud Functions deployed${NC}"

# Step 5: Deploy Admin Web Panel
echo -e "\n${BLUE}Step 5: Deploying Admin Web Panel...${NC}"
firebase deploy --only hosting --project avalo || {
    echo -e "${RED}❌ Failed to deploy admin panel${NC}"
    exit 1
}
echo -e "${GREEN}✅ Admin panel deployed${NC}"

# Step 6: Initialize Launch Configuration
echo -e "\n${BLUE}Step 6: Initializing launch configuration...${NC}"

# Create initialization script
cat > /tmp/init-pack385.js << 'EOF'
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function initialize() {
  console.log('Setting initial launch phase...');
  await db.collection('launchPhases').doc('global').set({
    currentPhase: 'INTERNAL',
    config: {
      featureVisibility: {
        discovery: false,
        referrals: false,
        tokenPurchase: false,
        payouts: false,
        ads: false,
        storeReviews: false
      },
      limits: {
        maxDailyReferrals: 0,
        maxSwipesPerDay: 100,
        maxChatConcurrency: 5,
        payoutThreshold: 0
      },
      discovery: {
        globalReach: false,
        regionalOnly: false,
        inviteOnly: true
      }
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log('Setting traffic protection to NORMAL...');
  await db.collection('launchTrafficGuards').doc('global').set({
    enabled: true,
    level: 'NORMAL',
    triggers: {
      apiRateTightening: false,
      referralThrottles: false,
      swipeCapReduction: false,
      chatConcurrencyCaps: false,
      aiUsageBurstControl: false
    },
    limits: {
      apiRequestsPerMinute: 1000,
      maxConcurrentChats: 10000,
      maxSwipesPerHour: 100,
      maxReferralsPerHour: 10,
      maxAIRequestsPerMinute: 500
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log('✅ Launch configuration initialized');
  process.exit(0);
}

initialize().catch((error) => {
  console.error('❌ Initialization failed:', error);
  process.exit(1);
});
EOF

# Run initialization (requires Firebase Admin SDK setup)
echo -e "${YELLOW}⚠️  Manual step required: Run the initialization script${NC}"
echo -e "   node /tmp/init-pack385.js"

# Summary
echo -e "\n${GREEN}==================================================================="
echo -e "✅ PACK 385 Deployment Complete!"
echo -e "===================================================================${NC}"

echo -e "\n${BLUE}📦 What was deployed:${NC}"
echo "  ✅ 6 Cloud Function modules (35+ functions)"
echo "  ✅ Firestore security rules"
echo "  ✅ Firestore indexes (45+ indexes)"
echo "  ✅ Admin web control panel"

echo -e "\n${BLUE}🔧 Next Steps:${NC}"
echo "  1. Wait for Firestore indexes to complete (may take 5-15 minutes)"
echo "  2. Access admin panel: https://avalo.web.app/launch-control"
echo "  3. Set launch phase using the control panel"
echo "  4. Activate your first market"
echo "  5. Assign launch ambassadors"
echo "  6. Monitor system health in admin panel"

echo -e "\n${BLUE}📚 Documentation:${NC}"
echo "  Read: PACK_385_PUBLIC_LAUNCH_ORCHESTRATION.md"

echo -e "\n${BLUE}🔒 Security Reminders:${NC}"
echo "  ⚠️  Only admin users can access launch controls"
echo "  ⚠️  All admin actions are logged in auditLogs"
echo "  ⚠️  Test in staging environment first"

echo -e "\n${YELLOW}⚠️  Important: This pack is mandatory before any paid ads, influencers, or press exposure${NC}"

echo -e "\n${GREEN}🚀 Ready to orchestrate your global launch!${NC}\n"
