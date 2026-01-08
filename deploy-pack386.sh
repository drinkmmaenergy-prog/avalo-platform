#!/bin/bash

# PACK 386 - Global Marketing Automation Deployment Script
# Deploys all marketing automation components

set -e

echo "=========================================="
echo "PACK 386 - Global Marketing Automation"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Deploy Firestore Indexes
echo -e "${BLUE}Step 1: Deploying Firestore Indexes...${NC}"
firebase deploy --only firestore:indexes --non-interactive
echo -e "${GREEN}✓ Firestore indexes deployed${NC}"
echo ""

# Step 2: Deploy Firestore Rules
echo -e "${BLUE}Step 2: Deploying Firestore Rules...${NC}"
firebase deploy --only firestore:rules --non-interactive
echo -e "${GREEN}✓ Firestore rules deployed${NC}"
echo ""

# Step 3: Deploy Cloud Functions
echo -e "${BLUE}Step 3: Deploying Cloud Functions...${NC}"

# Campaign Functions
echo "  - Deploying campaign automation functions..."
firebase deploy --only \
  functions:pack386_createCampaign,\
  functions:pack386_updateCampaignBudget,\
  functions:pack386_autoPauseLowROI,\
  functions:pack386_scaleHighROI,\
  functions:pack386_updateCampaignMetrics,\
  functions:pack386_getCampaignAnalytics \
  --non-interactive

# Influencer Functions
echo "  - Deploying influencer management functions..."
firebase deploy --only \
  functions:pack386_registerInfluencer,\
  functions:pack386_assignInfluencerCampaign,\
  functions:pack386_setInfluencerPayoutModel,\
  functions:pack386_trackInfluencerAttribution,\
  functions:pack386_updateInfluencerConversion,\
  functions:pack386_calculateInfluencerROI,\
  functions:pack386_getInfluencerAnalytics \
  --non-interactive

# Attribution Functions
echo "  - Deploying attribution tracking functions..."
firebase deploy --only \
  functions:pack386_validateAttribution,\
  functions:pack386_updateAttributionOnVerification,\
  functions:pack386_updateAttributionOnPurchase,\
  functions:pack386_detectChurn,\
  functions:pack386_blockAttributionSource,\
  functions:pack386_getAttributionAnalytics \
  --non-interactive

# Review Functions
echo "  - Deploying review trigger functions..."
firebase deploy --only \
  functions:pack386_triggerSmartReviewPrompt,\
  functions:pack386_markReviewShown,\
  functions:pack386_markReviewCompleted,\
  functions:pack386_autoTriggerOnChat,\
  functions:pack386_autoTriggerOnMeeting,\
  functions:pack386_autoTriggerOnPayout,\
  functions:pack386_getReviewAnalytics \
  --non-interactive

# Fraud Functions
echo "  - Deploying marketing fraud detection functions..."
firebase deploy --only \
  functions:pack386_marketingFraudShield,\
  functions:pack386_reviewFraudSignal,\
  functions:pack386_getFraudDashboard \
  --non-interactive

# Budget Functions
echo "  - Deploying budget guardian functions..."
firebase deploy --only \
  functions:pack386_initializeBudgetRules,\
  functions:pack386_checkBudgetLimit,\
  functions:pack386_recordSpend,\
  functions:pack386_monitorBudgets,\
  functions:pack386_budgetKillSwitch,\
  functions:pack386_resetDailyBudgets,\
  functions:pack386_getBudgetDashboard \
  --non-interactive

echo -e "${GREEN}✓ All Cloud Functions deployed${NC}"
echo ""

# Summary
echo -e "${GREEN}=========================================="
echo "PACK 386 Deployment Complete!"
echo "==========================================${NC}"
echo ""
echo "Components Deployed:"
echo "  ✓ 39 Firestore Indexes"
echo "  ✓ Firestore Security Rules"
echo "  ✓ 6 Campaign Functions"
echo "  ✓ 7 Influencer Functions"
echo "  ✓ 6 Attribution Functions"
echo "  ✓ 7 Review Functions"
echo "  ✓ 3 Fraud Functions"
echo "  ✓ 7 Budget Functions"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Initialize budget rules: Call pack386_initializeBudgetRules()"
echo "  2. Configure campaign platforms (Meta, TikTok, Google, X)"
echo "  3. Register initial influencers"
echo "  4. Set up admin dashboard at admin-web/marketing/"
echo "  5. Review fraud detection thresholds"
echo ""
echo "Documentation: PACK_386_GLOBAL_MARKETING_AUTOMATION.md"
echo ""
