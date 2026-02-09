#!/bin/bash
# ============================================================================
# PACK 452 — Monetization Engine vNext Deployment Script
#
# Deploys:
# - Firebase Functions (endpoints + scheduled jobs)
# - Firestore Security Rules
# - Firestore Indexes
#
# Usage:
#   chmod +x deploy-pack452.sh
#   ./deploy-pack452.sh [staging|production]
# ============================================================================

set -euo pipefail

ENV="${1:-staging}"
PROJECT_ID=""

if [ "$ENV" = "production" ]; then
  PROJECT_ID="avalo-production"
  echo "⚠️  DEPLOYING TO PRODUCTION"
  echo "Press Ctrl+C within 5 seconds to abort..."
  sleep 5
elif [ "$ENV" = "staging" ]; then
  PROJECT_ID="avalostaging"
else
  echo "Usage: ./deploy-pack452.sh [staging|production]"
  exit 1
fi

echo "============================================"
echo "PACK 452 — Monetization Engine vNext"
echo "Environment: $ENV"
echo "Project: $PROJECT_ID"
echo "============================================"

# Step 1: Deploy Firestore Indexes
echo ""
echo "📋 Step 1: Deploying Firestore indexes..."
firebase deploy --only firestore:indexes \
  --project "$PROJECT_ID" \
  || echo "⚠️  Index deployment may require manual creation"

# Step 2: Deploy Firestore Rules
echo ""
echo "🔒 Step 2: Deploying Firestore security rules..."
firebase deploy --only firestore:rules \
  --project "$PROJECT_ID" \
  || echo "⚠️  Rules deployment may need manual merge"

# Step 3: Deploy Cloud Functions
echo ""
echo "⚡ Step 3: Deploying Cloud Functions..."
firebase deploy --only functions:pack452_createPremiumOffer,functions:pack452_respondToPremiumOffer,functions:pack452_cancelPremiumOffer,functions:pack452_getPremiumOffers,functions:pack452_getEntryThreshold,functions:pack452_updateEntryThreshold,functions:pack452_getRevenueCoachSuggestions,functions:pack452_dismissRevenueCoachSuggestion,functions:pack452_getExclusiveStatus,functions:pack452_canRespondInChat,functions:pack452_expirePendingOffers,functions:pack452_expireExclusiveLocks,functions:pack452_revenueCoachDaily,functions:pack452_premiumKPIDaily \
  --project "$PROJECT_ID"

echo ""
echo "============================================"
echo "✅ PACK 452 deployment complete!"
echo ""
echo "Deployed functions:"
echo "  - pack452_createPremiumOffer"
echo "  - pack452_respondToPremiumOffer"
echo "  - pack452_cancelPremiumOffer"
echo "  - pack452_getPremiumOffers"
echo "  - pack452_getEntryThreshold"
echo "  - pack452_updateEntryThreshold"
echo "  - pack452_getRevenueCoachSuggestions"
echo "  - pack452_dismissRevenueCoachSuggestion"
echo "  - pack452_getExclusiveStatus"
echo "  - pack452_canRespondInChat"
echo "  - pack452_expirePendingOffers (every 15 min)"
echo "  - pack452_expireExclusiveLocks (every 5 min)"
echo "  - pack452_revenueCoachDaily (06:00 UTC)"
echo "  - pack452_premiumKPIDaily (02:00 UTC)"
echo ""
echo "New Firestore collections:"
echo "  - premiumOffers"
echo "  - exclusiveLocks"
echo "  - exclusiveSessionLogs"
echo "  - earningsLedger"
echo "  - premiumKPISnapshots"
echo "  - premiumKPICounters"
echo "  - users/{uid}/revenueCoachSuggestions"
echo ""
echo "Modified existing:"
echo "  - wallets/{uid} (added reservedTokens field)"
echo "  - users/{uid} (added chatEntryTokens field)"
echo "  - chats/{chatId} (added monetizationState, premiumContext)"
echo "============================================"
