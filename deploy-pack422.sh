#!/bin/bash

###############################################################################
# PACK 422 — Global Trust, Reputation & Moderation Intelligence (Tier-2)
# Deployment Script
###############################################################################

set -e

echo "🚀 Deploying PACK 422 - Reputation Intelligence..."

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Deploy Firestore indexes
echo -e "${BLUE}📊 Deploying Firestore indexes...${NC}"
firebase deploy --only firestore:indexes --config firestore-pack422-reputation.indexes.json

# Step 2: Deploy Firestore rules (merge with existing)
echo -e "${BLUE}🔒 Deploying Firestore security rules...${NC}"
# Note: You'll need to manually merge pack422-reputation.rules into your main firestore.rules

# Step 3: Deploy Cloud Functions
echo -e "${BLUE}⚡ Deploying Cloud Functions...${NC}"
firebase deploy --only functions:onBillingEvent,functions:onAbuseReport,functions:onMeetingStatusChange,functions:onQRVerification,functions:onTransactionComplete,functions:onDisputeCreated,functions:onFraudAlert,functions:onSafetyIncident,functions:onPanicEvent,functions:onUserRestrictionChange,functions:onSupportTicketCreated,functions:onSupportTicketUpdated,functions:onAIViolation,functions:onAIUserBlocked,functions:onUserChurn,functions:forceReputationRecalc,functions:onReputationChange,functions:checkUserPolicy

# Step 4: Verify deployment
echo -e "${GREEN}✅ PACK 422 deployed successfully!${NC}"

echo -e "${YELLOW}"
echo "=========================================="
echo "PACK 422 - Post-Deployment Checklist:"
echo "=========================================="
echo "✓ Firestore indexes created"
echo "✓ Cloud Functions deployed"
echo "✓ Triggers active"
echo ""
echo "⚠️  MANUAL STEPS REQUIRED:"
echo "1. Merge firestore-pack422-reputation.rules into main firestore.rules"
echo "2. Verify admin RBAC permissions for reputation access"
echo "3. Test reputation recalculation for sample users"
echo "4. Deploy admin dashboard to admin-web"
echo "5. Monitor initial reputation calculations"
echo ""
echo "📊 Key Metrics to Watch (PACK 421):"
echo "- product.reputation.recalc.count"
echo "- product.reputation.high_risk.count"
echo "- product.reputation.critical.count"
echo ""
echo "🔗 Related Systems:"
echo "- PACK 268: Safety Engine"
echo "- PACK 300A: Admin RBAC"
echo "- PACK 421: Observability"
echo "=========================================="
echo -e "${NC}"
