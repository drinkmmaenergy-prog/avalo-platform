#!/bin/bash

# ============================================================================
# PACK 329 — Regional Regulation Toggles & Content Policy Matrix
# Deployment Script
# ============================================================================

set -e  # Exit on any error

echo "=================================================="
echo "PACK 329 DEPLOYMENT"
echo "Regional Regulation Toggles & Content Policy Matrix"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================================================
# STEP 1: Deploy Firestore Rules
# ============================================================================

echo -e "${YELLOW}[1/5] Deploying Firestore Rules...${NC}"
firebase deploy --only firestore:rules

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Firestore rules deployed successfully${NC}"
else
    echo -e "${RED}❌ Failed to deploy Firestore rules${NC}"
    exit 1
fi

echo ""

# ============================================================================
# STEP 2: Deploy Firestore Indexes
# ============================================================================

echo -e "${YELLOW}[2/5] Deploying Firestore Indexes...${NC}"
firebase deploy --only firestore:indexes

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Firestore indexes deployed successfully${NC}"
else
    echo -e "${RED}❌ Failed to deploy Firestore indexes${NC}"
    exit 1
fi

echo ""

# ============================================================================
# STEP 3: Build Cloud Functions
# ============================================================================

echo -e "${YELLOW}[3/5] Building Cloud Functions...${NC}"
cd functions
npm run build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Cloud Functions built successfully${NC}"
else
    echo -e "${RED}❌ Failed to build Cloud Functions${NC}"
    exit 1
fi

cd ..
echo ""

# ============================================================================
# STEP 4: Deploy Cloud Functions
# ============================================================================

echo -e "${YELLOW}[4/5] Deploying Cloud Functions...${NC}"
firebase deploy --only functions:policy_validateContent,functions:policy_getPolicy,functions:policy_reportViolation,functions:policy_getViolations,functions:policy_admin_updatePolicy,functions:policy_admin_seedPolicy

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Cloud Functions deployed successfully${NC}"
else
    echo -e "${RED}❌ Failed to deploy Cloud Functions${NC}"
    exit 1
fi

echo ""

# ============================================================================
# STEP 5: Seed Policy Configuration
# ============================================================================

echo -e "${YELLOW}[5/5] Seeding Policy Configuration...${NC}"
echo "Please run the following command from Firebase Console or admin panel:"
echo ""
echo -e "${GREEN}const functions = firebase.functions();${NC}"
echo -e "${GREEN}const result = await functions.httpsCallable('policy_admin_seedPolicy')();${NC}"
echo -e "${GREEN}console.log(result.data);${NC}"
echo ""
echo -e "${YELLOW}⚠️ This step requires admin authentication and should be run manually${NC}"

# ============================================================================
# DEPLOYMENT COMPLETE
# ============================================================================

echo ""
echo "=================================================="
echo -e "${GREEN}✅ PACK 329 DEPLOYMENT COMPLETE${NC}"
echo "=================================================="
echo ""
echo "Deployed Components:"
echo "  ✅ Firestore Rules (contentPolicies, policyViolations, contentWarnings)"
echo "  ✅ Firestore Indexes (violations, warnings, reports)"
echo "  ✅ Cloud Functions (6 endpoints)"
echo "  ⚠️ Policy Seed (requires manual admin execution)"
echo ""
echo "Next Steps:"
echo "  1. Seed policy configuration (see instructions above)"
echo "  2. Verify policy in Firestore Console"
echo "  3. Test content validation on mobile/web"
echo "  4. Monitor policy violations in moderation queue"
echo ""
echo "Documentation: PACK_329_IMPLEMENTATION_SUMMARY.md"
echo ""