#!/bin/bash
# ========================================================================
# Avalo Load Test Runner - Unix/Linux/macOS
# ========================================================================

set -e  # Exit on error

echo ""
echo "===================================="
echo "  Avalo Load Testing Suite"
echo "===================================="
echo ""

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo "[ERROR] k6 is not installed!"
    echo ""
    echo "Please install k6 from: https://k6.io/docs/getting-started/installation/"
    echo ""
    echo "macOS installation:"
    echo "  brew install k6"
    echo ""
    echo "Linux installation:"
    echo "  sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69"
    echo "  echo 'deb https://dl.k6.io/deb stable main' | sudo tee /etc/apt/sources.list.d/k6.list"
    echo "  sudo apt-get update"
    echo "  sudo apt-get install k6"
    echo ""
    exit 1
fi

# Create results directory
mkdir -p results

# Load environment variables if .env exists
if [ -f .env ]; then
    echo "[INFO] Loading environment from .env file..."
    export $(cat .env | grep -v '^#' | xargs)
fi

# Set defaults if not provided
FIREBASE_FUNCTIONS_URL=${FIREBASE_FUNCTIONS_URL:-"https://europe-west3-avalo-app.cloudfunctions.net"}

echo "[INFO] Target: $FIREBASE_FUNCTIONS_URL"
echo ""

# Confirm before running
echo "This will simulate heavy load on your Firebase Functions."
read -p "Press Enter to continue, or Ctrl+C to cancel..."

echo ""
echo "===================================="
echo "  Running Load Tests"
echo "===================================="
echo ""

# Test 1: Ping
echo "[1/3] Running Ping Load Test..."
echo "Target: /ping endpoint"
echo "Load: 1,000 concurrent users"
echo ""
k6 run --out json=results/ping-results.json scenarios/ping-test.js
if [ $? -ne 0 ]; then
    echo "[ERROR] Ping test failed!"
    exit 1
fi
echo "[SUCCESS] Ping test completed"
echo ""

# Test 2: Purchase Tokens
echo "[2/3] Running Purchase Tokens Load Test..."
echo "Target: /purchaseTokensV2 endpoint"
echo "Load: Up to 1,000 concurrent users"
echo ""
k6 run --out json=results/purchase-results.json scenarios/purchase-test.js
if [ $? -ne 0 ]; then
    echo "[ERROR] Purchase test failed!"
    exit 1
fi
echo "[SUCCESS] Purchase test completed"
echo ""

# Test 3: Loyalty System
echo "[3/3] Running Loyalty System Load Test..."
echo "Target: /getUserLoyaltyCallable endpoint"
echo "Load: Up to 500 concurrent users"
echo ""
k6 run --out json=results/loyalty-results.json scenarios/loyalty-test.js
if [ $? -ne 0 ]; then
    echo "[ERROR] Loyalty test failed!"
    exit 1
fi
echo "[SUCCESS] Loyalty test completed"
echo ""

# Generate reports
echo "===================================="
echo "  Generating Reports"
echo "===================================="
echo ""
node utils/generateReport.js
if [ $? -ne 0 ]; then
    echo "[ERROR] Report generation failed!"
    exit 1
fi

echo ""
echo "===================================="
echo "  Load Tests Completed Successfully"
echo "===================================="
echo ""
echo "Reports generated:"
echo "  - reports/load_test_results.md"
echo "  - reports/load_test_results.json"
echo ""
echo "Raw results:"
echo "  - results/ping-results.json"
echo "  - results/purchase-results.json"
echo "  - results/loyalty-results.json"
echo ""

exit 0