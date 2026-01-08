# PACK 339 — Disaster Recovery & Legal Crisis Management
# Deployment Script (PowerShell)

$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "PACK 339 DEPLOYMENT — Disaster Recovery & Legal Crisis" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the correct directory
if (-not (Test-Path "firebase.json")) {
    Write-Host "Error: firebase.json not found. Please run this script from the project root." -ForegroundColor Red
    exit 1
}

Write-Host "Step 1: Deploying Firestore Indexes" -ForegroundColor Yellow
try {
    firebase deploy --only firestore:indexes --non-interactive
    Write-Host "✅ Indexes deployed" -ForegroundColor Green
} catch {
    Write-Host "Failed to deploy Firestore indexes" -ForegroundColor Red
    exit 1
}
Write-Host ""

Write-Host "Step 2: Deploying Firestore Security Rules" -ForegroundColor Yellow
Write-Host "⚠️  MANUAL ACTION REQUIRED: Merge firestore-pack339-disaster-recovery.rules into firestore.rules" -ForegroundColor Yellow
Write-Host "Then run: firebase deploy --only firestore:rules"
Write-Host ""

Write-Host "Step 3: Deploying Cloud Functions" -ForegroundColor Yellow
Push-Location functions

# Check if dependencies are installed
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing function dependencies..."
    npm install
}

Write-Host "Deploying PACK 339 functions..."
try {
    firebase deploy --only `
        functions:pack339_runIncrementalBackup,`
        functions:pack339_runDailyBackup,`
        functions:pack339_simulateDisasterRecovery,`
        functions:pack339_applyLegalHold,`
        functions:pack339_removeLegalHold,`
        functions:pack339_toggleRegulatorLock,`
        functions:pack339_requestEvidenceExport,`
        functions:pack339_processEvidenceExport,`
        functions:pack339_getBackupStatus,`
        functions:pack339_getActiveLegalHolds,`
        functions:pack339_getRegulatorLockStatus,`
        functions:pack339_getEvidenceExportJobs,`
        functions:pack339_initializeDisasterRecoveryPlans `
        --non-interactive
    
    Pop-Location
    Write-Host "✅ Cloud Functions deployed" -ForegroundColor Green
} catch {
    Pop-Location
    Write-Host "Failed to deploy Cloud Functions" -ForegroundColor Red
    exit 1
}
Write-Host ""

Write-Host "Step 4: Creating GCS Buckets" -ForegroundColor Yellow
Write-Host "⚠️  MANUAL ACTION REQUIRED: Run these commands to create storage buckets:" -ForegroundColor Yellow
Write-Host ""
Write-Host "# Backup storage"
Write-Host "gsutil mb -p YOUR_PROJECT_ID gs://avalo-backups"
Write-Host ""
Write-Host "# Legal exports (with encryption)"
Write-Host "gsutil mb -p YOUR_PROJECT_ID gs://avalo-legal-exports"
Write-Host ""
Write-Host "# Set retention policy (7 years for financial records)"
Write-Host "gsutil retention set 7y gs://avalo-backups"
Write-Host ""
Write-Host "# Set IAM permissions"
Write-Host "gsutil iam ch user:ops-team@avalo.app:objectViewer gs://avalo-backups"
Write-Host "gsutil iam ch user:legal-team@avalo.app:objectViewer gs://avalo-legal-exports"
Write-Host ""

Write-Host "Step 5: Creating Cloud Scheduler Jobs" -ForegroundColor Yellow
Write-Host "⚠️  MANUAL ACTION REQUIRED: Run these commands to create scheduled jobs:" -ForegroundColor Yellow
Write-Host ""
Write-Host '# Incremental backup (every 15 minutes)'
Write-Host 'gcloud scheduler jobs create pubsub pack339-incremental-backup \'
Write-Host '  --schedule="*/15 * * * *" \'
Write-Host '  --topic=firebase-schedule-pack339_runIncrementalBackup \'
Write-Host "  --message-body='{}' \"
Write-Host '  --time-zone="UTC"'
Write-Host ""
Write-Host '# Daily full backup (03:00 UTC)'
Write-Host 'gcloud scheduler jobs create pubsub pack339-daily-backup \'
Write-Host '  --schedule="0 3 * * *" \'
Write-Host '  --topic=firebase-schedule-pack339_runDailyBackup \'
Write-Host "  --message-body='{}' \"
Write-Host '  --time-zone="UTC"'
Write-Host ""

Write-Host "Step 6: Initializing Disaster Recovery Plans" -ForegroundColor Yellow
Write-Host "⚠️  MANUAL ACTION REQUIRED: Run this from Admin Console or Firebase Console:" -ForegroundColor Yellow
Write-Host ""
Write-Host "const functions = firebase.functions();"
Write-Host "const result = await functions.httpsCallable('pack339_initializeDisasterRecoveryPlans')();"
Write-Host "console.log(result.data);"
Write-Host ""

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "PACK 339 DEPLOYMENT COMPLETE" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Complete manual actions above"
Write-Host "2. Test incremental backup manually"
Write-Host "3. Run DR simulation in STAGING"
Write-Host "4. Configure alert webhooks"
Write-Host "5. Train admins on legal hold procedures"
Write-Host ""
Write-Host "See PACK_339_DISASTER_RECOVERY_IMPLEMENTATION.md for details."
