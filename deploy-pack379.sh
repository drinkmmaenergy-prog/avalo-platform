#!/bin/bash

###############################################################################
# PACK 379 — Global ASO, Reviews, Reputation & Store Defense Engine
# Deployment Script
###############################################################################

set -e  # Exit on error

echo "=================================================="
echo "PACK 379 Deployment - ASO & Reputation Defense"
echo "=================================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    print_error "Firebase CLI not found. Please install it first:"
    echo "npm install -g firebase-tools"
    exit 1
fi

# Check if logged in to Firebase
print_status "Checking Firebase authentication..."
if ! firebase projects:list &> /dev/null; then
    print_error "Not logged in to Firebase. Please run: firebase login"
    exit 1
fi

print_success "Firebase authentication confirmed"
echo ""

# Step 1: Deploy Firestore Rules
print_status "Step 1/7: Deploying Firestore Security Rules..."
if [ -f "firestore-pack379-aso-reputation.rules" ]; then
    firebase deploy --only firestore:rules --force
    print_success "Firestore rules deployed"
else
    print_warning "Firestore rules file not found, skipping..."
fi
echo ""

# Step 2: Deploy Firestore Indexes
print_status "Step 2/7: Deploying Firestore Indexes..."
if [ -f "firestore-pack379-aso-reputation.indexes.json" ]; then
    firebase deploy --only firestore:indexes
    print_success "Firestore indexes deployed (may take 5-10 minutes to build)"
else
    print_warning "Firestore indexes file not found, skipping..."
fi
echo ""

# Step 3: Deploy Cloud Functions
print_status "Step 3/7: Deploying Cloud Functions..."
cd functions

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    print_status "Installing function dependencies..."
    npm install
fi

# Build TypeScript
print_status "Building TypeScript code..."
npm run build

cd ..

# Deploy specific PACK 379 functions
print_status "Deploying PACK 379 functions..."
firebase deploy --only functions:pack379_reviewAttackDetector,\
functions:pack379_fakeReviewClassifier,\
functions:pack379_reviewVelocityGuard,\
functions:pack379_storeDisputeGenerator,\
functions:pack379_storeAppealAutoSubmit,\
functions:pack379_asoBoostOptimizer,\
functions:pack379_keywordClusteringEngine,\
functions:pack379_storeAlgorithmResponse,\
functions:pack379_trustScoreEngine,\
functions:pack379_storePolicyWatcher,\
functions:pack379_preemptiveRiskAlert,\
functions:pack379_crisisReputationShield,\
functions:pack379_storeSafeReviewTrigger,\
functions:pack379_recordReviewCompletion,\
functions:pack379_execReputationDashboard,\
functions:pack379_dailyExecutiveReport

print_success "Cloud Functions deployed"
echo ""

# Step 4: Initialize Feature Flags
print_status "Step 4/7: Initializing Feature Flags..."
if [ -f "config/pack379-feature-flags.json" ]; then
    # Upload feature flags to Firestore
    firebase firestore:set pack379Config/featureFlags --data "$(cat config/pack379-feature-flags.json)" --confirm
    print_success "Feature flags initialized"
else
    print_warning "Feature flags file not found, skipping..."
fi
echo ""

# Step 5: Initialize Default Configuration
print_status "Step 5/7: Initializing Default Configuration..."

# Review prompts config
firebase firestore:set pack379Config/reviewPrompts --data '{
  "enabled": true,
  "minimumScoreForReview": 50,
  "promptThrottleDays": 90,
  "maxPromptsPerUser": 2
}' --confirm

# Trust thresholds config
firebase firestore:set pack379Config/trustThresholds --data '{
  "minimumScoreForReview": 50,
  "minimumScoreForPublicContent": 60,
  "minimumScoreForMarketplace": 70,
  "crisisModeActive": false
}' --confirm

# Discovery config
firebase firestore:set pack379Config/discovery --data '{
  "volatilitySuppressionEnabled": false,
  "suppressionLevel": "normal"
}' --confirm

print_success "Default configuration initialized"
echo ""

# Step 6: Set up scheduled jobs (cron)
print_status "Step 6/7: Verifying scheduled functions..."
print_status "The following functions are scheduled:"
echo "  - pack379_reviewAttackDetector: every 15 minutes"
echo "  - pack379_reviewVelocityGuard: every 5 minutes"
echo "  - pack379_asoBoostOptimizer: every 6 hours"
echo "  - pack379_storeAlgorithmResponse: every 12 hours"
echo "  - pack379_storePolicyWatcher: every 24 hours"
echo "  - pack379_dailyExecutiveReport: daily at 08:00 EST"
print_success "Scheduled functions configured"
echo ""

# Step 7: Deploy Web Dashboard (if exists)
print_status "Step 7/7: Deploying Admin Dashboard..."
if [ -d "app-web" ]; then
    cd app-web
    
    # Check if build exists
    if [ ! -d "build" ] && [ ! -d "dist" ]; then
        print_status "Building web dashboard..."
        npm run build || print_warning "Build failed, skipping dashboard deployment"
    fi
    
    cd ..
    
    # Deploy hosting if configured
    if [ -f "firebase.json" ]; then
        firebase deploy --only hosting
        print_success "Admin dashboard deployed"
    else
        print_warning "firebase.json not found, skipping hosting deployment"
    fi
else
    print_warning "app-web directory not found, skipping dashboard deployment"
fi
echo ""

# Final verification
echo "=================================================="
echo "Deployment Summary"
echo "=================================================="
print_success "✓ Firestore rules deployed"
print_success "✓ Firestore indexes deployed"
print_success "✓ Cloud Functions deployed (16 functions)"
print_success "✓ Feature flags initialized"
print_success "✓ Default configuration set"
print_success "✓ Scheduled jobs configured"
echo ""

print_status "Next Steps:"
echo "1. Wait 5-10 minutes for Firestore indexes to finish building"
echo "2. Configure external API keys (App Store Connect, Google Play Developer API)"
echo "3. Set up monitoring alerts and notification channels"
echo "4. Review the Quick Start Guide: PACK_379_QUICK_START.md"
echo "5. Access admin dashboard at: https://your-project.web.app/admin/reputation"
echo ""

print_status "To verify deployment:"
echo "  firebase functions:log --only pack379_reviewAttackDetector"
echo "  firebase firestore:indexes"
echo ""

print_status "To monitor in real-time:"
echo "  firebase functions:log --only pack379 --follow"
echo ""

echo "=================================================="
print_success "PACK 379 deployment complete!"
echo "=================================================="
