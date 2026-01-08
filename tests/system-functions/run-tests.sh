#!/bin/bash

# Avalo System Functions Test Suite Runner (Linux/Mac)

echo "🚀 Avalo System Functions Test Suite"
echo "======================================"
echo ""

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed"
    echo "Please install Node.js 18+ from https://nodejs.org"
    exit 1
fi

# Check if Firebase credentials exist
if [ ! -f "../../avalo-main-firebase-adminsdk.json" ]; then
    echo "❌ Error: Firebase Admin SDK credentials not found"
    echo "Please ensure avalo-main-firebase-adminsdk.json is in the project root"
    exit 1
fi

# Check if .env exists
if [ ! -f "../../functions/.env" ]; then
    echo "⚠️  Warning: functions/.env not found"
    echo "Some tests may fail without proper environment configuration"
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Run tests
echo "🧪 Running tests..."
echo ""

npm test

# Capture exit code
EXIT_CODE=$?

echo ""
echo "======================================"

if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ All tests passed!"
else
    echo "❌ Some tests failed. Check the report for details."
fi

echo ""
echo "📄 Reports generated:"
echo "   - reports/system_functions_test.json"
echo "   - reports/system_functions_test.md"
echo ""

exit $EXIT_CODE