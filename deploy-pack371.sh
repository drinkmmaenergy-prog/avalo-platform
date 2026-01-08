#!/bin/bash

##############################################################################
# PACK 371: APP STORE DEFENSE & REPUTATION ENGINE DEPLOYMENT
# 
# Deploys:
# - Firestore security rules and indexes
# - Cloud Functions for review defense and trust scoring
# - Feature flags and seed data
# - Admin dashboard integration
##############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  PACK 371: APP STORE DEFENSE & REPUTATION ENGINE         ║${NC}"
echo -e "${BLUE}║  Deployment Script                                         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}❌ Firebase CLI not found. Please install it:${NC}"
    echo -e "${YELLOW}   npm install -g firebase-tools${NC}"
    exit 1
fi

# Check if logged in to Firebase
if ! firebase projects:list &> /dev/null; then
    echo -e "${RED}❌ Not logged in to Firebase. Please run:${NC}"
    echo -e "${YELLOW}   firebase login${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Firebase CLI ready${NC}"
echo ""

# Step 1: Deploy Firestore Rules
echo -e "${BLUE}📋 Step 1: Deploying Firestore Security Rules...${NC}"
if [ -f "firestore-pack371-reputation.rules" ]; then
    firebase deploy --only firestore:rules
    echo -e "${GREEN}✓ Firestore rules deployed${NC}"
else
    echo -e "${YELLOW}⚠ Warning: firestore-pack371-reputation.rules not found${NC}"
fi
echo ""

# Step 2: Deploy Firestore Indexes
echo -e "${BLUE}📊 Step 2: Deploying Firestore Indexes...${NC}"
if [ -f "firestore-pack371-reputation.indexes.json" ]; then
    firebase deploy --only firestore:indexes
    echo -e "${GREEN}✓ Firestore indexes deployed${NC}"
    echo -e "${YELLOW}⚠ Note: Indexes may take several minutes to build${NC}"
else
    echo -e "${YELLOW}⚠ Warning: firestore-pack371-reputation.indexes.json not found${NC}"
fi
echo ""

# Step 3: Deploy Cloud Functions
echo -e "${BLUE}⚙️  Step 3: Deploying Cloud Functions...${NC}"
if [ -d "firebase-cloud/functions" ]; then
    cd firebase-cloud/functions
    
    # Check if pack371 functions exist
    if [ -f "pack371-reputation-engine.ts" ]; then
        echo -e "${YELLOW}Installing dependencies...${NC}"
        npm install
        
        echo -e "${YELLOW}Deploying reputation engine functions...${NC}"
        firebase deploy --only functions:pack371_scanStoreReviews,functions:pack371_processReview,functions:pack371_generateSafeReply,functions:pack371_updateTrustScore,functions:pack371_applyTrustScoreDecay,functions:pack371_reviewNudges,functions:pack371_recordReviewConversion
        
        echo -e "${GREEN}✓ Cloud Functions deployed${NC}"
    else
        echo -e "${YELLOW}⚠ Warning: pack371-reputation-engine.ts not found${NC}"
    fi
    
    cd ../..
else
    echo -e "${YELLOW}⚠ Warning: firebase-cloud/functions directory not found${NC}"
fi
echo ""

# Step 4: Load Seed Data
echo -e "${BLUE}🌱 Step 4: Loading Seed Data...${NC}"

# Function to load JSON data to Firestore
load_seed_data() {
    local file=$1
    echo -e "${YELLOW}Loading $file...${NC}"
    
    if [ -f "$file" ]; then
        # Use Node.js to upload seed data
        node -e "
        const admin = require('firebase-admin');
        const fs = require('fs');
        
        if (!admin.apps.length) {
            admin.initializeApp();
        }
        
        const db = admin.firestore();
        const data = JSON.parse(fs.readFileSync('$file', 'utf8'));
        
        async function uploadData() {
            for (const [collection, docs] of Object.entries(data)) {
                console.log(\`Uploading to \${collection}...\`);
                for (const [docId, docData] of Object.entries(docs)) {
                    await db.collection(collection).doc(docId).set(docData, { merge: true });
                }
            }
            console.log('✓ Data uploaded successfully');
            process.exit(0);
        }
        
        uploadData().catch(error => {
            console.error('Error uploading data:', error);
            process.exit(1);
        });
        "
        echo -e "${GREEN}✓ Loaded $file${NC}"
    else
        echo -e "${YELLOW}⚠ File not found: $file${NC}"
    fi
}

# Load feature flags
if [ -f "firebase-cloud/seed-data/pack371-feature-flags.json" ]; then
    load_seed_data "firebase-cloud/seed-data/pack371-feature-flags.json"
fi

# Load other seed data
if [ -f "firebase-cloud/seed-data/pack371-seed-data.json" ]; then
    load_seed_data "firebase-cloud/seed-data/pack371-seed-data.json"
fi

echo ""

# Step 5: Verify Deployment
echo -e "${BLUE}🔍 Step 5: Verifying Deployment...${NC}"

echo -e "${YELLOW}Checking feature flags...${NC}"
firebase firestore:get featureFlags/store.defense.enabled  2>/dev/null && echo -e "${GREEN}✓ Feature flag verified${NC}" || echo -e "${YELLOW}⚠ Could not verify feature flag${NC}"

echo -e "${YELLOW}Checking Cloud Functions...${NC}"
firebase functions:list 2>/dev/null | grep "pack371" && echo -e "${GREEN}✓ Functions verified${NC}" || echo -e "${YELLOW}⚠ Could not verify functions${NC}"

echo ""

# Step 6: Post-Deployment Instructions
echo -e "${BLUE}📝 Post-Deployment Instructions:${NC}"
echo ""
echo -e "${GREEN}1. Monitor Firestore index creation:${NC}"
echo -e "   ${YELLOW}https://console.firebase.google.com/project/_/firestore/indexes${NC}"
echo ""
echo -e "${GREEN}2. Configure App Store Connect API:${NC}"
echo -e "   - Generate API key in App Store Connect"
echo -e "   - Store in Firebase Functions config:"
echo -e "   ${YELLOW}firebase functions:config:set appstore.api_key=\"YOUR_KEY\"${NC}"
echo ""
echo -e "${GREEN}3. Configure Google Play API:${NC}"
echo -e "   - Create service account in Google Cloud Console"
echo -e "   - Download JSON key and store securely"
echo -e "   ${YELLOW}firebase functions:config:set googleplay.credentials=\"\$(cat key.json)\"${NC}"
echo ""
echo -e "${GREEN}4. Add app store URLs to mobile app:${NC}"
echo -e "   - Update ${YELLOW}useReviewNudge.ts${NC} with your App Store ID and Android package"
echo ""
echo -e "${GREEN}5. Install mobile dependencies:${NC}"
echo -e "   ${YELLOW}cd app-mobile && npm install expo-store-review${NC}"
echo ""
echo -e "${GREEN}6. Access Reputation Dashboard:${NC}"
echo -e "   - Navigate to ${YELLOW}admin-web/reputation${NC}"
echo -e "   - Verify all panels load correctly"
echo ""
echo -e "${GREEN}7. Test Review Nudge:${NC}"
echo -e "   - Complete a successful interaction in the app"
echo -e "   - Verify nudge appears appropriately"
echo ""
echo -e "${GREEN}8. Monitor Cloud Functions logs:${NC}"
echo -e "   ${YELLOW}firebase functions:log${NC}"
echo ""

# Step 7: Integration Checklist
echo -e "${BLUE}✅ Integration Checklist:${NC}"
echo ""
echo "[ ] Firestore rules deployed and tested"
echo "[ ] Firestore indexes built (check Firebase Console)"
echo "[ ] Cloud Functions deployed and running"
echo "[ ] Feature flags enabled"
echo "[ ] Seed data loaded"
echo "[ ] App Store Connect API configured"
echo "[ ] Google Play API configured"
echo "[ ] Mobile app updated with store URLs"
echo "[ ] expo-store-review package installed"
echo "[ ] Admin dashboard accessible"
echo "[ ] Review nudge tested in app"
echo "[ ] Trust score calculation verified"
echo "[ ] Attack detection tested"
echo ""

# Summary
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    DEPLOYMENT COMPLETE                     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✓ PACK 371 has been deployed successfully!${NC}"
echo ""
echo -e "${YELLOW}⚠ IMPORTANT SECURITY NOTES:${NC}"
echo -e "  1. Review responses are automatically checked for legal safety"
echo -e "  2. Auto-reporting to stores is DISABLED by default - enable manually"
echo -e "  3. Monitor reputation attacks dashboard daily"
echo -e "  4. Review trust score weights periodically"
echo -e "  5. Keep store API credentials secure and rotate regularly"
echo ""
echo -e "${BLUE}For support: https://docs.avalo.app/pack371${NC}"
echo ""

exit 0
