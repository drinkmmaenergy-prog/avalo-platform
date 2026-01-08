#!/bin/bash

# ============================================================================
# PACK 328C - Calendar & Meetup Selfie Timeout + Mismatch Enforcement
# Deployment Script
# ============================================================================

set -e

echo "=========================================="
echo "PACK 328C Deployment"
echo "Selfie Verification & Anti-Fraud System"
echo "=========================================="
echo ""

# Colors
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

# Check if logged in to Firebase
if ! firebase projects:list &> /dev/null; then
    echo -e "${YELLOW}Please login to Firebase...${NC}"
    firebase login
fi

echo "Step 1: Deploying Firestore Security Rules..."
echo "----------------------------------------------"
firebase deploy --only firestore:rules --config firestore-pack328c-selfie-verification.rules
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Firestore security rules deployed${NC}"
else
    echo -e "${RED}✗ Failed to deploy Firestore security rules${NC}"
    exit 1
fi
echo ""

echo "Step 2: Deploying Firestore Indexes..."
echo "----------------------------------------------"
firebase deploy --only firestore:indexes --config firestore-pack328c-selfie-verification.indexes.json
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Firestore indexes deployed${NC}"
    echo -e "${YELLOW}Note: Index creation may take several minutes${NC}"
else
    echo -e "${RED}✗ Failed to deploy Firestore indexes${NC}"
    exit 1
fi
echo ""

echo "Step 3: Building Functions..."
echo "----------------------------------------------"
cd functions
npm install
npm run build
cd ..
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Functions built successfully${NC}"
else
    echo -e "${RED}✗ Failed to build functions${NC}"
    exit 1
fi
echo ""

echo "Step 4: Deploying Cloud Functions..."
echo "----------------------------------------------"
firebase deploy --only functions:checkMeetupStartTimes,functions:processSelfieTimeouts,functions:uploadMeetupSelfieFunction,functions:reportSelfieMismatchFunction,functions:cancelBookingBeforeSelfieFunction,functions:onBookingCreatedSetupSelfie,functions:onBookingStatusChanged,functions:cleanupSelfieTimeouts
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Cloud Functions deployed${NC}"
else
    echo -e "${RED}✗ Failed to deploy Cloud Functions${NC}"
    exit 1
fi
echo ""

echo "Step 5: Verifying Deployment..."
echo "----------------------------------------------"

# Check if collections exist
echo "Checking Firestore collections..."
firebase firestore:indexes | grep -q "calendarBookings\|_selfie_timeouts\|meetup_selfie_reports"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Firestore collections verified${NC}"
else
    echo -e "${YELLOW}⚠ Some collections may not exist yet (will be created on first use)${NC}"
fi

# Check deployed functions
echo "Checking deployed functions..."
firebase functions:list | grep -q "checkMeetupStartTimes\|processSelfieTimeouts"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Cloud Functions verified${NC}"
else
    echo -e "${YELLOW}⚠ Some functions may still be deploying${NC}"
fi
echo ""

echo "=========================================="
echo -e "${GREEN}PACK 328C Deployment Complete!${NC}"
echo "=========================================="
echo ""
echo "📋 Post-Deployment Checklist:"
echo "  1. ✓ Firestore security rules deployed"
echo "  2. ✓ Firestore indexes deployed (may still be building)"
echo "  3. ✓ Cloud Functions deployed"
echo "  4. ⚠ Test selfie verification flow"
echo "  5. ⚠ Verify timeout mechanism (5 minutes)"
echo "  6. ⚠ Test mismatch reporting"
echo "  7. ⚠ Verify refund processing (100% including Avalo fee)"
echo "  8. ⚠ Check fraud signal emission"
echo ""
echo "🔗 Integration Notes:"
echo "  - Requires PACK 324B (Fraud Signals) to be deployed"
echo "  - Requires PACK 328A (Bank-ID Verification) for full flow"
echo "  - Integrates with existing calendar booking system"
echo "  - Mobile app needs expo-camera package installed"
echo ""
echo "⚙️  Configuration:"
echo "  - Selfie timeout: 5 minutes (hardcoded)"
echo "  - Refund policy: 100% tokens + Avalo fee"
echo "  - Fraud signals: IDENTITY_MISMATCH_MEETUP"
echo "  - Scheduled checks: Every 1 minute"
echo ""
echo "📊 Monitoring:"
echo "  - Check Firebase Console for function logs"
echo "  - Monitor _selfie_timeouts collection"
echo "  - Review fraud_signals for mismatch reports"
echo "  - Track analytics_events for status changes"
echo ""
echo "🚨 Emergency Rollback:"
echo "  If issues occur, revert with:"
echo "  firebase deploy --only firestore:rules --config [previous-rules-file]"
echo ""
echo -e "${YELLOW}Remember to test thoroughly in staging before production!${NC}"