#!/bin/bash

# PACK 301B - Retention Automation Engine Deployment Script
# Deploys all Cloud Functions, Firestore rules, and indexes

set -e  # Exit on error

echo "=========================================="
echo "PACK 301B Deployment Script"
echo "Retention Automation Engine"
echo "=========================================="
echo ""

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Install with: npm install -g firebase-tools"
    exit 1
fi

echo "✅ Firebase CLI found"
echo ""

# Step 1: Deploy Firestore Indexes
echo "📊 Step 1/3: Deploying Firestore Indexes..."
echo "This will create 12 composite indexes (may take 5-10 minutes)"
firebase deploy --only firestore:indexes --project avalo-production

if [ $? -eq 0 ]; then
    echo "✅ Indexes deployed successfully"
else
    echo "❌ Index deployment failed"
    exit 1
fi
echo ""

# Step 2: Deploy Firestore Rules
echo "🔒 Step 2/3: Deploying Firestore Security Rules..."
firebase deploy --only firestore:rules --project avalo-production

if [ $? -eq 0 ]; then
    echo "✅ Security rules deployed successfully"
else
    echo "❌ Rules deployment failed"
    exit 1
fi
echo ""

# Step 3: Build and Deploy Cloud Functions
echo "☁️ Step 3/3: Building and Deploying Cloud Functions..."
cd functions

echo "Building TypeScript..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build successful"
else
    echo "❌ Build failed"
    exit 1
fi

echo ""
echo "Deploying PACK 301B Cloud Functions..."
echo "This includes:"
echo "  - 15+ callable functions (API endpoints)"
echo "  - 5 Firestore triggers (auto-tracking)"
echo "  - 3 scheduled functions (CRON jobs)"
echo ""

# Deploy all pack301 functions
firebase deploy --only functions:pack301 --project avalo-production

if [ $? -eq 0 ]; then
    echo "✅ Cloud Functions deployed successfully"
else
    echo "❌ Function deployment failed"
    exit 1
fi

cd ..

echo ""
echo "=========================================="
echo "✅ PACK 301B DEPLOYMENT COMPLETE"
echo "=========================================="
echo ""
echo "Deployed Components:"
echo "  ✅ 12 Firestore composite indexes"
echo "  ✅ Security rules for 4 collections"
echo "  ✅ Onboarding funnel tracking"
echo "  ✅ Retention nudges engine"
echo "  ✅ Daily churn recalculation (2 AM UTC)"
echo "  ✅ Win-back automation (3 AM UTC)"
echo "  ✅ Retention analytics (5 AM UTC)"
echo "  ✅ Activity tracking (real-time)"
echo ""
echo "Next Steps:"
echo "  1. Monitor function logs: firebase functions:log --only pack301"
echo "  2. Check scheduled jobs in Cloud Console"
echo "  3. Verify notifications in PACK 293"
echo "  4. Test with sample users"
echo "  5. Review analytics in retentionAnalytics collection"
echo ""
echo "Scheduled Jobs:"
echo "  - 2 AM UTC: Daily churn recalculation"
echo "  - 3 AM UTC: Win-back message delivery"
echo "  - 5 AM UTC: Retention analytics aggregation"
echo ""
echo "🚀 Retention Automation Engine is LIVE!"
echo ""