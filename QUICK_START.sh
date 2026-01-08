#!/bin/bash

# AVALO Project - Quick Start Script
# Run this after cloning the repository

echo "🚀 AVALO Project - Quick Start"
echo "================================"
echo ""

# Step 1: Install dependencies
echo "📦 Step 1/5: Installing dependencies..."
pnpm install
if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi
echo "✅ Dependencies installed"
echo ""

# Step 2: Build shared package
echo "🔨 Step 2/5: Building shared package..."
cd shared
pnpm build
if [ $? -ne 0 ]; then
    echo "❌ Failed to build shared package"
    exit 1
fi
cd ..
echo "✅ Shared package built"
echo ""

# Step 3: Build SDK package
echo "🔨 Step 3/5: Building SDK package..."
cd sdk
pnpm build
if [ $? -ne 0 ]; then
    echo "❌ Failed to build SDK package"
    exit 1
fi
cd ..
echo "✅ SDK package built"
echo ""

# Step 4: Verify mobile
echo "✅ Step 4/5: Verifying mobile app..."
cd app-mobile
pnpm typecheck
if [ $? -ne 0 ]; then
    echo "❌ Mobile typecheck failed"
    exit 1
fi
cd ..
echo "✅ Mobile app verified"
echo ""

# Step 5: Verify web
echo "✅ Step 5/5: Verifying web app..."
cd app-web
pnpm typecheck
if [ $? -ne 0 ]; then
    echo "❌ Web typecheck failed"
    exit 1
fi
cd ..
echo "✅ Web app verified"
echo ""

echo "🎉 SUCCESS! All checks passed!"
echo ""
echo "Next steps:"
echo "1. Start Firebase emulators: firebase emulators:start"
echo "2. Run mobile app: cd app-mobile && pnpm start"
echo "3. Run web app: cd app-web && pnpm dev"
echo ""
echo "For more information, see AVALO_COMPLETE_REPAIR_GUIDE.md"