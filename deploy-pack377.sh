#!/bin/bash

# PACK 377 — Global Public Launch Orchestration Engine
# Deployment Script
# Version: 1.0.0

set -e

echo "========================================"
echo "🚀 PACK 377 Deployment"
echo "Global Public Launch Orchestration Engine"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}❌ Firebase CLI not found${NC}"
    echo "Install with: npm install -g firebase-tools"
    exit 1
fi

echo -e "${BLUE}📋 Step 1: Deploying Firestore Security Rules${NC}"
echo "   - Launch phases access control"
echo "   - Infrastructure metrics protection"
echo "   - Campaign management permissions"
echo "   - Regional analytics security"
echo ""

firebase deploy --only firestore:rules --config firebase.json

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Security rules deployed successfully${NC}"
else
    echo -e "${RED}❌ Security rules deployment failed${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}📊 Step 2: Deploying Firestore Indexes${NC}"
echo "   - Launch phases indexes"
echo "   - Campaign tracking indexes"
echo "   - Threat alert indexes"
echo "   - Region metrics indexes"
echo ""

firebase deploy --only firestore:indexes --config firebase.json

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Indexes deployed successfully${NC}"
else
    echo -e "${RED}❌ Indexes deployment failed${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}⚡ Step 3: Deploying Cloud Functions${NC}"
echo "   - pack377_activateCountryPhase"
echo "   - pack377_pauseCountryPhase"
echo "   - pack377_infraLoadGate"
echo "   - pack377_campaignTrafficForecast"
echo "   - pack377_campaignROITracker"
echo "   - pack377_launchThreatShield"
echo "   - pack377_regionKPIAggregator"
echo "   - pack377_regionRiskScorer"
echo "   - pack377_initMarketSequence"
echo ""

firebase deploy --only functions:pack377_activateCountryPhase,functions:pack377_pauseCountryPhase,functions:pack377_infraLoadGate,functions:pack377_campaignTrafficForecast,functions:pack377_campaignROITracker,functions:pack377_launchThreatShield,functions:pack377_regionKPIAggregator,functions:pack377_regionRiskScorer,functions:pack377_initMarketSequence

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Cloud Functions deployed successfully${NC}"
else
    echo -e "${RED}❌ Cloud Functions deployment failed${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}🔧 Step 4: Uploading Feature Flags Configuration${NC}"
echo "   - Uploading config/pack377-feature-flags.json to Firestore"
echo ""

# Upload feature flags to Firestore
firebase firestore:import config/pack377-feature-flags.json --collection launchFeatureFlags || {
    echo -e "${YELLOW}⚠️  Manual upload required for feature flags${NC}"
    echo "   Upload config/pack377-feature-flags.json to Firestore console"
}

echo ""
echo "========================================"
echo -e "${GREEN}✅ PACK 377 Deployment Complete!${NC}"
echo "========================================"
echo ""
echo -e "${BLUE}📝 Next Steps:${NC}"
echo ""
echo "1. Initialize Market Entry Sequence:"
echo "   Call: pack377_initMarketSequence()"
echo ""
echo "2. Activate First Country (Poland):"
echo "   Call: pack377_activateCountryPhase({..."
echo "     countryCode: 'PL',"
echo "     phase: 'alpha',"
echo "     dailyUserCap: 100,"
echo "     dailyPaymentCap: 1000,"
echo "     dailyCreatorCap: 10"
echo "   })"
echo ""
echo "3. Monitor Infrastructure:"
echo "   - Check infraMetrics collection"
echo "   - Monitor infraThrottleState/global"
echo ""
echo "4. Review Documentation:"
echo "   - Read PACK_377_IMPLEMENTATION.md"
echo "   - Set up monitoring dashboard"
echo "   - Configure alert notifications"
echo ""
echo -e "${YELLOW}⚠️  Important Reminders:${NC}"
echo "   - Feature flag 'launch.enabled' is OFF by default"
echo "   - Start with alpha phase for safety"
echo "   - Monitor metrics closely during first 48 hours"
echo "   - Keep admin team available for emergency response"
echo ""
echo "========================================"
echo -e "${GREEN}🎉 Ready for Controlled Global Launch!${NC}"
echo "========================================"
