#!/bin/bash

# ===========================================
# PACK 345 — Launch-Ready System Audit & Missing Gaps Scan
# Deployment Script
# ===========================================

set -e  # Exit on error

echo "============================================"
echo "PACK 345 Deployment"
echo "Launch Readiness & Compliance Engine"
echo "============================================"
echo ""

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI is not installed. Install it with: npm install -g firebase-tools"
    exit 1
fi

echo "✅ Firebase CLI detected"
echo ""

# Deploy Firestore Indexes
echo "📦 Deploying Firestore indexes..."
firebase deploy --only firestore:indexes &
PID_INDEXES=$!

# Deploy Firestore Rules
echo "🔒 Deploying Firestore security rules..."
firebase deploy --only firestore:rules --force &
PID_RULES=$!

# Wait for Firestore deployments
wait $PID_INDEXES
wait $PID_RULES

echo "✅ Firestore indexes and rules deployed"
echo ""

# Deploy Cloud Functions
echo "⚡ Deploying Cloud Functions..."
firebase deploy --only \
functions:pack345_runLaunchAudit,\
functions:pack345_triggerManualAudit,\
functions:pack345_getLaunchReadinessStatus,\
functions:pack345_getAuditLogs,\
functions:pack345_forceLaunch,\
functions:pack345_updateCountryConfig,\
functions:pack345_getAllCountryConfigs,\
functions:pack345_enableCountry,\
functions:pack345_disableCountry,\
functions:pack345_initializeCountries,\
functions:pack345_acceptTerms,\
functions:pack345_acceptPrivacy,\
functions:pack345_verifyAge,\
functions:pack345_getComplianceStatus \
--non-interactive || {
    echo "❌ Functions deployment failed"
    exit 1
}

echo "✅ Cloud Functions deployed"
echo ""

# Initialize Launch Readiness Data
echo "🔧 Initializing launch readiness data..."
echo "   (You'll need to manually call pack345_initializeCountries via Firebase Console or SDK)"
echo ""

echo "============================================"
echo "✅ PACK 345 DEPLOYMENT COMPLETE"
echo "============================================"
echo ""
echo "Deployed Components:"
echo "  ✓ TypeScript types (pack345-types.ts)"
echo "  ✓ Launch audit engine (pack345-launch-audit.ts)"
echo "  ✓ Country configuration (pack345-country-config.ts)"
echo "  ✓ Compliance middleware (pack345-compliance-middleware.ts)"
echo "  ✓ Firestore rules and indexes"
echo "  ✓ 14 Cloud Functions"
echo ""
echo "Next Steps:"
echo "  1. Initialize country configurations:"
echo "     → Call: pack345_initializeCountries()"
echo ""
echo "  2. Configure system documents:"
echo "     → system/config (age verification settings)"
echo "     → legal_terms collection (active terms)"
echo "     → legal_privacy collection (active privacy policy)"
echo "     → revenue_splits/{feature} (revenue split configs)"
echo ""
echo "  3. View launch readiness:"
echo "     → Open: /admin/launch-audit (when admin UI deployed)"
echo "     → Call: pack345_getLaunchReadinessStatus()"
echo ""
echo "  4. Trigger first audit:"
echo "     → Call: pack345_triggerManualAudit()"
echo "     → Or wait for scheduled audit (runs every 6 hours)"
echo ""
echo "============================================"
