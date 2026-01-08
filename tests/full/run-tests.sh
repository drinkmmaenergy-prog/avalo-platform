#!/bin/bash

# Avalo Full Integration Test Matrix - Execution Script

echo "╔═══════════════════════════════════════════════════════════"
echo "║  AVALO FULL INTEGRATION TEST MATRIX"
echo "║  Initializing test environment..."
echo "╚═══════════════════════════════════════════════════════════"

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
    echo "✅ Environment variables loaded"
else
    echo "⚠️  No .env file found - using .env.example"
    cp .env.example .env
    echo "❌ Please configure .env with your credentials"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Run tests
echo ""
echo "🚀 Starting full integration test suite..."
echo ""

npm test

# Exit with test result code
exit $?