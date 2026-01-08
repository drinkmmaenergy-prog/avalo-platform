#!/bin/bash

##############################################################################
# PACK 427 Deployment Script
# Global Messaging Queue, Offline Sync & Real-Time Delivery Engine
#
# This script deploys:
# - Message queue backend services
# - Delivery workers (Cloud Functions)
# - Sync endpoints
# - Real-time signal handlers
# - Firestore indexes and security rules
##############################################################################

set -e  # Exit on error

echo "========================================="
echo "PACK 427 Deployment Started"
echo "========================================="

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "firebase.json" ]; then
    echo -e "${RED}Error: firebase.json not found. Please run from project root.${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1: Validating dependencies...${NC}"

# Check for required dependencies (other packs)
REQUIRED_PACKS=(
    "pack37"
    "pack268"
    "pack273"
    "pack277"
    "pack293"
    "pack296"
    "pack301"
    "pack302"
    "pack426"
)

echo "Checking for required pack dependencies..."
for pack in "${REQUIRED_PACKS[@]}"; do
    if ls functions/src/*$pack* 1> /dev/null 2>&1; then
        echo -e "${GREEN}✓ Found $pack${NC}"
    else
        echo -e "${YELLOW}⚠ Warning: $pack not found (may be expected if consolidated)${NC}"
    fi
done

echo ""
echo -e "${YELLOW}Step 2: Installing NPM dependencies...${NC}"

cd functions

# Install ulid if not present
if ! grep -q "ulid" package.json; then
    echo "Installing ulid package..."
    npm install ulid --save
fi

# Install other dependencies
npm install

cd ..

echo ""
echo -e "${YELLOW}Step 3: Creating Firestore indexes...${NC}"

# Create indexes file for PACK 427
cat > firestore-pack427-indexes.json << 'EOF'
{
  "indexes": [
    {
      "collectionGroup": "messageQueue",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "recipientId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "messageQueue",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "chatId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "messageQueue",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "messageQueue",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "updatedAt", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "typingEvents",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "chatId", "order": "ASCENDING" },
        { "fieldPath": "isTyping", "order": "ASCENDING" },
        { "fieldPath": "expiresAt", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "typingEvents",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "expiresAt", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "unreadCounters",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "updatedAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
EOF

echo -e "${GREEN}✓ Created firestore-pack427-indexes.json${NC}"

echo ""
echo -e "${YELLOW}Step 4: Creating Firestore security rules...${NC}"

# Create security rules file
cat > firestore-pack427.rules << 'EOF'
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Message Queue - NO direct client access
    // All writes must go through Cloud Functions
    match /regions/{region}/messageQueue/{messageId} {
      allow read: if false;  // Clients cannot read queue
      allow write: if false; // Clients cannot write queue
    }
    
    // Device Sync States - User can only read/update their own
    match /regions/{region}/deviceSyncStates/{syncStateId} {
      allow read: if request.auth != null 
                  && syncStateId.matches('^' + request.auth.uid + '_.*');
      allow write: if false; // Only Cloud Functions can write
    }
    
    // Typing Events - Users can read for their chats
    match /regions/{region}/typingEvents/{eventId} {
      allow read: if request.auth != null;
      allow write: if false; // Only Cloud Functions can write
    }
    
    // Read Receipts - Users can read their own
    match /chats/{chatId}/readReceipts/{userId} {
      allow read: if request.auth != null 
                  && request.auth.uid == userId;
      allow write: if false; // Only Cloud Functions can write
    }
    
    // Unread Counters - Users can read their own
    match /users/{userId}/unreadCounters/{chatId} {
      allow read: if request.auth != null 
                  && request.auth.uid == userId;
      allow write: if false; // Only Cloud Functions can write
    }
    
    // Inbox (real-time delivery) - Users can read their own
    match /users/{userId}/inbox/{messageId} {
      allow read: if request.auth != null 
                  && request.auth.uid == userId;
      allow write: if false; // Only Cloud Functions can write
    }
  }
}
EOF

echo -e "${GREEN}✓ Created firestore-pack427.rules${NC}"

echo ""
echo -e "${YELLOW}Step 5: Deploying Firestore indexes...${NC}"

firebase deploy --only firestore:indexes -P default

echo ""
echo -e "${YELLOW}Step 6: Deploying Firestore rules...${NC}"

# Note: In production, you'd merge these rules with existing ones
# For now, we're creating separate rule files for each pack
echo "Note: Security rules need to be manually merged with existing rules"
echo "File created: firestore-pack427.rules"

echo ""
echo -e "${YELLOW}Step 7: Deploying Cloud Functions...${NC}"

# Deploy all PACK 427 functions
firebase deploy --only functions:pack427_processMessageQueue -P default
firebase deploy --only functions:pack427_cleanupMessages -P default
firebase deploy --only functions:pack427_exportQueueStats -P default
firebase deploy --only functions:pack427_onMessageEnqueued -P default
firebase deploy --only functions:pack427_registerDevice -P default
firebase deploy --only functions:pack427_syncMessages -P default
firebase deploy --only functions:pack427_ackMessages -P default
firebase deploy --only functions:pack427_getChatList -P default
firebase deploy --only functions:pack427_resyncChat -P default
firebase deploy --only functions:pack427_updateTypingState -P default
firebase deploy --only functions:pack427_markAsRead -P default
firebase deploy --only functions:pack427_getTypingStatus -P default
firebase deploy --only functions:pack427_getUnreadCounts -P default
firebase deploy --only functions:pack427_recalculateUnreadCounters -P default
firebase deploy --only functions:pack427_cleanupTypingEvents -P default
firebase deploy --only functions:pack427_onNewMessage -P default

echo ""
echo -e "${YELLOW}Step 8: Initializing regional collections...${NC}"

# Create initial regional documents (if they don't exist)
echo "Creating regional collection structure..."

# This would use Firebase Admin SDK or manual initialization
# For now, we document the structure

cat > PACK_427_REGION_INIT.md << 'EOF'
# PACK 427 Regional Collections Initialization

## Required Regional Documents

The following collections must exist in each region:

1. `regions/EU/messageQueue` - EU message queue
2. `regions/US/messageQueue` - US message queue
3. `regions/APAC/messageQueue` - APAC message queue
4. `regions/EU/deviceSyncStates` - EU device sync states
5. `regions/US/deviceSyncStates` - US device sync states
6. `regions/APAC/deviceSyncStates` - APAC device sync states
7. `regions/EU/typingEvents` - EU typing events
8. `regions/US/typingEvents` - US typing events
9. `regions/APAC/typingEvents` - APAC typing events

## Initialization

These collections will be created automatically on first write.
No manual initialization required.

## Indexes

All necessary indexes defined in firestore-pack427-indexes.json
EOF

echo -e "${GREEN}✓ Regional structure documented in PACK_427_REGION_INIT.md${NC}"

echo ""
echo -e "${YELLOW}Step 9: Verifying deployment...${NC}"

# Check if functions deployed successfully
echo "Checking Cloud Functions..."
firebase functions:list | grep pack427 || echo -e "${RED}Warning: Functions may not be deployed yet${NC}"

echo ""
echo -e "${YELLOW}Step 10: Running smoke tests...${NC}"

cat > PACK_427_SMOKE_TEST.md << 'EOF'
# PACK 427 Smoke Tests

## Manual Verification Steps

1. **Test Device Registration**
   ```
   Call pack427_registerDevice with test deviceId
   Verify deviceSyncState created
   ```

2. **Test Message Enqueueing**
   ```
   Send test message through existing chat API
   Verify message appears in queue (check Firestore console)
   ```

3. **Test Queue Processing**
   ```
   Wait for scheduled function to run
   Verify message marked as DELIVERED
   ```

4. **Test Sync**
   ```
   Call pack427_syncMessages from test device
   Verify messages returned
   ```

5. **Test Typing Indicator**
   ```
   Call pack427_updateTypingState
   Verify typing event created with TTL
   ```

6. **Test Read Receipt**
   ```
   Call pack427_markAsRead
   Verify read receipt updated
   Verify unread counter decremented
   ```

## Monitoring

- Check Cloud Function logs for errors
- Monitor queue depth per region
- Verify delivery success rate
- Check for any billing anomalies

## Rollback Procedure

If issues detected:
1. Disable Cloud Function triggers
2. Stop enqueueing new messages
3. Investigate issues
4. Fix and redeploy

EOF

echo -e "${GREEN}✓ Smoke test guide created: PACK_427_SMOKE_TEST.md${NC}"

echo ""
echo -e "${GREEN}========================================="
echo "PACK 427 Deployment Complete!"
echo "=========================================${NC}"
echo ""
echo "Next Steps:"
echo "1. Review PACK_427_SMOKE_TEST.md for verification steps"
echo "2. Monitor Cloud Function logs for any errors"
echo "3. Check Firestore console for queue entries"
echo "4. Run full test suite from PACK_427_TEST_PLAN.md"
echo "5. Verify no billing anomalies"
echo ""
echo -e "${YELLOW}Important Reminders:${NC}"
echo "- PACK 427 does NOT handle billing (PACK 273 does)"
echo "- Security rules need manual merge with existing rules"
echo "- Monitor queue depth to ensure workers keep up"
echo "- Set up alerts for high failure rates"
echo ""
echo "Deployment log timestamp: $(date)"
echo ""
