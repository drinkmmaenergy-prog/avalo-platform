#!/bin/bash

# Avalo Monitoring System - Runner Script (Unix/Mac)
# Usage: ./run-monitor.sh [--force "reason"]

set -e

echo "=========================================="
echo "   Avalo Monitoring System"
echo "=========================================="
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "⚠️  Dependencies not installed. Installing..."
    npm install
    echo ""
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found!"
    echo "📝 Copy .env.example to .env and configure your credentials"
    echo ""
    echo "Run: cp .env.example .env"
    echo "Then edit .env with your credentials"
    exit 1
fi

# Load environment variables
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check for force rollback flag
if [ "$1" = "--force" ]; then
    if [ -z "$2" ]; then
        echo "❌ Error: Rollback reason required"
        echo "Usage: ./run-monitor.sh --force \"Your reason here\""
        exit 1
    fi
    
    echo "⚠️  WARNING: Manual rollback initiated!"
    echo "Reason: $2"
    echo ""
    read -p "Are you sure you want to rollback? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        echo "Rollback cancelled."
        exit 0
    fi
    
    echo "🔄 Triggering rollback..."
    npm run monitor:force "$2"
else
    echo "🚀 Running monitoring check..."
    echo ""
    npm run monitor
fi

echo ""
echo "=========================================="
echo "✅ Monitoring Complete"
echo "=========================================="
echo ""
echo "📊 View reports:"
echo "   JSON: ../reports/monitoring_report.json"
echo "   MD:   ../reports/monitoring_report.md"
echo ""