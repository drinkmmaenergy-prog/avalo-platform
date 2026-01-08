# PACK 377 — Global Public Launch Orchestration Engine
# Deployment Script (PowerShell)
# Version: 1.0.0

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🚀 PACK 377 Deployment" -ForegroundColor Cyan
Write-Host "Global Public Launch Orchestration Engine" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Firebase CLI is installed
$firebaseExists = Get-Command firebase -ErrorAction SilentlyContinue
if (-not $firebaseExists) {
    Write-Host "❌ Firebase CLI not found" -ForegroundColor Red
    Write-Host "Install with: npm install -g firebase-tools"
    exit 1
}

Write-Host "📋 Step 1: Deploying Firestore Security Rules" -ForegroundColor Blue
Write-Host "   - Launch phases access control"
Write-Host "   - Infrastructure metrics protection"
Write-Host "   - Campaign management permissions"
Write-Host "   - Regional analytics security"
Write-Host ""

try {
    firebase deploy --only firestore:rules --config firebase.json
    Write-Host "✅ Security rules deployed successfully" -ForegroundColor Green
}
catch {
    Write-Host "❌ Security rules deployment failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📊 Step 2: Deploying Firestore Indexes" -ForegroundColor Blue
Write-Host "   - Launch phases indexes"
Write-Host "   - Campaign tracking indexes"
Write-Host "   - Threat alert indexes"
Write-Host "   - Region metrics indexes"
Write-Host ""

try {
    firebase deploy --only firestore:indexes --config firebase.json
    Write-Host "✅ Indexes deployed successfully" -ForegroundColor Green
}
catch {
    Write-Host "❌ Indexes deployment failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "⚡ Step 3: Deploying Cloud Functions" -ForegroundColor Blue
Write-Host "   - pack377_activateCountryPhase"
Write-Host "   - pack377_pauseCountryPhase"
Write-Host "   - pack377_infraLoadGate"
Write-Host "   - pack377_campaignTrafficForecast"
Write-Host "   - pack377_campaignROITracker"
Write-Host "   - pack377_launchThreatShield"
Write-Host "   - pack377_regionKPIAggregator"
Write-Host "   - pack377_regionRiskScorer"
Write-Host "   - pack377_initMarketSequence"
Write-Host ""

try {
    firebase deploy --only functions:pack377_activateCountryPhase,functions:pack377_pauseCountryPhase,functions:pack377_infraLoadGate,functions:pack377_campaignTrafficForecast,functions:pack377_campaignROITracker,functions:pack377_launchThreatShield,functions:pack377_regionKPIAggregator,functions:pack377_regionRiskScorer,functions:pack377_initMarketSequence
    Write-Host "✅ Cloud Functions deployed successfully" -ForegroundColor Green
}
catch {
    Write-Host "❌ Cloud Functions deployment failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🔧 Step 4: Feature Flags Configuration" -ForegroundColor Blue
Write-Host "   - Configuration file: config/pack377-feature-flags.json"
Write-Host ""

try {
    firebase firestore:import config/pack377-feature-flags.json --collection launchFeatureFlags
    Write-Host "✅ Feature flags uploaded successfully" -ForegroundColor Green
}
catch {
    Write-Host "⚠️  Manual upload required for feature flags" -ForegroundColor Yellow
    Write-Host "   Upload config/pack377-feature-flags.json to Firestore console"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ PACK 377 Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📝 Next Steps:" -ForegroundColor Blue
Write-Host ""
Write-Host "1. Initialize Market Entry Sequence:"
Write-Host "   Call: pack377_initMarketSequence()"
Write-Host ""
Write-Host "2. Activate First Country (Poland):"
Write-Host "   Call: pack377_activateCountryPhase({"
Write-Host "     countryCode: 'PL',"
Write-Host "     phase: 'alpha',"
Write-Host "     dailyUserCap: 100,"
Write-Host "     dailyPaymentCap: 1000,"
Write-Host "     dailyCreatorCap: 10"
Write-Host "   })"
Write-Host ""
Write-Host "3. Monitor Infrastructure:"
Write-Host "   - Check infraMetrics collection"
Write-Host "   - Monitor infraThrottleState/global"
Write-Host ""
Write-Host "4. Review Documentation:"
Write-Host "   - Read PACK_377_IMPLEMENTATION.md"
Write-Host "   - Set up monitoring dashboard"
Write-Host "   - Configure alert notifications"
Write-Host ""
Write-Host "⚠️  Important Reminders:" -ForegroundColor Yellow
Write-Host "   - Feature flag 'launch.enabled' is OFF by default"
Write-Host "   - Start with alpha phase for safety"
Write-Host "   - Monitor metrics closely during first 48 hours"
Write-Host "   - Keep admin team available for emergency response"
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🎉 Ready for Controlled Global Launch!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
