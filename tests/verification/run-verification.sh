#!/bin/bash

# ========================================================================
# AVALO POST-DEPLOYMENT VERIFICATION - RUNNER SCRIPT (Linux/Mac)
# ========================================================================

set -e

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║   🔥 AVALO POST-DEPLOYMENT VERIFICATION SUITE             ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Navigate to verification directory
cd "$(dirname "$0")"

# Check if node_modules exists
if [ ! -d "../../node_modules" ]; then
    echo "📦 Installing dependencies..."
    cd ../..
    npm install
    cd tests/verification
fi

# Check if Firebase emulators are running
echo "🔍 Checking Firebase emulators..."
if ! curl -s http://127.0.0.1:5001 > /dev/null 2>&1; then
    echo ""
    echo "⚠️  WARNING: Firebase emulators do not appear to be running!"
    echo ""
    echo "Please start the emulators first:"
    echo "  cd ../.."
    echo "  npm run emulators"
    echo ""
    echo "Or in a new terminal:"
    echo "  firebase emulators:start"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
echo "🚀 Starting verification suite..."
echo ""

# Run the verification suite
cd ../..
npx ts-node tests/verification/index.ts

# Capture exit code
EXIT_CODE=$?

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""

if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Verification completed successfully!"
else
    echo "❌ Verification failed with exit code $EXIT_CODE"
fi

echo ""
echo "📄 Reports saved to: ./reports/"
echo "   - avalo_post_deploy_verification.md"
echo "   - avalo_post_deploy_verification.json"
echo "   - logs/post_deploy_run.log"
echo ""

exit $EXIT_CODE