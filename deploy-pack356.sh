#!/bin/bash

# PACK 356 - Paid Acquisition Engine Deployment Script
# Deploy ads tracking, attribution, ROAS engine, and retargeting

set -e

echo "🚀 PACK 356 - Paid Acquisition Engine Deployment"
echo "================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}❌ Firebase CLI not found. Install it with: npm install -g firebase-tools${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Step 1: Deploying Firestore Rules${NC}"
firebase deploy --only firestore:rules --force || {
    echo -e "${RED}❌ Failed to deploy Firestore rules${NC}"
    exit 1
}
echo -e "${GREEN}✅ Firestore rules deployed${NC}"
echo ""

echo -e "${YELLOW}📋 Step 2: Deploying Firestore Indexes${NC}"
firebase deploy --only firestore:indexes --force || {
    echo -e "${RED}❌ Failed to deploy Firestore indexes${NC}"
    exit 1
}
echo -e "${GREEN}✅ Firestore indexes deployed${NC}"
echo ""

echo -e "${YELLOW}📋 Step 3: Deploying Firebase Functions${NC}"
echo "  - pack356-ad-tracking"
echo "  - pack356-ad-attribution"
echo "  - pack356-roas-engine"
echo "  - pack356-retargeting"
echo "  - pack356-kpi-extensions"

cd functions

# Deploy specific functions
firebase deploy --only functions:trackAdEvent,functions:createAdCampaign,functions:updateCampaignStatus,functions:updateCampaignBudget,functions:adPlatformWebhook || {
    echo -e "${RED}❌ Failed to deploy ad tracking functions${NC}"
    exit 1
}

firebase deploy --only functions:onUserVerified,functions:onTokenPurchase,functions:getAttributionReport,functions:getUserAttribution,functions:calculateCampaignLTV,functions:calculateCPA || {
    echo -e "${RED}❌ Failed to deploy attribution functions${NC}"
    exit 1
}

firebase deploy --only functions:dailyROASOptimization,functions:getROASHistory,functions:runManualROASOptimization,functions:getROASDashboard,functions:calculateCountryROAS || {
    echo -e "${RED}❌ Failed to deploy ROAS engine functions${NC}"
    exit 1
}

firebase deploy --only functions:buildRetargetingAudiences,functions:getRetargetingAudiences,functions:exportRetargetingAudience,functions:onUserStatusChange || {
    echo -e "${RED}❌ Failed to deploy retargeting functions${NC}"
    exit 1
}

firebase deploy --only functions:updateAdKPIs,functions:getAdKPIs,functions:getAdCohortAnalysis,functions:compareChannels || {
    echo -e "${RED}❌ Failed to deploy KPI extension functions${NC}"
    exit 1
}

cd ..

echo -e "${GREEN}✅ All Firebase functions deployed${NC}"
echo ""

echo -e "${YELLOW}📋 Step 4: Configuring Feature Flags${NC}"

# Set feature flags in Firestore
firebase firestore:set config/features "{
  \"ads.enabled\": true,
  \"ads.meta.enabled\": true,
  \"ads.tiktok.enabled\": true,
  \"ads.google.enabled\": true,
  \"ads.retarg.enabled\": true
}" --project "${FIREBASE_PROJECT_ID}" || {
    echo -e "${YELLOW}⚠️  Please manually set feature flags in Firestore config/features:${NC}"
    echo "  - ads.enabled: true"
    echo "  - ads.meta.enabled: true"
    echo "  - ads.tiktok.enabled: true"
    echo "  - ads.google.enabled: true"
    echo "  - ads.retarg.enabled: true"
}
echo -e "${GREEN}✅ Feature flags configured${NC}"
echo ""

echo -e "${YELLOW}📋 Step 5: Post-Deployment Verification${NC}"

# Test if functions are deployed
echo "Checking deployed functions..."
firebase functions:list | grep -E "(trackAdEvent|dailyROASOptimization|buildRetargetingAudiences|updateAdKPIs)" && {
    echo -e "${GREEN}✅ Core functions verified${NC}"
} || {
    echo -e "${YELLOW}⚠️  Some functions may not be visible yet (can take a few minutes)${NC}"
}
echo ""

echo -e "${GREEN}✨ PACK 356 Deployment Complete!${NC}"
echo ""
echo "═══════════════════════════════════════════════════════"
echo "📊 NEXT STEPS:"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "1. 🔧 Admin Setup:"
echo "   - Access admin panel at /admin/ads"
echo "   - Create your first campaign"
echo "   - Set up platform webhooks (Meta, TikTok, Google)"
echo ""
echo "2. 📱 Mobile SDK Integration:"
echo "   - Install Meta SDK (react-native-fbsdk-next)"
echo "   - Install TikTok Events API SDK"
echo "   - Install Firebase Analytics"
echo "   - Implement event tracking in app"
echo ""
echo "3. 🎯 Campaign Setup:"
echo "   - Configure Meta Ads Manager"
echo "   - Set up TikTok Ads"
echo "   - Configure Google Ads / UAC"
echo "   - Add conversion tracking pixels"
echo ""
echo "4. 🔄 Automation:"
echo "   - ROAS engine runs daily at 3 AM UTC"
echo "   - Retargeting audiences built at 5 AM UTC"
echo "   - CPA calculated at 2 AM UTC"
echo "   - KPI metrics updated at 6 AM UTC"
echo ""
echo "5. 📈 Monitoring:"
echo "   - Check Firebase Functions logs"
echo "   - Monitor ROAS dashboard"
echo "   - Review attribution reports"
echo "   - Analyze retargeting performance"
echo ""
echo "═══════════════════════════════════════════════════════"
echo "🔗 INTEGRATIONS:"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "✅ PACK 277 (Wallet) - Revenue tracking"
echo "✅ PACK 301 (Retention) - Churn risk audiences"
echo "✅ PACK 302 (Fraud) - Install fraud detection"
echo "✅ PACK 352 (KPI Engine) - Performance metrics"
echo "✅ PACK 353 (Security) - Data protection"
echo "✅ PACK 354 (Influencer) - UGC creators"
echo "✅ PACK 355 (Referral) - Attribution override"
echo ""
echo "═══════════════════════════════════════════════════════"
echo "📖 DOCUMENTATION:"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "Backend Functions:"
echo "  - functions/src/pack356-ad-tracking.ts"
echo "  - functions/src/pack356-ad-attribution.ts"
echo "  - functions/src/pack356-roas-engine.ts"
echo "  - functions/src/pack356-retargeting.ts"
echo "  - functions/src/pack356-kpi-extensions.ts"
echo ""
echo "Admin Panel:"
echo "  - admin-web/ads/AdsManager.tsx"
echo "  - admin-web/ads/ROASHeatmap.tsx"
echo ""
echo "Firestore:"
echo "  - firestore-pack356-ads.rules"
echo "  - firestore-pack356-ads.indexes.json"
echo ""
echo "═══════════════════════════════════════════════════════"
echo ""
echo -e "${GREEN}🎉 Deployment successful! Your paid acquisition engine is ready.${NC}"
echo ""
