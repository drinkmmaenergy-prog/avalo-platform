#!/bin/bash

##############################################################################
# AVALO FIREBASE INTEGRATION TEST RUNNER
##############################################################################
# Automated script to run the complete Firebase integration test suite
# for the Avalo platform.
#
# Usage:
#   ./run-tests.sh                    # Run all tests
#   ./run-tests.sh --with-emulators   # Start emulators and run tests
#   ./run-tests.sh --build-first      # Build functions before testing
##############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FUNCTIONS_DIR="$PROJECT_ROOT/functions"
TEST_DIR="$PROJECT_ROOT/tests/integration"
REPORTS_DIR="$PROJECT_ROOT/reports"

# Parse arguments
START_EMULATORS=false
BUILD_FIRST=false

for arg in "$@"
do
    case $arg in
        --with-emulators)
        START_EMULATORS=true
        shift
        ;;
        --build-first)
        BUILD_FIRST=true
        shift
        ;;
        --help|-h)
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --with-emulators    Start Firebase emulators before testing"
        echo "  --build-first       Build Firebase functions before testing"
        echo "  --help, -h          Show this help message"
        echo ""
        exit 0
        ;;
    esac
done

##############################################################################
# Functions
##############################################################################

print_header() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════════════════╗"
    echo "║                                                                        ║"
    echo "║          🔥 AVALO FIREBASE INTEGRATION TEST RUNNER 🔥                 ║"
    echo "║                                                                        ║"
    echo "╚════════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_step() {
    echo -e "${GREEN}▶${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

check_dependencies() {
    print_step "Checking dependencies..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi
    
    # Check Firebase CLI (optional but recommended)
    if ! command -v firebase &> /dev/null; then
        print_warning "Firebase CLI is not installed (optional for emulators)"
    fi
    
    echo -e "  ${GREEN}✓${NC} Node.js $(node --version)"
    echo -e "  ${GREEN}✓${NC} npm $(npm --version)"
}

install_test_dependencies() {
    print_step "Installing test dependencies..."
    
    cd "$TEST_DIR"
    
    if [ ! -d "node_modules" ]; then
        npm install
    else
        echo "  Dependencies already installed"
    fi
}

build_functions() {
    print_step "Building Firebase functions..."
    
    cd "$FUNCTIONS_DIR"
    npm run build
    
    if [ $? -eq 0 ]; then
        echo -e "  ${GREEN}✓${NC} Functions built successfully"
    else
        print_error "Failed to build functions"
        exit 1
    fi
}

start_emulators() {
    print_step "Starting Firebase emulators..."
    
    cd "$PROJECT_ROOT"
    
    # Check if emulators are already running
    if lsof -Pi :5001 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "  ${YELLOW}⚠${NC} Emulators appear to be already running"
        return
    fi
    
    # Start emulators in background
    firebase emulators:start &
    EMULATOR_PID=$!
    
    echo "  Waiting for emulators to start..."
    sleep 30
    
    if lsof -Pi :5001 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} Emulators started (PID: $EMULATOR_PID)"
    else
        print_error "Failed to start emulators"
        exit 1
    fi
}

run_tests() {
    print_step "Running integration tests..."
    
    cd "$TEST_DIR"
    
    # Create reports directory if it doesn't exist
    mkdir -p "$REPORTS_DIR"
    
    # Run tests
    npx ts-node index.ts
    
    TEST_EXIT_CODE=$?
    
    return $TEST_EXIT_CODE
}

cleanup() {
    if [ ! -z "$EMULATOR_PID" ]; then
        print_step "Cleaning up emulators..."
        kill $EMULATOR_PID 2>/dev/null || true
    fi
}

##############################################################################
# Main Execution
##############################################################################

# Set up cleanup trap
trap cleanup EXIT

print_header

# Check dependencies
check_dependencies
echo ""

# Install test dependencies
install_test_dependencies
echo ""

# Build functions if requested
if [ "$BUILD_FIRST" = true ]; then
    build_functions
    echo ""
fi

# Start emulators if requested
if [ "$START_EMULATORS" = true ]; then
    start_emulators
    echo ""
fi

# Run tests
run_tests
TEST_RESULT=$?

echo ""

# Print results
if [ $TEST_RESULT -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                        ║${NC}"
    echo -e "${GREEN}║     ✅ ALL TESTS PASSED! 🎉           ║${NC}"
    echo -e "${GREEN}║                                        ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo "📄 Reports saved to: $REPORTS_DIR"
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                                        ║${NC}"
    echo -e "${RED}║     ❌ SOME TESTS FAILED               ║${NC}"
    echo -e "${RED}║                                        ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo "📄 Check report at: $REPORTS_DIR/avalo_full_test_report.md"
    exit 1
fi