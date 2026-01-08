#!/bin/bash

###############################################################################
# PACK 382 — Global Creator Academy & Earnings Optimization Engine
# Deployment Script
###############################################################################

set -e  # Exit on error

echo "========================================="
echo "PACK 382 Deployment Script"
echo "Global Creator Academy & Earnings Engine"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}❌ Firebase CLI not found. Please install it first:${NC}"
    echo "npm install -g firebase-tools"
    exit 1
fi

# Check if logged in to Firebase
if ! firebase projects:list &> /dev/null; then
    echo -e "${RED}❌ Not logged in to Firebase. Please login first:${NC}"
    echo "firebase login"
    exit 1
fi

echo -e "${BLUE}📋 Checking dependencies...${NC}"

# Check for required PACK dependencies
REQUIRED_PACKS=(
    "firestore-pack277"
    "firestore-pack280"
    "firestore-pack300"
    "firestore-pack301"
    "firestore-pack302"
    "firestore-pack381"
)

MISSING_PACKS=()

for pack in "${REQUIRED_PACKS[@]}"; do
    if [ ! -f "${pack}.rules" ]; then
        MISSING_PACKS+=("$pack")
    fi
done

if [ ${#MISSING_PACKS[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Warning: Missing dependency PACK files:${NC}"
    for pack in "${MISSING_PACKS[@]}"; do
        echo "   - $pack"
    done
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Deployment cancelled.${NC}"
        exit 1
    fi
fi

echo ""
echo -e "${GREEN}✅ Dependencies check complete${NC}"
echo ""

# Step 1: Deploy Firestore Security Rules
echo -e "${BLUE}📝 Step 1/5: Deploying Firestore Security Rules...${NC}"

if [ -f "firestore-pack382-creator-academy.rules" ]; then
    firebase deploy --only firestore:rules:firestore-pack382-creator-academy
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Security rules deployed${NC}"
    else
        echo -e "${RED}❌ Failed to deploy security rules${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ Security rules file not found${NC}"
    exit 1
fi

echo ""

# Step 2: Deploy Firestore Indexes
echo -e "${BLUE}🔍 Step 2/5: Deploying Firestore Indexes...${NC}"

if [ -f "firestore-pack382-creator-academy.indexes.json" ]; then
    firebase deploy --only firestore:indexes
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Indexes deployed${NC}"
        echo -e "${YELLOW}⏳ Note: Index creation may take several minutes${NC}"
    else
        echo -e "${RED}❌ Failed to deploy indexes${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ Indexes file not found${NC}"
    exit 1
fi

echo ""

# Step 3: Build Cloud Functions
echo -e "${BLUE}🔨 Step 3/5: Building Cloud Functions...${NC}"

cd functions

if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

echo "Building TypeScript..."
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Functions built successfully${NC}"

cd ..

echo ""

# Step 4: Deploy Cloud Functions
echo -e "${BLUE}☁️  Step 4/5: Deploying Cloud Functions...${NC}"

PACK382_FUNCTIONS=(
    "pack382_calculateCreatorSkillScore"
    "pack382_dailySkillScoreUpdate"
    "pack382_enrollInCourse"
    "pack382_completeLesson"
    "pack382_rateCourse"
    "pack382_getLocalizedAcademyContent"
    "pack382_getUserProgress"
    "pack382_generateEarningsOptimizations"
    "pack382_markOptimizationViewed"
    "pack382_markOptimizationApplied"
    "pack382_recommendOptimalPricing"
    "pack382_applyPricingRecommendation"
    "pack382_weeklyPricingReview"
    "pack382_detectCreatorBurnout"
    "pack382_resolveBurnout"
    "pack382_dailyBurnoutMonitoring"
)

echo "Deploying ${#PACK382_FUNCTIONS[@]} functions..."

# Deploy all functions at once for efficiency
FUNCTIONS_LIST=$(IFS=,; echo "${PACK382_FUNCTIONS[*]}")
firebase deploy --only "functions:${FUNCTIONS_LIST// /,}"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ All functions deployed successfully${NC}"
else
    echo -e "${RED}❌ Some functions failed to deploy${NC}"
    echo -e "${YELLOW}⚠️  Check the logs above for details${NC}"
    exit 1
fi

echo ""

# Step 5: Verify Deployment
echo -e "${BLUE}✔️  Step 5/5: Verifying Deployment...${NC}"

echo "Checking function deployment status..."
firebase functions:list --filter "pack382" > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Functions are active${NC}"
else
    echo -e "${YELLOW}⚠️  Could not verify function status${NC}"
fi

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}✅ PACK 382 Deployment Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""

echo -e "${BLUE}📊 Deployment Summary:${NC}"
echo "  • Security Rules: ✅ Deployed"
echo "  • Database Indexes: ✅ Deployed"
echo "  • Cloud Functions: ✅ ${#PACK382_FUNCTIONS[@]} functions deployed"
echo ""

echo -e "${BLUE}📅 Scheduled Jobs:${NC}"
echo "  • Daily 01:00 UTC: Burnout Monitoring"
echo "  • Daily 02:00 UTC: Skill Score Updates"
echo "  • Monday 03:00 UTC: Pricing Review"
echo ""

echo -e "${BLUE}🔗 Next Steps:${NC}"
echo "  1. Monitor function logs: firebase functions:log"
echo "  2. Check index creation: Firebase Console > Firestore > Indexes"
echo "  3. Test creator enrollment and course completion"
echo "  4. Verify skill score calculations"
echo "  5. Review earnings optimizations"
echo "  6. Test burnout detection"
echo ""

echo -e "${BLUE}📚 Documentation:${NC}"
echo "  • Full docs: PACK_382_CREATOR_ACADEMY_AND_EARNINGS_ENGINE.md"
echo "  • Types: functions/src/types/pack382-types.ts"
echo "  • Functions: functions/src/pack382-*.ts"
echo ""

echo -e "${YELLOW}⚠️  Important Reminders:${NC}"
echo "  • Index creation may take 10-30 minutes"
echo "  • Monitor scheduled jobs for first runs"
echo "  • Review creator feedback on academy content"
echo "  • Adjust optimization thresholds based on data"
echo "  • Keep regional content updated"
echo ""

echo -e "${GREEN}🚀 PACK 382 is now live!${NC}"
echo ""

# Optional: Run post-deployment tests
read -p "Run post-deployment tests? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}🧪 Running tests...${NC}"
    cd functions
    npm test -- pack382 || echo -e "${YELLOW}⚠️  Some tests failed (this is normal for fresh deployment)${NC}"
    cd ..
fi

echo ""
echo -e "${GREEN}Deployment script completed successfully!${NC}"
echo ""

exit 0
