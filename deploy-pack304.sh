#!/bin/bash

# PACK 304 — Admin Financial Console & Reconciliation
# Deployment Script
# 
# This script deploys all PACK 304 components to Firebase

set -e  # Exit on error

echo "=========================================="
echo "PACK 304 Deployment Script"
echo "Admin Financial Console & Reconciliation"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}Error: Firebase CLI is not installed${NC}"
    echo "Install it with: npm install -g firebase-tools"
    exit 1
fi

# Check if user is logged in
if ! firebase projects:list &> /dev/null; then
    echo -e "${YELLOW}You need to login to Firebase${NC}"
    firebase login
fi

echo -e "${GREEN}Step 1: Creating Cloud Storage bucket for exports${NC}"
echo "Checking if bucket exists..."

BUCKET_NAME="avalo-finance-exports"
REGION="europe-west3"

if gsutil ls gs://${BUCKET_NAME} &> /dev/null; then
    echo -e "${YELLOW}Bucket gs://${BUCKET_NAME} already exists${NC}"
else
    echo "Creating bucket gs://${BUCKET_NAME}..."
    gsutil mb -l ${REGION} gs://${BUCKET_NAME}
    echo -e "${GREEN}Bucket created successfully${NC}"
fi

echo ""
echo -e "${GREEN}Step 2: Deploying Firestore security rules${NC}"
firebase deploy --only firestore:rules \
  --config firestore-pack304-admin-finance.rules

echo ""
echo -e "${GREEN}Step 3: Deploying Firestore indexes${NC}"
firebase deploy --only firestore:indexes \
  --config firestore-pack304-admin-finance.indexes.json

echo ""
echo -e "${GREEN}Step 4: Building Cloud Functions${NC}"
cd functions
npm run build
cd ..

echo ""
echo -e "${GREEN}Step 5: Deploying Cloud Functions${NC}"

FUNCTIONS=(
  "pack304_getMonthlyOverview"
  "pack304_getMonthlyTrends"
  "pack304_getUserFinancialSummary"
  "pack304_listAnomalies"
  "pack304_updateAnomalyStatus"
  "pack304_exportMonthlyFinance"
  "pack304_exportCreatorSummary"
  "pack304_admin_triggerAggregation"
  "pack304_admin_triggerAnomalyDetection"
  "pack304_cronDailyAggregation"
)

# Deploy functions
FUNCTION_LIST=$(IFS=,; echo "${FUNCTIONS[*]}")
firebase deploy --only functions:${FUNCTION_LIST// /}

echo ""
echo -e "${GREEN}=========================================="
echo "Deployment Complete!"
echo "==========================================${NC}"
echo ""
echo "Next steps:"
echo ""
echo "1. Create admin users in Firestore:"
echo "   Collection: adminUsers"
echo "   Document ID: <admin-uid>"
echo "   Fields:"
echo "     - adminId: <admin-uid>"
echo "     - email: finance@avalo.app"
echo "     - role: FINANCE (or SUPERADMIN)"
echo "     - createdAt: <timestamp>"
echo ""
echo "2. Trigger initial aggregation:"
echo "   Use pack304_admin_triggerAggregation"
echo "   with current year/month"
echo ""
echo "3. Monitor daily job:"
echo "   Runs at 2 AM UTC daily"
echo "   Check logs: gcloud logging read"
echo "   'resource.labels.function_name=pack304_cronDailyAggregation'"
echo ""
echo -e "${YELLOW}Important: All functions require FINANCE or SUPERADMIN role${NC}"
echo ""
echo "Documentation:"
echo "  - Full guide: PACK_304_IMPLEMENTATION.md"
echo "  - Quick ref: PACK_304_QUICK_REFERENCE.md"
echo ""
echo -e "${GREEN}Done!${NC}"