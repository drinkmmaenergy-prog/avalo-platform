#!/bin/bash

# ============================================================================
# PACK 331 — AI Avatar Template Marketplace Deployment Script
# ============================================================================
# 
# This script deploys PACK 331 components:
# - Firestore security rules
# - Firestore indexes
# - Cloud Functions
#
# Prerequisites:
# - Firebase CLI installed and authenticated
# - Project configured for europe-west3 region
# ============================================================================

set -e  # Exit on error

echo "============================================================================"
echo "PACK 331 — AI Avatar Template Marketplace Deployment"
echo "============================================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}ERROR: Firebase CLI not installed${NC}"
    echo "Install it with: npm install -g firebase-tools"
    exit 1
fi

# Get current project
PROJECT=$(firebase use --json 2>/dev/null | grep -o '"projectId":"[^"]*"' | cut -d'"' -f4)

if [ -z "$PROJECT" ]; then
    echo -e "${RED}ERROR: No Firebase project selected${NC}"
    echo "Run: firebase use <project-id>"
    exit 1
fi

echo -e "${GREEN}Deploying to project: $PROJECT${NC}"
echo ""

# Confirm deployment
read -p "Continue with deployment? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled"
    exit 0
fi

echo ""
echo "============================================================================"
echo "Step 1: Deploying Firestore Security Rules"
echo "============================================================================"
echo ""

# Check if rules file exists
if [ ! -f "firestore-pack331-ai-avatar-marketplace.rules" ]; then
    echo -e "${RED}ERROR: firestore-pack331-ai-avatar-marketplace.rules not found${NC}"
    exit 1
fi

echo "Deploying PACK 331 security rules..."
firebase deploy --only firestore:rules

echo -e "${GREEN}✓ Security rules deployed${NC}"
echo ""

echo "============================================================================"
echo "Step 2: Deploying Firestore Indexes"
echo "============================================================================"
echo ""

# Check if indexes file exists
if [ ! -f "firestore-pack331-ai-avatar-marketplace.indexes.json" ]; then
    echo -e "${RED}ERROR: firestore-pack331-ai-avatar-marketplace.indexes.json not found${NC}"
    exit 1
fi

echo "Deploying PACK 331 indexes..."
firebase deploy --only firestore:indexes

echo -e "${GREEN}✓ Indexes deployed (may take a few minutes to build)${NC}"
echo ""

echo "============================================================================"
echo "Step 3: Deploying Cloud Functions"
echo "============================================================================"
echo ""

# Check if functions exist
if [ ! -f "functions/src/pack331-ai-avatar-marketplace.ts" ]; then
    echo -e "${RED}ERROR: functions/src/pack331-ai-avatar-marketplace.ts not found${NC}"
    exit 1
fi

echo "Building functions..."
cd functions
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR: Function build failed${NC}"
    exit 1
fi

cd ..

echo "Deploying PACK 331 Cloud Functions..."
firebase deploy --only functions:pack331_createAiAvatarTemplate,functions:pack331_purchaseAiAvatarTemplate,functions:pack331_listAvatarTemplates,functions:pack331_getCreatorStats,functions:pack331_trackTemplateUsage

echo -e "${GREEN}✓ Cloud Functions deployed${NC}"
echo ""

echo "============================================================================"
echo "Step 4: Verifying Deployment"
echo "============================================================================"
echo ""

echo "Checking deployed functions..."
firebase functions:list | grep pack331

echo ""
echo -e "${GREEN}============================================================================"
echo "PACK 331 Deployment Complete!"
echo "============================================================================${NC}"
echo ""
echo "Deployed Components:"
echo "  ✓ Firestore security rules (aiAvatarTemplates, aiAvatarTemplatePurchases)"
echo "  ✓ Firestore indexes (13 composite indexes)"
echo "  ✓ Cloud Functions:"
echo "    - pack331_createAiAvatarTemplate"
echo "    - pack331_purchaseAiAvatarTemplate"
echo "    - pack331_listAvatarTemplates"
echo "    - pack331_getCreatorStats"
echo "    - pack331_trackTemplateUsage"
echo ""
echo "Next Steps:"
echo "  1. Monitor Firestore index build status in Firebase Console"
echo "  2. Test functions using Firebase Console or client apps"
echo "  3. Set up moderation queue for template review"
echo "  4. Configure content policy integration (PACK 329)"
echo ""
echo "API Endpoints (europe-west3):"
echo "  - https://europe-west3-$PROJECT.cloudfunctions.net/pack331_createAiAvatarTemplate"
echo "  - https://europe-west3-$PROJECT.cloudfunctions.net/pack331_purchaseAiAvatarTemplate"
echo "  - https://europe-west3-$PROJECT.cloudfunctions.net/pack331_listAvatarTemplates"
echo "  - https://europe-west3-$PROJECT.cloudfunctions.net/pack331_getCreatorStats"
echo "  - https://europe-west3-$PROJECT.cloudfunctions.net/pack331_trackTemplateUsage"
echo ""
echo -e "${YELLOW}Note: Firestore indexes may take 5-10 minutes to build.${NC}"
echo -e "${YELLOW}Monitor progress at: https://console.firebase.google.com/project/$PROJECT/firestore/indexes${NC}"
echo ""