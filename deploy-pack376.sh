#!/bin/bash

##############################################################################
# PACK 376: App Store Defense Deployment Script
# Deploys review system, trust engine, and ASO tracking
##############################################################################

set -e  # Exit on error

echo "=========================================="
echo "🛡️  PACK 376: App Store Defense"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Firebase project is set
if [ -z "$FIREBASE_PROJECT_ID" ]; then
  echo -e "${YELLOW}⚠️  FIREBASE_PROJECT_ID not set${NC}"
  read -p "Enter Firebase Project ID: " FIREBASE_PROJECT_ID
  export FIREBASE_PROJECT_ID
fi

echo -e "${BLUE}📋 Deployment Checklist:${NC}"
echo "  ✓ Review collection & monitoring"
echo "  ✓ Anti-review bombing system"
echo "  ✓ Trust score engine"
echo "  ✓ ASO optimization autopilot"
echo "  ✓ Positive review activation"
echo "  ✓ Reputation damage control"
echo "  ✓ Public trust signals"
echo ""

# Step 1: Deploy Firestore Rules
echo -e "${BLUE}Step 1: Deploying Firestore Security Rules...${NC}"
if [ -f "firestore-pack376-app-store-defense.rules" ]; then
  firebase deploy --only firestore:rules --project $FIREBASE_PROJECT_ID
  echo -e "${GREEN}✅ Firestore rules deployed${NC}"
else
  echo -e "${RED}❌ Rules file not found${NC}"
  exit 1
fi
echo ""

# Step 2: Deploy Firestore Indexes
echo -e "${BLUE}Step 2: Deploying Firestore Indexes...${NC}"
if [ -f "firestore-pack376-app-store-defense.indexes.json" ]; then
  firebase deploy --only firestore:indexes --project $FIREBASE_PROJECT_ID
  echo -e "${GREEN}✅ Firestore indexes deployed${NC}"
  echo -e "${YELLOW}⏳ Note: Index creation may take several minutes${NC}"
else
  echo -e "${RED}❌ Indexes file not found${NC}"
  exit 1
fi
echo ""

# Step 3: Deploy Cloud Functions
echo -e "${BLUE}Step 3: Deploying Cloud Functions...${NC}"
if [ -f "functions/src/pack376-app-store-defense.ts" ]; then
  cd functions
  
  # Install dependencies if needed
  if [ ! -d "node_modules" ]; then
    echo "Installing function dependencies..."
    npm install
  fi
  
  # Deploy functions
  firebase deploy --only functions:pack376_ingestStoreReview,functions:pack376_updateTrustScore,functions:pack376_trackASOMetrics,functions:pack376_generateKeywordOptimizationHints,functions:pack376_triggerReviewRequest,functions:pack376_reputationDamageControl,functions:pack376_generateTrustSignals --project $FIREBASE_PROJECT_ID
  
  cd ..
  echo -e "${GREEN}✅ Cloud Functions deployed${NC}"
else
  echo -e "${RED}❌ Functions file not found${NC}"
  exit 1
fi
echo ""

# Step 4: Initialize Feature Flags
echo -e "${BLUE}Step 4: Initializing Feature Flags...${NC}"
node -e "
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function initFlags() {
  await db.collection('featureFlags').doc('reviews').set({
    'reviews.ingest.enabled': true,
    'reviews.ask.enabled': true,
    'aso.autopilot.enabled': true,
    'anti.reviewBomb.enabled': true,
    'trustScore.enabled': true,
    'antiAttackMode': false,
    'initializedAt': admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  
  console.log('✅ Feature flags initialized');
  process.exit(0);
}

initFlags().catch(err => {
  console.error('❌ Error initializing flags:', err);
  process.exit(1);
});
" 2>/dev/null || echo -e "${YELLOW}⚠️  Could not initialize feature flags (manual setup required)${NC}"
echo ""

# Step 5: Verify Deployment
echo -e "${BLUE}Step 5: Verifying Deployment...${NC}"
echo "Checking deployed functions..."
firebase functions:list --project $FIREBASE_PROJECT_ID | grep pack376 || true
echo ""

# Step 6: Setup Scheduled Functions
echo -e "${BLUE}Step 6: Scheduled Functions Info${NC}"
echo "The following functions run automatically:"
echo "  • pack376_updateTrustScore: Every 6 hours"
echo "  • pack376_generateKeywordOptimizationHints: Every 24 hours"
echo "  • pack376_reputationDamageControl: Every 1 hour"
echo "  • pack376_generateTrustSignals: Every 12 hours"
echo ""

# Step 7: Configuration Summary
echo -e "${GREEN}=========================================="
echo "✅ PACK 376 Deployment Complete!"
echo "==========================================${NC}"
echo ""
echo -e "${BLUE}📊 System Components:${NC}"
echo "  ✓ Review Collection Engine"
echo "  ✓ Anti-Bombing Detection"
echo "  ✓ Trust Score Calculation"
echo "  ✓ ASO Tracking & Optimization"
echo "  ✓ Review Request System"
echo "  ✓ Reputation Monitoring"
echo "  ✓ Trust Signal Generation"
echo ""

echo -e "${BLUE}📱 Mobile SDK:${NC}"
echo "  Location: app-mobile/lib/pack376-store-defense.ts"
echo "  Components: app-mobile/app/components/TrustBadges.tsx"
echo "  Admin: app-mobile/app/admin/ defense.tsx"
echo ""

echo -e "${BLUE}🔧 Next Steps:${NC}"
echo "  1. Test review request flow in mobile app"
echo "  2. Monitor admin dashboard for threats"
echo "  3. Verify trust signals display correctly"
echo "  4. Check ASO metrics tracking"
echo "  5. Test anti-bombing detection"
echo ""

echo -e "${BLUE}📝 Important Notes:${NC}"
echo "  • Review requests limited to 1 per 14 days per user"
echo "  • Anti-attack mode triggers automatically on critical threats"
echo "  • Trust scores update every 6 hours"
echo "  • Reputation monitoring runs hourly"
echo "  • All actions logged in PACK 296 audit trail"
echo ""

echo -e "${YELLOW}⚠️  Security Reminders:${NC}"
echo "  • Review admin access permissions"
echo "  • Monitor review threat alerts"
echo "  • Test store appeal process"
echo "  • Verify fraud detection integration (PACK 302)"
echo "  • Check win-back campaign triggers (PACK 301B)"
echo ""

echo -e "${GREEN}🎯 PACK 376 is now active and protecting your app store reputation!${NC}"
echo ""

# Create deployment record
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) - PACK 376 deployed" >> deployment-history.log

exit 0
