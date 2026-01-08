#!/bin/bash
# AVALO Development Environment Setup Script - macOS/Linux
# This script sets up and starts the development environment for AVALO monorepo

set -e

echo "====================================="
echo "AVALO Development Environment Setup"
echo "====================================="
echo ""

# Step 1: Check Node version
echo "[1/6] Checking Node.js version..."
NODE_VERSION=$(node --version)
echo "Node version: $NODE_VERSION"

if [[ ! "$NODE_VERSION" =~ ^v20\. ]]; then
    echo "WARNING: Node 20.x is recommended. Current version: $NODE_VERSION"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Step 2: Install dependencies
echo ""
echo "[2/6] Installing dependencies with pnpm..."
pnpm install

# Step 3: Build shared package
echo ""
echo "[3/6] Building @avalo/shared package..."
pnpm --filter @avalo/shared build

# Step 4: Build SDK package
echo ""
echo "[4/6] Building @avalo/sdk package..."
pnpm --filter @avalo/sdk build

# Step 5: Ask which platform to start
echo ""
echo "[5/6] Select development target:"
echo "  1) Mobile (Expo)"
echo "  2) Web (Next.js)"
echo "  3) Both (using tmux)"
echo "  4) Backend only (Firebase Emulators)"
read -p "Enter choice (1-4): " choice

echo ""
echo "[6/6] Starting development servers..."

case $choice in
    1)
        echo "Starting Expo development server..."
        cd app-mobile
        export EXPO_NO_DOCTOR=1
        pnpm start --reset-cache
        ;;
    2)
        echo "Starting Next.js development server..."
        cd app-web
        pnpm dev
        ;;
    3)
        echo "Starting both servers..."
        if command -v tmux &> /dev/null; then
            echo "Using tmux for multi-pane development..."
            tmux new-session -d -s avalo-dev
            tmux split-window -h
            tmux send-keys -t avalo-dev:0.0 'cd app-mobile && export EXPO_NO_DOCTOR=1 && pnpm start --reset-cache' C-m
            tmux send-keys -t avalo-dev:0.1 'cd app-web && pnpm dev' C-m
            tmux attach-session -t avalo-dev
        else
            echo "tmux not found. Starting Mobile in foreground..."
            echo "Run 'cd app-web && pnpm dev' in another terminal for web."
            cd app-mobile
            export EXPO_NO_DOCTOR=1
            pnpm start --reset-cache
        fi
        ;;
    4)
        echo "Starting Firebase Emulators..."
        pnpm dev:backend
        ;;
    *)
        echo "Invalid choice. Exiting."
        exit 1
        ;;
esac

echo ""
echo "====================================="
echo "Development environment ready!"
echo "====================================="