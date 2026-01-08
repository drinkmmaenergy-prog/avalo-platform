#!/bin/bash

# PACK 303 — Creator Earnings Dashboard & Monthly Statements
# Deployment Script

set -e

echo "======================================================================"
echo "PACK 303 — Creator Earnings Dashboard & Monthly Statements Deployment"
echo "======================================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}Error: Firebase CLI not found. Please install it first.${NC}"
    echo "npm install -g firebase-tools"
    exit 1
fi

# Check if logged in
if ! firebase projects:list &> /dev/null; then
    echo -e "${RED}Error: Not logged in to Firebase. Please login first.${NC}"
    echo "firebase login"
    exit 1
fi

echo -e "${GREEN}✓ Firebase CLI ready${NC}"
echo ""

# Step 1: Deploy Firestore Rules
echo "Step 1: Deploying Firestore Rules..."
echo "  - firestore-pack303-creator-earnings.rules"
firebase deploy --only firestore:rules
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Firestore rules deployed${NC}"
else
    echo -e "${RED}✗ Firestore rules deployment failed${NC}"
    exit 1
fi
echo ""

# Step 2: Deploy Firestore Indexes
echo "Step 2: Deploying Firestore Indexes..."
echo "  - firestore-pack303-creator-earnings.indexes.json"
firebase deploy --only firestore:indexes
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Firestore indexes deployed${NC}"
    echo -e "${YELLOW}  Note: Index creation may take several minutes${NC}"
else
    echo -e "${RED}✗ Firestore indexes deployment failed${NC}"
    exit 1
fi
echo ""

# Step 3: Deploy Cloud Functions
echo "Step 3: Deploying Cloud Functions..."
echo "  - pack303_getEarningsDashboard"
echo "  - pack303_getMonthlyStatement"
echo "  - pack303_exportStatement"
echo "  - pack303_checkEarningsCapability"
echo "  - pack303_admin_triggerAggregation"
echo "  - pack303_admin_backfillAggregation"
echo "  - pack303_admin_viewUserEarnings"
echo "  - pack303_cronDailyAggregation"
echo "  - pack303_httpTriggerAggregation"

firebase deploy --only functions:pack303_getEarningsDashboard,functions:pack303_getMonthlyStatement,functions:pack303_exportStatement,functions:pack303_checkEarningsCapability,functions:pack303_admin_triggerAggregation,functions:pack303_admin_backfillAggregation,functions:pack303_admin_viewUserEarnings,functions:pack303_cronDailyAggregation,functions:pack303_httpTriggerAggregation

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Cloud Functions deployed${NC}"
else
    echo -e "${RED}✗ Cloud Functions deployment failed${NC}"
    exit 1
fi
echo ""

# Step 4: Create Storage Bucket (if needed)
echo "Step 4: Ensuring Cloud Storage bucket exists..."
BUCKET_NAME="avalo-statements"
PROJECT_ID=$(firebase use | grep "Now using project" | awk '{print $4}' | tr -d "'")

if gsutil ls -b gs://${BUCKET_NAME} &> /dev/null; then
    echo -e "${GREEN}✓ Storage bucket already exists${NC}"
else
    echo "  Creating bucket: gs://${BUCKET_NAME}"
    gsutil mb -p ${PROJECT_ID} -l europe-west3 gs://${BUCKET_NAME}
    
    # Set CORS for downloads
    echo '[{"origin": ["*"], "method": ["GET"], "maxAgeSeconds": 3600}]' > /tmp/cors.json
    gsutil cors set /tmp/cors.json gs://${BUCKET_NAME}
    rm /tmp/cors.json
    
    echo -e "${GREEN}✓ Storage bucket created${NC}"
fi
echo ""

# Step 5: Test Deployment
echo "Step 5: Running deployment tests..."

# Get function URL
REGION="europe-west3"
FUNCTION_URL="https://${REGION}-${PROJECT_ID}.cloudfunctions.net"

echo "  Testing health endpoint..."
if curl -s "${FUNCTION_URL}/pack303_httpTriggerAggregation" | grep -q "Unauthorized"; then
    echo -e "${GREEN}✓ Functions are accessible${NC}"
else
    echo -e "${YELLOW}⚠ Function response unexpected (may require auth setup)${NC}"
fi
echo ""

# Summary
echo "======================================================================"
echo "PACK 303 Deployment Complete!"
echo "======================================================================"
echo ""
echo "Deployed Components:"
echo "  ✓ Firestore Rules"
echo "  ✓ Firestore Indexes"
echo "  ✓ Cloud Functions (9 functions)"
echo "  ✓ Storage Bucket"
echo ""
echo "Next Steps:"
echo "  1. Verify indexes are building: https://console.firebase.google.com"
echo "  2. Test earnings dashboard in mobile app"
echo "  3. Test statement export functionality"
echo "  4. Monitor aggregation cron job (runs daily at 2 AM UTC)"
echo "  5. Backfill historical data if needed (use admin function)"
echo ""
echo "Function URLs:"
echo "  Dashboard: pack303_getEarningsDashboard (callable)"
echo "  Statement: pack303_getMonthlyStatement (callable)"
echo "  Export: pack303_exportStatement (callable)"
echo "  Manual Trigger: ${FUNCTION_URL}/pack303_httpTriggerAggregation"
echo ""
echo "Monitoring:"
echo "  Aggregation logs: gcloud logging read \"resource.labels.function_name=pack303_cronDailyAggregation\""
echo "  Export logs: gcloud logging read \"resource.labels.function_name=pack303_exportStatement\""
echo ""
echo -e "${GREEN}Deployment successful! 🚀${NC}"
echo ""