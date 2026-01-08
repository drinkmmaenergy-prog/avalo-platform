#!/bin/bash

###############################################################################
# PACK 328B — Chat & Session Inactivity Timeouts Deployment Script
#
# This script deploys all components for PACK 328B:
# - Firestore security rules
# - Firestore indexes
# - Cloud Functions (TypeScript compilation)
#
# Usage:
#   chmod +x deploy-pack328b.sh
#   ./deploy-pack328b.sh
###############################################################################

set -e  # Exit on error

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║  PACK 328B — Chat & Session Inactivity Timeouts Deployment        ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Validate Firebase CLI
echo -e "${BLUE}[1/6] Validating Firebase CLI...${NC}"
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}Error: Firebase CLI not found. Please install it first:${NC}"
    echo "  npm install -g firebase-tools"
    exit 1
fi
echo -e "${GREEN}✓ Firebase CLI found${NC}"
echo ""

# Step 2: Check Firebase login
echo -e "${BLUE}[2/6] Checking Firebase authentication...${NC}"
if ! firebase projects:list &> /dev/null; then
    echo -e "${YELLOW}Not logged in. Please login to Firebase:${NC}"
    firebase login
fi
echo -e "${GREEN}✓ Authenticated${NC}"
echo ""

# Step 3: Deploy Firestore Rules
echo -e "${BLUE}[3/6] Deploying Firestore Security Rules...${NC}"
if [ -f "firestore-pack328b-chat-timeouts.rules" ]; then
    firebase deploy --only firestore:rules --config firestore-pack328b-chat-timeouts.rules
    echo -e "${GREEN}✓ Firestore rules deployed${NC}"
else
    echo -e "${YELLOW}⚠ firestore-pack328b-chat-timeouts.rules not found, skipping${NC}"
fi
echo ""

# Step 4: Deploy Firestore Indexes
echo -e "${BLUE}[4/6] Deploying Firestore Indexes...${NC}"
if [ -f "firestore-pack328b-chat-timeouts.indexes.json" ]; then
    firebase deploy --only firestore:indexes --config firestore-pack328b-chat-timeouts.indexes.json
    echo -e "${GREEN}✓ Firestore indexes deployed${NC}"
else
    echo -e "${YELLOW}⚠ firestore-pack328b-chat-timeouts.indexes.json not found, skipping${NC}"
fi
echo ""

# Step 5: Build Cloud Functions
echo -e "${BLUE}[5/6] Building Cloud Functions...${NC}"
cd functions
if [ -f "package.json" ]; then
    echo "Installing dependencies..."
    npm install
    
    echo "Compiling TypeScript..."
    npm run build
    
    echo -e "${GREEN}✓ Cloud Functions built successfully${NC}"
else
    echo -e "${RED}Error: functions/package.json not found${NC}"
    exit 1
fi
cd ..
echo ""

# Step 6: Deploy Cloud Functions
echo -e "${BLUE}[6/6] Deploying Cloud Functions...${NC}"
echo "Deploying PACK 328B functions..."

# Deploy the scheduled function for auto-expiration
firebase deploy --only functions:pack328b_chatSessionAutoExpireJob

echo -e "${GREEN}✓ Cloud Functions deployed${NC}"
echo ""

# Summary
echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║                    DEPLOYMENT COMPLETE                              ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}✓ Firestore Rules${NC}"
echo -e "${GREEN}✓ Firestore Indexes${NC}"
echo -e "${GREEN}✓ Cloud Functions${NC}"
echo ""
echo "Next steps:"
echo "1. Verify the scheduled function in Firebase Console:"
echo "   https://console.firebase.google.com/project/_/functions"
echo ""
echo "2. Set up Cloud Scheduler trigger:"
echo "   - Function: pack328b_chatSessionAutoExpireJob"
echo "   - Schedule: */30 * * * * (every 30 minutes)"
echo "   - Timezone: UTC"
echo ""
echo "3. Test the deployment:"
echo "   - Create a test chat"
echo "   - Verify timeout indicators appear in UI"
echo "   - Test manual 'End Chat' button"
echo ""
echo "4. Monitor execution:"
echo "   firebase functions:log --only pack328b_chatSessionAutoExpireJob"
echo ""
echo -e "${YELLOW}⚠ Note: Mobile and Web UI components need to be integrated${NC}"
echo "   into your existing chat screens manually."
echo ""