#!/bin/bash

##
## PACK 416 — Create Hotfix Branch Script
##
## Purpose: Create a properly formatted hotfix branch with conventions
## Usage: ./scripts/pack416-create-hotfix-branch.sh <short-description>
##
## Example: ./scripts/pack416-create-hotfix-branch.sh "fix-chat-tokens"
##

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if description provided
if [ -z "$1" ]; then
  echo -e "${RED}Error: No description provided${NC}"
  echo "Usage: ./scripts/pack416-create-hotfix-branch.sh <short-description>"
  echo "Example: ./scripts/pack416-create-hotfix-branch.sh fix-chat-tokens"
  exit 1
fi

# Get description and sanitize it
DESCRIPTION=$(echo "$1" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | sed 's/[^a-z0-9-]//g')

# Generate timestamp
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")

# Generate branch name
BRANCH_NAME="hotfix/${TIMESTAMP}-${DESCRIPTION}"

echo -e "${YELLOW}Creating hotfix branch...${NC}"
echo "Branch name: ${BRANCH_NAME}"
echo ""

# Ensure we're on main/master
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "master" ]; then
  echo -e "${YELLOW}Warning: You're not on main/master (current: ${CURRENT_BRANCH})${NC}"
  read -p "Do you want to switch to main first? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    git checkout main 2>/dev/null || git checkout master
    git pull origin main 2>/dev/null || git pull origin master
  fi
fi

# Create and checkout new branch
echo -e "${GREEN}Creating branch: ${BRANCH_NAME}${NC}"
git checkout -b "${BRANCH_NAME}"

# Create a hotfix commit template
cat > .git/HOTFIX_COMMIT_TEMPLATE << EOF
[HOTFIX] ${DESCRIPTION}

## What was broken?


## What was fixed?


## Testing performed:
- [ ] Local testing
- [ ] Staging verification
- [ ] Production readiness check

## Rollback plan:


## References:
- Issue: #
- Related PR: #
EOF

echo -e "${GREEN}✓ Hotfix branch created successfully${NC}"
echo ""
echo "Next steps:"
echo "1. Make your hotfix changes"
echo "2. Commit with: git commit --template=.git/HOTFIX_COMMIT_TEMPLATE"
echo "3. Push with: git push origin ${BRANCH_NAME}"
echo "4. Create PR targeting main/master"
echo ""
echo -e "${YELLOW}Remember: All commits must be prefixed with [HOTFIX]${NC}"

# Set up git hook to enforce [HOTFIX] prefix
mkdir -p .git/hooks
cat > .git/hooks/commit-msg << 'HOOK_EOF'
#!/bin/bash

COMMIT_MSG_FILE=$1
COMMIT_MSG=$(cat "$COMMIT_MSG_FILE")

# Check if commit message starts with [HOTFIX]
if [[ ! "$COMMIT_MSG" =~ ^\[HOTFIX\] ]]; then
  echo "Error: Commit message must start with [HOTFIX]"
  echo "Current message: $COMMIT_MSG"
  exit 1
fi
HOOK_EOF

chmod +x .git/hooks/commit-msg

echo -e "${GREEN}✓ Git hook installed to enforce [HOTFIX] prefix${NC}"
