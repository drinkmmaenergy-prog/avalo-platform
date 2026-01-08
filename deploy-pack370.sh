#!/bin/bash

###############################################################################
# PACK 370: PREDICTIVE LTV ENGINE + ROAS OPTIMIZATION DEPLOYMENT
###############################################################################

set -e

echo "=========================================="
echo "🚀 PACK 370 DEPLOYMENT"
echo "   Predictive LTV Engine + ROAS Optimization"
echo "=========================================="
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}❌ Firebase CLI not found${NC}"
    echo "Install with: npm install -g firebase-tools"
    exit 1
fi

# Check if logged in to Firebase
if ! firebase projects:list &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in to Firebase${NC}"
    echo "Running: firebase login"
    firebase login
fi

echo -e "${GREEN}✓${NC} Firebase CLI ready"
echo ""

###############################################################################
# 1. DEPLOY FIRESTORE RULES AND INDEXES
###############################################################################

echo "────────────────────────────────────────"
echo "📋 Step 1: Deploying Firestore Rules & Indexes"
echo "────────────────────────────────────────"
echo ""

# Check if files exist
if [ ! -f "firestore-pack370-ltv.rules" ]; then
    echo -e "${RED}❌ firestore-pack370-ltv.rules not found${NC}"
    exit 1
fi

if [ ! -f "firestore-pack370-ltv.indexes.json" ]; then
    echo -e "${RED}❌ firestore-pack370-ltv.indexes.json not found${NC}"
    exit 1
fi

# Merge rules into main firestore.rules
echo "Merging PACK 370 rules into firestore.rules..."

if ! grep -q "PACK 370" firestore.rules 2>/dev/null; then
    cat firestore-pack370-ltv.rules >> firestore.rules
    echo -e "${GREEN}✓${NC} Rules merged"
else
    echo -e "${YELLOW}⚠️  PACK 370 rules already present${NC}"
fi

# Deploy rules
echo "Deploying Firestore rules..."
firebase deploy --only firestore:rules

# Deploy indexes
echo "Deploying Firestore indexes..."
firebase deploy --only firestore:indexes

echo -e "${GREEN}✓${NC} Firestore rules and indexes deployed"
echo ""

###############################################################################
# 2. DEPLOY CLOUD FUNCTIONS
###############################################################################

echo "────────────────────────────────────────"
echo "☁️  Step 2: Deploying Cloud Functions"
echo "────────────────────────────────────────"
echo ""

# Check if functions file exists
if [ ! -f "functions/src/pack370-ltv-engine.ts" ]; then
    echo -e "${RED}❌ functions/src/pack370-ltv-engine.ts not found${NC}"
    exit 1
fi

# Add export to functions/src/index.ts
echo "Adding PACK 370 exports to functions index..."

if ! grep -q "pack370" functions/src/index.ts 2>/dev/null; then
    cat >> functions/src/index.ts << 'EOF'

// PACK 370: Predictive LTV Engine
export {
  pack370_calculateLTVForecast,
  pack370_pushROASSignals,
  pack370_invalidateLTV,
  pack370_scheduledLTVRecalc,
  pack370_updateGeoLTVProfiles,
  pack370_adminLTVOverride
} from './pack370-ltv-engine';
EOF
    echo -e "${GREEN}✓${NC} Exports added"
else
    echo -e "${YELLOW}⚠️  PACK 370 exports already present${NC}"
fi

# Install dependencies
echo "Installing function dependencies..."
cd functions
npm install
cd ..

# Deploy functions
echo "Deploying Cloud Functions..."
firebase deploy --only functions:pack370_calculateLTVForecast,functions:pack370_pushROASSignals,functions:pack370_invalidateLTV,functions:pack370_scheduledLTVRecalc,functions:pack370_updateGeoLTVProfiles,functions:pack370_adminLTVOverride

echo -e "${GREEN}✓${NC} Cloud Functions deployed"
echo ""

###############################################################################
# 3. SEED INITIAL DATA
###############################################################################

echo "────────────────────────────────────────"
echo "🌱 Step 3: Seeding Initial Data"
echo "────────────────────────────────────────"
echo ""

# Create seed data script
cat > /tmp/seed-pack370.js << 'EOF'
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function seedData() {
  console.log('Seeding PACK 370 initial data...');
  
  // LTV Configuration
  await db.collection('ltvConfig').doc('multipliers').set({
    dating: 1.2,
    creators: 1.5,
    ai: 1.3,
    calendar: 1.4,
    updatedAt: admin.firestore.Timestamp.now()
  });
  console.log('✓ LTV multipliers seeded');
  
  // Geo benchmarks (initial estimates)
  const geoBenchmarks = [
    { country: 'PL', avgLTV: 50, avgCPI: 5, whaleRatio: 0.05, creatorActivityIndex: 0.3, riskIndex: 0.2 },
    { country: 'US', avgLTV: 80, avgCPI: 10, whaleRatio: 0.08, creatorActivityIndex: 0.5, riskIndex: 0.3 },
    { country: 'GB', avgLTV: 70, avgCPI: 8, whaleRatio: 0.06, creatorActivityIndex: 0.4, riskIndex: 0.25 },
    { country: 'DE', avgLTV: 65, avgCPI: 7, whaleRatio: 0.05, creatorActivityIndex: 0.35, riskIndex: 0.22 },
    { country: 'FR', avgLTV: 60, avgCPI: 6, whaleRatio: 0.04, creatorActivityIndex: 0.32, riskIndex: 0.23 }
  ];
  
  for (const geo of geoBenchmarks) {
    await db.collection('geoLTVProfiles').doc(geo.country).set({
      ...geo,
      updatedAt: admin.firestore.Timestamp.now()
    });
  }
  console.log(`✓ ${geoBenchmarks.length} geo benchmarks seeded`);
  
  // Feature flags
  await db.collection('featureFlags').doc('pack370').set({
    'ltv.enabled': true,
    'roas.prediction.enabled': true,
    'geo.ltv.enabled': true,
    updatedAt: admin.firestore.Timestamp.now()
  });
  console.log('✓ Feature flags configured');
  
  console.log('');
  console.log('✅ PACK 370 seed data complete');
  process.exit(0);
}

seedData().catch(err => {
  console.error('Error seeding data:', err);
  process.exit(1);
});
EOF

echo "Running seed script..."
node /tmp/seed-pack370.js

echo -e "${GREEN}✓${NC} Initial data seeded"
echo ""

###############################################################################
# 4. CONFIGURE FEATURE FLAGS
###############################################################################

echo "────────────────────────────────────────"
echo "🚩 Step 4: Configuring Feature Flags"
echo "────────────────────────────────────────"
echo ""

# Create feature flag config script
cat > /tmp/configure-pack370-flags.js << 'EOF'
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function configureFlags() {
  await db.collection('featureFlags').doc('pack370').set({
    'ltv.enabled': true,
    'roas.prediction.enabled': true,
    'geo.ltv.enabled': true,
    'ltv.recalc.enabled': true,
    'admin.ltv.override.enabled': true,
    updatedAt: admin.firestore.Timestamp.now()
  }, { merge: true });
  
  console.log('✓ Feature flags configured');
  process.exit(0);
}

configureFlags().catch(err => {
  console.error('Error configuring flags:', err);
  process.exit(1);
});
EOF

node /tmp/configure-pack370-flags.js

echo -e "${GREEN}✓${NC} Feature flags configured"
echo ""

###############################################################################
# 5. VERIFY DEPLOYMENT
###############################################################################

echo "────────────────────────────────────────"
echo "✅ Step 5: Verifying Deployment"
echo "────────────────────────────────────────"
echo ""

# List deployed functions
echo "Checking deployed functions..."
firebase functions:list | grep pack370 || echo -e "${YELLOW}⚠️  No functions found (may take a moment to appear)${NC}"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ PACK 370 DEPLOYMENT COMPLETE${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "📦 Components Deployed:"
echo "   • Firestore Rules & Indexes"
echo "   • 6 Cloud Functions"
echo "   • Initial Geo Benchmarks"
echo "   • LTV Configuration"
echo "   • Feature Flags"
echo ""
echo "🔗 Key Functions:"
echo "   • pack370_calculateLTVForecast - Manual LTV calculation"
echo "   • pack370_pushROASSignals - ROAS signal generation (every 6h)"
echo "   • pack370_scheduledLTVRecalc - Auto recalculation (every 2h)"
echo "   • pack370_updateGeoLTVProfiles - Geo intelligence (daily)"
echo "   • pack370_adminLTVOverride - Manual admin override"
echo "   • pack370_invalidateLTV - Fraud-triggered invalidation"
echo ""
echo "📊 Admin Dashboard:"
echo "   Location: admin-web/src/pages/ltv/"
echo "   URL: https://admin.avalo.app/ltv"
echo ""
echo "🔄 Integration Points:"
echo "   • PACK 277: Token spend velocity"
echo "   • PACK 301/301B: Retention segments"
echo "   • PACK 302: Fraud scores"
echo "   • PACK 369: Ad campaign optimization"
echo "   • PACK 296: Audit logging"
echo ""
echo "⚡ Next Steps:"
echo "   1. Monitor logs: firebase functions:log --only pack370"
echo "   2. Verify scheduled functions are running"
echo "   3. Access admin dashboard to view LTV metrics"
echo "   4. Test LTV calculation for sample users"
echo "   5. Verify ROAS signals are feeding back to PACK 369"
echo ""
echo -e "${YELLOW}💡 Note:${NC} Initial LTV calculations will begin within 2 hours"
echo -e "${YELLOW}💡 Note:${NC} ROAS signals will be generated every 6 hours"
echo ""

# Cleanup
rm -f /tmp/seed-pack370.js /tmp/configure-pack370-flags.js

echo "🎉 Deployment successful!"
echo ""
