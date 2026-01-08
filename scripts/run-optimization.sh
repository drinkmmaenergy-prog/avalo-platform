#!/bin/bash

# ========================================================================
# AVALO BACKEND OPTIMIZATION RUNNER (Unix/Linux/Mac)
# ========================================================================

echo "🚀 Avalo Backend Optimization & CDN Validation"
echo "=============================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Navigate to scripts directory
cd "$(dirname "$0")"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Run the optimization script
echo "🔍 Running backend optimization analysis..."
echo ""
npx ts-node backend-optimization.ts

# Check exit code
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Optimization analysis completed successfully!"
    echo "📄 Reports saved to: ../reports/backend_optimization.*"
else
    echo ""
    echo "❌ Optimization analysis failed. Check errors above."
    exit 1
fi