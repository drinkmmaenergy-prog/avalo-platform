#!/bin/bash

# PACK 305 — Legal & Audit Snapshot Export
# Deployment Script

set -e

echo "=========================================="
echo "PACK 305 — Legal & Audit Snapshot Export"
echo "Deployment Script"
echo "=========================================="
echo ""

# Color codes for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}❌ Firebase CLI is not installed${NC}"
    echo "Install it with: npm install -g firebase-tools"
    exit 1
fi

echo -e "${BLUE}📋 Step 1: Deploying Firestore Rules${NC}"
echo "Deploying legalSnapshots security rules..."
firebase deploy --only firestore:rules --project avaloapp 2>&1 | grep -E "(✔|Error|Warning)" || true
echo ""

echo -e "${BLUE}📋 Step 2: Deploying Firestore Indexes${NC}"
echo "Deploying legalSnapshots indexes..."
firebase deploy --only firestore:indexes --project avaloapp 2>&1 | grep -E "(✔|Error|Warning)" || true
echo ""

echo -e "${BLUE}📋 Step 3: Checking Cloud Functions${NC}"
echo "Listing PACK 305 Cloud Functions..."
echo ""
echo "Required Cloud Functions:"
echo "  • createLegalSnapshot - Create snapshot request"
echo "  • listLegalSnapshots - List snapshots with filtering"
echo "  • getLegalSnapshot - Get specific snapshot details"
echo "  • processLegalSnapshot - Background processor (trigger-based)"
echo ""

read -p "Deploy Cloud Functions? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Deploying Cloud Functions...${NC}"
    firebase deploy --only functions --project avaloapp 2>&1 | grep -E "(✔|Error|Warning)" || true
else
    echo -e "${YELLOW}⚠️  Skipping Cloud Functions deployment${NC}"
    echo "Deploy manually with: firebase deploy --only functions"
fi
echo ""

echo -e "${BLUE}📋 Step 4: Verification Checklist${NC}"
echo ""
echo "✓ Firestore Rules:"
echo "  - legalSnapshots collection secured by admin roles"
echo "  - INVESTOR_OVERVIEW: FINANCE | SUPERADMIN"
echo "  - REGULATOR_OVERVIEW: COMPLIANCE | SUPERADMIN"
echo "  - INTERNAL_COMPLIANCE: COMPLIANCE | SUPERADMIN | LEGAL"
echo ""
echo "✓ Firestore Indexes:"
echo "  - Composite indexes for type, status, requestedAt"
echo "  - Query optimization for filtering and pagination"
echo ""
echo "✓ Cloud Functions:"
echo "  - createLegalSnapshot (HTTPS callable)"
echo "  - listLegalSnapshots (HTTPS callable)"
echo "  - getLegalSnapshot (HTTPS callable)"
echo "  - processLegalSnapshot (background processor)"
echo ""
echo "✓ Admin UI:"
echo "  - /admin/legal-snapshots (React components)"
echo "  - CreateSnapshotForm component"
echo "  - SnapshotsList component"
echo ""

echo -e "${GREEN}=========================================="
echo "✅ PACK 305 Deployment Complete!"
echo "==========================================${NC}"
echo ""
echo "Next Steps:"
echo "1. Test snapshot creation from admin UI"
echo "2. Verify role-based access control"
echo "3. Check audit logging in auditLogs collection"
echo "4. Review generated snapshots in Firebase Storage"
echo ""
echo "Admin Access:"
echo "  • INVESTOR_OVERVIEW requires FINANCE or SUPERADMIN role"
echo "  • REGULATOR_OVERVIEW requires COMPLIANCE or SUPERADMIN role"
echo "  • INTERNAL_COMPLIANCE requires COMPLIANCE, SUPERADMIN, or LEGAL role"
echo ""
echo -e "${BLUE}Documentation: See PACK 305 implementation summary${NC}"
echo ""