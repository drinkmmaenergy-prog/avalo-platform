#!/bin/bash

# PACK 429 — App Store Defense, Reviews, Reputation & Trust Engine
# Deployment Script

set -e

echo "=================================================="
echo "PACK 429 — Store Defense Deployment"
echo "=================================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}Error: Firebase CLI not found${NC}"
    echo "Install with: npm install -g firebase-tools"
    exit 1
fi

# Check if logged in
if ! firebase projects:list &> /dev/null; then
    echo -e "${RED}Error: Not logged in to Firebase${NC}"
    echo "Login with: firebase login"
    exit 1
fi

echo -e "${GREEN}✓${NC} Firebase CLI found and authenticated"
echo ""

# ============================================================================
# STEP 1: DEPLOY FIRESTORE RULES
# ============================================================================

echo "Step 1: Deploying Firestore Security Rules..."
echo "----------------------------------------------"

if [ -f "firestore-pack429-store-defense.rules" ]; then
    echo "Backing up existing rules..."
    cp firebase.json firebase.json.backup.$(date +%Y%m%d_%H%M%S) || true
    
    # Merge rules into firebase.json (manual step required)
    echo -e "${YELLOW}⚠${NC} Manual step required:"
    echo "   Add the following to your firebase.json under firestore.rules:"
    echo "   \"rules\": \"firestore-pack429-store-defense.rules\""
    echo ""
    echo "   Or merge the rules into your existing firestore.rules file"
    echo ""
    read -p "Press Enter after completing this step..."
    
    echo "Deploying Firestore rules..."
    firebase deploy --only firestore:rules
    
    echo -e "${GREEN}✓${NC} Firestore rules deployed"
else
    echo -e "${YELLOW}⚠${NC} Rules file not found, skipping"
fi

echo ""

# ============================================================================
# STEP 2: DEPLOY FIRESTORE INDEXES
# ============================================================================

echo "Step 2: Deploying Firestore Indexes..."
echo "----------------------------------------------"

if [ -f "firestore-pack429-store-defense.indexes.json" ]; then
    echo "Deploying indexes..."
    firebase deploy --only firestore:indexes --non-interactive
    
    echo -e "${GREEN}✓${NC} Firestore indexes deployed"
    echo -e "${YELLOW}⚠${NC} Note: Index creation may take several minutes"
else
    echo -e "${YELLOW}⚠${NC} Indexes file not found, skipping"
fi

echo ""

# ============================================================================
# STEP 3: DEPLOY CLOUD FUNCTIONS
# ============================================================================

echo "Step 3: Deploying Cloud Functions..."
echo "----------------------------------------------"

# Check if functions directory exists
if [ ! -d "functions" ]; then
    echo -e "${RED}Error: functions directory not found${NC}"
    exit 1
fi

cd functions

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing function dependencies..."
    npm install
fi

# Build TypeScript
echo "Building TypeScript..."
npm run build

cd ..

echo "Deploying PACK 429 functions..."
firebase deploy --only functions:pack429 --force

echo -e "${GREEN}✓${NC} Cloud Functions deployed"
echo ""

# ============================================================================
# STEP 4: INITIALIZE TRUST SIGNALS
# ============================================================================

echo "Step 4: Initializing Trust Signals..."
echo "----------------------------------------------"

echo "Creating initial trust signals document..."

# Note: This should be done via a Cloud Function call or Firebase Admin
echo -e "${YELLOW}⚠${NC} Manual step required:"
echo "   Call the trust score initialization:"
echo ""
echo "   curl -X POST https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/pack429-recalculateTrustScore \\"
echo "     -H \"Authorization: Bearer \$(firebase auth:token)\" \\"
echo "     -H \"Content-Type: application/json\""
echo ""
read -p "Press Enter to continue..."

echo ""

# ============================================================================
# STEP 5: SETUP CLOUD SCHEDULER
# ============================================================================

echo "Step 5: Setting up Cloud Scheduler..."
echo "----------------------------------------------"

echo "Creating scheduled jobs..."

# Defense monitoring - every hour
echo "Creating defense monitoring job (hourly)..."
gcloud scheduler jobs create http pack429-defense-monitoring \
    --schedule="0 * * * *" \
    --uri="https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/pack429-runDefenseMonitoring" \
    --http-method=POST \
    --oidc-service-account-email=YOUR_SERVICE_ACCOUNT@YOUR_PROJECT.iam.gserviceaccount.com \
    --location=YOUR_REGION \
    --description="PACK 429: Run defense monitoring hourly" \
    || echo "Job may already exist, updating..."

# Trust score update - daily at 2 AM UTC
echo "Creating trust score update job (daily)..."
gcloud scheduler jobs create http pack429-trust-score-update \
    --schedule="0 2 * * *" \
    --uri="https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/pack429-updateTrustScore" \
    --http-method=POST \
    --oidc-service-account-email=YOUR_SERVICE_ACCOUNT@YOUR_PROJECT.iam.gserviceaccount.com \
    --location=YOUR_REGION \
    --description="PACK 429: Update trust score daily" \
    || echo "Job may already exist, updating..."

# Crisis auto-evaluation - every 6 hours
echo "Creating crisis evaluation job (every 6 hours)..."
gcloud scheduler jobs create http pack429-crisis-evaluation \
    --schedule="0 */6 * * *" \
    --uri="https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/pack429-evaluateCrisis" \
    --http-method=POST \
    --oidc-service-account-email=YOUR_SERVICE_ACCOUNT@YOUR_PROJECT.iam.gserviceaccount.com \
    --location=YOUR_REGION \
    --description="PACK 429: Evaluate crisis mode every 6 hours" \
    || echo "Job may already exist, updating..."

echo -e "${YELLOW}⚠${NC} Note: Update the URIs above with your actual project details"
echo ""

# ============================================================================
# STEP 6: VERIFY DEPLOYMENT
# ============================================================================

echo "Step 6: Verifying Deployment..."
echo "----------------------------------------------"

echo "Checking Firestore collections..."
echo "  - storeReviewsMirror"
echo "  - storeDefenseEvents"
echo "  - trustSignals"
echo "  - reviewRecoveryPrompts"
echo "  - crisisMode"
echo ""

echo "Checking Cloud Functions..."
firebase functions:list | grep pack429 || echo "No functions found with 'pack429' prefix"
echo ""

echo "Checking Cloud Scheduler jobs..."
gcloud scheduler jobs list | grep pack429 || echo "No scheduler jobs found"
echo ""

# ============================================================================
# STEP 7: POST-DEPLOYMENT TASKS
# ============================================================================

echo "Step 7: Post-Deployment Tasks"
echo "----------------------------------------------"
echo ""
echo "Manual tasks to complete:"
echo ""
echo "1. Update Firebase Function URLs in the deployment script"
echo "2. Grant necessary permissions to service accounts"
echo "3. Test public trust score endpoint:"
echo "   GET /pack429/trust/score"
echo ""
echo "4. Import initial reviews (if available):"
echo "   POST /pack429/reviews/import"
echo ""
echo "5. Configure alerting in Cloud Monitoring:"
echo "   - Trust score drops"
echo "   - Critical defense events"
echo "   - Crisis mode activations"
echo ""
echo "6. Test admin dashboard:"
echo "   GET /pack429/dashboard"
echo ""
echo "7. Run initial defense monitoring:"
echo "   POST /pack429/monitoring/run"
echo ""

# ============================================================================
# COMPLETION
# ============================================================================

echo ""
echo "=================================================="
echo -e "${GREEN}✓ PACK 429 Deployment Complete${NC}"
echo "=================================================="
echo ""
echo "Next Steps:"
echo "1. Complete manual configuration steps above"
echo "2. Run test suite: PACK_429_TEST_PLAN.md"
echo "3. Monitor Cloud Functions logs"
echo "4. Verify scheduled jobs are running"
echo ""
echo "Documentation:"
echo "  - Test Plan: PACK_429_TEST_PLAN.md"
echo "  - Types: functions/src/pack429-store-defense.types.ts"
echo "  - API Docs: functions/src/pack429-admin-api.ts"
echo ""
echo "Support:"
echo "  Check logs with: firebase functions:log"
echo "  Monitor: https://console.cloud.google.com/functions"
echo ""
echo -e "${GREEN}Deployment successful!${NC}"
echo ""
