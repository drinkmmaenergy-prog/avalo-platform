#!/bin/bash

# ========================================================================
# AVALO STRIPE & AI MODERATION TEST SUITE - BASH RUNNER
# ========================================================================

echo ""
echo "══════════════════════════════════════════════════════════════"
echo "  AVALO STRIPE & AI MODERATION TEST SUITE"
echo "══════════════════════════════════════════════════════════════"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed."
    echo "   Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is not installed."
    echo "   Please install npm."
    exit 1
fi

# Navigate to test directory
cd "$(dirname "$0")"

echo "📦 Installing dependencies..."
npm install --silent

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "🔨 Compiling TypeScript..."
npx tsc --noEmit

if [ $? -ne 0 ]; then
    echo "❌ TypeScript compilation failed"
    exit 1
fi

echo "🚀 Running Stripe & AI tests..."
echo ""

# Run the test suite
npx ts-node runStripeAiTests.ts

exit_code=$?

echo ""
if [ $exit_code -eq 0 ]; then
    echo "✅ Test suite completed successfully!"
else
    echo "⚠️  Test suite completed with issues. Check reports for details."
fi

echo ""
exit $exit_code