#!/bin/bash

##
## PACK 416 — Rollback Functions Script
##
## Purpose: Rollback Firebase Cloud Functions to a previous version
## Usage: ./scripts/pack416-rollback-functions.sh [project-id]
##
## Example: ./scripts/pack416-rollback-functions.sh avalo-prod
##

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  PACK 416 — Functions Rollback Tool${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Get project ID
if [ -z "$1" ]; then
  echo -e "${YELLOW}No project ID provided. Using default from .firebaserc${NC}"
  PROJECT_ID=$(firebase use | grep -o 'Now using alias.*' | awk '{print $NF}' | tr -d '()')
else
  PROJECT_ID="$1"
fi

echo -e "Project ID: ${GREEN}${PROJECT_ID}${NC}"
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

# List all functions
echo -e "${YELLOW}Fetching deployed functions...${NC}"
FUNCTIONS=$(firebase functions:list --json 2>/dev/null | jq -r '.result[].name' 2>/dev/null || echo "")

if [ -z "$FUNCTIONS" ]; then
  echo -e "${RED}Error: Could not fetch functions list${NC}"
  echo "Make sure you have functions deployed and jq installed"
  exit 1
fi

echo -e "${GREEN}Found functions:${NC}"
echo "$FUNCTIONS" | nl -w2 -s'. '
echo ""

# Get function versions (this is a simplified approach)
# In production, you'd integrate with Firebase deployment history
echo -e "${YELLOW}Available rollback options:${NC}"
echo "1. Redeploy from previous Git commit"
echo "2. Redeploy from specific Git tag"
echo "3. Deploy from backup directory"
echo "4. Cancel"
echo ""

read -p "Select option (1-4): " -n 1 -r OPTION
echo ""

case $OPTION in
  1)
    echo -e "${YELLOW}Recent commits:${NC}"
    git log --oneline -10
    echo ""
    read -p "Enter commit hash to deploy: " COMMIT_HASH
    
    if [ -z "$COMMIT_HASH" ]; then
      echo -e "${RED}Error: No commit hash provided${NC}"
      exit 1
    fi
    
    # Confirm
    echo ""
    echo -e "${YELLOW}WARNING: This will deploy functions from commit ${COMMIT_HASH}${NC}"
    read -p "Are you sure? (yes/no): " CONFIRM
    
    if [ "$CONFIRM" != "yes" ]; then
      echo "Rollback cancelled"
      exit 0
    fi
    
    # Create temporary directory
    TEMP_DIR=$(mktemp -d)
    echo -e "${BLUE}Using temp directory: ${TEMP_DIR}${NC}"
    
    # Export specific commit
    git archive "${COMMIT_HASH}" functions | tar -x -C "${TEMP_DIR}"
    
    # Deploy from temp directory
    cd "${TEMP_DIR}/functions"
    echo -e "${GREEN}Installing dependencies...${NC}"
    npm install --production
    
    echo -e "${GREEN}Deploying functions...${NC}"
    firebase deploy --only functions --project "${PROJECT_ID}" --force
    
    # Cleanup
    cd -
    rm -rf "${TEMP_DIR}"
    
    echo -e "${GREEN}✓ Rollback completed${NC}"
    ;;
    
  2)
    echo -e "${YELLOW}Recent tags:${NC}"
    git tag -l | tail -10
    echo ""
    read -p "Enter tag name to deploy: " TAG_NAME
    
    if [ -z "$TAG_NAME" ]; then
      echo -e "${RED}Error: No tag provided${NC}"
      exit 1
    fi
    
    # Confirm
    echo ""
    echo -e "${YELLOW}WARNING: This will deploy functions from tag ${TAG_NAME}${NC}"
    read -p "Are you sure? (yes/no): " CONFIRM
    
    if [ "$CONFIRM" != "yes" ]; then
      echo "Rollback cancelled"
      exit 0
    fi
    
    # Create temporary directory
    TEMP_DIR=$(mktemp -d)
    echo -e "${BLUE}Using temp directory: ${TEMP_DIR}${NC}"
    
    # Export specific tag
    git archive "${TAG_NAME}" functions | tar -x -C "${TEMP_DIR}"
    
    # Deploy from temp directory
    cd "${TEMP_DIR}/functions"
    echo -e "${GREEN}Installing dependencies...${NC}"
    npm install --production
    
    echo -e "${GREEN}Deploying functions...${NC}"
    firebase deploy --only functions --project "${PROJECT_ID}" --force
    
    # Cleanup
    cd -
    rm -rf "${TEMP_DIR}"
    
    echo -e "${GREEN}✓ Rollback completed${NC}"
    ;;
    
  3)
    read -p "Enter backup directory path: " BACKUP_DIR
    
    if [ ! -d "$BACKUP_DIR" ]; then
      echo -e "${RED}Error: Directory not found: ${BACKUP_DIR}${NC}"
      exit 1
    fi
    
    # Confirm
    echo ""
    echo -e "${YELLOW}WARNING: This will deploy functions from ${BACKUP_DIR}${NC}"
    read -p "Are you sure? (yes/no): " CONFIRM
    
    if [ "$CONFIRM" != "yes" ]; then
      echo "Rollback cancelled"
      exit 0
    fi
    
    cd "$BACKUP_DIR"
    echo -e "${GREEN}Installing dependencies...${NC}"
    npm install --production
    
    echo -e "${GREEN}Deploying functions...${NC}"
    firebase deploy --only functions --project "${PROJECT_ID}" --force
    
    echo -e "${GREEN}✓ Rollback completed${NC}"
    ;;
    
  4)
    echo "Cancelled"
    exit 0
    ;;
    
  *)
    echo -e "${RED}Invalid option${NC}"
    exit 1
    ;;
esac

echo ""
echo -e "${BLUE}======================================${NC}"
echo -e "${GREEN}Rollback completed successfully${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""
echo "Next steps:"
echo "1. Verify functions are working: firebase functions:log"
echo "2. Monitor error rates in Firebase Console"
echo "3. Update incident log"
echo "4. Notify team of rollback"
