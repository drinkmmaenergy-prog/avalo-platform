#!/bin/bash

###############################################################################
# PACK 346 — Post-Launch KPI Engine Deployment Script
# Global Analytics · Revenue Control · Safety Intelligence · Churn & Fraud Monitoring
###############################################################################

set -e  # Exit on error

echo "🚀 PACK 346 — Post-Launch KPI Engine Deployment"
echo "================================================"
echo ""

# Colors for output
GREEN='\033[0.32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}❌ Firebase CLI not found. Please install it first:${NC}"
    echo "npm install -g firebase-tools"
    exit 1
fi

echo "📋 Step 1: Deploying Firestore Security Rules..."
firebase deploy --only firestore:rules --config firestore-pack346-kpi.rules

echo ""
echo "📊 Step 2: Deploying Firestore Indexes..."
firebase deploy --only firestore:indexes --config firestore-pack346-kpi.indexes.json

echo ""
echo "⚙️  Step 3: Deploying Cloud Functions..."
echo "Functions to deploy:"
echo "  - aggregateDailyKPIs (scheduled)"
echo "  - aggregateHourlyKPIs (scheduled)"
echo "  - triggerKPIAggregation (callable)"
echo "  - detectRefundLoop (firestore trigger)"
echo "  - detectPanicSpam (firestore trigger)"
echo "  - detectFakeMismatch (firestore trigger)"
echo "  - detectBotBehavior (scheduled)"
echo "  - detectAIAbuse (firestore trigger)"
echo "  - detectCancellationFarming (scheduled)"
echo "  - detectTokenDrain (firestore trigger)"
echo "  - resolveAbuseSignal (callable)"
echo "  - acknowledgeAlert (callable)"
echo "  - resolveAlert (callable)"
echo "  - checkKPIThresholds (scheduled)"
echo "  - updateCreatorKPI* (firestore triggers)"
echo "  - refreshCreatorKPIs (scheduled)"
echo "  - getCreatorKPI (callable)"
echo "  - trackUserActivity (firestore trigger)"
echo "  - track*ForChurn (firestore triggers)"
echo "  - recalculateChurnScores (scheduled)"
echo "  - identifyAtRiskUsers (scheduled)"
echo "  - getChurnAnalytics (callable)"
echo ""

# Deploy functions
firebase deploy --only functions:aggregateDailyKPIs,functions:aggregateHourlyKPIs,functions:triggerKPIAggregation

firebase deploy --only functions:detectRefundLoop,functions:detectPanicSpam,functions:detectFakeMismatch,functions:detectBotBehavior,functions:detectAIAbuse,functions:detectCancellationFarming,functions:detectTokenDrain,functions:resolveAbuseSignal

firebase deploy --only functions:acknowledgeAlert,functions:resolveAlert,functions:checkKPIThresholds

firebase deploy --only functions:updateCreatorKPIOnChat,functions:updateCreatorKPIOnCall,functions:updateCreatorKPIOnBooking,functions:updateCreatorKPIOnRefund,functions:updateCreatorKPIOnSafety,functions:refreshCreatorKPIs,functions:getCreatorKPI

firebase deploy --only functions:trackUserActivity,functions:trackRefundForChurn,functions:trackPanicForChurn,functions:trackCancelForChurn,functions:recalculateChurnScores,functions:identifyAtRiskUsers,functions:getChurnAnalytics

echo ""
echo "🔧 Step 4: Initializing KPI Thresholds..."
echo "Creating default threshold configuration..."

# Use Firebase CLI to set initial thresholds
cat > /tmp/pack346-thresholds.json << 'EOF'
{
  "region": "global",
  "dailyRefundRatePercent": 4,
  "maxRefundsPerUser": 5,
  "maxRefundsPerCreator": 10,
  "panicTriggerThreshold": 10,
  "mismatchReportThreshold": 5,
  "tokenDrainVelocity": 500,
  "suspiciousCancellationRate": 40,
  "minCreatorResponseTimeSec": 300,
  "minCreatorCompletionRate": 80,
  "minDailyRevenuePLN": 1000,
  "maxRevenueDropPercent": 20
}
EOF

firebase firestore:write system/kpiThresholds/config/global /tmp/pack346-thresholds.json
rm /tmp/pack346-thresholds.json

echo ""
echo "📧 Step 5: Configuring Alert Channels..."
echo "Please configure these Firebase function config variables:"
echo ""
echo "  firebase functions:config:set slack.webhook_url=\"YOUR_SLACK_WEBHOOK_URL\""
echo "  firebase functions:config:set admin.emails=\"admin1@avalo.com,admin2@avalo.com\""
echo ""

echo ""
echo "✅ PACK 346 Deployment Complete!"
echo "================================================"
echo ""
echo "📊 KPI Engine Status:"
echo "  ✓ Daily aggregation scheduled at 00:05 UTC"
echo "  ✓ Hourly aggregation scheduled every hour"
echo "  ✓ Abuse detection active on all triggers"
echo "  ✓ Creator KPI tracking enabled"
echo "  ✓ Churn prediction running every 6 hours"
echo "  ✓ At-risk user identification at 10 AM UTC"
echo "  ✓ KPI threshold monitoring every 5 minutes"
echo ""
echo "🔍 Next Steps:"
echo "  1. Configure Slack webhook and admin emails (see above)"
echo "  2. Review KPI thresholds in Firestore: system/kpiThresholds/config/global"
echo "  3. Monitor initial KPI aggregation tomorrow at 00:05 UTC"
echo "  4. Check abuse signals: system/abuseSignals/signals"
echo "  5. Review alerts: system/alerts/active"
echo ""
echo "📖 Documentation: ./PACK_346_IMPLEMENTATION_COMPLETE.md"
echo ""
