#!/bin/bash

# ============================================
# PACK 393 - Marketing Orchestration Engine
# Deployment Script
# ============================================

set -e  # Exit on error

echo "🚀 ======================================"
echo "🚀 PACK 393 - Marketing Orchestration"
echo "🚀 Deployment Starting..."
echo "🚀 ======================================"

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Please install it first:"
    echo "   npm install -g firebase-tools"
    exit 1
fi

# Check if logged in
if ! firebase projects:list &> /dev/null; then
    echo "❌ Not logged in to Firebase. Please run:"
    echo "   firebase login"
    exit 1
fi

echo ""
echo "📋 Step 1: Deploying Firestore Rules & Indexes"
echo "---------------------------------------------"

firebase deploy --only firestore:rules \
  --config firestore-pack393-marketing.rules

firebase deploy --only firestore:indexes \
  --config firestore-pack393-marketing.indexes.json

echo "✅ Firestore rules and indexes deployed"

echo ""
echo "📦 Step 2: Building Cloud Functions"
echo "---------------------------------------------"

cd functions
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Functions build failed"
    exit 1
fi

echo "✅ Functions built successfully"

echo ""
echo "☁️  Step 3: Deploying Cloud Functions"
echo "---------------------------------------------"

# Deploy orchestration functions
firebase deploy --only functions:pack393_marketingOrchestrator
firebase deploy --only functions:pack393_manualOrchestration
firebase deploy --only functions:pack393_getOrchestrationStatus

# Deploy influencer functions
firebase deploy --only functions:pack393_createInfluencerPartner
firebase deploy --only functions:pack393_trackInfluencerEvent
firebase deploy --only functions:pack393_processInfluencerPayouts
firebase deploy --only functions:pack393_checkInfluencerFraud
firebase deploy --only functions:pack393_getInfluencerDashboard

echo "✅ All functions deployed"

echo ""
echo "🌐 Step 4: Deploying Admin Web Components"
echo "---------------------------------------------"

cd ../admin-web
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Admin web build failed"
    exit 1
fi

firebase deploy --only hosting:admin

echo "✅ Admin web deployed"

cd ..

echo ""
echo "🎉 ======================================"
echo "🎉 PACK 393 Deployment Complete!"
echo "🎉 ======================================"
echo ""
echo "📊 Deployed Components:"
echo "  ✅ Firestore Rules & Indexes"
echo "  ✅ 8 Cloud Functions"
echo "  ✅ Admin Web Dashboard"
echo ""
echo "🔗 Next Steps:"
echo "  1. Verify functions in Firebase Console"
echo "  2. Test influencer onboarding flow"
echo "  3. Configure initial marketing budgets"
echo "  4. Set up payment processor integration"
echo "  5. Review orchestration reports"
echo ""
echo "📚 Documentation: PACK_393_MARKETING_ORCHESTRATION_ENGINE.md"
echo ""
