#!/bin/bash

# ============================================================================
# PACK 367 — APP STORE DEFENSE, REVIEWS, REPUTATION & TRUST ENGINE
# Deployment Script
# ============================================================================

set -e  # Exit on error

echo "🛡️ Deploying PACK 367 — App Store Defense & Reputation Engine"
echo "================================================================"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Deploy Firestore Rules
echo -e "${BLUE}📋 Step 1: Deploying Firestore Security Rules...${NC}"
firebase deploy --only firestore:rules

# Step 2: Deploy Firestore Indexes
echo -e "${BLUE}📋 Step 2: Deploying Firestore Indexes...${NC}"
firebase deploy --only firestore:indexes

# Step 3: Deploy Cloud Functions
echo -e "${BLUE}☁️ Step 3: Deploying Cloud Functions...${NC}"
firebase deploy --only functions:pack367_scanStoreReviews,functions:pack367_triggerDefenseAction,functions:pack367_deactivateDefenseAction,functions:pack367_checkReviewPromptEligibility,functions:pack367_getEligibleReviewPrompts,functions:pack367_recordPromptResponse,functions:pack367_getDefenseStatus,functions:pack367_expireDefenseActions,functions:pack367_cleanupExpiredPrompts,functions:pack367_monitorReviews

# Step 4: Initialize Default Configuration
echo -e "${BLUE}⚙️ Step 4: Initializing Default Configuration...${NC}"
cat << EOF | firebase firestore:set storeDefenseConfig/default
{
  "crisisThresholds": {
    "ratingDrop": 0.3,
    "ratingDropWindow": 48,
    "uninstallSpikePercent": 50,
    "uninstallSpikeWindow": 24,
    "fraudReviewClusterSize": 10,
    "fraudReviewClusterWindow": 24
  },
  "reviewPromptRules": {
    "enabled": true,
    "minDaysBetweenPrompts": 30,
    "blockedChurnSegments": ["CHURN_RISK", "FRAUD_FLAG", "SAFETY_UNDER_REVIEW"],
    "minUserRiskScore": 30,
    "maxPromptsPerUser": 3
  },
  "autoDefenseEnabled": true,
  "defenseActionDurations": {
    "pause_notifications": 24,
    "delay_updates": 48,
    "suppress_prompts": 24,
    "prioritize_support": 72,
    "show_crisis_banner": 168,
    "disable_invites": 48,
    "lock_referrals": 48,
    "shield_swipe": 24
  },
  "sentimentThresholds": {
    "fakeReviewScore": 0.7,
    "coordinatedAttackCorrelation": 0.7,
    "rageDetectionScore": -0.6
  },
  "updatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "updatedBy": "system_init"
}
EOF

echo ""
echo -e "${GREEN}✅ PACK 367 Deployment Complete!${NC}"
echo ""
echo "📊 System Components Deployed:"
echo "   ✓ Firestore Collections: storeReviewsMirror, storeReputationSignals, storeDefenseActions, storeCrisisEvents, storeReviewPrompts"
echo "   ✓ Cloud Functions: 10 functions for review scanning, defense actions, and review funnels"
echo "   ✓ Security Rules: Admin-only access for sensitive data"
echo "   ✓ Indexes: Optimized queries for reviews, signals, actions, and crisis events"
echo ""
echo "🛡️ Store Defense Features:"
echo "   • AI Review Sentiment Scanner"
echo "   • Automated Defense Actions"
echo "   • Crisis Mode Detection"
echo "   • Positive Review Funnel (Safe Mode)"
echo "   • Admin Dashboard Ready"
echo ""
echo "⚠️ COMPLIANCE:"
echo "   • Zero manipulation of store ratings"
echo "   • No incentives for fake reviews"
echo "   • All  defense actions passive & legal"
echo "   • Full audit trail mandatory"
echo ""
echo "🔗 Integrations:"
echo "   • PACK 296 (Audit)"
echo "   • PACK 300/300A (Support)"
echo "   • PACK 301/301A/B (Retention)"
echo "   • PACK 302 (Fraud)"
echo "   • PACK 400 (RetentionEngine)"
echo ""
echo "📖 Next Steps:"
echo "   1. Configure Admin Dashboard in admin-web/"
echo "   2. Set up App Store/Play Store API credentials"
echo "   3. Configure alert notifications for admins"
echo "   4. Test review scanning with sample data"
echo "   5. Monitor first 24 hours for false positives"
echo ""
echo -e "${YELLOW}⚠️ IMPORTANT: This pack requires manual App Store/Google Play API integration${NC}"
echo ""
