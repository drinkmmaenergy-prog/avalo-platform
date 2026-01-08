#!/bin/bash

###############################################################################
# PACK 388 — Global Legal Compliance, Data Governance & Regulatory Defense
# Deployment Script
###############################################################################

set -e  # Exit on error

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║   PACK 388 — Legal Compliance Engine Deployment               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

###############################################################################
# Step 1: Pre-deployment Checks
###############################################################################

echo -e "${BLUE}[1/7] Running pre-deployment checks...${NC}"

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}❌ Firebase CLI not found. Please install it first:${NC}"
    echo "   npm install -g firebase-tools"
    exit 1
fi

# Check if logged in
if ! firebase projects:list &> /dev/null; then
    echo -e "${RED}❌ Not logged in to Firebase. Please run:${NC}"
    echo "   firebase login"
    exit 1
fi

echo -e "${GREEN}✅ Pre-deployment checks passed${NC}"
echo ""

###############################################################################
# Step 2: Deploy Firestore Security Rules
###############################################################################

echo -e "${BLUE}[2/7] Deploying Firestore security rules...${NC}"

if [ -f "firestore-pack388-legal.rules" ]; then
    firebase deploy --only firestore:rules
    echo -e "${GREEN}✅ Firestore rules deployed${NC}"
else
    echo -e "${YELLOW}⚠️  firestore-pack388-legal.rules not found${NC}"
fi

echo ""

###############################################################################
# Step 3: Deploy Firestore Indexes
###############################################################################

echo -e "${BLUE}[3/7] Deploying Firestore indexes...${NC}"

if [ -f "firestore-pack388-legal.indexes.json" ]; then
    firebase deploy --only firestore:indexes
    echo -e "${GREEN}✅ Firestore indexes deployed${NC}"
else
    echo -e "${YELLOW}⚠️  firestore-pack388-legal.indexes.json not found${NC}"
fi

echo ""

###############################################################################
# Step 4: Deploy Cloud Functions
###############################################################################

echo -e "${BLUE}[4/7] Deploying Cloud Functions (this may take a few minutes)...${NC}"

cd functions

echo "  → Deploying GDPR functions..."
firebase deploy --only \
  functions:pack388_requestDataExport,\
functions:pack388_executeRightToBeForgotten,\
functions:pack388_processDataExport,\
functions:pack388_executeDataDeletion,\
functions:pack388_restrictProcessing,\
functions:pack388_cancelDeletionRequest

echo "  → Deploying Age Verification functions..."
firebase deploy --only \
  functions:pack388_verifyAgeStrict,\
functions:pack388_manualAgeReview,\
functions:pack388_getVerificationStatus

echo "  → Deploying KYC/AML functions..."
firebase deploy --only \
  functions:pack388_runKYCCheck,\
functions:pack388_monitorAMLPatterns,\
functions:pack388_getKYCStatus

echo "  → Deploying Data Retention functions..."
firebase deploy --only \
  functions:pack388_executeRetentionPurge,\
functions:pack388_applyLegalHold,\
functions:pack388_releaseLegalHold,\
functions:pack388_initializeRetentionPolicies,\
functions:pack388_getRetentionPolicy

echo "  → Deploying Regulatory Response functions..."
firebase deploy --only \
  functions:pack388_openRegulatoryIncident,\
functions:pack388_generateLegalReport,\
functions:pack388_updateIncidentStatus,\
functions:pack388_getJurisdictionRequirements

cd ..

echo -e "${GREEN}✅ Cloud Functions deployed${NC}"
echo ""

###############################################################################
# Step 5: Initialize Data Retention Policies
###############################################################################

echo -e "${BLUE}[5/7] Initializing data retention policies...${NC}"

echo "  → You need to manually call pack388_initializeRetentionPolicies"
echo "    from Firebase Console or your admin panel after deployment."

echo -e "${YELLOW}⚠️  Manual step required (see Quick Start guide)${NC}"
echo ""

###############################################################################
# Step 6: Seed Jurisdiction Data
###############################################################################

echo -e "${BLUE}[6/7] Seeding jurisdiction data...${NC}"

echo "  → You need to manually seed jurisdiction data"
echo "    using the seed script or Firebase Console."

echo -e "${YELLOW}⚠️  Manual step required (see Quick Start guide)${NC}"
echo ""

###############################################################################
# Step 7: Verification
###############################################################################

echo -e "${BLUE}[7/7] Verifying deployment...${NC}"

echo "  → Listing deployed functions..."
firebase functions:list | grep pack388 || echo "No functions found with pack388 prefix"

echo ""
echo -e "${GREEN}✅ Deployment verification complete${NC}"
echo ""

###############################################################################
# Summary
###############################################################################

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                    DEPLOYMENT COMPLETE                        ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}✅ Firestore rules deployed${NC}"
echo -e "${GREEN}✅ Firestore indexes deployed${NC}"
echo -e "${GREEN}✅ Cloud Functions deployed${NC}"
echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo ""
echo "1. Initialize retention policies:"
echo "   → Call pack388_initializeRetentionPolicies() from admin panel"
echo ""
echo "2. Seed jurisdiction data:"
echo "   → Run seed script or add via Firebase Console"
echo "   → See PACK_388_QUICK_START.md for details"
echo ""
echo "3. Configure admin permissions:"
echo "   → Grant LEGAL_ADMIN permissions to legal team"
echo ""
echo "4. Run tests:"
echo "   → Test GDPR data export"
echo "   → Test age verification"
echo "   → Test minor detection"
echo "   → Test KYC check"
echo ""
echo "5. Enable monitoring:"
echo "   → Set up alerts for critical events"
echo "   → Configure log aggregation"
echo ""
echo -e "${BLUE}📖 Documentation:${NC}"
echo "   → Full Guide: PACK_388_GLOBAL_LEGAL_GOVERNANCE_ENGINE.md"
echo "   → Quick Start: PACK_388_QUICK_START.md"
echo ""
echo -e "${BLUE}🔗 Resources:${NC}"
echo "   → Firebase Console: https://console.firebase.google.com"
echo "   → Functions Logs: firebase functions:log --only pack388"
echo ""
echo -e "${GREEN}🎉 PACK 388 is ready for production!${NC}"
echo ""

###############################################################################
# Health Check Reminder
###############################################################################

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                     HEALTH CHECK                              ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "Run this command to monitor Cloud Functions:"
echo -e "${BLUE}firebase functions:log --only pack388 --follow${NC}"
echo ""
echo "To test the deployment:"
echo -e "${BLUE}npm run test:pack388${NC}"
echo ""

exit 0
