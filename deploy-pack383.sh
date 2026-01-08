#!/bin/bash

# PACK 383 — Global Payment Routing, Compliance & Cross-Border Payout Engine
# Deployment Script

set -e

echo "======================================"
echo "PACK 383 Deployment"
echo "Global Payment Routing & Compliance"
echo "======================================"
echo ""

# Check Firebase CLI
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Install with: npm install -g firebase-tools"
    exit 1
fi

echo "✅ Firebase CLI found"
echo ""

# Deploy Firestore Rules
echo "📝 Deploying Firestore Security Rules..."
firebase deploy --only firestore:rules --project avaloapp || {
    echo "❌ Failed to deploy Firestore rules"
    exit 1
}
echo "✅ Firestore rules deployed"
echo ""

# Deploy Firestore Indexes
echo "📊 Deploying Firestore Indexes..."
firebase deploy --only firestore:indexes --project avaloapp || {
    echo "❌ Failed to deploy Firestore indexes"
    exit 1
}
echo "✅ Firestore indexes deployed"
echo ""

# Deploy Cloud Functions - Core Payout
echo "🚀 Deploying Core Payout Functions..."
firebase deploy --only functions:pack383_resolveOptimalPayoutRoute,functions:pack383_initiatePayout,functions:pack383_processPayoutQueue --project avaloapp || {
    echo "❌ Failed to deploy core payout functions"
    exit 1
}
echo "✅ Core payout functions deployed"
echo ""

# Deploy Cloud Functions - KYC/AML
echo "🔐 Deploying KYC/AML Functions..."
firebase deploy --only functions:pack383_submitKYC,functions:pack383_runAMLCheck,functions:pack383_runSanctionsScreening,functions:pack383_blockHighRiskPayout,functions:pack383_autoSanctionsScreening --project avaloapp || {
    echo "❌ Failed to deploy KYC/AML functions"
    exit 1
}
echo "✅ KYC/AML functions deployed"
echo ""

# Deploy Cloud Functions - Tax Engine
echo "💰 Deploying Tax Engine Functions..."
firebase deploy --only functions:pack383_calculateWithholding,functions:pack383_submitTaxProfile,functions:pack383_generateTaxReport,functions:pack383_generateAnnualTaxReports --project avaloapp || {
    echo "❌ Failed to deploy tax engine functions"
    exit 1
}
echo "✅ Tax engine functions deployed"
echo ""

# Deploy Cloud Functions - FX Engine
echo "💱 Deploying FX Conversion Functions..."
firebase deploy --only functions:pack383_convertTokenToLocalFiat,functions:pack383_getFXRate,functions:pack383_updateFXRates,functions:pack383_previewConversion --project avaloapp || {
    echo "❌ Failed to deploy FX functions"
    exit 1
}
echo "✅ FX functions deployed"
echo ""

# Deploy Cloud Functions - Limits
echo "📊 Deploying Payout Limits Functions..."
firebase deploy --only functions:pack383_enforcePayoutLimits,functions:pack383_getUserPayoutLimits,functions:pack383_upgradeUserRiskTier,functions:pack383_autoUpgradeRiskTiers --project avaloapp || {
    echo "❌ Failed to deploy limit functions"
    exit 1
}
echo "✅ Limit functions deployed"
echo ""

# Deploy Cloud Functions - Chargeback Firewall
echo "🛡️  Deploying Chargeback Protection Functions..."
firebase deploy --only functions:pack383_detectChargebackRisk,functions:pack383_applyPayoutFreeze,functions:pack383_createReserveHold,functions:pack383_releaseExpiredHolds,functions:pack383_handleChargebackNotification --project avaloapp || {
    echo "❌ Failed to deploy chargeback functions"
    exit 1
}
echo "✅ Chargeback functions deployed"
echo ""

echo "======================================"
echo "✅ PACK 383 Deployment Complete!"
echo "======================================"
echo ""
echo "📊 Deployed Components:"
echo "  ✅ Firestore Rules & Indexes"
echo "  ✅ 6 Cloud Function modules"
echo "  ✅ 22+ callable functions"
echo "  ✅ 6 scheduled functions"
echo ""
echo "🔗 Next Steps:"
echo "  1. Configure environment variables:"
echo "     firebase functions:config:set pack383.stripe_api_key=\"sk_live_...\""
echo "  2. Test payout routing:"
echo "     firebase functions:shell"
echo "  3. Monitor function logs:"
echo "     firebase functions:log"
echo "  4. Review admin dashboard at /admin/finance"
echo ""
echo "📖 Documentation: PACK_383_GLOBAL_PAYOUT_COMPLIANCE_ENGINE.md"
echo ""
