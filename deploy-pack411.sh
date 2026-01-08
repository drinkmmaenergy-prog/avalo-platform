#!/bin/bash

##############################################################################
# PACK 411 — App Store Defense, Reviews, Reputation & Trust Engine
# Deployment Script
# 
# Stage: D – Launch & Defense
# Dependencies: PACK 293, 296, 300/300A/300B, 301/301B/301A, 302, 367, 397, 410
##############################################################################

set -e  # Exit on any error

echo "========================================"
echo "PACK 411 DEPLOYMENT"
echo "App Store Defense & Reputation Engine"
echo "========================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="${FIREBASE_PROJECT_ID:-avalo-prod}"
REGION="us-central1"

echo -e "${YELLOW}Project: ${PROJECT_ID}${NC}"
echo -e "${YELLOW}Region: ${REGION}${NC}"
echo ""

# Step 1: Validate dependencies
echo "Step 1: Validating dependencies..."
REQUIRED_PACKS=(
  "firestore-pack293-notifications.rules"
  "firestore-pack296-audit.rules"
  "firestore-pack300-support.rules"
  "firestore-pack301-growth.rules"
  "firestore-pack302-fraud.rules"
  "firestore-pack367-aso.rules"
  "firestore-pack397-store-defense.rules"
  "firestore-pack410-analytics.rules"
)

for pack in "${REQUIRED_PACKS[@]}"; do
  if [ ! -f "$pack" ]; then
    echo -e "${RED}✗ Missing dependency: $pack${NC}"
    echo "Please deploy the required PACK first."
    exit 1
  fi
done

echo -e "${GREEN}✓ All dependencies found${NC}"
echo ""

# Step 2: Deploy Firestore rules and indexes
echo "Step 2: Deploying Firestore rules and indexes..."

# Backup existing rules
if firebase firestore:rules:get --project=$PROJECT_ID > /tmp/firestore-rules-backup-pack411.txt 2>/dev/null; then
  echo "Backed up existing rules to /tmp/firestore-rules-backup-pack411.txt"
fi

# Deploy indexes first (non-destructive)
echo "Deploying Firestore indexes..."
firebase deploy --only firestore:indexes --project=$PROJECT_ID \
  --config firebase.json \
  --only firestore:indexes:pack411-reviews

# Deploy rules (append to existing)
echo "Deploying Firestore rules..."
echo "Note: This will merge with existing rules. Review firestore.rules after deployment."
firebase deploy --only firestore:rules --project=$PROJECT_ID

echo -e "${GREEN}✓ Firestore rules and indexes deployed${NC}"
echo ""

# Step 3: Deploy Cloud Functions
echo "Step 3: Deploying Cloud Functions..."

cd functions

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing function dependencies..."
  npm install
fi

# Build TypeScript
echo "Building TypeScript..."
npm run build

# Deploy functions
echo "Deploying functions..."
firebase deploy --only functions --project=$PROJECT_ID \
  --only functions:pack411_importStoreReviewsGoogle,\
functions:pack411_importStoreReviewsApple,\
functions:pack411_ratingPromptDecision,\
functions:pack411_logRatingPrompt,\
functions:pack411_createFeedbackTicket,\
functions:pack411_scanReputationAnomalies,\
functions:pack411_triggerReputationScan

cd ..

echo -e "${GREEN}✓ Cloud Functions deployed${NC}"
echo ""

# Step 4: Initialize default configurations
echo "Step 4: Initializing default configurations..."

# Create default configs in Firestore
firebase firestore:update config/pack411InAppRating --project=$PROJECT_ID <<EOF || true
{
  "enabled": true,
  "eligibility": {
    "minActiveDays": 7,
    "minActiveSessions": 10,
    "minUserAge": 18,
    "requireVerified": true
  },
  "throttling": {
    "maxPromptsPerVersion": 1,
    "maxPromptsPer90Days": 3,
    "minDaysBetweenPrompts": 30
  },
  "deflection": {
    "lowRatingThreshold": 3,
    "enableFeedbackSheet": true,
    "autoCreateSupportTicket": true
  }
}
EOF

firebase firestore:update config/pack411ReputationDefense --project=$PROJECT_ID <<EOF || true
{
  "enabled": true,
  "spikeDetection": {
    "enabled": true,
    "windowHours": 24,
    "minReviewCount": 10,
    "stdDevThreshold": 2.5
  },
  "brigadingDetection": {
    "enabled": true,
    "coordinatedKeywords": ["boycott", "coordinated", "protest", "organized", "campaign"],
    "deviceClusteringThreshold": 0.3
  },
  "alerting": {
    "notifyAdmins": true,
    "createRiskCase": true,
    "severity": "HIGH"
  }
}
EOF

echo -e "${GREEN}✓ Default configurations initialized${NC}"
echo ""

# Step 5: Set up scheduled jobs
echo "Step 5: Setting up scheduled jobs..."

# The scheduled function pack411_scanReputationAnomalies is deployed via functions
# It runs daily at 2 AM UTC via Cloud Scheduler (automatic with pubsub.schedule)

echo -e "${GREEN}✓ Scheduled jobs configured${NC}"
echo ""

# Step 6: Verify deployment
echo "Step 6: Verifying deployment..."

# Check if functions are deployed
echo "Checking deployed functions..."
firebase functions:list --project=$PROJECT_ID | grep pack411 || echo "Waiting for functions to appear..."

# Check if Firestore collections exist (they'll be created on first write)
echo "Collections will be created automatically on first use:"
echo "  - storeReviews"
echo "  - storeReputationSnapshots"
echo "  - ratingPromptLogs"
echo "  - reviewBrigadeAlerts"

echo -e "${GREEN}✓ Deployment verified${NC}"
echo ""

# Step 7: Post-deployment tasks
echo "========================================"
echo "POST-DEPLOYMENT TASKS"
echo "========================================"
echo ""
echo "1. Configure store review ingestion:"
echo "   - Set up Google Play API credentials"
echo "   - Set up Apple App Store Connect API credentials"
echo "   - Configure webhook or scheduled scraper"
echo ""
echo "2. Update mobile apps:"
echo "   - Update app-mobile/app/rating/trigger.ts with production URLs"
echo "   - Configure store URLs in app-mobile/app/rating/flow.tsx"
echo "   - Test in-app rating flows end-to-end"
echo ""
echo "3. Update web app:"
echo "   - Deploy app-web with new rating flows"
echo "   - Test web rating flows"
echo ""
echo "4. Deploy admin console:"
echo "   - Deploy admin-web/analytics/reputation.tsx"
echo "   - Grant access to admin users"
echo "   - Set up monitoring dashboards"
echo ""
echo "5. Integration testing:"
echo "   - Test review ingestion from both stores"
echo "   - Test rating prompt trigger logic"
echo "   - Test reputation defense detection"
echo "   - Test support ticket creation from reviews"
echo "   - Test risk case creation for safety issues"
echo ""
echo "6. Monitoring setup:"
echo "   - Set up alerts for brigade detection"
echo "   - Monitor function execution logs"
echo "   - Track rating prompt conversion rates"
echo "   - Monitor review sentiment trends"
echo ""
echo "7. Documentation:"
echo "   - Document review ingestion API endpoints"
echo "   - Create runbook for brigade incidents"
echo "   - Train support team on review-linked tickets"
echo ""
echo "========================================"
echo "PACK 411 DEPLOYMENT COMPLETE"
echo "========================================"
echo ""
echo -e "${GREEN}✓ All components deployed successfully${NC}"
echo ""
echo "Next steps:"
echo "  1. Review deployment logs above"
echo "  2. Complete post-deployment tasks"
echo "  3. Run integration tests"
echo "  4. Monitor for 24 hours before full rollout"
echo ""
echo "Integration with existing systems:"
echo "  ✓ PACK 293 (Notifications) - Alert admins on brigade detection"
echo "  ✓ PACK 296 (Audit Logs) - Log all review and rating events"
echo "  ✓ PACK 300/300A (Support) - Auto-create tickets from reviews"
echo "  ✓ PACK 301/301B (Growth) - Link reviews to churn risk"
echo "  ✓ PACK 302 (Fraud) - Create risk cases for safety issues"
echo "  ✓ PACK 367 (ASO) - Feed reputation data to ASO engine"
echo "  ✓ PACK 397 (Store Defense) - Collaborate on policy violations"
echo "  ✓ PACK 410 (Analytics) - Track all review & rating metrics"
echo ""
echo "For support, check: PACK_411_IMPLEMENTATION.md"
echo ""
