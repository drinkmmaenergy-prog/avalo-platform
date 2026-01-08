#!/bin/bash

# Avalo Mobile - Linux/macOS Setup Script
# Complete automated setup for Expo SDK 54 + React 19 + React Native 0.81.5
# Run from repository root: /path/to/avaloapp

set -e

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  AVALO MOBILE - AUTOMATED SETUP (Linux/macOS)"
echo "════════════════════════════════════════════════════════════"
echo ""

# Check if we're in the correct directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Must run from repository root (avaloapp)"
    echo "   Current directory: $(pwd)"
    exit 1
fi

echo "📁 Repository root: $(pwd)"
echo ""

# Step 1: Check pnpm installation
echo "═══ Step 1/8: Checking pnpm installation ═══"
if command -v pnpm &> /dev/null; then
    PNPM_VERSION=$(pnpm --version)
    echo "✓ pnpm version: $PNPM_VERSION"
else
    echo "❌ pnpm is not installed or not in PATH"
    echo "   Install with: npm install -g pnpm@9.0.0"
    exit 1
fi
echo ""

# Step 2: Clean old artifacts
echo "═══ Step 2/8: Cleaning old artifacts ═══"
CLEAN_PATHS=(
    "app-mobile/.expo"
    "app-mobile/.expo-shared"
    "app-mobile/.cache"
    "app-mobile/node_modules/.cache"
)

for CLEAN_PATH in "${CLEAN_PATHS[@]}"; do
    if [ -d "$CLEAN_PATH" ]; then
        echo "🗑️  Removing $CLEAN_PATH..."
        rm -rf "$CLEAN_PATH"
    fi
done
echo "✓ Cleanup completed"
echo ""

# Step 3: Install root dependencies
echo "═══ Step 3/8: Installing root dependencies ═══"
echo "Running: pnpm install"
pnpm install
echo "✓ Root dependencies installed"
echo ""

# Step 4: Install app-mobile dependencies
echo "═══ Step 4/8: Installing app-mobile dependencies ═══"
echo "Running: pnpm -F app-mobile install"
pnpm -F app-mobile install
echo "✓ app-mobile dependencies installed"
echo ""

# Step 5: Verify exact versions
echo "═══ Step 5/8: Verifying package versions ═══"

if [ -f "app-mobile/package.json" ]; then
    # Check for jq (JSON processor)
    if command -v jq &> /dev/null; then
        EXPO_VERSION=$(jq -r '.dependencies.expo // .devDependencies.expo // "NOT_FOUND"' app-mobile/package.json)
        REACT_VERSION=$(jq -r '.dependencies.react // .devDependencies.react // "NOT_FOUND"' app-mobile/package.json)
        RN_VERSION=$(jq -r '.dependencies["react-native"] // .devDependencies["react-native"] // "NOT_FOUND"' app-mobile/package.json)
        FIREBASE_VERSION=$(jq -r '.dependencies.firebase // .devDependencies.firebase // "NOT_FOUND"' app-mobile/package.json)
        TS_VERSION=$(jq -r '.dependencies.typescript // .devDependencies.typescript // "NOT_FOUND"' app-mobile/package.json)
        
        echo "  expo: $EXPO_VERSION (expected: 54.0.23)"
        echo "  react: $REACT_VERSION (expected: 19.1.0)"
        echo "  react-native: $RN_VERSION (expected: 0.81.5)"
        echo "  firebase: $FIREBASE_VERSION (expected: 11.0.0)"
        echo "  typescript: $TS_VERSION (expected: 5.9.2)"
    else
        echo "  ℹ️  Install jq for version verification: sudo apt-get install jq"
    fi
else
    echo "⚠️  Could not verify package versions"
fi
echo ""

# Step 6: Run auto-merge script
echo "═══ Step 6/8: Running auto-merge script ═══"
if [ -f "scripts/auto-merge.js" ]; then
    node scripts/auto-merge.js
else
    echo "⚠️  auto-merge.js not found - skipping"
fi
echo ""

# Step 7: Run React 19 codemod
echo "═══ Step 7/8: Running React 19 codemod ═══"
if [ -f "scripts/codemod-react19.js" ]; then
    node scripts/codemod-react19.js
else
    echo "⚠️  codemod-react19.js not found - skipping"
fi
echo ""

# Step 8: Validation
echo "═══ Step 8/8: Validation ═══"

CRITICAL_FILES=(
    "app-mobile/package.json:package.json"
    "app-mobile/app.json:app.json"
    "app-mobile/index.js:index.js"
    "app-mobile/App.tsx:App.tsx"
    "app-mobile/babel.config.js:babel.config.js"
    "app-mobile/metro.config.js:metro.config.js"
    "app-mobile/node_modules:node_modules"
)

ALL_VALID=true
for FILE_PAIR in "${CRITICAL_FILES[@]}"; do
    IFS=':' read -r FILE_PATH FILE_NAME <<< "$FILE_PAIR"
    if [ -e "$FILE_PATH" ]; then
        echo "  ✓ $FILE_NAME"
    else
        echo "  ✗ $FILE_NAME - MISSING"
        ALL_VALID=false
    fi
done

echo ""

if [ "$ALL_VALID" = true ]; then
    echo "════════════════════════════════════════════════════════════"
    echo "  ✅ SETUP COMPLETED SUCCESSFULLY!"
    echo "════════════════════════════════════════════════════════════"
    echo ""
    echo "🚀 Next Steps:"
    echo ""
    echo "  1. Navigate to app-mobile:"
    echo "     cd app-mobile"
    echo ""
    echo "  2. Start Expo development server:"
    echo "     npx expo start --clear"
    echo ""
    echo "  3. Scan QR code with Expo Go app"
    echo ""
    echo "════════════════════════════════════════════════════════════"
    echo ""
else
    echo "════════════════════════════════════════════════════════════"
    echo "  ❌ SETUP INCOMPLETE - MISSING FILES"
    echo "════════════════════════════════════════════════════════════"
    echo ""
    exit 1
fi