#!/bin/bash
# PACK 339 — Disaster Recovery & Legal Crisis Management
# Deployment Script

set -e

echo "=================================================="
echo "PACK 339 DEPLOYMENT — Disaster Recovery & Legal Crisis"
echo "=================================================="
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the correct directory
if [ ! -f "firebase.json" ]; then
    echo -e "${RED}Error: firebase.json not found. Please run this script from the project root.${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1: Deploying Firestore Indexes${NC}"
firebase deploy --only firestore:indexes --non-interactive || {
    echo -e "${RED}Failed to deploy Firestore indexes${NC}"
    exit 1
}
echo -e "${GREEN}✅ Indexes deployed${NC}"
echo ""

echo -e "${YELLOW}Step 2: Deploying Firestore Security Rules${NC}"
# Note: This requires merging pack339 rules into main firestore.rules
# For now, just notify the user
echo -e "${YELLOW}⚠️  MANUAL ACTION REQUIRED: Merge firestore-pack339-disaster-recovery.rules into firestore.rules${NC}"
echo "Then run: firebase deploy --only firestore:rules"
echo ""

echo -e "${YELLOW}Step 3: Deploying Cloud Functions${NC}"
cd functions

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "Installing function dependencies..."
    npm install
fi

echo "Deploying PACK 339 functions..."
firebase deploy --only \
functions:pack339_runIncrementalBackup,\
functions:pack339_runDailyBackup,\
functions:pack339_simulateDisasterRecovery,\
functions:pack339_applyLegalHold,\
functions:pack339_removeLegalHold,\
functions:pack339_toggleRegulatorLock,\
functions:pack339_requestEvidenceExport,\
functions:pack339_processEvidenceExport,\
functions:pack339_getBackupStatus,\
functions:pack339_getActiveLegalHolds,\
functions:pack339_getRegulatorLockStatus,\
functions:pack339_getEvidenceExportJobs,\
functions:pack339_initializeDisasterRecoveryPlans \
--non-interactive || {
    echo -e "${RED}Failed to deploy Cloud Functions${NC}"
    cd ..
    exit 1
}

cd ..
echo -e "${GREEN}✅ Cloud Functions deployed${NC}"
echo ""

echo -e "${YELLOW}Step 4: Creating GCS Buckets${NC}"
echo -e "${YELLOW}⚠️  MANUAL ACTION REQUIRED: Run these commands to create storage buckets:${NC}"
echo ""
echo "# Backup storage"
echo "gsutil mb -p YOUR_PROJECT_ID gs://avalo-backups"
echo ""
echo "# Legal exports (with encryption)"
echo "gsutil mb -p YOUR_PROJECT_ID gs://avalo-legal-exports"
echo ""
echo "# Set retention policy (7 years for financial records)"
echo "gsutil retention set 7y gs://avalo-backups"
echo ""
echo "# Set IAM permissions"
echo "gsutil iam ch user:ops-team@avalo.app:objectViewer gs://avalo-backups"
echo "gsutil iam ch user:legal-team@avalo.app:objectViewer gs://avalo-legal-exports"
echo ""

echo -e "${YELLOW}Step 5: Creating Cloud Scheduler Jobs${NC}"
echo -e "${YELLOW}⚠️  MANUAL ACTION REQUIRED: Run these commands to create scheduled jobs:${NC}"
echo ""
echo "# Incremental backup (every 15 minutes)"
echo "gcloud scheduler jobs create pubsub pack339-incremental-backup \\"
echo "  --schedule=\"*/15 * * * *\" \\"
echo "  --topic=firebase-schedule-pack339_runIncrementalBackup \\"
echo "  --message-body='{}' \\"
echo "  --time-zone=\"UTC\""
echo ""
echo "# Daily full backup (03:00 UTC)"
echo "gcloud scheduler jobs create pubsub pack339-daily-backup \\"
echo "  --schedule=\"0 3 * * *\" \\"
echo "  --topic=firebase-schedule-pack339_runDailyBackup \\"
echo "  --message-body='{}' \\"
echo "  --time-zone=\"UTC\""
echo ""

echo -e "${YELLOW}Step 6: Initializing Disaster Recovery Plans${NC}"
echo -e "${YELLOW}⚠️  MANUAL ACTION REQUIRED: Run this from Admin Console or Firebase Console:${NC}"
echo ""
echo "const functions = firebase.functions();"
echo "const result = await functions.httpsCallable('pack339_initializeDisasterRecoveryPlans')();"
echo "console.log(result.data);"
echo ""

echo "=================================================="
echo -e "${GREEN}PACK 339 DEPLOYMENT COMPLETE${NC}"
echo "=================================================="
echo ""
echo "Next steps:"
echo "1. Complete manual actions above"
echo "2. Test incremental backup manually"
echo "3. Run DR simulation in STAGING"
echo "4. Configure alert webhooks"
echo "5. Train admins on legal hold procedures"
echo ""
echo "See PACK_339_DISASTER_RECOVERY_IMPLEMENTATION.md for details."
