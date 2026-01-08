#!/bin/bash

# PACK 349 - Ad Engine, Brand Campaigns & Sponsored Content Control
# Deployment Script

set -e

echo "🚀 Deploying Pack 349 - Ad Engine & Brand Campaigns..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Firebase CLI
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Install it with: npm install -g firebase-tools"
    exit 1
fi

echo -e "${BLUE}📋 Step 1: Deploying Firestore Security Rules...${NC}"
firebase deploy --only firestore:rules

echo -e "${BLUE}📋 Step 2: Deploying Firestore Indexes...${NC}"
firebase firestore:indexes:deploy firestore-pack349-ads.indexes.json

echo -e "${BLUE}📋 Step 3: Building Functions...${NC}"
cd functions
npm run build
cd ..

echo -e "${BLUE}📋 Step 4: Deploying Cloud Functions...${NC}"
firebase deploy --only functions:pack349CreateAd,\
functions:pack349UpdateAd,\
functions:pack349DeleteAd,\
functions:pack349ActivateAd,\
functions:pack349PauseAd,\
functions:pack349ReportAd,\
functions:pack349CreateBrandCampaign,\
functions:pack349AddAdToCampaign,\
functions:pack349ActivateCampaign,\
functions:pack349PauseCampaign,\
functions:pack349EndCampaign,\
functions:pack349GetCampaignAnalytics,\
functions:pack349GetAdForFeed,\
functions:pack349GetAdsForDiscovery,\
functions:pack349RecordAdPlacement,\
functions:pack349RecordAdClick,\
functions:pack349RecordAdView,\
functions:pack349RecordAdConversion,\
functions:pack349CreateAdvertiserAccount,\
functions:pack349AddAdvertiserTokens,\
functions:pack349CreateCreatorSponsorship,\
functions:pack349EndCreatorSponsorship,\
functions:pack349GetCreatorAnalytics,\
functions:pack349RequestCreatorPayout,\
functions:pack349ProcessScheduledCampaigns,\
functions:pack349ProcessMinimumGuarantees

echo -e "${GREEN}✅ Pack 349 Deployment Complete!${NC}"
echo ""
echo -e "${YELLOW}📊 Deployment Summary:${NC}"
echo "  ✅ Firestore Security Rules"
echo "  ✅ Firestore Indexes (22 composite indexes)"
echo "  ✅ Cloud Functions (25 functions + 2 scheduled)"
echo ""
echo -e "${YELLOW}🔧 Next Steps:${NC}"
echo "  1. Initialize test advertiser accounts"
echo "  2. Set up admin roles in Firestore"
echo "  3. Create initial brand campaigns"
echo "  4. Test ad placement in different surfaces"
echo "  5. Monitor ad safety and moderation queue"
echo ""
echo -e "${BLUE}📚 Key Features Deployed:${NC}"
echo "  • Token-based ad billing system"
echo "  • Multi-ad brand campaigns"
echo "  • Sponsored creator profiles (65/35 split)"
echo "  • Real-time ad placement engine"
echo "  • Comprehensive safety validation"
echo "  • Ad analytics & reporting"
echo "  • Admin moderation tools"
echo ""
echo -e "${GREEN}🎉 Avalo Ad Engine is now live!${NC}"
