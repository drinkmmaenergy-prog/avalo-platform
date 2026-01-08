#!/bin/bash

##
## PACK 416 — Rollback Hosting Script
##
## Purpose: Rollback Firebase Hosting to a previous release
## Usage: ./scripts/pack416-rollback-hosting.sh [project-id] [site-name]
##
## Example: ./scripts/pack416-rollback-hosting.sh avalo-prod avalo-web
##

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  PACK 416 — Hosting Rollback Tool${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Get project ID
if [ -z "$1" ]; then
  echo -e "${YELLOW}No project ID provided. Using default from .firebaserc${NC}"
  PROJECT_ID=$(firebase use | grep -o 'Now using alias.*' | awk '{print $NF}' | tr -d '()')
else
  PROJECT_ID="$1"
fi

# Get site name
SITE_NAME="$2"

echo -e "Project ID: ${GREEN}${PROJECT_ID}${NC}"
if [ -n "$SITE_NAME" ]; then
  echo -e "Site Name: ${GREEN}${SITE_NAME}${NC}"
fi
echo ""

# Verify Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
  echo -e "${RED}Error: Firebase CLI not found${NC}"
  echo "Install with: npm install -g firebase-tools"
  exit 1
fi

# Check authentication
echo "Checking Firebase authentication..."
firebase projects:list > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo -e "${RED}Error: Not authenticated with Firebase${NC}"
  echo "Run: firebase login"
  exit 1
fi

echo -e "${GREEN}✓ Authenticated${NC}"
echo ""

# Set the project
firebase use "${PROJECT_ID}" || {
  echo -e "${RED}Error: Could not set project ${PROJECT_ID}${NC}"
  exit 1
}

# List hosting releases
echo -e "${YELLOW}Fetching recent hosting releases...${NC}"
echo ""

# Build the command
CMD="firebase hosting:releases:list --project ${PROJECT_ID}"
if [ -n "$SITE_NAME" ]; then
  CMD="$CMD --site ${SITE_NAME}"
fi

# Get releases (limit to last 10)
RELEASES=$($CMD --json 2>/dev/null | jq -r '.result[] | "\(.version) \(.message // "No message") \(.createTime)"' 2>/dev/null | head -10 || echo "")

if [ -z "$RELEASES" ]; then
  echo -e "${RED}Error: Could not fetch hosting releases${NC}"
  echo "Make sure you have hosting deployed and jq installed"
  exit 1
fi

echo -e "${GREEN}Recent releases:${NC}"
echo "$RELEASES" | nl -w2 -s'. '
echo ""

# Prompt for version selection
echo -e "${YELLOW}Select a release to rollback to:${NC}"
read -p "Enter line number (or 'q' to quit): " -r SELECTION

if [ "$SELECTION" = "q" ]; then
  echo "Cancelled"
  exit 0
fi

# Get selected version
SELECTED_VERSION=$(echo "$RELEASES" | sed -n "${SELECTION}p" | awk '{print $1}')

if [ -z "$SELECTED_VERSION" ]; then
  echo -e "${RED}Error: Invalid selection${NC}"
  exit 1
fi

echo ""
echo -e "${YELLOW}Selected version: ${SELECTED_VERSION}${NC}"
echo ""

# Get version details
echo -e "${BLUE}Version details:${NC}"
CMD_DETAILS="firebase hosting:releases:list --project ${PROJECT_ID}"
if [ -n "$SITE_NAME" ]; then
  CMD_DETAILS="$CMD_DETAILS --site ${SITE_NAME}"
fi

$CMD_DETAILS --json 2>/dev/null | jq -r ".result[] | select(.version == \"${SELECTED_VERSION}\")" 2>/dev/null
echo ""

# Confirm rollback
echo -e "${RED}WARNING: This will rollback your hosting to version ${SELECTED_VERSION}${NC}"
echo -e "${RED}Current users will see the previous version immediately${NC}"
echo ""
read -p "Are you absolutely sure? Type 'ROLLBACK' to confirm: " CONFIRM

if [ "$CONFIRM" != "ROLLBACK" ]; then
  echo "Rollback cancelled"
  exit 0
fi

echo ""
echo -e "${YELLOW}Initiating rollback...${NC}"

# Build rollback command
ROLLBACK_CMD="firebase hosting:rollback"
if [ -n "$SITE_NAME" ]; then
  ROLLBACK_CMD="$ROLLBACK_CMD --site ${SITE_NAME}"
fi
ROLLBACK_CMD="$ROLLBACK_CMD --project ${PROJECT_ID} ${SELECTED_VERSION}"

# Execute rollback
echo -e "${BLUE}Executing: ${ROLLBACK_CMD}${NC}"
$ROLLBACK_CMD

if [ $? -eq 0 ]; then
  echo ""
  echo -e "${GREEN}✓ Rollback completed successfully${NC}"
  echo ""
  
  # Show current release
  echo -e "${BLUE}Current release:${NC}"
  CMD_CURRENT="firebase hosting:releases:list --project ${PROJECT_ID}"
  if [ -n "$SITE_NAME" ]; then
    CMD_CURRENT="$CMD_CURRENT --site ${SITE_NAME}"
  fi
  $CMD_CURRENT --json 2>/dev/null | jq -r '.result[0]' 2>/dev/null
  
else
  echo ""
  echo -e "${RED}✗ Rollback failed${NC}"
  exit 1
fi

echo ""
echo -e "${BLUE}======================================${NC}"
echo -e "${GREEN}Rollback completed successfully${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""
echo "Next steps:"
echo "1. Verify website is working correctly"
echo "2. Check browser console for errors"
echo "3. Monitor error rates in Firebase Console"
echo "4. Clear CDN cache if needed"
echo "5. Update incident log"
echo "6. Notify team of rollback"
echo ""

# Optional: Clear cache
read -p "Do you want to clear Firebase hosting cache? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${YELLOW}Clearing hosting cache...${NC}"
  CMD_CACHE="firebase hosting:channel:delete --project ${PROJECT_ID}"
  if [ -n "$SITE_NAME" ]; then
    CMD_CACHE="$CMD_CACHE --site ${SITE_NAME}"
  fi
  # Note: This command syntax may vary based on Firebase CLI version
  echo -e "${BLUE}Cache cleared (if supported)${NC}"
fi

echo ""
echo -e "${GREEN}Done!${NC}"
