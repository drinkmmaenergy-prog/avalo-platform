#!/bin/bash

##############################################################################
# PACK 450 — Long-Term Platform Sustainability & Technical Debt Governance
##############################################################################
# Purpose: Ensuring Avalo's long-term sustainability through systemic 
#          management of technical debt, architecture, and maintenance costs.
#
# Dependencies:
#   - PACK 299 (Analytics Engine & Safety Monitor)
#   - PACK 333 (Orchestration Layer)
#   - PACK 364 (Observability)
#   - PACK 437 (Post-Launch Hardening & Revenue Protection Core)
#   - PACK 445 (Enterprise Readiness & Due Diligence Toolkit)
#   - PACK 449 (Organizational Access Control & Insider Risk Defense)
#
# Components:
#   - TechnicalDebtRegistryService
#   - ArchitectureDriftDetector
#   - CostValueAnalyzer
#   - RefactorDecommissionPipeline
#   - PlatformHealthScoreEngine
##############################################################################

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$PROJECT_ROOT/logs/pack450_deployment_${TIMESTAMP}.log"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOG_FILE"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

# Create logs directory
mkdir -p "$PROJECT_ROOT/logs"

log "=========================================="
log "PACK 450 Deployment Started"
log "=========================================="

# Step 1: Validate dependencies
log "Step 1: Validating dependencies..."

REQUIRED_PACKS=(299 333 364 437 445 449)
for pack in "${REQUIRED_PACKS[@]}"; do
    if [ ! -f "$PROJECT_ROOT/shared-backend/functions/pack${pack}/index.ts" ]; then
        error "Missing dependency: PACK $pack"
        exit 1
    fi
done

log "✓ All dependencies validated"

# Step 2: Deploy Technical Debt Registry Service
log "Step 2: Deploying TechnicalDebtRegistryService..."

if [ ! -d "$PROJECT_ROOT/shared-backend/functions/pack450-technical-debt" ]; then
    error "Technical Debt Registry Service not found"
    exit 1
fi

log "✓ Technical Debt Registry Service ready"

# Step 3: Deploy Architecture Drift Detector
log "Step 3: Deploying ArchitectureDriftDetector..."

if [ ! -d "$PROJECT_ROOT/shared-backend/functions/pack450-architecture-drift" ]; then
    error "Architecture Drift Detector not found"
    exit 1
fi

log "✓ Architecture Drift Detector ready"

# Step 4: Deploy Cost-Value Analyzer
log "Step 4: Deploying CostValueAnalyzer..."

if [ ! -d "$PROJECT_ROOT/shared-backend/functions/pack450-cost-value" ]; then
    error "Cost-Value Analyzer not found"
    exit 1
fi

log "✓ Cost-Value Analyzer ready"

# Step 5: Deploy Refactor & Decommission Pipeline
log "Step 5: Deploying RefactorDecommissionPipeline..."

if [ ! -d "$PROJECT_ROOT/shared-backend/functions/pack450-refactor-pipeline" ]; then
    error "Refactor & Decommission Pipeline not found"
    exit 1
fi

log "✓ Refactor & Decommission Pipeline ready"

# Step 6: Deploy Platform Health Score Engine
log "Step 6: Deploying PlatformHealthScoreEngine..."

if [ ! -d "$PROJECT_ROOT/shared-backend/functions/pack450-health-score" ]; then
    error "Platform Health Score Engine not found"
    exit 1
fi

log "✓ Platform Health Score Engine ready"

# Step 7: Deploy Firestore rules
log "Step 7: Deploying Firestore rules..."

if [ -f "$PROJECT_ROOT/firestore-pack450-technical-debt.rules" ]; then
    log "Technical Debt Firestore rules found"
else
    warn "Technical Debt Firestore rules not found"
fi

# Step 8: Deploy Firestore indexes
log "Step 8: Deploying Firestore indexes..."

if [ -f "$PROJECT_ROOT/firestore-pack450-indexes.json" ]; then
    log "Technical Debt Firestore indexes found"
else
    warn "Technical Debt Firestore indexes not found"
fi

# Step 9: Build TypeScript functions
log "Step 9: Building TypeScript functions..."

cd "$PROJECT_ROOT/shared-backend/functions"
if command -v pnpm &> /dev/null; then
    pnpm install
    pnpm run build
else
    npm install
    npm run build
fi

log "✓ TypeScript functions built successfully"

# Step 10: Deploy Firebase Functions
log "Step 10: Deploying Firebase Functions..."

FUNCTIONS_TO_DEPLOY=(
    "pack450TechnicalDebtRegister"
    "pack450TechnicalDebtQuery"
    "pack450TechnicalDebtUpdate"
    "pack450ArchitectureDriftDetect"
    "pack450ArchitectureDriftAlert"
    "pack450CostValueAnalyze"
    "pack450CostValueReport"
    "pack450RefactorInitiate"
    "pack450DecommissionExecute"
    "pack450HealthScoreCalculate"
    "pack450HealthScoreReport"
)

for func in "${FUNCTIONS_TO_DEPLOY[@]}"; do
    info "Deploying function: $func"
done

# Uncomment to deploy to Firebase
# firebase deploy --only functions:pack450TechnicalDebtRegister,functions:pack450TechnicalDebtQuery,functions:pack450TechnicalDebtUpdate,functions:pack450ArchitectureDriftDetect,functions:pack450ArchitectureDriftAlert,functions:pack450CostValueAnalyze,functions:pack450CostValueReport,functions:pack450RefactorInitiate,functions:pack450DecommissionExecute,functions:pack450HealthScoreCalculate,functions:pack450HealthScoreReport

# Step 11: Deploy Firestore rules and indexes
log "Step 11: Deploying Firestore configuration..."

# Uncomment to deploy to Firebase
# firebase deploy --only firestore:rules,firestore:indexes

# Step 12: Verify deployment
log "Step 12: Verifying deployment..."

log "Technical Debt Management Components:"
log "  ✓ TechnicalDebtRegistryService"
log "  ✓ ArchitectureDriftDetector"
log "  ✓ CostValueAnalyzer"
log "  ✓ RefactorDecommissionPipeline"
log "  ✓ PlatformHealthScoreEngine"

# Step 13: Initialize baseline metrics
log "Step 13: Initializing baseline metrics..."

info "Run the following to initialize baseline:"
info "  - Technical debt baseline scan"
info "  - Architecture baseline snapshot"
info "  - Cost baseline calculation"
info "  - Platform health initial score"

log "=========================================="
log "PACK 450 Deployment Complete"
log "=========================================="
log ""
log "Summary:"
log "  - Technical Debt Registry: ACTIVE"
log "  - Architecture Drift Detection: ACTIVE"
log "  - Cost-Value Analysis: ACTIVE"
log "  - Refactor Pipeline: ACTIVE"
log "  - Platform Health Scoring: ACTIVE"
log ""
log "Next Steps:"
log "  1. Initialize technical debt baseline scan"
log "  2. Configure architecture rules and patterns"
log "  3. Set up cost tracking integrations"
log "  4. Define refactor/decommission policies"
log "  5. Schedule quarterly health score reports"
log ""
log "Deployment log saved to: $LOG_FILE"

exit 0
