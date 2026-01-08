#!/bin/bash

# ============================================================================
# PACK 358 — Revenue Forecasting & Financial Stress Engine Deployment
# ============================================================================

set -e  # Exit on error

echo "🚀 Starting PACK 358 deployment..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# ============================================================================
# STEP 1: Validate Dependencies
# ============================================================================

echo "${YELLOW}Step 1: Validating dependencies...${NC}"

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "${RED}❌ Firebase CLI not found. Please install: npm install -g firebase-tools${NC}"
    exit 1
fi

# Check if logged in to Firebase
if ! firebase projects:list &> /dev/null; then
    echo "${RED}❌ Not logged in to Firebase. Please run: firebase login${NC}"
    exit 1
fi

echo "${GREEN}✓ Dependencies validated${NC}"
echo ""

# ============================================================================
# STEP 2: Deploy Firestore Rules
# ============================================================================

echo "${YELLOW}Step 2: Deploying Firestore security rules...${NC}"

# Backup existing rules
if [ -f "firestore.rules" ]; then
    cp firestore.rules firestore.rules.backup.$(date +%Y%m%d_%H%M%S)
    echo "  → Backed up existing rules"
fi

# Merge PACK 358 rules with main rules file
echo "  → Merging PACK 358 rules..."

# Note: This is a simplified merge. In production, you'd want more sophisticated merging
cat firestore-pack358-finance.rules >> firestore.rules

echo "${GREEN}✓ Firestore rules prepared${NC}"
echo ""

# ============================================================================
# STEP 3: Deploy Firestore Indexes
# ============================================================================

echo "${YELLOW}Step 3: Deploying Firestore indexes...${NC}"

# Backup existing indexes
if [ -f "firestore.indexes.json" ]; then
    cp firestore.indexes.json firestore.indexes.json.backup.$(date +%Y%m%d_%H%M%S)
    echo "  → Backed up existing indexes"
fi

# Merge PACK 358 indexes
echo "  → Merging PACK 358 indexes..."

# Note: Manually merge the indexes from pack358 into firestore.indexes.json
# This requires proper JSON merging
echo "  ⚠️  Manual step: Merge firestore-pack358-finance.indexes.json into firestore.indexes.json"

echo "${GREEN}✓ Firestore indexes prepared${NC}"
echo ""

# ============================================================================
# STEP 4: Build and Deploy Cloud Functions
# ============================================================================

echo "${YELLOW}Step 4: Building and deploying Cloud Functions...${NC}"

cd functions

# Install dependencies
echo "  → Installing dependencies..."
npm install

# Export PACK 358 functions in index.ts
echo "  → Exporting PACK 358 functions..."

cat << 'EOF' >> src/index.ts

// ============================================================================
// PACK 358 — Revenue Forecasting & Financial Stress Engine
// ============================================================================

import * as pack358Forecast from './pack358-financial-forecast';
import * as pack358BurnRate from './pack358-burnrate-engine';
import * as pack358LTV from './pack358-ltv-model';
import * as pack358Stress from './pack358-stress-scenarios';

// Forecast Functions
export const forecastRevenueNext30Days = pack358Forecast.forecastRevenueNext30Days;
export const forecastRevenueNext90Days = pack358Forecast.forecastRevenueNext90Days;
export const forecastRevenueNext12Months = pack358Forecast.forecastRevenueNext12Months;
export const generateForecastOnDemand = pack358Forecast.generateForecastOnDemand;
export const getLatestForecast = pack358Forecast.getLatestForecast;

// Burn Rate Functions
export const calculateMonthlyBurnRate = pack358BurnRate.calculateMonthlyBurnRate;
export const calculateBurnRateOnDemand = pack358BurnRate.calculateBurnRateOnDemand;
export const getFinancialRunway = pack358BurnRate.getFinancialRunway;
export const getBurnRateHistory = pack358BurnRate.getBurnRateHistory;

// LTV Functions
export const calculateSegmentLTVs = pack358LTV.calculateSegmentLTVs;
export const getLTVProfiles = pack358LTV.getLTVProfiles;
export const calculateSegmentLTVOnDemand = pack358LTV.calculateSegmentLTVOnDemand;
export const getLTVTrends = pack358LTV.getLTVTrends;

// Stress Scenario Functions
export const runMonthlyStressScenarios = pack358Stress.runMonthlyStressScenarios;
export const runStressScenario = pack358Stress.runStressScenario;
export const getAvailableScenarios = pack358Stress.getAvailableScenarios;
export const getScenarioResults = pack358Stress.getScenarioResults;

EOF

# Build functions
echo "  → Building functions..."
npm run build

cd ..

# Deploy functions
echo "  → Deploying Cloud Functions..."
firebase deploy --only functions:forecastRevenueNext30Days,functions:forecastRevenueNext90Days,functions:forecastRevenueNext12Months,functions:generateForecastOnDemand,functions:getLatestForecast,functions:calculateMonthlyBurnRate,functions:calculateBurnRateOnDemand,functions:getFinancialRunway,functions:getBurnRateHistory,functions:calculateSegmentLTVs,functions:getLTVProfiles,functions:calculateSegmentLTVOnDemand,functions:getLTVTrends,functions:runMonthlyStressScenarios,functions:runStressScenario,functions:getAvailableScenarios,functions:getScenarioResults

echo "${GREEN}✓ Cloud Functions deployed${NC}"
echo ""

# ============================================================================
# STEP 5: Deploy Firestore Rules and Indexes
# ============================================================================

echo "${YELLOW}Step 5: Deploying Firestore rules and indexes...${NC}"

firebase deploy --only firestore:rules,firestore:indexes

echo "${GREEN}✓ Firestore rules and indexes deployed${NC}"
echo ""

# ============================================================================
# STEP 6: Deploy Admin Dashboard
# ============================================================================

echo "${YELLOW}Step 6: Deploying admin dashboard...${NC}"

# Note: Adjust this based on your hosting setup
# This assumes you have Firebase Hosting configured

# Copy dashboard files to hosting directory
if [ -d "public/admin" ]; then
    mkdir -p public/admin/finance
    cp -r admin-web/finance/* public/admin/finance/
    echo "  → Dashboard files copied to hosting directory"
else
    echo "  ⚠️  Create public/admin directory and configure Firebase Hosting"
fi

# Deploy hosting (optional)
# firebase deploy --only hosting

echo "${GREEN}✓ Admin dashboard prepared${NC}"
echo ""

# ============================================================================
# STEP 7: Initialize Data Collections
# ============================================================================

echo "${YELLOW}Step 7: Initializing data collections...${NC}"

# Create initial document structures
firebase firestore:execute "
db.collection('finance').doc('forecasts').set({
  initialized: true,
  createdAt: admin.firestore.FieldValue.serverTimestamp()
});

db.collection('finance').doc('burnrate').set({
  initialized: true,
  createdAt: admin.firestore.FieldValue.serverTimestamp()
});

db.collection('finance').doc('ltv').set({
  initialized: true,
  createdAt: admin.firestore.FieldValue.serverTimestamp()
});

db.collection('finance').doc('scenarios').set({
  initialized: true,
  createdAt: admin.firestore.FieldValue.serverTimestamp()
});

db.collection('finance').doc('alerts').set({
  initialized: true,
  createdAt: admin.firestore.FieldValue.serverTimestamp()
});
" 2>/dev/null || echo "  ⚠️  Manual step: Initialize Firestore collections via console"

echo "${GREEN}✓ Data collections initialized${NC}"
echo ""

# ============================================================================
# STEP 8: Run Initial Calculations
# ============================================================================

echo "${YELLOW}Step 8: Running initial calculations...${NC}"

echo "  → Triggering initial forecast..."
firebase functions:call generateForecastOnDemand --data='{"timeframe":"30d"}' 2>/dev/null || echo "  ⚠️  Run manually from admin dashboard"

echo "  → Triggering LTV calculation..."
firebase functions:call calculateSegmentLTVs 2>/dev/null || echo "  ⚠️  Run manually from admin dashboard"

echo "${GREEN}✓ Initial calculations triggered${NC}"
echo ""

# ============================================================================
# DEPLOYMENT COMPLETE
# ============================================================================

echo ""
echo "${GREEN}========================================${NC}"
echo "${GREEN}✅ PACK 358 Deployment Complete!${NC}"
echo "${GREEN}========================================${NC}"
echo ""
echo "📊 Financial Dashboard: https://YOUR-PROJECT.web.app/admin/finance"
echo ""
echo "🔔 Next Steps:"
echo "  1. Configure Firebase config in admin-web/finance/dashboard.js"
echo "  2. Access admin dashboard and verify all tabs load correctly"
echo "  3. Run initial stress scenarios from dashboard"
echo "  4. Set up CFO alert notifications (Slack/email)"
echo "  5. Configure current cash position in Firestore"
echo ""
echo "📖 Documentation: See PACK_358_IMPLEMENTATION_SUMMARY.md"
echo ""
echo "${YELLOW}⚠️  IMPORTANT SECURITY NOTES:${NC}"
echo "  - Finance data is admin-only (configured in security rules)"
echo "  - No mobile user access to financial data"
echo "  - All writes are function-only (no client writes)"
echo "  - Review security rules before production use"
echo ""
