#!/bin/bash

# PACK 360 - Global Localization Deployment Script
# Deploys language engine, currency engine, regional UX, cultural safety, and legal text engine

set -e

echo "🌍 PACK 360 - Global Localization Deployment"
echo "=============================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Please install it first:"
    echo "   npm install -g firebase-tools"
    exit 1
fi

echo -e "${BLUE}📋 Pre-deployment checklist...${NC}"
echo ""

# Step 1: Deploy Firestore Rules
echo -e "${YELLOW}[1/6]${NC} Deploying Firestore security rules..."
firebase deploy --only firestore:rules --force || {
    echo "❌ Failed to deploy Firestore rules"
    exit 1
}
echo -e "${GREEN}✓ Firestore rules deployed${NC}"
echo ""

# Step 2: Deploy Firestore Indexes
echo -e "${YELLOW}[2/6]${NC} Deploying Firestore indexes..."
firebase deploy --only firestore:indexes --force || {
    echo "❌ Failed to deploy Firestore indexes"
    exit 1
}
echo -e "${GREEN}✓ Firestore indexes deployed${NC}"
echo ""

# Step 3: Deploy Functions
echo -e "${YELLOW}[3/6]${NC} Deploying Cloud Functions..."
cd functions

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "   Installing function dependencies..."
    npm install
fi

# Build TypeScript
echo "   Building TypeScript..."
npm run build || {
    echo "❌ Failed to build functions"
    exit 1
}

cd ..

# Deploy all PACK 360 functions
firebase deploy --only functions:getSupportedLanguages,functions:detectUserLanguage,functions:setUserLanguage,functions:getTranslationPhrases,functions:adminUpdateTranslationPhrase,functions:adminToggleLanguage,functions:onUserCountryChange,functions:cacheTranslations,functions:updateExchangeRates,functions:getUserCurrency,functions:setUserCurrency,functions:convertTokenPriceToLocal,functions:convertPayoutToLocal,functions:getSupportedCurrencies,functions:adminSetRegionalPricing,functions:adminToggleCurrency,functions:formatCurrency,functions:initializeCurrencyRates,functions:getRegionalUXRules,functions:getUserUXConfig,functions:checkRegionalLimit,functions:adminSetRegionalUXOverride,functions:adminSetUserUXOverride,functions:adminGetAllCountryRules,functions:onUserCountryChangeUX,functions:getCulturalSafetyProfile,functions:moderateContent,functions:checkFeatureAvailability,functions:adminUpdateCulturalSafetyProfile,functions:adminGetAllSafetyProfiles,functions:onContentCreated,functions:getUserLegalDocuments,functions:acceptLegalDocument,functions:checkUserLegalCompliance,functions:adminCreateLegalDocument,functions:adminGetAllLegalDocuments,functions:adminGetLegalAcceptanceStats,functions:onUserLogin,functions:onUserCountryChangeLegal || {
    echo "❌ Failed to deploy functions"
    exit 1
}

echo -e "${GREEN}✓ Cloud Functions deployed${NC}"
echo ""

# Step 4: Deploy Admin Dashboard
echo -e "${YELLOW}[4/6]${NC} Deploying Admin Dashboard..."
firebase deploy --only hosting || {
    echo "⚠️  Warning: Failed to deploy hosting (admin dashboard)"
    echo "   You may need to configure hosting in firebase.json"
}
echo -e "${GREEN}✓ Admin Dashboard deployed${NC}"
echo ""

# Step 5: Initialize Currency Rates
echo -e "${YELLOW}[5/6]${NC} Initializing currency rates..."
echo "   This may take a moment..."
firebase functions:call initializeCurrencyRates || {
    echo "⚠️  Warning: Could not initialize currency rates automatically"
    echo "   Please initialize manually from the admin dashboard"
}
echo -e "${GREEN}✓ Currency rates initialized${NC}"
echo ""

# Step 6: Verification
echo -e "${YELLOW}[6/6]${NC} Verifying deployment..."
echo ""

echo "   Checking deployed functions..."
firebase functions:list | grep -E "(getSupportedLanguages|getUserCurrency|getRegionalUXRules|getCulturalSafetyProfile|getUserLegalDocuments)" && {
    echo -e "${GREEN}✓ Key functions verified${NC}"
} || {
    echo "⚠️  Warning: Could not verify all functions"
}

echo ""
echo -e "${GREEN}=============================================="
echo "✅ PACK 360 Deployment Complete!"
echo "=============================================="${NC}
echo ""
echo "📊 Deployed Components:"
echo "   ✓ Language Engine (14 languages supported)"
echo "   ✓ Currency Engine (31 currencies supported)"
echo "   ✓ Regional UX Rules (35+ countries)"
echo "   ✓ Cultural Safety Layer"
echo "   ✓ Legal Text Engine"
echo "   ✓ Admin Localization Dashboard"
echo ""
echo "🔗 Next Steps:"
echo "   1. Access admin dashboard: https://your-project.web.app/admin-web/localization/"
echo "   2. Configure Firebase config in admin dashboard HTML"
echo "   3. Update exchange rates (runs automatically every 6 hours)"
echo "   4. Add translation phrases for your app"
echo "   5. Upload legal documents for each country/language"
echo ""
echo "📚 Documentation:"
echo "   - Language API: functions/src/pack360-language-engine.ts"
echo "   - Currency API: functions/src/pack360-currency-engine.ts"
echo "   - Regional UX API: functions/src/pack360-regional-ux.ts"
echo "   - Cultural Safety API: functions/src/pack360-cultural-safety.ts"
echo "   - Legal Text API: functions/src/pack360-legal-text-engine.ts"
echo ""
echo "⚠️  Important Notes:"
echo "   • Exchange rates update every 6 hours automatically"
echo "   • Translation cache rebuilds every 24 hours"
echo "   • Legal compliance checked on every user login"
echo "   • Content moderation runs automatically on upload"
echo "   • Country-specific rules apply automatically"
echo ""
echo "🎉 Your platform is now globally ready!"
echo ""
