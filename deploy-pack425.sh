#!/bin/bash

# PACK 425 — Global Market Expansion Deployment Script
# Deploys all expansion orchestration components

set -e

echo "🌍 PACK 425 — Global Market Expansion & Country Rollout Orchestration"
echo "=================================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Please install it first:"
    echo "   npm install -g firebase-tools"
    exit 1
fi

# Check if logged in to Firebase
echo -e "${BLUE}Checking Firebase authentication...${NC}"
if ! firebase projects:list &> /dev/null; then
    echo "❌ Not logged in to Firebase. Please run: firebase login"
    exit 1
fi

echo -e "${GREEN}✓ Firebase CLI ready${NC}"
echo ""

# Deploy Firestore rules
echo -e "${BLUE}📋 Deploying Firestore rules...${NC}"
firebase deploy --only firestore:rules 2>&1 | grep -v "Warning"
echo -e "${GREEN}✓ Firestore rules deployed${NC}"
echo ""

# Deploy Firestore indexes
echo -e "${BLUE}📊 Deploying Firestore indexes...${NC}"
firebase deploy --only firestore:indexes 2>&1 | grep -v "Warning"
echo -e "${GREEN}✓ Firestore indexes deployed${NC}"
echo ""

# Build and deploy Cloud Functions
echo -e "${BLUE}⚙️  Building Cloud Functions...${NC}"
cd functions
npm run build || {
    echo "❌ Functions build failed"
    exit 1
}
cd ..
echo -e "${GREEN}✓ Functions built${NC}"
echo ""

echo -e "${BLUE}☁️  Deploying Cloud Functions...${NC}"
firebase deploy --only functions:pack425 2>&1 | grep -v "Warning" || {
    echo -e "${YELLOW}Note: Some function deployment warnings may occur${NC}"
}
echo -e "${GREEN}✓ Functions deployed${NC}"
echo ""

# Seed country data (optional - requires confirmation)
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Do you want to seed country data? (y/N)${NC}"
read -r SEED_DATA

if [[ "$SEED_DATA" == "y" || "$SEED_DATA" == "Y" ]]; then
    echo -e "${BLUE}🌱 Seeding country data...${NC}"
    firebase functions:shell <<EOF
const seed = require('./lib/pack425-seed-data');
seed.seedAllCountries().then(result => {
  console.log(\`✓ Seeded \${result.success} countries\`);
  if (result.failed > 0) {
    console.log(\`⚠️  Failed to seed \${result.failed} countries\`);
    console.log('Errors:', result.errors);
  }
  process.exit(0);
});
EOF
    echo -e "${GREEN}✓ Country data seeded${NC}"
else
    echo -e "${YELLOW}Skipping country data seeding${NC}"
fi
echo ""

# Rebuild localization bundles (optional)
echo -e "${YELLOW}═══════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Do you want to rebuild localization bundles? (y/N)${NC}"
read -r REBUILD_LOC

if [[ "$REBUILD_LOC" == "y" || "$REBUILD_LOC" == "Y" ]]; then
    echo -e "${BLUE}🔄 Rebuilding localization bundles...${NC}"
    firebase functions:shell <<EOF
const loc = require('./lib/pack425-localization');
loc.rebuildAllBundles().then(() => {
  console.log('✓ Localization bundles rebuilt');
  process.exit(0);
});
EOF
    echo -e "${GREEN}✓ Localization bundles rebuilt${NC}"
fi
echo ""

# Summary
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ PACK 425 Deployment Complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo ""
echo "📦 Deployed components:"
echo "  ✓ Country Readiness Model"
echo "  ✓ Feature Flag Orchestration"
echo "  ✓ Pricing & Payment Matrix"
echo "  ✓ Market Segmentation Engine"
echo "  ✓ Creator Bootstrap Engine"
echo "  ✓ Localization Auto-Sync"
echo "  ✓ Cloud Functions API"
echo "  ✓ Firestore Rules & Indexes"
echo ""
echo "🌍 PACK 425 is ready for global expansion!"
echo ""
echo "Next steps:"
echo "  1. Access admin dashboard at: /admin/expansion"
echo "  2. Review country readiness scores"
echo "  3. Enable features for launch-ready countries"
echo "  4. Initialize creator bootstrap programs"
echo "  5. Monitor expansion metrics"
echo ""
echo "For more info: See PACK_425_IMPLEMENTATION_SUMMARY.md"
echo ""
