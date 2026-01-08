#!/bin/bash

set -e

echo "========================================"
echo "  AVALO MONOREPO CI/CD RESTORE"
echo "  Expo SDK 54 + React 18.3.1 + RN 0.76"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

remove_if_exists() {
    if [ -d "$1" ] || [ -f "$1" ]; then
        echo -e "${YELLOW}Removing: $1${NC}"
        rm -rf "$1"
        sleep 0.5
    fi
}

echo -e "${GREEN}Step 1: Cleaning node_modules in all workspaces...${NC}"
remove_if_exists "./node_modules"
remove_if_exists "./app-mobile/node_modules"
remove_if_exists "./app-web/node_modules"
remove_if_exists "./shared/node_modules"
remove_if_exists "./sdk/node_modules"
remove_if_exists "./functions/node_modules"

echo ""
echo -e "${GREEN}Step 2: Cleaning Expo cache and build artifacts...${NC}"
remove_if_exists "./app-mobile/.expo"
remove_if_exists "./app-mobile/.expo-shared"
remove_if_exists "./app-mobile/.cache"
remove_if_exists "./app-mobile/android"
remove_if_exists "./app-mobile/ios"
remove_if_exists "./app-mobile/.next"

echo ""
echo -e "${GREEN}Step 3: Cleaning build outputs...${NC}"
remove_if_exists "./shared/dist"
remove_if_exists "./sdk/dist"
remove_if_exists "./functions/lib"
remove_if_exists "./app-web/.next"

echo ""
echo -e "${GREEN}Step 4: Removing lock files...${NC}"
remove_if_exists "./pnpm-lock.yaml"
remove_if_exists "./package-lock.json"
remove_if_exists "./yarn.lock"

echo ""
echo -e "${GREEN}Step 5: Clearing pnpm store...${NC}"
pnpm store prune

echo ""
echo -e "${GREEN}Step 6: Installing root dependencies...${NC}"
pnpm install --no-frozen-lockfile

if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR: Root installation failed!${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}Step 7: Installing app-mobile dependencies...${NC}"
pnpm -F app-mobile install --no-frozen-lockfile

if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR: app-mobile installation failed!${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}Step 8: Building shared packages...${NC}"
pnpm --filter @avalo/shared build
pnpm --filter @avalo/sdk build

echo ""
echo -e "${GREEN}Step 9: Running Expo prebuild...${NC}"
cd app-mobile
npx expo prebuild --clean

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}WARNING: Expo prebuild encountered issues${NC}"
fi

cd ..

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${GREEN}  REPAIR COMPLETE!${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "${NC}1. cd app-mobile${NC}"
echo -e "${NC}2. npx expo start --clear${NC}"
echo ""
echo -e "${YELLOW}Or run development server directly:${NC}"
echo -e "${NC}   pnpm mobile${NC}"
echo ""