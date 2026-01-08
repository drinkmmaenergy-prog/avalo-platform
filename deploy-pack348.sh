#!/bin/bash
# PACK 348 — Discovery & Feed Algorithm Control Panel Deployment

echo "🎯 PACK 348 — Discovery & Feed Algorithm Control Panel"
echo "======================================================"
echo ""
echo "Deploying Real-Time Ranking Governance System..."
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 1. Deploy Firestore indexes
echo -e "${BLUE}📊 Step 1: Deploying Firestore indexes...${NC}"
firebase deploy --only firestore:indexes --config firestore-pack348-ranking.indexes.json

# 2. Deploy Firestore rules
echo -e "${BLUE}🔒 Step 2: Deploying Firestore rules...${NC}"
firebase deploy --only firestore:rules --config firestore-pack348-ranking.rules

# 3. Initialize default ranking configuration
echo -e "${BLUE}⚙️  Step 3: Initializing default ranking configuration...${NC}"
node -e "
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function initializeConfig() {
  // Default ranking engine config
  await db.collection('system').doc('rankingEngine').set({
    discovery: {
      distanceWeight: 0.30,
      activityWeight: 0.25,
      ratingWeight: 0.20,
      earningsWeight: 0.15,
      refundPenaltyWeight: 0.05,
      mismatchPenaltyWeight: 0.05,
    },
    feed: {
      recencyWeight: 0.35,
      engagementWeight: 0.30,
      viralWeight: 0.25,
      boostWeight: 0.10,
    },
    swipe: {
      attractivenessWeight: 0.40,
      responseTimeWeight: 0.25,
      activityWeight: 0.20,
      reportPenaltyWeight: 0.15,
    },
    ai: {
      ratingWeight: 0.40,
      voiceUsageWeight: 0.25,
      chatUsageWeight: 0.25,
      abusePenaltyWeight: 0.10,
    },
    decay: {
      inactivityDecayPerDay: 0.02,
      refundDecayPerEvent: 0.05,
    },
  });

  // Safety penalties config
  await db.collection('system').doc('safetyPenalties').set({
    refundRatioThreshold: 0.15,
    refundRatioPenalty: 0.30,
    mismatchRateThreshold: 0.20,
    mismatchRatePenalty: 0.25,
    panicUsageThreshold: 2,
    panicUsagePenalty: 0.50,
    blockingRateThreshold: 0.10,
    blockingRatePenalty: 0.20,
    reportFrequencyThreshold: 5,
    reportFrequencyPenalty: 0.40,
    enableAutoSuppression: true,
  });

  // Tier routing config
  await db.collection('system').doc('tierRouting').set({
    royal: {
      discoveryPriority: false,
      paidSurfacesPriority: true,
      boostPriceMultiplier: 0.80,
      aiSearchPriority: false,
    },
    vip: {
      discoveryPriority: false,
      voiceSuggestionPriority: true,
      boostPriceMultiplier: 0.90,
      aiSearchPriority: false,
    },
    standard: {
      noArtificialBoost: true,
    },
  });

  // Create country overrides collection structure
  await db.collection('system').doc('rankingByCountry').set({ initialized: true });
  
  // Create A/B tests collection structure
  await db.collection('system').doc('abTests').set({ initialized: true });
  
  // Create audit logs collection structure
  await db.collection('system').doc('rankingAuditLogs').set({ initialized: true });

  console.log('✅ Default configurations initialized');
  process.exit(0);
}

initializeConfig().catch(err => {
  console.error('❌ Error initializing config:', err);
  process.exit(1);
});
"

# 4. Deploy Cloud Functions
echo -e "${BLUE}☁️  Step 4: Deploying Cloud Functions...${NC}"
cd functions
npm install
npm run build
cd ..

firebase deploy --only functions:calculateCreatorRanking,functions:getRankedDiscovery,functions:getRankedFeed,functions:getRankedAICompanions,functions:updateRankingConfig,functions:updateCountryRankingConfig,functions:createABTest,functions:disableABTest,functions:getABTestResults,functions:recalculateAllRankingsScheduled,functions:onUserMetricsUpdate

# 5. Deploy admin web UI
echo -e "${BLUE}🌐 Step 5: Deploying admin web UI...${NC}"
cd app-web
npm install
npm run build
cd ..

firebase deploy --only hosting:admin

# Done
echo ""
echo -e "${GREEN}✅ PACK 348 DEPLOYMENT COMPLETE${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Ranking Control Panel:"
echo "   https://admin.avalo.com/ranking-control"
echo ""
echo "🎛️  Features Deployed:"
echo "   ✅ Global ranking configuration"
echo "   ✅ Country-specific overrides"
echo "   ✅ Safety-aware penalties"
echo "   ✅ Royal/VIP routing gates"
echo "   ✅ A/B testing engine"
echo "   ✅ Audit logging system"
echo "   ✅ Real-time ranking calculation"
echo ""
echo "🔄 Automatic Processes:"
echo "   - Daily ranking recalculation (3 AM UTC)"
echo "   - Automatic ranking on metrics change"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT NOTES:${NC}"
echo ""
echo "1. Royal/VIP users do NOT get free discovery boosts"
echo "2. All tiers start with merit-based ranking"
echo "3. A/B tests cannot alter:"
echo "   - Revenue splits"
echo "   - Payout values"
echo "   - Refund policies"
echo "   - Safety/age rules"
echo ""
echo "4. All config changes are:"
echo "   - Audit logged"
echo "   - Timestamped"
echo "   - Reversible"
echo "   - Admin-ID signed"
echo ""
echo -e "${GREEN}🎉 Avalo now has full algorithm control!${NC}"
echo ""
