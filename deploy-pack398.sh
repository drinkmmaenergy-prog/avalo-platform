#!/bin/bash

# PACK 398 - PUBLIC LAUNCH ORCHESTRATION DEPLOYMENT
# Deploys all launch, ASO, viral referral, and traffic management systems

echo "🚀 PACK 398 - Public Launch Orchestration Deployment"
echo "=================================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}❌ Firebase CLI not found. Please install it first.${NC}"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "firebase.json" ]; then
    echo -e "${RED}❌ firebase.json not found. Please run from project root.${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}📋 Step 1: Deploying Firestore Security Rules${NC}"
echo "=================================================="
firebase deploy --only firestore:rules --force

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Firestore rules deployed successfully${NC}"
else
    echo -e "${RED}❌ Failed to deploy Firestore rules${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}📊 Step 2: Deploying Firestore Indexes${NC}"
echo "=================================================="
firebase deploy --only firestore:indexes --force

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Firestore indexes deployed successfully${NC}"
else
    echo -e "${RED}❌ Failed to deploy Firestore indexes${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}⚡ Step 3: Deploying Cloud Functions${NC}"
echo "=================================================="

# Build TypeScript functions
echo "Building TypeScript functions..."
cd functions
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to build functions${NC}"
    cd ..
    exit 1
fi

cd ..

# Deploy specific PACK 398 functions
echo "Deploying PACK 398 functions..."
firebase deploy --only functions:initializeLaunchControl,functions:configureCountryRollout,functions:updateCountryState,functions:emergencyStopLaunch,functions:resumeLaunch,functions:monitorLaunchHealth,functions:resetDailyBudgets,functions:getLaunchStatus --force

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Launch orchestrator functions deployed${NC}"
else
    echo -e "${RED}❌ Failed to deploy launch orchestrator functions${NC}"
    exit 1
fi

firebase deploy --only functions:createASOTest,functions:startASOTest,functions:pauseASOTest,functions:completeASOTest,functions:recordASOTestEvent,functions:trackKeywordPerformance,functions:recordStoreMetrics,functions:getASODashboard,functions:analyzeASOPerformance --force

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ ASO engine functions deployed${NC}"
else
    echo -e "${RED}❌ Failed to deploy ASO engine functions${NC}"
    exit 1
fi

firebase deploy --only functions:generateReferralCode,functions:createReferral,functions:completeReferral,functions:sendViralInvite,functions:getReferralStats,functions:getViralLeaderboard,functions:calculateLeaderboardRanks --force

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Viral referral engine functions deployed${NC}"
else
    echo -e "${RED}❌ Failed to deploy viral referral engine functions${NC}"
    exit 1
fi

firebase deploy --only functions:createCampaign,functions:updateCampaignStatus,functions:trackCampaignPerformance,functions:createInfluencerCohort,functions:predictUserLTV,functions:monitorCampaigns,functions:calculateCampaignROI,functions:getCampaignDashboard --force

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Traffic synchronizer functions deployed${NC}"
else
    echo -e "${RED}❌ Failed to deploy traffic synchronizer functions${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}🔧 Step 4: Initializing Launch Control${NC}"
echo "=================================================="
# Note: This step should be run manually by admin after deployment
echo "⚠️  Manual step required: Run initializeLaunchControl from Firebase Console"
echo "   or use the admin dashboard after deployment"

echo ""
echo -e "${GREEN}✅ PACK 398 DEPLOYMENT COMPLETE!${NC}"
echo "=================================================="
echo ""
echo "📝 Next Steps:"
echo "1. Initialize launch control via admin console"
echo "2. Configure country rollout settings"
echo "3. Set up ASO A/B tests"
echo "4. Configure campaigns and influencer cohorts"
echo "5. Enable automation and monitoring"
echo ""
echo "📊 Monitor deployment:"
echo "   • Launch Status: Check /launch_control/global"
echo "   • ASO Dashboard: Access via admin console"
echo "   • Viral Leaderboard: Check /viral_leaderboards"
echo "   • Campaign ROI: Monitor /campaign_roi"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: Review all security rules and test thoroughly${NC}"
echo ""
